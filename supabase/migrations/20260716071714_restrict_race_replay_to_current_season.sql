-- Race Replay is a current-season feature. A replay may legitimately use
-- telemetry from an earlier source season, so public access is scoped through
-- the target race instead of race_replay_sessions.source_season.

drop policy if exists "Public can read track maps" on public.track_maps;
drop policy if exists "Public can read current-season track maps" on public.track_maps;
create policy "Public can read current-season track maps" on public.track_maps
for select to anon, authenticated
using (
  exists (
    select 1
    from public.race_replay_sessions session
    join public.races race on race.id = session.race_id
    where session.track_map_id = track_maps.id
      and session.status = 'ready'
      and race.season_year = 2026
  )
);

drop policy if exists "Public can read ready replay sessions" on public.race_replay_sessions;
drop policy if exists "Public can read current-season replay sessions" on public.race_replay_sessions;
create policy "Public can read current-season replay sessions" on public.race_replay_sessions
for select to anon, authenticated
using (
  status = 'ready'
  and exists (
    select 1
    from public.races race
    where race.id = race_replay_sessions.race_id
      and race.season_year = 2026
  )
);

drop policy if exists "Public can read replay events" on public.race_replay_events;
drop policy if exists "Public can read current-season replay events" on public.race_replay_events;
create policy "Public can read current-season replay events" on public.race_replay_events
for select to anon, authenticated
using (
  exists (
    select 1
    from public.race_replay_sessions session
    join public.races race on race.id = session.race_id
    where session.id = race_replay_events.replay_session_id
      and session.status = 'ready'
      and race.season_year = 2026
  )
);

drop policy if exists "Admins can manage track maps" on public.track_maps;
create policy "Admins can manage track maps" on public.track_maps
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage replay sessions" on public.race_replay_sessions;
create policy "Admins can manage replay sessions" on public.race_replay_sessions
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage replay events" on public.race_replay_events;
create policy "Admins can manage replay events" on public.race_replay_events
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

notify pgrst, 'reload schema';
