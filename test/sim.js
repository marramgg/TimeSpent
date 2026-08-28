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
    const stalls = ['food', 'clothes', 'toys'].filter(st => E.stallOpen(s, st));
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
    if (s.coins >= 3 && s.loc !== 'shops' && E.isOpen(s, 'shops')) return go('shops');
    if (s.loc === 'park' && has('icecream')) return { type: 'act', id: 'icecream' };
  }
  if (s.loc === 'home' && has('pack') && s.time < 9 * 60) return { type: 'act', id: 'pack' };
  if (s.happy <= 1 && E.unlocked(s, 'park')) { if (s.loc === 'park' && has('play')) return { type: 'act', id: 'play' }; if (s.loc !== 'park') return go('park'); }
  if (s.happy <= 1 && s.loc === 'home' && has('toy')) return { type: 'act', id: 'toy' };
  if (s.fridge === 0 && s.coins >= 3 && E.isOpen(s, 'shops') && s.loc !== 'shops' && s.time < 17 * 60) return go('shops');
  if (s.loc === 'shops' && E.isOpen(s, 'shops')) {
    const food = E.catalogue(s, 'food')[0]; if (food.enabled && s.fridge < 3) return { type: 'buy', item: 'meals' };
    if (E.stallOpen(s, 'toys')) { const toys = E.catalogue(s, 'toys'); if (!s.wish) { const w = toys.find(t => !t.owned); if (w) return { type: 'wish', item: w.id }; }
      const wish = toys.find(t => t.id === s.wish); if (wish && wish.enabled) return { type: 'buy', item: wish.id }; }
    if (E.stallOpen(s, 'clothes')) { const cl = E.catalogue(s, 'clothes'); const need = cl.find(c => c.enabled && ((c.id === 'raincoat' && s.forecast === 'rain') || (c.id === 'jacket' && s.forecast === 'cold'))); if (need) return { type: 'buy', item: need.id }; }
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
    report.push({ day: s.day, wd: E.weekday(s.day), earned: sum.earned, spent: sum.spent, wallet: s.coins, toys: s.toys.join(','), wardrobe: Object.keys(s.wardrobe).join(','), fridge: s.fridge, weather: s.weather });
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

console.log('--- sleep: night owl (never goes to bed) vs early bird');
{ // staying up: the day ends at midnight, 7 h of sleep, and every extra late night adds to what is owed
  const nightOwl = (st, enabled) => { const a = enabled.filter(x => x.id !== 'bed' && !x.sheet); return { type: 'act', id: a[0].id }; };
  const o = runDays(nightOwl, 3, 11, false);
  // runDays leaves us on the morning of day 4 after three midnights: owed grows 1 h, 2 h, 3 h
  assert(o.owed === 3 * 60, 'owed after three midnights should be 3 h', { owed: o.owed });
  assert(o.slept === 7 * 60, 'a midnight bedtime sleeps 7 h', { slept: o.slept });
  assert(E.sleepy(o), 'should be sleepy', o);
  const walk = E.travelOptions(o).find(t => t.mode === 'walk'); assert(walk.minutes === 90 && walk.extra === 30, 'sleepy walk takes 90 min', walk);
  const cook = E.actions(o).find(a => a.id === 'cook'); assert(cook.minutes === 30, 'eating is not slowed', cook);
  const rest = E.actions(o).find(a => a.id === 'rest'); assert(rest.minutes === 30, 'resting is not slowed', rest);
  assert(E.bedByTonight(o.owed) === 20 * 60, 'owing 3 h means bed by 20:00', { bedBy: E.bedByTonight(o.owed) });
  // sleepy morning: breakfast, lunchbox, walk -> late for the 9:00 shift; the bus would have been on time
  o.fridge = 5; o.coins = 5; o.tummy = 3; o.happy = 7;
  assert(E.perform(o, 'cook').ok && E.perform(o, 'pack').ok && E.travel(o, 'bakery', 'walk').ok, 'morning routine', o);
  assert(o.time === 9 * 60 + 30, 'sleepy walk arrives at 9:30', { time: o.time });
  const w = E.actions(o).find(a => a.id === 'work'); assert(w.late && w.earn === 3, 'late shift pays 3', w);
  // night: 21:00 nudge, 23:00 last call, midnight forced sleep, and nothing opens at night
  E.perform(o, 'work'); E.perform(o, 'lunchbox'); E.perform(o, 'work'); E.travel(o, 'home', 'bus'); // 17:30 + slow bus (60) = 18:30
  assert(o.time === 18 * 60 + 30, 'slow bus home arrives 18:30', { time: o.time });
  let keys = [];
  while (o.phase === 'day') keys = keys.concat(E.perform(o, 'rest').msgs.map(m => m.key));
  assert(keys.includes('bedtime') && keys.includes('lastCall') && keys.includes('midnight'), 'night messages', keys);
  assert(o.bedAt === 24 * 60 && o.phase === 'summary', 'asleep at midnight', { bedAt: o.bedAt, phase: o.phase });
  const sum = E.summary(o); assert(sum.slept === 7 * 60 && sum.owedAfter === 4 * 60 && sum.sleepyTomorrow, 'summary counts the debt', sum);
}
{ // an early night clears the debt: 2 h owed + 21:00 bedtime (10 h) -> rested
  const e = E.newGame('🦊', 5); e.owed = 120;
  let out; while (e.phase === 'day' && e.time < E.BEDTIME) out = E.perform(e, 'rest');
  assert(E.perform(e, 'bed').ok, 'bed at 21:00', e);
  assert(E.summary(e).owedAfter === 0, 'debt cleared by a 10 h night', E.summary(e));
  E.goToSleep(e); const m = E.wakeUp(e);
  assert(!E.sleepy(e) && m.some(x => x.key === 'restedMorning'), 'rested morning', m);
  assert(E.travelOptions(e).find(t => t.mode === 'walk').minutes === 60, 'walk back to 60 min', e);
}
{ // out at 21:00: sent home (walk), can still stay up; travel is refused at night; an action that would cross midnight is cut short
  const p = E.newGame('🐰', 8); p.day = 2; p.loc = 'park'; p.time = 20 * 60 + 30; p.toys = ['ball'];
  const out = E.perform(p, 'play'); // 20:30 -> 21:30 at the park -> walked home by 22:30
  assert(out.msgs.some(m => m.key === 'late') && p.loc === 'home' && p.time === 22 * 60 + 30 && p.phase === 'day', 'sent home at 21:00 but still awake', p);
  assert(!E.travel(p, 'park', 'walk').ok, 'no travelling at night', p);
  assert(E.destinations(p).find(d => d.id === 'park').night, 'park shows as night', E.destinations(p));
  p.time = 23 * 60 + 30; const toy = E.perform(p, 'toy'); // 60 min, but midnight comes first
  assert(p.time === 24 * 60 && p.phase === 'summary' && toy.msgs.some(m => m.key === 'midnight'), 'play cut short at midnight', p);
}
{ // the bed card is always there at home; extra sleep is a happiness bonus (+1 per full hour beyond what is needed, max +4)
  const b = E.newGame('🐨', 9);
  const bed = () => E.actions(b).find(a => a.id === 'bed');
  assert(bed() && bed().enabled && bed().sleep === 24 * 60 && bed().happy === 4, 'bed card at 7:00: 24 h, bonus capped at +4', bed());
  b.time = 19 * 60; assert(bed().sleep === 12 * 60 && bed().happy === 4, 'bed at 19:00: 12 h, +4', bed());
  b.time = 21 * 60; assert(bed().sleep === 10 * 60 && bed().happy === 2, 'bed at 21:00: 10 h, +2', bed());
  b.time = 23 * 60; assert(bed().sleep === 8 * 60 && bed().happy === 0, 'bed at 23:00: 8 h, no bonus', bed());
  b.time = 19 * 60; b.happy = 3; assert(E.perform(b, 'bed').ok, 'bed at 19:00', b);
  const sum = E.summary(b); assert(sum.bonus === 4 && !sum.sleepyTomorrow, 'summary shows the bonus', sum);
  E.goToSleep(b); const m = E.wakeUp(b);
  assert(b.happy === 10 && m.some(x => x.key === 'sleptExtra' && x.n === 4), 'wake at max(7, 3) + 4 = 10 (capped) with the extra-sleep message', { happy: b.happy, m });
  // owed sleep is paid back first: 2 h owed + 10 h night = nothing extra
  const c = E.newGame('🐸', 10); c.owed = 120; c.time = 21 * 60; c.happy = 2; E.perform(c, 'bed');
  assert(E.summary(c).bonus === 0, 'no bonus while paying back', E.summary(c));
  E.goToSleep(c); const mc = E.wakeUp(c); assert(c.happy === 7 && c.owed === 0 && !mc.some(x => x.key === 'sleptExtra'), 'plain rested morning', { happy: c.happy, mc });
  // sleeping the whole day away is allowed (no coins that day) and still capped at +4
  const d = E.newGame('🐰', 11); d.time = 7 * 60 + 30; E.perform(d, 'bed'); assert(E.summary(d).slept === 23 * 60 + 30 && E.summary(d).bonus === 4, 'all-day sleep', E.summary(d));
}
console.log('ok');
console.log('ALL OK');
