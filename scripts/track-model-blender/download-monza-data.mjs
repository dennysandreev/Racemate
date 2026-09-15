import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const MONZA_BOUNDS_WGS84 = { south: 45.600, west: 9.265, north: 45.635, east: 9.310 };
export const MONZA_BOUNDS_UTM32N = { minX: 520_650, minY: 5_049_620, maxX: 524_180, maxY: 5_053_560 };

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const FIA_MAP_URL = "https://www.fia.com/system/files/decision-document/2025_italian_grand_prix_-_event_notes_-_circuit_map_pit_lane_emergency_exit_map_quarantine_zone_and_red_zones.pdf";
const EVENT_MAP_URL = "https://www.monzanet.it/wp-content/uploads/2026/06/GP_F1_2026_LISTINO_PREZZI_6_17.pdf";
const ORTHOPHOTO_URL = "https://wms.pcn.minambiente.it/ogc?map=/ms_ogc/WMS_v1.3/raster/ortofoto_colore_12.map&service=WMS&version=1.3.0&request=GetMap&layers=OI.ORTOIMMAGINI.2012.32&styles=&crs=EPSG:32632&bbox=520650,5049620,524180,5053560&width=2048&height=2048&format=image/jpeg&transparent=false";
const ELEVATION_ZOOM = 12;

