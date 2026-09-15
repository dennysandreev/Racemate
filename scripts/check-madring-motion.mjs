import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { mapLocation } from "../worker/live/state.mjs";
const track = JSON.parse(
  await readFile("worker/live/tracks/madring-2026.json", "utf8"),
);
const report = [];
for (const session of [11362, 11363]) {
  const rows = JSON.parse(
    await readFile(
      `/private/tmp/madring-${session}-location-test.json`,
      "utf8",
    ),
  ).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const oldTrack = JSON.parse(
    await readFile(`/private/tmp/madring-${session}-track.json`, "utf8"),
  );
  const previous = new Map();
  let moving = 0,
    frozenBefore = 0,
    frozenAfter = 0,
    pitSamples = 0;
  for (const row of rows) {
    const old = previous.get(row.driver_number);
    const p = mapLocation(track, row, old?.p);
    const vertex = oldTrack.centerline.reduce((best, v) =>
      Math.hypot(v.worldX - row.x, v.worldY - row.y) <
      Math.hypot(best.worldX - row.x, best.worldY - row.y)
        ? v
        : best,
    );
    if (p.pitLaneProgress != null) pitSamples++;
    if (old) {
      const dt = Date.parse(row.date) - Date.parse(old.row.date);
      if (
        dt > 0 &&
        dt < 1000 &&
        Math.hypot(row.x - old.row.x, row.y - old.row.y) > 10
      ) {
        moving++;
        if (vertex.progress === old.vertex) frozenBefore++;
        if (p.progress === old.p.progress) frozenAfter++;
      }
    }
    previous.set(row.driver_number, { p, row, vertex: vertex.progress });
  }
  const result = {
    session,
    samples: rows.length,
    moving,
    frozenBefore,
    frozenAfter,
    frozenBeforePercent: (frozenBefore / moving) * 100,
    frozenAfterPercent: (frozenAfter / moving) * 100,
    pitSamples,
  };
  assert.ok(
    result.frozenAfterPercent < 0.5,
    "Continuous projection must not reintroduce vertex snapping",
  );
  report.push(result);
}
await mkdir("output/live", { recursive: true });
await writeFile(
  "output/live/madring-motion-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.info(JSON.stringify(report, null, 2));
