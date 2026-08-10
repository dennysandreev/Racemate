import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

const LIMITS = {
  bytes: 6_500_000,
  drawCalls: 32,
  materials: 24,
  triangles: 300_000,
};

export async function validateTrackAsset({
  glbPath,
  metadataPath,
  modelId = "zandvoort",
  previewPath,
  sourceDirectory,
}) {
  const [glbBuffer, glbStats, metadata, previewStats] = await Promise.all([
    readFile(glbPath),
    stat(glbPath),
    readFile(metadataPath, "utf8").then(JSON.parse),
    stat(previewPath),
  ]);
  const gltf = parseGlbJson(glbBuffer);
  const metrics = inspectGltf(gltf, glbStats.size, previewStats.size);
  const failures = [];

  if (metrics.bytes > LIMITS.bytes) {
    failures.push(`GLB size ${metrics.bytes} exceeds ${LIMITS.bytes} bytes`);
  }

  if (metrics.triangles > LIMITS.triangles) {
    failures.push(`triangle count ${metrics.triangles} exceeds ${LIMITS.triangles}`);
  }

  if (metrics.drawCalls > LIMITS.drawCalls) {
    failures.push(`draw call estimate ${metrics.drawCalls} exceeds ${LIMITS.drawCalls}`);
  }

  if (metrics.materials > LIMITS.materials) {
    failures.push(`material count ${metrics.materials} exceeds ${LIMITS.materials}`);
  }

  if (metrics.previewBytes < 50_000) {
    failures.push(`preview ${metrics.previewBytes} bytes is unexpectedly small`);
  }

  if (metrics.animations > 0) {
    failures.push(`static track asset contains ${metrics.animations} animation(s)`);
  }

  if (modelId === "zandvoort") {
    const requiredAnchors = [
      ...Array.from({ length: 14 }, (_, index) => `Turn_${String(index + 1).padStart(2, "0")}`),
      "SpeedTrap",
      "StartFinish",
      "SectorBoundary_02",
      "SectorBoundary_03",
      "HighPoint",
      "LowPoint",
    ];
    const missingAnchors = requiredAnchors.filter(
      (anchorName) => !metrics.anchorNames.includes(anchorName),
    );

    if (missingAnchors.length > 0) {
      failures.push(`missing Zandvoort anchors: ${missingAnchors.join(", ")}`);
    }

    if (!metrics.extensionsRequired.includes("EXT_meshopt_compression")) {
      failures.push("Zandvoort GLB must use local Meshopt-compatible compression");
    }

    for (const materialName of [
      "Terrain_2026_Orthophoto",
      "Real_Asphalt",
      "Aerial_Sampled_Buildings",
      "Grandstand_Seats_Red",
      "PDOK_2026_Race_Motorhomes",
      "Pit_Wall_Concrete",
      "Sector_1_Glow",
      "Sector_2_Glow",
      "Sector_3_Glow",
    ]) {
      if (!metrics.materialNames.includes(materialName)) {
        failures.push(`missing real-world material: ${materialName}`);
      }
    }

    const forbiddenSurfaceMaterials = ["Water", "Concrete", "Brick_And_Pavers", "Sand_And_Gravel"];
    const presentForbiddenMaterials = forbiddenSurfaceMaterials.filter((name) =>
      metrics.materialNames.includes(name)
    );
    if (presentForbiddenMaterials.length > 0) {
      failures.push(`synthetic ground materials remain in GLB: ${presentForbiddenMaterials.join(", ")}`);
    }
    const syntheticSurfaceMeshes = metrics.meshNames.filter((name) =>
      /^BGT_(Asphalt|Concrete|Pavers|Gravel|Water)_Surfaces/.test(name)
    );
    if (syntheticSurfaceMeshes.length > 0) {
      failures.push(`synthetic BGT ground meshes remain in GLB: ${syntheticSurfaceMeshes.join(", ")}`);
    }

    validateZandvoortMetadata(metadata, failures);
    if (sourceDirectory) {
      await validateSourceFiles(sourceDirectory, metadata.sourceManifest, failures);
      await validateBuildingSourceAlignment(sourceDirectory, failures);
    }
  }

  if (failures.length > 0) {
    throw new Error(`3D asset budget failed:\n- ${failures.join("\n- ")}`);
  }

  return metrics;
}

