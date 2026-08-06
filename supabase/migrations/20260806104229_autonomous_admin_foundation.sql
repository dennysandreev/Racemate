-- Autonomous administration foundation. All operational payloads stored in these
-- tables must already be scrubbed of secrets and personal data by the caller.

create table if not exists public.ops_service_heartbeats (
  service_name text not null
    check (service_name in ('web', 'worker', 'cron', 'admin-job-runner', 'watcher')),
  instance_id text not null
    check (char_length(instance_id) between 1 and 160),
  release_sha text
    check (release_sha is null or release_sha ~ '^[0-9a-f]{7,64}$'),
  status text not null default 'healthy'
    check (status in ('healthy', 'degraded', 'unhealthy')),
  summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object'),
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_name, instance_id)
);

create index if not exists idx_ops_service_heartbeats_service_checked
  on public.ops_service_heartbeats (service_name, checked_at desc);

create index if not exists idx_ops_service_heartbeats_stale
  on public.ops_service_heartbeats (checked_at asc);

alter table public.ops_service_heartbeats enable row level security;

drop policy if exists "Admins can read service heartbeats"
on public.ops_service_heartbeats;
create policy "Admins can read service heartbeats"
on public.ops_service_heartbeats
for select
to authenticated
using (public.is_admin());

revoke all on table public.ops_service_heartbeats from public, anon;
revoke insert, update, delete, truncate, references, trigger
on table public.ops_service_heartbeats
from authenticated;
revoke select on table public.ops_service_heartbeats from authenticated;
grant select, insert, update, delete on table public.ops_service_heartbeats to service_role;

create table if not exists public.admin_agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_kind text not null
    check (run_kind in ('watcher', 'browser_smoke', 'editorial', 'bug_triage', 'weekly_audit')),
  trigger_kind text not null
    check (trigger_kind in ('schedule', 'deploy', 'manual', 'finding')),
  trigger_finding_id uuid,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed')),
  counters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(counters) = 'object'),
  ruleset_version text
    check (ruleset_version is null or char_length(ruleset_version) between 1 and 80),
  release_sha text
    check (release_sha is null or release_sha ~ '^[0-9a-f]{7,64}$'),
  error_code text
    check (error_code is null or char_length(error_code) between 1 and 120),
  error_message text
    check (error_message is null or char_length(error_message) <= 1000),
  ai_cost_usd numeric(12, 6) not null default 0
    check (ai_cost_usd >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer
    check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  constraint admin_agent_runs_finished_check check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  )
);

create index if not exists idx_admin_agent_runs_started
  on public.admin_agent_runs (started_at desc);

create index if not exists idx_admin_agent_runs_status_started
  on public.admin_agent_runs (status, started_at desc);

create index if not exists idx_admin_agent_runs_trigger_finding
  on public.admin_agent_runs (trigger_finding_id)
  where trigger_finding_id is not null;

alter table public.admin_agent_runs enable row level security;

drop policy if exists "Admins can read agent runs"
on public.admin_agent_runs;
create policy "Admins can read agent runs"
on public.admin_agent_runs
for select
to authenticated
using (public.is_admin());

revoke all on table public.admin_agent_runs from public, anon;
revoke insert, update, delete, truncate, references, trigger
on table public.admin_agent_runs
from authenticated;
revoke select on table public.admin_agent_runs from authenticated;
grant select, insert, update, delete on table public.admin_agent_runs to service_role;

create table if not exists public.admin_findings (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null
    check (fingerprint ~ '^[0-9a-f]{64}$'),
  category text not null
    check (category in ('availability', 'data', 'job', 'content', 'browser', 'security', 'cost', 'ux', 'seo')),
  severity text not null
    check (severity in ('P0', 'P1', 'P2', 'P3')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'action_pending', 'fixing', 'monitoring', 'resolved', 'ignored')),
  title text not null
    check (char_length(title) between 1 and 180),
  description text not null
    check (char_length(description) between 1 and 4000),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  route text
    check (route is null or char_length(route) <= 500),
  entity_type text
    check (entity_type is null or char_length(entity_type) <= 80),
  entity_id text
    check (entity_id is null or char_length(entity_id) <= 200),
  job_run_id uuid references public.job_runs(id) on delete set null,
  release_sha text
    check (release_sha is null or release_sha ~ '^[0-9a-f]{7,64}$'),
  owner_kind text not null default 'agent'
    check (owner_kind in ('agent', 'human')),
  owner_user_id uuid references public.profiles(id) on delete set null,
  github_issue_url text
    check (github_issue_url is null or char_length(github_issue_url) <= 1000),
  github_pr_url text
    check (github_pr_url is null or char_length(github_pr_url) <= 1000),
  resolution text
    check (resolution is null or char_length(resolution) <= 4000),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count integer not null default 1
    check (occurrence_count >= 1),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_findings_status_resolution_check check (
    (status in ('resolved', 'ignored') and resolved_at is not null)
    or (status not in ('resolved', 'ignored') and resolved_at is null)
  )
);

