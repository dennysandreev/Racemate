create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (consent_type in ('terms', 'personal_data', 'marketing')),
  document_version text not null,
  granted boolean not null,
  source text not null default 'signup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, consent_type, document_version)
);

alter table public.user_consents enable row level security;

create policy "Users can read own consents"
on public.user_consents for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.user_consents from anon, authenticated;
grant select on table public.user_consents to authenticated;
grant all on table public.user_consents to service_role;
