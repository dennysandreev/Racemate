alter table public.admin_job_schedules
drop constraint if exists admin_job_schedules_schedule_kind_check;

alter table public.admin_job_schedules
add constraint admin_job_schedules_schedule_kind_check
check (schedule_kind in ('interval', 'daily', 'adaptive'));

alter table public.admin_job_schedules
drop constraint if exists admin_job_schedules_timing_check;

alter table public.admin_job_schedules
add constraint admin_job_schedules_timing_check check (
  (
    schedule_kind = 'interval'
    and interval_minutes between 2 and 10080
    and daily_time_utc is null
  )
  or (
    schedule_kind = 'daily'
    and interval_minutes is null
    and daily_time_utc is not null
  )
  or (
    schedule_kind = 'adaptive'
    and interval_minutes = 1440
    and daily_time_utc is null
  )
);

update public.admin_job_schedules
set
  schedule_kind = 'adaptive',
  interval_minutes = 1440,
  daily_time_utc = null,
  next_run_at = now(),
  updated_at = now()
where job_name in (
  'openf1.sync_results',
  'jolpica.sync_results',
  'reports.check_latest',
  'reports.refresh_due'
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

    if v_schedule.schedule_kind in ('interval', 'adaptive') then
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
