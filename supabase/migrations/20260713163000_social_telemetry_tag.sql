-- Keep telemetry posts in their own product category.

insert into public.tags (type, slug, name)
values ('social_topic', 'social-telemetry', 'Телеметрия')
on conflict (slug) do update set
  type = excluded.type,
  name = excluded.name;

delete from public.social_post_tags as post_tag
using public.social_posts as post, public.social_sources as source, public.tags as tag
where post_tag.post_id = post.id
  and post_tag.tag_id = tag.id
  and post.source_id = source.id
  and tag.type = 'social_topic'
  and lower(trim(leading '@' from coalesce(source.external_key, source.name))) = 'f1telemetrydata';

insert into public.social_post_tags (post_id, tag_id, confidence, method, is_primary)
select post.id, tag.id, 1, 'source_rule', true
from public.social_posts as post
join public.social_sources as source on source.id = post.source_id
cross join public.tags as tag
where tag.slug = 'social-telemetry'
  and lower(trim(leading '@' from coalesce(source.external_key, source.name))) = 'f1telemetrydata'
on conflict (post_id, tag_id) do update set
  confidence = excluded.confidence,
  method = excluded.method,
  is_primary = excluded.is_primary;
