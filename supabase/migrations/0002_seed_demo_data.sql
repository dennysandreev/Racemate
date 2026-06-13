-- RaceMate V1 demo seed.
-- Uses natural keys and subqueries instead of generated ID references.

insert into public.seasons (year)
values (2026)
on conflict (year) do nothing;

insert into public.teams (external_id, code, name, short_name, country, color_hex)
values
  ('red_bull', 'RBR', 'Red Bull Racing', 'Red Bull', 'Austria', '#3671C6'),
  ('mclaren', 'MCL', 'McLaren', 'McLaren', 'United Kingdom', '#FF8000'),
  ('ferrari', 'FER', 'Ferrari', 'Ferrari', 'Italy', '#E80020')
on conflict (code) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  country = excluded.country,
  color_hex = excluded.color_hex,
  updated_at = now();

insert into public.drivers (
  external_id,
  code,
  permanent_number,
  first_name,
  last_name,
  full_name,
  country,
  current_team_id
)
values
  (
    'max_verstappen',
    'VER',
    1,
    'Макс',
    'Ферстаппен',
    'Макс Ферстаппен',
    'Netherlands',
    (select id from public.teams where code = 'RBR')
  ),
  (
    'lando_norris',
    'NOR',
    4,
    'Ландо',
    'Норрис',
    'Ландо Норрис',
    'United Kingdom',
    (select id from public.teams where code = 'MCL')
  ),
  (
    'charles_leclerc',
    'LEC',
    16,
    'Шарль',
    'Леклер',
    'Шарль Леклер',
    'Monaco',
    (select id from public.teams where code = 'FER')
  ),
  (
    'oscar_piastri',
    'PIA',
    81,
    'Оскар',
    'Пиастри',
    'Оскар Пиастри',
    'Australia',
    (select id from public.teams where code = 'MCL')
  )
on conflict (external_id) do update set
  code = excluded.code,
  permanent_number = excluded.permanent_number,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  full_name = excluded.full_name,
  country = excluded.country,
  current_team_id = excluded.current_team_id,
  updated_at = now();

insert into public.circuits (
  external_id,
  name,
  country,
  locality,
  latitude,
  longitude,
  timezone
)
values (
  'villeneuve',
  'Жиль-Вильнев',
  'Canada',
  'Montreal',
  45.500000,
  -73.522800,
  'America/Toronto'
)
on conflict (external_id) do update set
  name = excluded.name,
  country = excluded.country,
  locality = excluded.locality,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  timezone = excluded.timezone,
  updated_at = now();

insert into public.races (
  season_year,
  round,
  race_name,
  circuit_id,
  official_url,
  race_start_at,
  status
)
values (
  2026,
  10,
  'Гран-при Канады',
  (select id from public.circuits where external_id = 'villeneuve'),
  'https://www.formula1.com/',
  '2026-06-14 18:00:00+00',
  'scheduled'
)
on conflict (season_year, round) do update set
  race_name = excluded.race_name,
  circuit_id = excluded.circuit_id,
  official_url = excluded.official_url,
  race_start_at = excluded.race_start_at,
  status = excluded.status,
  updated_at = now();

insert into public.sessions (race_id, session_type, name, start_at, status)
values
  (
    (select id from public.races where season_year = 2026 and round = 10),
    'fp1',
    'Свободная практика 1',
    '2026-06-12 18:30:00+00',
    'scheduled'
  ),
  (
    (select id from public.races where season_year = 2026 and round = 10),
    'fp2',
    'Свободная практика 2',
    '2026-06-12 22:00:00+00',
    'scheduled'
  ),
  (
    (select id from public.races where season_year = 2026 and round = 10),
    'qualifying',
    'Квалификация',
    '2026-06-13 20:00:00+00',
    'scheduled'
  ),
  (
    (select id from public.races where season_year = 2026 and round = 10),
    'race',
    'Гонка',
    '2026-06-14 18:00:00+00',
    'scheduled'
  )
on conflict (race_id, session_type) do update set
  name = excluded.name,
  start_at = excluded.start_at,
  status = excluded.status,
  updated_at = now();

insert into public.driver_standings (
  season_year,
  round,
  driver_id,
  team_id,
  position,
  points,
  wins
)
values
  (
    2026,
    9,
    (select id from public.drivers where external_id = 'max_verstappen'),
    (select id from public.teams where code = 'RBR'),
    1,
    169,
    4
  ),
  (
    2026,
    9,
    (select id from public.drivers where external_id = 'lando_norris'),
    (select id from public.teams where code = 'MCL'),
    2,
    149,
    2
  ),
  (
    2026,
    9,
    (select id from public.drivers where external_id = 'charles_leclerc'),
    (select id from public.teams where code = 'FER'),
    3,
    138,
    1
  ),
  (
    2026,
    9,
    (select id from public.drivers where external_id = 'oscar_piastri'),
    (select id from public.teams where code = 'MCL'),
    4,
    132,
    1
  )
on conflict (season_year, round, driver_id) do update set
  team_id = excluded.team_id,
  position = excluded.position,
  points = excluded.points,
  wins = excluded.wins,
  updated_at = now();

