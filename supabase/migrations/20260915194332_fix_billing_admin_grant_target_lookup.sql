-- The service_role-backed admin client cannot read auth.users through a
-- SECURITY INVOKER RPC. Admin grants target users already represented by an
-- application profile, whose id is backed by auth.users through a foreign key.

create or replace function public.billing_admin_grant(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_duration_kind text,
  p_custom_end timestamptz,
  p_reason text,
  p_idempotency_key text,
  p_now timestamptz default now()
)
returns table(period_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_subscription public.subscriptions;
  v_period public.subscription_periods;
  v_start timestamptz;
  v_end timestamptz;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor_user_id) then
    raise exception 'admin_required';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'target_user_not_found';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'grant_reason_required'; end if;
  if length(coalesce(p_idempotency_key, '')) < 16 then raise exception 'invalid_idempotency_key'; end if;
  if p_duration_kind not in ('month', 'year', 'custom') then raise exception 'invalid_grant_duration'; end if;

  select id into v_plan_id from public.subscription_plans where code = 'raceside_plus' and active;
  if v_plan_id is null then raise exception 'subscription_plan_unavailable'; end if;

  insert into public.subscriptions(user_id, plan_id, status)
  values (p_target_user_id, v_plan_id, 'expired')
  on conflict (user_id) do nothing;
  select * into v_subscription from public.subscriptions where user_id = p_target_user_id for update;

  select * into v_period from public.subscription_periods where idempotency_key = p_idempotency_key;
  if found then
    period_id := v_period.id;
    starts_at := v_period.starts_at;
    ends_at := v_period.ends_at;
    return next;
    return;
  end if;

  v_start := greatest(p_now, coalesce(v_subscription.current_period_end, p_now));
  v_end := case p_duration_kind
    when 'month' then v_start + interval '1 month'
    when 'year' then v_start + interval '12 months'
    else p_custom_end
  end;
  if v_end is null or v_end <= v_start then raise exception 'invalid_grant_end'; end if;

  insert into public.subscription_periods(
    subscription_id, starts_at, ends_at, source, created_by_admin_id,
    admin_reason, idempotency_key
  ) values (
    v_subscription.id, v_start, v_end, 'admin_grant', p_actor_user_id,
    trim(p_reason), p_idempotency_key
  ) returning * into v_period;

  update public.subscriptions
  set status = 'active',
      plan_id = v_plan_id,
      current_period_start = case
        when v_subscription.current_period_end is null or v_subscription.current_period_end <= p_now then v_start
        else v_subscription.current_period_start
      end,
      current_period_end = v_end,
      updated_at = now()
  where id = v_subscription.id;

  period_id := v_period.id;
  starts_at := v_period.starts_at;
  ends_at := v_period.ends_at;
  return next;
end;
$$;

revoke all on function public.billing_admin_grant(uuid,uuid,text,timestamptz,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.billing_admin_grant(uuid,uuid,text,timestamptz,text,text,timestamptz)
  to service_role;

notify pgrst, 'reload schema';
