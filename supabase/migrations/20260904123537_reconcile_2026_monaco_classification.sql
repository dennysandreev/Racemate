do $$
declare
  canonical_driver_count integer;
  canonical_result_count integer;
  monaco_race_session_id uuid;
begin
  select session.id
  into monaco_race_session_id
  from public.sessions as session
  join public.races as race on race.id = session.race_id
  where race.season_year = 2026
    and race.round = 6
    and session.session_type = 'race'
  limit 1;

  if monaco_race_session_id is null then
    raise notice 'Monaco 2026 race session is not available yet';
    return;
  end if;

  select count(distinct driver.external_id)
  into canonical_driver_count
  from public.drivers as driver
  where driver.external_id = any (array[
    'antonelli', 'hamilton', 'hadjar', 'piastri', 'lawson', 'arvid_lindblad',
    'gasly', 'albon', 'ocon', 'alonso', 'bortoleto', 'russell',
    'hulkenberg', 'colapinto', 'perez', 'sainz', 'leclerc', 'stroll',
    'norris', 'bearman', 'bottas', 'max_verstappen'
  ]);

  if canonical_driver_count <> 22 then
    raise exception 'Monaco 2026 correction aborted: expected 22 canonical drivers, found %', canonical_driver_count;
  end if;

  select count(distinct result.driver_id)
  into canonical_result_count
  from public.session_results as result
  join public.drivers as driver on driver.id = result.driver_id
  where result.session_id = monaco_race_session_id
    and driver.external_id = any (array[
      'antonelli', 'hamilton', 'hadjar', 'piastri', 'lawson', 'arvid_lindblad',
      'gasly', 'albon', 'ocon', 'alonso', 'bortoleto', 'russell',
      'hulkenberg', 'colapinto', 'perez', 'sainz', 'leclerc', 'stroll',
      'norris', 'bearman', 'bottas', 'max_verstappen'
    ]);

  if canonical_result_count <> 22 then
    raise exception 'Monaco 2026 correction aborted: expected 22 canonical results, found %', canonical_result_count;
  end if;

  update public.session_results as result
  set
    position = correction.position,
    classified_position = correction.position::text,
    points = correction.points,
    time_text = coalesce(correction.time_text, result.time_text),
    raw_payload = coalesce(result.raw_payload, '{}'::jsonb)
      || jsonb_build_object(
        'position', correction.position::text,
        'positionText', correction.position::text,
        'points', correction.points::text,
        '_raceside_official_correction', jsonb_build_object(
          'published_at', '2026-09-04T00:00:00.000Z',
          'source_url', 'https://www.fia.com/events/fia-formula-one-world-championship/season-2026/monaco-grand-prix/race-qualification'
        )
      )
      || case
        when correction.time_text is null then '{}'::jsonb
        else jsonb_build_object(
          'Time', coalesce(result.raw_payload -> 'Time', '{}'::jsonb)
            || jsonb_build_object('time', correction.time_text)
        )
      end,
    updated_at = now()
  from (
    values
      ('antonelli', 1, 25::numeric, '2:23:31.243'),
      ('hamilton', 2, 18::numeric, '+6.271'),
      ('hadjar', 3, 15::numeric, '+23.394'),
      ('piastri', 4, 12::numeric, '+24.261'),
      ('lawson', 5, 10::numeric, '+26.553'),
      ('arvid_lindblad', 6, 8::numeric, '+29.010'),
      ('gasly', 7, 6::numeric, '+30.369'),
      ('albon', 8, 4::numeric, '+33.413'),
      ('ocon', 9, 2::numeric, '+37.140'),
      ('alonso', 10, 1::numeric, '+41.899'),
      ('bortoleto', 11, 0::numeric, '+42.748'),
      ('russell', 12, 0::numeric, '+43.353'),
      ('hulkenberg', 13, 0::numeric, '+44.102'),
      ('colapinto', 14, 0::numeric, '+48.964'),
      ('perez', 15, 0::numeric, '+49.153'),
      ('sainz', 16, 0::numeric, null),
      ('leclerc', 17, 0::numeric, null),
      ('stroll', 18, 0::numeric, null),
      ('norris', 19, 0::numeric, null),
      ('bearman', 20, 0::numeric, null),
      ('bottas', 21, 0::numeric, null),
      ('max_verstappen', 22, 0::numeric, null)
  ) as correction(external_id, position, points, time_text)
  join public.drivers as driver on driver.external_id = correction.external_id
  where result.session_id = monaco_race_session_id
    and result.driver_id = driver.id;

  delete from public.session_results as result
  where result.session_id = monaco_race_session_id
    and not exists (
      select 1
      from public.drivers as driver
      where driver.id = result.driver_id
        and driver.external_id = any (array[
          'antonelli', 'hamilton', 'hadjar', 'piastri', 'lawson', 'arvid_lindblad',
          'gasly', 'albon', 'ocon', 'alonso', 'bortoleto', 'russell',
          'hulkenberg', 'colapinto', 'perez', 'sainz', 'leclerc', 'stroll',
          'norris', 'bearman', 'bottas', 'max_verstappen'
        ])
    );

  update public.grand_prix_reports
  set
    last_error = null,
    next_refresh_at = now(),
    refresh_stage = -1,
    summary_status = 'pending',
    updated_at = now()
  where season = 2026
    and round = 6;
end
$$;
