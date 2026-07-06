import "server-only";

import { headers } from "next/headers";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitBucket>;

const globalStore = globalThis as typeof globalThis & {
  __racemateRateLimitStore?: RateLimitStore;
};

const store = globalStore.__racemateRateLimitStore ?? new Map<string, RateLimitBucket>();
globalStore.__racemateRateLimitStore = store;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

export async function consumeIpRateLimit(
  scope: string,
  request: Request | null,
  limit: number,
  windowMs: number,
) {
  const ip = await getClientIp(request);
  return consumeRateLimit(scope, `ip:${ip}`, limit, windowMs);
}

export function consumeRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const normalizedWindowMs = Math.max(1_000, Math.floor(windowMs));
  const key = `${scope}:${identity || "unknown"}`;
  const bucket = store.get(key);

  cleanupExpiredBuckets(now);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + normalizedWindowMs;
    store.set(key, { count: 1, resetAt });

    return { ok: true, remaining: normalizedLimit - 1, resetAt };
  }

  if (bucket.count >= normalizedLimit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;

  return {
    ok: true,
    remaining: Math.max(0, normalizedLimit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function getRetryAfterSeconds(resetAt: number) {
  return String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1_000)));
}

async function getClientIp(request: Request | null) {
  const headerList = request ? request.headers : await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    headerList.get("cf-connecting-ip")?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    forwardedIp ||
    "unknown"
  );
}

function cleanupExpiredBuckets(now: number) {
  if (store.size < 1_000) {
    return;
  }

  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
}
