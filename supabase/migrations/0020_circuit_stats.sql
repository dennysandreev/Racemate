-- RaceMate circuit dossier data for Grand Prix pages.

alter table public.circuits
  add column if not exists slug text,
  add column if not exists lap_length_km numeric(6, 3),
  add column if not exists race_laps integer,
  add column if not exists race_distance_km numeric(7, 3),
  add column if not exists turns_count integer,
  add column if not exists direction text,
  add column if not exists first_grand_prix_year integer,
  add column if not exists lap_record_time text,
  add column if not exists lap_record_driver text,
  add column if not exists lap_record_year integer,
  add column if not exists drs_zones_count integer,
  add column if not exists track_type text,
  add column if not exists track_description text,
  add column if not exists overtaking_rating integer check (overtaking_rating between 1 and 5),
  add column if not exists qualifying_importance_rating integer check (qualifying_importance_rating between 1 and 5),
  add column if not exists tyre_wear_rating integer check (tyre_wear_rating between 1 and 5),
  add column if not exists safety_car_rating integer check (safety_car_rating between 1 and 5),
  add column if not exists strategy_variability_rating integer check (strategy_variability_rating between 1 and 5),
  add column if not exists rain_risk_rating integer check (rain_risk_rating between 1 and 5);

with circuit_slugs as (
  select
    id,
    regexp_replace(
      regexp_replace(
        lower(coalesce(nullif(external_id, ''), nullif(name, ''), id::text)),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '(^-|-$)',
      '',
      'g'
    ) as base_slug
  from public.circuits
  where slug is null or slug = ''
),
ranked as (
  select
    id,
    nullif(base_slug, '') as base_slug,
    row_number() over (
      partition by nullif(base_slug, '')
      order by id
    ) as duplicate_rank
  from circuit_slugs
)
update public.circuits c
set slug = case
  when ranked.base_slug is null then 'circuit-' || left(c.id::text, 8)
  when ranked.duplicate_rank = 1 then ranked.base_slug
  else ranked.base_slug || '-' || left(c.id::text, 8)
end
from ranked
where c.id = ranked.id;

create unique index if not exists circuits_slug_unique_idx
  on public.circuits (slug)
  where slug is not null;

create table if not exists public.circuit_grand_prix_history (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid not null references public.circuits(id) on delete cascade,
  season integer not null,
  round integer not null,
  race_id uuid references public.races(id) on delete set null,
  race_name text not null,
  race_date timestamptz,
  winner_driver_id uuid references public.drivers(id),
  winner_team_id uuid references public.teams(id),
  pole_driver_id uuid references public.drivers(id),
  pole_team_id uuid references public.teams(id),
  winner_start_position integer,
  winner_from_pole boolean,
  podium_json jsonb not null default '[]'::jsonb,
  dnf_count integer,
  safety_car_count integer,
  vsc_count integer,
  red_flag_count integer,
  strategy_json jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  source_errors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circuit_id, season, round)
);

create table if not exists public.circuit_stats (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid not null references public.circuits(id) on delete cascade,
  calculated_from_season integer,
  calculated_to_season integer,
  races_count integer not null default 0,
  pole_win_rate numeric(5, 2),
  front_row_win_rate numeric(5, 2),
  winner_avg_start_position numeric(5, 2),
  avg_position_delta numeric(6, 2),
  avg_abs_position_delta numeric(6, 2),
  best_position_gain_json jsonb,
  worst_position_loss_json jsonb,
  avg_dnf_count numeric(6, 2),
  avg_pit_stops numeric(6, 2),
  avg_first_pit_lap numeric(6, 2),
  most_common_strategy text,
  strategy_distribution jsonb not null default '{}'::jsonb,
  safety_car_frequency numeric(6, 2),
  vsc_frequency numeric(6, 2),
  red_flag_frequency numeric(6, 2),
  chaos_score numeric(6, 2),
  overtaking_level text,
  qualifying_importance_level text,
  strategy_variability_level text,
  records_json jsonb not null default '{}'::jsonb,
  ai_preview text,
  ai_preview_status text not null default 'pending',
  ai_preview_generated_at timestamptz,
  source_errors jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circuit_id, calculated_from_season, calculated_to_season)
);

