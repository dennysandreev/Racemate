import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MADRING_BOUNDS = { minX: 446750, minY: 4479250, maxX: 448350, maxY: 4481500 };
const MADRID = "https://geoportal.madrid.es/fsdescargas/IDEAM_WBGEOPORTAL";
const MUNICIPAL_LICENSE = "Madrid open-data reuse terms: attribution, update date and no endorsement; https://datos.madrid.es/pages/condiciones-generales-ayuntamiento-de-madrid";
const ORTHO = "https://servpub.madrid.es/georaster/ORTOFOTOS_PARCIALES/ORTO_IFEMAF1_2026_07/ows";
export const MADRING_VERTICAL_DATUM = "Source metre elevations aligned with IGN MDT; municipal LAS specifies no vertical CRS. Alicante/REDNAP convention inferred, no vertical offset applied.";
const bbox = Object.values(MADRING_BOUNDS).join(",");
const wcs = (base, id) => `${base}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${id}&SUBSET=x(446750,448350)&SUBSET=y(4479250,4481500)&FORMAT=image/tiff`;

export const MADRING_SOURCES = [
  ["madrid-circuit.zip", `${MADRID}/CIRCUITO_F1/CIRCUITO_F1_MADRING.zip`, "2026-07-03", "municipal centreline, track edges, asphalt runoff, pit boundaries, pit building and walls", "surveyed vector geometry", MUNICIPAL_LICENSE],
  ["madrid-orthophoto-2026.png", `${ORTHO}?service=WMS&version=1.3.0&request=GetMap&layers=ORTO_IFEMAF1_2026_07&styles=&crs=EPSG:25830&bbox=${bbox}&width=2048&height=2880&format=image/png&transparent=true`, "2026-06-13", "current true orthophoto; service name 2026_07 is publication, not flight date", "7 cm native; 0.78125 m exported pixels", MUNICIPAL_LICENSE],
  ...["446-4481", "447-4480", "447-4481", "447-4482", "448-4480"].map((tile) => [`lidar-${tile}.zip`, `${MADRID}/ELEVACIONES/2026/NUBE_PUNTOS/LIDAR/F1/${tile}.zip`, "2026-06-13", "classified LiDAR terrain and surface elevations", "60 points/m²; 5 cm stated vertical accuracy; aggregated to 2 m", MUNICIPAL_LICENSE]),
  ...[["hortaleza", "16.Hortaleza"], ["barajas", "21.Barajas"]].map(([name, district]) => [`madrid-lod2-${name}.zip`, `${MADRID}/CARTOGRAFIA/CARTOGRAFIA_ACTUALIZADA/3D_EDIFICACIONES_CONSTRUCCIONES/OBJ/${district}_3D.ZIP`, "2025-04-01", "municipal LoD2 buildings with measured roof geometry and elevations", "LoD2, municipal 1:1000 mapping", MUNICIPAL_LICENSE]),
  ["ign-dtm.tif", wcs("https://servicios.idee.es/wcs-inspire/mdt", "Elevacion25830_5"), "snapshot at retrieval", "national DTM for gaps outside the current LiDAR coverage", "5 m", "CC BY 4.0 IGN/CNIG"],
  ["ign-dsm.tif", wcs("https://wcs-mds.idee.es/mds", "mds05"), "snapshot at retrieval", "national DSM for cross-checking permanent infrastructure", "5 m", "CC BY 4.0 IGN/CNIG"],
  ["osm-map.xml", "https://api.openstreetmap.org/api/0.6/map?bbox=-3.632,40.457,-3.607,40.482", "snapshot at retrieval", "current pit alignment, active building footprints, mapped trees and infrastructure", "OSM vectors", "ODbL 1.0 OpenStreetMap contributors"],
  ["official-circuit.html", "https://www.madring.com/en/circuit", "2026 event", "turn numbering, widths, 24% banking, elevation extrema", "official venue technical specifications", "official promoter reference; not embedded in GLB"],
  ["official-event-map.webp", "https://www.madring.com/img/mapa-general-del-circuito-madring-gran-premio-espana-formula-1-2026-zonas-del-re/madring_map_eng_2026.webp", "2026 event", "current grandstands, hospitality, paddock and access configuration", "official event map", "official promoter reference; not embedded in GLB"],
  ["official-f1-map.png", "https://media.formula1.com/image/upload/f_auto/q_auto/v1756285390/common/f1/2026/track/2026trackmadringdetailed.png", "2026 event", "current F1 sector transitions, start/finish and speed trap; map-derived distances, not FIA surveyed timing positions", "official circuit diagram", "Formula One World Championship Limited; reference only"],
  ["official-pit-building.html", "https://www.madring.com/en/press-releases/pit-building-paddock-club", "2025-12-17", "14 modular garages: 11 teams plus 3 FIA; three storeys, maximum 18.5 m", "official construction specifications", "official promoter reference; not embedded in GLB"],
];

export async function downloadMadringData({ force = false, sourceDirectory }) {
  await mkdir(sourceDirectory, { recursive: true });
  const manifestPath = path.join(sourceDirectory, "source-manifest.json");
  let previous;
  try { previous = JSON.parse(await readFile(manifestPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (previous && !force) {
    for (const source of previous.sources) await verify(sourceDirectory, source);
    return previous;
  }
  const sources = [];
  for (const [file, url, date, role, resolution, license] of MADRING_SOURCES) {
    let body;
    if (!force) {
      try { body = await readFile(path.join(sourceDirectory, file)); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    if (!body) {
      const response = await fetch(url, { signal: AbortSignal.timeout(240_000) });
      if (!response.ok) throw new Error(`${response.status} downloading ${file}`);
      body = Buffer.from(await response.arrayBuffer());
      await writeFile(path.join(sourceDirectory, file), body);
    }
    if (body.length < 200 || (file.endsWith(".zip") && (body.toString("ascii", 0, 2) !== "PK" || body.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) < body.length - 65_557))) {
      throw new Error(`Unexpected source response: ${file}`);
    }
    sources.push({ bbox: MADRING_BOUNDS, bytes: body.length, crs: file.startsWith("official-") ? "reference document; not georeferenced" : file.includes("osm") ? "EPSG:4326" : "EPSG:25830", date, file, license, resolution, retrievedAt: new Date().toISOString(), role, sha256: hash(body), url, verticalDatum: /lidar|dtm|dsm|lod2/.test(file) ? MADRING_VERTICAL_DATUM : null });
  }
  const manifest = { bounds: MADRING_BOUNDS, coordinateReferenceSystem: "ETRS89 / UTM zone 30N (EPSG:25830)", generatedAt: new Date().toISOString(), schemaVersion: 1, sources, verticalDatum: MADRING_VERTICAL_DATUM };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function verify(directory, source) {
  const body = await readFile(path.join(directory, source.file));
  if (body.length !== source.bytes || hash(body) !== source.sha256) throw new Error(`Source changed: ${source.file}; restore the pinned file or explicitly use --force-sources`);
}
function hash(body) { return createHash("sha256").update(body).digest("hex"); }
