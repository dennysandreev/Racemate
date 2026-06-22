-- Jolpica uses short driver IDs (for example, `norris`), while the original
-- demo seed used name-based IDs. Merge those aliases without losing data.
create temporary table racemate_driver_aliases (
  legacy_external_id text primary key,
  canonical_external_id text not null
) on commit drop;

insert into racemate_driver_aliases (legacy_external_id, canonical_external_id)
values
  ('lando_norris', 'norris'),
  ('charles_leclerc', 'leclerc'),
  ('oscar_piastri', 'piastri');

create temporary table racemate_driver_merge on commit drop as
select
  legacy.id as legacy_id,
  canonical.id as canonical_id
from racemate_driver_aliases aliases
join public.drivers legacy on legacy.external_id = aliases.legacy_external_id
join public.drivers canonical on canonical.external_id = aliases.canonical_external_id
where legacy.id <> canonical.id;

-- Remove rows that would conflict with the canonical driver before remapping.
delete from public.session_results legacy
using racemate_driver_merge driver_merge
where legacy.driver_id = driver_merge.legacy_id
  and exists (
    select 1
    from public.session_results canonical
    where canonical.session_id = legacy.session_id
      and canonical.driver_id = driver_merge.canonical_id
  );

delete from public.driver_standings legacy
using racemate_driver_merge driver_merge
where legacy.driver_id = driver_merge.legacy_id
  and exists (
    select 1
    from public.driver_standings canonical
    where canonical.season_year = legacy.season_year
      and canonical.round is not distinct from legacy.round
      and canonical.driver_id = driver_merge.canonical_id
  );

delete from public.user_favorite_drivers legacy
using racemate_driver_merge driver_merge
where legacy.driver_id = driver_merge.legacy_id
  and exists (
    select 1
    from public.user_favorite_drivers canonical
    where canonical.user_id = legacy.user_id
      and canonical.driver_id = driver_merge.canonical_id
  );

update public.session_results result
set driver_id = driver_merge.canonical_id
from racemate_driver_merge driver_merge
where result.driver_id = driver_merge.legacy_id;

update public.driver_standings standing
set driver_id = driver_merge.canonical_id
from racemate_driver_merge driver_merge
where standing.driver_id = driver_merge.legacy_id;

update public.user_favorite_drivers favorite
set driver_id = driver_merge.canonical_id
from racemate_driver_merge driver_merge
where favorite.driver_id = driver_merge.legacy_id;

update public.predictions prediction
set
  pole_driver_id = coalesce(
    (select canonical_id from racemate_driver_merge where legacy_id = prediction.pole_driver_id),
    prediction.pole_driver_id
  ),
  winner_driver_id = coalesce(
    (select canonical_id from racemate_driver_merge where legacy_id = prediction.winner_driver_id),
    prediction.winner_driver_id
  ),
  fastest_lap_driver_id = coalesce(
    (select canonical_id from racemate_driver_merge where legacy_id = prediction.fastest_lap_driver_id),
    prediction.fastest_lap_driver_id
  ),
  dnf_driver_id = coalesce(
    (select canonical_id from racemate_driver_merge where legacy_id = prediction.dnf_driver_id),
    prediction.dnf_driver_id
  ),
  top3_driver_ids = case
    when prediction.top3_driver_ids is null then null
    else array(
      select remapped.driver_id
      from (
        select distinct on (coalesce(driver_merge.canonical_id, picked.driver_id))
          coalesce(driver_merge.canonical_id, picked.driver_id) as driver_id,
          picked.position
        from unnest(prediction.top3_driver_ids) with ordinality as picked(driver_id, position)
        left join racemate_driver_merge driver_merge on driver_merge.legacy_id = picked.driver_id
        order by coalesce(driver_merge.canonical_id, picked.driver_id), picked.position
      ) remapped
      order by remapped.position
    )
  end,
  top10_driver_ids = case
    when prediction.top10_driver_ids is null then null
    else array(
      select remapped.driver_id
      from (
        select distinct on (coalesce(driver_merge.canonical_id, picked.driver_id))
          coalesce(driver_merge.canonical_id, picked.driver_id) as driver_id,
          picked.position
        from unnest(prediction.top10_driver_ids) with ordinality as picked(driver_id, position)
        left join racemate_driver_merge driver_merge on driver_merge.legacy_id = picked.driver_id
        order by coalesce(driver_merge.canonical_id, picked.driver_id), picked.position
      ) remapped
      order by remapped.position
    )
  end,
  score = null,
  score_breakdown = null,
  scored_at = null
where prediction.pole_driver_id in (select legacy_id from racemate_driver_merge)
   or prediction.winner_driver_id in (select legacy_id from racemate_driver_merge)
   or prediction.fastest_lap_driver_id in (select legacy_id from racemate_driver_merge)
   or prediction.dnf_driver_id in (select legacy_id from racemate_driver_merge)
   or prediction.top3_driver_ids && array(select legacy_id from racemate_driver_merge)
   or prediction.top10_driver_ids && array(select legacy_id from racemate_driver_merge);

update public.drivers legacy
set
  is_active = false,
  updated_at = now()
from racemate_driver_merge driver_merge
where legacy.id = driver_merge.legacy_id;

-- On a fresh database only the seed rows exist. Give them Jolpica IDs so the
-- first worker sync updates them instead of creating a second active record.
update public.drivers legacy
set
  external_id = aliases.canonical_external_id,
  updated_at = now()
from racemate_driver_aliases aliases
where legacy.external_id = aliases.legacy_external_id
  and not exists (
    select 1
    from public.drivers canonical
    where canonical.external_id = aliases.canonical_external_id
  );

create unique index if not exists drivers_active_code_unique
  on public.drivers (code)
  where is_active and code is not null and btrim(code) <> '';
