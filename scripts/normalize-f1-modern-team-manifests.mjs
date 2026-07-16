import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const seasons = [2024, 2025, 2026];
const recordManualReview = process.argv.includes("--record-manual-review");
const colorsOnly = process.argv.includes("--colors-only");
const teamColors = Object.freeze({
  alpine: "#0093CC",
  aston_martin: "#229971",
  audi: "#D71920",
  cadillac: "#B98B2F",
  ferrari: "#E8002D",
  haas: "#B6BABD",
  mclaren: "#FF8000",
  mercedes: "#27F4D2",
  racing_bulls: "#6692FF",
  rb: "#6692FF",
  red_bull: "#3671C6",
  sauber: "#52E252",
  williams: "#64C4FF",
});

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function getWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("Asset is not a WebP RIFF file.");
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: readUInt24LE(buffer, 24) + 1, height: readUInt24LE(buffer, 27) + 1 };
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  throw new Error(`Unsupported WebP chunk ${chunk}.`);
}

function canonicalArchiveUrl(sourceUrl) {
  return sourceUrl
    .replace("/image/upload/c_lfill,w_3392/q_auto/", "/image/upload/")
    .replace("/image/upload/c_fit,h_412/q_auto/", "/image/upload/")
    .replace("/image/upload/c_fit,h_96/q_auto/", "/image/upload/");
}

async function downloadLogo(sourceUrl) {
  const highResolutionUrl = sourceUrl.replace("c_fit,h_96", "c_fit,h_412");
  const response = await fetch(highResolutionUrl, {
    headers: { "user-agent": "RaceMateModernAssetNormalizer/1.0" },
  });
  if (!response.ok) throw new Error(`${highResolutionUrl} returned ${response.status}.`);
  if (!(response.headers.get("content-type") ?? "").startsWith("image/webp")) {
    throw new Error(`${highResolutionUrl} did not return WebP.`);
  }
  return { buffer: Buffer.from(await response.arrayBuffer()), sourceUrl: highResolutionUrl };
}

const overridePath = path.join(root, "scripts", "f1-season-asset-sources.json");
const overrides = JSON.parse(await readFile(overridePath, "utf8"));

for (const season of seasons) {
  const manifestPath = path.join(root, "public", "f1", "teams", "manifests", `${season}.json`);
  const currentManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const sources = [];

  if (colorsOnly) {
    currentManifest.sources = currentManifest.sources.map((source) => {
      const colorHex = overrides[season]?.[source.constructorId]?.colorHex ?? teamColors[source.constructorId];

      if (!colorHex) {
        throw new Error(`No official team color configured for ${season}/${source.constructorId}.`);
      }

      overrides[season] ??= {};
      overrides[season][source.constructorId] ??= {};
      overrides[season][source.constructorId].colorHex = colorHex;

      return { ...source, colorHex };
    });
    await writeFile(manifestPath, `${JSON.stringify(currentManifest, null, 2)}\n`);
    continue;
  }

  for (const current of currentManifest.sources) {
    const colorHex = overrides[season]?.[current.constructorId]?.colorHex ?? teamColors[current.constructorId];

    if (!colorHex) {
      throw new Error(`No official team color configured for ${season}/${current.constructorId}.`);
    }

    const row = {
      season,
      constructorId: current.constructorId,
      name: current.name,
      colorHex,
      car: null,
      logo: null,
    };
    const pageUrl = `https://www.formula1.com/en/results/${season}/team`;

    const carBuffer = await readFile(path.join(root, "public", current.car.file));
    const carDimensions = getWebpDimensions(carBuffer);
    row.car = {
      file: current.car.file,
      pageUrl,
      archiveUrl: canonicalArchiveUrl(current.car.sourceUrl),
      sourceUrl: current.car.sourceUrl,
      sha256: sha256(carBuffer),
      contentType: "image/webp",
      width: carDimensions.width,
      height: carDimensions.height,
      verified: recordManualReview,
      manualReviewStatus: recordManualReview ? "approved" : "pending",
    };

    const logo = await downloadLogo(current.logo.sourceUrl);
    const logoPath = path.join(root, "public", current.logo.file);
    await mkdir(path.dirname(logoPath), { recursive: true });
    await writeFile(logoPath, logo.buffer);
    const logoDimensions = getWebpDimensions(logo.buffer);
    row.logo = {
      file: current.logo.file,
      pageUrl,
      archiveUrl: canonicalArchiveUrl(logo.sourceUrl),
      sourceUrl: logo.sourceUrl,
      sha256: sha256(logo.buffer),
      contentType: "image/webp",
      width: logoDimensions.width,
      height: logoDimensions.height,
      verified: recordManualReview,
      manualReviewStatus: recordManualReview ? "approved" : "pending",
    };

    overrides[season] ??= {};
    overrides[season][current.constructorId] = {
      car: row.car.sourceUrl,
      logo: row.logo.sourceUrl,
      colorHex,
    };
    sources.push(row);
    console.log(`normalized team ${season}/${current.constructorId}`);
  }

  const manifest = {
    season,
    downloadedAt: new Date().toISOString(),
    sourcePolicy: "Official Formula1.com season team assets only; no cross-season fallback.",
    rightsReviewRequired: true,
    rightsReview: {
      status: "pending",
      note: "External legal/licensing review is required before publication.",
    },
    visualReviewRecordedAt: recordManualReview ? new Date().toISOString() : null,
    complete: true,
    missing: [],
    sources,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

await writeFile(overridePath, `${JSON.stringify(overrides, null, 2)}\n`);
