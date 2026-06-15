-- RaceMate social feed: cached public X and Reddit posts.

create table if not exists public.social_sources (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('x', 'reddit')),
  name text not null,
  source_type text not null default 'rss',
  url text not null,
  adapter text not null,
  feed_kind text,
  is_active boolean not null default true,
  fetch_interval_minutes integer not null default 15,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, url)
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('x', 'reddit')),
  source_id uuid references public.social_sources(id) on delete set null,
  external_id text not null,
  author text,
  title text,
  body text,
  original_url text not null unique,
  image_url text,
  published_at timestamptz,
  reaction_count integer,
  popularity_score numeric(10, 2) not null default 0,
  raw_payload jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_id)
);

create index if not exists idx_social_posts_platform_published_at
on public.social_posts (platform, published_at desc, id desc);

create index if not exists idx_social_posts_popularity
on public.social_posts (popularity_score desc, reaction_count desc, published_at desc, id desc);

create index if not exists idx_social_sources_platform_active
on public.social_sources (platform, is_active);

drop trigger if exists social_sources_touch_updated_at on public.social_sources;
create trigger social_sources_touch_updated_at
before update on public.social_sources
for each row execute function public.touch_updated_at();

drop trigger if exists social_posts_touch_updated_at on public.social_posts;
create trigger social_posts_touch_updated_at
before update on public.social_posts
for each row execute function public.touch_updated_at();

alter table public.social_sources enable row level security;
alter table public.social_posts enable row level security;

grant select on public.social_posts to anon, authenticated;
grant select, insert, update, delete on public.social_sources to authenticated;
grant select, insert, update, delete on public.social_posts to authenticated;

create policy "Public can read social posts" on public.social_posts
for select using (true);

create policy "Admins can manage social sources" on public.social_sources
for all using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage social posts" on public.social_posts
for all using (public.is_admin())
with check (public.is_admin());

notify pgrst, 'reload schema';
