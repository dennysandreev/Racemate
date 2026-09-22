import layouts from "../data/replay-pit-layouts.json" with { type: "json" };

const SAMPLE_COUNT = 256;
const wrap = (value) => ((value % 1) + 1) % 1;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function findLayout(track) {
  const name = `${track.circuitKey ?? ""} ${track.circuitName ?? ""}`.toLowerCase();
  return layouts.find((item) => item.aliases.some((alias) => new RegExp(`(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`).test(name)));
}

function withWorldCoordinates(track, svgX, svgY) {
  const { scale, offsetX, offsetY } = track.transform;
  return {
    svgX, svgY,
    worldX: (svgX - offsetX) / scale + track.worldBounds.minX,
    worldY: (track.svg.viewBox.height - svgY - offsetY) / scale + track.worldBounds.minY,
    worldZ: track.worldBounds.minZ,
  };
}

export function withVerifiedReplayPitLane(track) {
  const layout = findLayout(track);
  if (!layout || track.centerline.length < 8) return track;
  let result = track;
  // The archived Monaco contour was built from an incomplete location feed.
  // A lane cannot be registered onto that distorted loop. Restore the reviewed
  // circuit (with its actual start line) before adding the lane, only in this case.
  if (layout.id === "monaco") {
    const fit = registerCircuit(layout.track, track.centerline.map((p) => [p.svgX, p.svgY]));
    if (fit.rms > 15) {
      const transformed = layout.track.map(fit.transform);
      const minX = Math.min(...transformed.map((p) => p[0])), maxX = Math.max(...transformed.map((p) => p[0]));
      const minY = Math.min(...transformed.map((p) => p[1])), maxY = Math.max(...transformed.map((p) => p[1]));
      const margin = 64;
      const scale = Math.min((track.svg.viewBox.width - margin * 2) / (maxX - minX), (track.svg.viewBox.height - margin * 2) / (maxY - minY));
      const centerline = transformed.map((p, i) => ({
        ...withWorldCoordinates(track, margin + (p[0] - minX) * scale, margin + (p[1] - minY) * scale),
        progress: i / transformed.length, distanceM: i / transformed.length * 3337,
        elevationM: track.centerline[Math.floor(i / transformed.length * track.centerline.length)].elevationM,
      }));
      const path = centerline.map((p, i) => `${i ? "L" : "M"}${p.svgX.toFixed(3)} ${p.svgY.toFixed(3)}`).join(" ") + " Z";
      result = { ...track, centerline, svg: { ...track.svg, technicalPathD: path, visualPathD: path }, startFinish: { progress: 0, svgX: centerline[0].svgX, svgY: centerline[0].svgY } };
    }
  }
  const pitLane = getVerifiedReplayPitLane(result);
  return pitLane ? { ...result, pitLane } : result;
}

export function sampleClosedLine(points, count = SAMPLE_COUNT) {
  const line = [...points];
  if (distance(line[0], line.at(-1)) > 1e-6) line.push(line[0]);
  const lengths = [0];
  for (let i = 1; i < line.length; i++) lengths.push(lengths.at(-1) + distance(line[i - 1], line[i]));
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    const target = i / count * lengths.at(-1);
    while (segment < line.length - 1 && lengths[segment] < target) segment++;
    const ratio = (target - lengths[segment - 1]) / Math.max(1e-9, lengths[segment] - lengths[segment - 1]);
    return line[segment - 1].map((value, axis) => value + (line[segment][axis] - value) * ratio);
  });
}

function interpolate(points, progress) {
  const index = wrap(progress) * points.length;
  const a = points[Math.floor(index) % points.length];
  const b = points[(Math.floor(index) + 1) % points.length];
  return a.map((value, axis) => value + (b[axis] - value) * (index % 1));
}

function nearest(points, point) {
  let best = { distance: Infinity };
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const ratio = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
    const position = [a[0] + dx * ratio, a[1] + dy * ratio];
    const gap = distance(position, point);
    if (gap < best.distance) best = { distance: gap, position, progress: (i + ratio) / points.length };
  }
  return best;
}

