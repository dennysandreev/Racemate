import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  Settings,
  Trophy,
  UserRound,
  Users,
  Vote,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { AppShell } from "@/components/racemate/app-shell";
import { TeamColorBar, TeamColorDot } from "@/components/racemate/team-color";
import { TeamLogo } from "@/components/racemate/team-logo";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
  StitchStatusBadge,
} from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTeamAsset } from "@/data/f1-assets";
import {
  getNextSession,
  getPredictionState,
} from "@/data/racemate-repository";
import { ensureProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PredictionState } from "@/types/racemate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamRelation = {
  id?: string | null;
  name: string;
  code?: string | null;
  color_hex?: string | null;
};

type DriverRelation = {
  id?: string | null;
  full_name: string;
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
};

type FavoriteDriver = {
  id: string;
  name: string;
  team: string;
  teamCode?: string;
  teamColor?: string;
};

const quickLinks = [
  {
    href: "/onboarding",
    icon: Settings,
    label: "Настроить профиль",
    text: "Обновить имя, часовой пояс, пилотов и команды.",
  },
  {
    href: "/fantasy",
    icon: Trophy,
    label: "Фентази лига",
    text: "Проверить прогноз и лиги друзей.",
  },
  {
    href: "/polls",
    icon: Vote,
    label: "Опросы",
    text: "Ответить на свежие вопросы по сезону.",
  },
];

export default async function AccountPage() {
  const profile = await ensureProfile();
  const displayName =
    profile?.display_name?.trim() ||
    profile?.email?.split("@")[0] ||
    "Гость RaceMate";
  const email = profile?.email ?? "Почта не указана";
  const timezone = profile?.timezone ?? "Europe/Moscow";
  const overview = await getAccountOverview(profile?.id ?? null);
  const favoriteCount = overview.favoriteDrivers.length + overview.favoriteTeams.length;
  const profileReady = Boolean(profile?.onboarding_completed);

  return (
    <AppShell>
      <section className="grid gap-5 py-6">
        <section className="stitch-panel relative overflow-hidden p-5 sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgb(225_6_0_/_0.24),transparent_22rem),linear-gradient(135deg,rgb(255_255_255_/_0.08),transparent_42%)]" />
          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-end">
            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant={profileReady ? "success" : "warning"}>
                  {profileReady ? "Профиль готов" : "Нужно настроить"}
                </Badge>
                <Badge variant="outline">Личный кабинет</Badge>
              </div>
              <p className="font-telemetry mb-3 text-xs font-bold uppercase tracking-[0.12em] text-primary">
                RaceMate Account
              </p>
              <h1 className="font-display max-w-4xl text-balance text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
                {displayName}
              </h1>
              <div className="mt-5 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                <ProfileFact icon={Mail} label="Почта" value={email} />
                <ProfileFact
                  icon={Clock3}
                  label="Часовой пояс"
                  value={formatTimezone(timezone)}
                />
              </div>
            </div>
            <div className="grid gap-3 rounded-lg border border-border bg-background/45 p-4 backdrop-blur">
              <p className="stitch-label text-muted-foreground">Пульс профиля</p>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Пилоты" value={overview.favoriteDrivers.length} />
                <MiniStat label="Команды" value={overview.favoriteTeams.length} />
                <MiniStat label="Лиги" value={overview.leagueCount} />
              </div>
              <Button asChild className="mt-1 w-full justify-center">
                <Link href="/onboarding" prefetch={false}>
                  Сохранить настройки
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
          <div className="grid min-w-0 gap-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <FavoriteDriversPanel drivers={overview.favoriteDrivers} />
              <FavoriteTeamsPanel teams={overview.favoriteTeams} />
            </div>
            <QuickActions />
          </div>

          <aside className="grid content-start gap-4">
            <StitchMetric
              label="Профиль"
              tone={profileReady ? "live" : "warning"}
              value={profileReady ? "Готов" : "Нужно настроить"}
            />
            <StitchMetric
              label="Избранное"
              tone={favoriteCount ? "red" : "neutral"}
              value={`${favoriteCount} выбрано`}
            />
            <NextSessionPanel
              circuit={overview.nextSession.circuit}
              race={overview.nextSession.race}
              session={overview.nextSession.session}
              startsAt={overview.nextSession.startsAt}
              status={overview.nextSession.status}
            />
            <PredictionPanel predictionState={overview.predictionState} />
            <LeaguePanel leagueCount={overview.leagueCount} />
          </aside>
        </section>
      </section>
    </AppShell>
  );
}

