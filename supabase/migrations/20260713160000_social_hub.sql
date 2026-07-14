-- RaceMate social hub: AI-gated X, Reddit and Telegram ingestion.

alter table public.social_sources
  drop constraint if exists social_sources_platform_check;

alter table public.social_sources
  add constraint social_sources_platform_check
  check (platform in ('x', 'reddit', 'telegram'));

alter table public.social_sources
  add column if not exists external_key text,
  add column if not exists trust_level text not null default 'community'
    check (trust_level in ('official', 'media', 'community')),
  add column if not exists publication_mode text not null default 'auto'
    check (publication_mode in ('auto', 'review')),
  add column if not exists cursor text,
  add column if not exists last_seen_external_id text,
  add column if not exists include_reposts boolean not null default false,
  add column if not exists include_replies boolean not null default false,
  add column if not exists next_fetch_at timestamptz,
  add column if not exists rate_limited_until timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.social_posts
  drop constraint if exists social_posts_platform_check;

alter table public.social_posts
  add constraint social_posts_platform_check
  check (platform in ('x', 'reddit', 'telegram'));

alter table public.social_posts
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'processing', 'review', 'published', 'rejected')),
  add column if not exists original_language text,
  add column if not exists ai_title_ru text,
  add column if not exists ai_summary_ru text,
  add column if not exists content_kind text
    check (content_kind is null or content_kind in ('official', 'report', 'opinion', 'rumor', 'discussion')),
  add column if not exists importance_score integer not null default 0
    check (importance_score between 0 and 100),
  add column if not exists relevance_score numeric(4, 3)
    check (relevance_score is null or relevance_score between 0 and 1),
  add column if not exists ai_confidence numeric(4, 3)
    check (ai_confidence is null or ai_confidence between 0 and 1),
  add column if not exists ai_model text,
  add column if not exists ai_processed_at timestamptz,
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_processing_error text,
  add column if not exists duplicate_of uuid references public.social_posts(id) on delete set null,
  add column if not exists content_hash text,
  add column if not exists source_metrics jsonb not null default '{}'::jsonb,
  add column if not exists comments_count integer,
  add column if not exists repost_count integer,
  add column if not exists view_count integer,
  add column if not exists edited_at timestamptz;

create table if not exists public.social_post_tags (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  confidence numeric(4, 3) not null default 1
    check (confidence between 0 and 1),
  method text not null default 'ai',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id)
);

create table if not exists public.social_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'gif', 'link')),
  url text not null,
  preview_url text,
  alt_text text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  provider_media_id text,
  created_at timestamptz not null default now(),
  unique (post_id, url)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-media',
  'social-media',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read social media" on storage.objects;
create policy "Public can read social media" on storage.objects
for select to anon, authenticated
using (bucket_id = 'social-media');

drop policy if exists "Admins can manage social media" on storage.objects;
create policy "Admins can manage social media" on storage.objects
for all to authenticated
using (bucket_id = 'social-media' and public.is_admin())
with check (bucket_id = 'social-media' and public.is_admin());

create index if not exists idx_social_sources_due
  on public.social_sources (next_fetch_at, platform)
  where is_active = true;

create index if not exists idx_social_posts_public_feed
  on public.social_posts (importance_score desc, published_at desc, id desc)
  where status = 'published' and duplicate_of is null;

create index if not exists idx_social_posts_ai_queue
  on public.social_posts (next_retry_at, published_at desc)
  where status in ('pending', 'processing');

create index if not exists idx_social_posts_content_hash
  on public.social_posts (content_hash)
  where content_hash is not null;

create index if not exists idx_social_post_tags_tag_post
  on public.social_post_tags (tag_id, post_id);

create index if not exists idx_social_post_media_post_order
  on public.social_post_media (post_id, sort_order);

insert into public.tags (type, slug, name)
values
  ('social_topic', 'social-upgrades', 'Обновления болида'),
  ('social_topic', 'social-transfers', 'Трансферы и контракты'),
  ('social_topic', 'social-technical', 'Техника и регламент'),
  ('social_topic', 'social-race-weekend', 'Этап и результаты'),
  ('social_topic', 'social-statements', 'Комментарии команд и пилотов'),
  ('social_topic', 'social-incidents', 'Инциденты и штрафы'),
  ('social_topic', 'social-rumors', 'Слухи'),
  ('social_topic', 'social-discussion', 'Обсуждения')
on conflict (slug) do update set
  type = excluded.type,
  name = excluded.name;

-- Existing RSS records must pass through the same AI gate as new records.
update public.social_posts
set status = 'pending',
    next_retry_at = now(),
    ai_title_ru = null,
    ai_summary_ru = null,
    ai_processed_at = null
where status <> 'rejected';

alter table public.social_post_tags enable row level security;
alter table public.social_post_media enable row level security;

drop policy if exists "Public can read social posts" on public.social_posts;
drop policy if exists "Public can read published social posts" on public.social_posts;
create policy "Public can read published social posts" on public.social_posts
for select to anon, authenticated
using (status = 'published' and duplicate_of is null);

create policy "Public can read tags for published social posts" on public.social_post_tags
for select to anon, authenticated
using (
  exists (
    select 1
    from public.social_posts posts
    where posts.id = social_post_tags.post_id
      and posts.status = 'published'
      and posts.duplicate_of is null
  )
);

create policy "Admins can manage social post tags" on public.social_post_tags
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read media for published social posts" on public.social_post_media
for select to anon, authenticated
using (
  exists (
    select 1
    from public.social_posts posts
    where posts.id = social_post_media.post_id
      and posts.status = 'published'
      and posts.duplicate_of is null
  )
);

create policy "Admins can manage social post media" on public.social_post_media
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke select on table public.social_posts from anon, authenticated;
grant select (
  id,
  platform,
  author,
  original_url,
  image_url,
  published_at,
  reaction_count,
  popularity_score,
  ai_title_ru,
  ai_summary_ru,
  content_kind,
  importance_score,
  relevance_score,
  ai_confidence,
  source_metrics,
  comments_count,
  repost_count,
  view_count,
  edited_at,
  created_at,
  updated_at
) on table public.social_posts to anon, authenticated;

grant select on table public.social_post_tags to anon, authenticated;
grant select on table public.social_post_media to anon, authenticated;
grant insert, update, delete on table public.social_post_tags to authenticated;
grant insert, update, delete on table public.social_post_media to authenticated;

notify pgrst, 'reload schema';
