import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const width = 2048;
const height = 1024;
const inputIndex = process.argv.indexOf("--input");
const outputIndex = process.argv.indexOf("--output");
const hostsIndex = process.argv.indexOf("--host-country-codes");
const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : null;
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
const hostCountryCodes = new Set(
  hostsIndex >= 0
    ? process.argv[hostsIndex + 1]
        .split(",")
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean)
    : [],
);

if (!inputPath || !outputPath) {
  throw new Error(
    "Usage: node scripts/generate-season-globe-mask.mjs --input countries.geojson --output public/geo/world-admin0-110m-mask.webp [--host-country-codes IT,AU,...]",
  );
}

const collection = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
const resolvedHostCountryCodes = new Set();
const countryPaths = collection.features
  .flatMap((feature) => {
    const countryCodes = [feature.properties?.ISO_A2, feature.properties?.ISO_A2_EH]
      .filter(Boolean)
      .map((code) => String(code).toUpperCase());
    const hostCountryCode = countryCodes.find((code) => hostCountryCodes.has(code));

    if (hostCountryCode) {
      resolvedHostCountryCodes.add(hostCountryCode);
    }

    const fill = hostCountryCode ? "#ff00ff" : "#ff0000";

    return geometryToPaths(feature.geometry).map(
      (pathData) =>
        `<path d="${pathData}" fill="${fill}" fill-rule="evenodd" stroke="#ffff00" stroke-width="0.55" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
    );
  })
  .join("");
const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#000000"/>
    ${countryPaths}
  </svg>
`;

await sharp(Buffer.from(svg))
  .webp({ lossless: true, effort: 6 })
  .toFile(path.resolve(outputPath));

const unresolvedHostCountryCodes = [...hostCountryCodes].filter(
  (code) => !resolvedHostCountryCodes.has(code),
);

if (unresolvedHostCountryCodes.length) {
  console.warn(
    `Natural Earth 1:110m does not contain: ${unresolvedHostCountryCodes.join(", ")}`,
  );
}

function geometryToPaths(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return [polygonToPath(geometry.coordinates)];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map(polygonToPath);
  }

  return [];
}

function polygonToPath(rings) {
  return rings
    .map((ring) =>
      ring
        .map(([longitude, latitude], index) => {
          const x = ((longitude + 180) / 360) * width;
          const y = ((90 - latitude) / 180) * height;

          return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ") + " Z",
    )
    .join(" ");
}
