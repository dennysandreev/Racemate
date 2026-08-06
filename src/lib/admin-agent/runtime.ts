import { hostname } from "node:os";

const RELEASE_SHA_PATTERN = /^[0-9a-f]{7,64}$/;

export function normalizeReleaseSha(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  return normalized && RELEASE_SHA_PATTERN.test(normalized) ? normalized : null;
}

export function getRuntimeReleaseSha(env: NodeJS.ProcessEnv = process.env) {
  return normalizeReleaseSha(
    env.RACESIDE_RELEASE_SHA ??
      env.GITHUB_SHA ??
      env.VERCEL_GIT_COMMIT_SHA,
  );
}

export function getRuntimeInstanceId(
  serviceName: string,
  env: NodeJS.ProcessEnv = process.env,
  host = hostname(),
) {
  const configured = env.RACESIDE_INSTANCE_ID?.trim();
  const instanceId = configured || `${host}:${serviceName}`;

  return instanceId.slice(0, 160);
}
