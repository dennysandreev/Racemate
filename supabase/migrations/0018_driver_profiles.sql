-- RaceMate driver profile pages and manual AI avatar storage.

alter table public.drivers
  add column if not exists slug text,
  add column if not exists country_code text,
  add column if not exists ai_avatar_url text,
  add column if not exists avatar_placeholder_style text;

with driver_slugs as (
  select
    id,
    regexp_replace(
      regexp_replace(
        lower(coalesce(nullif(full_name, ''), nullif(code, ''), id::text)),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '(^-|-$)',
      '',
      'g'
    ) as base_slug,
    code,
    permanent_number
  from public.drivers
  where slug is null or slug = ''
),
ranked as (
  select
    id,
    nullif(base_slug, '') as base_slug,
    row_number() over (
      partition by nullif(base_slug, '')
      order by id
    ) as duplicate_rank,
    code,
    permanent_number
  from driver_slugs
)
update public.drivers d
set slug = case
  when ranked.base_slug is null then 'driver-' || left(d.id::text, 8)
  when ranked.duplicate_rank = 1 then ranked.base_slug
  else ranked.base_slug || '-' || coalesce(lower(nullif(ranked.code, '')), ranked.permanent_number::text, left(d.id::text, 8))
end
from ranked
where d.id = ranked.id;

create unique index if not exists drivers_slug_unique_idx
  on public.drivers (slug)
  where slug is not null;

create index if not exists idx_drivers_active_slug
  on public.drivers (is_active, slug);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-avatars',
  'driver-avatars',
  true,
  2097152,
  array['image/webp', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read driver avatars" on storage.objects;
create policy "Public can read driver avatars" on storage.objects
for select using (bucket_id = 'driver-avatars');

drop policy if exists "Admins can manage driver avatars" on storage.objects;
create policy "Admins can manage driver avatars" on storage.objects
for all using (
  bucket_id = 'driver-avatars'
  and public.is_admin()
)
with check (
  bucket_id = 'driver-avatars'
  and public.is_admin()
);
