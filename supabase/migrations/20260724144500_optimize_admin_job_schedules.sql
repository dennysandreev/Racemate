update public.admin_job_schedules
set
  schedule_kind = 'interval',
  interval_minutes = case schedule_key
    when 'social_refresh_metrics' then 60
    when 'jolpica_sync_calendar' then 360
    when 'jolpica_sync_results' then 60
    when 'jolpica_sync_standings' then 360
    when 'openf1_sync_sessions' then 360
    when 'weather_sync_weekend' then 180
    when 'reports_check_latest' then 60
    when 'reports_refresh_due' then 60
    else interval_minutes
  end,
  daily_time_utc = null,
  next_run_at = now() + make_interval(
    mins => case schedule_key
      when 'social_refresh_metrics' then 60
      when 'jolpica_sync_calendar' then 360
      when 'jolpica_sync_results' then 60
      when 'jolpica_sync_standings' then 360
      when 'openf1_sync_sessions' then 360
      when 'weather_sync_weekend' then 180
      when 'reports_check_latest' then 60
      when 'reports_refresh_due' then 60
      else interval_minutes
    end
  ),
  updated_at = now()
where schedule_key in (
  'social_refresh_metrics',
  'jolpica_sync_calendar',
  'jolpica_sync_results',
  'jolpica_sync_standings',
  'openf1_sync_sessions',
  'weather_sync_weekend',
  'reports_check_latest',
  'reports_refresh_due'
);

update public.admin_job_schedules
set
  schedule_kind = 'daily',
  interval_minutes = null,
  daily_time_utc = '02:10',
  next_run_at = case
    when (((now() at time zone 'UTC')::date + time '02:10') at time zone 'UTC') > now()
      then ((now() at time zone 'UTC')::date + time '02:10') at time zone 'UTC'
    else ((now() at time zone 'UTC')::date + 1 + time '02:10') at time zone 'UTC'
  end,
  updated_at = now()
where schedule_key = 'news_retry_dedup';

update public.admin_job_schedules
set
  is_enabled = false,
  next_run_at = now() + interval '7 days',
  updated_at = now()
where schedule_key in (
  'circuit_stats_sync_all',
  'notifications_dispatch'
);

create or replace function public.enqueue_due_admin_schedules(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.admin_job_schedules%rowtype;
  v_run_id uuid;
  v_next_run_at timestamptz;
  v_count integer := 0;
begin
  if p_limit not between 1 and 100 then
    raise exception 'invalid_schedule_limit';
  end if;

  for v_schedule in
    select *
    from public.admin_job_schedules
    where is_enabled
      and next_run_at <= now()
    order by next_run_at
    for update skip locked
    limit p_limit
  loop
    v_run_id := null;

    if not exists (
      select 1
      from public.job_runs
      where job_name = v_schedule.job_name
        and queue_version = 1
        and status in ('queued', 'running')
    ) then
      insert into public.job_runs (
        job_name,
        status,
        queue_version,
        available_at,
        max_attempts,
        request_key,
        metadata
      )
      values (
        v_schedule.job_name,
        'queued',
        1,
        now(),
        v_schedule.max_attempts,
        'schedule:' || v_schedule.schedule_key || ':' || extract(epoch from v_schedule.next_run_at)::bigint,
        jsonb_build_object(
          'source', 'schedule',
          'scheduleKey', v_schedule.schedule_key,
          'args', v_schedule.args
        )
      )
      on conflict (request_key)
        where queue_version = 1
          and request_key is not null
          and status in ('queued', 'running')
      do nothing
      returning id into v_run_id;
    end if;

    if v_schedule.schedule_kind = 'interval' then
      v_next_run_at := greatest(
        v_schedule.next_run_at + make_interval(mins => v_schedule.interval_minutes),
        now() + make_interval(mins => v_schedule.interval_minutes)
      );
    else
      v_next_run_at :=
        ((now() at time zone 'UTC')::date + v_schedule.daily_time_utc)
        at time zone 'UTC';
      if v_next_run_at <= now() then
        v_next_run_at := v_next_run_at + interval '1 day';
      end if;
    end if;

    update public.admin_job_schedules
    set
      next_run_at = v_next_run_at,
      last_enqueued_at = case when v_run_id is null then last_enqueued_at else now() end,
      last_job_run_id = coalesce(v_run_id, last_job_run_id),
      updated_at = now()
    where id = v_schedule.id;

    if v_run_id is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_due_admin_schedules(integer)
from public, anon, authenticated;
grant execute on function public.enqueue_due_admin_schedules(integer)
to service_role;
