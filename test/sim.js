// Simulates many days with random and "sensible" policies to catch dead ends and balance problems.
const E = require('../src/engine.js');

function assert(c, msg, s) { if (!c) { console.error('ASSERT FAIL:', msg, JSON.stringify(s).slice(0, 400)); process.exit(1); } }

function step(s, pick, rnd) {
  // returns true if the day ended
  const acts = E.actions(s);
  assert(acts.some(a => a.enabled), 'no enabled action', s);
  const enabled = acts.filter(a => a.enabled);
  const choice = pick(s, enabled, rnd);
  let out;
  if (choice.type === 'act') out = E.perform(s, choice.id);
  else if (choice.type === 'travel') out = E.travel(s, choice.dest, choice.mode);
  else if (choice.type === 'buy') out = E.buy(s, choice.item);
  else if (choice.type === 'wish') out = E.setWish(s, choice.item);
  assert(s.coins >= 0, 'negative coins', s);
  assert(s.tummy >= 0 && s.tummy <= E.TUMMY_MAX && s.happy >= 0 && s.happy <= E.HAPPY_MAX && s.fridge >= 0 && s.fridge <= E.FRIDGE_MAX, 'meter out of range', s);
  return s.phase !== 'day';
}

function randomPolicy(s, enabled, rnd) {
  const r = rnd();
  if (r < 0.25) { const dests = E.destinations(s).filter(d => !d.here); const d = dests[Math.floor(rnd() * dests.length)];
    const opts = E.travelOptions(s).filter(o => o.enabled); return { type: 'travel', dest: d.id, mode: opts[Math.floor(rnd() * opts.length)].mode }; }
  if (r < 0.35 && s.loc === 'shops' && E.isOpen(s, 'shops')) {
    const stalls = ['food', 'toys'].filter(st => E.stallOpen(s, st));
    const cat = E.catalogue(s, stalls[Math.floor(rnd() * stalls.length)]);
    const ok = cat.filter(c => c.enabled); if (ok.length) return { type: 'buy', item: ok[Math.floor(rnd() * ok.length)].id };
    const wishable = cat.filter(c => !c.owned && E.ITEMS[c.id].stall === 'toys'); if (wishable.length && !s.wish) return { type: 'wish', item: wishable[0].id };
  }
  const a = enabled.filter(x => !x.sheet); return { type: 'act', id: a[Math.floor(rnd() * a.length)].id };
}

