-- Historical Formula 1 seasons, season-scoped profiles, and presentation assets.
-- Historical data stays private until the season passes the worker publication gate.

alter table public.seasons
  add column if not exists is_published boolean not null default false,
  add column if not exists published_at timestamptz;

insert into public.seasons (year, is_published, published_at)
values
  (2020, false, null),
  (2021, false, null),
  (2022, false, null),
  (2023, false, null),
  (2024, false, null),
  (2025, false, null),
  (2026, true, now())
on conflict (year) do update set
  is_published = public.seasons.is_published or excluded.is_published,
  published_at = case
    when public.seasons.is_published or excluded.is_published
      then coalesce(public.seasons.published_at, excluded.published_at, now())
    else public.seasons.published_at
  end;

create table if not exists public.team_lineages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_season_profiles (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null references public.seasons(year) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  lineage_id uuid not null references public.team_lineages(id) on delete restrict,
  display_name text not null,
  short_name text,
  code text,
  country text,
  color_hex text,
  logo_image_url text,
  car_image_url text,
  source_urls jsonb not null default '[]'::jsonb,
  assets_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_year, team_id),
  unique (season_year, lineage_id),
  check (jsonb_typeof(source_urls) = 'array')
);

create table if not exists public.driver_season_profiles (
  id uuid primary key default gen_random_uuid(),
  season_year integer not null references public.seasons(year) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  primary_team_id uuid references public.teams(id) on delete set null,
  code text,
  permanent_number integer,
  starts integer not null default 0 check (starts >= 0),
  avatar_image_url text,
  avatar_prompt text,
  avatar_reference_url text,
  avatar_review_status text not null default 'missing'
    check (avatar_review_status in ('missing', 'pending', 'approved', 'rejected')),
  source_urls jsonb not null default '[]'::jsonb,
  assets_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_year, driver_id),
  check (jsonb_typeof(source_urls) = 'array')
);

create table if not exists public.race_track_assets (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null unique references public.races(id) on delete cascade,
  circuit_id uuid references public.circuits(id) on delete set null,
  layout_slug text not null,
  image_url text,
  source_url text,
  source_manifest jsonb not null default '{}'::jsonb,
  checksum_sha256 text,
  is_verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(source_manifest) = 'object'),
  check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  check (
    not is_verified
    or (
      image_url is not null
      and source_url is not null
      and checksum_sha256 is not null
      and verified_at is not null
    )
  )
);

create index if not exists idx_team_season_profiles_lineage_season
  on public.team_season_profiles (lineage_id, season_year desc);

create index if not exists idx_team_season_profiles_team_season
  on public.team_season_profiles (team_id, season_year desc);

create index if not exists idx_driver_season_profiles_driver_season
  on public.driver_season_profiles (driver_id, season_year desc);

create index if not exists idx_driver_season_profiles_primary_team
  on public.driver_season_profiles (season_year, primary_team_id);

create index if not exists idx_race_track_assets_circuit
  on public.race_track_assets (circuit_id);

drop trigger if exists team_lineages_touch_updated_at on public.team_lineages;
create trigger team_lineages_touch_updated_at
before update on public.team_lineages
for each row execute function public.touch_updated_at();

drop trigger if exists team_season_profiles_touch_updated_at on public.team_season_profiles;
create trigger team_season_profiles_touch_updated_at
before update on public.team_season_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists driver_season_profiles_touch_updated_at on public.driver_season_profiles;
create trigger driver_season_profiles_touch_updated_at
before update on public.driver_season_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists race_track_assets_touch_updated_at on public.race_track_assets;
create trigger race_track_assets_touch_updated_at
before update on public.race_track_assets
for each row execute function public.touch_updated_at();

insert into public.team_lineages (slug, display_name)
values
  ('alpine', 'Alpine'),
  ('aston-martin', 'Aston Martin'),
  ('audi', 'Audi'),
  ('cadillac', 'Cadillac'),
  ('ferrari', 'Ferrari'),
  ('haas', 'Haas'),
  ('mclaren', 'McLaren'),
  ('mercedes', 'Mercedes'),
  ('racing-bulls', 'Racing Bulls'),
  ('red-bull', 'Red Bull Racing'),
  ('williams', 'Williams')
on conflict (slug) do update set
  display_name = excluded.display_name,
  updated_at = now();

