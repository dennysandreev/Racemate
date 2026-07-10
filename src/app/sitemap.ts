import type { MetadataRoute } from "next";

const SITE_URL = "https://racemate.ru";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/news",
    "/social",
    "/calendar",
    "/weekend",
    "/leaderboard",
    "/teams",
    "/fantasy",
    "/leagues",
    "/polls",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
}
