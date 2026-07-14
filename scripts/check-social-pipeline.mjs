import assert from "node:assert/strict";
import test from "node:test";

import {
  createSocialContentHash,
  getSocialAiEditorialFields,
  getSocialInitialBackfillDays,
  getTelegramFloodWaitSeconds,
  isSocialFormulaScopeAllowed,
  isTelegramStorageSizeError,
  getSocialRetryDelayMs,
  mapRedditApiResponse,
  mapTelegramChannelUpdate,
  mapTelegramMtprotoMessages,
  mapXApiResponse,
  parseSocialAiPayload,
} from "../worker/social-pipeline.mjs";

test("content hash normalizes URLs and whitespace", () => {
  const left = createSocialContentHash({ platform: "x", author: "@F1", title: "Новый болид", body: "Подробнее https://x.com/a" });
  const right = createSocialContentHash({ platform: "x", author: "@f1", title: "  Новый   болид ", body: "Подробнее" });
  assert.equal(left, right);
  assert.equal(
    createSocialContentHash({ platform: "telegram", author: "F1", title: "Новый болид", body: "Подробнее" }),
    right,
  );
});

test("social backfill uses metadata before the dedicated column is migrated", () => {
  assert.equal(getSocialInitialBackfillDays({ metadata: { initialBackfillDays: 45 } }), 45);
  assert.equal(getSocialInitialBackfillDays({ initial_backfill_days: 60, metadata: { initialBackfillDays: 45 } }), 60);
  assert.equal(getSocialInitialBackfillDays({ metadata: { initialBackfillDays: 500 } }), 365);
});

test("AI payload accepts only complete Russian summaries", () => {
  const payload = parseSocialAiPayload(JSON.stringify({
    title: "Ferrari обновила переднее антикрыло",
    summary: "Команда привезла новую конфигурацию на ближайший этап и проверит её в первой практике.",
    categories: ["social-upgrades"],
    entities: { teams: ["Ferrari"], drivers: [], races: [] },
    contentType: "official",
    importance: 72,
    relevance: 0.98,
    confidence: 0.94,
    shouldPublish: true,
    originalLanguage: "en",
  }));

  assert.equal(payload.categories[0], "social-upgrades");
  assert.equal(payload.shouldPublish, true);
  assert.throws(() => parseSocialAiPayload({ title: "F1 update", summary: "No Russian text", categories: ["social-upgrades"], contentType: "report", importance: 50, relevance: 1, confidence: 1, shouldPublish: true }));
});

test("Telegram AI only analyzes the post and does not retain rewritten text", () => {
  const payload = parseSocialAiPayload(JSON.stringify({
    categories: ["social-technical"],
    entities: { teams: ["Ferrari"], drivers: [], races: [] },
    contentType: "report",
    importance: 67,
    relevance: 0.96,
    confidence: 0.91,
    shouldPublish: true,
    originalLanguage: "ru",
    formulaScope: "target",
    primarySeries: "Formula 1",
    series: ["Formula 1"],
  }), { requireEditorialText: false, requireFormulaScope: true });

  assert.equal(payload.title, null);
  assert.equal(payload.summary, null);
  assert.equal(payload.categories[0], "social-technical");
  assert.equal(payload.formulaScope, "target");
  assert.equal(payload.primarySeries, "Formula 1");
  assert.deepEqual(payload.series, ["Formula 1"]);
  assert.equal(isSocialFormulaScopeAllowed(payload), true);
  assert.deepEqual(getSocialAiEditorialFields("telegram", payload), {
    ai_title_ru: null,
    ai_summary_ru: null,
  });
});

test("Telegram AI rejects excluded racing series without inventing tags", () => {
  for (const series of ["WEC", "Formula E"]) {
    const payload = parseSocialAiPayload({
      formulaScope: "excluded",
      primarySeries: series,
      series: [series],
      categories: [],
      entities: { teams: [], drivers: [], races: [] },
      contentType: "report",
      importance: 45,
      relevance: 0.1,
      confidence: 0.96,
      shouldPublish: false,
      originalLanguage: "ru",
    }, { requireEditorialText: false, requireFormulaScope: true });

    assert.equal(payload.shouldPublish, false);
    assert.deepEqual(payload.categories, []);
    assert.equal(isSocialFormulaScopeAllowed(payload), false);
  }
});

test("Telegram AI cannot mark an excluded primary series as target", () => {
  for (const primarySeries of ["WEC", "Formula E", "FIA Formula E", "24 Hours of Le Mans", "IndyCar"]) {
    assert.equal(isSocialFormulaScopeAllowed({
      formulaScope: "target",
      primarySeries,
    }), false);
  }
});

