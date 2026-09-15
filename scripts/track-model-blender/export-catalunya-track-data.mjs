import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CATALUNYA_BOUNDS_UTM31N,
  downloadCatalunyaData,
} from "./download-catalunya-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export const CATALUNYA_MAIN_CIRCUIT_WAY_IDS = [831_804_327];
export const CATALUNYA_CURRENT_FINAL_SECTOR_WAY_IDS = [893_732_520, 831_804_325, 990_483_278];
export const CATALUNYA_PIT_LANE_WAY_IDS = [33_742_214, 178_416_729, 178_416_733];
export const CATALUNYA_EXCLUDED_GRANDSTAND_IDS = [725_695_175];
const START_FINISH_REFERENCE = { lat: 41.5708564635, lon: 2.2619162217 };

export const CATALUNYA_TURNS = [
  [1, 821, "Elf", -1],
  [2, 903, "Turn 2", -1],
  [3, 1_156, "Renault", 1],
  [4, 1_729, "Repsol", -1],
  [5, 2_169, "Seat", 1],
  [6, 2_365, "Turn 6", -1],
  [7, 2_530, "Würth", 1],
  [8, 2_626, "Turn 8", 1],
  [9, 2_895, "Campsa", -1],
  [10, 3_492, "La Caixa", 1],
  [11, 3_648, "Turn 11", -1],
  [12, 3_750, "Banc Sabadell", -1],
  [13, 4_058, "Europcar", 1],
  [14, 4_350, "New Holland", 1],
].map(([number, distanceMeters, name, anchorSide]) => ({
  anchorHeightMeters: 5,
  anchorOffsetMeters: 15,
  anchorSide,
  distanceMeters,
  name,
  number,
}));

