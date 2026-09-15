import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  downloadRedBullRingData,
  RED_BULL_RING_BOUNDS_UTM33N,
} from "./download-red-bull-ring-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export const RED_BULL_RING_MAIN_CIRCUIT_WAY_IDS = [
  822_592_403,
  822_592_404,
  347_958_266,
  822_592_398,
  822_592_399,
  822_592_400,
  822_592_401,
  822_592_402,
  822_592_405,
  822_592_406,
  822_592_407,
  822_592_408,
  822_592_409,
  822_592_410,
];
const START_FINISH_REFERENCE = { lat: 47.2202964, lon: 14.7667292 };

export const RED_BULL_RING_TURNS = [
  [1, 453, "Niki Lauda", -1],
  [2, 759, "Münzer", 1],
  [3, 1_392, "Remus", -1],
  [4, 2_200, "Schlossgold", -1],
  [5, 2_462, "Turn 5", 1],
  [6, 2_758, "Rauch", 1],
  [7, 3_021, "Würth", -1],
  [8, 3_168, "Turn 8", -1],
  [9, 3_781, "Jochen Rindt", 1],
  [10, 3_989, "Red Bull Mobile", -1],
].map(([number, distanceMeters, name, anchorSide]) => ({
  anchorHeightMeters: 5,
  anchorOffsetMeters: 12.5,
  anchorSide,
  distanceMeters,
  name,
  number,
}));

export async function exportRedBullRingTrackData({
  forceSources = false,
  outputPath,
  sourceDirectory,
}) {
  const resolvedSourceDirectory = sourceDirectory
    ? path.resolve(sourceDirectory)
    : path.join(projectRoot, ".track-model-build/red-bull-ring-source");
  const sourceManifest = await downloadRedBullRingData({
    force: forceSources,
    sourceDirectory: resolvedSourceDirectory,
  });
  const osm = JSON.parse(await readFile(
    path.join(resolvedSourceDirectory, "openstreetmap-raceway.json"),
    "utf8",
  ));
  const sourceCenterline = assembleMainCircuit(osm, RED_BULL_RING_MAIN_CIRCUIT_WAY_IDS);
  const sourceStartFinishOffsetMeters = nearestDistance(
    sourceCenterline,
    utm33nFromWgs84(START_FINISH_REFERENCE.lat, START_FINISH_REFERENCE.lon),
  );
  const payload = {
    generatorVersion: "5.0.0",
    grandstands: [],
    model: {
      bounds: RED_BULL_RING_BOUNDS_UTM33N,
      center: {
        x: (RED_BULL_RING_BOUNDS_UTM33N.minX + RED_BULL_RING_BOUNDS_UTM33N.maxX) / 2,
        y: (RED_BULL_RING_BOUNDS_UTM33N.minY + RED_BULL_RING_BOUNDS_UTM33N.maxY) / 2,
      },
      id: "red-bull-ring",
      lapLengthMeters: 4_326,
      mainCircuitWayIds: RED_BULL_RING_MAIN_CIRCUIT_WAY_IDS,
      pitBoxes: 32,
      pitLaneWayId: 289_111_668,
      pitLaneWidthMeters: 11,
      sourceStartFinishOffsetMeters: round(sourceStartFinishOffsetMeters),
      startFinishDistanceMeters: 0,
      trackWidthMeters: 12.5,
      turns: RED_BULL_RING_TURNS,
    },
    officialControlPoints: {
      drs: [],
      intermediate: [
        { beforeTurnMeters: 170, turn: 3 },
        { beforeTurnMeters: 60, turn: 7 },
      ],
      sectorBoundaries: [
        { absoluteDistanceMeters: 1_215, sector: 2 },
        { absoluteDistanceMeters: 2_912, sector: 3 },
      ],
      speedTrap: { beforeTurnMeters: 170, turn: 4 },
    },
    officialSources: [
      {
        role: "FIA 2026 circuit and pit-lane map: 4.326 km, 10 turns, sectors, speed trap and 32 pit boxes",
        url: "https://www.fia.com/documents/season/season-2026-2072/championships/fia-formula-one-world-championship-14/event/Austrian%20Grand%20Prix",
      },
      {
        role: "official 2026 venue specifications and named turns",
        url: "https://www.redbullring.com/en/events-tickets/formula-1/formula-1-circuit/",
      },
      {
        role: "official confirmation that all current grandstands are open for the event",
        url: "https://www.redbullring.com/en/events-tickets/formula-1/glossary/",
      },
      {
        role: "Styria current orthophoto 2022–2024, 20 cm source resolution",
        url: "https://data.steiermark.at/cms/beitrag/12920756/97428847/",
      },
      {
        role: "Styria 1 m ALS DTM/DSM open data, CC BY 4.0",
        url: "https://www.landesentwicklung.steiermark.at/cms/beitrag/12803182/143660187/",
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

function assembleMainCircuit(osm, wayIds) {
  const ways = new Map(osm.elements.filter((element) => element.type === "way")
    .map((way) => [way.id, way]));
  const points = [];
  for (const wayId of wayIds) {
    const way = ways.get(wayId);
    if (!way?.geometry?.length) throw new Error(`OSM way ${wayId} is missing or has no geometry`);
    let geometry = way.geometry.map(({ lat, lon }) => utm33nFromWgs84(lat, lon));
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

export function utm33nFromWgs84(lat, lon) {
  const semiMajor = 6_378_137;
  const flattening = 1 / 298.257223563;
  const scale = 0.9996;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondaryEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const latitude = lat * Math.PI / 180;
  const longitudeDelta = (lon - 15) * Math.PI / 180;
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
