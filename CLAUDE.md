# TimeSpent — instructions for Claude (every chat, every session)

TimeSpent is a single-file web game (`index.html`) that teaches Marcos's 5-year-old son time and money.
It holds **two games on one clock**: the **child's day** (the default — routine, school, play, bedtime, quarter hours)
and the **grown-up's day** (work, shopping, coins, half hours). The start screen picks between them.
Rules live in `GAME-DESIGN.md` (keep it current). Live game: https://marramgg.github.io/TimeSpent/
(GitHub Pages serves the `main` branch as-is, about a minute after every merge).

## Workflow — no exceptions

`main` is locked: nothing lands on it except a pull request whose `test` check is green.

1. Branch: `git switch -c feat/<short-name>` (or `fix/<short-name>`) from an up-to-date `main`.
2. Edit only `src/*` (engine.js rules, i18n.js EN + PT-PT strings, ui.js, styles.css, markup.html) and the docs.
3. Build: `python3 build.py && cp dist/index.html index.html` — `index.html` is the built app and must match
   the sources; CI rejects a stale one.
4. Test: `node test/sim.js` (no deps, must pass — it covers both games). For UI changes also run the real
   playthroughs: `npm i playwright && npx playwright install --with-deps chromium`, then `node test/ui-play.js`
   (the grown-up's day) and `node test/ui-child.js` (the child's day).
5. Commit, push the branch, open the PR: `gh pr create --fill`. Then `gh pr merge --squash --auto` —
   it merges by itself once CI is green (`gh pr checks --watch` shows progress). Pages publishes main.
6. Rule changes: update `GAME-DESIGN.md` and keep `routine()` in engine.js in sync (it drives the plan strip
   and the time hints). Save-format changes: bump `state.v` and extend `migrate()` in ui.js.

Small, single-purpose PRs. Don't add tooling, dependencies or process that isn't needed for the game.

## Secrets

Never commit tokens or credentials. The only credential is Marcos's GitHub token at
`<folder>/.git/github-token` (inside `.git`, so git cannot track it; `.gitignore` also blocks `*token*`,
`.env*`, `.secrets/`). Never print it, copy it into the repo, or paste it into chat. CI fails on token patterns.

## Where you are running

- **Cloud session started from the GitHub repo** (claude.ai/code or the desktop app's code mode): you already
  have push access to this repo. Work in the checkout you were given. Nothing else to set up.
- **Cowork session with the local folder** (`~/Documents/Claude/Projects/TimeSpent` on Marcos's Mac, mounted at
  `$HOME/mnt/TimeSpent` for `device_bash`): the folder IS a checkout of `main`, but the sandbox cannot delete
  files there, so git commands that write (commit, pull, checkout) leave lock files or fail. Therefore:
  1. `git clone https://github.com/marramgg/TimeSpent $HOME/ts && cd $HOME/ts` — work and commit there.
  2. `tools/gh-login.sh` logs the GitHub CLI in from the token file. Without a token file, `tools/gh-login.sh code`
     prints a one-time code for Marcos to enter at github.com/login/device, then `tools/gh-login.sh finish`.
  3. After the PR merged: `git switch main && git pull && tools/sync-folder.sh` so the folder matches `main`
     again (it copies the files and the `.git` metadata; it lists files it could not delete).
  Never write into `.git/objects/*/tmp_obj_*` files in the folder: they are hard links of real objects.
  The cloud container's built-in GitHub token is not enabled for this repo — use the device VM for git.

## Engineering notes

- Design for iPhone 13 (390×664 viewport); `test/ui-play.js` and `test/shots.js` emulate it. Set `TS_CHROMIUM`
  to a chromium binary if you have one already installed instead of running `npx playwright install`.
- **The player is five and may not read.** Every card must say what it does out loud when pressed (`sayAction` in
  ui.js); a card carries at most two chips (how long, and the one thing it changes most); one bubble message is on
  screen at a time; the action grid gets the leftover screen space, never the scenery. Check a change at 390×664
  before shipping it: no card should sit entirely below the fold.
- Grids with wrapping tiles need `grid-auto-rows: max-content`; action tiles are `div[role=button]`.
- The shop sheet closes after each purchase. One save per game: `timespent.save.v1` (grown-up) and
  `timespent.save.child.v1`, so the start screen's picker chooses which game "Keep playing" resumes.
- Balance knobs are at the top of `engine.js` (`WORK_PAY`, `ITEMS`, `STALL_UNLOCK`, `PLACES[*].unlockDay`, opening
  hours). One new thing opens per day — keep day 1 to home + bakery + walking (child: home + school + walking).
- The child's game lives behind `isChild(state)`: `CHILD` (times), `CHORE` (the questions), `childRoutine()` and
  `childActions()`. It moves in 15-minute steps, so anything that reads `E.STEP`/`E.SLOTS` must ask `E.stepOf(S)` /
  `E.slotsOf(S)` instead. Its two meters are ❤️ Health (which reuses `state.tummy`) and 😊 Happy; no fridge, no coins.
- **The child's routine is asked, not tapped**: `E.question(S)` is the one thing due now (or null) and `E.answer(S, id,
  yes)` answers it. While a question is pending `actions()` is empty and travel is blocked, so the UI shows the two
  answer buttons in place of the grid. A new question needs a `CHORE` entry (`tier`, `no` icon, `skipMsg`, `due`) plus
  `q.<id>` and the `skipMsg` line in both languages — `test/sim.js` fails if any of those are missing.
- Everything is read aloud and bilingual: every new string goes in `i18n.js` in both EN and PT-PT, and bubble lines
  stay under about ten words.
- Sleep debt, weather and the late-for-work fine were deliberately removed (see the end of `GAME-DESIGN.md`).
  Don't add them back without a reason that is worth the extra thing for a five-year-old to hold in mind.
