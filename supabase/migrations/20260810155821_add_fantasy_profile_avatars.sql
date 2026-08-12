alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists avatar_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_avatar_path_format;

alter table public.profiles
  add constraint profiles_avatar_path_format
  check (
    avatar_path is null
    or avatar_path = id::text || '/avatar.webp'
  );

alter table public.profiles
  drop constraint if exists profiles_avatar_timestamp_consistency;

alter table public.profiles
  add constraint profiles_avatar_timestamp_consistency
  check (avatar_path is not null or avatar_updated_at is null);

comment on column public.profiles.avatar_path is
  'Fixed user-owned path in the fantasy-avatars Storage bucket.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fantasy-avatars',
  'fantasy-avatars',
  true,
  262144,
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read fantasy avatars" on storage.objects;
create policy "Public can read fantasy avatars"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'fantasy-avatars');

-- Uploads only go through the authenticated server action. No client-side
-- INSERT/UPDATE policy is intentionally created for this bucket.

notify pgrst, 'reload schema';
