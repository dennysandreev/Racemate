import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GitCompareArrows } from "lucide-react";

import { DriverComparison } from "@/components/racemate/driver-comparison";
import { PageTitle } from "@/components/racemate/page-title";
import { SeasonSwitcher } from "@/components/racemate/season-switcher";
import { Button } from "@/components/ui/button";
import { getDriverComparisonData, getPublishedSeasons } from "@/data/racemate-repository";
import {
  normalizeDriverComparisonSlug,
  resolveDriverComparisonRound,
  resolveDriverComparisonSelection,
} from "@/lib/driver-comparison";
import {
  getSearchParam,
  resolvePublishedSeason,
  type SeasonSearchParams,
} from "@/lib/season-navigation";
import { createPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  description: "Сравнение результатов двух пилотов Формулы-1 по этапам выбранного сезона.",
  noIndex: true,
  path: "/drivers/compare",
  title: "Сравнение пилотов",
});

export default async function DriverComparisonPage({
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

  const leftSlug = normalizeDriverComparisonSlug(getSearchParam(query.a));
  const requestedRightSlug = normalizeDriverComparisonSlug(getSearchParam(query.b));
  const rightSlug = requestedRightSlug && requestedRightSlug !== leftSlug
    ? requestedRightSlug
    : undefined;
  const dataset = await getDriverComparisonData(
    season,
    [leftSlug, rightSlug].filter((value): value is string => Boolean(value)),
  );
  const selection = resolveDriverComparisonSelection(
    leftSlug,
    rightSlug,
    dataset.options.map((option) => option.slug),
  );
  const initialRound = resolveDriverComparisonRound(
    getSearchParam(query.round),
    dataset.latestCompletedRound,
  );

  return (
    <div className="grid gap-5 pb-6 sm:pb-8">
        <header className="stitch-panel relative overflow-hidden p-4 sm:p-5 lg:h-40">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgb(225_6_0_/_0.22),transparent_22rem),linear-gradient(135deg,rgb(255_255_255_/_0.04),transparent_48%)]" />
          <div className="relative z-10 flex h-full flex-col">
            <div>
              <p className="stitch-label flex items-center gap-2 text-primary">
                <GitCompareArrows aria-hidden="true" className="size-4" />
                Пилоты <span aria-hidden="true">/</span> сравнение
              </p>
              <PageTitle className="mt-2">Сравнение пилотов</PageTitle>
            </div>

            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-2 sm:flex sm:justify-between sm:gap-3 lg:mt-auto">
              <Button asChild size="sm" variant="secondary">
                <Link href={`/drivers?season=${season}`} prefetch={false}>
                  <ArrowLeft aria-hidden="true" data-icon="inline-start" />
                  Все пилоты
                </Link>
              </Button>
              <SeasonSwitcher
                activeSeason={season}
                className="min-w-0 sm:w-auto"
                expandDirection="left"
                loadingLabel="Обновляем сезон"
                pathname="/drivers/compare"
                query={{
                  a: selection.left,
                  b: selection.right,
                }}
                seasons={publishedSeasons}
              />
            </div>
          </div>
        </header>

        <DriverComparison
          dataset={dataset}
          initialRound={initialRound}
          leftSlug={selection.left}
          rightSlug={selection.right}
        />
    </div>
  );
}
