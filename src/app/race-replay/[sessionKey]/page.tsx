import { notFound } from "next/navigation";

import { LiveTerminal } from "@/features/live/components/live-terminal";
import { getRaceReplayBySessionKey } from "@/data/racemate-repository";
import { CURRENT_F1_SEASON } from "@/lib/season-navigation";
import { createPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = createPageMetadata({
  description: "Интерактивный повтор завершенной гонки RaceSide.",
  noFollow: true,
  noIndex: true,
  path: "/race-replay",
  title: "Повтор гонки",
});

type RaceReplayPageProps = {
  params: Promise<{ sessionKey: string }>;
};

export default async function RaceReplayPage({ params }: RaceReplayPageProps) {
  const { sessionKey } = await params;
  const numericSessionKey = Number(sessionKey);

  if (!Number.isFinite(numericSessionKey)) {
    notFound();
  }

  const replay = await getRaceReplayBySessionKey(numericSessionKey, CURRENT_F1_SEASON);

  if (!replay) {
    notFound();
  }

  return <LiveTerminal replay={replay} returnUrl="/weekend" />;
}
