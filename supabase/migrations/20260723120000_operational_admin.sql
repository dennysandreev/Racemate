create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  outcome text not null check (outcome in ('started', 'succeeded', 'failed')),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_log_actor_created_at
  on public.admin_audit_log (actor_user_id, created_at desc);
create index if not exists idx_admin_audit_log_entity
  on public.admin_audit_log (entity_type, entity_id, created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "Admins can read audit log" on public.admin_audit_log;
create policy "Admins can read audit log" on public.admin_audit_log
for select to authenticated
using (public.is_admin());

revoke insert, update, delete, truncate on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
grant all on public.admin_audit_log to service_role;

create table if not exists public.admin_ai_budgets (
  scope text primary key check (scope = 'default'),
  daily_limit_usd numeric(10, 4) not null default 5 check (daily_limit_usd > 0),
  monthly_limit_usd numeric(10, 4) not null default 100 check (monthly_limit_usd > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.admin_ai_budgets (scope)
values ('default')
on conflict (scope) do nothing;

alter table public.admin_ai_budgets enable row level security;
drop policy if exists "Admins can read AI budgets" on public.admin_ai_budgets;
create policy "Admins can read AI budgets" on public.admin_ai_budgets
for select to authenticated
using (public.is_admin());
revoke insert, update, delete, truncate on public.admin_ai_budgets from anon, authenticated;
grant select on public.admin_ai_budgets to authenticated;
grant all on public.admin_ai_budgets to service_role;

alter table public.job_runs
  add column if not exists queue_version smallint,
  add column if not exists requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists available_at timestamptz default now(),
  add column if not exists claimed_at timestamptz,
  add column if not exists worker_id text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 1,
  add column if not exists retry_of uuid references public.job_runs(id) on delete set null,
  add column if not exists request_key text;

alter table public.job_runs
  drop constraint if exists job_runs_queue_attempts_check;
alter table public.job_runs
  add constraint job_runs_queue_attempts_check
  check (attempt_count >= 0 and max_attempts between 1 and 10);

create index if not exists idx_job_runs_admin_queue
  on public.job_runs (available_at, started_at)
  where queue_version = 1 and status = 'queued';

create unique index if not exists idx_job_runs_active_request_key
  on public.job_runs (request_key)
  where queue_version = 1
    and request_key is not null
    and status in ('queued', 'running');

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
