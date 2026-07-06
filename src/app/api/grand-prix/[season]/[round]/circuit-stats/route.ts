import { NextResponse } from "next/server";

import { getCircuitStatsForRace } from "@/data/racemate-repository";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ season: string; round: string }> },
) {
  const limit = await consumeIpRateLimit("api:circuit-stats", request, 100, 60 * 1_000);

  if (!limit.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов." },
      { status: 429, headers: { "Retry-After": getRetryAfterSeconds(limit.resetAt) } },
    );
  }

  const { season, round } = await params;
  const seasonYear = Number(season);
  const raceRound = Number(round);

  if (!Number.isFinite(seasonYear) || !Number.isFinite(raceRound)) {
    return NextResponse.json({ error: "Некорректный этап" }, { status: 400 });
  }

  const stats = await getCircuitStatsForRace(seasonYear, raceRound);

  if (!stats) {
    return NextResponse.json({ error: "Статистика трассы пока недоступна" }, { status: 404 });
  }

  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
