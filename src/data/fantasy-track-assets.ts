import creditsManifest from "@/data/fantasy-track-photo-credits.json";

export type FantasyTrackAssetVariant = "hero" | "card" | "thumb";

export type FantasyTrackVisual = {
  alt: string;
  author: string;
  cardUrl: string;
  credit: string;
  heroUrl: string;
  height: number;
  license: string;
  reviewStatus: string;
  sourcePageUrl: string;
  thumbUrl: string;
  visibleSegment: string;
  width: number;
};

const FANTASY_TRACKS_2026 = creditsManifest.tracks;

export function getFantasyTrackVisual(
  season: number | null | undefined,
  round: number | null | undefined,
  raceName = "трассы",
): FantasyTrackVisual | null {
  if (
    season !== creditsManifest.season
    || !round
    || round < 1
    || round > FANTASY_TRACKS_2026.length
  ) {
    return null;
  }

  const track = FANTASY_TRACKS_2026[round - 1];
  if (!track || track.round !== round) {
    return null;
  }

  const prefix = `/f1/tracks/fantasy/${season}/${String(round).padStart(2, "0")}-${track.layoutSlug}`;

  return {
    alt: `Фотография: ${track.visibleSegment}, этап «${raceName}»`,
    author: track.author,
    cardUrl: `${prefix}.card.webp`,
    credit: `${track.author} · ${track.license}`,
    heroUrl: `${prefix}.hero.webp`,
    height: 960,
    license: track.license,
    reviewStatus: track.reviewStatus,
    sourcePageUrl: track.sourcePageUrl,
    thumbUrl: `${prefix}.thumb.webp`,
    visibleSegment: track.visibleSegment,
    width: 1280,
  };
}

export function getFantasyTrackVariant(
  visual: FantasyTrackVisual,
  variant: FantasyTrackAssetVariant,
) {
  if (variant === "card") {
    return { src: visual.cardUrl, width: 768, height: 576 };
  }

  if (variant === "thumb") {
    return { src: visual.thumbUrl, width: 384, height: 288 };
  }

  return { src: visual.heroUrl, width: visual.width, height: visual.height };
}
