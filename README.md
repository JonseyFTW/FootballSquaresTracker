# Football Squares Tracker

A web application to run football squares pools: create boards, draw numbers fairly, track payments, share view-only boards with your group, and watch every square update with live NFL scores.

New visitors get a marketing landing page at `/`; the app itself lives at `/boards` and friends. SEO is handled with static meta/Open Graph/Twitter tags, JSON-LD structured data, a generated `og-image.png`, and `robots.txt` + `sitemap.xml` (all under `client/public/` and `client/index.html`).

## Features

- **Leagues for Groups** (e.g. Facebook groups): create an account, start a league, and run all your group's squares games in one place.
  - **Member roster** — add your players once; names autocomplete when assigning squares
  - **NFL week picker** — creating a game lists every matchup that week (Thursday/Sunday/Monday); pick one and team names + live scores hook up automatically
  - **Draw numbers on-site** — squares get claimed first, then run the randomizer, choosing how many times it shuffles; every run is stored and shown so the group can see the draw was fair. Or enter numbers drawn elsewhere.
  - **Payment tracking** — set a price per square and check off who's paid; collected/outstanding totals update live
  - **Share links** — post a view-only link to the league or any board; viewers watch live but can't change anything (only the league owner can)
  - **Player accounts & stats** — viewers can optionally create an account, track their squares across games, and get a lifetime analytics page (games, wins, win rate, winnings, net)
- **Three Board Types**:
  - **10x10 Grid** — 100 squares, one digit per axis header
  - **5x5 Grid** — 25 squares, two digits per axis header (4 winning combos per square)
  - **10-Strip** — 10 squares, each covering 5 digits for one team and 2 for the other (10 winning combos per square). Digit assignments are generated so every possible score has exactly one winner, and can be edited per square afterwards.
- **Import from a Photo**: Upload a screenshot or photo of a real squares board and an AI provider (Gemini, OpenAI, or Claude) extracts the teams, axis digits, owners, and prizes. Any digits the AI had to auto-correct are flagged for you to verify.
- **Square Tracking**: Enter your square numbers to highlight them on the board — they're remembered per board on your device.
- **Winning Combinations**: See all the score combinations that would result in a win for your squares, with realistic example scores.
- **Live NFL Scores**: Link a board to a real NFL game (via ESPN's public scoreboard) and the score and quarter update automatically — every 30 seconds while the game is live. Pick the game from a list, confirm which team is on which axis (auto-suggested from your team names), and watch the winning square move in real time.
- **Live Score Updates**: Or update the score manually (quick +7/+3/+1 buttons) and instantly see who's winning.
- **Period Results**: Record the winning square for each quarter/half/final alongside its prize amount, so payouts stay visible after the score moves on.
- **Square Management**: Click any square to assign an owner (and edit digit coverage on strip boards).

## Quick Start with Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Access the app at http://localhost:3001
```

## Development Setup

```bash
# Install all dependencies
npm run install:all

# Run in development mode (starts both server and client)
npm run dev

# Server runs on http://localhost:3001
# Client runs on http://localhost:5173

# Run the test suite (game logic + import normalization)
npm test
```

## Configuration

Copy `.env.example` to `.env`. All values are optional:

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `CLAUDE_API_KEY` | Enables image import with that provider (users can also paste a key in the UI) |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Image import through [OpenRouter](https://openrouter.ai) — one key, any vision model; users can name a model per-import |
| `RESEND_API_KEY` / `EMAIL_FROM` | Password-reset emails via [Resend](https://resend.com). Unset = reset links are logged to the server console |
| `APP_URL` | Public origin for reset links; defaults to the request host |
| `PORT` | Server port, defaults to `3001` |
| `POSTGRES_URL` | Store data in Postgres instead of `server/data/*.json` |
| `AUTH_SECRET` | Signs login tokens (recommended in production; rotating it signs everyone out). Falls back to a secret derived from `POSTGRES_URL`, or a locally persisted one in dev |

## Deploying to Vercel

The repo includes `vercel.json` and a serverless entry point (`api/index.js`) — import the repo into Vercel and deploy.

**Important:** attach a Postgres database (Vercel Postgres/Neon) so `POSTGRES_URL` is set. Without it, boards are stored in memory and disappear on every cold start.

## How Football Squares Works

1. **The Grid**: A grid where the X-axis represents one team and the Y-axis represents the other
2. **The Numbers**: Each axis has digits 0-9 arranged randomly
3. **The Rule**: Winners are determined by the **last digit** of each team's score
4. **5x5 Boards**: Each cell covers 2 digits, giving each square 4 winning combinations
5. **10x10 Boards**: Each cell covers 1 digit, giving each square 1 winning combination
6. **10-Strip Boards**: Each square covers 5 x-digits and 2 y-digits (10 combinations)

### Example
- Score: Chiefs 17, 49ers 24
- Chiefs last digit: 7
- 49ers last digit: 4
- The square at the intersection of column "7" and row "4" wins!

## API Endpoints

- `GET /api/boards` - List all boards
- `POST /api/boards` - Create a new board
- `GET /api/boards/:id` - Get a specific board
- `PUT /api/boards/:id/score` - Update game score and phase
- `PUT /api/boards/:id/squares` - Bulk-update square owners (and strip digits)
- `PUT /api/boards/:id/squares/:num` - Update one square's owner (and strip digits)
- `PUT /api/boards/:id/period-result` - Record/clear the winner snapshot for `q1|half|q3|final`
- `GET /api/boards/:id/my-squares?squares=1,2,3` - Winning combinations + current winners for specific squares
- `DELETE /api/boards/:id` - Delete a board
- `GET /api/llm-providers` - Which AI providers have server-configured keys
- `POST /api/parse-image` - Extract board data from an image via Gemini/OpenAI/Claude
- `GET /api/health` - Health check; reports which storage backend is active
- `GET /api/nfl/scoreboard?dates=YYYYMMDD` - List NFL games from ESPN (defaults to the current week)
- `PUT /api/boards/:id/live-game` - Link (`{eventId, xTeamSide}`) or unlink (`{clear: true}`) a live NFL game
- `POST /api/boards/:id/sync-live` - Pull the linked game's latest score/quarter into the board
- `PUT /api/boards/:id/draw-axes` - Draw grid numbers: `{runs: N}` randomizes N times (history kept) or `{mode: "manual", xAxis, yAxis}`
- `PUT /api/boards/:id/payments` - Mark an owner name paid/unpaid (`{name, paid}`)
- `POST /api/auth/register` / `POST /api/auth/login` / `GET /api/me` - Accounts (scrypt + signed bearer tokens)
- `POST /api/auth/forgot` / `POST /api/auth/reset` - Password reset (30-min single-use links; emailed via Resend or logged server-side)
- `POST /api/leagues`, `GET /api/leagues`, `GET/PUT/DELETE /api/leagues/:id` - Leagues (owner only)
- `POST /api/leagues/:id/members`, `DELETE /api/leagues/:id/members/:memberId` - Roster
- `GET /api/league-share/:token` - Public read-only league page
- `GET /api/share/:token` (+ `/my-squares`, `POST /sync-live`) - Public read-only board access for share links
- `PUT/GET /api/me/tracked` - Squares the signed-in user is tracking per board
- `GET /api/me/analytics` - Lifetime stats computed from tracked games + recorded results

Boards created by a signed-in user are private to them (share links grant view-only access); boards created without an account remain open to everyone, exactly as before.

## Tech Stack

- **Frontend**: React 18 with Vite
- **Backend**: Node.js with Express
- **Storage**: JSON file (local/Docker) or Postgres (Vercel)
- **Containerization**: Docker
