import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Flag, Trophy } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageTitle } from "@/components/racemate/page-title";
import { RaceFlag } from "@/components/racemate/race-flag";
import { SeasonSwitcher } from "@/components/racemate/season-switcher";
import { TeamLogo } from "@/components/racemate/team-logo";
import { getPublishedSeasons, getTeamProfiles } from "@/data/racemate-repository";
import { resolvePublishedSeason, type SeasonSearchParams } from "@/lib/season-navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Команды · RaceMate",
  description: "Команды Формулы-1 по сезонам: составы, положение в чемпионате, очки и результаты.",
};

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<SeasonSearchParams>;
}) {
  const query = await searchParams;
  const publishedSeasons = await getPublishedSeasons();
  const season = resolvePublishedSeason(query.season, publishedSeasons);

  if (!season) {
    notFound();
  }

  const teams = await getTeamProfiles(season);

  return (
    <AppShell>
      <div className="grid gap-5 pb-6 sm:pb-8">
        <header className="stitch-panel relative min-h-[13rem] overflow-hidden p-4 sm:p-5 lg:h-40 lg:min-h-0">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgb(225_6_0_/_0.2),transparent_22rem),linear-gradient(135deg,rgb(255_255_255_/_0.04),transparent_48%)]" />
          <div className="relative z-10 grid min-h-[11rem] gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="stitch-label flex items-center gap-2 text-primary">
                <Flag aria-hidden="true" className="size-4" />
                Команды · сезон {season}
              </p>
              <PageTitle className="mt-2">
                Команды чемпионата
              </PageTitle>
              <SeasonSwitcher
                activeSeason={season}
                className="mt-3"
                pathname="/teams"
                query={query}
                seasons={publishedSeasons}
              />
            </div>
            <div className="hidden items-center gap-3 rounded-md border border-border bg-background/35 px-4 py-2 lg:flex">
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
                href={`/teams/${team.slug}?season=${season}`}
                key={team.id}
                prefetch={false}
                style={{
                  backgroundImage: `radial-gradient(circle at 58% 35%, color-mix(in srgb, ${team.color} 22%, transparent), transparent 56%)`,
                }}
              >
                {team.carImageUrl ? (
                  <Image
                    alt={`Болид ${team.shortName} сезона ${team.season}`}
                    className="object-contain object-[center_42%] p-3 pb-20 pt-8 drop-shadow-[0_10px_10px_rgb(0_0_0_/_0.28)] transition-transform duration-300 group-hover:scale-[1.02] sm:p-4 sm:pb-20 sm:pt-8"
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                    src={team.carImageUrl}
                  />
                ) : (
                  <div className="absolute inset-x-4 top-16 grid h-20 place-items-center rounded-md border border-border/70 bg-background/35 text-center font-telemetry text-[0.65rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Болид проходит проверку
                  </div>
                )}
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
                    season={season}
                    shape="square"
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
