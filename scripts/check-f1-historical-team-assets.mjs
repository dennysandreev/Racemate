import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const seasons = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const expectedConstructors = {
  2020: ["mercedes", "red_bull", "mclaren", "racing_point", "renault", "ferrari", "alphatauri", "alfa", "haas", "williams"],
  2021: ["mercedes", "red_bull", "ferrari", "mclaren", "alpine", "alphatauri", "aston_martin", "williams", "alfa", "haas"],
  2022: ["red_bull", "ferrari", "mercedes", "alpine", "mclaren", "alfa", "aston_martin", "haas", "alphatauri", "williams"],
  2023: ["red_bull", "mercedes", "ferrari", "mclaren", "aston_martin", "alpine", "williams", "alphatauri", "alfa", "haas"],
  2024: ["mclaren", "ferrari", "red_bull", "mercedes", "aston_martin", "alpine", "haas", "rb", "williams", "sauber"],
  2025: ["mclaren", "mercedes", "red_bull", "ferrari", "williams", "rb", "aston_martin", "haas", "sauber", "alpine"],
  2026: ["mercedes", "ferrari", "mclaren", "red_bull", "alpine", "rb", "haas", "williams", "audi", "aston_martin", "cadillac"],
};

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function getWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("invalid WebP magic");
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: readUInt24LE(buffer, 24) + 1, height: readUInt24LE(buffer, 27) + 1 };
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  throw new Error(`unsupported WebP chunk ${chunk}`);
}

const failures = [];
let checked = 0;
const sourceConfig = JSON.parse(
  await readFile(path.join(root, "scripts", "f1-season-asset-sources.json"), "utf8"),
);

for (const season of seasons) {
  const manifestPath = path.join(root, "public", "f1", "teams", "manifests", `${season}.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const actualIds = manifest.sources.map((source) => source.constructorId);
  const expectedIds = expectedConstructors[season];

  if (!manifest.complete || manifest.missing.length > 0) failures.push(`${season}: manifest is incomplete`);
  if (manifest.rightsReviewRequired !== true) failures.push(`${season}: legal rights review gate is not required`);
  if (manifest.rightsReview && !["pending", "approved", "cleared"].includes(manifest.rightsReview.status)) {
    failures.push(`${season}: invalid legal rights review status`);
  }
  if (actualIds.join(",") !== expectedIds.join(",")) failures.push(`${season}: constructor identity/order mismatch`);

  for (const source of manifest.sources) {
    if (!/^#[0-9A-F]{6}$/i.test(source.colorHex ?? "")) {
      failures.push(`${season}/${source.constructorId}: invalid season color`);
    }
    if (sourceConfig[season]?.[source.constructorId]?.colorHex !== source.colorHex) {
      failures.push(`${season}/${source.constructorId}: manifest/config color mismatch`);
    }

    for (const kind of ["car", "logo"]) {
      const asset = source[kind];
      const label = `${season}/${source.constructorId}/${kind}`;
      if (!asset) {
        failures.push(`${label}: missing manifest entry`);
        continue;
      }
      if (!asset.file.includes(`/${season}/`)) failures.push(`${label}: cross-season file path`);
      if (!asset.sourceUrl.includes(`/${season}/`)) failures.push(`${label}: cross-season source URL`);
      if (!asset.sourceUrl.startsWith("https://media.formula1.com/")) failures.push(`${label}: source is not Formula1.com`);
      if (!asset.pageUrl.startsWith("https://www.formula1.com/")) failures.push(`${label}: page is not Formula1.com`);
      if (!asset.archiveUrl.startsWith("https://") || !asset.archiveUrl.includes("formula1.com/")) failures.push(`${label}: archive is not Formula1.com`);
      if (asset.manualReviewStatus !== "approved" || asset.verified !== true) failures.push(`${label}: manual visual review is not approved`);

      try {
        const buffer = await readFile(path.join(root, "public", asset.file));
        const dimensions = getWebpDimensions(buffer);
        if (sha256(buffer) !== asset.sha256) failures.push(`${label}: checksum mismatch`);
        if (dimensions.width !== asset.width || dimensions.height !== asset.height) failures.push(`${label}: dimensions mismatch`);
        if (kind === "car" && (dimensions.width < 1000 || dimensions.height < 300)) failures.push(`${label}: car image is too small`);
        if (kind === "logo" && (dimensions.width < 300 || dimensions.height < 300)) failures.push(`${label}: logo image is too small`);
        if (buffer.length > 1_000_000) failures.push(`${label}: file exceeds 1 MB`);
        checked += 1;
      } catch (error) {
        failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Historical F1 team assets verified: ${checked} files across ${seasons.length} seasons.`);
}
