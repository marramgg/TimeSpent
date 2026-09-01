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

  // ===== Child mode =====
  // The child's day is the same clock with different fixed points, and the routine is not a grid of cards to hunt
  // through: the day ASKS, one question at a time, and both answers are real. Yes costs the time it takes; no costs
  // something else, and the "no" button shows what you get instead — a poo for unwashed hands — so the price is a
  // picture rather than a word a five-year-old cannot read.
  // Going to bed by 20:30 buys tomorrow's 7:00 wake-up (and time to play before school); later means 7:30 and a scramble.
  const CHILD_STEP = 15; // a child's routine happens in quarter hours; the adult day still moves in half hours
  const CHILD = {
    wakeEarly: 7 * 60, wakeLate: 7 * 60 + 30, goodBed: 20 * 60 + 30, latestBed: 21 * 60,
    schoolIn: 8 * 60 + 30, schoolOut: 17 * 60 + 30, lunchAt: 12 * 60,
    dinnerFrom: 18 * 60 + 30, walk: 15,
    // You never wake up full: there is always room for the day's routine and play to fill the meters, and never so empty
    // that yesterday sinks today. Health and happiness carry over between these two marks.
    wakeFloor: 2, wakeCeiling: 4,
  };
  // Every question the day asks, in the order it asks them. `tier` is the whole point of asking:
  //   must   — the day cannot go on without it, so "no" is answered with the reason and the question stays.
  //   should — skipping is allowed, takes no time at all, and shows up on a meter there and then.
  // `due` says when the question is ripe; all of them are asked at home, one at a time.
  const CHORE = {
    breakfast: { emoji: '🥣', minutes: 15, tummy: 1, happy: 1, cat: 'eat', msg: 'ateBreakfast', tier: 'should',
                 no: '😫', skipTummy: 2, skipHappy: 1, skipMsg: 'skipBreakfast', due: (s) => s.time < CHILD.lunchAt },
    dress:     { emoji: '👕', minutes: 15, msg: 'gotDressed', tier: 'must',
                 no: '🩲', skipMsg: 'mustDress', due: (s) => s.time < CHILD.lunchAt },
    teethAM:   { emoji: '🪥', minutes: 15, tummy: 1, msg: 'brushedTeeth', tier: 'should',
                 no: '🦠', skipTummy: 1, skipMsg: 'skipTeeth', due: (s) => s.time < CHILD.lunchAt },
    // On a school day lunch is at school; at a weekend it is asked at home, and it is the only weekend-only question.
    lunch:     { emoji: '🍲', minutes: 30, tummy: 1, happy: 1, cat: 'eat', msg: 'ateLunch', tier: 'should',
                 no: '😫', skipTummy: 2, skipMsg: 'skipLunch', weekendOnly: true,
                 due: (s) => s.time >= CHILD.lunchAt && s.time < CHILD.dinnerFrom },
    wash:      { emoji: '🧼', minutes: 15, tummy: 1, msg: 'washedHands', tier: 'should',
                 no: '💩', skipTummy: 1, skipMsg: 'skipWash', due: (s) => s.time >= CHILD.lunchAt && !choreDone(s, 'dinner') },
    tidy:      { emoji: '🧹', minutes: 15, happy: 1, msg: 'tidiedUp', tier: 'should',
                 no: '🌪️', skipHappy: 1, skipMsg: 'skipTidy', due: (s) => s.time >= CHILD.lunchAt && !choreDone(s, 'dinner') },
    dinner:    { emoji: '🍽️', minutes: 30, tummy: 1, happy: 1, cat: 'eat', msg: 'ateDinner', tier: 'should',
                 no: '😫', skipTummy: 2, skipMsg: 'skipDinner', due: (s) => s.time >= CHILD.dinnerFrom },
    bath:      { emoji: '🛁', minutes: 30, tummy: 1, happy: 2, cat: 'play', msg: 'hadBath', tier: 'should',
                 no: '🐴', skipTummy: 1, skipMsg: 'skipBath', bathDayOnly: true, due: (s) => settled(s, 'dinner') },
    teethPM:   { emoji: '🪥', minutes: 15, tummy: 1, msg: 'brushedTeeth', tier: 'should',
                 no: '🦠', skipTummy: 1, skipMsg: 'skipTeeth', due: (s) => settled(s, 'dinner') },
  };

  // One new thing per day, so day 1 is the smallest complete day: wake, eat, work, come home, eat, sleep.
  const PLACES = {
    home:   { emoji: '🏠', unlockDay: 1 },
    bakery: { emoji: '🥖', unlockDay: 1, open: 8 * 60, close: 18 * 60, weekdaysOnly: true, mode: 'adult' },
    school: { emoji: '🏫', unlockDay: 1, open: 8 * 60, close: 17 * 60 + 30, weekdaysOnly: true, mode: 'child' }, // doors open at 8:00; the bell is at 8:30
    shops:  { emoji: '🏬', unlockDay: 2, open: 9 * 60, close: 18 * 60, mode: 'adult' }, // shopping is the grown-up's day; a child's has no coins
    park:   { emoji: '🌳', unlockDay: 3, childUnlockDay: 2 },
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

  // Which game we are playing. Everything below that differs asks these, so adult mode is untouched by child mode.
  const isChild = (s) => s.mode === 'child';
  const stepOf = (s) => isChild(s) ? CHILD_STEP : STEP;
  const slotsOf = (s) => (LATEST_BED - DAY_START) / stepOf(s);
  const bedtimeOf = (s) => isChild(s) ? CHILD.goodBed : BEDTIME;   // when the game says "bed now"
  const latestOf = (s) => isChild(s) ? CHILD.latestBed : LATEST_BED; // when you fall asleep whatever you were doing
  const hungerOf = (s) => isChild(s) ? 0 : HUNGER_PER_STEP; // a child is fed by grown-ups: health moves at meals, not by the clock
  const bathDay = (s) => s.day % 2 === 0;  // a bath every second day
  const choreDone = (s, id) => !!(s.chores && s.chores[id]);
  const choreSkipped = (s, id) => !!(s.skipped && s.skipped[id]);
  const settled = (s, id) => choreDone(s, id) || choreSkipped(s, id); // asked and answered, whichever way
  // Bed by 20:30 means waking at 7:00 with a spare quarter of an hour to play; later means 7:30 and no play before school.
  const wakeAfter = (bedAt) => bedAt <= CHILD.goodBed ? CHILD.wakeEarly : CHILD.wakeLate;

  // The day's plan: where to be, hour by hour (hours may run past 24 for the night block).
  function routine(state) {
    const b = (id, from, to, cat, place, emoji) => ({ id, from, to, cat, place, emoji });
    if (isChild(state)) return childRoutine(state, b);
    const wk = isWeekend(state.day), park = state.day >= PLACES.park.unlockDay, shops = state.day >= PLACES.shops.unlockDay;
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
  // A child's plan. School is one card, but the strip still shows the shape of it — forest, lunch, activities — so the
  // child can see where the day goes and how little of it is theirs.
  function childRoutine(state, b) {
    const wk = isWeekend(state.day), wake = (state.wake || CHILD.wakeEarly) / 60, park = unlocked(state, 'park');
    const day = wk ? [
      b('getReady', wake, 9, 'eat', 'home', '🥣'),
      park ? b('park', 9, 12, 'play', 'park', '🌳') : b('freeHome', 9, 12, 'play', 'home', '🧸'),
      b('lunch', 12, 13, 'eat', 'home', '🍽️'),
      b('freeHome', 13, 18.5, 'play', 'home', '🧸'),
    ] : [
      b('getReady', wake, 8, 'eat', 'home', '🥣'),
      b('goSchool', 8, 8.5, 'travel', 'school', '🚶'),
      b('school', 8.5, 12, 'work', 'school', '🏫'),
      b('lunchSchool', 12, 13, 'eat', 'school', '🍽️'),
      b('activities', 13, 17.5, 'work', 'school', '🎨'),
      b('goHome', 17.5, 17.75, 'travel', 'home', '🚶'),
      b('tidyUp', 17.75, 18.5, 'wait', 'home', '🧼'),
    ];
    day.push(b('dinner', 18.5, 19.5, 'eat', 'home', '🍽️'));
    day.push(bathDay(state) ? b('bath', 19.5, 20.5, 'play', 'home', '🛁') : b('freeHome', 19.5, 20.5, 'play', 'home', '🧸'));
    day.push(b('sleep', 20.5, 31, 'sleep', 'home', '😴'));
    return day;
  }
  const bandAt = (state, time) => routine(state).find(x => time >= x.from * 60 && time < x.to * 60) || null;
  function planHint(state, out) {
    if (state.time >= bedtimeOf(state)) return;
    const band = bandAt(state, state.time); if (!band) return;
    if (state.lastBand === band.id) return;
    state.lastBand = band.id;
    out.msgs.push({ key: 'plan', band: band.id });
  }

  function newGame(avatar, seed, mode) {
    const child = mode === 'child';
    return {
      v: 7, mode: child ? 'child' : 'adult',
      avatar: avatar || '🐻', seed: seed || 12345, // kept for saves and tests; nothing is random any more
      day: 1, time: DAY_START, coins: 2, loc: 'home',
      wake: DAY_START, chores: {}, skipped: {}, // the child's wake-up time today, and how each question was answered
      // The fridge starts with four meals: breakfast and dinner on days 1 and 2, so it runs out exactly when the shops open.
      tummy: 3, happy: child ? 3 : WAKE_HAPPY, fridge: 4, lunchbox: 0,
      wardrobe: {}, toys: [], wish: null, wishReadyTold: false,
      timeline: [], today: freshToday(),
      flags: {}, phase: 'day', msgs: [], lastBand: child ? 'getReady' : 'breakfast',
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
    // A child's night is the same length either way (bed 20:30 → up 7:00, bed 21:00 → up 7:30): a late bed does not cost
    // sleep, it costs the morning. That is the whole lesson, so the bed card shows the wake-up time, not the hours.
    const slept = (isChild(state) ? wakeAfter(bedAt) : DAY_START) + 24 * 60 - bedAt;
    const bonus = Math.min(BONUS_MAX, Math.floor(Math.max(0, slept - SLEEP_NEED) / 60) * BONUS_PER_HOUR);
    return { slept, need: SLEEP_NEED, short: Math.max(0, SLEEP_NEED - slept), bonus };
  }
  const sleepIfBedNow = (state) => nightMath(state, Math.min(state.time, latestOf(state)));

  function isOpen(state, place, at) {
    const p = PLACES[place]; const t = at == null ? state.time : at;
    if (!p) return false;
    if (p.weekdaysOnly && isWeekend(state.day)) return false;
    if (p.open == null) return true;
    return t >= p.open && t < p.close;
  }
  const unlockDayOf = (state, place) => (isChild(state) && PLACES[place].childUnlockDay) || PLACES[place].unlockDay;
  const unlocked = (state, place) => {
    const p = PLACES[place];
    if (p.mode && p.mode !== (isChild(state) ? 'child' : 'adult')) return false; // the bakery is the grown-up's, school is the child's
    return state.day >= unlockDayOf(state, place);
  };
  const stallOpen = (state, stall) => state.day >= STALL_UNLOCK[stall];
  const shiftAt = (time) => SHIFTS.find(s => time >= s.start && time < s.end) || null;
  const nextShift = (time) => SHIFTS.find(s => s.start > time) || null;

  // ---- time & needs ----
  function advance(state, minutes, cat, out) {
    const from = state.time, step = stepOf(state), slots = slotsOf(state), last = latestOf(state), hunger = hungerOf(state);
    for (let i = 0; i < minutes / step; i++) {
      if (state.time >= last) break; // too late: whatever we were doing, we fall asleep
      const slot = (state.time - DAY_START) / step;
      if (slot >= 0 && slot < slots) state.timeline[slot] = cat;
      state.time += step;
      state.tummy = clamp(state.tummy - hunger, 0, TUMMY_MAX);
    }
    out.steps.push({ cat, from, to: state.time });
  }
  // With an empty tummy, an empty fridge and no way to buy food, the only way out is sleeping — so say that, instead of
  // "eat first", which would be advice for something the player cannot do.
  function foodTrapped(state) {
    if (isChild(state)) return false; // in child mode meals are the grown-ups' job — there is always something to eat
    if (state.tummy > 0 || state.fridge > 0 || state.lunchbox) return false;
    const canBuyFood = stallOpen(state, 'food') && state.coins >= ITEMS.meals.price;
    const canEatOut = state.coins >= 2; // the café or the restaurant
    return !canBuyFood && !canEatOut;
  }
  function needHints(state, out) {
    if (state.time >= bedtimeOf(state) && !state.flags.hBedtime) return; // the bedtime message takes over this once
    let hinted = false;
    if (isChild(state)) { // one body meter, called health: it only says something when it is getting low
      if (state.tummy <= 2 && !state.flags.hLowHealth) { out.msgs.push({ key: 'lowHealth' }); state.flags.hLowHealth = true; hinted = true; }
      if (!hinted && state.happy <= 1 && !state.flags.hBored) { out.msgs.push({ key: 'bored' }); state.flags.hBored = true; hinted = true; }
      if (!hinted && state.wish && state.coins >= ITEMS[state.wish].price && !state.wishReadyTold) {
        out.msgs.push({ key: 'wishReady', item: state.wish }); state.wishReadyTold = true;
      }
      return;
    }
    if (foodTrapped(state) && !state.flags.hNoFood) { out.msgs.push({ key: 'nothingToEat' }); state.flags.hNoFood = true; hinted = true; }
    else if (state.tummy <= 0 && !state.flags.hStarving) { out.msgs.push({ key: 'starving' }); state.flags.hStarving = true; hinted = true; }
    else if (state.tummy <= 1 && state.tummy > 0 && !state.flags.hHungry) { out.msgs.push({ key: 'hungry' }); state.flags.hHungry = true; hinted = true; }
    if (!hinted && state.happy <= 0 && !state.flags.hSad) { out.msgs.push({ key: 'tooSad' }); state.flags.hSad = true; hinted = true; }
    else if (!hinted && state.happy <= 1 && state.happy > 0 && !state.flags.hBored) { out.msgs.push({ key: 'bored' }); state.flags.hBored = true; hinted = true; }
    if (!hinted && state.wish && state.coins >= ITEMS[state.wish].price && !state.wishReadyTold) {
      out.msgs.push({ key: 'wishReady', item: state.wish }); state.wishReadyTold = true;
    }
  }
  function ate(state, amount) { state.tummy = clamp(state.tummy + amount, 0, TUMMY_MAX); state.flags.hHungry = false; state.flags.hStarving = false; state.flags.hNoFood = false; if (amount > 0) state.flags.hLowHealth = false; }
  function cheer(state, amount) { state.happy = clamp(state.happy + amount, 0, HAPPY_MAX); if (amount > 0) { state.flags.hBored = false; state.flags.hSad = false; } }
  function pay(state, n, out) { state.coins -= n; state.today.spent += n; state.totals.spent += n; out.coins -= n; }
  function earn(state, n, out) { if (!n) return; state.coins += n; state.today.earned += n; state.totals.earned += n; out.coins += n; }

  const walkMin = (state) => isChild(state) ? CHILD.walk : TRAVEL.walk.min; // a child's world is close by: everything is a short walk
  function fallAsleep(state, out, key) { // the day is over
    out.msgs = out.msgs.filter(m => m.key !== 'rested');
    out.msgs.push({ key });
    state.bedAt = Math.min(state.time, latestOf(state));
    if (isChild(state)) out.msgs.push({ key: state.bedAt <= CHILD.goodBed ? 'bedEarly' : 'bedLate', t: wakeAfter(state.bedAt) });
    state.phase = 'summary'; out.bedtime = true;
  }
  function checkBedtime(state, out) {
    if (state.phase !== 'day') return;
    if (state.time >= bedtimeOf(state) && !state.flags.hBedtime) { // bedtime, but staying up a little is allowed (at home)
      state.flags.hBedtime = true;
      out.msgs = out.msgs.filter(m => m.key !== 'rested');
      if (state.loc !== 'home') { out.msgs.push({ key: 'late' }); advance(state, walkMin(state), 'travel', out); state.loc = 'home'; }
      else out.msgs.push({ key: 'bedtime' });
    }
    if (state.time >= latestOf(state)) fallAsleep(state, out, isChild(state) ? 'tooLate' : 'midnight');
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
    if (isChild(s)) return childActions(s, list, add);

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

  // What the day is asking right now, or null when the child is free to choose. One at a time, always at home, in the
  // order the questions are written above.
  function question(state) {
    if (!isChild(state) || state.phase !== 'day' || state.loc !== 'home') return null;
    for (const id of Object.keys(CHORE)) {
      const c = CHORE[id];
      if (settled(state, id)) continue;
      if (c.weekendOnly && !isWeekend(state.day)) continue;
      if (c.bathDayOnly && !bathDay(state)) continue;
      if (!c.due(state)) continue;
      return { id, emoji: c.emoji, yes: c.emoji, no: c.no, tier: c.tier, minutes: c.minutes,
               tummy: c.tummy || 0, happy: c.happy || 0, skipTummy: c.skipTummy || 0, skipHappy: c.skipHappy || 0 };
    }
    // Bedtime is a question too, and the only one whose "no" costs tomorrow morning rather than a meter.
    if (state.time >= CHILD.goodBed && !settled(state, 'bed')) {
      const n = nightMath(state, state.time);
      return { id: 'bed', emoji: '🛏️', yes: '🛏️', no: '🦉', tier: 'choice', minutes: 0,
               tummy: 0, happy: 0, skipTummy: 0, skipHappy: 0, sleep: n.slept, wake: wakeAfter(state.time) };
    }
    return null;
  }

  function answer(state, id, yes) {
    const out = { ok: false, msgs: [], steps: [], coins: 0, bedtime: false };
    const q = question(state);
    if (!q || q.id !== id) return out;
    if (id === 'bed') {
      out.ok = true;
      if (yes) { fallAsleep(state, out, 'goBed'); return out; }
      state.skipped.bed = true; // staying up: the day runs on to 21:00 and tomorrow starts half an hour late
      out.msgs.push({ key: 'stayedUp', t: CHILD.wakeLate });
      return out;
    }
    const c = CHORE[id];
    if (!yes && c.tier === 'must') { out.msgs.push({ key: c.skipMsg }); return out; } // the question stays; nothing moves
    out.ok = true;
    if (yes) choreOut(state, id, out);
    else { // saying no costs no time at all — that is exactly why it is tempting, and why it shows on a meter
      state.skipped[id] = true;
      if (c.skipTummy) state.tummy = clamp(state.tummy - c.skipTummy, 0, TUMMY_MAX);
      if (c.skipHappy) state.happy = clamp(state.happy - c.skipHappy, 0, HAPPY_MAX);
      out.msgs.push({ key: c.skipMsg });
    }
    needHints(state, out);
    planHint(state, out);
    checkBedtime(state, out);
    return out;
  }

  // The child's cards. Every bit of the routine is a card the child presses — that is the whole point: the routine costs
  // time, and the time it costs is time not spent playing. Skipping one is allowed, and says so at the moment it bites.
  // The child's cards: only the free choices. While the day is asking something there are no cards at all — one thing on
  // screen at a time, and the question is that thing.
  function childActions(s, list, add) {
    const wk = isWeekend(s.day), openNow = isOpen(s, s.loc);
    if (question(s)) return list;
    const unwell = s.tummy <= 0 ? { key: 'lowHealth' } : null; // too poorly to play — eating and resting are what is left
    const closedMsg = () => PLACES[s.loc].weekdaysOnly && wk ? { key: 'closedToday', place: s.loc } : { key: 'closed', place: s.loc, t: PLACES[s.loc].open };

    if (s.loc === 'home') add({ id: 'playHome', emoji: '\u{1F9F8}', cat: 'play', minutes: 15, happy: 1, enabled: !unwell, why: unwell });
    if (s.loc === 'school') { // school is one card: it is not a child's to spend
      const minutes = Math.max(0, CHILD.schoolOut - s.time);
      add({ id: 'school', emoji: '\u{1F3EB}', cat: 'work', minutes, until: CHILD.schoolOut, tummy: 1, happy: 1, // lunch and friends
            enabled: openNow && minutes > 0, why: !openNow ? closedMsg() : { key: 'schoolOver' } });
    }
    if (s.loc === 'park') add({ id: 'play', emoji: '\u{1F6DD}', cat: 'play', minutes: 30, happy: 2, enabled: !unwell, why: unwell });
    // There must always be a card a child can press: school is over, or we feel too poorly to play.
    if (!list.some(a => a.enabled)) add({ id: 'rest', emoji: '\u{1F60C}', cat: 'wait', minutes: 15 });
    return list;
  }

  // The routine's consequences, said as cause and effect at the moment they land.
  function choreOut(state, id, out) {
    const c = CHORE[id];
    state.chores[id] = true;
    advance(state, c.minutes, c.cat || 'wait', out);
    if (c.tummy) ate(state, c.tummy);
    if (c.happy) cheer(state, c.happy);
    out.msgs.push({ key: c.msg });
    return out;
  }

  function perform(state, id) {
    const out = { ok: false, msgs: [], steps: [], coins: 0, bedtime: false };
    if (state.phase !== 'day') return out;
    if (isChild(state) && question(state)) { out.msgs.push({ key: 'answerFirst' }); return out; }
    const a = actions(state).find(x => x.id === id);
    if (!a || !a.enabled) { if (a && a.why) out.msgs.push(a.why); return out; }
    out.ok = true;
    const go = (cat) => advance(state, a.minutes, cat, out);
    switch (id) {
      case 'playHome': go('play'); cheer(state, 1); out.msgs.push({ key: 'played' }); break;
      case 'school': {
        advance(state, a.minutes, 'work', out); ate(state, a.tummy); cheer(state, a.happy);
        out.msgs.push({ key: state.flags.firstSchool ? 'school' : 'schoolFirst', t: CHILD.schoolOut });
        state.flags.firstSchool = true; break;
      }
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
    if (isChild(state)) return [{ mode: 'walk', emoji: '🚶', minutes: CHILD.walk, cost: 0, enabled: true, why: null }]; // everything is a short walk away
    return Object.keys(TRAVEL).map(mode => {
      const t = TRAVEL[mode];
      const owned = !t.needs || state.toys.includes(t.needs);
      return { mode, emoji: t.emoji, minutes: t.min, cost: t.cost, enabled: owned && state.coins >= t.cost,
               hidden: !owned || state.day < t.unlockDay, why: state.coins < t.cost ? { key: 'notEnough', n: t.cost - state.coins } : null };
    }).filter(o => !o.hidden);
  }
  const isNight = (state) => state.time >= bedtimeOf(state); // after bedtime we stay home
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
    if (isChild(state) && question(state)) { out.msgs.push({ key: 'answerFirst' }); return out; }
    const opt = travelOptions(state).find(o => o.mode === mode);
    if (!opt || !opt.enabled) { if (opt && opt.why) out.msgs.push(opt.why); return out; }
    out.ok = true;
    if (opt.cost) pay(state, opt.cost, out);
    advance(state, opt.minutes, 'travel', out);
    state.loc = dest;
    out.msgs.push({ key: 'arrived', place: dest });
    if (isChild(state) && dest === 'school') schoolArrival(state, out);
    if (mode === 'bike' && !state.flags.bikeTold) { out.msgs.push({ key: 'bikeTravel' }); state.flags.bikeTold = true; }
    needHints(state, out);
    planHint(state, out);
    checkBedtime(state, out);
    return out;
  }

  // Skipping is paid for the moment it is answered, so the school gate only judges the clock: early enough to dawdle on
  // the way, or late for the bell.
  function schoolArrival(state, out) {
    if (state.flags.schoolToday) return;
    state.flags.schoolToday = true;
    if (state.time > CHILD.schoolIn) { state.happy = clamp(state.happy - 1, 0, HAPPY_MAX); out.msgs.push({ key: 'lateSchool', t: state.time }); }
    else if (state.time < CHILD.schoolIn) { cheer(state, 1); out.msgs.push({ key: 'playedOnWay' }); } // left early: a slow walk with time to play
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
    const byCat = {}, step = stepOf(state); state.timeline.forEach(c => { if (c) byCat[c] = (byCat[c] || 0) + step; });
    const bedAt = state.bedAt == null ? bedtimeOf(state) : state.bedAt, n = nightMath(state, bedAt);
    byCat.sleep = n.slept;
    return { day: state.day, weekday: weekday(state.day), earned: state.today.earned, spent: state.today.spent,
             kept: state.today.earned - state.today.spent, wallet: state.coins, byCat,
             timeline: state.timeline.slice(0, slotsOf(state)),
             bedAt, slept: n.slept, short: n.short, bonus: n.bonus, wake: isChild(state) ? wakeAfter(bedAt) : DAY_START };
  }
  function goToSleep(state) { // summary -> night
    if (state.phase !== 'summary') return false;
    if (state.bedAt == null) state.bedAt = Math.min(Math.max(state.time, bedtimeOf(state)), latestOf(state));
    const n = nightMath(state, state.bedAt);
    state.slept = n.slept; state.sleepBonus = n.bonus;
    // A child gets no happiness bonus for a long night — the reward for going to bed on time is tomorrow morning itself.
    if (isChild(state)) { state.wakeNext = wakeAfter(state.bedAt); state.sleepBonus = 0; }
    state.phase = 'night'; return true;
  }
  function wakeUp(state) { // night -> new day
    if (state.phase !== 'night') return null;
    const child = isChild(state);
    state.day += 1; state.time = DAY_START; state.loc = 'home';
    const bonus = state.sleepBonus || 0; state.sleepBonus = 0;
    if (!child) state.tummy = WAKE_TUMMY;
    state.happy = clamp(Math.max(WAKE_HAPPY, state.happy) + bonus, 0, HAPPY_MAX); // extra sleep = happier morning
    state.timeline = []; state.today = freshToday(); state.lunchbox = 0; state.bedAt = null;
    state.flags.hHungry = state.flags.hStarving = state.flags.hBored = state.flags.hSad = state.flags.hNoFood = false;
    state.flags.hBedtime = false;
    if (child) { // last night decides this morning: bed by 20:30 wakes at 7:00, later at 7:30 — the day bar shows the difference
      state.wake = state.wakeNext || CHILD.wakeEarly; state.wakeNext = null; state.time = state.wake;
      const step = stepOf(state);
      for (let i = 0; i < (state.wake - DAY_START) / step; i++) state.timeline[i] = 'sleep';
      state.chores = {}; state.skipped = {}; state.flags.schoolToday = false; state.flags.hLowHealth = false; state.flags.firstSchool = state.flags.firstSchool;
      state.tummy = clamp(state.tummy, CHILD.wakeFloor, CHILD.wakeCeiling); // yesterday carries over, between a floor and a ceiling
      state.happy = clamp(state.happy, CHILD.wakeFloor + 1, CHILD.wakeCeiling);
    }
    state.phase = 'day';
    const msgs = [{ key: 'morning', day: state.day }];
    if (child) msgs.push({ key: state.wake <= CHILD.wakeEarly ? 'wokeEarly' : 'wokeLate', t: state.wake });
    if (isWeekend(state.day)) msgs.push({ key: 'weekendMorning' });
    if (state.day === unlockDayOf(state, 'shops')) msgs.push({ key: 'newShops' });
    if (state.day === unlockDayOf(state, 'park')) msgs.push({ key: 'newPark' });
    if (state.day === STALL_UNLOCK.toys) msgs.push({ key: 'newToys' });
    if (bonus > 0) msgs.push({ key: 'sleptExtra', n: bonus });
    const first = routine(state)[0].id; state.lastBand = first; msgs.push({ key: 'plan', band: first });
    return msgs;
  }

  return { DAY_START, BEDTIME, LATEST_BED, SLEEP_NEED, BONUS_PER_HOUR, BONUS_MAX, STEP, SLOTS, TUMMY_MAX, HAPPY_MAX, PLACES, TRAVEL, ITEMS, CAT_COLORS, STALL_UNLOCK, LUNCHBOX_FROM, FRIDGE_MAX, LUNCH_FROM, LUNCH_TO, WORK_PAY, SHIFTS, HUNGER_PER_STEP,
           CHILD, CHILD_STEP, CHORE, isChild, stepOf, slotsOf, bedtimeOf, latestOf, hungerOf, bathDay, choreDone, choreSkipped, wakeAfter, walkMin, question, answer,
           newGame, timeInfo, isOpen, isWeekend, weekday, unlocked, stallOpen, actions, perform, travelOptions, destinations,
           travel, catalogue, buy, setWish, summary, goToSleep, wakeUp, routine, bandAt, shiftAt, nightMath, foodTrapped, isNight };
})();
if (typeof module !== 'undefined') module.exports = TSEngine;
