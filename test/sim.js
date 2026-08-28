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

// A child-like sensible policy: eat when hungry, work when open, play when sad, shop for food when fridge empty, sleep at 20:00.
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
  if (has('bed')) return { type: 'act', id: 'bed' };
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
console.log('ALL OK');
