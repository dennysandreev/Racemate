alter table public.job_runs
  add column if not exists lease_expires_at timestamptz;

create index if not exists idx_job_runs_expired_leases
  on public.job_runs (lease_expires_at)
  where queue_version = 1 and status = 'running';

create or replace function public.claim_next_admin_job(p_worker_id text)
returns setof public.job_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_id uuid;
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker_id_required';
  end if;

  select id into selected_id
  from public.job_runs
  where queue_version = 1
    and status = 'queued'
    and available_at <= now()
    and attempt_count < max_attempts
  order by available_at asc, started_at asc
  for update skip locked
  limit 1;

  if selected_id is null then
    return;
  end if;

  return query
  update public.job_runs
  set status = 'running',
      claimed_at = now(),
      lease_expires_at = now() + interval '5 minutes',
      started_at = now(),
      worker_id = left(trim(p_worker_id), 120),
      attempt_count = attempt_count + 1,
      finished_at = null,
      error_message = null
  where id = selected_id
  returning *;
end;
$$;

revoke all on function public.claim_next_admin_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_admin_job(text) to service_role;

create or replace function public.renew_admin_job_lease(
  p_job_id uuid,
  p_worker_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  renewed boolean := false;
begin
  if p_job_id is null or nullif(trim(p_worker_id), '') is null then
    raise exception 'job_lease_identity_required';
  end if;

  update public.job_runs
  set lease_expires_at = now() + interval '5 minutes'
  where id = p_job_id
    and queue_version = 1
    and status = 'running'
    and worker_id = left(trim(p_worker_id), 120)
  returning true into renewed;

  return coalesce(renewed, false);
end;
$$;

revoke all on function public.renew_admin_job_lease(uuid, text)
from public, anon, authenticated;
grant execute on function public.renew_admin_job_lease(uuid, text)
to service_role;

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

  update public.job_runs
  set
    status = 'failed',
    finished_at = now(),
    lease_expires_at = now(),
    error_message = coalesce(error_message, 'Worker lease expired before job completion.')
  where queue_version = 1
    and status = 'running'
    and coalesce(
      lease_expires_at,
      claimed_at + interval '5 minutes',
      started_at + interval '5 minutes'
    ) <= now();

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
