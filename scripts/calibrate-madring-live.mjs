import { readFile, writeFile } from "node:fs/promises";
import { MADRING_MODEL } from "../src/data/madring-model.ts";

const track = JSON.parse(
  await readFile("worker/live/tracks/madring-2026.json", "utf8"),
);
const model = MADRING_MODEL.points.map(([progress, x, y, z]) => ({
  progress,
  x,
  y,
  z,
}));
function sample(points, progress) {
  const p = ((progress % 1) + 1) % 1;
  let i = points.findIndex((v) => v.progress > p);
  if (i < 0) i = points.length;
  const a = points[Math.max(0, i - 1)],
    b = points[i] ?? { ...points[0], progress: 1 };
  const t = (p - a.progress) / Math.max(1e-9, b.progress - a.progress);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
const target = track.centerline.map((p) => ({
  progress: p.progress,
  x: p.worldX,
  y: p.worldY,
}));
function fit(offset) {
  const pairs = Array.from({ length: 300 }, (_, i) => [
    sample(model, i / 300 + offset),
    sample(target, i / 300),
  ]);
  const mean = (j, axis) =>
    pairs.reduce((s, p) => s + p[j][axis], 0) / pairs.length;
  const mx = mean(0, "x"),
    my = mean(0, "y"),
    tx = mean(1, "x"),
    ty = mean(1, "y");
  let real = 0,
    imaginary = 0,
    denominator = 0;
  for (const [m, t] of pairs) {
    const x = m.x - mx,
      y = m.y - my,
      X = t.x - tx,
      Y = t.y - ty;
    real += x * X + y * Y;
    imaginary += x * Y - y * X;
    denominator += x * x + y * y;
  }
  const a = real / denominator,
    b = imaginary / denominator;
  const transform = {
    a,
    b,
    tx: tx - a * mx + b * my,
    ty: ty - b * mx - a * my,
  };
  const errors = pairs.map(
    ([m, t]) =>
      Math.hypot(
        a * m.x - b * m.y + transform.tx - t.x,
        b * m.x + a * m.y + transform.ty - t.y,
      ) / Math.hypot(a, b),
  );
  return {
    offset,
    ...transform,
    scale: Math.hypot(a, b),
    rmsMeters: Math.sqrt(errors.reduce((s, x) => s + x * x, 0) / errors.length),
    maximumMeters: Math.max(...errors),
  };
}
const fits = Array.from({ length: 2001 }, (_, i) => fit((i - 1000) / 10000));
const best =
  track.liveModelAlignment ?? fits.sort((a, b) => a.rmsMeters - b.rmsMeters)[0];
console.info(best);

// Read the centre seam of the delivered pit mesh, including its actual height.
// This avoids a second hand-drawn path diverging from the Blender model.
const { readMadringMeshes } = await import(
  "./track-model-blender/audit-madring-surfaces.mjs"
);
const meshes = await readMadringMeshes(
  await readFile("public/f1/tracks/3d/madring.glb"),
);
const vertices = new Map(),
  edges = new Map();
for (const tri of meshes.get("Madring_Pit_Lane_Mesh")) {
  const keys = tri.map((v) => {
    const key = v.join(",");
    vertices.set(key, v);
    return key;
  });
  for (let i = 0; i < 3; i++) {
    const pair = [keys[i], keys[(i + 1) % 3]].sort(),
      key = pair.join("|");
    const edge = edges.get(key) ?? { pair, count: 0 };
    edge.count++;
    edges.set(key, edge);
  }
}
const boundary = new Set(
  [...edges.values()].filter((e) => e.count === 1).flatMap((e) => e.pair),
);
const graph = new Map();
for (const {
  pair: [a, b],
} of edges.values()) {
  if (boundary.has(a) || boundary.has(b)) continue;
  for (const [s, t] of [
    [a, b],
    [b, a],
  ]) {
    if (!graph.has(s)) graph.set(s, []);
    graph.get(s).push(t);
  }
}
const ends = [...graph]
  .filter(([, neighbours]) => neighbours.length === 1)
  .map(([key]) => key);
if (ends.length !== 2 || [...graph.values()].some((n) => n.length > 2))
  throw new Error("Pit centre seam must be one open chain");
// Madring enters from the eastern end and leaves towards turn one (west).
let current = ends.sort((a, b) => vertices.get(b)[0] - vertices.get(a)[0])[0],
  previous = null;
const pit = [];
while (current) {
  pit.push(vertices.get(current));
  const next = graph.get(current).find((key) => key !== previous);
  previous = current;
  current = next;
}
if (pit.length !== graph.size) throw new Error("Disconnected pit centre seam");
function endpoint(a, b) {
  const prediction = a.map((x, i) => x * 2 - b[i]);
  return [...boundary]
    .map((key) => vertices.get(key))
    .sort(
      (v, w) =>
        Math.hypot(...v.map((x, i) => x - prediction[i])) -
        Math.hypot(...w.map((x, i) => x - prediction[i])),
    )[0];
}
pit.unshift(endpoint(pit[0], pit[1]));
pit.push(endpoint(pit.at(-1), pit.at(-2)));
let distance = 0;
const pitPoints = pit
  .map(([x, h, z], i) => {
    if (i) distance += Math.hypot(x - pit[i - 1][0], z - pit[i - 1][2]);
    return [distance, x, -z, (h + 640 - 0.18) * 10];
  })
  .map(([d, ...xyz]) => [d / distance, ...xyz]);
await writeFile(
  "src/data/madring-live-path.json",
  JSON.stringify(
    { pitLanePoints: pitPoints, lengthMeters: distance },
    null,
    2,
  ) + "\n",
);
function mapPoint([progress, x, y, z]) {
  const worldX = best.a * x - best.b * y + best.tx,
    worldY = best.b * x + best.a * y + best.ty;
  const svgX =
    track.transform.offsetX +
    (worldX - track.worldBounds.minX) * track.transform.scale;
  const projectedY =
    track.transform.offsetY +
    (worldY - track.worldBounds.minY) * track.transform.scale;
  return {
    progress,
    worldX,
    worldY,
    worldZ: z,
    svgX,
    svgY: track.transform.invertY
      ? track.svg.viewBox.height - projectedY
      : projectedY,
    distanceM: progress * 5416.370684455954,
    elevationM: z / 10,
  };
}
track.centerline = MADRING_MODEL.points.map(mapPoint);
const pathD = (points) =>
  points
    .map((p, i) => `${i ? "L" : "M"}${p.svgX.toFixed(3)} ${p.svgY.toFixed(3)}`)
    .join(" ");
track.svg.visualPathD = track.svg.technicalPathD =
  pathD(track.centerline) + " Z";
const mappedPit = pitPoints.map(mapPoint);
track.pitLane = {
  points: mappedPit,
  visualPathD: pathD(mappedPit),
  labelX: mappedPit[Math.floor(mappedPit.length / 2)].svgX,
  labelY: mappedPit[Math.floor(mappedPit.length / 2)].svgY,
  source: "madring-delivery-mesh",
  metadata: {
    source: "Madring_Pit_Lane_Mesh · municipal model / OSM 1552567031",
  },
};
track.liveModelAlignment = best;
const sf = sample(model, 40 / 5416.370684455954);
track.startFinish = mapPoint([40 / 5416.370684455954, sf.x, sf.y, 6725]);
await writeFile(
  "worker/live/tracks/madring-2026.json",
  JSON.stringify(track, null, 2) + "\n",
);
console.info({ pitPoints: pitPoints.length, pitLengthMeters: distance });
