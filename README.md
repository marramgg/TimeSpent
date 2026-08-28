# TimeSpent

This app is a vibecoded attempt to help my son have a better understanding of time and other resources like food and money.

It's a turn-based day game for a 5-year-old: one turn is one day, from 7:00 to bedtime at 21:00. **Time** is shown on an analog clock, a sun moving across the sky and a 24-hour bar with the day's plan under it (hover or press a card to preview how long it takes). **Money**: one hour of work is one coin, two shifts a day, arriving late costs a coin, no work at weekends. Food, transport, clothes and toys cost coins, and there's a wish to save up for. Lunch is a free lunchbox packed at home or a paid café meal. English and European Portuguese, everything read aloud. The rules fit on one page: [GAME-DESIGN.md](GAME-DESIGN.md).

## Play it

- Online: **https://marramgg.github.io/TimeSpent/** — on iPad/iPhone open it in Safari and "Add to Home Screen".
- Offline: `index.html` is the whole app (one file, no server needed) — open it directly, or drop it on a home server.
- Progress saves in the browser (localStorage), so the same browser on the same device continues where the child left off.
- Grown-ups: press and hold the ⚙️ gear for about a second to open settings (language, 24h/12h clock, sounds, read-aloud, start over).

## Change it

Sources live in `src/`; `python3 build.py` rebuilds `dist/index.html` (copy it to `index.html`). Changes go through pull requests: CI runs the tests on every PR and `main` only accepts green ones (see `CLAUDE.md` for the exact steps).

| File | What's in it |
|---|---|
| `src/engine.js` | All rules: places, opening hours, prices, meters, unlock days, weather, weekend. No DOM. |
| `src/i18n.js` | Every string in EN and PT-PT. |
| `src/ui.js` | Rendering, animations, sounds, speech, saving. |
| `src/styles.css`, `src/markup.html` | Look and layout. |

Balance knobs are at the top of `engine.js` (`WORK_PAY`, `ITEMS` prices, `STALL_UNLOCK`, `WEATHER_FROM`, opening hours).

## Test

- `node test/sim.js` — simulates 21+ days with random and sensible play; fails if the child could ever get stuck.
- `node test/shots.js` / `node test/ui-play.js` — Playwright screenshots and a scripted 9-day playthrough at iPhone/iPad sizes (needs `npm i playwright`).
- `node test/start-shots.js` — checks the start screen fits without scrolling at iPhone/iPad sizes in every state (fresh, saved game, "new game?" confirm), with the real fonts if `npm i @fontsource/nunito @fontsource/fredoka` was run.

See `GAME-DESIGN.md` for the rules in one page.
