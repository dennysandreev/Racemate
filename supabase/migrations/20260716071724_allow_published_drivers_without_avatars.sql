-- Historical driver portraits are optional. Public archive access is governed
-- by season publication, not by portrait generation or manual portrait review.

begin;

drop policy if exists "Public can read active or published drivers" on public.drivers;
create policy "Public can read active or published drivers" on public.drivers
for select to anon, authenticated
using (
  is_active = true
  or exists (
    select 1
    from public.driver_season_profiles profile
    join public.seasons season on season.year = profile.season_year
    where profile.driver_id = drivers.id
      and season.is_published = true
  )
);

drop policy if exists "Public can read published driver profiles" on public.driver_season_profiles;
create policy "Public can read published driver profiles" on public.driver_season_profiles
for select to anon, authenticated
using (
  exists (
    select 1
    from public.seasons season
    where season.year = driver_season_profiles.season_year
      and season.is_published = true
  )
);

comment on column public.driver_season_profiles.avatar_image_url is
  'Optional season-specific portrait. A null value must not block publication.';

commit;
