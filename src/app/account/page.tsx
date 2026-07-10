import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Flag,
  Gauge,
  ListChecks,
  LogOut,
  Mail,
  PencilLine,
  Target,
  Trophy,
  UserRound,
  Users,
  Vote,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { AppShell } from "@/components/racemate/app-shell";
import { signOut } from "@/app/auth/actions";
import { DriverAvatarBadge } from "@/components/racemate/driver-avatar-badge";
import { TeamLogo } from "@/components/racemate/team-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTeamAsset } from "@/data/f1-assets";
import {
  getConstructorChampionshipMatrix,
  getDriverChampionshipMatrix,
  getPredictionState,
} from "@/data/racemate-repository";
import { ensureProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type TeamRelation = {
  id?: string | null;
  name: string;
  code?: string | null;
  color_hex?: string | null;
};

type DriverRelation = {
  id?: string | null;
  full_name: string;
  slug?: string | null;
  teams: TeamRelation | TeamRelation[] | null;
};

type FavoriteTeamRow = {
  team_id: string;
  teams: TeamRelation | TeamRelation[] | null;
};

type FavoriteDriverRow = {
  driver_id: string;
  drivers: DriverRelation | DriverRelation[] | null;
};

type FavoriteTeam = {
  id: string;
  name: string;
  code?: string;
  color?: string;
  logo?: string;
  championshipPosition?: number;
  championshipPoints?: number;
  wins?: number;
};

type FavoriteDriver = {
  id: string;
  name: string;
  slug?: string;
  team: string;
  teamCode?: string;
  teamColor?: string;
  championshipPosition?: number;
  championshipPoints?: number;
};

export default async function AccountPage() {
  const profile = await ensureProfile();
  const displayName =
    profile?.display_name?.trim() ||
    profile?.email?.split("@")[0] ||
    "Гость RaceMate";
  const email = profile?.email ?? "Почта не указана";
  const timezone = profile?.timezone ?? "Europe/Moscow";
  const [overview, predictionState, driversMatrix, constructorsMatrix, extras] = await Promise.all([
    getAccountOverview(profile?.id ?? null),
    getPredictionState(profile?.id ?? null),
    getDriverChampionshipMatrix(),
    getConstructorChampionshipMatrix(),
    getAccountExtras(profile?.id ?? null),
  ]);
  const favoriteDrivers = enrichFavoriteDrivers(overview.favoriteDrivers, driversMatrix.rows);
  const favoriteTeams = enrichFavoriteTeams(overview.favoriteTeams, constructorsMatrix.rows);
  const accentColor = favoriteTeams[0]?.color ?? favoriteDrivers[0]?.teamColor ?? null;
  const summary = predictionState.seasonSummary;
  const averageScore = summary.scoredPredictionCount
    ? Math.round(((summary.totalScore ?? 0) / summary.scoredPredictionCount) * 10) / 10
    : null;

  return (
    <AppShell>
      <section className="grid gap-4 py-6 sm:gap-5">
        <section className="stitch-panel relative overflow-hidden p-5 sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at 14% 0%, ${hexWithAlpha(accentColor, 0.28) ?? "rgb(225 6 0 / 0.24)"}, transparent 24rem), radial-gradient(circle at 90% 110%, rgb(225 6 0 / 0.12), transparent 20rem), linear-gradient(135deg, rgb(255 255 255 / 0.07), transparent 42%)`,
            }}
          />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="flex min-w-0 items-start gap-4 sm:gap-5">
              <span
                aria-hidden="true"
                className="grid size-16 shrink-0 place-items-center rounded-full border-2 bg-[oklch(0.21_0.014_250)] font-display text-xl font-extrabold sm:size-20 sm:text-2xl"
                style={{ borderColor: accentColor ?? "var(--primary)" }}
              >
                {getInitials(displayName)}
              </span>
              <div className="min-w-0">
                <p className="font-telemetry text-xs font-bold uppercase tracking-[0.12em] text-primary">
                  Личный кабинет
                </p>
                <h1 className="mt-1.5 max-w-3xl text-balance font-display text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-4xl">
                  {displayName}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <ProfileChip icon={Mail} value={email} />
                  <ProfileChip icon={Clock3} value={formatTimezone(timezone)} />
                  {extras.memberSince ? (
                    <ProfileChip icon={CalendarDays} value={`В RaceMate с ${extras.memberSince}`} />
                  ) : null}
                </div>
              </div>
            </div>
            <div className="relative grid w-full shrink-0 grid-cols-2 gap-2 sm:w-auto">
              <Button asChild>
                <Link href="/onboarding" prefetch={false}>
                  <PencilLine aria-hidden="true" data-icon="inline-start" />
                  Изменить
                </Link>
              </Button>
              <form action={signOut}>
                <Button className="w-full" type="submit" variant="secondary">
                  Выйти
                  <LogOut aria-hidden="true" data-icon="inline-end" />
                </Button>
              </form>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          <StatTile
            hint="за сезон"
            icon={Target}
            label="Очки прогнозов"
            value={summary.totalScore !== null ? formatNumber(summary.totalScore) : "—"}
          />
          <StatTile
            hint={summary.scoredPredictionCount ? `${summary.scoredPredictionCount} с результатом` : "пока без результатов"}
            icon={ListChecks}
            label="Прогнозов сделано"
            value={String(summary.predictionCount)}
          />
          <StatTile
            hint="очков за этап"
            icon={Gauge}
            label="Средний результат"
            value={averageScore !== null ? formatNumber(averageScore) : "—"}
          />
          <StatTile
            hint="в опросах RaceMate"
            icon={Vote}
            label="Голосов отдано"
            value={String(extras.pollVotes)}
          />
        </div>

        <section className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.55fr)] xl:items-start">
          <NextRacePanel
            hasPrediction={predictionState.current !== null}
            race={predictionState.race}
          />
          <QuickLinksPanel />
        </section>

        <section className="grid gap-4 sm:gap-5 xl:grid-cols-2 xl:items-start">
          <FavoriteDriversPanel drivers={favoriteDrivers} />
          <FavoriteTeamsPanel teams={favoriteTeams} />
        </section>
      </section>
    </AppShell>
  );
}

