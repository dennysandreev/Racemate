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
import type { Comparison, Meeting, Session, SavedComparison } from "./types";
import { telemetryFlags } from "./flags";
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
