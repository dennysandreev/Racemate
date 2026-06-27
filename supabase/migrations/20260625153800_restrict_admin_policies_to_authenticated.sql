-- Keep admin helper functions private from anon users while preventing public
-- reads from evaluating admin-only policies.

drop policy if exists "Admins can manage everything" on public.admin_users;
create policy "Admins can manage everything" on public.admin_users
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage sources" on public.news_sources;
create policy "Admins can manage sources" on public.news_sources
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage articles" on public.news_articles;
create policy "Admins can manage articles" on public.news_articles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage tags" on public.tags;
create policy "Admins can manage tags" on public.tags
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read jobs" on public.job_runs;
create policy "Admins can read jobs" on public.job_runs
for select to authenticated
using (public.is_admin());

drop policy if exists "Admins can manage jobs" on public.job_runs;
create policy "Admins can manage jobs" on public.job_runs
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read ai usage" on public.ai_usage_logs;
create policy "Admins can read ai usage" on public.ai_usage_logs
for select to authenticated
using (public.is_admin());

drop policy if exists "Admins can manage circuit weather" on public.circuit_weather;
create policy "Admins can manage circuit weather" on public.circuit_weather
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage circuit layouts" on public.circuit_layouts;
create policy "Admins can manage circuit layouts" on public.circuit_layouts
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage session weather" on public.session_weather;
create policy "Admins can manage session weather" on public.session_weather
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage social sources" on public.social_sources;
create policy "Admins can manage social sources" on public.social_sources
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage social posts" on public.social_posts;
create policy "Admins can manage social posts" on public.social_posts
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage grand prix reports" on public.grand_prix_reports;
create policy "Admins can manage grand prix reports" on public.grand_prix_reports
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage news images" on storage.objects;
create policy "Admins can manage news images" on storage.objects
for all to authenticated
using (
  bucket_id = 'news-images'
  and public.is_admin()
)
with check (
  bucket_id = 'news-images'
  and public.is_admin()
);

drop policy if exists "Admins can manage driver avatars" on storage.objects;
create policy "Admins can manage driver avatars" on storage.objects
for all to authenticated
using (
  bucket_id = 'driver-avatars'
  and public.is_admin()
)
with check (
  bucket_id = 'driver-avatars'
  and public.is_admin()
);

notify pgrst, 'reload schema';
