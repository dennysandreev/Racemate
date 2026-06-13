-- RaceMate V1 schema
-- V1 deliberately excludes Telegram, web push, notification preferences,
-- notification dispatch, and notification logs.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  language text not null default 'ru',
  timezone text not null default 'Europe/Moscow',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  code text not null unique,
  name text not null,
  short_name text,
  country text,
  color_hex text,
  badge_variant text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  code text,
  permanent_number integer,
  first_name text not null,
  last_name text not null,
  full_name text not null,
  country text,
  current_team_id uuid references public.teams(id),
  avatar_style_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.circuits (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  country text,
  locality text,
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seasons (
  year integer primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null references public.seasons(year),
  round integer not null,
  race_name text not null,
  circuit_id uuid references public.circuits(id),
  official_url text,
  race_start_at timestamptz,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_year, round)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  session_type text not null,
  name text not null,
  start_at timestamptz,
  end_at timestamptz,
  status text not null default 'scheduled',
  openf1_session_key integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, session_type)
);

create table if not exists public.session_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  driver_id uuid references public.drivers(id),
  team_id uuid references public.teams(id),
  position integer,
  classified_position text,
  grid integer,
  laps integer,
  points numeric(6, 2),
  status text,
  time_text text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, driver_id)
);

create table if not exists public.driver_standings (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null references public.seasons(year),
  round integer,
  driver_id uuid not null references public.drivers(id),
  team_id uuid references public.teams(id),
  position integer,
  points numeric(8, 2) not null default 0,
  wins integer not null default 0,
  raw_payload jsonb,
  updated_at timestamptz not null default now(),
  unique (season_year, round, driver_id)
);

create table if not exists public.constructor_standings (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null references public.seasons(year),
  round integer,
  team_id uuid not null references public.teams(id),
  position integer,
  points numeric(8, 2) not null default 0,
  wins integer not null default 0,
  raw_payload jsonb,
  updated_at timestamptz not null default now(),
  unique (season_year, round, team_id)
);

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null default 'rss',
  url text not null unique,
  language text,
  is_active boolean not null default true,
  fetch_interval_minutes integer not null default 30,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.news_sources(id),
  canonical_url text not null unique,
  original_url text,
  original_title text not null,
  original_description text,
  original_language text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  ai_summary_ru text,
  ai_title_ru text,
  importance_score integer not null default 0,
  status text not null default 'pending',
  duplicate_of uuid references public.news_articles(id),
  raw_payload jsonb,
  ai_model text,
  ai_processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.news_article_tags (
  article_id uuid not null references public.news_articles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  confidence numeric(4, 3) not null default 1,
  method text not null default 'rule',
  primary key (article_id, tag_id)
);

create table if not exists public.article_reactions (
  article_id uuid not null references public.news_articles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (article_id, user_id, reaction)
);

create table if not exists public.user_favorite_teams (
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

create table if not exists public.user_favorite_drivers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, driver_id)
);