// A child-like sensible policy: eat when hungry, work when open, play when sad, shop for food when fridge empty, bed from 19:00.
function sensiblePolicy(s, enabled) {
  const has = id => enabled.find(a => a.id === id);
  const go = (dest, mode) => ({ type: 'travel', dest, mode: (mode || (s.toys.includes('bike') ? 'bike' : 'walk')) });
  if (s.tummy <= 1) {
    if (s.loc === 'home' && has('cook')) return { type: 'act', id: 'cook' };
    if (has('lunchbox')) return { type: 'act', id: 'lunchbox' };
    if (s.loc === 'bakery' && has('cafe')) return { type: 'act', id: 'cafe' };
    if (s.loc === 'shops' && has('restaurant')) return { type: 'act', id: 'restaurant' };
    if (s.loc === 'shops' && E.isOpen(s, 'shops')) { const c = E.catalogue(s, 'food')[0]; if (c.enabled) return { type: 'buy', item: 'meals' }; }
    if (s.fridge > 0 && s.loc !== 'home') return go('home');
    if (s.coins >= 3 && s.loc !== 'shops' && E.unlocked(s, 'shops') && E.isOpen(s, 'shops')) return go('shops');
    if (s.loc === 'park' && has('icecream')) return { type: 'act', id: 'icecream' };
  }
  if (s.loc === 'home' && has('pack') && s.time < 9 * 60) return { type: 'act', id: 'pack' };
  if (s.happy <= 1 && E.unlocked(s, 'park')) { if (s.loc === 'park' && has('play')) return { type: 'act', id: 'play' }; if (s.loc !== 'park') return go('park'); }
  if (s.happy <= 1 && s.loc === 'home' && has('toy')) return { type: 'act', id: 'toy' };
  if (s.fridge === 0 && s.coins >= 3 && E.unlocked(s, 'shops') && E.isOpen(s, 'shops') && s.loc !== 'shops' && s.time < 17 * 60) return go('shops');
  // saved up for the wish and the fridge is stocked: spend it at the weekend, when there is no shift to miss
  if (E.isWeekend(s.day) && s.wish && s.coins >= E.ITEMS[s.wish].price && s.fridge >= 2 && s.loc !== 'shops' && E.unlocked(s, 'shops') && E.isOpen(s, 'shops') && s.time < 16 * 60) return go('shops');
  if (s.loc === 'shops' && E.isOpen(s, 'shops')) {
    const toys = E.stallOpen(s, 'toys') ? E.catalogue(s, 'toys') : [];
    if (toys.length && !s.wish) { const w = toys.find(t => !t.owned); if (w) return { type: 'wish', item: w.id }; }
    const wish = toys.find(t => t.id === s.wish); if (wish && wish.enabled && s.fridge >= 2) return { type: 'buy', item: wish.id };
    const food = E.catalogue(s, 'food')[0]; if (food.enabled && s.fridge < 3) return { type: 'buy', item: 'meals' };
  }
  if (E.isOpen(s, 'bakery') && s.loc === 'bakery' && has('work')) return { type: 'act', id: 'work' };
  if (!E.isWeekend(s.day) && s.time < 15 * 60 && s.loc !== 'bakery' && s.happy > 1) return go('bakery');
  if (s.loc === 'bakery' && s.time < 9 * 60) return { type: 'act', id: 'rest' };
  if (has('bed') && s.time >= 19 * 60) return { type: 'act', id: 'bed' };
  if (s.loc !== 'home' && s.time >= 17 * 60) return go('home');
  if (s.loc === 'home' && has('toy') && s.happy < 6) return { type: 'act', id: 'toy' };
  if (s.loc === 'park' && has('play')) return { type: 'act', id: 'play' };
  return { type: 'act', id: 'rest' };
}

function runDays(policy, days, seed, log) {
  let x = seed; const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const s = E.newGame('🐻', seed);
  const report = [];
  for (let d = 0; d < days; d++) {
    let guard = 0;
    while (!step(s, policy, rnd)) { assert(++guard < 200, 'day never ends', s); }
    assert(s.phase === 'summary', 'expected summary phase', s);
    const sum = E.summary(s);
    report.push({ day: s.day, wd: E.weekday(s.day), earned: sum.earned, spent: sum.spent, wallet: s.coins, toys: s.toys.join(','), wardrobe: Object.keys(s.wardrobe).join(','), fridge: s.fridge });
    assert(E.goToSleep(s), 'goToSleep failed', s);
    const msgs = E.wakeUp(s); assert(msgs && msgs.length, 'wakeUp failed', s);
    assert(s.time === E.DAY_START && s.loc === 'home' && s.phase === 'day', 'bad morning state', s);
  }
  if (log) report.forEach(r => console.log(JSON.stringify(r)));
  return s;
}

console.log('--- random policy, 40 seeds x 21 days');
for (let seed = 1; seed <= 40; seed++) runDays(randomPolicy, 21, seed, false);
console.log('ok');
console.log('--- sensible policy, 21 days (seed 7)');
const s = runDays(sensiblePolicy, 21, 7, true);
console.log('final coins', s.coins, 'toys', s.toys, 'wardrobe', s.wardrobe, 'totals', s.totals);
console.log('--- save/load roundtrip');
const copy = JSON.parse(JSON.stringify(s)); assert(E.actions(copy).length > 0, 'actions after reload', copy);

