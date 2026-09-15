import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assembleCatalunyaCurrentCircuit,
  assemblePitLane,
  cumulativeDistances,
  rotateClosedLine,
  sampleLine,
  smoothClosedLine,
} from "./export-catalunya-track-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export async function writeCatalunyaClientModel({
  configPath = path.join(projectRoot, ".track-model-build/catalunya.json"),
  metadataPath = path.join(projectRoot, "public/f1/tracks/3d/catalunya-metadata.json"),
  outputPath = path.join(projectRoot, "src/data/catalunya-model.ts"),
} = {}) {
  const preparedDirectory = path.join(projectRoot, ".track-model-build/catalunya-prepared");
  const [config, metadata, rasterMetadata, dtmBuffer] = await Promise.all([
    readJson(configPath),
    readJson(metadataPath),
    readJson(path.join(preparedDirectory, "raster-metadata.json")),
    readFile(path.join(preparedDirectory, "catalunya-dtm.f32le")),
  ]);
  const osm = await readJson(path.join(config.sourceDirectory, "openstreetmap-raceway.json"));
  const sourceCenterline = smoothClosedLine(assembleCatalunyaCurrentCircuit(osm));
  const centerline = rotateClosedLine(sourceCenterline, config.model.sourceStartFinishOffsetMeters);
  const cumulative = cumulativeDistances(centerline);
  const totalLength = cumulative.at(-1);
  const dtm = createHeightRasterSampler(dtmBuffer, rasterMetadata.rasters.dtm, config.model.bounds);
  const pointCount = 180;
  const points = Array.from({ length: pointCount + 1 }, (_, index) => {
    const distanceAlongTrack = totalLength * index / pointCount;
    const point = index === pointCount ? centerline[0] : sampleLine(centerline, cumulative, distanceAlongTrack);
    return [
      round(index / pointCount, 6),
      round(point[0] - config.model.center.x, 3),
      round(point[1] - config.model.center.y, 3),
      round(dtm.sample(point[0], point[1]) * 10, 3),
    ];
  });
  points.at(-1).splice(1, 3, ...points[0].slice(1));
  const pitCenterline = assemblePitLane(osm, config.model.pitLaneWayIds);
  const pitCumulative = cumulativeDistances(pitCenterline);
  const pitLength = pitCumulative.at(-1);
  const pitPointCount = 96;
  const pitLanePoints = Array.from({ length: pitPointCount + 1 }, (_, index) => {
    const point = sampleLine(pitCenterline, pitCumulative, pitLength * index / pitPointCount);
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
    return (sample.elevationMeters - previous.elevationMeters) / (sample.distanceMeters - previous.distanceMeters) * 100;
  });
  const turns = config.model.turns.map((turn) => ({
    name: turn.name,
    number: turn.number,
    progress: round(turn.distanceMeters / totalLength, 6),
  }));
  const speedTrap = config.officialControlPoints.speedTrap;
  const speedTrapDistance = config.model.turns[speedTrap.turn - 1].distanceMeters - speedTrap.beforeTurnMeters;
  const sectorBreaks = config.officialControlPoints.sectorBoundaries.map((boundary) => round(boundary.absoluteDistanceMeters / totalLength, 6));
  const turnLabelOffsets = Object.fromEntries(turns.map(({ number }) => [number, [0, 0]]));
  const content = `import type {
  CircuitModelPoint,
  CircuitModelTurn,
  TrackModelDefinition,
} from "@/data/track-model-types";

/**
 * Generated from the Circuit de Barcelona-Catalunya Blender digital twin. Do not hand-edit.
 * Geometry: current OSM; terrain and imagery: ICGC; official markers: FIA 2026 map.
 * Run \`pnpm track:3d:build catalunya\` to regenerate this controller metadata.
 */

export const CATALUNYA_MODEL = ${JSON.stringify({
    circuitName: "Circuit de Barcelona-Catalunya",
    lapLengthKm: 4.657,
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

export const CATALUNYA_TERRAIN = ${JSON.stringify({
    attribution: "ICGC ортофото 2025 и рельеф · CC BY 4.0 · OpenStreetMap · ODbL 1.0",
    attributionUrl: "https://www.icgc.cat/es/Geoinformacion-y-mapas/Datos-y-productos/Imagen/Ortofoto-Territorial",
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

export const CATALUNYA_REPLAY_PATH = ${JSON.stringify({
    baseElevationMeters: round(rasterMetadata.rasters.dtm.minimum, 5),
    pitLanePoints: "__PIT_POINTS__",
    startFinishProgress: 0,
    surfaceOffsetMeters: 1,
    trackPoints: "__TRACK_POINTS__",
    trackWidthMeters: config.model.trackWidthMeters,
  }, null, 2)
    .replace('"__PIT_POINTS__"', `${JSON.stringify(pitLanePoints, null, 2)} satisfies readonly CircuitModelPoint[]`)
    .replace('"__TRACK_POINTS__"', `${JSON.stringify(points, null, 2)} satisfies readonly CircuitModelPoint[]`)} as const;

export const CATALUNYA_TRACK_MODEL = ${JSON.stringify({
    aliases: [
      "catalunya",
      "каталунья",
      "barcelona",
      "барселона",
      "circuit de barcelona-catalunya",
      "montmeló",
      "монтмело",
    ],
    camera: { centerY: 0, rotationDeg: 0, scale: 1, tiltDeg: 10, verticalExaggeration: 1 },
    data: "__MODEL__",
    id: "catalunya",
    rendering: {
      annotationOffsets: {},
      contourIntervalM: 5,
      curbTurnNumbers: turns.map(({ number }) => number),
      gravelTurnNumbers: [1, 3, 4, 5, 7, 9, 10, 12],
      runoffTurnNumbers: turns.map(({ number }) => number),
      turnLabelOffsets,
    },
    terrain: "__TERRAIN__",
    webgl: {
      assetPath: "/f1/tracks/3d/catalunya.glb",
      camera: { fitHeight: 1_900, fitWidth: 2_200, lookAtY: 18, radius: 3_400 },
      elevationDatumLabel: "м ICGC",
      previewPath: "/f1/tracks/3d/catalunya-preview.webp",
      turnCount: 14,
    },
  }, null, 2)
    .replace('"__MODEL__"', "CATALUNYA_MODEL")
    .replace('"__TERRAIN__"', "CATALUNYA_TERRAIN")} satisfies TrackModelDefinition;
`;
  await writeFile(outputPath, content, "utf8");
  return { outputPath, pointCount: points.length, totalLength };
}

function createHeightRasterSampler(buffer, metadata, bounds) {
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  const values = Array.from({ length: width * height }, (_, index) => buffer.readFloatLE(index * 4));
  const sample = (x, y) => {
    const fx = clamp((x - bounds.minX) / (bounds.maxX - bounds.minX) * (width - 1), 0, width - 1);
    const fy = clamp((bounds.maxY - y) / (bounds.maxY - bounds.minY) * (height - 1), 0, height - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    return values[y0 * width + x0] * (1 - tx) * (1 - ty)
      + values[y0 * width + x1] * tx * (1 - ty)
      + values[y1 * width + x0] * (1 - tx) * ty
      + values[y1 * width + x1] * tx * ty;
  };
  return { sample };
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
