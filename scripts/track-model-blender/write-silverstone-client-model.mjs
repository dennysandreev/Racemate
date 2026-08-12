import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { utm30nFromWgs84 } from "./export-silverstone-track-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export async function writeSilverstoneClientModel({
  configPath = path.join(projectRoot, ".track-model-build/silverstone.json"),
  metadataPath = path.join(projectRoot, "public/f1/tracks/3d/silverstone-metadata.json"),
  outputPath = path.join(projectRoot, "src/data/silverstone-model.ts"),
} = {}) {
  const preparedDirectory = path.join(projectRoot, ".track-model-build/silverstone-prepared");
  const [config, metadata, rasterMetadata, dtmBuffer] = await Promise.all([
    readJson(configPath),
    readJson(metadataPath),
    readJson(path.join(preparedDirectory, "raster-metadata.json")),
    readFile(path.join(preparedDirectory, "silverstone-dtm.f32le")),
  ]);
  const osm = await readJson(path.join(config.sourceDirectory, "openstreetmap-raceway.json"));
  const sourceCenterline = assembleMainCircuit(osm, config.model.mainCircuitWayIds);
  const centerline = rotateClosedLine(sourceCenterline, config.model.sourceStartFinishOffsetMeters);
  const cumulative = cumulativeDistances(centerline);
  const totalLength = cumulative.at(-1);
  const dtm = createHeightRasterSampler(dtmBuffer, rasterMetadata.rasters.dtm, config.model.bounds);
  const pointCount = 220;
  const points = Array.from({ length: pointCount + 1 }, (_, index) => {
    const distanceAlongTrack = totalLength * index / pointCount;
    const point = index === pointCount
      ? centerline[0]
      : sampleLine(centerline, cumulative, distanceAlongTrack);
    return [
      round(index / pointCount, 6),
      round(point[0] - config.model.center.x, 3),
      round(point[1] - config.model.center.y, 3),
      round(dtm.sample(point[0], point[1]) * 10, 3),
    ];
  });
  points.at(-1).splice(1, 3, ...points[0].slice(1));
  const pitWay = osm.elements.find((element) =>
    element.type === "way" && element.id === config.model.pitLaneWayId
  );
  if (!pitWay?.geometry?.length) {
    throw new Error(`OSM pit-lane way ${config.model.pitLaneWayId} is missing or has no geometry`);
  }
  const pitCenterline = pitWay.geometry.map(({ lat, lon }) => utm30nFromWgs84(lat, lon));
  const pitCumulative = cumulativeDistances(pitCenterline);
  const pitLength = pitCumulative.at(-1);
  const pitPointCount = 112;
  const pitLanePoints = Array.from({ length: pitPointCount + 1 }, (_, index) => {
    const distanceAlongPit = pitLength * index / pitPointCount;
    const point = sampleLine(pitCenterline, pitCumulative, distanceAlongPit);
    return [
      round(index / pitPointCount, 6),
      round(point[0] - config.model.center.x, 3),
      round(point[1] - config.model.center.y, 3),
      round(dtm.sample(point[0], point[1]) * 10, 3),
    ];
  });
  const elevations = metadata.elevationProfile.map((sample) => sample.elevationMeters);
  const slopes = metadata.elevationProfile.slice(1).map((sample, index) => {
    const previous = metadata.elevationProfile[index];
    return (sample.elevationMeters - previous.elevationMeters)
      / (sample.distanceMeters - previous.distanceMeters) * 100;
  });
  const turns = config.model.turns.map((turn) => ({
    name: turn.name,
    number: turn.number,
    progress: round(turn.distanceMeters / totalLength, 6),
  }));
  const speedTrap = config.officialControlPoints.speedTrap;
  const speedTrapDistance = config.model.turns[speedTrap.turn - 1].distanceMeters
    - speedTrap.beforeTurnMeters;
  const sectorBreaks = config.officialControlPoints.sectorBoundaries
    .map((boundary) => round(boundary.absoluteDistanceMeters / totalLength, 6));
  const turnLabelOffsets = Object.fromEntries(turns.map(({ number }) => [number, [0, 0]]));
  const content = `import type {
  CircuitModelPoint,
  CircuitModelTurn,
  TrackModelDefinition,
} from "@/data/track-model-types";

/**
 * Generated from the Silverstone Blender digital twin. Do not hand-edit.
 * Geometry: current OSM; elevation: Environment Agency LIDAR DTM 1 m;
 * official markers and pit layout: FIA British Grand Prix 2026 document 6.
 * Run \`pnpm track:3d:build silverstone\` to regenerate this controller metadata.
 */

export const SILVERSTONE_MODEL = ${JSON.stringify({
    circuitName: "Silverstone Circuit",
    lapLengthKm: 5.891,
    elevationChangeM: round(metadata.elevationsMeters.high - metadata.elevationsMeters.low, 1),
    maxDownhillPercent: round(Math.abs(Math.min(...slopes)), 1),
    maxUphillPercent: round(Math.max(...slopes), 1),
    points: "__POINTS__",
    sectorBreaks,
    speedTrapProgress: round(speedTrapDistance / totalLength, 6),
    turns: "__TURNS__",
  }, null, 2)
    .replace('"__POINTS__"', `${JSON.stringify(points, null, 2)} satisfies readonly CircuitModelPoint[]`)
    .replace('"__TURNS__"', `${JSON.stringify(turns, null, 2)} satisfies readonly CircuitModelTurn[]`)} as const;

export const SILVERSTONE_TERRAIN = ${JSON.stringify({
    attribution: "Environment Agency LIDAR Composite DTM 1 m · OGL v3.0",
    attributionUrl: "https://ckan.publishing.service.gov.uk/dataset/lidar-composite-digital-terrain-model-dtm-1m",
    bounds: { maxX: 1, maxY: 1, minX: -1, minY: -1 },
    columns: 2,
    elevationMaxM: round(Math.max(...elevations), 3),
    elevationMinM: round(Math.min(...elevations), 3),
    rows: 2,
    values: [
      [round(metadata.elevationsMeters.low, 3), round(metadata.elevationsMeters.high, 3)],
      [round(metadata.elevationsMeters.high, 3), round(metadata.elevationsMeters.low, 3)],
    ],
  }, null, 2)} as const;

export const SILVERSTONE_REPLAY_PATH = ${JSON.stringify({
    baseElevationMeters: round(rasterMetadata.rasters.dtm.minimum, 5),
    pitLanePoints: "__PIT_POINTS__",
    startFinishProgress: 0,
    surfaceOffsetMeters: 1,
    trackPoints: "__TRACK_POINTS__",
    trackWidthMeters: config.model.trackWidthMeters,
  }, null, 2)
    .replace('"__PIT_POINTS__"', `${JSON.stringify(pitLanePoints, null, 2)} satisfies readonly CircuitModelPoint[]`)
    .replace('"__TRACK_POINTS__"', `${JSON.stringify(points, null, 2)} satisfies readonly CircuitModelPoint[]`)} as const;

export const SILVERSTONE_TRACK_MODEL = ${JSON.stringify({
    aliases: [
      "silverstone",
      "сильверстоун",
      "silverstone circuit",
      "british grand prix",
      "гран-при великобритании",
      "great britain",
      "великобритания",
    ],
    camera: { centerY: 0, rotationDeg: 0, scale: 1, tiltDeg: 10, verticalExaggeration: 1 },
    data: "__MODEL__",
    id: "silverstone",
    rendering: {
      annotationOffsets: {},
      contourIntervalM: 5,
      curbTurnNumbers: turns.map(({ number }) => number),
      gravelTurnNumbers: [...GRAVEL_TURNS],
      runoffTurnNumbers: turns.map(({ number }) => number),
      turnLabelOffsets,
    },
    terrain: "__TERRAIN__",
    webgl: {
      assetPath: "/f1/tracks/3d/silverstone.glb",
      camera: { fitHeight: 3_150, fitWidth: 2_650, lookAtY: 18, radius: 4_450 },
      elevationDatumLabel: "м ODN",
      previewPath: "/f1/tracks/3d/silverstone-preview.webp",
      turnCount: 18,
    },
  }, null, 2)
    .replace('"__MODEL__"', "SILVERSTONE_MODEL")
    .replace('"__TERRAIN__"', "SILVERSTONE_TERRAIN")} satisfies TrackModelDefinition;
`;
  await writeFile(outputPath, content, "utf8");
  return { outputPath, pointCount: points.length, totalLength };
}

