import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { OpenF1Provider } from "../worker/telemetry/provider.mjs";
import { TelemetryService } from "../worker/telemetry/service.mjs";
import { bestLap, resampleComparison } from "../worker/telemetry/core.mjs";
const directory = new URL("../docs/telemetry/fixtures/", import.meta.url);
await mkdir(directory, { recursive: true });
let queue = Promise.resolve(),
  last = 0,
  calls = 0;
const fetchRows = async (topic, query) => {
  const key = createHash("sha256")
      .update(JSON.stringify([topic, query]))
      .digest("hex")
      .slice(0, 16),
    file = new URL(`${topic}-${key}.json`, directory);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    /* Fetch uncached historical fixture. */
  }
  const turn = queue.then(async () => {
    await sleep(Math.max(0, last + 2200 - Date.now()));
    last = Date.now();
  });
  queue = turn.catch(() => {});
  await turn;
  const url = new URL(`https://api.openf1.org/v1/${topic}`);
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(url, { signal: AbortSignal.timeout(45000) });
    calls++;
    if (res.status !== 429) break;
    await sleep(5000 * (attempt + 1));
  }
  if (res.status === 404) {
    await writeFile(file, "[]");
    return [];
  }
  if (!res.ok) throw new Error(`OpenF1 ${topic} HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("Invalid OpenF1 payload");
  await writeFile(file, JSON.stringify(rows));
  return rows;
};
const memory = new Map(),
  store = {
    get: async (k) => memory.get(k) ?? null,
    put: async (k, v) => {
      memory.set(k, v);
    },
  };
const provider = new OpenF1Provider({ fetchRows }),
  service = new TelemetryService({ store, provider });
const sessionId = Number(process.argv[2] ?? 11357),
  catalog = await service.catalog(sessionId);
await writeFile(new URL("catalog.json", directory), JSON.stringify(catalog));
const eligible = catalog.drivers
  .filter((d) =>
    bestLap(catalog.laps.filter((l) => l.driverNumber === d.number)),
  )
  .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
if (eligible.length < 2) throw new Error("No pair of eligible drivers");
const config = {
  mode: "best",
  reference: 0,
  window: "weekend",
  traces: eligible
    .slice(0, 2)
    .map((d) => ({ session: sessionId, driver: d.number, lap: "best" })),
};
const began = performance.now(),
  comparison = await service.compare(config),
  elapsed = performance.now() - began;
await writeFile(
  new URL("comparison.json", directory),
  JSON.stringify(comparison),
);
await writeFile(new URL("cache.json", directory), JSON.stringify([...memory]));
const reply = resampleComparison(comparison),
  report = {
    session: catalog.session,
    calls,
    prepareMs: elapsed,
    traces: comparison.traces.map((t) => ({
      driver: t.driver.code,
      lap: t.lap.number,
      time: t.lap.time,
      points: t.points.length,
      quality: t.quality,
      channels: Object.fromEntries(
        ["speed", "throttle", "brake", "gear", "rpm", "drs"].map((ch) => [
          ch,
          t.points.filter((p) => p[ch] != null).length,
        ]),
      ),
    })),
    finishDelta: comparison.delta.map((d) => d.at(-1)),
    responsePoints: reply.distance.length,
    responseBytes: Buffer.byteLength(JSON.stringify(reply)),
    track: comparison.track.id,
  };
await writeFile(
  new URL("../openf1-audit.json", directory),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
