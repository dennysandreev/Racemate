import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

const config = JSON.parse(
  await readFile(path.join(projectRoot, ".track-model-build/zandvoort.json"), "utf8"),
);
const osm = JSON.parse(
  await readFile(
    path.join(projectRoot, ".track-model-build/zandvoort-source/openstreetmap-raceway.json"),
    "utf8",
  ),
);
const centreline = assembleMainCircuit(osm, config.model.mainCircuitWayIds);
const cumulative = lineDistance(centreline);
const total = cumulative.at(-1);
const trackSamples = Array.from({ length: Math.ceil(total / 1.5) }, (_, index) =>
  samplePolyline(centreline, cumulative, (total * index) / Math.ceil(total / 1.5)),
);
const blocks = createLegacyGrandstandBlocks(config.grandstands, centreline, cumulative);
const pitWay = osm.elements.find((element) => element.id === config.model.pitLaneWayId);
const pitLane = pitWay.geometry.map((point) => rdFromWgs84(point.lat, point.lon));
const pitCumulative = lineDistance(pitLane);
const pitMidpoint = samplePolyline(pitLane, pitCumulative, pitCumulative.at(-1) / 2);
const pitTangent = sampleTangent(pitLane, pitCumulative, pitCumulative.at(-1) / 2);
const nearestMainPoint = trackSamples.reduce((nearest, point) =>
  Math.hypot(point[0] - pitMidpoint[0], point[1] - pitMidpoint[1]) <
  Math.hypot(nearest[0] - pitMidpoint[0], nearest[1] - pitMidpoint[1]) ? point : nearest,
);
const mainSideOfPit = Math.sign(
  (nearestMainPoint[0] - pitMidpoint[0]) * -pitTangent[1] +
  (nearestMainPoint[1] - pitMidpoint[1]) * pitTangent[0],
);
const trackHalfWidth = config.model.trackWidthMeters / 2;
const minimumClearance = 2.5;
const trackConflicts = [];
const blockConflicts = [];

for (const block of blocks) {
  const clearance = Math.min(
    ...trackSamples.map((point) => distanceToOrientedRectangle(point, block)),
  ) - trackHalfWidth;

  if (clearance < minimumClearance) {
    trackConflicts.push({
      block: block.index,
      clearanceMeters: round(clearance),
      stand: block.name,
    });
  }
}

for (let first = 0; first < blocks.length; first += 1) {
  for (let second = first + 1; second < blocks.length; second += 1) {
    if (orientedRectanglesOverlap(blocks[first], blocks[second], 0.35)) {
      blockConflicts.push({
        first: `${blocks[first].name}#${blocks[first].index}`,
        second: `${blocks[second].name}#${blocks[second].index}`,
      });
    }
  }
}

console.log(JSON.stringify({
  blockConflicts,
  blocks: blocks.length,
  minimumRequiredTrackClearanceMeters: minimumClearance,
  pitLane: {
    endGapToCircuitMeters: round(distanceToPolyline(pitLane.at(-1), centreline)),
    garageSide: mainSideOfPit > 0 ? "right" : "left",
    lengthMeters: round(pitCumulative.at(-1)),
    points: pitLane.length,
    startGapToCircuitMeters: round(distanceToPolyline(pitLane[0], centreline)),
  },
  trackConflicts,
}, null, 2));

function createLegacyGrandstandBlocks(grandstands, points, distances) {
  const blocks = [];

  for (const stand of grandstands) {
    let distance = stand.start;
    let index = 0;
    const side = stand.side === "left" ? 1 : -1;

    while (distance < stand.end) {
      const nextDistance = Math.min(distance + 24, stand.end);
      const midpoint = (distance + nextDistance) / 2;
      const point = samplePolyline(points, distances, midpoint);
      const tangent = sampleTangent(points, distances, midpoint);
      const normal = [-tangent[1] * side, tangent[0] * side];
      const offset = stand.offset + stand.depth / 2;

      blocks.push({
        centre: [point[0] + normal[0] * offset, point[1] + normal[1] * offset],
        depth: stand.depth,
        index,
        length: Math.max(nextDistance - distance - 0.8, 3),
        name: stand.name,
        rotation: Math.atan2(tangent[1], tangent[0]),
      });
      index += 1;
      distance = nextDistance;
    }
  }

  return blocks;
}

function orientedRectanglesOverlap(first, second, inset) {
  const axes = [...rectangleAxes(first), ...rectangleAxes(second)];
  const firstCorners = rectangleCorners(first, inset);
  const secondCorners = rectangleCorners(second, inset);

  return axes.every((axis) => {
    const firstProjection = project(firstCorners, axis);
    const secondProjection = project(secondCorners, axis);
    return firstProjection.maximum > secondProjection.minimum &&
      secondProjection.maximum > firstProjection.minimum;
  });
}

