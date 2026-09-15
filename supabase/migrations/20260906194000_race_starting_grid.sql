create table if not exists public.race_starting_grid (
  race_id uuid not null references public.races(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  position integer not null check (position > 0),
  lap_time_text text,
  source text not null default 'openf1',
  source_session_key bigint,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (race_id, driver_id)
);

create index if not exists race_starting_grid_race_position_idx
on public.race_starting_grid (race_id, position);

alter table public.race_starting_grid enable row level security;

create policy "Starting grids are public"
on public.race_starting_grid for select
to anon, authenticated
using (true);

revoke insert, update, delete, truncate on table public.race_starting_grid from anon, authenticated;
grant select on table public.race_starting_grid to anon, authenticated;
grant all on table public.race_starting_grid to service_role;

insert into public.admin_job_schedules (
  schedule_key,
  job_name,
  schedule_kind,
  interval_minutes,
  daily_time_utc,
  args,
  max_attempts,
  is_enabled,
  next_run_at
)
values (
  'openf1_sync_starting_grid',
  'openf1.sync_starting_grid',
  'adaptive',
  1440,
  null,
  '{}'::jsonb,
  2,
  true,
  now()
)
on conflict (schedule_key) do update set
  job_name = excluded.job_name,
  schedule_kind = excluded.schedule_kind,
  interval_minutes = excluded.interval_minutes,
  daily_time_utc = excluded.daily_time_utc,
  args = excluded.args,
  max_attempts = excluded.max_attempts,
  is_enabled = excluded.is_enabled,
  next_run_at = least(public.admin_job_schedules.next_run_at, excluded.next_run_at),
  updated_at = now();

notify pgrst, 'reload schema';
