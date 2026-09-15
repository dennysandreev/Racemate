const args = process.argv.slice(2);
const baseUrl = (args.find((arg) => !arg.startsWith("--")) ?? "http://web:3000").replace(/\/$/, "");
const runOnce = args.includes("--once");
const intervalMs = 4 * 60_000;
const maxBackoffMs = 15 * 60_000;
const requestTimeoutMs = 15_000;
const paths = ["/", "/news", "/social", "/calendar", "/leaderboard", "/leaderboard?table=constructors", "/drivers", "/teams", "/weekend", "/fantasy"];

let stopping = false;
let failureCount = 0;
let runCount = 0;

process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});

do {
  runCount += 1;
  const startedAt = Date.now();
  let failed = 0;

  if (!await isApplicationHealthy()) {
    failureCount += 1;
    const retryMs = getRetryDelayMs(failureCount);
    console.log(`[cache.warm] skipped=unhealthy retryMs=${retryMs}`);

    if (!runOnce && !stopping) {
      await delay(retryMs);
    }
    continue;
  }

  for (const path of paths) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { "user-agent": "RaceSide cache warmer" },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      if (!response.ok) {
        failed += 1;
      }

      await response.arrayBuffer();
    } catch {
      failed += 1;
    }
  }

  if (failed || runCount === 1 || runCount % 20 === 0) {
    console.log(
      `[cache.warm] pages=${paths.length} failed=${failed} durationMs=${Date.now() - startedAt}`,
    );
  }

  failureCount = failed ? failureCount + 1 : 0;

  if (!runOnce && !stopping) {
    await delay(failed ? getRetryDelayMs(failureCount) : intervalMs);
  }
} while (!runOnce && !stopping);

async function isApplicationHealthy() {
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { "user-agent": "RaceSide cache warmer health check" },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}

function getRetryDelayMs(failures) {
  const baseDelay = Math.min(maxBackoffMs, intervalMs * (2 ** Math.max(0, failures - 1)));
  return baseDelay + Math.floor(Math.random() * Math.min(5_000, baseDelay * 0.05));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