const GRAVEL_TURNS = [1, 3, 4, 6, 7, 9, 15, 16, 17];

function assembleMainCircuit(osm, wayIds) {
  const ways = new Map(osm.elements.filter((element) => element.type === "way")
    .map((way) => [way.id, way]));
  const points = [];
  for (const wayId of wayIds) {
    const way = ways.get(wayId);
    if (!way?.geometry?.length) throw new Error(`OSM way ${wayId} is missing or has no geometry`);
    let geometry = way.geometry.map(({ lat, lon }) => utm30nFromWgs84(lat, lon));
    if (points.length > 0) {
      if (distance(points.at(-1), geometry.at(-1)) < distance(points.at(-1), geometry[0])) {
        geometry = geometry.reverse();
      }
      if (distance(points.at(-1), geometry[0]) < 0.05) geometry = geometry.slice(1);
    }
    points.push(...geometry);
  }
  if (distance(points[0], points.at(-1)) > 0.05) points.push(points[0]);
  return points;
}

function rotateClosedLine(points, requestedOffset) {
  const cumulative = cumulativeDistances(points);
  const total = cumulative.at(-1);
  const offset = ((requestedOffset % total) + total) % total;
  const splitIndex = cumulative.findIndex((value) => value >= offset);
  const splitPoint = sampleLine(points, cumulative, offset);
  const core = distance(points[0], points.at(-1)) < 0.05 ? points.slice(0, -1) : points;
  return [splitPoint, ...core.slice(splitIndex), ...core.slice(0, splitIndex), splitPoint];
}

