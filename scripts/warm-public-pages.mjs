const args = process.argv.slice(2);
const baseUrl = (args.find((arg) => !arg.startsWith("--")) ?? "http://web:3000").replace(/\/$/, "");
const runOnce = args.includes("--once");
const intervalMs = 30_000;
const requestTimeoutMs = 30_000;
const paths = ["/", "/news", "/calendar", "/leaderboard", "/weekend", "/fantasy"];

let stopping = false;
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

  for (const path of paths) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { "user-agent": "RaceMate cache warmer" },
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

  if (!runOnce && !stopping) {
    await delay(intervalMs);
  }
} while (!runOnce && !stopping);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
