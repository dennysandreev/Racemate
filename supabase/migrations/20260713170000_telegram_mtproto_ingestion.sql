-- Telegram MTProto ingestion settings. Session credentials stay in worker environment only.

alter table public.social_sources
  add column if not exists initial_backfill_days integer not null default 30
    check (initial_backfill_days between 1 and 365);

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm'
    ]
where id = 'social-media';

create index if not exists idx_social_sources_telegram_mtproto_due
  on public.social_sources (next_fetch_at, id)
  where is_active = true
    and platform = 'telegram'
    and adapter = 'telegram-mtproto';

notify pgrst, 'reload schema';
