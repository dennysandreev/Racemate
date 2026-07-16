begin;

create temporary table current_2026_driver_state on commit drop as
with race_entries as (
  select
    race.round,
    result.driver_id,
    result.team_id,
    not (
      lower(coalesce(result.status, '')) like any (
        array[
          '%did not start%',
          '%did not qualify%',
          '%did not prequalify%',
          '%withdrawn%'
        ]::text[]
      )
    ) as started
  from public.races race
  join public.sessions session
    on session.race_id = race.id
   and session.session_type = 'race'
  join public.session_results result
    on result.session_id = session.id
  where race.season_year = 2026
    and result.driver_id is not null
    and result.team_id is not null
),
team_scores as (
  select
    driver_id,
    team_id,
    count(*) filter (where started) as team_starts,
    coalesce(max(round) filter (where started), 0) as latest_start_round
  from race_entries
  group by driver_id, team_id
),
driver_totals as (
  select
    driver_id,
    count(*) filter (where started) as starts
  from race_entries
  group by driver_id
),
ranked_teams as (
  select
    score.*,
    row_number() over (
      partition by score.driver_id
      order by
        score.team_starts desc,
        score.latest_start_round desc,
        score.team_id::text asc
    ) as priority
  from team_scores score
)
select
  ranked.driver_id,
  ranked.team_id as primary_team_id,
  totals.starts
from ranked_teams ranked
join driver_totals totals using (driver_id)
where ranked.priority = 1;

create temporary table current_2026_team_state on commit drop as
select distinct result.team_id
from public.races race
join public.sessions session
  on session.race_id = race.id
 and session.session_type = 'race'
join public.session_results result
  on result.session_id = session.id
where race.season_year = 2026
  and result.team_id is not null;

do $$
begin
  if not exists (select 1 from current_2026_driver_state)
    or not exists (select 1 from current_2026_team_state)
  then
    raise exception 'Cannot recalculate current state without 2026 race participants';
  end if;
end
$$;

update public.drivers
set
  is_active = false,
  current_team_id = null,
  updated_at = now()
where is_active
   or current_team_id is not null;

update public.drivers driver
set
  is_active = true,
  current_team_id = state.primary_team_id,
  updated_at = now()
from current_2026_driver_state state
where driver.id = state.driver_id;

update public.teams
set
  is_active = false,
  updated_at = now()
where is_active;

update public.teams team
set
  is_active = true,
  updated_at = now()
from current_2026_team_state state
where team.id = state.team_id;

delete from public.driver_season_profiles profile
where profile.season_year = 2026
  and not exists (
    select 1
    from current_2026_driver_state state
    where state.driver_id = profile.driver_id
  );

insert into public.driver_season_profiles (
  season_year,
  driver_id,
  primary_team_id,
  code,
  permanent_number,
  starts,
  avatar_image_url,
  avatar_review_status,
  source_urls,
  assets_verified_at
)
select
  2026,
  driver.id,
  state.primary_team_id,
  driver.code,
  driver.permanent_number,
  state.starts,
  case
    when driver.slug is not null then '/drivers/avatars/2026/' || driver.slug || '.webp'
    else null
  end,
  case when driver.slug is not null then 'approved' else 'missing' end,
  jsonb_build_array(jsonb_build_object('kind', 'legacy_local_asset')),
  case when driver.slug is not null then now() else null end
from current_2026_driver_state state
join public.drivers driver on driver.id = state.driver_id
on conflict (season_year, driver_id) do update set
  primary_team_id = excluded.primary_team_id,
  code = excluded.code,
  permanent_number = excluded.permanent_number,
  starts = excluded.starts,
  updated_at = now();

delete from public.team_season_profiles profile
where profile.season_year = 2026
  and not exists (
    select 1
    from current_2026_team_state state
    where state.team_id = profile.team_id
  );

notify pgrst, 'reload schema';

commit;
