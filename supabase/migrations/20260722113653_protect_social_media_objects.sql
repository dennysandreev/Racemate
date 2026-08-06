-- Social posts pass through moderation before publication. Keeping their media
-- in a public bucket made pending and rejected files reachable outside the
-- social_posts RLS boundary.
update storage.buckets
set public = false
where id = 'social-media';

drop policy if exists "Public can read social media" on storage.objects;

-- Trusted worker and server clients use the service role and bypass Storage
-- RLS. Authenticated admins keep the existing management policy. Published
-- media is served through /api/social-media/[mediaId] after social_posts RLS
-- has verified that the current viewer may see the parent post.
