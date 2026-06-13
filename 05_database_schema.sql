-- F1 Fan Hub MVP schema
create extension if not exists "pgcrypto";

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  language text not null default 'ru',
  timezone text not null default 'Europe/Amsterdam',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  telegram_id bigint not null unique,
  chat_id bigint not null unique,
  telegram_username text,
  first_name text,
  last_name text,
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_digest_enabled boolean not null default true,
  race_reminders_enabled boolean not null default true,
  breaking_news_enabled boolean not null default true,
  favorite_team_news_enabled boolean not null default true,
  predictions_reminders_enabled boolean not null default true,
  digest_time_local time not null default '09:00',
  telegram_enabled boolean not null default false,
  web_push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- F1 entities
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
  points numeric(6,2),
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
  points numeric(8,2) not null default 0,
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
  points numeric(8,2) not null default 0,
  wins integer not null default 0,
  raw_payload jsonb,
  updated_at timestamptz not null default now(),
  unique (season_year, round, team_id)
);

-- News
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
  confidence numeric(4,3) not null default 1,
  method text not null default 'rule',
  primary key (article_id, tag_id)
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

-- Predictions
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

-- Digests, notifications, jobs
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

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  channel text not null,
  notification_type text not null,
  subject text,
  body text,
  status text not null default 'pending',
  external_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
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
  estimated_cost_usd numeric(10,6),
  related_article_id uuid references public.news_articles(id) on delete set null,
  related_digest_id uuid references public.digests(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_news_articles_published_at on public.news_articles (published_at desc);
create index if not exists idx_news_articles_status on public.news_articles (status);
create index if not exists idx_news_article_tags_tag_id on public.news_article_tags (tag_id);
create index if not exists idx_sessions_start_at on public.sessions (start_at);
create index if not exists idx_races_season_round on public.races (season_year, round);
create index if not exists idx_notification_logs_status on public.notification_logs (status);
create index if not exists idx_job_runs_job_name_started_at on public.job_runs (job_name, started_at desc);
