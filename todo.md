# Football Squares Tracker — Codebase Audit

Full audit of bugs, unfinished features/concepts, and enhancement opportunities.
Items are ordered by severity within each section. File references point at the
code as it existed when the audit was taken.

> **Status: all 31 items below are fixed** (checked boxes), verified by a
> `node:test` suite (`npm test`), API smoke tests, and browser-driven UI checks
> against the production build. The only remaining section is "Future ideas",
> which was explicitly scoped out.

---

## 🐛 Bugs

### Critical

- [x] **B1 — Strip-10 board generation is mathematically broken** (`server/index.js` → `generateStrip10Assignments`)
  Digits are dealt randomly from pools (each x-digit ×5, each y-digit ×2), which allows:
  1. *Duplicate digits inside one square* — e.g. a square showing `3, 3, 5, 7, 9`, silently reducing its winning combos.
  2. *Non-tiling coverage* — the 10 squares are supposed to partition all 100 (x,y) last-digit combos. Random dealing means some scores have **no winner** and others have **multiple winners**.
  Fix: block-tiling generation — shuffle x-digits into 2 groups of 5, y-digits into 5 groups of 2, and assign the 10 (xGroup × yGroup) blocks to squares in random order. Guarantees unique digits per square and exactly one winner for any score.

- [x] **B2 — Winner detection only returns/highlights the *first* matching square** (`server/index.js` → `checkCurrentWinner`; `client/src/components/BoardView.jsx` → `winningSquare` memo)
  Existing or image-imported strip-10 boards can legitimately have multiple squares matching the current score (see B1). Both server and client stop at the first hit. Fix: compute and display **all** winning squares.

- [x] **B3 — Claude image import uses a retired model** (`server/llmService.js`)
  `claude-3-5-sonnet-20241022` has been retired; every import via the Claude provider fails with an API error. Update to a current model.

- [x] **B4 — Image mime type is hardcoded to `image/png` for every upload** (`server/llmService.js`, `server/index.js` → `/api/parse-image`)
  The Anthropic API validates the declared `media_type` against the actual image bytes, so importing a **JPG via Claude always fails**. Gemini also receives the wrong mime. Fix: extract the real mime from the data URL and pass it through to all three providers.

- [x] **B5 — Deep links 404 on Vercel** (`vercel.json`)
  There is no SPA fallback rewrite, so refreshing or directly opening `/board/:id` (or `/create`) on a Vercel deployment returns a 404. Fix: add a catch-all rewrite to `/index.html` after the `/api` rewrite.

- [x] **B6 — Client crashes when the API returns an error payload**
  - `BoardList.fetchBoards`: `setBoards(data)` with an `{error}` object → `boards.map` throws.
  - `BoardView.trackMySquares`: no `response.ok` check — typing non-numeric input (e.g. `abc`) produces `squares=` → server 400 → `setWinningCombinations(undefined)` → render crashes on `.length`.
  Fix: check `response.ok` everywhere and keep state arrays as arrays.

### High

- [x] **B7 — Unknown `/api/*` GET routes return the SPA's `index.html` in production** (`server/index.js` static catch-all)
  API consumers get HTML instead of a JSON 404. Fix: JSON 404 for unmatched `/api/*` before the static catch-all.

- [x] **B8 — `POST /api/boards` accepts any `type` string and never validates axes server-side**
  An unknown type creates a board that breaks rendering and winner logic; axes that aren't a 0–9 permutation silently corrupt payout logic (client validates, server doesn't). Fix: allowlist `5x5 | 10x10 | strip-10` and validate both axes are permutations of 0–9.

- [x] **B9 — `max_tokens: 4096` can truncate 10x10 extractions** (`server/llmService.js`)
  100 squares with owner names plus axes can exceed 4096 output tokens → truncated JSON → "Failed to parse LLM response". Fix: raise to 8192 on all providers.

- [x] **B10 — `PUT /api/boards/:id/score` crashes on boards without `currentScore`** (`server/index.js`)
  `board.currentScore.xTeam = parsed` throws if a stored/imported board lacks the field. Fix: initialize the object when absent.

- [x] **B11 — `PUT /api/boards/:id/squares` (bulk) has no structural validation**
  Any non-empty array replaces the whole squares list — can silently corrupt a board (wrong count, missing row/col/digits). Fix: validate shape per board type and square count.

- [x] **B12 — Changing board type after an image import keeps stale imported squares** (`client/src/components/CreateBoard.jsx`)
  Import a 10x10, switch the select to 5x5, submit → the server slices 100 squares into a 25-square board with wrong positions. Fix: drop imported squares (with a notice) when the user changes the type away from the imported one.

### Medium / Low

