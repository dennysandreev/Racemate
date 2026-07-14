import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ChevronRight,
  CircleUserRound,
  Flag,
  Gauge,
  Heart,
  LineChart,
  Medal,
  Newspaper,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

import { addFavoriteDriver } from "@/app/drivers/[slug]/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { DriverCumulativePointsChart } from "@/components/racemate/driver-cumulative-points-chart";
import { getLocalDriverAvatarSrc } from "@/components/racemate/driver-avatar-badge";
import { RaceFlag } from "@/components/racemate/race-flag";
import { TeamLogo } from "@/components/racemate/team-logo";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getDriverProfileBySlug,
} from "@/data/racemate-repository";
import { getTeamProfileAsset } from "@/data/f1-assets";
import { getSessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { DriverChartPoint, DriverProfile, DriverRaceResultRow } from "@/types/racemate";

export const dynamic = "force-dynamic";

type DriverPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: DriverPageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getDriverProfileBySlug(slug);

  if (!profile) {
    return {
      title: "Гонщик не найден · RaceMate",
    };
  }

  return {
    title: `${profile.fullName} · RaceMate`,
    description: `Профиль гонщика ${profile.fullName}: сезон, результаты, форма, новости и сравнение с напарником.`,
  };
}

export default async function DriverProfilePage({ params }: DriverPageProps) {
  const { slug } = await params;
  const user = await getSessionUser();
  const profile = await getDriverProfileBySlug(slug, user?.id);

  if (!profile) {
    notFound();
  }

  return (
    <AppShell>
      <div className="grid gap-4 pb-6 sm:gap-5">
        <DriverHero profile={profile} signedIn={Boolean(user)} />

        <SeasonStats profile={profile} />

        <div className="grid min-w-0 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-stretch">
          <DriverCumulativePointsChart profile={profile} />
          <div className="grid min-w-0 content-start gap-4 sm:gap-5">
            <PositionTrendPanel points={profile.charts.championshipPosition} />
            <FormPanel profile={profile} />
          </div>
        </div>

        <div className="grid min-w-0 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
          <RaceResultsPanel results={profile.results} />
          <aside className="grid min-w-0 gap-4 sm:gap-5">
            <TeammatePanel profile={profile} />
            <DeltaPanel profile={profile} />
          </aside>
        </div>

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <DriverNewsPanel profile={profile} />
          <DriverSocialPanel profile={profile} />
        </div>
      </div>
    </AppShell>
  );
}

