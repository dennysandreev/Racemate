// Compact, backend-only reference geometry. Reuses reviewed digital-twin paths;
// it does not ship the 3D models to the replay client.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { sampleClosedLine, registerCircuit } from "../src/lib/replay-pit-lane.mjs";

const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const output = [];
const specs = [
  ["miami", ["miami"], "after_turn_18", "after_turn_1"],
  ["montreal", ["gilles", "montreal"], "between_turns_13_14", "after_turn_2"],
  ["monaco", ["monaco"], "after_turn_18", "after_turn_1"],
  ["catalunya", ["catalunya", "barcelona"], "before_turn_14", "before_turn_1"],
  ["red-bull-ring", ["red bull", "spielberg"], "before_turn_10", "after_turn_1"],
  ["silverstone", ["silverstone"], "after_turn_15", "before_turn_3"],
  ["spa", ["spa", "francorchamps"], "between_turns_18_19", "after_turn_1"],
  ["hungaroring", ["hungaroring"], "before_turn_14", "before_turn_1"],
  ["zandvoort", ["zandvoort"], "after_turn_14", "after_turn_1"],
  ["monza", ["monza"], "after_turn_11", "before_turn_1"],
  ["madring", ["madring", "ifema"], "before_turn_22", "after_turn_3"],
];
const rounded = (points) => points.map((p) => p.map((v) => +v.toFixed(3)));
for (const [id, aliases, entry, exit] of specs) {
  const prefix = id.toUpperCase().replaceAll("-", "_");
  const data = await import(`../src/data/${id}-model.ts`);
  const config = await read(`.track-model-build/${id}.json`);
  const replay = id === "madring" ? await read("src/data/madring-live-path.json") : data[`${prefix}_REPLAY_PATH`];
  let track, pit;
  if (id === "miami") {
    track = config.model.centerline;
    pit = config.model.pitCenterline;
  } else {
    track = (replay.trackPoints ?? data[`${prefix}_MODEL`].points).map((p) => p.slice(1, 3));
    pit = replay.pitLanePoints.map((p) => p.slice(1, 3));
  }
  const urls = [...JSON.stringify(config).matchAll(/https:[^"\s]+\.pdf/g)].map(([url]) => url);
  const referenceUrl = id === "monza" ? "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf"
    : id === "monaco" ? "https://www.fia.com/system/files/decision-document/2026_monaco_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf"
    : id === "catalunya" ? "https://www.fia.com/system/files/decision-document/2026_barcelona-catalunya_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf"
    : id === "zandvoort" ? "https://www.fia.com/system/files/decision-document/2026_dutch_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf"
    : id === "spa" ? "https://www.fia.com/system/files/decision-document/2026_belgian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf"
    : id === "madring" ? "https://www.fia.com/system/files/decision-document/2026_spanish_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_and_emergency_exits_map.pdf"
    : urls.find((url) => /fia\.com/.test(url) && /circuit_map|maps|circuit-map/.test(url));
  output.push({ id, aliases, entry, exit, referenceUrl, geometrySource: `/f1/tracks/3d/${id}-metadata.json`, track: rounded(sampleClosedLine(track)), pit: rounded(pit) });
}

const geo = await read("output/replay-pit-sources/f1-circuits.geojson");
await mkdir("output/replay-pit-sources", { recursive: true });
for (const [id, geoId] of [["albert-park", "au-1953"], ["shanghai", "cn-2004"], ["suzuka", "jp-1962"]]) {
  const feature = geo.features.find((f) => f.properties.id === geoId);
  const coordinates = feature.geometry.coordinates;
  const origin = coordinates[0];
  const project = ([lon, lat]) => [(lon - origin[0]) * Math.cos(origin[1] * Math.PI / 180) * 111320, (lat - origin[1]) * 111320];
  const track = coordinates.map(project);
  const osm = await read(`output/replay-pit-sources/${id}.json`);
  const ways = osm.elements.filter((w) => w.geometry.every(Boolean)).map((way) => ({ ...way, points: way.geometry.map((p) => project([p.lon, p.lat])) }));
  const minX = Math.min(...track.map((p) => p[0])) - 80, maxX = Math.max(...track.map((p) => p[0])) + 80;
  const minY = Math.min(...track.map((p) => p[1])) - 80, maxY = Math.max(...track.map((p) => p[1])) + 80;
  const d = (line) => line.map((p, i) => `${i ? "L" : "M"}${p[0]},${-p[1]}`).join(" ");
  const model = (await import(`../src/data/${id}-model.ts`))[`${id.toUpperCase().replaceAll("-", "_")}_MODEL`];
  const fit = registerCircuit(model.points.map((p) => p.slice(1, 3)), track);
  const markers = [{ number: "S", progress: 0 }, ...model.turns].map((turn) => {
    const p = model.points.reduce((best, p) => Math.abs(p[0]-turn.progress) < Math.abs(best[0]-turn.progress) ? p : best);
    const xy = fit.transform(p.slice(1,3));
    return `<circle cx="${xy[0]}" cy="${-xy[1]}" r="12" fill="black"/><text x="${xy[0]+14}" y="${-xy[1]}" font-size="28" fill="red">${turn.number}</text>`;
  }).join("");
  await writeFile(`output/replay-pit-sources/${id}-osm.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${-maxY} ${maxX-minX} ${maxY-minY}" width="1300" height="1300"><rect x="${minX}" y="${-maxY}" width="${maxX-minX}" height="${maxY-minY}" fill="white"/><path d="${d(track)}" fill="none" stroke="#ccc" stroke-width="12"/>${ways.map((way, i) => `<path d="${d(way.points)}" fill="none" stroke="hsl(${i*41%360},70%,40%)" stroke-width="3"/><text x="${way.points[Math.floor(way.points.length/2)][0]}" y="${-way.points[Math.floor(way.points.length/2)][1]}" font-size="11">${way.id}</text>`).join("")}${markers}</svg>`);
  // OSM ways compared with the FIA pit map (including the entry/exit roads).
  if (id === "suzuka") {
    const pit = ways.find((way) => way.id === 120917578).points;
    output.push({ id, aliases: ["suzuka"], entry: "after_turn_17", exit: "before_turn_1", referenceUrl: "https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf", geometrySource: "https://www.openstreetmap.org/way/120917578", track: rounded(sampleClosedLine(track)), pit: rounded(pit) });
  }
  if (id === "albert-park" || id === "shanghai") {
    const ids = id === "albert-park" ? [28119448] : [107371147, 107371138];
    const pit = ids.flatMap((wayId, index) => ways.find((way) => way.id === wayId).points.slice(index ? 1 : 0));
    const event = id === "albert-park" ? "australian" : "chinese";
    const suffix = id === "albert-park" ? "emergency_exits_map_and_quarantine_zone" : "emergency_exits_map_battery_containment_area_and_red_zone";
    output.push({ id, aliases: [id === "albert-park" ? "albert park" : "shanghai"], entry: id === "albert-park" ? "before_turn_14" : "before_turn_16", exit: "before_turn_1", referenceUrl: `https://www.fia.com/system/files/decision-document/2026_${event}_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_${suffix}.pdf`, geometrySource: ids.map((wayId) => `https://www.openstreetmap.org/way/${wayId}`).join(" "), track: rounded(sampleClosedLine(track)), pit: rounded(pit) });
  }
}
const serialized = JSON.stringify(output, null, 2).replace(/\[\n\s*(-?[\d.]+),\n\s*(-?[\d.]+)\n\s*\]/g, "[$1, $2]");
await writeFile("src/data/replay-pit-layouts.json", serialized + "\n");
for (const layout of output) {
  const files = (await import("node:fs/promises")).readdir;
  for (const file of (await files("output/replay-audit")).filter((f) => /^\d+\.json$/.test(f))) {
    const replay = await read(`output/replay-audit/${file}`);
    if (!layout.aliases.some((alias) => replay.circuitName.toLowerCase().includes(alias))) continue;
    const fit = registerCircuit(layout.track, replay.track.centerline.map((p) => [p.svgX, p.svgY]));
    console.log(layout.id, file, "rms", fit.rms.toFixed(2), "direction", fit.direction, "reflection", fit.reflection, "source", Boolean(layout.referenceUrl));
  }
}
