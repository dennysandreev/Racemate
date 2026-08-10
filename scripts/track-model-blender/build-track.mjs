import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { exportTrackData } from "./export-track-data.mjs";
import { validateTrackAsset } from "./validate-track.mjs";
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
const payload = await exportTrackData({
  forceSources: process.argv.includes("--force-sources"),
  modelId,
  outputPath: inputPath,
});

run(process.env.PYTHON_BIN ?? "python3", [
  path.join(scriptDirectory, "prepare-zandvoort-rasters.py"),
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
  path.join(scriptDirectory, "build-zandvoort-digital-twin.py"),
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

await writeZandvoortClientModel({ inputPath, configPath: inputPath, metadataPath });
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