console.log('--- day 1 is the smallest complete day');
{ // only home and the bakery, one way to travel, no lunchbox and no shop
  const d1 = E.newGame('\u{1F43B}', 3);
  const places = E.destinations(d1).map(p => p.id);
  assert(places.join(',') === 'home,bakery', 'day 1 has home and the bakery only', places);
  const modes = E.travelOptions(d1).map(o => o.mode);
  assert(modes.join(',') === 'walk', 'day 1 walks everywhere', modes);
  const ids = E.actions(d1).map(a => a.id);
  assert(!ids.includes('pack') && !ids.includes('shop'), 'no lunchbox and no shop on day 1', ids);
  assert(E.routine(d1).every(b => b.id !== 'pack'), 'the plan has no lunchbox band on day 1', E.routine(d1).map(b => b.id));
  // the fridge holds exactly breakfast + dinner for days 1 and 2, so it runs dry as the shops open
  assert(d1.fridge === 4, 'four meals to start', d1);
  const d2 = E.newGame('\u{1F43B}', 3); d2.day = 2;
  assert(E.destinations(d2).some(p => p.id === 'shops'), 'the shops open on day 2', E.destinations(d2));
  assert(E.travelOptions(d2).some(o => o.mode === 'bus'), 'the bus arrives with the shops', E.travelOptions(d2));
  assert(E.actions(d2).some(a => a.id === 'pack'), 'the lunchbox arrives on day 2', E.actions(d2).map(a => a.id));
}
console.log('ok');

console.log('--- nothing to eat is never a dead end');
{ // empty tummy, empty fridge, no coins: the only way out is sleeping, and the game says so
  const t = E.newGame('\u{1F98A}', 4); t.day = 3; t.tummy = 0; t.fridge = 0; t.coins = 0; t.lunchbox = 0;
  assert(E.foodTrapped(t), 'this is the trapped state', t);
  const enabled = E.actions(t).filter(a => a.enabled).map(a => a.id);
  assert(enabled.join(',') === 'rest,bed', 'only resting and bed are left', enabled);
  const bed = E.actions(t).find(a => a.id === 'bed');
  assert(bed.urge, 'the bed card is flagged as the way out', bed);
  const msgs = E.perform(t, 'rest').msgs.map(m => m.key);
  assert(msgs.includes('nothingToEat') && !msgs.includes('starving'), 'says there is nothing to eat, not "eat first"', msgs);
  // sleeping recovers: a new morning brings a tummy back, so work (and coins, and food) are reachable again
  assert(E.perform(t, 'bed').ok, 'bed', t);
  E.goToSleep(t); E.wakeUp(t);
  assert(t.tummy === 2 && !E.foodTrapped(t), 'the morning undoes the trap', t);
  E.travel(t, 'bakery', 'walk');
  while (t.time < 9 * 60) E.perform(t, 'rest');
  assert(E.actions(t).find(a => a.id === 'work').enabled, 'and work is possible again', t);
  // with coins for a cafe lunch it is not a trap at all
  const u = E.newGame('\u{1F98A}', 5); u.day = 3; u.tummy = 0; u.fridge = 0; u.coins = 2;
  assert(!E.foodTrapped(u), 'two coins buy lunch, so not trapped', u);
}
console.log('ok');

