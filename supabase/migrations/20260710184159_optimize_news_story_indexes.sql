create index if not exists idx_news_stories_cover_article_id
  on public.news_stories (cover_article_id)
  where cover_article_id is not null;

drop index if exists public.idx_news_story_articles_article_id;
