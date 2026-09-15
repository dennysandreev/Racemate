-- Keep multi-step editorial operations atomic. These functions are callable only
-- by the backend service role; the admin session is still checked by the server
-- action before the RPC is invoked.

alter table public.ops_service_heartbeats
  drop constraint if exists ops_service_heartbeats_service_name_check;
alter table public.ops_service_heartbeats
  add constraint ops_service_heartbeats_service_name_check
  check (service_name in ('web', 'worker', 'cron', 'admin-job-runner', 'watcher', 'live'));

create or replace function public.admin_save_news_article(
  p_article_id uuid,
  p_title text,
  p_summary text,
  p_body text,
  p_publication_status text,
  p_tag_names text[],
  p_actor_user_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_article public.news_articles;
  v_name text;
  v_tag_id uuid;
begin
  if p_publication_status not in ('draft', 'published', 'rejected') then
    raise exception 'invalid_news_status';
  end if;

  select * into v_article
  from public.news_articles
  where id = p_article_id
  for update;
  if not found then raise exception 'news_article_not_found'; end if;

  update public.news_articles
  set ai_title_ru = p_title,
      ai_summary_ru = p_summary,
      ai_summary_long_ru = p_body,
      publication_status = p_publication_status,
      status = case when p_title is not null and p_summary is not null then 'processed' else 'pending' end,
      published_at = case
        when p_publication_status = 'published' then coalesce(v_article.published_at, p_now)
        else v_article.published_at
      end,
      published_manually = p_publication_status = 'published',
      manual_published_at = case when p_publication_status = 'published' then p_now else null end,
      manual_published_by = case when p_publication_status = 'published' then p_actor_user_id else null end,
      updated_at = p_now
  where id = p_article_id;

  delete from public.news_article_tags relation
  using public.tags tag
  where relation.article_id = p_article_id
    and relation.tag_id = tag.id
    and tag.type = 'admin_topic';

  foreach v_name in array coalesce(p_tag_names, array[]::text[]) loop
    insert into public.tags(type, slug, name)
    values (
      'admin_topic',
      'topic-' || coalesce(nullif(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9а-яё]+', '-', 'gi')), ''), 'tag'),
      v_name
    )
    on conflict (slug) do update set name = excluded.name
    returning id into v_tag_id;

    insert into public.news_article_tags(article_id, tag_id, confidence, method)
    values (p_article_id, v_tag_id, 1, 'admin')
    on conflict (article_id, tag_id) do update
      set confidence = excluded.confidence, method = excluded.method;
  end loop;
end;
$$;

create or replace function public.admin_moderate_social_post(
  p_post_id uuid,
  p_action text,
  p_topic_slug text,
  p_topic_name text,
  p_actor_user_id uuid,
  p_now timestamptz,
  p_request_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tag_id uuid;
  v_job_id uuid;
begin
  if p_action not in ('publish', 'reject', 'retry') then
    raise exception 'invalid_social_action';
  end if;
  perform 1 from public.social_posts where id = p_post_id for update;
  if not found then raise exception 'social_post_not_found'; end if;

  if p_topic_slug is not null then
    if p_topic_slug not in (
      'social-race-weekend', 'social-technical', 'social-transfers',
      'social-statements', 'social-incidents', 'social-rumors', 'social-discussion'
    ) or p_topic_name is null then raise exception 'invalid_social_topic'; end if;

    insert into public.tags(type, slug, name)
    values ('social_topic', p_topic_slug, p_topic_name)
    on conflict (slug) do update set name = excluded.name
    returning id into v_tag_id;

    delete from public.social_post_tags relation
    using public.tags tag
    where relation.post_id = p_post_id
      and relation.tag_id = tag.id
      and tag.type = 'social_topic';

    insert into public.social_post_tags(post_id, tag_id, confidence, method, is_primary)
    values (p_post_id, v_tag_id, 1, 'admin', true)
    on conflict (post_id, tag_id) do update
      set confidence = excluded.confidence, method = excluded.method, is_primary = excluded.is_primary;
  end if;

  if p_action = 'retry' then
    update public.social_posts
    set status = 'pending', next_retry_at = p_now, last_processing_error = null, updated_at = p_now
    where id = p_post_id;

    insert into public.job_runs(
      job_name, status, queue_version, requested_by, available_at,
      attempt_count, max_attempts, request_key, items_processed, metadata
    ) values (
      'social.process_ai', 'queued', 1, p_actor_user_id, p_now,
      0, 2, p_request_key, 0,
      jsonb_build_object('source', 'admin', 'args', jsonb_build_object('postId', p_post_id), 'title', 'Обработать посты')
    ) returning id into v_job_id;
  else
    update public.social_posts
    set status = case when p_action = 'publish' then 'published' else 'rejected' end,
        next_retry_at = null,
        updated_at = p_now
    where id = p_post_id;
  end if;

  return v_job_id;
end;
$$;

create or replace function public.admin_save_poll(
  p_poll_id uuid,
  p_question text,
  p_status text,
  p_closes_at timestamptz,
  p_options text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_poll_id uuid;
  v_current_status text;
  v_votes integer;
  v_label text;
  v_order integer := 0;
begin
  if p_status not in ('draft', 'published', 'closed') or coalesce(array_length(p_options, 1), 0) < 2 then
    raise exception 'invalid_poll';
  end if;

  if p_poll_id is null then
    insert into public.polls(question, status, closes_at, poll_kind, generated_by_ai)
    values (p_question, p_status, p_closes_at, 'fan', false)
    returning id into v_poll_id;
  else
    select status into v_current_status from public.polls where id = p_poll_id for update;
    if not found then raise exception 'poll_not_found'; end if;
    if (v_current_status = 'published' and p_status = 'draft')
      or (v_current_status = 'closed' and p_status <> 'closed') then
      raise exception 'invalid_poll_transition';
    end if;
    v_poll_id := p_poll_id;
    update public.polls
    set question = p_question, status = p_status, closes_at = p_closes_at, updated_at = now()
    where id = v_poll_id;
  end if;

  select count(*) into v_votes from public.poll_votes where poll_id = v_poll_id;
  if v_votes = 0 then
    delete from public.poll_options where poll_id = v_poll_id;
    foreach v_label in array p_options loop
      insert into public.poll_options(poll_id, label, sort_order)
      values (v_poll_id, v_label, v_order);
      v_order := v_order + 1;
    end loop;
  end if;
  return v_poll_id;
end;
$$;

revoke all on function public.admin_save_news_article(uuid,text,text,text,text,text[],uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_moderate_social_post(uuid,text,text,text,uuid,timestamptz,text) from public, anon, authenticated;
revoke all on function public.admin_save_poll(uuid,text,text,timestamptz,text[]) from public, anon, authenticated;
grant execute on function public.admin_save_news_article(uuid,text,text,text,text,text[],uuid,timestamptz) to service_role;
grant execute on function public.admin_moderate_social_post(uuid,text,text,text,uuid,timestamptz,text) to service_role;
grant execute on function public.admin_save_poll(uuid,text,text,timestamptz,text[]) to service_role;
