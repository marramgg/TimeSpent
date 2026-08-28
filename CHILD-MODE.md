# Child mode — design options (brainstorm, not decided yet)

A second way to play TimeSpent: **the same day, seen from a 5-year-old's side of it**. The grown-up game is
about earning and spending coins; the child game is about spending *hours*. Nothing here is built yet —
this is the menu of options with a recommendation for each, so we can pick before touching `src/`.

## The one thing it has to teach

> If I play for a long time in the evening, I go to bed late, I sleep less, and tomorrow I am slow and late for school.

Everything below is judged on whether it makes that loop **visible before the choice** and **felt the next morning**.

## The day

| | |
|---|---|
| 7:00 | Wake up |
| 7:00–8:00 | Get dressed · breakfast — exactly two half-hours, exactly the time you have |
| 8:00 | Leave for school (30 m) |
| 8:30–17:30 | School — one tap, no choices |
| 18:00 | Home |
| **18:00–21:00** | **The evening — six half-hours, and this is the whole game** |
| 19:00 | Dinner on the plan strip (you may eat later; it costs you) |
| 21:00 | Bedtime → 10 h. Under 10 h makes tomorrow a sleepy day. Lights out at 22:00 |

Weekend: no school, so the whole day is the evening — a big purse of hours instead of a small one.

## The core loop: hours are the coins

The grown-up game has a coin purse. The child game has a **time purse**, and it is already drawn on
screen — the 24 h day bar. In child mode the night block at the end of the bar is the score: every action
eats into it from the left, and the bar shows the night getting shorter as you choose. No new widget, no
new concept, and the preview we already have (dashed finish marker, "this is what it costs") does the
teaching for free.

**The evening, in half-hour tiles — the same 30 m step as today:**

| Must do | Time | | Can do | Time |
|---|---|---|---|---|
| Dinner | 30 m | | Play | 30 m each |
| Bath | 30 m | | Snack | 30 m |
| Pyjamas & teeth | 30 m | | | |
| Tidy up — only if you played | 30 m | | | |

Six half-hours between coming home and bedtime. Three of them are spoken for, so **three are yours**:

- **play · play · tidy up** → in bed at 21:00. Ten hours, and the story gets read. The perfect evening,
  and it spends every single tile.
- **play · play · play · tidy up** → in bed at 21:30. Nine and a half hours, no story, slow tomorrow.
- **nothing** → in bed at 19:30 with eleven and a half hours and no stars. Allowed, and dull, which is
  the point: the game is not "do your chores", it is "you have three half-hours, spend them well".

Note what the tidy-up does to the arithmetic: the *first* play costs two tiles, every play after it costs
one. Playing twice is cheaper per go than playing once. That is a real thing about time, and a five-year-old
can find it on their fingers.

### The mess mechanic (recommended, and the part I like most)

Every **Play** drops a mess token on the screen. **Tidy up** clears them all in one 30 m tile, so the cost
above falls out of the rules rather than being a rule of its own. Go to bed with a mess still out and
tomorrow's *get dressed* takes an extra half-hour — you cannot find your shoes — and you are late for
school. Two feedback loops, both true to life, neither of them a telling-off.

### Sleepy tomorrow

Reuse the sleep-debt engine exactly as it stands, with child numbers: need **10 h**, and the slowed
categories take 30 m longer. Getting dressed and tidying are slowed; eating is not. So a sleepy morning is
dressed (60 m) + breakfast (30 m) = 90 m against the 60 m you have: you leave at 8:30, arrive at 9:00, and
school has started without you. **The evening's choice is felt the next morning, inside the same sitting.**

## Decisions to make (options, and what I'd pick)

**1. How you choose the mode.**
(a) Two picture buttons on the start screen next to the avatars — 🎒 kid day / 💼 grown-up day, separate
save slots so both keep their own progress. (b) One save, a switch in grown-up settings. (c) Child mode as
day 0 of the grown-up game, graduating after a week.
→ **(a).** Marcos's son picks a backpack; nothing else changes. Keep `timespent.save.v1` for the grown-up
game and add `timespent.save.kid.v1`, with `state.mode` inside the save too.

