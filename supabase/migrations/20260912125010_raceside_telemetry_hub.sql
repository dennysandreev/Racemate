-- Telemetry is served only through the rate-limited RaceSide API. Raw datasets,
-- task payloads and anonymous share writes never get direct Data API grants.
create table public.telemetry_cache (
  key text primary key check (length(key) between 1 and 200),
  payload jsonb not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
create index telemetry_cache_expiry on public.telemetry_cache(expires_at) where expires_at is not null;
create table public.telemetry_tasks (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  task jsonb not null,
  status text not null default 'queued' check(status in ('queued','ready','failed')),
  result_key text,
  error_code text,
  job_id uuid references public.job_runs(id),
  updated_at timestamptz not null default now()
);
create table public.telemetry_comparisons (
  id text primary key check (id ~ '^[a-f0-9]{24}$'),
  comparison jsonb not null,
  created_at timestamptz not null default now()
);
create table public.telemetry_events (
  id bigint generated always as identity primary key,
  event text not null check (event in ('telemetry_open','telemetry_compare_created','telemetry_driver_selected','telemetry_lap_selected','telemetry_chart_changed','telemetry_corner_selected','telemetry_share_open','telemetry_share_generated','telemetry_permalink_created')),
  comparison_id text references public.telemetry_comparisons(id),
  created_at timestamptz not null default now()
);
create index telemetry_events_comparison_date on public.telemetry_events(comparison_id,created_at desc) where comparison_id is not null;
create index telemetry_events_date on public.telemetry_events(created_at);
alter table public.telemetry_cache enable row level security;
alter table public.telemetry_tasks enable row level security;
alter table public.telemetry_comparisons enable row level security;
alter table public.telemetry_events enable row level security;
revoke all on public.telemetry_cache, public.telemetry_tasks, public.telemetry_comparisons, public.telemetry_events from public, anon, authenticated;
grant all on public.telemetry_cache, public.telemetry_tasks, public.telemetry_comparisons, public.telemetry_events to service_role;
grant usage, select on sequence public.telemetry_events_id_seq to service_role;

-- Uses the existing worker queue and its renewable leases/retry policy. The
-- row lock serializes simultaneous cold requests across web instances.
create function public.enqueue_telemetry_task(p_key text, p_task jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_task public.telemetry_tasks; v_job uuid; v_status text;
begin
  if p_key !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_task) <> 'object' or octet_length(p_task::text)>8192 then
    raise exception 'invalid_telemetry_task';
  end if;
  insert into public.telemetry_tasks(request_key,task) values(p_key,p_task) on conflict(request_key) do nothing;
  select * into v_task from public.telemetry_tasks where request_key=p_key for update;
  if v_task.status='ready' and exists(select 1 from public.telemetry_cache where key=v_task.result_key and (expires_at is null or expires_at>now())) then return v_task.id; end if;
  if v_task.job_id is not null then
    select status into v_status from public.job_runs where id=v_task.job_id;
    if v_status in ('queued','running') then return v_task.id; end if;
    if v_status='failed' and v_task.updated_at>now()-interval '1 minute' then return v_task.id; end if;
  end if;
  insert into public.job_runs(job_name,status,queue_version,available_at,max_attempts,metadata)
    values('telemetry.prepare','queued',1,now(),3,jsonb_build_object('args',jsonb_build_object('taskId',v_task.id))) returning id into v_job;
  update public.telemetry_tasks set job_id=v_job,status='queued',error_code=null,updated_at=now() where id=v_task.id;
  return v_task.id;
end;
$$;
revoke all on function public.enqueue_telemetry_task(text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_telemetry_task(text,jsonb) to service_role;