function DriverHero({ profile, signedIn }: { profile: DriverProfile; signedIn: boolean }) {
  const teamProfile = getTeamProfileAsset(profile.team.code) ?? getTeamProfileAsset(profile.team.name);
  const avatarUrl = profile.aiAvatarUrl || getLocalDriverAvatarSrc(profile.slug);
  const teamColor = profile.team.color ?? "var(--primary)";

  return (
    <section className="stitch-panel relative overflow-hidden p-0">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 82% 0%, ${hexWithAlpha(profile.team.color, 0.3) ?? "rgb(225 6 0 / 0.24)"}, transparent 30rem), linear-gradient(135deg, rgb(255 255 255 / 0.06), transparent 40%)`,
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 -top-10 select-none font-display text-[11rem] font-black leading-none tracking-tighter opacity-[0.07] sm:text-[16rem]"
        style={{ color: teamColor }}
      >
        {profile.number ?? profile.code ?? ""}
      </span>

      <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Сезон {profile.season}</Badge>
            <Badge variant="secondary">
              <RaceFlag
                className="mr-1 align-[-0.08em]"
                countryCode={profile.countryCode}
                label={profile.country ?? "Страна"}
              />
              {profile.country ?? "Страна уточняется"}
            </Badge>
            <Badge variant="outline">
              <span className="font-telemetry">№ {profile.number ?? profile.code ?? "—"}</span>
            </Badge>
          </div>

          <h1 className="mt-4 text-balance font-display leading-[0.94] tracking-[-0.04em]">
            <span className="block text-xl font-bold text-muted-foreground sm:text-3xl">
              {profile.firstName}
            </span>
            <span className="block text-4xl font-black uppercase sm:text-6xl">
              {profile.lastName}
            </span>
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              className="group inline-flex min-w-0 items-center gap-2.5 rounded-md border border-border/70 bg-background/40 py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-primary/40 hover:bg-accent/50"
              href={teamProfile ? `/teams/${teamProfile.slug}` : "/leaderboard?table=constructors"}
              prefetch={false}
            >
              <TeamLogo
                code={profile.team.code}
                color={profile.team.color}
                logo={profile.team.logo}
                name={profile.team.name}
                size="sm"
              />
              <span className="min-w-0 truncate text-sm font-bold">{profile.team.name}</span>
              <ChevronRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              />
            </Link>
            <FavoriteAction profile={profile} signedIn={signedIn} />
          </div>
        </div>

        <div className="relative order-first mx-auto w-full max-w-[15rem] lg:order-none lg:mx-0 lg:max-w-none">
          {avatarUrl ? (
            <div className="relative h-56 sm:h-64 lg:h-72">
              <Image
                alt={`Аватар ${profile.fullName}`}
                className="object-contain object-bottom"
                fill
                priority
                sizes="(min-width: 1024px) 17rem, 15rem"
                src={avatarUrl}
              />
              <span
                aria-hidden="true"
                className="absolute inset-x-6 bottom-0 h-1 rounded-full"
                style={{ backgroundColor: teamColor }}
              />
            </div>
          ) : (
            <div className="relative grid h-56 place-items-center overflow-hidden rounded-xl border border-border/70 bg-background/40 sm:h-64 lg:h-72">
              <div className="grid justify-items-center gap-3 text-center">
                <CircleUserRound aria-hidden="true" className="size-14 text-muted-foreground" />
                <p className="font-telemetry text-4xl font-black">{profile.number ?? profile.code ?? "—"}</p>
                <p className="px-4 text-xs text-muted-foreground">AI-аватар появится после ручной загрузки</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative grid grid-cols-2 border-t stitch-divider bg-background/30 sm:grid-cols-4">
        <HeroStat label="Место" value={formatPosition(profile.stats.championshipPosition)} />
        <HeroStat accent label="Очки" value={formatStat(profile.stats.points)} />
        <HeroStat label="Победы" value={formatStat(profile.stats.wins)} />
        <HeroStat label="Подиумы" value={formatStat(profile.stats.podiums)} />
      </div>
    </section>
  );
}

function HeroStat({ accent, label, value }: { accent?: boolean; label: string; value: string }) {
  return (
    <div className="border-r stitch-divider px-4 py-3 last:border-r-0 sm:px-6 [&:nth-child(2)]:border-r-0 sm:[&:nth-child(2)]:border-r [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0">
      <p className="stitch-label text-[0.56rem] text-muted-foreground">{label}</p>
      <p className={cn("font-telemetry mt-1.5 text-xl font-extrabold leading-none sm:text-2xl", accent && "text-primary")}>
        {value}
      </p>
    </div>
  );
}

function FavoriteAction({ profile, signedIn }: { profile: DriverProfile; signedIn: boolean }) {
  if (!signedIn) {
    return (
      <Button asChild>
        <Link href={`/auth?next=/drivers/${profile.slug}`} prefetch={false}>
          <Heart aria-hidden="true" data-icon="inline-start" />
          Войти и добавить
        </Link>
      </Button>
    );
  }

  if (profile.isFavorite) {
    return (
      <Button disabled variant="secondary">
        <Heart aria-hidden="true" data-icon="inline-start" />
        Уже в избранном
      </Button>
    );
  }

  if (profile.favoriteLimitReached) {
    return (
      <Button asChild variant="secondary">
        <Link href="/onboarding" prefetch={false}>
          Изменить избранное
        </Link>
      </Button>
    );
  }

  return (
    <form action={addFavoriteDriver}>
      <input name="driverId" type="hidden" value={profile.id} />
      <input name="slug" type="hidden" value={profile.slug} />
      <Button type="submit">
        <Heart aria-hidden="true" data-icon="inline-start" />
        Добавить в избранное
      </Button>
    </form>
  );
}

function SeasonStats({ profile }: { profile: DriverProfile }) {
  const stats = [
    ["Очки", formatStat(profile.stats.points)],
    ["Место", formatPosition(profile.stats.championshipPosition)],
    ["Победы", formatStat(profile.stats.wins)],
    ["Подиумы", formatStat(profile.stats.podiums)],
    ["Поулы", formatStat(profile.stats.poles)],
    ["Быстрые круги", formatStat(profile.stats.fastestLaps)],
    ["Сходы", formatStat(profile.stats.dnfs)],
    ["Финиши в очках", formatStat(profile.stats.pointsFinishes)],
    ["Средний старт", formatDecimal(profile.stats.averageStart)],
    ["Средний финиш", formatDecimal(profile.stats.averageFinish)],
    ["Лучший результат", formatPosition(profile.stats.bestResult)],
    ["Худший результат", formatPosition(profile.stats.worstResult)],
  ];

  return (
    <StitchPanel>
      <StitchPanelHeader icon={Gauge} title="Статистика сезона" />
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-4 lg:grid-cols-4 xl:grid-cols-6">
        {stats.map(([label, value]) => (
          <div className="rounded-md border border-border/70 bg-background/35 px-3 py-2.5" key={label}>
            <p className="stitch-label text-[0.54rem] text-muted-foreground">{label}</p>
            <p className="font-telemetry mt-1.5 text-lg font-extrabold leading-none">{value}</p>
          </div>
        ))}
      </div>
    </StitchPanel>
  );
}

/*
 * Позиция в личном зачете по этапам: серверный SVG без клиентского JS.
 * Ось Y инвертирована — P1 сверху.
 */
function PositionTrendPanel({ points }: { points: DriverChartPoint[] }) {
  const valid = points.filter(
    (point): point is DriverChartPoint & { value: number } =>
      typeof point.value === "number" && Number.isFinite(point.value),
  );

  if (valid.length < 2) {
    return (
      <StitchPanel>
        <StitchPanelHeader icon={LineChart} title="Позиция в чемпионате" />
        <p className="p-4 text-sm leading-6 text-muted-foreground">
          График появится после первых этапов сезона.
        </p>
      </StitchPanel>
    );
  }

  const width = 320;
  const height = 96;
  const padX = 10;
  const padY = 12;
  const maxPosition = Math.max(...valid.map((point) => point.value));
  const minPosition = Math.min(...valid.map((point) => point.value));
  const span = Math.max(maxPosition - minPosition, 1);
  const coords = valid.map((point, index) => ({
    x: padX + (index / (valid.length - 1)) * (width - padX * 2),
    y: padY + ((point.value - minPosition) / span) * (height - padY * 2),
    point,
  }));
  const pathD = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`)
    .join(" ");
  const last = valid[valid.length - 1];

  return (
    <StitchPanel>
      <StitchPanelHeader
        action={<Badge variant="secondary">Сейчас P{last.value}</Badge>}
        icon={LineChart}
        title="Позиция в чемпионате"
      />
      <div className="grid gap-2 p-4">
        <svg
          aria-label={`Позиция в чемпионате по этапам: сейчас P${last.value}, лучшая P${minPosition}`}
          className="w-full"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <path
            d={`${pathD} L${coords[coords.length - 1].x.toFixed(1)} ${height} L${coords[0].x.toFixed(1)} ${height} Z`}
            fill="rgb(225 6 0 / 0.1)"
            stroke="none"
          />
          <path d={pathD} fill="none" stroke="var(--primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          {coords.map((coord) => (
            <circle
              cx={coord.x.toFixed(1)}
              cy={coord.y.toFixed(1)}
              fill="var(--primary)"
              key={coord.point.round}
              r={coord.point.round === last.round ? 3.5 : 2}
            >
              <title>{`R${coord.point.round} · ${coord.point.raceName} — P${coord.point.value}`}</title>
            </circle>
          ))}
        </svg>
        <div className="flex items-center justify-between text-[0.65rem] font-semibold text-muted-foreground">
          <span>R{valid[0].round}</span>
          <span>Лучшая позиция: P{minPosition}</span>
          <span>R{last.round}</span>
        </div>
      </div>
    </StitchPanel>
  );
}

