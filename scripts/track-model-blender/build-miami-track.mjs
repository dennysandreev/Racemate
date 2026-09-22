import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeMiamiClientModel } from "./write-miami-client-model.mjs";
import { validateTrackAsset } from "./validate-track.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scripts,"../..");

export async function buildMiamiTrack() {
  const configPath = path.join(root,".track-model-build/miami.json");
  const metadataPath = path.join(root,"public/f1/tracks/3d/miami-metadata.json");
  const glbPath = path.join(root,"public/f1/tracks/3d/miami.glb");
  const previewPath = path.join(root,"public/f1/tracks/3d/miami-preview.webp");
  const python = process.env.PYTHON_BIN ?? "python3";
  const run = (command,args) => {
    const result = spawnSync(command,args,{ cwd:root,stdio:"inherit",env:{ ...process.env,PYTHONHASHSEED:"0" } });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed: ${result.status}`);
  };
  run(python,[path.join(scripts,"download-miami-data.py"),...(process.argv.includes("--offline") ? ["--offline"] : [])]);
  run(python,[path.join(scripts,"prepare-miami-model.py")]);
  run(process.env.BLENDER_BIN ?? "blender",["--background","--factory-startup","--python-exit-code","1","--python",path.join(scripts,"build-miami-digital-twin.py"),"--","--input",configPath,"--prepared",path.join(root,".track-model-build/miami-prepared"),"--glb",glbPath,"--preview",previewPath,"--metadata",metadataPath]);
  await writeMiamiClientModel({ configPath,metadataPath });
  const metrics = await validateTrackAsset({ modelId:"miami",glbPath,previewPath,metadataPath,sourceDirectory:path.join(root,".track-model-build/miami-source") });
  console.log(JSON.stringify(metrics,null,2));
}
