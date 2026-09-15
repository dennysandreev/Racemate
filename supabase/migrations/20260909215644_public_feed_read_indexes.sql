-- Match the public feeds' actual ordering, including NULLS LAST.
-- EXPLAIN showed full sorting before LIMIT on both feeds.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index if not exists idx_news_articles_public_chronological
  on public.news_articles (published_at desc nulls last)
  where status = 'processed'
    and publication_status = 'published'
    and (ai_model is null or ai_model <> 'fallback')
    and duplicate_of is null;

create index if not exists idx_social_posts_public_chronological
  on public.social_posts (published_at desc nulls last, id desc)
  where status = 'published' and duplicate_of is null;
