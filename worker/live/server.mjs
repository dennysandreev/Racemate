import "../load-env.mjs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import { LiveState, DATASETS, eventKey } from "./state.mjs";
import { OpenF1LiveSource, ReplaySimulationSource } from "./sources.mjs";
import { RecordedOpenF1Source } from "./recorded-source.mjs";
import { LiveWriter } from "./persistence.mjs";
import { allowedRecording, transcribeRadio } from "./radio.mjs";
import { buildReplayFromHistory } from "./replay-adapter.mjs";
import { normalizeMessage, hydrationMessages } from "./normalize.mjs";
import { chooseSession, sessionStillOngoing } from "./session-mode.mjs";
import { queueSessionResultSync } from "./result-sync.mjs";
import { findOpenF1SessionMatch } from "../index.mjs";
import { upsertServiceHeartbeat } from "../ops-heartbeat.mjs";
import { verifyAndConsumeLiveTicket } from "./access-ticket.mjs";

const simulated = process.env.LIVE_DATA_SOURCE === "replay";
if (simulated && process.env.NODE_ENV === "production")
  throw new Error("Replay simulator is disabled in production");
const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db =
  dbUrl && dbKey
    ? createClient(dbUrl, dbKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
const live = new LiveState();
const writer = simulated
  ? null
  : new LiveWriter(db, process.env.LIVE_SPOOL_DIR ?? ".live-spool");
const audioUrls = new Map();
const usedAccessTickets = new Map();
const savedRadio = new Map();
const radioRetryTimers = new Set();
const radioRetryDelays = [15000, 30000, 60000, 120000, 300000];
let sourceConnected = false,
  lastMessageAt = null,
  source,
  changing = false,
  radioBusy = false,
  stopping = false;
let samples = [],
  radioQueue = [],
  pendingHydration = [],
  hydrating = false;
const streamFresh = () =>
  sourceConnected &&
  (live.state.status !== "live" ||
    (lastMessageAt !== null && Date.now() - Date.parse(lastMessageAt) < 15000));
const health = () => ({
  status: streamFresh() && (!writer || writer.healthy) ? "ok" : "degraded",
  sessionKey: live.state.session?.session_key ?? null,
  sourceConnected: streamFresh(),
  lastMessageAt,
  connectedClients: wss.clients.size,
  databaseWriterActive: writer?.healthy ?? false,
  lastDatabaseWriteAt: writer?.lastWriteAt ?? null,
  websocketActive: true,
});
function receive(topic, row) {
  if (hydrating) {
    pendingHydration.push([topic, row]);
    return;
  }
  if (
    !live.state.session ||
    Number(row.session_key) !== Number(live.state.session.session_key)
  )
    return;
  row = normalizeMessage(topic, row, live.state.session);
  lastMessageAt = new Date().toISOString();
  const previousStatus = live.state.status;
  if (!live.apply(topic, row)) return;
  if (
    !simulated &&
    previousStatus !== "finished" &&
    live.state.status === "finished"
  )
    void queueSessionResultSync(db, live.state.session)
      .then((count) => {
        if (count) console.info("[live] result sync queued", count);
      })
      .catch(() => console.error("[live] result sync queue failed"));
  writer?.enqueue(topic, row);
  if (topic === "location") {
    const p = live.state.locations[row.driver_number];
    if (p)
      samples.push({ type: "location", driverNumber: row.driver_number, ...p });
  }
  if (topic === "car_data") {
    const p = live.state.telemetry[row.driver_number];
    if (p)
      samples.push({
        type: "telemetry",
        driverNumber: row.driver_number,
        ...p,
      });
  }
  // REST backfill can deliver minutes of samples in one synchronous turn.
  // History is persisted separately; clients only need a bounded recent tail.
  if (samples.length > 4000) samples = samples.slice(-2000);
  if (topic === "team_radio" && allowedRecording(row.recording_url)) {
    const id = eventKey(topic, row);
    audioUrls.set(id, row.recording_url);
    if (audioUrls.size > 250) audioUrls.delete(audioUrls.keys().next().value);
    const radio = live.state.radio.find((x) => x.id === id);
    const saved = savedRadio.get(id);
    if (saved?.status === "ready") {
      Object.assign(radio, saved, { playable: false });
      return;
    }
    writer?.enqueueRadio(live.state.session, radio);
    radioQueue.push({
      id,
      session: { ...live.state.session },
      radio,
      attempt: 0,
    });
    void processRadio();
  }
}
function retryRadio(job) {
  const delay = radioRetryDelays[job.attempt];
  if (delay === undefined) return false;
  job.radio.status = "received";
  writer?.enqueueRadio(job.session, job.radio);
  const timer = setTimeout(() => {
    radioRetryTimers.delete(timer);
    if (
      stopping ||
      job.session.session_key !== live.state.session?.session_key ||
      job.radio.status === "ready"
    )
      return;
    radioQueue.push({ ...job, attempt: job.attempt + 1 });
    void processRadio();
  }, delay);
  radioRetryTimers.add(timer);
  return true;
}
async function processRadio() {
  if (radioBusy) return;
  radioBusy = true;
  try {
    while (radioQueue.length && !stopping) {
      const job = radioQueue.shift();
      const r = job.radio;
      r.status = "transcribing";
      writer?.enqueueRadio(job.session, r);
      try {
        await checkRadioBudget();
        const result = await transcribeRadio(audioUrls.get(job.id), {
          onUsage: (payload, model, purpose) =>
            writer?.enqueueUsage(payload, model, purpose),
        });
        Object.assign(r, {
          original: result.original,
          ru: result.ru,
          status: "ready",
        });
        writer?.enqueueRadio(job.session, r, result.cost);
      } catch {
        if (retryRadio(job)) {
          console.info("[live] radio source pending, retry scheduled", job.id);
          continue;
        }
        r.status = "failed";
        writer?.enqueueRadio(job.session, r);
        console.error("[live] radio processing failed after retries", job.id);
      }
      if (job.session.session_key === live.state.session?.session_key)
        savedRadio.set(job.id, { ...r });
    }
  } finally {
    radioBusy = false;
  }
}
async function checkRadioBudget() {
  if (!db) throw new Error("Radio accounting unavailable");
  const now = new Date(),
    monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString(),
    dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
  let daily = 0,
    monthly = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("ai_usage_logs")
      .select("created_at,estimated_cost_usd")
      .gte("created_at", monthStart)
      .order("created_at")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error("Radio accounting unavailable");
    for (const row of data) {
      monthly += Number(row.estimated_cost_usd ?? 0);
      if (row.created_at >= dayStart)
        daily += Number(row.estimated_cost_usd ?? 0);
    }
    if (data.length < 1000) break;
  }
  if (
    daily >= Number(process.env.AI_DAILY_COST_LIMIT_USD ?? 5) ||
    monthly >= Number(process.env.AI_MONTHLY_COST_LIMIT_USD ?? 100)
  )
    throw new Error("AI spending limit reached");
}
function broadcast(message) {
  const encoded = JSON.stringify(message);
  for (const client of wss.clients)
    if (client.readyState === WebSocket.OPEN) {
      if (client.bufferedAmount > 2 * 1024 * 1024) {
        client.close(1013, "Slow connection");
        continue;
      }
      client.send(encoded);
    }
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(health()));
      return;
    }
    if (url.pathname === "/snapshot") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          type: "snapshot",
          data: live.snapshot(),
          health: health(),
          serverTime: Date.now(),
        }),
      );
      return;
    }
    if (url.pathname === "/history" && db && live.state.session) {
      const topic =
        url.searchParams.get("topic") === "radio" ? "radio" : "events";
      const before = url.searchParams.get("before");
      let query = db
        .from(topic === "radio" ? "live_radio_text" : "live_events")
        .select("*")
        .eq("session_key", live.state.session.session_key)
        .order("timestamp", { ascending: false })
        .limit(100);
      if (before && Number.isFinite(Date.parse(before)))
        query = query.lt("timestamp", before);
      if (topic === "events")
        query = query.in("topic", ["race_control", "pit", "overtakes"]);
      const { data, error } = await query;
      if (error) throw error;
      let items = data;
      if (topic === "events") {
        const history = new LiveState();
        history.setSession(live.state.session);
        history.state.drivers = structuredClone(live.state.drivers);
        for (const row of [...data].reverse())
          history.apply(row.topic, row.payload);
        items = history.state.events;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ items, sessionKey: live.state.session.session_key }),
      );
      return;
    }
    res.writeHead(404).end();
  } catch {
    res
      .writeHead(503, { "Content-Type": "application/json" })
      .end(JSON.stringify({ error: "Данные временно недоступны." }));
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
server.on("upgrade", (req, socket, head) => {
  if (req.url?.split("?")[0] !== "/ws/live") {
    socket.destroy();
    return;
  }
  // LIVE is paid data: the web app issues a short-lived signed ticket after
  // checking the current subscription. Also reject cross-site browser sockets.
  let accessUserId = null;
  try {
    if (
      req.headers.origin &&
      ![
        req.headers.host,
        req.headers["x-forwarded-host"],
        new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000")
          .host,
      ].includes(new URL(req.headers.origin).host)
    ) {
      socket.destroy();
      return;
    }
    const billingEnforced = ["1", "true"].includes(String(process.env.BILLING_ENTITLEMENTS_ENFORCED ?? "").toLowerCase());
    if (billingEnforced) {
      const secret = process.env.LIVE_ACCESS_SECRET?.trim();
      const ticket = new URL(req.url ?? "", "http://live.internal").searchParams.get("ticket");
      const claims = secret && secret.length >= 32
        ? verifyAndConsumeLiveTicket(ticket, secret, usedAccessTickets)
        : null;
      if (!claims) {
        socket.destroy();
        return;
      }
      accessUserId = claims.userId;
      const configuredConnectionLimit = Number(process.env.LIVE_MAX_CONNECTIONS_PER_USER ?? 3);
      const maxConnections = Number.isSafeInteger(configuredConnectionLimit)
        ? Math.max(1, Math.min(configuredConnectionLimit, 10))
        : 3;
      const activeConnections = [...wss.clients].filter((client) => client.userId === accessUserId).length;
      if (activeConnections >= maxConnections) {
        socket.destroy();
        return;
      }
    }
  } catch {
    socket.destroy();
    return;
  }
  if (wss.clients.size >= 2000) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.userId = accessUserId;
    wss.emit("connection", ws, req);
  });
});
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.on("error", () => {});
  ws.send(
    JSON.stringify({
      type: "snapshot",
      data: live.snapshot(),
      health: health(),
      serverTime: Date.now(),
    }),
  );
});
const fastTimer = setInterval(() => {
  if (samples.length) {
    broadcast({ type: "samples", samples, serverTime: Date.now() });
    samples = [];
  }
}, 100);
const stateTimer = setInterval(() => {
  for (const d of Object.values(live.state.drivers))
    if (
      live.state.status === "live" &&
      d.status === "PIT" &&
      Number.isFinite(d.pitUntil) &&
      d.pitUntil < Date.now() &&
      live.state.locations[d.driverNumber]?.pitLaneProgress == null
    )
      d.status = "OUT LAP";
  const data = live.snapshot();
  delete data.locations;
  delete data.telemetry;
  delete data.track;
  broadcast({ type: "state", data, health: health(), serverTime: Date.now() });
}, 1000);
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
const writerTimer = setInterval(() => {
  if (writer)
    void writer.flush(live.snapshot()).catch(() => {
      writer.healthy = false;
      console.error("[live] database write failed; history retained in spool");
    });
}, 1000);
const writeServiceHeartbeat = async () => {
  if (!db) return;
  const snapshot = health();
  await upsertServiceHeartbeat(db, {
    serviceName: "live",
    status: snapshot.status === "ok" ? "healthy" : "degraded",
    summary: snapshot,
  });
};
const serviceHeartbeatTimer = setInterval(() => {
  void writeServiceHeartbeat().catch(() => console.error("[live] service heartbeat failed"));
}, 60000);
void writeServiceHeartbeat().catch(() => console.error("[live] initial service heartbeat failed"));
async function loadReplay(key) {
  // Uses the existing repository adapter, including chunked replay event rows.
  const origin = process.env.LIVE_WEB_ORIGIN ?? "http://127.0.0.1:3000";
  const response = await fetch(`${origin}/api/race-replay/${key}`, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Replay ${key} HTTP ${response.status}`);
  return response.json();
}
async function sessionTrack(session) {
  if (!db) return null;
  const { data: maps } = await db
    .from("track_maps")
    .select("definition,circuit_id,circuit_key")
    .order("season_source", { ascending: false });
  let { data: local } = await db
    .from("sessions")
    .select("race_id,races(circuit_id,race_name)")
    .eq("openf1_session_key", session.session_key)
    .maybeSingle();
  if (!local) {
    const { data: candidates } = await db
      .from("sessions")
      .select(
        "race_id,session_type,start_at,races(circuit_id,race_name,circuits(name,external_id,locality,country))",
      )
      .gte(
        "start_at",
        new Date(Date.parse(session.date_start) - 86400000).toISOString(),
      )
      .lte(
        "start_at",
        new Date(Date.parse(session.date_start) + 86400000).toISOString(),
      );
    const matches = (candidates ?? []).filter((candidate) =>
      findOpenF1SessionMatch(candidate, [session]),
    );
    if (matches.length === 1) local = matches[0];
  }
  if (local) {
    session.race_id = local.race_id;
    session.race_name = local.races?.race_name ?? session.race_name;
  }
  const map =
    maps?.find((m) => m.circuit_id === local?.races?.circuit_id) ??
    maps?.find((m) => String(m.circuit_key) === String(session.circuit_key));
  if (
    Number(session.circuit_key) === 153 &&
    Number(session.year ?? session.date_start?.slice(0, 4)) === 2026
  ) {
    return JSON.parse(
      await readFile(
        new URL("./tracks/madring-2026.json", import.meta.url),
        "utf8",
      ),
    );
  }
  if (!map)
    console.error(
      "[live] missing session track mapping",
      session.session_key,
      session.circuit_key,
    );
  return map?.definition ?? null;
}
async function discover(force = false) {
  if (changing || stopping) return;
  changing = true;
  try {
    const now = Date.now();
    const rows = await source.rest("sessions", {
      year: new Date().getUTCFullYear(),
    });
    let choice = chooseSession(rows, now);
    if (
      !choice.active &&
      choice.previous &&
      !live.state.session &&
      now - Date.parse(choice.previous.date_end) <= 30 * 60000
    ) {
      const controls = await source
        .rest("race_control", { session_key: choice.previous.session_key })
        .catch(() => []);
      if (sessionStillOngoing(choice.previous, controls, now))
        choice = { ...choice, session: choice.previous, active: true };
    }
    const session = choice.session;
    if (!session) return;
    if (
      !choice.active &&
      ["live", "paused"].includes(live.state.status) &&
      streamFresh() &&
      !force
    )
      return;
    const sameSession = session.session_key === live.state.session?.session_key;
    if (sameSession) {
      if (choice.active && live.state.status === "waiting")
        live.state.status = "live";
      if (!force) return;
    }
    if (!sameSession && live.state.session && writer) {
      live.state.status = "finished";
      await writer.drain(live.snapshot());
      // Finalize the old session before its state is replaced. All session
      // histories remain independent even if a replay cannot yet be published.
      if (db && live.state.track)
        try {
          await buildReplayFromHistory(db, live.state);
        } catch {
          console.error(
            "[live] previous session replay pending",
            live.state.session.session_key,
          );
        }
    }
    if (writer)
      await writer.flush(live.snapshot()).catch(() => {
        writer.healthy = false;
        console.error(
          "[live] database unavailable during discovery; continuing from spool",
        );
      });
    const track = await sessionTrack(session);
    if (!sameSession)
      live.setSession(
        {
          ...session,
          race_name:
            session.race_name ??
            session.meeting_name ??
            session.circuit_short_name,
        },
        track,
      );
    if (!choice.active && Date.parse(session.date_end) < now)
      live.state.status = "finished";
    if (!sameSession) {
      for (const timer of radioRetryTimers) clearTimeout(timer);
      radioRetryTimers.clear();
      audioUrls.clear();
      savedRadio.clear();
    }
    samples = [];
    if (db && !sameSession) {
      const { data } = await db
        .from("live_sessions")
        .select("snapshot")
        .eq("session_key", session.session_key)
        .maybeSingle();
      if (data?.snapshot?.session)
        live.state = {
          ...data.snapshot,
          track: track ?? data.snapshot.track,
          radio: (data.snapshot.radio ?? []).map((r) => ({
            ...r,
            playable: false,
          })),
        };
    }
    const historyEnd = Math.min(now, Date.parse(session.date_end) + 120000);
    const historyStarts = {};
    for (const [topic, field] of [
      ["location", "locations"],
      ["car_data", "telemetry"],
    ]) {
      const timestamps = Object.values(live.state[field])
        .map((p) => Date.parse(p.timestamp))
        .filter(Number.isFinite);
      historyStarts[topic] = Math.max(
        Date.parse(session.date_start),
        timestamps.length
          ? Math.min(...timestamps) - 15000
          : Date.parse(session.date_start),
      );
    }
    console.info("[live] session selected", session.session_key);
    hydrating = true;
    try {
      let radioHistoryAvailable = !db;
      if (db) {
        for (let from = 0; ; from += 1000) {
          const { data: rows, error } = await db
            .from("live_radio_text")
            .select("*")
            .eq("session_key", session.session_key)
            .order("id")
            .range(from, from + 999);
          if (error) {
            console.error("[live] radio history unavailable");
            break;
          }
          for (const r of rows)
            savedRadio.set(r.id, {
              id: r.id,
              driverNumber: r.driver_number,
              timestamp: r.timestamp,
              lap: r.lap,
              original: r.original,
              ru: r.ru,
              status: r.status,
              playable: false,
            });
          if (rows.length < 1000) {
            radioHistoryAvailable = true;
            break;
          }
        }
      }
      const streams = new Map();
      for (const topic of DATASETS.filter(
        (x) => !["sessions", "location", "car_data"].includes(x),
      )) {
        if (topic === "team_radio" && !radioHistoryAvailable) continue;
        try {
          const query = { session_key: session.session_key };
          streams.set(topic, await source.rest(topic, query));
        } catch {
          console.error("[live] snapshot stream unavailable", topic);
        }
      }
      const roster = streams.get("drivers") ?? [];
      if (roster.length)
        live.retainDrivers(roster.map((row) => row.driver_number));
      hydrating = false;
      for (const [topic, row] of hydrationMessages(streams, session))
        receive(topic, row);
      // Fill initial and reconnect gaps in bounded time windows. These rows are
      // persisted before moving to the next chunk, keeping memory bounded.
      hydrating = true;
      for (const topic of ["location", "car_data"]) {
        for (
          let start = historyStarts[topic];
          start < historyEnd;
          start += 120000
        ) {
          try {
            const rows = await source.rest(topic, {
              session_key: session.session_key,
              "date>": new Date(start - 1).toISOString(),
              "date<": new Date(
                Math.min(historyEnd, start + 120000),
              ).toISOString(),
            });
            hydrating = false;
            for (const row of rows) receive(topic, row);
            if (writer) await writer.flush(live.snapshot());
            hydrating = true;
          } catch {
            console.error(
              "[live] history backfill pending",
              topic,
              session.session_key,
            );
            break;
          }
        }
      }
    } finally {
      hydrating = false;
      const queued = pendingHydration;
      pendingHydration = [];
      for (const [t, r] of queued) receive(t, r);
    }
    broadcast({
      type: "snapshot",
      data: live.snapshot(),
      health: health(),
      serverTime: Date.now(),
    });
  } catch {
    console.error("[live] session discovery failed");
  } finally {
    changing = false;
  }
}
let discoverTimer, finishTimer;
async function start() {
  server.listen(
    Number(process.env.LIVE_PORT ?? 3002),
    process.env.LIVE_HOST ?? "127.0.0.1",
    () => console.info("[live] service listening"),
  );
  if (simulated && process.env.LIVE_RECORDING_FILE) {
    const recording = JSON.parse(
      await readFile(process.env.LIVE_RECORDING_FILE, "utf8"),
    );
    source = new RecordedOpenF1Source({
      recording,
      offset: Number(
        process.env.LIVE_REPLAY_OFFSET_MS ?? recording.fromOffsetMs ?? 0,
      ),
      speed: Math.max(0.1, Number(process.env.LIVE_REPLAY_SPEED ?? 1)),
      onMessage: receive,
      onConnection: (value) => {
        sourceConnected = value;
      },
    });
    live.setSession(source.session, recording.track);
  } else if (simulated) {
    const replay = await loadReplay(
      Number(process.env.LIVE_REPLAY_SESSION_KEY ?? 11334),
    );
    const offset = Number(process.env.LIVE_REPLAY_OFFSET_MS ?? 0),
      speed = Math.max(0.1, Number(process.env.LIVE_REPLAY_SPEED ?? 1));
    live.setSession(
      {
        session_key: replay.sourceSessionKey,
        meeting_key: replay.track.meetingKey,
        session_type: process.env.LIVE_REPLAY_SESSION_TYPE ?? "Race",
        session_name:
          process.env.LIVE_REPLAY_SESSION_NAME ??
          process.env.LIVE_REPLAY_SESSION_TYPE ??
          "Race",
        race_name: replay.raceName,
        circuit_short_name: replay.circuitName,
        date_start: new Date(Date.now() - offset / speed).toISOString(),
        date_end: new Date(
          Date.now() + (replay.durationMs - offset) / speed,
        ).toISOString(),
      },
      replay.track,
    );
    live.state.totalLaps = replay.totalLaps;
    source = new ReplaySimulationSource({
      replay,
      session: {
        sessionType: live.state.session.session_type,
        sessionName: live.state.session.session_name,
        sessionStart: live.state.session.date_start,
        sessionEnd: live.state.session.date_end,
      },
      onMessage: receive,
      onConnection: (value) => {
        sourceConnected = value;
      },
      offset,
      speed,
    });
  } else
    source = new OpenF1LiveSource({
      onMessage: receive,
      onConnection: (value) => {
        const recovering =
          value && !sourceConnected && live.state.session !== null;
        sourceConnected = value;
        console.info("[live] source", value ? "connected" : "reconnecting");
        if (recovering) void discover(true);
      },
    });
  await source.start();
  if (simulated && process.env.LIVE_REPLAY_RADIO_FILE) {
    const demo = JSON.parse(
      await readFile(process.env.LIVE_REPLAY_RADIO_FILE, "utf8"),
    );
    live.state.radio.unshift({
      id: eventKey("team_radio", {
        test: true,
        session_key: live.state.session.session_key,
      }),
      driverNumber: Number(demo.driverNumber ?? 44),
      timestamp: new Date().toISOString(),
      lap: live.state.drivers[Number(demo.driverNumber ?? 44)]?.lap ?? null,
      original: String(demo.original),
      ru: String(demo.ru),
      status: "ready",
      playable: false,
      test: true,
    });
  }
  if (!simulated) {
    void discover();
    discoverTimer = setInterval(() => void discover(), 60000);
  }
  let finishing = false;
  finishTimer = setInterval(() => {
    if (
      simulated ||
      !db ||
      finishing ||
      live.state.status !== "finished" ||
      radioBusy ||
      radioQueue.length > 0 ||
      radioRetryTimers.size > 0 ||
      live.state.replayReady
    )
      return;
    // Let the final laps and classifications arrive before publishing a replay.
    if (Date.now() - Date.parse(live.state.session.date_end) < 120000) return;
    finishing = true;
    void (async () => {
      await writer.drain(live.snapshot());
      if (!writer.healthy) return;
      await buildReplayFromHistory(db, live.state);
      live.state.replayReady = true;
      audioUrls.clear();
      for (const r of live.state.radio) r.playable = false;
    })()
      .catch(() => console.error("[live] replay finalization failed"))
      .finally(() => {
        finishing = false;
      });
  }, 30000);
}
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(discoverTimer);
  clearInterval(finishTimer);
  clearInterval(fastTimer);
  clearInterval(stateTimer);
  clearInterval(heartbeat);
  clearInterval(writerTimer);
  clearInterval(serviceHeartbeatTimer);
  for (const timer of radioRetryTimers) clearTimeout(timer);
  radioRetryTimers.clear();
  await source?.stop();
  if (writer) await writer.drain(live.snapshot()).catch(() => {});
  for (const ws of wss.clients) ws.close(1001, "Restarting");
  wss.close();
  server.close();
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
void start().catch(() => {
  console.error("[live] startup failed");
  void stop();
  process.exitCode = 1;
});