function parseGlbJson(buffer) {
  if (buffer.length < 20 || buffer.toString("utf8", 0, 4) !== "glTF") {
    throw new Error("asset is not a GLB file");
  }

  if (buffer.readUInt32LE(4) !== 2) {
    throw new Error("only glTF 2.0 is supported");
  }

  if (buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error("GLB header length does not match the file size");
  }

  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);

  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error("the first GLB chunk is not JSON");
  }

  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonChunkLength).trim());
}

function inspectGltf(gltf, bytes, previewBytes) {
  let triangles = 0;
  let drawCalls = 0;

  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const mode = primitive.mode ?? 4;

      if (mode !== 4) {
        continue;
      }

      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
      const count = gltf.accessors?.[accessorIndex]?.count ?? 0;
      triangles += Math.floor(count / 3);
      drawCalls += 1;
    }
  }

  const anchorNames = (gltf.nodes ?? [])
    .map((node) => node.name)
    .filter((name) => typeof name === "string" && /^(Turn_\d{2}|SpeedTrap|StartFinish|SectorBoundary_\d{2}|HighPoint|LowPoint)$/.test(name))
    .sort();

  return {
    anchorNames,
    animations: gltf.animations?.length ?? 0,
    bytes,
    drawCalls,
    extensionsRequired: gltf.extensionsRequired ?? [],
    materialNames: (gltf.materials ?? []).map((material) => material.name).filter(Boolean),
    materials: gltf.materials?.length ?? 0,
    meshNames: (gltf.meshes ?? []).map((mesh) => mesh.name).filter(Boolean),
    meshes: gltf.meshes?.length ?? 0,
    nodes: gltf.nodes?.length ?? 0,
    previewBytes,
    triangles,
  };
}

