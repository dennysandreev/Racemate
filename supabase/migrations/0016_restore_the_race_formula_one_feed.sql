-- The Race removed its former Formula 1-only RSS endpoint. Its live feed is
-- cross-series, so fetch it through the worker's Formula 1 category filter.
update public.news_sources
set
  source_type = 'rss-formula-1',
  url = 'https://www.the-race.com/feed/',
  last_error = null,
  updated_at = now()
where name = 'The Race';
