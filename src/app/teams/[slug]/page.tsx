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
  Trophy,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { DriverAvatarBadge } from "@/components/racemate/driver-avatar-badge";
import { RaceFlag } from "@/components/racemate/race-flag";
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
      <div className="grid min-w-0 gap-5 py-6 sm:gap-6 sm:py-8">
        <TeamHero team={team} />

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
          <DriverLineup team={team} />
          <TeamForm team={team} />
        </section>

        <TeamSeasonStats team={team} />
        <TeamPointsChart team={team} />
        <TeamResultsTable results={team.results} />
        <TeamNews team={team} />
      </div>
    </AppShell>
  );
}

function TeamHero({ team }: { team: TeamProfile }) {
  return (
    <section className="relative min-h-[31rem] overflow-hidden rounded-xl border border-border bg-black sm:min-h-[35rem]">
      <Image
        alt={`Болид ${team.shortName} сезона ${team.season}`}
        className="object-cover object-center"
        fill
        priority
        sizes="(min-width: 1280px) 75rem, 100vw"
        src={team.carImageUrl}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(0_0_0_/_0.92)_0%,rgb(0_0_0_/_0.55)_43%,transparent_72%),linear-gradient(0deg,rgb(0_0_0_/_0.82)_0%,transparent_48%)]" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: team.color }}
      />

      <div className="relative flex min-h-[31rem] flex-col justify-between p-5 text-white sm:min-h-[35rem] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild size="sm" variant="secondary">
            <Link href="/teams" prefetch={false}>
              <ArrowLeft aria-hidden="true" data-icon="inline-start" />
              Все команды
            </Link>
          </Button>
          <Badge className="border-white/20 bg-black/45 text-white" variant="outline">
            Сезон {team.season}
          </Badge>
        </div>

        <div className="max-w-2xl">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <TeamLogo code={team.code} color={team.color} logo={team.logo} name={team.name} size="md" />
            {team.country ? (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-white/75">
                <RaceFlag countryCode={team.countryCode} label={team.country} />
                {team.country}
              </span>
            ) : null}
          </div>
          <h1 className="text-balance font-display text-4xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl">
            {team.shortName}
          </h1>
          <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-white/70 sm:text-base">
            Состав, результаты и динамика команды в текущем чемпионате.
          </p>

          <div className="mt-6 grid grid-cols-3 overflow-hidden rounded-md border border-white/15 bg-black/45 backdrop-blur-sm">
            <HeroMetric label="Место" value={formatPosition(team.stats.championshipPosition)} />
            <HeroMetric label="Очки" value={formatStat(team.stats.points)} />
            <HeroMetric label="Победы" value={formatStat(team.stats.wins)} />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-20 content-center border-l border-white/15 px-3 first:border-l-0 sm:min-h-24 sm:px-5">
      <p className="text-[0.65rem] font-bold uppercase text-white/55">{label}</p>
      <p className="mt-1 font-telemetry text-2xl font-extrabold sm:text-3xl">{value}</p>
    </div>
  );
}

