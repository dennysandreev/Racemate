import "server-only";

import { readPublicShareImageDataUrl } from "@/lib/share-image-assets";

export async function getDriverShareAvatarDataUrl(
  value: string | null | undefined,
  slug: string,
) {
  if (value) {
    const localSource = getLocalImagePath(value);
    const embeddedSource = localSource
      ? await readPublicShareImageDataUrl(localSource)
      : null;

    if (embeddedSource) {
      return embeddedSource;
    }

    if (/^https:\/\/.*\.(?:jpe?g|png)(?:\?.*)?$/i.test(value)) {
      return value;
    }
  }

  const localAvatar = await readPublicShareImageDataUrl(
    `/drivers/avatars/${slug}.png`,
  );

  if (localAvatar) {
    return localAvatar;
  }

  return readPublicShareImageDataUrl(
    "/drivers/avatars/archive-helmet-neutral-v2.png",
  );
}

function getLocalImagePath(value: string) {
  if (value.startsWith("/")) {
    return value;
  }

  try {
    return new URL(value).pathname;
  } catch {
    return null;
  }
}
