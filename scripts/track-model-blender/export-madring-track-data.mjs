import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadMadringData, MADRING_BOUNDS } from "./download-madring-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Chainage is on the unscaled municipal centreline, in race direction from its CAD origin.
// The official diagram supplies marker positions; these are not FIA timing survey coordinates.
export const MADRING_TURNS = [
  [1, 261], [2, 312], [3, 447], [4, 1122], [5, 1353], [6, 1419],
  [7, 1731], [8, 1797], [9, 1896], [10, 2070], [11, 2208], [12, 2500],
  [13, 3108], [14, 3333], [15, 3531], [16, 3735], [17, 3816], [18, 4035],
  [19, 4272], [20, 4611], [21, 4755], [22, 5043],
].map(([number, distanceMeters]) => ({
  number, distanceMeters, name: number === 12 ? "La Monumental" : `Curva ${number}`,
  anchorOffsetMeters: [2, 5, 6, 8, 9, 16, 17, 20].includes(number) ? 28 : 20,
  anchorSide: [1, 3, 7, 9, 11, 13, 15, 17, 19, 21].includes(number) ? -1 : 1,
}));

// Block locations follow the promoter's 2026 event map. Depth/height are visual
// estimates, not surveyed dimensions; the build report preserves that distinction.
const stand = (name, start, end, side, offset, depth = 20, height = 10) =>
  ({ name, start, end, side, offset, depth, height, rows: 16, sectionLengthMeters: 38, maximumPlatformStepMeters: 1.2 });
export const MADRING_GRANDSTANDS = [
  stand("GA1–GA2", 20, 225, "left", 28, 25, 13),
  stand("GB1–GB2", 270, 360, "left", 28),
  stand("GB4", 390, 495, "left", 30),
  stand("GC1–GC2", 590, 870, "right", 29),
  stand("GC3–GC5", 930, 1180, "left", 30),
  stand("GE1–GE3", 1960, 2160, "left", 25),
  stand("GE4–GE6", 2230, 2350, "left", 32),
  stand("GE7–GE9", 2370, 2510, "left", 30),
  stand("GE10–GE13", 2530, 2790, "left", 28),
  stand("GD1–GD15", 2310, 2810, "right", 29, 23, 12),
  stand("GE14–GE15", 2860, 3010, "right", 24),
  stand("GE16–GE17", 3125, 3270, "left", 29),
  stand("GE18–GE19", 3360, 3445, "right", 25),
  stand("GE20–GE22", 3565, 3690, "right", 25),
  stand("GE24", 3320, 3430, "left", 70),
  stand("GE25", 3080, 3170, "right", 65),
  stand("GF1–GF3", 4090, 4230, "right", 28),
];

export async function exportMadringTrackData({ forceSources = false, outputPath, sourceDirectory } = {}) {
  sourceDirectory = path.resolve(sourceDirectory ?? path.join(root, ".track-model-build/madring-source"));
  const sourceManifest = await downloadMadringData({ force: forceSources, sourceDirectory });
  const payload = {
    generatorVersion: "1.0.0", schemaVersion: 1, sourceDirectory, sourceManifest,
    grandstands: MADRING_GRANDSTANDS,
    model: {
      id: "madring", bounds: MADRING_BOUNDS, center: { x: 447550, y: 4480375 },
      lapLengthMeters: 5416, trackWidthMeters: 12, turns: MADRING_TURNS,
      municipalCenterlineRecord: 65, municipalTrackEdgeRecords: [6, 66],
      pitLaneWayId: 1552567031, pitBuildingRecord: 54, pitBoxes: 14,
      startFinishDistanceMeters: 40,
      auxiliaryTurns: [{ label: "5A", distanceMeters: 1380, side: -1 }, { label: "20A", distanceMeters: 4650, side: -1 }],
      tunnels: [
        { name: "M11_West", start: 1420, end: 1500, deckStart: 1432, deckEnd: 1493 },
        { name: "M11_East", start: 3880, end: 4030, deckStart: 3893, deckEnd: 4018 },
      ],
    },
    officialControlPoints: {
      drs: [], // 2026 F1 diagram identifies Straight Mode, not legacy DRS zones.
      sectorBoundaries: [{ sector: 2, absoluteDistanceMeters: 1510 }, { sector: 3, absoluteDistanceMeters: 3630 }],
      speedTrap: { turn: 4, beforeTurnMeters: 20 },
      authority: "Official F1 2026 diagram, map-derived chainage; FIA event timing survey unavailable at retrieval",
    },
  };
  outputPath ??= path.join(root, ".track-model-build/madring.json");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}
