insert into public.admin_job_schedules(
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
  'billing_reconcile_yoomoney',
  'billing.reconcile_yoomoney',
  'interval',
  2,
  null,
  '{}'::jsonb,
  2,
  true,
  now()
)
on conflict (schedule_key) do update
set job_name = excluded.job_name,
    schedule_kind = excluded.schedule_kind,
    interval_minutes = excluded.interval_minutes,
    daily_time_utc = excluded.daily_time_utc,
    args = excluded.args,
    max_attempts = excluded.max_attempts,
    is_enabled = excluded.is_enabled,
    next_run_at = least(public.admin_job_schedules.next_run_at, excluded.next_run_at),
    updated_at = now();
