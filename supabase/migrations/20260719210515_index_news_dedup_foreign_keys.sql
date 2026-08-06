create index if not exists news_articles_duplicate_of_idx
  on public.news_articles (duplicate_of)
  where duplicate_of is not null;

create index if not exists news_articles_manual_published_by_idx
  on public.news_articles (manual_published_by)
  where manual_published_by is not null;

create index if not exists news_dedup_locks_article_id_idx
  on public.news_dedup_locks (article_id);
