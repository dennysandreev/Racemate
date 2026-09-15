alter table public.races
  add column if not exists tyre_hard_compound text,
  add column if not exists tyre_medium_compound text,
  add column if not exists tyre_soft_compound text,
  add column if not exists tyre_allocation_source_url text,
  add column if not exists tyre_allocation_updated_at timestamptz;

alter table public.races
  drop constraint if exists races_tyre_hard_compound_check,
  drop constraint if exists races_tyre_medium_compound_check,
  drop constraint if exists races_tyre_soft_compound_check;

alter table public.races
  add constraint races_tyre_hard_compound_check
    check (tyre_hard_compound is null or tyre_hard_compound ~ '^C[1-6]$'),
  add constraint races_tyre_medium_compound_check
    check (tyre_medium_compound is null or tyre_medium_compound ~ '^C[1-6]$'),
  add constraint races_tyre_soft_compound_check
    check (tyre_soft_compound is null or tyre_soft_compound ~ '^C[1-6]$');

update public.races
set
  tyre_hard_compound = 'C2',
  tyre_medium_compound = 'C3',
  tyre_soft_compound = 'C4',
  tyre_allocation_source_url = 'https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2026-spanish-grand-prix.2vlcVOBnZUFRCooVcqWG7n',
  tyre_allocation_updated_at = now()
where season_year = 2026
  and round = 14;

update public.races
set
  tyre_hard_compound = 'C3',
  tyre_medium_compound = 'C4',
  tyre_soft_compound = 'C5',
  tyre_allocation_source_url = 'https://press.pirelli.com/complete-f1-tyre-range-for-the-first-three-grands-prix-of-2026/',
  tyre_allocation_updated_at = now()
where season_year = 2026
  and round = 1
  and tyre_hard_compound is null;

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
  'formula1_sync_tyre_allocations',
  'formula1.sync_tyre_allocations',
  'interval',
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
