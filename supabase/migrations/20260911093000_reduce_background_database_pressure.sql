create or replace function public.get_ops_ai_monthly_spend(p_since timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(estimated_cost_usd), 0)
  from public.ai_usage_logs
  where created_at >= coalesce(p_since, date_trunc('month', now()));
$$;

revoke all on function public.get_ops_ai_monthly_spend(timestamptz)
from public, anon, authenticated;
grant execute on function public.get_ops_ai_monthly_spend(timestamptz)
to service_role;

comment on function public.get_ops_ai_monthly_spend(timestamptz) is
  'Returns one aggregate value for the operations watcher without transferring individual usage rows.';
