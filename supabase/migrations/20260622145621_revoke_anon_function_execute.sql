-- Supabase grants EXECUTE to API roles explicitly, so revoke each role as well
-- as PUBLIC. The authenticated grants are restored only for policy helpers.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.is_league_member(uuid) from public, anon, authenticated;
revoke execute on function public.shares_prediction_league(uuid) from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.shares_prediction_league(uuid) to authenticated;
