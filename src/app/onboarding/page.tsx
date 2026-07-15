import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Save,
  UserRound,
} from "lucide-react";

import { saveOnboarding } from "@/app/onboarding/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { FavoriteChoiceGroups } from "@/components/racemate/favorite-choice-groups";
import { Button } from "@/components/ui/button";
import { getCurrentSeasonPredictionOptions } from "@/data/racemate-repository";
import { getTeamAsset } from "@/data/f1-assets";
import { ensureProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OnboardingPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const [{ error }, profile] = await Promise.all([searchParams, ensureProfile()]);
  const supabase = await createSupabaseServerClient();
  const userId = profile?.id;

  const [options, favoriteTeams, favoriteDrivers] = await Promise.all([
    getCurrentSeasonPredictionOptions(supabase ?? undefined),
    userId
      ? supabase
          ?.from("user_favorite_teams")
          .select("team_id")
          .eq("user_id", userId)
      : null,
    userId
      ? supabase
          ?.from("user_favorite_drivers")
          .select("driver_id")
          .eq("user_id", userId)
      : null,
  ]);
  const selectedTeamIds = (favoriteTeams?.data ?? []).map((item) => item.team_id);
  const selectedDriverIds = (favoriteDrivers?.data ?? []).map((item) => item.driver_id);

  return (
    <AppShell>
      <div className="grid gap-5 pb-8">
        <section className="stitch-panel relative overflow-hidden p-0">
          <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgb(225_6_0_/_0.2),transparent_24rem)]"
          />
          <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-3xl">
              <p className="stitch-label flex items-center gap-2 text-primary">
                <UserRound aria-hidden="true" className="size-4" />
                Профиль RaceMate
              </p>
              <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-normal sm:text-4xl">
                Настройка профиля
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Укажи свое время и фаворитов — так расписание и персональные ленты будут полезнее.
              </p>
            </div>
            <ul className="grid gap-2 text-sm font-semibold text-muted-foreground sm:grid-cols-3 lg:grid-cols-1">
              <li className="flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="size-4 text-success" /> Одна команда</li>
              <li className="flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="size-4 text-success" /> До двух пилотов</li>
              <li className="flex items-center gap-2"><Clock3 aria-hidden="true" className="size-4 text-primary" /> Местное время</li>
            </ul>
          </div>
        </section>

        <form action={saveOnboarding} className="stitch-panel overflow-hidden p-0">
          {error ? (
            <div className="flex items-start gap-3 border-b border-danger/30 bg-danger/10 px-5 py-4 text-sm text-danger sm:px-6">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>Не получилось сохранить выбор. Проверь имя и выбери не больше одной команды и двух пилотов.</p>
            </div>
          ) : null}

          <section className="grid gap-5 p-5 sm:p-6">
            <div>
              <p className="stitch-label text-primary">Основное</p>
              <h2 className="mt-2 font-display text-xl font-extrabold">Как обращаться и показывать время</h2>
              <p className="mt-1 text-sm text-muted-foreground">Имя увидят участники лиг, а часовой пояс применится к расписанию.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold" htmlFor="displayName">
                Имя или ник
                <input
                  autoComplete="nickname"
                  className="min-h-12 rounded-md border border-input bg-background/55 px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
                  defaultValue={profile?.display_name ?? ""}
                  id="displayName"
                  maxLength={40}
                  name="displayName"
                  placeholder="Как к тебе обращаться"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold" htmlFor="timezone">
                Часовой пояс
                <select
                  className="min-h-12 rounded-md border border-input bg-background/55 px-3.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  defaultValue={profile?.timezone ?? "Europe/Moscow"}
                  id="timezone"
                  name="timezone"
                >
                  <option value="Europe/Kaliningrad">Калининград · UTC+2</option>
                  <option value="Europe/Moscow">Москва · UTC+3</option>
                  <option value="Asia/Yekaterinburg">Екатеринбург · UTC+5</option>
                  <option value="Asia/Novosibirsk">Новосибирск · UTC+7</option>
                  <option value="Asia/Vladivostok">Владивосток · UTC+10</option>
                </select>
              </label>
            </div>
          </section>

          <FavoriteChoiceGroups
            drivers={options.drivers.map((driver) => {
              const teamAsset = getTeamAsset(driver.teamCode ?? driver.team);

              return {
                code: driver.code,
                color: teamAsset?.color,
                id: driver.id,
                label: driver.name,
                slug: driver.slug,
                team: teamAsset?.name ?? driver.team,
              };
            })}
            selectedDriverIds={selectedDriverIds}
            selectedTeamId={selectedTeamIds[0]}
            teams={options.teams.map((team) => {
              const asset = getTeamAsset(team.code ?? team.name);

              return {
                code: asset?.code ?? team.code,
                color: asset?.color,
                id: team.id,
                label: asset?.name ?? team.name,
                logo: asset?.logo,
              };
            })}
          />

          <footer className="flex flex-col gap-4 border-t stitch-divider bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Сохрани изменения — новости, соцсети и расписание сразу подстроятся под твой выбор.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {profile?.onboarding_completed ? (
                <Button asChild variant="secondary">
                  <Link href="/account" prefetch={false}>Вернуться в профиль</Link>
                </Button>
              ) : null}
              <Button type="submit">
                <Save aria-hidden="true" data-icon="inline-start" />
                Сохранить
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </AppShell>
  );
}
