import { readFile, writeFile } from "node:fs/promises";

// Reuse the same horizontal plane as track-model-renderer. worldZ is elevation.
const registryUrl = new URL("../worker/telemetry/tracks.json", import.meta.url);
const tracks = JSON.parse(await readFile(registryUrl, "utf8"));
for (const track of tracks) {
  const source = track.source.split(": ")[1];
  const exports = await import(new URL(`../${source}`, import.meta.url));
  const model = Object.values(exports).find(
    (value) => value.points && value.lapLengthKm,
  );
  if (!model) throw new Error(`Track model missing: ${track.id}`);
  track.points = model.points.map(([progress, worldX, worldY]) => ({
    distance: progress * track.length,
    x: worldX,
    y: -worldY, // SVG's vertical axis runs south, worldY runs north.
  }));
  track.version = "raceside-2026-09-12-planar-v2";
}
await writeFile(registryUrl, JSON.stringify(tracks));
console.info(`Updated planar geometry for ${tracks.length} circuits.`);