test("Telegram AI safely normalizes an incomplete excluded result", () => {
  const payload = parseSocialAiPayload({
    formulaScope: "excluded",
    primarySeries: "WEC",
    series: ["WEC"],
    categories: [],
    entities: { teams: [], drivers: [], races: [] },
    contentType: "report",
    shouldPublish: true,
    originalLanguage: "ru",
  }, { requireEditorialText: false, requireFormulaScope: true });

  assert.equal(payload.shouldPublish, false);
  assert.equal(payload.importance, 0);
  assert.equal(payload.relevance, 0);
  assert.equal(payload.confidence, 0);
});

test("Telegram AI safely rejects a target result with missing scores", () => {
  const payload = parseSocialAiPayload({
    formulaScope: "target",
    primarySeries: "Formula 1",
    series: ["Formula 1"],
    categories: ["social-race-weekend"],
    entities: { teams: [], drivers: [], races: [] },
    contentType: "report",
    shouldPublish: true,
    originalLanguage: "ru",
  }, { requireEditorialText: false, requireFormulaScope: true });

  assert.equal(payload.relevance, 0);
  assert.equal(payload.confidence, 0);
});

test("Telegram AI must return an explicit formula scope", () => {
  assert.throws(() => parseSocialAiPayload({
    categories: [],
    entities: { teams: [], drivers: [], races: [] },
    contentType: "report",
    importance: 20,
    relevance: 0.2,
    confidence: 0.8,
    shouldPublish: false,
    originalLanguage: "ru",
  }, { requireEditorialText: false, requireFormulaScope: true }), /formula scope/);
});

test("X fixture maps metrics and media", () => {
  const [post] = mapXApiResponse({ id: "source", name: "F1", external_key: "F1" }, {
    data: [{ id: "42", text: "Update", created_at: "2026-07-13T10:00:00Z", attachments: { media_keys: ["m1", "m2", "m3", "m4"] }, public_metrics: { like_count: 10, retweet_count: 2, reply_count: 3, quote_count: 1, impression_count: 100 } }],
    includes: {
      media: [
        { media_key: "m1", type: "photo", url: "https://img.example/1.jpg" },
        { media_key: "m2", type: "photo", url: "https://img.example/2.jpg" },
        { media_key: "m3", type: "photo", url: "https://img.example/3.jpg" },
        { media_key: "m4", type: "photo", url: "https://img.example/4.jpg" },
      ],
    },
  });
  assert.equal(post.externalId, "42");
  assert.equal(post.reactionCount, 16);
  assert.equal(post.media.length, 4);
  assert.equal(post.media[0].mediaType, "image");
  assert.deepEqual(post.media.map((item) => item.url), [
    "https://img.example/1.jpg",
    "https://img.example/2.jpg",
    "https://img.example/3.jpg",
    "https://img.example/4.jpg",
  ]);
});

test("Reddit fixture maps listing", () => {
  const [post] = mapRedditApiResponse({ id: "source", name: "r/formula1" }, { data: { children: [{ data: { id: "abc", author: "user", title: "Technical update", selftext: "Details", permalink: "/r/formula1/comments/abc/post/", created_utc: 1_700_000_000, score: 120, num_comments: 8 } }] } });
  assert.equal(post.externalId, "abc");
  assert.equal(post.commentsCount, 8);
});

test("Telegram fixture maps create and edit to one external id", () => {
  const source = { id: "source", name: "Channel", url: "https://t.me/channel" };
  const created = mapTelegramChannelUpdate(source, { channel_post: { message_id: 7, date: 1_700_000_000, text: "Пост", chat: { id: -1001, title: "Channel", username: "channel" } } });
  const edited = mapTelegramChannelUpdate(source, { edited_channel_post: { message_id: 7, date: 1_700_000_000, edit_date: 1_700_000_100, text: "Пост обновлён", chat: { id: -1001, title: "Channel", username: "channel" } } });
  assert.equal(created.externalId, edited.externalId);
  assert.ok(edited.editedAt);
});

test("Telegram fixture groups media album into one post", () => {
  const source = { id: "source", name: "Channel", url: "https://t.me/channel" };
  const first = mapTelegramChannelUpdate(source, {
    channel_post: {
      message_id: 8,
      media_group_id: "album-42",
      date: 1_700_000_000,
      caption: "Галерея",
      chat: { id: -1001, title: "Channel", username: "channel" },
      photo: [{ file_id: "photo-1", file_unique_id: "unique-1", width: 1200, height: 800 }],
    },
  });
  const second = mapTelegramChannelUpdate(source, {
    channel_post: {
      message_id: 9,
      media_group_id: "album-42",
      date: 1_700_000_001,
      chat: { id: -1001, title: "Channel", username: "channel" },
      photo: [{ file_id: "photo-2", file_unique_id: "unique-2", width: 1200, height: 800 }],
    },
  });

  assert.equal(first.externalId, second.externalId);
  assert.equal(first.media.length, 1);
  assert.equal(second.media.length, 1);
  assert.ok(first.media[0].sortOrder < second.media[0].sortOrder);
});

