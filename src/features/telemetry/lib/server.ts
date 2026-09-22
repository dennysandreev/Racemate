import "server-only";
import {
  createTelemetryDb,
  TelemetryStore,
} from "../../../../worker/telemetry/store.mjs";
import {
  resultKey,
  validateTask,
  type Task,
} from "../../../../worker/telemetry/service.mjs";
export { resultKey } from "../../../../worker/telemetry/service.mjs";
import { resampleComparison } from "../../../../worker/telemetry/core.mjs";
import type {
  Catalog,
  Comparison,
  Meeting,
  Session,
  SavedComparison,
  TelemetryBootstrapData,
  TelemetrySetupCatalog,
} from "./types";
import { telemetryFlags } from "./flags";
import type { TelemetryDemoScope } from "./demo-access";
import { withServerTtlCache } from "@/lib/server-ttl-cache";
export function telemetryStore() {
  return new TelemetryStore(createTelemetryDb());
}
export const messages: Record<string, string> = {
  STORAGE_UNAVAILABLE: "Телеметрия пока недоступна. Попробуйте немного позже.",
  PROVIDER_UNAVAILABLE:
    "Источник телеметрии временно недоступен. Сохранённые сравнения можно открыть по ссылке.",
  NO_VALID_LAP:
    "Не нашли подходящий лучший круг. Попробуйте выбрать круг вручную.",
  NO_COMPARABLE_LAP:
    "Для лучших кругов не хватает непрерывной телеметрии. Выберите другой круг.",
  RACE_AVERAGE_ONLY:
    "Средний гоночный темп доступен только в завершённой гонке.",
  RACE_AVERAGE_UNAVAILABLE:
    "Для среднего темпа не хватает чистых гоночных кругов с телеметрией.",
  NO_TELEMETRY: "Для этого круга нет телеметрии. Попробуйте другой круг.",
  INCOMPLETE_TELEMETRY:
    "В этих кругах слишком много пропусков для точного сравнения. Выберите другие круги.",
  INCOMPATIBLE_LAPS:
    "Можно сравнить круги одного уикенда на одной конфигурации трассы.",
  TEAMMATE_UNAVAILABLE: "У напарника нет подходящего круга в этой сессии.",
  EVOLUTION_UNAVAILABLE:
    "Для сравнения нужны круги этого пилота хотя бы в двух периодах.",
  SESSION_NOT_FINISHED: "Телеметрия появится после завершения сессии.",
};
export function userError(error: unknown) {
  const code = error instanceof Error ? error.message : "PROVIDER_UNAVAILABLE";
  return {
    code: code in messages ? code : "INVALID_REQUEST",
    error:
      messages[code] ??
      "Не удалось открыть сравнение. Проверьте выбранные круги.",
  };
}
export function present(
  c: Comparison,
  options?: { from?: number; to?: number; points?: number },
) {
  const data = resampleComparison(c, options);
  return telemetryFlags.telemetryInsights ? data : { ...data, insights: [] };
}
export async function queryTelemetry(input: Task) {
  if (!telemetryFlags.telemetryHub) throw new Error("STORAGE_UNAVAILABLE");
  const task = validateTask(input);
  if (
    task.kind === "compare" &&
    task.config.mode === "evolution" &&
    !telemetryFlags.trackEvolution
  )
    throw new Error("STORAGE_UNAVAILABLE");
  const store = telemetryStore(),
    data = await store.get(resultKey(task));
  if (data)
    return {
      status: 200,
      data: task.kind === "compare" ? present(data as Comparison) : data,
    };
  const taskId = await store.enqueue(task);
  return {
    status: 202,
    taskId,
    message: "Готовим телеметрию. Это сравнение ещё не открывали.",
  };
}

type TelemetryBootstrapOptions = {
  demoScope?: TelemetryDemoScope | null;
  season?: number;
  meeting?: number;
  session?: number;
  waitMs?: number;
};

export function toTelemetrySetupCatalog(
  catalog: Catalog,
): TelemetrySetupCatalog {
  return {
    session: catalog.session,
    drivers: catalog.drivers,
    laps: catalog.laps,
  };
}

export async function getTelemetryBootstrap(
  options: TelemetryBootstrapOptions = {},
): Promise<TelemetryBootstrapData> {
  const scopeKey = options.demoScope
    ? `demo:${options.demoScope.meeting.id}`
    : "full";
  const cacheKey = [
    "telemetry:bootstrap",
    scopeKey,
    options.season ?? "default",
    options.meeting ?? "default",
    options.session ?? "default",
  ].join(":");

  return withServerTtlCache(
    cacheKey,
    60_000,
    () => loadTelemetryBootstrap(options),
    {
      shouldCache: (data) =>
        (data as TelemetryBootstrapData).stage === "ready",
      staleWhileRevalidateMs: 5 * 60_000,
    },
  );
}

