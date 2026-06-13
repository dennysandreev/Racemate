import { Star } from "lucide-react";

import { saveOnboarding } from "@/app/onboarding/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ensureProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const profile = await ensureProfile();
  const supabase = await createSupabaseServerClient();

  const [teams, drivers] = await Promise.all([
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
  ]);

  return (
    <AppShell>
      <PageHeading
        badge="Первый круг"
        description="Настроим профиль, чтобы RaceMate показывал время и любимые команды ближе к тебе."
        title="Собери свой RaceMate"
      />

      <section className="py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star aria-hidden="true" data-icon="inline-start" />
              Профиль болельщика
            </CardTitle>
            <CardDescription>
              Эти настройки можно будет поменять позже.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                title="Любимые команды"
              />
              <ChoiceGroup
                emptyText="Пилоты появятся после синхронизации."
                items={(drivers?.data ?? []).map((driver) => ({
                  id: driver.id,
                  label: driver.full_name,
                }))}
                name="driverIds"
                title="Любимые пилоты"
              />

              <Button className="w-full sm:w-fit" type="submit">
                Продолжить
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}

function ChoiceGroup({
  emptyText,
  items,
  name,
  title,
}: {
  emptyText: string;
  items: { id: string; label: string }[];
  name: string;
  title: string;
}) {
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">{title}</legend>
      {items.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <label
              className="flex min-h-11 items-center gap-2 rounded-md border border-border/70 px-3 text-sm"
              key={item.id}
            >
              <input name={name} type="checkbox" value={item.id} />
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
