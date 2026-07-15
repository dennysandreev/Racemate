import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Gauge,
  Newspaper,
  Radio,
  Trophy,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { DriverAvatarBadge } from "@/components/racemate/driver-avatar-badge";
import { RaceFlag } from "@/components/racemate/race-flag";
import { TeamCumulativePointsChart } from "@/components/racemate/team-cumulative-points-chart";
import { TeamLogo } from "@/components/racemate/team-logo";
import { StitchPanel, StitchPanelHeader } from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTeamProfileBySlug } from "@/data/racemate-repository";
import { cn } from "@/lib/utils";
import type { TeamProfile, TeamRaceResultRow } from "@/types/racemate";

export const dynamic = "force-dynamic";

type TeamPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TeamPageProps): Promise<Metadata> {
  const { slug } = await params;
  const team = await getTeamProfileBySlug(slug);

  if (!team) {
    return { title: "Команда не найдена · RaceMate" };
  }

  return {
    title: `${team.shortName} · RaceMate`,
    description: `${team.shortName}: состав, статистика сезона ${team.season}, результаты по этапам и новости команды.`,
  };
}

export default async function TeamProfilePage({ params }: TeamPageProps) {
  const { slug } = await params;
  const team = await getTeamProfileBySlug(slug);

  if (!team) {
    notFound();
  }

  return (
    <AppShell>
      <div className="grid min-w-0 gap-5 pb-6 sm:gap-6 sm:pb-8">
        <TeamHero team={team} />

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <DriverLineup team={team} />
          <TeamForm team={team} />
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-stretch">
          <TeamCumulativePointsChart team={team} />
          <TeamSeasonStats team={team} />
        </section>
        <TeamResultsTable drivers={team.drivers} results={team.results} />
        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-stretch">
          <TeamNews team={team} />
          <TeamSocial team={team} />
        </section>
      </div>
    </AppShell>
  );
}

function TeamHero({ team }: { team: TeamProfile }) {
  return (
    <section
      className="relative min-h-[31rem] overflow-hidden rounded-xl border border-border bg-card sm:min-h-[35rem]"
      style={{
        backgroundImage: `radial-gradient(circle at 68% 38%, color-mix(in srgb, ${team.color} 24%, transparent), transparent 42%)`,
      }}
    >
      <div className="pointer-events-none absolute inset-x-3 top-16 h-[15rem] sm:inset-x-8 sm:top-14 sm:h-[22rem]">
        <Image
          alt={`Болид ${team.shortName} сезона ${team.season}`}
          className="object-contain object-center drop-shadow-[0_16px_14px_rgb(0_0_0_/_0.3)]"
          fill
          priority
          sizes="(min-width: 1280px) 75rem, 100vw"
          src={team.carImageUrl}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: team.color }}
      />

      <div className="relative flex min-h-[31rem] flex-col justify-between p-5 text-foreground sm:min-h-[35rem] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild size="sm" variant="secondary">
            <Link href="/teams" prefetch={false}>
              <ArrowLeft aria-hidden="true" data-icon="inline-start" />
              Все команды
            </Link>
          </Button>
          <Badge className="border-border bg-background/75 text-foreground backdrop-blur-sm" variant="outline">
            Сезон {team.season}
          </Badge>
        </div>

        <div className="max-w-2xl">
          <div className="mb-4 hidden items-center sm:flex">
            <TeamLogo code={team.code} color={team.color} logo={team.logo} name={team.name} size="md" />
          </div>
          <h1 className="text-balance font-display text-4xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl">
            {team.shortName}
          </h1>
          <div className="mt-3 flex min-h-10 items-center justify-between gap-4">
            {team.country ? (
              <p className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-muted-foreground sm:text-base">
                <RaceFlag countryCode={team.countryCode} label={team.country} />
                <span className="truncate">{team.country}</span>
              </p>
            ) : <span />}
            <span className="shrink-0 sm:hidden">
              <TeamLogo code={team.code} color={team.color} logo={team.logo} name={team.name} size="md" />
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-md border border-border bg-background/80 backdrop-blur-sm sm:grid-cols-4">
            <HeroMetric label="Место" value={formatPosition(team.stats.championshipPosition)} />
            <HeroMetric label="Очки" value={formatStat(team.stats.points)} />
            <HeroMetric label="Победы" value={formatStat(team.stats.wins)} />
            <HeroMetric label="Подиумы" value={formatStat(team.stats.podiums)} />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-20 content-center border-l border-border px-3 first:border-l-0 sm:min-h-24 sm:px-5">
      <p className="text-[0.65rem] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-telemetry text-2xl font-extrabold sm:text-3xl">{value}</p>
    </div>
  );
}