alter table public.admin_agent_runs
  drop constraint if exists admin_agent_runs_trigger_finding_fkey;

alter table public.admin_agent_runs
  add constraint admin_agent_runs_trigger_finding_fkey
  foreign key (trigger_finding_id)
  references public.admin_findings(id)
  on delete set null;

create unique index if not exists idx_admin_findings_active_fingerprint
  on public.admin_findings (fingerprint)
  where status not in ('resolved', 'ignored');

create index if not exists idx_admin_findings_status_severity_seen
  on public.admin_findings (status, severity, last_seen_at desc);

create index if not exists idx_admin_findings_category_seen
  on public.admin_findings (category, last_seen_at desc);

create index if not exists idx_admin_findings_job_run
  on public.admin_findings (job_run_id)
  where job_run_id is not null;

create index if not exists idx_admin_findings_owner_user
  on public.admin_findings (owner_user_id)
  where owner_user_id is not null;

alter table public.admin_findings enable row level security;

drop policy if exists "Admins can read findings"
on public.admin_findings;
create policy "Admins can read findings"
on public.admin_findings
for select
to authenticated
using (public.is_admin());

revoke all on table public.admin_findings from public, anon;
revoke insert, update, delete, truncate, references, trigger
on table public.admin_findings
from authenticated;
revoke select on table public.admin_findings from authenticated;
grant select, insert, update, delete on table public.admin_findings to service_role;

create table if not exists public.admin_finding_events (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.admin_findings(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'detected',
      'repeated',
      'severity_changed',
      'action_requested',
      'action_started',
      'action_succeeded',
      'action_failed',
      'fix_pr_opened',
      'acknowledged',
      'resolved',
      'reopened'
    )),
  actor_kind text not null default 'agent'
    check (actor_kind in ('agent', 'human', 'system')),
  actor_user_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_finding_events_finding_created
  on public.admin_finding_events (finding_id, created_at desc);

create index if not exists idx_admin_finding_events_actor_user
  on public.admin_finding_events (actor_user_id)
  where actor_user_id is not null;

alter table public.admin_finding_events enable row level security;

drop policy if exists "Admins can read finding events"
on public.admin_finding_events;
create policy "Admins can read finding events"
on public.admin_finding_events
for select
to authenticated
using (public.is_admin());

revoke all on table public.admin_finding_events from public, anon;
revoke insert, update, delete, truncate, references, trigger
on table public.admin_finding_events
from authenticated;
revoke select on table public.admin_finding_events from authenticated;
grant select, insert on table public.admin_finding_events to service_role;

create table if not exists public.admin_action_requests (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.admin_findings(id) on delete cascade,
  action_name text not null
    check (action_name ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  action_args jsonb not null default '{}'::jsonb
    check (jsonb_typeof(action_args) = 'object'),
  risk_class text not null
    check (risk_class in ('R1', 'R2', 'R3', 'R4', 'R5')),
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'running', 'succeeded', 'failed', 'rejected')),
  idempotency_key text not null
    check (char_length(idempotency_key) between 8 and 200),
  requested_by_kind text not null default 'agent'
    check (requested_by_kind in ('agent', 'human', 'system')),
  requested_by_user_id uuid references public.profiles(id) on delete set null,
  approved_by_user_id uuid references public.profiles(id) on delete set null,
  job_run_id uuid references public.job_runs(id) on delete set null,
  result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object'),
  error_code text
    check (error_code is null or char_length(error_code) between 1 and 120),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint admin_action_requests_human_approval_check check (
    risk_class in ('R1', 'R2')
    or status = 'proposed'
    or approved_by_user_id is not null
  )
);

create unique index if not exists idx_admin_action_requests_idempotency
  on public.admin_action_requests (idempotency_key);

create index if not exists idx_admin_action_requests_finding_created
  on public.admin_action_requests (finding_id, created_at desc);

create index if not exists idx_admin_action_requests_status_created
  on public.admin_action_requests (status, created_at desc);

create index if not exists idx_admin_action_requests_requested_by
  on public.admin_action_requests (requested_by_user_id)
  where requested_by_user_id is not null;

create index if not exists idx_admin_action_requests_approved_by
  on public.admin_action_requests (approved_by_user_id)
  where approved_by_user_id is not null;

