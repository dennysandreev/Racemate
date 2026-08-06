-- Extends the operational admin with editable AI runtime settings,
-- scoped budgets and allowlisted worker schedules.

alter table public.ai_prompt_versions
  add column if not exists model text,
  add column if not exists max_tokens integer;

alter table public.ai_prompt_versions
  drop constraint if exists ai_prompt_versions_model_check,
  drop constraint if exists ai_prompt_versions_max_tokens_check;

alter table public.ai_prompt_versions
  add constraint ai_prompt_versions_model_check
  check (
    model is null
    or (
      char_length(model) between 3 and 160
      and model ~ '^[a-zA-Z0-9._:-]+/[a-zA-Z0-9._:-]+$'
    )
  ),
  add constraint ai_prompt_versions_max_tokens_check
  check (max_tokens is null or max_tokens between 16 and 32768);

drop function if exists public.save_admin_ai_prompt_version(
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  text
);

create or replace function public.save_admin_ai_prompt_version(
  p_prompt_key text,
  p_system_prompt text,
  p_user_template text,
  p_model text,
  p_max_tokens integer,
  p_change_note text,
  p_actor uuid,
  p_publish boolean,
  p_checksum text
)
returns table (
  saved_id uuid,
  saved_version integer,
  saved_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_version integer;
  v_status text := case when p_publish then 'published' else 'draft' end;
begin
  if not exists (
    select 1
    from public.admin_users
    where user_id = p_actor
  ) then
    raise exception 'admin_required';
  end if;

  if p_prompt_key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' then
    raise exception 'invalid_prompt_key';
  end if;

  if char_length(trim(p_system_prompt)) not between 20 and 20000
    or char_length(trim(p_user_template)) not between 3 and 30000
    or trim(p_model) !~ '^[a-zA-Z0-9._:-]+/[a-zA-Z0-9._:-]+$'
    or char_length(trim(p_model)) > 160
    or p_max_tokens not between 16 and 32768
    or p_checksum !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(p_change_note, '')) > 500 then
    raise exception 'invalid_prompt_content';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_prompt_key, 0));

  select id, version
  into v_id, v_version
  from public.ai_prompt_versions
  where prompt_key = p_prompt_key
    and status = v_status
    and checksum = p_checksum
  order by version desc
  limit 1;

  if v_id is not null then
    return query select v_id, v_version, v_status;
    return;
  end if;

  select coalesce(max(version), 0) + 1
  into v_version
  from public.ai_prompt_versions
  where prompt_key = p_prompt_key;

  if p_publish then
    update public.ai_prompt_versions
    set status = 'archived'
    where prompt_key = p_prompt_key
      and status = 'published';
  end if;

  insert into public.ai_prompt_versions (
    prompt_key,
    version,
    status,
    system_prompt,
    user_template,
    model,
    max_tokens,
    change_note,
    checksum,
    created_by,
    published_by,
    published_at
  )
  values (
    p_prompt_key,
    v_version,
    v_status,
    trim(p_system_prompt),
    trim(p_user_template),
    trim(p_model),
    p_max_tokens,
    nullif(trim(coalesce(p_change_note, '')), ''),
    p_checksum,
    p_actor,
    case when p_publish then p_actor else null end,
    case when p_publish then now() else null end
  )
  returning id into v_id;

  return query select v_id, v_version, v_status;
end;
$$;

revoke all on function public.save_admin_ai_prompt_version(
  text,
  text,
  text,
  text,
  integer,
  text,
  uuid,
  boolean,
  text
) from public, anon, authenticated;
grant execute on function public.save_admin_ai_prompt_version(
  text,
  text,
  text,
  text,
  integer,
  text,
  uuid,
  boolean,
  text
) to service_role;

alter table public.admin_ai_budgets
  drop constraint if exists admin_ai_budgets_scope_check;

alter table public.admin_ai_budgets
  add constraint admin_ai_budgets_scope_check
  check (scope in ('default', 'social_x'));

insert into public.admin_ai_budgets (
  scope,
  daily_limit_usd,
  monthly_limit_usd
)
values ('social_x', 1, 20)
on conflict (scope) do nothing;

