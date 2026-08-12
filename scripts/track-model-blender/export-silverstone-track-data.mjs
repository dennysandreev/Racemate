import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  downloadSilverstoneData,
  SILVERSTONE_BOUNDS_UTM30N,
} from "./download-silverstone-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export const SILVERSTONE_MAIN_CIRCUIT_WAY_IDS = [
  169_733_766, 169_733_769, 169_733_770, 169_848_880, 169_848_884,
  169_848_881, 55_224_168, 55_224_167, 169_854_842, 169_800_226,
  169_800_223, 169_800_225, 169_848_882, 169_800_224, 169_800_222,
  169_618_242, 169_618_240, 169_618_241, 169_618_245, 169_609_611,
  169_730_588, 3_571_477, 169_730_585, 169_730_587, 169_733_768,
  169_730_586, 430_075_118,
];

const START_FINISH_REFERENCE = { lat: 52.0682609, lon: -1.0234867 };

const TURNS = [
  [1, 447.0, "Abbey"],
  [2, 601.0, "Farm Curve"],
  [3, 855.0, "Village"],
  [4, 1_020.0, "The Loop"],
  [5, 1_214.0, "Aintree"],
  [6, 1_933.0, "Brooklands"],
  [7, 2_166.0, "Luffield"],
  [8, 2_530.0, "Woodcote"],
  [9, 3_091.0, "Copse"],
  [10, 3_680.0, "Maggotts"],
  [11, 3_778.0, "Maggotts"],
  [12, 3_936.0, "Becketts"],
  [13, 4_083.0, "Becketts"],
  [14, 4_237.0, "Chapel"],
  [15, 5_029.0, "Stowe"],
  [16, 5_485.0, "Vale"],
  [17, 5_575.0, "Club"],
  [18, 5_726.0, "Club"],
].map(([number, distanceMeters, name]) => ({ distanceMeters, name, number }));

// These sections cover the current official 2026 stands not represented by a
// building=grandstand footprint in OSM. Mapped stands are retained separately.
const GRANDSTANDS = [
  stand("Woodcote B", 2_535, 2_592, "left", 46, 24, 11, 19, 10),
  stand("National Pit Straight", 2_660, 2_755, "left", 59, 15, 11, 19, 12),
  stand("Boxpark", 4_460, 4_590, "left", 30, 20, 12, 19),
  stand("Landostand A", 4_860, 4_980, "left", 30, 19, 13, 22),
  stand("Landostand B", 4_985, 5_105, "left", 30, 19, 13, 22),
  stand("Stowe A", 4_865, 4_990, "right", 30, 18, 12, 20),
  stand("Stowe B", 4_995, 5_120, "right", 30, 18, 12, 20),
];

