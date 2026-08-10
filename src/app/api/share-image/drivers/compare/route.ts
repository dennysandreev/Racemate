import { ImageResponse } from "next/og";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";

import { DriverComparisonShareImage } from "@/components/racemate/driver-comparison-share-image";
import { getDriverComparisonData, getPublishedSeasons } from "@/data/racemate-repository";
import {
  normalizeDriverComparisonSlug,
  resolveDriverComparisonRound,
  resolveDriverComparisonSelection,
} from "@/lib/driver-comparison";
import { getPredictionShareFonts } from "@/lib/prediction-share-fonts";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";
import { resolvePublishedSeason } from "@/lib/season-navigation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = await consumeIpRateLimit("api:driver-comparison-share-image", request, 30, 60 * 1_000);

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

  if (!selection.left || !selection.right) {
    return new Response("Drivers not found", { status: 404 });
  }

  const round = resolveDriverComparisonRound(
    searchParams.get("round") ?? undefined,
    dataset.latestCompletedRound,
  );
  const left = dataset.drivers.find((driver) => driver.slug === selection.left);
  const right = dataset.drivers.find((driver) => driver.slug === selection.right);
  const leftSnapshot = left?.snapshots.findLast((snapshot) => snapshot.round <= round);
  const rightSnapshot = right?.snapshots.findLast((snapshot) => snapshot.round <= round);
  const raceName = dataset.rounds.find((item) => item.round === round)?.raceName;

  if (!left || !right || !leftSnapshot || !rightSnapshot || !raceName) {
    return new Response("Comparison is not ready", { status: 404 });
  }

  const fonts = await getPredictionShareFonts();
  const isCurrentSeason = season === Math.max(...publishedSeasons);

  return new ImageResponse(
    createElement(DriverComparisonShareImage, {
      left: {
        ...left,
        avatarUrl: getSupportedShareImage(left.avatarUrl, left.slug),
      },
      leftSnapshot,
      raceName,
      right: {
        ...right,
        avatarUrl: getSupportedShareImage(right.avatarUrl, right.slug),
      },
      rightSnapshot,
      round,
      season,
      siteOrigin: new URL(request.url).origin,
    }),
    {
      headers: {
        "Cache-Control": isCurrentSeason
          ? "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
          : "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
      },
      height: 1350,
      fonts,
      width: 1080,
    },
  );
}

function getSupportedShareImage(
  value: string | null | undefined,
  slug: string,
) {
  if (value && /^(?:https:\/\/|\/).+\.(?:jpe?g|png)(?:\?.*)?$/i.test(value)) {
    return value;
  }

  const localAvatar = `/drivers/avatars/${slug}.png`;

  return existsSync(join(process.cwd(), "public", localAvatar.slice(1)))
    ? localAvatar
    : "/drivers/avatars/archive-helmet-neutral.png";
}