function RaceResultsPanel({ results }: { results: DriverRaceResultRow[] }) {
  return (
    <StitchPanel>
      <StitchPanelHeader icon={Flag} title="Результаты по этапам" />

      {/* Десктоп: полная таблица */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Этап</th>
              <th className="px-4 py-3 text-right font-medium">Квала</th>
              <th className="px-4 py-3 text-right font-medium">Старт</th>
              <th className="px-4 py-3 text-right font-medium">Финиш</th>
              <th className="px-4 py-3 text-right font-medium">+/-</th>
              <th className="px-4 py-3 text-right font-medium">Очки</th>
              <th className="px-4 py-3 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr className="border-t border-border/70" key={`${result.round}-${result.raceName}`}>
                <td className="px-4 py-3">
                  <div className="flex min-w-[12rem] items-center gap-2 font-medium">
                    <RaceFlag countryCode={result.countryCode} label={result.country || result.raceName} />
                    <span>R{result.round} · {result.raceName}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{result.raceDate}</div>
                </td>
                <td className="px-4 py-3 text-right font-telemetry">{formatPosition(result.qualifyingPosition)}</td>
                <td className="px-4 py-3 text-right font-telemetry">{formatPosition(result.startPosition)}</td>
                <td className="px-4 py-3 text-right font-telemetry">
                  <span className={cn(result.isWin && "text-[#f4c95d]", result.isPodium && !result.isWin && "text-[#d48a5f]")}>
                    {formatPosition(result.finishPosition)}
                  </span>
                </td>
                <td className={cn("px-4 py-3 text-right font-telemetry", getDeltaClassName(result.positionDelta))}>
                  {formatDelta(result.positionDelta)}
                </td>
                <td className={cn("px-4 py-3 text-right font-telemetry", result.scoredPoints && "text-primary")}>
                  {formatStat(result.points)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Badge variant={result.isDnf ? "danger" : result.finishPosition ? "outline" : "secondary"}>
                    {result.isDnf ? "Сход" : result.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Мобильный: карточки без горизонтального скролла */}
      <div className="grid gap-2 p-3 sm:hidden">
        {results.map((result) => (
          <article
            className="rounded-md border border-border/70 bg-background/35 p-3"
            key={`m-${result.round}-${result.raceName}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <RaceFlag countryCode={result.countryCode} label={result.country || result.raceName} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">R{result.round} · {result.raceName}</p>
                  <p className="mt-0.5 text-[0.65rem] font-semibold text-muted-foreground">{result.raceDate}</p>
                </div>
              </div>
              <Badge className="shrink-0" variant={result.isDnf ? "danger" : result.finishPosition ? "outline" : "secondary"}>
                {result.isDnf ? "Сход" : result.status}
              </Badge>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-1.5">
              <MobileResultCell label="Квала" value={formatPosition(result.qualifyingPosition)} />
              <MobileResultCell label="Старт" value={formatPosition(result.startPosition)} />
              <MobileResultCell
                label="Финиш"
                value={formatPosition(result.finishPosition)}
                valueClassName={cn(
                  result.isWin && "text-[#f4c95d]",
                  result.isPodium && !result.isWin && "text-[#d48a5f]",
                )}
              />
              <MobileResultCell
                label="Очки"
                value={formatStat(result.points)}
                valueClassName={cn(result.scoredPoints && "text-primary")}
              />
            </div>
            {result.positionDelta ? (
              <p className={cn("mt-2 text-[0.68rem] font-bold", getDeltaClassName(result.positionDelta))}>
                Старт → финиш: {formatDelta(result.positionDelta)}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </StitchPanel>
  );
}

function MobileResultCell({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded border border-border/60 bg-background/40 px-1.5 py-1.5 text-center">
      <p className="text-[0.54rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className={cn("font-telemetry mt-1 text-sm font-extrabold leading-none", valueClassName)}>{value}</p>
    </div>
  );
}

function FormPanel({ profile }: { profile: DriverProfile }) {
  return (
    <StitchPanel className="h-full">
      <StitchPanelHeader icon={Medal} title="Последние 5 этапов" />
      <div className="grid gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          {profile.form.labels.length ? profile.form.labels.map((label, index) => (
            <span
              className={cn(
                "rounded-md border border-border bg-background/35 px-3 py-2 font-telemetry text-sm font-bold",
                label === "DNF" && "border-danger/50 text-danger",
                label === "P1" && "border-[#f4c95d]/50 text-[#f4c95d]",
                (label === "P2" || label === "P3") && "border-[#d48a5f]/45 text-[#d48a5f]",
              )}
              key={`${label}-${index}`}
            >
              {label}
            </span>
          )) : (
            <p className="text-sm text-muted-foreground">Форма появится после первых результатов.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StitchMetric label="Очки" value={formatStat(profile.form.points)} />
          <StitchMetric label="Подиумы" value={formatStat(profile.form.podiums)} />
          <StitchMetric label="Сходы" value={formatStat(profile.form.dnfs)} />
          <StitchMetric label="Лучший финиш" value={formatPosition(profile.form.bestResult)} />
          <StitchMetric label="Средняя квалификация" value={formatDecimal(profile.form.averageQualifyingPosition)} />
          <StitchMetric label="Средняя позиция в гонке" value={formatDecimal(profile.form.averageFinishPosition)} />
        </div>
      </div>
    </StitchPanel>
  );
}

function TeammatePanel({ profile }: { profile: DriverProfile }) {
  const comparison = profile.teammateComparison;
  const teammate = comparison.teammateNames.join(", ") || "Напарник уточняется";
  const rows: Array<{
    label: string;
    driver: number | null;
    teammate: number | null;
    decimals?: boolean;
    lowerIsBetter?: boolean;
  }> = [
    { driver: comparison.qualifying.driver, label: "Квалификации", teammate: comparison.qualifying.teammate },
    { driver: comparison.races.driver, label: "Гонки", teammate: comparison.races.teammate },
    { driver: comparison.points.driver, label: "Очки", teammate: comparison.points.teammate },
    { driver: comparison.podiums.driver, label: "Подиумы", teammate: comparison.podiums.teammate },
    { driver: comparison.wins.driver, label: "Победы", teammate: comparison.wins.teammate },
    {
      decimals: true,
      driver: comparison.averageStart.driver,
      label: "Средний старт",
      lowerIsBetter: true,
      teammate: comparison.averageStart.teammate,
    },
    {
      decimals: true,
      driver: comparison.averageFinish.driver,
      label: "Средний финиш",
      lowerIsBetter: true,
      teammate: comparison.averageFinish.teammate,
    },
    { driver: comparison.dnfs.driver, label: "Сходы", lowerIsBetter: true, teammate: comparison.dnfs.teammate },
  ];

  return (
    <StitchPanel>
      <StitchPanelHeader icon={Users} meta={teammate} title="Сравнение с напарником" />
      <div className="grid gap-1.5 p-3 sm:p-4">
        {rows.map((row) => {
          const driverBetter = isBetter(row.driver, row.teammate, row.lowerIsBetter);
          const teammateBetter = isBetter(row.teammate, row.driver, row.lowerIsBetter);
          const format = row.decimals ? formatDecimal : formatStat;

          return (
            <div
              className="grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] items-center gap-2 rounded-md border border-border/70 bg-background/35 px-3 py-2"
              key={row.label}
            >
              <span
                className={cn(
                  "font-telemetry text-sm font-extrabold",
                  driverBetter ? "text-primary" : "text-muted-foreground",
                )}
              >
                {format(row.driver)}
              </span>
              <span className="min-w-0 truncate text-center text-xs font-semibold text-muted-foreground">
                {row.label}
              </span>
              <span
                className={cn(
                  "text-right font-telemetry text-sm font-extrabold",
                  teammateBetter ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {format(row.teammate)}
              </span>
            </div>
          );
        })}
        <p className="mt-1 flex items-center justify-between text-[0.62rem] font-semibold text-muted-foreground">
          <span className="text-primary">{profile.lastName}</span>
          <span>напарник</span>
        </p>
      </div>
    </StitchPanel>
  );
}

function isBetter(a: number | null, b: number | null, lowerIsBetter?: boolean) {
  if (a === null || b === null || a === b) {
    return false;
  }

  return lowerIsBetter ? a < b : a > b;
}

function DeltaPanel({ profile }: { profile: DriverProfile }) {
  return (
    <StitchPanel>
      <StitchPanelHeader icon={Sparkles} title="Старт → финиш" />
      <div className="grid gap-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <StitchMetric label="Суммарно" value={formatDelta(profile.positionDelta.totalDelta)} />
          <StitchMetric label="В среднем" value={formatDelta(profile.positionDelta.averageDelta)} />
        </div>
        <ComparisonRow
          label="Лучший прорыв"
          value={profile.positionDelta.bestGain ? `+${profile.positionDelta.bestGain.value} · ${profile.positionDelta.bestGain.raceName}` : "—"}
        />
        <ComparisonRow
          label="Самая большая потеря"
          value={profile.positionDelta.biggestDrop ? `${profile.positionDelta.biggestDrop.value} · ${profile.positionDelta.biggestDrop.raceName}` : "—"}
        />
      </div>
    </StitchPanel>
  );
}

function DriverNewsPanel({ profile }: { profile: DriverProfile }) {
  return (
    <StitchPanel>
      <StitchPanelHeader
        action={(
          <Button asChild size="sm" variant="secondary">
            <Link href={`/news?tag=driver-${profile.slug}`} prefetch={false}>
              Все новости гонщика
              <ChevronRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>
        )}
        icon={Newspaper}
        title="Новости по гонщику"
      />
      <div className="grid gap-3 p-4">
        {profile.news.length ? profile.news.map((item) => (
          <Link
            className="grid gap-2 rounded-md border border-border/70 bg-background/30 p-3 transition-colors hover:border-primary/40 hover:bg-accent/50"
            href={item.href}
            key={item.href}
            prefetch={false}
          >
            <div className="flex items-center gap-2">
              <Badge variant="outline">{item.source}</Badge>
              <span className="text-xs text-muted-foreground">{item.time}</span>
            </div>
            <h2 className="text-base font-semibold leading-6">{item.title}</h2>
            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
          </Link>
        )) : (
          <p className="rounded-md border border-border/70 p-4 text-sm text-muted-foreground">
            Как только в ленте появятся материалы про этого гонщика, они будут здесь.
          </p>
        )}
      </div>
    </StitchPanel>
  );
}

function DriverSocialPanel({ profile }: { profile: DriverProfile }) {
  return (
    <StitchPanel>
      <StitchPanelHeader icon={Shield} title="Соцсети" />
      <div className="grid gap-3 p-4">
        {profile.socialPosts.length ? profile.socialPosts.map((post) => (
          <a
            className="rounded-md border border-border/70 bg-background/30 p-3 transition-colors hover:border-primary/40 hover:bg-accent/50"
            href={post.href}
            key={post.href}
            rel="noreferrer"
            target="_blank"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <Badge variant="outline">{post.platform === "x" ? "X" : "Reddit"}</Badge>
              <span className="text-xs text-muted-foreground">{post.publishedAt}</span>
            </div>
            <p className="line-clamp-3 text-sm leading-6">{post.title}</p>
            <p className="mt-2 text-xs text-muted-foreground">{post.author}</p>
          </a>
        )) : (
          <p className="rounded-md border border-border/70 p-4 text-sm text-muted-foreground">
            В сохраненной соцленте пока нет постов по этому гонщику.
          </p>
        )}
      </div>
    </StitchPanel>
  );
}

function ComparisonRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/35 px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right font-telemetry text-sm font-bold">{value}</span>
    </div>
  );
}

function formatStat(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDecimal(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return value.toFixed(1);
}

function formatPosition(value: number | null | undefined) {
  return value ? `P${value}` : "—";
}

function formatDelta(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

function getDeltaClassName(value: number | null | undefined) {
  if (!value) {
    return "";
  }

  return value > 0 ? "text-success" : "text-danger";
}

function hexWithAlpha(hex: string | null | undefined, alpha: number) {
  if (!hex) {
    return null;
  }

  const normalized = hex.trim();

  if (!/^#([0-9a-f]{6})$/i.test(normalized)) {
    return null;
  }

  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);

  return `rgb(${r} ${g} ${b} / ${alpha})`;
}
