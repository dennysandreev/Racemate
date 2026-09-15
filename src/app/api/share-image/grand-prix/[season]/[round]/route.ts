import { ImageResponse } from "next/og";
import { createElement } from "react";

import { GrandPrixRecapShareImage } from "@/components/racemate/grand-prix-recap-share-image";
import {
  getRaceDetail,
  getRaceGrandPrixReport,
  getRaceSessions,
  getSessionResultsBySessionIds,
  getTeamProfiles,
} from "@/data/racemate-repository";
import {
  buildGrandPrixRecapData,
  getGrandPrixRecapImageLayout,
} from "@/lib/grand-prix-recap";
import { getPredictionShareFonts } from "@/lib/prediction-share-fonts";
import { consumeIpRateLimit, getRetryAfterSeconds } from "@/lib/rate-limit";
import { readPublicShareImageDataUrl } from "@/lib/share-image-assets";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ round: string; season: string }> },
) {
  const limit = await consumeIpRateLimit("api:grand-prix-recap-share-image", request, 30, 60_000);

  if (!limit.ok) {
    return new Response("Too many requests", {
      headers: { "Retry-After": getRetryAfterSeconds(limit.resetAt) },
      status: 429,
    });
  }

  const { round: roundValue, season: seasonValue } = await params;
  const season = Number(seasonValue);
  const round = Number(roundValue);

  if (!Number.isInteger(season) || !Number.isInteger(round) || season < 1950 || round < 1) {
    return new Response("Invalid race", { status: 400 });
  }

  const [race, report, sessions, teamProfiles] = await Promise.all([
    getRaceDetail(season, round),
    getRaceGrandPrixReport(season, round),
    getRaceSessions(season, round),
    getTeamProfiles(season),
  ]);

  if (!race || !report || !sessions.length) {
    return new Response("Recap is not ready", { status: 404 });
  }

  const resultsBySession = await getSessionResultsBySessionIds(
    sessions.map((session) => session.id),
    season,
  );
  const data = buildGrandPrixRecapData({ race, report, resultsBySession, sessions, teamProfiles });

  if (!data) {
    return new Response("Recap is not ready", { status: 404 });
  }

  const [fonts, carImageUrl, trackImageUrl, dhlLogoUrl, timerIconUrl, breakthroughIconUrl, ...avatarUrls] = await Promise.all([
    getPredictionShareFonts(),
    embedPublicImage(data.bestTeam.carImagePath),
    embedPublicImage(data.track.imagePath),
    embedPublicImage("/brand/dhl-logo.svg"),
    embedPublicImage("/brand/icons/timer.svg"),
    embedPublicImage("/brand/icons/trending-up.svg"),
    ...data.podium.map((entry) => embedPublicImage(entry.avatarPath)),
  ]);

  return new ImageResponse(
    createElement(GrandPrixRecapShareImage, {
      data: {
        ...data,
        bestTeam: { ...data.bestTeam, carImageUrl },
        breakthroughIconUrl,
        dhlLogoUrl,
        podium: data.podium.map((entry, index) => ({
          ...entry,
          avatarUrl: avatarUrls[index] ?? null,
        })),
        track: { ...data.track, imageUrl: trackImageUrl },
        timerIconUrl,
      },
    }),
    {
      fonts,
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900",
        "Content-Disposition": `inline; filename="raceside-${season}-round-${round}-recap.png"`,
      },
      height: getGrandPrixRecapImageLayout(data.raceName).canvasHeight,
      width: 1080,
    },
  );
}

function embedPublicImage(value: string | null) {
  return value ? readPublicShareImageDataUrl(value) : Promise.resolve(null);
}
