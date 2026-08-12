import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { exportTrackData } from "./export-track-data.mjs";
import { exportHungaroringTrackData } from "./export-hungaroring-track-data.mjs";
import { exportSilverstoneTrackData } from "./export-silverstone-track-data.mjs";
import { exportSpaTrackData } from "./export-spa-track-data.mjs";
import { validateTrackAsset } from "./validate-track.mjs";
import { writeHungaroringClientModel } from "./write-hungaroring-client-model.mjs";
import { writeSilverstoneClientModel } from "./write-silverstone-client-model.mjs";
import { writeSpaClientModel } from "./write-spa-client-model.mjs";
import { writeZandvoortClientModel } from "./write-zandvoort-client-model.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

const modelId = process.argv.slice(2).find((value) => !value.startsWith("--")) ?? "zandvoort";
const buildDirectory = path.join(projectRoot, ".track-model-build");
const publicDirectory = path.join(projectRoot, "public/f1/tracks/3d");
const inputPath = path.join(buildDirectory, `${modelId}.json`);
const preparedDirectory = path.join(buildDirectory, `${modelId}-prepared`);
const glbPath = path.join(publicDirectory, `${modelId}.glb`);
const previewPath = path.join(publicDirectory, `${modelId}-preview.webp`);
const metadataPath = path.join(publicDirectory, `${modelId}-metadata.json`);

await Promise.all([
  mkdir(buildDirectory, { recursive: true }),
  mkdir(preparedDirectory, { recursive: true }),
  mkdir(publicDirectory, { recursive: true }),
]);
const forceSources = process.argv.includes("--force-sources");
const payload = modelId === "silverstone"
  ? await exportSilverstoneTrackData({ forceSources, outputPath: inputPath })
  : modelId === "spa"
    ? await exportSpaTrackData({ forceSources, outputPath: inputPath })
    : modelId === "hungaroring"
      ? await exportHungaroringTrackData({ forceSources, outputPath: inputPath })
      : await exportTrackData({ forceSources, modelId, outputPath: inputPath });
const isSpa = modelId === "spa";
const isHungaroring = modelId === "hungaroring";
const isSilverstone = modelId === "silverstone";

run(process.env.PYTHON_BIN ?? "python3", [
  path.join(
    scriptDirectory,
    isSpa
      ? "prepare-spa-rasters.py"
      : isSilverstone
        ? "prepare-silverstone-rasters.py"
        : isHungaroring
          ? "prepare-hungaroring-rasters.py"
          : "prepare-zandvoort-rasters.py",
  ),
  "--source",
  payload.sourceDirectory,
  "--output",
  preparedDirectory,
]);

run(process.env.BLENDER_BIN ?? "blender", [
  "--background",
  "--factory-startup",
  "--python-exit-code",
  "1",
  "--python",
  path.join(
    scriptDirectory,
    isSpa
      ? "build-spa-digital-twin.py"
      : isSilverstone
        ? "build-silverstone-digital-twin.py"
        : isHungaroring
          ? "build-hungaroring-digital-twin.py"
          : "build-zandvoort-digital-twin.py",
  ),
  "--",
  "--input",
  inputPath,
  "--prepared",
  preparedDirectory,
  "--glb",
  glbPath,
  "--preview",
  previewPath,
  "--metadata",
  metadataPath,
]);

if (isSilverstone) {
  await writeSilverstoneClientModel({ configPath: inputPath, metadataPath });
} else if (isSpa) {
  await writeSpaClientModel({ configPath: inputPath, metadataPath });
} else if (isHungaroring) {
  await writeHungaroringClientModel({ configPath: inputPath, metadataPath });
} else {
  await writeZandvoortClientModel({ inputPath, configPath: inputPath, metadataPath });
}
const metrics = await validateTrackAsset({
  glbPath,
  metadataPath,
  modelId,
  previewPath,
  sourceDirectory: payload.sourceDirectory,
});
console.log(`Built ${modelId}:`);
console.log(JSON.stringify(metrics, null, 2));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, PYTHONHASHSEED: "0" },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}
