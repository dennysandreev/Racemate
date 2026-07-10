import Link from "next/link";
import { CalendarClock, ChevronRight, Trophy } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { DriverAvatarBadge } from "@/components/racemate/driver-avatar-badge";
import { cn } from "@/lib/utils";
import {
  getCalendarEvents,
  getConstructorChampionshipMatrix,
  getDriverChampionshipMatrix,
  getStandingsMeta,
} from "@/data/racemate-repository";
import type { ChampionshipRound } from "@/types/racemate";

export const dynamic = "force-dynamic";

type StandingEntry = {
  position: number;
  name: string;
  href?: string;
  driverSlug?: string;
  subtitle?: string;
  teamName: string;
  teamCode?: string;
  teamLogo?: string;
  teamColor?: string;
  points: number;
  wins: number;
  podiums: number;
  pointsByRound: Record<number, number>;
  podiumByRound?: Record<number, "winner" | "second" | "third">;
};

const podiumTone: Record<number, { badge: string; label: string }> = {
  1: { badge: "bg-[#f4c95d] text-[#211a05]", label: "Лидер чемпионата" },
  2: { badge: "bg-[#cbd5e1] text-[#111827]", label: "Второе место" },
  3: { badge: "bg-[#d48a5f] text-[#2a1608]", label: "Третье место" },
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>;
}) {
  const { table } = await searchParams;
  const activeTable = table === "constructors" ? "constructors" : "drivers";
  const [drivers, constructors, driverMeta, calendar] = await Promise.all([
    getDriverChampionshipMatrix(),
    getConstructorChampionshipMatrix(),
    getStandingsMeta("driver_standings"),
    getCalendarEvents(),
  ]);

  const rounds = activeTable === "drivers" ? drivers.rounds : constructors.rounds;
  const entries = activeTable === "drivers"
    ? drivers.rows.map((row): StandingEntry => ({
        driverSlug: row.driverSlug,
        href: row.driverSlug ? `/drivers/${row.driverSlug}` : undefined,
        name: row.driver,
        podiumByRound: row.podiumByRound,
        podiums: Object.keys(row.podiumByRound).length,
        points: row.total,
        pointsByRound: row.pointsByRound,
        position: row.position,
        subtitle: row.team,
        teamCode: row.teamCode,
        teamColor: row.teamColor,
        teamLogo: row.teamLogo,
        teamName: row.team,
        wins: Object.values(row.podiumByRound).filter((finish) => finish === "winner").length,
      }))
    : constructors.rows.map((row): StandingEntry => ({
        name: row.team,
        podiums: 0,
        points: row.points,
        pointsByRound: row.pointsByRound ?? {},
        position: row.position,
        teamCode: row.teamCode,
        teamColor: row.teamColor,
        teamLogo: row.teamLogo,
        teamName: row.team,
        wins: row.wins,
      }));

  const leaderPoints = Math.max(entries[0]?.points ?? 0, 1);
  const roundMaxPoints = buildRoundMaxPoints(rounds, entries);
  const podium = entries.filter((entry) => entry.position >= 1 && entry.position <= 3);
  const season = driverMeta?.season ?? new Date().getUTCFullYear();
  const seasonRaces = calendar.filter((event) => event.season === season);
  const totalRounds = seasonRaces.length || null;
  const completedRounds = rounds.length;
  const lastRound = rounds[rounds.length - 1] ?? null;
  const nextRace = totalRounds
    ? seasonRaces.find((event) => event.round === completedRounds + 1) ?? null
    : null;

  return (
    <AppShell>
      <section className="grid gap-4 py-6 sm:gap-5 sm:py-8">
        <section className="stitch-panel p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <p className="stitch-label flex items-center gap-2 text-primary">
                <Trophy aria-hidden="true" className="size-3.5" />
                Чемпионат · сезон {season}
              </p>
              <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:text-3xl">
                {activeTable === "drivers" ? "Личный зачет" : "Кубок конструкторов"}
              </h1>
              <p className="mt-1.5 max-w-xl text-sm font-semibold text-muted-foreground">
                Таблица обновляется после финиша каждого гран-при
                {lastRound ? ` — последним учтен этап ${lastRound.flag} ${lastRound.raceName}` : ""}.
              </p>
            </div>
            <div className="w-full max-w-full sm:w-64">
              <div className="flex items-baseline justify-between gap-3">
                <span className="stitch-label text-[0.6rem] text-muted-foreground">Пройдено этапов</span>
                <span className="font-telemetry text-sm font-extrabold">
                  {completedRounds}
                  {totalRounds ? <span className="text-muted-foreground"> / {totalRounds}</span> : null}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/60">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${totalRounds ? Math.round((completedRounds / totalRounds) * 100) : 0}%`,
                  }}
                />
              </div>
              {nextRace ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">
                    Следующий: {nextRace.countryFlag} {nextRace.race} · {nextRace.date}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <nav aria-label="Тип зачета" className="mt-5 grid grid-cols-2 gap-1 rounded-md border border-border/70 bg-background/45 p-1 sm:inline-flex">
            <TableTab active={activeTable === "drivers"} href="/leaderboard">
              Пилоты
            </TableTab>
            <TableTab active={activeTable === "constructors"} href="/leaderboard?table=constructors">
              Конструкторы
            </TableTab>
          </nav>
        </section>

        {podium.length === 3 ? (
          <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
            {[podium[1], podium[0], podium[2]].map((entry) => (
              <PodiumCard
                entry={entry}
                isChampionLeader={entry.position === 1}
                key={entry.position}
                showAvatar={activeTable === "drivers"}
              />
            ))}
          </div>
        ) : null}

        <section className="stitch-panel overflow-hidden p-0">
          <div className="hidden items-center gap-3 border-b stitch-divider px-4 py-2.5 lg:grid lg:grid-cols-[2.2rem_2.75rem_minmax(13rem,1fr)_minmax(0,auto)_5.5rem]">
            <span className="stitch-label text-[0.6rem] text-muted-foreground">#</span>
            <span />
            <span className="stitch-label text-[0.6rem] text-muted-foreground">
              {activeTable === "drivers" ? "Пилот" : "Команда"}
            </span>
            <span className="stitch-label justify-self-end text-[0.6rem] text-muted-foreground">
              Этапы сезона
            </span>
            <span className="stitch-label justify-self-end text-[0.6rem] text-muted-foreground">Очки</span>
          </div>
          <ol>
            {entries.map((entry) => (
              <StandingRow
                entry={entry}
                key={`${entry.position}-${entry.name}`}
                leaderPoints={leaderPoints}
                roundMaxPoints={roundMaxPoints}
                rounds={rounds}
                showAvatar={activeTable === "drivers"}
              />
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t stitch-divider px-4 py-3">
            <LegendSwatch className="bg-[#f4c95d]" label="Победа" />
            <LegendSwatch className="bg-[#cbd5e1]" label="2-е место" />
            <LegendSwatch className="bg-[#d48a5f]" label="3-е место" />
            <LegendSwatch className="bg-primary/60" label="В очках" />
            <LegendSwatch className="bg-secondary" label="Без очков" />
            <span className="text-[0.62rem] font-semibold text-muted-foreground">
              Наведите на клетку этапа, чтобы увидеть гонку и очки
            </span>
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function TableTab({ active, children, href }: { active: boolean; children: React.ReactNode; href: string }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-sm px-4 py-2 font-display text-sm font-bold leading-none transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      href={href}
      prefetch={false}
    >
      {children}
    </Link>
  );
}

function PodiumCard({
  entry,
  isChampionLeader,
  showAvatar,
}: {
  entry: StandingEntry;
  isChampionLeader: boolean;
  showAvatar: boolean;
}) {
  const tone = podiumTone[entry.position] ?? podiumTone[3];

  return (
    <article
      className={cn(
        "stitch-panel relative grid justify-items-center gap-1.5 px-2 pb-3 pt-6 text-center sm:gap-2 sm:px-4 sm:pb-5 sm:pt-8",
        isChampionLeader ? "border-primary/45 ring-1 ring-primary/25" : "mt-3 sm:mt-6",
      )}
    >
      <span
        aria-label={tone.label}
        className={cn(
          "absolute -top-3 left-1/2 grid size-7 -translate-x-1/2 place-items-center rounded-full font-display text-sm font-extrabold shadow-lg sm:-top-3.5 sm:size-8",
          tone.badge,
        )}
      >
        {entry.position}
      </span>
      {showAvatar ? (
        <DriverAvatarBadge
          className="size-14 sm:size-20"
          color={entry.teamColor}
          name={entry.name}
          sizes="(min-width: 640px) 5rem, 3.5rem"
          slug={entry.driverSlug}
        />
      ) : (
        <TeamMark className="size-14 sm:size-20" entry={entry} />
      )}
      <div className="w-full min-w-0">
        {entry.href ? (
          <Link
            className="block max-w-full truncate font-display text-sm font-extrabold leading-tight hover:text-primary sm:text-lg"
            href={entry.href}
            prefetch={false}
          >
            {entry.name}
          </Link>
        ) : (
          <p className="max-w-full truncate font-display text-sm font-extrabold leading-tight sm:text-lg">{entry.name}</p>
        )}
        {entry.subtitle ? (
          <p className="mt-0.5 flex min-w-0 items-center justify-center gap-1.5 text-[0.65rem] font-semibold text-muted-foreground sm:text-xs">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.teamColor ?? "var(--border)" }}
            />
            <span className="truncate">{entry.subtitle}</span>
          </p>
        ) : null}
      </div>
      <p className="font-telemetry text-xl font-extrabold leading-none sm:text-3xl">
        {formatPoints(entry.points)}
        <span className="ml-1 text-[0.6rem] font-bold text-muted-foreground sm:text-xs">очк.</span>
      </p>
      {entry.wins > 0 || entry.podiums > 0 ? (
        <div className="hidden flex-wrap items-center justify-center gap-1.5 sm:flex">
          {entry.wins > 0 ? <StatChip label="Победы" value={entry.wins} /> : null}
          {entry.podiums > 0 ? <StatChip label="Подиумы" value={entry.podiums} /> : null}
        </div>
      ) : null}
    </article>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded border border-border/70 bg-secondary/30 px-1.5 py-0.5">
      <span className="font-telemetry text-[0.7rem] font-extrabold">{value}</span>
      <span className="text-[0.58rem] font-semibold text-muted-foreground">{label}</span>
    </span>
  );
}

function StandingRow({
  entry,
  leaderPoints,
  roundMaxPoints,
  rounds,
  showAvatar,
}: {
  entry: StandingEntry;
  leaderPoints: number;
  roundMaxPoints: Record<number, number>;
  rounds: ChampionshipRound[];
  showAvatar: boolean;
}) {
  const gap = leaderPoints - entry.points;

  return (
    <li className="grid grid-cols-[1.8rem_2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t stitch-divider px-3 py-2.5 transition-colors hover:bg-accent/40 sm:px-4 lg:grid-cols-[2.2rem_2.75rem_minmax(13rem,1fr)_minmax(0,auto)_5.5rem]">
      <span
        className={cn(
          "font-telemetry text-sm font-extrabold",
          entry.position === 1 && "text-[#f4c95d]",
          entry.position === 2 && "text-[#cbd5e1]",
          entry.position === 3 && "text-[#d48a5f]",
          entry.position > 3 && "text-muted-foreground",
        )}
      >
        {entry.position}
      </span>
      {showAvatar ? (
        <DriverAvatarBadge
          className="size-10"
          color={entry.teamColor}
          name={entry.name}
          sizes="2.5rem"
          slug={entry.driverSlug}
        />
      ) : (
        <TeamMark className="size-10" entry={entry} />
      )}
      <div className="min-w-0">
        {entry.href ? (
          <Link
            className="group inline-flex max-w-full items-center gap-1 truncate text-sm font-bold hover:text-primary"
            href={entry.href}
            prefetch={false}
          >
            <span className="truncate">{entry.name}</span>
            <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </Link>
        ) : (
          <p className="truncate text-sm font-bold">{entry.name}</p>
        )}
        {entry.subtitle ? (
          <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{entry.subtitle}</p>
        ) : null}
        <div aria-hidden="true" className="mt-1.5 h-1 max-w-56 overflow-hidden rounded-full bg-secondary/50">
          <div
            className="h-full rounded-full"
            style={{
              backgroundColor: entry.teamColor ?? "var(--primary)",
              width: `${Math.max(2, Math.round((entry.points / leaderPoints) * 100))}%`,
            }}
          />
        </div>
      </div>
      <div className="order-last col-span-full lg:order-none lg:col-span-1 lg:justify-self-end">
        <RoundStrip entry={entry} roundMaxPoints={roundMaxPoints} rounds={rounds} />
      </div>
      <div className="text-right">
        <p className="font-telemetry text-base font-extrabold leading-none">{formatPoints(entry.points)}</p>
        <p className="mt-1 text-[0.65rem] font-semibold text-muted-foreground">
          {entry.position === 1 ? `${entry.wins} побед${pluralWinsSuffix(entry.wins)}` : `−${formatPoints(gap)}`}
        </p>
      </div>
    </li>
  );
}

/*
 * Лента этапов: по клетке на каждый завершенный гран-при — новые гонки
 * добавляются в конец по мере финиша. Цвет: подиум, очки или ноль.
 */
function RoundStrip({
  entry,
  roundMaxPoints,
  rounds,
}: {
  entry: StandingEntry;
  roundMaxPoints: Record<number, number>;
  rounds: ChampionshipRound[];
}) {
  return (
    <div className="flex max-w-full flex-wrap items-center gap-[3px]">
      {rounds.map((round) => {
        const points = entry.pointsByRound[round.round];
        const podium = entry.podiumByRound?.[round.round];
        const roundMax = Math.max(roundMaxPoints[round.round] ?? 0, 1);
        const title = `${round.flag} ${round.raceName} · ${
          typeof points === "number" ? `${formatPoints(points)} очк.` : "нет данных"
        }${podium ? ` · ${podiumTitle(podium)}` : ""}`;

        let style: React.CSSProperties | undefined;
        let className = "bg-secondary/80";

        if (podium === "winner") {
          className = "bg-[#f4c95d]";
        } else if (podium === "second") {
          className = "bg-[#cbd5e1]";
        } else if (podium === "third") {
          className = "bg-[#d48a5f]";
        } else if (typeof points === "number" && points > 0) {
          className = "";
          style = {
            backgroundColor: "var(--primary)",
            opacity: 0.3 + 0.55 * Math.min(points / roundMax, 1),
          };
        } else if (typeof points !== "number") {
          className = "border border-border/60 bg-transparent";
        }

        return (
          <span
            className={cn("size-2.5 rounded-[3px] sm:size-3", className)}
            key={round.round}
            style={style}
            title={title}
          />
        );
      })}
    </div>
  );
}

function TeamMark({ className, entry }: { className?: string; entry: StandingEntry }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-[oklch(0.21_0.014_250)] p-1.5",
        className,
      )}
      style={{ borderColor: entry.teamColor ?? "var(--border)" }}
      title={entry.teamName}
    >
      {entry.teamLogo ? (
        <span
          className="block h-full w-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${entry.teamLogo})` }}
        />
      ) : (
        <span className="font-display text-xs font-bold text-muted-foreground">
          {entry.teamCode ?? entry.teamName.slice(0, 3).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-2.5 rounded-[3px]", className)} />
      <span className="text-[0.62rem] font-semibold text-muted-foreground">{label}</span>
    </span>
  );
}

function buildRoundMaxPoints(rounds: ChampionshipRound[], entries: StandingEntry[]) {
  const maxByRound: Record<number, number> = {};

  for (const round of rounds) {
    let max = 0;

    for (const entry of entries) {
      const points = entry.pointsByRound[round.round];

      if (typeof points === "number" && points > max) {
        max = points;
      }
    }

    maxByRound[round.round] = max;
  }

  return maxByRound;
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function pluralWinsSuffix(wins: number) {
  const mod10 = wins % 10;
  const mod100 = wins % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "а";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "ы";
  }

  return "";
}

function podiumTitle(finish: "winner" | "second" | "third") {
  if (finish === "winner") {
    return "победа";
  }

  return finish === "second" ? "2-е место" : "3-е место";
}
