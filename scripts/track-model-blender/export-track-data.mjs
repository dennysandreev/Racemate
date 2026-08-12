import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  downloadZandvoortData,
  ZANDVOORT_BOUNDS_RD,
} from "./download-zandvoort-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

const MAIN_CIRCUIT_WAY_IDS = [
  1311522211,
  1311522212,
  1313671989,
  1311522213,
  1313671990,
  1311522214,
  1311522215,
  1311522216,
  1311522217,
  1311522218,
  1311566938,
  1311566937,
  1313671991,
  1311566939,
  1313671992,
  1311566940,
  1311710253,
  24626850,
  1311765615,
  1311802779,
  1311822339,
  1311822340,
  1311822341,
  1311879069,
];

const TURNS = [
  [1, 748, "Tarzanbocht"],
  [2, 1_062, "Gerlachbocht"],
  [3, 1_215, "Hugenholtzbocht"],
  [4, 1_380, "Hunserug"],
  [5, 1_535, "Bocht 5"],
  [6, 1_700, "Rob Slotemakerbocht"],
  [7, 2_035, "Scheivlak"],
  [8, 2_430, "Mastersbocht"],
  [9, 2_620, "Bocht 9"],
  [10, 2_825, "CM.com Bocht"],
  [11, 3_463, "Hans Ernstbocht"],
  [12, 3_535, "Hans Ernstbocht"],
  [13, 3_865, "Bocht 13"],
  [14, 4_160, "Arie Luyendykbocht"],
].map(([number, distanceMeters, name]) => ({ distanceMeters, name, number }));

const GRANDSTANDS = [
  { depth: 18, end: 555, height: 13, name: "Main", offset: 18, rows: 24, side: "left", start: 65 },
  { depth: 18, end: 535, height: 12, name: "Pit", offset: 27, rows: 22, side: "right", start: 110 },
  { depth: 16, end: 695, height: 11, name: "Tarzan-In", offset: 18, rows: 20, side: "left", start: 565 },
  { depth: 18, end: 820, height: 12, name: "Tarzan-Out", offset: 24, rows: 22, side: "right", start: 690 },
  { depth: 18, end: 1_045, height: 12, name: "Hairpin 1", offset: 24, rows: 22, side: "left", start: 900 },
  { depth: 18, end: 1_205, height: 12, name: "Hairpin 2", offset: 27, rows: 22, side: "left", start: 1_045 },
  { depth: 18, end: 2_525, height: 13, name: "Eastside 1", offset: 25, rows: 24, side: "right", start: 2_315 },
  { depth: 18, end: 2_730, height: 13, name: "Eastside 2", offset: 25, rows: 24, side: "right", start: 2_525 },
  { depth: 18, end: 2_935, height: 13, name: "Eastside 3", offset: 25, rows: 24, side: "right", start: 2_730 },
  { depth: 17, end: 3_135, height: 12, name: "Eastside 4", offset: 25, rows: 22, side: "right", start: 2_935 },
  { depth: 18, end: 3_530, height: 13, name: "Arena-In", offset: 26, rows: 24, side: "left", start: 3_365 },
  { depth: 18, end: 3_725, height: 13, name: "Arena", offset: 27, rows: 24, side: "left", start: 3_535 },
  { depth: 17, end: 3_930, height: 12, name: "Arena-Out", offset: 26, rows: 22, side: "left", start: 3_730 },
];

const ORTHOPHOTO_SIZE = { height: 2_258, width: 2_500 };

export const RACE_MOTORHOMES = [
  motorhomeFromOrthophoto("Paddock 01", 888, 748, 18.6, 4.6, -9, "#D7D9D6"),
  motorhomeFromOrthophoto("Paddock 02", 884, 758, 19.8, 4.8, -8, "#23354D"),
  motorhomeFromOrthophoto("Paddock 03", 882, 768, 19.2, 4.8, -9, "#315A83"),
  motorhomeFromOrthophoto("Paddock 04", 876, 778, 18.6, 4.6, -8, "#A52D2A"),
  motorhomeFromOrthophoto("Paddock 05", 870, 798, 18.6, 4.6, -9, "#C66C5D"),
  motorhomeFromOrthophoto("Paddock 06", 870, 817, 18.0, 4.5, -9, "#E3E4DF"),
  motorhomeFromOrthophoto("Paddock 07", 868, 824, 18.0, 4.4, -8, "#F0EFEA"),
  motorhomeFromOrthophoto("Paddock 08", 864, 831, 17.4, 4.4, -8, "#D9D9D4"),
  motorhomeFromOrthophoto("Paddock 09", 861, 838, 17.4, 4.4, -8, "#E2E1DC"),
  motorhomeFromOrthophoto("Paddock 10", 859, 845, 18.6, 4.5, -10, "#E3E4DF"),
  motorhomeFromOrthophoto("Paddock 11", 857, 852, 18.0, 4.4, -9, "#F0EFEA"),
];