create table if not exists public.circuit_driver_stats (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid not null references public.circuits(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  season_scope text not null default 'current_active',
  starts integer not null default 0,
  wins integer not null default 0,
  podiums integer not null default 0,
  points_finishes integer not null default 0,
  dnfs integer not null default 0,
  avg_start_position numeric(5, 2),
  avg_finish_position numeric(5, 2),
  best_finish integer,
  best_start integer,
  avg_position_delta numeric(6, 2),
  total_position_delta integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circuit_id, driver_id, season_scope)
);

create table if not exists public.circuit_team_stats (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid not null references public.circuits(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  season_scope text not null default 'current_active',
  starts integer not null default 0,
  wins integer not null default 0,
  podiums integer not null default 0,
  points_finishes integer not null default 0,
  avg_points numeric(7, 2),
  best_finish integer,
  worst_finish integer,
  double_points_finishes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circuit_id, team_id, season_scope)
);

create index if not exists idx_circuit_history_circuit_season
  on public.circuit_grand_prix_history (circuit_id, season desc, round desc);

create index if not exists idx_circuit_driver_stats_circuit
  on public.circuit_driver_stats (circuit_id, wins desc, podiums desc);

create index if not exists idx_circuit_team_stats_circuit
  on public.circuit_team_stats (circuit_id, wins desc, podiums desc);

drop trigger if exists circuit_grand_prix_history_touch_updated_at on public.circuit_grand_prix_history;
create trigger circuit_grand_prix_history_touch_updated_at
before update on public.circuit_grand_prix_history
for each row execute function public.touch_updated_at();

drop trigger if exists circuit_stats_touch_updated_at on public.circuit_stats;
create trigger circuit_stats_touch_updated_at
before update on public.circuit_stats
for each row execute function public.touch_updated_at();

drop trigger if exists circuit_driver_stats_touch_updated_at on public.circuit_driver_stats;
create trigger circuit_driver_stats_touch_updated_at
before update on public.circuit_driver_stats
for each row execute function public.touch_updated_at();

drop trigger if exists circuit_team_stats_touch_updated_at on public.circuit_team_stats;
create trigger circuit_team_stats_touch_updated_at
before update on public.circuit_team_stats
for each row execute function public.touch_updated_at();

alter table public.circuit_grand_prix_history enable row level security;
alter table public.circuit_stats enable row level security;
alter table public.circuit_driver_stats enable row level security;
alter table public.circuit_team_stats enable row level security;

drop policy if exists "Public can read circuit grand prix history" on public.circuit_grand_prix_history;
create policy "Public can read circuit grand prix history" on public.circuit_grand_prix_history
for select using (true);

drop policy if exists "Public can read circuit stats" on public.circuit_stats;
create policy "Public can read circuit stats" on public.circuit_stats
for select using (true);

drop policy if exists "Public can read circuit driver stats" on public.circuit_driver_stats;
create policy "Public can read circuit driver stats" on public.circuit_driver_stats
for select using (true);

drop policy if exists "Public can read circuit team stats" on public.circuit_team_stats;
create policy "Public can read circuit team stats" on public.circuit_team_stats
for select using (true);

drop policy if exists "Admins can manage circuit grand prix history" on public.circuit_grand_prix_history;
create policy "Admins can manage circuit grand prix history" on public.circuit_grand_prix_history
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage circuit stats" on public.circuit_stats;
create policy "Admins can manage circuit stats" on public.circuit_stats
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage circuit driver stats" on public.circuit_driver_stats;
create policy "Admins can manage circuit driver stats" on public.circuit_driver_stats
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage circuit team stats" on public.circuit_team_stats;
create policy "Admins can manage circuit team stats" on public.circuit_team_stats
for all using (public.is_admin())
with check (public.is_admin());
