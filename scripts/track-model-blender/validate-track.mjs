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

  if (modelId === "spa") {
    const requiredAnchors = [
      ...Array.from({ length: 19 }, (_, index) => `Turn_${String(index + 1).padStart(2, "0")}`),
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
      failures.push(`missing Spa anchors: ${missingAnchors.join(", ")}`);
    }
    if (!metrics.extensionsRequired.includes("EXT_meshopt_compression")) {
      failures.push("Spa GLB must use local Meshopt-compatible compression");
    }
    for (const materialName of [
      "Terrain_SPW_Orthophoto_2023",
      "Spa_Real_Asphalt",
      "Spa_Current_OSM_DSM_Buildings",
      "Spa_Grandstand_Seats_Red",
      "SpaGP_2026_Race_Motorhomes",
      "Spa_Pit_Wall_Concrete",
      "Spa_Real_Gravel_Runoff",
      "Sector_1_Glow",
      "Sector_2_Glow",
      "Sector_3_Glow",
    ]) {
      if (!metrics.materialNames.includes(materialName)) {
        failures.push(`missing Spa real-world material: ${materialName}`);
      }
    }

    validateSpaMetadata(metadata, failures);
    if (sourceDirectory) {
      await validateSourceFiles(sourceDirectory, metadata.sourceManifest, failures);
    }
  }

  if (modelId === "hungaroring") {
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
      failures.push(`missing Hungaroring anchors: ${missingAnchors.join(", ")}`);
    }
    if (!metrics.extensionsRequired.includes("EXT_meshopt_compression")) {
      failures.push("Hungaroring GLB must use local Meshopt-compatible compression");
    }
    for (const materialName of [
      "Terrain_Hungaroring_Current_Hybrid_Ground",
      "Hungaroring_Real_Asphalt",
      "Hungaroring_Current_OSM_Buildings",
      "Hungaroring_Grandstand_Seats_Red",
      "Hungaroring_2026_Race_Motorhomes",
      "Hungaroring_Pit_Wall_Concrete",
      "Hungaroring_Real_Gravel_Runoff",
      "Sector_1_Glow",
      "Sector_2_Glow",
      "Sector_3_Glow",
    ]) {
      if (!metrics.materialNames.includes(materialName)) {
        failures.push(`missing Hungaroring real-world material: ${materialName}`);
      }
    }

    validateHungaroringMetadata(metadata, failures);
    if (sourceDirectory) {
      await validateSourceFiles(sourceDirectory, metadata.sourceManifest, failures);
    }
  }

  if (modelId === "silverstone") {
    const requiredAnchors = [
      ...Array.from({ length: 18 }, (_, index) => `Turn_${String(index + 1).padStart(2, "0")}`),
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
      failures.push(`missing Silverstone anchors: ${missingAnchors.join(", ")}`);
    }
    if (!metrics.extensionsRequired.includes("EXT_meshopt_compression")) {
      failures.push("Silverstone GLB must use local Meshopt-compatible compression");
    }
    for (const materialName of [
      "Terrain_Silverstone_EA_LIDAR_Hybrid_Ground",
      "Silverstone_Real_Asphalt",
      "Silverstone_Current_OSM_Buildings",
      "Silverstone_Grandstand_Seats_Red",
      "Silverstone_2026_Race_Motorhomes",
      "Silverstone_Pit_Wall_Concrete",
      "Silverstone_Real_Gravel_Runoff",
      "Sector_1_Glow",
      "Sector_2_Glow",
      "Sector_3_Glow",
    ]) {
      if (!metrics.materialNames.includes(materialName)) {
        failures.push(`missing Silverstone real-world material: ${materialName}`);
      }
    }
    for (const meshName of [
      "FIA_Silverstone_Centreline_15m_Mesh",
      "FIA_Pit_Lane_Markings_41_Boxes_Mesh",
      "FIA_Pit_Straight_Dual_Fences_Mesh",
      "Silverstone_Wing_2026_41_Position_Pit_Complex_Mesh",
    ]) {
      if (!metrics.meshNames.includes(meshName)) {
        failures.push(`missing Silverstone circuit mesh: ${meshName}`);
      }
    }

    validateSilverstoneMetadata(metadata, failures);
    if (sourceDirectory) {
      await validateSourceFiles(sourceDirectory, metadata.sourceManifest, failures);
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

function validateSpaMetadata(metadata, failures) {
  const quality = metadata.layoutQuality;

  if (metadata.schemaVersion !== 3) {
    failures.push(`unexpected Spa metadata schema: ${metadata.schemaVersion}`);
  }
  if (metadata.realWorldScale !== "1 unit = 1 metre; no vertical exaggeration") {
    failures.push("Spa metadata must confirm real scale without vertical exaggeration");
  }
  if (metadata.coordinateReferenceSystem !== "EPSG:3812 + DNG (EPSG:5710)") {
    failures.push(`unexpected Spa coordinate reference system: ${metadata.coordinateReferenceSystem}`);
  }
  if (metadata.lapLength?.officialFiaMeters !== 7_004) {
    failures.push(`official FIA Spa lap length is not 7,004 m: ${metadata.lapLength?.officialFiaMeters}`);
  }
  if (!(metadata.lapLength?.relativeErrorPercent <= 0.5)) {
    failures.push(`Spa centreline differs from FIA length by ${metadata.lapLength?.relativeErrorPercent}%`);
  }
  if (metadata.objects?.turnAnchors !== 19) {
    failures.push(`expected 19 Spa turn anchors, got ${metadata.objects?.turnAnchors}`);
  }
  if (JSON.stringify(metadata.sectorBoundaryDistancesMeters) !== JSON.stringify([2_254, 5_074])) {
    failures.push(`unexpected Spa sector boundaries: ${metadata.sectorBoundaryDistancesMeters}`);
  }
  if ((metadata.objects?.buildingsTotal ?? 0) < 100) {
    failures.push(`expected at least 100 current Spa buildings, got ${metadata.objects?.buildingsTotal}`);
  }
  if ((metadata.objects?.mappedGrandstands ?? 0) < 5) {
    failures.push(`expected at least 5 mapped Spa grandstands, got ${metadata.objects?.mappedGrandstands}`);
  }
  if ((metadata.objects?.grandstandSections ?? 0) < 10) {
    failures.push(`expected current GP grandstand sections, got ${metadata.objects?.grandstandSections}`);
  }
  if ((metadata.objects?.fenceSegments ?? 0) < 300) {
    failures.push(`expected at least 300 mapped barrier segments, got ${metadata.objects?.fenceSegments}`);
  }
  if ((metadata.objects?.trees ?? 0) < 100) {
    failures.push(`expected Ardennes tree groups, got ${metadata.objects?.trees}`);
  }
  if ((metadata.objects?.runoffSections ?? 0) < 100) {
    failures.push(`expected modelled runoff sections, got ${metadata.objects?.runoffSections}`);
  }
  if ((metadata.objects?.raceMotorhomes ?? 0) < 10) {
    failures.push(`expected paddock race motorhomes, got ${metadata.objects?.raceMotorhomes}`);
  }
  if (quality?.motorhomes?.remainingTrackConflicts !== 0) {
    failures.push("Spa race motorhomes must stay outside the circuit and pit-lane ribbons");
  }
  if (quality?.buildings?.remainingTrackConflicts !== 0) {
    failures.push("Spa buildings must not intersect the circuit safety corridor");
  }
  if (!(quality?.surfaceClearance?.minimumTrackTerrainClearanceMeters >= 0.15)) {
    failures.push(`Spa track-to-terrain clearance is ${quality?.surfaceClearance?.minimumTrackTerrainClearanceMeters ?? "missing"} m`);
  }
  if (quality?.surfaceClearance?.terrainBreakthroughSamples !== 0) {
    failures.push(`terrain breaks through Spa circuit at ${quality?.surfaceClearance?.terrainBreakthroughSamples ?? "missing"} samples`);
  }
  if (quality?.pitLane?.pitBoxes !== 42) {
    failures.push(`expected 42 Spa garage slots, got ${quality?.pitLane?.pitBoxes ?? "missing"}`);
  }
  if (!(quality?.pitLane?.lengthMeters >= 650 && quality?.pitLane?.lengthMeters <= 850)) {
    failures.push(`Spa pit-lane length is invalid: ${quality?.pitLane?.lengthMeters ?? "missing"} m`);
  }
  if (quality?.pitLane?.fastLaneSeparator !== true) {
    failures.push("Spa pit lane is missing its fast-lane separator");
  }
  if (!(quality?.pitLane?.entryMinimumWidthMeters >= 4)) {
    failures.push(`Spa pit-lane entry is incomplete: ${quality?.pitLane?.entryMinimumWidthMeters ?? "missing"} m`);
  }
  if (quality?.pitLane?.entrySurface !== "asphalt" || quality?.pitLane?.taperProfile !== "smoothstep") {
    failures.push("Spa pit-lane entry must use a continuous smooth asphalt taper");
  }
  if (quality?.runoff?.pitEntrySurface !== "asphalt" || quality?.runoff?.syntheticGravelAtPitEntry !== false) {
    failures.push("Spa turns 18-19 still contain synthetic gravel over the pit entry");
  }
  if (quality?.runoff?.syntheticRunoffAtPitEntry !== false || quality?.runoff?.pitEntryGroundContext !== "orthophoto") {
    failures.push("Spa turns 18-19 still contain synthetic runoff polygons over the orthophoto");
  }
  if (!(quality?.pitLane?.pitWall?.lengthMeters >= 400)) {
    failures.push(`Spa pit wall is too short: ${quality?.pitLane?.pitWall?.lengthMeters ?? "missing"} m`);
  }
  if (!(quality?.pitLane?.pitWall?.wallHeightMeters <= 0.8)) {
    failures.push(`Spa pit-wall divider is too tall: ${quality?.pitLane?.pitWall?.wallHeightMeters ?? "missing"} m`);
  }
  if (!(quality?.pitLane?.pitWall?.fenceHeightMeters <= 0.85)) {
    failures.push(`Spa pit-wall fence is too tall: ${quality?.pitLane?.pitWall?.fenceHeightMeters ?? "missing"} m`);
  }
  if (quality?.pitLane?.pitComplex?.garageBoxes !== 42) {
    failures.push(`Spa pit complex must contain 42 garage boxes, got ${quality?.pitLane?.pitComplex?.garageBoxes ?? "missing"}`);
  }
  if (!(quality?.pitLane?.pitComplex?.grandstandRows >= 8)) {
    failures.push("Spa pit complex is missing the grandstand above its garages");
  }
  if (quality?.buildings?.excludedReplacedCircuitStructures !== 2) {
    failures.push("obsolete Spa pit and Endurance building blocks were not replaced");
  }
  if (quality?.buildings?.downwardFacingRoofTriangles !== 0) {
    failures.push("Spa buildings contain downward-facing or missing roof surfaces");
  }
  if (!(quality?.buildings?.roofTriangles > 0)) {
    failures.push("Spa buildings are missing roof geometry");
  }
  if (quality?.mappedGrandstands?.roofedStructures !== metadata.objects?.mappedGrandstands) {
    failures.push("Spa mapped structures are missing covered roofs");
  }
  if (quality?.mappedGrandstands?.downwardFacingRoofTriangles !== 0) {
    failures.push("Spa mapped structure roofs face away from the viewer");
  }
  if (quality?.mappedGrandstands?.redRoofSurfaces !== 0) {
    failures.push("Spa mapped structures still use synthetic red roof surfaces");
  }
  if (quality?.motorhomes?.behindPitComplex !== true) {
    failures.push("Spa motorhomes are not confirmed behind the pit complex");
  }
  if (!(quality?.grandstands?.maximumSupportHeightMeters <= 12.5)) {
    failures.push(`Spa grandstand supports are too tall: ${quality?.grandstands?.maximumSupportHeightMeters ?? "missing"} m`);
  }
  if (quality?.surfaceSmoothing?.afterTurn17?.applied !== true) {
    failures.push("Spa track surface after turn 17 was not smoothed");
  }
  if (!(quality?.surfaceSmoothing?.afterTurn17?.maximumCorrectionMeters <= 4)) {
    failures.push(`Spa turn-17 smoothing correction is excessive: ${quality?.surfaceSmoothing?.afterTurn17?.maximumCorrectionMeters ?? "missing"} m`);
  }
  const licenses = new Set(metadata.sourceManifest?.sources?.map((source) => source.license));
  for (const requiredLicense of ["CC BY 4.0", "ODbL 1.0"]) {
    if (!licenses.has(requiredLicense)) {
      failures.push(`Spa source manifest is missing ${requiredLicense} data`);
    }
  }
  const officialSources = metadata.officialSources ?? [];
  if (!officialSources.some((source) => source.url?.includes("season-2026-2072"))) {
    failures.push("official FIA 2026 Spa document index is missing from model metadata");
  }
  if (!officialSources.some((source) => source.url?.includes("spagrandprix.com"))) {
    failures.push("current official Spa GP grandstand map is missing from model metadata");
  }
}

function validateHungaroringMetadata(metadata, failures) {
  const quality = metadata.layoutQuality;

  if (metadata.schemaVersion !== 4) {
    failures.push(`unexpected Hungaroring metadata schema: ${metadata.schemaVersion}`);
  }
  if (metadata.realWorldScale !== "1 unit = 1 metre; no vertical exaggeration") {
    failures.push("Hungaroring metadata must confirm real scale without vertical exaggeration");
  }
  if (metadata.coordinateReferenceSystem !== "EPSG:32634 + source DEM metres") {
    failures.push(`unexpected Hungaroring coordinate reference system: ${metadata.coordinateReferenceSystem}`);
  }
  if (metadata.lapLength?.officialFiaMeters !== 4_381) {
    failures.push(`official FIA Hungaroring lap length is not 4,381 m: ${metadata.lapLength?.officialFiaMeters}`);
  }
  if (!(metadata.lapLength?.relativeErrorPercent <= 0.5)) {
    failures.push(`Hungaroring centreline differs from FIA length by ${metadata.lapLength?.relativeErrorPercent}%`);
  }
  if (metadata.objects?.turnAnchors !== 14) {
    failures.push(`expected 14 Hungaroring turn anchors, got ${metadata.objects?.turnAnchors}`);
  }
  if (JSON.stringify(metadata.sectorBoundaryDistancesMeters) !== JSON.stringify([1_736, 3_278])) {
    failures.push(`unexpected Hungaroring sector boundaries: ${metadata.sectorBoundaryDistancesMeters}`);
  }
  if ((metadata.objects?.buildingsTotal ?? 0) < 20) {
    failures.push(`expected at least 20 current Hungaroring buildings, got ${metadata.objects?.buildingsTotal}`);
  }
  if ((metadata.objects?.grandstandSections ?? 0) < 80) {
    failures.push(`expected current Hungaroring GP grandstand sections, got ${metadata.objects?.grandstandSections}`);
  }
  if ((metadata.objects?.fenceSegments ?? 0) < 200) {
    failures.push(`expected at least 200 mapped Hungaroring barrier segments, got ${metadata.objects?.fenceSegments}`);
  }
  if ((metadata.objects?.mappedTrees ?? 0) < 40) {
    failures.push(`expected mapped Hungaroring tree context, got ${metadata.objects?.mappedTrees}`);
  }
  if ((metadata.objects?.runoffSections ?? 0) < 200) {
    failures.push(`expected modelled Hungaroring runoff sections, got ${metadata.objects?.runoffSections}`);
  }
  if ((metadata.objects?.raceMotorhomes ?? 0) < 10) {
    failures.push(`expected Hungaroring paddock race motorhomes, got ${metadata.objects?.raceMotorhomes}`);
  }
  if (quality?.motorhomes?.remainingTrackConflicts !== 0) {
    failures.push("Hungaroring race motorhomes must stay outside the circuit and pit-lane ribbons");
  }
  if (quality?.motorhomes?.behindPitComplex !== true) {
    failures.push("Hungaroring motorhomes are not confirmed behind the pit complex");
  }
  if (quality?.motorhomes?.compactCluster !== true || !(quality?.motorhomes?.clusterSpanMeters <= 75)) {
    failures.push("Hungaroring motorhomes must form a compact paddock cluster");
  }
  if (quality?.motorhomes?.rearTowardPitGrandstand !== true) {
    failures.push("Hungaroring motorhomes must face rear-first toward the pit grandstand");
  }
  if (quality?.buildings?.remainingTrackConflicts !== 0) {
    failures.push("Hungaroring buildings must not intersect the circuit safety corridor");
  }
  if (!(quality?.surfaceClearance?.minimumTrackTerrainClearanceMeters >= 0.15)) {
    failures.push(`Hungaroring track-to-terrain clearance is ${quality?.surfaceClearance?.minimumTrackTerrainClearanceMeters ?? "missing"} m`);
  }
  if (quality?.surfaceClearance?.terrainBreakthroughSamples !== 0) {
    failures.push(`terrain breaks through Hungaroring at ${quality?.surfaceClearance?.terrainBreakthroughSamples ?? "missing"} samples`);
  }
  if (quality?.surfaceSmoothing?.wholeLap?.applied !== true) {
    failures.push("Hungaroring racing surface was not smoothed around the full lap");
  }
  if (!(quality?.surfaceSmoothing?.wholeLap?.maximumCorrectionMeters <= 4)) {
    failures.push(`Hungaroring surface smoothing correction is excessive: ${quality?.surfaceSmoothing?.wholeLap?.maximumCorrectionMeters ?? "missing"} m`);
  }
  if (!(quality?.surfaceSmoothing?.wholeLap?.maximumSmoothedStepMeters < quality?.surfaceSmoothing?.wholeLap?.maximumRawStepMeters)) {
    failures.push("Hungaroring surface smoothing did not reduce DEM steps");
  }
  if (quality?.runoff?.syntheticGravelAtPitEntry !== false || quality?.runoff?.syntheticRunoffAtPitEntry !== false) {
    failures.push("Hungaroring pit entry still contains synthetic gravel or runoff polygons");
  }
  if (JSON.stringify(quality?.runoff?.excludedTurns) !== JSON.stringify([12, 13, 14])) {
    failures.push(`unexpected Hungaroring pit-entry runoff exclusion: ${quality?.runoff?.excludedTurns}`);
  }
  if (!(quality?.curbs?.innerOffsetMeters > 7.5) || !(quality?.curbs?.widthMeters >= 1.1) || !(quality?.curbs?.visibleHeightMeters >= 0.1)) {
    failures.push("Hungaroring curbs are not fully outside and visibly above the 15 m asphalt ribbon");
  }
  if (quality?.pitLane?.pitBoxes !== 36) {
    failures.push(`expected 36 Hungaroring garage slots, got ${quality?.pitLane?.pitBoxes ?? "missing"}`);
  }
  if (!(quality?.pitLane?.lengthMeters >= 1_000 && quality?.pitLane?.lengthMeters <= 1_120)) {
    failures.push(`Hungaroring pit-lane length is invalid: ${quality?.pitLane?.lengthMeters ?? "missing"} m`);
  }
  if (quality?.pitLane?.fastLaneSeparator !== true) {
    failures.push("Hungaroring pit lane is missing its fast-lane separator");
  }
  if (!(quality?.pitLane?.entryMinimumWidthMeters >= 4)) {
    failures.push(`Hungaroring pit-lane entry is incomplete: ${quality?.pitLane?.entryMinimumWidthMeters ?? "missing"} m`);
  }
  if (quality?.pitLane?.entrySurface !== "asphalt" || quality?.pitLane?.taperProfile !== "smoothstep") {
    failures.push("Hungaroring pit-lane entry must use a continuous smooth asphalt taper");
  }
  if (!(quality?.pitLane?.pitWall?.lengthMeters >= 700)) {
    failures.push(`Hungaroring pit wall is too short: ${quality?.pitLane?.pitWall?.lengthMeters ?? "missing"} m`);
  }
  if (!(quality?.pitLane?.pitWall?.wallHeightMeters <= 0.55)) {
    failures.push(`Hungaroring pit divider is too tall: ${quality?.pitLane?.pitWall?.wallHeightMeters ?? "missing"} m`);
  }
  if (!(quality?.pitLane?.pitWall?.fenceHeightMeters <= 0.65)) {
    failures.push(`Hungaroring pit divider fence is too tall: ${quality?.pitLane?.pitWall?.fenceHeightMeters ?? "missing"} m`);
  }
  if (quality?.pitLane?.pitWall?.placement !== "between main circuit and pit lane") {
    failures.push("Hungaroring pit divider is not confirmed between the circuit and pit lane");
  }
  if (quality?.pitLane?.pitComplex?.garageBoxes !== 36) {
    failures.push(`Hungaroring pit complex must contain 36 garage boxes, got ${quality?.pitLane?.pitComplex?.garageBoxes ?? "missing"}`);
  }
  if (!(quality?.pitLane?.pitComplex?.grandstandRows >= 8)) {
    failures.push("Hungaroring pit complex is missing the grandstand above its garages");
  }
  if (quality?.buildings?.downwardFacingRoofTriangles !== 0) {
    failures.push("Hungaroring buildings contain downward-facing or missing roof surfaces");
  }
  if (!(quality?.buildings?.roofTriangles > 0)) {
    failures.push("Hungaroring buildings are missing roof geometry");
  }
  if (quality?.terrainSurface?.macroColorSource !== "2022 orthophoto overview") {
    failures.push("Hungaroring terrain must retain the licensed 2022 macro-colour source");
  }
  if (quality?.terrainSurface?.detailSource !== "current OpenStreetMap ground geometry") {
    failures.push("Hungaroring terrain is missing its current OSM fine-detail source");
  }
  if (!(quality?.terrainSurface?.currentGroundPolygons >= 30)) {
    failures.push(`Hungaroring terrain has too few current ground polygons: ${quality?.terrainSurface?.currentGroundPolygons ?? "missing"}`);
  }
  if (!(quality?.terrainSurface?.currentGroundLines >= 80)) {
    failures.push(`Hungaroring terrain has too few current ground lines: ${quality?.terrainSurface?.currentGroundLines ?? "missing"}`);
  }
  if (!(quality?.terrainSurface?.textureWidth >= 3_000 && quality?.terrainSurface?.textureHeight >= 3_000)) {
    failures.push("Hungaroring terrain texture is below the 3K delivery target");
  }
  const licenses = new Set(metadata.sourceManifest?.sources?.map((source) => source.license));
  for (const requiredLicense of ["CC BY 4.0", "ODbL 1.0"]) {
    if (!licenses.has(requiredLicense)) {
      failures.push(`Hungaroring source manifest is missing ${requiredLicense} data`);
    }
  }
  const officialSources = metadata.officialSources ?? [];
  if (!officialSources.some((source) => source.url?.includes("season-2026-1130"))) {
    failures.push("official FIA 2026 Hungaroring document index is missing from model metadata");
  }
  if (!officialSources.some((source) => source.url?.includes("hungaroring.hu"))) {
    failures.push("current official Hungaroring renovation confirmation is missing from model metadata");
  }
}

function validateSilverstoneMetadata(metadata, failures) {
  const quality = metadata.layoutQuality;
  if (metadata.schemaVersion !== 5) {
    failures.push(`unexpected Silverstone metadata schema: ${metadata.schemaVersion}`);
  }
  if (metadata.realWorldScale !== "1 unit = 1 metre; no vertical exaggeration") {
    failures.push("Silverstone metadata must confirm real scale without vertical exaggeration");
  }
  if (metadata.coordinateReferenceSystem !== "EPSG:32630 + ODN") {
    failures.push(`unexpected Silverstone coordinate reference system: ${metadata.coordinateReferenceSystem}`);
  }
  if (metadata.verticalDatum !== "Ordnance Datum Newlyn (ODN); no vertical exaggeration") {
    failures.push(`unexpected Silverstone vertical datum: ${metadata.verticalDatum}`);
  }
  if (metadata.lapLength?.officialFiaMeters !== 5_891) {
    failures.push(`official FIA Silverstone lap length is not 5,891 m: ${metadata.lapLength?.officialFiaMeters}`);
  }
  if (!(metadata.lapLength?.relativeErrorPercent <= 0.5)) {
    failures.push(`Silverstone centreline differs from FIA length by ${metadata.lapLength?.relativeErrorPercent}%`);
  }
  if (metadata.objects?.turnAnchors !== 18) {
    failures.push(`expected 18 Silverstone turn anchors, got ${metadata.objects?.turnAnchors}`);
  }
  if (JSON.stringify(metadata.sectorBoundaryDistancesMeters) !== JSON.stringify([1_823, 4_287])) {
    failures.push(`unexpected Silverstone sector boundaries: ${metadata.sectorBoundaryDistancesMeters}`);
  }
  if ((metadata.objects?.buildingsTotal ?? 0) < 500) {
    failures.push(`expected at least 500 current Silverstone buildings, got ${metadata.objects?.buildingsTotal}`);
  }
  if ((metadata.objects?.mappedGrandstands ?? 0) < 15) {
    failures.push(`expected mapped Silverstone grandstands, got ${metadata.objects?.mappedGrandstands}`);
  }
  if ((metadata.objects?.grandstandSections ?? 0) < 60) {
    failures.push(`expected current Silverstone GP grandstand sections, got ${metadata.objects?.grandstandSections}`);
  }
  if ((metadata.objects?.fenceSegments ?? 0) < 3_000) {
    failures.push(`expected mapped Silverstone safety context, got ${metadata.objects?.fenceSegments} segments`);
  }
  if ((metadata.objects?.runoffSections ?? 0) < 250) {
    failures.push(`expected modelled Silverstone runoff, got ${metadata.objects?.runoffSections} sections`);
  }
  if ((metadata.objects?.raceMotorhomes ?? 0) < 10) {
    failures.push(`expected Silverstone paddock race motorhomes, got ${metadata.objects?.raceMotorhomes}`);
  }
  if (quality?.buildings?.remainingTrackConflicts !== 0) {
    failures.push("Silverstone buildings must not intersect the circuit safety corridor");
  }
  if (quality?.motorhomes?.remainingTrackConflicts !== 0) {
    failures.push("Silverstone race motorhomes must stay outside the circuit and pit-lane ribbons");
  }
  if (!(quality?.surfaceClearance?.minimumTrackTerrainClearanceMeters >= 0.15)) {
    failures.push(`Silverstone track-to-terrain clearance is ${quality?.surfaceClearance?.minimumTrackTerrainClearanceMeters ?? "missing"} m`);
  }
  if (quality?.surfaceClearance?.terrainBreakthroughSamples !== 0) {
    failures.push(`terrain breaks through Silverstone at ${quality?.surfaceClearance?.terrainBreakthroughSamples ?? "missing"} samples`);
  }
  if (quality?.surfaceSmoothing?.wholeLap?.applied !== true) {
    failures.push("Silverstone racing surface was not smoothed around the full lap");
  }
  if (!(quality?.surfaceSmoothing?.wholeLap?.maximumCorrectionMeters <= 4)) {
    failures.push(`Silverstone surface smoothing correction is excessive: ${quality?.surfaceSmoothing?.wholeLap?.maximumCorrectionMeters ?? "missing"} m`);
  }
  if (JSON.stringify(quality?.runoff?.excludedTurns) !== JSON.stringify([16, 17, 18])) {
    failures.push(`unexpected Silverstone pit-entry runoff exclusion: ${quality?.runoff?.excludedTurns}`);
  }
  if (quality?.runoff?.syntheticGravelAtPitEntry !== false || quality?.runoff?.syntheticRunoffAtPitEntry !== false) {
    failures.push("Silverstone pit entry still contains synthetic gravel or runoff polygons");
  }
  if (quality?.pitLane?.pitBoxes !== 41 || quality?.pitLane?.pitComplex?.garageBoxes !== 41) {
    failures.push(`Silverstone pit lane must contain 41 marked positions, got ${quality?.pitLane?.pitBoxes ?? "missing"}`);
  }
  if (!(quality?.pitLane?.lengthMeters >= 1_050 && quality?.pitLane?.lengthMeters <= 1_200)) {
    failures.push(`Silverstone pit-lane length is invalid: ${quality?.pitLane?.lengthMeters ?? "missing"} m`);
  }
  if (quality?.pitLane?.fastLaneSeparator !== true || quality?.pitLane?.taperProfile !== "smoothstep") {
    failures.push("Silverstone pit lane is missing its fast-lane separator or smooth taper");
  }
  if (!(quality?.pitLane?.pitWall?.lengthMeters >= 800)) {
    failures.push(`Silverstone pit wall is too short: ${quality?.pitLane?.pitWall?.lengthMeters ?? "missing"} m`);
  }
  if (
    quality?.pitLane?.entryApron?.surface !== "asphalt" ||
    quality?.pitLane?.entryApron?.coverageMode !== "full-road-envelope" ||
    quality?.pitLane?.entryApron?.grassBreakthroughSamples !== 0 ||
    quality?.pitLane?.entryApron?.coplanarSurfaceSamples !== 0 ||
    !(quality?.pitLane?.entryApron?.minimumEnvelopeWidthMeters >= 13) ||
    !(quality?.pitLane?.entryApron?.surfaceLiftMeters >= 0.05) ||
    quality?.pitLane?.entryApron?.startMeters !== 0 ||
    !(quality?.pitLane?.entryApron?.endMeters >= 140)
  ) {
    failures.push("Silverstone pit entry must have a continuous asphalt apron without grass breakthrough");
  }
  if (
    quality?.pitLane?.pitWall?.fenceLines !== 2 ||
    quality?.pitLane?.pitWall?.placement !== "both sides of the pit-straight separation"
  ) {
    failures.push("Silverstone pit straight must have low fences on both separation edges");
  }
  const manualStands = quality?.grandstands?.manual?.maximumSupportHeightByStandMeters ?? {};
  if (
    "The Loop" in manualStands ||
    "Vale" in manualStands ||
    "Club A" in manualStands ||
    "Club B" in manualStands ||
    "Hamilton Straight B" in manualStands
  ) {
    failures.push("Silverstone still contains grandstands blocking turn 4 or the pit-entry complex");
  }
  if (!("Woodcote B" in manualStands) || !("National Pit Straight" in manualStands)) {
    failures.push("Silverstone is missing the detailed grandstands between turns 8 and 9");
  }
  if (quality?.terrainSurface?.macroColorSource !== "Environment Agency National LIDAR Programme intensity 1 m") {
    failures.push("Silverstone terrain is missing its measured LIDAR-intensity surface source");
  }
  if (quality?.terrainSurface?.detailSource !== "current OpenStreetMap ground geometry") {
    failures.push("Silverstone terrain is missing current OSM surface detail");
  }
  if (!(quality?.terrainSurface?.currentGroundPolygons >= 400)) {
    failures.push(`Silverstone terrain has too few current ground polygons: ${quality?.terrainSurface?.currentGroundPolygons ?? "missing"}`);
  }
  if (!(quality?.terrainSurface?.currentGroundLines >= 1_000)) {
    failures.push(`Silverstone terrain has too few current ground lines: ${quality?.terrainSurface?.currentGroundLines ?? "missing"}`);
  }
  const sourceFiles = new Set(metadata.sourceManifest?.sources?.map((source) => source.file));
  for (const requiredFile of [
    "environment-agency-lidar-dtm-1m.tif",
    "environment-agency-lidar-first-return-dsm-1m.zip",
    "environment-agency-lidar-intensity-1m.zip",
    "fia-2026-british-grand-prix-maps.pdf",
    "openstreetmap-map.osm",
  ]) {
    if (!sourceFiles.has(requiredFile)) failures.push(`Silverstone source manifest is missing ${requiredFile}`);
  }
  const licenses = new Set(metadata.sourceManifest?.sources?.map((source) => source.license));
  for (const requiredLicense of ["Open Government Licence v3.0", "ODbL 1.0"]) {
    if (!licenses.has(requiredLicense)) failures.push(`Silverstone source manifest is missing ${requiredLicense} data`);
  }
  const officialSources = metadata.officialSources ?? [];
  if (!officialSources.some((source) => source.url?.includes("2026_british_grand_prix"))) {
    failures.push("official FIA 2026 Silverstone document is missing from model metadata");
  }
  if (!officialSources.some((source) => source.url?.includes("silverstone.co.uk"))) {
    failures.push("official Silverstone grandstand source is missing from model metadata");
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
    for (const member of source.members ?? []) {
      try {
        const buffer = await readFile(path.join(sourceDirectory, member.file));
        const digest = createHash("sha256").update(buffer).digest("hex");
        if (digest !== member.sha256 || buffer.length !== member.bytes) {
          failures.push(`source checksum mismatch: ${member.file}`);
        }
      } catch (error) {
        failures.push(`source file cannot be verified: ${member.file} (${error.code ?? error.message})`);
      }
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
