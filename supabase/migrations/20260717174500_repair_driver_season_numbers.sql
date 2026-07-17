with session_driver_numbers as (
  select
    race.season_year,
    result.driver_id,
    case
      when result.raw_payload #>> '{Driver,permanentNumber}' ~ '^[0-9]+$'
        then (result.raw_payload #>> '{Driver,permanentNumber}')::integer
      when result.raw_payload #>> '{Driver,permanent_number}' ~ '^[0-9]+$'
        then (result.raw_payload #>> '{Driver,permanent_number}')::integer
      when result.raw_payload ->> 'driver_number' ~ '^[0-9]+$'
        then (result.raw_payload ->> 'driver_number')::integer
      when result.raw_payload ->> 'driverNumber' ~ '^[0-9]+$'
        then (result.raw_payload ->> 'driverNumber')::integer
      else null
    end as permanent_number
  from public.session_results result
  join public.sessions session on session.id = result.session_id
  join public.races race on race.id = session.race_id
  where result.driver_id is not null
), ranked_numbers as (
  select
    season_year,
    driver_id,
    permanent_number,
    row_number() over (
      partition by season_year, driver_id
      order by count(*) desc, permanent_number asc
    ) as preference
  from session_driver_numbers
  where permanent_number is not null
    and permanent_number > 0
  group by season_year, driver_id, permanent_number
)
update public.driver_season_profiles profile
set
  permanent_number = ranked.permanent_number,
  updated_at = now()
from ranked_numbers ranked
where ranked.preference = 1
  and profile.season_year = ranked.season_year
  and profile.driver_id = ranked.driver_id
  and profile.permanent_number is distinct from ranked.permanent_number;

update public.driver_season_profiles profile
set
  permanent_number = case
    when driver.external_id = 'norris' and profile.season_year between 2020 and 2025 then 4
    when driver.external_id = 'max_verstappen' and profile.season_year between 2020 and 2021 then 33
    when driver.external_id = 'max_verstappen' and profile.season_year between 2022 and 2025 then 1
    else profile.permanent_number
  end,
  updated_at = now()
from public.drivers driver
where driver.id = profile.driver_id
  and (
    (driver.external_id = 'norris' and profile.season_year between 2020 and 2025)
    or (driver.external_id = 'max_verstappen' and profile.season_year between 2020 and 2025)
  );

delete from public.session_results stale
using public.sessions session, public.races race
where stale.session_id = session.id
  and session.race_id = race.id
  and race.season_year = 2026
  and session.session_type not in ('race', 'sprint')
  and stale.status in ('Лучшее время', 'Лучший круг')
  and not exists (
    select 1
    from public.driver_season_profiles own_profile
    where own_profile.season_year = race.season_year
      and own_profile.driver_id = stale.driver_id
  )
  and exists (
    select 1
    from public.driver_season_profiles canonical_profile
    where canonical_profile.season_year = race.season_year
      and canonical_profile.permanent_number = case
        when stale.raw_payload ->> 'driver_number' ~ '^[0-9]+$'
          then (stale.raw_payload ->> 'driver_number')::integer
        when stale.raw_payload ->> 'driverNumber' ~ '^[0-9]+$'
          then (stale.raw_payload ->> 'driverNumber')::integer
        else null
      end
  );