function cumulativeDistances(points) {
  const values = [0];
  for (let index = 1; index < points.length; index += 1) {
    values.push(values.at(-1) + distance(points[index - 1], points[index]));
  }
  return values;
}

function sampleLine(points, cumulative, requestedDistance) {
  const distanceAlongLine = clamp(requestedDistance, 0, cumulative.at(-1));
  let index = 1;
  while (index < cumulative.length - 1 && cumulative[index] < distanceAlongLine) index += 1;
  const span = Math.max(cumulative[index] - cumulative[index - 1], 1e-9);
  const blend = (distanceAlongLine - cumulative[index - 1]) / span;
  return [
    points[index - 1][0] + (points[index][0] - points[index - 1][0]) * blend,
    points[index - 1][1] + (points[index][1] - points[index - 1][1]) * blend,
  ];
}

function createHeightRasterSampler(buffer, metadata, bounds) {
  const values = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  return {
    sample(x, y) {
      const column = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * (metadata.width - 1), 0, metadata.width - 1);
      const row = clamp((bounds.maxY - y) / (bounds.maxY - bounds.minY) * (metadata.height - 1), 0, metadata.height - 1);
      const x0 = Math.floor(column);
      const y0 = Math.floor(row);
      const x1 = Math.min(x0 + 1, metadata.width - 1);
      const y1 = Math.min(y0 + 1, metadata.height - 1);
      const tx = column - x0;
      const ty = row - y0;
      const top = values[y0 * metadata.width + x0] * (1 - tx) + values[y0 * metadata.width + x1] * tx;
      const bottom = values[y1 * metadata.width + x0] * (1 - tx) + values[y1 * metadata.width + x1] * tx;
      return top * (1 - ty) + bottom * ty;
    },
  };
}

function distance(first, second) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function round(value, digits = 3) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
