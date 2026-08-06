drop policy if exists "Admins can read agent settings"
on public.admin_agent_settings;
create policy "Admins can read agent settings"
on public.admin_agent_settings
for select
to authenticated
using (public.is_admin());

-- The policy documents intended access. Browser roles still have no table grant;
-- the server-side admin client is the only application reader.
revoke select on table public.admin_agent_settings from authenticated;

create index if not exists idx_admin_agent_settings_updated_by
  on public.admin_agent_settings (updated_by)
  where updated_by is not null;
