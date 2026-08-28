# TimeSpent — game design (v4)

A day is one turn. Wake at 7:00, bedtime at 21:00 — but you may stay up at home until midnight, and a short night makes the next day slow (see Sleep). Every action costs time (clock, sun and the 24 h bar move) and many cost or earn coins. Hovering or pressing a card previews everything it would change: the time on the day bar (dashed marker = finish time) and the four state cells — Tummy, Happy, Food and Coins — showing gains hatched and losses pulsing red.

## What it teaches
- Time is finite: a 24 h bar (7:00 to 7:00) fills hour by hour; the hours after 21:00 are tinted "late", the night from the real bedtime is dark. Under it, a plan strip shows where to be when; the character nudges at each change ("Morning shift!", "Lunch break!"). Tapping a band reads it aloud.
- Money: 1 hour of work = 1 coin. Needs (food, bus, clothes) and wants (toys, shows) cost coins. No work at weekends, so saving matters.
- A working day: two shifts, 9:00–13:00 and 13:30–17:30, each worked with ONE tap ("Work until 13:00"). Arriving late = 1 coin less and −1 happy (shown on the button). Lunch break 13:00–13:30: the packed lunchbox is free, the bakery café costs 2 coins.

## Weekday plan
7:00 breakfast (30 m) · 7:30 pack lunchbox (30 m) · 8:00 go to work · 9–13 morning shift (+4) · 13–13:30 lunch · 13:30–17:30 afternoon shift (+4) · 17:30 go home · 18:30 dinner · 19–21 free time (play/rest) · 21:00 sleep (10 h until 7:00).
Weekend: no work — breakfast, free play, park, lunch, shops, park, dinner, free time.

## Places (always visible as a row; tap one to travel: walk 1 h free · bus 30 m 1 coin · bike 30 m free once owned)
| Place | Open | Actions |
|---|---|---|
| Home | always | Cook & eat (30 m, 1 fridge meal, tummy +4, happy +1), Pack a lunchbox (30 m, 1 meal, weekdays), Play with a toy (1 h, happy +2), Go to bed (any time — the card shows the night's length and the happiness bonus) |
| Work · the bakery | 8–18 Mon–Fri | Work until the end of the shift (1 coin/h, −1 coin & −1 happy if late), Lunch at the café (30 m, 2 coins, tummy +4, happy +1) |
| Shops | 9–18 daily | Food basket (6 meals / 5 coins, fridge holds 12), Restaurant (30 m, 2 coins, tummy +4, happy +1), Clothes (raincoat 3, jacket 4, party hat 2), Toys (ball 3, teddy 5, kite 8, bike 12, train 20) + "I wish" |
| Park | always | Play (1 h, free, happy +3), Ice cream (30 m, 1 coin, +1/+1), Puppet show (1 h, 2 coins, happy +4) |
Anywhere: Rest (30 m, happy +1) · Eat my lunchbox if packed (30 m, free, tummy +4, happy +1).

## Meters (four labelled cells: 🍎 Tummy, 😊 Happy, 🧺 Food, 🪙 Coins — card chips list effects in that order, and only decreases are highlighted red)
- Tummy 0–6: −1 every 2 h; meals +4; at 0 nothing but eating. Wake at 2.
- Happy 0–10: work −0.5/h (a shift ≈ −2), late −1, wet/cold without the right clothes −2; meals and resting +1, play +2/+3, show +4, new toy +2. At 0 you can't work. Wake with at least 7.
- Food (fridge) 0–20: shown as apples (breakfast, lunchbox and dinner each use one) — buy the 6-meal basket before it runs out.

## Unlocks & weather
Day 1: Home, Work, Shops (food). Day 2: Park. Day 3: toys + wishes + puppet show. Day 4+: clothes stall, weather (forecast the evening before; rain needs the raincoat, cold the jacket — bus keeps you dry).

## Sleep
- Bedtime is 21:00: the character nudges ("Bedtime! If I stay up late, tomorrow I'll be sleepy and slow"), and if you are out you are walked home. You can still play, rest or eat at home; nothing else is open at night. A second nudge at 23:00 ("Bed now, or I'll sleep less than 8 hours"); at midnight you fall asleep whatever you were doing.
- At home you can go to bed at any time (sleeping a workday away just earns no coins). Wake-up is always 7:00, so the night is 7:00 minus bedtime: 19:00 = 12 h, 21:00 = 10 h, 23:00 = 8 h, midnight = 7 h. The bed card shows the night's length (red when it is under 8 h).
- Fewer than 8 h → a **sleepy day**: 🥱 in the top bar, 💤 on the character, and going places, playing and shopping take half an hour longer (a purple ½ h disc on the card). Eating, resting and the fixed work shifts are not slowed. Walking to work now arrives at 9:30 — late — unless you take the bus (still on time) or skip something.
- Missing sleep is owed: tonight you need 8 h plus what you owe (the morning message says "in bed by …"). A normal 21:00 night (10 h) pays back up to 2 h; an earlier bedtime pays back more. Late nights in a row add up.
- Extra sleep is a bonus: every full hour beyond what is needed = +1 happy at wake-up (max +4), on top of the usual wake-up minimum of 7. Bed at 21:00 → +2, at 19:00 → +4; owed hours are paid back first (2 h owed + a 10 h night = no bonus). The bed card shows it as 😊+n, the summary and the morning message say it too.
- Old saves (v3 and earlier) migrate with nothing owed.

## Night
"Go to bed" (from 19:00) or midnight → day summary (24 h bar vs plan with the real night, hours per activity, earned/spent/kept, tonight's sleep and whether tomorrow is a sleepy day) → sleep animation (clock spins from bedtime to 7:00) → new morning.

## Look
Picture-book wooden-toy world: sky dome with a travelling sun, chunky outlined cards, coins and apples as countable icons, mini clock discs for durations (1 disc = 1 h). Fredoka + Nunito. EN and PT-PT, everything read aloud (tap 🔊). Hold ⚙️ for grown-up settings.
