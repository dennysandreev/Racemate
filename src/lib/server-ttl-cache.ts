import "server-only";

type CacheEntry = {
  expiresAt: number;
  refreshing: Promise<unknown> | null;
  staleUntil: number;
  value: Promise<unknown>;
};

type ServerTtlCacheOptions = {
  shouldCache?: (value: unknown) => boolean;
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
    entries.delete(key);
    entries.set(key, existing);
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
      (resolved) => {
        if (entries.get(key) === existing) {
          if (options.shouldCache && !options.shouldCache(resolved)) {
            existing.refreshing = null;
            return;
          }
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
    (resolved) => {
      if (entries.get(key) === entry) {
        if (options.shouldCache && !options.shouldCache(resolved)) {
          entries.delete(key);
          return;
        }
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
  pruneExpiredEntries(now, key.startsWith("auth:"));

  return value;
}

export function invalidateServerTtlCache(key: string) {
  entries.delete(key);
}

export function invalidateServerTtlCachePrefix(prefix: string) {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

function pruneExpiredEntries(now: number, authScope: boolean) {
  for (const [key, entry] of entries) {
    if (!entry.refreshing && entry.staleUntil <= now) {
      entries.delete(key);
    }
  }

  // Profiles and permissions must not evict the public pages during traffic spikes.
  const scopedKeys = [...entries.keys()].filter((key) => key.startsWith("auth:") === authScope);
  for (const key of scopedKeys.slice(0, Math.max(0, scopedKeys.length - MAX_CACHE_ENTRIES))) {
    entries.delete(key);
  }
}