console.log('--- sleep: a night is just its length, nothing is carried over');
{ // the bed card names the night and the happiness bonus for sleeping longer than the 8 h needed
  const b = E.newGame('\u{1F428}', 9);
  const bed = () => E.actions(b).find(a => a.id === 'bed');
  assert(bed().enabled && bed().sleep === 24 * 60 && bed().happy === E.BONUS_MAX, 'bed at 7:00: 24 h, bonus capped', bed());
  b.time = 19 * 60; assert(bed().sleep === 12 * 60 && bed().happy === 2, 'bed at 19:00: 12 h, +2', bed());
  b.time = 21 * 60; assert(bed().sleep === 10 * 60 && bed().happy === 2, 'bed at 21:00: 10 h, +2', bed());
  b.time = 22 * 60; assert(bed().sleep === 9 * 60 && bed().happy === 1, 'bed at 22:00: 9 h, +1', bed());
  b.time = 23 * 60; assert(bed().sleep === 8 * 60 && bed().happy === 0 && !bed().sleepShort, 'bed at 23:00: 8 h, no bonus', bed());
  b.time = 19 * 60; b.happy = 2; assert(E.perform(b, 'bed').ok, 'bed at 19:00', b);
  const sum = E.summary(b); assert(sum.bonus === 2 && sum.short === 0, 'summary shows the bonus', sum);
  E.goToSleep(b); const m = E.wakeUp(b);
  assert(b.happy === E.HAPPY_MAX && m.some(x => x.key === 'sleptExtra' && x.n === 2), 'wake at max(4, 2) + 2, with the extra-sleep line', { happy: b.happy, m });
}
{ // staying up to midnight is a short night and nothing more: no debt, no slowdown tomorrow
  const nightOwl = (st, enabled) => { const a = enabled.filter(x => x.id !== 'bed' && !x.sheet); return { type: 'act', id: a[0].id }; };
  const o = runDays(nightOwl, 3, 11, false);
  assert(o.slept === 7 * 60, 'a midnight bedtime sleeps 7 h', { slept: o.slept });
  assert(o.owed === undefined, 'nothing is owed', o);
  assert(E.travelOptions(o).find(t => t.mode === 'walk').minutes === 60, 'walking is never slowed', o);
  assert(E.actions(o).find(a => a.id === 'cook').minutes === 30, 'nothing else is slowed either', o);
  assert(o.happy >= 1, 'three late nights are survivable', o);
  // a full morning of work still pays the same: being tired costs the bonus, not the wage
  o.fridge = 5; o.coins = 5; o.tummy = 3; o.happy = 4;
  assert(E.perform(o, 'cook').ok && E.perform(o, 'pack').ok && E.travel(o, 'bakery', 'walk').ok, 'morning routine', o);
  assert(o.time === 9 * 60, 'breakfast, lunchbox and a walk arrive at 9:00, on time', { time: o.time });
  const w = E.actions(o).find(a => a.id === 'work');
  assert(w.enabled && w.earn === 4 && w.until === 13 * 60, 'the morning shift pays 4', w);
}
{ // out at 21:00: sent home, can still stay up; travel is refused at night; midnight cuts an action short
  const p = E.newGame('\u{1F430}', 8); p.day = 4; p.loc = 'park'; p.time = 20 * 60 + 30; p.toys = ['ball'];
  const out = E.perform(p, 'play'); // 20:30 -> 21:30 at the park -> walked home by 22:30
  assert(out.msgs.some(m => m.key === 'late') && p.loc === 'home' && p.time === 22 * 60 + 30 && p.phase === 'day', 'sent home at 21:00 but still awake', p);
  assert(!E.travel(p, 'park', 'walk').ok, 'no travelling at night', p);
  assert(E.destinations(p).find(d => d.id === 'park').night, 'park shows as night', E.destinations(p));
  p.time = 23 * 60 + 30; const toy = E.perform(p, 'toy'); // 60 min, but midnight comes first
  assert(p.time === 24 * 60 && p.phase === 'summary' && toy.msgs.some(m => m.key === 'midnight'), 'play cut short at midnight', p);
  assert(E.summary(p).short === 60, 'a midnight night is an hour short', E.summary(p));
}
console.log('ok');

