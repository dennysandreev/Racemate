alter table public.predictions
  add column if not exists is_public boolean not null default true,
  add column if not exists share_slug text,
  add column if not exists shared_at timestamptz,
  add column if not exists share_image_version integer not null default 1;

create unique index if not exists predictions_share_slug_key
  on public.predictions (share_slug)
  where share_slug is not null;

alter table public.predictions
  drop constraint if exists predictions_share_image_version_positive;

alter table public.predictions
  add constraint predictions_share_image_version_positive
  check (share_image_version >= 1);
