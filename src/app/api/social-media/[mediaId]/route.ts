import { NextResponse } from "next/server";

import { getSupabaseEnv } from "@/lib/env";
import {
  getSocialMediaStoragePath,
  SOCIAL_MEDIA_BUCKET,
} from "@/lib/social-media-storage";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

const signedUrlLifetimeSeconds = 60;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params;

  if (!uuidPattern.test(mediaId)) {
    return new NextResponse(null, { status: 404 });
  }

  const env = getSupabaseEnv();
  const visibleClient = await createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();

  if (!env || !visibleClient || !adminClient) {
    return new NextResponse(null, { status: 404 });
  }

  const { data: media, error: mediaError } = await adminClient
    .from("social_post_media")
    .select("post_id, url")
    .eq("id", mediaId)
    .maybeSingle();
  const storagePath = media
    ? getSocialMediaStoragePath(media.url, env.url)
    : null;

  if (mediaError || !media || !storagePath) {
    return new NextResponse(null, { status: 404 });
  }

  // This user-scoped parent lookup is the authorization boundary. social_posts
  // RLS exposes published posts and grants admins access during moderation.
  const { data: visiblePost, error: visibilityError } = await visibleClient
    .from("social_posts")
    .select("id")
    .eq("id", media.post_id)
    .maybeSingle();

  if (visibilityError || !visiblePost) {
    return new NextResponse(null, { status: 404 });
  }

  const { data, error } = await adminClient.storage
    .from(SOCIAL_MEDIA_BUCKET)
    .createSignedUrl(storagePath, signedUrlLifetimeSeconds);

  if (error || !data?.signedUrl) {
    return new NextResponse(null, { status: 404 });
  }

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