async function getAccountOverview(userId: string | null) {
  const supabase = await createSupabaseServerClient();
  const [
    favoriteTeamsResult,
    favoriteDriversResult,
    leagueCountResult,
    nextSession,
    predictionState,
  ] = await Promise.all([
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
          .select("driver_id, drivers(id, full_name, teams:current_team_id(id, name, code, color_hex))")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
      : null,
    userId
      ? supabase
          ?.from("prediction_league_members")
          .select("league_id", { count: "exact", head: true })
          .eq("user_id", userId)
      : null,
    getNextSession(),
    getPredictionState(userId),
  ]);

  return {
    favoriteTeams: ((favoriteTeamsResult?.data ?? []) as unknown as FavoriteTeamRow[])
      .map(mapFavoriteTeam)
      .filter(Boolean) as FavoriteTeam[],
    favoriteDrivers: ((favoriteDriversResult?.data ?? []) as unknown as FavoriteDriverRow[])
      .map(mapFavoriteDriver)
      .filter(Boolean) as FavoriteDriver[],
    leagueCount: leagueCountResult?.count ?? 0,
    nextSession,
    predictionState,
  };
}

function FavoriteDriversPanel({ drivers }: { drivers: FavoriteDriver[] }) {
  return (
    <StitchPanel className="min-w-0">
      <StitchPanelHeader
        icon={UserRound}
        meta="Пилоты, которых RaceMate будет держать ближе в новостях и прогнозах."
        title="Любимые пилоты"
      />
      <div className="grid gap-3 p-4">
        {drivers.length ? (
          drivers.map((driver) => (
            <div
              className="flex min-w-0 items-center gap-3 rounded-md border border-border/70 bg-background/35 p-3"
              key={driver.id}
            >
              <TeamColorBar className="h-9 w-1" color={driver.teamColor} />
              <div className="min-w-0">
                <p className="truncate font-medium">{driver.name}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">{driver.team}</p>
              </div>
            </div>
          ))
        ) : (
          <EmptyFavorites
            href="/onboarding"
            text="Выбери пилотов, и они появятся здесь с цветами своих команд."
          />
        )}
      </div>
    </StitchPanel>
  );
}

