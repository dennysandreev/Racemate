import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { surfaceIndex } from "./audit-madring-surfaces.mjs";

// Inspect decoded delivery geometry, including Meshopt rounding and pit openings.
export async function auditBakuSurfaces(buffer, metadata = {}) {
  await MeshoptDecoder.ready;
  const length = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.toString("utf8", 20, 20 + length));
  const binary = buffer.subarray(28 + length);
  const views = new Map();
  function accessor(index) {
    const item = gltf.accessors[index], view = gltf.bufferViews[item.bufferView];
    if (!views.has(item.bufferView)) {
      const compression = view.extensions?.EXT_meshopt_compression;
      if (compression) {
        const output = new Uint8Array(compression.count * compression.byteStride);
        MeshoptDecoder.decodeGltfBuffer(output, compression.count, compression.byteStride,
          binary.subarray(compression.byteOffset, compression.byteOffset + compression.byteLength), compression.mode, compression.filter);
        views.set(item.bufferView, output);
      } else views.set(item.bufferView, binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    }
    const output = views.get(item.bufferView);
    const Type = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[item.componentType];
    if (!Type) throw new Error(`Unsupported Baku accessor ${item.componentType}`);
    return new Type(output.buffer, output.byteOffset + (item.byteOffset ?? 0), item.count * ({ VEC2: 2, VEC3: 3, VEC4: 4 }[item.type] ?? 1));
  }
  const meshes = new Map();
  for (const mesh of gltf.meshes) {
    if (!/Baku_(Circuit_Surface|Pit_Fast_And_Working_Lanes|GEDTM_Terrain|Roadside_Safety_Walls|Road_And_Pit_Paint|Mapped_Trees)_Mesh/.test(mesh.name)) continue;
    const triangles = [];
    for (const primitive of mesh.primitives) {
      const positions = accessor(primitive.attributes.POSITION), indices = accessor(primitive.indices);
      for (let i = 0; i < indices.length; i += 3) triangles.push(Array.from(indices.subarray(i, i + 3), (j) => Array.from(positions.subarray(j * 3, j * 3 + 3))));
    }
    meshes.set(mesh.name, triangles);
  }
  const get = (name) => meshes.get(`Baku_${name}_Mesh`) ?? [];
  const ground = surfaceIndex(get("GEDTM_Terrain"));
  const pit = surfaceIndex(get("Pit_Fast_And_Working_Lanes"));
  const road = [...get("Circuit_Surface"), ...get("Pit_Fast_And_Working_Lanes")];
  const roadFloor = surfaceIndex(road);
  function clearance(triangles, support) {
    let minimum = Infinity, intersections = 0, missingSupport = 0;
    for (const triangle of triangles) {
      const p = triangle[0].map((_, axis) => triangle.reduce((sum, v) => sum + v[axis], 0) / 3);
      const floor = support(p[0], p[2]);
      if (floor === null) { missingSupport++; continue; }
      const gap = p[1] - floor;
      minimum = Math.min(minimum, gap);
      if (gap <= 0) intersections++;
    }
    return { triangles: triangles.length, minimumClearanceMeters: Number(minimum.toFixed(5)), intersections, missingSupport };
  }
  let roadBarrierTrianglesInsidePit = 0;
  for (const triangle of get("Roadside_Safety_Walls")) {
    const p = triangle[0].map((_, axis) => triangle.reduce((sum, v) => sum + v[axis], 0) / 3);
    if (pit(p[0], p[2]) !== null) roadBarrierTrianglesInsidePit++;
  }
  let vegetationTrianglesAboveRoad = 0;
  for (const triangle of get("Mapped_Trees")) {
    const p = triangle[0].map((_, axis) => triangle.reduce((sum, v) => sum + v[axis], 0) / 3);
    if (roadFloor(p[0], p[2]) !== null) vegetationTrianglesAboveRoad++;
  }
  let windowFacadeMinimumColor = 1;
  let windowFacadeUVAlignmentErrors = 0;
  for (const primitive of gltf.meshes.find((mesh) => mesh.name === "Baku_Window_Facades_Mesh")?.primitives ?? []) {
    if (primitive.attributes.COLOR_0 === undefined) continue;
    windowFacadeMinimumColor = accessor(primitive.attributes.COLOR_0).reduce((minimum, value) => Math.min(minimum, value), windowFacadeMinimumColor);
    const positions = accessor(primitive.attributes.POSITION), uv = accessor(primitive.attributes.TEXCOORD_0), indices = accessor(primitive.indices);
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = Array.from(indices.subarray(i, i + 3));
      if (Math.max(...triangle.map((v) => positions[v * 3 + 1])) - Math.min(...triangle.map((v) => positions[v * 3 + 1])) < .1) windowFacadeUVAlignmentErrors++;
      for (let a = 0; a < 3; a++) for (let b = 0; b < a; b++) {
        const x = triangle[a], y = triangle[b];
        if (Math.hypot(positions[x * 3] - positions[y * 3], positions[x * 3 + 2] - positions[y * 3 + 2]) < .015 && Math.abs(uv[x * 2] - uv[y * 2]) > .015) windowFacadeUVAlignmentErrors++;
        if (Math.abs(positions[x * 3 + 1] - positions[y * 3 + 1]) < .01 && Math.abs(uv[x * 2 + 1] - uv[y * 2 + 1]) > .015) windowFacadeUVAlignmentErrors++;
        if (Math.abs(Math.abs(uv[x * 2 + 1] - uv[y * 2 + 1]) - Math.abs(positions[x * 3 + 1] - positions[y * 3 + 1]) / 3.2) > .015) windowFacadeUVAlignmentErrors++;
      }
    }
  }
  let roofUVRangeErrors = 0;
  const roofTriangles = [];
  for (const primitive of gltf.meshes.find((mesh) => mesh.name === "Baku_OSM_Permanent_Buildings_Mesh")?.primitives ?? []) {
    if (gltf.materials[primitive.material].name !== "Baku_Planet_SkySat_2018_CC_BY_SA") continue;
    for (const coordinate of accessor(primitive.attributes.TEXCOORD_0)) {
      if (coordinate < 0 || coordinate > 1) roofUVRangeErrors++;
    }
    const positions = accessor(primitive.attributes.POSITION), indices = accessor(primitive.indices);
    for (let i = 0; i < indices.length; i += 3) roofTriangles.push(Array.from(indices.subarray(i, i + 3), (j) => Array.from(positions.subarray(j * 3, j * 3 + 3))));
  }
  const roofs = surfaceIndex(roofTriangles);
  const restoredBuildings = (metadata.layoutQuality?.buildings?.restoredRelations ?? []).map((building) => {
    let courtyardSamples = 0, coveredCourtyardSamples = 0, elevatedRoofSamples = 0;
    for (const [index, closedRing] of building.localRings.entries()) {
      const ring = closedRing.slice(0, -1);
      const centre = [0, 1].map((axis) => ring.reduce((sum, p) => sum + p[axis], 0) / ring.length);
      // Blender XY becomes glTF X/-Z; sample well inside edges, away from rounding.
      const samples = index === 0
        ? ring.map((p, i) => p.map((v, axis) => .49 * (v + ring[(i + 1) % ring.length][axis]) + .02 * centre[axis]))
        : [centre, ...ring.map((p) => p.map((v, axis) => .25 * v + .75 * centre[axis]))];
      for (const p of samples) {
        const roof = roofs(p[0], -p[1]);
        if (index > 0) {
          courtyardSamples++;
          if (roof !== null) coveredCourtyardSamples++;
        } else {
          const floor = ground(p[0], -p[1]);
          if (roof !== null && floor !== null && roof - floor > 2) elevatedRoofSamples++;
        }
      }
    }
    return { osmRelationId: building.osmRelationId, courtyardSamples, coveredCourtyardSamples, elevatedRoofSamples };
  });
  return { road: clearance(road, ground), paint: clearance(get("Road_And_Pit_Paint"), roadFloor), roadBarrierTrianglesInsidePit, vegetationTrianglesAboveRoad, windowFacadeMinimumColor, windowFacadeUVAlignmentErrors, roofUVRangeErrors, restoredBuildings };
}