test("Telegram MTProto fixture maps a single post with telemetry", () => {
  const [post] = mapTelegramMtprotoMessages(
    { id: "source", name: "Race channel", external_key: "racechannel" },
    { id: 100500, title: "Race channel", username: "racechannel" },
    [{
      id: 17,
      date: 1_700_000_000,
      message: "Новая конфигурация крыла",
      views: 1200,
      forwards: 7,
      reactions: { results: [{ count: 23 }, { count: 4 }] },
      photo: { id: "501" },
      file: { width: 1600, height: 900, mimeType: "image/jpeg", size: 1024 },
    }],
  );

  assert.equal(post.externalId, "telegram:100500:17");
  assert.equal(post.originalUrl, "https://t.me/racechannel/17");
  assert.equal(post.reactionCount, 27);
  assert.equal(post.viewCount, 1200);
  assert.equal(post.media[0].telegramMessageId, 17);
  assert.equal(post.rawPayload.hasMedia, true);
});

test("Telegram MTProto media mapping does not use broken GramJS dimension getters", () => {
  const file = {
    get width() {
      throw new TypeError("Right-hand side of 'instanceof' is not callable");
    },
    get height() {
      throw new TypeError("Right-hand side of 'instanceof' is not callable");
    },
  };
  const [post] = mapTelegramMtprotoMessages(
    { id: "source", name: "Race channel", external_key: "racechannel" },
    { id: 100500, title: "Race channel", username: "racechannel" },
    [{
      id: 18,
      date: 1_700_000_000,
      message: "Фото из паддока",
      photo: { id: "502", sizes: [{ w: 320, h: 180, size: 12_000 }, { w: 1280, h: 720, size: 180_000 }] },
      file,
    }],
  );

  assert.equal(post.media[0].width, 1280);
  assert.equal(post.media[0].height, 720);
  assert.equal(post.media[0].size, 180_000);
});

test("Telegram MTProto fixture groups an album and preserves media order", () => {
  const [post] = mapTelegramMtprotoMessages(
    { id: "source", name: "Private channel", external_key: "-100100500" },
    { id: 100500, title: "Private channel" },
    [
      { id: 22, groupedId: "991", date: 1_700_000_001, message: "", video: { id: "v22" }, file: { mimeType: "video/mp4" } },
      { id: 21, groupedId: "991", date: 1_700_000_000, message: "Галерея с трассы", photo: { id: "p21" }, file: { mimeType: "image/jpeg" } },
    ],
  );

  assert.equal(post.externalId, "telegram:100500:album:991");
  assert.equal(post.body, "Галерея с трассы");
  assert.deepEqual(post.messageIds, [21, 22]);
  assert.deepEqual(post.media.map((item) => item.mediaType), ["image", "video"]);
});

test("Telegram MTProto fixture keeps an edit on the same external ID", () => {
  const source = { id: "source", name: "Channel", external_key: "channel" };
  const channel = { id: 100500, title: "Channel", username: "channel" };
  const [created] = mapTelegramMtprotoMessages(source, channel, [{ id: 33, date: 1_700_000_000, message: "Первый текст" }]);
  const [edited] = mapTelegramMtprotoMessages(source, channel, [{ id: 33, date: 1_700_000_000, editDate: 1_700_000_100, message: "Обновлённый текст" }]);

  assert.equal(created.externalId, edited.externalId);
  assert.equal(edited.body, "Обновлённый текст");
  assert.equal(edited.editedAt, "2023-11-14T22:15:00.000Z");
});

test("Telegram FLOOD_WAIT fixture extracts a safe retry delay", () => {
  assert.equal(getTelegramFloodWaitSeconds({ seconds: 42 }), 42);
  assert.equal(getTelegramFloodWaitSeconds({ errorMessage: "FLOOD_WAIT_75" }), 75);
  assert.equal(getTelegramFloodWaitSeconds(new Error("network unavailable")), null);
});

test("Telegram storage size errors are recognized without hiding unrelated failures", () => {
  assert.equal(isTelegramStorageSizeError(new Error("The object exceeded the maximum allowed size")), true);
  assert.equal(isTelegramStorageSizeError(new Error("Storage request timed out")), false);
});

test("retry uses bounded exponential backoff", () => {
  assert.equal(getSocialRetryDelayMs(1), 300_000);
  assert.equal(getSocialRetryDelayMs(20), 86_400_000);
});