function DriverLineup({ team }: { team: TeamProfile }) {
  return (
    <StitchPanel className="min-w-0">
      <StitchPanelHeader icon={Users} title="Пилоты команды" />
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {team.drivers.map((driver) => (
          <Link
            className="group flex min-w-0 items-center gap-4 rounded-md border border-border bg-background/35 p-4 transition-colors hover:border-foreground/25 hover:bg-accent/55"
            href={driver.slug ? `/drivers/${driver.slug}` : "/leaderboard"}
            key={driver.id}
            prefetch={false}
          >
            <DriverAvatarBadge
              className="size-16"
              color={team.color}
              name={driver.fullName}
              sizes="4rem"
              slug={driver.slug}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-extrabold group-hover:text-primary">{driver.fullName}</p>
              <p className="mt-1 font-telemetry text-xs font-bold text-muted-foreground">
                {driver.code ?? "—"} · № {driver.number ?? "—"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span>P{driver.championshipPosition ?? "—"}</span>
                <span className="text-muted-foreground">{formatStat(driver.points)} очк.</span>
                <span className="text-muted-foreground">{driver.wins} побед</span>
              </div>
            </div>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </StitchPanel>
  );
}

function TeamForm({ team }: { team: TeamProfile }) {
  return (
    <StitchPanel className="min-w-0">
      <StitchPanelHeader icon={Gauge} title="Последние 5 этапов" />
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap gap-2">
          {team.form.labels.length ? team.form.labels.map((label, index) => (
            <span
              className={cn(
                "grid min-h-10 min-w-10 place-items-center rounded border px-2 font-telemetry text-xs font-extrabold",
                label === "P1" && "border-[#f4c95d]/60 bg-[#f4c95d]/10 text-[#f4c95d]",
                label !== "P1" && label !== "DNF" && "border-border bg-background/35",
                label === "DNF" && "border-primary/50 bg-primary/10 text-primary",
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
    <StitchPanel className="min-w-0 overflow-hidden">
      <StitchPanelHeader icon={Trophy} title={`Статистика сезона ${team.season}`} />
      <div className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(([label, value]) => (
          <div className="min-h-24 bg-card p-4" key={label}>
            <p className="stitch-label min-h-7 text-muted-foreground">{label}</p>
            <p className="mt-2 font-telemetry text-2xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>
    </StitchPanel>
  );
}

function TeamPointsChart({ team }: { team: TeamProfile }) {
  const points = team.pointsByRound;
  const width = 960;
  const height = 280;
  const padding = { left: 54, right: 22, top: 24, bottom: 48 };
  const maxValue = Math.max(...points.map((point) => point.cumulativePoints), 1);
  const scaleMax = Math.ceil(maxValue / 50) * 50 || 50;
  const x = (index: number) => padding.left + (points.length <= 1 ? 0 : index * ((width - padding.left - padding.right) / (points.length - 1)));
  const y = (value: number) => padding.top + (height - padding.top - padding.bottom) * (1 - value / scaleMax);
  const path = points.map((point, index) => `${index ? "L" : "M"} ${x(index).toFixed(1)} ${y(point.cumulativePoints).toFixed(1)}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => Math.round((scaleMax / 4) * index));

  return (
    <StitchPanel className="min-w-0 overflow-hidden">
      <StitchPanelHeader icon={Gauge} title="Накопленные очки" />
      <div className="p-3 sm:p-5">
        {points.length ? (
          <svg aria-label={`График накопленных очков команды ${team.shortName}`} className="h-auto w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
            {yTicks.map((tick) => (
              <g key={tick}>
                <line stroke="currentColor" strokeOpacity="0.12" x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} />
                <text className="fill-muted-foreground font-telemetry text-[11px]" textAnchor="end" x={padding.left - 10} y={y(tick) + 4}>{tick}</text>
              </g>
            ))}
            <path d={path} fill="none" stroke={team.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            {points.map((point, index) => (
              <g key={point.round}>
                <circle cx={x(index)} cy={y(point.cumulativePoints)} fill={team.color} r="5" stroke="var(--card)" strokeWidth="3" />
                <text className="fill-muted-foreground text-[13px]" textAnchor="middle" x={x(index)} y={height - 20}>
                  {point.countryCode ? countryFlag(point.countryCode) : `R${point.round}`}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <p className="p-5 text-center text-sm text-muted-foreground">График появится после первого результата команды.</p>
        )}
      </div>
    </StitchPanel>
  );
}

function TeamResultsTable({ results }: { results: TeamRaceResultRow[] }) {
  return (
    <StitchPanel className="min-w-0 overflow-hidden">
      <StitchPanelHeader icon={CalendarDays} title="Результаты по этапам" />
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
          <thead className="border-b border-border bg-background/35">
            <tr className="stitch-label text-muted-foreground">
              <th className="px-4 py-3">Этап</th>
              <th className="px-4 py-3 text-center">Квалификация</th>
              <th className="px-4 py-3 text-center">Лучший финиш</th>
              <th className="px-4 py-3">Пилоты</th>
              <th className="px-4 py-3 text-right">Очки</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
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
                <td className="px-4 py-3 text-center font-telemetry font-bold">{formatPosition(result.qualifyingBest)}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={result.isWin ? "warning" : result.isPodium ? "secondary" : result.hadDnf ? "danger" : "outline"}>
                    {formatPosition(result.bestFinish)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-muted-foreground">{result.finishers.join(" · ") || "—"}</td>
                <td className="px-4 py-3 text-right font-telemetry text-base font-extrabold">{formatStat(result.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StitchPanel>
  );
}

function TeamNews({ team }: { team: TeamProfile }) {
  return (
    <StitchPanel className="min-w-0 overflow-hidden">
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

function formatPosition(value: number | null) {
  return value === null ? "—" : `P${value}`;
}

function formatStat(value: number | null) {
  if (value === null) {
    return "—";
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function countryFlag(countryCode: string) {
  return countryCode
    .toUpperCase()
    .replace(/./g, (character) => String.fromCodePoint(127397 + character.charCodeAt(0)));
}