function DriverLineup({ team }: { team: TeamProfile }) {
  return (
    <StitchPanel className="grid min-w-0 grid-rows-[auto_1fr]">
      <StitchPanelHeader icon={Users} title="Пилоты команды" />
      <div className="grid h-full gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {team.drivers.map((driver) => (
          <Link
            className="group grid min-h-[14rem] min-w-0 grid-cols-[6rem_minmax(0,1fr)_auto] content-start gap-x-4 gap-y-4 rounded-md border border-border bg-background/35 p-4 transition-colors hover:border-foreground/25 hover:bg-accent/55 sm:p-5"
            href={driver.slug ? `/drivers/${driver.slug}` : "/leaderboard"}
            key={driver.id}
            prefetch={false}
          >
            <DriverAvatarBadge
              className="size-24"
              color={team.color}
              name={driver.fullName}
              sizes="6rem"
              slug={driver.slug}
            />
            <div className="min-w-0 self-center">
              <p className="text-balance font-display text-lg font-extrabold leading-tight group-hover:text-primary">{driver.fullName}</p>
              <p className="mt-1 font-telemetry text-xs font-bold text-muted-foreground">
                {driver.code ?? "—"} · № {driver.number ?? "—"}
              </p>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">
                {driver.championshipPosition ? `${driver.championshipPosition}-е место в чемпионате` : "Позиция уточняется"}
              </p>
            </div>
            <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            <div className="col-span-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
              <DriverMetric label="Очки" value={formatStat(driver.points)} />
              <DriverMetric label="Победы" value={formatStat(driver.wins)} />
              <DriverMetric label="Подиумы" value={formatStat(driver.podiums)} />
              <DriverMetric label="Лучший финиш" value={formatPosition(driver.bestResult)} />
            </div>
          </Link>
        ))}
      </div>
    </StitchPanel>
  );
}

function DriverMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="grid min-h-16 content-center bg-background/70 px-3 py-2">
      <span className="stitch-label text-[0.55rem] text-muted-foreground">{label}</span>
      <span className="mt-1 font-telemetry text-base font-extrabold">{value}</span>
    </span>
  );
}

function TeamForm({ team }: { team: TeamProfile }) {
  return (
    <StitchPanel className="min-w-0">
      <StitchPanelHeader icon={Gauge} title="Последние 5 этапов" />
      <div className="grid gap-4 p-5">
        <div className="grid grid-cols-5 gap-2">
          {team.form.labels.length ? team.form.labels.map((label, index) => (
            <span
              className={cn(
                "grid min-h-10 min-w-0 place-items-center whitespace-nowrap rounded border px-1 font-telemetry text-[0.62rem] font-extrabold sm:text-[0.68rem]",
                getTeamFormTone(label) === "winner" && "border-[#f4c95d]/60 bg-[#f4c95d]/10 text-[#f4c95d]",
                getTeamFormTone(label) === "classified" && "border-border bg-background/35",
                getTeamFormTone(label) === "dnf" && "border-primary/50 bg-primary/10 text-primary",
              )}
              key={`${label}-${index}`}
            >
              {label}
            </span>
          )) : <span className="text-sm text-muted-foreground">Результаты появятся после гонок</span>}
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
          <MiniMetric label="Очки" value={formatStat(team.form.points)} />
          <MiniMetric label="Подиумы" value={formatStat(team.form.podiums)} />
          <MiniMetric label="Лучший финиш" value={formatPosition(team.form.bestResult)} />
          <MiniMetric label="Этапов" value={formatStat(team.form.labels.length)} />
        </div>
      </div>
    </StitchPanel>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/65 p-3">
      <p className="stitch-label text-muted-foreground">{label}</p>
      <p className="mt-2 font-telemetry text-lg font-extrabold">{value}</p>
    </div>
  );
}

