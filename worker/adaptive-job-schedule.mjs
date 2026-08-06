const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const JOLPICA_SESSION_TYPES = new Set(["qualifying", "sprint", "race"]);

export const ADAPTIVE_JOB_NAMES = Object.freeze([
  "openf1.sync_results",
  "jolpica.sync_results",
  "reports.check_latest",
  "reports.refresh_due",
]);

export function isAdaptiveJobName(jobName) {
  return ADAPTIVE_JOB_NAMES.includes(jobName);
}

export function getAdaptiveResultPlan({
  hasLiveAccess = false,
  nowMs = Date.now(),
  provider,
  sessions = [],
}) {
  const idleAt = nowMs + DAY_MS;
  const candidates = sessions
    .filter((session) => isResultSessionSupported(provider, session.sessionType))
    .filter((session) => !session.isComplete)
    .map((session) => {
      const endMs = parseDateMs(session.endAt);

      if (endMs === null) {
        return null;
      }

      const delayMinutes = provider === "openf1"
        ? hasLiveAccess ? 2 : 31
        : 15;
      const availableAt = endMs + delayMinutes * MINUTE_MS;

      if (nowMs < availableAt) {
        return {
          mode: "waiting_for_session",
          nextRunMs: availableAt,
          intervalMinutes: null,
          sessionType: session.sessionType,
        };
      }

      const elapsedMs = nowMs - availableAt;

      if (elapsedMs <= 2 * HOUR_MS) {
        const intervalMinutes = provider === "openf1" ? 5 : 15;
        return {
          mode: "active",
          nextRunMs: nowMs + intervalMinutes * MINUTE_MS,
          intervalMinutes,
          sessionType: session.sessionType,
        };
      }

      if (elapsedMs <= 6 * HOUR_MS) {
        return {
          mode: "active",
          nextRunMs: nowMs + 15 * MINUTE_MS,
          intervalMinutes: 15,
          sessionType: session.sessionType,
        };
      }

      if (elapsedMs <= DAY_MS) {
        return {
          mode: "recovery",
          nextRunMs: nowMs + 60 * MINUTE_MS,
          intervalMinutes: 60,
          sessionType: session.sessionType,
        };
      }

      return null;
    })
    .filter(Boolean);

  return makePlan(candidates, idleAt);
}

export function getAdaptiveReportCheckPlan({
  nowMs = Date.now(),
  races = [],
}) {
  const idleAt = nowMs + DAY_MS;
  const candidates = races
    .filter((race) => !race.reportComplete)
    .map((race) => {
      const endMs = parseDateMs(race.endAt);

      if (endMs === null) {
        return null;
      }

      const availableAt = endMs + 15 * MINUTE_MS;

      if (nowMs < availableAt) {
        return {
          mode: "waiting_for_race",
          nextRunMs: availableAt,
          intervalMinutes: null,
        };
      }

      const elapsedMs = nowMs - availableAt;

      if (elapsedMs <= 6 * HOUR_MS) {
        return {
          mode: "active",
          nextRunMs: nowMs + 15 * MINUTE_MS,
          intervalMinutes: 15,
        };
      }

      if (elapsedMs <= DAY_MS) {
        return {
          mode: "recovery",
          nextRunMs: nowMs + 60 * MINUTE_MS,
          intervalMinutes: 60,
        };
      }

      return null;
    })
    .filter(Boolean);

  return makePlan(candidates, idleAt);
}

export function getAdaptiveReportRefreshPlan({
  nowMs = Date.now(),
  nextRefreshAt = null,
}) {
  const idleAt = nowMs + DAY_MS;
  const refreshMs = parseDateMs(nextRefreshAt);

  if (refreshMs === null || refreshMs > idleAt) {
    return makePlan([], idleAt);
  }

  return {
    mode: "report_refresh",
    nextRunAt: new Date(Math.max(refreshMs, nowMs + 5 * MINUTE_MS)).toISOString(),
    intervalMinutes: null,
  };
}

export function getLatestStartedRound(sessions, nowMs = Date.now()) {
  return sessions
    .map((session) => ({
      round: Number(session.round),
      startMs: parseDateMs(session.startAt),
    }))
    .filter((session) =>
      Number.isInteger(session.round) &&
      session.round > 0 &&
      session.startMs !== null &&
      session.startMs <= nowMs
    )
    .sort((left, right) => right.startMs - left.startMs)[0]?.round ?? null;
}

function isResultSessionSupported(provider, sessionType) {
  if (provider === "openf1") {
    return true;
  }

  return JOLPICA_SESSION_TYPES.has(String(sessionType ?? "").toLowerCase());
}

function makePlan(candidates, idleAt) {
  const next = candidates
    .filter((candidate) => candidate.nextRunMs <= idleAt)
    .sort((left, right) => left.nextRunMs - right.nextRunMs)[0];

  if (!next) {
    return {
      mode: "daily",
      nextRunAt: new Date(idleAt).toISOString(),
      intervalMinutes: 1_440,
    };
  }

  return {
    mode: next.mode,
    nextRunAt: new Date(next.nextRunMs).toISOString(),
    intervalMinutes: next.intervalMinutes,
    sessionType: next.sessionType ?? null,
  };
}

function parseDateMs(value) {
  const timestamp = new Date(value ?? "").getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
