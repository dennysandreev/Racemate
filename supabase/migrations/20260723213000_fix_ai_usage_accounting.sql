alter table public.ai_usage_logs
  alter column estimated_cost_usd type numeric(18, 12);

create or replace function public.get_admin_ai_usage_summary(
  p_since timestamptz
)
returns table (
  dimension text,
  bucket text,
  request_count bigint,
  input_tokens bigint,
  output_tokens bigint,
  cost_usd numeric,
  unpriced_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with usage_rows as (
    select
      created_at,
      model,
      purpose,
      input_tokens,
      output_tokens,
      estimated_cost_usd
    from public.ai_usage_logs
    where created_at >= p_since
  )
  select
    'total'::text,
    'total'::text,
    count(*)::bigint,
    coalesce(sum(input_tokens), 0)::bigint,
    coalesce(sum(output_tokens), 0)::bigint,
    coalesce(sum(estimated_cost_usd), 0)::numeric,
    count(*) filter (where estimated_cost_usd is null)::bigint
  from usage_rows

  union all

  select
    'day'::text,
    to_char(created_at at time zone 'UTC', 'YYYY-MM-DD'),
    count(*)::bigint,
    coalesce(sum(input_tokens), 0)::bigint,
    coalesce(sum(output_tokens), 0)::bigint,
    coalesce(sum(estimated_cost_usd), 0)::numeric,
    count(*) filter (where estimated_cost_usd is null)::bigint
  from usage_rows
  group by 2

  union all

  select
    'model'::text,
    model,
    count(*)::bigint,
    coalesce(sum(input_tokens), 0)::bigint,
    coalesce(sum(output_tokens), 0)::bigint,
    coalesce(sum(estimated_cost_usd), 0)::numeric,
    count(*) filter (where estimated_cost_usd is null)::bigint
  from usage_rows
  group by model

  union all

  select
    'purpose'::text,
    purpose,
    count(*)::bigint,
    coalesce(sum(input_tokens), 0)::bigint,
    coalesce(sum(output_tokens), 0)::bigint,
    coalesce(sum(estimated_cost_usd), 0)::numeric,
    count(*) filter (where estimated_cost_usd is null)::bigint
  from usage_rows
  group by purpose;
$$;

revoke all on function public.get_admin_ai_usage_summary(timestamptz)
from public, anon, authenticated;
grant execute on function public.get_admin_ai_usage_summary(timestamptz)
to service_role;
