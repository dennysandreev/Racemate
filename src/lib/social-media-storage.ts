const socialMediaPublicPath = "/storage/v1/object/public/social-media/";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SOCIAL_MEDIA_BUCKET = "social-media";

export function getSocialMediaDeliveryUrl({
  mediaId,
  storedUrl,
  supabaseUrl,
}: {
  mediaId: string;
  storedUrl: string;
  supabaseUrl: string | null | undefined;
}) {
  if (!uuidPattern.test(mediaId) || !getSocialMediaStoragePath(storedUrl, supabaseUrl)) {
    return storedUrl;
  }

  return `/api/social-media/${mediaId}`;
}

export function getSocialMediaStoragePath(
  storedUrl: string,
  supabaseUrl: string | null | undefined,
) {
  if (!storedUrl || !supabaseUrl) {
    return null;
  }

  try {
    const stored = new URL(storedUrl);
    const project = new URL(supabaseUrl);

    if (stored.origin !== project.origin || !stored.pathname.startsWith(socialMediaPublicPath)) {
      return null;
    }

    const path = decodeURIComponent(stored.pathname.slice(socialMediaPublicPath.length));
    const segments = path.split("/");

    if (!path || segments.some((segment) => !segment || segment === "." || segment === "..")) {
      return null;
    }

    return path;
  } catch {
    return null;
  }
}
