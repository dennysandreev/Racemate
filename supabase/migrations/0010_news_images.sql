-- RaceMate news images and article highlights.

alter table public.news_articles
  add column if not exists image_url text,
  add column if not exists source_image_url text,
  add column if not exists image_prompt text,
  add column if not exists image_model text,
  add column if not exists image_status text not null default 'pending'
    check (image_status in ('pending', 'ready', 'failed', 'source_fallback')),
  add column if not exists image_generated_at timestamptz,
  add column if not exists ai_highlights_ru text[] not null default '{}',
  add column if not exists image_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_news_articles_image_status
  on public.news_articles (image_status, published_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'news-images',
  'news-images',
  true,
  1048576,
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read news images" on storage.objects;
create policy "Public can read news images" on storage.objects
for select using (bucket_id = 'news-images');

drop policy if exists "Admins can manage news images" on storage.objects;
create policy "Admins can manage news images" on storage.objects
for all using (
  bucket_id = 'news-images'
  and public.is_admin()
)
with check (
  bucket_id = 'news-images'
  and public.is_admin()
);
