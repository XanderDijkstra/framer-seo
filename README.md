# Doffin Whisperer

Multi-tenant SaaS that triages Norwegian public-procurement tenders from
[Doffin](https://doffin.no) into a `BID / REVIEW / SKIP` inbox per company.

> **Scope of this commit:** scrape + score only. Proposal generation, exports,
> document uploads, and digest emails are intentionally not included yet —
> we want the matching to feel right before adding writing tools on top.

## Stack

- React 18 + Vite + TypeScript + Tailwind v3 (handwritten shadcn-style primitives).
- Supabase (Postgres + Auth + Edge Functions).
- Google Gemini via the Lovable AI Gateway (`google/gemini-3-flash-preview`).

## Setup

1. **Create the Supabase project**, then locally:

   ```sh
   bun install
   cp .env.example .env.local   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
   ```

2. **Run the migration** (`supabase/migrations/20260510000000_init.sql`) — either
   with `supabase db push` after `supabase link`, or paste it into the SQL editor.

3. **Set edge function secrets** — these are server-only, never bundled:

   ```sh
   supabase secrets set DOFFIN_API_KEY=...
   supabase secrets set LOVABLE_API_KEY=...
   # SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically by Supabase
   ```

4. **Deploy the edge functions**:

   ```sh
   supabase functions deploy scrape-doffin
   supabase functions deploy score-notices
   supabase functions deploy run-pipeline
   ```

5. **Wire the daily cron** (run once in the SQL editor — replace `<project-ref>`):

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;

   select cron.schedule(
     'doffin-pipeline-daily',
     '0 6 * * *',
     $$
       select net.http_post(
         url:='https://<project-ref>.supabase.co/functions/v1/run-pipeline',
         headers:='{"Content-Type":"application/json"}'::jsonb,
         body:='{}'::jsonb
       );
     $$
   );
   ```

6. **Run the app**:

   ```sh
   bun dev
   ```

## How it works

- Sign up → `handle_new_user` trigger creates a profile row.
- Onboarding wizard collects services, CPV codes, keywords, regions, budget.
  `create_company_for_current_user` RPC creates the company atomically and
  links the profile.
- `scrape-doffin` aggregates CPV codes and keywords across **every** company
  profile (Doffin data is public, so the cache is shared) and inserts new
  notices into `public.notices`.
- `score-notices` finds notices that haven't been scored for each company,
  pre-skips anything matching `penalty_keywords`, and otherwise asks Gemini
  to score on five dimensions and recommend `BID/REVIEW/SKIP`.
- `run-pipeline` chains the above and is what both the dashboard button and
  pg_cron invoke.

## Doffin gotchas baked in

- `searchString` does not honour `OR`. We make one HTTP request per keyword.
- `cpvCode` is a repeatable param. We pass all CPV codes in one request.
- Pagination is 1-indexed.
- Edge functions cap at ~60s on free tier — `score-notices` only handles
  10 notices per company per call; `run-pipeline` loops up to 5 times.

## Project layout

```
src/
  components/         AppShell, ProtectedRoute, ScoreBadge, ui primitives
  hooks/useAuth.tsx
  lib/                supabase client, api helpers, CPV / region / service lists
  pages/              Auth, Onboarding, Dashboard, NoticeDetail, Settings
supabase/
  config.toml         verify_jwt=false on all 3 functions
  migrations/         schema + RLS + trigger + RPC
  functions/
    _shared/          cors + service client + keyword matcher
    scrape-doffin/
    score-notices/
    run-pipeline/
```
