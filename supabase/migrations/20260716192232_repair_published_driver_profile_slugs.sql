-- Restore public routes for drivers imported before profile slugs were assigned.
begin;

do $$
begin
  if exists (
    with repairs (external_id, slug) as (
      values
        ('doohan', 'jack-doohan'),
        ('kevin_magnussen', 'kevin-magnussen'),
        ('mick_schumacher', 'mick-schumacher'),
        ('mazepin', 'nikita-mazepin'),
        ('pietro_fittipaldi', 'pietro-fittipaldi'),
        ('grosjean', 'romain-grosjean')
    )
    select 1
    from repairs
    join public.drivers target on target.external_id = repairs.external_id
    join public.drivers conflict
      on conflict.slug = repairs.slug
     and conflict.id <> target.id
  ) then
    raise exception 'Cannot repair published driver slugs because a canonical slug is already in use';
  end if;
end $$;

with repairs (external_id, slug) as (
  values
    ('doohan', 'jack-doohan'),
    ('kevin_magnussen', 'kevin-magnussen'),
    ('mick_schumacher', 'mick-schumacher'),
    ('mazepin', 'nikita-mazepin'),
    ('pietro_fittipaldi', 'pietro-fittipaldi'),
    ('grosjean', 'romain-grosjean')
)
update public.drivers driver
set
  slug = repairs.slug,
  updated_at = now()
from repairs
where driver.external_id = repairs.external_id
  and nullif(btrim(driver.slug), '') is null
  and exists (
    select 1
    from public.driver_season_profiles profile
    join public.seasons season on season.year = profile.season_year
    where profile.driver_id = driver.id
      and season.is_published = true
  );

do $$
begin
  if exists (
    select 1
    from public.driver_season_profiles profile
    join public.seasons season on season.year = profile.season_year
    join public.drivers driver on driver.id = profile.driver_id
    where season.is_published = true
      and nullif(btrim(driver.slug), '') is null
  ) then
    raise exception 'Published driver profiles must have a route slug';
  end if;
end $$;

commit;
