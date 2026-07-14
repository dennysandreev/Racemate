import { createHash } from "node:crypto";

export const SOCIAL_TOPIC_DEFINITIONS = [
  { slug: "social-upgrades", name: "Обновления болида" },
  { slug: "social-transfers", name: "Трансферы и контракты" },
  { slug: "social-technical", name: "Техника и регламент" },
  { slug: "social-telemetry", name: "Телеметрия" },
  { slug: "social-race-weekend", name: "Этап и результаты" },
  { slug: "social-statements", name: "Комментарии команд и пилотов" },
  { slug: "social-incidents", name: "Инциденты и штрафы" },
  { slug: "social-rumors", name: "Слухи" },
  { slug: "social-discussion", name: "Обсуждения" },
];

export const SOCIAL_TOPIC_SLUGS = new Set(
  SOCIAL_TOPIC_DEFINITIONS.map((topic) => topic.slug),
);

export const SOCIAL_CONTENT_KINDS = new Set([
  "official",
  "report",
  "opinion",
  "rumor",
  "discussion",
]);

export const SOCIAL_FORMULA_SCOPES = new Set([
  "target",
  "excluded",
  "unclear",
]);

export function normalizeSocialText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function createSocialContentHash({ title, body }) {
  const normalized = [...new Set([title, body].map(normalizeSocialText).filter(Boolean))]
    .join("|");

  return normalized
    ? createHash("sha256").update(normalized).digest("hex")
    : null;
}

export function getSocialRetryDelayMs(attempt) {
  const safeAttempt = Math.max(1, Math.min(Number(attempt) || 1, 20));
  return Math.min(24 * 60 * 60 * 1_000, 5 * 60 * 1_000 * 2 ** (safeAttempt - 1));
}

export function getSocialInitialBackfillDays(source) {
  const value = Number(source?.initial_backfill_days ?? source?.metadata?.initialBackfillDays ?? 30);
  return Math.max(1, Math.min(365, Number.isFinite(value) ? value : 30));
}

export function parseSocialAiPayload(raw, {
  requireEditorialText = true,
  requireFormulaScope = false,
} = {}) {
  const parsed = typeof raw === "string" ? parseJsonObject(raw) : raw;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response must be a JSON object");
  }

  const title = requireEditorialText ? cleanString(parsed.title, 120) : null;
  const summary = requireEditorialText ? cleanString(parsed.summary, 700) : null;
  const categories = uniqueStrings(parsed.categories)
    .filter((category) => SOCIAL_TOPIC_SLUGS.has(category))
    .slice(0, 3);
  const contentKind = cleanString(parsed.contentType, 24);
  const entities = normalizeEntities(parsed.entities);
  const formulaScope = cleanString(parsed.formulaScope, 24);
  const primarySeries = cleanString(parsed.primarySeries, 80);
  const series = uniqueStrings(parsed.series).slice(0, 8);
  const isOutsideFormulaScope = requireFormulaScope && formulaScope !== "target";
  const importance = integerInRange(parsed.importance, 0, 100) ?? (requireFormulaScope ? 0 : null);
  const relevance = numberInRange(parsed.relevance, 0, 1) ?? (requireFormulaScope ? 0 : null);
  const confidence = numberInRange(parsed.confidence, 0, 1) ?? (requireFormulaScope ? 0 : null);
  const shouldPublish = isOutsideFormulaScope ? false : parsed.shouldPublish === true;
  const originalLanguage = cleanString(parsed.originalLanguage, 12) || "und";

  if (requireEditorialText && (!title || !summary || !hasCyrillic(title) || !hasCyrillic(summary))) {
    throw new Error("AI title and summary must be valid Russian text");
  }

  if ((shouldPublish && !categories.length) || !contentKind || !SOCIAL_CONTENT_KINDS.has(contentKind)) {
    throw new Error("AI categories or content type are invalid");
  }

  if (requireFormulaScope && !SOCIAL_FORMULA_SCOPES.has(formulaScope)) {
    throw new Error("AI formula scope is invalid");
  }

  if (importance === null || relevance === null || confidence === null) {
    throw new Error("AI scores are invalid");
  }

  return {
    title,
    summary,
    categories,
    contentKind,
    entities,
    importance,
    relevance,
    confidence,
    shouldPublish,
    originalLanguage,
    formulaScope: SOCIAL_FORMULA_SCOPES.has(formulaScope) ? formulaScope : null,
    primarySeries,
    series,
  };
}

