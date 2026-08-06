alter table public.share_links
  add column if not exists share_image_version integer;

update public.share_links as share_link
set share_image_version = coalesce(prediction.share_image_version, 1)
from public.predictions as prediction
where share_link.prediction_id = prediction.id
  and share_link.share_image_version is null;

alter table public.share_links
  drop constraint if exists share_links_target_check;

alter table public.share_links
  add constraint share_links_target_check
  check (
    (
      news_article_id is not null
      and prediction_id is null
      and prediction_scope is null
      and share_image_version is null
    )
    or
    (
      news_article_id is null
      and prediction_id is not null
      and prediction_scope in ('qualification', 'race')
      and share_image_version >= 1
    )
  );

drop index if exists public.share_links_prediction_scope_unique;

create unique index share_links_prediction_scope_version_unique
  on public.share_links (prediction_id, prediction_scope, share_image_version)
  where prediction_id is not null;

comment on column public.share_links.share_image_version is
  'Prediction image version captured by this short link to refresh social previews after edits.';
