import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MONACO_BOUNDS_WGS84 = {
  south: 43.7299,
  west: 7.4181,
  north: 43.7440,
  east: 7.4334,
};

export const MONACO_BOUNDS_UTM32N = {
  minX: 372_640,
  minY: 4_843_100,
  maxX: 373_820,
  maxY: 4_844_620,
};

export const MONACO_CIRCUIT_RELATION_ID = 148_194;
export const MONACO_SYNTHETIC_CIRCUIT_WAY_ID = -148_194;
export const MONACO_SYNTHETIC_PIT_WAY_ID = -148_195;

const OSM_API_URL = `https://api.openstreetmap.org/api/0.6/map?bbox=${[
  MONACO_BOUNDS_WGS84.west,
  MONACO_BOUNDS_WGS84.south,
  MONACO_BOUNDS_WGS84.east,
  MONACO_BOUNDS_WGS84.north,
].join(",")}`;
const FIA_CIRCUIT_MAP_URL =
  "https://www.fia.com/system/files/decision-document/2026_monaco_event_-_circuit_map_-_monaco_2026_v1.pdf";
const FIA_COMPETITION_NOTES_URL =
  "https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf";
const ACM_EVENT_MAP_URL =
  "https://acm.mc/wp-content/uploads/2025/05/Plein-tarif-GB-2026-F1.jpg";
const ORTHOPHOTO_SERVICE_URL =
  "https://tiles.arcgis.com/tiles/DkYiS0lDHb5soLgl/arcgis/rest/services/SIGM_Orthophoto_2020_WGS84_2/MapServer";
const ORTHOPHOTO_METADATA_URL = `${ORTHOPHOTO_SERVICE_URL}?f=pjson`;
const VERSATILES_DOCUMENTATION_URL = "https://docs.versatiles.org/basics/tilesets.html";
const ORTHOPHOTO_ZOOM = 18;
const ELEVATION_ZOOM = 12;

