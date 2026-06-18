import Link from "next/link";
import { Clock3, Mail, Settings, Trophy, UserRound, Vote } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { DataRow } from "@/components/racemate/data-row";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Button } from "@/components/ui/button";
import { ensureProfile } from "@/lib/auth";

const quickLinks = [
  {
    href: "/fantasy",
    icon: Trophy,
    label: "Фентази лига",
    text: "Прогнозы, лиги и очки друзей.",
  },
  {
    href: "/onboarding",
    icon: Settings,
    label: "Настройка профиля",
    text: "Имя, часовой пояс, любимые команды и пилоты.",
  },
  {
    href: "/polls",
    icon: Vote,
    label: "Опросы",
    text: "Голосования по гонкам и главным историям сезона.",
  },
];

export default async function AccountPage() {
  const profile = await ensureProfile();
  const displayName = profile?.display_name?.trim() || profile?.email?.split("@")[0] || "Гость RaceMate";
  const email = profile?.email ?? "Почта не указана";
  const timezone = profile?.timezone ?? "Europe/Moscow";

  return (
    <AppShell>
      <PageHeading title="Личный кабинет" />

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 gap-5">
          <StitchPanel>
            <StitchPanelHeader
              icon={UserRound}
              meta="Здесь собраны профиль и быстрые переходы к личным разделам RaceMate."
              title={displayName}
            />
            <div className="grid gap-3 p-5">
              <DataRow
                label="Почта"
                value={
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Mail aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{email}</span>
                  </span>
                }
              />
              <DataRow
                label="Часовой пояс"
                value={
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Clock3 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{timezone}</span>
                  </span>
                }
              />
              <div className="pt-2">
                <Button asChild>
                  <Link href="/onboarding" prefetch={false}>
                    Настроить профиль
                  </Link>
                </Button>
              </div>
            </div>
          </StitchPanel>

          <div className="grid gap-3 md:grid-cols-3">
            {quickLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  className="stitch-panel group grid gap-3 p-4 transition-colors hover:border-primary/70 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={item.href}
                  key={item.href}
                  prefetch={false}
                >
                  <span className="grid size-10 place-items-center rounded-md bg-primary/12 text-primary transition-transform group-hover:scale-105">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="font-display text-base font-bold">{item.label}</span>
                  <span className="text-sm leading-6 text-muted-foreground">{item.text}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <StitchMetric
            label="Профиль"
            tone={profile?.onboarding_completed ? "live" : "warning"}
            value={profile?.onboarding_completed ? "Готов" : "Нужно настроить"}
          />
          <StitchMetric label="Время RaceMate" tone="red" value="Москва" />
          <StitchPanel>
            <div className="p-4">
              <p className="font-display text-lg font-bold">Что дальше</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Заполни любимых пилотов и команды, чтобы RaceMate точнее подсвечивал новости, прогнозы и этапы сезона.
              </p>
            </div>
          </StitchPanel>
        </aside>
      </section>
    </AppShell>
  );
}