- [x] **B13 — Gemini API key sent as a URL query parameter** (`server/llmService.js`)
  Keys in URLs can end up in proxy/server logs. Fix: send via the `x-goog-api-key` header.

- [x] **B14 — Missing grid squares render as clickable ghosts** (`BoardView.jsx` + `index.css`)
  `.square.empty` divs inherit pointer cursor and hover scaling but have no click handler, and the class has no styles. Fix: distinct non-interactive styling.

- [x] **B15 — `loading` never resets when navigating directly between boards** (`BoardView.jsx`)
  The previous board flashes while the next one loads. Fix: reset loading state on `id` change.

- [x] **B16 — "Example scores" for a combo all share the same x-team score** (`server/index.js` → `calculateWinningScores`)
  The nested loop + `slice(0, 6)` yields e.g. `7-3, 7-13, 7-23, 7-33...` — misleadingly uniform. Fix: sort combos by total score so examples look like realistic, varied game scores.

- [x] **B17 — Score inputs can't be cleared** (`BoardView.jsx`)
  `parseInt(value) || 0` pins the field to `0` as you type. Fix: keep raw strings in state, parse on submit.

---

## 🚧 Unfinished features & concepts

- [x] **U1 — Prize amounts exist but period winners are never recorded**
  You can configure Q1/Half/Q3/Final prize amounts, but the app never captures *who won each period* — the core payoff of the prizes concept. Add: a "record result" action per period that snapshots the winning square(s), owner, and score; display results in the Prizes card.

- [x] **U2 — Strip-10 digits cannot be entered or edited manually**
  Manual strip-10 creation always randomizes digits, so a real-world physical strip board can only be transcribed via LLM import. Add digit editing (x/y digits) to the square editor modal for strip boards, with validation.

- [x] **U3 — Image import silently "fixes" unreadable axis digits**
  `normalizeAxis` rewrites duplicates/invalid digits with missing ones without telling the user — a misread photo produces a confidently wrong board. Surface warnings describing every correction so the user can verify against the photo.

- [x] **U4 — Tracked squares are lost on every page reload**
  "Track My Squares" state is ephemeral. Persist per-board in `localStorage` and restore (and re-run tracking) when the board opens.

- [x] **U5 — Zero test coverage for game-critical logic**
  Winner detection, strip generation, and axis normalization decide who wins money; none are tested. Extract pure game logic into `server/gameLogic.js` and add a `node:test` suite (no new dependencies).

- [x] **U6 — Docs drift**
  README doesn't mention the strip-10 board type, image import (or its env keys), Vercel/Postgres deployment, or the period-results endpoint; `.env.example` is missing `POSTGRES_URL`/`PORT`. Bring docs up to date.

---

## ✨ Enhancements & visual polish

- [x] **E1 — 10x10 grid is unusable on phones**
  Squares get crushed to ~30px with overflowing text. Wrap the grid in a horizontal-scroll container with a sensible min-width.

- [x] **E2 — Quick-score buttons for live tracking**
  Football scores move in known increments; add `+7 / +3 / +1` (and reset) buttons per team so updating during a game takes one tap.

- [x] **E3 — Show current winner names (all of them) in the score banner and sidebar**
  Ties into B2 — list every winning square with its owner.

- [x] **E4 — Board list cards lack context**
  Show created date and game-phase badge; hide the meaningless `0 - 0` score line while pre-game.

- [x] **E5 — No favicon / mobile theme color / meta description** (`client/index.html`)
  Browser tab shows a blank page icon; add a 🏈 favicon, `theme-color`, and description.

- [x] **E6 — Owner names are unbounded**
  A giant pasted string blows out the grid layout and is stored verbatim. Trim + cap length server-side.

- [x] **E7 — Import success panel says nothing about what was imported**
  Show a summary (board type, teams, filled square count, prizes) plus U3 warnings so users can sanity-check before creating.

- [x] **E8 — Docker/build hygiene**
  `npm install` → `npm ci` in both Dockerfile stages (lockfiles exist); drop the obsolete `version:` key from `docker-compose.yml`.

---

## 🔭 Future ideas (out of scope for this pass)

These are worthwhile but are projects, not fixes — deliberately not included above:

- [x] ~~Live NFL score integration (auto-update scores from a sports API)~~ — **shipped after the audit**: boards can link to a real NFL game via ESPN's public API and auto-sync score/quarter every 30s while live (`server/nflService.js`, Live Score Sync card in the board view).
- Multi-user boards with share links / realtime sync (websockets)
- Auth + per-user board ownership
- Payment/payout tracking per player

---

*Audit performed 2026-07-12; all fixes landed the same day. See git history for the corresponding changes.*
