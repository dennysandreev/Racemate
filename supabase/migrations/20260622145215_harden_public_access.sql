-- Trigger functions are never called through the Data API.
alter function public.touch_updated_at() set search_path = public;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

-- These helper functions are used only after a user is authenticated.
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_league_member(uuid) from public, anon, authenticated;
revoke all on function public.shares_prediction_league(uuid) from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.shares_prediction_league(uuid) to authenticated;

-- Internal administration records do not need to be discoverable to anonymous clients.
revoke select on table public.admin_users from public;
revoke select on table public.ai_usage_logs from public;
grant select on table public.admin_users to authenticated;
grant select on table public.ai_usage_logs to authenticated;
