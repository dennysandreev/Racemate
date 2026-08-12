import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export async function writeSpaClientModel({
  configPath = path.join(projectRoot, ".track-model-build/spa.json"),
  metadataPath = path.join(projectRoot, "public/f1/tracks/3d/spa-metadata.json"),
  outputPath = path.join(projectRoot, "src/data/spa-model.ts"),
} = {}) {
  const preparedDirectory = path.join(projectRoot, ".track-model-build/spa-prepared");
  const [config, metadata, rasterMetadata, dtmBuffer] = await Promise.all([
    readJson(configPath),
    readJson(metadataPath),
    readJson(path.join(preparedDirectory, "raster-metadata.json")),
    readFile(path.join(preparedDirectory, "wallonia-dtm.f32le")),
  ]);
  const osm = await readJson(path.join(config.sourceDirectory, "openstreetmap-raceway.json"));
  const sourceCenterline = assembleMainCircuit(osm, config.model.mainCircuitWayIds);
  const centerline = rotateClosedLine(sourceCenterline, config.model.sourceStartFinishOffsetMeters);
  const cumulative = cumulativeDistances(centerline);
  const totalLength = cumulative.at(-1);
  const dtm = createHeightRasterSampler(
    dtmBuffer,
    rasterMetadata.rasters.dtm,
    config.model.bounds,
  );
  const surfaceCorrection = createCircuitSurfaceCorrection(
    dtm,
    centerline,
    cumulative,
    config.model.trackWidthMeters,
  );
  const pointCount = 180;
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
  const replayTrackPoints = Array.from({ length: pointCount + 1 }, (_, index) => {
    const distance = totalLength * index / pointCount;
    const point = index === pointCount ? centerline[0] : sampleLine(centerline, cumulative, distance);
    const elevation = dtm.sample(point[0], point[1]) + surfaceCorrection(distance);
    return [
      round(index / pointCount, 6),
      round(point[0] - config.model.center.x, 3),
      round(point[1] - config.model.center.y, 3),
      round(elevation * 10, 3),
    ];
  });
  replayTrackPoints.at(-1).splice(1, 3, ...replayTrackPoints[0].slice(1));
  const pitWay = osm.elements.find((element) =>
    element.type === "way" && element.id === config.model.pitLaneWayId
  );
  if (!pitWay?.geometry?.length) {
    throw new Error(`OSM pit-lane way ${config.model.pitLaneWayId} is missing or has no geometry`);
  }
  const pitCenterline = pitWay.geometry.map((point) => lambert2008FromWgs84(point.lat, point.lon));
  const pitCumulative = cumulativeDistances(pitCenterline);
  const pitLength = pitCumulative.at(-1);
  const pitPointCount = 96;
  const pitLanePoints = Array.from({ length: pitPointCount + 1 }, (_, index) => {
    const distance = pitLength * index / pitPointCount;
    const point = sampleLine(pitCenterline, pitCumulative, distance);
    return [
      round(index / pitPointCount, 6),
      round(point[0] - config.model.center.x, 3),
      round(point[1] - config.model.center.y, 3),
      round(dtm.sample(point[0], point[1]) * 10, 3),
    ];
  });
  const elevations = metadata.elevationProfile.map((sample) => sample.elevationDngMeters);
  const slopes = metadata.elevationProfile.slice(1).map((sample, index) => {
    const previous = metadata.elevationProfile[index];
    return (sample.elevationDngMeters - previous.elevationDngMeters)
      / (sample.distanceMeters - previous.distanceMeters) * 100;
  });
  const turns = config.model.turns.map((turn) => ({
    name: turn.name,
    number: turn.number,
    progress: round(turn.distanceMeters / totalLength, 6),
  }));
  const speedTrapDistance = config.model.turns[config.officialControlPoints.speedTrap.turn - 1].distanceMeters
    + config.officialControlPoints.speedTrap.afterTurnMeters;
  const sectorBreaks = config.officialControlPoints.sectorBoundaries
    .map((boundary) => round(boundary.absoluteDistanceMeters / totalLength, 6));
  const turnLabelOffsets = Object.fromEntries(turns.map(({ number }) => [number, [0, 0]]));
  const content = `import type {
  CircuitModelPoint,
  CircuitModelTurn,
  TrackModelDefinition,
} from "@/data/track-model-types";

/**
 * Generated from the Blender digital-twin source set. Do not hand-edit.
 * Geometry: current OSM raceway; heights: SPW DTM/DSM; official markers: FIA 2026 map.
 * Run \`pnpm track:3d:build spa\` to regenerate this controller metadata.
 */

export const SPA_MODEL = ${JSON.stringify({
    circuitName: "Circuit de Spa-Francorchamps",
    lapLengthKm: 7.004,
    elevationChangeM: round(metadata.elevationsDngMeters.high - metadata.elevationsDngMeters.low, 1),
    maxDownhillPercent: round(Math.abs(Math.min(...slopes)), 1),
    maxUphillPercent: round(Math.max(...slopes), 1),
    points: "__POINTS__",
    sectorBreaks,
    speedTrapProgress: round(speedTrapDistance / totalLength, 6),
    turns: "__TURNS__",
  }, null, 2)
    .replace('"__POINTS__"', `${JSON.stringify(points, null, 2)} satisfies readonly CircuitModelPoint[]`)
    .replace('"__TURNS__"', `${JSON.stringify(turns, null, 2)} satisfies readonly CircuitModelTurn[]`)} as const;

export const SPA_TERRAIN = ${JSON.stringify({
    attribution: "SPW DTM/DSM 2021-2022 · CC BY 4.0",
    attributionUrl: "https://geoportail.wallonie.be/catalogue/a004e570-99d6-4fe5-b83d-49b774409278.html",
    bounds: { maxX: 1, maxY: 1, minX: -1, minY: -1 },
    columns: 2,
    elevationMaxM: round(Math.max(...elevations), 3),
    elevationMinM: round(Math.min(...elevations), 3),
    rows: 2,
    values: [
      [round(metadata.elevationsDngMeters.low, 3), round(metadata.elevationsDngMeters.high, 3)],
      [round(metadata.elevationsDngMeters.high, 3), round(metadata.elevationsDngMeters.low, 3)],
    ],
  }, null, 2)} as const;

export const SPA_REPLAY_PATH = ${JSON.stringify({
    baseElevationDngMeters: round(rasterMetadata.rasters.dtm.minimum, 5),
    pitLanePoints: "__PIT_POINTS__",
    startFinishProgress: 0,
    surfaceOffsetMeters: 1,
    trackPoints: "__TRACK_POINTS__",
    trackWidthMeters: config.model.trackWidthMeters,
  }, null, 2)
    .replace('"__PIT_POINTS__"', `${JSON.stringify(pitLanePoints, null, 2)} satisfies readonly CircuitModelPoint[]`)
    .replace('"__TRACK_POINTS__"', `${JSON.stringify(replayTrackPoints, null, 2)} satisfies readonly CircuitModelPoint[]`)} as const;

export const SPA_TRACK_MODEL = ${JSON.stringify({
    aliases: [
      "circuit de spa-francorchamps",
      "circuit de spa francorchamps",
      "spa-francorchamps",
      "spa francorchamps",
      "spa",
      "спа-франкоршам",
      "спа франкоршам",
      "belgian grand prix",
      "гран-при бельгии",
    ],
    camera: { centerY: 0, rotationDeg: 0, scale: 1, tiltDeg: 10, verticalExaggeration: 1 },
    data: "__MODEL__",
    id: "spa",
    rendering: {
      annotationOffsets: {},
      contourIntervalM: 10,
      curbTurnNumbers: turns.map(({ number }) => number),
      gravelTurnNumbers: [1, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19],
      runoffTurnNumbers: turns.map(({ number }) => number),
      turnLabelOffsets,
    },
    terrain: "__TERRAIN__",
    webgl: {
      assetPath: "/f1/tracks/3d/spa.glb",
      camera: { fitHeight: 3_850, fitWidth: 4_350, lookAtY: 28, radius: 6_400 },
      elevationDatumLabel: "м DNG",
      previewPath: "/f1/tracks/3d/spa-preview.webp",
      turnCount: 19,
    },
  }, null, 2)
    .replace('"__MODEL__"', "SPA_MODEL")
    .replace('"__TERRAIN__"', "SPA_TERRAIN")} satisfies TrackModelDefinition;
`;
  await writeFile(outputPath, content, "utf8");
  return { outputPath, pointCount: points.length, totalLength };
}

