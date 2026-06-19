import { Star } from "lucide-react";

import { saveOnboarding } from "@/app/onboarding/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Button } from "@/components/ui/button";
import { ensureProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const profile = await ensureProfile();
  const supabase = await createSupabaseServerClient();
  const userId = profile?.id;

  const [teams, drivers, favoriteTeams, favoriteDrivers] = await Promise.all([
    supabase
      ?.from("teams")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      ?.from("drivers")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name"),
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
      <PageHeading title="Настройка профиля" />

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StitchPanel>
          <StitchPanelHeader
            icon={Star}
            meta="Эти настройки можно будет поменять позже."
            title="Профиль болельщика"
          />
          <div className="p-5">
            <form action={saveOnboarding} className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium" htmlFor="displayName">
                  Имя
                  <input
                    className="min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    defaultValue={profile?.display_name ?? ""}
                    id="displayName"
                    name="displayName"
                    placeholder="Денис"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium" htmlFor="timezone">
                  Часовой пояс
                  <select
                    className="min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    defaultValue={profile?.timezone ?? "Europe/Moscow"}
                    id="timezone"
                    name="timezone"
                  >
                    <option value="Europe/Moscow">Москва</option>
                    <option value="Europe/Kaliningrad">Калининград</option>
                    <option value="Asia/Yekaterinburg">Екатеринбург</option>
                    <option value="Asia/Novosibirsk">Новосибирск</option>
                    <option value="Asia/Vladivostok">Владивосток</option>
                  </select>
                </label>
              </div>

              <ChoiceGroup
                emptyText="Команды появятся после синхронизации."
                items={(teams?.data ?? []).map((team) => ({
                  id: team.id,
                  label: team.name,
                }))}
                name="teamIds"
                selectedIds={selectedTeamIds}
                title="Любимые команды"
              />
              <ChoiceGroup
                emptyText="Пилоты появятся после синхронизации."
                items={(drivers?.data ?? []).map((driver) => ({
                  id: driver.id,
                  label: driver.full_name,
                }))}
                name="driverIds"
                selectedIds={selectedDriverIds}
                title="Любимые пилоты"
              />

              <Button className="w-full sm:w-fit" type="submit">
                Сохранить профиль
              </Button>
            </form>
          </div>
        </StitchPanel>

        <aside className="grid content-start gap-4">
          <StitchMetric label="Шаг" tone="red" value="1 / 3" />
          <StitchMetric label="Профиль" tone="live" value="Готовится" />
          <StitchPanel>
            <div className="p-4">
              <p className="font-display text-lg font-bold">Что изменится</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                RaceMate будет ближе показывать расписание, любимых пилотов и команды в новостях, прогнозах и таблицах.
              </p>
            </div>
          </StitchPanel>
        </aside>
      </section>
    </AppShell>
  );
}

function ChoiceGroup({
  emptyText,
  items,
  name,
  selectedIds = [],
  title,
}: {
  emptyText: string;
  items: { id: string; label: string }[];
  name: string;
  selectedIds?: string[];
  title: string;
}) {
  const selected = new Set(selectedIds);

  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">{title}</legend>
      {items.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <label
              className="flex min-h-11 items-center gap-2 rounded-md border border-border/70 bg-background/35 px-3 text-sm transition-colors hover:bg-accent"
              key={item.id}
            >
              <input
                defaultChecked={selected.has(item.id)}
                name={name}
                type="checkbox"
                value={item.id}
              />
              {item.label}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </fieldset>
  );
}
