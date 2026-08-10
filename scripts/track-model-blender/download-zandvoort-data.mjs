import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

export const ZANDVOORT_BOUNDS_RD = Object.freeze({
  minX: 96_950,
  minY: 488_550,
  maxX: 98_500,
  maxY: 489_950,
});

const BGT_COLLECTIONS = [
  "bak",
  "begroeidterreindeel",
  "bord",
  "gebouwinstallatie",
  "installatie",
  "kunstwerkdeel_lijn",
  "kunstwerkdeel_punt",
  "kunstwerkdeel_vlak",
  "mast",
  "onbegroeidterreindeel",
  "ondersteunendwegdeel",
  "overigbouwwerk",
  "paal",
  "pand",
  "put",
  "scheiding_lijn",
  "scheiding_vlak",
  "spoor",
  "straatmeubilair",
  "vegetatieobject_lijn",
  "vegetatieobject_punt",
  "vegetatieobject_vlak",
  "waterdeel",
  "wegdeel",
];

const LICENSES = Object.freeze({
  ahn: "CC0 1.0",
  bgt: "CC0 1.0",
  openStreetMap: "ODbL 1.0",
  pdokAerial: "CC BY 4.0",
  threeDBag: "CC BY 4.0",
});

export async function downloadZandvoortData({ force = false, sourceDirectory } = {}) {
  const outputDirectory = sourceDirectory
    ? path.resolve(sourceDirectory)
    : path.join(projectRoot, ".track-model-build/zandvoort-source");
  const manifestPath = path.join(outputDirectory, "source-manifest.json");

  if (!force) {
    const existingManifest = await readJsonIfPresent(manifestPath);

    if (existingManifest && await verifyManifest(outputDirectory, existingManifest)) {
      return existingManifest;
    }
  }

  await mkdir(outputDirectory, { recursive: true });

  const bbox = [
    ZANDVOORT_BOUNDS_RD.minX,
    ZANDVOORT_BOUNDS_RD.minY,
    ZANDVOORT_BOUNDS_RD.maxX,
    ZANDVOORT_BOUNDS_RD.maxY,
  ];
  const width = ZANDVOORT_BOUNDS_RD.maxX - ZANDVOORT_BOUNDS_RD.minX;
  const height = ZANDVOORT_BOUNDS_RD.maxY - ZANDVOORT_BOUNDS_RD.minY;
  const sourceEntries = [];

  const overpassQuery = `[out:json][timeout:180];\n(\n  way[\"highway\"=\"raceway\"](around:2600,52.38920,4.54115);\n  node[\"raceway\"=\"start\"](around:2600,52.38920,4.54115);\n  node[\"raceway\"=\"finish\"](around:2600,52.38920,4.54115);\n);\nout tags geom;`;
  const overpassUrl = "https://overpass-api.de/api/interpreter";
  const overpassResponse = await fetchWithRetry(overpassUrl, {
    body: overpassQuery,
    headers: { "content-type": "text/plain;charset=UTF-8" },
    method: "POST",
  });
  const overpassData = await overpassResponse.json();
  await writeSource({
    data: `${JSON.stringify(overpassData)}\n`,
    fileName: "openstreetmap-raceway.json",
    license: LICENSES.openStreetMap,
    outputDirectory,
    sourceEntries,
    sourceUrl: overpassUrl,
  });

  const bgtDirectory = path.join(outputDirectory, "bgt");
  await mkdir(bgtDirectory, { recursive: true });
  const bgtSummary = {};

  for (const collection of BGT_COLLECTIONS) {
    const url = new URL(`https://api.pdok.nl/lv/bgt/ogc/v1/collections/${collection}/items`);
    url.searchParams.set("bbox", bbox.join(","));
    url.searchParams.set("bbox-crs", "http://www.opengis.net/def/crs/EPSG/0/28992");
    url.searchParams.set("crs", "http://www.opengis.net/def/crs/EPSG/0/28992");
    url.searchParams.set("f", "json");
    url.searchParams.set("limit", "10000");
    const featureCollection = await downloadFeatureCollection(url.toString());
    const activeFeatures = featureCollection.features.filter(isActiveBgtFeature);
    const data = `${JSON.stringify({
      type: "FeatureCollection",
      numberMatched: activeFeatures.length,
      features: activeFeatures,
    })}\n`;
    bgtSummary[collection] = activeFeatures.length;
    await writeSource({
      data,
      fileName: path.join("bgt", `${collection}.geojson`),
      license: LICENSES.bgt,
      outputDirectory,
      sourceEntries,
      sourceUrl: url.toString(),
    });
  }

  const bagUrl = new URL("https://api.3dbag.nl/collections/pand/items");
  bagUrl.searchParams.set("bbox", bbox.join(","));
  // 3DBAG exposes EPSG:7415 only; its horizontal axes are the same RD metres as EPSG:28992.
  bagUrl.searchParams.set("bbox-crs", "http://www.opengis.net/def/crs/EPSG/0/7415");
  bagUrl.searchParams.set("crs", "http://www.opengis.net/def/crs/EPSG/0/7415");
  bagUrl.searchParams.set("limit", "1000");
  const buildings = await downloadCityJsonFeatureCollection(bagUrl.toString());
  await writeSource({
    data: `${JSON.stringify(buildings)}\n`,
    fileName: "3dbag-buildings.city.json",
    license: LICENSES.threeDBag,
    outputDirectory,
    sourceEntries,
    sourceUrl: bagUrl.toString(),
  });

  const rasterWidth = Math.round(width);
  const rasterHeight = Math.round(height);
  for (const coverageId of ["dtm_05m", "dsm_05m"]) {
    const wcsUrl = new URL("https://service.pdok.nl/rws/ahn/wcs/v1_0");
    wcsUrl.searchParams.set("service", "WCS");
    wcsUrl.searchParams.set("version", "2.0.1");
    wcsUrl.searchParams.set("request", "GetCoverage");
    wcsUrl.searchParams.set("coverageId", coverageId);
    wcsUrl.searchParams.set("format", "image/tiff");
    wcsUrl.searchParams.append("subset", `x(${bbox[0]},${bbox[2]})`);
    wcsUrl.searchParams.append("subset", `y(${bbox[1]},${bbox[3]})`);
    wcsUrl.searchParams.append("scalesize", `x(${rasterWidth}),y(${rasterHeight})`);
    const response = await fetchWithRetry(wcsUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeSource({
      data: buffer,
      fileName: `ahn4-${coverageId}.tif`,
      license: LICENSES.ahn,
      outputDirectory,
      sourceEntries,
      sourceUrl: wcsUrl.toString(),
    });
  }

  const aerialWidth = 2500;
  const aerialHeight = Math.round(aerialWidth * height / width);
  const aerialUrl = new URL("https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0");
  aerialUrl.searchParams.set("service", "WMS");
  aerialUrl.searchParams.set("version", "1.3.0");
  aerialUrl.searchParams.set("request", "GetMap");
  aerialUrl.searchParams.set("layers", "2026_orthoHR");
  aerialUrl.searchParams.set("styles", "");
  aerialUrl.searchParams.set("crs", "EPSG:28992");
  aerialUrl.searchParams.set("bbox", bbox.join(","));
  aerialUrl.searchParams.set("width", String(aerialWidth));
  aerialUrl.searchParams.set("height", String(aerialHeight));
  aerialUrl.searchParams.set("format", "image/jpeg");
  const aerialResponse = await fetchWithRetry(aerialUrl);
  const aerialBuffer = Buffer.from(await aerialResponse.arrayBuffer());
  await writeSource({
    attribution: "PDOK aerial photography, 2026 high-resolution orthophoto",
    data: aerialBuffer,
    fileName: "pdok-2026-orthohr.jpg",
    license: LICENSES.pdokAerial,
    outputDirectory,
    sourceEntries,
    sourceUrl: aerialUrl.toString(),
  });

  const manifest = {
    bbox: {
      crs: "EPSG:28992",
      ...ZANDVOORT_BOUNDS_RD,
    },
    bgtFeatureCounts: bgtSummary,
    generatedAt: new Date().toISOString(),
    model: "zandvoort",
    rasterResolutionMeters: 1,
    schemaVersion: 3,
    sources: sourceEntries,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function downloadFeatureCollection(initialUrl) {
  let nextUrl = initialUrl;
  const features = [];
  let template = null;

  while (nextUrl) {
    const response = await fetchWithRetry(nextUrl);
    const page = await response.json();
    template ??= page;
    features.push(...(page.features ?? []));
    nextUrl = page.links?.find((link) => link.rel === "next")?.href ?? null;
  }

  return {
    ...(template ?? { type: "FeatureCollection" }),
    features,
    numberMatched: features.length,
    links: [],
  };
}

async function downloadCityJsonFeatureCollection(initialUrl) {
  let nextUrl = initialUrl;
  const pages = [];

  while (nextUrl) {
    const response = await fetchWithRetry(nextUrl);
    const page = await response.json();
    pages.push(page);
    nextUrl = page.links?.find((link) => link.rel === "next")?.href ?? null;
  }

  return mergeCityJsonFeatureCollectionPages(pages);
}

export function mergeCityJsonFeatureCollectionPages(pages) {
  const template = pages[0] ?? { type: "FeatureCollection", metadata: {} };
  const targetTransform = template.metadata?.transform;

  if (!isCityJsonTransform(targetTransform)) {
    throw new Error("3DBAG response is missing a valid CityJSON transform");
  }

  const features = pages.flatMap((page) => {
    const pageTransform = page.metadata?.transform;
    if (!isCityJsonTransform(pageTransform)) {
      throw new Error("A paginated 3DBAG response is missing its CityJSON transform");
    }

    return (page.features ?? []).map((feature) => ({
      ...feature,
      vertices: (feature.vertices ?? []).map((vertex) => vertex.map((value, axis) => {
        const worldValue = value * pageTransform.scale[axis] + pageTransform.translate[axis];
        return Math.round((worldValue - targetTransform.translate[axis]) / targetTransform.scale[axis]);
      })),
    }));
  });

  return {
    ...template,
    metadata: {
      ...template.metadata,
      transform: targetTransform,
    },
    features,
    numberMatched: features.length,
    links: [],
  };
}

function isCityJsonTransform(transform) {
  return Array.isArray(transform?.scale)
    && transform.scale.length === 3
    && transform.scale.every((value) => Number.isFinite(value) && value > 0)
    && Array.isArray(transform?.translate)
    && transform.translate.length === 3
    && transform.translate.every(Number.isFinite);
}

async function fetchWithRetry(input, init = {}, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, {
        ...init,
        headers: {
          "user-agent": "RaceSide-track-builder/2.0 (local reproducible asset build)",
          ...init.headers,
        },
        signal: AbortSignal.timeout(180_000),
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} from ${response.url}`);
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }

  throw lastError;
}

function isActiveBgtFeature(feature) {
  const properties = feature.properties ?? {};
  return properties.eind_registratie == null
    && properties.termination_date == null
    && properties.status !== "historie";
}

async function writeSource({
  attribution,
  data,
  fileName,
  license,
  outputDirectory,
  sourceEntries,
  sourceUrl,
}) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const outputPath = path.join(outputDirectory, fileName);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  sourceEntries.push({
    attribution,
    bytes: buffer.length,
    file: fileName,
    license,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    url: sourceUrl,
  });
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

async function verifyManifest(outputDirectory, manifest) {
  if (manifest.schemaVersion !== 3 || !Array.isArray(manifest.sources)) {
    return false;
  }

  try {
    for (const source of manifest.sources) {
      const buffer = await readFile(path.join(outputDirectory, source.file));
      const digest = createHash("sha256").update(buffer).digest("hex");

      if (digest !== source.sha256 || buffer.length !== source.bytes) {
        return false;
      }
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }

  return true;
}

function parseArguments(argv) {
  const directoryIndex = argv.indexOf("--output");
  return {
    force: argv.includes("--force"),
    sourceDirectory: directoryIndex >= 0 ? argv[directoryIndex + 1] : undefined,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await downloadZandvoortData(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(manifest, null, 2));
}
