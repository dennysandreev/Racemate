import type { Metadata } from "next";

export const SITE_NAME = "RaceSide";
export const SITE_URL = "https://raceside.online";
export const SITE_LOCALE = "ru_RU";
export const SITE_LANGUAGE = "ru-RU";
export const DEFAULT_SITE_DESCRIPTION =
  "Новости Формулы-1 на русском, календарь, результаты, таблицы чемпионата, статистика пилотов и команд, прогнозы и гоночные уикенды.";

const DEFAULT_SOCIAL_IMAGE = {
  alt: "RaceSide - гоночный центр для фанатов Формулы-1",
  height: 916,
  url: `${SITE_URL}/stitch/news-blog-hero-v2.webp`,
  width: 1717,
};

type PageMetadataOptions = {
  authors?: string[];
  description: string;
  image?: string | null;
  noFollow?: boolean;
  noIndex?: boolean;
  path: string;
  publishedTime?: string | null;
  section?: string;
  tags?: string[];
  title: string;
  type?: "article" | "website";
};

export function absoluteUrl(pathOrUrl: string) {
  return new URL(pathOrUrl, SITE_URL).toString();
}

export function resolvePublicSiteOrigin(
  requestUrl: string,
  environment = process.env.NODE_ENV,
) {
  return environment === "production"
    ? new URL(SITE_URL).origin
    : new URL(requestUrl).origin;
}

export function createPageMetadata({
  authors,
  description,
  image,
  noFollow = false,
  noIndex = false,
  path,
  publishedTime,
  section,
  tags,
  title,
  type = "website",
}: PageMetadataOptions): Metadata {
  const canonicalUrl = absoluteUrl(path);
  const pageTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const socialImage = image
    ? {
        alt: title,
        url: absoluteUrl(image),
      }
    : DEFAULT_SOCIAL_IMAGE;
  const openGraph: Metadata["openGraph"] = type === "article"
    ? {
        authors,
        description,
        images: [socialImage],
        locale: SITE_LOCALE,
        publishedTime: publishedTime ?? undefined,
        section,
        siteName: SITE_NAME,
        tags,
        title: pageTitle,
        type: "article",
        url: canonicalUrl,
      }
    : {
        description,
        images: [socialImage],
        locale: SITE_LOCALE,
        siteName: SITE_NAME,
        title: pageTitle,
        type: "website",
        url: canonicalUrl,
      };

  return {
    alternates: {
      canonical: canonicalUrl,
      languages: {
        "ru-RU": canonicalUrl,
      },
    },
    description,
    openGraph,
    robots: {
      follow: !noFollow,
      index: !noIndex,
      googleBot: {
        follow: !noFollow,
        index: !noIndex,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    title: pageTitle,
    twitter: {
      card: "summary_large_image",
      description,
      images: [socialImage.url],
      title: pageTitle,
    },
  };
}

export function buildSeasonPath(
  pathname: string,
  season: number,
  currentSeason: number,
) {
  return season === currentSeason ? pathname : `${pathname}?season=${season}`;
}

export function truncateSeoText(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}
