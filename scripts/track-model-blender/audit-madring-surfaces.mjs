import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Audit the decoded delivery asset, including lossy Meshopt filters. Blender's
// source mesh alone cannot reveal collapsed paint or lost surface clearance.
export async function readMadringMeshes(buffer) {
  await MeshoptDecoder.ready;
  const jsonLength = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
  const binary = buffer.subarray(28 + jsonLength);
  const views = new Map();
  function accessor(index) {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    if (!views.has(a.bufferView)) {
      const compression = view.extensions?.EXT_meshopt_compression;
      if (compression) {
        const decoded = new Uint8Array(compression.count * compression.byteStride);
        MeshoptDecoder.decodeGltfBuffer(decoded, compression.count, compression.byteStride,
          binary.subarray(compression.byteOffset, compression.byteOffset + compression.byteLength), compression.mode, compression.filter);
        views.set(a.bufferView, decoded);
      } else {
        views.set(a.bufferView, binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
      }
    }
    const data = views.get(a.bufferView), offset = a.byteOffset ?? 0;
    const Constructor = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
    if (!Constructor) throw new Error(`Unsupported Madring accessor component ${a.componentType}`);
    const components = a.type === "VEC3" ? 3 : 1;
    return new Constructor(data.buffer, data.byteOffset + offset, a.count * components);
  }
  const meshes = new Map();
  for (const mesh of gltf.meshes) {
    if (!/Raceway|Track_Edge_Lines|Pit_Lane_Mesh|Pit_Fast_Lane|Asphalt_Runoff|RealScale_Terrain/.test(mesh.name)) continue;
    const triangles = [];
    for (const primitive of mesh.primitives) {
      const positions = accessor(primitive.attributes.POSITION), indices = accessor(primitive.indices);
      for (let i = 0; i < indices.length; i += 3) {
        triangles.push(Array.from(indices.subarray(i, i + 3), (index) => Array.from(positions.subarray(index * 3, index * 3 + 3))));
      }
    }
    meshes.set(mesh.name, triangles);
  }
  return meshes;
}

export async function auditMadringSurfaces(buffer) {
  const meshes = await readMadringMeshes(buffer);
  const get = (name) => meshes.get(`Madring_${name}_Mesh`) ?? [];
  const road = surfaceIndex([...get("Surveyed_Raceway"), ...get("Pit_Lane"), ...get("Municipal_Asphalt_Runoff")]);
  const ground = surfaceIndex(get("LiDAR_2026_RealScale_Terrain"));
  function inspect(triangles, support, minimumGap) {
    let degenerateTriangles = 0, samples = 0, missingSupport = 0, intersections = 0, minimumClearance = Infinity;
    for (const [a, b, c] of triangles) {
      const area = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2;
      if (area < 1e-6) degenerateTriangles++;
      // Interior barycentric samples avoid ambiguous support at shared borders.
      for (const weights of [[1/3, 1/3, 1/3], [.8, .1, .1], [.1, .8, .1], [.1, .1, .8]]) {
        const p = a.map((_, i) => a[i] * weights[0] + b[i] * weights[1] + c[i] * weights[2]);
        const floor = support(p[0], p[2]);
        if (floor === null) { missingSupport++; continue; }
        const clearance = p[1] - floor;
        minimumClearance = Math.min(minimumClearance, clearance);
        if (clearance < minimumGap) intersections++;
        samples++;
      }
    }
    return { triangles: triangles.length, degenerateTriangles, samples, missingSupport, intersections, minimumClearanceMeters: Number(minimumClearance.toFixed(5)) };
  }
  return {
    edgeLines: inspect(get("Track_Edge_Lines"), road, .005),
    pitMarkings: inspect(get("Pit_Fast_Lane_14_Boxes"), road, .005),
    runoff: inspect(get("Municipal_Asphalt_Runoff"), ground, .005),
  };
}

export function surfaceIndex(triangles) {
  const cells = new Map(), size = 12;
  for (const triangle of triangles) {
    const xs = triangle.map((v) => Math.floor(v[0] / size)), zs = triangle.map((v) => Math.floor(v[2] / size));
    for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z++) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(triangle);
      }
    }
  }
  return (x, z) => {
    let height = null;
    for (const [a, b, c] of cells.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) ?? []) {
      const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(denominator) < 1e-9) continue;
      const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
      const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
      const y = u * a[1] + v * b[1] + (1 - u - v) * c[1];
      height = height === null ? y : Math.max(height, y);
    }
    return height;
  };
}
