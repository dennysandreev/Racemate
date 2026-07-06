import { NextResponse } from "next/server";

import {
  getSocialPosts,
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
  const cursor = searchParams.get("cursor");

  const result = await getSocialPosts({
    cursor,
    pageSize: 12,
    platform,
  });

  return NextResponse.json(result);
}
