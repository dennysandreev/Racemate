import { NextResponse } from "next/server";

import {
  getRaceSessions,
  getSessionResultsBySessionIds,
} from "@/data/racemate-repository";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{ round: string; season: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const limit = await consumeIpRateLimit(
    "api:grand-prix-sessions",
    request,
    100,
    60_000,
  );

  if (!limit.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов." },
      {
        headers: { "Retry-After": getRetryAfterSeconds(limit.resetAt) },
        status: 429,
      },
    );
  }

  const { round: roundValue, season: seasonValue } = await context.params;
  const round = Number(roundValue);
  const season = Number(seasonValue);

  if (
    !Number.isInteger(season) ||
    !Number.isInteger(round) ||
    season < 1950 ||
    round < 1
  ) {
    return NextResponse.json({ error: "Некорректный этап." }, { status: 400 });
  }

  const sessions = (await getRaceSessions(season, round)).slice(0, 5);
  const resultsBySession = await getSessionResultsBySessionIds(
    sessions.map((session) => session.id),
    season,
  );

  return NextResponse.json(
    {
      sessions: sessions.map((session) => ({
        results: session.id ? resultsBySession.get(session.id) ?? [] : [],
        session,
      })),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900",
      },
    },
  );
}