export async function exportTrackData({
  forceSources = false,
  modelId,
  outputPath,
  sourceDirectory,
}) {
  if (modelId === "hungaroring") {
    const { exportHungaroringTrackData } = await import("./export-hungaroring-track-data.mjs");
    return exportHungaroringTrackData({
      forceSources,
      outputPath,
      sourceDirectory,
    });
  }

  if (modelId === "spa") {
    const { exportSpaTrackData } = await import("./export-spa-track-data.mjs");
    return exportSpaTrackData({
      forceSources,
      outputPath,
      sourceDirectory,
    });
  }

  if (modelId !== "zandvoort") {
    throw new Error(`3D build is not configured for track: ${modelId}`);
  }

  const resolvedSourceDirectory = sourceDirectory
    ? path.resolve(sourceDirectory)
    : path.join(projectRoot, ".track-model-build/zandvoort-source");
  const sourceManifest = await downloadZandvoortData({
    force: forceSources,
    sourceDirectory: resolvedSourceDirectory,
  });
  const payload = {
    generatorVersion: "2.1.0",
    grandstands: GRANDSTANDS,
    model: {
      bounds: ZANDVOORT_BOUNDS_RD,
      center: {
        x: (ZANDVOORT_BOUNDS_RD.minX + ZANDVOORT_BOUNDS_RD.maxX) / 2,
        y: (ZANDVOORT_BOUNDS_RD.minY + ZANDVOORT_BOUNDS_RD.maxY) / 2,
      },
      id: "zandvoort",
      lapLengthMeters: 4_259,
      mainCircuitWayIds: MAIN_CIRCUIT_WAY_IDS,
      pitLaneWayId: 38_144_527,
      trackWidthMeters: 10,
      turns: TURNS,
    },
    officialControlPoints: {
      drs: [
        { distanceFromTurnMeters: 0, kind: "detection", turn: 10, zone: 1 },
        { distanceFromTurnMeters: 50, kind: "activation-after", turn: 10, zone: 1 },
        { distanceFromTurnMeters: 20, kind: "detection-after", turn: 12, zone: 2 },
        { distanceFromTurnMeters: 40, kind: "activation-after", turn: 13, zone: 2 },
      ],
      sectorBoundaries: [
        { beforeTurnMeters: 110, sector: 2, turn: 7 },
        { beforeTurnMeters: 150, sector: 3, turn: 11 },
      ],
      speedTrap: { beforeTurnMeters: 95, turn: 1 },
    },
    raceMotorhomes: RACE_MOTORHOMES,
    officialSources: [
      {
        role: "lap length, turns, sectors, speed trap, pit lane and DRS",
        url: "https://www.fia.com/system/files/decision-document/2025_dutch_grand_prix_-_event_notes_-_circuit_map_pit_lane_map_emergency_exit_map_quarantine_zone_and_red_zones_.pdf",
      },
      {
        role: "official grandstand locations, names and section numbering",
        url: "https://dutchgp.com/app/uploads/2025/07/2025_F1-Wayfinding-Map_Negative_Netherlands_VISUAL.pdf",
      },
      {
        role: "current 2026 grandstand catalogue and Eastside availability",
        url: "https://dutchgp.com/en/tribunes/",
      },
    ],
    schemaVersion: 2,
    sourceDirectory: resolvedSourceDirectory,
    sourceManifest,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function motorhomeFromOrthophoto(name, pixelX, pixelY, length, width, headingDeg, color) {
  const x = ZANDVOORT_BOUNDS_RD.minX +
    (pixelX / ORTHOPHOTO_SIZE.width) * (ZANDVOORT_BOUNDS_RD.maxX - ZANDVOORT_BOUNDS_RD.minX);
  const y = ZANDVOORT_BOUNDS_RD.maxY -
    (pixelY / ORTHOPHOTO_SIZE.height) * (ZANDVOORT_BOUNDS_RD.maxY - ZANDVOORT_BOUNDS_RD.minY);

  return {
    centerRd: { x: round(x), y: round(y) },
    color,
    headingDeg,
    lengthMeters: length,
    name,
    sourcePixel: { x: pixelX, y: pixelY },
    widthMeters: width,
  };
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}

function readArguments(argv) {
  const modelId = argv.find((value) => !value.startsWith("--")) ?? "zandvoort";
  const outputFlagIndex = argv.indexOf("--output");
  const sourceFlagIndex = argv.indexOf("--source");
  return {
    forceSources: argv.includes("--force-sources"),
    modelId,
    outputPath: outputFlagIndex >= 0
      ? path.resolve(projectRoot, argv[outputFlagIndex + 1])
      : path.join(projectRoot, ".track-model-build", `${modelId}.json`),
    sourceDirectory: sourceFlagIndex >= 0
      ? path.resolve(projectRoot, argv[sourceFlagIndex + 1])
      : undefined,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = readArguments(process.argv.slice(2));
  const payload = await exportTrackData(options);
  console.log(`Exported ${payload.model.id} geodata build configuration to ${path.relative(projectRoot, options.outputPath)}`);
}
