create table if not exists public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'published', 'archived')),
  system_prompt text not null check (char_length(system_prompt) between 20 and 20000),
  user_template text not null check (char_length(user_template) between 3 and 30000),
  change_note text check (change_note is null or char_length(change_note) <= 500),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  published_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (prompt_key, version)
);

create unique index if not exists idx_ai_prompt_versions_one_published
  on public.ai_prompt_versions (prompt_key)
  where status = 'published';

create index if not exists idx_ai_prompt_versions_history
  on public.ai_prompt_versions (prompt_key, version desc);

alter table public.ai_prompt_versions enable row level security;

drop policy if exists "Admins can read AI prompt versions" on public.ai_prompt_versions;
create policy "Admins can read AI prompt versions"
on public.ai_prompt_versions
for select
to authenticated
using (public.is_admin());

revoke insert, update, delete, truncate on public.ai_prompt_versions from anon, authenticated;
grant select on public.ai_prompt_versions to authenticated;
grant all on public.ai_prompt_versions to service_role;

alter table public.ai_usage_logs
  add column if not exists prompt_key text,
  add column if not exists prompt_version_id uuid references public.ai_prompt_versions(id) on delete set null;

create index if not exists idx_ai_usage_prompt_key_created_at
  on public.ai_usage_logs (prompt_key, created_at desc);

create or replace function public.save_admin_ai_prompt_version(
  p_prompt_key text,
  p_system_prompt text,
  p_user_template text,
  p_change_note text,
  p_actor uuid,
  p_publish boolean,
  p_checksum text
)
returns table (
  saved_id uuid,
  saved_version integer,
  saved_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_version integer;
  v_status text := case when p_publish then 'published' else 'draft' end;
begin
  if not exists (
    select 1
    from public.admin_users
    where user_id = p_actor
  ) then
    raise exception 'admin_required';
  end if;

  if p_prompt_key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' then
    raise exception 'invalid_prompt_key';
  end if;

  if char_length(trim(p_system_prompt)) not between 20 and 20000
    or char_length(trim(p_user_template)) not between 3 and 30000
    or p_checksum !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(p_change_note, '')) > 500 then
    raise exception 'invalid_prompt_content';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_prompt_key, 0));

  select id, version
  into v_id, v_version
  from public.ai_prompt_versions
  where prompt_key = p_prompt_key
    and status = v_status
    and checksum = p_checksum
  order by version desc
  limit 1;

  if v_id is not null then
    return query select v_id, v_version, v_status;
    return;
  end if;

  select coalesce(max(version), 0) + 1
  into v_version
  from public.ai_prompt_versions
  where prompt_key = p_prompt_key;

  if p_publish then
    update public.ai_prompt_versions
    set status = 'archived'
    where prompt_key = p_prompt_key
      and status = 'published';
  end if;

  insert into public.ai_prompt_versions (
    prompt_key,
    version,
    status,
    system_prompt,
    user_template,
    change_note,
    checksum,
    created_by,
    published_by,
    published_at
  )
  values (
    p_prompt_key,
    v_version,
    v_status,
    trim(p_system_prompt),
    trim(p_user_template),
    nullif(trim(coalesce(p_change_note, '')), ''),
    p_checksum,
    p_actor,
    case when p_publish then p_actor else null end,
    case when p_publish then now() else null end
  )
  returning id into v_id;

  return query select v_id, v_version, v_status;
end;
$$;

revoke all on function public.save_admin_ai_prompt_version(text, text, text, text, uuid, boolean, text)
from public, anon, authenticated;
grant execute on function public.save_admin_ai_prompt_version(text, text, text, text, uuid, boolean, text)
to service_role;