create or replace function public.get_ai_budget_guard(p_purpose text)
returns table (
  scope text,
  daily_limit_usd numeric,
  monthly_limit_usd numeric,
  daily_spend_usd numeric,
  monthly_spend_usd numeric,
  allowed boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with applicable as (
    select budget.scope, budget.daily_limit_usd, budget.monthly_limit_usd
    from public.admin_ai_budgets budget
    where budget.scope = 'default'
      or (budget.scope = 'social_x' and p_purpose = 'social.x')
  ),
  usage as (
    select
      applicable.scope,
      applicable.daily_limit_usd,
      applicable.monthly_limit_usd,
      coalesce(sum(log.estimated_cost_usd) filter (
        where log.created_at >= date_trunc('day', now())
      ), 0)::numeric as daily_spend_usd,
      coalesce(sum(log.estimated_cost_usd) filter (
        where log.created_at >= now() - interval '30 days'
      ), 0)::numeric as monthly_spend_usd
    from applicable
    left join public.ai_usage_logs log
      on (
        applicable.scope = 'default'
        or (applicable.scope = 'social_x' and log.purpose = 'social.x')
      )
      and log.created_at >= now() - interval '30 days'
    group by
      applicable.scope,
      applicable.daily_limit_usd,
      applicable.monthly_limit_usd
  )
  select
    usage.scope,
    usage.daily_limit_usd,
    usage.monthly_limit_usd,
    usage.daily_spend_usd,
    usage.monthly_spend_usd,
    usage.daily_spend_usd < usage.daily_limit_usd
      and usage.monthly_spend_usd < usage.monthly_limit_usd as allowed
  from usage;
$$;

revoke all on function public.get_ai_budget_guard(text)
from public, anon, authenticated;
grant execute on function public.get_ai_budget_guard(text)
to service_role;

create table if not exists public.admin_job_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_key text not null unique
    check (schedule_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  job_name text not null unique,
  schedule_kind text not null
    check (schedule_kind in ('interval', 'daily')),
  interval_minutes integer,
  daily_time_utc time,
  args jsonb not null default '{}'::jsonb
    check (jsonb_typeof(args) = 'object'),
  max_attempts integer not null default 2
    check (max_attempts between 1 and 10),
  is_enabled boolean not null default true,
  next_run_at timestamptz not null,
  last_enqueued_at timestamptz,
  last_job_run_id uuid references public.job_runs(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_job_schedules_timing_check check (
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
  )
);

create index if not exists idx_admin_job_schedules_due
  on public.admin_job_schedules (next_run_at)
  where is_enabled;

alter table public.admin_job_schedules enable row level security;

drop policy if exists "Admins can read job schedules"
on public.admin_job_schedules;
create policy "Admins can read job schedules"
on public.admin_job_schedules
for select
to authenticated
using (public.is_admin());

revoke insert, update, delete, truncate
on public.admin_job_schedules
from anon, authenticated;
grant select on public.admin_job_schedules to authenticated;
grant all on public.admin_job_schedules to service_role;

insert into public.admin_job_schedules (
  schedule_key,
  job_name,
  schedule_kind,
  interval_minutes,
  daily_time_utc,
  max_attempts,
  next_run_at
)
values
  ('social_fetch_all', 'social.fetch_all', 'interval', 5, null, 2, now()),
  ('social_process_ai', 'social.process_ai', 'interval', 5, null, 2, now()),
  ('social_refresh_metrics', 'social.refresh_metrics', 'interval', 30, null, 2, now()),
  ('rss_fetch_all', 'rss.fetch_all', 'interval', 30, null, 2, now()),
  ('ai_process_news', 'ai.process_news', 'interval', 30, null, 2, now()),
  ('news_retry_dedup', 'news.retry_dedup', 'interval', 30, null, 2, now()),
  ('jolpica_sync_calendar', 'jolpica.sync_calendar', 'interval', 30, null, 2, now()),
  ('jolpica_sync_results', 'jolpica.sync_results', 'interval', 30, null, 2, now()),
  ('jolpica_sync_standings', 'jolpica.sync_standings', 'interval', 30, null, 2, now()),
  ('openf1_sync_sessions', 'openf1.sync_sessions', 'interval', 30, null, 2, now()),
  ('circuit_stats_sync_all', 'circuit_stats.sync_all', 'interval', 30, null, 1, now()),
  ('weather_sync_weekend', 'weather.sync_weekend', 'interval', 30, null, 2, now()),
  ('predictions_score', 'predictions.score', 'interval', 30, null, 2, now()),
  ('reports_check_latest', 'reports.check_latest', 'interval', 30, null, 2, now()),
  ('reports_refresh_due', 'reports.refresh_due', 'interval', 30, null, 2, now()),
  ('openf1_sync_results', 'openf1.sync_results', 'interval', 5, null, 2, now()),
  ('notifications_enqueue', 'notifications.enqueue', 'interval', 5, null, 2, now()),
  ('notifications_dispatch', 'notifications.dispatch', 'interval', 5, null, 2, now()),
  ('polls_generate_next_race', 'polls.generate_next_race', 'daily', null, '00:00', 2, now()),
  (
    'ai_generate_daily_digest',
    'ai.generate_daily_digest',
    'daily',
    null,
    '12:00',
    2,
    (
      case
        when (((now() at time zone 'UTC')::date + time '12:00') at time zone 'UTC') > now()
          then ((now() at time zone 'UTC')::date + time '12:00') at time zone 'UTC'
        else ((now() at time zone 'UTC')::date + 1 + time '12:00') at time zone 'UTC'
      end
    )
  )
on conflict (schedule_key) do nothing;

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
