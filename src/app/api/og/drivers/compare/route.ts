import { ImageResponse } from "next/og";
import { createElement } from "react";

import { DriverComparisonOgImage } from "@/components/racemate/driver-comparison-og-image";
import { getDriverComparisonData, getPublishedSeasons } from "@/data/racemate-repository";
import {
  normalizeDriverComparisonSlug,
  resolveDriverComparisonRound,
  resolveDriverComparisonSelection,
} from "@/lib/driver-comparison";
import { getDriverShareAvatarDataUrl } from "@/lib/driver-share-avatar";
import { getPredictionShareFonts } from "@/lib/prediction-share-fonts";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";
import { resolvePublishedSeason } from "@/lib/season-navigation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = await consumeIpRateLimit("api:driver-comparison-og-image", request, 60, 60 * 1_000);

  if (!limit.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": getRetryAfterSeconds(limit.resetAt) },
    });
  }

  const { searchParams } = new URL(request.url);
  const publishedSeasons = await getPublishedSeasons();
  const season = resolvePublishedSeason(searchParams.get("season") ?? undefined, publishedSeasons);
  const requestedLeft = normalizeDriverComparisonSlug(searchParams.get("a"));
  const requestedRight = normalizeDriverComparisonSlug(searchParams.get("b"));

  if (!season || !requestedLeft || !requestedRight || requestedLeft === requestedRight) {
    return new Response("Invalid comparison", { status: 400 });
  }

  const dataset = await getDriverComparisonData(season, [requestedLeft, requestedRight]);
  const selection = resolveDriverComparisonSelection(
    requestedLeft,
    requestedRight,
    dataset.options.map((option) => option.slug),
  );
  const round = resolveDriverComparisonRound(
    searchParams.get("round") ?? undefined,
    dataset.latestCompletedRound,
  );
  const left = dataset.drivers.find((driver) => driver.slug === selection.left);
  const right = dataset.drivers.find((driver) => driver.slug === selection.right);
  const raceName = dataset.rounds.find((item) => item.round === round)?.raceName;

  if (!left || !right || !raceName) {
    return new Response("Comparison is not ready", { status: 404 });
  }

  const [fonts, leftAvatarUrl, rightAvatarUrl] = await Promise.all([
    getPredictionShareFonts(),
    getDriverShareAvatarDataUrl(left.avatarUrl, left.slug),
    getDriverShareAvatarDataUrl(right.avatarUrl, right.slug),
  ]);
  const isCurrentSeason = season === Math.max(...publishedSeasons);

  return new ImageResponse(
    createElement(DriverComparisonOgImage, {
      left: { ...left, avatarUrl: leftAvatarUrl },
      raceName,
      right: { ...right, avatarUrl: rightAvatarUrl },
      round,
      season,
    }),
    {
      headers: {
        "Cache-Control": isCurrentSeason
          ? "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
          : "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
        "X-Robots-Tag": "noindex, noarchive, max-image-preview:large",
      },
      height: 630,
      fonts,
      width: 1200,
    },
  );
}
