-- RaceSide Plus billing. Client roles cannot mutate billing data directly;
-- all writes are performed by authenticated server code through service_role.

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  entitlements text[] not null default array[]::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_code_check check (code ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table public.subscription_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  code text not null unique,
  amount_minor bigint not null,
  currency text not null,
  duration_months smallint not null,
  first_purchase_only boolean not null default false,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_prices_amount_check check (amount_minor > 0),
  constraint subscription_prices_currency_check check (currency in ('RUB', 'EUR', 'USD')),
  constraint subscription_prices_duration_check check (duration_months in (1, 12)),
  constraint subscription_prices_validity_check check (valid_until is null or valid_until > valid_from)
);

create table public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  price_id uuid not null references public.subscription_prices(id) on delete restrict,
  provider text not null,
  payment_method text not null,
  amount_minor bigint not null,
  currency text not null,
  duration_months smallint not null,
  plan_name_snapshot text not null,
  price_name_snapshot text not null,
  provider_label text unique,
  provider_order_id text,
  checkout_url text,
  idempotency_key text not null,
  status text not null default 'pending',
  failure_reason text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_orders_provider_check check (provider in ('yoomoney', 'tribute')),
  constraint billing_orders_method_check check (payment_method in ('yoomoney_card', 'yoomoney_wallet', 'tribute')),
  constraint billing_orders_provider_method_check check (
    (provider = 'yoomoney' and payment_method in ('yoomoney_card', 'yoomoney_wallet'))
    or (provider = 'tribute' and payment_method = 'tribute')
  ),
  constraint billing_orders_amount_check check (amount_minor > 0),
  constraint billing_orders_currency_check check (currency in ('RUB', 'EUR', 'USD')),
  constraint billing_orders_duration_check check (duration_months in (1, 12)),
  constraint billing_orders_status_check check (status in ('pending', 'paid', 'failed', 'refunded', 'partially_refunded')),
  constraint billing_orders_label_check check (provider_label is null or length(provider_label) between 8 and 64),
  constraint billing_orders_provider_order_unique unique (provider, provider_order_id),
  constraint billing_orders_user_idempotency_unique unique (user_id, idempotency_key)
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.billing_orders(id) on delete restrict,
  provider text not null,
  provider_transaction_id text not null,
  payment_method text not null,
  gross_amount_minor bigint not null,
  net_amount_minor bigint not null,
  provider_fee_minor bigint not null,
  currency text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint payment_transactions_provider_check check (provider in ('yoomoney', 'tribute')),
  constraint payment_transactions_amount_check check (
    gross_amount_minor > 0 and net_amount_minor >= 0 and provider_fee_minor >= 0
    and gross_amount_minor = net_amount_minor + provider_fee_minor
  ),
  constraint payment_transactions_provider_id_unique unique (provider, provider_transaction_id),
  constraint payment_transactions_order_unique unique (order_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'expired',
  current_period_start timestamptz,
  current_period_end timestamptz,
  last_paid_order_id uuid references public.billing_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (status in ('active', 'expired', 'revoked')),
  constraint subscriptions_period_check check (
    (current_period_start is null and current_period_end is null)
    or (current_period_start is not null and current_period_end > current_period_start)
  )
);

create table public.subscription_periods (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  order_id uuid references public.billing_orders(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  source text not null,
  created_by_admin_id uuid references auth.users(id) on delete set null,
  admin_reason text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_periods_dates_check check (ends_at > starts_at),
  constraint subscription_periods_status_check check (status in ('active', 'revoked', 'refunded')),
  constraint subscription_periods_source_check check (source in ('payment', 'admin_grant', 'admin_adjustment', 'refund')),
  constraint subscription_periods_source_data_check check (
    (source = 'payment' and order_id is not null and created_by_admin_id is null)
    or (source in ('admin_grant', 'admin_adjustment') and order_id is null and created_by_admin_id is not null and length(trim(admin_reason)) >= 3)
    or (source = 'refund' and length(trim(admin_reason)) >= 3)
  )
);

create unique index subscription_periods_order_unique
  on public.subscription_periods(order_id)
  where order_id is not null;
create unique index subscription_periods_idempotency_unique
  on public.subscription_periods(idempotency_key)
  where idempotency_key is not null;

create table public.billing_notification_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  provider_event_type text not null,
  provider_reference text,
  signature_valid boolean not null,
  status text not null,
  payload_hash text not null,
  safe_payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 1,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint billing_notification_events_provider_check check (provider in ('yoomoney', 'tribute')),
  constraint billing_notification_events_status_check check (status in ('received', 'processed', 'rejected', 'failed')),
  constraint billing_notification_events_attempts_check check (attempts > 0),
  constraint billing_notification_events_provider_event_unique unique (provider, provider_event_id)
);