create table if not exists public.prediction_leagues (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  invite_code text not null unique,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prediction_league_members (
  league_id uuid not null references public.prediction_leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  league_id uuid references public.prediction_leagues(id) on delete cascade,
  pole_driver_id uuid references public.drivers(id),
  winner_driver_id uuid references public.drivers(id),
  fastest_lap_driver_id uuid references public.drivers(id),
  dnf_driver_id uuid references public.drivers(id),
  top3_driver_ids uuid[],
  top10_driver_ids uuid[],
  submitted_at timestamptz not null default now(),
  locked_at timestamptz,
  score integer,
  scored_at timestamptz,
  unique (user_id, race_id, league_id)
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references public.races(id) on delete set null,
  question text not null,
  status text not null default 'draft',
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0
);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table if not exists public.digests (
  id uuid primary key default gen_random_uuid(),
  digest_type text not null,
  date_key date,
  race_id uuid references public.races(id),
  title text not null,
  body_md text not null,
  ai_model text,
  generated_at timestamptz not null default now(),
  status text not null default 'draft'
);

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_processed integer not null default 0,
  error_message text,
  metadata jsonb
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  provider text not null default 'openrouter',
  model text not null,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(10, 6),
  related_article_id uuid references public.news_articles(id) on delete set null,
  related_digest_id uuid references public.digests(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_news_articles_published_at on public.news_articles (published_at desc);
create index if not exists idx_news_articles_status on public.news_articles (status);
create index if not exists idx_news_article_tags_tag_id on public.news_article_tags (tag_id);
create index if not exists idx_sessions_start_at on public.sessions (start_at);
create index if not exists idx_races_season_round on public.races (season_year, round);
create index if not exists idx_job_runs_job_name_started_at on public.job_runs (job_name, started_at desc);
create index if not exists idx_ai_usage_created_at on public.ai_usage_logs (created_at desc);
create index if not exists idx_predictions_user_race on public.predictions (user_id, race_id);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger teams_touch_updated_at
before update on public.teams
for each row execute function public.touch_updated_at();

create trigger drivers_touch_updated_at
before update on public.drivers
for each row execute function public.touch_updated_at();

create trigger circuits_touch_updated_at
before update on public.circuits
for each row execute function public.touch_updated_at();

create trigger races_touch_updated_at
before update on public.races
for each row execute function public.touch_updated_at();

create trigger sessions_touch_updated_at
before update on public.sessions
for each row execute function public.touch_updated_at();

create trigger news_sources_touch_updated_at
before update on public.news_sources
for each row execute function public.touch_updated_at();

create trigger news_articles_touch_updated_at
before update on public.news_articles
for each row execute function public.touch_updated_at();

create trigger prediction_leagues_touch_updated_at
before update on public.prediction_leagues
for each row execute function public.touch_updated_at();

create trigger polls_touch_updated_at
before update on public.polls
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.teams enable row level security;
alter table public.drivers enable row level security;
alter table public.circuits enable row level security;
alter table public.seasons enable row level security;
alter table public.races enable row level security;
alter table public.sessions enable row level security;
alter table public.session_results enable row level security;
alter table public.driver_standings enable row level security;
alter table public.constructor_standings enable row level security;
alter table public.news_sources enable row level security;
alter table public.news_articles enable row level security;
alter table public.tags enable row level security;
alter table public.news_article_tags enable row level security;
alter table public.article_reactions enable row level security;
alter table public.user_favorite_teams enable row level security;
alter table public.user_favorite_drivers enable row level security;
alter table public.prediction_leagues enable row level security;
alter table public.prediction_league_members enable row level security;
alter table public.predictions enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.digests enable row level security;
alter table public.job_runs enable row level security;
alter table public.ai_usage_logs enable row level security;

create policy "Public can read active teams" on public.teams
for select using (is_active = true);

create policy "Public can read active drivers" on public.drivers
for select using (is_active = true);

create policy "Public can read circuits" on public.circuits
for select using (true);

create policy "Public can read seasons" on public.seasons
for select using (true);

create policy "Public can read races" on public.races
for select using (true);

create policy "Public can read sessions" on public.sessions
for select using (true);

create policy "Public can read session results" on public.session_results
for select using (true);

create policy "Public can read driver standings" on public.driver_standings
for select using (true);

create policy "Public can read constructor standings" on public.constructor_standings
for select using (true);

create policy "Public can read published articles" on public.news_articles
for select using (status = 'processed' and duplicate_of is null);

create policy "Public can read active sources" on public.news_sources
for select using (is_active = true);

create policy "Public can read tags" on public.tags
for select using (true);

create policy "Public can read article tags" on public.news_article_tags
for select using (true);

create policy "Public can read published digests" on public.digests
for select using (status = 'published');

create policy "Public can read active polls" on public.polls
for select using (status = 'published');

create policy "Public can read poll options" on public.poll_options
for select using (true);

create policy "Users can read own profile" on public.profiles
for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
for update using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can read own favorite teams" on public.user_favorite_teams
for select using (auth.uid() = user_id);

create policy "Users can manage own favorite teams" on public.user_favorite_teams
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own favorite drivers" on public.user_favorite_drivers
for select using (auth.uid() = user_id);

create policy "Users can manage own favorite drivers" on public.user_favorite_drivers
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage own reactions" on public.article_reactions
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read public leagues and memberships" on public.prediction_leagues
for select using (
  is_public = true
  or owner_user_id = auth.uid()
  or exists (
    select 1
    from public.prediction_league_members members
    where members.league_id = prediction_leagues.id
      and members.user_id = auth.uid()
  )
);

create policy "Users can create leagues" on public.prediction_leagues
for insert with check (owner_user_id = auth.uid());

create policy "Owners can update leagues" on public.prediction_leagues
for update using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "Users can read league members" on public.prediction_league_members
for select using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.prediction_leagues leagues
    where leagues.id = prediction_league_members.league_id
      and (leagues.is_public = true or leagues.owner_user_id = auth.uid())
  )
);

create policy "Users can join leagues as themselves" on public.prediction_league_members
for insert with check (user_id = auth.uid());

create policy "Users can read own predictions" on public.predictions
for select using (user_id = auth.uid());

create policy "Users can manage own predictions" on public.predictions
for all using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can vote as themselves" on public.poll_votes
for insert with check (user_id = auth.uid());

create policy "Users can read own votes" on public.poll_votes
for select using (user_id = auth.uid());

create policy "Admins can manage everything" on public.admin_users
for all using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage sources" on public.news_sources
for all using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage articles" on public.news_articles
for all using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage tags" on public.tags
for all using (public.is_admin())
with check (public.is_admin());

create policy "Admins can read jobs" on public.job_runs
for select using (public.is_admin());

create policy "Admins can manage jobs" on public.job_runs
for all using (public.is_admin())
with check (public.is_admin());

create policy "Admins can read ai usage" on public.ai_usage_logs
for select using (public.is_admin());
