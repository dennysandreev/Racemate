-- Refresh the official Formula1.com Baku map. The versioned image URL makes
-- the updated file visible immediately after deployment instead of serving
-- the previous circuit map from browser or CDN cache.

update public.race_track_assets as asset
set
  image_url = '/f1/circuits/2026/15-azerbaijan.webp?v=42fbd6872dda',
  source_url = 'https://www.formula1.com/en/racing/2026/azerbaijan',
  checksum_sha256 = '42fbd6872ddafe6f5a54534bb4b9d87d9f0a2f57b9138e98a336f848c4a81f02',
  source_manifest = coalesce(asset.source_manifest, '{}'::jsonb) || jsonb_build_object(
    'sourceUrl', 'https://media.formula1.com/image/upload/f_auto/q_auto/v1751632392/common/f1/2026/track/2026trackbakudetailed.png',
    'liveSourceUrl', 'https://media.formula1.com/image/upload/f_auto/q_auto/v1751632392/common/f1/2026/track/2026trackbakudetailed.png',
    'sha256', '42fbd6872ddafe6f5a54534bb4b9d87d9f0a2f57b9138e98a336f848c4a81f02',
    'sourceImageSha256', '0f33ccd543d64404406c3cb2f63ca336cd542d58b38d2081ff23179142f3c0d8',
    'refreshedAt', '2026-09-15T14:39:46.000Z',
    'sourceSelection', 'official-season-page-live-asset'
  ),
  is_verified = true,
  verified_at = now()
from public.races as race
where asset.race_id = race.id
  and race.season_year = 2026
  and race.round = 15;