**2. What replaces Tummy / Happy / Food / Coins.**
(a) Nothing — day bar and the to-do list only. (b) One meter: 🌙 tonight's sleep, drawn as moons.
(c) 🌙 sleep + ⭐ stars earned by playing and by the story.
→ **(c), with the night shown on the day bar rather than as a second meter.** Without something to *want*,
the optimal play is chores-then-bed at 19:30, which teaches the wrong thing. Stars make fun worth
something, so the child has a genuine trade-off instead of an obedience test. Two cells where four are now:
✅ today's list, ⭐ stars.

**3. Are the chores skippable?**
(a) Hard-gated: no bed until bath + pyjamas are done. (b) Free: skip anything, and the summary just
shows what was missed. (c) Required, but *when* is yours — you can do them at 21:30 if you would rather
play first, and pay for it in sleep.
→ **(c).** The choice a child actually has is the order, not the existence, of a bath. It also keeps the
game honest: there is no move that is simply "wrong", only moves that cost more than others.

**4. School.**
(a) One tap, fast-forward, day bar fills with the school colour. (b) Choices inside school (lunch,
playtime). (c) One tap plus three read-aloud postcards — lessons, lunch, playground.
→ **(c).** Agency stays in the morning and the evening; the postcards make ten hours feel like something
rather than a skip, and they carry the "most of your day is already spoken for" point.

**5. Money.**
(a) None at all. (b) Pocket money for chores, a tiny 3-toy shop. (c) Coins visible but unspendable.
→ **(a) for v1.** The grown-up game already teaches money; this one is about time, and a five-year-old
learning two currencies at once learns neither. (b) is a good later unlock, and the natural bridge into
the grown-up mode.

**6. The bedtime story.**
(a) A 30 m tile you choose, competing with play. (b) Free, and it happens automatically when you are in
bed by 21:00 — a reward for the bedtime, not another thing to buy. (c) Free, and it advances one chapter
of a longer story per on-time night.
→ **(c).** Making the story compete with play is the wrong lesson — it turns the reward for going to bed
into a reason not to. Free-at-bedtime makes an on-time night *feel* like the win, and the chapter gives it
a reason that is not "because I was told". Missing it is a real loss with nobody being cross.

**7. Time step.**
(a) Keep 30 m, so every task is one or two tiles. (b) Drop to 15 m for the child, so the morning can hold
four small tasks (dressed, breakfast, teeth, bag).
→ **(a).** Half hours read cleanly on the clock face, and "half past" is worth teaching by itself. The
morning becomes two big tiles instead of four small ones, which is easier at five, not harder.

**8. Code shape.**
(a) One engine, `state.mode` branches inside `actions()` / `routine()`. (b) A second `engine-kid.js`.
(c) Data-driven: a `MODES` table of routine bands, task lists and meters that both modes fill in.
→ **(a) now, written so it can become (c).** Put the child's evening in a `TASKS` table rather than more
`if` branches, keep the shared machinery (advance, nightMath, sleepy, travel, day bar) untouched, and only
`actions()`, `routine()` and the meter row learn about the mode.

## What a first PR would contain

1. Start screen: 🎒 / 💼 picker, own save slot, `state.mode`, `state.v` bump + `migrate()`.
2. `routine()` for the child weekday, and the school fast-forward with postcards.
3. The evening `TASKS` table, the to-do strip, stars, and the night block on the day bar.
4. Child sleep numbers (need 10 h, bedtime 21:00, lights out 22:00) reusing `nightMath` / sleepy day.
5. EN + PT-PT strings for everything, all read aloud. `test/sim.js` plays a good evening and a late one.

Mess/tidy, the story chapters and the weekend day are each their own follow-up PR.

## Still open

- Does the son want to *be* the child, or to be the grown-up looking after a child? (A "get your kid to
  school on time" framing is a different, also interesting game — say the word and I will sketch it.)
- Should the two modes share the avatar and the toys already bought, or be completely separate worlds?
- Is the school postcard sequence worth the build, or is a plain fast-forward enough for the first try?
