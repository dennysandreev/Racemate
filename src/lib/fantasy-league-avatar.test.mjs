import assert from "node:assert/strict";
import test from "node:test";

import {
  getFantasyLeagueAvatarStoragePath,
  readFantasyLeagueAvatarWebpDimensions,
} from "./fantasy-league-avatar-image.ts";

test("uses one fixed avatar path per league", () => {
  assert.equal(
    getFantasyLeagueAvatarStoragePath("af710d70-805a-44ae-a6fd-7c04f0871d8f"),
    "af710d70-805a-44ae-a6fd-7c04f0871d8f/avatar.webp",
  );
});

test("reads a square VP8X avatar and rejects arbitrary data", () => {
  const bytes = new Uint8Array(30);
  bytes.set(Buffer.from("RIFF"), 0);
  bytes.set(Buffer.from("WEBP"), 8);
  bytes.set(Buffer.from("VP8X"), 12);
  bytes[16] = 10;
  bytes[24] = 0xff;
  bytes[25] = 0x01;
  bytes[27] = 0xff;
  bytes[28] = 0x01;

  assert.deepEqual(readFantasyLeagueAvatarWebpDimensions(bytes), { height: 512, width: 512 });
  assert.equal(readFantasyLeagueAvatarWebpDimensions(new Uint8Array(30)), null);
});
