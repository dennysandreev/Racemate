import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const FORMULA_ONE_ASSET_ROOT = "content/dam/fom-website/teams";
const seasons = [2020, 2021, 2022, 2023];
const recordManualReview = process.argv.includes("--record-manual-review");
const colorsOnly = process.argv.includes("--colors-only");
const teamColors = Object.freeze({
  alfa: "#C92D4B",
  alpine: "#0093CC",
  alphatauri: "#2B4562",
  aston_martin: "#229971",
  ferrari: "#E8002D",
  haas: "#B6BABD",
  mclaren: "#FF8000",
  mercedes: "#27F4D2",
  racing_point: "#F596C8",
  red_bull: "#3671C6",
  renault: "#FFF500",
  williams: "#64C4FF",
});

const teamsBySeason = {
  2020: [
    ["mercedes", "Mercedes", ["mercedes"]],
    ["red_bull", "Red Bull", ["red-bull-racing", "red-bull"]],
    ["mclaren", "McLaren", ["mclaren"]],
    ["racing_point", "Racing Point", ["racing-point"]],
    ["renault", "Renault", ["renault"]],
    ["ferrari", "Ferrari", ["ferrari"]],
    ["alphatauri", "AlphaTauri", ["alphatauri", "alpha-tauri"]],
    ["alfa", "Alfa Romeo", ["alfa-romeo-racing", "alfa-romeo"]],
    ["haas", "Haas F1 Team", ["haas-f1-team", "haas"]],
    ["williams", "Williams", ["williams"]],
  ],
  2021: [
    ["mercedes", "Mercedes", ["mercedes"]],
    ["red_bull", "Red Bull", ["red-bull-racing", "red-bull"]],
    ["ferrari", "Ferrari", ["ferrari"]],
    ["mclaren", "McLaren", ["mclaren"]],
    ["alpine", "Alpine F1 Team", ["alpine"]],
    ["alphatauri", "AlphaTauri", ["alphatauri", "alpha-tauri"]],
    ["aston_martin", "Aston Martin", ["aston-martin"]],
    ["williams", "Williams", ["williams"]],
    ["alfa", "Alfa Romeo", ["alfa-romeo-racing", "alfa-romeo"]],
    ["haas", "Haas F1 Team", ["haas-f1-team", "haas"]],
  ],
  2022: [
    ["red_bull", "Red Bull", ["red-bull-racing", "red-bull"]],
    ["ferrari", "Ferrari", ["ferrari"]],
    ["mercedes", "Mercedes", ["mercedes"]],
    ["alpine", "Alpine F1 Team", ["alpine"]],
    ["mclaren", "McLaren", ["mclaren"]],
    ["alfa", "Alfa Romeo", ["alfa-romeo-racing", "alfa-romeo"]],
    ["aston_martin", "Aston Martin", ["aston-martin"]],
    ["haas", "Haas F1 Team", ["haas-f1-team", "haas"]],
    ["alphatauri", "AlphaTauri", ["alphatauri", "alpha-tauri"]],
    ["williams", "Williams", ["williams"]],
  ],
  2023: [
    ["red_bull", "Red Bull", ["red-bull-racing", "red-bull"]],
    ["mercedes", "Mercedes", ["mercedes"]],
    ["ferrari", "Ferrari", ["ferrari"]],
    ["mclaren", "McLaren", ["mclaren"]],
    ["aston_martin", "Aston Martin", ["aston-martin"]],
    ["alpine", "Alpine F1 Team", ["alpine"]],
    ["williams", "Williams", ["williams"]],
    ["alphatauri", "AlphaTauri", ["alphatauri", "alpha-tauri"]],
    ["alfa", "Alfa Romeo", ["alfa-romeo-racing", "alfa-romeo"]],
    ["haas", "Haas F1 Team", ["haas-f1-team", "haas"]],
  ],
};

function fileSlug(value) {
  return value.replaceAll("_", "-");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sourcePaths(season, assetSlug, kind) {
  const suffix = kind === "logo" ? "-logo" : "";
  const transform = kind === "logo" ? "2col-retina" : "6col-retina";
  const publicId = `${FORMULA_ONE_ASSET_ROOT}/${season}/${assetSlug}${suffix}.png.transform/${transform}/image.png`;

  return {
    archiveUrl: `https://www.formula1.com/${publicId}`,
    sourceUrl: `https://media.formula1.com/image/upload/f_webp/q_auto/${publicId}`,
  };
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function getWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("Downloaded response is not a WebP RIFF file.");
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1,
    };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8 ") {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  throw new Error(`Unsupported WebP chunk ${chunk}.`);
}

