export function scrubSentryEvent<T>(event: T): T;
export function parseSentrySampleRate(
  value: string | number | null | undefined,
  fallback?: number,
): number;
export function resolveSentryRelease(
  environment?: Record<string, string | undefined>,
): string | undefined;
