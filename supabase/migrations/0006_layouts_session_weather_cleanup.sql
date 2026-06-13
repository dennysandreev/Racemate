create table if not exists public.circuit_layouts (
  id uuid primary key default gen_random_uuid(),
  circuit_id uuid not null references public.circuits(id) on delete cascade,
  provider text not null default 'openf1',
  svg_path text not null,
  view_box text not null default '0 0 480 320',
  source_session_key integer,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circuit_id, provider)
);

create table if not exists public.session_weather (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  race_id uuid references public.races(id) on delete cascade,
  circuit_id uuid references public.circuits(id) on delete cascade,
  temperature_c numeric(5, 2),
  wind_speed_kmh numeric(6, 2),
  precipitation_mm numeric(6, 2),
  weather_code integer,
  forecast_at timestamptz,
  provider text not null default 'open-meteo',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, provider)
);

create index if not exists idx_circuit_layouts_circuit_id
  on public.circuit_layouts (circuit_id);

create index if not exists idx_session_weather_session_id
  on public.session_weather (session_id);

create index if not exists idx_session_weather_race_id
  on public.session_weather (race_id);

create trigger circuit_layouts_touch_updated_at
before update on public.circuit_layouts
for each row execute function public.touch_updated_at();

create trigger session_weather_touch_updated_at
before update on public.session_weather
for each row execute function public.touch_updated_at();

alter table public.circuit_layouts enable row level security;
alter table public.session_weather enable row level security;

create policy "Public can read circuit layouts" on public.circuit_layouts
for select using (true);

create policy "Admins can manage circuit layouts" on public.circuit_layouts
for all using (public.is_admin())
with check (public.is_admin());

create policy "Public can read session weather" on public.session_weather
for select using (true);

create policy "Admins can manage session weather" on public.session_weather
for all using (public.is_admin())
with check (public.is_admin());

delete from public.news_articles
where raw_payload->>'seed' = 'true'
   or canonical_url like 'https://example.com/racemate/%';
