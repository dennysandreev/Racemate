-- LIVE history is written only by the ingest service. Public access is through
-- the bounded RaceSide API; raw high-frequency tables are not exposed to browsers.
create table public.live_sessions (
  session_key integer primary key,
  meeting_key integer,
  race_id uuid references public.races(id) on delete set null,
  metadata jsonb not null,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.live_location (
  session_key integer not null references public.live_sessions(session_key),
  driver_number integer not null,
  timestamp timestamptz not null,
  x double precision not null, y double precision not null, z double precision,
  primary key (session_key, driver_number, timestamp)
);
create table public.live_car_data (
  session_key integer not null references public.live_sessions(session_key),
  driver_number integer not null,
  timestamp timestamptz not null,
  speed real, throttle real, brake real, rpm integer, gear smallint, drs smallint,
  primary key (session_key, driver_number, timestamp)
);
create table public.live_events (
  id text primary key,
  session_key integer not null references public.live_sessions(session_key),
  timestamp timestamptz not null,
  topic text not null,
  driver_number integer,
  payload jsonb not null
);
create index live_events_session_time on public.live_events(session_key, timestamp, id);
create table public.live_radio_text (
  id text primary key,
  session_key integer not null references public.live_sessions(session_key),
  meeting_key integer,
  driver_number integer,
  timestamp timestamptz not null,
  lap integer,
  original text,
  ru text,
  status text not null check (status in ('received','transcribing','ready','failed')),
  duration real,
  cost_usd numeric not null default 0
);
create index live_radio_text_session_time on public.live_radio_text(session_key, timestamp, id);
create index live_sessions_race on public.live_sessions(race_id);
alter table public.live_sessions enable row level security;
alter table public.live_location enable row level security;
alter table public.live_car_data enable row level security;
alter table public.live_events enable row level security;
alter table public.live_radio_text enable row level security;
revoke all on public.live_sessions, public.live_location, public.live_car_data, public.live_events, public.live_radio_text from anon, authenticated;
grant all on public.live_sessions, public.live_location, public.live_car_data, public.live_events, public.live_radio_text to service_role;
