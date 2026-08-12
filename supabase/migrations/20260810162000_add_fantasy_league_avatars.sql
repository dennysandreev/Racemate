alter table public.prediction_leagues
  add column if not exists avatar_path text,
  add column if not exists avatar_updated_at timestamptz;

alter table public.prediction_leagues
  drop constraint if exists prediction_leagues_avatar_path_format;

alter table public.prediction_leagues
  add constraint prediction_leagues_avatar_path_format
  check (
    avatar_path is null
    or avatar_path = id::text || '/avatar.webp'
  );

alter table public.prediction_leagues
  drop constraint if exists prediction_leagues_avatar_timestamp_consistency;

alter table public.prediction_leagues
  add constraint prediction_leagues_avatar_timestamp_consistency
  check (avatar_path is not null or avatar_updated_at is null);

comment on column public.prediction_leagues.avatar_path is
  'Fixed league-owned path in the fantasy-league-avatars Storage bucket.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fantasy-league-avatars',
  'fantasy-league-avatars',
  true,
  262144,
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read fantasy league avatars" on storage.objects;
create policy "Public can read fantasy league avatars"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'fantasy-league-avatars');

-- Writes only go through an authenticated server action that verifies league ownership.
notify pgrst, 'reload schema';
