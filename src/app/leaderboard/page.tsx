import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { RaceFlag } from "@/components/racemate/race-flag";
import { TeamLogo } from "@/components/racemate/team-logo";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getConstructorChampionshipMatrix,
  getDriverChampionshipMatrix,
  getStandingsMeta,
} from "@/data/racemate-repository";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>;
}) {
  const { table } = await searchParams;
  const activeTable = table === "constructors" ? "constructors" : "drivers";
  const [drivers, constructors, driverMeta, constructorMeta] = await Promise.all([
    getDriverChampionshipMatrix(),
    getConstructorChampionshipMatrix(),
    getStandingsMeta("driver_standings"),
    getStandingsMeta("constructor_standings"),
  ]);
  const meta = activeTable === "drivers" ? driverMeta : constructorMeta;

  return (
    <AppShell>
      <PageHeading title="Положение в чемпионате" />

      <section className="grid gap-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex min-h-11 rounded-md border border-border/70 bg-background/45 p-1">
            <Link
              className={`inline-flex items-center rounded-sm px-4 py-2 font-display text-sm font-bold leading-none transition-colors ${
                activeTable === "drivers"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              href="/leaderboard"
            >
              Пилоты
            </Link>
            <Link
              className={`inline-flex items-center rounded-sm px-4 py-2 font-display text-sm font-bold leading-none transition-colors ${
                activeTable === "constructors"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              href="/leaderboard?table=constructors"
            >
              Конструкторы
            </Link>
          </div>
          {meta ? <Badge variant="outline">{meta.label}</Badge> : null}
        </div>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy aria-hidden="true" data-icon="inline-start" />
              {activeTable === "drivers" ? "Личный зачет" : "Кубок конструкторов"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeTable === "drivers" ? (
              <div className="overflow-x-auto rounded-md border border-border/70">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted text-left text-xs uppercase tracking-normal text-muted-foreground">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">#</th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">Пилот</th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">Команда</th>
                      <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Всего</th>
                      {drivers.rounds.map((round) => (
                        <th
                          aria-label={`${round.raceName}, раунд ${round.round}`}
                          className="whitespace-nowrap px-3 py-3 text-right font-medium"
                          key={round.round}
                          title={`${round.raceName}, раунд ${round.round}`}
                        >
                          <RaceFlag
                            className="text-base sm:text-lg"
                            countryCode={round.countryCode}
                            label={`${round.raceName}, раунд ${round.round}`}
                            value={round.flag}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.rows.map((row) => (
                      <tr className="group border-t border-border/70" key={row.driver}>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-muted-foreground">
                          {row.position}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium">
                          {row.driverSlug ? (
                            <Link
                              aria-label={`Открыть профиль: ${row.driver}`}
                              className="inline-flex items-center gap-1.5 underline decoration-border/80 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              href={`/drivers/${row.driverSlug}`}
                              prefetch={false}
                            >
                              {row.driver}
                              <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
                            </Link>
                          ) : (
                            row.driver
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                          <span className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3">
                            <TeamLogo
                              code={row.teamCode}
                              color={row.teamColor}
                              logo={row.teamLogo}
                              name={row.team}
                              size="md"
                            />
                            <span className="truncate">{row.team}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold">
                          {row.total}
                        </td>
                        {drivers.rounds.map((round) => (
                          <td
                            aria-label={getPodiumLabel(row.podiumByRound[round.round], round.raceName)}
                            className={`whitespace-nowrap px-3 py-3 text-right font-mono ${getPodiumClassName(row.podiumByRound[round.round])}`}
                            key={round.round}
                            title={getPodiumLabel(row.podiumByRound[round.round], round.raceName)}
                          >
                            {row.pointsByRound[round.round] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border/70">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted text-left text-xs uppercase tracking-normal text-muted-foreground">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">#</th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">Команда</th>
                      <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Всего</th>
                      {constructors.rounds.map((round) => (
                        <th
                          aria-label={`${round.raceName}, раунд ${round.round}`}
                          className="whitespace-nowrap px-3 py-3 text-right font-medium"
                          key={round.round}
                          title={`${round.raceName}, раунд ${round.round}`}
                        >
                          <RaceFlag
                            className="text-base sm:text-lg"
                            countryCode={round.countryCode}
                            label={`${round.raceName}, раунд ${round.round}`}
                            value={round.flag}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {constructors.rows.map((row) => (
                      <tr className="border-t border-border/70" key={row.team}>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-muted-foreground">
                          {row.position}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium">
                          <span className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3">
                            <TeamLogo
                              code={row.teamCode}
                              color={row.teamColor}
                              logo={row.teamLogo}
                              name={row.team}
                              size="md"
                            />
                            <span className="truncate">{row.team}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold">
                          {row.points}
                        </td>
                        {constructors.rounds.map((round) => (
                          <td className="whitespace-nowrap px-3 py-3 text-right font-mono" key={round.round}>
                            {row.pointsByRound?.[round.round] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}

function getPodiumClassName(finish?: "winner" | "second" | "third") {
  if (finish === "winner") {
    return "font-semibold text-[#f4c95d]";
  }

  if (finish === "second") {
    return "font-semibold text-slate-200";
  }

  if (finish === "third") {
    return "font-semibold text-[#d48a5f]";
  }

  return "";
}

function getPodiumLabel(finish: "winner" | "second" | "third" | undefined, raceName: string) {
  if (finish === "winner") {
    return `Победа в гонке: ${raceName}`;
  }

  if (finish === "second") {
    return `Второе место в гонке: ${raceName}`;
  }

  if (finish === "third") {
    return `Третье место в гонке: ${raceName}`;
  }

  return `Очки за этап: ${raceName}`;
}
