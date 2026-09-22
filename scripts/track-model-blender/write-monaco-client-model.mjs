import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { utm32nFromWgs84 } from "./export-monaco-track-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export async function writeMonacoClientModel({
  configPath = path.join(projectRoot, ".track-model-build/monaco.json"),
  metadataPath = path.join(projectRoot, "public/f1/tracks/3d/monaco-metadata.json"),
  outputPath = path.join(projectRoot, "src/data/monaco-model.ts"),
} = {}) {
  const [config, metadata, asset, preview] = await Promise.all([
    readJson(configPath),
    readJson(metadataPath),
    readFile(path.join(path.dirname(metadataPath), "monaco.glb")),
    readFile(path.join(path.dirname(metadataPath), "monaco-preview.webp")),
  ]);
  const osm = await readJson(path.join(config.sourceDirectory, "openstreetmap-raceway.json"));
  const sourceCenterline = assembleMainCircuit(osm, config.model.mainCircuitWayIds);
  const centerline = rotateClosedLine(sourceCenterline, config.model.sourceStartFinishOffsetMeters);
  const cumulative = cumulativeDistances(centerline);
  const totalLength = cumulative.at(-1);
  const pointCount = 180;
  const points = Array.from({ length: pointCount + 1 }, (_, index) => {
    const distanceAlongTrack = totalLength * index / pointCount;
    const point = index === pointCount
      ? centerline[0]
      : sampleLine(centerline, cumulative, distanceAlongTrack);
    const elevation = sampleElevationProfile(metadata.elevationProfile, distanceAlongTrack);
    return [
      round(index / pointCount, 6),
      round(point[0] - config.model.center.x, 3),
      round(point[1] - config.model.center.y, 3),
      round(elevation * 10, 3),
    ];
  });
  points.at(-1).splice(1, 3, ...points[0].slice(1));

  const pitWay = osm.elements.find((element) =>
    element.type === "way" && element.id === config.model.pitLaneWayId
  );
  if (!pitWay?.geometry?.length) throw new Error(`Monaco pit lane ${config.model.pitLaneWayId} is missing`);
  const pitCenterline = config.model.pitLaneGeometry.points;
  const pitCumulative = cumulativeDistances(pitCenterline);
  const pitLength = pitCumulative.at(-1);
  const pitPointCount = 96;
  const pitLanePoints = Array.from({ length: pitPointCount + 1 }, (_, index) => {
    const point = sampleLine(pitCenterline, pitCumulative, pitLength * index / pitPointCount);
    return [
      round(index / pitPointCount, 6),
      round(point[0] - config.model.center.x, 3),
      round(point[1] - config.model.center.y, 3),
      round(sampleElevationProfile(metadata.pitElevationProfile, pitLength * index / pitPointCount) * 10, 3),
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
  const revision = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  const content = `import type {
  CircuitModelPoint,
  CircuitModelTurn,
  TrackModelDefinition,
} from "@/data/track-model-types";

/**
 * Generated from the Circuit de Monaco Blender digital twin. Do not hand-edit.
 * Geometry: current OSM; terrain/roofs: IGN LiDAR HD, IGN69; official markers: FIA 2026.
 * Run \`pnpm track:3d:build monaco\` to regenerate this controller metadata.
 */

export const MONACO_MODEL = ${JSON.stringify({
    circuitName: "Circuit de Monaco",
    lapLengthKm: 3.337,
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

export const MONACO_TERRAIN = ${JSON.stringify({
    attribution: "© OpenStreetMap · DPUM, Gouvernement Princier de Monaco · IGN LiDAR HD · FIA 2026",
    attributionUrl: "/f1/tracks/3d/monaco-metadata.json",
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

export const MONACO_REPLAY_PATH = ${JSON.stringify({
    baseElevationMeters: metadata.baseElevationMeters,
    pitLanePoints: "__PIT_POINTS__",
    startFinishProgress: 0,
    surfaceOffsetMeters: 0.18,
    trackPoints: "__TRACK_POINTS__",
    trackWidthMeters: config.model.trackWidthMeters,
  }, null, 2)
    .replace('"__PIT_POINTS__"', `${JSON.stringify(pitLanePoints, null, 2)} satisfies readonly CircuitModelPoint[]`)
    .replace('"__TRACK_POINTS__"', `${JSON.stringify(points, null, 2)} satisfies readonly CircuitModelPoint[]`)} as const;

export const MONACO_TRACK_MODEL = ${JSON.stringify({
    aliases: [
      "circuit de monaco",
      "monaco circuit",
      "monte carlo",
      "monaco",
      "монако",
      "monaco grand prix",
      "гран-при монако",
    ],
    camera: { centerY: 0, rotationDeg: 20, scale: 1, tiltDeg: 10, verticalExaggeration: 1 },
    data: "__MODEL__",
    id: "monaco",
    rendering: {
      annotationOffsets: {},
      contourIntervalM: 5,
      curbTurnNumbers: turns.map(({ number }) => number),
      gravelTurnNumbers: [],
      runoffTurnNumbers: [1, 10, 11, 15, 16],
      turnLabelOffsets,
    },
    terrain: "__TERRAIN__",
    webgl: {
      assetPath: `/f1/tracks/3d/monaco.glb?v=${revision(asset)}`,
      camera: { fitHeight: 1_250, fitWidth: 2_300, narrowFitWidth: 1_700, lookAtY: 18, radius: 2_000 },
      elevationDatumLabel: "м",
      previewPath: `/f1/tracks/3d/monaco-preview.webp?v=${revision(preview)}`,
      turnCount: 19,
    },
  }, null, 2)
    .replace('"__MODEL__"', "MONACO_MODEL")
    .replace('"__TERRAIN__"', "MONACO_TERRAIN")} satisfies TrackModelDefinition;
`;
  await writeFile(outputPath, content, "utf8");
  return { outputPath, pointCount: points.length, totalLength };
}

function assembleMainCircuit(osm, wayIds) {
  const ways = new Map(osm.elements.filter((element) => element.type === "way")
    .map((way) => [way.id, way]));
  const points = [];
  for (const wayId of wayIds) {
    const way = ways.get(wayId);
    if (!way?.geometry?.length) throw new Error(`OSM way ${wayId} is missing or has no geometry`);
    let geometry = way.geometry.map(({ lat, lon }) => utm32nFromWgs84(lat, lon));
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
  const blend = (distanceAlongLine - cumulative[lower])
    / Math.max(cumulative[upper] - cumulative[lower], 1e-9);
  return points[lower].map((value, axis) => value * (1 - blend) + points[upper][axis] * blend);
}

function sampleElevationProfile(profile, requestedDistance) {
  const distanceAlongTrack = Math.min(
    Math.max(requestedDistance, 0),
    profile.at(-1).distanceMeters,
  );
  const upper = profile.findIndex(({ distanceMeters }) => distanceMeters >= distanceAlongTrack);
  if (upper <= 0) return profile[0].elevationMeters;
  const lower = upper - 1;
  const first = profile[lower];
  const second = profile[upper];
  const blend = (distanceAlongTrack - first.distanceMeters)
    / Math.max(second.distanceMeters - first.distanceMeters, 1e-9);
  return first.elevationMeters * (1 - blend) + second.elevationMeters * blend;
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
