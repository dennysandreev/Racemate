import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export async function writeZandvoortClientModel({
  configPath = path.join(projectRoot, ".track-model-build/zandvoort.json"),
  metadataPath = path.join(projectRoot, "public/f1/tracks/3d/zandvoort-metadata.json"),
  outputPath = path.join(projectRoot, "src/data/zandvoort-model.ts"),
  rasterMetadataPath = path.join(projectRoot, ".track-model-build/zandvoort-prepared/raster-metadata.json"),
} = {}) {
  const [config, metadata, rasterMetadata] = await Promise.all([
    readJson(configPath),
    readJson(metadataPath),
    readJson(rasterMetadataPath),
  ]);
  const osm = await readJson(path.join(config.sourceDirectory, "openstreetmap-raceway.json"));
  const centerline = assembleMainCircuit(osm, config.model.mainCircuitWayIds);
  const cumulative = cumulativeDistances(centerline);
  const totalLength = cumulative.at(-1);
  const pointCount = 144;
  const points = Array.from({ length: pointCount + 1 }, (_, index) => {
    const distance = totalLength * index / pointCount;
    const point = index === pointCount ? centerline[0] : sampleLine(centerline, cumulative, distance);
    const elevation = sampleProfile(metadata.elevationProfile, distance);
    return [
      round(index / pointCount, 6),
      round(point[0] - config.model.center.x, 3),
      round(point[1] - config.model.center.y, 3),
      round(elevation * 10, 3),
    ];
  });
  points.at(-1).splice(1, 3, ...points[0].slice(1));
  const elevations = metadata.elevationProfile.map((sample) => sample.elevationNapMeters);
  const slopes = metadata.elevationProfile.slice(1).map((sample, index) => {
    const previous = metadata.elevationProfile[index];
    return (sample.elevationNapMeters - previous.elevationNapMeters)
      / (sample.distanceMeters - previous.distanceMeters) * 100;
  });
  const turns = config.model.turns.map((turn) => ({
    name: turn.name,
    number: turn.number,
    progress: round(turn.distanceMeters / totalLength, 6),
  }));
  const speedTrapDistance = turnsDistance(config, "speedTrap");
  const sectorBreaks = config.officialControlPoints.sectorBoundaries.map((boundary) => {
    const turn = config.model.turns[boundary.turn - 1];
    return round((turn.distanceMeters - boundary.beforeTurnMeters) / totalLength, 6);
  });
  const turnLabelOffsets = Object.fromEntries(turns.map(({ number }) => [number, [0, 0]]));
  const pitLane = getWayPoints(osm, config.model.pitLaneWayId);
  const pitCumulative = cumulativeDistances(pitLane);
  const pitLength = pitCumulative.at(-1);
  const pitPointCount = 96;
  const pitLanePoints = Array.from({ length: pitPointCount + 1 }, (_, index) => {
    const distanceAlongPit = pitLength * index / pitPointCount;
    const point = sampleLine(pitLane, pitCumulative, distanceAlongPit);
    const nearestTrackDistance = nearestDistanceAlongLine(point, centerline, cumulative);
    const elevation = sampleProfile(metadata.elevationProfile, nearestTrackDistance);

    return [
      round(index / pitPointCount, 6),
      round(point[0] - config.model.center.x, 3),
      round(point[1] - config.model.center.y, 3),
      round(elevation * 10, 3),
    ];
  });
  const content = `import type {\n  CircuitModelPoint,\n  CircuitModelTurn,\n  TrackModelDefinition,\n} from "@/data/track-model-types";\n\n/**\n * Generated from the Blender digital-twin source set. Do not hand-edit.\n * Geometry: OSM raceway ways; heights: AHN4 DTM; official markers: FIA 2025 map.\n * Run \`pnpm track:3d:build zandvoort\` to regenerate this controller metadata.\n */\n\nexport type ZandvoortReplayPathPoint = CircuitModelPoint;\n\nexport const ZANDVOORT_MODEL = ${JSON.stringify({
    circuitName: "Circuit Zandvoort",
    lapLengthKm: 4.259,
    elevationChangeM: round(metadata.elevationsNapMeters.high - metadata.elevationsNapMeters.low, 1),
    maxDownhillPercent: round(Math.abs(Math.min(...slopes)), 1),
    maxUphillPercent: round(Math.max(...slopes), 1),
    points: "__POINTS__",
    sectorBreaks,
    speedTrapProgress: round(speedTrapDistance / totalLength, 6),
    turns: "__TURNS__",
  }, null, 2)
    .replace('"__POINTS__"', `${JSON.stringify(points, null, 2)} satisfies readonly CircuitModelPoint[]`)
    .replace('"__TURNS__"', `${JSON.stringify(turns, null, 2)} satisfies readonly CircuitModelTurn[]`)} as const;\n\nexport const ZANDVOORT_REPLAY_PATH = ${JSON.stringify({
    baseElevationNapMeters: round(rasterMetadata.rasters.dtm.minimum, 6),
    pitLanePoints: "__PIT_LANE_POINTS__",
    startFinishProgress: round(metadata.finishDistanceMeters / totalLength, 8),
    surfaceOffsetMeters: 0.55,
    trackWidthMeters: config.model.trackWidthMeters,
  }, null, 2)
    .replace('"__PIT_LANE_POINTS__"', `${JSON.stringify(pitLanePoints, null, 2)} satisfies readonly CircuitModelPoint[]`)} as const;\n\nexport const ZANDVOORT_TERRAIN = ${JSON.stringify({
    attribution: "AHN4 1 m · PDOK",
    attributionUrl: "https://www.pdok.nl/introductie/-/article/actueel-hoogtebestand-nederland-ahn4-",
    bounds: { maxX: 1, maxY: 1, minX: -1, minY: -1 },
    columns: 2,
    elevationMaxM: round(Math.max(...elevations), 3),
    elevationMinM: round(Math.min(...elevations), 3),
    rows: 2,
    values: [[round(metadata.elevationsNapMeters.low, 3), round(metadata.elevationsNapMeters.high, 3)], [round(metadata.elevationsNapMeters.high, 3), round(metadata.elevationsNapMeters.low, 3)]],
  }, null, 2)} as const;\n\nexport const ZANDVOORT_TRACK_MODEL = ${JSON.stringify({
    aliases: ["circuit zandvoort", "zandvoort", "зандворт", "dutch grand prix", "гран-при нидерландов", "netherlands", "нидерланды"],
    camera: { centerY: 0, rotationDeg: 0, scale: 1, tiltDeg: 10, verticalExaggeration: 1 },
    data: "__MODEL__",
    id: "zandvoort",
    rendering: {
      annotationOffsets: {},
      banking: [
        { angleDeg: -18, from: round(1135 / totalLength, 6), to: round(1290 / totalLength, 6) },
        { angleDeg: 18, from: round(3970 / totalLength, 6), to: 1 },
      ],
      contourIntervalM: 2,
      curbTurnNumbers: turns.map(({ number }) => number),
      gravelTurnNumbers: [1, 7, 8, 11, 12],
      runoffTurnNumbers: [1, 3, 7, 8, 11, 12, 14],
      turnLabelOffsets,
    },
    terrain: "__TERRAIN__",
  }, null, 2)
    .replace('"__MODEL__"', "ZANDVOORT_MODEL")
    .replace('"__TERRAIN__"', "ZANDVOORT_TERRAIN")} satisfies TrackModelDefinition;\n`;
  await writeFile(outputPath, content, "utf8");
  return { outputPath, pointCount: points.length, totalLength };
}

