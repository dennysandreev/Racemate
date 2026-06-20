import Link from "next/link";
import {
  Clock3,
  Mail,
  UserRound,
  Users,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { AppShell } from "@/components/racemate/app-shell";
import { TeamColorBar, TeamColorDot } from "@/components/racemate/team-color";
import { TeamLogo } from "@/components/racemate/team-logo";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTeamAsset } from "@/data/f1-assets";
import { ensureProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Пилоты" value={overview.favoriteDrivers.length} />
                <MiniStat label="Команда" value={overview.favoriteTeams.length} />
              </div>
              <Button asChild className="mt-1 w-full justify-center">
                <Link href="/onboarding" prefetch={false}>
                  Изменить профиль
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
            <StitchPanel>
              <div className="grid gap-3 p-4">
                <p className="font-display text-lg font-bold">Настройки болельщика</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Выбери одну команду и до двух пилотов, чтобы собрать личную ленту RaceMate.
                </p>
                <Button asChild className="w-full justify-center" variant="secondary">
                  <Link href="/onboarding" prefetch={false}>
                    Изменить профиль
                  </Link>
                </Button>
              </div>
            </StitchPanel>
          </aside>
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
          .select("driver_id, drivers(id, full_name, teams:current_team_id(id, name, code, color_hex))")
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
