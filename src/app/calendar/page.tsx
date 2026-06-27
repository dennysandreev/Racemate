import Image from "next/image";
import Link from "next/link";
import { Trophy } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { RaceFlag } from "@/components/racemate/race-flag";
import { StitchStatusBadge } from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { getCircuitAsset } from "@/data/f1-assets";
import { getCalendarEvents } from "@/data/racemate-repository";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/racemate";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const calendarEvents = await getCalendarEvents();
  const completedCount = calendarEvents.filter((event) => event.status === "Завершен").length;
  const remainingCount = Math.max(0, calendarEvents.length - completedCount);
  const season = calendarEvents[0]?.season ?? 2026;
  const progressPercent = calendarEvents.length
    ? Math.round((completedCount / calendarEvents.length) * 100)
    : 0;

  return (
    <AppShell>
      <section className="relative overflow-hidden rounded-xl border border-border bg-card">
        <CalendarHero season={season} />
      </section>

      <section className="grid gap-5 py-5 pb-8">
        <div className="stitch-panel grid gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="stitch-label text-muted-foreground">Прогресс сезона</p>
              <p className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em]">
                {progressPercent}% пройдено
              </p>
            </div>
            <p className="font-telemetry text-sm font-bold text-muted-foreground">
              {completedCount} / {calendarEvents.length} Гран-при
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {completedCount} завершено, {remainingCount} впереди
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {calendarEvents.map((event) => (
            <CalendarRaceCard event={event} key={`${event.season}-${event.round}`} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function CalendarHero({
  season,
}: {
  season: number;
}) {
  return (
    <div className="relative min-h-[10.5rem] p-4 sm:p-5">
      <Image
        alt=""
        className="object-cover opacity-80"
        fill
        priority
        sizes="(max-width: 768px) 100vw, 72rem"
        src="/stitch/calendar-season-hero-v2.webp"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/72 to-background/10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgb(225_6_0_/_0.28),transparent_20rem)]" />
      <div className="relative z-10 flex min-h-[8rem] flex-col justify-end">
        <h1 className="font-display max-w-4xl text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
          Календарь сезона
        </h1>
        <div className="mt-3 flex items-center gap-3">
          <Badge variant="danger">Сезон {season}</Badge>
          <div className="h-px flex-1 bg-border" />
        </div>
      </div>
    </div>
  );
}

function CalendarRaceCard({ event }: { event: CalendarEvent }) {
  const href = event.status === "Текущий этап" ? "/weekend" : event.href;
  const asset = getCircuitAsset(event.circuit || event.country);
  const isCurrent = event.status === "Текущий этап";
  const isCompleted = event.status === "Завершен";

  return (
    <Link
      className={cn(
        "group block overflow-hidden rounded-xl border border-border bg-card transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isCurrent && "border-primary/70 bg-primary/10",
      )}
      href={href}
      prefetch={false}
    >
      <div className="relative h-32 bg-surface-muted">
        {asset ? (
          <Image
            alt={`Схема трассы ${event.circuit}`}
            className={cn(
              "object-contain p-4 transition-all duration-500 group-hover:scale-105",
              !isCurrent && "grayscale group-hover:grayscale-0",
            )}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 20rem"
            src={asset.src}
          />
        ) : (
          <div className="grid h-full place-items-center font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Coming soon
          </div>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-sm border border-border bg-background/80 px-2 py-1 backdrop-blur">
          <RaceFlag countryCode={event.countryCode} label={event.country} value={event.countryFlag} />
          <span className="font-telemetry text-[0.65rem] font-bold uppercase tracking-[0.1em]">
            Раунд {event.round}
          </span>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        <div>
          <p className="font-telemetry text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {event.date}
          </p>
          <h3 className="mt-2 min-h-10 text-balance font-display text-base font-bold leading-tight">
            {event.race}
          </h3>
          <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
            {event.circuit}, {event.country}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <StitchStatusBadge tone={isCurrent ? "red" : isCompleted ? "neutral" : "warning"}>
            {event.status}
          </StitchStatusBadge>
          {isCompleted && event.winner ? (
            <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">
              <Trophy aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{event.winner}</span>
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