with team_mapping(external_id, lineage_slug, asset_slug, logo_path) as (
  values
    ('alpine', 'alpine', 'alpine', '/f1/teams/logos/2026/alpine.webp'),
    ('renault', 'alpine', 'alpine', '/f1/teams/logos/2026/alpine.webp'),
    ('aston_martin', 'aston-martin', 'aston-martin', '/f1/teams/logos/2026/aston-martin.webp'),
    ('racing_point', 'aston-martin', 'aston-martin', '/f1/teams/logos/2026/aston-martin.webp'),
    ('audi', 'audi', 'audi', '/f1/teams/logos/2026/audi.webp'),
    ('sauber', 'audi', 'audi', '/f1/teams/logos/2026/audi.webp'),
    ('alfa', 'audi', 'audi', '/f1/teams/logos/2026/audi.webp'),
    ('cadillac', 'cadillac', 'cadillac', '/f1/teams/logos/2026/cadillac.webp'),
    ('ferrari', 'ferrari', 'ferrari', '/f1/teams/logos/2026/ferrari.webp'),
    ('haas', 'haas', 'haas', '/f1/teams/logos/2026/haas.webp'),
    ('mclaren', 'mclaren', 'mclaren', '/f1/teams/logos/2026/mclaren.webp'),
    ('mercedes', 'mercedes', 'mercedes', '/f1/teams/logos/2026/mercedes.webp'),
    ('alphatauri', 'racing-bulls', 'rb', '/f1/teams/logos/2026/rb.webp'),
    ('rb', 'racing-bulls', 'rb', '/f1/teams/logos/2026/rb.webp'),
    ('racing_bulls', 'racing-bulls', 'rb', '/f1/teams/logos/2026/rb.webp'),
    ('red_bull', 'red-bull', 'red-bull', '/f1/teams/logos/2026/red-bull.webp'),
    ('williams', 'williams', 'williams', '/f1/teams/logos/2026/williams.webp')
),
ranked_teams as (
  select
    team.*,
    mapping.lineage_slug,
    mapping.asset_slug,
    mapping.logo_path,
    row_number() over (
      partition by mapping.lineage_slug
      order by
        case mapping.external_id
          when 'alpine' then 1
          when 'aston_martin' then 1
          when 'audi' then 1
          when 'racing_bulls' then 1
          when 'rb' then 2
          when 'renault' then 3
          when 'racing_point' then 3
          when 'sauber' then 3
          when 'alfa' then 4
          when 'alphatauri' then 4
          else 1
        end,
        team.updated_at desc
    ) as lineage_rank
  from public.teams team
  join team_mapping mapping on mapping.external_id = team.external_id
  where team.is_active = true
)
insert into public.team_season_profiles (
  season_year,
  team_id,
  lineage_id,
  display_name,
  short_name,
  code,
  country,
  color_hex,
  logo_image_url,
  car_image_url,
  source_urls,
  assets_verified_at
)
select
  2026,
  team.id,
  lineage.id,
  team.name,
  team.short_name,
  team.code,
  team.country,
  team.color_hex,
  team.logo_path,
  '/f1/teams/cars/2026/' || team.asset_slug || '.webp',
  jsonb_build_array(jsonb_build_object('kind', 'legacy_local_asset')),
  now()
from ranked_teams team
join public.team_lineages lineage on lineage.slug = team.lineage_slug
where team.lineage_rank = 1
on conflict (season_year, lineage_id) do update set
  team_id = excluded.team_id,
  display_name = excluded.display_name,
  short_name = excluded.short_name,
  code = excluded.code,
  country = excluded.country,
  color_hex = excluded.color_hex,
  logo_image_url = coalesce(public.team_season_profiles.logo_image_url, excluded.logo_image_url),
  car_image_url = coalesce(public.team_season_profiles.car_image_url, excluded.car_image_url),
  assets_verified_at = coalesce(public.team_season_profiles.assets_verified_at, excluded.assets_verified_at),
  updated_at = now();

insert into public.driver_season_profiles (
  season_year,
  driver_id,
  primary_team_id,
  code,
  permanent_number,
  avatar_image_url,
  avatar_review_status,
  source_urls,
  assets_verified_at
)
select
  2026,
  driver.id,
  driver.current_team_id,
  driver.code,
  driver.permanent_number,
  '/drivers/avatars/2026/' || driver.slug || '.webp',
  case when driver.slug is not null then 'approved' else 'missing' end,
  jsonb_build_array(jsonb_build_object('kind', 'legacy_local_asset')),
  case when driver.slug is not null then now() else null end