export async function exportSilverstoneTrackData({
  forceSources = false,
  outputPath,
  sourceDirectory,
}) {
  const resolvedSourceDirectory = sourceDirectory
    ? path.resolve(sourceDirectory)
    : path.join(projectRoot, ".track-model-build/silverstone-source");
  const sourceManifest = await downloadSilverstoneData({
    force: forceSources,
    sourceDirectory: resolvedSourceDirectory,
  });
  const osm = JSON.parse(await readFile(
    path.join(resolvedSourceDirectory, "openstreetmap-raceway.json"),
    "utf8",
  ));
  const sourceCenterline = assembleMainCircuit(osm, SILVERSTONE_MAIN_CIRCUIT_WAY_IDS);
  const geometryLengthMeters = cumulativeDistances(sourceCenterline).at(-1);
  const sourceStartFinishOffsetMeters = nearestDistance(
    sourceCenterline,
    utm30nFromWgs84(START_FINISH_REFERENCE.lat, START_FINISH_REFERENCE.lon),
  );
  const payload = {
    generatorVersion: "5.0.0",
    grandstands: GRANDSTANDS,
    model: {
      bounds: SILVERSTONE_BOUNDS_UTM30N,
      center: {
        x: (SILVERSTONE_BOUNDS_UTM30N.minX + SILVERSTONE_BOUNDS_UTM30N.maxX) / 2,
        y: (SILVERSTONE_BOUNDS_UTM30N.minY + SILVERSTONE_BOUNDS_UTM30N.maxY) / 2,
      },
      geometryLengthMeters: round(geometryLengthMeters),
      id: "silverstone",
      lapLengthMeters: 5_891,
      mainCircuitWayIds: SILVERSTONE_MAIN_CIRCUIT_WAY_IDS,
      pitBoxes: 41,
      pitLaneWayId: 227_902_927,
      pitLaneWidthMeters: 12,
      sourceStartFinishOffsetMeters: round(sourceStartFinishOffsetMeters),
      startFinishDistanceMeters: 0,
      trackWidthMeters: 15,
      turns: TURNS,
    },
    officialControlPoints: {
      drs: [],
      sectorBoundaries: [
        { absoluteDistanceMeters: 1_823, beforeTurnMeters: 110, sector: 2, turn: 6 },
        { absoluteDistanceMeters: 4_287, afterTurnMeters: 50, sector: 3, turn: 14 },
      ],
      speedTrap: { beforeTurnMeters: 140, turn: 15 },
      straightModeZones: [
        { activation: "65 m after T18", detection: "115 m after T18", zone: "A1" },
        { activation: "55 m after T5", detection: "115 m after T5", zone: "A2" },
        { activation: "155 m after T7", detection: null, zone: "A3" },
        { activation: "65 m after T14", detection: "125 m after T14", zone: "A4" },
      ],
    },
    officialSources: [
      {
        role: "FIA 2026 circuit map: 5.891 km, 18 turns, sector lengths, speed trap and 41-position pit drawing",
        url: "https://www.fia.com/system/files/decision-document/2026_british_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf",
      },
      {
        role: "official current 2026 named grandstand inventory",
        url: "https://www.silverstone.co.uk/news/silverstones-guide-grandstands",
      },
      {
        role: "Environment Agency LIDAR Composite DTM 1 m metadata and OGL v3.0 licence",
        url: "https://ckan.publishing.service.gov.uk/dataset/lidar-composite-digital-terrain-model-dtm-1m",
      },
      {
        role: "Environment Agency survey tiles: 1 m first-return DSM and measured LIDAR intensity",
        url: "https://environment.data.gov.uk/survey",
      },
    ],
    schemaVersion: 5,
    sourceDirectory: resolvedSourceDirectory,
    sourceManifest,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function stand(name, start, end, side, offset, depth, height, rows, sectionLengthMeters) {
  return {
    depth,
    end,
    height,
    name,
    offset,
    rows,
    ...(sectionLengthMeters ? { sectionLengthMeters } : {}),
    side,
    start,
  };
}

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

function nearestDistance(points, target) {
  let total = 0;
  let nearest = { distance: Infinity, progress: 0 };
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1];
    const second = points[index];
    const dx = second[0] - first[0];
    const dy = second[1] - first[1];
    const lengthSquared = dx * dx + dy * dy;
    const blend = Math.max(0, Math.min(1,
      ((target[0] - first[0]) * dx + (target[1] - first[1]) * dy) / Math.max(lengthSquared, 1e-9),
    ));
    const projected = [first[0] + dx * blend, first[1] + dy * blend];
    const separation = distance(projected, target);
    if (separation < nearest.distance) {
      nearest = { distance: separation, progress: total + Math.sqrt(lengthSquared) * blend };
    }
    total += Math.sqrt(lengthSquared);
  }
  return nearest.progress;
}

function cumulativeDistances(points) {
  const values = [0];
  for (let index = 1; index < points.length; index += 1) {
    values.push(values.at(-1) + distance(points[index - 1], points[index]));
  }
  return values;
}

export function utm30nFromWgs84(lat, lon) {
  const semiMajor = 6_378_137;
  const flattening = 1 / 298.257223563;
  const scale = 0.9996;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondaryEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const radians = Math.PI / 180;
  const latitude = lat * radians;
  const longitudeDelta = (lon + 3) * radians;
  const sine = Math.sin(latitude);
  const cosine = Math.cos(latitude);
  const tangent = Math.tan(latitude);
  const radius = semiMajor / Math.sqrt(1 - eccentricitySquared * sine ** 2);
  const t = tangent ** 2;
  const c = secondaryEccentricitySquared * cosine ** 2;
  const a = cosine * longitudeDelta;
  const meridionalArc = semiMajor * (
    (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256) * latitude
    - (3 * eccentricitySquared / 8 + 3 * eccentricitySquared ** 2 / 32 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(2 * latitude)
    + (15 * eccentricitySquared ** 2 / 256 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(4 * latitude)
    - 35 * eccentricitySquared ** 3 / 3072 * Math.sin(6 * latitude)
  );
  return [
    500_000 + scale * radius * (a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * secondaryEccentricitySquared) * a ** 5 / 120),
    scale * (meridionalArc + radius * tangent * (a ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * secondaryEccentricitySquared) * a ** 6 / 720)),
  ];
}

function distance(first, second) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
