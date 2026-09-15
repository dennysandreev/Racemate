import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDriverAvatarSlug } from "./driver-avatar-slug.ts";

test("normalizes OpenF1's shortened Antonelli name to the local avatar slug", () => {
  assert.equal(
    normalizeDriverAvatarSlug("Kimi ANTONELLI"),
    "andrea-kimi-antonelli",
  );
});

test("keeps regular driver names aligned with local avatar filenames", () => {
  assert.equal(normalizeDriverAvatarSlug("Lando NORRIS"), "lando-norris");
});
