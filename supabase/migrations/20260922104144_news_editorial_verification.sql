-- Internal source snapshots and verification never enter the public article payload.
alter table public.news_articles
  add column if not exists editorial_meta jsonb not null default '{}'::jsonb,
  add column if not exists content_modified_at timestamptz;
-- Existing articles remain compatible; every newly ingested article requires review.
alter table public.news_articles alter column editorial_meta
  set default '{"version":1,"status":"pending"}'::jsonb;

create table public.news_editorial_reviews (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  decision text not null check (decision in ('PASS', 'REJECT', 'MANUAL_REVIEW')),
  source_hash text not null,
  source_snapshot jsonb not null,
  context_snapshot jsonb not null,
  extraction jsonb,
  attempts jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  models jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index news_editorial_reviews_article_time_idx on public.news_editorial_reviews(article_id, created_at desc);
alter table public.news_editorial_reviews enable row level security;
revoke all on public.news_editorial_reviews from public, anon, authenticated;
grant select, insert on public.news_editorial_reviews to service_role;

create table public.news_article_sources (
  article_id uuid not null references public.news_articles(id) on delete cascade,
  source_article_id uuid not null references public.news_articles(id) on delete cascade,
  source_url text not null check (source_url ~ '^https?://'),
  source_name text not null,
  source_authors jsonb not null default '[]'::jsonb,
  source_published_at timestamptz,
  added_at timestamptz not null default now(),
  primary key (article_id, source_article_id)
);
create index news_article_sources_source_idx on public.news_article_sources(source_article_id);
alter table public.news_article_sources enable row level security;
revoke all on public.news_article_sources from public, anon, authenticated;
grant select on public.news_article_sources to anon, authenticated;
grant select, insert, update, delete on public.news_article_sources to service_role;
create policy "Read sources of published news" on public.news_article_sources
for select to anon, authenticated using (exists (
  select 1 from public.news_articles a where a.id = article_id
    and a.status = 'processed' and a.publication_status = 'published' and a.duplicate_of is null
));

-- Enforce the gate even when dedup retries or old worker jobs attempt publication.
-- Explicit manual publication continues through the existing audited admin RPC.
create function public.guard_news_editorial_publication()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and
     (new.ai_title_ru, new.ai_summary_ru, new.ai_summary_long_ru) is distinct from
     (old.ai_title_ru, old.ai_summary_ru, old.ai_summary_long_ru) then
    new.content_modified_at := now();
  end if;
  if new.publication_status = 'published' and new.editorial_meta ->> 'version' = '1'
     and not new.published_manually then
    if new.editorial_meta ->> 'status' is distinct from 'passed' or not exists (
      select 1 from public.news_editorial_reviews r
      where r.article_id = new.id and r.decision = 'PASS'
        and r.attempts -> -1 -> 'draft' ->> 'title_ru' = new.ai_title_ru
        and r.attempts -> -1 -> 'draft' ->> 'summary_ru' = new.ai_summary_ru
        and r.attempts -> -1 -> 'draft' ->> 'details_ru' = new.ai_summary_long_ru
    ) then
      raise exception 'news_editorial_verification_required';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_news_editorial_publication() from public, anon, authenticated;
grant execute on function public.guard_news_editorial_publication() to service_role;
create trigger news_editorial_publication_guard before insert or update
on public.news_articles for each row execute function public.guard_news_editorial_publication();

-- The visible article and the incoming source change in one transaction.
-- A reader/manual edit or another update invalidates the optimistic precondition.
create function public.apply_verified_news_update(
  p_article_id uuid, p_target_id uuid, p_review_id uuid,
  p_expected_updated_at timestamptz, p_editorial_meta jsonb, p_model text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_target public.news_articles;
  v_incoming public.news_articles;
  v_review public.news_editorial_reviews;
  v_draft jsonb;
  v_source jsonb;
begin
  if p_article_id = p_target_id then return false; end if;
  -- Stable lock order prevents deadlocks for overlapping update attempts.
  perform id from public.news_articles where id in (p_article_id,p_target_id) order by id for update;
  select * into v_target from public.news_articles where id=p_target_id;
  select * into v_incoming from public.news_articles where id=p_article_id;
  if v_target.id is null or v_incoming.id is null
    or v_target.publication_status <> 'published' or v_target.published_manually
    or v_incoming.publication_status <> 'processing' or v_incoming.status <> 'pending'
    or v_target.updated_at is distinct from p_expected_updated_at then return false; end if;
  select * into v_review from public.news_editorial_reviews
    where id=p_review_id and article_id=p_target_id and decision='PASS';
  if not found or p_editorial_meta ->> 'status' is distinct from 'passed'
    or p_editorial_meta ->> 'version' is distinct from '1' then return false; end if;
  v_draft := v_review.attempts -> -1 -> 'draft';
  if coalesce(v_draft ->> 'title_ru','') = '' or coalesce(v_draft ->> 'summary_ru','') = ''
    or coalesce(v_draft ->> 'details_ru','') = '' then return false; end if;
  update public.news_articles set
    ai_title_ru=v_draft ->> 'title_ru', ai_summary_ru=v_draft ->> 'summary_ru',
    ai_summary_long_ru=v_draft ->> 'details_ru', ai_highlights_ru='{}'::text[],
    editorial_meta=p_editorial_meta, ai_model=p_model, ai_processed_at=now(), updated_at=now()
    where id=p_target_id;
  for v_source in select value from jsonb_array_elements(v_review.source_snapshot -> 'sources') loop
    insert into public.news_article_sources(article_id,source_article_id,source_url,source_name,source_authors,source_published_at)
    values(p_target_id,(v_source ->> 'article_id')::uuid,v_source ->> 'url',v_source ->> 'name',
      coalesce(v_source -> 'authors','[]'::jsonb),(v_source ->> 'published_at')::timestamptz)
    on conflict(article_id,source_article_id) do nothing;
  end loop;
  update public.news_articles set status='processed', publication_status='duplicate',
    duplicate_of=p_target_id, duplicate_relation='update', duplicate_confidence=0.95,
    duplicate_reason='Дополнительные факты включены в существующую статью.',
    dedup_status='duplicate', dedup_checked_at=now(), published_at=null
    where id=p_article_id;
  return true;
end;
$$;
revoke all on function public.apply_verified_news_update(uuid,uuid,uuid,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_verified_news_update(uuid,uuid,uuid,timestamptz,jsonb,text) to service_role;

-- Keep the existing text/tag editor and new attribution fields in one transaction.
create function public.admin_save_news_article_editorial(
  p_article_id uuid, p_title text, p_summary text, p_body text,
  p_publication_status text, p_tag_names text[], p_actor_user_id uuid,
  p_now timestamptz, p_article_type text, p_source_authors text[]
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_article_type is null or p_article_type not in
    ('news','breaking_news','report','interview','opinion','column','analysis','rumour','legal','historical','technical_analysis') then
    raise exception 'invalid_news_article_type';
  end if;
  if p_publication_status = 'published' and
    (coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_summary),'') = '' or coalesce(btrim(p_body),'') = '') then
    raise exception 'incomplete_news_article';
  end if;
  perform public.admin_save_news_article(p_article_id,p_title,p_summary,p_body,
    p_publication_status,p_tag_names,p_actor_user_id,p_now);
  update public.news_articles set
    editorial_meta = editorial_meta || jsonb_build_object(
      'article_type', p_article_type, 'source_authors', to_jsonb(coalesce(p_source_authors,'{}'::text[])),
      'status', case p_publication_status when 'published' then 'manually_reviewed' when 'draft' then 'review' else 'rejected' end,
      'context', '[]'::jsonb),
    raw_payload = case when p_publication_status='draft'
      then (coalesce(raw_payload,'{}'::jsonb) - 'aiLastAttemptAt') || '{"aiFailureReason":"editorial_review_required"}'::jsonb
      else coalesce(raw_payload,'{}'::jsonb) - 'aiFailureReason' - 'aiLastAttemptAt' end,
    duplicate_of = case when p_publication_status='published' then null else duplicate_of end,
    dedup_status = case when p_publication_status='published' then 'unique' else dedup_status end
  where id=p_article_id;
end;
$$;
revoke all on function public.admin_save_news_article_editorial(uuid,text,text,text,text,text[],uuid,timestamptz,text,text[]) from public,anon,authenticated;
grant execute on function public.admin_save_news_article_editorial(uuid,text,text,text,text,text[],uuid,timestamptz,text,text[]) to service_role;
