import { NextResponse } from "next/server";

import { getRaceReplayBySessionKey } from "@/data/racemate-repository";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";
import { CURRENT_F1_SEASON } from "@/lib/season-navigation";

type RouteContext = {
  params: Promise<{ sessionKey: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const limit = await consumeIpRateLimit("api:race-replay", request, 100, 60 * 1_000);

  if (!limit.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов." },
      { status: 429, headers: { "Retry-After": getRetryAfterSeconds(limit.resetAt) } },
    );
  }

  const { sessionKey } = await context.params;
  const numericSessionKey = Number(sessionKey);

  if (!Number.isFinite(numericSessionKey)) {
    return NextResponse.json({ error: "Некорректный повтор гонки." }, { status: 400 });
  }

  const replay = await getRaceReplayBySessionKey(numericSessionKey, CURRENT_F1_SEASON);

  if (!replay) {
    return NextResponse.json({ error: "Повтор гонки пока не готов." }, { status: 404 });
  }

  return NextResponse.json(replay, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=1800",
    },
  });
}