export async function exportCatalunyaTrackData({
  forceSources = false,
  outputPath,
  sourceDirectory,
}) {
  const resolvedSourceDirectory = sourceDirectory
    ? path.resolve(sourceDirectory)
    : path.join(projectRoot, ".track-model-build/catalunya-source");
  const sourceManifest = await downloadCatalunyaData({
    force: forceSources,
    sourceDirectory: resolvedSourceDirectory,
  });
  const [osm, buildings] = await Promise.all([
    readJson(path.join(resolvedSourceDirectory, "openstreetmap-raceway.json")),
    readJson(path.join(resolvedSourceDirectory, "openstreetmap-buildings.json")),
  ]);
  const rawCenterline = assembleCatalunyaCurrentCircuit(osm);
  const sourceCenterline = smoothClosedLine(rawCenterline);
  const sourceStartFinishOffsetMeters = nearestDistance(
    sourceCenterline,
    utm31nFromWgs84(START_FINISH_REFERENCE.lat, START_FINISH_REFERENCE.lon),
  );
  const centerline = rotateClosedLine(sourceCenterline, sourceStartFinishOffsetMeters);
  const payload = {
    generatorVersion: "6.0.0",
    grandstandExclusions: CATALUNYA_EXCLUDED_GRANDSTAND_IDS.map((osmWayId) => ({
      osmWayId,
      reason: "removed from the delivered T13-T14 presentation at the user's request",
    })),
    grandstands: deriveGrandstands(buildings, centerline),
    model: {
      bounds: CATALUNYA_BOUNDS_UTM31N,
      center: {
        x: (CATALUNYA_BOUNDS_UTM31N.minX + CATALUNYA_BOUNDS_UTM31N.maxX) / 2,
        y: (CATALUNYA_BOUNDS_UTM31N.minY + CATALUNYA_BOUNDS_UTM31N.maxY) / 2,
      },
      centerlineSmoothing: "cyclic triangular radius 1; removes sub-metre OSM digitisation noise",
      id: "catalunya",
      lapLengthMeters: 4_657,
      currentFinalSectorWayIds: CATALUNYA_CURRENT_FINAL_SECTOR_WAY_IDS,
      mainCircuitWayIds: CATALUNYA_MAIN_CIRCUIT_WAY_IDS,
      pitBoxes: 40,
      pitLaneWayIds: CATALUNYA_PIT_LANE_WAY_IDS,
      pitLaneWidthMeters: 11,
      sourceStartFinishOffsetMeters: round(sourceStartFinishOffsetMeters),
      startFinishDistanceMeters: 0,
      trackWidthMeters: 12,
      turns: CATALUNYA_TURNS,
    },
    officialControlPoints: {
      drs: [
        { distanceFromTurnMeters: 0, kind: "detection-before", turn: 14, zone: 1 },
        { distanceFromTurnMeters: 45, kind: "activation-after", turn: 14, zone: 1 },
        { distanceFromTurnMeters: 85, kind: "detection-after", turn: 8, zone: 2 },
        { distanceFromTurnMeters: 40, kind: "activation-after", turn: 9, zone: 2 },
      ],
      sectorBoundaries: [
        { absoluteDistanceMeters: 1_273, sector: 2 },
        { absoluteDistanceMeters: 3_038, sector: 3 },
      ],
      speedTrap: { beforeTurnMeters: 220, turn: 1 },
    },
    officialSources: [
      {
        role: "FIA 2026 circuit map: 4.657 km, 14 turns, sectors, speed trap and DRS control points",
        url: "https://www.fia.com/system/files/decision-document/2026_barcelona_event_-_circuit_map_-_barcelona_2026.pdf",
      },
      {
        role: "official 2026 venue map for grandstands, pit building and paddock inventory",
        url: "https://www.circuitcat.com/wp-content/uploads/2026/06/Wayfinding-Map-F1-2026.pdf",
      },
      {
        role: "FIA 2026 pit-lane drawing and garage allocation",
        url: "https://www.fia.com/system/files/decision-document/2026_barcelona-catalunya_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf",
      },
      {
        role: "ICGC territorial RGB orthophoto 2025, 25 cm source resolution, CC BY 4.0",
        url: "https://www.icgc.cat/es/Geoinformacion-y-mapas/Datos-y-productos/Imagen/Ortofoto-Territorial",
      },
      {
        role: "ICGC territorial DTM and 2024 surface model, source elevation metres, CC BY 4.0",
        url: "https://www.icgc.cat/es/Geoinformacion-y-mapas/Datos-y-productos/Elevaciones",
      },
    ],
    schemaVersion: 6,
    sourceDirectory: resolvedSourceDirectory,
    sourceManifest,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function deriveGrandstands(osmBuildings, centerline) {
  const cumulative = cumulativeDistances(centerline);
  const total = cumulative.at(-1);
  const excludedIds = new Set(CATALUNYA_EXCLUDED_GRANDSTAND_IDS);
  return osmBuildings.elements
    .filter((feature) => (feature.tags?.building === "grandstand" || feature.tags?.leisure === "bleachers") && feature.geometry?.length >= 4)
    .filter((feature) => !excludedIds.has(feature.id))
    .map((feature) => {
      const polygon = feature.geometry.slice(0, -1).map(({ lat, lon }) => utm31nFromWgs84(lat, lon));
      const centroid = polygon.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
        .map((value) => value / polygon.length);
      const nearest = nearestProjection(centerline, cumulative, centroid);
      const tangentLength = Math.hypot(nearest.tangent[0], nearest.tangent[1]);
      const tangent = nearest.tangent.map((value) => value / tangentLength);
      const normal = [-tangent[1], tangent[0]];
      const along = polygon.map((point) => (point[0] - centroid[0]) * tangent[0] + (point[1] - centroid[1]) * tangent[1]);
      const across = polygon.map((point) => (point[0] - centroid[0]) * normal[0] + (point[1] - centroid[1]) * normal[1]);
      const length = Math.max(18, Math.max(...along) - Math.min(...along));
      const depth = Math.max(8, Math.min(28, Math.max(...across) - Math.min(...across)));
      return {
        depth: round(depth),
        end: round(nearest.progress + length / 2),
        height: Math.max(7, Math.min(14, round(depth * 0.58))),
        name: feature.tags?.name ?? `Grandstand ${feature.id}`,
        offset: round(Math.max(10, nearest.separation - depth / 2)),
        osmWayId: feature.id,
        rows: Math.max(10, Math.min(24, Math.round(depth / 0.75))),
        sectionLengthMeters: 26,
        side: nearest.side >= 0 ? "left" : "right",
        start: round(nearest.progress - length / 2),
      };
    })
    .filter((stand) => stand.start > -180 && stand.end < total + 180);
}

export function assembleMainCircuit(osm, wayIds) {
  const ways = new Map(osm.elements.filter((element) => element.type === "way").map((way) => [way.id, way]));
  const points = [];
  for (const wayId of wayIds) {
    const way = ways.get(wayId);
    if (!way?.geometry?.length) throw new Error(`OSM way ${wayId} is missing or has no geometry`);
    let geometry = way.geometry.map(({ lat, lon }) => utm31nFromWgs84(lat, lon));
    if (points.length > 0) {
      if (distance(points.at(-1), geometry.at(-1)) < distance(points.at(-1), geometry[0])) geometry = geometry.reverse();
      if (distance(points.at(-1), geometry[0]) < 0.05) geometry = geometry.slice(1);
    }
    points.push(...geometry);
  }
  if (distance(points[0], points.at(-1)) > 0.05) points.push(points[0]);
  return points;
}

export function assembleCatalunyaCurrentCircuit(osm) {
  const main = assembleMainCircuit(osm, CATALUNYA_MAIN_CIRCUIT_WAY_IDS);
  const mainCore = distance(main[0], main.at(-1)) < 0.05 ? main.slice(0, -1) : main;
  let bypass = assembleOpenLine(osm, CATALUNYA_CURRENT_FINAL_SECTOR_WAY_IDS);
  let currentStartIndex = nearestPointIndex(mainCore, bypass[0]);
  let currentEndIndex = nearestPointIndex(mainCore, bypass.at(-1));
  if (currentEndIndex >= currentStartIndex) {
    bypass = bypass.reverse();
    currentStartIndex = nearestPointIndex(mainCore, bypass[0]);
    currentEndIndex = nearestPointIndex(mainCore, bypass.at(-1));
  }

  if (currentEndIndex >= currentStartIndex) {
    throw new Error("Catalunya current final-sector bypass does not cross the OSM way boundary as expected");
  }
  if (distance(mainCore[currentStartIndex], bypass[0]) > 0.5 || distance(mainCore[currentEndIndex], bypass.at(-1)) > 0.5) {
    throw new Error("Catalunya current final-sector bypass is disconnected from the main circuit");
  }

  return [
    ...mainCore.slice(currentEndIndex, currentStartIndex + 1),
    ...bypass.slice(1),
  ];
}

export function assemblePitLane(osm, wayIds) {
  const line = assembleOpenLine(osm, wayIds);
  return line;
}

function assembleOpenLine(osm, wayIds) {
  const ways = new Map(osm.elements.filter((element) => element.type === "way").map((way) => [way.id, way]));
  const points = [];
  for (const wayId of wayIds) {
    const way = ways.get(wayId);
    if (!way?.geometry?.length) throw new Error(`OSM way ${wayId} is missing or has no geometry`);
    let geometry = way.geometry.map(({ lat, lon }) => utm31nFromWgs84(lat, lon));
    if (points.length > 0) {
      if (distance(points.at(-1), geometry.at(-1)) < distance(points.at(-1), geometry[0])) geometry = geometry.reverse();
      if (distance(points.at(-1), geometry[0]) < 0.5) geometry = geometry.slice(1);
    }
    points.push(...geometry);
  }
  return points;
}

function nearestPointIndex(points, target) {
  let nearestIndex = -1;
  let nearestSeparation = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const separation = distance(points[index], target);
    if (separation < nearestSeparation) {
      nearestIndex = index;
      nearestSeparation = separation;
    }
  }
  return nearestIndex;
}

export function smoothClosedLine(points) {
  const core = distance(points[0], points.at(-1)) < 0.05 ? points.slice(0, -1) : points;
  const smoothed = core.map((point, index) => {
    const previous = core[(index - 1 + core.length) % core.length];
    const next = core[(index + 1) % core.length];
    return [(previous[0] + point[0] * 2 + next[0]) / 4, (previous[1] + point[1] * 2 + next[1]) / 4];
  });
  return [...smoothed, smoothed[0]];
}

export function rotateClosedLine(points, requestedOffset) {
  const cumulative = cumulativeDistances(points);
  const total = cumulative.at(-1);
  const offset = ((requestedOffset % total) + total) % total;
  const splitIndex = cumulative.findIndex((value) => value >= offset);
  const splitPoint = sampleLine(points, cumulative, offset);
  const core = distance(points[0], points.at(-1)) < 0.05 ? points.slice(0, -1) : points;
  return [splitPoint, ...core.slice(splitIndex), ...core.slice(0, splitIndex), splitPoint];
}

function nearestProjection(points, cumulative, target) {
  let nearest = { separation: Infinity };
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1];
    const second = points[index];
    const tangent = [second[0] - first[0], second[1] - first[1]];
    const lengthSquared = tangent[0] ** 2 + tangent[1] ** 2;
    const blend = Math.max(0, Math.min(1, ((target[0] - first[0]) * tangent[0] + (target[1] - first[1]) * tangent[1]) / Math.max(lengthSquared, 1e-9)));
    const projected = [first[0] + tangent[0] * blend, first[1] + tangent[1] * blend];
    const offset = [target[0] - projected[0], target[1] - projected[1]];
    const separation = Math.hypot(...offset);
    if (separation < nearest.separation) {
      nearest = {
        progress: cumulative[index - 1] + Math.sqrt(lengthSquared) * blend,
        separation,
        side: tangent[0] * offset[1] - tangent[1] * offset[0],
        tangent,
      };
    }
  }
  return nearest;
}

