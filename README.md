# Doffin Whisperer

Single-tenant Next.js app that pulls Norwegian public-procurement tenders from
[Doffin](https://doffin.no) and triages them into a `BID / REVIEW / SKIP`
inbox. Stack: **Next.js 15 (App Router) + Neon Postgres + Drizzle ORM +
Vercel Cron**, with Google Gemini for scoring via the Lovable AI Gateway.

> No auth yet — first run drops you into onboarding to fill the company
> profile, after that the app shows the dashboard. Add Auth.js later when
> you go multi-user.

## Setup

1. **Create a Neon project** at <https://console.neon.tech> and grab the
   pooled connection string (looks like `postgres://user:pwd@host.neon.tech/db?sslmode=require`).

2. **Configure env vars**:

   ```sh
   cp .env.example .env.local
   # Fill in DATABASE_URL, DOFFIN_API_KEY, LOVABLE_API_KEY, CRON_SECRET
   ```

3. **Push the schema**:

   ```sh
   bun install
   bun run db:push        # creates company_profile, notices, scores in Neon
   ```

4. **Run it**:

   ```sh
   bun run dev
   # http://localhost:3000  →  redirects to /onboarding on first run
   ```

## Deploy

1. Push this repo to GitHub and import it in Vercel.
2. Set the same env vars in the Vercel project (Production + Preview).
3. `vercel.json` already registers a daily cron at 06:00 UTC hitting
   `/api/cron/daily`. The cron handler honours the per-company schedule
   (daily / weekly).

## How it works

```
        ┌────────────────┐
        │  Vercel Cron   │  daily 06:00 UTC
        └───────┬────────┘
                │
                ▼
   /api/cron/daily ──▶ scrapeDoffin() ──▶ Neon (notices)
                ▼
                └─▶ scoreNoticesBatch() × up to 5  ──▶ Neon (scores)
```

- **`src/lib/doffin.ts`** — aggregates CPV codes + keywords from the company
  profile and queries Doffin v2. Mitigates the no-`OR` quirk by issuing one
  request per keyword, dedupes by id, inserts only new rows.
- **`src/lib/score.ts`** — pulls the next 10 unscored notices, pre-skips
  anything matching `penalty_keywords`, otherwise asks Gemini to score on five
  dimensions and recommend `BID/REVIEW/SKIP`.
- **`/api/pipeline/run`** — manual orchestrator (the dashboard's "Kjør
  pipeline" button). Loops scoring up to 5×.
- **`/api/cron/daily`** — what Vercel Cron hits. Same body, but rejects
  non-`Bearer $CRON_SECRET` callers and respects `pipeline_schedule`.

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
    db.ts                   Neon HTTP driver + drizzle
    schema.ts               company_profile, notices, scores
    doffin.ts               server-only scraper
    score.ts                server-only Gemini scoring + clearAllScores
    keywords.ts             penalty matcher
    cpv-codes.ts            curated CPV chip list
    services.ts             curated service chip list
    regions.ts              Norwegian regions
    api-client.ts           thin typed fetch wrapper for the React Query layer
drizzle/                    Drizzle migrations (generated; check in)
vercel.json                 cron config
```

## Doffin gotchas baked in

- `searchString` does not honour `OR`. We make one HTTP request per keyword.
- `cpvCode` is repeatable. We pass all CPV codes in one request.
- Pagination is 1-indexed.
- Vercel Functions cap at 60s on Hobby (300s on Pro for cron). We score 10
  notices per call and loop up to 5×.

## Adding auth later

Drop in **Auth.js v5** with the Drizzle adapter, add `users` and `accounts`
tables, scope `company_profile.id` to a user (or to a tenant), and re-add
the `company_id` foreign key on `scores`. The data model is already shaped
for this — `notices` stays shared, `scores` becomes per-user.
