-- Telegram linking, preferences, spoiler reveals, and durable delivery queue.

create table if not exists public.telegram_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  telegram_user_id bigint not null unique,
  chat_id bigint not null,
  username text,
  first_name text,
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_delivery_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  telegram_enabled boolean not null default true,
  practice_reminders boolean not null default false,
  qualifying_reminders boolean not null default true,
  sprint_reminders boolean not null default true,
  race_reminders boolean not null default true,
  reminder_24h boolean not null default false,
  reminder_1h boolean not null default true,
  reminder_15m boolean not null default true,
  schedule_changes boolean not null default true,
  practice_results boolean not null default true,
  qualifying_results boolean not null default true,
  sprint_results boolean not null default true,
  race_results boolean not null default true,
  fantasy_opened boolean not null default true,
  fantasy_incomplete boolean not null default true,
  fantasy_deadlines boolean not null default true,
  fantasy_locked boolean not null default false,
  fantasy_scored boolean not null default true,
  fantasy_rank_changes boolean not null default true,
  important_news boolean not null default true,
  favorite_driver_news boolean not null default false,
  favorite_team_news boolean not null default false,
  transfer_news boolean not null default false,
  steward_news boolean not null default true,
  technical_news boolean not null default false,
  daily_digest boolean not null default false,
  weather_changes boolean not null default true,
  rain_alerts boolean not null default true,
  extreme_heat_alerts boolean not null default true,
  possible_session_delay boolean not null default true,
  championship_updates boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  delivery_mode text not null default 'instant' check (delivery_mode in ('instant', 'digest')),
  updated_at timestamptz not null default now()
);

create table if not exists public.spoiler_reveals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  dedupe_key text not null unique,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.notification_queue(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null default 'telegram',
  event_type text not null,
  status text not null,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_link_tokens_hash on public.telegram_link_tokens (token_hash);
create index if not exists idx_telegram_link_tokens_user on public.telegram_link_tokens (user_id, created_at desc);
create index if not exists idx_notification_queue_dispatch on public.notification_queue (status, available_at);
create index if not exists idx_notification_queue_user on public.notification_queue (user_id, created_at desc);
create index if not exists idx_notification_logs_user on public.notification_logs (user_id, created_at desc);

drop trigger if exists telegram_accounts_touch_updated_at on public.telegram_accounts;
create trigger telegram_accounts_touch_updated_at
before update on public.telegram_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at
before update on public.notification_preferences
for each row execute function public.touch_updated_at();

alter table public.telegram_accounts enable row level security;
alter table public.telegram_link_tokens enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.spoiler_reveals enable row level security;
alter table public.notification_queue enable row level security;
alter table public.notification_logs enable row level security;

create policy "Users can read own Telegram account" on public.telegram_accounts
for select using (auth.uid() = user_id);

create policy "Users can read own notification preferences" on public.notification_preferences
for select using (auth.uid() = user_id);

create policy "Users can update own notification preferences" on public.notification_preferences
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can create own notification preferences" on public.notification_preferences
for insert with check (auth.uid() = user_id);

create policy "Users can read own spoiler reveals" on public.spoiler_reveals
for select using (auth.uid() = user_id);

create policy "Users can read own notification history" on public.notification_logs
for select using (auth.uid() = user_id);

revoke all on public.telegram_link_tokens from anon, authenticated;
revoke all on public.notification_queue from anon, authenticated;
