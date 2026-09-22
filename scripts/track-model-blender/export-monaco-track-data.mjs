import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  downloadMonacoData,
  MONACO_BOUNDS_UTM32N,
  MONACO_SYNTHETIC_CIRCUIT_WAY_ID,
  MONACO_SYNTHETIC_PIT_WAY_ID,
} from "./download-monaco-data.mjs";

import { monacoPitExit } from "./monaco-geometry.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

const START_FINISH_REFERENCE = { lat: 43.7350269, lon: 7.4212652 };

// Apex positions checked on the registered OSM line and FIA corner sequence.
// FIA sector/control distances remain independent of these visual anchors.
const TURNS = [
  [1, 219, "Sainte Dévote"],
  [2, 604, "Beau Rivage"],
  [3, 759, "Massenet"],
  [4, 897, "Casino"],
  [5, 1_124, "Mirabeau Haute"],
  [6, 1_255, "Grand Hotel Hairpin"],
  [7, 1_345, "Mirabeau Bas"],
  [8, 1_438, "Portier"],
  [9, 1_750, "Tunnel"],
  [10, 2_090, "Nouvelle Chicane"],
  [11, 2_132, "Nouvelle Chicane"],
  [12, 2_374, "Tabac"],
  [13, 2_537, "Louis Chiron"],
  [14, 2_573, "Piscine"],
  [15, 2_698, "Piscine"],
  [16, 2_726, "Piscine"],
  [17, 2_788, "Piscine"],
  [18, 2_921, "La Rascasse"],
  [19, 3_015, "Anthony Noghès"],
].map(([number, distanceMeters, name]) => ({
  anchorOffsetMeters: 0,
  anchorHeightMeters: number === 9 ? 6 : 1.2,
  distanceMeters,
  name,
  number,
}));

