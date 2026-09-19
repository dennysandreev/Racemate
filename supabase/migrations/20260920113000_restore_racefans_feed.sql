update public.news_sources
set
  url = 'https://feeds.feedburner.com/racefans',
  last_error = null,
  updated_at = now()
where name = 'RaceFans'
  and url = 'https://www.racefans.net/feed/';
