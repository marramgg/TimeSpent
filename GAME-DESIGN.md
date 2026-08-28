# TimeSpent — game design (v5)

A day is one turn. Wake at 7:00, bedtime at 21:00 — but you may stay up at home until midnight. Every action costs
time (clock, sun and the 24 h bar move) and many cost or earn coins.

**Press and hold any card and it tells you what it does**, in words, before anything happens — let go and nothing
happens; a quick tap plays it. Holding also previews the change: the finish time on the day bar (dashed marker) and
the meters, with gains hatched and losses pulsing red. An action that only spent time can be taken back with
"Oops, go back" for a few seconds afterwards.

The whole game is aimed at a five-year-old who may not read yet: the voice carries the buttons, one message is on
screen at a time, and each card shows at most two things — how long it takes, and the one thing it changes most.

## What it teaches
- **Time is finite**: a 24 h bar (7:00 to 7:00) fills hour by hour; the hours after 21:00 are tinted "late", the night
  from the real bedtime is dark. Under it, a plan strip shows where to be when; the character nudges at each change
  ("Morning shift!"). Tapping the bar reads out what is happening now.
- **Money**: 1 hour of work = 1 coin. Needs (food, bus) and wants (toys, shows) cost coins. No work at weekends, so
  saving matters. A wish is picked at the toy stall and saved up for over several days.
- **A working day**: two shifts, 9:00–13:00 and 13:30–17:30, each worked with ONE tap ("Work until 1 o'clock").
  Turning up late simply means a shorter shift and fewer coins — there is no extra fine. Lunch break 13:00–13:30:
  the packed lunchbox is free, the bakery café costs 2 coins.

## One new thing a day
Day 1 is the smallest complete day — wake, eat, walk to the bakery, work, walk home, eat, sleep — so nothing has to
be explained at once. Each following day opens exactly one thing, and the fridge is stocked to run out just as the
shops appear.

| Day | What opens |
|---|---|
| 1 | Home and the bakery. Walking. Four meals in the fridge (breakfast + dinner for two days) |
| 2 | The shops (food stall) · the bus · packing a lunchbox |
| 3 | The park |
| 4 | The toy stall, wishes, and the puppet show |

## Weekday plan
7:00 breakfast (30 m) · 7:30 pack lunchbox (30 m, from day 2) · 8:00 go to work · 9–13 morning shift (+4) ·
13–13:30 lunch · 13:30–17:30 afternoon shift (+4) · 17:30 go home · 18:30 dinner · 19–21 free time · 21:00 sleep.
Weekend: no work — breakfast, free play, park, lunch, shops, park, dinner, free time.

## Places (a row of tiles; tap one to travel: walk 1 h free · bus 30 m 1 coin, from day 2 · bike 30 m free once owned)
When there is only one way to travel, tapping a place just goes there — no "how?" question with one answer.

| Place | Open | Actions |
|---|---|---|
| Home | always | Cook & eat (30 m, 1 fridge meal, tummy +4, happy +1), Pack a lunchbox (30 m, 1 meal, weekdays from day 2), Play with a toy (1 h, happy +1), Go to bed (any time — the card shows the night's length and the happiness bonus) |
| Bakery | 8–18 Mon–Fri | Work until the end of the shift (1 coin/h), Lunch at the café (30 m, 2 coins, tummy +4, happy +1) |
| Shops | 9–18 daily | Food basket (6 meals / 5 coins, fridge holds 20), Restaurant (30 m, 2 coins, tummy +4, happy +1), Toys: party hat 2, ball 3, teddy 5, kite 8, bike 12, train 20 + "I wish" |
| Park | always | Play (1 h, free, happy +2), Ice cream (30 m, 1 coin, +1/+1), Puppet show (1 h, 2 coins, happy +3) |

Anywhere: Rest (30 m, happy +1) · Eat my lunchbox if packed (30 m, free, tummy +4, happy +1).

## Meters (🍎 Tummy, 😊 Happy, 🧺 Food, 🪙 Coins)
Tummy and Happy share one **0–6** scale, so "+1" means the same thing wherever it appears.

- **Tummy 0–6**: −1 every 2 h; meals +4; at 0 nothing but eating. Wake at 2.
- **Happy 0–6**: work −1 per shift; meals and resting +1, play +1/+2, show +3, new toy +2. At 0 you can't work.
  Wake with at least 4.
- **Food (fridge) 0–20**: shown as apples (breakfast, lunchbox and dinner each use one).

### Nothing to eat is never a dead end
With an empty tummy, an empty fridge and no coins, work is blocked, so no coins can be earned and no food bought.
Sleeping is the only way out (waking resets the tummy), so the game says exactly that — *"There is nothing to eat.
Let's sleep — tomorrow I can work again."* — and the bed card glows. It never tells a child to eat when they cannot.

## Sleep
- Bedtime is 21:00: the character says so, and if you are out you are walked home. You can still play, rest or eat at
  home; nothing else is open at night. At midnight you fall asleep whatever you were doing.
- At home you can go to bed at any time (sleeping a workday away just earns no coins). Wake-up is always 7:00, so the
  night is 7:00 minus bedtime: 19:00 = 12 h, 21:00 = 10 h, 23:00 = 8 h, midnight = 7 h.
- **Sleeping longer than the 8 h needed is a bonus**: +1 happy at wake-up per full extra hour, up to +2. Bed at 21:00
  → +2, at 23:00 → nothing. A short night is just a short night — nothing is carried into the next day.

## Night
"Go to bed" or midnight → day summary (24 h bar vs plan with the real night, hours per activity, earned/spent/kept,
tonight's sleep) → sleep animation (clock spins from bedtime to 7:00) → new morning.

## Look
Picture-book wooden-toy world: sky dome with a travelling sun, chunky outlined cards, coins and apples as countable
icons, mini clock discs for durations (1 disc = 1 h). Fredoka + Nunito. EN and PT-PT, everything read aloud.
The clock is **12 h by default** — the big face only has 1–12 on it. Hold ⚙️ for grown-up settings.

## Deliberately not in the game
Cut because each cost a five-year-old more understanding than it taught: **sleep debt and sleepy days** (a slowdown
carried between days), **weather and the wardrobe** (rain/cold, raincoat/jacket), and the **late-for-work fine**
(a shorter shift already teaches it, as a consequence rather than a punishment).
