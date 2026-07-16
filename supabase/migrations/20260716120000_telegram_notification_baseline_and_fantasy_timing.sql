-- Prevent pre-connection notification delivery and let users choose fantasy deadline timings.

alter table public.notification_preferences
  add column if not exists fantasy_reminder_4h boolean not null default true,
  add column if not exists fantasy_reminder_15m boolean not null default true;

update public.notification_queue
set status = 'cancelled',
    last_error = 'Cancelled during Telegram notification baseline migration'
where status = 'pending'
  and event_type = 'SESSION_TIME_CHANGED';

update public.notification_queue as queue
set status = 'cancelled',
    last_error = 'Notification predates Telegram connection'
from public.telegram_accounts as account
where queue.user_id = account.user_id
  and queue.status = 'pending'
  and queue.created_at < account.connected_at;