function validateZandvoortMetadata(metadata, failures) {
  const layoutQuality = metadata.layoutQuality;

  if (metadata.schemaVersion !== 2) {
    failures.push(`unexpected Zandvoort metadata schema: ${metadata.schemaVersion}`);
  }
  if (metadata.realWorldScale !== "1 unit = 1 metre; no vertical exaggeration") {
    failures.push("Zandvoort metadata must confirm real scale without vertical exaggeration");
  }
  if (metadata.coordinateReferenceSystem !== "EPSG:28992 + NAP") {
    failures.push(`unexpected coordinate reference system: ${metadata.coordinateReferenceSystem}`);
  }
  if (metadata.lapLength?.officialFiaMeters !== 4_259) {
    failures.push(`official FIA lap length is not 4,259 m: ${metadata.lapLength?.officialFiaMeters}`);
  }
  if (!(metadata.lapLength?.relativeErrorPercent <= 0.1)) {
    failures.push(`centreline differs from FIA length by ${metadata.lapLength?.relativeErrorPercent}%`);
  }
  if (metadata.objects?.turnAnchors !== 14) {
    failures.push(`expected 14 turn anchors, got ${metadata.objects?.turnAnchors}`);
  }
  if ((metadata.objects?.buildingLoD22 ?? 0) < 580) {
    failures.push(`expected at least 580 current LoD2.2 buildings, got ${metadata.objects?.buildingLoD22}`);
  }
  if ((metadata.objects?.buildingsTotal ?? 0) < 650) {
    failures.push(`expected at least 650 positioned buildings, got ${metadata.objects?.buildingsTotal}`);
  }
  if ((metadata.objects?.buildingBgtFallback ?? 0) < 10) {
    failures.push("BGT buildings missing from 3DBAG were not rendered");
  }
  if ((metadata.objects?.fenceSegments ?? 0) < 2_000) {
    failures.push(`expected at least 2,000 fence segments, got ${metadata.objects?.fenceSegments}`);
  }
  if ((metadata.objects?.raceMotorhomes ?? 0) < 11) {
    failures.push(`expected 11 georeferenced race motorhomes, got ${metadata.objects?.raceMotorhomes ?? "missing"}`);
  }
  if (layoutQuality?.motorhomes?.remainingTrackConflicts !== 0) {
    failures.push("race motorhomes must stay outside the circuit and pit-lane ribbons");
  }
  if (layoutQuality?.motorhomes?.renderedObjects !== layoutQuality?.motorhomes?.configuredObjects) {
    failures.push("not all georeferenced race motorhomes were rendered");
  }
  if ((metadata.objects?.trees ?? 0) < 150 || (metadata.objects?.lightMasts ?? 0) < 60) {
    failures.push("BGT trees or light masts are incomplete");
  }
  if (metadata.sectorBoundaryDistancesMeters?.length !== 2) {
    failures.push("two FIA sector boundaries are required");
  }
  if (layoutQuality?.surfaceClearance?.remainingBgtCircuitOverlaps !== 0) {
    failures.push("BGT surface polygons must not intersect the circuit or pit-lane ribbons");
  }
  if (layoutQuality?.surfaceClearance?.renderedBgtSurfaceOverlayFeatures !== 0) {
    failures.push(
      `synthetic BGT ground overlays must be disabled, got ${layoutQuality?.surfaceClearance?.renderedBgtSurfaceOverlayFeatures ?? "missing"}`,
    );
  }
  if (!(layoutQuality?.surfaceClearance?.surfaceFeaturesPreservedInOrthophoto > 0)) {
    failures.push("BGT ground classes are not accounted for in the real orthophoto surface");
  }
  if (layoutQuality?.surfaceClearance?.renderedWaterOverlayFeatures !== 0) {
    failures.push(
      `synthetic BGT water overlays must be disabled, got ${layoutQuality?.surfaceClearance?.renderedWaterOverlayFeatures ?? "missing"}`,
    );
  }
  if (!(layoutQuality?.surfaceClearance?.minimumTrackTerrainClearanceMeters >= 0.15)) {
    failures.push(
      `track-to-terrain clearance is ${layoutQuality?.surfaceClearance?.minimumTrackTerrainClearanceMeters ?? "missing"} m`,
    );
  }
  if (layoutQuality?.surfaceClearance?.terrainBreakthroughSamples !== 0) {
    failures.push(
      `terrain still breaks through the circuit at ${layoutQuality?.surfaceClearance?.terrainBreakthroughSamples ?? "missing"} samples`,
    );
  }
  if (!(layoutQuality?.surfaceClearance?.startStraightMinimumClearanceMeters >= 0.20)) {
    failures.push(
      `start-straight terrain clearance is ${layoutQuality?.surfaceClearance?.startStraightMinimumClearanceMeters ?? "missing"} m`,
    );
  }
  if (layoutQuality?.buildings?.remainingTrackConflicts !== 0) {
    failures.push("3DBAG buildings must not intersect the circuit safety corridor");
  }
  if (layoutQuality?.buildings?.remainingGrandstandConflicts !== 0) {
    failures.push("3DBAG buildings must not intersect grandstand footprints");
  }
  if (!(layoutQuality?.buildings?.excludedGrandstandConflicts >= 1)) {
    failures.push("the permanent building over the main grandstand was not filtered");
  }
  if (!(layoutQuality?.buildings?.maximumRenderedCentroidDeltaMeters <= 0.05)) {
    failures.push(
      `rendered buildings are displaced from BGT by ${layoutQuality?.buildings?.maximumRenderedCentroidDeltaMeters ?? "missing"} m`,
    );
  }
  if (!(layoutQuality?.buildings?.replacedStale3dBagWithBgt >= 1)) {
    failures.push("stale 3DBAG geometry was not replaced with the current BGT footprint");
  }
  if (
    (metadata.objects?.buildingsTotal ?? 0) + (layoutQuality?.buildings?.excludedTrackConflicts ?? 0)
      + (layoutQuality?.buildings?.excludedGrandstandConflicts ?? 0)
    < (layoutQuality?.buildings?.sourceActiveBgtFootprints ?? Number.POSITIVE_INFINITY)
  ) {
    failures.push("not all active BGT building footprints are represented in the scene");
  }
  if (layoutQuality?.grandstands?.remainingTrackConflicts !== 0) {
    failures.push("grandstands must not intersect the circuit safety corridor");
  }
  if (layoutQuality?.grandstands?.remainingBlockOverlaps !== 0) {
    failures.push("grandstand sections must not overlap each other");
  }
  if (!(layoutQuality?.grandstands?.minimumTrackClearanceMeters >= 2.5)) {
    failures.push(
      `grandstand track clearance is ${layoutQuality?.grandstands?.minimumTrackClearanceMeters ?? "missing"} m`,
    );
  }
  if (
    !(layoutQuality?.grandstands?.renderedSections > 0) ||
    !(layoutQuality?.grandstands?.candidateSections >= layoutQuality?.grandstands?.renderedSections)
  ) {
    failures.push("grandstand collision pass did not produce valid sections");
  }
  if (!(layoutQuality?.grandstands?.maximumSeatRowTwistMeters <= 0.02)) {
    failures.push(
      `grandstand rows twist by ${layoutQuality?.grandstands?.maximumSeatRowTwistMeters ?? "missing"} m`,
    );
  }
  if (!(layoutQuality?.grandstands?.maximumPlatformStepMeters <= 0.45)) {
    failures.push(
      `adjacent grandstand platforms step by ${layoutQuality?.grandstands?.maximumPlatformStepMeters ?? "missing"} m`,
    );
  }
  if (layoutQuality?.grandstands?.verifiedTurnTenZone !== "Eastside Grandstands 1, 2, 3") {
    failures.push("turn 10 must be verified against the official Eastside grandstand zone");
  }
  if (!(layoutQuality?.pitLane?.lengthMeters >= 700 && layoutQuality?.pitLane?.lengthMeters <= 800)) {
    failures.push(`pit-lane length is invalid: ${layoutQuality?.pitLane?.lengthMeters ?? "missing"} m`);
  }
  if (!(layoutQuality?.pitLane?.widthMeters >= 10 && layoutQuality?.pitLane?.widthMeters <= 13)) {
    failures.push(`pit-lane width is invalid: ${layoutQuality?.pitLane?.widthMeters ?? "missing"} m`);
  }
  if (layoutQuality?.pitLane?.pitBoxes !== 32) {
    failures.push(`expected 32 pit boxes, got ${layoutQuality?.pitLane?.pitBoxes ?? "missing"}`);
  }
  if (layoutQuality?.pitLane?.fastLaneSeparator !== true) {
    failures.push("pit lane is missing its fast-lane separator");
  }
  if (!(layoutQuality?.pitLane?.pitWall?.lengthMeters >= 450)) {
    failures.push(`pit wall is too short: ${layoutQuality?.pitLane?.pitWall?.lengthMeters ?? "missing"} m`);
  }
  if (!(layoutQuality?.pitLane?.pitWall?.wallHeightMeters >= 1)) {
    failures.push("pit lane is missing its concrete wall");
  }
  if (!(layoutQuality?.pitLane?.pitWall?.fenceHeightMeters >= 1)) {
    failures.push("pit lane is missing its safety fence");
  }
  if (!(layoutQuality?.pitLane?.pitWall?.panels >= 140)) {
    failures.push(`pit-wall fence panels are incomplete: ${layoutQuality?.pitLane?.pitWall?.panels ?? "missing"}`);
  }
  if (!(layoutQuality?.pitLane?.taperMeters >= 20)) {
    failures.push("pit-lane entry and exit tapers are missing");
  }
  if (
    !(layoutQuality?.pitLane?.entryGapMeters <= 0.25) ||
    !(layoutQuality?.pitLane?.exitGapMeters <= 0.25)
  ) {
    failures.push("pit-lane entry and exit must connect to the main circuit");
  }
  const licenses = new Set(metadata.sourceManifest?.sources?.map((source) => source.license));
  for (const requiredLicense of ["CC0 1.0", "CC BY 4.0", "ODbL 1.0"]) {
    if (!licenses.has(requiredLicense)) {
      failures.push(`source manifest is missing ${requiredLicense} data`);
    }
  }
  const officialSources = metadata.officialSources ?? [];
  if (!officialSources.some((source) => source.url?.includes("2025_F1-Wayfinding-Map"))) {
    failures.push("official Dutch GP wayfinding map is missing from model metadata");
  }
  if (!officialSources.some((source) => source.url?.includes("/en/tribunes/"))) {
    failures.push("current 2026 Dutch GP grandstand confirmation is missing from model metadata");
  }
}

