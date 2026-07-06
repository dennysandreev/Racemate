create table if not exists public.track_maps (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid references public.circuits(id) on delete cascade,
  circuit_key text not null,
  circuit_name text not null,
  season_source integer not null,
  meeting_key integer,
  session_key integer,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circuit_key, season_source)
);

create table if not exists public.race_replay_sessions (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references public.races(id) on delete cascade,
  circuit_id uuid references public.circuits(id) on delete set null,
  track_map_id uuid references public.track_maps(id) on delete set null,
  title text not null,
  status text not null default 'preparing',
  source_season integer not null,
  source_meeting_key integer,
  source_session_key integer not null unique,
  source_session_name text,
  source_race_name text,
  source_started_at timestamptz,
  duration_ms integer,
  total_laps integer,
  snapshot jsonb not null default '{}'::jsonb,
  source_errors jsonb not null default '[]'::jsonb,
  prepared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.race_replay_events (
  id uuid primary key default gen_random_uuid(),
  replay_session_id uuid not null references public.race_replay_sessions(id) on delete cascade,
  event_time timestamptz not null,
  offset_ms integer not null,
  event_type text not null,
  driver_number integer,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_track_maps_circuit_key
  on public.track_maps (circuit_key);

create index if not exists idx_race_replay_sessions_race_id
  on public.race_replay_sessions (race_id);

create index if not exists idx_race_replay_sessions_source_session_key
  on public.race_replay_sessions (source_session_key);

create index if not exists idx_race_replay_events_session_offset
  on public.race_replay_events (replay_session_id, offset_ms);

create trigger track_maps_touch_updated_at
before update on public.track_maps
for each row execute function public.touch_updated_at();

create trigger race_replay_sessions_touch_updated_at
before update on public.race_replay_sessions
for each row execute function public.touch_updated_at();

alter table public.track_maps enable row level security;
alter table public.race_replay_sessions enable row level security;
alter table public.race_replay_events enable row level security;

create policy "Public can read track maps" on public.track_maps
for select using (true);

create policy "Admins can manage track maps" on public.track_maps
for all using (public.is_admin())
with check (public.is_admin());

create policy "Public can read ready replay sessions" on public.race_replay_sessions
for select using (status = 'ready');

create policy "Admins can manage replay sessions" on public.race_replay_sessions
for all using (public.is_admin())
with check (public.is_admin());

create policy "Public can read replay events" on public.race_replay_events
for select using (
  exists (
    select 1
    from public.race_replay_sessions session
    where session.id = race_replay_events.replay_session_id
      and session.status = 'ready'
  )
);

create policy "Admins can manage replay events" on public.race_replay_events
for all using (public.is_admin())
with check (public.is_admin());
