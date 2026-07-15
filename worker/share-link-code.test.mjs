import assert from "node:assert/strict";
import test from "node:test";

import {
  createShareLinkCode,
  isShareLinkCode,
  SHARE_LINK_ALPHABET,
} from "../src/lib/share-link-code.ts";

test("short share codes contain seven Base58 characters", () => {
  for (let index = 0; index < 250; index += 1) {
    const code = createShareLinkCode();

    assert.equal(code.length, 7);
    assert.equal(isShareLinkCode(code), true);
    assert.equal([...code].every((character) => SHARE_LINK_ALPHABET.includes(character)), true);
  }
});

test("short share code validation rejects ambiguous and malformed values", () => {
  assert.equal(isShareLinkCode("X7k29mA"), true);
  assert.equal(isShareLinkCode("X7k29m"), false);
  assert.equal(isShareLinkCode("X7k29m0"), false);
  assert.equal(isShareLinkCode("X7k29mO"), false);
  assert.equal(isShareLinkCode("../../etc"), false);
});

test("generator rejects biased bytes before mapping them to Base58", () => {
  const batches = [
    Uint8Array.from([255, 254, 253, 252, 251, 250, 249, 248]),
    Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
  ];
  const code = createShareLinkCode(() => batches.shift() ?? Uint8Array.from([8, 9, 10, 11, 12, 13, 14, 15]));

  assert.equal(code, "1234567");
});
