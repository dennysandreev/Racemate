import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  downloadMontrealData,
  MONTREAL_BOUNDS_MTM8,
} from "./download-montreal-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export const MONTREAL_MAIN_CIRCUIT_WAY_IDS = [136_717_490];
const START_FINISH_REFERENCE = { lat: 45.5000971, lon: -73.5227130 };

export const MONTREAL_TURNS = [
  [1, 226, "Virage Senna", -1],
  [2, 329, "Virage Senna", 1],
  [3, 708, null, -1],
  [4, 766, null, 1],
  [5, 995, null, -1],
  [6, 1_242, null, 1],
  [7, 1_301, null, -1],
  [8, 1_988, null, -1],
  [9, 2_070, null, 1],
  [10, 2_678, "L’Épingle", -1],
  [11, 2_773, null, 1],
  [12, 3_152, null, 1],
  [13, 3_869, null, 1],
  [14, 3_903, "Mur des champions", -1],
].map(([number, distanceMeters, name, anchorSide]) => ({
  anchorHeightMeters: 5,
  anchorOffsetMeters: 12,
  anchorSide,
  distanceMeters,
  name: name ?? `Turn ${number}`,
  number,
}));

const MONTREAL_GRANDSTANDS = [
  stand("Platine", 38, 152, "right", 27, 18, 10, 20),
  stand("Grandstand 11", 215, 286, "right", 25, 19, 11, 22),
  stand("Grandstand 33", 1_170, 1_342, "left", 28, 18, 9, 18),
  stand("Grandstand 31", 2_050, 2_170, "right", 14, 16, 9, 18),
  stand("Grandstand 15", 2_595, 2_672, "left", 11.5, 16, 11, 22),
  stand("Grandstand 21", 2_650, 2_734, "right", 29, 19, 10, 20),
  stand("Grandstand 24 Lance Stroll", 2_710, 2_795, "left", 31, 19, 10, 20),
  stand("Grandstand 34", 2_575, 2_665, "right", 32, 18, 9, 18),
  stand("Grandstand 46", 2_815, 2_932, "right", 27, 17, 8, 16),
  stand("Grandstand 47", 2_940, 3_060, "right", 27, 17, 8, 16),
];

export async function exportMontrealTrackData({
  forceSources = false,
  outputPath,
  sourceDirectory,
}) {
  const resolvedSourceDirectory = sourceDirectory
    ? path.resolve(sourceDirectory)
    : path.join(projectRoot, ".track-model-build/montreal-source");
  const sourceManifest = await downloadMontrealData({
    force: forceSources,
    sourceDirectory: resolvedSourceDirectory,
  });
  const osm = JSON.parse(await readFile(
    path.join(resolvedSourceDirectory, "openstreetmap-raceway.json"),
    "utf8",
  ));
  const sourceCenterline = assembleMainCircuit(osm, MONTREAL_MAIN_CIRCUIT_WAY_IDS);
  const sourceStartFinishOffsetMeters = nearestDistance(
    sourceCenterline,
    mtm8FromWgs84(START_FINISH_REFERENCE.lat, START_FINISH_REFERENCE.lon),
  );
  const payload = {
    generatorVersion: "7.0.0",
    grandstands: MONTREAL_GRANDSTANDS,
    model: {
      bounds: MONTREAL_BOUNDS_MTM8,
      center: {
        x: (MONTREAL_BOUNDS_MTM8.minX + MONTREAL_BOUNDS_MTM8.maxX) / 2,
        y: (MONTREAL_BOUNDS_MTM8.minY + MONTREAL_BOUNDS_MTM8.maxY) / 2,
      },
      id: "montreal",
      lapLengthMeters: 4_361,
      mainCircuitWayIds: MONTREAL_MAIN_CIRCUIT_WAY_IDS,
      pitBoxes: 43,
      pitLaneWayId: 413_000_959,
      pitLaneWidthMeters: 11,
      sourceStartFinishOffsetMeters: round(sourceStartFinishOffsetMeters),
      startFinishDistanceMeters: 0,
      trackWidthMeters: 10.5,
      turns: MONTREAL_TURNS,
    },
    officialControlPoints: {
      drs: [],
      intermediate: [
        { beforeTurnMeters: 150, turn: 6 },
        { beforeTurnMeters: 190, turn: 10 },
      ],
      sectorBoundaries: [
        { absoluteDistanceMeters: 1_092, sector: 2 },
        { absoluteDistanceMeters: 2_488, sector: 3 },
      ],
      speedTrap: { beforeTurnMeters: 250, turn: 13 },
    },
    officialSources: [
      {
        role: "FIA 2026 circuit and pit-lane map: 4.361 km, 14 turns, sectors, speed trap and 43 pit slots",
        url: "https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072/event/Canadian%20Grand%20Prix",
      },
      {
        role: "official 2026 promoter grandstand catalogue and current event configuration",
        url: "https://2026.gpcanada.ca/en/vitrine/2026/",
      },
      {
        role: "official promoter spectator map used as the venue geolocation baseline",
        url: "https://www.gpcanada.ca/wp-content/uploads/2024/05/guide-visiteurwebsite.pdf",
      },
      {
        role: "CMM 2019 colour orthophoto, 25 cm source resolution",
        url: "https://www.arcgis.com/home/item.html?id=7b1a89daf9ed463d9abfa81b9bbea0a7",
      },
      {
        role: "NRCan HRDEM Mosaic DTM/DSM, CGVD2013",
        url: "https://open.canada.ca/data/en/dataset/0fe65119-e96e-4a57-8bfe-9d9245fba06b",
      },
    ],
    schemaVersion: 7,
    sourceDirectory: resolvedSourceDirectory,
    sourceManifest,
    visualReview: {
      entryWedgeBuildingRemoved: true,
      garageSide: "left",
      pitPlatformMotorhomes: false,
      pitExitGuideLine: "continuous white",
      pitWall: "concrete wall with high debris fence and gated openings",
      relocatedGrandstands: ["Grandstand 31", "Grandstand 15"],
      removedGrandstands: ["Grandstand 1", "Grandstand 10", "Grandstand 12"],
    },
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
    let geometry = way.geometry.map(({ lat, lon }) => mtm8FromWgs84(lat, lon));
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
      ((target[0] - first[0]) * dx + (target[1] - first[1]) * dy)
        / Math.max(lengthSquared, 1e-9),
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

export function mtm8FromWgs84(lat, lon) {
  const semiMajor = 6_378_137;
  const flattening = 1 / 298.257222101;
  const scale = 0.9999;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondaryEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const latitude = lat * Math.PI / 180;
  const longitudeDelta = (lon + 73.5) * Math.PI / 180;
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
    304_800 + scale * radius * (
      a + (1 - t + c) * a ** 3 / 6
      + (5 - 18 * t + t ** 2 + 72 * c - 58 * secondaryEccentricitySquared) * a ** 5 / 120
    ),
    scale * (
      meridionalArc
      + radius * tangent * (
        a ** 2 / 2
        + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24
        + (61 - 58 * t + t ** 2 + 600 * c - 330 * secondaryEccentricitySquared) * a ** 6 / 720
      )
    ),
  ];
}

function distance(first, second) {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}

function stand(name, start, end, side, offset, depth, height, rows) {
  return { depth, end, height, name, offset, rows, side, start };
}