function turnsDistance(config, marker) {
  const value = config.officialControlPoints[marker];
  return config.model.turns[value.turn - 1].distanceMeters - value.beforeTurnMeters;
}

function assembleMainCircuit(osm, wayIds) {
  const ways = new Map(osm.elements.filter((element) => element.type === "way").map((way) => [way.id, way]));
  const points = [];
  for (const wayId of wayIds) {
    let geometry = ways.get(wayId).geometry.map((point) => rdFromWgs84(point.lat, point.lon));
    if (points.length > 0) {
      const direct = distance(points.at(-1), geometry[0]);
      const reverse = distance(points.at(-1), geometry.at(-1));
      if (reverse < direct) geometry = geometry.reverse();
      if (distance(points.at(-1), geometry[0]) < 0.01) geometry = geometry.slice(1);
    }
    points.push(...geometry);
  }
  if (distance(points[0], points.at(-1)) > 0.01) points.push(points[0]);
  return points;
}

function getWayPoints(osm, wayId) {
  const way = osm.elements.find((element) => element.type === "way" && element.id === wayId);

  if (!way?.geometry?.length) {
    throw new Error(`OSM way ${wayId} is missing or has no geometry`);
  }

  return way.geometry.map((point) => rdFromWgs84(point.lat, point.lon));
}