async function fetchOfficialAsset(season, candidates, kind) {
  const errors = [];
  for (const assetSlug of candidates) {
    const urls = sourcePaths(season, assetSlug, kind);
    try {
      const response = await fetch(urls.sourceUrl, {
        headers: { "user-agent": "RaceMateHistoricalAssetSync/1.0" },
      });
      if (!response.ok) {
        errors.push(`${assetSlug}: ${response.status}`);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/webp")) {
        errors.push(`${assetSlug}: ${contentType || "unknown content type"}`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const dimensions = getWebpDimensions(buffer);
      return { assetSlug, buffer, dimensions, ...urls };
    } catch (error) {
      errors.push(`${assetSlug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`No official ${kind} asset found (${errors.join(", ")}).`);
}

async function syncSeason(season, overrides) {
  const rows = [];
  const missing = [];

  for (const [constructorId, name, candidateSlugs] of teamsBySeason[season]) {
    const outputSlug = fileSlug(constructorId);
    const pageUrl = `https://www.formula1.com/en/results/${season}/team`;
    const colorHex = overrides[season]?.[constructorId]?.colorHex ?? teamColors[constructorId];

    if (!colorHex) {
      throw new Error(`No official team color configured for ${season}/${constructorId}.`);
    }

    const row = { season, constructorId, name, colorHex, car: null, logo: null };
    overrides[season] ??= {};
    overrides[season][constructorId] ??= {};
    overrides[season][constructorId].colorHex = colorHex;

    for (const kind of ["car", "logo"]) {
      try {
        const asset = await fetchOfficialAsset(season, candidateSlugs, kind);
        const relativeFile = `/f1/teams/${kind === "car" ? "cars" : "logos"}/${season}/${outputSlug}.webp`;
        const outputPath = path.join(root, "public", relativeFile);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, asset.buffer);

        row[kind] = {
          file: relativeFile,
          pageUrl,
          archiveUrl: asset.archiveUrl,
          sourceUrl: asset.sourceUrl,
          sha256: sha256(asset.buffer),
          contentType: "image/webp",
          width: asset.dimensions.width,
          height: asset.dimensions.height,
          verified: recordManualReview,
          manualReviewStatus: recordManualReview ? "approved" : "pending",
        };
        overrides[season][constructorId][kind] = asset.sourceUrl;
      } catch (error) {
        missing.push({ constructorId, [kind]: true, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    rows.push(row);
    console.log(`${row.car && row.logo ? "saved" : "incomplete"} team ${season}/${constructorId}`);
  }

  const manifest = {
    season,
    downloadedAt: new Date().toISOString(),
    sourcePolicy: "Official Formula1.com season team assets only; no cross-season fallback.",
    rightsReviewRequired: true,
    visualReviewRecordedAt: recordManualReview ? new Date().toISOString() : null,
    complete: missing.length === 0,
    missing,
    sources: rows,
  };
  const manifestPath = path.join(root, "public", "f1", "teams", "manifests", `${season}.json`);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}

async function stampSeasonColors(season, overrides) {
  const manifestPath = path.join(root, "public", "f1", "teams", "manifests", `${season}.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  manifest.sources = manifest.sources.map((source) => {
    const colorHex = overrides[season]?.[source.constructorId]?.colorHex ?? teamColors[source.constructorId];

    if (!colorHex) {
      throw new Error(`No official team color configured for ${season}/${source.constructorId}.`);
    }

    overrides[season] ??= {};
    overrides[season][source.constructorId] ??= {};
    overrides[season][source.constructorId].colorHex = colorHex;

    return { ...source, colorHex };
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}

const overridePath = path.join(root, "scripts", "f1-season-asset-sources.json");
let overrides = {};
try {
  overrides = JSON.parse(await readFile(overridePath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

let failed = false;
for (const season of seasons) {
  const manifest = colorsOnly
    ? await stampSeasonColors(season, overrides)
    : await syncSeason(season, overrides);
  failed ||= !manifest.complete;
}
await writeFile(overridePath, `${JSON.stringify(overrides, null, 2)}\n`);

if (failed) {
  process.exitCode = 1;
}
