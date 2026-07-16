import { notFound } from "next/navigation";

import { AppShell } from "@/components/racemate/app-shell";
import { RaceReplayPlayer } from "@/features/race-replay/components/race-replay-player";
import { getRaceReplayBySessionKey } from "@/data/racemate-repository";
import { CURRENT_F1_SEASON } from "@/lib/season-navigation";

export const dynamic = "force-dynamic";

type RaceReplayPageProps = {
  params: Promise<{ sessionKey: string }>;
  searchParams: Promise<{ debugTrack?: string }>;
};

export default async function RaceReplayPage({ params, searchParams }: RaceReplayPageProps) {
  const [{ sessionKey }, query] = await Promise.all([params, searchParams]);
  const numericSessionKey = Number(sessionKey);

  if (!Number.isFinite(numericSessionKey)) {
    notFound();
  }

  const replay = await getRaceReplayBySessionKey(numericSessionKey, CURRENT_F1_SEASON);

  if (!replay) {
    notFound();
  }

  return (
    <AppShell>
      <main className="pb-5">
        <RaceReplayPlayer debug={query.debugTrack === "1"} replay={replay} />
      </main>
    </AppShell>
  );
}