function FavoriteTeamsPanel({ teams }: { teams: FavoriteTeam[] }) {
  return (
    <StitchPanel className="min-w-0">
      <StitchPanelHeader
        icon={Users}
        meta="Команды для персональных акцентов в RaceMate."
        title="Любимые команды"
      />
      <div className="grid gap-3 p-4">
        {teams.length ? (
          teams.map((team) => (
            <div
              className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border/70 bg-background/35 p-3"
              key={team.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <TeamLogo
                  code={team.code}
                  color={team.color}
                  logo={team.logo}
                  name={team.name}
                  size="sm"
                />
                <span className="min-w-0 truncate font-medium">{team.name}</span>
              </div>
              <TeamColorDot className="size-3" color={team.color} />
            </div>
          ))
        ) : (
          <EmptyFavorites
            href="/onboarding"
            text="Добавь команды, чтобы личный кабинет стал ближе к твоему сезону."
          />
        )}
      </div>
    </StitchPanel>
  );
}

function NextSessionPanel({
  circuit,
  race,
  session,
  startsAt,
  status,
}: {
  circuit: string;
  race: string;
  session: string;
  startsAt: string;
  status: string;
}) {
  return (
    <StitchPanel>
      <StitchPanelHeader icon={CalendarClock} title="Ближайшая сессия" />
      <div className="grid gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-display text-xl font-bold">{session}</p>
          <StitchStatusBadge tone={status === "Live" ? "live" : "warning"}>
            {status}
          </StitchStatusBadge>
        </div>
        <p className="text-sm text-muted-foreground">{race}</p>
        <div className="grid gap-2 rounded-md border border-border/70 bg-background/35 p-3 text-sm">
          <ProfileFact icon={Clock3} label="Старт" value={startsAt} />
          <ProfileFact icon={Trophy} label="Трасса" value={circuit} />
        </div>
      </div>
    </StitchPanel>
  );
}

function PredictionPanel({
  predictionState,
}: {
  predictionState: PredictionState;
}) {
  const driversById = new Map(
    predictionState.drivers.map((driver) => [driver.id, driver.name]),
  );
  const picks = [
    ["Победитель", predictionState.current?.winnerDriverId],
    ["Поул", predictionState.current?.poleDriverId],
    ["Лучший круг", predictionState.current?.fastestLapDriverId],
    ["Первый сход", predictionState.current?.dnfDriverId],
  ].map(([label, driverId]) => ({
    label,
    value: driverId ? driversById.get(driverId) ?? "Пилот выбран" : "Не выбран",
  }));
  const completed = picks.filter((pick) => pick.value !== "Не выбран").length;

  return (
    <StitchPanel>
      <StitchPanelHeader
        action={<Badge variant="outline">{completed} / {picks.length}</Badge>}
        icon={Trophy}
        title="Прогноз на этап"
      />
      <div className="grid gap-3 p-4">
        {predictionState.race ? (
          <p className="font-medium">{predictionState.race.name}</p>
        ) : null}
        <div className="grid gap-2">
          {picks.map((pick) => (
            <div
              className="flex items-center justify-between gap-3 text-sm"
              key={pick.label}
            >
              <span className="text-muted-foreground">{pick.label}</span>
              <span className="min-w-0 truncate text-right font-medium">{pick.value}</span>
            </div>
          ))}
        </div>
        <Button asChild className="w-full justify-center" variant="secondary">
          <Link href="/fantasy" prefetch={false}>
            Открыть фентази
          </Link>
        </Button>
      </div>
    </StitchPanel>
  );
}

function LeaguePanel({ leagueCount }: { leagueCount: number }) {
  return (
    <StitchPanel>
      <div className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="stitch-label text-muted-foreground">Лиги</p>
            <p className="mt-2 font-display text-2xl font-bold">
              {leagueCount ? `${leagueCount} активных` : "Пока без лиг"}
            </p>
          </div>
          <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Создай лигу или вступи по коду, чтобы сравнивать прогнозы с друзьями.
        </p>
      </div>
    </StitchPanel>
  );
}

function QuickActions() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {quickLinks.map((item) => (
        <QuickActionCard
          href={item.href}
          icon={item.icon}
          key={item.href}
          label={item.label}
          text={item.text}
        />
      ))}
    </div>
  );
}

function QuickActionCard({
  href,
  icon: Icon,
  label,
  text,
}: {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  text: string;
}) {
  return (
    <Link
      className="stitch-panel group grid gap-3 p-4 transition-colors hover:border-primary/70 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
      prefetch={false}
    >
      <span className="grid size-10 place-items-center rounded-md bg-primary/12 text-primary transition-transform group-hover:scale-105">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="font-display text-base font-bold">{label}</span>
      <span className="text-sm leading-6 text-muted-foreground">{text}</span>
    </Link>
  );
}

function EmptyFavorites({ href, text }: { href: string; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border/80 bg-background/25 p-4">
      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
      <Button asChild className="mt-3" size="sm" variant="secondary">
        <Link href={href} prefetch={false}>
          Выбрать пилотов и команды
        </Link>
      </Button>
    </div>
  );
}

function ProfileFact({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/70 bg-background/35 p-3">
      <p className="font-telemetry text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
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