function rdFromWgs84(lat, lon) {
  const p = (lat - 52.1551744) * 0.36;
  const q = (lon - 5.38720621) * 0.36;
  return [
    155000 + 190094.945 * q - 11832.228 * p * q - 114.221 * p * p * q - 32.391 * q ** 3 - 0.705 * p + 0.608 * p * q * q + 0.157 * p ** 3 * q,
    463000 + 309056.544 * p + 3638.893 * q * q + 73.077 * p * p - 157.984 * p * q * q + 59.788 * p ** 3 + 0.433 * q - 6.439 * p * p * q * q - 0.032 * p * q + 0.092 * q ** 4 - 0.054 * p ** 4,
  ];
}

function cumulativeDistances(points) {
  const result = [0];
  for (let index = 1; index < points.length; index += 1) {
    result.push(result.at(-1) + distance(points[index - 1], points[index]));
  }
  return result;
}

function sampleLine(points, cumulative, requestedDistance) {
  const distanceAlongLine = Math.min(Math.max(requestedDistance, 0), cumulative.at(-1));
  let upper = cumulative.findIndex((value) => value >= distanceAlongLine);
  if (upper <= 0) return points[0];
  const lower = upper - 1;
  const blend = (distanceAlongLine - cumulative[lower]) / Math.max(cumulative[upper] - cumulative[lower], 1e-9);
  return points[lower].map((value, axis) => value * (1 - blend) + points[upper][axis] * blend);
}

function nearestDistanceAlongLine(point, points, cumulative) {
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestDistanceAlongLine = 0;

  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1];
    const second = points[index];
    const segmentX = second[0] - first[0];
    const segmentY = second[1] - first[1];
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const projection = segmentLengthSquared > 0
      ? Math.max(0, Math.min(1, ((point[0] - first[0]) * segmentX + (point[1] - first[1]) * segmentY) / segmentLengthSquared))
      : 0;
    const projectedX = first[0] + segmentX * projection;
    const projectedY = first[1] + segmentY * projection;
    const distanceSquared = (point[0] - projectedX) ** 2 + (point[1] - projectedY) ** 2;

    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestDistanceAlongLine = cumulative[index - 1] + Math.sqrt(segmentLengthSquared) * projection;
    }
  }

  return bestDistanceAlongLine;
}

function sampleProfile(profile, distanceMeters) {
  const upper = profile.findIndex((sample) => sample.distanceMeters >= distanceMeters);
  if (upper <= 0) return profile[0].elevationNapMeters;
  if (upper === -1) return profile.at(-1).elevationNapMeters;
  const first = profile[upper - 1];
  const second = profile[upper];
  const blend = (distanceMeters - first.distanceMeters) / (second.distanceMeters - first.distanceMeters);
  return first.elevationNapMeters * (1 - blend) + second.elevationNapMeters * blend;
}

function distance(first, second) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(await writeZandvoortClientModel());
}
