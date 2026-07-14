-- Group independent coverage of the same event into one editorial story.

create table if not exists public.news_stories (
  id uuid primary key default gen_random_uuid(),
  title_ru text not null,
  summary_ru text not null,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  source_count integer not null default 2 check (source_count >= 2),
  confirmed_by_multiple_sources boolean not null default true,
  confidence numeric(4, 3) not null default 0 check (confidence >= 0 and confidence <= 1),
  cover_article_id uuid references public.news_articles(id) on delete set null,
  published_at timestamptz not null,
  ai_model text,
  ai_processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_story_articles (
  story_id uuid not null references public.news_stories(id) on delete cascade,
  article_id uuid not null references public.news_articles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, article_id),
  unique (article_id)
);

create index if not exists idx_news_stories_published_at
  on public.news_stories (published_at desc) where status = 'published';
create index if not exists idx_news_stories_cover_article_id
  on public.news_stories (cover_article_id) where cover_article_id is not null;

create or replace view public.news_feed_entries
with (security_invoker = true)
as
select 'article'::text as entry_kind, articles.id as entry_id, articles.published_at
from public.news_articles articles
where articles.status = 'processed'
  and articles.duplicate_of is null
  and (articles.ai_model is null or articles.ai_model <> 'fallback')
  and not exists (
    select 1 from public.news_story_articles members where members.article_id = articles.id
  )
union all
select 'story'::text as entry_kind, stories.id as entry_id, stories.published_at
from public.news_stories stories
where stories.status = 'published';

drop trigger if exists news_stories_touch_updated_at on public.news_stories;
create trigger news_stories_touch_updated_at
before update on public.news_stories
for each row execute function public.touch_updated_at();

alter table public.news_stories enable row level security;
alter table public.news_story_articles enable row level security;

create policy "Public can read published news stories" on public.news_stories
for select to anon, authenticated using (status = 'published');

create policy "Public can read published story articles" on public.news_story_articles
for select to anon, authenticated
using (
  exists (
    select 1 from public.news_stories stories
    where stories.id = news_story_articles.story_id and stories.status = 'published'
  )
);

create policy "Admins can manage news stories" on public.news_stories
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins can manage story articles" on public.news_story_articles
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.news_feed_entries to anon, authenticated;
notify pgrst, 'reload schema';
