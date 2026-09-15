"use client";

import { ArrowRight, Gauge, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { HomeSessionStrip } from "@/components/racemate/home-session-strip";
import { RaceFlag } from "@/components/racemate/race-flag";
import { SeasonGlobeSceneLazy } from "@/components/racemate/season-globe/season-globe-scene-lazy";
import type { SessionWithResults } from "@/components/racemate/session-results-dialog";
import { TrackMap } from "@/components/racemate/track-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSessionName } from "@/lib/session-display";
import {
  formatSeasonGlobeCountdownLabel,
  formatSeasonGlobeDateTimeLabel,
} from "@/lib/season-globe-data";
import type {
  NextSession,
  RaceDetail,
  SeasonGlobeData,
  SeasonGlobeEvent,
  TrackLayout,
} from "@/types/racemate";

type SeasonGlobeExplorerProps = {
  currentRace: RaceDetail | null;
  data: SeasonGlobeData;
  fallbackTrack: {
    assetSrc: string | null;
    circuit: string;
    layout: TrackLayout | null;
  };
  initialSessions: SessionWithResults[];
  initialSessionsRound: number | null;
  nextSession: NextSession;
};

type SessionStripState = {
  items: SessionWithResults[];
  round: number | null;
  status: "error" | "loading" | "ready";
};

export function SeasonGlobeExplorer({
  currentRace,
  data,
  fallbackTrack,
  initialSessions,
  initialSessionsRound,
  nextSession,
}: SeasonGlobeExplorerProps) {
  const router = useRouter();
  const defaultEvent = useMemo(
    () =>
      data.events.find((event) => event.round === data.nextRound) ??
      data.events[0] ??
      null,
    [data.events, data.nextRound],
  );
  const [selectedRound, setSelectedRound] = useState<number | null>(
    defaultEvent?.round ?? null,
  );
  const sessionCacheRef = useRef(
    new Map<number, SessionWithResults[]>(
      initialSessionsRound === null || !initialSessions.length
        ? []
        : [[initialSessionsRound, initialSessions]],
    ),
  );
  const [sessionLoadRevision, setSessionLoadRevision] = useState(0);
  const [countdownNow, setCountdownNow] = useState<number | null>(null);
  const [sessionStrip, setSessionStrip] = useState<SessionStripState>({
    items: initialSessions,
    round: initialSessionsRound,
    status: initialSessions.length ? "ready" : "loading",
  });
  const selectedEvent =
    data.events.find((event) => event.round === selectedRound) ?? defaultEvent;
  const selectedEventCountdown = formatSeasonGlobeCountdownLabel(
    selectedEvent?.weekendStartAtIso ?? null,
    countdownNow,
  );
  const drawableEvents = data.events.filter(
    (event) => event.latitude !== null && event.longitude !== null,
  );
  const fallback = (
    <TrackMap
      assetSrc={fallbackTrack.assetSrc}
      circuit={fallbackTrack.circuit}
      compact
      fill
      layout={fallbackTrack.layout}
      unframed
    />
  );

  useEffect(() => {
    const updateCountdown = () => setCountdownNow(Date.now());

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const round = selectedEvent?.round;

    if (!round) {
      return;
    }

    const cachedSessions = sessionCacheRef.current.get(round);

    if (cachedSessions) {
      setSessionStrip({ items: cachedSessions, round, status: "ready" });
      return;
    }

    const controller = new AbortController();

    setSessionStrip({ items: [], round, status: "loading" });

    void fetch(`/api/grand-prix/${data.season}/${round}/sessions`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Session request failed with ${response.status}`);
        }

        return response.json() as Promise<{ sessions: SessionWithResults[] }>;
      })
      .then((payload) => {
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];

        sessionCacheRef.current.set(round, sessions);
        setSessionStrip({ items: sessions, round, status: "ready" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSessionStrip({ items: [], round, status: "error" });
      });

    return () => controller.abort();
  }, [data.season, selectedEvent?.round, sessionLoadRevision]);

  const selectedSessionsAreLoading =
    sessionStrip.round !== selectedEvent?.round || sessionStrip.status === "loading";
  const activeSessionName =
    selectedEvent?.round === initialSessionsRound
      ? nextSession.session
      : sessionStrip.items.find((item) => item.session.status === "Live")?.session.name ?? "";

  const selectRelative = (offset: number) => {
    if (!data.events.length) {
      return;
    }

    const currentIndex = Math.max(
      0,
      data.events.findIndex((event) => event.round === selectedEvent?.round),
    );
    const nextIndex = (currentIndex + offset + data.events.length) % data.events.length;
    setSelectedRound(data.events[nextIndex].round);
  };
  const openSelected = () => {
    if (selectedEvent) {
      router.push(getEventAction(selectedEvent).href);
    }
  };

  return (
    <>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <p className="font-telemetry flex min-w-0 items-center gap-2 text-[0.66rem] font-bold uppercase tracking-[0.08em] text-primary sm:text-xs sm:tracking-[0.12em]">
          <Gauge aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{getStageLabel(selectedEvent)}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={getStageBadgeVariant(selectedEvent, nextSession.status)}>
            {getStageStatus(selectedEvent, nextSession.status, selectedEventCountdown)}
          </Badge>
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="h-3 w-px bg-primary/70" aria-hidden="true" />
            Сезон <span className="font-telemetry font-bold text-foreground">{data.season}</span>
          </span>
        </div>
      </header>

      <div className="grid min-w-0 lg:grid-cols-[minmax(16rem,0.82fr)_minmax(0,1.18fr)]">
        <StageDetails
          currentRace={currentRace}
          event={selectedEvent}
          nextSession={nextSession}
        />

        <div className="relative order-2 h-[14rem] min-w-0 px-2 py-2 sm:h-[17rem] sm:px-4 lg:col-start-2 lg:row-start-1 lg:z-10 lg:h-auto lg:min-h-[21rem] lg:px-3 lg:py-2">
          {selectedEvent && drawableEvents.length ? (
            <SeasonGlobeSceneLazy
              events={data.events}
              fallback={fallback}
              onOpenSelected={openSelected}
              onSelectNext={() => setSelectedRound(data.nextRound ?? defaultEvent?.round ?? null)}
              onSelectRelative={selectRelative}
              onSelectRound={setSelectedRound}
              season={data.season}
              selectedRound={selectedEvent.round}
            />
          ) : (
            fallback
          )}
        </div>
      </div>

      <div className="min-w-0 border-t border-border/70 px-4 pb-4 sm:px-6 lg:px-4">
        {selectedSessionsAreLoading ? (
          <SessionStripSkeleton />
        ) : sessionStrip.status === "error" ? (
          <div className="flex min-h-32 items-center justify-between gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Не удалось загрузить сессии этого этапа.
            </p>
            <Button
              onClick={() => setSessionLoadRevision((revision) => revision + 1)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Повторить
            </Button>
          </div>
        ) : sessionStrip.items.length ? (
          <HomeSessionStrip
            activeSessionName={activeSessionName}
            embedded
            sessions={sessionStrip.items}
          />
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            Сессии этого этапа пока недоступны.
          </p>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {selectedEvent
          ? `Раунд ${selectedEvent.round} из ${data.events.length}. ${selectedEvent.raceName}. ${getAccessiblePhase(selectedEvent)}.`
          : "Маршрут сезона пока недоступен."}
      </p>
    </>
  );
}

function SessionStripSkeleton() {
  return (
    <div
      aria-label="Загружаем сессии выбранного этапа"
      className="mt-4 flex gap-2 overflow-hidden pb-1 sm:grid sm:grid-cols-5 sm:gap-3"
      role="status"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          className="min-h-[7rem] w-[9.25rem] shrink-0 animate-pulse rounded-md border border-border/70 bg-muted/25 sm:min-h-[8.5rem] sm:w-auto"
          key={index}
        />
      ))}
    </div>
  );
}

function StageDetails({
  currentRace,
  event,
  nextSession,
}: {
  currentRace: RaceDetail | null;
  event: SeasonGlobeEvent | null;
  nextSession: NextSession;
}) {
  const raceName = event?.raceName ?? nextSession.race;
  const circuitName = event?.circuitName ?? nextSession.circuit;
  const country = event?.country ?? currentRace?.country ?? nextSession.race;
  const action = event ? getEventAction(event) : { href: "/weekend", label: "Перейти к этапу" };
  const raceCompletionLabel = event
    ? formatSeasonGlobeDateTimeLabel(event.raceEndAtIso)
    : null;
  const raceStartLabel = event
    ? formatSeasonGlobeDateTimeLabel(event.raceStartAtIso)
    : null;
  const raceTitleLength = Array.from(raceName).length;
  const raceTitleSizeClass =
    raceTitleLength > 32
      ? "text-[1.55rem] sm:text-[1.85rem] lg:text-[1.95rem]"
      : raceTitleLength > 22
        ? "text-[1.7rem] sm:text-[2rem] lg:text-[2.15rem]"
        : "text-3xl sm:text-4xl lg:text-[2.55rem]";

  return (
    <div
      className="season-globe-details order-1 min-w-0 px-4 pb-5 pt-5 sm:px-6 sm:pt-6 lg:col-start-1 lg:row-start-1 lg:min-h-[21rem] lg:pb-6"
      key={event?.round ?? "fallback"}
    >
      <div className="grid gap-3">
        <div className="flex items-center gap-2 font-telemetry text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          <RaceFlag
            className="h-4 w-6"
            countryCode={event?.countryCode ?? currentRace?.countryCode}
            label={country}
            value={event ? undefined : currentRace?.countryFlag}
          />
          <span>Раунд {event?.round ?? currentRace?.round ?? "-"}</span>
        </div>
        <h2
          className={`max-w-3xl text-balance font-display font-extrabold leading-[1.04] ${raceTitleSizeClass}`}
          id="next-race-title"
        >
          {raceName}
        </h2>
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-muted-foreground sm:text-base">
          <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span
            className="min-w-0 break-words lg:whitespace-nowrap"
            data-season-globe-circuit-name
          >
            {circuitName}
          </span>
        </p>
      </div>

      <div className="mt-5 border-t border-border/70 pt-4">
        {event?.phase === "completed" ? (
          <div>
            <p className="font-telemetry text-[0.64rem] font-bold uppercase tracking-[0.1em] text-primary">
              Уикенд {event.weekendDateLabel}
            </p>
            <div className="mt-1.5 grid gap-0.5">
              <p className="text-sm font-bold text-foreground">Гонка завершилась</p>
              <p className="text-xs text-muted-foreground">
                {raceCompletionLabel ?? event.raceDateLabel}
              </p>
            </div>
          </div>
        ) : event?.phase === "upcoming" ? (
          <div>
            <p className="font-telemetry text-[0.64rem] font-bold uppercase tracking-[0.1em] text-primary">
              Уикенд {event.weekendDateLabel}
            </p>
            <div className="mt-1.5 grid gap-0.5">
              <p className="text-sm font-bold text-foreground">Гонка</p>
              <p className="text-xs text-muted-foreground">
                {raceStartLabel ?? event.raceDateLabel}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-telemetry text-[0.64rem] font-bold uppercase tracking-[0.1em] text-primary">
              Следующая сессия
            </p>
            <div className="mt-1.5 grid gap-0.5">
              <p className="text-sm font-bold text-foreground">
                {formatSessionName(nextSession.session)}
              </p>
              <p className="text-xs text-muted-foreground">{nextSession.startsAt}</p>
            </div>
          </div>
        )}

        <Button asChild className="mt-5 w-full" variant="secondary">
          <Link href={action.href} prefetch={false}>
            {action.label}
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function getStageLabel(event: SeasonGlobeEvent | null) {
  if (event?.phase === "completed") {
    return "Прошедший этап";
  }

  if (event?.phase === "upcoming") {
    return "Будущий этап";
  }

  return "Следующий этап";
}

function getStageStatus(
  event: SeasonGlobeEvent | null,
  nextStatus: string,
  eventCountdown: string | null,
) {
  if (event?.phase === "completed") {
    return "Завершен";
  }

  if (event?.phase === "upcoming") {
    return eventCountdown ?? "Скоро";
  }

  return nextStatus;
}

function getStageBadgeVariant(
  event: SeasonGlobeEvent | null,
  nextStatus: string,
): "outline" | "success" | "warning" {
  if (event?.phase === "completed") {
    return "outline";
  }

  return event?.isLive || nextStatus === "Live" ? "success" : "warning";
}

function getEventAction(event: SeasonGlobeEvent) {
  if (event.phase === "completed") {
    return { href: event.href, label: "Открыть итоги" };
  }

  if (event.phase === "next") {
    return { href: "/weekend", label: "Перейти к этапу" };
  }

  return { href: event.href, label: "Открыть этап" };
}

function getAccessiblePhase(event: SeasonGlobeEvent) {
  if (event.phase === "completed") {
    return "Этап завершен";
  }

  if (event.phase === "next") {
    return "Следующий этап";
  }

  return "Этап еще не прошел";
}
