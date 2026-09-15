-- Refresh the live Formula1.com maps for Hungary and the Netherlands, and use
-- the user-facing Malaysian event name for the Sepang round.

update public.races
set race_name = 'Malaysian Grand Prix'
where season_year = 2026
  and round = 16;

update public.race_track_assets as asset
set
  checksum_sha256 = case race.round
    when 11 then '9cc895218bef1519b6bd9fd4568306213c55f2bfefd5b8ce2948d99892f64422'
    when 12 then '69dced800aa19ad9629e2e7ed94d4e053fd7fd2312629a85cd77dabc981362ac'
  end,
  source_manifest = asset.source_manifest || jsonb_build_object(
    'sha256', case race.round
      when 11 then '9cc895218bef1519b6bd9fd4568306213c55f2bfefd5b8ce2948d99892f64422'
      when 12 then '69dced800aa19ad9629e2e7ed94d4e053fd7fd2312629a85cd77dabc981362ac'
    end,
    'sourceImageSha256', case race.round
      when 11 then '9cc895218bef1519b6bd9fd4568306213c55f2bfefd5b8ce2948d99892f64422'
      when 12 then '69dced800aa19ad9629e2e7ed94d4e053fd7fd2312629a85cd77dabc981362ac'
    end,
    'downloadedAt', '2026-08-18T07:26:56.000Z',
    'sourceSelection', 'official-season-page-live-asset'
  ),
  is_verified = true,
  verified_at = now()
from public.races as race
where asset.race_id = race.id
  and race.season_year = 2026
  and race.round in (11, 12);

update public.race_track_assets as asset
set source_manifest = asset.source_manifest || jsonb_build_object(
  'raceName', 'Malaysian Grand Prix',
  'sourceTitle', 'Malaysian Grand Prix official circuit map'
)
from public.races as race
where asset.race_id = race.id
  and race.season_year = 2026
  and race.round = 16;
