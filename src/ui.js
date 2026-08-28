/* ===== TimeSpent — UI layer ===== */
(() => {
  const E = TSEngine;
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'timespent.save.v1', SET_KEY = 'timespent.settings.v1';
  const AVATARS = ['🐻', '🦊', '🐰', '🐨', '🐷', '🐸'];
  const PART_EMOJI = { morning: '🌅', afternoon: '☀️', evening: '🌇', night: '🌙' };
  const HOLD_MS = 600;     // press longer than this and the card is only read aloud, not played
  const UNDO_MS = 6000;    // how long "Oops, go back" stays offered

  // ---------- settings & persistence ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const defaultLang = () => (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
  // 12 h by default: the big clock face only has 1–12 on it, so "13:00" beside it would be a second system to learn.
  const settings = Object.assign({ lang: defaultLang(), clock24: false, sound: true, voice: true, avatar: '🐻' }, store.get(SET_KEY) || {});
  const saveSettings = () => store.set(SET_KEY, settings);

  let S = null;            // game state (engine-owned shape)
  let shownTime = null;    // what the clock currently displays (abs minutes)
  let busy = false;
  const L = () => I18N[settings.lang];
  const t = (path, vars) => { const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), L()); return vars ? fmt(v, vars) : v; };
  const save = () => { if (S) store.set(SAVE_KEY, S); };

  // ---------- audio ----------
  let AC = null;
  const SFX = {
    ctx() { if (!settings.sound) return null; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; } catch (e) { return null; } },
    tone(freq, dur, type, vol, when, slideTo) {
      const ac = this.ctx(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain();
      const t0 = ac.currentTime + (when || 0); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    },
    tap() { this.tone(520, 0.06, 'triangle', 0.12); },
    tick() { this.tone(1400, 0.03, 'square', 0.05); this.tone(900, 0.05, 'sine', 0.06, 0.02); },
    coin() { this.tone(1046, 0.09, 'triangle', 0.18); this.tone(1568, 0.16, 'triangle', 0.18, 0.08); },
    spend() { this.tone(660, 0.08, 'triangle', 0.15); this.tone(440, 0.14, 'triangle', 0.15, 0.08); },
    eat() { for (let i = 0; i < 3; i++) this.tone(200 + i * 30, 0.07, 'sawtooth', 0.08, i * 0.12, 120); },
    happy() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.16, i * 0.09)); },
    sad() { this.tone(330, 0.25, 'sine', 0.15); this.tone(262, 0.4, 'sine', 0.15, 0.22); },
    buy() { this.tone(880, 0.06, 'square', 0.08); this.tone(1320, 0.18, 'triangle', 0.16, 0.07); },
    sleep() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.14, i * 0.45)); },
    morning() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.14, i * 0.1)); },
    open() { this.tone(700, 0.08, 'sine', 0.1, 0, 1000); },
  };
  const unlockAudio = () => { SFX.ctx(); if (window.speechSynthesis && !unlockAudio.done) { unlockAudio.done = true; try { const u = new SpeechSynthesisUtterance(''); speechSynthesis.speak(u); } catch (e) {} } };
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  // ---------- speech ----------
  let voices = [];
  const loadVoices = () => { try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; } };
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function pickVoice() {
    const want = L().speechLang.toLowerCase(), pre = want.slice(0, 2);
    const norm = (v) => (v.lang || '').replace('_', '-').toLowerCase();
    return voices.find(v => norm(v) === want) || voices.find(v => norm(v).startsWith(pre)) || null;
  }
  function speak(text) {
    if (!settings.voice || !window.speechSynthesis || !text) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = L().speechLang; const v = pickVoice(); if (v) u.voice = v; u.rate = 0.95; u.pitch = 1.05; speechSynthesis.speak(u); } catch (e) {}
  }

  // ---------- formatting helpers ----------
  function fmtTime(min) { const i = E.timeInfo(min); const h = settings.clock24 ? i.h : i.h12; return `${h}:${i.m < 10 ? '0' : ''}${i.m}`; }
  function sayTime(min) { const i = E.timeInfo(min); return L().time.say(i.h, i.m, i.part); }
  function msgText(m) {
    const Lx = L(); let str = Lx.bubble[m.key];
    if (m.key === 'plan') str = Lx.bubble.plan[m.band];
    else if (str && typeof str === 'object') str = str[m.place] || Object.values(str)[0];
    if (!str) return '';
    const vars = { n: m.key === 'worked' || m.key === 'workedFirst' ? Lx.coinsN(m.n || 0) : m.n, k: m.k, d: m.d != null ? Lx.time.sayDur(m.d) : '',
      day: m.day != null ? (settings.lang === 'pt' ? Lx.weekdays[E.weekday(m.day)].toLowerCase() : Lx.weekdays[E.weekday(m.day)]) : '',
      item: m.item ? Lx.itemsA[m.item] : '', t: m.t != null ? sayTime(m.t) : '' };
    return fmt(str, vars);
  }
  const msgsText = (msgs) => (msgs || []).map(msgText).filter(Boolean).join(' ');
  function whyShort(w) {
    if (!w) return ''; const Lx = L();
    if (w.key === 'closed') return fmt(Lx.opensAt, { t: fmtTime(w.t) });
    if (w.key === 'closedToday') return Lx.closedToday;
    if (w.key === 'shiftStarts') return fmt(Lx.why.shiftStarts, { t: fmtTime(w.t) });
    return fmt(Lx.why[w.key] || '', { n: w.n });
  }
  // mini clock discs: 1 disc = 1 h, a half-filled disc = ½ h
  function timeDiscs(min) {
    let html = '<span class="tchips">';
    const disc = (h) => h
      ? `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="#fff" stroke="#33241A" stroke-width="2"/><path d="M10,10 L10,2 A8,8 0 0 1 10,18 Z" fill="#F6C445"/><circle cx="10" cy="10" r="1.5" fill="#33241A"/></svg>`
      : `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="#F6C445" stroke="#33241A" stroke-width="2"/><circle cx="10" cy="10" r="1.5" fill="#33241A"/><path d="M10,10 L10,3.5" stroke="#33241A" stroke-width="2" stroke-linecap="round"/></svg>`;
    const full = Math.floor(min / 60), half = (min % 60) >= 30;
    for (let i = 0; i < Math.min(full, 12); i++) html += disc(false);
    if (half) html += disc(true);
    return html + '</span>';
  }
  const fmtH = (min) => `${Math.floor(min / 60)}${min % 60 >= 30 ? '½' : ''} h`;
  // decreases are highlighted (red pill); increases stay plain
  const effChip = (ico, d) => {
    if (!d || Math.abs(d) < 1) return '';
    const n = Math.abs(Math.round(d));
    return d < 0 ? `<span class="cchip spend">${ico}−${n}</span>` : `<span class="mchip">${ico}+${n}</span>`;
  };
  const COIN_ICO = '<span class="coin"></span>';

  // ---------- what the voice says about a card, before it does anything ----------
  function actLabel(a) {
    const Lx = L();
    return a.id === 'work' ? (a.until && a.enabled ? fmt(Lx.act.work, { t: fmtTime(a.until) }) : Lx.act.workClosed) : Lx.act[a.id];
  }
  function sayAction(a) {
    const Lx = L(), parts = [];
    const label = a.id === 'work' && a.until && a.enabled ? fmt(Lx.act.work, { t: sayTime(a.until) }) : actLabel(a);
    parts.push(label + '.');
    if (!a.enabled) { if (a.why) parts.push(fmt(Lx.say.locked, { why: whyShort(a.why) })); return parts.join(' '); }
    if (a.id === 'bed') parts.push(fmt(Lx.say.night, { d: Lx.time.sayDur(a.sleep) }));
    if (a.minutes) parts.push(fmt(Lx.say.dur, { d: Lx.time.sayDur(a.minutes) }));
    const net = (a.earn || 0) - (a.cost || 0);
    if (net > 0) parts.push(fmt(Lx.say.earns, { n: Lx.coinsN(net) }));
    else if (net < 0) parts.push(fmt(Lx.say.costs, { n: Lx.coinsN(-net) }));
    return parts.join(' ');
  }
  function sayMode(o) {
    const Lx = L(), parts = [Lx.travel[o.mode] + '.'];
    parts.push(fmt(Lx.say.dur, { d: Lx.time.sayDur(o.minutes) }));
    parts.push(o.cost ? fmt(Lx.say.costs, { n: Lx.coinsN(o.cost) }) : Lx.say.free);
    return parts.join(' ');
  }

  // ---------- clock svg ----------
  function clockSVG(prefix) {
    let nums = '';
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2, r = 70; const x = 100 + r * Math.sin(a), y = 100 - r * Math.cos(a);
      nums += `<text x="${x.toFixed(1)}" y="${(y + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="Fredoka, ui-rounded, 'Arial Rounded MT Bold', sans-serif" font-weight="700" font-size="${i >= 10 ? 19 : 21}" fill="#33241A">${i}</text>`; }
    let ticks = '';
    for (let i = 0; i < 60; i++) { if (i % 5 === 0) continue; const a = (i / 60) * Math.PI * 2; const x1 = 100 + 86 * Math.sin(a), y1 = 100 - 86 * Math.cos(a), x2 = 100 + 90 * Math.sin(a), y2 = 100 - 90 * Math.cos(a);
      ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#B8773F" stroke-width="2" stroke-linecap="round"/>`; }
    return `<svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="97" fill="#B8773F" stroke="#33241A" stroke-width="3"/>
      <circle cx="100" cy="100" r="86" fill="#FFF8EA" stroke="#33241A" stroke-width="2.5"/>
      ${ticks}${nums}
      <g class="hand hour" id="${prefix}Hour"><line x1="100" y1="112" x2="100" y2="52" stroke="#33241A" stroke-width="9" stroke-linecap="round"/></g>
      <g class="hand minute" id="${prefix}Min"><line x1="100" y1="114" x2="100" y2="30" stroke="#E4526E" stroke-width="6.5" stroke-linecap="round"/><line x1="100" y1="114" x2="100" y2="30" stroke="#33241A" stroke-width="2" stroke-linecap="round" opacity="0"/></g>
      <circle cx="100" cy="100" r="7" fill="#33241A"/><circle cx="100" cy="100" r="3" fill="#E4526E"/>
    </svg>`;
  }
  function setClock(prefix, absMin, animate) {
    const h = $(prefix + 'Hour'), m = $(prefix + 'Min'); if (!h) return;
    if (!animate) { h.style.transition = 'none'; m.style.transition = 'none'; }
    h.style.transform = `rotate(${(absMin * 0.5).toFixed(2)}deg)`; m.style.transform = `rotate(${(absMin * 6).toFixed(2)}deg)`;
    if (!animate) { void h.getBoundingClientRect(); h.style.transition = ''; m.style.transition = ''; }
  }
  const absMin = (day, time) => (day - 1) * 1440 + time;

  // ---------- sky ----------
  function setSky(time, dur) {
    const sky = $('sky'); const clamp = (v) => Math.max(0, Math.min(1, v));
    const dayOp = clamp(Math.min((time - 420) / 60, (E.BEDTIME - time) / 120));
    const nightOp = time >= E.BEDTIME - 30 ? clamp((time - (E.BEDTIME - 30)) / 60) : clamp((420 - time) / 60);
    const p = clamp((time - 420) / (E.BEDTIME - 420)), ang = Math.PI - p * Math.PI;
    const sx = 50 + 42 * Math.cos(ang), sy = 84 - 72 * Math.sin(ang);
    const d = (dur || 1) + 's';
    sky.querySelector('.day').style.opacity = dayOp; sky.querySelector('.dusk').style.opacity = 1 - dayOp;
    sky.querySelector('.nightl').style.opacity = nightOp; sky.querySelector('.stars').style.opacity = nightOp;
    sky.querySelectorAll('.layer, .stars').forEach(el => el.style.transitionDuration = d);
    const sun = $('sun'), moon = $('moon');
    sun.style.transitionDuration = `${d}, ${d}, .8s`; sun.style.left = sx + '%'; sun.style.top = sy + '%'; sun.style.opacity = 1 - nightOp;
    moon.style.left = '50%'; moon.style.top = '18%'; moon.style.opacity = nightOp > .5 ? 1 : 0;
    const hb = $('hillBack'), hf = $('hillFront');
    if (nightOp > .5) { hb.setAttribute('fill', '#2F4A3C'); hf.setAttribute('fill', '#243C30'); }
    else if (dayOp < .5) { hb.setAttribute('fill', '#6BA35A'); hf.setAttribute('fill', '#4F8A44'); }
    else { hb.setAttribute('fill', '#8FCB6F'); hf.setAttribute('fill', '#6FB65A'); }
    sky.querySelectorAll('.cloud').forEach(c => c.style.opacity = nightOp > .5 ? 0 : 1);
  }

  // ---------- day bar: 24 hours from 7:00, the plan for the day (+ a preview of the next action) ----------
  // Cells after the usual 21:00 bedtime are "late" (playable until midnight); from the real bedtime (bedAt, else midnight) on, the night is dark.
  const BED_HOUR = (E.BEDTIME - E.DAY_START) / 60, LATEST_HOUR = (E.LATEST_BED - E.DAY_START) / 60; // 14, 17
  function renderDayBar(container, timeline, time, bands, preview, bedAt) {
    const col = (c) => c ? E.CAT_COLORS[c] : 'transparent';
    const pv = {}; // slot -> cat for the preview
    if (preview && time != null) for (let i = 0; i < preview.minutes / E.STEP; i++) { const slot = (time - E.DAY_START) / E.STEP + i; if (slot >= 0 && slot < E.SLOTS && !timeline[slot]) pv[slot] = preview.cat; }
    const nightSlot = bedAt != null ? (bedAt - E.DAY_START) / E.STEP : E.SLOTS; // first half-hour that is asleep
    const NIGHT = 'var(--night-2)';
    const half = (slot) => slot >= nightSlot ? NIGHT : timeline[slot] ? col(timeline[slot]) : 'transparent';
    let cells = '';
    for (let i = 0; i < 24; i++) {
      const s0 = i * 2;
      if (s0 >= nightSlot || i >= LATEST_HOUR) { cells += '<i class="c night"></i>'; continue; }
      const pa = pv[s0] != null && !timeline[s0], pb = pv[s0 + 1] != null && !timeline[s0 + 1];
      const bg = (x, isPv) => isPv ? `repeating-linear-gradient(135deg, ${E.CAT_COLORS[pv[x]]} 0 3px, rgba(255,255,255,.55) 3px 6px)` : half(x);
      cells += `<i class="c${pa || pb ? ' pv' : ''}${i >= BED_HOUR ? ' late' : ''}"><b style="background:${bg(s0, pa)}"></b><b style="background:${bg(s0 + 1, pb)}"></b></i>`;
    }
    // The whole strip is one target that reads out what is happening now — ten separate 7 px bands were untappable.
    const plan = (bands || []).map(b => `<span class="band" style="left:${((b.from - 7) / 24 * 100).toFixed(2)}%;width:${((b.to - b.from) / 24 * 100).toFixed(2)}%;background:${E.CAT_COLORS[b.cat]}"><em>${b.emoji}</em></span>`).join('');

    // The bar spans a whole day, so 12 h numbers would repeat (7, 9, 11, 1, 3, 5, 7, 9 …) and mean nothing.
    // Three pictures say the same thing to a child who cannot read a clock yet: get up, midday, bedtime.
    const MARKS = [[0, '🌅'], [5, '☀️'], [(E.BEDTIME - E.DAY_START) / 60, '🌙']];
    const labels = MARKS.map(([i, ico]) => `<span style="left:${(i / 24 * 100).toFixed(2)}%${i ? '' : ';transform:none'}">${ico}</span>`).join('');
    const pct = (tt) => Math.min(100, Math.max(0, (tt - E.DAY_START) / 1440 * 100)).toFixed(2);
    let markers = '';
    if (time != null) {
      markers += `<div class="now" style="left:${pct(time)}%"></div>`;
      if (preview) { const end = Math.min(time + preview.minutes, E.LATEST_BED), pe = +pct(end);
        const lb = pe < 7 ? 'left:0;transform:none;' : pe > 93 ? 'left:auto;right:0;transform:none;' : '';
        markers += `<div class="ghost" style="left:${pe}%"><b style="${lb}">${fmtTime(end)}</b></div>`; }
    }
    if (time != null) { container.setAttribute('role', 'button'); container.setAttribute('tabindex', '0'); container.dataset.plan = 'now'; }
    container.innerHTML = `<div class="cells">${cells}</div><div class="plan">${plan}</div><div class="labels">${labels}</div>${markers ? `<div class="track">${markers}</div>` : ''}`;
  }
  let previewAct = null;
  function showPreview(eff) {
    if (busy || !S || S.phase !== 'day' || !eff || !eff.minutes) return;
    previewAct = eff;
    renderDayBar($('daybar'), S.timeline, S.time, E.routine(S), previewAct);
    renderMeters(previewAct); renderWallet($('wallet'), $('coinCount'), $('coinstack'), previewAct);
  }
  function clearPreview() {
    if (!previewAct) return; previewAct = null;
    if (S && S.phase === 'day' && !busy) { renderDayBar($('daybar'), S.timeline, S.time, E.routine(S)); renderMeters(); renderWallet($('wallet'), $('coinCount'), $('coinstack')); }
  }

  // ---------- rendering ----------
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => { const v = t(el.dataset.i18n); if (typeof v === 'string') el.textContent = v; });
    $('btnPlay').textContent = t('play'); $('btnContinue').textContent = t('cont'); $('btnNew').textContent = t('newGame');
    $('btnSleep').textContent = '😴 ' + t('act.sleep'); $('btnWake').textContent = t('act.wake');
    $('travelTitle').textContent = t('travel.title'); $('travelHow').textContent = t('travel.how'); $('shopTitle').textContent = t('act.shop');
    $('nightText').textContent = t('night'); $('btnUndo').textContent = '↩ ' + t('undo');
    document.querySelectorAll('#langSeg button, #setLang button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.lang || b.dataset.v) === settings.lang));
    document.querySelectorAll('#setClock button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === '24') === settings.clock24));
    document.querySelectorAll('#setSound button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === '1') === settings.sound));
    document.querySelectorAll('#setVoice button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === '1') === settings.voice));
    $('speakBtn').classList.toggle('on', settings.voice);
    document.documentElement.lang = settings.lang;
  }

  function renderTop() {
    const Lx = L(); const wd = E.weekday(S.day);
    $('dayN').textContent = fmt(Lx.dayN, { n: S.day }); $('weekday').textContent = Lx.weekdays[wd];
    $('wkBadge').textContent = Lx.weekend; $('wkBadge').classList.toggle('hidden', !E.isWeekend(S.day));
  }
  function renderTime(time) {
    const i = E.timeInfo(time); $('digital').textContent = fmtTime(time); $('partTxt').textContent = L().partOfDay[i.part]; $('partIco').textContent = PART_EMOJI[i.part];
    previewAct = null; renderDayBar($('daybar'), S.timeline, time, E.routine(S));
  }
  const clampv = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function segsHTML(cur, after, max) {
    let h = '';
    for (let i = 0; i < max; i++) {
      let cls = i < Math.min(cur, after) ? 'on' : i < cur ? 'on lose' : i < after ? 'gain' : '';
      h += `<i class="${cls}"></i>`;
    }
    return h;
  }
  function pvd(el, delta) { const b = el.querySelector('.pvd'); if (!b) return; if (!delta) { b.classList.add('hidden'); b.textContent = ''; return; } b.classList.remove('hidden'); b.textContent = (delta > 0 ? '+' : '−') + Math.abs(delta); b.classList.toggle('down', delta < 0); }
  function renderMeters(pv) {
    const dT = pv ? (pv.tummy || 0) - (pv.minutes || 0) * (E.HUNGER_PER_STEP / E.STEP) : 0;
    const dH = pv ? (pv.happy || 0) : 0, dF = pv ? (pv.fridge || 0) : 0;
    const cT = Math.ceil(S.tummy), aT = Math.ceil(clampv(S.tummy + dT, 0, E.TUMMY_MAX));
    const cH = Math.ceil(S.happy), aH = Math.ceil(clampv(S.happy + dH, 0, E.HAPPY_MAX));
    const tm = $('mTummy'), hpy = $('mHappy');
    const segT = tm.querySelector('.segs'); segT.style.gridTemplateColumns = `repeat(${E.TUMMY_MAX}, 1fr)`; segT.innerHTML = segsHTML(cT, aT, E.TUMMY_MAX);
    const segH = hpy.querySelector('.segs'); segH.style.gridTemplateColumns = `repeat(${E.HAPPY_MAX}, 1fr)`; segH.innerHTML = segsHTML(cH, aH, E.HAPPY_MAX);
    tm.classList.toggle('low', !pv && S.tummy <= 1); hpy.classList.toggle('low', !pv && S.happy <= 1);
    pvd(tm, 0); pvd(hpy, 0); // segments carry the tummy/happy preview
    const aF = clampv(S.fridge + dF, 0, E.FRIDGE_MAX);
    let ap = '';
    for (let i = 0; i < Math.min(Math.max(S.fridge, aF), 12); i++) {
      const cls = i < Math.min(S.fridge, aF) ? '' : i < S.fridge ? ' lose' : ' gain';
      ap += `<span class="apple${cls}">🍎</span>`;
    }
    $('apples').innerHTML = `<span class="stack">${ap || '<span class="empty">—</span>'}</span>`;
    $('fridgeCount').textContent = S.fridge; pvd($('mFridge'), dF);
    $('mFridge').classList.toggle('low', !pv && S.fridge === 0);
    $('lunchBadge').classList.toggle('hidden', !S.lunchbox);
  }
  function renderWallet(el, countEl, stackEl, pv) {
    const dC = pv ? (pv.earn || 0) - (pv.cost || 0) : 0;
    countEl.textContent = S.coins;
    if (el) pvd(el, dC);
    if (stackEl) {
      const aC = Math.max(0, S.coins + dC);
      let h = '';
      for (let i = 0; i < Math.min(Math.max(S.coins, aC), 10); i++) {
        const cls = i < Math.min(S.coins, aC) ? '' : i < S.coins ? ' lose' : ' gain';
        h += `<span class="coin${cls}"></span>`;
      }
      stackEl.innerHTML = h;
    }
  }
  function renderWish() {
    const box = $('wishbox'); if (!S.wish) { box.classList.add('hidden'); return; }
    const it = E.ITEMS[S.wish]; const have = Math.min(S.coins, it.price);
    box.classList.remove('hidden'); box.querySelector('.wemoji').textContent = it.emoji; box.querySelector('.wname').textContent = t('wish') + ': ' + t('items.' + S.wish);
    box.querySelector('.bar i').style.width = (100 * have / it.price) + '%'; box.querySelector('.wnum').textContent = `${S.coins} / ${it.price}`;
    box.classList.toggle('ready', S.coins >= it.price);
  }
  function renderAvatar() {
    const hat = S.wardrobe.hat ? '🎩' : '';
    $('avatar').innerHTML = `<span style="position:relative;display:inline-block">${S.avatar}${hat ? `<span style="position:absolute;left:50%;top:-58%;transform:translateX(-50%) rotate(-12deg);font-size:.55em">${hat}</span>` : ''}</span>`;
    $('nightAvatar').textContent = S.avatar;
  }
  let shownLoc = null;
  function renderPlace() {
    if (shownLoc !== S.loc) { $('actions').scrollTop = 0; shownLoc = S.loc; }
    renderPlaces(); renderActions();
  }
  function renderPlaces() {
    const Lx = L();
    $('places').innerHTML = E.destinations(S).map(d => {
      const closed = !d.here && (d.night || (!d.always && !d.open));
      const tag = d.here ? (d.always ? '' : `<span class="pst ${d.open ? 'open' : 'closed'}">${d.open ? Lx.open : Lx.closed}</span>`)
        : d.night ? `<span class="pst closed">🌙 ${Lx.nightLabel}</span>` : d.closedToday ? `<span class="pst closed">${Lx.closed}</span>` : closed ? `<span class="pst closed">${fmtTime(d.opensAt)}</span>` : '';
      const sub = Lx.placeSub[d.id] ? `<span class="psub">${Lx.placeSub[d.id]}</span>` : '';
      return `<div role="button" tabindex="0" class="ptile${d.here ? ' here' : ''}${closed || d.closedToday ? ' closed' : ''}" data-place="${d.id}" aria-pressed="${d.here}"><span class="pe">${d.emoji}</span><span class="pl">${Lx.places[d.id]}</span>${sub}${tag}</div>`;
    }).join('');
  }
  let lastActions = {};
  function renderActions() {
    const Lx = L(); const list = E.actions(S); let html = '';
    lastActions = {}; list.forEach(a => { lastActions[a.id] = a; });
    list.forEach(a => {
      const cls = ['action']; if (!a.enabled) cls.push('disabled');
      if (a.id === 'bed') { cls.push('bed', 'wide'); if (a.urge) cls.push('urge'); }
      const label = actLabel(a);
      let chips = '';
      if (a.minutes) chips += timeDiscs(a.minutes);
      if (a.id === 'bed') chips += `<span class="cchip ${a.sleepShort ? 'spend' : 'free'}">😴 ${fmtH(a.sleep)}</span>`; // how long the night would be, then the happiness bonus
      const coin = (a.earn || 0) - (a.cost || 0);
      if (coin) chips += effChip(COIN_ICO, coin);
      const other = [['🍎', a.tummy], ['😊', a.happy], ['🧺', a.fridge]].filter(c => Math.abs(c[1]) >= 1).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
      if (other) chips += effChip(other[0], other[1]);
      if (a.id === 'shop') chips = `<span class="mchip">${['food', 'toys'].filter(st => E.stallOpen(S, st)).map(st => ({ food: '🥕', toys: '🧸' })[st]).join(' ')}</span>` + chips;
      const why = !a.enabled && a.why ? `<div class="why">${whyShort(a.why)}</div>` : '';
      html += `<div role="button" tabindex="0" class="${cls.join(' ')}" data-act="${a.id}" data-min="${a.enabled && a.minutes ? a.minutes : 0}" data-cat="${a.cat}" aria-disabled="${!a.enabled}"><span class="ae">${a.emoji}</span><span class="txt"><span class="al">${label}</span><span class="ac">${chips}</span>${why}</span></div>`;
    });
    $('actions').innerHTML = html;
    // a child will not scroll a box that looks finished, so mark it when there is more below
    requestAnimationFrame(() => { const el = $('actions'); $('game').querySelector('.place').classList.toggle('more', el.scrollHeight > el.clientHeight + 1); });
  }
  function renderAll() {
    renderTop(); renderTime(S.time); renderMeters(); renderWallet($('wallet'), $('coinCount'), $('coinstack')); renderWish(); renderAvatar(); renderPlace();
    setSky(S.time, 0.3); shownTime = absMin(S.day, S.time); setClock('c', shownTime, false);
    setBubble(S.msgs, { quiet: true });
  }

  // ---------- bubble: one message at a time, tap for the next ----------
  let msgQueue = [];
  function showBubbleText(text, opts) {
    $('bubbleText').textContent = text;
    $('bubbleMore').classList.toggle('hidden', !msgQueue.length);
    const av = $('avatar'); av.classList.remove('bounce'); void av.offsetWidth; av.classList.add('bounce');
    if (!(opts && opts.quiet)) speak(text);
  }
  // `msgs` is the whole batch the engine returned; only the first is shown, the rest wait behind a ▸ chevron.
  function setBubble(msgs, opts) {
    const list = (msgs || []).filter(m => msgText(m));
    msgQueue = list.slice(1);
    showBubbleText(list.length ? msgText(list[0]) : '', opts);
  }
  function bubble(msgs, opts) {
    if (typeof msgs === 'string') { msgQueue = []; S.msgs = []; showBubbleText(msgs, opts); return; }
    const list = (msgs || []).filter(m => msgText(m));
    if (!list.length) return;
    S.msgs = list; setBubble(list, opts);
  }
  function nextMsg() {
    if (!msgQueue.length) { speak($('bubbleText').textContent); return; }
    const m = msgQueue.shift();
    showBubbleText(msgText(m));
  }
  function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toast.tm); toast.tm = setTimeout(() => el.classList.remove('show'), 1800); }

  // ---------- undo: a mis-tap should not cost the whole afternoon ----------
  let undoSnap = null, undoTm = null;
  const snapshot = () => JSON.parse(JSON.stringify(S));
  function offerUndo(snap) {
    undoSnap = snap; $('undoBar').classList.add('show');
    clearTimeout(undoTm); undoTm = setTimeout(hideUndo, UNDO_MS);
  }
  function hideUndo() { clearTimeout(undoTm); undoSnap = null; $('undoBar').classList.remove('show'); }
  function doUndo() {
    if (!undoSnap || busy) return;
    S = undoSnap; hideUndo(); SFX.tap();
    shownTime = absMin(S.day, S.time); renderAll(); save();
  }

  // ---------- coin flight ----------
  function flyCoins(n, fromEl, toEl, done) {
    const fx = $('fx'); const count = Math.min(Math.abs(n), 6); const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fromEl || !toEl || !count || reduce || !fx.animate) { if (done) done(); return; }
    const fr = fromEl.getBoundingClientRect(), tr = toEl.getBoundingClientRect(), root = fx.getBoundingClientRect();
    const sx = fr.left + fr.width / 2 - root.left - 12, sy = fr.top + fr.height / 2 - root.top - 12, tx = tr.left + tr.width / 2 - root.left - 12, ty = tr.top + tr.height / 2 - root.top - 12;
    let finished = 0;
    for (let i = 0; i < count; i++) {
      const c = document.createElement('span'); c.className = 'coin'; fx.appendChild(c);
      const dx = (Math.random() - .5) * 40, dy = -40 - Math.random() * 40;
      const anim = c.animate([{ transform: `translate(${sx}px, ${sy}px) scale(.6)`, opacity: 0 }, { transform: `translate(${sx + dx}px, ${sy + dy}px) scale(1.15)`, opacity: 1, offset: .35 }, { transform: `translate(${tx}px, ${ty}px) scale(.9)`, opacity: 1 }],
        { duration: 520, delay: i * 70, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
      anim.onfinish = () => { c.remove(); if (++finished === count && done) done(); };
    }
  }

  // ---------- performing actions ----------
  function animateTime(fromAbs, toAbs, steps) {
    return new Promise(res => {
      const n = Math.max(1, Math.round((toAbs - fromAbs) / E.STEP)); const dur = Math.min(0.4 * n, 2.0);
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      ['cHour', 'cMin'].forEach(id => { $(id).style.transition = `transform ${reduce ? .2 : dur}s cubic-bezier(.45,0,.35,1)`; });
      setClock('c', toAbs, true); shownTime = toAbs;
      const time = toAbs - (S.day - 1) * 1440; setSky(time, dur);
      for (let i = 1; i <= n; i++) setTimeout(() => { SFX.tick(); const tt = time - (n - i) * E.STEP; $('digital').textContent = fmtTime(tt); const inf = E.timeInfo(tt); $('partTxt').textContent = L().partOfDay[inf.part]; $('partIco').textContent = PART_EMOJI[inf.part];
        const slot = (tt - E.DAY_START) / E.STEP; renderDayBar($('daybar'), S.timeline.slice(0, Math.max(0, slot)), tt, E.routine(S)); }, (i / n) * dur * 1000);
      setTimeout(res, dur * 1000 + 80);
    });
  }
  async function applyResult(out, srcEl, snap) {
    if (!out.ok) { if (out.msgs.length) { bubble(out.msgs); SFX.sad(); } return; }
    hideUndo();
    busy = true; $('app').classList.add('busy');
    const before = shownTime;
    if (out.coins < 0) { SFX.spend(); const wallet = $('wallet'); flyCoins(out.coins, wallet, srcEl || $('avatar')); renderWallet(wallet, $('coinCount'), $('coinstack')); }
    if (out.steps.length) await animateTime(before, absMin(S.day, S.time), out.steps);
    renderTime(S.time); renderMeters();
    if (out.coins > 0) { SFX.coin(); await new Promise(r => flyCoins(out.coins, srcEl || $('avatar'), $('wallet'), r)); const w = $('wallet'); w.classList.remove('pop'); void w.offsetWidth; w.classList.add('pop'); }
    renderWallet($('wallet'), $('coinCount'), $('coinstack')); renderWish(); renderAvatar(); renderPlace(); renderTop();
    const keys = out.msgs.map(m => m.key);
    if (keys.some(k => ['ate', 'cafe', 'lunchbox', 'icecream', 'boughtMeals'].includes(k))) SFX.eat();
    if (keys.some(k => ['played', 'show', 'wishBought', 'bought'].includes(k))) SFX.happy();
    if (keys.some(k => ['starving', 'tooSad', 'nothingToEat'].includes(k))) SFX.sad();
    bubble(out.msgs);
    save();
    busy = false; $('app').classList.remove('busy');
    // Only time was spent, and the day is not over: let a mis-tap be taken back.
    if (snap && !out.bedtime && out.coins === 0) offerUndo(snap);
    if (out.bedtime) setTimeout(showSummary, keys.includes('midnight') ? 2600 : 1900);
  }
  function doAction(id, el) {
    if (busy || !S || S.phase !== 'day') return;
    SFX.tap();
    if (id === 'shop') { const a = E.actions(S).find(x => x.id === 'shop'); if (!a.enabled) { bubble([a.why]); SFX.sad(); return; } openShop(); return; }
    const snap = snapshot();
    applyResult(E.perform(S, id), el, snap);
  }

  // ---------- travel sheet (opens for a chosen place) ----------
  let travelDest = null, lastModes = {};
  function openTravelTo(dest) {
    travelDest = dest; const Lx = L();
    const opts = E.travelOptions(S);
    lastModes = {}; opts.forEach(o => { lastModes[o.mode] = { minutes: o.minutes, cat: 'travel', cost: o.cost, enabled: o.enabled }; });
    // On day 1 there is only one way to get anywhere, so asking "how?" is a question with one answer.
    if (opts.length === 1 && opts[0].enabled) { doTravel(opts[0].mode); return; }
    $('travelTitle').textContent = Lx.travel.title;
    $('travelDest').innerHTML = `${E.PLACES[dest].emoji} ${Lx.places[dest]}`;
    let html = '';
    opts.forEach(o => {
      const why = !o.enabled && o.why ? `<div class="why">${whyShort(o.why)}</div>` : '';
      html += `<div role="button" tabindex="0" class="action${o.enabled ? '' : ' disabled'}" data-mode="${o.mode}" data-min="${o.enabled ? o.minutes : 0}" data-cat="travel" aria-disabled="${!o.enabled}"><span class="ae">${o.emoji}</span><span class="txt"><span class="al">${Lx.travel[o.mode]}</span><span class="ac">${timeDiscs(o.minutes)}${o.cost ? effChip(COIN_ICO, -o.cost) : `<span class="cchip free">✓</span>`}</span>${why}</span></div>`;
    });
    $('travelModes').innerHTML = html;
    $('travelSheet').classList.add('open'); SFX.open();
  }
  function doTravel(mode, el) {
    const snap = snapshot();
    const out = E.travel(S, travelDest, mode);
    if (!out.ok) { if (out.msgs.length) { bubble(out.msgs); SFX.sad(); } return; }
    closeSheet('travelSheet'); applyResult(out, $('places'), snap);
  }

  // ---------- shop sheet ----------
  let stall = 'food';
  function openShop() {
    const stalls = ['food', 'toys'].filter(s => E.stallOpen(S, s)); if (!stalls.includes(stall)) stall = stalls[0];
    // one stall is not a choice, so don't draw a tab bar for it
    $('stallTabs').classList.toggle('hidden', stalls.length < 2);
    $('stallTabs').innerHTML = stalls.map(s => `<button role="tab" data-stall="${s}" aria-selected="${s === stall}">${{ food: '🥕', toys: '🧸' }[s]} ${t('stalls.' + s)}</button>`).join('');
    renderStall(); $('shopSheet').classList.add('open'); SFX.open();
  }
  function renderStall() {
    const Lx = L(); renderWallet(null, $('shopCoins'), null);
    let html = '';
    E.catalogue(S, stall).forEach(c => {
      let btn;
      if (c.owned) btn = `<span class="tbtn got">✓ ${Lx.shop.got}</span>`;
      else if (c.full) btn = `<span class="tbtn need">${Lx.shop.fridgeFull}</span>`;
      else if (!c.canAfford) btn = `<button class="tbtn need" data-buy="${c.id}">${fmt(Lx.shop.needMore, { n: c.price - S.coins })}</button>`;
      else btn = `<button class="tbtn" data-buy="${c.id}">${Lx.shop.buy}</button>`;
      const wish = stall === 'toys' && !c.owned ? `<button class="tbtn wish${c.wished ? ' on' : ''}" data-wish="${c.id}">⭐ ${c.wished ? Lx.shop.wishing : Lx.shop.wishBtn}</button>` : '';
      const extra = c.id === 'meals' ? `<span class="ts">${Lx.fridge}: ${'🍎'.repeat(Math.min(S.fridge, 6)) || '—'}</span>` : '';
      html += `<div class="tile${c.owned || c.full ? ' disabled' : ''}">${c.wished ? `<span class="badge">⭐</span>` : ''}<span class="te">${c.emoji}</span><span class="tl">${Lx.items[c.id]}</span><span class="price"><span class="coin lg"></span>${c.price}</span>${extra}${btn}${wish}</div>`;
    });
    $('stallItems').innerHTML = html;
  }
  function doBuy(item, el) {
    const out = E.buy(S, item);
    if (!out.ok) { if (out.msgs.length) { bubble(out.msgs); SFX.sad(); } return; }
    SFX.buy(); closeSheet('shopSheet'); applyResult(out, $('places'));
  }
  function doWish(item) { const out = E.setWish(S, item); if (out.ok) { SFX.happy(); renderStall(); renderWish(); bubble(out.msgs); save(); } }

  function closeSheet(id) { $(id).classList.remove('open'); }

  // ---------- day / night ----------
  function showSummary() {
    if (!S || S.phase !== 'summary') return;
    const sum = E.summary(S); const Lx = L();
    $('sumTitle').textContent = fmt(Lx.summary.title, { n: sum.day });
    renderDayBar($('sumBar'), sum.timeline, null, E.routine(S), null, sum.bedAt);
    const order = ['work', 'travel', 'eat', 'play', 'shop', 'wait', 'sleep'];
    $('sumLegend').innerHTML = order.filter(c => sum.byCat[c]).map(c => `<div${c === 'sleep' ? ' class="wide"' : ''}><span class="sw" style="background:${E.CAT_COLORS[c]}"></span><span>${Lx.cats[c]}</span>${timeDiscs(sum.byCat[c])}</div>`).join('');
    const sd = Lx.time.sayDur; let verdict = sum.short ? Lx.summary.short : Lx.summary.rested;
    if (sum.bonus) verdict += ' ' + fmt(Lx.summary.extra, { n: sum.bonus });
    const ss = $('sumSleep'); ss.classList.toggle('bad', sum.short > 0);
    ss.innerHTML = `<span class="fe">${sum.short ? '🌙' : '😴'}</span><span class="ft"><b>${fmt(Lx.summary.sleep, { d: sd(sum.slept) })}</b><br>${verdict}</span>`;
    $('sumEarned').innerHTML = `<span class="coin lg"></span>+${sum.earned}`; $('sumSpent').innerHTML = `<span class="coin lg"></span>−${sum.spent}`;
    $('sumKept').innerHTML = `<span class="coin lg"></span>${sum.kept >= 0 ? '+' : '−'}${Math.abs(sum.kept)}`; $('sumWallet').textContent = sum.wallet;
    save(); $('summary').classList.add('open');
    speak(fmt(Lx.summary.title, { n: sum.day }));
  }
  function goToSleep() {
    if (!E.goToSleep(S)) return;
    hideUndo(); save(); $('summary').classList.remove('open');
    const night = $('night'); night.classList.add('open');
    $('nightClock').innerHTML = clockSVG('n'); setClock('n', absMin(S.day, S.bedAt == null ? E.BEDTIME : S.bedAt), false);
    SFX.sleep(); speak(t('night'));
    setTimeout(() => { const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; ['nHour', 'nMin'].forEach(id => $(id).style.transition = `transform ${reduce ? .8 : 4.2}s cubic-bezier(.4,0,.2,1)`); setClock('n', absMin(S.day + 1, E.DAY_START), true); }, 350);
    setTimeout(() => {
      const msgs = E.wakeUp(S); S.msgs = msgs; save();
      renderAll(); setSky(S.time, 0.1);
      night.classList.remove('open');
      const Lx = L(); $('mDay').textContent = `${fmt(Lx.dayN, { n: S.day })} · ${Lx.weekdays[E.weekday(S.day)]}`;
      $('mText').textContent = msgsText(msgs.slice(1, 3));
      $('morning').classList.add('open'); SFX.morning(); speak(`${Lx.morning} ${msgsText(msgs)}`);
    }, 5200);
  }
  function wake() { $('morning').classList.remove('open'); S.msgs = (S.msgs || []).filter(m => m.key !== 'morning'); setBubble(S.msgs, { quiet: true }); }

  // ---------- start screen ----------
  function renderStart() {
    applyI18n();
    $('startClock').innerHTML = clockSVG('s'); setClock('s', 420, false);
    $('avatars').innerHTML = AVATARS.map(a => `<button class="avatar-btn" data-avatar="${a}" aria-pressed="${a === settings.avatar}">${a}</button>`).join('');
    const hasSave = !!store.get(SAVE_KEY);
    $('btnContinue').classList.toggle('hidden', !hasSave); $('btnPlay').classList.toggle('hidden', hasSave); $('btnNew').classList.toggle('hidden', !hasSave); $('newConfirm').classList.add('hidden');
    $('app').dataset.screen = 'start';
  }
  // older saves (v1: hourly work + car wash; v2: happy max 6, fridge max 12; v3: fixed 21:00 bedtime; v4: sleep debt, weather, clothes)
  function migrate(s) {
    if (s.v < 2) { s.lunchbox = s.lunchbox || 0; delete s.carwash; s.lastBand = s.lastBand || 'breakfast'; if (s.phase === 'day' && s.time >= E.BEDTIME) s.phase = 'summary'; }
    if (s.v < 4) { s.slept = 10 * 60; s.bedAt = s.phase === 'day' ? null : Math.min(Math.max(s.time || E.BEDTIME, E.BEDTIME), E.LATEST_BED); }
    if (s.v < 5) { // sleep debt, weather and the clothes stall are gone; happy is now on the 0–6 scale
      delete s.owed; delete s.weather; delete s.forecast;
      if (s.v >= 3) s.happy = Math.round((s.happy || 0) * E.HAPPY_MAX / 10); // v3/v4 ran happy 0-10; v1/v2 were already 0-6
      s.wardrobe = s.wardrobe && s.wardrobe.hat ? { hat: true } : {};
      s.toys = (s.toys || []).filter(k => E.ITEMS[k]);
      if (s.wish && !E.ITEMS[s.wish]) s.wish = null;
      s.happy = Math.max(1, Math.min(E.HAPPY_MAX, s.happy));
    }
    s.v = 5;
    return s;
  }
  function startGame(fresh) {
    const saved = fresh ? null : store.get(SAVE_KEY);
    if (saved && saved.v >= 1 && saved.day) { S = migrate(saved); }
    else { S = E.newGame(settings.avatar, (Date.now() % 100000) | 0); S.msgs = [{ key: 'plan', band: E.routine(S)[0].id }]; }
    hideUndo(); applyI18n(); renderAll(); $('app').dataset.screen = 'game'; save();
    if (S.phase === 'summary') showSummary();
    else if (S.phase === 'night') { S.phase = 'summary'; showSummary(); }
    else setBubble(S.msgs);
  }
  function resetGame() { store.del(SAVE_KEY); S = null; closeSheet('settings'); $('resetConfirm').classList.add('hidden'); renderStart(); }

  // ---------- events ----------
  let heldEl = null, holdTm = null;     // the card being held down long enough to mean "just read it to me"
  document.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.getAttribute && ev.target.getAttribute('role') === 'button') { ev.preventDefault(); ev.target.click(); } });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('button, [role="button"], [data-close]'); if (!b) return;
    // a long press means "read it to me" — it must not also play the card it was held on
    const wasHeld = heldEl; heldEl = null;
    if (wasHeld && b === wasHeld) return;
    if (b.dataset.close) { closeSheet(b.dataset.close); SFX.tap(); return; }
    if (b.dataset.lang) { settings.lang = b.dataset.lang; saveSettings(); applyI18n(); if (S) renderAll(); else renderStart(); return; }
    if (b.dataset.avatar) { settings.avatar = b.dataset.avatar; saveSettings(); document.querySelectorAll('.avatar-btn').forEach(x => x.setAttribute('aria-pressed', x.dataset.avatar === settings.avatar)); SFX.happy(); return; }
    if (b.id === 'btnPlay') { SFX.tap(); startGame(true); return; }
    if (b.id === 'btnContinue') { SFX.tap(); startGame(false); return; }
    if (b.id === 'btnNew') { SFX.tap(); $('newConfirm').classList.remove('hidden'); b.classList.add('hidden'); $('btnContinue').classList.add('hidden'); return; }
    if (b.id === 'btnNewYes') { SFX.tap(); startGame(true); return; }
    if (b.id === 'btnNewNo') { SFX.tap(); $('newConfirm').classList.add('hidden'); $('btnNew').classList.remove('hidden'); $('btnContinue').classList.remove('hidden'); return; }
    if (b.id === 'btnUndo') { doUndo(); return; }
    if (b.dataset.act) { doAction(b.dataset.act, b); return; }
    if (b.dataset.place) { if (busy || !S || S.phase !== 'day') return; SFX.tap(); if (b.dataset.place === S.loc) { bubble([{ key: 'arrived', place: S.loc }]); return; }
      if (E.isNight(S)) { bubble([{ key: 'nightStayHome' }]); SFX.sad(); return; } openTravelTo(b.dataset.place); return; }
    if (b.dataset.plan) { SFX.tap(); const band = E.bandAt(S, S.time) || E.routine(S)[0]; const Lx = L();
      speak(fmt(Lx.planSay, { a: sayTime(band.from * 60), b: sayTime((band.to % 24) * 60), what: Lx.plan[band.id] }));
      toast(`${band.emoji} ${Lx.plan[band.id]}`); return; }
    if (b.dataset.mode) { if (busy) return; SFX.tap(); doTravel(b.dataset.mode, b); return; }
    if (b.dataset.stall) { SFX.tap(); stall = b.dataset.stall; document.querySelectorAll('#stallTabs button').forEach(x => x.setAttribute('aria-selected', x.dataset.stall === stall)); renderStall(); return; }
    if (b.dataset.buy) { if (busy) return; doBuy(b.dataset.buy, b); return; }
    if (b.dataset.wish) { SFX.tap(); doWish(b.dataset.wish); return; }
    if (b.id === 'speakBtn' || b.id === 'bubbleBox') { SFX.tap(); if (!settings.voice) { settings.voice = true; saveSettings(); applyI18n(); } nextMsg(); return; }
    if (b.id === 'btnSleep') { SFX.tap(); goToSleep(); return; }
    if (b.id === 'btnWake') { SFX.tap(); wake(); return; }
    if (b.parentElement && b.parentElement.id === 'setLang') { settings.lang = b.dataset.v; saveSettings(); applyI18n(); if (S) renderAll(); return; }
    if (b.parentElement && b.parentElement.id === 'setClock') { settings.clock24 = b.dataset.v === '24'; saveSettings(); applyI18n(); if (S) renderAll(); return; }
    if (b.parentElement && b.parentElement.id === 'setSound') { settings.sound = b.dataset.v === '1'; saveSettings(); applyI18n(); return; }
    if (b.parentElement && b.parentElement.id === 'setVoice') { settings.voice = b.dataset.v === '1'; saveSettings(); applyI18n(); if (!settings.voice && window.speechSynthesis) speechSynthesis.cancel(); return; }
    if (b.id === 'btnReset') { $('resetConfirm').classList.remove('hidden'); return; }
    if (b.id === 'btnResetNo') { $('resetConfirm').classList.add('hidden'); return; }
    if (b.id === 'btnResetYes') { resetGame(); return; }
  });

  // Press a card and it tells you what it does, then shows its time on the bar and its effect on the meters.
  // A quick tap plays it; holding for HOLD_MS means "just read it to me".
  (() => {
    const from = (ev) => ev.target.closest && ev.target.closest('[data-act], [data-mode]');
    const effOf = (el) => el.dataset.act ? lastActions[el.dataset.act] : el.dataset.mode ? lastModes[el.dataset.mode] : null;
    const press = (ev) => {
      const el = from(ev); if (!el) return;
      const eff = effOf(el); if (!eff) return;
      speak(el.dataset.act ? sayAction(eff) : sayMode(eff));
      if (eff.enabled !== false && +el.dataset.min > 0) showPreview(eff);
      heldEl = null; clearTimeout(holdTm); holdTm = setTimeout(() => { heldEl = el; }, HOLD_MS);
    };
    const release = () => { clearTimeout(holdTm); clearPreview(); };
    document.addEventListener('pointerdown', press);
    document.addEventListener('focusin', press);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', () => { clearTimeout(holdTm); heldEl = null; clearPreview(); });
    document.addEventListener('focusout', release);
  })();

  // gear: hold to open (keeps little fingers out of settings)
  (() => { const g = $('gear'); let tm = null;
    const start = (e) => { e.preventDefault(); g.classList.add('holding'); tm = setTimeout(() => { tm = null; g.classList.remove('holding'); $('settings').classList.add('open'); SFX.open(); }, 1100); };
    const stop = () => { if (tm) { clearTimeout(tm); tm = null; toast(t('settings.hold')); } g.classList.remove('holding'); };
    g.addEventListener('pointerdown', start); g.addEventListener('pointerup', stop); g.addEventListener('pointercancel', stop); g.addEventListener('pointerleave', stop);
    g.addEventListener('click', (e) => e.preventDefault());
  })();

  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // ---------- boot ----------
  $('clock').innerHTML = clockSVG('c');
  renderStart();
  // expose for tests
  window.TS = { get state() { return S; }, settings, start: startGame, act: doAction, travel: (d, m) => { travelDest = d; return doTravel(m); }, goTo: openTravelTo, buy: doBuy, wish: doWish, sleep: goToSleep, wake, showSummary, undo: doUndo, engine: E, isBusy: () => busy };
})();
