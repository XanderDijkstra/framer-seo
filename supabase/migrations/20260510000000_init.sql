-- Doffin Whisperer — initial schema, RLS, trigger, RPC.
-- Run with `supabase db push` after `supabase link`.

create extension if not exists "pgcrypto";

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  company_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.company_profile (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default '',
  services text[] not null default '{}',
  cpv_codes text[] not null default '{}',
  core_cpv_prefixes text[] not null default '{}',
  search_keywords text not null default '',
  boost_keywords text[] not null default '{}',
  penalty_keywords text[] not null default '{}',
  preferred_regions text[] not null default '{}',
  cannot_deliver text[] not null default '{}',
  strengths text[] not null default '{}',
  budget_min int not null default 0,
  budget_max int not null default 0,
  team_size int not null default 1,
  pipeline_schedule text not null default 'daily'
    check (pipeline_schedule in ('daily', 'weekly')),
  updated_at timestamptz not null default now()
);

-- Make profiles.company_id reference company_profile (after both exist).
alter table public.profiles
  drop constraint if exists profiles_company_id_fkey;
alter table public.profiles
  add constraint profiles_company_id_fkey
    foreign key (company_id) references public.company_profile(id)
    on delete set null;

create table if not exists public.notices (
  id text primary key,
  title text not null,
  description text,
  buyer text,
  buyer_location text,
  estimated_value real,
  currency text default 'NOK',
  deadline text,
  cpv_codes jsonb default '[]'::jsonb,
  notice_type text,
  url text,
  raw_json jsonb,
  scored boolean default false,
  notified boolean default false,
  favorited boolean not null default false,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists notices_fetched_at_idx
  on public.notices (fetched_at desc);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  notice_id text not null references public.notices(id) on delete cascade,
  company_id uuid references public.company_profile(id) on delete cascade,
  relevance real,
  size_fit real,
  win_probability real,
  geography_fit real,
  deadline_comfort real,
  composite real,
  category text,
  summary_no text,
  reasons_to_bid jsonb default '[]'::jsonb,
  red_flags jsonb default '[]'::jsonb,
  recommended_action text
    check (recommended_action in ('BID', 'REVIEW', 'SKIP')),
  scored_at timestamptz not null default now(),
  unique (notice_id, company_id)
);

create index if not exists scores_company_idx
  on public.scores (company_id, composite desc);

create table if not exists public.company_favorites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_profile(id) on delete cascade,
  notice_id text not null references public.notices(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (company_id, notice_id)
);

------------------------------------------------------------------------------
-- Trigger: auto-create profile row on auth signup.
------------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

------------------------------------------------------------------------------
-- RPC: atomic create_company_for_current_user.
------------------------------------------------------------------------------

create or replace function public.create_company_for_current_user(
  p_company_name        text,
  p_services            text[],
  p_cpv_codes           text[],
  p_core_cpv_prefixes   text[],
  p_search_keywords     text,
  p_boost_keywords      text[],
  p_penalty_keywords    text[],
  p_preferred_regions   text[],
  p_cannot_deliver      text[],
  p_strengths           text[],
  p_budget_min          int,
  p_budget_max          int,
  p_team_size           int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.company_profile (
    company_name, services, cpv_codes, core_cpv_prefixes,
    search_keywords, boost_keywords, penalty_keywords,
    preferred_regions, cannot_deliver, strengths,
    budget_min, budget_max, team_size
  ) values (
    coalesce(p_company_name, ''),
    coalesce(p_services, '{}'),
    coalesce(p_cpv_codes, '{}'),
    coalesce(p_core_cpv_prefixes, '{}'),
    coalesce(p_search_keywords, ''),
    coalesce(p_boost_keywords, '{}'),
    coalesce(p_penalty_keywords, '{}'),
    coalesce(p_preferred_regions, '{}'),
    coalesce(p_cannot_deliver, '{}'),
    coalesce(p_strengths, '{}'),
    coalesce(p_budget_min, 0),
    coalesce(p_budget_max, 0),
    coalesce(p_team_size, 1)
  )
  returning id into v_company_id;

  update public.profiles
     set company_id = v_company_id
   where id = v_uid;

  return v_company_id;
end;
$$;

grant execute on function public.create_company_for_current_user(
  text, text[], text[], text[], text, text[], text[], text[], text[], text[],
  int, int, int
) to authenticated;

------------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.company_profile     enable row level security;
alter table public.notices             enable row level security;
alter table public.scores              enable row level security;
alter table public.company_favorites   enable row level security;

-- profiles: only your own row.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- company_profile: read/update if linked to me; insert by any authenticated user.
drop policy if exists company_profile_member_read on public.company_profile;
create policy company_profile_member_read
  on public.company_profile for select
  using (
    id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists company_profile_authenticated_insert on public.company_profile;
create policy company_profile_authenticated_insert
  on public.company_profile for insert
  to authenticated
  with check (true);

drop policy if exists company_profile_member_update on public.company_profile;
create policy company_profile_member_update
  on public.company_profile for update
  using (
    id in (
      select company_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

-- notices: any authenticated user can read; writes are service-role only.
drop policy if exists notices_authenticated_read on public.notices;
create policy notices_authenticated_read
  on public.notices for select
  to authenticated
  using (true);

-- scores: read only your company's rows.
drop policy if exists scores_member_read on public.scores;
create policy scores_member_read
  on public.scores for select
  using (
    company_id is null
    or company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists scores_member_delete on public.scores;
create policy scores_member_delete
  on public.scores for delete
  using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

-- company_favorites: full CRUD for your own company.
drop policy if exists fav_member_read on public.company_favorites;
create policy fav_member_read
  on public.company_favorites for select
  using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists fav_member_insert on public.company_favorites;
create policy fav_member_insert
  on public.company_favorites for insert
  with check (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists fav_member_delete on public.company_favorites;
create policy fav_member_delete
  on public.company_favorites for delete
  using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );
