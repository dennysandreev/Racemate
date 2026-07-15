create table if not exists public.share_links (
  code text primary key,
  news_article_id uuid references public.news_articles(id) on delete cascade,
  prediction_id uuid references public.predictions(id) on delete cascade,
  prediction_scope text,
  created_at timestamptz not null default now(),
  constraint share_links_code_format_check
    check (code ~ '^[1-9A-HJ-NP-Za-km-z]{7}$'),
  constraint share_links_target_check
    check (
      (
        news_article_id is not null
        and prediction_id is null
        and prediction_scope is null
      )
      or
      (
        news_article_id is null
        and prediction_id is not null
        and prediction_scope in ('qualification', 'race')
      )
    )
);

create unique index if not exists share_links_news_article_unique
  on public.share_links (news_article_id)
  where news_article_id is not null;

create unique index if not exists share_links_prediction_scope_unique
  on public.share_links (prediction_id, prediction_scope)
  where prediction_id is not null;

alter table public.share_links enable row level security;

revoke all on table public.share_links from anon, authenticated;
grant all on table public.share_links to service_role;

comment on table public.share_links is
  'Server-resolved internal short links for public RaceMate content.';
