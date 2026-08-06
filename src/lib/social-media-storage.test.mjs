import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getSocialMediaDeliveryUrl,
  getSocialMediaStoragePath,
} from "./social-media-storage.ts";

const supabaseUrl = "https://project.supabase.co";
const mediaId = "b7b50a62-6f3a-4db5-b4ff-a1124aaf0ea3";
const storedUrl = `${supabaseUrl}/storage/v1/object/public/social-media/telegram/source/post/image.jpg`;
const deliveryRouteSource = readFileSync(
  new URL("../app/api/social-media/[mediaId]/route.ts", import.meta.url),
  "utf8",
);

test("internal social media is delivered through the guarded application route", () => {
  assert.equal(
    getSocialMediaDeliveryUrl({ mediaId, storedUrl, supabaseUrl }),
    `/api/social-media/${mediaId}`,
  );
});

test("external media URLs remain unchanged", () => {
  const externalUrl = "https://pbs.twimg.com/media/example.jpg";

  assert.equal(
    getSocialMediaDeliveryUrl({ mediaId, storedUrl: externalUrl, supabaseUrl }),
    externalUrl,
  );
});

test("storage paths are accepted only from this Supabase project", () => {
  assert.equal(
    getSocialMediaStoragePath(storedUrl, supabaseUrl),
    "telegram/source/post/image.jpg",
  );
  assert.equal(
    getSocialMediaStoragePath(
      "https://attacker.example/storage/v1/object/public/social-media/private/file.jpg",
      supabaseUrl,
    ),
    null,
  );
});

test("media delivery verifies the visible parent post before signing a private object", () => {
  const visibilityCheckIndex = deliveryRouteSource.indexOf('.from("social_posts")');
  const signedUrlIndex = deliveryRouteSource.indexOf(".createSignedUrl(");

  assert.ok(visibilityCheckIndex >= 0, "the route must check social_posts through the viewer session");
  assert.ok(signedUrlIndex >= 0, "the route must create a short-lived signed URL");
  assert.ok(
    visibilityCheckIndex < signedUrlIndex,
    "the viewer's social_posts RLS check must run before the private object is signed",
  );
});
