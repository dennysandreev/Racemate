import { NextResponse } from "next/server";

import {
  getSocialPosts,
  normalizeSocialPlatform,
  normalizeSocialSort,
} from "@/data/racemate-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = normalizeSocialPlatform(searchParams.get("platform"));
  const sort = normalizeSocialSort(searchParams.get("sort"));
  const cursor = searchParams.get("cursor");

  const result = await getSocialPosts({
    cursor,
    pageSize: 12,
    platform,
    sort,
  });

  return NextResponse.json(result);
}