from public.drivers driver
where driver.is_active = true
on conflict (season_year, driver_id) do update set
  primary_team_id = excluded.primary_team_id,
  code = excluded.code,
  permanent_number = excluded.permanent_number,
  avatar_image_url = coalesce(public.driver_season_profiles.avatar_image_url, excluded.avatar_image_url),
  avatar_review_status = case
    when public.driver_season_profiles.avatar_review_status = 'missing' then excluded.avatar_review_status
    else public.driver_season_profiles.avatar_review_status
  end,
  assets_verified_at = coalesce(public.driver_season_profiles.assets_verified_at, excluded.assets_verified_at),
  updated_at = now();

alter table public.team_lineages enable row level security;
alter table public.team_season_profiles enable row level security;
alter table public.driver_season_profiles enable row level security;
alter table public.race_track_assets enable row level security;

drop policy if exists "Public can read seasons" on public.seasons;
drop policy if exists "Public can read published seasons" on public.seasons;
create policy "Public can read published seasons" on public.seasons
for select to anon, authenticated
using (is_published = true);

drop policy if exists "Public can read races" on public.races;
drop policy if exists "Public can read races in published seasons" on public.races;
create policy "Public can read races in published seasons" on public.races
for select to anon, authenticated
using (
  exists (
    select 1 from public.seasons season
    where season.year = races.season_year
      and season.is_published = true
  )
);

drop policy if exists "Public can read sessions" on public.sessions;
drop policy if exists "Public can read sessions in published seasons" on public.sessions;
create policy "Public can read sessions in published seasons" on public.sessions
for select to anon, authenticated
using (
  exists (
    select 1
    from public.races race
    join public.seasons season on season.year = race.season_year
    where race.id = sessions.race_id
      and season.is_published = true
  )
);

drop policy if exists "Public can read session results" on public.session_results;
drop policy if exists "Public can read results in published seasons" on public.session_results;
create policy "Public can read results in published seasons" on public.session_results
for select to anon, authenticated
using (
  exists (
    select 1
    from public.sessions session
    join public.races race on race.id = session.race_id
    join public.seasons season on season.year = race.season_year
    where session.id = session_results.session_id
      and season.is_published = true
  )
);

drop policy if exists "Public can read driver standings" on public.driver_standings;
drop policy if exists "Public can read driver standings in published seasons" on public.driver_standings;
create policy "Public can read driver standings in published seasons" on public.driver_standings
for select to anon, authenticated
using (
  exists (
    select 1 from public.seasons season
    where season.year = driver_standings.season_year
      and season.is_published = true
  )
);

drop policy if exists "Public can read constructor standings" on public.constructor_standings;
drop policy if exists "Public can read constructor standings in published seasons" on public.constructor_standings;
create policy "Public can read constructor standings in published seasons" on public.constructor_standings
for select to anon, authenticated
using (
  exists (
    select 1 from public.seasons season
    where season.year = constructor_standings.season_year
      and season.is_published = true
  )
);

drop policy if exists "Public can read active teams" on public.teams;
drop policy if exists "Public can read active or published teams" on public.teams;
create policy "Public can read active or published teams" on public.teams
for select to anon, authenticated
using (
  is_active = true
  or exists (
    select 1
    from public.team_season_profiles profile
    join public.seasons season on season.year = profile.season_year
    where profile.team_id = teams.id
      and season.is_published = true
      and profile.logo_image_url is not null
      and profile.car_image_url is not null
      and profile.assets_verified_at is not null
  )
);

drop policy if exists "Public can read active drivers" on public.drivers;
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
      and profile.avatar_image_url is not null
      and profile.avatar_review_status = 'approved'
      and profile.assets_verified_at is not null
      and (
        profile.season_year = 2026
        or (profile.avatar_prompt is not null and profile.avatar_reference_url is not null)
      )
  )
);

drop policy if exists "Public can read published team lineages" on public.team_lineages;
create policy "Public can read published team lineages" on public.team_lineages
for select to anon, authenticated
using (
  exists (
    select 1
    from public.team_season_profiles profile
    join public.seasons season on season.year = profile.season_year
    where profile.lineage_id = team_lineages.id
      and season.is_published = true
      and profile.logo_image_url is not null
      and profile.car_image_url is not null
      and profile.assets_verified_at is not null
  )
);