function nearestDistance(points, target) {
  return nearestProjection(points, cumulativeDistances(points), target).progress;
}

export function cumulativeDistances(points) {
  const result = [0];
  for (let index = 1; index < points.length; index += 1) result.push(result.at(-1) + distance(points[index - 1], points[index]));
  return result;
}

export function sampleLine(points, cumulative, requestedDistance) {
  const distanceAlongLine = Math.min(Math.max(requestedDistance, 0), cumulative.at(-1));
  const upper = cumulative.findIndex((value) => value >= distanceAlongLine);
  if (upper <= 0) return points[0];
  const lower = upper - 1;
  const blend = (distanceAlongLine - cumulative[lower]) / Math.max(cumulative[upper] - cumulative[lower], 1e-9);
  return points[lower].map((value, axis) => value * (1 - blend) + points[upper][axis] * blend);
}

export function utm31nFromWgs84(lat, lon) {
  const semiMajor = 6_378_137;
  const flattening = 1 / 298.257223563;
  const scale = 0.9996;
  const e2 = flattening * (2 - flattening);
  const ep2 = e2 / (1 - e2);
  const phi = lat * Math.PI / 180;
  const delta = (lon - 3) * Math.PI / 180;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const n = semiMajor / Math.sqrt(1 - e2 * sin ** 2);
  const t = tan ** 2;
  const c = ep2 * cos ** 2;
  const a = cos * delta;
  const m = semiMajor * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - 35 * e2 ** 3 / 3072 * Math.sin(6 * phi));
  return [500_000 + scale * n * (a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * a ** 5 / 120), scale * (m + n * tan * (a ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * a ** 6 / 720))];
}

function distance(first, second) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