function distanceToOrientedRectangle(point, rectangle) {
  const cosine = Math.cos(rectangle.rotation);
  const sine = Math.sin(rectangle.rotation);
  const dx = point[0] - rectangle.centre[0];
  const dy = point[1] - rectangle.centre[1];
  const localX = dx * cosine + dy * sine;
  const localY = -dx * sine + dy * cosine;
  const outsideX = Math.max(Math.abs(localX) - rectangle.length / 2, 0);
  const outsideY = Math.max(Math.abs(localY) - rectangle.depth / 2, 0);
  return Math.hypot(outsideX, outsideY);
}

function distanceToPolyline(point, polyline) {
  let result = Number.POSITIVE_INFINITY;

  for (let index = 1; index < polyline.length; index += 1) {
    result = Math.min(result, distanceToSegment(point, polyline[index - 1], polyline[index]));
  }

  return result;
}

function distanceToSegment(point, first, second) {
  const dx = second[0] - first[0];
  const dy = second[1] - first[1];
  const lengthSquared = dx * dx + dy * dy;
  const blend = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point[0] - first[0]) * dx + (point[1] - first[1]) * dy) / lengthSquared));
  return Math.hypot(
    point[0] - (first[0] + dx * blend),
    point[1] - (first[1] + dy * blend),
  );
}

function rectangleAxes(rectangle) {
  const cosine = Math.cos(rectangle.rotation);
  const sine = Math.sin(rectangle.rotation);
  return [[cosine, sine], [-sine, cosine]];
}

function rectangleCorners(rectangle, inset = 0) {
  const halfLength = Math.max(rectangle.length / 2 - inset, 0);
  const halfDepth = Math.max(rectangle.depth / 2 - inset, 0);
  const cosine = Math.cos(rectangle.rotation);
  const sine = Math.sin(rectangle.rotation);

  return [
    [-halfLength, -halfDepth],
    [halfLength, -halfDepth],
    [halfLength, halfDepth],
    [-halfLength, halfDepth],
  ].map(([x, y]) => [
    rectangle.centre[0] + x * cosine - y * sine,
    rectangle.centre[1] + x * sine + y * cosine,
  ]);
}

function project(points, axis) {
  const values = points.map((point) => point[0] * axis[0] + point[1] * axis[1]);
  return { maximum: Math.max(...values), minimum: Math.min(...values) };
}

function assembleMainCircuit(data, wayIds) {
  const ways = new Map(data.elements.filter((element) => element.type === "way").map((way) => [way.id, way]));
  const points = [];

  for (const wayId of wayIds) {
    const geometry = [...ways.get(wayId).geometry];

    if (points.length > 0) {
      const direct = geographicDistance(points.at(-1), geometry[0]);
      const reverse = geographicDistance(points.at(-1), geometry.at(-1));

      if (reverse < direct) {
        geometry.reverse();
      }

      if (geographicDistance(points.at(-1), geometry[0]) < 1e-8) {
        geometry.shift();
      }
    }

    points.push(...geometry);
  }

  if (geographicDistance(points[0], points.at(-1)) > 1e-7) {
    points.push(points[0]);
  }

  return points.map((point) => rdFromWgs84(point.lat, point.lon));
}

function geographicDistance(first, second) {
  return Math.hypot(first.lat - second.lat, first.lon - second.lon);
}

function rdFromWgs84(latitude, longitude) {
  const p = (latitude - 52.1551744) * 0.36;
  const q = (longitude - 5.38720621) * 0.36;
  return [
    155000 + 190094.945 * q - 11832.228 * p * q - 114.221 * p * p * q - 32.391 * q ** 3 - 0.705 * p + 0.608 * p * q * q + 0.157 * p ** 3 * q,
    463000 + 309056.544 * p + 3638.893 * q * q + 73.077 * p * p - 157.984 * p * q * q + 59.788 * p ** 3 + 0.433 * q - 6.439 * p * p * q * q - 0.032 * p * q + 0.092 * q ** 4 - 0.054 * p ** 4,
  ];
}

function lineDistance(points) {
  const cumulative = [0];

  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative.at(-1) + Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    ));
  }

  return cumulative;
}

function samplePolyline(points, cumulative, distance) {
  const total = cumulative.at(-1);
  const target = ((distance % total) + total) % total;
  let low = 0;
  let high = cumulative.length - 1;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulative[middle] <= target) low = middle;
    else high = middle;
  }

  const segmentLength = Math.max(cumulative[low + 1] - cumulative[low], 1e-9);
  const blend = (target - cumulative[low]) / segmentLength;
  return [
    points[low][0] * (1 - blend) + points[low + 1][0] * blend,
    points[low][1] * (1 - blend) + points[low + 1][1] * blend,
  ];
}

function sampleTangent(points, cumulative, distance) {
  const before = samplePolyline(points, cumulative, distance - 3);
  const after = samplePolyline(points, cumulative, distance + 3);
  const dx = after[0] - before[0];
  const dy = after[1] - before[1];
  const length = Math.max(Math.hypot(dx, dy), 1e-9);
  return [dx / length, dy / length];
}

function round(value) {
  return Math.round(value * 100) / 100;
}