drop policy if exists "Public can read published team profiles" on public.team_season_profiles;
create policy "Public can read published team profiles" on public.team_season_profiles
for select to anon, authenticated
using (
  exists (
    select 1 from public.seasons season
    where season.year = team_season_profiles.season_year
      and season.is_published = true
      and team_season_profiles.logo_image_url is not null
      and team_season_profiles.car_image_url is not null
      and team_season_profiles.assets_verified_at is not null
  )
);

drop policy if exists "Public can read published driver profiles" on public.driver_season_profiles;
create policy "Public can read published driver profiles" on public.driver_season_profiles
for select to anon, authenticated
using (
  exists (
    select 1 from public.seasons season
    where season.year = driver_season_profiles.season_year
      and season.is_published = true
      and driver_season_profiles.avatar_image_url is not null
      and driver_season_profiles.avatar_review_status = 'approved'
      and driver_season_profiles.assets_verified_at is not null
      and (
        driver_season_profiles.season_year = 2026
        or (
          driver_season_profiles.avatar_prompt is not null
          and driver_season_profiles.avatar_reference_url is not null
        )
      )
  )
);

drop policy if exists "Public can read published race track assets" on public.race_track_assets;
create policy "Public can read published race track assets" on public.race_track_assets
for select to anon, authenticated
using (
  exists (
    select 1
    from public.races race
    join public.seasons season on season.year = race.season_year
    where race.id = race_track_assets.race_id
      and season.is_published = true
      and race_track_assets.is_verified = true
      and race_track_assets.image_url is not null
      and race_track_assets.source_url is not null
      and race_track_assets.checksum_sha256 is not null
      and race_track_assets.verified_at is not null
  )
);

drop policy if exists "Admins can manage seasons" on public.seasons;
create policy "Admins can manage seasons" on public.seasons
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage team lineages" on public.team_lineages;
create policy "Admins can manage team lineages" on public.team_lineages
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage team season profiles" on public.team_season_profiles;
create policy "Admins can manage team season profiles" on public.team_season_profiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage driver season profiles" on public.driver_season_profiles;
create policy "Admins can manage driver season profiles" on public.driver_season_profiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage race track assets" on public.race_track_assets;
create policy "Admins can manage race track assets" on public.race_track_assets
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage teams" on public.teams;
create policy "Admins can manage teams" on public.teams
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage drivers" on public.drivers;
create policy "Admins can manage drivers" on public.drivers
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage circuits" on public.circuits;
create policy "Admins can manage circuits" on public.circuits
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage races" on public.races;
create policy "Admins can manage races" on public.races
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage sessions" on public.sessions;
create policy "Admins can manage sessions" on public.sessions
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage session results" on public.session_results;
create policy "Admins can manage session results" on public.session_results
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage driver standings" on public.driver_standings;
create policy "Admins can manage driver standings" on public.driver_standings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage constructor standings" on public.constructor_standings;
create policy "Admins can manage constructor standings" on public.constructor_standings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on table public.team_lineages to anon, authenticated;
grant select on table public.team_season_profiles to anon, authenticated;
grant select on table public.driver_season_profiles to anon, authenticated;
grant select on table public.race_track_assets to anon, authenticated;
grant select on table public.seasons to anon, authenticated;

grant insert, update, delete on table public.team_lineages to authenticated;
grant insert, update, delete on table public.team_season_profiles to authenticated;
grant insert, update, delete on table public.driver_season_profiles to authenticated;
grant insert, update, delete on table public.race_track_assets to authenticated;
grant insert, update, delete on table public.seasons to authenticated;
grant insert, update, delete on table public.teams to authenticated;
grant insert, update, delete on table public.drivers to authenticated;
grant insert, update, delete on table public.circuits to authenticated;
grant insert, update, delete on table public.races to authenticated;
grant insert, update, delete on table public.sessions to authenticated;
grant insert, update, delete on table public.session_results to authenticated;
grant insert, update, delete on table public.driver_standings to authenticated;
grant insert, update, delete on table public.constructor_standings to authenticated;

grant all on table public.team_lineages to service_role;
grant all on table public.team_season_profiles to service_role;
grant all on table public.driver_season_profiles to service_role;
grant all on table public.race_track_assets to service_role;
grant all on table public.seasons to service_role;

notify pgrst, 'reload schema';
