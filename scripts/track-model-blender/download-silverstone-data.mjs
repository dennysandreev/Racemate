import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const SILVERSTONE_BOUNDS_WGS84 = {
  south: 52.0625,
  west: -1.0305,
  north: 52.0875,
  east: -0.996,
};

export const SILVERSTONE_BOUNDS_UTM30N = {
  minX: 634_950,
  minY: 5_769_780,
  maxX: 637_350,
  maxY: 5_772_700,
};

const OSM_API_URL = `https://api.openstreetmap.org/api/0.6/map?bbox=${[
  SILVERSTONE_BOUNDS_WGS84.west,
  SILVERSTONE_BOUNDS_WGS84.south,
  SILVERSTONE_BOUNDS_WGS84.east,
  SILVERSTONE_BOUNDS_WGS84.north,
].join(",")}`;
const FIA_2026_PDF_URL =
  "https://www.fia.com/system/files/decision-document/2026_british_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf";
const SILVERSTONE_2026_GRANDSTANDS_URL =
  "https://www.silverstone.co.uk/news/silverstones-guide-grandstands";
const EA_LIDAR_METADATA_URL =
  "https://ckan.publishing.service.gov.uk/dataset/lidar-composite-digital-terrain-model-dtm-1m";
const EA_LIDAR_WCS_URL =
  "https://environment.data.gov.uk/geoservices/datasets/13787b9a-26a4-4775-8523-806d13af58fc/wcs";
const EA_LIDAR_COVERAGE_ID =
  "13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m";
const EA_SURVEY_TILE_BASE_URL = "https://environment.data.gov.uk/tiles/collections/survey";
const EA_DSM_TILE_URL = `${EA_SURVEY_TILE_BASE_URL}/lidar_composite_first_return_dsm/2022/1/SP6540?subscription-key=dspui`;
const EA_INTENSITY_TILE_URL = `${EA_SURVEY_TILE_BASE_URL}/national_lidar_programme_intensity/2019/1/SP6540?subscription-key=dspui`;

