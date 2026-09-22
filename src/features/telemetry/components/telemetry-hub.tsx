"use client";
import Link from "next/link";
import { formatGrandPrixNameRu } from "@/lib/race-display";
import { PageTitle } from "@/components/racemate/page-title";
import { DriverAvatarBadge } from "@/components/racemate/driver-avatar-badge";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeftRight,
  Activity,
  Cog,
  Users,
  Layers,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  Share2,
  SlidersHorizontal,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CursorStore } from "../lib/client";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import type {
  CompareConfig,
  Comparison,
  Meeting,
  Session,
  Mode,
  Channel,
  SavedComparison,
  LapSelection,
  TelemetryBootstrapData,
  TelemetryBootstrapStage,
  TelemetrySetupCatalog,
} from "../lib/types";
import {
  telemetryBootstrapLabel,
  telemetryBootstrapRequest,
  telemetryRequest,
  createCursorStore,
  trackTelemetry,
} from "../lib/client";
import {
  lapTime,
  lapAnalysisRows,
  gearAnalysisRows,
  number,
  deltaTime,
  getTraceColors,
  teamColor,
  sessionName,
  lapLabel,
  lapDetail,
} from "../lib/format";
import { TelemetryChart } from "./telemetry-chart";
import { TelemetryTrack } from "./telemetry-track";
import { TelemetryShare } from "./telemetry-share";
import { telemetryFlags } from "../lib/flags";
const comparisonKinds = [
  { value: "drivers", label: "Пилоты и круги", icon: Users },
  { value: "session", label: "Сессии", icon: Layers },
  { value: "evolution", label: "Прогресс", icon: TrendingUp },
] as const;
const views = [
  ["overview", "Обзор"],
  ["speed", "Скорость"],
  ["pedals", "Педали"],
  ["engine", "Мотор и передачи"],
  ["track", "Трасса"],
  ["analysis", "Анализ"],
];
const isRaceSession = (session?: Session | null) =>
  session?.type.toLowerCase() === "race" ||
  session?.name.toLowerCase() === "race";