function TeamSeasonStats({ team }: { team: TeamProfile }) {
  const stats = [
    ["Подиумы", formatStat(team.stats.podiums)],
    ["Поулы", formatStat(team.stats.poles)],
    ["Быстрые круги", formatStat(team.stats.fastestLaps)],
    ["Сходы", formatStat(team.stats.dnfs)],
    ["Финиши в очках", formatStat(team.stats.pointsFinishes)],
    ["Средний финиш", team.stats.averageFinish === null ? "—" : team.stats.averageFinish.toFixed(1)],
    ["Лучший результат", formatPosition(team.stats.bestResult)],
  ];

  return (
    <StitchPanel className="grid h-full min-w-0 grid-rows-[auto_1fr_auto] overflow-hidden">
      <StitchPanelHeader icon={Trophy} title={`Статистика сезона ${team.season}`} />
      <div className="grid grid-cols-2 gap-3 p-4">
        {stats.map(([label, value]) => (
          <div className="rounded-md border border-border/70 bg-background/35 p-3" key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 font-telemetry text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>
    </StitchPanel>
  );
}

function TeamResultsTable({
  drivers,
  results,
}: {
  drivers: TeamProfile["drivers"];
  results: TeamRaceResultRow[];
}) {
  return (
    <StitchPanel className="min-w-0 overflow-hidden">
      <StitchPanelHeader icon={CalendarDays} title="Результаты по этапам" />
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
          <thead className="border-b border-border bg-background/35">
            <tr className="stitch-label text-muted-foreground">
              <th className="px-4 py-3">Этап</th>
              <th className="px-4 py-3">Гонщик</th>
              <th className="px-4 py-3 text-center">Квалификация</th>
              <th className="px-4 py-3 text-center">Финиш</th>
              <th className="px-4 py-3 text-center">Старт → финиш</th>
              <th className="px-4 py-3 text-right">Очки</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              const driverRows = getTeamResultDriverRows(result, drivers);

              return (
              <tr className="border-b border-border/70 last:border-b-0 hover:bg-accent/35" key={result.round}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <RaceFlag countryCode={result.countryCode} label={result.country || result.raceName} />
                    <div>
                      <p className="font-bold">{result.raceName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Раунд {result.round}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {driverRows.length ? (
                    <div className="grid min-w-[10rem] gap-1.5">
                      {driverRows.map((driver) => (
                        <div className="flex min-h-6 items-center" key={`${result.round}-${driver.id}`}>
                          {driver.slug ? (
                            <Link
                              className="min-w-0 truncate text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
                              href={`/drivers/${driver.slug}`}
                              prefetch={false}
                            >
                              {driver.name}
                            </Link>
                          ) : (
                            <span className="min-w-0 truncate text-xs font-semibold text-muted-foreground">
                              {driver.name}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {driverRows.length ? (
                    <div className="grid justify-items-center gap-1.5">
                      {driverRows.map((driver) => (
                        <div className="flex min-h-6 items-center" key={`${result.round}-${driver.id}`}>
                          <Badge
                            className="min-w-10 shrink-0 justify-center"
                            variant={getPositionBadgeVariant(driver.qualifyingPosition)}
                          >
                            {formatPosition(driver.qualifyingPosition)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Badge className="mx-auto" variant="outline">
                      {formatPosition(result.qualifyingBest)}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {driverRows.length ? (
                    <div className="grid justify-items-center gap-1.5">
                      {driverRows.map((driver) => (
                        <div className="flex min-h-6 items-center" key={`${result.round}-${driver.id}`}>
                          <Badge
                            className="min-w-10 justify-center"
                            variant={getPositionBadgeVariant(driver.finishPosition, driver.isDnf)}
                          >
                            {driver.isDnf ? "Сход" : formatPosition(driver.finishPosition)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Badge className="mx-auto" variant="outline">
                      {formatPosition(result.bestFinish)}
                    </Badge>
                  )}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-center font-telemetry text-base font-extrabold",
                    result.positionDelta !== null && result.positionDelta > 0 && "text-success",
                    result.positionDelta !== null && result.positionDelta < 0 && "text-danger",
                    result.positionDelta === 0 && "text-muted-foreground",
                  )}
                >
                  {formatPositionDelta(result.positionDelta)}
                </td>
                <td className="px-4 py-3 text-right font-telemetry text-base font-extrabold">{formatStat(result.points)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </StitchPanel>
  );
}

function TeamNews({ team }: { team: TeamProfile }) {
  return (
    <StitchPanel className="grid h-full min-w-0 grid-rows-[auto_1fr_auto] overflow-hidden">
      <StitchPanelHeader icon={Newspaper} title={`Новости ${team.shortName}`} />
      {team.news.length ? (
        <div className="divide-y divide-border">
          {team.news.map((item) => (
            <Link className="group grid gap-2 p-4 hover:bg-accent/35 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-start sm:p-5" href={item.href ?? `/news/${item.slug}`} key={item.slug} prefetch={false}>
              <p className="text-xs font-semibold text-muted-foreground">{item.source} · {item.time}</p>
              <div className="min-w-0">
                <p className="font-display text-base font-extrabold group-hover:text-primary">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
              </div>
              <ChevronRight aria-hidden="true" className="hidden size-4 text-muted-foreground group-hover:text-primary sm:block" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="p-7 text-center">
          <p className="font-bold">Свежих материалов пока нет</p>
          <p className="mt-1 text-sm text-muted-foreground">Новые публикации появятся после обработки ленты RaceMate.</p>
        </div>
      )}
      <div className="border-t border-border p-4">
        <Button asChild variant="secondary">
          <Link href={`/news?tag=team-${team.code.toLowerCase()}`} prefetch={false}>
            Все новости команды
            <ChevronRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </StitchPanel>
  );
}

function TeamSocial({ team }: { team: TeamProfile }) {
  return (
    <StitchPanel className="grid h-full min-w-0 grid-rows-[auto_1fr_auto] overflow-hidden">
      <StitchPanelHeader icon={Radio} title="Лента соцсетей" />
      <div className="divide-y divide-border">
        {team.socialPosts.length ? team.socialPosts.slice(0, 5).map((post) => (
          <a
            className="group block p-4 transition-colors hover:bg-accent/35"
            href={post.href}
            key={`${post.platform}-${post.href}`}
            rel="noreferrer"
            target="_blank"
          >
            <div className="flex items-start justify-between gap-3">
              <Badge variant="outline">{post.source}</Badge>
              <span className="shrink-0 text-xs text-muted-foreground">{post.publishedAt}</span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 group-hover:text-primary">
              {post.title}
            </p>
          </a>
        )) : (
          <div className="p-6 text-center">
            <p className="font-bold">Публикаций пока нет</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Новые сообщения команды появятся после обработки ленты.
            </p>
          </div>
        )}
      </div>
      <div className="mt-auto border-t border-border p-4">
        <Button asChild className="w-full" variant="secondary">
          <Link href={`/social?team=team-${team.code.toLowerCase()}`} prefetch={false}>
            Все публикации команды
            <ChevronRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </StitchPanel>
  );
}

function formatPosition(value: number | null) {
  return value === null ? "—" : `P${value}`;
}

function formatStat(value: number | null) {
  if (value === null) {
    return "—";
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function formatPositionDelta(value: number | null) {
  if (value === null) {
    return "—";
  }

  return value > 0 ? `+${value}` : String(value);
}

function getTeamFormTone(label: string) {
  const positions = [...label.matchAll(/P(\d+)/g)].map((match) => Number(match[1]));

  if (positions.length && Math.min(...positions) === 1) {
    return "winner";
  }

  return label.includes("DNF") && !positions.length ? "dnf" : "classified";
}

function getTeamResultDriverRows(result: TeamRaceResultRow, drivers: TeamProfile["drivers"]) {
  const resultDrivers = new Map(
    [...result.qualifyingResults, ...result.finishResults]
      .filter((driver) => driver.driverId)
      .map((driver) => [driver.driverId as string, driver]),
  );
  const orderedDrivers = drivers.length
    ? drivers.slice(0, 2).map((driver) => ({
        id: driver.id,
        name: driver.fullName,
        slug: driver.slug,
      }))
    : [...resultDrivers.entries()].map(([id, driver]) => ({
        id,
        name: driver.driver,
        slug: driver.driverSlug,
      }));

  return orderedDrivers.map((driver) => {
    const qualifying = result.qualifyingResults.find((item) => item.driverId === driver.id);
    const finish = result.finishResults.find((item) => item.driverId === driver.id);

    return {
      ...driver,
      finishPosition: finish?.position ?? null,
      isDnf: finish?.isDnf ?? (result.finishResults.length > 0 && Boolean(qualifying)),
      qualifyingPosition: qualifying?.position ?? null,
    };
  });
}

function getPositionBadgeVariant(position: number | null, isDnf = false) {
  if (isDnf) {
    return "danger" as const;
  }

  if (position === 1) {
    return "warning" as const;
  }

  if (position && position <= 3) {
    return "secondary" as const;
  }

  return "outline" as const;
}
