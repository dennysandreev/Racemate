drop policy if exists "Admins can read news dedup decisions" on public.news_dedup_decisions;

revoke all on table public.news_dedup_decisions from authenticated;
grant select, insert, update, delete on table public.news_dedup_decisions to service_role;
