-- Refresh the official Formula1.com maps for Monza and Madring. Versioned
-- image URLs make the updated files visible immediately after deployment.

update public.race_track_assets as asset
set
  image_url = case race.round
    when 13 then '/f1/circuits/2026/13-italy.webp?v=590e479f06f4'
    when 14 then '/f1/circuits/2026/14-spain.webp?v=775b19c8917a'
  end,
  source_url = case race.round
    when 13 then 'https://www.formula1.com/en/racing/2026/italy'
    when 14 then 'https://www.formula1.com/en/racing/2026/spain'
  end,
  checksum_sha256 = case race.round
    when 13 then '590e479f06f4352939b4dcc841c5dea1770dca692115f6a4ca0737ff8e3cad19'
    when 14 then '775b19c8917a5005a138a1804e8e212fe9ad0c716b4d849ea25a814868376ada'
  end,
  source_manifest = coalesce(asset.source_manifest, '{}'::jsonb) || case race.round
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
  is_verified = true,
  verified_at = now()
from public.races as race
where asset.race_id = race.id
  and race.season_year = 2026
  and race.round in (13, 14);