const initialDrivers = (catalog?: TelemetrySetupCatalog | null) => {
  const sorted = [...(catalog?.drivers ?? [])].sort(
    (a, b) => (a.position ?? 99) - (b.position ?? 99),
  );
  return [sorted[0]?.number ?? 0, sorted[1]?.number ?? 0];
};
export function TelemetryHub({
  demoMode = false,
  initialSeason,
  initialMeeting,
  initialSession,
  initialMode = "best",
  saved,
  initialMeetingName,
  initialBootstrap,
}: {
  demoMode?: boolean;
  initialSeason?: number;
  initialMeeting?: number;
  initialSession?: number;
  initialMode?: Mode;
  saved?: SavedComparison;
  initialMeetingName?: string;
  initialBootstrap?: TelemetryBootstrapData;
}) {
  const bootstrapCatalog = initialBootstrap?.catalog ?? null;
  const [seasons, setSeasons] = useState<number[]>(
      initialBootstrap?.seasons ?? [],
    ),
    [season, setSeason] = useState(
      initialBootstrap?.season ??
        initialSeason ??
        new Date().getUTCFullYear(),
    );
  const [meetings, setMeetings] = useState<Meeting[]>(
      initialBootstrap?.meetings ?? [],
    ),
    [meeting, setMeeting] = useState(
      initialBootstrap?.meeting ?? initialMeeting ?? 0,
    ),
    [sessions, setSessions] = useState<Session[]>(
      initialBootstrap?.sessions ?? [],
    );
  const [catalogs, setCatalogs] = useState<
      (TelemetrySetupCatalog | null)[]
    >([bootstrapCatalog, bootstrapCatalog]),
    [drivers, setDrivers] = useState(initialDrivers(bootstrapCatalog)),
    [laps, setLaps] = useState<LapSelection[]>(["best", "best"]);
  const [mode, setMode] = useState<Mode>(
      saved?.comparison.config.mode ?? initialMode,
    ),
    [view, setView] = useState("overview"),
    [windowMode, setWindowMode] = useState<"weekend" | "session">("weekend");
  const [comparison, setComparison] = useState<Comparison | null>(
      saved?.comparison ?? null,
    ),
    [requestConfig, setRequestConfig] = useState<CompareConfig | null>(
      saved?.comparison.config ?? null,
    ),
    [savedId, setSavedId] = useState(saved?.id);
  const [range, setRange] = useState<[number, number]>(
      saved?.comparison.config.range ?? [
        0,
        saved?.comparison.track.length ?? 1,
      ],
    ),
    [corner, setCorner] = useState<number | undefined>(
      saved?.comparison.config.corner,
    );
  const bootstrapReady = initialBootstrap?.stage === "ready";
  const [loading, setLoading] = useState(!saved && !bootstrapReady),
    [loadingPhase, setLoadingPhase] = useState<
      "initial" | "catalog" | "comparison" | null
    >(saved || bootstrapReady ? null : "initial"),
    [bootstrapStage, setBootstrapStage] = useState<TelemetryBootstrapStage>(
      initialBootstrap?.stage ?? "seasons",
    ),
    [error, setError] = useState(""),
    [share, setShare] = useState(false),
    [editing, setEditing] = useState(false),
    [showInvalid, setShowInvalid] = useState(false);
  const controller = useRef<AbortController | null>(null),
    cursor = useMemo(() => createCursorStore(), []);
  const mainSession = catalogs[0]?.session;
  function begin(phase: "catalog" | "comparison" = "catalog") {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setLoadingPhase(phase);
    setError("");
    return c.signal;
  }
  function fail(e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return;
    setError(
      e instanceof Error ? e.message : "Не удалось загрузить телеметрию.",
    );
    setLoading(false);
    setLoadingPhase(null);
  }
  const load = <T,>(path: string, signal: AbortSignal) =>
    telemetryRequest<T>(path, {
      signal,
    });
  function applyBootstrap(data: TelemetryBootstrapData) {
    setBootstrapStage(data.stage);
    setSeasons(data.seasons);
    if (data.season != null) setSeason(data.season);
    setMeetings(data.meetings);
    if (data.meeting != null) setMeeting(data.meeting);
    setSessions(data.sessions);
    if (data.catalog) {
      setCatalogs([data.catalog, data.catalog]);
      setDrivers(initialDrivers(data.catalog));
      setLaps(["best", "best"]);
    }
    if (data.stage === "ready") {
      setLoading(false);
      setLoadingPhase(null);
    }
  }
  async function loadInitialBootstrap(signal: AbortSignal) {
    const data = await telemetryBootstrapRequest(
      {
        season: initialSeason,
        meeting: initialMeeting,
        session: initialSession,
      },
      { signal, onProgress: applyBootstrap },
    );
    if (!signal.aborted) applyBootstrap(data);
  }
  async function pickSession(id: number, signal: AbortSignal, index = 0) {
    const catalog = await load<TelemetrySetupCatalog>(
      `setup-catalog?session=${id}`,
      signal,
    );
    if (signal.aborted) return;
    if (index === 0) {
      setCatalogs([catalog, catalog]);
      setDrivers(initialDrivers(catalog));
      setLaps(["best", "best"]);
    } else {
      setCatalogs((old) => [old[0], catalog]);
      setLaps((old) => [old[0], "best"]);
    }
    setLoading(false);
    setLoadingPhase(null);
  }
  async function pickMeeting(
    id: number,
    signal: AbortSignal,
    sessionId?: number,
  ) {
    setMeeting(id);
    const list = await load<Session[]>(`sessions?meeting=${id}`, signal);
    setSessions(list);
    if (sessionId && !list.some((s) => s.id === sessionId))
      throw new Error("Эта сессия недоступна для выбранного Гран-при.");
    if (!list.length) {
      setCatalogs([null, null]);
      setLoading(false);
      setLoadingPhase(null);
      return;
    }
    const chosen =
      list.find((s) => s.id === sessionId) ??
      [...list].reverse().find((s) => s.type === "Qualifying") ??
      list.at(-1)!;
    await pickSession(chosen.id, signal);
  }
  async function pickSeason(
    year: number,
    signal: AbortSignal,
    meetingId?: number,
    sessionId?: number,
  ) {
    setSeason(year);
    const list = await load<Meeting[]>(`meetings?season=${year}`, signal);
    setMeetings(list);
    if (meetingId && !list.some((m) => m.id === meetingId))
      throw new Error("Этот Гран-при не найден в выбранном сезоне.");
    const chosen =
      list.find((m) => m.id === meetingId) ??
      [...list].sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0];
    if (chosen) await pickMeeting(chosen.id, signal, sessionId);
    else {
      setLoading(false);
      setLoadingPhase(null);
    }
  }
  useEffect(() => {
    trackTelemetry("telemetry_open", saved?.id);
    if (saved) return () => controller.current?.abort();
    if (initialBootstrap?.stage === "ready")
      return () => controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const timer = window.setTimeout(() => {
      void loadInitialBootstrap(c.signal).catch(fail);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      c.abort();
    };
    // Initial route selection is loaded once; subsequent changes are explicit user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => cursor.destroy(), [cursor]);
  async function compare() {
    if (!catalogs[0]) return;
    setEditing(false);
    const signal = begin("comparison");
    const selectedMode = mode;
    const config: CompareConfig = {
      mode: selectedMode,
      reference: 0,
      window: windowMode,
      traces: [
        {
          session: catalogs[0].session.id,
          driver: drivers[0],
          lap: selectedMode === "lap" ? laps[0] : "best",
        },
      ],
    };
    if (!["teammate", "evolution"].includes(selectedMode))
      config.traces.push({
        session: (selectedMode === "session" ? catalogs[1] : catalogs[0])!
          .session.id,
        driver: selectedMode === "session" ? drivers[0] : drivers[1],
        lap: ["lap", "session"].includes(selectedMode) ? laps[1] : "best",
      });
    if (selectedMode === "session") config.traces[0].lap = laps[0];
    try {
      const result = await telemetryRequest<Comparison>("compare", {
        body: config,
        signal,
      });
      if (signal.aborted) return;
      setComparison(result);
      setEditing(false);
      setRequestConfig(config);
      setRange([0, result.track.length]);
      setCorner(undefined);
      setSavedId(undefined);
      setMode(selectedMode);
      setLoading(false);
      setLoadingPhase(null);
      cursor.set(0);
      trackTelemetry("telemetry_compare_created");
    } catch (e) {
      fail(e);
    }
  }
  function selectCorner(n: number) {
    const c = comparison?.track.corners.find((c) => c.number === n);
    if (c) {
      setCorner(n);
      setRange([c.start, c.end]);
      cursor.set(c.apex);
      trackTelemetry("telemetry_corner_selected");
    }
  }
  function showWholeLap() {
    if (!comparison) return;
    setRange([0, comparison.track.length]);
    setCorner(undefined);
  }
  function showRange(next: [number, number]) {
    setRange(next);
    setCorner(undefined);
    cursor.set(Math.max(next[0], Math.min(next[1], cursor.get())));
  }
  function stepCorner(direction: number) {
    if (!comparison?.track.corners.length) return;
    const corners = comparison.track.corners;
    const index =
      corner == null ? -1 : corners.findIndex((item) => item.number === corner);
    const next =
      (index + 1 + direction + corners.length + 1) % (corners.length + 1);
    if (next === 0) showWholeLap();
    else selectCorner(corners[next - 1].number);
  }
  const channels: ("delta" | Channel)[] =
    view === "overview"
      ? ["delta", "speed"]
      : view === "speed"
        ? ["speed"]
        : view === "pedals"
          ? ["throttle", "brake"]
          : view === "engine"
            ? ["gear", "rpm"]
            : [];
  const editable = !saved;
  const editingCatalog = Boolean(
    comparison && editing && loading && loadingPhase === "catalog",
  );
  const kind = mode === "session" || mode === "evolution" ? mode : "drivers";
  const manualLaps = kind !== "evolution" && mode !== "teammate";
  const sameSelection =
    kind === "drivers" &&
    mode !== "teammate" &&
    drivers[0] === drivers[1] &&
    laps[0] === laps[1];
  const missingSession =
    mode === "session" &&
    (!catalogs[1] || catalogs[1].session.id === mainSession?.id);
  function updateLaps(next: LapSelection[]) {
    setLaps(next);
    if (kind === "drivers" && mode !== "teammate")
      setMode(next.every((lap) => lap === "best") ? "best" : "lap");
  }
  function chooseLap(index: number, value: string) {
    const next = laps.map((lap, i) =>
      i === index
        ? value === "best" || value === "race_average"
          ? value
          : Number(value)
        : lap,
    );
    updateLaps(next);
    trackTelemetry("telemetry_lap_selected");
  }
  function chooseDriver(index: number, value: string) {
    if (value === "teammate") {
      setMode("teammate");
      setLaps(["best", "best"]);
      return;
    }
    setDrivers((old) =>
      old.map((driver, i) => (i === index ? Number(value) : driver)),
    );
    const next =
      kind === "session"
        ? ["best" as const, "best" as const]
        : laps.map((lap, i) => (i === index ? ("best" as const) : lap));
    setLaps(next);
    if (kind === "drivers" && (mode !== "teammate" || index === 1))
      setMode(next.every((lap) => lap === "best") ? "best" : "lap");
    trackTelemetry("telemetry_driver_selected");
  }
  const traceColors = comparison ? getTraceColors(comparison) : [];
  const controls = editable ? (
    <>
      <FieldGroup className="telemetry-selectors">
        <Field>
          <FieldLabel htmlFor="telemetry-season">Сезон</FieldLabel>
          <select
            id="telemetry-season"
            value={season}
            disabled={loading}
            onChange={(event) =>
              void pickSeason(Number(event.target.value), begin()).catch(fail)
            }
          >
            {seasons.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="telemetry-meeting">Гран-при</FieldLabel>
          <select
            id="telemetry-meeting"
            value={meeting}
            disabled={loading}
            onChange={(event) =>
              void pickMeeting(Number(event.target.value), begin()).catch(fail)
            }
          >
            {meetings.map((item) => (
              <option key={item.id} value={item.id}>
                {formatGrandPrixNameRu(item.name).replace(/^Гран-при\s+/i, "")}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="telemetry-session">
            {kind === "session" ? "Первая сессия" : "Сессия"}
          </FieldLabel>
          <select
            id="telemetry-session"
            value={mainSession?.id ?? ""}
            disabled={loading}
            onChange={(event) =>
              void pickSession(Number(event.target.value), begin()).catch(fail)
            }
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {sessionName(session.name)}
              </option>
            ))}
          </select>
        </Field>
      </FieldGroup>
      <Tabs
        value={kind}
        onValueChange={(value) => {
          setLaps(["best", "best"]);
          setShowInvalid(false);
          setMode(value === "drivers" ? "best" : (value as Mode));
          if (
            value === "session" &&
            catalogs[1]?.session.id === mainSession?.id
          ) {
            const other = sessions.find(
              (session) => session.id !== mainSession?.id,
            );
            if (other) void pickSession(other.id, begin(), 1).catch(fail);
          }
        }}
      >
        <TabsList className="telemetry-mode-switch" aria-label="Что сравнить">
          {comparisonKinds
            .filter(
              (item) =>
                item.value !== "evolution" || telemetryFlags.trackEvolution,
            )
            .map((item) => (
              <TabsTrigger
                disabled={loading}
                key={item.value}
                value={item.value}
              >
                <item.icon aria-hidden="true" className="size-3.5" />
                {item.label}
              </TabsTrigger>
            ))}
        </TabsList>
      </Tabs>
      {catalogs[0] && (
        <FieldGroup className="telemetry-picks">
          {[0, 1]
            .filter((index) => index === 0 || kind !== "evolution")
            .map((index) => {
              const catalog = (
                index === 1 && kind === "session" ? catalogs[1] : catalogs[0]
              )!;
              const driverNumber =
                kind === "session" ? drivers[0] : drivers[index];
              const choices = catalog.laps
                .filter(
                  (lap) =>
                    lap.driverNumber === driverNumber &&
                    (showInvalid ||
                      (!lap.deleted &&
                        lap.complete &&
                        !lap.pitIn &&
                        !lap.pitOut)),
                )
                .sort((a, b) => a.number - b.number);
              return (
                <FieldGroup
                  className="telemetry-pick"
                  key={index}
                  style={
                    {
                      "--trace": teamColor(
                        catalog.drivers.find(
                          (driver) => driver.number === driverNumber,
                        ),
                      ),
                    } as React.CSSProperties
                  }
                >
                  {index === 1 && kind === "session" ? (
                    <Field>
                      <FieldLabel htmlFor="telemetry-second-session">
                        Вторая сессия
                      </FieldLabel>
                      <select
                        id="telemetry-second-session"
                        value={missingSession ? "" : catalog.session.id}
                        disabled={loading || sessions.length < 2}
                        onChange={(event) =>
                          void pickSession(
                            Number(event.target.value),
                            begin(),
                            1,
                          ).catch(fail)
                        }
                      >
                        {missingSession && (
                          <option value="" disabled>
                            Нет другой сессии
                          </option>
                        )}
                        {sessions
                          .filter((session) => session.id !== mainSession?.id)
                          .map((session) => (
                            <option key={session.id} value={session.id}>
                              {sessionName(session.name)}
                            </option>
                          ))}
                      </select>
                    </Field>
                  ) : (
                    <Field>
                      <FieldLabel htmlFor={`telemetry-driver-${index}`}>
                        {index === 0 ? "Пилот" : "Соперник"}
                      </FieldLabel>
                      <div className="telemetry-driver-choice">
                        {!(index === 1 && mode === "teammate") && (
                          <DriverAvatarBadge
                            className="telemetry-choice-avatar"
                            name={
                              catalog.drivers.find(
                                (driver) => driver.number === driverNumber,
                              )?.name ?? "Пилот"
                            }
                            slug={catalog.drivers
                              .find((driver) => driver.number === driverNumber)
                              ?.name.toLowerCase()
                              .replace(/[^a-z0-9]+/g, "-")}
                            season={season}
                            fallbackLabel={
                              catalog.drivers.find(
                                (driver) => driver.number === driverNumber,
                              )?.code
                            }
                            color="transparent"
                            sizes="48px"
                          />
                        )}
                        <select
                          id={`telemetry-driver-${index}`}
                          value={
                            index === 1 && mode === "teammate"
                              ? "teammate"
                              : driverNumber
                          }
                          disabled={loading}
                          onChange={(event) =>
                            chooseDriver(index, event.target.value)
                          }
                        >
                          {index === 1 && (
                            <option value="teammate">
                              Напарник по команде
                            </option>
                          )}
                          {[...catalog.drivers]
                            .sort(
                              (a, b) => (a.position ?? 99) - (b.position ?? 99),
                            )
                            .map((driver) => (
                              <option key={driver.id} value={driver.number}>
                                {driver.name} · {driver.team}
                              </option>
                            ))}
                        </select>
                      </div>
                    </Field>
                  )}
                  {manualLaps && (
                    <Field>
                      <FieldLabel htmlFor={`telemetry-lap-${index}`}>
                        {kind === "session"
                          ? `${isRaceSession(catalog.session) ? "Круг или темп" : "Круг"} ${index === 0 ? "в первой" : "во второй"} сессии`
                          : isRaceSession(catalog.session)
                            ? "Круг или темп"
                            : "Круг"}
                      </FieldLabel>
                      <select
                        id={`telemetry-lap-${index}`}
                        value={laps[index]}
                        disabled={loading || (index === 1 && missingSession)}
                        onChange={(event) =>
                          chooseLap(index, event.target.value)
                        }
                      >
                        <option value="best">Лучший доступный</option>
                        {isRaceSession(catalog.session) && (
                          <option value="race_average">
                            Средний темп гонки
                          </option>
                        )}
                        {choices.map((lap) => (
                          <option key={lap.id} value={lap.number}>
                            Круг {lap.number} · {lapTime(lap.time)}
                            {lap.deleted
                              ? " · удалён"
                              : lap.pitIn || lap.pitOut
                                ? " · пит-лейн"
                                : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </FieldGroup>
              );
            })}
          {kind === "evolution" && (
            <Field>
              <FieldLabel htmlFor="telemetry-evolution-window">
                Период
              </FieldLabel>
              <select
                id="telemetry-evolution-window"
                value={windowMode}
                disabled={loading}
                onChange={(event) =>
                  setWindowMode(event.target.value as "weekend" | "session")
                }
              >
                <option value="weekend">Весь уикенд</option>
                <option value="session">Начало и конец сессии</option>
              </select>
            </Field>
          )}
        </FieldGroup>
      )}
      {manualLaps && (
        <label className="telemetry-invalid-toggle">
          <input
            type="checkbox"
            checked={showInvalid}
            onChange={(event) => {
              setShowInvalid(event.target.checked);
              if (!event.target.checked)
                updateLaps(
                  laps.map((value, index) => {
                    if (value === "best" || value === "race_average")
                      return value;
                    const catalog =
                      index === 1 && kind === "session"
                        ? catalogs[1]
                        : catalogs[0];
                    const driver =
                      kind === "session" ? drivers[0] : drivers[index];
                    const lap = catalog?.laps.find(
                      (lap) =>
                        lap.driverNumber === driver && lap.number === value,
                    );
                    return lap &&
                      lap.complete &&
                      !lap.deleted &&
                      !lap.pitIn &&
                      !lap.pitOut
                      ? value
                      : "best";
                  }),
                );
            }}
          />
          Включить удалённые круги и заезды через пит-лейн
        </label>
      )}
      <div
        className="telemetry-controls-action"
        data-warning={sameSelection || missingSession}
      >
        <p aria-live="polite">
          {sameSelection
            ? "Для сравнения выберите разные круги."
            : missingSession
              ? "Для сравнения нужна ещё одна завершённая сессия."
              : mode === "teammate"
                ? "Сравним лучшие круги пилотов одной команды."
                : kind === "session"
                  ? "Один пилот в двух сессиях выбранного Гран-при."
                  : kind === "evolution"
                    ? "Посмотрим, как менялся темп пилота."
                    : "Сравним выбранные круги на одной дистанции."}
        </p>
        <Button
          data-slot="button"
          disabled={
            loading ||
            !catalogs[0] ||
            !drivers[0] ||
            (kind === "drivers" && mode !== "teammate" && !drivers[1]) ||
            sameSelection ||
            missingSession
          }
          onClick={() => void compare()}
        >
          <ArrowLeftRight data-icon="inline-start" />
          {loadingPhase === "catalog"
            ? "Обновляем выбор"
            : loading
              ? "Готовим сравнение"
              : "Сравнить"}
        </Button>
      </div>
    </>
  ) : null;
  const raceName = comparison
    ? (meetings.find(
        (item) => item.id === comparison.traces[0].session.meetingId,
      )?.name ?? initialMeetingName)
    : undefined;
  const comparisonSummary = comparison && !loading && (
    <div className="telemetry-summary">
      {comparison.traces.map((t, i) => {
        const parts = t.driver.name
          .toLowerCase()
          .split(" ")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
        const slug = t.driver.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        return (
          <div
            className="telemetry-competitor"
            key={t.lap.id}
            style={{ "--trace": traceColors[i] } as React.CSSProperties}
          >
            <DriverAvatarBadge
              className="telemetry-avatar"
              name={t.driver.name}
              slug={slug}
              season={t.session.season}
              fallbackLabel={t.driver.code}
              color="transparent"
              sizes="32px"
            />
            <div className="telemetry-identity">
              <span className="telemetry-team">{t.driver.team}</span>
              <h2>
                <span>{parts.slice(0, -1).join(" ")}</span> {parts.at(-1)}
              </h2>
              <div className="telemetry-lap-context">
                <span className="telemetry-trace-key">{t.driver.code}</span>
                <span>{lapLabel(t.lap)}</span>
                {t.lap.kind !== "race_average" && (
                  <span
                    className="telemetry-tyre"
                    data-compound={t.lap.compound}
                  >
                    {t.lap.compound?.slice(0, 1) ?? "?"}
                  </span>
                )}
              </div>
              {t.lap.deleted && <Badge variant="danger">Круг удалён</Badge>}
              {t.lap.status
                .filter((status) => status !== "GREEN" && status !== "UNKNOWN")
                .map((status) => (
                  <Badge key={status} variant="outline">
                    {status}
                  </Badge>
                ))}
            </div>
            <div className="telemetry-lap-time">
              <span>{sessionName(t.session.name)}</span>
              <strong>{lapTime(t.lap.time)}</strong>
              <span>{lapDetail(t.lap)}</span>
            </div>
          </div>
        );
      })}
      <div className="telemetry-final-delta">
        <span>Разница на финише</span>
        <strong>
          {deltaTime(
            (comparison.traces[0].lap.time ?? 0) -
              (comparison.traces[1].lap.time ?? 0),
          )}
          <small> с</small>
        </strong>
        <p>
          <ArrowUpRight aria-hidden="true" />
          {
            comparison.traces[
              (comparison.traces[0].lap.time ?? 0) <
              (comparison.traces[1].lap.time ?? 0)
                ? 0
                : 1
            ].driver.code
          }{" "}
          быстрее
        </p>
      </div>
    </div>
  );
  return (
    <div
      className="telemetry-hub"
      data-ready={Boolean(comparison)}
      data-view={view}
    >
      <section className="telemetry-event stitch-panel">
        <header className="telemetry-heading p-5">
          <div className="min-w-0">
            <p className="stitch-label flex items-center gap-2 text-primary">
              <Activity aria-hidden="true" className="size-3.5" />
              Телеметрия · сезон{" "}
              {comparison?.traces[0].session.season ?? season}
            </p>
            <PageTitle className="mt-2 max-w-4xl">
              {comparison
                ? raceName
                  ? formatGrandPrixNameRu(raceName)
                  : "Сравнение телеметрии"
                : "Телеметрия"}
            </PageTitle>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {comparison
                ? `${comparison.track.name} · ${comparison.traces[0].session.season} · ${comparison.traces
                    .map((t) => sessionName(t.session.name))
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .join(" / ")}`
                : "Сравнивайте круги, пилотов и сессии."}
            </p>
          </div>
          <div className="telemetry-heading-actions">
            {comparison && saved && (
              <Button data-slot="button" variant="outline" asChild>
                <Link href="/telemetry">Новое сравнение</Link>
              </Button>
            )}
            {comparison && editable && (
              <Button
                data-slot="button"
                variant="outline"
                onClick={() => setEditing(true)}
                aria-label="Изменить сравнение"
              >
                <SlidersHorizontal data-icon="inline-start" />
                <span>Изменить</span>
              </Button>
            )}
            {comparison && telemetryFlags.telemetryShare && (
              <Button
                data-slot="button"
                variant="outline"
                aria-label="Поделиться сравнением"
                onClick={() => {
                  setShare(true);
                  trackTelemetry("telemetry_share_open", savedId);
                }}
              >
                <Share2 data-icon="inline-start" />
                <span>Поделиться</span>
              </Button>
            )}
          </div>
        </header>
        {comparisonSummary}
      </section>
      {demoMode ? <aside className="flex flex-col gap-3 rounded-lg border border-primary/35 bg-primary/8 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p><strong className="font-display">Демо телеметрии.</strong> Доступен один Гран-при, прошедший два этапа назад.</p><Button asChild size="sm"><Link href="/plus#plans">Открыть все этапы</Link></Button></aside> : null}
      {!comparison && (!loading || catalogs[0]) && (
        <div className="telemetry-setup stitch-panel">{controls}</div>
      )}
      {comparison && editable && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent className="telemetry-settings-dialog">
            <DialogHeader>
              <DialogTitle>Изменить сравнение</DialogTitle>
              <DialogDescription>
                Выберите сессию, пилотов и круги.
              </DialogDescription>
            </DialogHeader>
            {controls}
          </DialogContent>
        </Dialog>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось открыть телеметрию</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              data-slot="button"
              variant="outline"
              size="sm"
              onClick={() =>
                catalogs[0]
                  ? void compare()
                  : void loadInitialBootstrap(begin()).catch(fail)
              }
            >
              Попробовать ещё раз
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loading && !editingCatalog && (
        <div role="status" className="telemetry-loading stitch-panel">
          <Cog aria-hidden="true" className="telemetry-loading-gear" />
          <div>
            <p className="telemetry-loading-title">
              {loadingPhase === "initial"
                ? telemetryBootstrapLabel[bootstrapStage]
                : "Готовим данные"}
            </p>
            <p className="telemetry-loading-description">
              Первый запуск может занять немного времени.
            </p>
          </div>
        </div>
      )}
      {comparison && (!loading || editingCatalog) && (
        <>
          <div className="telemetry-workspace-toolbar">
            <select
              className="telemetry-mobile-view"
              aria-label="Что показать"
              value={view}
              onChange={(event) => {
                setView(event.target.value);
                trackTelemetry("telemetry_chart_changed");
              }}
            >
              {views.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Tabs
              value={view}
              onValueChange={(v) => {
                setView(v);
                trackTelemetry("telemetry_chart_changed");
              }}
            >
              <TabsList
                className="telemetry-view-tabs"
                aria-label="Данные телеметрии"
              >
                {views.map(([v, label]) => (
                  <TabsTrigger value={v} key={v}>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {view !== "analysis" && (
              <div
                className="telemetry-section-control"
                role="group"
                aria-label="Участок трассы"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Предыдущий поворот"
                  disabled={!comparison.track.corners.length}
                  onClick={() => stepCorner(-1)}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Select
                  value={
                    corner != null
                      ? String(corner)
                      : range[0] === 0 && range[1] === comparison.track.length
                        ? "lap"
                        : "custom"
                  }
                  onValueChange={(value) =>
                    value === "lap"
                      ? showWholeLap()
                      : selectCorner(Number(value))
                  }
                >
                  <SelectTrigger aria-label="Выбрать участок трассы">
                    <SelectValue>
                      {corner != null
                        ? `Поворот ${corner}`
                        : range[0] === 0 && range[1] === comparison.track.length
                          ? "Весь круг"
                          : "Участок"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    align="end"
                    className="telemetry-section-menu"
                  >
                    <SelectItem value="lap">Весь круг</SelectItem>
                    {corner == null &&
                      (range[0] !== 0 ||
                        range[1] !== comparison.track.length) && (
                        <SelectItem value="custom" disabled>
                          Выбранный участок
                        </SelectItem>
                      )}
                    {comparison.track.corners.map((item) => (
                      <SelectItem key={item.number} value={String(item.number)}>
                        Поворот {item.number}
                        {item.name ? ` · ${item.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Следующий поворот"
                  disabled={!comparison.track.corners.length}
                  onClick={() => stepCorner(1)}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
          <div className="telemetry-workspace" data-view={view}>
            {channels.length > 0 && (
              <div className="telemetry-charts">
                {channels.map((channel) => (
                  <TelemetryChart
                    key={channel}
                    comparison={comparison}
                    channel={channel}
                    range={range}
                    onRange={showRange}
                    cursor={cursor}
                  />
                ))}
              </div>
            )}
            {(view === "overview" || view === "track") && (
              <TelemetryTrack
                comparison={comparison}
                cursor={cursor}
                onCorner={selectCorner}
                selectedCorner={corner}
                onSector={(index) => {
                  const bounds = [
                    0,
                    ...comparison.track.sectors,
                    comparison.track.length,
                  ];
                  showRange([bounds[index], bounds[index + 1]]);
                }}
              />
            )}
            {view === "analysis" && (
              <div className="telemetry-detail-panel">
                <Analysis comparison={comparison} />
                {view === "analysis" && comparison.evolution && (
                  <div className="telemetry-evolution">
                    <h2>Как менялось время кругов</h2>
                    <p>
                      Наблюдаемое изменение одного пилота. Шины, топливо и
                      погода также влияют на время.
                    </p>
                    <div className="telemetry-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Сессия</th>
                            <th>Круг</th>
                            <th>Время</th>
                            <th>Средняя скорость</th>
                            <th>Трасса</th>
                            <th>Шины</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.evolution.map((e) => (
                            <tr key={e.lap.id}>
                              <th>{sessionName(e.session.name)}</th>
                              <td>{e.lap.number}</td>
                              <td>{lapTime(e.lap.time)}</td>
                              <td>{number(e.metrics.averageSpeed)} км/ч</td>
                              <td>{number(e.lap.weather?.track)} °C</td>
                              <td>{e.lap.compound ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
            {view === "track" && corner != null && (
              <div className="telemetry-detail-panel">
                <Analysis comparison={comparison} corner={corner} />
              </div>
            )}
          </div>
          {channels.length > 0 && (
            <TelemetryScrubber cursor={cursor} range={range} />
          )}
        </>
      )}
      {!comparison && !loading && !error && !catalogs[0] && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Ждём телеметрию сессии</EmptyTitle>
            <EmptyDescription>
              Выберите завершённый Гран-при. Данные текущей сессии появятся
              после её окончания.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {comparison && requestConfig && (
        <TelemetryShare
          open={share}
          onOpenChange={setShare}
          config={requestConfig}
          savedId={savedId}
          onSaved={setSavedId}
          corner={corner}
          range={range}
        />
      )}
    </div>
  );
}
function TelemetryScrubber({
  cursor,
  range,
}: {
  cursor: CursorStore;
  range: [number, number];
}) {
  const distance = useSyncExternalStore(cursor.subscribe, cursor.get, () => 0);
  return (
    <div className="telemetry-scrubber">
      <label htmlFor="telemetry-cursor-range">Позиция на круге</label>
      <input
        id="telemetry-cursor-range"
        type="range"
        min={range[0]}
        max={range[1]}
        step="any"
        value={Math.max(range[0], Math.min(range[1], distance))}
        aria-valuetext={`${Math.round(distance)} метров от старта`}
        onChange={(event) => cursor.set(Number(event.target.value))}
      />
      <output htmlFor="telemetry-cursor-range">{number(distance, 0)} м</output>
    </div>
  );
}
function Analysis({
  comparison,
  corner,
}: {
  comparison: Comparison;
  corner?: number;
}) {
  const traceColors = getTraceColors(comparison);
  const selected = comparison.track.corners.find(
    (item) => item.number === corner,
  );
  if (selected) {
    const values = comparison.traces.map((trace) =>
      trace.corners.find((item) => item.number === selected.number),
    );
    const referenceTime = values[comparison.config.reference]?.time;
    const rows = [
      ["Время поворота", "time", "с"],
      ["Скорость на входе", "entry", "км/ч"],
      ["Минимальная скорость", "minimum", "км/ч"],
      ["Скорость на выходе", "exit", "км/ч"],
    ] as const;
    return (
      <section
        className="telemetry-analysis telemetry-corner-analysis"
        aria-live="polite"
      >
        <header>
          <h2>Поворот {selected.number}</h2>
          <p>
            {number(selected.start, 0)}–{number(selected.end, 0)} м от старта
          </p>
        </header>
        <div className="telemetry-table-wrap">
          <table>
            <thead>
              <tr>
                <th>На этом повороте</th>
                {comparison.traces.map((trace, index) => (
                  <th key={trace.lap.id} style={{ color: traceColors[index] }}>
                    {trace.driver.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, key, unit]) => (
                <tr key={key}>
                  <th>{label}</th>
                  {values.map((value, index) => (
                    <td key={comparison.traces[index].lap.id}>
                      {value?.[key] == null
                        ? "—"
                        : `${number(value[key], key === "time" ? 3 : 0)} ${unit}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {comparison.traces.map((trace, index) => {
          const time = values[index]?.time;
          if (
            index === comparison.config.reference ||
            time == null ||
            referenceTime == null
          )
            return null;
          const difference = time - referenceTime;
          return (
            <p className="telemetry-corner-gain" key={trace.lap.id}>
              {Math.abs(difference) < 0.0005 ? (
                "Одинаковое время на повороте"
              ) : (
                <>
                  <strong
                    style={{
                      color:
                        traceColors[
                          difference < 0 ? index : comparison.config.reference
                        ],
                    }}
                  >
                    {difference < 0
                      ? trace.driver.code
                      : comparison.traces[comparison.config.reference].driver
                          .code}{" "}
                    быстрее на {number(Math.abs(difference), 3)} с
                  </strong>
                  <span>Только на выбранном повороте</span>
                </>
              )}
            </p>
          );
        })}
      </section>
    );
  }
  return (
    <section className="telemetry-analysis">
      <h2>Разбор круга</h2>
      <div className="telemetry-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Показатель</th>
              {comparison.traces.map((t, i) => (
                <th key={t.lap.id} style={{ color: traceColors[i] }}>
                  {t.driver.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lapAnalysisRows(comparison).map((row) => (
              <tr key={row.label}>
                <th>
                  {row.label}
                  {row.description && <small>{row.description}</small>}
                </th>
                {row.values.map((value, index) => (
                  <td
                    className={
                      row.best[index] ? "telemetry-analysis-best" : undefined
                    }
                    key={comparison.traces[index].lap.id}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
            {gearAnalysisRows(comparison).map((row) => (
              <tr key={`gear-${row.gear}`}>
                <th>Передача {row.gear}</th>
                {row.values.map((value, index) => (
                  <td
                    className={
                      row.best[index] ? "telemetry-analysis-best" : undefined
                    }
                    key={comparison.traces[index].lap.id}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
