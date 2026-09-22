const RESULT_SYNC_DELAYS_MS = [
  0, 30_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000,
];
const JOLPICA_RESULT_SYNC_DELAYS_MS = [1_800_000, 2_400_000, 3_600_000];

export async function queueSessionResultSync(db, session, now = Date.now()) {
  const sessionKey = Number(session?.session_key);
  if (!db || !Number.isInteger(sessionKey)) return 0;

  const openF1Jobs = RESULT_SYNC_DELAYS_MS.map((delay) => ({
    job_name: "openf1.check_current_sessions",
    status: "queued",
    queue_version: 1,
    available_at: new Date(now + delay).toISOString(),
    attempt_count: 0,
    max_attempts: 2,
    request_key: `live-openf1-results:${sessionKey}:${delay}`,
    items_processed: 0,
    metadata: {
      source: "live_session_end",
      args: {},
      sessionKey,
      title: "Проверить итог сессии OpenF1",
    },
  }));
  const jolpicaJobs = JOLPICA_RESULT_SYNC_DELAYS_MS.map((delay) => ({
    job_name: "jolpica.sync_results",
    status: "queued",
    queue_version: 1,
    available_at: new Date(now + delay).toISOString(),
    attempt_count: 0,
    max_attempts: 2,
    request_key: `live-jolpica-results:${sessionKey}:${delay}`,
    items_processed: 0,
    metadata: {
      source: "live_session_end",
      args: {},
      sessionKey,
      title: "Проверить официальный итог сессии Jolpica",
    },
  }));
  const replayJobs = session.session_name === "Race"
    ? [120_000, 900_000, 3_600_000].map((delay) => ({
        job_name: "race_replay.prepare_completed",
        status: "queued",
        queue_version: 1,
        available_at: new Date(now + delay).toISOString(),
        attempt_count: 0,
        max_attempts: 3,
        request_key: `live-race-replay:${sessionKey}:${delay}`,
        items_processed: 0,
        metadata: { source: "live_session_end", args: {}, sessionKey, title: "Сохранить повтор гонки" },
      }))
    : [];
  const jobs = [...openF1Jobs, ...jolpicaJobs, ...replayJobs];
  const keys = jobs.map((job) => job.request_key);
  const { data: existing, error: readError } = await db
    .from("job_runs")
    .select("request_key")
    .in("request_key", keys);
  if (readError) throw readError;

  const existingKeys = new Set(
    (existing ?? []).map((row) => row.request_key).filter(Boolean),
  );
  const missing = jobs.filter((job) => !existingKeys.has(job.request_key));
  if (!missing.length) return 0;

  const { error: insertError } = await db.from("job_runs").insert(missing);
  if (insertError && insertError.code !== "23505") throw insertError;
  return insertError ? 0 : missing.length;
}
