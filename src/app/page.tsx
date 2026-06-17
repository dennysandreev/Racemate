import Link from "next/link";
import {
  Activity,
  Gauge,
  Newspaper,
  TrendingUp,
  ExternalLink,
  Trophy,
} from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { GrandPrixReportDialog } from "@/components/racemate/grand-prix-report-dialog";
import { SessionWeatherTile } from "@/components/racemate/session-weather-tile";
import { TrackMap } from "@/components/racemate/track-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getConstructorChampionOdds,
  getCurrentRaceDetail,
  getDriverStandings,
  getGrandPrixReportBySlug,
  getLatestGrandPrixReport,
  getNewsItems,
  getNextSession,
  getSeasonChampionOdds,
  getWeekendSessions,
} from "@/data/racemate-repository";
import type {
  MarketOdds,
  GrandPrixReport,
  NextSession,
  NewsItem,
  RaceDetail,
  StandingRow,
  WeekendSession,
} from "@/types/racemate";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ raceReport?: string }>;
}) {
  const query = await searchParams;
  const [newsResult, nextSession, standings, currentRace, sessions, championOdds, constructorOdds, latestReport, queryReport] =
    await Promise.all([
      getNewsItems({ pageSize: 5 }),
      getNextSession(),
      getDriverStandings(),
      getCurrentRaceDetail(),
      getWeekendSessions(),
      getSeasonChampionOdds(),
      getConstructorChampionOdds(),
      getLatestGrandPrixReport(),
      getGrandPrixReportBySlug(query.raceReport),
    ]);
  const newsItems = newsResult.items;
  const topStandings = standings.slice(0, 6);
  const dialogReport = queryReport ?? latestReport;
  const isReportOpen = Boolean(query.raceReport && dialogReport?.raceSlug === query.raceReport);

  return (
    <AppShell>
      <section className="grid gap-5 py-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch">
          <CurrentRaceCard
            currentRace={currentRace}
            nextSession={nextSession}
            sessions={sessions}
          />
          <StandingsCard rows={topStandings} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="min-w-0">
            <NewsCard items={newsItems} />
          </div>

          <aside className="grid gap-5">
            <LatestReportCard report={latestReport} />
            <MarketOddsCard
              emptyText="На Polymarket пока нет рынка чемпионства сезона."
              odds={championOdds}
              title="Шансы на титул"
            />
            <MarketOddsCard
              emptyText="На Polymarket пока нет рынка Кубка конструкторов."
              odds={constructorOdds}
              title="Шансы на Кубок конструкторов"
            />
          </aside>
        </div>
      </section>
      <GrandPrixReportDialog open={isReportOpen} report={dialogReport} />
    </AppShell>
  );
}

function CurrentRaceCard({
  currentRace,
  nextSession,
  sessions,
}: {
  currentRace: RaceDetail | null;
  nextSession: NextSession;
  sessions: WeekendSession[];
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={nextSession.status === "Live" ? "success" : "warning"}>
          {nextSession.status}
        </Badge>
        <Badge variant="outline">Сезон 2026</Badge>
      </div>

      <div className="mt-4 max-w-3xl">
        <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Gauge aria-hidden="true" data-icon="inline-start" />
          Следующий этап
        </p>
        <h1 className="text-balance text-xl font-semibold leading-tight tracking-normal sm:text-2xl lg:text-3xl">
          {nextSession.session} на трассе {nextSession.circuit}
        </h1>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {sessions.slice(0, 5).map((session) => (
          <SessionWeatherTile
            compact
            isActive={session.name === nextSession.session}
            key={session.id ?? session.name}
            session={session}
            showStatusBadge={false}
          />
        ))}
      </div>

      <div className="mt-3">
        <TrackMap compact circuit={nextSession.circuit} label={nextSession.race} layout={currentRace?.layout} />
      </div>
    </div>
  );
}

function StandingsCard({ rows }: { rows: StandingRow[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity aria-hidden="true" data-icon="inline-start" />
          Личный зачет
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="overflow-hidden rounded-md border border-border/70">
          {rows.map((row) => (
            <div
              className="grid min-h-[3.35rem] grid-cols-[2.25rem_minmax(0,1fr)_4rem] items-center gap-3 border-b border-border/70 px-3 last:border-b-0"
              key={row.driver}
            >
              <span className="font-mono text-sm text-muted-foreground">
                {row.position}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {row.driver}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.team}
                </span>
              </span>
              <span className="text-right font-mono text-sm">
                {row.points}
              </span>
            </div>
          ))}
        </div>
        <Button asChild className="w-full" variant="secondary">
          <Link href="/leaderboard" prefetch={false}>Открыть чемпионат</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function NewsCard({ items }: { items: NewsItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper aria-hidden="true" data-icon="inline-start" />
          Свежие новости
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.length ? items.map((item) => (
          <Link
            className="grid gap-3 rounded-md border border-border/70 p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/news/${item.slug}`}
            key={item.slug}
            prefetch={false}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{item.source}</Badge>
              {item.tags.slice(0, 1).map((tag) => (
                <Badge key={tag.slug} variant="secondary">{tag.name}</Badge>
              ))}
              <span className="text-xs text-muted-foreground">
                {item.time}
              </span>
            </div>
            <h2 className="text-lg font-semibold leading-6">{item.title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {item.summary}
            </p>
          </Link>
        )) : (
          <p className="rounded-md border border-border/70 p-4 text-sm text-muted-foreground">
            Свежих новостей пока нет.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LatestReportCard({ report }: { report: GrandPrixReport | null }) {
  const podium = Array.isArray(report?.highlights.podium)
    ? report.highlights.podium.map((item) => String(item)).join(", ")
    : "";
  const summary = report?.aiSummary?.split(/\n{2,}/)[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy aria-hidden="true" data-icon="inline-start" />
          Отчет прошлого Гран-при
        </CardTitle>
      </CardHeader>
      <CardContent>
        {report ? (
          <div className="grid gap-4">
            <div>
              <p className="font-medium">{report.raceName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {report.raceDate}
              </p>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Победитель</span>
                <span className="text-right font-medium">
                  {String(report.highlights.winner ?? report.results[0]?.driver ?? "Уточняется")}
                </span>
              </div>
              {podium ? (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Подиум</span>
                  <span className="max-w-[65%] text-right font-medium">{podium}</span>
                </div>
              ) : null}
            </div>
            {summary ? (
              <p className="text-sm leading-6 text-muted-foreground">{summary}</p>
            ) : null}
            <Button asChild className="w-full">
              <Link href={`/?raceReport=${report.raceSlug}`} prefetch={false} scroll={false}>
                Открыть полный отчет
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Отчет появится после завершения гонки и синхронизации результатов.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MarketOddsCard({
  emptyText,
  odds,
  title,
}: {
  emptyText: string;
  odds: MarketOdds | null;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp aria-hidden="true" data-icon="inline-start" />
          {title}
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
                prefetch={false}
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
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
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
            {emptyText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
