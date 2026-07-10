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
  Medal,
  Newspaper,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

import { addFavoriteDriver } from "@/app/drivers/[slug]/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { DriverCumulativePointsChart } from "@/components/racemate/driver-cumulative-points-chart";
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
import type { DriverProfile, DriverRaceResultRow } from "@/types/racemate";

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
      <div className="grid gap-6 py-6">
        <DriverHero profile={profile} signedIn={Boolean(user)} />

        <section className="grid min-w-0 gap-5">
          <SeasonStats profile={profile} />

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-stretch">
            <DriverCumulativePointsChart profile={profile} />
            <FormPanel profile={profile} />
          </div>

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
            <RaceResultsTable results={profile.results} />
            <aside className="grid min-w-0 gap-5">
              <TeammatePanel profile={profile} />
              <DeltaPanel profile={profile} />
            </aside>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <DriverNewsPanel profile={profile} />
          <DriverSocialPanel profile={profile} />
        </section>
      </div>
    </AppShell>
  );
}

function DriverHero({ profile, signedIn }: { profile: DriverProfile; signedIn: boolean }) {
  const teamProfile = getTeamProfileAsset(profile.team.code) ?? getTeamProfileAsset(profile.team.name);

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-[0_18px_70px_rgb(0_0_0_/_0.32)] sm:p-6"
      style={{ borderTopColor: profile.team.color, borderTopWidth: 3 }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-1/2 opacity-20"
        style={{
          background: `radial-gradient(circle at 70% 20%, ${profile.team.color ?? "oklch(var(--primary))"}, transparent 55%)`,
        }}
      />
      <div className="relative grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-stretch">
        <DriverAvatar profile={profile} />

        <div className="grid min-w-0 gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline">Сезон {profile.season}</Badge>
                <Badge variant="secondary">
                  <RaceFlag
                    className="mr-1 align-[-0.08em]"
                    countryCode={profile.countryCode}
                    label={profile.country ?? "Страна"}
                  />
                  {profile.country ?? "Страна уточняется"}
                </Badge>
              </div>
              <h1 className="text-balance font-display text-4xl font-black leading-[0.96] tracking-[-0.04em] sm:text-6xl">
                {profile.fullName}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <Link
                  className="flex items-center gap-2 transition-colors hover:text-foreground"
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
                  {profile.team.name}
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                </Link>
                <span className="font-telemetry">
                  № {profile.number ?? profile.code ?? "—"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <FavoriteAction profile={profile} signedIn={signedIn} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StitchMetric display label="Место" value={formatPosition(profile.stats.championshipPosition)} />
            <StitchMetric display label="Очки" tone="red" value={formatStat(profile.stats.points)} />
            <StitchMetric display label="Победы" value={formatStat(profile.stats.wins)} />
            <StitchMetric display label="Подиумы" value={formatStat(profile.stats.podiums)} />
          </div>
        </div>
      </div>
    </section>
  );
}

function DriverAvatar({ profile }: { profile: DriverProfile }) {
  const avatarUrl = profile.aiAvatarUrl || getLocalDriverAvatar(profile.slug);

  if (avatarUrl) {
    return (
      <div className="relative min-h-[22rem] overflow-hidden rounded-xl border border-border bg-background">
        <Image
          alt={`Аватар ${profile.fullName}`}
          className="object-contain object-bottom"
          fill
          priority
          sizes="(min-width: 1024px) 18rem, 100vw"
          src={avatarUrl}
        />
      </div>
    );
  }

  return (
    <div className="relative grid min-h-[22rem] place-items-center overflow-hidden rounded-xl border border-border bg-background p-5">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(circle at 50% 20%, ${profile.team.color ?? "oklch(var(--primary))"}, transparent 45%)`,
        }}
      />
      <div className="relative grid justify-items-center gap-5 text-center">
        <div className="grid size-28 place-items-center rounded-full border border-border bg-card shadow-[0_0_0_10px_rgb(255_255_255_/_0.03)]">
          <CircleUserRound aria-hidden="true" className="size-16 text-muted-foreground" />
        </div>
        <div>
          <p className="font-telemetry text-5xl font-black">
            {profile.number ?? profile.code ?? "—"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            AI-аватар появится после ручной загрузки
          </p>
        </div>
        <Badge variant="outline">{profile.team.code ?? profile.team.name}</Badge>
      </div>
    </div>
  );
}

const localDriverAvatarSlugs = new Set([
  "alexander-albon",
  "andrea-kimi-antonelli",
  "arvid-lindblad",
  "carlos-sainz",
  "charles-leclerc",
  "esteban-ocon",
  "fernando-alonso",
  "franco-colapinto",
  "gabriel-bortoleto",
  "george-russell",
  "isack-hadjar",
  "lando-norris",
  "lance-stroll",
  "lewis-hamilton",
  "liam-lawson",
  "max-verstappen",
  "nico-hulkenberg",
  "oliver-bearman",
  "oscar-piastri",
  "pierre-gasly",
  "sergio-perez",
  "valtteri-bottas",
]);

function getLocalDriverAvatar(slug: string) {
  return localDriverAvatarSlugs.has(slug) ? `/drivers/avatars/${slug}.png` : null;
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
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
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

function RaceResultsTable({ results }: { results: DriverRaceResultRow[] }) {
  return (
    <StitchPanel>
      <StitchPanelHeader icon={Flag} title="Результаты по этапам" />
      <div className="overflow-x-auto">
        <table className="min-w-[640px] w-full text-sm">
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
    </StitchPanel>
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
  const teammate = profile.teammateComparison.teammateNames.join(", ") || "Напарник уточняется";

  return (
    <StitchPanel>
      <StitchPanelHeader icon={Users} meta={teammate} title="Сравнение с напарником" />
      <div className="grid gap-3 p-4">
        <ComparisonRow label="Квалификации" value={`${profile.teammateComparison.qualifying.driver}:${profile.teammateComparison.qualifying.teammate}`} />
        <ComparisonRow label="Гонки" value={`${profile.teammateComparison.races.driver}:${profile.teammateComparison.races.teammate}`} />
        <ComparisonRow label="Очки" value={`${formatStat(profile.teammateComparison.points.driver)}:${formatStat(profile.teammateComparison.points.teammate)}`} />
        <ComparisonRow label="Подиумы" value={`${profile.teammateComparison.podiums.driver}:${profile.teammateComparison.podiums.teammate}`} />
        <ComparisonRow label="Победы" value={`${profile.teammateComparison.wins.driver}:${profile.teammateComparison.wins.teammate}`} />
        <ComparisonRow label="Средний старт" value={`${formatDecimal(profile.teammateComparison.averageStart.driver)}:${formatDecimal(profile.teammateComparison.averageStart.teammate)}`} />
        <ComparisonRow label="Средний финиш" value={`${formatDecimal(profile.teammateComparison.averageFinish.driver)}:${formatDecimal(profile.teammateComparison.averageFinish.teammate)}`} />
        <ComparisonRow label="Сходы" value={`${profile.teammateComparison.dnfs.driver}:${profile.teammateComparison.dnfs.teammate}`} />
      </div>
    </StitchPanel>
  );
}

function DeltaPanel({ profile }: { profile: DriverProfile }) {
  return (
    <StitchPanel>
      <StitchPanelHeader icon={Sparkles} title="Старт → финиш" />
      <div className="grid gap-3 p-4">
        <StitchMetric label="Суммарно" value={formatDelta(profile.positionDelta.totalDelta)} />
        <StitchMetric label="В среднем" value={formatDelta(profile.positionDelta.averageDelta)} />
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
            className="grid gap-3 rounded-md border border-border/70 p-3 transition-colors hover:bg-accent"
            href={item.href}
            key={item.href}
            prefetch={false}
          >
            <div>
              <Badge variant="outline">{item.source}</Badge>
              <span className="ml-2 text-xs text-muted-foreground">{item.time}</span>
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
            className="rounded-md border border-border/70 p-3 transition-colors hover:bg-accent"
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
