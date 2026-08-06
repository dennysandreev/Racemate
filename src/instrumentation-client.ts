import * as Sentry from "@sentry/nextjs";

import { parseSentrySampleRate, scrubSentryEvent } from "../sentry-scrub.mjs";

Sentry.init({
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  initialScope: { tags: { runtime: "client", service: "web" } },
  sendDefaultPii: false,
  tracesSampleRate: parseSentrySampleRate(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === "production" ? 0.1 : 0,
  ),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
