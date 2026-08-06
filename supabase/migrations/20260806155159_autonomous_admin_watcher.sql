-- Runtime controls and atomic lifecycle helpers for the deterministic operations watcher.
-- The singleton starts in shadow mode. Limited R2 actions must be enabled separately
-- after the documented observation period; this migration never enables them.

create table if not exists public.admin_agent_settings (
  singleton boolean primary key default true check (singleton),
  is_enabled boolean not null default true,
  mode text not null default 'shadow' check (mode in ('shadow', 'recommend', 'limited')),
  telegram_alerts_enabled boolean not null default true,
  r2_actions_enabled boolean not null default false,
  shadow_started_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.admin_agent_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.admin_agent_settings enable row level security;

revoke all on table public.admin_agent_settings from public, anon, authenticated;
grant select, insert, update on table public.admin_agent_settings to service_role;

alter table public.admin_findings
  add column if not exists last_alerted_at timestamptz;

alter table public.admin_findings
  add column if not exists alert_count integer not null default 0
    check (alert_count >= 0);

alter table public.admin_finding_events
  drop constraint if exists admin_finding_events_event_type_check;

alter table public.admin_finding_events
  add constraint admin_finding_events_event_type_check
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
    'ignored',
    'reopened',
    'alert_sent'
  ));

create or replace function public.transition_admin_finding(
  p_finding_id uuid,
  p_status text,
  p_actor_kind text default 'system',
  p_actor_user_id uuid default null,
  p_resolution text default null
)
returns public.admin_findings
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_finding public.admin_findings%rowtype;
begin
  if p_status not in ('open', 'acknowledged', 'monitoring', 'resolved', 'ignored') then
    raise exception 'invalid_finding_transition';
  end if;
  if p_actor_kind not in ('agent', 'human', 'system') then
    raise exception 'invalid_finding_actor';
  end if;

  update public.admin_findings
  set status = p_status,
      owner_kind = case when p_actor_kind = 'human' then 'human' else owner_kind end,
      owner_user_id = case when p_actor_kind = 'human' then p_actor_user_id else owner_user_id end,
      resolution = case
        when p_status in ('resolved', 'ignored') then left(coalesce(p_resolution, ''), 4000)
        else null
      end,
      resolved_at = case when p_status in ('resolved', 'ignored') then now() else null end,
      updated_at = now()
  where id = p_finding_id
  returning * into v_finding;

  if v_finding.id is null then
    raise exception 'finding_not_found';
  end if;

  insert into public.admin_finding_events (
    finding_id,
    event_type,
    actor_kind,
    actor_user_id,
    payload
  ) values (
    v_finding.id,
    case
      when p_status = 'acknowledged' then 'acknowledged'
      when p_status = 'ignored' then 'ignored'
      when p_status = 'resolved' then 'resolved'
      else 'reopened'
    end,
    p_actor_kind,
    p_actor_user_id,
    jsonb_build_object('status', p_status, 'resolution', p_resolution)
  );

  return v_finding;
end;
$$;

revoke all on function public.transition_admin_finding(uuid, text, text, uuid, text)
from public, anon, authenticated;
grant execute on function public.transition_admin_finding(uuid, text, text, uuid, text)
to service_role;

create or replace function public.mark_admin_finding_alerted(p_finding_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.admin_findings
  set last_alerted_at = now(),
      alert_count = alert_count + 1,
      updated_at = now()
  where id = p_finding_id;

  insert into public.admin_finding_events (
    finding_id,
    event_type,
    actor_kind,
    payload
  ) values (
    p_finding_id,
    'alert_sent',
    'system',
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.mark_admin_finding_alerted(uuid)
from public, anon, authenticated;
grant execute on function public.mark_admin_finding_alerted(uuid)
to service_role;
