-- External API cost accounting, public error reports, and the daily support report.

create table if not exists public.admin_external_api_costs (
  provider text primary key
    check (provider in ('x')),
  resource_type text not null
    check (resource_type in ('post_read')),
  unit_cost_usd numeric(18, 8) not null
    check (unit_cost_usd > 0 and unit_cost_usd <= 100),
  daily_limit_usd numeric(12, 2) not null
    check (daily_limit_usd > 0),
  monthly_limit_usd numeric(12, 2) not null
    check (monthly_limit_usd >= daily_limit_usd),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.admin_external_api_costs (
  provider,
  resource_type,
  unit_cost_usd,
  daily_limit_usd,
  monthly_limit_usd
)
values ('x', 'post_read', 0.005, 5, 50)
on conflict (provider) do nothing;

create table if not exists public.external_api_usage_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in ('x')),
  resource_type text not null
    check (resource_type in ('post_read')),
  resource_id text not null
    check (char_length(resource_id) between 1 and 200),
  billing_date date not null,
  source_id uuid references public.social_sources(id) on delete set null,
  unit_cost_usd numeric(18, 8) not null
    check (unit_cost_usd > 0 and unit_cost_usd <= 100),
  estimated_cost_usd numeric(18, 8) not null
    check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now(),
  unique (provider, resource_type, resource_id, billing_date)
);

create index if not exists idx_external_api_usage_events_provider_date
  on public.external_api_usage_events (provider, billing_date desc);

-- Seed an approximate history from the X posts already stored by RaceSide.
insert into public.external_api_usage_events (
  provider,
  resource_type,
  resource_id,
  billing_date,
  source_id,
  unit_cost_usd,
  estimated_cost_usd,
  created_at
)
select
  'x',
  'post_read',
  post.external_id,
  (post.created_at at time zone 'UTC')::date,
  post.source_id,
  settings.unit_cost_usd,
  settings.unit_cost_usd,
  post.created_at
from public.social_posts post
cross join public.admin_external_api_costs settings
where post.platform = 'x'
  and settings.provider = 'x'
on conflict (provider, resource_type, resource_id, billing_date) do nothing;

create or replace function public.get_admin_cost_timeline(
  p_since timestamptz
)
returns table (
  day date,
  ai_cost_usd numeric,
  x_api_cost_usd numeric,
  x_post_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(
      date_trunc('day', p_since at time zone 'UTC'),
      date_trunc('day', now() at time zone 'UTC'),
      interval '1 day'
    )::date as day
  ),
  ai as (
    select
      (log.created_at at time zone 'UTC')::date as day,
      coalesce(sum(log.estimated_cost_usd), 0)::numeric as cost_usd
    from public.ai_usage_logs log
    where log.created_at >= p_since
    group by 1
  ),
  x_usage as (
    select
      event.billing_date as day,
      coalesce(sum(event.estimated_cost_usd), 0)::numeric as cost_usd,
      count(*)::bigint as post_count
    from public.external_api_usage_events event
    where event.provider = 'x'
      and event.resource_type = 'post_read'
      and event.billing_date >= (p_since at time zone 'UTC')::date
    group by 1
  )
  select
    days.day,
    coalesce(ai.cost_usd, 0)::numeric,
    coalesce(x_usage.cost_usd, 0)::numeric,
    coalesce(x_usage.post_count, 0)::bigint
  from days
  left join ai using (day)
  left join x_usage using (day)
  order by days.day;
$$;

revoke all on function public.get_admin_cost_timeline(timestamptz)
from public, anon, authenticated;
grant execute on function public.get_admin_cost_timeline(timestamptz)
to service_role;

