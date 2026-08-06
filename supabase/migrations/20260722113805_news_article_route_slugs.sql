alter table public.news_articles
  add column if not exists slug text;

create or replace function public.news_title_to_slug(value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  normalized text;
begin
  normalized := lower(coalesce(value, ''));
  normalized := replace(normalized, 'ё', 'e');
  normalized := replace(normalized, 'ж', 'zh');
  normalized := replace(normalized, 'й', 'y');
  normalized := replace(normalized, 'х', 'kh');
  normalized := replace(normalized, 'ц', 'ts');
  normalized := replace(normalized, 'ч', 'ch');
  normalized := replace(normalized, 'ш', 'sh');
  normalized := replace(normalized, 'щ', 'shch');
  normalized := replace(normalized, 'ю', 'yu');
  normalized := replace(normalized, 'я', 'ya');
  normalized := replace(normalized, 'ъ', '');
  normalized := replace(normalized, 'ь', '');
  normalized := translate(normalized, 'абвгдезиклмнопрстуфыэ', 'abvgdeziklmnoprstufye');
  normalized := regexp_replace(normalized, '[^a-z0-9]+', '-', 'g');
  normalized := trim(both '-' from normalized);
  normalized := trim(both '-' from left(normalized, 72));

  return coalesce(nullif(normalized, ''), 'novost');
end;
$$;

with prepared as (
  select
    id,
    public.news_title_to_slug(coalesce(ai_title_ru, original_title)) as base_slug,
    row_number() over (
      partition by public.news_title_to_slug(coalesce(ai_title_ru, original_title))
      order by published_at nulls last, created_at, id
    ) as slug_rank
  from public.news_articles
), resolved as (
  select
    id,
    case
      when slug_rank = 1 then base_slug
      else trim(both '-' from left(base_slug, 72)) || '-' || left(replace(id::text, '-', ''), 12)
    end as route_slug
  from prepared
)
update public.news_articles as article
set slug = resolved.route_slug
from resolved
where resolved.id = article.id
  and nullif(btrim(article.slug), '') is null;

alter table public.news_articles
  alter column slug set not null,
  drop constraint if exists news_articles_slug_format_check,
  add constraint news_articles_slug_format_check
    check (
      slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(slug) between 1 and 85
    );

create unique index if not exists news_articles_slug_key
  on public.news_articles (slug);

create or replace function public.assign_news_article_slug()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  base_slug text;
  candidate_slug text;
  should_assign boolean := false;
begin
  if tg_op = 'INSERT' then
    should_assign := true;
  else
    if old.publication_status = 'published' then
      new.slug := old.slug;
      return new;
    end if;

    should_assign := nullif(btrim(new.slug), '') is null
      or coalesce(new.ai_title_ru, new.original_title)
        is distinct from coalesce(old.ai_title_ru, old.original_title);
  end if;

  if should_assign then
    base_slug := public.news_title_to_slug(coalesce(new.ai_title_ru, new.original_title));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(base_slug, 0));
    candidate_slug := base_slug;

    if exists (
      select 1
      from public.news_articles as existing
      where existing.slug = candidate_slug
        and existing.id <> new.id
    ) then
      candidate_slug := trim(both '-' from left(base_slug, 72))
        || '-'
        || left(replace(new.id::text, '-', ''), 12);
    end if;

    new.slug := candidate_slug;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_news_article_slug on public.news_articles;
create trigger assign_news_article_slug
before insert or update of ai_title_ru, original_title, slug
on public.news_articles
for each row
execute function public.assign_news_article_slug();

comment on column public.news_articles.slug is
  'Stable public route slug generated from the editorial title before publication.';
