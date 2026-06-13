import { CalendarDays, ExternalLink, Target, TrendingUp } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { TrackMap } from "@/components/racemate/track-map";
import { WeekendSessionBoard } from "@/components/racemate/weekend-session-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getNextSession,
  getCurrentRaceDetail,
  getPredictionState,
  getRaceNews,
  getSessionResults,
  getRaceWinnerOdds,
  getWeekendSessions,
} from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";
import type { PredictionState, RaceWinnerOdds } from "@/types/racemate";

export default async function WeekendPage() {
  const [nextSession, weekendSessions, currentRace, user] = await Promise.all([
    getNextSession(),
    getWeekendSessions(),
    getCurrentRaceDetail(),
    getSessionUser(),
  ]);
  const [raceNews, winnerOdds, predictionState, sessionResults] = await Promise.all([
    currentRace ? getRaceNews(currentRace.id, 4) : [],
    getRaceWinnerOdds(currentRace),
    getPredictionState(user?.id),
    Promise.all(
      weekendSessions.map(async (session) => ({
        results: await getSessionResults(session.id),
        session,
      })),
    ),
  ]);
  const raceNewsTagSlug = raceNews
    .flatMap((item) => item.tags)
    .find((tag) => tag.type === "race")?.slug;
  const raceNewsHref =
    raceNewsTagSlug
      ? `/news?tag=${raceNewsTagSlug}`
      : currentRace
        ? `/news?race=${currentRace.season}-${currentRace.round}`
        : "/news";

  return (
    <AppShell>
      <PageHeading
        title={`${currentRace?.countryFlag ?? "🏁"} ${nextSession.race}`}
      />

      <section className="py-6">
        <Card className="overflow-hidden">
          <CardContent className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
            <div className="grid min-w-0 gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">{nextSession.status}</Badge>
                <Badge variant="outline">Сезон {currentRace?.season ?? 2026}</Badge>
              </div>
              <div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays aria-hidden="true" data-icon="inline-start" />
                  Ближайшая сессия
                </p>
                <h2 className="mt-2 text-balance text-2xl font-semibold leading-tight sm:text-3xl">
                  {nextSession.session}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {nextSession.circuit}
                </p>
              </div>
              <div className="grid gap-3">
                <TrackMap compact circuit={nextSession.circuit} label={nextSession.race} layout={currentRace?.layout} />
                <Button asChild className="w-full justify-center" variant="secondary">
                  <Link href="https://vk.com/versportaa" rel="noreferrer" target="_blank">
                    Смотреть онлайн
                    <ExternalLink aria-hidden="true" data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid min-w-0 gap-3 rounded-md border border-border/70 bg-background/35 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-lg">Расписание уикенда</CardTitle>
                <Badge variant="secondary">{sessionResults.length} сессий</Badge>
              </div>
              <WeekendSessionBoard
                activeSessionName={nextSession.session}
                sessions={sessionResults}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 pb-8 lg:grid-cols-2">
        <WinnerOddsCard odds={winnerOdds} />
        <FantasyPredictionCard predictionState={predictionState} userSignedIn={Boolean(user)} />
      </section>

      <section className="pb-8">
        <Card>
          <CardHeader>
            <CardTitle>
              <Link
                className="rounded-md transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={raceNewsHref}
              >
                Новости этапа
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {raceNews.length ? (
              raceNews.map((item) => (
                <Link
                  className="rounded-md border border-border/70 p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={`/news/${item.slug}`}
                  key={item.slug}
                >
                  <Badge variant="secondary">{item.source}</Badge>
                  <p className="mt-2 text-sm font-medium leading-5">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {item.summary}
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Пока нет новостей, привязанных к этому этапу.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}

function WinnerOddsCard({ odds }: { odds: RaceWinnerOdds | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp aria-hidden="true" data-icon="inline-start" />
          Вероятность победы
        </CardTitle>
      </CardHeader>
      <CardContent>
        {odds ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{odds.marketTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  По данным {odds.source} · обновлено {odds.updatedAt}
                </p>
              </div>
              <Link
                className="inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={odds.marketUrl}
                rel="noreferrer"
                target="_blank"
              >
                Рынок
                <ExternalLink aria-hidden="true" className="size-3" />
              </Link>
            </div>
            <div className="grid gap-3">
              {odds.outcomes.map((outcome) => (
                <div className="grid gap-1.5" key={outcome.name}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{outcome.name}</span>
                    <span className="whitespace-nowrap font-mono text-muted-foreground">
                      {outcome.label}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(outcome.probability * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            На Polymarket пока нет рынка победителя этого этапа.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FantasyPredictionCard({
  predictionState,
  userSignedIn,
}: {
  predictionState: PredictionState;
  userSignedIn: boolean;
}) {
  const current = predictionState.current;
  const driversById = new Map(
    predictionState.drivers.map((driver) => [driver.id, driver.name]),
  );
  const picks = [
    { label: "Победитель", value: current?.winnerDriverId },
    { label: "Поул", value: current?.poleDriverId },
    { label: "Лучший круг", value: current?.fastestLapDriverId },
    { label: "Первый сход", value: current?.dnfDriverId },
  ].map((pick) => ({
    label: pick.label,
    value: pick.value ? driversById.get(pick.value) ?? "Пилот выбран" : "Пока без выбора",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target aria-hidden="true" data-icon="inline-start" />
          Прогноз на этап
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {current ? (
          <div className="grid gap-2">
            {picks.map((pick) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/45 px-3 py-2 text-sm"
                key={pick.label}
              >
                <span className="text-muted-foreground">{pick.label}</span>
                <span className="min-w-0 truncate text-right font-medium">{pick.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Собери прогноз до блокировки и сравни его с друзьями после финиша.
          </p>
        )}
        <Button asChild className="w-full" variant={current ? "secondary" : "default"}>
          <Link href={userSignedIn ? "/predictions" : "/auth"}>
            {userSignedIn
              ? current
                ? "Изменить прогноз"
                : "Сделать прогноз"
              : "Войти, чтобы сохранить"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