// Fit the entire circuit, not a start-line guess. Telemetry maps have different
// origins, units, rotations and Y directions; some also start mid-lap.
export function registerCircuit(reference, target) {
  const source = sampleClosedLine(reference);
  const destination = sampleClosedLine(target);
  const center = (points) => points.reduce((sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length], [0, 0]);
  const sc = center(source), tc = center(destination);
  const denominator = source.reduce((sum, p) => sum + (p[0] - sc[0]) ** 2 + (p[1] - sc[1]) ** 2, 0);
  let best = null;
  function fit(shift, direction, reflection) {
    let dot = 0, cross = 0;
    const targets = source.map((_, i) => interpolate(destination, shift + direction * i / source.length));
    for (let i = 0; i < source.length; i++) {
      const x = source[i][0] - sc[0], y = (source[i][1] - sc[1]) * reflection;
      const u = targets[i][0] - tc[0], v = targets[i][1] - tc[1];
      dot += x * u + y * v;
      cross += x * v - y * u;
    }
    const a = dot / denominator, b = cross / denominator;
    const transform = (p) => {
      const x = p[0] - sc[0], y = (p[1] - sc[1]) * reflection;
      return [tc[0] + a * x - b * y, tc[1] + b * x + a * y];
    };
    const rms = Math.sqrt(source.reduce((sum, p, i) => sum + distance(transform(p), targets[i]) ** 2, 0) / source.length);
    if (!best || rms < best.rms) best = { rms, shift, direction, reflection, transform, source, destination };
  }
  for (const direction of [1, -1]) for (const reflection of [1, -1]) {
    for (let i = 0; i < SAMPLE_COUNT; i++) fit(i / SAMPLE_COUNT, direction, reflection);
  }
  const coarse = best;
  for (let i = -20; i <= 20; i++) fit(coarse.shift + i / (SAMPLE_COUNT * 20), coarse.direction, coarse.reflection);
  return best;
}

export function getVerifiedReplayPitLane(track) {
  if (!track?.centerline?.length) return null;
  const layout = findLayout(track);
  if (!layout) return null;
  const target = track.centerline.map((p) => [p.svgX, p.svgY]);
  if (target.some((p) => p.some((value) => !Number.isFinite(value)))) return null;
  if (target.length < 8 || target.every((point) => distance(point, target[0]) < 1e-6)) return null;
  const fit = registerCircuit(layout.track, target);
  const width = Math.max(...target.map((p) => p[0])) - Math.min(...target.map((p) => p[0]));
  const height = Math.max(...target.map((p) => p[1])) - Math.min(...target.map((p) => p[1]));
  // Never place a verified lane onto an unrelated/old circuit configuration.
  if (!Number.isFinite(fit.rms) || fit.rms > Math.hypot(width, height) * 0.06) return null;
  const mapped = layout.pit.map((point) => {
    const anchor = nearest(fit.source, point);
    const alignedAnchor = fit.transform(anchor.position);
    const onTrack = interpolate(fit.destination, fit.shift + fit.direction * anchor.progress);
    const alignedPoint = fit.transform(point);
    return [alignedPoint[0] + onTrack[0] - alignedAnchor[0], alignedPoint[1] + onTrack[1] - alignedAnchor[1]];
  });
  // Include the merge points in both the SVG and the motion path.
  mapped[0] = nearest(target, mapped[0]).position;
  mapped[mapped.length - 1] = nearest(target, mapped.at(-1)).position;
  const points = mapped.map(([svgX, svgY]) => withWorldCoordinates(track, svgX, svgY));
  const middle = points[Math.floor(points.length / 2)];
  return {
    points,
    visualPathD: points.map((p, i) => `${i ? "L" : "M"}${p.svgX.toFixed(3)} ${p.svgY.toFixed(3)}`).join(" "),
    labelX: middle.svgX, labelY: middle.svgY,
    source: "verified_circuit_geometry",
    metadata: { source: "verified_circuit_geometry", entry: layout.entry, exit: layout.exit, referenceUrl: layout.referenceUrl },
  };
}
