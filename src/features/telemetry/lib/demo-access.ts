import "server-only";

import { selectTelemetryDemoCandidates } from "@/features/telemetry/lib/demo-selection";
import { resultKey, telemetryStore } from "@/features/telemetry/lib/server";
import type { Meeting, Session } from "@/features/telemetry/lib/types";
import { withServerTtlCache } from "@/lib/server-ttl-cache";

export type TelemetryDemoScope = {
  meeting: Meeting;
  sessions: Session[];
};

export async function getTelemetryDemoScope(): Promise<TelemetryDemoScope | null> {
  return withServerTtlCache(
    "telemetry:demo-scope",
    60_000,
    loadTelemetryDemoScope,
    { staleWhileRevalidateMs: 5 * 60_000 },
  );
}

async function loadTelemetryDemoScope(): Promise<TelemetryDemoScope | null> {
  const store = telemetryStore();
  const years = (await store.get<number[]>(resultKey({ kind: "seasons" }))) ?? [];
  const seasons = await Promise.all(
    years.map(async (year) => ({
      meetings: (await store.get<Meeting[]>(`meetings:${year}`)) ?? [],
      year,
    })),
  );

  for (const meeting of selectTelemetryDemoCandidates(seasons)) {
    const sessions = (await store.get<Session[]>(`sessions:${meeting.id}`)) ?? [];
    if (sessions.length) return { meeting, sessions };
  }
  return null;
}

export function configUsesDemoSessions(config: unknown, scope: TelemetryDemoScope) {
  if (!isRecord(config) || !Array.isArray(config.traces)) return false;
  const allowed = new Set(scope.sessions.map((session) => session.id));
  return config.traces.length > 0 && config.traces.every((trace) => isRecord(trace) && typeof trace.session === "number" && allowed.has(trace.session));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