create index if not exists idx_admin_action_requests_job_run
  on public.admin_action_requests (job_run_id)
  where job_run_id is not null;

alter table public.admin_action_requests enable row level security;

drop policy if exists "Admins can read action requests"
on public.admin_action_requests;
create policy "Admins can read action requests"
on public.admin_action_requests
for select
to authenticated
using (public.is_admin());

revoke all on table public.admin_action_requests from public, anon;
revoke insert, update, delete, truncate, references, trigger
on table public.admin_action_requests
from authenticated;
revoke select on table public.admin_action_requests from authenticated;
grant select, insert, update, delete on table public.admin_action_requests to service_role;

create or replace function public.record_admin_finding(
  p_fingerprint text,
  p_category text,
  p_severity text,
  p_title text,
  p_description text,
  p_evidence jsonb default '{}'::jsonb,
  p_route text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_job_run_id uuid default null,
  p_release_sha text default null
)
returns table (
  finding_id uuid,
  was_created boolean,
  current_status text,
  current_occurrence_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_finding public.admin_findings%rowtype;
  v_next_severity text;
  v_next_status text;
  v_event_type text;
  v_previous_severity text;
  v_previous_status text;
begin
  if p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_finding_fingerprint';
  end if;
  if p_category not in (
    'availability', 'data', 'job', 'content', 'browser', 'security', 'cost', 'ux', 'seo'
  ) then
    raise exception 'invalid_finding_category';
  end if;
  if p_severity not in ('P0', 'P1', 'P2', 'P3') then
    raise exception 'invalid_finding_severity';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));

  select *
  into v_finding
  from public.admin_findings
  where fingerprint = p_fingerprint
  order by (status not in ('resolved', 'ignored')) desc, last_seen_at desc
  limit 1
  for update;

  if v_finding.id is null then
    insert into public.admin_findings (
      fingerprint,
      category,
      severity,
      title,
      description,
      evidence,
      route,
      entity_type,
      entity_id,
      job_run_id,
      release_sha
    )
    values (
      p_fingerprint,
      p_category,
      p_severity,
      p_title,
      p_description,
      p_evidence,
      p_route,
      p_entity_type,
      p_entity_id,
      p_job_run_id,
      p_release_sha
    )
    returning * into v_finding;

    insert into public.admin_finding_events (
      finding_id,
      event_type,
      payload
    )
    values (
      v_finding.id,
      'detected',
      jsonb_build_object(
        'occurrenceCount', v_finding.occurrence_count,
        'severity', v_finding.severity
      )
    );

    return query
    select v_finding.id, true, v_finding.status, v_finding.occurrence_count;
    return;
  end if;

  v_previous_severity := v_finding.severity;
  v_previous_status := v_finding.status;
  v_next_severity := case
    when array_position(array['P0', 'P1', 'P2', 'P3'], p_severity)
      < array_position(array['P0', 'P1', 'P2', 'P3'], v_finding.severity)
      then p_severity
    else v_finding.severity
  end;
  v_next_status := case
    when v_finding.status in ('resolved', 'monitoring') then 'open'
    else v_finding.status
  end;
  v_event_type := case
    when v_finding.status in ('resolved', 'monitoring') then 'reopened'
    when v_next_severity <> v_finding.severity then 'severity_changed'
    else 'repeated'
  end;

  update public.admin_findings
  set category = p_category,
      severity = v_next_severity,
      status = v_next_status,
      title = p_title,
      description = p_description,
      evidence = p_evidence,
      route = p_route,
      entity_type = p_entity_type,
      entity_id = p_entity_id,
      job_run_id = p_job_run_id,
      release_sha = p_release_sha,
      last_seen_at = now(),
      occurrence_count = occurrence_count + 1,
      resolved_at = case when v_next_status = 'open' then null else resolved_at end,
      resolution = case when v_next_status = 'open' then null else resolution end,
      updated_at = now()
  where id = v_finding.id
  returning * into v_finding;

  insert into public.admin_finding_events (
    finding_id,
    event_type,
    payload
  )
  values (
    v_finding.id,
    v_event_type,
    jsonb_build_object(
      'occurrenceCount', v_finding.occurrence_count,
      'previousSeverity', v_previous_severity,
      'previousStatus', v_previous_status,
      'severity', v_next_severity,
      'status', v_next_status
    )
  );

  return query
  select v_finding.id, false, v_finding.status, v_finding.occurrence_count;
end;
$$;

revoke all on function public.record_admin_finding(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.record_admin_finding(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  uuid,
  text
) to service_role;
