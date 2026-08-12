import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  downloadSpaData,
  SPA_BOUNDS_LAMBERT_2008,
} from "./download-spa-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export const SPA_MAIN_CIRCUIT_WAY_IDS = [
  126_807_099,
  175_178_443,
  175_178_448,
  126_807_110,
  126_835_639,
  126_835_637,
  126_835_638,
  1_430_527_230,
  24_449_918,
  126_807_113,
  175_195_997,
  126_807_111,
  126_807_112,
  1_359_025_268,
  126_807_106,
  1_359_025_267,
  126_807_103,
  126_807_101,
  126_807_109,
  126_807_116,
  175_371_353,
  175_371_365,
  126_807_100,
  176_133_746,
  126_807_114,
  176_133_745,
  178_964_809,
  126_807_105,
  637_268_672,
  613_486_590,
];

const TURNS = [
  [1, 384.5, "La Source"],
  [2, 1_067.4, "Eau Rouge"],
  [3, 1_181.0, "Raidillon"],
  [4, 1_274.0, "Raidillon"],
  [5, 2_404.0, "Les Combes"],
  [6, 2_499.0, "Les Combes"],
  [7, 2_662.0, "Malmedy"],
  [8, 3_060.5, "Bruxelles"],
  [9, 3_307.0, "Speaker's Corner"],
  [10, 3_825.0, "Pouhon"],
  [11, 4_069.0, "Pouhon"],
  [12, 4_490.0, "Fagnes"],
  [13, 4_651.0, "Fagnes"],
  [14, 4_947.0, "Campus"],
  [15, 5_124.0, "Stavelot"],
  [16, 5_923.0, "Courbe Paul Frère"],
  [17, 6_202.0, "Blanchimont"],
  [18, 6_743.0, "Bus Stop"],
  [19, 6_810.5, "Bus Stop"],
].map(([number, distanceMeters, name]) => ({ distanceMeters, name, number }));

const GRANDSTANDS = [
  stand("Gold 3 Eau Rouge", 70, 340, "left", 23, 20, 14, 26),
  stand("Gold 4 Eau Rouge", 820, 1_320, "right", 24, 19, 11, 22, {
    maximumPlatformStepMeters: 2.4,
  }),
  stand("Gold 5 Raidillon", 960, 1_210, "left", 26, 20, 14, 26, {
    maximumPlatformStepMeters: 2.4,
  }),
  stand("Gold 6 Chicane", 6_530, 6_680, "left", 32, 18, 10, 20),
  stand("Silver 2 Les Combes", 2_250, 2_520, "left", 28, 18, 12, 22),
  stand("Silver 3 Double Gauche", 3_600, 3_980, "right", 31, 17, 8.5, 16, {
    heightEnd: 5.5,
    heightStart: 8.5,
    maximumPlatformStepMeters: 2.4,
  }),
  stand("Silver 4 Bruxelles", 2_850, 3_160, "left", 29, 18, 12, 22),
  stand("Silver 5 Fagnes", 4_340, 4_710, "right", 30, 17, 11, 20),
  stand("Silver 6 Speed Corner", 5_940, 6_220, "left", 30, 17, 11, 20),
];

export async function exportSpaTrackData({
  forceSources = false,
  outputPath,
  sourceDirectory,
}) {
  const resolvedSourceDirectory = sourceDirectory
    ? path.resolve(sourceDirectory)
    : path.join(projectRoot, ".track-model-build/spa-source");
  const sourceManifest = await downloadSpaData({
    force: forceSources,
    sourceDirectory: resolvedSourceDirectory,
  });
  const payload = {
    generatorVersion: "3.0.0",
    grandstands: GRANDSTANDS,
    model: {
      bounds: SPA_BOUNDS_LAMBERT_2008,
      center: {
        x: (SPA_BOUNDS_LAMBERT_2008.minX + SPA_BOUNDS_LAMBERT_2008.maxX) / 2,
        y: (SPA_BOUNDS_LAMBERT_2008.minY + SPA_BOUNDS_LAMBERT_2008.maxY) / 2,
      },
      id: "spa",
      lapLengthMeters: 7_004,
      mainCircuitWayIds: SPA_MAIN_CIRCUIT_WAY_IDS,
      pitBoxes: 42,
      pitLaneWayId: 323_851_541,
      pitLaneWidthMeters: 12,
      sourceStartFinishOffsetMeters: 6_686,
      startFinishDistanceMeters: 0,
      trackWidthMeters: 12,
      turns: TURNS,
    },
    officialControlPoints: {
      drs: [
        { distanceFromTurnMeters: 0, kind: "detection", turn: 19, zone: 1 },
        { distanceFromTurnMeters: 130, kind: "activation-after", turn: 19, zone: 1 },
      ],
      sectorBoundaries: [
        { absoluteDistanceMeters: 2_254, sector: 2 },
        { absoluteDistanceMeters: 5_074, sector: 3 },
      ],
      speedTrap: { afterTurnMeters: 30, turn: 4 },
    },
    officialSources: [
      {
        role: "2026 lap length, turns, sectors, speed trap, overtake zone, pit lane and 42 garages",
        url: "https://www.fia.com/documents/season/season-2026-2072/championships/fia-formula-one-world-championship-14",
      },
      {
        role: "current official Belgian GP grandstand categories and locations",
        url: "https://www.spagrandprix.com/en/ticketing/ticket/map",
      },
      {
        role: "DTM 2021-2022 specification, CRS, datum, acquisition and licence",
        url: "https://geoportail.wallonie.be/catalogue/a004e570-99d6-4fe5-b83d-49b774409278.html",
      },
      {
        role: "DSM 2021-2022 specification, CRS, datum, acquisition and licence",
        url: "https://geoportail.wallonie.be/catalogue/e82665e2-4f89-4b7b-87a0-e77a4d4d9c5b.html",
      },
    ],
    schemaVersion: 3,
    sourceDirectory: resolvedSourceDirectory,
    sourceManifest,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function stand(name, start, end, side, offset, depth, height, rows, options = {}) {
  return { depth, end, height, name, offset, rows, side, start, ...options };
}
