import { ImageResponse } from "next/og";
import { createElement } from "react";

import { PredictionShareImage } from "@/components/racemate/prediction-share-image";
import {
  getPublicPredictionShareBySlug,
  normalizePredictionShareScope,
} from "@/data/racemate-repository";
import { getPredictionShareFonts } from "@/lib/prediction-share-fonts";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareSlug: string }> },
) {
  const limit = await consumeIpRateLimit("api:prediction-og-image", request, 30, 60 * 1_000);

  if (!limit.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": getRetryAfterSeconds(limit.resetAt) },
    });
  }

  const { shareSlug } = await params;
  const { searchParams } = new URL(request.url);
  const scope = normalizePredictionShareScope(searchParams.get("scope"));
  const [share, fonts] = await Promise.all([
    getPublicPredictionShareBySlug(shareSlug, scope),
    getPredictionShareFonts(),
  ]);

  if (!share) {
    return new Response("Prediction not found", { status: 404 });
  }

  return new ImageResponse(
    createElement(PredictionShareImage, { share, variant: "og" }),
    {
      headers: cacheHeaders,
      height: 630,
      fonts,
      width: 1200,
    },
  );
}
