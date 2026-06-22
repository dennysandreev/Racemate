import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/account",
        "/auth",
        "/onboarding",
        "/predictions",
        "/news?",
      ],
    },
    sitemap: "https://racemate.ru/sitemap.xml",
  };
}
