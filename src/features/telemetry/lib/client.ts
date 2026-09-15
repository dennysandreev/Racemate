export async function telemetryRequest<T>(
  path: string,
  options: {
    body?: unknown;
    signal?: AbortSignal;
    onPreparing?: (id: string) => void;
  } = {},
): Promise<T> {
  let url = `/api/telemetry/${path}`;
  let init: RequestInit = {
    signal: options.signal,
    cache: "no-store",
    ...(options.body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
  };
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const res = await fetch(url, init);
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("Не удалось загрузить телеметрию. Попробуйте ещё раз.");
    }
    if (!res.ok && res.status !== 202)
      throw new Error(data.error ?? "Не удалось загрузить телеметрию.");
    if (res.status !== 202) return data.data as T;
    options.onPreparing?.(data.taskId);
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        options.signal?.removeEventListener("abort", abort);
        resolve();
      }, 3000);
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener("abort", abort, { once: true });
    });
    url = `/api/telemetry/tasks/${data.taskId}`;
    init = { signal: options.signal, cache: "no-store" };
  }
  throw new Error(
    "Подготовка ещё продолжается. Откройте сравнение чуть позже.",
  );
}
export function trackTelemetry(event: string, comparisonId?: string) {
  void fetch("/api/telemetry/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, comparisonId }),
    keepalive: true,
  }).catch(() => {});
}
export function createCursorStore() {
  let distance = 0;
  const listeners = new Set<() => void>();
  let frame: number | null = null;
  return {
    get: () => distance,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (value: number) => {
      distance = value;
      if (frame == null)
        frame = requestAnimationFrame(() => {
          frame = null;
          listeners.forEach((fn) => fn());
        });
    },
    destroy: () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      listeners.clear();
    },
  };
}
export type CursorStore = ReturnType<typeof createCursorStore>;
