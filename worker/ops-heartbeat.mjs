import { hostname } from "node:os";

const serviceNames = new Set([
  "web",
  "worker",
  "cron",
  "admin-job-runner",
  "watcher",
]);
const releasePattern = /^[0-9a-f]{7,64}$/;

export function normalizeHeartbeatRelease(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  return releasePattern.test(normalized) ? normalized : null;
}

export function buildServiceHeartbeat({
  checkedAt = new Date().toISOString(),
  env = process.env,
  host = hostname(),
  serviceName,
  status = "healthy",
  summary = {},
}) {
  if (!serviceNames.has(serviceName)) {
    throw new Error("Invalid heartbeat service name");
  }

  if (!["healthy", "degraded", "unhealthy"].includes(status)) {
    throw new Error("Invalid heartbeat status");
  }

  const configuredInstanceId = String(env.RACESIDE_INSTANCE_ID ?? "").trim();

  return {
    service_name: serviceName,
    instance_id: (configuredInstanceId || `${host}:${serviceName}`).slice(0, 160),
    release_sha: normalizeHeartbeatRelease(
      env.RACESIDE_RELEASE_SHA ?? env.GITHUB_SHA ?? env.VERCEL_GIT_COMMIT_SHA,
    ),
    status,
    summary,
    checked_at: checkedAt,
    updated_at: checkedAt,
  };
}

export async function upsertServiceHeartbeat(client, input) {
  const row = buildServiceHeartbeat(input);
  const { error } = await client
    .from("ops_service_heartbeats")
    .upsert(row, { onConflict: "service_name,instance_id" });

  if (error) {
    throw error;
  }

  return row;
}
