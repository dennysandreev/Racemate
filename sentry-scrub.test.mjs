import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSentrySampleRate,
  resolveSentryRelease,
  scrubSentryEvent,
} from "./sentry-scrub.mjs";

test("scrubSentryEvent removes user data, credentials, ids, and URL queries", () => {
  const event = scrubSentryEvent({
    breadcrumbs: [
      {
        data: {
          provider_id: "provider-123",
          safe: "kept",
        },
        message: "Request for fan@example.com used Bearer private-token",
      },
    ],
    extra: {
      chat_id: 123456,
      nested: { api_key: "private-key" },
    },
    request: {
      cookies: { session: "private-session" },
      headers: {
        authorization: "Bearer private-token",
        "content-type": "application/json",
      },
      query_string: "token=private-token",
      url: "https://raceside.example/news?preview_token=private#comments",
    },
    user: {
      email: "fan@example.com",
      id: "user-123",
      ip_address: "127.0.0.1",
    },
  });

  assert.equal(event.user, undefined);
  assert.equal(event.request.url, "https://raceside.example/news");
  assert.equal(event.request.cookies, undefined);
  assert.equal(event.request.query_string, undefined);
  assert.equal(event.request.headers.authorization, "[Filtered]");
  assert.equal(event.request.headers["content-type"], "application/json");
  assert.equal(event.extra.chat_id, "[Filtered]");
  assert.equal(event.extra.nested.api_key, "[Filtered]");
  assert.equal(event.breadcrumbs[0].data.provider_id, "[Filtered]");
  assert.equal(event.breadcrumbs[0].data.safe, "kept");
  assert.equal(
    event.breadcrumbs[0].message,
    "Request for [Filtered] used Bearer [Filtered]",
  );
});

test("Sentry helpers validate sampling and use the shared release SHA", () => {
  assert.equal(parseSentrySampleRate("0.25", 0), 0.25);
  assert.equal(parseSentrySampleRate("2", 0.1), 0.1);
  assert.equal(parseSentrySampleRate("invalid", 0.1), 0.1);
  assert.equal(
    resolveSentryRelease({ RACESIDE_RELEASE_SHA: "release-123" }),
    "release-123",
  );
});