create or replace function public.get_x_api_budget_guard()
returns table (
  unit_cost_usd numeric,
  daily_limit_usd numeric,
  monthly_limit_usd numeric,
  daily_post_count bigint,
  monthly_post_count bigint,
  daily_spend_usd numeric,
  monthly_spend_usd numeric,
  allowed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    settings.unit_cost_usd,
    settings.daily_limit_usd,
    settings.monthly_limit_usd,
    count(event.id) filter (
      where event.billing_date = (now() at time zone 'UTC')::date
    )::bigint,
    count(event.id) filter (
      where event.billing_date >= ((now() at time zone 'UTC')::date - 29)
    )::bigint,
    coalesce(sum(event.estimated_cost_usd) filter (
      where event.billing_date = (now() at time zone 'UTC')::date
    ), 0)::numeric,
    coalesce(sum(event.estimated_cost_usd) filter (
      where event.billing_date >= ((now() at time zone 'UTC')::date - 29)
    ), 0)::numeric,
    coalesce(sum(event.estimated_cost_usd) filter (
      where event.billing_date = (now() at time zone 'UTC')::date
    ), 0) < settings.daily_limit_usd
      and coalesce(sum(event.estimated_cost_usd) filter (
        where event.billing_date >= ((now() at time zone 'UTC')::date - 29)
      ), 0) < settings.monthly_limit_usd
  from public.admin_external_api_costs settings
  left join public.external_api_usage_events event
    on event.provider = settings.provider
    and event.resource_type = settings.resource_type
    and event.billing_date >= ((now() at time zone 'UTC')::date - 29)
  where settings.provider = 'x'
  group by
    settings.unit_cost_usd,
    settings.daily_limit_usd,
    settings.monthly_limit_usd;
$$;

revoke all on function public.get_x_api_budget_guard()
from public, anon, authenticated;
grant execute on function public.get_x_api_budget_guard()
to service_role;

-- AI limits now cover AI calls only. X API reads have their own independent limit.
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
stable
security definer
set search_path = ''
as $$
  select
    budget.scope,
    budget.daily_limit_usd,
    budget.monthly_limit_usd,
    coalesce(sum(log.estimated_cost_usd) filter (
      where log.created_at >= date_trunc('day', now())
    ), 0)::numeric,
    coalesce(sum(log.estimated_cost_usd) filter (
      where log.created_at >= now() - interval '30 days'
    ), 0)::numeric,
    coalesce(sum(log.estimated_cost_usd) filter (
      where log.created_at >= date_trunc('day', now())
    ), 0) < budget.daily_limit_usd
      and coalesce(sum(log.estimated_cost_usd) filter (
        where log.created_at >= now() - interval '30 days'
      ), 0) < budget.monthly_limit_usd
  from public.admin_ai_budgets budget
  left join public.ai_usage_logs log
    on log.created_at >= now() - interval '30 days'
  where budget.scope = 'default'
  group by budget.scope, budget.daily_limit_usd, budget.monthly_limit_usd;
$$;

revoke all on function public.get_ai_budget_guard(text)
from public, anon, authenticated;
grant execute on function public.get_ai_budget_guard(text)
to service_role;

create table if not exists public.user_error_reports (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.news_articles(id) on delete set null,
  reporter_user_id uuid references public.profiles(id) on delete set null,
  message text not null
    check (char_length(message) between 10 and 2000),
  page_path text not null
    check (char_length(page_path) between 1 and 500),
  article_slug text not null
    check (char_length(article_slug) between 1 and 240),
  article_title text not null
    check (char_length(article_title) between 1 and 240),
  source_name text
    check (source_name is null or char_length(source_name) <= 160),
  user_agent text
    check (user_agent is null or char_length(user_agent) <= 500),
  referrer_path text
    check (referrer_path is null or char_length(referrer_path) <= 500),
  request_fingerprint text
    check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'),
  release_sha text
    check (release_sha is null or release_sha ~ '^[0-9a-f]{7,64}$'),
  technical_context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(technical_context) = 'object'),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'resolved', 'dismissed')),
  admin_note text
    check (admin_note is null or char_length(admin_note) <= 2000),
  telegram_status text not null default 'pending'
    check (telegram_status in ('pending', 'sent', 'failed', 'not_configured')),
  telegram_error text
    check (telegram_error is null or char_length(telegram_error) <= 500),
  telegram_sent_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_error_reports_status_created_at
  on public.user_error_reports (status, created_at desc);
create index if not exists idx_user_error_reports_article_created_at
  on public.user_error_reports (article_id, created_at desc);
create index if not exists idx_user_error_reports_reporter_created_at
  on public.user_error_reports (reporter_user_id, created_at desc)
  where reporter_user_id is not null;
create index if not exists idx_user_error_reports_fingerprint_created_at
  on public.user_error_reports (request_fingerprint, created_at desc)
  where request_fingerprint is not null;

drop trigger if exists user_error_reports_touch_updated_at
on public.user_error_reports;
create trigger user_error_reports_touch_updated_at
before update on public.user_error_reports
for each row execute function public.touch_updated_at();