function assembleMainCircuit(osm, wayIds) {
  const ways = new Map(osm.elements.filter((element) => element.type === "way").map((way) => [way.id, way]));
  const points = [];
  for (const wayId of wayIds) {
    const way = ways.get(wayId);
    if (!way?.geometry?.length) throw new Error(`OSM way ${wayId} is missing or has no geometry`);
    let geometry = way.geometry.map((point) => lambert2008FromWgs84(point.lat, point.lon));
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

function rotateClosedLine(points, requestedOffset) {
  const cumulative = cumulativeDistances(points);
  const total = cumulative.at(-1);
  const offset = ((requestedOffset % total) + total) % total;
  const splitIndex = cumulative.findIndex((value) => value >= offset);
  const splitPoint = sampleLine(points, cumulative, offset);
  const core = distance(points[0], points.at(-1)) < 0.01 ? points.slice(0, -1) : points;
  return [splitPoint, ...core.slice(splitIndex), ...core.slice(0, splitIndex), splitPoint];
}

function lambert2008FromWgs84(lat, lon) {
  const radians = Math.PI / 180;
  const semiMajor = 6_378_137;
  const flattening = 1 / 298.257222101;
  const eccentricity = Math.sqrt(2 * flattening - flattening ** 2);
  const latitudeOrigin = 50.797815 * radians;
  const longitudeOrigin = 4.359215833333333 * radians;
  const latitudeFirst = 49.8333339 * radians;
  const latitudeSecond = 51.16666723333333 * radians;
  const m = (latitude) => Math.cos(latitude) / Math.sqrt(1 - eccentricity ** 2 * Math.sin(latitude) ** 2);
  const t = (latitude) => Math.tan(Math.PI / 4 - latitude / 2)
    / ((1 - eccentricity * Math.sin(latitude)) / (1 + eccentricity * Math.sin(latitude))) ** (eccentricity / 2);
  const cone = (Math.log(m(latitudeFirst)) - Math.log(m(latitudeSecond)))
    / (Math.log(t(latitudeFirst)) - Math.log(t(latitudeSecond)));
  const factor = m(latitudeFirst) / (cone * t(latitudeFirst) ** cone);
  const rho = (latitude) => semiMajor * factor * t(latitude) ** cone;
  const projectedRho = rho(lat * radians);
  const theta = cone * (lon * radians - longitudeOrigin);
  return [
    649_328 + projectedRho * Math.sin(theta),
    665_262 + rho(latitudeOrigin) - projectedRho * Math.cos(theta),
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
  const upper = cumulative.findIndex((value) => value >= distanceAlongLine);
  if (upper <= 0) return points[0];
  const lower = upper - 1;
  const blend = (distanceAlongLine - cumulative[lower]) / Math.max(cumulative[upper] - cumulative[lower], 1e-9);
  return points[lower].map((value, axis) => value * (1 - blend) + points[upper][axis] * blend);
}

function sampleProfile(profile, requestedDistance) {
  const distanceAlongLine = Math.min(Math.max(requestedDistance, 0), profile.at(-1).distanceMeters);
  const upper = profile.findIndex((sample) => sample.distanceMeters >= distanceAlongLine);
  if (upper <= 0) return profile[0].elevationDngMeters;
  const lower = upper - 1;
  const blend = (distanceAlongLine - profile[lower].distanceMeters)
    / Math.max(profile[upper].distanceMeters - profile[lower].distanceMeters, 1e-9);
  return profile[lower].elevationDngMeters * (1 - blend) + profile[upper].elevationDngMeters * blend;
}

function createHeightRasterSampler(buffer, metadata, bounds) {
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  const values = Array.from({ length: width * height }, (_, index) => buffer.readFloatLE(index * 4));
  const fallback = Number(metadata.mean);

  const sample = (x, y) => {
    const fx = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * (width - 1), 0, width - 1);
    const fy = clamp((bounds.maxY - y) / (bounds.maxY - bounds.minY) * (height - 1), 0, height - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const weighted = [
      [values[y0 * width + x0], (1 - tx) * (1 - ty)],
      [values[y0 * width + x1], tx * (1 - ty)],
      [values[y1 * width + x0], (1 - tx) * ty],
      [values[y1 * width + x1], tx * ty],
    ].filter(([value, weight]) => Number.isFinite(value) && weight > 1e-12);

    if (!weighted.length) {
      return fallback;
    }

    const totalWeight = weighted.reduce((sum, [, weight]) => sum + weight, 0);
    return weighted.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
  };

  const sampleRenderedTerrain = (x, y) => {
    const columnPosition = clamp(
      (x - bounds.minX) / (bounds.maxX - bounds.minX) * (width - 1),
      0,
      width - 1,
    );
    const rowPosition = clamp(
      (y - bounds.minY) / (bounds.maxY - bounds.minY) * (height - 1),
      0,
      height - 1,
    );
    const column = Math.min(Math.floor(columnPosition), width - 2);
    const row = Math.min(Math.floor(rowPosition), height - 2);
    const tx = columnPosition - column;
    const ty = rowPosition - row;
    const x0 = bounds.minX + (bounds.maxX - bounds.minX) * column / (width - 1);
    const x1 = bounds.minX + (bounds.maxX - bounds.minX) * (column + 1) / (width - 1);
    const y0 = bounds.minY + (bounds.maxY - bounds.minY) * row / (height - 1);
    const y1 = bounds.minY + (bounds.maxY - bounds.minY) * (row + 1) / (height - 1);
    const a = sample(x0, y0);
    const b = sample(x1, y0);
    const c = sample(x1, y1);
    const d = sample(x0, y1);

    return ty <= tx
      ? a * (1 - tx) + b * (tx - ty) + c * ty
      : a * (1 - ty) + c * tx + d * (ty - tx);
  };

  return { sample, sampleRenderedTerrain };
}

function createCircuitSurfaceCorrection(dtm, centerline, cumulative, trackWidthMeters) {
  const start = 6_170;
  const end = 6_560;
  const count = Math.max(2, Math.ceil((end - start) / 4));
  const distances = Array.from({ length: count + 1 }, (_, index) => start + (end - start) * index / count);
  const rawHeights = distances.map((distanceAlongTrack) => {
    const point = sampleLine(centerline, cumulative, distanceAlongTrack);
    const before = sampleLine(centerline, cumulative, Math.max(0, distanceAlongTrack - 0.5));
    const after = sampleLine(centerline, cumulative, Math.min(cumulative.at(-1), distanceAlongTrack + 0.5));
    const directionLength = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
    const normal = [-(after[1] - before[1]) / directionLength, (after[0] - before[0]) / directionLength];
    const samples = [dtm.sample(point[0], point[1])];

    for (let lateralIndex = -8; lateralIndex <= 8; lateralIndex += 1) {
      const lateral = lateralIndex * trackWidthMeters / 16;
      samples.push(dtm.sampleRenderedTerrain(
        point[0] + normal[0] * lateral,
        point[1] + normal[1] * lateral,
      ));
    }

    return Math.max(...samples);
  });
  const radius = 14;
  const targets = [];
  const corrections = rawHeights.map((rawHeight, index) => {
    let weightedSum = 0;
    let totalWeight = 0;

    for (
      let sampleIndex = Math.max(0, index - radius);
      sampleIndex < Math.min(rawHeights.length, index + radius + 1);
      sampleIndex += 1
    ) {
      const weight = radius + 1 - Math.abs(sampleIndex - index);
      weightedSum += rawHeights[sampleIndex] * weight;
      totalWeight += weight;
    }

    let target = clamp(weightedSum / totalWeight, rawHeight, rawHeight + 3.5);
    if (targets.length) {
      target = Math.max(target, targets.at(-1) - 0.04);
    }
    targets.push(target);
    let edgeBlend = clamp(Math.min((distances[index] - start) / 42, (end - distances[index]) / 42), 0, 1);
    edgeBlend = edgeBlend * edgeBlend * (3 - 2 * edgeBlend);
    return (target - rawHeight) * edgeBlend;
  });

  return (distanceAlongTrack) => {
    if (distanceAlongTrack < start || distanceAlongTrack > end) {
      return 0;
    }
    const index = Math.round((distanceAlongTrack - start) / (end - start) * count);
    return corrections[clamp(index, 0, corrections.length - 1)];
  };
}

function distance(first, second) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
