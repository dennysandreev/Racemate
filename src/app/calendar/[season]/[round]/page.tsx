import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Flag, MapPin } from "lucide-react";
import { cache } from "react";

import { AppShell } from "@/components/racemate/app-shell";
import { CircuitStatsSection } from "@/components/racemate/circuit-stats-section";
import { DataRow } from "@/components/racemate/data-row";
import { PageHeading } from "@/components/racemate/page-heading";
import { RaceSessionResultsPanel } from "@/components/racemate/race-session-results-panel";
import { TrackMap } from "@/components/racemate/track-map";
import { GrandPrixReportDialog } from "@/components/racemate/grand-prix-report-dialog";
import { GrandPrixPodiumPreview } from "@/components/racemate/grand-prix-podium-preview";
import { JsonLd } from "@/components/racemate/json-ld";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getCircuitStatsForRace,
  getRaceDetail,
  getDriverSlugMap,
  getRaceGrandPrixReport,
  getGrandPrixReportBySlug,
  getPublishedSeasons,
  getRaceNews,
  getRaceReplaySummaryByRaceId,
  getRaceSessions,
  getSessionResultsBySessionIds,
} from "@/data/racemate-repository";
import { CURRENT_F1_SEASON } from "@/lib/season-navigation";
import { absoluteUrl, createPageMetadata, SITE_URL } from "@/lib/seo";
import type { GrandPrixReport } from "@/types/racemate";

export const dynamic = "force-dynamic";

type RaceCalendarPageProps = {
  params: Promise<{ season: string; round: string }>;
  searchParams: Promise<{ session?: string; raceReport?: string }>;
};

const getCachedRaceDetail = cache(getRaceDetail);

export async function generateMetadata({
  params,
}: RaceCalendarPageProps): Promise<Metadata> {
  const { season, round } = await params;

  if (!/^\d{4}$/.test(season) || !/^[1-9]\d*$/.test(round)) {
    return createPageMetadata({
      description: "Этап не найден в календаре RaceSide.",
      noIndex: true,
      path: `/calendar/${season}/${round}`,
      title: "Этап не найден",
    });
  }

  const race = await getCachedRaceDetail(Number(season), Number(round));

  if (!race) {
    return createPageMetadata({
      description: "Этап не найден в опубликованном календаре RaceSide.",
      noIndex: true,
      path: `/calendar/${season}/${round}`,
      title: "Этап не найден",
    });
  }

  return createPageMetadata({
    description: `${race.race} ${race.season}: расписание сессий, результаты, статистика трассы ${race.circuit} и материалы этапа.`,
    image: race.trackMapUrl,
    path: `/calendar/${race.season}/${race.round}`,
    title: `${race.race} ${race.season}: расписание и результаты`,
  });
}

