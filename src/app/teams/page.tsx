import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Flag, Trophy } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
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
      <div className="grid gap-5 py-6 sm:py-8">
        <header className="stitch-panel p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="stitch-label flex items-center gap-2 text-primary">
                <Flag aria-hidden="true" className="size-4" />
                Сезон {season}
              </p>
              <h1 className="mt-2 text-balance font-display text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
                Команды чемпионата
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-muted-foreground sm:text-base">
                Составы, форма и результаты всех команд текущего сезона.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border bg-background/35 px-4 py-3">
              <Trophy aria-hidden="true" className="size-5 text-primary" />
              <div>
                <p className="font-telemetry text-xl font-extrabold">{teams.length}</p>
                <p className="text-xs font-semibold text-muted-foreground">команд</p>
              </div>
            </div>
          </div>
        </header>

        {teams.length ? (
          <section aria-label="Команды сезона" className="grid gap-4 lg:grid-cols-2">
            {teams.map((team) => (
              <Link
                className="group relative min-h-[18rem] overflow-hidden rounded-lg border border-border bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/teams/${team.slug}`}
                key={team.id}
                prefetch={false}
              >
                <Image
                  alt={`Болид ${team.shortName} сезона ${team.season}`}
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  src={team.carImageUrl}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_25%,rgb(0_0_0_/_0.9)_100%)]" />
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-1"
                  style={{ backgroundColor: team.color }}
                />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-6">
                  <div className="min-w-0">
                    <div className="mb-3 flex items-center gap-3">
                      <TeamLogo
                        code={team.code}
                        color={team.color}
                        logo={team.logo}
                        name={team.name}
                        size="md"
                      />
                      {team.country ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/70">
                          <RaceFlag countryCode={team.countryCode} label={team.country} />
                          {team.country}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="truncate font-display text-2xl font-extrabold text-white sm:text-3xl">
                      {team.shortName}
                    </h2>
                    <p className="mt-2 font-telemetry text-sm font-bold text-white/75">
                      P{team.championshipPosition ?? "—"} · {formatPoints(team.points)} очк. · {team.wins} побед
                    </p>
                  </div>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/20 bg-black/45 text-white transition-colors group-hover:bg-white group-hover:text-black">
                    <ChevronRight aria-hidden="true" className="size-5" />
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
