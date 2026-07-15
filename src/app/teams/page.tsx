import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Flag, Trophy } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageTitle } from "@/components/racemate/page-title";
import { RaceFlag } from "@/components/racemate/race-flag";
import { TeamLogo } from "@/components/racemate/team-logo";
import { getTeamProfiles } from "@/data/racemate-repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Команды · RaceMate",
  description: "Команды текущего сезона: составы, положение в чемпионате, очки и результаты.",
};

export default async function TeamsPage() {
  const teams = await getTeamProfiles();
  const season = teams[0]?.season ?? new Date().getUTCFullYear();

  return (
    <AppShell>
      <div className="grid gap-5 pb-6 sm:pb-8">
        <header className="stitch-panel relative overflow-hidden p-4 sm:p-5 lg:h-40">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgb(225_6_0_/_0.2),transparent_22rem),linear-gradient(135deg,rgb(255_255_255_/_0.04),transparent_48%)]" />
          <div className="relative z-10 flex flex-col gap-3 lg:h-full">
            <div className="min-w-0 lg:absolute lg:left-0 lg:top-0">
              <p className="stitch-label flex items-center gap-2 text-primary">
                <Flag aria-hidden="true" className="size-4" />
                Команды · сезон {season}
              </p>
              <PageTitle className="mt-2">
                Команды чемпионата
              </PageTitle>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Список команд текущего сезона
              </p>
            </div>
            <div className="mt-auto hidden items-center gap-3 self-start rounded-md border border-border bg-background/35 px-4 py-3 lg:absolute lg:right-0 lg:top-1/2 lg:flex lg:mt-0 lg:-translate-y-1/2">
              <Trophy aria-hidden="true" className="size-5 text-primary" />
              <div>
                <p className="font-telemetry text-xl font-extrabold">{teams.length}</p>
                <p className="text-xs font-semibold text-muted-foreground">команд</p>
              </div>
            </div>
          </div>
        </header>

        {teams.length ? (
          <section aria-label="Команды сезона" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <Link
                className="group relative min-h-[15rem] overflow-hidden rounded-lg border border-border bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/teams/${team.slug}`}
                key={team.id}
                prefetch={false}
                style={{
                  backgroundImage: `radial-gradient(circle at 58% 35%, color-mix(in srgb, ${team.color} 22%, transparent), transparent 56%)`,
                }}
              >
                <Image
                  alt={`Болид ${team.shortName} сезона ${team.season}`}
                  className="object-contain object-[center_42%] p-3 pb-20 pt-8 drop-shadow-[0_10px_10px_rgb(0_0_0_/_0.28)] transition-transform duration-300 group-hover:scale-[1.02] sm:p-4 sm:pb-20 sm:pt-8"
                  fill
                  sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                  src={team.carImageUrl}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-background" />
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-1"
                  style={{ backgroundColor: team.color }}
                />
                <div className="absolute right-4 top-4 z-10">
                  <TeamLogo
                    code={team.code}
                    color={team.color}
                    logo={team.logo}
                    name={team.name}
                    size="md"
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
                  <div className="min-w-0">
                    {team.country ? (
                      <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <RaceFlag countryCode={team.countryCode} label={team.country} />
                        {team.country}
                      </span>
                    ) : null}
                    <h2 className="truncate font-display text-xl font-extrabold text-foreground sm:text-2xl">
                      {team.shortName}
                    </h2>
                    <p className="mt-2 font-telemetry text-sm font-bold text-muted-foreground">
                      P{team.championshipPosition ?? "—"} · {formatPoints(team.points)} очк. · {team.wins} побед
                    </p>
                  </div>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background/80 text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </span>
                </div>
              </Link>
            ))}
          </section>
        ) : (
          <div className="stitch-panel p-8 text-center">
            <p className="font-display text-xl font-bold">Команды появятся после обновления чемпионата</p>
            <p className="mt-2 text-sm text-muted-foreground">RaceMate уже готов показать данные, как только они будут синхронизированы.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}
