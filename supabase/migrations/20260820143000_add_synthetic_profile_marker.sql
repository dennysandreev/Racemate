alter table public.profiles
  add column if not exists is_bot boolean not null default false;

comment on column public.profiles.is_bot is
  'Marks synthetic preview accounts that can be removed without affecting real users.';

create index if not exists profiles_is_bot_idx
  on public.profiles (is_bot)
  where is_bot = true;
