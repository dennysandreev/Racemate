import * as Sentry from "@sentry/nextjs";

import {
  parseSentrySampleRate,
  resolveSentryRelease,
  scrubSentryEvent,
} from "./sentry-scrub.mjs";

Sentry.init({
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.APP_ENV ?? process.env.NODE_ENV,
  initialScope: {
    tags: {
      runtime: "server",
      service: "web",
    },
  },
  release: resolveSentryRelease(),
  sendDefaultPii: false,
  tracesSampleRate: parseSentrySampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === "production" ? 0.1 : 0,
  ),
});