create table public.billing_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.billing_orders(id) on delete restrict,
  template text not null,
  recipient_email text,
  status text not null default 'queued',
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_email_deliveries_status_check check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  constraint billing_email_deliveries_attempts_check check (attempts >= 0),
  constraint billing_email_deliveries_order_template_unique unique (order_id, template)
);

create table public.billing_rate_limits (
  scope text not null,
  identity_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (scope, identity_hash),
  constraint billing_rate_limits_scope_check check (scope ~ '^[a-z][a-z0-9:_-]{1,63}$'),
  constraint billing_rate_limits_identity_check check (identity_hash ~ '^[a-f0-9]{64}$'),
  constraint billing_rate_limits_count_check check (request_count > 0)
);

create index billing_orders_user_created_idx on public.billing_orders(user_id, created_at desc);
create index billing_orders_pending_expiry_idx on public.billing_orders(expires_at) where status = 'pending';
create index subscriptions_active_expiry_idx on public.subscriptions(current_period_end) where status = 'active';
create index subscription_periods_subscription_idx on public.subscription_periods(subscription_id, starts_at desc);
create index billing_notification_events_status_idx on public.billing_notification_events(status, received_at);
create index billing_email_deliveries_queue_idx on public.billing_email_deliveries(status, available_at) where status in ('queued', 'failed');
create unique index billing_orders_one_pending_per_user on public.billing_orders(user_id) where status = 'pending';

alter table public.subscription_plans enable row level security;
alter table public.subscription_prices enable row level security;
alter table public.billing_orders enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_periods enable row level security;
alter table public.billing_notification_events enable row level security;
alter table public.billing_email_deliveries enable row level security;
alter table public.billing_rate_limits enable row level security;

revoke all on public.subscription_plans, public.subscription_prices, public.billing_orders,
  public.payment_transactions, public.subscriptions, public.subscription_periods,
  public.billing_notification_events, public.billing_email_deliveries,
  public.billing_rate_limits
  from public, anon, authenticated;

grant select, insert, update, delete on public.subscription_plans, public.subscription_prices,
  public.billing_orders, public.payment_transactions, public.subscriptions,
  public.subscription_periods, public.billing_notification_events,
  public.billing_email_deliveries, public.billing_rate_limits to service_role;

insert into public.subscription_plans(code, name, entitlements)
values (
  'raceside_plus',
  'RaceSide Plus',
  array['live', 'telemetry_full', 'telegram_notifications', 'ads_disabled']::text[]
)
on conflict (code) do update
set name = excluded.name,
    entitlements = excluded.entitlements,
    active = true,
    updated_at = now();

insert into public.subscription_prices(plan_id, code, amount_minor, currency, duration_months, first_purchase_only)
select id, 'plus_monthly', 24900, 'RUB', 1, false
from public.subscription_plans where code = 'raceside_plus'
on conflict (code) do update
set amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    duration_months = excluded.duration_months,
    active = true,
    updated_at = now();

insert into public.subscription_prices(plan_id, code, amount_minor, currency, duration_months, first_purchase_only)
select id, 'plus_first_year', 199000, 'RUB', 12, true
from public.subscription_plans where code = 'raceside_plus'
on conflict (code) do update
set amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    duration_months = excluded.duration_months,
    first_purchase_only = true,
    active = true,
    updated_at = now();

