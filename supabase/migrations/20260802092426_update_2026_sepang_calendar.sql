-- Replace the cancelled Bahrain venue with Sepang and repair stale future sessions
-- left behind when the remaining 2026 rounds shifted by one position.

insert into public.circuits (
  external_id,
  name,
  country,
  locality,
  latitude,
  longitude,
  timezone,
  slug,
  lap_length_km,
  race_laps,
  race_distance_km,
  turns_count,
  direction,
  first_grand_prix_year,
  lap_record_time,
  lap_record_driver,
  lap_record_year,
  drs_zones_count,
  track_type,
  track_description
)
values (
  'sepang',
  'Sepang International Circuit',
  'Malaysia',
  'Kuala Lumpur',
  2.760830,
  101.738000,
  'Asia/Kuala_Lumpur',
  'sepang-international-circuit',
  5.543,
  56,
  310.408,
  15,
  'clockwise',
  1999,
  '1:34.080',
  'Sebastian Vettel',
  2017,
  2,
  'permanent',
  'Широкая и быстрая трасса с длинными прямыми, тяжёлыми торможениями и переменчивой тропической погодой.'
)
on conflict (external_id) do update
set
  name = excluded.name,
  country = excluded.country,
  locality = excluded.locality,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  timezone = excluded.timezone,
  slug = excluded.slug,
  lap_length_km = excluded.lap_length_km,
  race_laps = excluded.race_laps,
  race_distance_km = excluded.race_distance_km,
  turns_count = excluded.turns_count,
  direction = excluded.direction,
  first_grand_prix_year = excluded.first_grand_prix_year,
  lap_record_time = excluded.lap_record_time,
  lap_record_driver = excluded.lap_record_driver,
  lap_record_year = excluded.lap_record_year,
  drs_zones_count = excluded.drs_zones_count,
  track_type = excluded.track_type,
  track_description = excluded.track_description;

update public.races
set
  race_name = 'Bahrain Grand Prix in Malaysia',
  circuit_id = (select id from public.circuits where external_id = 'sepang'),
  official_url = 'https://www.formula1.com/en/racing/2026/bahrain',
  race_start_at = '2026-10-04T07:00:00Z',
  status = 'scheduled'
where season_year = 2026
  and round = 16;

delete from public.sessions
using public.races
where sessions.race_id = races.id
  and races.season_year = 2026
  and races.round = 16;

insert into public.sessions (
  race_id,
  session_type,
  name,
  start_at,
  end_at,
  status,
  openf1_session_key
)
select
  races.id,
  schedule.session_type,
  schedule.name,
  schedule.start_at,
  schedule.end_at,
  'scheduled',
  schedule.openf1_session_key
from public.races
cross join (
  values
    ('fp1', 'Свободная практика 1', '2026-10-02T04:30:00Z'::timestamptz, '2026-10-02T05:30:00Z'::timestamptz, 11727),
    ('fp2', 'Свободная практика 2', '2026-10-02T08:00:00Z'::timestamptz, '2026-10-02T09:00:00Z'::timestamptz, 11728),
    ('fp3', 'Свободная практика 3', '2026-10-03T04:30:00Z'::timestamptz, '2026-10-03T05:30:00Z'::timestamptz, 11729),
    ('qualifying', 'Квалификация', '2026-10-03T08:00:00Z'::timestamptz, '2026-10-03T09:00:00Z'::timestamptz, 11730),
    ('race', 'Гонка', '2026-10-04T07:00:00Z'::timestamptz, '2026-10-04T09:00:00Z'::timestamptz, 11731)
) as schedule(session_type, name, start_at, end_at, openf1_session_key)
where races.season_year = 2026
  and races.round = 16
on conflict (race_id, session_type) do update
set
  name = excluded.name,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  status = excluded.status,
  openf1_session_key = excluded.openf1_session_key;

delete from public.sessions
using public.races
where sessions.race_id = races.id
  and races.season_year = 2026
  and races.round = 17
  and sessions.session_type in ('fp2', 'fp3');

insert into public.race_track_assets (
  race_id,
  circuit_id,
  layout_slug,
  image_url,
  source_url,
  source_manifest,
  checksum_sha256,
  is_verified,
  verified_at
)
select
  races.id,
  races.circuit_id,
  'malaysia',
  '/f1/circuits/2026/16-malaysia.webp',
  'https://www.formula1.com/en/racing/2026/bahrain',
  jsonb_build_object(
    'season', 2026,
    'round', 16,
    'raceName', 'Bahrain Grand Prix in Malaysia',
    'circuitId', 'sepang',
    'layoutSlug', 'malaysia',
    'file', '/f1/circuits/2026/16-malaysia.webp',
    'authority', 'Formula1.com',
    'pageUrl', 'https://www.formula1.com/en/racing/2026/bahrain',
    'racePageUrl', 'https://www.formula1.com/en/racing/2026/bahrain',
    'sourceUrl', 'https://media.formula1.com/image/upload/c_fit,h_704/q_auto/v1740000001/common/f1/2026/track/2026trackkualalumpurdetailed.webp',
    'sourceImageSha256', '395027e7760ca173888a9d7022e7289ef8903c03337dbffdb3cb14d2c8673a5e',
    'sha256', '395027e7760ca173888a9d7022e7289ef8903c03337dbffdb3cb14d2c8673a5e',
    'sourceSelection', 'official-season-page-live-asset',
    'width', 1252,
    'height', 704,
    'rightsReviewRequired', true,
    'rightsReview', jsonb_build_object('status', 'approved', 'reviewedAt', '2026-07-18'),
    'manualReview', jsonb_build_object('status', 'approved', 'reviewedAt', '2026-08-02T00:00:00Z', 'reviewer', 'RaceSide visual QA')
  ),
  '395027e7760ca173888a9d7022e7289ef8903c03337dbffdb3cb14d2c8673a5e',
  true,
  now()
from public.races
where races.season_year = 2026
  and races.round = 16
on conflict (race_id) do update
set
  circuit_id = excluded.circuit_id,
  layout_slug = excluded.layout_slug,
  image_url = excluded.image_url,
  source_url = excluded.source_url,
  source_manifest = excluded.source_manifest,
  checksum_sha256 = excluded.checksum_sha256,
  is_verified = excluded.is_verified,
  verified_at = excluded.verified_at;