export async function downloadMonacoData({ force = false, sourceDirectory }) {
  await mkdir(sourceDirectory, { recursive: true });
  const manifestPath = path.join(sourceDirectory, "source-manifest.json");

  if (!force) {
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (manifest) {
      // A corrupt cache must never silently change the source snapshot.
      await verifyTileMembers(sourceDirectory, { sources: [{ members: manifest.sources }] });
      await verifyTileMembers(sourceDirectory, manifest);
      return supplementMonacoSources(sourceDirectory, manifest, false);
    }
  }

  const [osmXml, fiaCircuitMap, fiaCompetitionNotes, eventMap, orthophotoMetadata] =
    await Promise.all([
      fetchBinary(OSM_API_URL),
      fetchBinary(FIA_CIRCUIT_MAP_URL),
      fetchBinary(FIA_COMPETITION_NOTES_URL),
      fetchBinary(ACM_EVENT_MAP_URL),
      fetchBinary(ORTHOPHOTO_METADATA_URL),
    ]);
  const osm = parseOsmXml(osmXml.toString("utf8"));
  const circuitRelation = osm.elements.find(
    (element) => element.type === "relation" && element.id === MONACO_CIRCUIT_RELATION_ID,
  );
  if (!circuitRelation) throw new Error(`OSM circuit relation ${MONACO_CIRCUIT_RELATION_ID} is missing`);

  const ways = new Map(osm.elements.filter((element) => element.type === "way")
    .map((element) => [element.id, element]));
  const circuitWayIds = circuitRelation.members
    .filter((member) => member.type === "way" && member.role !== "pit_lane")
    .map((member) => member.ref)
    .filter((id) => id !== 1_388_331_347);
  const mainGeometry = orientRaceDirection(
    assembleOrderedWays(ways, circuitWayIds, true),
    { lat: 43.7350269, lon: 7.4212652 },
  );
  const pitGeometry = assemblePitLane(ways.get(850_261_588), ways.get(1_388_331_347));
  const syntheticCircuit = {
    geometry: mainGeometry,
    id: MONACO_SYNTHETIC_CIRCUIT_WAY_ID,
    sourceWayIds: circuitWayIds,
    tags: { highway: "raceway", name: "Circuit de Monaco", source: "OSM relation 148194" },
    type: "way",
  };
  const syntheticPitLane = {
    geometry: pitGeometry,
    id: MONACO_SYNTHETIC_PIT_WAY_ID,
    sourceWayIds: [850_261_588, 1_388_331_347],
    tags: { highway: "raceway", service: "pit_lane", source: "OSM pit lane and pit exit" },
    type: "way",
  };
  const racewayMemberIds = new Set([
    ...circuitRelation.members.filter((member) => member.type === "way").map((member) => member.ref),
    850_261_588,
    1_388_331_347,
  ]);
  const raceway = layer([
    ...osm.elements.filter((element) =>
      (element.type === "way" && racewayMemberIds.has(element.id))
      || (element.type === "node" && element.tags?.raceway)
      || (element.type === "relation" && element.id === MONACO_CIRCUIT_RELATION_ID)),
    syntheticCircuit,
    syntheticPitLane,
  ]);
  const buildings = layer(osm.elements.filter(
    (element) => element.type === "way" && element.tags?.building,
  ));
  const barriers = layer(osm.elements.filter(
    (element) => element.type === "way" && element.tags?.barrier,
  ));
  const trees = layer(osm.elements.filter(
    (element) => element.type === "node" && element.tags?.natural === "tree",
  ));

  const derivedFiles = [
    ["openstreetmap-raceway.json", raceway],
    ["openstreetmap-buildings.json", buildings],
    ["openstreetmap-barriers.json", barriers],
    ["openstreetmap-trees.json", trees],
  ];
  await Promise.all(derivedFiles.map(([file, body]) =>
    writeFile(path.join(sourceDirectory, file), `${JSON.stringify(body, null, 2)}\n`, "utf8")
  ));

  const [orthophotoTiles, elevationTiles] = await Promise.all([
    downloadTileSet({
      bounds: MONACO_BOUNDS_WGS84,
      directory: path.join(sourceDirectory, "orthophoto-tiles"),
      tileSize: 256,
      urlForTile: (zoom, x, y) => `${ORTHOPHOTO_SERVICE_URL}/tile/${zoom}/${y}/${x}`,
      zoom: ORTHOPHOTO_ZOOM,
    }),
    downloadTileSet({
      bounds: MONACO_BOUNDS_WGS84,
      directory: path.join(sourceDirectory, "elevation-tiles"),
      tileSize: 512,
      urlForTile: (zoom, x, y) => `https://tiles.versatiles.org/tiles/elevation/${zoom}/${x}/${y}`,
      zoom: ELEVATION_ZOOM,
    }),
  ]);
  const tileManifest = {
    boundsWgs84: MONACO_BOUNDS_WGS84,
    elevation: elevationTiles,
    orthophoto: orthophotoTiles,
    schemaVersion: 1,
  };
  const tileManifestBody = Buffer.from(`${JSON.stringify(tileManifest, null, 2)}\n`);

  const directFiles = [
    ["terrain-tile-manifest.json", tileManifestBody],
    ["fia-2026-monaco-circuit-map.pdf", fiaCircuitMap],
    ["fia-2026-monaco-competition-notes.pdf", fiaCompetitionNotes],
    ["acm-2026-formula-1-event-map.jpg", eventMap],
    ["monaco-orthophoto-service-metadata.json", orthophotoMetadata],
    ["openstreetmap-map.osm", osmXml],
  ];
  await Promise.all(directFiles.map(([file, body]) => writeFile(path.join(sourceDirectory, file), body)));

  const files = [
    {
      body: osmXml,
      date: "live OSM snapshot at retrieval",
      file: "openstreetmap-map.osm",
      license: "ODbL 1.0",
      resolution: "current surveyed vector geometry inside the scene bbox",
      role: "raw circuit relation, pit lane, buildings, barriers and mapped trees",
      url: OSM_API_URL,
    },
    ...derivedFiles.map(([file]) => ({
      body: null,
      date: "derived without coordinate loss from the raw OSM snapshot",
      file,
      license: "ODbL 1.0",
      resolution: "original OSM vertices and tags; circuit members joined in relation order",
      role: `Blender-ready ${file.replace("openstreetmap-", "").replace(".json", "")} layer`,
      url: "https://www.openstreetmap.org/copyright",
    })),
    {
      body: tileManifestBody,
      date: "official Monaco orthophoto service current at retrieval; elevation tiles retrieved 2026-08-13",
      file: "terrain-tile-manifest.json",
      license: "Orthophoto copyright DPUM, Gouvernement Princier de Monaco; public service, no explicit redistribution licence in service metadata. Legacy elevation CC BY 4.0",
      members: [...orthophotoTiles.members, ...elevationTiles.members],
      resolution: "official orthophoto z18 (~0.60 m/pixel); Terrarium elevation z12 (~19 m/pixel)",
      role: "real ground colour and unexaggerated terrain elevation",
      url: ORTHOPHOTO_SERVICE_URL,
    },
    {
      body: orthophotoMetadata,
      date: "service metadata retrieved 2026-08-13; imagery status 2020 with documented 2019/2015 source areas",
      file: "monaco-orthophoto-service-metadata.json",
      license: "Copyright DPUM, Gouvernement Princier de Monaco; public tiled service, attribution required",
      resolution: "ArcGIS service metadata JSON",
      role: "official orthophoto provenance, spatial reference and tile capabilities",
      url: ORTHOPHOTO_METADATA_URL,
    },
    {
      body: fiaCircuitMap,
      date: "2026-06-03; map version 3 issued 2026-05-31",
      file: "fia-2026-monaco-circuit-map.pdf",
      license: "official FIA event document; reference use",
      resolution: "vector PDF",
      role: "support-series circuit map; geometry cross-check only, F1 controls use Document 7",
      url: FIA_CIRCUIT_MAP_URL,
    },
    {
      body: fiaCompetitionNotes,
      date: "current 2026 Monaco Grand Prix competition notes",
      file: "fia-2026-monaco-competition-notes.pdf",
      license: "official FIA event document; reference use",
      resolution: "vector PDF",
      role: "current circuit map, pit-lane drawing, emergency exits and red zone",
      url: FIA_COMPETITION_NOTES_URL,
    },
    {
      body: eventMap,
      date: "official ACM Formula 1 2026 event inventory published 2025-05",
      file: "acm-2026-formula-1-event-map.jpg",
      license: "official Automobile Club de Monaco event reference; reference use",
      resolution: "published event image",
      role: "current 2026 grandstand inventory and ticket categories",
      url: ACM_EVENT_MAP_URL,
    },
  ];

  const sources = [];
  for (const source of files) {
    const body = source.body ?? await readFile(path.join(sourceDirectory, source.file));
    sources.push({
      bbox: MONACO_BOUNDS_UTM32N,
      bytes: body.length,
      crs: source.file.includes("openstreetmap") || source.file.endsWith(".pdf") || source.file.endsWith(".jpg")
        ? "EPSG:4326 / document reference"
        : "EPSG:3857 tiles prepared to EPSG:32632",
      date: source.date,
      file: source.file,
      license: source.license,
      members: source.members,
      resolution: source.resolution,
      role: source.role,
      sha256: sha256(body),
      url: source.url,
      verticalDatum: source.file === "terrain-tile-manifest.json"
        ? "Terrarium source DEM metres"
        : null,
    });
  }

  const manifest = {
    bounds: MONACO_BOUNDS_UTM32N,
    coordinateReferenceSystem: "WGS 84 / UTM zone 32N (EPSG:32632)",
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sources,
    sourceNotes: {
      elevation: VERSATILES_DOCUMENTATION_URL,
      orthophoto: ORTHOPHOTO_SERVICE_URL,
      orthophotoCopyright: "DPUM, Gouvernement Princier de Monaco",
    },
    verticalDatum: "source DEM metres; no vertical exaggeration",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return supplementMonacoSources(sourceDirectory, manifest, force);
}

const LIDAR_URL = (layer) => "https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&EXCEPTIONS=text/xml&REQUEST=GetMap"
  + `&LAYERS=IGNF_LIDAR-HD_${layer}_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93`
  + "&FORMAT=image/geotiff&STYLES=&CRS=EPSG:32632&BBOX=372640,4843100,373820,4844620&WIDTH=1180&HEIGHT=1520";

async function supplementMonacoSources(directory, manifest, force) {
  manifest.sourceNotes = {
    ...manifest.sourceNotes,
    elevation: "https://www.data.gouv.fr/datasets/mnt-lidar-hd",
    legacyElevation: VERSATILES_DOCUMENTATION_URL,
  };
  if (manifest.schemaVersion >= 4 && !force) return manifest;
  const sources = [
    { file: "audi-monaco-2026-garages.html", url: "https://www.audif1.com/en/news/2026/the-race-between-races", role: "three-storey Monaco garages and separate paddock location; no footprint survey", resolution: "team event account", date: "2026-06-10", attribution: "Audi Revolut F1 Team", license: "copyright Audi; factual reference only" },
    { file: "acm-hospitality-2026.pdf", url: "https://acm.mc/wp-content/uploads/2025/05/Hospitalites_ACM_F12026_F-3.pdf", role: "ACM 2026 stand names and harbour hospitality map (page 2)", resolution: "vector PDF", license: "ACM official event reference; reference use" },
    { file: "ign-mnt-1m.tif", url: LIDAR_URL("MNT"), role: "bare-earth terrain", resolution: "1 m export of 0.5 m IGN LiDAR HD MNT" },
    { file: "ign-mns-1m.tif", url: LIDAR_URL("MNS"), role: "measured building roof elevations", resolution: "1 m export of 0.5 m IGN LiDAR HD MNS" },
    {
      file: "ign-lidar-coverage.json",
      url: "https://data.geopf.fr/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=IGNF_LIDAR-HD_METADONNEE:metadata&outputFormat=application/json&srsName=EPSG:4326&bbox=43.7304,7.4188,43.7435,7.4327,urn:ogc:def:crs:EPSG::4326",
      role: "LiDAR acquisition dates, vertical datum and source tile catalogue", resolution: "source tile footprints",
    },
    {
      file: "fia-media-kit-2026.pdf", url: "https://www.fia.com/sites/default/files/media_kit_2026_gb_03.06_1.pdf",
      role: "ACM 27 May 2026 event footprints; FIA garage dimensions and allocation (pages 15–16, 38–39)",
      resolution: "vector PDF", license: "FIA / ACM official event reference; reference use",
    },
  ];
  for (const item of sources) {
    let body;
    try { if (!force) body = await readFile(path.join(directory, item.file)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    body ??= await fetchBinary(item.url);
    if (item.file.endsWith(".tif") && !["II", "MM"].includes(body.subarray(0, 2).toString())) {
      throw new Error(`Expected GeoTIFF from IGN: ${item.file}`);
    }
    await writeFile(path.join(directory, item.file), body);
    const previous = manifest.sources.find((source) => source.file === item.file);
    manifest.sources = manifest.sources.filter((source) => source.file !== item.file);
    manifest.sources.push({
      ...item, bbox: MONACO_BOUNDS_UTM32N, bytes: body.length,
      crs: item.file.endsWith(".tif") ? "EPSG:32632" : "document reference / EPSG:4326",
      date: item.date ?? (item.file.startsWith("ign-") ? "acquired 2021-05-13 / 2021-06-27; published 2025-06-20" : "2026-06-03"),
      retrievedAt: !force && previous ? previous.retrievedAt : new Date().toISOString(), license: item.license ?? "Etalab Open Licence 2.0",
      attribution: item.attribution ?? (item.file.startsWith("ign-") ? "IGN LiDAR HD" : "FIA / Automobile Club de Monaco"),
      sha256: sha256(body), verticalDatum: item.file.startsWith("ign-") ? "IGN69 (EPSG:5720)" : null,
    });
  }
  // Retain relation outer/inner rings and building parts from the same pinned OSM snapshot.
  const fullOsm = parseOsmXml(await readFile(path.join(directory, "openstreetmap-map.osm"), "utf8"));
  const buildingRelations = fullOsm.elements.filter((element) => element.type === "relation" && element.tags?.building);
  const memberIds = new Set(buildingRelations.flatMap((relation) => relation.members.map((member) => member.ref)));
  const buildings = layer(fullOsm.elements.filter((element) =>
    (element.type === "way" && (element.tags?.building || element.tags?.["building:part"] || memberIds.has(element.id)))
    || buildingRelations.includes(element)));
  const buildingBody = Buffer.from(`${JSON.stringify(buildings, null, 2)}\n`);
  await writeFile(path.join(directory, "openstreetmap-buildings.json"), buildingBody);
  Object.assign(manifest.sources.find((source) => source.file === "openstreetmap-buildings.json"), {
    bytes: buildingBody.length, sha256: sha256(buildingBody),
    resolution: "OSM ways, building parts and multipolygons with outer/inner rings",
  });
  // Extend only the imagery tile coverage; existing source tiles remain pinned.
  const tilePath = path.join(directory, "terrain-tile-manifest.json");
  const tiles = JSON.parse(await readFile(tilePath, "utf8"));
  const known = new Set(tiles.orthophoto.members.map((member) => `${member.x}/${member.y}`));
  const nw = lonLatToTile(MONACO_BOUNDS_WGS84.west, MONACO_BOUNDS_WGS84.north, ORTHOPHOTO_ZOOM);
  const se = lonLatToTile(MONACO_BOUNDS_WGS84.east, MONACO_BOUNDS_WGS84.south, ORTHOPHOTO_ZOOM);
  for (let y = nw.y; y <= se.y; y += 1) {
    for (let x = nw.x; x <= se.x; x += 1) {
      if (known.has(`${x}/${y}`)) continue;
      const url = `${ORTHOPHOTO_SERVICE_URL}/tile/${ORTHOPHOTO_ZOOM}/${y}/${x}`;
      const file = `orthophoto-tiles/${ORTHOPHOTO_ZOOM}-${x}-${y}.tile`;
      const body = await fetchBinary(url);
      await writeFile(path.join(directory, file), body);
      tiles.orthophoto.members.push({ file, url, x, y, bytes: body.length, sha256: sha256(body) });
    }
  }
  Object.assign(tiles.orthophoto, { minX: nw.x, minY: nw.y, maxX: se.x, maxY: se.y });
  tiles.boundsWgs84 = MONACO_BOUNDS_WGS84;
  const tileBody = Buffer.from(`${JSON.stringify(tiles, null, 2)}\n`);
  await writeFile(tilePath, tileBody);
  Object.assign(manifest.sources.find((source) => source.file === "terrain-tile-manifest.json"), {
    bytes: tileBody.length, sha256: sha256(tileBody), members: [...tiles.orthophoto.members, ...tiles.elevation.members],
    license: "Orthophoto copyright DPUM, Gouvernement Princier de Monaco; public service, no explicit redistribution licence in service metadata. Legacy elevation CC BY 4.0",
    role: "ground and roof colours; legacy Terrarium tiles retained for provenance, IGN LiDAR is the active elevation source",
  });
  manifest.sources.find((source) => source.file === "fia-2026-monaco-circuit-map.pdf").role = "support-series circuit map; geometry cross-check only, F1 controls use Document 7";
  manifest.schemaVersion = 4;
  manifest.verticalDatum = "IGN69 (EPSG:5720); no vertical exaggeration";
  await writeFile(path.join(directory, "source-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function layer(elements) {
  return {
    elements,
    generator: "RaceSide OSM map parser",
    osm3s: { copyright: "OpenStreetMap contributors, ODbL 1.0" },
    version: 0.6,
  };
}

function assembleOrderedWays(ways, wayIds, closed) {
  const remaining = wayIds.map((wayId) => {
    const way = ways.get(wayId);
    if (!way?.geometry?.length) throw new Error(`OSM way ${wayId} is missing or has no geometry`);
    return { geometry: [...way.geometry], wayId };
  });
  const first = remaining.shift();
  const points = [...first.geometry];
  while (remaining.length > 0) {
    const candidates = remaining.flatMap((candidate, index) => [
      { distance: geoDistance(points.at(-1), candidate.geometry[0]), index, reverse: false },
      { distance: geoDistance(points.at(-1), candidate.geometry.at(-1)), index, reverse: true },
    ]).sort((left, right) => left.distance - right.distance);
    const best = candidates[0];
    if (best.distance > 85) {
      throw new Error(`OSM circuit relation has a ${best.distance.toFixed(1)} m unresolved gap`);
    }
    const [{ geometry }] = remaining.splice(best.index, 1);
    if (best.reverse) geometry.reverse();
    const gap = geoDistance(points.at(-1), geometry[0]);
    if (gap < 0.25) geometry.shift();
    else {
      const previous = points.at(-1);
      const segments = Math.ceil(gap / 5);
      for (let index = 1; index < segments; index += 1) {
        const blend = index / segments;
        points.push({
          lat: previous.lat * (1 - blend) + geometry[0].lat * blend,
          lon: previous.lon * (1 - blend) + geometry[0].lon * blend,
        });
      }
    }
    points.push(...geometry);
  }
  if (closed && geoDistance(points[0], points.at(-1)) > 0.25) points.push(points[0]);
  return points;
}

function assemblePitLane(pitWay, exitWay) {
  if (!pitWay?.geometry?.length || !exitWay?.geometry?.length) {
    throw new Error("Monaco OSM pit-lane or pit-exit geometry is missing");
  }
  let pit = [...pitWay.geometry];
  let exit = [...exitWay.geometry];
  const combinations = [
    { distance: geoDistance(pit.at(-1), exit[0]), reverseExit: false, reversePit: false },
    { distance: geoDistance(pit.at(-1), exit.at(-1)), reverseExit: true, reversePit: false },
    { distance: geoDistance(pit[0], exit[0]), reverseExit: false, reversePit: true },
    { distance: geoDistance(pit[0], exit.at(-1)), reverseExit: true, reversePit: true },
  ].sort((first, second) => first.distance - second.distance)[0];
  if (combinations.reversePit) pit.reverse();
  if (combinations.reverseExit) exit.reverse();
  const connectorLength = geoDistance(pit.at(-1), exit[0]);
  const connectorSegments = Math.max(2, Math.ceil(connectorLength / 8));
  const connector = Array.from({ length: connectorSegments - 1 }, (_, index) => {
    const blend = (index + 1) / connectorSegments;
    return {
      lat: pit.at(-1).lat * (1 - blend) + exit[0].lat * blend,
      lon: pit.at(-1).lon * (1 - blend) + exit[0].lon * blend,
    };
  });
  return [...pit, ...connector, ...exit];
}

function orientRaceDirection(points, startFinish) {
  const closestIndex = points.reduce((best, point, index) =>
    geoDistance(point, startFinish) < geoDistance(points[best], startFinish) ? index : best
  , 0);
  const previous = points[(closestIndex - 1 + points.length - 1) % (points.length - 1)];
  const following = points[(closestIndex + 1) % (points.length - 1)];
  if (following.lat >= previous.lat) return points;
  const core = points.slice(0, -1).reverse();
  return [...core, core[0]];
}

function geoDistance(first, second) {
  const latitude = (first.lat + second.lat) / 2 * Math.PI / 180;
  return Math.hypot(
    (second.lon - first.lon) * 111_320 * Math.cos(latitude),
    (second.lat - first.lat) * 110_540,
  );
}

async function downloadTileSet({ bounds, directory, tileSize, urlForTile, zoom }) {
  await mkdir(directory, { recursive: true });
  const northWest = lonLatToTile(bounds.west, bounds.north, zoom);
  const southEast = lonLatToTile(bounds.east, bounds.south, zoom);
  const requests = [];
  for (let y = northWest.y; y <= southEast.y; y += 1) {
    for (let x = northWest.x; x <= southEast.x; x += 1) requests.push({ x, y });
  }
  const members = await concurrentMap(requests, 8, async ({ x, y }) => {
    const relativeFile = `${path.basename(directory)}/${zoom}-${x}-${y}.tile`;
    const url = urlForTile(zoom, x, y);
    const body = await fetchBinary(url);
    await writeFile(path.join(path.dirname(directory), relativeFile), body);
    return { bytes: body.length, file: relativeFile, sha256: sha256(body), url, x, y };
  });
  return {
    maxX: southEast.x,
    maxY: southEast.y,
    members,
    minX: northWest.x,
    minY: northWest.y,
    tileSize,
    zoom,
  };
}

function parseOsmXml(xml) {
  const nodes = new Map();
  const elements = [];
  for (const match of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) {
    const attributes = parseAttributes(match[1]);
    const node = {
      id: Number(attributes.id),
      lat: Number(attributes.lat),
      lon: Number(attributes.lon),
      tags: parseTags(match[2] ?? ""),
      type: "node",
    };
    nodes.set(attributes.id, node);
    if (Object.keys(node.tags).length > 0) elements.push(node);
  }
  for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const attributes = parseAttributes(match[1]);
    const nodeRefs = [...match[2].matchAll(/<nd ref="(\d+)"\s*\/>/g)].map((entry) => Number(entry[1]));
    elements.push({
      geometry: nodeRefs.map((reference) => nodes.get(String(reference))).filter(Boolean)
        .map(({ lat, lon }) => ({ lat, lon })),
      id: Number(attributes.id),
      nodeRefs,
      tags: parseTags(match[2]),
      timestamp: attributes.timestamp,
      type: "way",
      version: Number(attributes.version),
    });
  }
  for (const match of xml.matchAll(/<relation\b([^>]*)>([\s\S]*?)<\/relation>/g)) {
    const attributes = parseAttributes(match[1]);
    const members = [...match[2].matchAll(/<member\s+([^>]*?)\s*\/>/g)].map((entry) => {
      const member = parseAttributes(entry[1]);
      return { ref: Number(member.ref), role: member.role ?? "", type: member.type };
    });
    elements.push({
      id: Number(attributes.id),
      members,
      tags: parseTags(match[2]),
      timestamp: attributes.timestamp,
      type: "relation",
      version: Number(attributes.version),
    });
  }
  return { elements };
}

function parseAttributes(value) {
  return Object.fromEntries([...value.matchAll(/([\w:.-]+)="([^"]*)"/g)]
    .map((match) => [match[1], decodeXml(match[2])]));
}

function parseTags(value) {
  return Object.fromEntries([...value.matchAll(/<tag k="([^"]+)" v="([^"]*)"\s*\/>/g)]
    .map((match) => [decodeXml(match[1]), decodeXml(match[2])]));
}

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function lonLatToTile(lon, lat, zoom) {
  const scale = 2 ** zoom;
  return {
    x: Math.floor((lon + 180) / 360 * scale),
    y: Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * scale),
  };
}

async function verifyTileMembers(sourceDirectory, manifest) {
  const members = manifest.sources.flatMap((source) => source.members ?? []);
  await Promise.all(members.map(async (member) => {
    const body = await readFile(path.join(sourceDirectory, member.file));
    if (body.length !== member.bytes || sha256(body) !== member.sha256) {
      throw new Error(`Cached source checksum mismatch: ${member.file}`);
    }
  }));
}

async function fetchBinary(url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(180_000),
        headers: { "user-agent": "RaceSide track digital-twin builder/1.0 (raceside.ru)" },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function concurrentMap(values, concurrency, iteratee) {
  const result = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await iteratee(values[index], index);
    }
  }));
  return result;
}

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}