create or replace function public.billing_apply_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_provider_event_type text,
  p_provider_reference text,
  p_provider_transaction_id text,
  p_payment_method text,
  p_gross_amount_minor bigint,
  p_net_amount_minor bigint,
  p_currency text,
  p_occurred_at timestamptz,
  p_payload_hash text,
  p_safe_payload jsonb default '{}'::jsonb
)
returns table(applied boolean, subscription_id uuid, period_id uuid, period_end timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.billing_orders;
  v_subscription public.subscriptions;
  v_period public.subscription_periods;
  v_event_status text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_provider not in ('yoomoney', 'tribute') then raise exception 'invalid_provider'; end if;
  if p_gross_amount_minor <= 0 or p_net_amount_minor < 0 or p_net_amount_minor > p_gross_amount_minor then
    raise exception 'invalid_payment_amount';
  end if;

  insert into public.billing_notification_events(
    provider, provider_event_id, provider_event_type, provider_reference,
    signature_valid, status, payload_hash, safe_payload
  ) values (
    p_provider, p_provider_event_id, p_provider_event_type, p_provider_reference,
    true, 'received', p_payload_hash, coalesce(p_safe_payload, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do update
  set attempts = public.billing_notification_events.attempts + 1
  returning status into v_event_status;

  if v_event_status = 'processed' then
    select s.id, sp.id, sp.ends_at
      into subscription_id, period_id, period_end
    from public.billing_orders o
    join public.subscriptions s on s.user_id = o.user_id
    join public.subscription_periods sp on sp.order_id = o.id
    where o.id = p_order_id;
    applied := false;
    return next;
    return;
  end if;

  select * into v_order from public.billing_orders where id = p_order_id for update;
  if not found then raise exception 'billing_order_not_found'; end if;
  if v_order.provider <> p_provider then raise exception 'billing_provider_mismatch'; end if;
  if v_order.payment_method <> p_payment_method then raise exception 'billing_payment_method_mismatch'; end if;
  if v_order.amount_minor <> p_gross_amount_minor or v_order.currency <> p_currency then
    raise exception 'billing_amount_mismatch';
  end if;
  if v_order.status not in ('pending', 'paid')
     and not (v_order.status = 'failed' and v_order.failure_reason = 'CHECKOUT_EXPIRED') then
    raise exception 'billing_order_not_payable';
  end if;

  if v_order.status = 'paid' then
    update public.billing_notification_events
    set status = 'processed', processed_at = coalesce(processed_at, now())
    where provider = p_provider and provider_event_id = p_provider_event_id;
    select s.id, sp.id, sp.ends_at
      into subscription_id, period_id, period_end
    from public.subscriptions s
    join public.subscription_periods sp on sp.subscription_id = s.id and sp.order_id = v_order.id
    where s.user_id = v_order.user_id;
    applied := false;
    return next;
    return;
  end if;

  insert into public.payment_transactions(
    order_id, provider, provider_transaction_id, payment_method,
    gross_amount_minor, net_amount_minor, provider_fee_minor, currency, occurred_at
  ) values (
    v_order.id, p_provider, p_provider_transaction_id, p_payment_method,
    p_gross_amount_minor, p_net_amount_minor, p_gross_amount_minor - p_net_amount_minor,
    p_currency, p_occurred_at
  );

  insert into public.subscriptions(user_id, plan_id, status)
  values (v_order.user_id, v_order.plan_id, 'expired')
  on conflict (user_id) do nothing;

  select * into v_subscription from public.subscriptions where user_id = v_order.user_id for update;
  v_start := greatest(p_occurred_at, coalesce(v_subscription.current_period_end, p_occurred_at));
  v_end := v_start + make_interval(months => v_order.duration_months);

  insert into public.subscription_periods(subscription_id, order_id, starts_at, ends_at, source)
  values (v_subscription.id, v_order.id, v_start, v_end, 'payment')
  returning * into v_period;

  update public.subscriptions
  set status = 'active',
      plan_id = v_order.plan_id,
      current_period_start = case
        when v_subscription.current_period_end is null or v_subscription.current_period_end <= p_occurred_at then v_start
        else v_subscription.current_period_start
      end,
      current_period_end = v_end,
      last_paid_order_id = v_order.id,
      updated_at = now()
  where id = v_subscription.id;

  update public.billing_orders
  set status = 'paid', paid_at = p_occurred_at, failed_at = null, failure_reason = null, updated_at = now()
  where id = v_order.id;

  insert into public.billing_email_deliveries(order_id, template, status)
  values (v_order.id, 'payment_confirmation', 'queued')
  on conflict (order_id, template) do nothing;

  update public.billing_notification_events
  set status = 'processed', processed_at = now(), last_error = null
  where provider = p_provider and provider_event_id = p_provider_event_id;

  applied := true;
  subscription_id := v_subscription.id;
  period_id := v_period.id;
  period_end := v_end;
  return next;
end;
$$;

create or replace function public.billing_consume_rate_limit(
  p_scope text,
  p_identity_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default now()
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bucket public.billing_rate_limits;
begin
  if p_scope !~ '^[a-z][a-z0-9:_-]{1,63}$'
     or p_identity_hash !~ '^[a-f0-9]{64}$'
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit';
  end if;

  insert into public.billing_rate_limits(scope, identity_hash, window_started_at, request_count)
  values (p_scope, p_identity_hash, p_now, 1)
  on conflict (scope, identity_hash) do update
  set window_started_at = case
        when public.billing_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= p_now
          then p_now
        else public.billing_rate_limits.window_started_at
      end,
      request_count = case
        when public.billing_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= p_now
          then 1
        else least(public.billing_rate_limits.request_count + 1, p_limit + 1)
      end,
      updated_at = p_now
  returning * into v_bucket;

  allowed := v_bucket.request_count <= p_limit;
  remaining := greatest(0, p_limit - v_bucket.request_count);
  reset_at := v_bucket.window_started_at + make_interval(secs => p_window_seconds);
  return next;
end;
$$;

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
  if not exists (select 1 from auth.users where id = p_target_user_id) then
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

create or replace function public.billing_apply_refund(
  p_order_id uuid,
  p_amount_minor bigint,
  p_provider text,
  p_provider_event_id text,
  p_provider_event_type text,
  p_payload_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.billing_orders;
  v_subscription_id uuid;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_active_now boolean;
begin
  insert into public.billing_notification_events(
    provider, provider_event_id, provider_event_type, provider_reference,
    signature_valid, status, payload_hash, safe_payload
  ) values (
    p_provider, p_provider_event_id, p_provider_event_type, p_order_id::text,
    true, 'received', p_payload_hash, '{}'::jsonb
  ) on conflict (provider, provider_event_id) do update
  set attempts = public.billing_notification_events.attempts + 1;

  select * into v_order from public.billing_orders where id = p_order_id for update;
  if not found or v_order.provider <> p_provider then raise exception 'billing_order_not_found'; end if;
  if p_amount_minor <> v_order.amount_minor then raise exception 'billing_amount_mismatch'; end if;
  if v_order.status = 'refunded' then
    update public.billing_notification_events set status = 'processed', processed_at = coalesce(processed_at, now())
    where provider = p_provider and provider_event_id = p_provider_event_id;
    return false;
  end if;
  if v_order.status <> 'paid' then raise exception 'billing_order_not_refundable'; end if;

  select subscription_id into v_subscription_id
  from public.subscription_periods where order_id = v_order.id for update;
  if v_subscription_id is null then raise exception 'billing_period_not_found'; end if;

  update public.subscription_periods
  set status = 'refunded', updated_at = now()
  where order_id = v_order.id;
  update public.billing_orders
  set status = 'refunded', refunded_at = now(), updated_at = now()
  where id = v_order.id;

  select min(starts_at), max(ends_at), coalesce(bool_or(starts_at <= now() and ends_at > now()), false)
  into v_period_start, v_period_end, v_active_now
  from public.subscription_periods
  where subscription_id = v_subscription_id and status = 'active' and ends_at > now();

  update public.subscriptions
  set status = case when v_active_now then 'active' else 'expired' end,
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      updated_at = now()
  where id = v_subscription_id;

  update public.billing_notification_events
  set status = 'processed', processed_at = now(), last_error = null
  where provider = p_provider and provider_event_id = p_provider_event_id;
  return true;
end;
$$;

create or replace function public.billing_admin_revoke(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_now timestamptz default now()
)
returns table(revoked boolean, previous_period_end timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.subscriptions;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor_user_id) then
    raise exception 'admin_required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'revoke_reason_required'; end if;

  select * into v_subscription
  from public.subscriptions
  where user_id = p_target_user_id
  for update;

  if not found or v_subscription.status <> 'active' then
    revoked := false;
    previous_period_end := v_subscription.current_period_end;
    return next;
    return;
  end if;

  update public.subscription_periods
  set status = 'revoked',
      admin_reason = trim(p_reason),
      updated_at = p_now
  where subscription_id = v_subscription.id
    and status = 'active'
    and ends_at > p_now;

  update public.subscriptions
  set status = 'revoked',
      current_period_start = null,
      current_period_end = null,
      updated_at = p_now
  where id = v_subscription.id;

  revoked := true;
  previous_period_end := v_subscription.current_period_end;
  return next;
end;
$$;

revoke all on function public.billing_apply_payment(uuid,text,text,text,text,text,text,bigint,bigint,text,timestamptz,text,jsonb) from public, anon, authenticated;
revoke all on function public.billing_admin_grant(uuid,uuid,text,timestamptz,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.billing_apply_refund(uuid,bigint,text,text,text,text) from public, anon, authenticated;
revoke all on function public.billing_consume_rate_limit(text,text,integer,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.billing_admin_revoke(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_payment(uuid,text,text,text,text,text,text,bigint,bigint,text,timestamptz,text,jsonb) to service_role;
grant execute on function public.billing_admin_grant(uuid,uuid,text,timestamptz,text,text,timestamptz) to service_role;
grant execute on function public.billing_apply_refund(uuid,bigint,text,text,text,text) to service_role;
grant execute on function public.billing_consume_rate_limit(text,text,integer,integer,timestamptz) to service_role;
grant execute on function public.billing_admin_revoke(uuid,uuid,text,timestamptz) to service_role;

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
values
  ('billing_process_emails', 'billing.process_emails', 'interval', 5, null, '{}'::jsonb, 3, true, now()),
  ('billing_expire_subscriptions', 'billing.expire_subscriptions', 'interval', 15, null, '{}'::jsonb, 2, true, now()),
  ('billing_expire_orders', 'billing.expire_orders', 'interval', 15, null, '{}'::jsonb, 2, true, now()),
  ('billing_retry_failed_events', 'billing.retry_failed_events', 'interval', 5, null, '{}'::jsonb, 2, true, now()),
  ('billing_audit', 'billing.audit', 'interval', 60, null, '{}'::jsonb, 2, true, now())
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