async function loadTelemetryBootstrap(
  options: TelemetryBootstrapOptions,
): Promise<TelemetryBootstrapData> {
  const deadline = Date.now() + Math.max(0, options.waitMs ?? 0);
  const partial: TelemetryBootstrapData = {
    seasons: [],
    season: null,
    meetings: [],
    meeting: null,
    sessions: [],
    session: null,
    catalog: null,
    stage: "seasons",
  };

  if (options.demoScope) {
    partial.seasons = [options.demoScope.meeting.season];
  } else {
    const seasons = await resolveBootstrapTask<number[]>(
      { kind: "seasons" },
      deadline,
    );
    if (!seasons.ready) return partial;
    partial.seasons = [...seasons.data].sort((a, b) => b - a);
  }

  if (!partial.seasons.length) return { ...partial, stage: "ready" };
  partial.season = partial.seasons.includes(options.season ?? 0)
    ? options.season!
    : partial.seasons[0];
  partial.stage = "meetings";

  if (options.demoScope) {
    partial.meetings =
      partial.season === options.demoScope.meeting.season
        ? [options.demoScope.meeting]
        : [];
  } else {
    const meetings = await resolveBootstrapTask<Meeting[]>(
      { kind: "meetings", season: partial.season },
      deadline,
    );
    if (!meetings.ready) return partial;
    partial.meetings = meetings.data;
  }

  if (!partial.meetings.length) return { ...partial, stage: "ready" };
  const chosenMeeting =
    partial.meetings.find((item) => item.id === options.meeting) ??
    [...partial.meetings].sort(
      (a, b) => Date.parse(b.start) - Date.parse(a.start),
    )[0];
  partial.meeting = chosenMeeting.id;
  partial.stage = "sessions";

  if (options.demoScope) {
    partial.sessions =
      chosenMeeting.id === options.demoScope.meeting.id
        ? options.demoScope.sessions
        : [];
  } else {
    const sessions = await resolveBootstrapTask<Session[]>(
      { kind: "sessions", meeting: chosenMeeting.id },
      deadline,
    );
    if (!sessions.ready) return partial;
    partial.sessions = sessions.data;
  }

  if (!partial.sessions.length) return { ...partial, stage: "ready" };
  const chosenSession =
    partial.sessions.find((item) => item.id === options.session) ??
    [...partial.sessions]
      .reverse()
      .find((item) => item.type === "Qualifying") ??
    partial.sessions.at(-1)!;
  partial.session = chosenSession.id;
  partial.stage = "catalog";

  const catalog = await resolveBootstrapTask<Catalog>(
    { kind: "catalog", session: chosenSession.id },
    deadline,
  );
  if (!catalog.ready) return partial;
  partial.catalog = toTelemetrySetupCatalog(catalog.data);
  partial.stage = "ready";
  return partial;
}

async function resolveBootstrapTask<T>(
  task: Task,
  deadline: number,
): Promise<{ ready: true; data: T } | { ready: false }> {
  const result = await queryTelemetry(task);
  if (result.status === 200) return { ready: true, data: result.data as T };
  if (!result.taskId || Date.now() >= deadline) return { ready: false };

  const store = telemetryStore();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const pending = await store.task(result.taskId);
    if (pending?.status === "failed")
      throw new Error(pending.error_code ?? "PROVIDER_UNAVAILABLE");
    if (pending?.status === "ready" && pending.result_key) {
      const data = await store.get<T>(pending.result_key);
      if (data) return { ready: true, data };
    }
  }
  return { ready: false };
}
export async function getTelemetryCatalogPages() {
  try {
    const store = telemetryStore();
    const years =
      (await store.get<number[]>(resultKey({ kind: "seasons" }))) ?? [];
    const result: { meeting: Meeting; sessions: Session[] }[] = [];
    for (const season of years) {
      const meetings = (await store.get<Meeting[]>(`meetings:${season}`)) ?? [];
      for (const meeting of meetings) {
        const sessions =
          (await store.get<Session[]>(`sessions:${meeting.id}`)) ?? [];
        result.push({ meeting, sessions });
      }
    }
    return result;
  } catch {
    return [];
  }
}
export async function readSaved(id: string): Promise<SavedComparison | null> {
  return telemetryStore().getComparison(id);
}
