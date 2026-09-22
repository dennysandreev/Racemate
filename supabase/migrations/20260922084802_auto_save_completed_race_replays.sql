-- Recovery also runs when LIVE missed the finish or the worker restarted.
insert into public.admin_job_schedules (
  schedule_key, job_name, schedule_kind, interval_minutes,
  args, max_attempts, is_enabled, next_run_at
)
values (
  'race_replay_prepare_completed', 'race_replay.prepare_completed', 'interval', 1440,
  '{}'::jsonb, 3, true, now()
)
on conflict (job_name) do nothing;