async function getAccountOverview(userId: string | null) {
  const supabase = await createSupabaseServerClient();
  const [favoriteTeamsResult, favoriteDriversResult] = await Promise.all([
    userId
      ? supabase
          ?.from("user_favorite_teams")
          .select("team_id, teams(id, name, code, color_hex)")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
      : null,
    userId
      ? supabase
          ?.from("user_favorite_drivers")
          .select("driver_id, drivers(id, full_name, slug, teams:current_team_id(id, name, code, color_hex))")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
      : null,
  ]);

  return {
    favoriteTeams: ((favoriteTeamsResult?.data ?? []) as unknown as FavoriteTeamRow[])
      .map(mapFavoriteTeam)
      .filter(Boolean) as FavoriteTeam[],
    favoriteDrivers: ((favoriteDriversResult?.data ?? []) as unknown as FavoriteDriverRow[])
      .map(mapFavoriteDriver)
      .filter(Boolean) as FavoriteDriver[],
  };
}

async function getAccountExtras(userId: string | null) {
  const supabase = await createSupabaseServerClient();

  if (!supabase || !userId) {
    return { memberSince: null as string | null, pollVotes: 0 };
  }

  const [votesResult, profileResult] = await Promise.all([
    supabase
      .from("poll_votes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
  ]);
  const createdAt = (profileResult?.data as { created_at?: string | null } | null)?.created_at ?? null;

  return {
    memberSince: createdAt ? formatMonthYear(createdAt) : null,
    pollVotes: votesResult?.count ?? 0,
  };
}

function enrichFavoriteDrivers(
  favorites: FavoriteDriver[],
  matrixRows: Awaited<ReturnType<typeof getDriverChampionshipMatrix>>["rows"],
) {
  return favorites.map((favorite) => {
    const row = matrixRows.find(
      (candidate) =>
        (favorite.slug && candidate.driverSlug === favorite.slug) ||
        candidate.driver.toLowerCase() === favorite.name.toLowerCase(),
    );

    return {
      ...favorite,
      championshipPoints: row?.total,
      championshipPosition: row?.position,
    };
  });
}

function enrichFavoriteTeams(
  favorites: FavoriteTeam[],
  matrixRows: Awaited<ReturnType<typeof getConstructorChampionshipMatrix>>["rows"],
) {
  return favorites.map((favorite) => {
    const favoriteName = favorite.name.toLowerCase();
    const row = matrixRows.find((candidate) => {
      const candidateName = candidate.team.toLowerCase();

      return (
        (favorite.code && candidate.teamCode === favorite.code) ||
        candidateName === favoriteName ||
        candidateName.includes(favoriteName) ||
        favoriteName.includes(candidateName)
      );
    });

    return {
      ...favorite,
      championshipPoints: row?.points,
      championshipPosition: row?.position,
      wins: row?.wins,
    };
  });
}

function StatTile({
  hint,
  icon: Icon,
  label,
  value,
}: {
  hint: string;
  icon: IconComponent;
  label: string;
  value: string;
}) {
  return (
    <article className="stitch-panel p-3.5 sm:p-4">
      <p className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        <span className="stitch-label text-[0.58rem] text-muted-foreground sm:text-[0.62rem]">{label}</span>
      </p>
      <p className="font-telemetry mt-2.5 text-2xl font-extrabold leading-none sm:text-3xl">{value}</p>
      <p className="mt-1.5 text-[0.65rem] font-semibold text-muted-foreground sm:text-xs">{hint}</p>
    </article>
  );
}

function NextRacePanel({
  hasPrediction,
  race,
}: {
  hasPrediction: boolean;
  race: Awaited<ReturnType<typeof getPredictionState>>["race"];
}) {
  return (
    <section className="stitch-panel relative overflow-hidden p-4 sm:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_0%,rgb(225_6_0_/_0.16),transparent_16rem)]"
      />
      <div className="relative">
        <p className="stitch-label flex items-center gap-2 text-muted-foreground">
          <Flag aria-hidden="true" className="size-3.5 text-primary" />
          Ближайший этап
        </p>
        {race ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">{race.name}</h2>
              <span
                className={cn(
                  "font-telemetry rounded border px-2 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.08em]",
                  hasPrediction
                    ? "border-[rgba(57,255,20,0.4)] bg-[rgba(57,255,20,0.1)] text-[rgb(97,255,75)]"
                    : "border-amber-300/50 bg-amber-400/10 text-amber-300",
                )}
              >
                {hasPrediction ? "Прогноз сделан" : "Прогноза нет"}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-muted-foreground">
              Старт гонки: {race.startsAt}
              {race.raceLocked
                ? " · приём прогнозов закрыт"
                : race.poleLocked
                  ? " · прогноз на поул закрыт"
                  : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {!race.raceLocked ? (
                <Button asChild>
                  <Link href="/predictions" prefetch={false}>
                    {hasPrediction ? "Изменить прогноз" : "Сделать прогноз"}
                    <ChevronRight aria-hidden="true" data-icon="inline-end" />
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="secondary">
                <Link href="/weekend" prefetch={false}>
                  Страница этапа
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Расписание следующего этапа появится здесь, как только откроется уик-энд.
          </p>
        )}
      </div>
    </section>
  );
}

function QuickLinksPanel() {
  const links = [
    { href: "/fantasy", icon: Trophy, label: "Фэнтези-лига" },
    { href: "/leagues", icon: Users, label: "Мои лиги" },
    { href: "/polls", icon: Vote, label: "Опросы" },
    { href: "/calendar", icon: CalendarDays, label: "Календарь сезона" },
  ];

  return (
    <section className="stitch-panel p-2">
      <p className="stitch-label px-2 pb-1 pt-2 text-muted-foreground">Быстрые переходы</p>
      <div className="grid">
        {links.map((link) => (
          <Link
            className="group flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/60"
            href={link.href}
            key={link.href}
            prefetch={false}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40">
              <link.icon aria-hidden="true" className="size-4 text-primary" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{link.label}</span>
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

function FavoriteDriversPanel({ drivers }: { drivers: FavoriteDriver[] }) {
  return (
    <section className="stitch-panel min-w-0 overflow-hidden p-0">
      <PanelHeader
        icon={UserRound}
        meta="RaceMate держит их ближе в новостях и прогнозах"
        title="Любимые пилоты"
      />
      <div className="grid gap-2 p-3 sm:grid-cols-2 sm:gap-3 sm:p-4 xl:grid-cols-1">
        {drivers.length ? (
          drivers.map((driver) => (
            <FavoriteCard
              badge={
                driver.championshipPosition
                  ? `P${driver.championshipPosition} · ${formatNumber(driver.championshipPoints ?? 0)} очк.`
                  : undefined
              }
              href={driver.slug ? `/drivers/${driver.slug}` : undefined}
              key={driver.id}
              media={
                <DriverAvatarBadge
                  className="size-11"
                  color={driver.teamColor}
                  name={driver.name}
                  sizes="2.75rem"
                  slug={driver.slug}
                />
              }
              subtitle={driver.team}
              title={driver.name}
            />
          ))
        ) : (
          <EmptyFavorites text="Выбери пилотов, и здесь появятся их позиции в чемпионате." />
        )}
      </div>
    </section>
  );
}

function FavoriteTeamsPanel({ teams }: { teams: FavoriteTeam[] }) {
  return (
    <section className="stitch-panel min-w-0 overflow-hidden p-0">
      <PanelHeader
        icon={Users}
        meta="Персональные акценты в ленте и отчетах"
        title="Любимые команды"
      />
      <div className="grid gap-2 p-3 sm:gap-3 sm:p-4">
        {teams.length ? (
          teams.map((team) => (
            <FavoriteCard
              badge={
                team.championshipPosition
                  ? `P${team.championshipPosition} · ${formatNumber(team.championshipPoints ?? 0)} очк.${
                      team.wins ? ` · ${team.wins} ${pluralize(team.wins, ["победа", "победы", "побед"])}` : ""
                    }`
                  : undefined
              }
              key={team.id}
              media={<TeamLogo code={team.code} color={team.color} logo={team.logo} name={team.name} size="sm" />}
              title={team.name}
            />
          ))
        ) : (
          <EmptyFavorites text="Добавь команды, чтобы кабинет подсвечивал их результаты." />
        )}
      </div>
    </section>
  );
}

function FavoriteCard({
  badge,
  href,
  media,
  subtitle,
  title,
}: {
  badge?: string;
  href?: string;
  media: ReactNode;
  subtitle?: string;
  title: string;
}) {
  const body = (
    <>
      {media}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-xs font-semibold text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      {badge ? (
        <span className="font-telemetry shrink-0 rounded border border-border/70 bg-secondary/40 px-1.5 py-1 text-[0.62rem] font-extrabold">
          {badge}
        </span>
      ) : null}
      {href ? (
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
    </>
  );
  const className =
    "flex min-w-0 items-center gap-3 rounded-md border border-border/70 bg-background/35 p-3 transition-colors";

  if (href) {
    return (
      <Link className={cn(className, "hover:border-primary/40 hover:bg-accent/50")} href={href} prefetch={false}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

function PanelHeader({
  icon: Icon,
  meta,
  title,
}: {
  icon: IconComponent;
  meta: string;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b stitch-divider p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40">
        <Icon aria-hidden="true" className="size-4.5 text-primary" />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-bold leading-tight">{title}</h2>
        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{meta}</p>
      </div>
    </div>
  );
}

function EmptyFavorites({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border/80 bg-background/25 p-4 sm:col-span-2">
      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
      <Button asChild className="mt-3" size="sm" variant="secondary">
        <Link href="/onboarding" prefetch={false}>
          Выбрать пилотов и команды
        </Link>
      </Button>
    </div>
  );
}

function ProfileChip({ icon: Icon, value }: { icon: IconComponent; value: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-background/40 px-2 py-1">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate text-xs font-semibold text-foreground">{value}</span>
    </span>
  );
}

function mapFavoriteTeam(row: FavoriteTeamRow): FavoriteTeam | null {
  const team = firstRelation(row.teams);

  if (!team) {
    return null;
  }

  const asset = getTeamAsset(team.code) ?? getTeamAsset(team.name);

  return {
    id: row.team_id,
    name: asset?.name ?? team.name,
    code: asset?.code ?? team.code ?? undefined,
    color: team.color_hex ?? asset?.color,
    logo: asset?.logo,
  };
}

function mapFavoriteDriver(row: FavoriteDriverRow): FavoriteDriver | null {
  const driver = firstRelation(row.drivers);

  if (!driver) {
    return null;
  }

  const team = firstRelation(driver.teams);
  const asset = getTeamAsset(team?.code) ?? getTeamAsset(team?.name);

  return {
    id: row.driver_id,
    name: driver.full_name,
    slug: driver.slug ?? undefined,
    team: asset?.name ?? team?.name ?? "Команда уточняется",
    teamCode: asset?.code ?? team?.code ?? undefined,
    teamColor: team?.color_hex ?? asset?.color,
  };
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTimezone(timezone: string) {
  const labels: Record<string, string> = {
    "Europe/Moscow": "Москва",
    "Europe/Kaliningrad": "Калининград",
    "Asia/Yekaterinburg": "Екатеринбург",
    "Asia/Novosibirsk": "Новосибирск",
    "Asia/Vladivostok": "Владивосток",
  };

  return labels[timezone] ?? timezone;
}

function formatMonthYear(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // Формат с днем дает родительный падеж месяца («июля»); день отбрасываем.
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(date)
    .replace(" г.", "")
    .split(" ")
    .slice(1)
    .join(" ");
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "R"
  );
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

function pluralize(value: number, forms: [string, string, string]) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return forms[0];
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1];
  }

  return forms[2];
}
