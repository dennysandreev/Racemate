"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { IntentLink as Link } from "@/components/racemate/intent-link";

type SidebarSessionStatusProps = {
  sessionName?: string | null;
  startsAtIso?: string | null;
  status?: string | null;
};

type RuntimeState = {
  label: string;
  live: boolean;
};

export function SidebarSessionStatus({
  sessionName,
  startsAtIso,
  status,
}: SidebarSessionStatusProps) {
  const [now, setNow] = useState(() => Date.now());
  const state = useMemo(
    () => getRuntimeState({ now, sessionName, startsAtIso, status }),
    [now, sessionName, startsAtIso, status],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  if (state.live) {
    return (
      <Link
        href="/live"
        aria-label="Открыть Live Hub — тайминг, трасса и радио"
        title="Тайминг, трасса и радио"
        className="mt-4 flex min-w-0 items-center gap-2 rounded-sm text-success transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />
        <span className="font-telemetry min-w-0 whitespace-nowrap text-[0.86rem] font-extrabold uppercase leading-none tracking-[0.02em]">
          LIVE
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium leading-none">
          Открыть
          <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />
        </span>
      </Link>
    );
  }

  return (
    <div className="mt-4 flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="size-2 rounded-full bg-primary shadow-[0_0_14px_rgb(225_6_0_/_0.35)]" />
      <span
        className="font-telemetry min-w-0 whitespace-nowrap text-[0.86rem] font-extrabold uppercase leading-none tracking-[0.02em] tabular-nums text-primary"
        suppressHydrationWarning
      >
        {state.label}
      </span>
    </div>
  );
}

function getRuntimeState({
  now,
  sessionName,
  startsAtIso,
  status,
}: SidebarSessionStatusProps & { now: number }): RuntimeState {
  if (!startsAtIso) {
    return {
      label: status || "Расписание уточняется",
      live: status === "Live",
    };
  }

  const startMs = new Date(startsAtIso).getTime();

  if (!Number.isFinite(startMs)) {
    return {
      label: status || "Расписание уточняется",
      live: status === "Live",
    };
  }

  const normalizedStatus = (status ?? "").toLowerCase();
  const isCompleted = normalizedStatus === "завершен" || normalizedStatus === "завершена";

  if (now < startMs) {
    return {
      label: formatCountdown(startMs - now),
      live: false,
    };
  }

  if (!isCompleted && now < startMs + getSessionDurationMs(sessionName)) {
    return {
      label: "Live сейчас",
      live: true,
    };
  }

  return {
    label: "Сессия завершена",
    live: false,
  };
}

function getSessionDurationMs(sessionName?: string | null) {
  const normalizedName = (sessionName ?? "").toLowerCase();

  if (normalizedName.includes("гонка") || normalizedName.includes("race")) {
    return 3 * 60 * 60 * 1000;
  }

  if (normalizedName.includes("спринт") || normalizedName.includes("sprint")) {
    return 75 * 60 * 1000;
  }

  return 90 * 60 * 1000;
}

function formatCountdown(diffMs: number) {
  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `Через ${days} дн. ${hours} ч` : `Через ${days} дн.`;
  }

  if (hours > 0) {
    return minutes > 0 ? `Через ${hours} ч ${minutes} мин` : `Через ${hours} ч`;
  }

  return `Через ${minutes} мин`;
}
