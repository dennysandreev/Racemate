// Download the three circuits that do not yet have a digital-twin pit path.
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import layouts from "../src/data/replay-pit-layouts.json" with { type: "json" };

const directory = "output/replay-pit-sources";
await mkdir(directory, { recursive: true });
if (process.argv.includes("--references")) {
  for (const layout of layouts) {
    const response = await fetch(layout.referenceUrl);
    if (!response.ok) throw new Error(`${layout.id}: FIA ${response.status}`);
    const file = `${directory}/${layout.id}.pdf`;
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    execFileSync("pdftoppm", ["-f", "3", "-singlefile", "-scale-to", "1400", "-png", file, `${directory}/${layout.id}`]);
    console.log(`${layout.id}: FIA pit drawing rendered`);
  }
  process.exit(0);
}
const geo = await fetch("https://raw.githubusercontent.com/bacinger/f1-circuits/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/f1-circuits.geojson");
if (!geo.ok) throw new Error(`Circuit geometry: ${geo.status}`);
await writeFile(`${directory}/f1-circuits.geojson`, await geo.text());
for (const [id, box, event, suffix] of [
  ["albert-park", "-37.856,144.959,-37.835,144.98", "australian", "emergency_exits_map_and_quarantine_zone"],
  ["shanghai", "31.326,121.209,31.347,121.23", "chinese", "emergency_exits_map_battery_containment_area_and_red_zone"],
  ["suzuka", "34.834,136.522,34.85,136.551", "japanese", "emergency_exits_map_battery_containment_area_and_red_zone"],
]) {
  const [south, west, north, east] = box.split(",");
  const response = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`);
  if (!response.ok) throw new Error(`${id}: OSM ${response.status}`);
  const xml = await response.text();
  const nodes = new Map([...xml.matchAll(/<node\b([^>]+)>/g)].map(([, attributes]) => {
    const values = Object.fromEntries([...attributes.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    return [values.id, { lat: Number(values.lat), lon: Number(values.lon) }];
  }));
  const elements = [...xml.matchAll(/<way\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)].map(([, id, body]) => ({
    id: Number(id), tags: Object.fromEntries([...body.matchAll(/<tag k="([^"]+)" v="([^"]*)"/g)].map(([, key, value]) => [key, value])),
    nodes: [...body.matchAll(/<nd ref="(\d+)"/g)].map(([, ref]) => ref),
    geometry: [...body.matchAll(/<nd ref="(\d+)"/g)].map(([, ref]) => nodes.get(ref)),
  })).filter((way) => way.tags.highway);
  const data = { elements };
  await writeFile(`${directory}/${id}.json`, JSON.stringify(data));
  console.log(id, data.elements.filter((way) => /pit/i.test(JSON.stringify(way.tags))).map(({ id, tags, geometry }) => ({ id, tags, points: geometry?.length })));
  const url = `https://www.fia.com/system/files/decision-document/2026_${event}_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_${suffix}.pdf`;
  const pdf = await fetch(url);
  if (!pdf.ok) throw new Error(`${id}: FIA ${pdf.status}`);
  await writeFile(`${directory}/${id}.pdf`, Buffer.from(await pdf.arrayBuffer()));
}
