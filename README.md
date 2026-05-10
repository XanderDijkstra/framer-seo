# Doffin Whisperer

Single-tenant Next.js app that pulls Norwegian public-procurement tenders
from [Doffin](https://doffin.no) and triages them into a `BID / REVIEW / SKIP`
inbox. Stack: **Next.js 15 + Neon Postgres + Drizzle + Vercel Cron**, with
Google Gemini for scoring via the Lovable AI Gateway.

> Designed to run **entirely in the cloud** — no local install needed.
> You ship code from your editor / GitHub web UI / Claude Code, Vercel
> builds it, and Neon stores the data.

---

## One-time setup (5 minutes, all in browser tabs)

### 1. Create the Neon database

- Go to <https://console.neon.tech/> → **Create project** (any name, region close to your users).
- That's it. Neon will show you a connection string — you don't need to copy it; the Vercel integration in the next step will wire it for you.

### 2. Connect this repo to Vercel

- Go to <https://vercel.com/new> → **Import Git Repository** → pick this repo.
- On the import screen, expand **Environment Variables** and add the three runtime keys (descriptions in [Env vars](#env-vars) below):
  - `DOFFIN_API_KEY`
  - `LOVABLE_API_KEY`
  - `CRON_SECRET` (any random string, e.g. `openssl rand -hex 32` or just type 32 random characters)
- Click **Deploy**. The first build will fail with `DATABASE_URL is not set` — that's expected; we add it in step 3.

### 3. Add the Neon integration to your Vercel project

- In your new Vercel project → **Storage** tab → **Connect Database** → **Neon** → pick the project you just created.
- The integration adds `DATABASE_URL` (and a few related vars) to your project automatically and triggers a redeploy.
- That redeploy runs `drizzle-kit migrate && next build`, which **creates the three tables in Neon for you**. No SQL editor, no terminal.

### 4. Open the app

- Vercel shows the deploy URL (e.g. `doffin-whisperer.vercel.app`).
- Visiting it for the first time redirects to `/onboarding` — fill in the company profile.
- Click **Kjør pipeline** on the dashboard to fetch and score the first batch of tenders.
- The daily cron (06:00 UTC) is already wired via `vercel.json`.

---

## Env vars

| Var               | Where it goes                  | Notes                                                                                                                                  |
| ----------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`    | Set automatically by Neon × Vercel integration | Pooled connection string. Don't set it by hand.                                                                                       |
| `DOFFIN_API_KEY`  | Vercel project env vars        | Doffin v2 API subscription key (`Ocp-Apim-Subscription-Key`). Apply at <https://www.doffin.no/>.                                       |
| `LOVABLE_API_KEY` | Vercel project env vars        | Lovable AI Gateway API key. Calls `google/gemini-3-flash-preview` via the OpenAI-compatible endpoint at `ai.gateway.lovable.dev`. |
| `CRON_SECRET`     | Vercel project env vars        | Any random string. Vercel Cron sends it as `Authorization: Bearer …`; the `/api/cron/daily` handler rejects anything else.            |

`.env.example` lists the same set if you ever do want to run locally.

---

## Editing the code without a local checkout

Three browser-only options that all hit the same GitHub repo and trigger a
Vercel redeploy:

- **Claude Code on web** — what you're using right now. Push commits straight to a feature branch.
- **GitHub web UI** — `.` on any file opens [github.dev](https://github.dev) (a hosted VS Code).
- **Vercel's Git Editor** — small edits directly from the deployment page.

Every push to `main` builds and deploys automatically, and `bun build` runs
`drizzle-kit migrate` first, so any schema change you push gets applied to
Neon before the new code goes live.

---

## How it works

```
        ┌────────────────┐
        │  Vercel Cron   │  daily 06:00 UTC
        └───────┬────────┘
                │
                ▼
   /api/cron/daily ──▶ scrapeDoffin() ───▶ Neon (notices)
                ▼
                └─▶ scoreNoticesBatch() × up to 5 ─▶ Neon (scores)
```

- **`src/lib/doffin.ts`** — aggregates CPV codes + keywords from the company profile and queries Doffin v2. Mitigates the no-`OR` quirk by issuing one request per keyword, dedupes by id, inserts only new rows.
- **`src/lib/score.ts`** — pulls the next 10 unscored notices, pre-skips anything matching `penalty_keywords`, otherwise asks Gemini to score on five dimensions and recommend `BID / REVIEW / SKIP`.
- **`/api/pipeline/run`** — manual orchestrator that the dashboard's "Kjør pipeline" button calls. Loops scoring up to 5×.
- **`/api/cron/daily`** — what Vercel Cron hits. Same body, but rejects non-`Bearer $CRON_SECRET` callers and respects `pipeline_schedule`.

---

## Project layout

```
src/
  app/
    layout.tsx              global shell, fonts, toaster, react-query
    page.tsx                redirects to /onboarding if no company yet, else <Dashboard />
    onboarding/page.tsx     first-run profile setup
    settings/page.tsx       edit profile + pipeline frequency
    notice/[id]/page.tsx    detail view with score bars + reasons / red flags
    api/
      company/              GET, POST, PATCH the singleton profile
      notices/              GET list, GET one, POST favorite toggle
      pipeline/             scrape, score, run (manual)
      scores/reset          wipe scores so the next run re-scores everything
      cron/daily            Vercel Cron entry point (CRON_SECRET-protected)
  components/               AppShell, Dashboard, CompanyForm, ScoreBadge, ui/*
  lib/
    db.ts                   Neon HTTP driver + Drizzle
    schema.ts               company_profile, notices, scores
    doffin.ts               server-only scraper
    score.ts                server-only Gemini scoring + clearAllScores
    keywords.ts             penalty matcher
    cpv-codes.ts            curated CPV chip list
    services.ts             curated service chip list
    regions.ts              Norwegian regions
    api-client.ts           thin typed fetch wrapper for the React Query layer
drizzle/                    migrations (checked in; applied by `bun build`)
vercel.json                 cron config
```

---

## Doffin gotchas baked in

- `searchString` does not honour `OR`. We make one HTTP request per keyword.
- `cpvCode` is repeatable. We pass all CPV codes in one request.
- Pagination is 1-indexed.
- Vercel Functions cap at 60s on Hobby (300s on Pro for cron). We score 10 notices per call and loop up to 5×.

---

## Adding auth later

Drop in **Auth.js v5** with the Drizzle adapter, add `users` and `accounts`
tables, scope `company_profile.id` to a user (or to a tenant), and re-add
the `company_id` foreign key on `scores`. The data model is already shaped
for this — `notices` stays shared, `scores` becomes per-user.
