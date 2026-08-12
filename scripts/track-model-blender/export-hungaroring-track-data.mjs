import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  downloadHungaroringData,
  HUNGARORING_BOUNDS_UTM34N,
} from "./download-hungaroring-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export const HUNGARORING_MAIN_CIRCUIT_WAY_IDS = [231_328_650, 1_333_262_244];
// FIA 2026 measures every control point from the control line beside the
// renovated pit complex. Keeping that origin here aligns turns, sectors and T.
const START_FINISH_REFERENCE = { lat: 47.578647, lon: 19.248834 };

const TURNS = [
  [1, 650.1, "Turn 1"],
  [2, 1_155.4, "Turn 2"],
  [3, 1_337.6, "Turn 3"],
  [4, 1_817.7, "Turn 4"],
  [5, 2_058.0, "Turn 5"],
  [6, 2_399.5, "Turn 6"],
  [7, 2_444.6, "Turn 7"],
  [8, 2_611.1, "Turn 8"],
  [9, 2_751.7, "Turn 9"],
  [10, 2_944.7, "Turn 10"],
  [11, 3_146.4, "Turn 11"],
  [12, 3_544.1, "Turn 12"],
  [13, 3_813.1, "Turn 13"],
  [14, 4_102.4, "Turn 14"],
].map(([number, distanceMeters, name]) => ({ distanceMeters, name, number }));

const GRANDSTANDS = [
  stand("Hungaroring Platinum", 4_015, 4_155, "left", 25, 18, 13, 22),
  stand("Hungaroring", 4_165, 4_315, "left", 25, 18, 13, 22),
  stand("Grid 1", 3_825, 3_950, "left", 25, 17, 12, 20),
  stand("Grid 2", 3_690, 3_815, "left", 25, 17, 12, 20),
  stand("Grid 3", 3_555, 3_680, "left", 25, 17, 12, 20),
  stand("Grand Prix 1", 3_405, 3_530, "left", 26, 17, 12, 20),
  stand("Grand Prix 2", 3_270, 3_395, "left", 26, 17, 12, 20),
  stand("Podium", 3_900, 4_035, "right", 28, 18, 13, 22),
  stand("T1", 535, 705, "right", 29, 19, 13, 22),
  stand("Pit Exit 1", 720, 845, "right", 27, 17, 11, 20),
  stand("Pit Exit 2", 855, 980, "right", 27, 17, 11, 20),
  stand("Apex 1", 1_035, 1_155, "left", 26, 17, 11, 20),
  stand("Apex 2", 1_165, 1_285, "left", 26, 17, 11, 20),
  stand("Fan 1", 1_345, 1_470, "right", 27, 17, 11, 20),
  stand("Fan 2", 1_480, 1_605, "right", 27, 17, 11, 20),
  stand("Chicane 1", 1_825, 1_950, "left", 28, 17, 11, 20),
  stand("Chicane 2", 2_005, 2_130, "right", 28, 17, 11, 20),
  stand("Chicane 3", 2_250, 2_375, "left", 28, 17, 11, 20),
  stand("Chicane 4", 2_500, 2_625, "right", 28, 17, 11, 20),
];

export async function exportHungaroringTrackData({
  forceSources = false,
  outputPath,
  sourceDirectory,
}) {
  const resolvedSourceDirectory = sourceDirectory
    ? path.resolve(sourceDirectory)
    : path.join(projectRoot, ".track-model-build/hungaroring-source");
  const sourceManifest = await downloadHungaroringData({
    force: forceSources,
    sourceDirectory: resolvedSourceDirectory,
  });
  const osm = JSON.parse(await readFile(
    path.join(resolvedSourceDirectory, "openstreetmap-raceway.json"),
    "utf8",
  ));
  const sourceCenterline = assembleMainCircuit(osm, HUNGARORING_MAIN_CIRCUIT_WAY_IDS);
  const sourceStartFinishOffsetMeters = nearestDistance(
    sourceCenterline,
    utm34nFromWgs84(START_FINISH_REFERENCE.lat, START_FINISH_REFERENCE.lon),
  );
  const payload = {
    generatorVersion: "4.0.0",
    grandstands: GRANDSTANDS,
    model: {
      bounds: HUNGARORING_BOUNDS_UTM34N,
      center: {
        x: (HUNGARORING_BOUNDS_UTM34N.minX + HUNGARORING_BOUNDS_UTM34N.maxX) / 2,
        y: (HUNGARORING_BOUNDS_UTM34N.minY + HUNGARORING_BOUNDS_UTM34N.maxY) / 2,
      },
      id: "hungaroring",
      lapLengthMeters: 4_381,
      mainCircuitWayIds: HUNGARORING_MAIN_CIRCUIT_WAY_IDS,
      pitBoxes: 36,
      pitLaneWayId: 231_417_580,
      pitLaneWidthMeters: 11,
      sourceStartFinishOffsetMeters: round(sourceStartFinishOffsetMeters),
      startFinishDistanceMeters: 0,
      trackWidthMeters: 15,
      turns: TURNS,
    },
    officialControlPoints: {
      drs: [],
      sectorBoundaries: [
        { absoluteDistanceMeters: 1_736, sector: 2 },
        { absoluteDistanceMeters: 3_278, sector: 3 },
      ],
      speedTrap: { beforeTurnMeters: 310, turn: 1 },
    },
    officialSources: [
      {
        role: "2026 circuit map: 4.381 km lap, 14 turns, sectors, speed trap and pit-lane drawing",
        url: "https://www.fia.com/documents/season/season-2026-1130/world-championships-2/formula-1-world-championship-16",
      },
      {
        role: "current renovated main straight, main building and grandstand",
        url: "https://hungaroring.hu/site/en/races/2026-formula-1-aws-magyar-nagydij",
      },
      {
        role: "current 2026 named grandstand inventory and event layout",
        url: "https://www.gpticketshop.com/en/f1/hungarian-f1-grand-prix/pdfpricelist.html?id=1137t",
      },
      {
        role: "Hungary national orthophoto 2022 metadata and CC BY 4.0 licence",
        url: "https://inspire-geoportal.ec.europa.eu/srv/api/records/orto2022m-2e5d-474c-9de5-910a2e8edd62",
      },
      {
        role: "Terrarium elevation format and open-source attribution chain",
        url: "https://docs.versatiles.org/basics/tilesets.html#elevation",
      },
    ],
    schemaVersion: 4,
    sourceDirectory: resolvedSourceDirectory,
    sourceManifest,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function stand(name, start, end, side, offset, depth, height, rows) {
  return { depth, end, height, name, offset, rows, side, start };
}

function assembleMainCircuit(osm, wayIds) {
  const ways = new Map(osm.elements.filter((element) => element.type === "way")
    .map((way) => [way.id, way]));
  const points = [];
  for (const wayId of wayIds) {
    const way = ways.get(wayId);
    if (!way?.geometry?.length) throw new Error(`OSM way ${wayId} is missing or has no geometry`);
    let geometry = way.geometry.map(({ lat, lon }) => utm34nFromWgs84(lat, lon));
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

export function utm34nFromWgs84(lat, lon) {
  const semiMajor = 6_378_137;
  const flattening = 1 / 298.257223563;
  const scale = 0.9996;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondaryEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const radians = Math.PI / 180;
  const latitude = lat * radians;
  const longitudeDelta = (lon - 21) * radians;
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
