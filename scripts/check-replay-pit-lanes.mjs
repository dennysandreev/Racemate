import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { withVerifiedReplayPitLane, registerCircuit } from "../src/lib/replay-pit-lane.mjs";
import layouts from "../src/data/replay-pit-layouts.json" with { type: "json" };
import "../worker/load-env.mjs";
import { createClient } from "@supabase/supabase-js";

const directory = "output/replay-pit-audit";
await mkdir(directory, { recursive: true });
const reports = [];
let archives;
if (process.argv.includes("--refresh")) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("race_replay_sessions").select("source_session_key,source_season,track:snapshot->track").eq("status", "ready");
  if (error) throw error;
  archives = data;
  await writeFile(`${directory}/archives.json`, JSON.stringify(archives));
} else {
  try { archives = JSON.parse(await readFile(`${directory}/archives.json`, "utf8")); }
  catch {
    archives = await Promise.all((await readdir("output/replay-audit")).filter((file) => /^\d+\.json$/.test(file)).map(async (file) => {
      const replay = JSON.parse(await readFile(`output/replay-audit/${file}`, "utf8"));
      return { source_session_key: Number(file.replace(".json", "")), track: replay.track };
    }));
  }
}
for (const archive of archives.sort((a,b) => a.source_session_key - b.source_session_key)) {
  const file = `${archive.source_session_key}.json`;
  const replay = { track: archive.track, circuitName: archive.track.circuitName };
  const track = withVerifiedReplayPitLane(replay.track);
  const layout = layouts.find((item) => item.aliases.some((alias) => replay.circuitName.toLowerCase().includes(alias)));
  if (!layout) { console.log("MISSING", replay.circuitName); continue; }
  const pit = track.pitLane?.source === "verified_circuit_geometry" ? track.pitLane : null;
  const fit = registerCircuit(layout.track, track.centerline.map((p) => [p.svgX, p.svgY]));
  const bounds = track.svg.viewBox;
  const d = (line) => line.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bounds.width} ${bounds.height}" width="1100" height="800"><rect width="100%" height="100%" fill="#101518"/><text x="30" y="35" font-family="sans-serif" font-size="22" fill="white">${replay.circuitName} / ${file} / RMS ${fit.rms.toFixed(2)}</text><path d="${track.svg.technicalPathD}" stroke="#546068" stroke-width="18" fill="none"/><path d="${d(layout.track.map(fit.transform))}Z" stroke="#799cc4" stroke-width="1.5" fill="none"/><path d="${track.pitLane?.visualPathD}" stroke="#c29743" stroke-width="3" stroke-dasharray="5 4" fill="none"/><path d="${pit?.visualPathD}" stroke="#50e4c7" stroke-width="3" fill="none"/>${pit?.points.filter((_,i,a) => i === 0 || i === a.length-1).map((p,i)=>`<circle cx="${p.svgX}" cy="${p.svgY}" r="6" fill="${i ? "#ff7880" : "#50e4c7"}"/>`).join("") ?? ""}<circle cx="${track.startFinish.svgX}" cy="${track.startFinish.svgY}" r="5" fill="white"/></svg>`;
  await writeFile(`${directory}/${file.replace("json","svg")}`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`${directory}/${file.replace("json","png")}`);
  const report = { key: Number(file.replace(".json", "")), circuit: replay.circuitName, reference: layout.referenceUrl, rms: +fit.rms.toFixed(2), points: pit?.points.length ?? 0 };
  reports.push(report);
  console.log(JSON.stringify(report));
}
await writeFile(`${directory}/report.json`, JSON.stringify(reports, null, 2));
if (reports.length !== archives.length || reports.some((report) => !report.points || !report.reference)) process.exitCode = 1;
