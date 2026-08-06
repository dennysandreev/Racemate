import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageTitle } from "@/components/racemate/page-title";
import { GlobalFantasyLeaderboardPanel } from "@/components/racemate/global-fantasy-leaderboard";
import { Button } from "@/components/ui/button";
import { getGlobalFantasyLeaderboard } from "@/data/racemate-repository";
import { createPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = createPageMetadata({
  description:
    "Общий рейтинг прогнозов RaceSide: позиции участников, очки за этапы и результаты фентази-сезона Формулы-1.",
  path: "/fantasy/leaderboard",
  title: "Рейтинг прогнозов Формулы-1",
});

export default async function GlobalFantasyLeaderboardPage() {
  const leaderboard = await getGlobalFantasyLeaderboard();

  return (
    <AppShell>
      <section className="grid gap-6 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-telemetry text-xs font-bold uppercase tracking-[0.12em] text-primary">
              Фентази лига
            </p>
            <PageTitle className="mt-2">
              Общий рейтинг
            </PageTitle>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Все личные прогнозы RaceSide в одной таблице. Очки обновляются после
              подсчёта результатов этапа.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/fantasy">
              <ChevronLeft aria-hidden="true" data-icon="inline-start" />
              К фентази-лиге
            </Link>
          </Button>
        </div>

        <GlobalFantasyLeaderboardPanel leaderboard={leaderboard} />
      </section>
    </AppShell>
  );
}
