-- Restore the original article-only news feed.
-- Source articles remain untouched and become visible again when memberships are removed.

drop view if exists public.news_feed_entries;
drop table if exists public.news_story_articles;
drop table if exists public.news_stories;

notify pgrst, 'reload schema';
