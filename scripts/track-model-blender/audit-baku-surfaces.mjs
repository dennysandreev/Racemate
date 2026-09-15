import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { surfaceIndex } from "./audit-madring-surfaces.mjs";

// Inspect decoded delivery geometry, including Meshopt rounding and pit openings.
export async function auditBakuSurfaces(buffer) {
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
    return new Type(output.buffer, output.byteOffset + (item.byteOffset ?? 0), item.count * (item.type === "VEC3" ? 3 : 1));
  }
  const meshes = new Map();
  for (const mesh of gltf.meshes) {
    if (!/Baku_(Circuit_Surface|Pit_Fast_And_Working_Lanes|GEDTM_Terrain|Roadside_Safety_Walls|Road_And_Pit_Paint)_Mesh/.test(mesh.name)) continue;
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
  return { road: clearance(road, ground), paint: clearance(get("Road_And_Pit_Paint"), roadFloor), roadBarrierTrianglesInsidePit };
}
