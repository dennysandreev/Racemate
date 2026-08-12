drop policy if exists "Public can read fantasy avatars" on storage.objects;

alter table public.profiles
  drop constraint if exists profiles_avatar_path_format,
  drop constraint if exists profiles_avatar_timestamp_consistency,
  drop column if exists avatar_path,
  drop column if exists avatar_updated_at;

notify pgrst, 'reload schema';
