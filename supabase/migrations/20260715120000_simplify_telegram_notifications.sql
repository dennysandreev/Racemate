-- Compact per-session Telegram preferences. Legacy columns stay for rollback compatibility.

alter table public.notification_preferences
  add column if not exists session_notifications jsonb not null default
  '{
    "practice": {"enabled": false, "reminder_24h": false, "reminder_1h": true, "reminder_15m": true, "spoiler_free": false},
    "sprint_qualifying": {"enabled": true, "reminder_24h": false, "reminder_1h": true, "reminder_15m": true, "spoiler_free": true},
    "qualifying": {"enabled": true, "reminder_24h": false, "reminder_1h": true, "reminder_15m": true, "spoiler_free": true},
    "sprint": {"enabled": true, "reminder_24h": false, "reminder_1h": true, "reminder_15m": true, "spoiler_free": true},
    "race": {"enabled": true, "reminder_24h": false, "reminder_1h": true, "reminder_15m": true, "spoiler_free": true}
  }'::jsonb;

update public.notification_preferences
set session_notifications = jsonb_build_object(
  'practice', jsonb_build_object(
    'enabled', practice_reminders or practice_results,
    'reminder_24h', reminder_24h,
    'reminder_1h', reminder_1h,
    'reminder_15m', reminder_15m,
    'spoiler_free', false
  ),
  'sprint_qualifying', jsonb_build_object(
    'enabled', qualifying_reminders or qualifying_results,
    'reminder_24h', reminder_24h,
    'reminder_1h', reminder_1h,
    'reminder_15m', reminder_15m,
    'spoiler_free', true
  ),
  'qualifying', jsonb_build_object(
    'enabled', qualifying_reminders or qualifying_results,
    'reminder_24h', reminder_24h,
    'reminder_1h', reminder_1h,
    'reminder_15m', reminder_15m,
    'spoiler_free', true
  ),
  'sprint', jsonb_build_object(
    'enabled', sprint_reminders or sprint_results,
    'reminder_24h', reminder_24h,
    'reminder_1h', reminder_1h,
    'reminder_15m', reminder_15m,
    'spoiler_free', true
  ),
  'race', jsonb_build_object(
    'enabled', race_reminders or race_results,
    'reminder_24h', reminder_24h,
    'reminder_1h', reminder_1h,
    'reminder_15m', reminder_15m,
    'spoiler_free', true
  )
),
weather_changes = false,
rain_alerts = false,
extreme_heat_alerts = false,
possible_session_delay = false,
fantasy_opened = false,
fantasy_incomplete = false,
fantasy_locked = false,
fantasy_scored = false,
fantasy_rank_changes = false,
transfer_news = false,
steward_news = false,
technical_news = false,
daily_digest = false,
championship_updates = false,
quiet_hours_start = null,
quiet_hours_end = null,
delivery_mode = 'instant';

update public.notification_queue
set status = 'cancelled',
    last_error = 'Notification category retired'
where status = 'pending'
  and event_type in (
    'WEATHER_CHANGED',
    'DAILY_DIGEST_READY',
    'FANTASY_OPENED',
    'FANTASY_INCOMPLETE',
    'FANTASY_DEADLINE',
    'FANTASY_LOCKED',
    'FANTASY_SCORED_HIDDEN',
    'CHAMPIONSHIP_UPDATED_HIDDEN'
  );

alter table public.notification_preferences
  drop constraint if exists notification_preferences_session_notifications_check;

alter table public.notification_preferences
  add constraint notification_preferences_session_notifications_check
  check (
    jsonb_typeof(session_notifications) = 'object'
    and session_notifications ?& array['practice', 'sprint_qualifying', 'qualifying', 'sprint', 'race']
  );