console.log('--- recovering from the worst state there is');
{ // broke, empty fridge, empty tummy: prove a child can climb all the way back, not just be told to sleep
  const r = E.newGame('\u{1F43B}', 31);
  r.day = 8; r.coins = 0; r.fridge = 0; r.tummy = 0; r.happy = 1; r.lunchbox = 0;  // day 8 is a Monday
  assert(!E.isWeekend(r.day), 'day 8 is a working day', { wd: E.weekday(r.day) });
  assert(E.foodTrapped(r), 'starting from the trap', r);
  assert(E.perform(r, 'bed').ok, 'the only move is bed'); E.goToSleep(r); E.wakeUp(r);
  assert(r.tummy === 2 && r.happy >= 4, 'a night restores enough to work', r);

  assert(E.travel(r, 'bakery', 'walk').ok, 'walk to the bakery', r);
  while (r.time < 9 * 60) assert(E.perform(r, 'rest').ok, 'wait for the shift', r);
  assert(E.perform(r, 'work').ok, 'morning shift', r);
  assert(r.coins === 4, 'four hours, four coins', r);
  assert(E.perform(r, 'cafe').ok, 'buy lunch with the wages', r);   // 2 coins, tummy +4
  assert(E.perform(r, 'work').ok, 'afternoon shift', r);
  assert(r.coins === 6, 'six coins by the end of the day', r);
  // the shops shut at 18:00 and the shift ends at 17:30, so shopping waits for the morning -
  // which is the real lesson: to buy food you give up part of a shift
  assert(!E.isOpen(r, 'shops', 17 * 60 + 30 + 60), 'no time to shop after a full day', {});
  assert(E.travel(r, 'home', 'walk').ok, 'walk home', r);
  while (r.phase === 'day') E.perform(r, 'rest');
  E.goToSleep(r); E.wakeUp(r);

  assert(r.coins === 6 && r.fridge === 0, 'a day of wages, still nothing to eat at home', r);
  assert(E.travel(r, 'shops', 'walk').ok, 'shops first this time', r);
  while (!E.isOpen(r, 'shops')) assert(E.perform(r, 'rest').ok, 'wait for opening', r);
  assert(E.buy(r, 'meals').ok, 'buy a basket of food', r);
  assert(r.fridge === 6 && r.coins === 1, 'fridge full again, one coin left', r);
  // late for the morning shift, so it is shorter - fewer coins, and nothing else taken
  assert(E.travel(r, 'bakery', 'walk').ok, 'on to work', r);
  const late = E.actions(r).find(a => a.id === 'work');
  assert(late.enabled && late.earn > 0 && late.earn < 4, 'a shorter shift still pays', late);
  assert(E.perform(r, 'work').ok, 'work what is left of it', r);
  assert(r.coins > 1, 'earning again', r);
}
console.log('ok');

console.log('--- wishing, saving and buying');
{ // the money lesson end to end: want something, work for it, watch it get closer, buy it
  const w = E.newGame('\u{1F42F}', 21); w.day = 8; w.loc = 'shops'; w.time = 10 * 60; w.coins = 0; w.fridge = 6;
  assert(E.stallOpen(w, 'toys'), 'the toy stall is open by day 8', w);
  assert(E.setWish(w, 'kite').ok && w.wish === 'kite', 'wish for the kite', w);
  const tooPoor = E.catalogue(w, 'toys').find(c => c.id === 'kite');
  assert(!tooPoor.enabled && tooPoor.wished, 'wished for, but not affordable yet', tooPoor);
  assert(!E.buy(w, 'kite').ok, 'cannot buy it without the coins', w);
  w.coins = E.ITEMS.kite.price;                       // eight days of saving, in one line
  const rich = E.catalogue(w, 'toys').find(c => c.id === 'kite');
  assert(rich.enabled, 'now it is affordable', rich);
  const out = E.buy(w, 'kite');
  assert(out.ok && w.toys.includes('kite') && w.coins === 0, 'bought the kite', w);
  assert(out.msgs.some(m => m.key === 'wishBought'), 'and it is celebrated as the wish coming true', out.msgs);
  assert(w.wish === null, 'the wish is spent', w);
  // owning a toy gives something to do at home
  w.loc = 'home';
  assert(E.actions(w).find(a => a.id === 'toy').enabled, 'the kite is playable at home', E.actions(w));
  // the bike is a toy AND a way to travel
  const r = E.newGame('\u{1F42F}', 22); r.day = 8;
  assert(!E.travelOptions(r).some(o => o.mode === 'bike'), 'no bike, no bike option', E.travelOptions(r));
  r.toys = ['bike'];
  const bike = E.travelOptions(r).find(o => o.mode === 'bike');
  assert(bike && bike.cost === 0 && bike.minutes === 30, 'the bike is as fast as the bus and free', bike);
}
console.log('ok');

