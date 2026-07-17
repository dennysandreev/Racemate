import "server-only";

type CacheEntry = {
  expiresAt: number;
  refreshing: Promise<unknown> | null;
  staleUntil: number;
  value: Promise<unknown>;
};

type ServerTtlCacheOptions = {
  staleWhileRevalidateMs?: number;
};

const MAX_CACHE_ENTRIES = 64;
const globalCache = globalThis as typeof globalThis & {
  __raceMateServerTtlCache?: Map<string, CacheEntry>;
};
const entries = globalCache.__raceMateServerTtlCache ?? new Map<string, CacheEntry>();

globalCache.__raceMateServerTtlCache = entries;

export function withServerTtlCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  options: ServerTtlCacheOptions = {},
): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key);

  if (existing && existing.expiresAt > now) {
    return existing.value as Promise<T>;
  }

  if (existing?.refreshing) {
    return (existing.staleUntil > now ? existing.value : existing.refreshing) as Promise<T>;
  }

  const ttl = Math.max(1, ttlMs);
  const staleWhileRevalidateMs = Math.max(0, options.staleWhileRevalidateMs ?? 0);

  if (existing && existing.staleUntil > now) {
    const refreshing = load();

    existing.refreshing = refreshing;
    void refreshing.then(
      () => {
        if (entries.get(key) === existing) {
          existing.expiresAt = Date.now() + ttl;
          existing.refreshing = null;
          existing.staleUntil = existing.expiresAt + staleWhileRevalidateMs;
          existing.value = refreshing;
        }
      },
      () => {
        if (entries.get(key) === existing) {
          existing.refreshing = null;
        }
      },
    );

    return existing.value as Promise<T>;
  }

  const value = load();
  const entry: CacheEntry = {
    expiresAt: Number.POSITIVE_INFINITY,
    refreshing: null,
    staleUntil: Number.POSITIVE_INFINITY,
    value,
  };

  entries.set(key, entry);
  void value.then(
    () => {
      if (entries.get(key) === entry) {
        entry.expiresAt = Date.now() + ttl;
        entry.staleUntil = entry.expiresAt + staleWhileRevalidateMs;
      }
    },
    () => {
      if (entries.get(key) === entry) {
        entries.delete(key);
      }
    },
  );
  pruneExpiredEntries(now);

  return value;
}

function pruneExpiredEntries(now: number) {
  for (const [key, entry] of entries) {
    if (!entry.refreshing && entry.staleUntil <= now) {
      entries.delete(key);
    }
  }

  while (entries.size > MAX_CACHE_ENTRIES) {
    const oldestKey = entries.keys().next().value;

    if (typeof oldestKey !== "string") {
      break;
    }

    entries.delete(oldestKey);
  }
}
