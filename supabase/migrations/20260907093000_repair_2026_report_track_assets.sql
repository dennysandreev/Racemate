-- Ensure the report renderer receives local, query-free asset paths. The prior
-- refresh migration updated existing rows only and used versioned URLs that the
-- server-side filesystem reader could not resolve.

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
  race.id,
  circuit.id,
  case race.round
    when 13 then 'monza'
    when 14 then 'madring'
  end,
  case race.round
    when 13 then '/f1/circuits/2026/13-italy.webp'
    when 14 then '/f1/circuits/2026/14-spain.webp'
  end,
  case race.round
    when 13 then 'https://www.formula1.com/en/racing/2026/italy'
    when 14 then 'https://www.formula1.com/en/racing/2026/spain'
  end,
  case race.round
    when 13 then jsonb_build_object(
      'sourceUrl', 'https://media.formula1.com/image/upload/f_auto/q_auto/v1751632445/common/f1/2026/track/2026trackmonzadetailed.png',
      'liveSourceUrl', 'https://media.formula1.com/image/upload/f_auto/q_auto/v1751632445/common/f1/2026/track/2026trackmonzadetailed.png',
      'sha256', '590e479f06f4352939b4dcc841c5dea1770dca692115f6a4ca0737ff8e3cad19',
      'sourceImageSha256', 'c286ed26c3968b5f4370986cfcfb9521750d564e1309a4fed14eca3be764a8e5',
      'refreshedAt', '2026-09-04T18:35:38.000Z',
      'sourceSelection', 'official-season-page-live-asset'
    )
    when 14 then jsonb_build_object(
      'sourceUrl', 'https://media.formula1.com/image/upload/f_auto/q_auto/v1756285390/common/f1/2026/track/2026trackmadringdetailed.png',
      'liveSourceUrl', 'https://media.formula1.com/image/upload/f_auto/q_auto/v1756285390/common/f1/2026/track/2026trackmadringdetailed.png',
      'sha256', '775b19c8917a5005a138a1804e8e212fe9ad0c716b4d849ea25a814868376ada',
      'sourceImageSha256', '685e24d73dc144a36f2713ef96fafbf6b4bfbedb6c97604090287be14dbdc824',
      'refreshedAt', '2026-09-04T18:35:38.000Z',
      'sourceSelection', 'official-season-page-live-asset'
    )
  end,
  case race.round
    when 13 then '590e479f06f4352939b4dcc841c5dea1770dca692115f6a4ca0737ff8e3cad19'
    when 14 then '775b19c8917a5005a138a1804e8e212fe9ad0c716b4d849ea25a814868376ada'
  end,
  true,
  now()
from public.races as race
join public.circuits as circuit on circuit.id = race.circuit_id
where race.season_year = 2026
  and race.round in (13, 14)
on conflict (race_id) do update
set
  circuit_id = excluded.circuit_id,
  layout_slug = excluded.layout_slug,
  image_url = excluded.image_url,
  source_url = excluded.source_url,
  source_manifest = excluded.source_manifest,
  checksum_sha256 = excluded.checksum_sha256,
  is_verified = excluded.is_verified,
  verified_at = excluded.verified_at,
  updated_at = now();

update public.grand_prix_reports
set
  next_refresh_at = now(),
  refresh_stage = -1
where season = 2026
  and round = 13
  and status = 'partial';