create or replace function public.submit_news_error_report(
  p_article_id uuid,
  p_message text,
  p_page_path text,
  p_user_agent text default null,
  p_referrer_path text default null,
  p_request_fingerprint text default null,
  p_release_sha text default null,
  p_technical_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_article public.news_articles%rowtype;
  v_source_name text;
  v_report_id uuid;
  v_user_id uuid := auth.uid();
begin
  if p_article_id is null
    or char_length(trim(coalesce(p_message, ''))) not between 10 and 2000
    or char_length(trim(coalesce(p_page_path, ''))) not between 1 and 500
    or char_length(coalesce(p_user_agent, '')) > 500
    or char_length(coalesce(p_referrer_path, '')) > 500
    or (
      p_request_fingerprint is not null
      and p_request_fingerprint !~ '^[0-9a-f]{64}$'
    )
    or (
      p_release_sha is not null
      and p_release_sha !~ '^[0-9a-f]{7,64}$'
    )
    or jsonb_typeof(coalesce(p_technical_context, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_technical_context, '{}'::jsonb)::text) > 5000 then
    raise exception 'invalid_error_report';
  end if;

  select article.*
  into v_article
  from public.news_articles article
  where article.id = p_article_id
    and article.status = 'processed'
    and article.publication_status = 'published'
    and article.duplicate_of is null;

  if v_article.id is null then
    raise exception 'article_not_found';
  end if;

  select source.name
  into v_source_name
  from public.news_sources source
  where source.id = v_article.source_id;

  if p_request_fingerprint is not null and (
    select count(*)
    from public.user_error_reports report
    where report.request_fingerprint = p_request_fingerprint
      and report.created_at >= now() - interval '1 hour'
  ) >= 5 then
    raise exception 'report_rate_limited';
  end if;

  if v_user_id is not null and (
    select count(*)
    from public.user_error_reports report
    where report.reporter_user_id = v_user_id
      and report.created_at >= now() - interval '1 day'
  ) >= 20 then
    raise exception 'report_rate_limited';
  end if;

  insert into public.user_error_reports (
    article_id,
    reporter_user_id,
    message,
    page_path,
    article_slug,
    article_title,
    source_name,
    user_agent,
    referrer_path,
    request_fingerprint,
    release_sha,
    technical_context
  )
  values (
    v_article.id,
    case
      when v_user_id is not null and exists (
        select 1 from public.profiles profile where profile.id = v_user_id
      ) then v_user_id
      else null
    end,
    trim(p_message),
    trim(p_page_path),
    coalesce(nullif(v_article.slug, ''), v_article.id::text),
    left(coalesce(nullif(v_article.ai_title_ru, ''), v_article.original_title), 240),
    left(coalesce(nullif(v_source_name, ''), 'Источник не указан'), 160),
    nullif(left(trim(coalesce(p_user_agent, '')), 500), ''),
    nullif(left(trim(coalesce(p_referrer_path, '')), 500), ''),
    p_request_fingerprint,
    p_release_sha,
    coalesce(p_technical_context, '{}'::jsonb)
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.submit_news_error_report(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function public.submit_news_error_report(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to anon, authenticated, service_role;

alter table public.admin_external_api_costs enable row level security;
alter table public.external_api_usage_events enable row level security;
alter table public.user_error_reports enable row level security;

drop policy if exists "Admins can read external API costs"
on public.admin_external_api_costs;
create policy "Admins can read external API costs"
on public.admin_external_api_costs
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can read user error reports"
on public.user_error_reports;
create policy "Admins can read user error reports"
on public.user_error_reports
for select
to authenticated
using (public.is_admin());

revoke all on table public.admin_external_api_costs
from public, anon, authenticated;
revoke all on table public.external_api_usage_events
from public, anon, authenticated;
revoke all on table public.user_error_reports
from public, anon, authenticated;
grant select on table public.admin_external_api_costs to authenticated;
grant select on table public.user_error_reports to authenticated;
grant all on table public.admin_external_api_costs to service_role;
grant all on table public.external_api_usage_events to service_role;
grant all on table public.user_error_reports to service_role;

insert into public.admin_job_schedules (
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
  'support_daily_system_report',
  'support.send_daily_report',
  'daily',
  null,
  '07:00',
  '{}'::jsonb,
  2,
  true,
  case
    when (((now() at time zone 'UTC')::date + time '07:00') at time zone 'UTC') > now()
      then ((now() at time zone 'UTC')::date + time '07:00') at time zone 'UTC'
    else ((now() at time zone 'UTC')::date + 1 + time '07:00') at time zone 'UTC'
  end
)
on conflict (schedule_key) do update set
  job_name = excluded.job_name,
  schedule_kind = excluded.schedule_kind,
  interval_minutes = excluded.interval_minutes,
  daily_time_utc = excluded.daily_time_utc,
  args = excluded.args,
  max_attempts = excluded.max_attempts,
  is_enabled = excluded.is_enabled,
  next_run_at = least(public.admin_job_schedules.next_run_at, excluded.next_run_at),
  updated_at = now();

notify pgrst, 'reload schema';
