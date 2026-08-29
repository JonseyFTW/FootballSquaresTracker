# SquareSZN production setup — what's done, what's left

The operator checklist for [squareszn.com](https://squareszn.com). The
[README](./README.md#configuration) documents what every variable does; this
file tracks the state of **this** deployment and the exact steps for whatever
is still open. States marked ✔/❌ were verified live on **2026-07-12**; ⚠ means
it can't be checked from outside — confirm it in the dashboard.

Env vars live in Vercel → `football-squares-tracker` → **Settings →
Environment Variables** (add to Production). **Changes only apply after a
redeploy** (Deployments → ⋯ on the latest → Redeploy).

## Verified working ✔

- **Domain + DNS** — squareszn.com and www both resolve to Vercel; the apex is
  the primary domain and www 308-redirects to it (this was the Search Console
  blocker, now fixed)
- **Database** — Postgres (Neon) attached; `/api/health` reports
  `"storage":"postgres"`
- **SEO surface** — robots.txt and sitemap.xml served with squareszn.com URLs
- **Deploys** — latest production deployment READY, auto-deploys from the
  default branch

## Still to do

### 1. Resubmit the sitemap in Google Search Console

The earlier "couldn't fetch" was caused by www being the primary domain, and
that's fixed now.

1. [search.google.com/search-console](https://search.google.com/search-console)
   → your squareszn.com property → Sitemaps
2. Submit `https://squareszn.com/sitemap.xml` again
3. Status should flip to "Success" (can take a day)

### 2. Set `AUTH_SECRET` ⚠

Login tokens are currently signed with a fallback secret derived from
`POSTGRES_URL`. That works, but if the database URL ever changes (migrating,
rotating credentials), every user is silently signed out.

1. Generate one: `openssl rand -hex 32`
2. Add `AUTH_SECRET` in Vercel env → redeploy

Heads-up: the moment it goes live, existing sessions are invalidated **once**
(everyone just signs in again) — better to do this while the user count is
small.

### 3. Set `APP_URL=https://squareszn.com` ⚠

Pins password-reset links to the canonical domain instead of whatever host the
request arrived on. One env var, no other steps.

### 4. Google sign-in — `GOOGLE_CLIENT_ID` ❌ (verified not set)

The code shipped; the button stays hidden until this is set. There is no API
for this — it's a one-time dashboard task:

1. [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   (create a project if asked) → **Create credentials → OAuth client ID**
2. Configure the consent screen if prompted (External, app name SquareSZN,
   your email — no scopes to add)
3. Application type **Web application**, Authorized JavaScript origins:
   - `https://squareszn.com`
   - `https://www.squareszn.com`
   - `http://localhost:5173`
   - Leave **redirect URIs empty** (the button flow doesn't use one)
4. Copy the client ID (ends in `.apps.googleusercontent.com`) →
   `GOOGLE_CLIENT_ID` in Vercel env → redeploy
5. Verify: the Google button appears on `/auth`, or
   `https://squareszn.com/api/auth/config` returns the ID instead of `null`

### 5. Reset emails — `RESEND_API_KEY` + `EMAIL_FROM` ⚠

Until these are set, password-reset links only show up in the Vercel function
logs — real users can't reset their password.

1. [resend.com](https://resend.com) → sign up (free: 100 emails/day) →
   **Domains → Add domain** → `squareszn.com`
2. Add the DNS records it lists in Cloudflare (DNS → Records; they're TXT/MX on
   subdomains like `send` and `resend._domainkey`) → back in Resend, **Verify**
3. **API Keys → Create** → set in Vercel env:
   - `RESEND_API_KEY` = the key
   - `EMAIL_FROM` = `SquareSZN <no-reply@squareszn.com>`
4. Redeploy, then verify with "Forgot password?" on your own account — the
   email should arrive

### 6. Marketing emails (weekly board reminders + season-start) — `CRON_SECRET`

A daily Vercel Cron (`vercel.json` → `/api/cron/emails`, 15:00 UTC) decides
what to send: every **Tuesday** during football season (Aug 1–Feb 15), users
who have created at least one board get a "this week's games" email featuring
one matchup; in **early August** (1st–10th), every account gets a one-time
"football is back" email. Every email carries a signed unsubscribe link
(honored at `/api/email/unsubscribe`), and nothing sends until email (step 5)
plus this step are configured:

1. Generate a secret: `openssl rand -hex 32` → add `CRON_SECRET` in Vercel env
   (Vercel automatically sends it as a bearer token when invoking the cron)
2. Redeploy so the cron from `vercel.json` registers
3. Dry-run it any time without sending:
   `curl -H "Authorization: Bearer $CRON_SECRET" "https://squareszn.com/api/cron/emails?dryRun=1"`
   → JSON showing today's campaigns, recipient counts, and the featured game
4. Optional knobs: `EMAIL_DAILY_CAP` (default 1000 — mind Resend's free tier
   of 100 emails/day before upgrading), `EMAIL_POSTAL_ADDRESS` (shown in the
   footer; CAN-SPAM asks marketing email to carry a postal address)

### 7. Optional: AI square-sheet import

The "import from image" feature needs one AI provider key; without one, users
can still paste their own key in the UI. Cheapest hands-off option:
`OPENROUTER_API_KEY` from [openrouter.ai](https://openrouter.ai) (defaults to
`google/gemini-2.5-flash-lite`; override with `OPENROUTER_MODEL` or per-import
in the UI). Alternatives: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_API_KEY`.

### 8. Optional: receiving email at @squareszn.com

Resend only **sends**. To receive (e.g. `hello@squareszn.com` → your Gmail),
use Cloudflare Email Routing — free, and the domain is already on Cloudflare:

1. Cloudflare dashboard → squareszn.com → **Email → Email Routing** → enable
   (it adds the MX records itself)
2. Create an address rule: `hello@squareszn.com` → forward to your personal
   inbox → confirm the verification email it sends you

## Quick health check

After any change:

- `https://squareszn.com/api/health` → `{"ok":true,"storage":"postgres",…}`
- `https://squareszn.com/api/auth/config` → non-null once Google is configured
- "Forgot password?" with your own email → email arrives (step 5 done)
- Search Console → Sitemaps → "Success" (step 1 done)

## Variable reference (state as of 2026-07-12)

| Variable | State | Notes |
|---|---|---|
| `POSTGRES_URL` | ✔ set | Automatic via the Neon storage attach |
| `AUTH_SECRET` | ⚠ confirm | Falls back to a derived secret — set explicitly (step 2) |
| `APP_URL` | ⚠ confirm | Step 3 |
| `GOOGLE_CLIENT_ID` | ❌ not set | Step 4 |
| `RESEND_API_KEY` / `EMAIL_FROM` | ⚠ confirm | Step 5 |
| `CRON_SECRET` | ❌ not set | Step 6 — reminder emails stay off until set |
| `EMAIL_DAILY_CAP` / `EMAIL_POSTAL_ADDRESS` | optional | Step 6 |
| `OPENROUTER_API_KEY` (or Gemini/OpenAI/Claude key) | optional | Step 7 |
