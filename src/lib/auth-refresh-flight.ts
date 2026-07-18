type FlightEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const MAX_RETAINED_FLIGHTS = 1_000;

export function createExpiringSingleFlight<T>(
  ttlMs: number,
  now: () => number = Date.now,
) {
  const entries = new Map<string, FlightEntry<T>>();
  const normalizedTtlMs = Math.max(1, ttlMs);

  return {
    run(key: string, task: () => Promise<T>) {
      const startedAt = now();
      const current = entries.get(key);

      if (current && current.expiresAt > startedAt) {
        return current.promise;
      }

      if (entries.size >= MAX_RETAINED_FLIGHTS) {
        for (const [entryKey, entry] of entries) {
          if (entry.expiresAt <= startedAt) {
            entries.delete(entryKey);
          }
        }
      }

      const promise = Promise.resolve().then(task);
      entries.set(key, {
        expiresAt: startedAt + normalizedTtlMs,
        promise,
      });

      return promise;
    },
  };
}