export async function downloadMonzaData({ force = false, sourceDirectory }) {
  await mkdir(sourceDirectory, { recursive: true });
  const manifestPath = path.join(sourceDirectory, "source-manifest.json");
  if (!force) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      await Promise.all(manifest.sources.map((source) => stat(path.join(sourceDirectory, source.file))));
      await verifySources(sourceDirectory, manifest.sources);
      return manifest;
    } catch { /* Rebuild an incomplete or stale source cache. */ }
  }

  const bbox = `${MONZA_BOUNDS_WGS84.south},${MONZA_BOUNDS_WGS84.west},${MONZA_BOUNDS_WGS84.north},${MONZA_BOUNDS_WGS84.east}`;
  const query = `[out:json][timeout:120];(way[highway=raceway](${bbox});way[service=pit_lane](${bbox});way[building](${bbox});way[barrier](${bbox});node[natural=tree](${bbox}););out body geom;`;
  const [osmBody, fiaPdf, eventMap, orthophoto] = await Promise.all([
    fetchBinary(OVERPASS_URL, { body: new URLSearchParams({ data: query }), method: "POST" }),
    fetchBinary(FIA_MAP_URL),
    fetchBinary(EVENT_MAP_URL),
    fetchBinary(ORTHOPHOTO_URL),
  ]);
  const osm = JSON.parse(osmBody.toString("utf8"));
  const filtered = {
    raceway: filterOsm(osm, (element) => element.type === "way" && (element.tags?.highway === "raceway" || element.tags?.service === "pit_lane")),
    buildings: filterOsm(osm, (element) => element.type === "way" && Boolean(element.tags?.building)),
    barriers: filterOsm(osm, (element) => element.type === "way" && Boolean(element.tags?.barrier)),
    trees: filterOsm(osm, (element) => element.type === "node" && element.tags?.natural === "tree"),
  };
  const derived = [
    ["openstreetmap-raceway.json", filtered.raceway],
    ["openstreetmap-buildings.json", filtered.buildings],
    ["openstreetmap-barriers.json", filtered.barriers],
    ["openstreetmap-trees.json", filtered.trees],
  ];
  await Promise.all(derived.map(([file, body]) => writeFile(path.join(sourceDirectory, file), `${JSON.stringify(body, null, 2)}\n`)));

  const elevation = await downloadElevationTiles(sourceDirectory);
  const tileManifestBody = Buffer.from(`${JSON.stringify({ boundsWgs84: MONZA_BOUNDS_WGS84, elevation, schemaVersion: 1 }, null, 2)}\n`);
  const raw = [
    ["openstreetmap-overpass.json", osmBody],
    ["fia-2025-italian-grand-prix-circuit-map.pdf", fiaPdf],
    ["monza-2026-grandstand-map.pdf", eventMap],
    ["pcn-orthophoto-2012.jpg", orthophoto],
    ["terrain-tile-manifest.json", tileManifestBody],
  ];
  await Promise.all(raw.map(([file, body]) => writeFile(path.join(sourceDirectory, file), body)));

  const descriptions = [
    ["openstreetmap-overpass.json", OVERPASS_URL, "ODbL 1.0", "live snapshot at retrieval", "raw current circuit context", "surveyed vectors", "EPSG:4326", null],
    ...derived.map(([file]) => [file, "https://www.openstreetmap.org/copyright", "ODbL 1.0", "derived from live OSM", `Blender-ready ${file.slice(14, -5)} layer`, "lossless geometry extraction", "EPSG:4326", null]),
    ["fia-2025-italian-grand-prix-circuit-map.pdf", FIA_MAP_URL, "official FIA event document; reference use", "2025 event (latest published FIA operational map at build time)", "lap length, turns, sectors, speed trap, DRS and pit drawing", "vector PDF", "document reference", null],
    ["monza-2026-grandstand-map.pdf", EVENT_MAP_URL, "official promoter document; reference use", "2026 event", "current named grandstand inventory", "vector PDF", "document reference", null],
    ["pcn-orthophoto-2012.jpg", ORTHOPHOTO_URL, "Italian National Geoportal public WMS; attribution required", "2012", "real terrain colour and permanent venue context", "0.5 m source; 2048 px projected export", "EPSG:32632", null],
    ["terrain-tile-manifest.json", "https://docs.versatiles.org/basics/tilesets.html#elevation", "open tile sources; see VersaTiles attribution", "retrieved at build time", "unexaggerated terrain elevation", "Terrarium z12, about 19 m/pixel", "EPSG:3857 sampled to EPSG:32632", "Terrarium DEM metres"],
  ];
  const sources = [];
  for (const [file, url, license, date, role, resolution, crs, verticalDatum] of descriptions) {
    const body = await readFile(path.join(sourceDirectory, file));
    sources.push({ bbox: MONZA_BOUNDS_UTM32N, bytes: body.length, crs, date, file, license, resolution, role, sha256: sha256(body), url, verticalDatum });
  }
  const manifest = {
    bounds: MONZA_BOUNDS_UTM32N,
    coordinateReferenceSystem: "WGS 84 / UTM zone 32N (EPSG:32632)",
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sources,
    tileMembers: elevation.members,
    verticalDatum: "Terrarium DEM metres; no vertical exaggeration",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function downloadElevationTiles(sourceDirectory) {
  const tileSize = 512;
  const corners = [lonLatToTile(MONZA_BOUNDS_WGS84.west, MONZA_BOUNDS_WGS84.north, ELEVATION_ZOOM), lonLatToTile(MONZA_BOUNDS_WGS84.east, MONZA_BOUNDS_WGS84.south, ELEVATION_ZOOM)];
  const members = [];
  const directory = path.join(sourceDirectory, "elevation-tiles");
  await mkdir(directory, { recursive: true });
  for (let x = corners[0].x; x <= corners[1].x; x += 1) for (let y = corners[0].y; y <= corners[1].y; y += 1) {
    const file = `elevation-tiles/${ELEVATION_ZOOM}-${x}-${y}.png`;
    const body = await fetchBinary(`https://tiles.versatiles.org/tiles/elevation/${ELEVATION_ZOOM}/${x}/${y}.png`);
    await writeFile(path.join(sourceDirectory, file), body);
    members.push({ bytes: body.length, file, sha256: sha256(body), x, y });
  }
  return { members, tileSize, zoom: ELEVATION_ZOOM };
}

function lonLatToTile(lon, lat, zoom) {
  const scale = 2 ** zoom;
  return { x: Math.floor((lon + 180) / 360 * scale), y: Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * scale) };
}
function filterOsm(osm, predicate) { return { elements: osm.elements.filter(predicate), generator: osm.generator, osm3s: osm.osm3s, version: osm.version }; }
async function fetchBinary(url, init) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, headers: { "user-agent": "RaceSide Monza digital-twin builder/1.0 (raceside.ru)", ...init?.headers } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1))); }
  }
  throw lastError;
}
async function verifySources(sourceDirectory, sources) {
  await Promise.all(sources.map(async (source) => { const body = await readFile(path.join(sourceDirectory, source.file)); if (body.length !== source.bytes || sha256(body) !== source.sha256) throw new Error(`Cached source checksum mismatch: ${source.file}`); }));
}
function sha256(body) { return createHash("sha256").update(body).digest("hex"); }
