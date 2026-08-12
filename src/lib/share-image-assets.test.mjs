import assert from "node:assert/strict";
import test from "node:test";

import { readPublicShareImageDataUrl } from "./share-image-assets.ts";

test("embeds a public PNG without an HTTP request", async () => {
  const result = await readPublicShareImageDataUrl(
    "/drivers/avatars/george-russell.png",
  );

  assert.match(result ?? "", /^data:image\/png;base64,/);
});

test("rejects paths outside supported public image assets", async () => {
  const result = await readPublicShareImageDataUrl("/../package.json");

  assert.equal(result, null);
});
