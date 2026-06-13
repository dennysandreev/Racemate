import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Flag, MapPin, Trophy } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { DataRow } from "@/components/racemate/data-row";
import { PageHeading } from "@/components/racemate/page-heading";
import { TeamLogo } from "@/components/racemate/team-logo";
import { TrackMap } from "@/components/racemate/track-map";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getRaceDetail,
  getRaceNews,
  getRaceSessions,
  getSessionResults,
} from "@/data/racemate-repository";

export const dynamic = "force-dynamic";

export default async function RaceCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; round: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const [{ season, round }, query] = await Promise.all([params, searchParams]);
  const seasonYear = Number(season);
  const raceRound = Number(round);

  if (!Number.isFinite(seasonYear) || !Number.isFinite(raceRound)) {
    notFound();
  }

  const race = await getRaceDetail(seasonYear, raceRound);

  if (!race) {
    notFound();
  }

  const [sessions, raceNews] = await Promise.all([
    getRaceSessions(seasonYear, raceRound),
    getRaceNews(race.id, 5),
  ]);
  const selectedSession = sessions.find((session) => session.id === query.session) ?? sessions[0];
  const results = await getSessionResults(selectedSession?.id);

  return (
    <AppShell>
      <PageHeading
        badge={`${race.season}, раунд ${race.round}`}
        description={`${race.circuit} · ${race.locality}, ${race.country}`}
        title={race.race}
      />

      <section className="grid gap-5 py-8 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="grid min-w-0 content-start gap-5">
          <TrackMap circuit={race.circuit} label={race.country} layout={race.layout} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin aria-hidden="true" data-icon="inline-start" />
                Этап
              </CardTitle>
              <CardDescription>
                Основной контекст гонки и текущий статус в календаре.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <DataRow label="Старт гонки" value={race.startsAt} />
              <DataRow label="Статус" value={race.status} />
              <DataRow label="Трасса" value={race.circuit} />
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock aria-hidden="true" data-icon="inline-start" />
              Сессии и результаты
            </CardTitle>
            <CardDescription>
              Выбери практику, квалификацию, спринт или гонку.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              {sessions.map((session) => (
                <Link
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    session.id === selectedSession?.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  href={session.href ?? `/calendar/${seasonYear}/${raceRound}`}
                  key={session.id ?? session.name}
                >
                  {session.name}
                </Link>
              ))}
            </div>

            {selectedSession ? (
              <div className="min-w-0 overflow-hidden rounded-md border border-border/70">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                  <div>
                    <p className="font-medium">{selectedSession.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedSession.startsAt}
                    </p>
                  </div>
                  <Badge variant={selectedSession.status === "Завершена" ? "success" : "warning"}>
                    {selectedSession.status}
                  </Badge>
                </div>
                {selectedSession.weather ? (
                  <div className="grid gap-3 border-b border-border/70 bg-muted/50 px-4 py-3 text-sm sm:grid-cols-3">
                    <DataRow label="Температура" value={selectedSession.weather.temperature} />
                    <DataRow label="Ветер" value={selectedSession.weather.wind} />
                    <DataRow label="Осадки" value={selectedSession.weather.precipitation} />
                  </div>
                ) : null}

                {results.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[42rem] text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr className="border-b border-border/70">
                          <th className="px-4 py-3 font-medium">Поз.</th>
                          <th className="px-4 py-3 font-medium">Пилот</th>
                          <th className="px-4 py-3 font-medium">Команда</th>
                          <th className="px-4 py-3 font-medium">Время</th>
                          <th className="px-4 py-3 font-medium">Круги</th>
                          <th className="px-4 py-3 text-right font-medium">Очки</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((result) => (
                          <tr className="border-b border-border/70 last:border-b-0" key={`${result.position}-${result.driver}`}>
                            <td className="px-4 py-3 font-mono text-muted-foreground">
                              {result.position ?? "-"}
                            </td>
                            <td className="px-4 py-3 font-medium">
                              <span className="flex items-center gap-2">
                                <TeamLogo
                                  code={result.teamCode}
                                  color={result.teamColor}
                                  logo={result.teamLogo}
                                  name={result.team}
                                />
                                <span>{result.driver}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <span className="flex items-center gap-2">
                                <TeamLogo
                                  code={result.teamCode}
                                  color={result.teamColor}
                                  logo={result.teamLogo}
                                  name={result.team}
                                />
                                <span>{result.team}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-muted-foreground">
                              {result.time}
                            </td>
                            <td className="px-4 py-3 font-mono text-muted-foreground">
                              {result.laps ?? "-"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {result.points ?? "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid min-h-40 place-items-center px-4 py-8 text-center">
                    <div>
                      <Trophy className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
                      <p className="mt-3 font-medium">Результатов пока нет</p>
                      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                        Они появятся после синхронизации результатов этой сессии.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-border/70 p-5 text-sm text-muted-foreground">
                Расписание для этапа еще не синхронизировано.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 pb-8">
        <div className="flex items-center gap-2">
          <Flag aria-hidden="true" data-icon="inline-start" />
          <h2 className="text-xl font-semibold">Новости этапа</h2>
        </div>
        {raceNews.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {raceNews.map((item) => (
              <Link
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
                href={`/news/${item.slug}`}
                key={item.slug}
              >
                <Badge variant="secondary">{item.source}</Badge>
                <h3 className="mt-3 font-semibold leading-6">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-border/70 p-5 text-sm text-muted-foreground">
            RaceMate еще не привязал свежие новости к этому этапу.
          </div>
        )}
      </section>
    </AppShell>
  );
}
