import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { surfaceIndex } from "./audit-madring-surfaces.mjs";

// Inspect the exact compressed asset delivered to the browser, including paint,
// physical walls and the two explicitly bounded underground driving sections.
export async function auditMonacoSurfaces(buffer, metadata) {
  await MeshoptDecoder.ready;
  const length = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.toString("utf8", 20, 20 + length));
  const binary = buffer.subarray(28 + length), views = new Map();
  function accessor(index) {
    const item = gltf.accessors[index], view = gltf.bufferViews[item.bufferView];
    if (!views.has(item.bufferView)) {
      const compressed = view.extensions?.EXT_meshopt_compression;
      if (compressed) {
        const output = new Uint8Array(compressed.count * compressed.byteStride);
        MeshoptDecoder.decodeGltfBuffer(output, compressed.count, compressed.byteStride,
          binary.subarray(compressed.byteOffset, compressed.byteOffset + compressed.byteLength), compressed.mode, compressed.filter);
        views.set(item.bufferView, output);
      } else views.set(item.bufferView, binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    }
    const output = views.get(item.bufferView);
    const Type = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[item.componentType];
    if (!Type || (view.byteStride && view.byteStride !== Type.BYTES_PER_ELEMENT * ({VEC3:3,VEC2:2}[item.type] ?? 1))) throw new Error("Unsupported Monaco accessor layout");
    return new Type(output.buffer, output.byteOffset + (item.byteOffset ?? 0), item.count * ({VEC3:3,VEC2:2}[item.type] ?? 1));
  }
  const meshes = new Map();
  for (const mesh of gltf.meshes) {
    const triangles = [];
    for (const primitive of mesh.primitives) {
      const positions = accessor(primitive.attributes.POSITION), indices = accessor(primitive.indices);
      for (let i = 0; i < indices.length; i += 3) triangles.push(Array.from(indices.subarray(i, i + 3), (j) => Array.from(positions.subarray(j * 3, j * 3 + 3))));
    }
    meshes.set(mesh.name, triangles);
  }
  const get = (name) => meshes.get(`${name}_Mesh`) ?? [];
  const main = get("FIA_Monaco_Centreline_9m"), pit = get("Monaco_Pit_Lane");
  const ground = surfaceIndex([...get("Monaco_IGN69_LiDAR_Terrain"), ...get("Monaco_Tunnel_Roadbed")]), roadFloor = surfaceIndex([...main, ...pit]);
  const samples = ([a,b,c]) => [[1/3,1/3,1/3],[.8,.1,.1],[.1,.8,.1],[.1,.1,.8]].map(w => a.map((_,i) => a[i]*w[0]+b[i]*w[1]+c[i]*w[2]));
  if (main.length !== (metadata.elevationProfile.length - 1) * 2) {
    throw new Error("Monaco ribbon topology no longer matches its elevation profile");
  }
  // Meshopt may reorder triangles. Classify underground points against the
  // actual roof footprint instead, then constrain it to the road below 15 m.
  const tunnelFloor = surfaceIndex(get("Monaco_Tunnel_Shell"));
  function inspect(triangles, support, tunnelAllowed=false) {
    let minimum=Infinity, intersections=0, missingSupport=0, undergroundSamples=0;
    const failures=[];
    for (const triangle of triangles) for (const p of samples(triangle)) {
      const floor=support(p[0],p[2]);
      if(floor===null){missingSupport++;if(failures.length<8)failures.push({p,missing:true});continue;}
      if(tunnelAllowed && p[1]<15 && tunnelFloor(p[0],p[2])!==null){undergroundSamples++;continue;}
      const gap=p[1]-floor;minimum=Math.min(minimum,gap);
      if(gap<=.005){intersections++;if(failures.length<8)failures.push({p,gap});}
    }
    return {triangles:triangles.length,minimumClearanceMeters:Number(minimum.toFixed(5)),intersections,missingSupport,undergroundSamples,failures};
  }
  const structuralConflicts={};
  for(const name of ["Monaco_2026_Current_Grandstands","Monaco_2026_11_Team_Pit_Complex","Monaco_Pit_Wall_And_Track_Barriers","Monaco_Mapped_LiDAR_Trees","Monaco_Current_OSM_Buildings","Monaco_Start_Finish_Gantry"]){
    let count=0;const points=[];
    for(const triangle of get(name))for(const p of [...triangle,...samples(triangle)]){
      const floor=roadFloor(p[0],p[2]);
      if(floor===null)continue;
      // Fairmont walls over tunnel portals are above the full driving envelope.
      if(["Monaco_Current_OSM_Buildings","Monaco_2026_11_Team_Pit_Complex","Monaco_Start_Finish_Gantry"].includes(name) && p[1]-floor>5.2)continue;
      count++;if(points.length<6)points.push(p);
    }
    if(count)structuralConflicts[name]={count,points};
  }
  const mainFloor = surfaceIndex(main);
  let overlapArea = 0;
  for (const tri of pit) {
    const p = samples(tri)[0];
    if (mainFloor(p[0],p[2]) !== null) {
      const [a,b,c] = tri;
      overlapArea += Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;
    }
  }
  const facadeMesh = gltf.meshes.find(m => m.name === "Monaco_Current_OSM_Buildings_Mesh");
  const facades = {primitives:facadeMesh.primitives.length, texturedTriangles:0, missingTextures:0};
  for (const primitive of facadeMesh.primitives) {
    const material = gltf.materials[primitive.material];
    const texture = material.pbrMetallicRoughness?.baseColorTexture;
    const uv = primitive.attributes.TEXCOORD_0 === undefined ? [] : accessor(primitive.attributes.TEXCOORD_0);
    if (texture === undefined || !uv.length || !Array.from(uv).some(v => v > 1)) facades.missingTextures++;
    else facades.texturedTriangles += accessor(primitive.indices).length/3;
  }
  const turnAnchors = gltf.nodes.filter(node => /^Turn_\d+$/.test(node.name)).map(node => {
    const [x,y,z] = node.translation;
    const floor = mainFloor(x,z);
    return {name:node.name,onRoad:floor!==null,heightAboveRoad:floor===null?null:y-floor};
  });
  const portalObstructions = [];
  for (const portal of metadata.layoutQuality.tunnel.portals ?? []) {
    if (!portal.position) continue;
    const [x,y,z] = portal.position, [dx,,dz] = portal.direction;
    // Inspect the portal mouth itself. The approach at Portier curves, so a
    // rectangular probe several metres beyond it would leave the road.
    for (const lateral of [-4,-2,0,2,4]) {
      const along = 0;
      const q = [x+dx*along-dz*lateral,z+dz*along+dx*lateral];
      const floor = mainFloor(...q), terrain = ground(...q);
      if (floor===null || terrain===null || terrain>floor-.04) portalObstructions.push({distance:portal.distanceMeters,q,floor,terrain,roadHeight:y});
    }
  }
  return {pitOverlapAreaSquareMeters:overlapArea,facades,turnAnchors,portalObstructions,road:inspect([...main,...pit],ground,true),paint:inspect(get("FIA_Pit_Lane_And_Road_Markings"),roadFloor),structuralConflicts};
}
