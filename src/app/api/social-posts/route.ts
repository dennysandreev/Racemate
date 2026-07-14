import { NextResponse } from "next/server";

import {
  getSocialPosts,
  normalizeSocialMode,
  normalizeSocialPlatform,
} from "@/data/racemate-repository";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = await consumeIpRateLimit("api:social-posts", request, 100, 60 * 1_000);

  if (!limit.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов." },
      { status: 429, headers: { "Retry-After": getRetryAfterSeconds(limit.resetAt) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const platform = normalizeSocialPlatform(searchParams.get("platform"));
  const mode = normalizeSocialMode(searchParams.get("mode"));
  const cursor = searchParams.get("cursor");

  const result = await getSocialPosts({
    cursor,
    pageSize: 12,
    platform,
    mode,
    topic: searchParams.get("topic"),
    team: searchParams.get("team"),
    driver: searchParams.get("driver"),
    race: searchParams.get("race"),
  });

  return NextResponse.json(result);
}
