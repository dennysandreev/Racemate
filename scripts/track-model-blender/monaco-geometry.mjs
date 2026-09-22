// The two OSM pit ways terminate on the racing line. Joining those endpoints
// draws a false merge before Sainte Dévote. Keep the mapped working lane and
// reconstruct its missing exit as a separate corridor, as in FIA Document 7.
export function monacoPitExit(main, pit, startOffset, mappedExit) {
  if (!mappedExit || mappedExit.length < 4) throw new Error("Mapped Monaco pit-exit branch is missing");
  const cumulative = [0];
  for (let i = 1; i < main.length; i++) cumulative.push(cumulative.at(-1) + Math.hypot(main[i][0] - main[i - 1][0], main[i][1] - main[i - 1][1]));
  const total = cumulative.at(-1);
  function sample(distance) {
    const d = ((distance + startOffset) % total + total) % total;
    const i = Math.max(1, cumulative.findIndex((value) => value >= d));
    const t = (d - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1]);
    return main[i - 1].map((v, axis) => v + (main[i][axis] - v) * t);
  }
  function project(q) {
    let best = { separation: Infinity };
    for (let i = 1; i < main.length; i++) {
      const a = main[i - 1], b = main[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      if (!length) continue;
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / length ** 2));
      const separation = Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
      if (separation < best.separation) best = { separation, distance: cumulative[i - 1] + t * length - startOffset };
    }
    return best;
  }
  // Last mapped working-lane point still at least 20 m from the start straight.
  const join = pit.findLastIndex((q) => { const p = project(q); return p.distance < 0 && p.distance > -80 && p.separation > 20; });
  if (join < 0) throw new Error('Monaco working-lane exit control point is missing');
  const points = pit.slice(0, join + 1), initial = project(points.at(-1));
  const merge = project(pit.at(-1)).distance;
  const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const straightEnd = 155;
  const count = Math.ceil((straightEnd - initial.distance) / 2);
  for (let i = 1; i <= count; i++) {
    const distance = initial.distance + (straightEnd - initial.distance) * i / count;
    const offset = 7.5 + (initial.separation - 7.5) * (1 - smooth((distance - initial.distance) / -initial.distance));
    const q = sample(distance), a = sample(distance - 3), b = sample(distance + 3), dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    points.push([q[0] + dy / length * offset, q[1] - dx / length * offset]);
  }
  // Keep the mapped curved branch inside Sainte Dévote. A normal offset
  // through its tight main-road apex would fold the inner edge back on itself.
  const a = points.at(-1), previous = points.at(-2), b = mappedExit[2], next = mappedExit[3];
  const handle = (q, r, length) => { const d = Math.hypot(q[0]-r[0], q[1]-r[1]); return q.map((v,k) => v + (q[k]-r[k])/d*length); };
  const c = handle(a, previous, 18), d = handle(b, next, 12);
  for (let i = 1; i <= 24; i++) {
    const t = i/24, u = 1-t;
    points.push(a.map((v,k) => u**3*v + 3*u*u*t*c[k] + 3*u*t*t*d[k] + t**3*b[k]));
  }
  points.push(...mappedExit.slice(3));
  return { points, exitStartMeters: points.slice(1, join + 1).reduce((sum, q, i) => sum + Math.hypot(q[0] - points[i][0], q[1] - points[i][1]), 0),
    separationMeters: 7.5, exitWidthMeters: 4, mergeTrackDistanceMeters: merge,
    method: 'Mapped OSM working lane; reconstructed parallel exit on harbour side, FIA 2026 Document 7; merge after Sainte Devote. Width and separation are estimates.' };
}
