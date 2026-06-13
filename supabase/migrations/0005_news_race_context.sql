alter table public.news_articles
  add column if not exists ai_summary_long_ru text,
  add column if not exists ai_key_points_ru text[] not null default '{}',
  add column if not exists related_race_id uuid references public.races(id) on delete set null;

create index if not exists idx_news_articles_related_race_id
  on public.news_articles (related_race_id);

create index if not exists idx_news_articles_related_published_at
  on public.news_articles (related_race_id, published_at desc);