console.log('--- work pays the same whenever you turn up');
{ // arriving late means a shorter shift and fewer coins - that is the whole lesson, no extra fine
  const a = E.newGame('\u{1F438}', 12); a.loc = 'bakery'; a.time = 9 * 60;
  assert(E.actions(a).find(x => x.id === 'work').earn === 4, 'on time: 4 hours, 4 coins', a);
  const b = E.newGame('\u{1F438}', 12); b.loc = 'bakery'; b.time = 11 * 60;
  const w = E.actions(b).find(x => x.id === 'work');
  assert(w.earn === 2 && w.minutes === 120, 'two hours late: 2 hours, 2 coins, nothing extra taken', w);
}
console.log('ok');
console.log('--- strings: EN and PT complete, and nothing the game says is missing');
{ // everything is read aloud in two languages, so a missing string is a silent button
  const fs = require('fs'), path = require('path');
  const I18N = new Function(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.js'), 'utf8') + '; return I18N;')();
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v)) ? keys(v, p + k + '.') : [p + k]);
  const en = new Set(keys(I18N.en)), pt = new Set(keys(I18N.pt));
  assert([...en].every(k => pt.has(k)), 'keys missing from PT', [...en].filter(k => !pt.has(k)));
  assert([...pt].every(k => en.has(k)), 'keys missing from EN', [...pt].filter(k => !en.has(k)));

  const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');
  const emitted = [...new Set([...engineSrc.matchAll(/key:\s*'([a-zA-Z]+)'/g)].map(m => m[1]))];
  const noText = emitted.filter(k => !I18N.en.bubble[k] && !I18N.en.why[k]);
  assert(noText.length === 0, 'engine message keys with no string', noText);

  const bands = new Set(), ids = new Set();
  for (let d = 1; d <= 8; d++) {
    const r = E.newGame('\u{1F43B}', 1); r.day = d; E.routine(r).forEach(b => bands.add(b.id));
    for (const loc of ['home', 'bakery', 'shops', 'park']) {
      const a = E.newGame('\u{1F43B}', 1); a.day = d; a.loc = loc; a.toys = ['ball']; a.lunchbox = 1; a.coins = 30;
      E.actions(a).forEach(x => ids.add(x.id));
    }
  }
  const badBands = [...bands].filter(b => !I18N.en.plan[b] || !I18N.pt.plan[b] || !I18N.en.bubble.plan[b] || !I18N.pt.bubble.plan[b]);
  assert(badBands.length === 0, 'plan bands with no text', badBands);
  const badActs = [...ids].filter(i => !I18N.en.act[i] || !I18N.pt.act[i]);
  assert(badActs.length === 0, 'action ids with no label', badActs);
  const badItems = Object.keys(E.ITEMS).filter(i => !I18N.en.items[i] || !I18N.pt.items[i] || !I18N.en.itemsA[i] || !I18N.pt.itemsA[i]);
  assert(badItems.length === 0, 'items with no label', badItems);
  const badStalls = [...new Set(Object.values(E.ITEMS).map(i => i.stall))].filter(st => !I18N.en.stalls[st] || !I18N.pt.stalls[st]);
  assert(badStalls.length === 0, 'stalls with no label', badStalls);

  // read aloud to a five-year-old: keep the lines short
  const lines = [];
  const walk = (o, p = '') => { for (const k in o) { const v = o[k]; if (typeof v === 'string') lines.push([p + k, v.split(/\s+/).length]); else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p + k + '.'); } };
  walk(I18N.en.bubble);
  const wordy = lines.filter(([, n]) => n > 12);
  assert(wordy.length === 0, 'bubble lines longer than 12 words', wordy);
  console.log(`ok (${en.size} strings each language, longest bubble line ${Math.max(...lines.map(l => l[1]))} words)`);
}
console.log('ALL OK');
