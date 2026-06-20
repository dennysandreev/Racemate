import { NextResponse } from "next/server";

import {
  getSocialPosts,
  normalizeSocialPlatform,
} from "@/data/racemate-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