insert into public.news_sources (name, source_type, url, language, is_active)
values
  ('Autosport', 'rss', 'https://www.autosport.com/rss/f1/news/', 'en', true),
  ('The Race', 'rss', 'https://www.the-race.com/formula-1/rss/', 'en', true),
  ('RaceFans', 'rss', 'https://www.racefans.net/feed/', 'en', true)
on conflict (url) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  language = excluded.language,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.tags (type, slug, name)
values
  ('team', 'ferrari', 'Ferrari'),
  ('team', 'mclaren', 'McLaren'),
  ('topic', 'fia', 'FIA')
on conflict (slug) do update set
  type = excluded.type,
  name = excluded.name;

insert into public.news_articles (
  source_id,
  canonical_url,
  original_url,
  original_title,
  original_description,
  original_language,
  published_at,
  ai_summary_ru,
  ai_title_ru,
  importance_score,
  status,
  ai_model,
  ai_processed_at,
  raw_payload
)
values
  (
    (select id from public.news_sources where name = 'Autosport'),
    'https://example.com/racemate/ferrari-updates-canada',
    'https://example.com/racemate/ferrari-updates-canada',
    'Ferrari to test Canada update package',
    'Ferrari will evaluate floor and rear wing changes during the first practice session.',
    'en',
    now() - interval '18 minutes',
    'Команда привезет доработки днища и заднего крыла. Главный вопрос уикенда — хватит ли темпа на длинных сериях.',
    'Ferrari проверит новый пакет обновлений уже в первой тренировке',
    7,
    'processed',
    'seed',
    now(),
    '{\"seed\":true}'::jsonb
  ),
  (
    (select id from public.news_sources where name = 'The Race'),
    'https://example.com/racemate/fia-track-limits-canada',
    'https://example.com/racemate/fia-track-limits-canada',
    'FIA clarifies Canada track limits',
    'Race control highlighted corners where track limit violations are expected.',
    'en',
    now() - interval '42 minutes',
    'Дирекция гонки отдельно отметила повороты, где чаще всего ждут нарушения. Пилотам обещают более быстрые решения по штрафам.',
    'FIA уточнила правила по лимитам трассы перед уикендом',
    6,
    'processed',
    'seed',
    now(),
    '{\"seed\":true}'::jsonb
  ),
  (
    (select id from public.news_sources where name = 'RaceFans'),
    'https://example.com/racemate/mclaren-fast-corners',
    'https://example.com/racemate/mclaren-fast-corners',
    'McLaren expects strength in fast corners',
    'McLaren engineers expect the circuit layout to suit the car better than the previous round.',
    'en',
    now() - interval '1 hour',
    'Инженеры команды считают, что конфигурация трассы подойдет машине лучше, чем прошлый этап.',
    'McLaren рассчитывает сохранить преимущество в быстрых поворотах',
    5,
    'processed',
    'seed',
    now(),
    '{\"seed\":true}'::jsonb
  )
on conflict (canonical_url) do update set
  source_id = excluded.source_id,
  original_title = excluded.original_title,
  original_description = excluded.original_description,
  published_at = excluded.published_at,
  ai_summary_ru = excluded.ai_summary_ru,
  ai_title_ru = excluded.ai_title_ru,
  importance_score = excluded.importance_score,
  status = excluded.status,
  ai_model = excluded.ai_model,
  ai_processed_at = excluded.ai_processed_at,
  raw_payload = excluded.raw_payload,
  updated_at = now();

insert into public.news_article_tags (article_id, tag_id, confidence, method)
select articles.id, tags.id, 1, 'seed'
from public.news_articles articles
join public.tags tags on tags.slug = 'ferrari'
where articles.canonical_url = 'https://example.com/racemate/ferrari-updates-canada'
on conflict (article_id, tag_id) do update set
  confidence = excluded.confidence,
  method = excluded.method;

insert into public.news_article_tags (article_id, tag_id, confidence, method)
select articles.id, tags.id, 1, 'seed'
from public.news_articles articles
join public.tags tags on tags.slug = 'fia'
where articles.canonical_url = 'https://example.com/racemate/fia-track-limits-canada'
on conflict (article_id, tag_id) do update set
  confidence = excluded.confidence,
  method = excluded.method;

insert into public.news_article_tags (article_id, tag_id, confidence, method)
select articles.id, tags.id, 1, 'seed'
from public.news_articles articles
join public.tags tags on tags.slug = 'mclaren'
where articles.canonical_url = 'https://example.com/racemate/mclaren-fast-corners'
on conflict (article_id, tag_id) do update set
  confidence = excluded.confidence,
  method = excluded.method;

insert into public.job_runs (
  job_name,
  status,
  started_at,
  finished_at,
  items_processed,
  metadata
)
values
  ('rss.fetch_all', 'success', now() - interval '8 minutes', now() - interval '5 minutes', 42, '{\"seed\":true}'::jsonb),
  ('news.ai_summarize', 'running', now() - interval '2 minutes', null, 8, '{\"seed\":true}'::jsonb),
  ('jolpica.sync_results', 'success', now() - interval '15 minutes', now() - interval '12 minutes', 3, '{\"seed\":true}'::jsonb);
