import { AppShell } from "@/components/racemate/app-shell";
import { FantasySectionHeader } from "@/components/fantasy/fantasy-section-nav";
import { FantasyScoringDialog } from "@/components/racemate/fantasy-scoring-dialog";
import { PageTitle } from "@/components/racemate/page-title";
import { GlobalFantasyLeaderboardPanel } from "@/components/racemate/global-fantasy-leaderboard";
import { getGlobalFantasyLeaderboard } from "@/data/racemate-repository";
import { getSessionProfileSummary } from "@/lib/auth";
import { createPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = createPageMetadata({
  description:
    "Общий рейтинг прогнозов RaceSide: позиции участников, очки за этапы и результаты фентази-сезона Формулы-1.",
  path: "/fantasy/leaderboard",
  title: "Рейтинг прогнозов Формулы-1",
});

export default async function GlobalFantasyLeaderboardPage() {
  const [leaderboard, profileSummary] = await Promise.all([
    getGlobalFantasyLeaderboard(),
    getSessionProfileSummary(),
  ]);

  return (
    <AppShell>
      <section className="grid gap-6 pb-6">
        <FantasySectionHeader active="leaderboard">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <PageTitle>Общий рейтинг</PageTitle>
            <FantasyScoringDialog />
          </div>
        </FantasySectionHeader>

        <GlobalFantasyLeaderboardPanel
          currentDisplayName={profileSummary?.displayName ?? null}
          leaderboard={leaderboard}
        />
      </section>
    </AppShell>
  );
}