export default async function RaceCalendarPage({
  params,
  searchParams,
}: RaceCalendarPageProps) {
  const [{ season, round }, query] = await Promise.all([params, searchParams]);
  if (!/^\d{4}$/.test(season) || !/^[1-9]\d*$/.test(round)) {
    notFound();
  }

  const seasonYear = Number(season);
  const raceRound = Number(round);

  const publishedSeasons = await getPublishedSeasons();

  if (!publishedSeasons.includes(seasonYear)) {
    notFound();
  }

  const race = await getCachedRaceDetail(seasonYear, raceRound);

  if (!race) {
    notFound();
  }

  const isCurrentSeason = seasonYear === CURRENT_F1_SEASON;
  const [sessions, driverSlugByName, circuitStats] = await Promise.all([
    getRaceSessions(seasonYear, raceRound),
    isCurrentSeason ? getDriverSlugMap() : Promise.resolve({}),
    getCircuitStatsForRace(seasonYear, raceRound),
  ]);
  const [raceNews, raceReport, queryReport, raceReplay] = isCurrentSeason
    ? await Promise.all([
        getRaceNews(race.id, 5),
        getRaceGrandPrixReport(seasonYear, raceRound),
        getGrandPrixReportBySlug(query.raceReport),
        getRaceReplaySummaryByRaceId(race.id, CURRENT_F1_SEASON),
      ])
    : [[], null, null, null] as const;
  const resultsBySession = await getSessionResultsBySessionIds(
    sessions.map((session) => session.id),
    seasonYear,
  );
  const defaultSession = race.status === "Завершен"
    ? sessions.find((session) => session.type === "race" || session.name.toLowerCase().includes("гонка")) ?? sessions[0]
    : sessions[0];
  const selectedSession = sessions.find((session) => session.id === query.session) ?? defaultSession;
  const sessionsWithResults = sessions.map((session) => ({
    results: session.id ? resultsBySession.get(session.id) ?? [] : [],
    session,
  }));
  const dialogReport = queryReport ?? raceReport;
  const isReportOpen = Boolean(query.raceReport && dialogReport?.raceSlug === query.raceReport);

  return (
    <AppShell>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                item: SITE_URL,
                name: "Главная",
                position: 1,
              },
              {
                "@type": "ListItem",
                item: absoluteUrl(
                  seasonYear === CURRENT_F1_SEASON
                    ? "/calendar"
                    : `/calendar?season=${seasonYear}`,
                ),
                name: `Календарь ${seasonYear}`,
                position: 2,
              },
              {
                "@type": "ListItem",
                item: absoluteUrl(`/calendar/${seasonYear}/${raceRound}`),
                name: race.race,
                position: 3,
              },
            ],
          },
          {
            "@context": "https://schema.org",
            "@id": `${absoluteUrl(`/calendar/${seasonYear}/${raceRound}`)}#event`,
            "@type": "SportsEvent",
            description: `${race.race}, сезон Формулы-1 ${seasonYear}, раунд ${raceRound}.`,
            eventStatus: race.status === "Завершен"
              ? "https://schema.org/EventCompleted"
              : "https://schema.org/EventScheduled",
            image: race.trackMapUrl ? absoluteUrl(race.trackMapUrl) : undefined,
            inLanguage: "ru-RU",
            location: {
              "@type": "Place",
              address: {
                "@type": "PostalAddress",
                addressCountry: race.country,
                addressLocality: race.locality,
              },
              name: race.circuit,
            },
            name: `${race.race} ${seasonYear}`,
            startDate: race.startsAtIso,
            url: absoluteUrl(`/calendar/${seasonYear}/${raceRound}`),
          },
        ]}
      />
      <PageHeading
        badge={`${race.season}, раунд ${race.round}`}
        description={`${race.circuit} · ${race.locality}, ${race.country}`}
        title={race.race}
      />

      <section className="grid gap-5 py-8 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="grid min-w-0 content-start gap-5">
          <TrackMap
            assetSrc={isCurrentSeason ? race.trackMapUrl ?? undefined : race.trackMapUrl ?? null}
            circuit={race.circuit}
            label={race.country}
            layout={race.layout}
            showModel3d={isCurrentSeason}
          />
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
              <CircuitStatsSection
                circuitName={race.circuit}
                mode="button"
                stats={circuitStats}
              />
              {raceReport ? (
                <RaceReportPreview
                  driverSlugByName={driverSlugByName}
                  href={`/calendar/${seasonYear}/${raceRound}?raceReport=${raceReport.raceSlug}`}
                  replay={raceReplay}
                  report={raceReport}
                />
              ) : null}
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
          <CardContent>
            <RaceSessionResultsPanel
              includeWeather={isCurrentSeason}
              initialSessionId={selectedSession?.id}
              season={seasonYear}
              sessions={sessionsWithResults}
            />
          </CardContent>
        </Card>
      </section>

      {isCurrentSeason ? (
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
              RaceSide еще не привязал свежие новости к этому этапу.
            </div>
          )}
        </section>
      ) : null}
      {isCurrentSeason ? (
        <GrandPrixReportDialog driverSlugByName={driverSlugByName} open={isReportOpen} report={dialogReport} />
      ) : null}
    </AppShell>
  );
}

function RaceReportPreview({
  driverSlugByName,
  href,
  replay,
  report,
}: {
  driverSlugByName: Record<string, string>;
  href: string;
  replay: Awaited<ReturnType<typeof getRaceReplaySummaryByRaceId>>;
  report: GrandPrixReport;
}) {
  return (
    <GrandPrixPodiumPreview
      className="mt-2"
      driverSlugByName={driverSlugByName}
      href={href}
      replay={replay}
      report={report}
      showRaceHeading={false}
    />
  );
}