export function isSocialFormulaScopeAllowed(result) {
  if (result?.formulaScope !== "target" || !result.primarySeries) {
    return false;
  }

  const primarySeries = result.primarySeries
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim();

  return !/^(?:fia )?formula e$|^extreme e$|\bwec\b|world endurance|le mans|\bimsa\b|\bindycar\b|\bnascar\b|\bmoto ?gp\b|\bwrc\b|\brally\b|ралли|^gt\d*$|grand touring/.test(primarySeries);
}

export function getSocialAiEditorialFields(platform, result) {
  if (platform === "telegram") {
    return {
      ai_title_ru: null,
      ai_summary_ru: null,
    };
  }

  return {
    ai_title_ru: result.title,
    ai_summary_ru: result.summary,
  };
}

export function mapXApiResponse(source, payload) {
  const mediaByKey = new Map(
    (payload?.includes?.media ?? []).map((media) => [media.media_key, media]),
  );

  return (payload?.data ?? []).map((tweet) => {
    const media = (tweet.attachments?.media_keys ?? [])
      .map((key) => mediaByKey.get(key))
      .filter(Boolean)
      .map((item, index) => ({
        mediaType: item.type === "photo" ? "image" : item.type === "animated_gif" ? "gif" : "video",
        url: item.url || item.preview_image_url,
        previewUrl: item.preview_image_url || item.url,
        width: item.width ?? null,
        height: item.height ?? null,
        sortOrder: index,
        providerMediaId: item.media_key,
      }))
      .filter((item) => item.url);
    const metrics = tweet.public_metrics ?? {};
    const handle = source.external_key || source.url?.match(/(?:x\.com|twitter\.com)\/([^/?#]+)/i)?.[1];

    return {
      platform: "x",
      sourceId: source.id,
      externalId: String(tweet.id),
      author: handle ? `@${String(handle).replace(/^@/, "")}` : source.name,
      title: tweet.text,
      body: tweet.text,
      originalUrl: `https://x.com/${handle || "i"}/status/${tweet.id}`,
      publishedAt: tweet.created_at || new Date().toISOString(),
      reactionCount: sumMetrics(metrics, ["like_count", "retweet_count", "reply_count", "quote_count"]),
      commentsCount: numberOrNull(metrics.reply_count),
      repostCount: numberOrNull(metrics.retweet_count),
      viewCount: numberOrNull(metrics.impression_count),
      sourceMetrics: metrics,
      rawPayload: tweet,
      media,
      isRepost: /^RT\s+@/i.test(tweet.text || ""),
      isReply: Array.isArray(tweet.referenced_tweets) && tweet.referenced_tweets.some((item) => item.type === "replied_to"),
    };
  });
}

export function mapRedditApiResponse(source, payload) {
  return (payload?.data?.children ?? []).map((entry) => {
    const post = entry?.data ?? {};
    const permalink = post.permalink ? `https://www.reddit.com${post.permalink}` : post.url;
    const mediaUrl = getRedditMediaUrl(post);

    return {
      platform: "reddit",
      sourceId: source.id,
      externalId: String(post.id || post.name),
      author: post.author ? `u/${post.author}` : source.name,
      title: post.title,
      body: post.selftext || post.title,
      originalUrl: permalink,
      publishedAt: post.created_utc ? new Date(post.created_utc * 1_000).toISOString() : new Date().toISOString(),
      reactionCount: numberOrNull(post.score),
      commentsCount: numberOrNull(post.num_comments),
      repostCount: null,
      viewCount: null,
      sourceMetrics: {
        score: numberOrNull(post.score),
        upvoteRatio: numberOrNull(post.upvote_ratio),
        comments: numberOrNull(post.num_comments),
      },
      rawPayload: post,
      media: mediaUrl ? [{ mediaType: "image", url: mediaUrl, previewUrl: mediaUrl, sortOrder: 0 }] : [],
      isRepost: Boolean(post.crosspost_parent),
      isReply: false,
    };
  });
}

export function mapTelegramChannelUpdate(source, update) {
  const post = update?.channel_post ?? update?.edited_channel_post;

  if (!post?.chat?.id || !post.message_id) {
    return null;
  }

  const username = post.chat.username;
  const text = post.text || post.caption || "";
  const mediaGroupId = typeof post.media_group_id === "string" ? post.media_group_id.trim() : "";
  const media = [];
  const largestPhoto = Array.isArray(post.photo) ? post.photo.at(-1) : null;

  if (largestPhoto?.file_id) {
    media.push({
      mediaType: "image",
      url: `telegram-file:${largestPhoto.file_id}`,
      previewUrl: null,
      width: largestPhoto.width ?? null,
      height: largestPhoto.height ?? null,
      sortOrder: post.message_id * 10,
      providerMediaId: largestPhoto.file_unique_id || largestPhoto.file_id,
    });
  }

  if (post.video?.file_id) {
    media.push({
      mediaType: "video",
      url: `telegram-file:${post.video.file_id}`,
      previewUrl: null,
      width: post.video.width ?? null,
      height: post.video.height ?? null,
      sortOrder: post.message_id * 10 + media.length,
      providerMediaId: post.video.file_unique_id || post.video.file_id,
    });
  }

  return {
    platform: "telegram",
    sourceId: source.id,
    externalId: mediaGroupId
      ? `${post.chat.id}:album:${mediaGroupId}`
      : `${post.chat.id}:${post.message_id}`,
    author: post.chat.title || (username ? `@${username}` : source.name),
    title: text,
    body: text,
    originalUrl: username
      ? `https://t.me/${username}/${post.message_id}`
      : source.url,
    publishedAt: new Date(Number(post.date || Math.floor(Date.now() / 1_000)) * 1_000).toISOString(),
    editedAt: update.edited_channel_post?.edit_date
      ? new Date(update.edited_channel_post.edit_date * 1_000).toISOString()
      : null,
    reactionCount: sumTelegramReactions(post.reactions),
    commentsCount: null,
    repostCount: numberOrNull(post.forward_count),
    viewCount: numberOrNull(post.views),
    sourceMetrics: {
      views: numberOrNull(post.views),
      forwards: numberOrNull(post.forward_count),
      reactions: sumTelegramReactions(post.reactions),
    },
    rawPayload: post,
    media,
    isRepost: Boolean(post.forward_origin || post.forward_from_chat),
    isReply: Boolean(post.reply_to_message),
  };
}

export function mapTelegramMtprotoMessages(source, channel, messages) {
  const channelId = normalizeTelegramId(channel?.id ?? source.external_key);
  const username = normalizeTelegramUsername(channel?.username ?? source.external_key ?? source.url);
  const channelName = cleanTelegramText(channel?.title) || source.name;

  if (!channelId) {
    throw new Error("Telegram channel ID is missing");
  }

  const grouped = new Map();

  for (const message of messages ?? []) {
    const messageId = Number(message?.id);

    if (!Number.isInteger(messageId) || messageId <= 0) {
      continue;
    }

    const groupedId = normalizeTelegramId(message.groupedId);
    const key = groupedId ? `album:${groupedId}` : `message:${messageId}`;
    const current = grouped.get(key) ?? [];
    current.push(message);
    grouped.set(key, current);
  }

  return [...grouped.entries()].map(([key, entries]) => {
    const ordered = [...entries].sort((left, right) => Number(left.id) - Number(right.id));
    const captionMessage = ordered.find((message) => cleanTelegramText(getTelegramMessageText(message)));
    const text = cleanTelegramText(getTelegramMessageText(captionMessage));
    const firstMessageId = Number(ordered[0].id);
    const linkMessageId = Number(captionMessage?.id ?? firstMessageId);
    const groupedId = key.startsWith("album:") ? key.slice("album:".length) : null;
    const publishedAt = getEarliestTelegramDate(ordered, "date") ?? new Date().toISOString();
    const editedAt = getLatestTelegramDate(ordered, "editDate");
    const media = ordered.map(mapTelegramMtprotoMedia).filter(Boolean);
    const reactionCount = ordered.reduce((sum, message) => sum + sumTelegramMtprotoReactions(message.reactions), 0);
    const viewCount = maxTelegramMetric(ordered, "views");
    const repostCount = maxTelegramMetric(ordered, "forwards");
    const originalUrl = username
      ? `https://t.me/${username}/${linkMessageId}`
      : `https://t.me/c/${channelId}/${linkMessageId}`;

    return {
      platform: "telegram",
      sourceId: source.id,
      externalId: groupedId
        ? `telegram:${channelId}:album:${groupedId}`
        : `telegram:${channelId}:${firstMessageId}`,
      author: channelName || (username ? `@${username}` : source.name),
      title: text,
      body: text,
      originalUrl,
      publishedAt,
      editedAt,
      reactionCount,
      commentsCount: null,
      repostCount,
      viewCount,
      sourceMetrics: {
        reactions: reactionCount,
        forwards: repostCount,
        views: viewCount,
      },
      rawPayload: {
        channelId,
        groupedId,
        messageIds: ordered.map((message) => Number(message.id)),
        publishedAt,
        editedAt,
        hasMedia: media.length > 0,
        isForwarded: ordered.some((message) => Boolean(message.fwdFrom ?? message.forward)),
      },
      media,
      messageIds: ordered.map((message) => Number(message.id)),
      isRepost: ordered.some((message) => Boolean(message.fwdFrom ?? message.forward)),
      isReply: ordered.some((message) => Boolean(message.replyTo ?? message.isReply)),
    };
  });
}

export function getTelegramFloodWaitSeconds(error) {
  const directSeconds = Number(error?.seconds);

  if (Number.isFinite(directSeconds) && directSeconds > 0) {
    return Math.ceil(directSeconds);
  }

  const text = String(error?.errorMessage ?? error?.message ?? error ?? "");
  const matched = text.match(/(?:FLOOD_WAIT_|wait of\s+)(\d+)/i);
  const matchedSeconds = Number(matched?.[1]);
  return Number.isFinite(matchedSeconds) && matchedSeconds > 0
    ? Math.ceil(matchedSeconds)
    : null;
}

export function isTelegramStorageSizeError(error) {
  const message = String(error?.message ?? error ?? "");
  return /exceeded the maximum allowed size|maximum file size|payload too large|entity too large/i.test(message);
}

function mapTelegramMtprotoMedia(message) {
  const messageId = Number(message.id);
  const photo = message.photo;
  const video = message.video;

  if (!photo && !video) {
    return null;
  }

  const media = photo ?? video;
  const photoSize = photo ? getLargestTelegramPhotoSize(photo) : null;
  const videoAttributes = Array.isArray(video?.attributes) ? video.attributes : [];
  const dimensionAttribute = videoAttributes.find((attribute) =>
    numberOrNull(attribute?.w) !== null && numberOrNull(attribute?.h) !== null,
  );
  const fileNameAttribute = videoAttributes.find((attribute) =>
    typeof attribute?.fileName === "string" && attribute.fileName.trim(),
  );
  const providerMediaId = normalizeTelegramId(media?.id) || String(messageId);
  const mimeType = video && typeof video.mimeType === "string" ? video.mimeType : video ? "video/mp4" : "image/jpeg";

  return {
    mediaType: video ? "video" : "image",
    url: null,
    previewUrl: null,
    width: numberOrNull(dimensionAttribute?.w ?? photoSize?.w),
    height: numberOrNull(dimensionAttribute?.h ?? photoSize?.h),
    sortOrder: messageId,
    providerMediaId,
    telegramMessageId: messageId,
    mimeType,
    fileName: cleanTelegramText(fileNameAttribute?.fileName),
    size: numberOrNull(video?.size?.toString?.() ?? video?.size ?? getTelegramPhotoSizeBytes(photoSize)),
  };
}

function getLargestTelegramPhotoSize(photo) {
  const sizes = Array.isArray(photo?.sizes) ? photo.sizes : [];
  return sizes.reduce((largest, candidate) => {
    const width = numberOrNull(candidate?.w) ?? 0;
    const height = numberOrNull(candidate?.h) ?? 0;
    const largestArea = (numberOrNull(largest?.w) ?? 0) * (numberOrNull(largest?.h) ?? 0);
    return width * height > largestArea ? candidate : largest;
  }, null);
}

function getTelegramPhotoSizeBytes(photoSize) {
  const progressiveSizes = Array.isArray(photoSize?.sizes) ? photoSize.sizes : [];
  return photoSize?.size ?? progressiveSizes.at(-1) ?? null;
}

function getTelegramMessageText(message) {
  return message?.message ?? message?.rawText ?? message?.text ?? "";
}

function cleanTelegramText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeTelegramUsername(value) {
  const text = String(value ?? "").trim();
  const fromUrl = text.match(/(?:https?:\/\/)?t\.me\/([^/?#]+)/i)?.[1];
  const candidate = (fromUrl ?? text).replace(/^@/, "");
  return /^[A-Za-z][A-Za-z0-9_]{3,}$/.test(candidate) ? candidate : null;
}

function normalizeTelegramId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return /^-?\d+$/.test(text) ? text.replace(/^-100(?=\d)/, "") : text || null;
}

function getTelegramDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEarliestTelegramDate(messages, key) {
  const timestamps = messages
    .map((message) => getTelegramDate(message?.[key])?.getTime())
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
}

function getLatestTelegramDate(messages, key) {
  const timestamps = messages
    .map((message) => getTelegramDate(message?.[key])?.getTime())
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

function maxTelegramMetric(messages, key) {
  const values = messages.map((message) => numberOrNull(message?.[key])).filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
}

function sumTelegramMtprotoReactions(reactions) {
  return Array.isArray(reactions?.results)
    ? reactions.results.reduce((sum, item) => sum + (numberOrNull(item.count ?? item.totalCount ?? item.total_count) || 0), 0)
    : 0;
}

function parseJsonObject(raw) {
  const text = String(raw ?? "").trim();
  const withoutFence = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("AI response does not contain JSON");
  }

  return JSON.parse(withoutFence.slice(start, end + 1));
}

function cleanString(value, maxLength) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text && text.length <= maxLength ? text : null;
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item) => typeof item === "string").map((item) => item.trim()))];
}

function normalizeEntities(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    teams: uniqueStrings(source.teams).slice(0, 5),
    drivers: uniqueStrings(source.drivers).slice(0, 8),
    races: uniqueStrings(source.races).slice(0, 3),
  };
}

function hasCyrillic(value) {
  return /[А-Яа-яЁё]/.test(value);
}

function integerInRange(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function numberInRange(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumMetrics(metrics, keys) {
  return keys.reduce((total, key) => total + (numberOrNull(metrics?.[key]) || 0), 0);
}

function getRedditMediaUrl(post) {
  if (post.post_hint === "image" && /^https?:\/\//.test(post.url_overridden_by_dest || post.url || "")) {
    return post.url_overridden_by_dest || post.url;
  }

  const preview = post.preview?.images?.[0]?.source?.url;
  return typeof preview === "string" ? preview.replaceAll("&amp;", "&") : null;
}

function sumTelegramReactions(reactions) {
  return Array.isArray(reactions?.results)
    ? reactions.results.reduce((sum, item) => sum + (numberOrNull(item.total_count) || 0), 0)
    : 0;
}
