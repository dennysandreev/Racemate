import "./load-env.mjs";

import * as Sentry from "@sentry/node";

import {
  parseSentrySampleRate,
  resolveSentryRelease,
  scrubSentryEvent,
} from "../sentry-scrub.mjs";

const capturedErrors = new WeakSet();

Sentry.init({
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
  dsn: process.env.SENTRY_WORKER_DSN ?? process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.APP_ENV ?? process.env.NODE_ENV,
  initialScope: { tags: { runtime: "node", service: "worker" } },
  release: resolveSentryRelease(),
  sendDefaultPii: false,
  tracesSampleRate: parseSentrySampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === "production" ? 0.1 : 0,
  ),
});

function getSafeWorkerTag(value) {
  const normalized = String(value ?? "")
    .replace(/[^a-zA-Z0-9._:-]/g, "-")
    .slice(0, 120);
  return normalized || "unknown";
}

export function captureWorkerException(error, { jobName, runId } = {}) {
  if (error && typeof error === "object") {
    if (capturedErrors.has(error)) return;
    capturedErrors.add(error);
  }

  Sentry.withScope((scope) => {
    const safeJobName = getSafeWorkerTag(jobName);
    scope.setTags({
      entity_type: getSafeWorkerTag(safeJobName.split(".")[0]),
      job_name: safeJobName,
      pipeline: safeJobName.startsWith("notifications.")
        ? "notifications"
        : getSafeWorkerTag(safeJobName.split(".")[0]),
      service: "worker",
    });

    if (runId) scope.setTag("run_id", getSafeWorkerTag(runId));
    Sentry.captureException(error);
  });
}

export function flushWorkerTelemetry(timeout = 2_000) {
  return Sentry.flush(timeout);
}