async function validateSourceFiles(sourceDirectory, sourceManifest, failures) {
  for (const source of sourceManifest?.sources ?? []) {
    try {
      const buffer = await readFile(path.join(sourceDirectory, source.file));
      const digest = createHash("sha256").update(buffer).digest("hex");
      if (digest !== source.sha256 || buffer.length !== source.bytes) {
        failures.push(`source checksum mismatch: ${source.file}`);
      }
    } catch (error) {
      failures.push(`source file cannot be verified: ${source.file} (${error.code ?? error.message})`);
    }
  }
}

async function validateBuildingSourceAlignment(sourceDirectory, failures) {
  try {
    const [city, bgt] = await Promise.all([
      readFile(path.join(sourceDirectory, "3dbag-buildings.city.json"), "utf8").then(JSON.parse),
      readFile(path.join(sourceDirectory, "bgt/pand.geojson"), "utf8").then(JSON.parse),
    ]);
    const transform = city.metadata?.transform;
    const bgtByBag = new Map(
      bgt.features
        .filter((feature) => feature.properties?.bag_pnd && feature.properties.bag_pnd !== "0473100000000000")
        .map((feature) => [feature.properties.bag_pnd, feature]),
    );
    const deltas = [];

    for (const feature of city.features) {
      const bagId = feature.id?.replace("NL.IMBAG.Pand.", "");
      const bgtFeature = bgtByBag.get(bagId);
      if (!bgtFeature || !transform) continue;
      const vertices = feature.vertices.map((vertex) => [
        vertex[0] * transform.scale[0] + transform.translate[0],
        vertex[1] * transform.scale[1] + transform.translate[1],
      ]);
      const cityMetrics = polygonSetMetrics(cityGroundFootprints(feature, vertices));
      const bgtMetrics = polygonSetMetrics(geojsonOuterRings(bgtFeature.geometry));
      if (!cityMetrics || !bgtMetrics) continue;
      deltas.push(Math.hypot(cityMetrics.x - bgtMetrics.x, cityMetrics.y - bgtMetrics.y));
    }

    deltas.sort((first, second) => first - second);
    const median = deltas[Math.floor(deltas.length / 2)] ?? Number.POSITIVE_INFINITY;
    const p95 = deltas[Math.floor(deltas.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    const withinOneMeter = deltas.filter((delta) => delta <= 1).length;
    if (deltas.length < 630 || median > 0.05 || p95 > 1 || withinOneMeter / deltas.length < 0.99) {
      failures.push(
        `3DBAG pagination is misaligned with BGT: matched=${deltas.length}, median=${median.toFixed(3)} m, p95=${p95.toFixed(3)} m`,
      );
    }
  } catch (error) {
    failures.push(`building source alignment cannot be verified: ${error.code ?? error.message}`);
  }
}

function geojsonOuterRings(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates.slice(0, 1);
  if (geometry?.type === "MultiPolygon") return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function cityGroundFootprints(feature, vertices) {
  const result = [];
  for (const cityObject of Object.values(feature.CityObjects ?? {})) {
    if (cityObject.type !== "BuildingPart") continue;
    const geometry = cityObject.geometry?.find((item) => item.lod === "2.2");
    if (!geometry) continue;
    const surfaces = geometry.semantics?.surfaces ?? [];
    const values = geometry.semantics?.values?.[0] ?? [];
    for (let surfaceIndex = 0; surfaceIndex < geometry.boundaries?.[0]?.length; surfaceIndex += 1) {
      if (surfaces[values[surfaceIndex]]?.type !== "GroundSurface") continue;
      const ring = geometry.boundaries[0][surfaceIndex][0];
      if (ring?.length >= 3) result.push(ring.map((index) => vertices[index]));
    }
  }
  return result;
}

function polygonSetMetrics(polygons) {
  let totalArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (const sourceRing of polygons) {
    const ring = sourceRing.length > 1 && sourceRing[0][0] === sourceRing.at(-1)[0]
      && sourceRing[0][1] === sourceRing.at(-1)[1]
      ? sourceRing.slice(0, -1)
      : sourceRing;
    if (ring.length < 3) continue;
    const [originX, originY] = ring[0];
    let twiceArea = 0;
    let centroidX = 0;
    let centroidY = 0;
    for (let index = 0; index < ring.length; index += 1) {
      const first = ring[index];
      const second = ring[(index + 1) % ring.length];
      const x1 = first[0] - originX;
      const y1 = first[1] - originY;
      const x2 = second[0] - originX;
      const y2 = second[1] - originY;
      const cross = x1 * y2 - x2 * y1;
      twiceArea += cross;
      centroidX += (x1 + x2) * cross;
      centroidY += (y1 + y2) * cross;
    }
    if (Math.abs(twiceArea) < 1e-9) continue;
    const area = Math.abs(twiceArea) / 2;
    totalArea += area;
    weightedX += (originX + centroidX / (3 * twiceArea)) * area;
    weightedY += (originY + centroidY / (3 * twiceArea)) * area;
  }
  return totalArea > 0
    ? { area: totalArea, x: weightedX / totalArea, y: weightedY / totalArea }
    : null;
}

function readArguments(argv) {
  const modelId = argv.find((value) => !value.startsWith("--")) ?? "zandvoort";
  const glbFlagIndex = argv.indexOf("--glb");
  const previewFlagIndex = argv.indexOf("--preview");
  const metadataFlagIndex = argv.indexOf("--metadata");
  const sourceFlagIndex = argv.indexOf("--source");

  return {
    modelId,
    glbPath: path.resolve(
      projectRoot,
      glbFlagIndex >= 0 ? argv[glbFlagIndex + 1] : `public/f1/tracks/3d/${modelId}.glb`,
    ),
    metadataPath: path.resolve(
      projectRoot,
      metadataFlagIndex >= 0
        ? argv[metadataFlagIndex + 1]
        : `public/f1/tracks/3d/${modelId}-metadata.json`,
    ),
    previewPath: path.resolve(
      projectRoot,
      previewFlagIndex >= 0
        ? argv[previewFlagIndex + 1]
        : `public/f1/tracks/3d/${modelId}-preview.webp`,
    ),
    sourceDirectory: sourceFlagIndex >= 0
      ? path.resolve(projectRoot, argv[sourceFlagIndex + 1])
      : path.join(projectRoot, ".track-model-build", `${modelId}-source`),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const metrics = await validateTrackAsset(readArguments(process.argv.slice(2)));
  console.log(JSON.stringify(metrics, null, 2));
}
