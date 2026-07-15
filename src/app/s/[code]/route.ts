import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/env";
import { resolveShareLink } from "@/lib/share-links";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const destination = await resolveShareLink(code);

  if (!destination) {
    return new Response("Ссылка не найдена", {
      headers: { "Cache-Control": "no-store" },
      status: 404,
    });
  }

  const response = NextResponse.redirect(new URL(destination, getSiteUrl()), 307);
  response.headers.set(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  response.headers.set("X-Robots-Tag", "noindex");

  return response;
}
