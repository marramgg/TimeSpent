/* ===== TimeSpent — game engine (no DOM) ===== */
const TSEngine = (() => {
  const DAY_START = 7 * 60, BEDTIME = 21 * 60, LATEST_BED = 24 * 60, STEP = 30;
  const SLOTS = (LATEST_BED - DAY_START) / STEP; // half-hours that can be filled: 7:00 → midnight
  // Sleep, kept simple: bedtime is 21:00, but at home you may go to bed at any time, or stay up until midnight, when you fall
  // asleep on the spot. Waking is always 7:00, so the night is 7:00 minus bedtime. Every full hour beyond SLEEP_NEED is a bonus:
  // +1 happy at wake-up (BONUS_PER_HOUR, at most BONUS_MAX). A short night simply means no bonus — nothing is carried into tomorrow.
  const SLEEP_NEED = 8 * 60, BONUS_PER_HOUR = 1, BONUS_MAX = 2;
  // Tummy and Happy share one 0–6 scale, so "+1" means the same thing wherever it appears on a card.
  const TUMMY_MAX = 6, HAPPY_MAX = 6, WAKE_TUMMY = 2, WAKE_HAPPY = 4;
  const HUNGER_PER_STEP = 0.25, WORK_PAY = 1 /* per hour */, WORK_HAPPY = -0.25 /* per hour: one shift ≈ −1 */;
  const SHIFTS = [{ start: 9 * 60, end: 13 * 60 }, { start: 13 * 60 + 30, end: 17 * 60 + 30 }];
  const LUNCH_FROM = 13 * 60, LUNCH_TO = 13 * 60 + 30; // the bakery's lunch break

  // One new thing per day, so day 1 is the smallest complete day: wake, eat, work, come home, eat, sleep.
  const PLACES = {
    home:   { emoji: '🏠', unlockDay: 1 },
    bakery: { emoji: '🥖', unlockDay: 1, open: 8 * 60, close: 18 * 60, weekdaysOnly: true },
    shops:  { emoji: '🏬', unlockDay: 2, open: 9 * 60, close: 18 * 60 },
    park:   { emoji: '🌳', unlockDay: 3 },
  };
  const TRAVEL = {
    walk: { emoji: '🚶', min: 60, cost: 0, unlockDay: 1 },
    bus:  { emoji: '🚌', min: 30, cost: 1, unlockDay: 2 },
    bike: { emoji: '🚲', min: 30, cost: 0, unlockDay: 1, needs: 'bike' },
  };
  const ITEMS = {
    meals: { emoji: '🧺', price: 5, stall: 'food', meals: 6 },
    hat:   { emoji: '🎩', price: 2, stall: 'toys', wear: true, fun: true },
    ball:  { emoji: '⚽', price: 3, stall: 'toys' },
    teddy: { emoji: '🧸', price: 5, stall: 'toys' },
    kite:  { emoji: '🪁', price: 8, stall: 'toys' },
    bike:  { emoji: '🚲', price: 12, stall: 'toys' },
    train: { emoji: '🚂', price: 20, stall: 'toys' },
  };
  const STALL_UNLOCK = { food: 2, toys: 4 };
  const SHOW_UNLOCK = 4, LUNCHBOX_FROM = 2, FRIDGE_MAX = 20;
  const CAT_COLORS = { work: '#F6C445', travel: '#6EC1E4', eat: '#8BD17C', play: '#F58FB6', wait: '#D8CBB6', shop: '#C79BE8', sleep: '#3D4A7A' };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const weekday = (day) => (day - 1) % 7;          // 0 = Monday
  const isWeekend = (day) => weekday(day) >= 5;

  // The day's plan: where to be, hour by hour (hours may run past 24 for the night block).
  function routine(state) {
    const wk = isWeekend(state.day), park = state.day >= PLACES.park.unlockDay, shops = state.day >= PLACES.shops.unlockDay;
    const b = (id, from, to, cat, place, emoji) => ({ id, from, to, cat, place, emoji });
    const day = wk ? [
      b('breakfast', 7, 7.5, 'eat', 'home', '🍳'),
      b('free', 7.5, 9, 'play', 'home', '🧸'),
      park ? b('park', 9, 13, 'play', 'park', '🌳') : b('free', 9, 13, 'play', 'home', '🧸'),
      b('lunch', 13, 13.5, 'eat', null, '🍱'),
      shops ? b('shops', 13.5, 15, 'shop', 'shops', '🏬') : b('free', 13.5, 15, 'play', 'home', '🧸'),
      park ? b('park', 15, 17.5, 'play', 'park', '🌳') : b('goHome', 15, 17.5, 'travel', 'home', '🏠'),
      b('goHome', 17.5, 18.5, 'travel', 'home', '🚶'),
      b('dinner', 18.5, 19, 'eat', 'home', '🍳'),
      b('free', 19, 21, 'play', 'home', '🧸'),
    ] : [
      b('breakfast', 7, 7.5, 'eat', 'home', '🍳'),
      state.day >= LUNCHBOX_FROM ? b('pack', 7.5, 8, 'eat', 'home', '🍱') : b('free', 7.5, 8, 'play', 'home', '🧸'),
      b('goWork', 8, 9, 'travel', 'bakery', '🚶'),
      b('work', 9, 13, 'work', 'bakery', '🥖'),
      b('lunch', 13, 13.5, 'eat', null, '🍱'),
      b('work2', 13.5, 17.5, 'work', 'bakery', '🥖'),
      b('goHome', 17.5, 18.5, 'travel', 'home', '🚶'),
      b('dinner', 18.5, 19, 'eat', 'home', '🍳'),
      b('free', 19, 21, 'play', 'home', '🧸'),
    ];
    day.push(b('sleep', 21, 31, 'sleep', 'home', '😴'));
    return day;
  }
  const bandAt = (state, time) => routine(state).find(x => time >= x.from * 60 && time < x.to * 60) || null;
  function planHint(state, out) {
    if (state.time >= BEDTIME) return;
    const band = bandAt(state, state.time); if (!band) return;
    if (state.lastBand === band.id) return;
    state.lastBand = band.id;
    out.msgs.push({ key: 'plan', band: band.id });
  }

  function newGame(avatar, seed) {
    return {
      v: 5, avatar: avatar || '🐻', seed: seed || 12345, // kept for saves and tests; nothing is random any more
      day: 1, time: DAY_START, coins: 2, loc: 'home',
      // The fridge starts with four meals: breakfast and dinner on days 1 and 2, so it runs out exactly when the shops open.
      tummy: 3, happy: WAKE_HAPPY, fridge: 4, lunchbox: 0,
      wardrobe: {}, toys: [], wish: null, wishReadyTold: false,
      timeline: [], today: freshToday(),
      flags: {}, phase: 'day', msgs: [], lastBand: 'breakfast',
      totals: { earned: 0, spent: 0 },
      slept: 10 * 60, bedAt: null, // minutes slept last night, when we went to bed today
    };
  }
  const freshToday = () => ({ earned: 0, spent: 0 });

  function timeInfo(t) {
    const h = Math.floor(t / 60) % 24, m = t % 60;
    const part = h >= 21 || h < 7 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    return { h, m, part, h12: h % 12 === 0 ? 12 : h % 12 };
  }

  // ---- sleep ----
  // What a night starting at bedAt does: minutes slept, and the happiness bonus for every full hour beyond what is needed.
  function nightMath(state, bedAt) {
    const slept = DAY_START + 24 * 60 - bedAt;
    const bonus = Math.min(BONUS_MAX, Math.floor(Math.max(0, slept - SLEEP_NEED) / 60) * BONUS_PER_HOUR);
    return { slept, need: SLEEP_NEED, short: Math.max(0, SLEEP_NEED - slept), bonus };
  }
  const sleepIfBedNow = (state) => nightMath(state, Math.min(state.time, LATEST_BED));

  function isOpen(state, place, at) {
    const p = PLACES[place]; const t = at == null ? state.time : at;
    if (!p) return false;
    if (p.weekdaysOnly && isWeekend(state.day)) return false;
    if (p.open == null) return true;
    return t >= p.open && t < p.close;
  }
  const unlocked = (state, place) => state.day >= PLACES[place].unlockDay;
  const stallOpen = (state, stall) => state.day >= STALL_UNLOCK[stall];
  const shiftAt = (time) => SHIFTS.find(s => time >= s.start && time < s.end) || null;
  const nextShift = (time) => SHIFTS.find(s => s.start > time) || null;

  // ---- time & needs ----
  function advance(state, minutes, cat, out) {
    const from = state.time;
    for (let i = 0; i < minutes / STEP; i++) {
      if (state.time >= LATEST_BED) break; // midnight: whatever we were doing, we fall asleep
      const slot = (state.time - DAY_START) / STEP;
      if (slot >= 0 && slot < SLOTS) state.timeline[slot] = cat;
      state.time += STEP;
      state.tummy = clamp(state.tummy - HUNGER_PER_STEP, 0, TUMMY_MAX);
    }
    out.steps.push({ cat, from, to: state.time });
  }
  // With an empty tummy, an empty fridge and no way to buy food, the only way out is sleeping — so say that, instead of
  // "eat first", which would be advice for something the player cannot do.
  function foodTrapped(state) {
    if (state.tummy > 0 || state.fridge > 0 || state.lunchbox) return false;
    const canBuyFood = stallOpen(state, 'food') && state.coins >= ITEMS.meals.price;
    const canEatOut = state.coins >= 2; // the café or the restaurant
    return !canBuyFood && !canEatOut;
  }
  function needHints(state, out) {
    if (state.time >= BEDTIME && !state.flags.hBedtime) return; // the bedtime message takes over this once
    let hinted = false;
    if (foodTrapped(state) && !state.flags.hNoFood) { out.msgs.push({ key: 'nothingToEat' }); state.flags.hNoFood = true; hinted = true; }
    else if (state.tummy <= 0 && !state.flags.hStarving) { out.msgs.push({ key: 'starving' }); state.flags.hStarving = true; hinted = true; }
    else if (state.tummy <= 1 && state.tummy > 0 && !state.flags.hHungry) { out.msgs.push({ key: 'hungry' }); state.flags.hHungry = true; hinted = true; }
    if (!hinted && state.happy <= 0 && !state.flags.hSad) { out.msgs.push({ key: 'tooSad' }); state.flags.hSad = true; hinted = true; }
    else if (!hinted && state.happy <= 1 && state.happy > 0 && !state.flags.hBored) { out.msgs.push({ key: 'bored' }); state.flags.hBored = true; hinted = true; }
    if (!hinted && state.wish && state.coins >= ITEMS[state.wish].price && !state.wishReadyTold) {
      out.msgs.push({ key: 'wishReady', item: state.wish }); state.wishReadyTold = true;
    }
  }
  function ate(state, amount) { state.tummy = clamp(state.tummy + amount, 0, TUMMY_MAX); state.flags.hHungry = false; state.flags.hStarving = false; state.flags.hNoFood = false; }
  function cheer(state, amount) { state.happy = clamp(state.happy + amount, 0, HAPPY_MAX); if (amount > 0) { state.flags.hBored = false; state.flags.hSad = false; } }
  function pay(state, n, out) { state.coins -= n; state.today.spent += n; state.totals.spent += n; out.coins -= n; }
  function earn(state, n, out) { if (!n) return; state.coins += n; state.today.earned += n; state.totals.earned += n; out.coins += n; }

  function fallAsleep(state, out, key) { // the day is over
    out.msgs = out.msgs.filter(m => m.key !== 'rested');
    out.msgs.push({ key });
    state.bedAt = Math.min(state.time, LATEST_BED); state.phase = 'summary'; out.bedtime = true;
  }
  function checkBedtime(state, out) {
    if (state.phase !== 'day') return;
    if (state.time >= BEDTIME && !state.flags.hBedtime) { // 21:00: bedtime, but staying up is allowed (at home)
      state.flags.hBedtime = true;
      out.msgs = out.msgs.filter(m => m.key !== 'rested');
      if (state.loc !== 'home') { out.msgs.push({ key: 'late' }); advance(state, TRAVEL.walk.min, 'travel', out); state.loc = 'home'; }
      else out.msgs.push({ key: 'bedtime' });
    }
    if (state.time >= LATEST_BED) fallAsleep(state, out, 'midnight');
  }

  // ---- actions ----
  function actions(state) {
    const list = [], s = state, wk = isWeekend(s.day);
    const openNow = isOpen(s, s.loc);
    const closedMsg = () => PLACES[s.loc].weekdaysOnly && wk ? { key: 'closedToday', place: s.loc } : { key: 'closed', place: s.loc, t: PLACES[s.loc].open };
    const hungryBlock = s.tummy <= 0 ? { key: 'starving' } : null;
    const sadBlock = s.happy <= 0 ? { key: 'tooSad' } : null;
    const add = (a) => list.push(Object.assign({ enabled: true, cost: 0, earn: 0, minutes: 0, tummy: 0, happy: 0, fridge: 0 }, a));
    const lunchBreak = s.time >= LUNCH_FROM && s.time < LUNCH_TO, night = s.time >= BEDTIME;

    if (s.loc === 'home') {
      add({ id: 'cook', emoji: '🍳', cat: 'eat', minutes: 30, tummy: 4, happy: 1, fridge: -1, enabled: s.fridge > 0, why: s.fridge > 0 ? null : { key: 'noMeals' } });
      if (!wk && !s.lunchbox && !night && s.day >= LUNCHBOX_FROM) add({ id: 'pack', emoji: '🍱', cat: 'eat', minutes: 30, fridge: -1, enabled: s.fridge > 0, why: s.fridge > 0 ? null : { key: 'noMeals' } });
      if (s.toys.length) add({ id: 'toy', emoji: ITEMS[s.toys[s.toys.length - 1]].emoji, cat: 'play', minutes: 60, happy: 1, enabled: !hungryBlock, why: hungryBlock });
      else if (s.day >= STALL_UNLOCK.toys) add({ id: 'toy', emoji: '🧸', cat: 'play', minutes: 60, happy: 1, enabled: false, why: { key: 'noToy' } });
    }
    if (s.loc === 'bakery') {
      const shift = shiftAt(s.time), next = nextShift(s.time);
      let work;
      if (!openNow) work = { enabled: false, why: closedMsg() };
      else if (lunchBreak) work = { enabled: false, why: { key: 'lunchBreak' } };
      else if (shift) {
        const minutes = shift.end - s.time, hours = minutes / 60;
        work = { enabled: !hungryBlock && !sadBlock, why: hungryBlock || sadBlock, minutes, until: shift.end,
                 earn: Math.ceil(hours) * WORK_PAY, happy: -(Math.round(hours * -WORK_HAPPY) || 1) };
      } else if (next) work = { enabled: false, why: { key: 'shiftStarts', t: next.start }, until: next.start };
      else work = { enabled: false, why: { key: 'shiftOver' } };
      add(Object.assign({ id: 'work', emoji: '🥖', cat: 'work' }, work));
      add({ id: 'cafe', emoji: '🍲', cat: 'eat', minutes: 30, cost: 2, tummy: 4, happy: 1, enabled: openNow && s.coins >= 2, why: !openNow ? closedMsg() : { key: 'notEnough', n: 2 - s.coins } });
    }
    if (s.lunchbox) add({ id: 'lunchbox', emoji: '🍱', cat: 'eat', minutes: 30, tummy: 4, happy: 1 });
    if (s.loc === 'shops') {
      add({ id: 'shop', emoji: '🛒', cat: 'shop', minutes: 30, enabled: openNow, why: openNow ? null : closedMsg(), sheet: true });
      add({ id: 'restaurant', emoji: '🍝', cat: 'eat', minutes: 30, cost: 2, tummy: 4, happy: 1, enabled: openNow && s.coins >= 2, why: !openNow ? closedMsg() : { key: 'notEnough', n: 2 - s.coins } });
    }
    if (s.loc === 'park') {
      add({ id: 'play', emoji: '🛝', cat: 'play', minutes: 60, happy: 2, enabled: !hungryBlock, why: hungryBlock });
      add({ id: 'icecream', emoji: '🍦', cat: 'eat', minutes: 30, cost: 1, happy: 1, tummy: 1, enabled: s.coins >= 1, why: { key: 'notEnough', n: 1 - s.coins } });
      if (s.day >= SHOW_UNLOCK) add({ id: 'show', emoji: '🎭', cat: 'play', minutes: 60, cost: 2, happy: 3, enabled: s.coins >= 2, why: { key: 'notEnough', n: 2 - s.coins } });
    }
    add({ id: 'rest', emoji: '😌', cat: 'wait', minutes: 30, happy: 1 });
    if (s.loc === 'home') { // at home you can always go to bed; the card shows how long the night would be and the happiness bonus
      const n = sleepIfBedNow(s);
      add({ id: 'bed', emoji: '🛏️', cat: 'sleep', sleep: n.slept, sleepShort: n.short > 0, happy: n.bonus, urge: foodTrapped(s) });
    }
    return list;
  }

  function perform(state, id) {
    const out = { ok: false, msgs: [], steps: [], coins: 0, bedtime: false };
    if (state.phase !== 'day') return out;
    const a = actions(state).find(x => x.id === id);
    if (!a || !a.enabled) { if (a && a.why) out.msgs.push(a.why); return out; }
    out.ok = true;
    const go = (cat) => advance(state, a.minutes, cat, out);
    switch (id) {
      case 'cook': state.fridge -= 1; go('eat'); ate(state, 4); cheer(state, 1); out.msgs.push({ key: 'ate' }); break;
      case 'pack': state.fridge -= 1; state.lunchbox = 1; go('eat'); out.msgs.push({ key: 'packed' }); break;
      case 'lunchbox': state.lunchbox = 0; go('eat'); ate(state, 4); cheer(state, 1); out.msgs.push({ key: 'lunchbox' }); break;
      case 'cafe': pay(state, 2, out); go('eat'); ate(state, 4); cheer(state, 1); out.msgs.push({ key: 'cafe' }); break;
      case 'toy': go('play'); cheer(state, 1); out.msgs.push({ key: 'played' }); break;
      case 'work': {
        const minutes = a.minutes;
        advance(state, minutes, 'work', out); earn(state, a.earn, out); cheer(state, a.happy);
        out.msgs.push({ key: state.flags.firstWork ? 'worked' : 'workedFirst', d: minutes, n: a.earn, k: Math.round(minutes / 60), t: a.until });
        state.flags.firstWork = true; break;
      }
      case 'restaurant': pay(state, 2, out); go('eat'); ate(state, 4); cheer(state, 1); out.msgs.push({ key: 'ate' }); break;
      case 'play': go('play'); cheer(state, 2); out.msgs.push({ key: 'played' }); break;
      case 'icecream': pay(state, 1, out); go('eat'); ate(state, 1); cheer(state, 1); out.msgs.push({ key: 'icecream' }); break;
      case 'show': pay(state, 2, out); go('play'); cheer(state, 3); out.msgs.push({ key: 'show' }); break;
      case 'rest': go('wait'); cheer(state, 1); out.msgs.push({ key: 'rested', t: state.time }); break;
      case 'bed': fallAsleep(state, out, a.sleepShort ? 'goBedLate' : 'goBed'); return out;
      default: out.ok = false; return out;
    }
    needHints(state, out);
    planHint(state, out);
    checkBedtime(state, out);
    return out;
  }

  function travelOptions(state) {
    return Object.keys(TRAVEL).map(mode => {
      const t = TRAVEL[mode];
      const owned = !t.needs || state.toys.includes(t.needs);
      return { mode, emoji: t.emoji, minutes: t.min, cost: t.cost, enabled: owned && state.coins >= t.cost,
               hidden: !owned || state.day < t.unlockDay, why: state.coins < t.cost ? { key: 'notEnough', n: t.cost - state.coins } : null };
    }).filter(o => !o.hidden);
  }
  const isNight = (state) => state.time >= BEDTIME; // after 21:00 we stay home
  function destinations(state) {
    const night = isNight(state);
    return Object.keys(PLACES).filter(p => unlocked(state, p)).map(p => ({
      id: p, emoji: PLACES[p].emoji, here: p === state.loc, open: isOpen(state, p), night: night && p !== 'home',
      opensAt: PLACES[p].open, closedToday: PLACES[p].weekdaysOnly && isWeekend(state.day), always: PLACES[p].open == null,
    }));
  }
  function travel(state, dest, mode) {
    const out = { ok: false, msgs: [], steps: [], coins: 0, bedtime: false };
    if (state.phase !== 'day' || dest === state.loc || !unlocked(state, dest)) return out;
    if (isNight(state)) { out.msgs.push({ key: 'nightStayHome' }); return out; }
    const opt = travelOptions(state).find(o => o.mode === mode);
    if (!opt || !opt.enabled) { if (opt && opt.why) out.msgs.push(opt.why); return out; }
    out.ok = true;
    if (opt.cost) pay(state, opt.cost, out);
    advance(state, opt.minutes, 'travel', out);
    state.loc = dest;
    out.msgs.push({ key: 'arrived', place: dest });
    if (mode === 'bike' && !state.flags.bikeTold) { out.msgs.push({ key: 'bikeTravel' }); state.flags.bikeTold = true; }
    needHints(state, out);
    planHint(state, out);
    checkBedtime(state, out);
    return out;
  }

  function catalogue(state, stall) {
    return Object.keys(ITEMS).filter(k => ITEMS[k].stall === stall).map(k => {
      const it = ITEMS[k];
      const owned = it.wear ? !!state.wardrobe[k] : stall === 'toys' ? state.toys.includes(k) : false;
      const full = k === 'meals' && state.fridge + it.meals > FRIDGE_MAX;
      return { id: k, emoji: it.emoji, price: it.price, owned, full, canAfford: state.coins >= it.price, wished: state.wish === k,
               enabled: !owned && !full && state.coins >= it.price };
    });
  }
  function buy(state, item) {
    const out = { ok: false, msgs: [], steps: [], coins: 0, bedtime: false, bought: null };
    if (state.phase !== 'day' || state.loc !== 'shops' || !isOpen(state, 'shops')) return out;
    const it = ITEMS[item]; if (!it || !stallOpen(state, it.stall)) return out;
    const entry = catalogue(state, it.stall).find(c => c.id === item);
    if (!entry.enabled) { if (!entry.canAfford) out.msgs.push({ key: 'notEnough', n: it.price - state.coins }); return out; }
    out.ok = true; out.bought = item;
    pay(state, it.price, out);
    advance(state, 30, 'shop', out);
    if (item === 'meals') { state.fridge += it.meals; out.msgs.push({ key: 'boughtMeals' }); }
    else if (it.wear) { state.wardrobe[item] = true; cheer(state, 1); out.msgs.push({ key: 'bought', item }); }
    else { state.toys.push(item); cheer(state, 2);
      if (state.wish === item) { state.wish = null; state.wishReadyTold = false; out.msgs.push({ key: 'wishBought', item }); }
      else out.msgs.push({ key: 'bought', item }); }
    needHints(state, out);
    planHint(state, out);
    checkBedtime(state, out);
    return out;
  }
  function setWish(state, item) {
    const out = { ok: false, msgs: [] };
    if (!ITEMS[item] || ITEMS[item].stall !== 'toys' || state.toys.includes(item)) return out;
    state.wish = item; state.wishReadyTold = state.coins >= ITEMS[item].price; out.ok = true;
    out.msgs.push({ key: state.wishReadyTold ? 'wishReady' : 'wishSet', item, n: ITEMS[item].price });
    return out;
  }

  // ---- day / night ----
  function summary(state) {
    const byCat = {}; state.timeline.forEach(c => { if (c) byCat[c] = (byCat[c] || 0) + STEP; });
    const bedAt = state.bedAt == null ? BEDTIME : state.bedAt, n = nightMath(state, bedAt);
    byCat.sleep = n.slept;
    return { day: state.day, weekday: weekday(state.day), earned: state.today.earned, spent: state.today.spent,
             kept: state.today.earned - state.today.spent, wallet: state.coins, byCat,
             timeline: state.timeline.slice(0, SLOTS),
             bedAt, slept: n.slept, short: n.short, bonus: n.bonus };
  }
  function goToSleep(state) { // summary -> night
    if (state.phase !== 'summary') return false;
    if (state.bedAt == null) state.bedAt = Math.min(Math.max(state.time, BEDTIME), LATEST_BED);
    const n = nightMath(state, state.bedAt);
    state.slept = n.slept; state.sleepBonus = n.bonus;
    state.phase = 'night'; return true;
  }
  function wakeUp(state) { // night -> new day
    if (state.phase !== 'night') return null;
    state.day += 1; state.time = DAY_START; state.loc = 'home';
    const bonus = state.sleepBonus || 0; state.sleepBonus = 0;
    state.tummy = WAKE_TUMMY; state.happy = clamp(Math.max(WAKE_HAPPY, state.happy) + bonus, 0, HAPPY_MAX); // extra sleep = happier morning
    state.timeline = []; state.today = freshToday(); state.lunchbox = 0; state.bedAt = null;
    state.flags.hHungry = state.flags.hStarving = state.flags.hBored = state.flags.hSad = state.flags.hNoFood = false;
    state.flags.hBedtime = false;
    state.phase = 'day';
    const msgs = [{ key: 'morning', day: state.day }];
    if (isWeekend(state.day)) msgs.push({ key: 'weekendMorning' });
    if (state.day === PLACES.shops.unlockDay) msgs.push({ key: 'newShops' });
    if (state.day === PLACES.park.unlockDay) msgs.push({ key: 'newPark' });
    if (state.day === STALL_UNLOCK.toys) msgs.push({ key: 'newToys' });
    if (bonus > 0) msgs.push({ key: 'sleptExtra', n: bonus });
    const first = routine(state)[0].id; state.lastBand = first; msgs.push({ key: 'plan', band: first });
    return msgs;
  }

  return { DAY_START, BEDTIME, LATEST_BED, SLEEP_NEED, BONUS_PER_HOUR, BONUS_MAX, STEP, SLOTS, TUMMY_MAX, HAPPY_MAX, PLACES, TRAVEL, ITEMS, CAT_COLORS, STALL_UNLOCK, LUNCHBOX_FROM, FRIDGE_MAX, LUNCH_FROM, LUNCH_TO, WORK_PAY, SHIFTS, HUNGER_PER_STEP,
           newGame, timeInfo, isOpen, isWeekend, weekday, unlocked, stallOpen, actions, perform, travelOptions, destinations,
           travel, catalogue, buy, setWish, summary, goToSleep, wakeUp, routine, bandAt, shiftAt, nightMath, foodTrapped, isNight };
})();
if (typeof module !== 'undefined') module.exports = TSEngine;
