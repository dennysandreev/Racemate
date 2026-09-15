import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeBakuClientModel } from "./write-baku-client-model.mjs";
import { validateTrackAsset } from "./validate-track.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");

export async function buildBakuTrack() {
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
  };
  const python = process.env.PYTHON_BIN ?? "python3";
  const offline = process.argv.includes("--offline") ? ["--offline"] : [];
  for (const script of ["prepare-baku-sources.py", "fetch-baku-reference-layers.py", "prepare-baku-raster-sources.py"]) {
    run(python, [path.join(directory, script), ...offline]);
  }
  run(python, [path.join(directory, "prepare-baku-model.py")]);
  run(python, [path.join(directory, "prepare-baku-building-textures.py"), ...offline]);
  const assetDirectory = path.join(root, "public/f1/tracks/3d");
  const glbPath = path.join(assetDirectory, "baku.glb");
  const metadataPath = path.join(assetDirectory, "baku-metadata.json");
  const previewPath = path.join(assetDirectory, "baku-preview.webp");
  run(process.env.BLENDER_BIN ?? "blender", ["--background", "--python", path.join(directory, "build-baku-digital-twin.py"), "--",
    "--input", path.join(root, ".track-model-build/baku.json"), "--prepared", path.join(root, ".track-model-build/baku-prepared"),
    "--glb", glbPath, "--metadata", metadataPath, "--preview", previewPath]);
  await writeBakuClientModel();
  console.log(await validateTrackAsset({ modelId: "baku", glbPath, metadataPath, previewPath }));
}
