import { ImageResponse } from "next/og";
import { createElement } from "react";

import { PredictionShareImage } from "@/components/racemate/prediction-share-image";
import {
  getPublicPredictionShareBySlug,
  normalizePredictionShareScope,
} from "@/data/racemate-repository";

export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareSlug: string }> },
) {
  const { shareSlug } = await params;
  const { searchParams } = new URL(request.url);
  const scope = normalizePredictionShareScope(searchParams.get("scope"));
  const share = await getPublicPredictionShareBySlug(shareSlug, scope);

  if (!share) {
    return new Response("Prediction not found", { status: 404 });
  }

  return new ImageResponse(
    createElement(PredictionShareImage, { share, variant: "og" }),
    {
      headers: cacheHeaders,
      height: 630,
      width: 1200,
    },
  );
}
