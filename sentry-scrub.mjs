const FILTERED_VALUE = "[Filtered]";
const SENSITIVE_KEY_PATTERN = /(?:^|[_-])(?:authorization|cookie|email|password|passwd|secret|session|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|chat[_-]?id|provider[_-]?id|telegram(?:[_-](?:chat|user))?[_-]?id)(?:$|[_-])/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\b(Bearer\s+)[A-Z0-9._~+/=-]+/gi;
const SECRET_VALUE_PATTERN = /\b((?:access[_-]?token|api[_-]?key|authorization|chat[_-]?id|email|password|provider[_-]?id|refresh[_-]?token|secret|telegram(?:[_-](?:chat|user))?[_-]?id)\s*[:=]\s*)[^\s,;]+/gi;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

function stripUrlQuery(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    const queryIndex = value.indexOf("?");
    const hashIndex = value.indexOf("#");
    const firstPrivatePart = [queryIndex, hashIndex]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];

    return firstPrivatePart === undefined ? value : value.slice(0, firstPrivatePart);
  }
}

function scrubString(value) {
  return value
    .replace(EMAIL_PATTERN, FILTERED_VALUE)
    .replace(BEARER_PATTERN, `$1${FILTERED_VALUE}`)
    .replace(SECRET_VALUE_PATTERN, `$1${FILTERED_VALUE}`)
    .replace(URL_PATTERN, (url) => stripUrlQuery(url));
}

function scrubValue(value, key = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return FILTERED_VALUE;
  }

  if (typeof value === "string") {
    return scrubString(value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return FILTERED_VALUE;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, key, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([nestedKey, nestedValue]) => [
      nestedKey,
      scrubValue(nestedValue, nestedKey, seen),
    ]),
  );
}

export function scrubSentryEvent(event) {
  const scrubbed = scrubValue(event);

  if (!scrubbed || typeof scrubbed !== "object") {
    return scrubbed;
  }

  delete scrubbed.user;

  if (scrubbed.request && typeof scrubbed.request === "object") {
    if (typeof scrubbed.request.url === "string") {
      scrubbed.request.url = stripUrlQuery(scrubbed.request.url);
    }
    delete scrubbed.request.cookies;
    delete scrubbed.request.query_string;
  }

  return scrubbed;
}

export function parseSentrySampleRate(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function resolveSentryRelease(environment = process.env) {
  return (
    environment.SENTRY_RELEASE ??
    environment.RACESIDE_RELEASE_SHA ??
    environment.RELEASE_SHA ??
    environment.GITHUB_SHA ??
    environment.VERCEL_GIT_COMMIT_SHA
  );
}
