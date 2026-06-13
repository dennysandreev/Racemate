create table if not exists public.circuit_weather (
  id uuid primary key default gen_random_uuid(),
  race_id uuid references public.races(id) on delete cascade,
  circuit_id uuid references public.circuits(id) on delete cascade,
  temperature_c numeric(5, 2),
  wind_speed_kmh numeric(6, 2),
  precipitation_mm numeric(6, 2),
  weather_code integer,
  observed_at timestamptz,
  provider text not null default 'open-meteo',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (race_id, provider)
);

create index if not exists idx_circuit_weather_race_id on public.circuit_weather (race_id);
create index if not exists idx_circuit_weather_observed_at on public.circuit_weather (observed_at desc);

create trigger circuit_weather_touch_updated_at
before update on public.circuit_weather
for each row execute function public.touch_updated_at();

alter table public.circuit_weather enable row level security;

create policy "Public can read circuit weather" on public.circuit_weather
for select using (true);

create policy "Admins can manage circuit weather" on public.circuit_weather
for all using (public.is_admin())
with check (public.is_admin());
