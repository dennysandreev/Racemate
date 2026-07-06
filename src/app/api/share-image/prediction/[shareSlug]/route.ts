import { ImageResponse } from "next/og";
import { createElement } from "react";

import { PredictionShareImage } from "@/components/racemate/prediction-share-image";
import {
  getPublicPredictionShareBySlug,
  normalizePredictionShareScope,
} from "@/data/racemate-repository";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareSlug: string }> },
) {
  const limit = await consumeIpRateLimit("api:prediction-share-image", request, 30, 60 * 1_000);

  if (!limit.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": getRetryAfterSeconds(limit.resetAt) },
    });
  }

  const { shareSlug } = await params;
  const { searchParams } = new URL(request.url);
  const scope = normalizePredictionShareScope(searchParams.get("scope"));
  const share = await getPublicPredictionShareBySlug(shareSlug, scope);

  if (!share) {
    return new Response("Prediction not found", { status: 404 });
  }

  return new ImageResponse(
    createElement(PredictionShareImage, { share, variant: "story" }),
    {
      headers: cacheHeaders,
      height: 1350,
      width: 1080,
    },
  );
}
