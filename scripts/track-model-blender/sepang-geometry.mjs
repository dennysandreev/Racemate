/* WGS84 / UTM 47N. All geometry stays in metres. */
export function utm47nFromWgs84(lat, lon) {
  const semiMajor = 6_378_137;
  const flattening = 1 / 298.257223563;
  const scale = 0.9996;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondaryEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const radians = Math.PI / 180;
  const latitude = lat * radians;
  const longitudeDelta = (lon - 99) * radians;
  const sine = Math.sin(latitude);
  const cosine = Math.cos(latitude);
  const tangent = Math.tan(latitude);
  const radius = semiMajor / Math.sqrt(1 - eccentricitySquared * sine ** 2);
  const t = tangent ** 2;
  const c = secondaryEccentricitySquared * cosine ** 2;
  const a = cosine * longitudeDelta;
  const meridionalArc = semiMajor * (
    (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256) * latitude
    - (3 * eccentricitySquared / 8 + 3 * eccentricitySquared ** 2 / 32 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(2 * latitude)
    + (15 * eccentricitySquared ** 2 / 256 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(4 * latitude)
    - 35 * eccentricitySquared ** 3 / 3072 * Math.sin(6 * latitude)
  );
  return [
    500_000 + scale * radius * (a + (1 - t + c) * a ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * secondaryEccentricitySquared) * a ** 5 / 120),
    scale * (meridionalArc + radius * tangent * (a ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * a ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * secondaryEccentricitySquared) * a ** 6 / 720)),
  ];
}


export const SEPANG_BOUNDS = { minX: 803400, minY: 304800, maxX: 805400, maxY: 306200 };
export const MAIN_WAYS = [1561055754,1561055755,1561055769,1561055756,1561055757,1561055758,144359489,1561055759,1561055760,1561055761,1561055762,1561055763,1561055764,1561055770,1561055771,1561055765,1561055766,23410503,1561055768,1561055767];
export const PIT_WAYS = [23410526,144359483];
export const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
export function cumulativeDistances(points) {
  const result=[0];
  for(let i=1;i<points.length;i++)result.push(result.at(-1)+distance(points[i-1],points[i]));
  return result;
}
export function sampleLine(points,cumulative,requested) {
  const d=Math.min(Math.max(0,requested),cumulative.at(-1));
  const hi=cumulative.findIndex(v=>v>=d);
  if(hi<=0)return points[0];
  const t=(d-cumulative[hi-1])/Math.max(1e-9,cumulative[hi]-cumulative[hi-1]);
  return points[hi].map((v,axis)=>points[hi-1][axis]*(1-t)+v*t);
}
export function nearestDistance(points,target) {
  let total=0, nearest={separation:Infinity,distance:0};
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i], dx=b[0]-a[0],dy=b[1]-a[1],length=distance(a,b);
    const t=Math.max(0,Math.min(1,((target[0]-a[0])*dx+(target[1]-a[1])*dy)/Math.max(1e-9,length*length)));
    const separation=distance([a[0]+t*dx,a[1]+t*dy],target);
    if(separation<nearest.separation)nearest={separation,distance:total+t*length};
    total+=length;
  }
  return nearest;
}
export function assembleWays(osm,ids,{closed=false}={}) {
  const points=[];
  for(const id of ids) {
    const way=osm.elements.find(f=>f.type==='way'&&f.id===id);
    if(!way?.geometry?.length)throw Error(`Missing Sepang OSM way ${id}`);
    const coordinates=way.geometry.map(p=>utm47nFromWgs84(p.lat,p.lon));
    // Every selected OSM segment follows the mapped oneway direction.
    if(points.length&&distance(points.at(-1),coordinates[0])>0.05)throw Error(`Disconnected Sepang way ${id}`);
    points.push(...(points.length?coordinates.slice(1):coordinates));
  }
  if(closed&&distance(points[0],points.at(-1))>0.05)throw Error('Sepang source ring is not closed');
  return points;
}
export function rotateClosedLine(points,offset) {
  const cumulative=cumulativeDistances(points), total=cumulative.at(-1);
  const d=((offset%total)+total)%total;
  const split=cumulative.findIndex(v=>v>=d),p=sampleLine(points,cumulative,d),core=points.slice(0,-1);
  return [p,...core.slice(split),...core.slice(0,split),p];
}
export function parseOsmXml(xml) {
  const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)="([^"]*)"/g)].map(m=>[m[1],m[2].replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&apos;',"'")]));
  const tags=s=>Object.fromEntries([...s.matchAll(/<tag\s+([^>]+)\/>/g)].map(m=>{const a=attrs(m[1]);return [a.k,a.v]}));
  const nodes=new Map(),elements=[];
  for(const m of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)) {
    const a=attrs(m[1]),n={type:'node',id:Number(a.id),lat:Number(a.lat),lon:Number(a.lon),tags:tags(m[2]??'')};
    nodes.set(a.id,n);if(Object.keys(n.tags).length)elements.push(n);
  }
  for(const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const a=attrs(m[1]),refs=[...m[2].matchAll(/<nd ref="(\d+)"\s*\/>/g)].map(n=>n[1]);
    if(refs.some(n=>!nodes.has(n)))throw Error(`Incomplete OSM geometry: ${a.id}`);
    elements.push({type:'way',id:Number(a.id),timestamp:a.timestamp,version:Number(a.version),tags:tags(m[2]),geometry:refs.map(n=>({lat:nodes.get(n).lat,lon:nodes.get(n).lon}))});
  }
  return {elements,attribution:'© OpenStreetMap contributors · ODbL 1.0'};
}