export async function downloadSilverstoneData({ force = false, sourceDirectory }) {
  await mkdir(sourceDirectory, { recursive: true });
  const manifestPath = path.join(sourceDirectory, "source-manifest.json");

  if (!force) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      await Promise.all(manifest.sources.flatMap((source) => [
        stat(path.join(sourceDirectory, source.file)),
        ...(source.members ?? []).map((member) => stat(path.join(sourceDirectory, member.file))),
      ]));
      return manifest;
    } catch {
      // Rebuild an incomplete cache below.
    }
  }

  const lidarUrl = new URL(EA_LIDAR_WCS_URL);
  lidarUrl.searchParams.set("service", "WCS");
  lidarUrl.searchParams.set("version", "2.0.1");
  lidarUrl.searchParams.set("request", "GetCoverage");
  lidarUrl.searchParams.set("coverageId", EA_LIDAR_COVERAGE_ID);
  lidarUrl.searchParams.set("format", "image/tiff");
  lidarUrl.searchParams.set("subsettingCrs", "http://www.opengis.net/def/crs/EPSG/0/4326");
  lidarUrl.searchParams.set("outputCrs", "http://www.opengis.net/def/crs/EPSG/0/4326");
  lidarUrl.searchParams.append("subset", `Long(${SILVERSTONE_BOUNDS_WGS84.west},${SILVERSTONE_BOUNDS_WGS84.east})`);
  lidarUrl.searchParams.append("subset", `Lat(${SILVERSTONE_BOUNDS_WGS84.south},${SILVERSTONE_BOUNDS_WGS84.north})`);

  const [osmXml, fiaPdf, grandstandsPage, lidarTiff, dsmZip, intensityZip] = await Promise.all([
    fetchBinary(OSM_API_URL),
    fetchBinary(FIA_2026_PDF_URL),
    fetchBinary(SILVERSTONE_2026_GRANDSTANDS_URL),
    fetchBinary(lidarUrl.toString()),
    fetchBinary(EA_DSM_TILE_URL),
    fetchBinary(EA_INTENSITY_TILE_URL),
  ]);
  const osm = parseOsmXml(osmXml.toString("utf8"));
  const layer = (predicate, role) => ({
    elements: osm.elements.filter(predicate),
    generator: `RaceSide OSM ${role} extraction`,
    osm3s: { copyright: "OpenStreetMap contributors, ODbL 1.0" },
    version: 0.6,
  });
  const derivedFiles = [
    ["openstreetmap-raceway.json", layer((element) =>
      element.type === "node"
        ? Boolean(element.tags?.raceway)
        : element.tags?.highway === "raceway" || element.tags?.service === "pit_lane", "raceway")],
    ["openstreetmap-buildings.json", layer((element) =>
      element.type === "way" && Boolean(element.tags?.building), "buildings")],
    ["openstreetmap-barriers.json", layer((element) =>
      element.type === "way" && Boolean(element.tags?.barrier), "barriers")],
    ["openstreetmap-trees.json", layer((element) =>
      element.type === "node" && element.tags?.natural === "tree", "trees")],
    ["openstreetmap-ground.json", layer((element) =>
      element.type === "way" && isGroundDetail(element), "ground")],
  ];
  await Promise.all(derivedFiles.map(([file, body]) =>
    writeFile(path.join(sourceDirectory, file), `${JSON.stringify(body, null, 2)}\n`, "utf8")
  ));

  const directFiles = [
    ["openstreetmap-map.osm", osmXml],
    ["fia-2026-british-grand-prix-maps.pdf", fiaPdf],
    ["silverstone-2026-grandstands.html", grandstandsPage],
    ["environment-agency-lidar-dtm-1m.tif", lidarTiff],
    ["environment-agency-lidar-first-return-dsm-1m.zip", dsmZip],
    ["environment-agency-lidar-intensity-1m.zip", intensityZip],
  ];
  await Promise.all(directFiles.map(([file, body]) =>
    writeFile(path.join(sourceDirectory, file), body)
  ));

  const sourceSpecs = [
    {
      body: osmXml,
      date: "live OSM snapshot at retrieval",
      file: "openstreetmap-map.osm",
      license: "ODbL 1.0",
      resolution: "surveyed vector geometry in the circuit bounding box",
      role: "current circuit, pit lane, buildings, barriers, trees and surface detail",
      url: OSM_API_URL,
    },
    ...derivedFiles.map(([file]) => ({
      body: null,
      date: "derived from the raw OSM snapshot",
      file,
      license: "ODbL 1.0",
      resolution: "lossless extraction with original ids, tags and geometry",
      role: `Blender-ready ${file.replace("openstreetmap-", "").replace(".json", "")} layer`,
      url: "https://www.openstreetmap.org/copyright",
    })),
    {
      body: lidarTiff,
      date: "Environment Agency national composite at retrieval",
      file: "environment-agency-lidar-dtm-1m.tif",
      license: "Open Government Licence v3.0",
      resolution: "1 metre DTM; stated vertical accuracy ±0.15 m",
      role: "terrain elevation without vertical exaggeration",
      url: EA_LIDAR_METADATA_URL,
      verticalDatum: "Ordnance Datum Newlyn (ODN)",
    },
    {
      body: dsmZip,
      date: "2022 LIDAR composite first-return DSM",
      file: "environment-agency-lidar-first-return-dsm-1m.zip",
      license: "Open Government Licence v3.0",
      resolution: "1 metre first-return DSM tile SP6540",
      role: "real structure and vegetation surface heights",
      url: EA_DSM_TILE_URL,
      verticalDatum: "Ordnance Datum Newlyn (ODN)",
    },
    {
      body: intensityZip,
      date: "2019 National LIDAR Programme survey",
      file: "environment-agency-lidar-intensity-1m.zip",
      license: "Open Government Licence v3.0",
      resolution: "1 metre intensity raster tile SP6540",
      role: "measured ground reflectance used as real surface texture",
      url: EA_INTENSITY_TILE_URL,
    },
    {
      body: fiaPdf,
      date: "2026-07-02",
      file: "fia-2026-british-grand-prix-maps.pdf",
      license: "official FIA event document; reference use",
      resolution: "vector PDF",
      role: "5.891 km lap, 18 turns, sectors, speed trap and 41-position pit-lane drawing",
      url: FIA_2026_PDF_URL,
    },
    {
      body: grandstandsPage,
      date: "current 2026 event page at retrieval",
      file: "silverstone-2026-grandstands.html",
      license: "official Silverstone event page; reference use",
      resolution: "official current named inventory",
      role: "current grandstand names and spectator layout",
      url: SILVERSTONE_2026_GRANDSTANDS_URL,
    },
  ];
  const sources = [];
  for (const spec of sourceSpecs) {
    const body = spec.body ?? await readFile(path.join(sourceDirectory, spec.file));
    sources.push({
      bbox: SILVERSTONE_BOUNDS_UTM30N,
      bytes: body.length,
      crs: spec.file.endsWith(".zip")
        ? "EPSG:27700 raster sampled into EPSG:32630"
        : spec.file.includes("lidar")
          ? "EPSG:4326 GeoTIFF sampled into EPSG:32630"
          : "EPSG:4326 / document reference",
      date: spec.date,
      file: spec.file,
      license: spec.license,
      members: spec.members,
      resolution: spec.resolution,
      role: spec.role,
      sha256: sha256(body),
      url: spec.url,
      verticalDatum: spec.verticalDatum ?? null,
    });
  }
  const manifest = {
    bounds: SILVERSTONE_BOUNDS_UTM30N,
    coordinateReferenceSystem: "WGS 84 / UTM zone 30N (EPSG:32630)",
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    sources,
    sourceNotes: {
      elevation: EA_LIDAR_METADATA_URL,
      surveyDownload: "https://environment.data.gov.uk/survey",
    },
    verticalDatum: "Ordnance Datum Newlyn (ODN); no vertical exaggeration",
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function isGroundDetail(element) {
  const tags = element.tags ?? {};
  const isClosed = element.geometry?.length >= 4
    && element.geometry[0].lat === element.geometry.at(-1).lat
    && element.geometry[0].lon === element.geometry.at(-1).lon;
  const polygon = isClosed && (
    ["farmland", "forest", "grass", "industrial", "residential"].includes(tags.landuse)
    || ["grassland", "scrub", "shingle", "water", "wood"].includes(tags.natural)
    || ["pitch", "sports_centre", "track", "water_park"].includes(tags.leisure)
    || tags.amenity === "parking"
  );
  const line = [
    "footway",
    "path",
    "residential",
    "service",
    "steps",
    "tertiary",
    "tertiary_link",
    "track",
    "unclassified",
  ].includes(tags.highway) || tags.natural === "tree_row";
  return polygon || line;
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
    const references = [...match[2].matchAll(/<nd ref="(\d+)"\s*\/>/g)]
      .map((entry) => entry[1]);
    elements.push({
      geometry: references.map((reference) => nodes.get(reference)).filter(Boolean)
        .map(({ lat, lon }) => ({ lat, lon })),
      id: Number(attributes.id),
      tags: parseTags(match[2]),
      timestamp: attributes.timestamp,
      type: "way",
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

async function fetchBinary(url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
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

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}