export async function exportMonacoTrackData({
  forceSources = false,
  outputPath,
  sourceDirectory,
}) {
  const resolvedSourceDirectory = sourceDirectory
    ? path.resolve(sourceDirectory)
    : path.join(projectRoot, ".track-model-build/monaco-source");
  const sourceManifest = await downloadMonacoData({
    force: forceSources,
    sourceDirectory: resolvedSourceDirectory,
  });
  const osm = JSON.parse(await readFile(
    path.join(resolvedSourceDirectory, "openstreetmap-raceway.json"),
    "utf8",
  ));
  const circuit = osm.elements.find(
    (element) => element.type === "way" && element.id === MONACO_SYNTHETIC_CIRCUIT_WAY_ID,
  );
  if (!circuit?.geometry?.length) throw new Error("Joined Monaco centreline is missing");
  const sourceCenterline = circuit.geometry.map(({ lat, lon }) => utm32nFromWgs84(lat, lon));
  const sourceStartFinishOffsetMeters = nearestDistance(
    sourceCenterline,
    utm32nFromWgs84(START_FINISH_REFERENCE.lat, START_FINISH_REFERENCE.lon),
  );
  const pitWay = osm.elements.find((element) => element.id === MONACO_SYNTHETIC_PIT_WAY_ID);
  const pitLaneGeometry = monacoPitExit(sourceCenterline, pitWay.geometry.map(({ lat, lon }) => utm32nFromWgs84(lat, lon)), sourceStartFinishOffsetMeters, osm.elements.find((element) => element.id === 1388331347).geometry.map(({ lat, lon }) => utm32nFromWgs84(lat, lon)));
  const eventLayout = JSON.parse(await readFile(path.join(scriptDirectory, "monaco-event-layout.json"), "utf8"));
  const payload = {
    generatorVersion: "6.0.0",
    grandstands: eventLayout.grandstands,
    eventLayout,
    model: {
      bounds: MONACO_BOUNDS_UTM32N,
      center: {
        x: (MONACO_BOUNDS_UTM32N.minX + MONACO_BOUNDS_UTM32N.maxX) / 2,
        y: (MONACO_BOUNDS_UTM32N.minY + MONACO_BOUNDS_UTM32N.maxY) / 2,
      },
      id: "monaco",
      lapLengthMeters: 3_337,
      mainCircuitWayIds: [MONACO_SYNTHETIC_CIRCUIT_WAY_ID],
      pitBoxes: 11,
      pitLaneWayId: MONACO_SYNTHETIC_PIT_WAY_ID,
      pitLaneWidthMeters: 9,
      pitLaneGeometry,
      sourceStartFinishOffsetMeters: round(sourceStartFinishOffsetMeters),
      startFinishDistanceMeters: 0,
      trackWidthMeters: 9,
      tunnel: { endDistanceMeters: 1_876.65, startDistanceMeters: 1_514.9 },
      portierCover: { startDistanceMeters: 1_411.73, endDistanceMeters: 1_429.73 },
      turns: TURNS,
    },
    officialControlPoints: {
      drs: [
        { distanceFromTurnMeters: 80, kind: "overtake-detection-after", turn: 16, zone: 1 },
        { distanceFromTurnMeters: 40, kind: "overtake-activation-after", turn: 18, zone: 1 },
      ],
      sectorBoundaries: [
        { absoluteDistanceMeters: 1_051, sector: 2 },
        { absoluteDistanceMeters: 2_470, sector: 3 },
      ],
      speedTrap: { beforeTurnMeters: 190, turn: 10 },
    },
    officialSources: [
      {
        role: "FIA Monaco 2026 support-series circuit map; geometry cross-check only, F1 control points use Document 7 below",
        url: "https://www.fia.com/system/files/decision-document/2026_monaco_event_-_circuit_map_-_monaco_2026_v1.pdf",
      },
      {
        role: "FIA Monaco 2026 Document 7: current circuit and 11-team pit-lane drawing",
        url: "https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf",
      },
      {
        role: "official ACM Formula 1 2026 grandstand inventory",
        url: "https://monaco-grandprix.com/en/edition/formula-1-grand-prix-de-monaco-2026/",
      },
      {
        role: "official Monaco government orthophoto service and provenance",
        url: "https://tiles.arcgis.com/tiles/DkYiS0lDHb5soLgl/arcgis/rest/services/SIGM_Orthophoto_2020_WGS84_2/MapServer",
      },
      {
        role: "IGN LiDAR HD 0.5 m MNT/MNS; IGN69 datum, 2021 acquisition",
        url: "https://www.data.gouv.fr/datasets/mnt-lidar-hd",
      },
      {
        role: "ACM 2026 engineering event plan and FIA garage dimensions",
        url: "https://www.fia.com/sites/default/files/media_kit_2026_gb_03.06_1.pdf",
      },
      {
        role: "Audi Monaco 2026 account: three-storey garages and separate paddock on Quai Antoine I",
        url: "https://www.audif1.com/en/news/2026/the-race-between-races",
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

export function utm32nFromWgs84(lat, lon) {
  const semiMajor = 6_378_137;
  const flattening = 1 / 298.257223563;
  const scale = 0.9996;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondaryEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const radians = Math.PI / 180;
  const latitude = lat * radians;
  const longitudeDelta = (lon - 9) * radians;
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
    500_000 + scale * radius * (
      a + (1 - t + c) * a ** 3 / 6
      + (5 - 18 * t + t ** 2 + 72 * c - 58 * secondaryEccentricitySquared) * a ** 5 / 120
    ),
    scale * (
      meridionalArc + radius * tangent * (
        a ** 2 / 2
        + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24
        + (61 - 58 * t + t ** 2 + 600 * c - 330 * secondaryEccentricitySquared) * a ** 6 / 720
      )
    ),
  ];
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
    const separation = Math.hypot(projected[0] - target[0], projected[1] - target[1]);
    if (separation < nearest.distance) {
      nearest = { distance: separation, progress: total + Math.sqrt(lengthSquared) * blend };
    }
    total += Math.sqrt(lengthSquared);
  }
  return nearest.progress;
}

function round(value) {
  return Math.round(value * 1_000) / 1_000;
}
