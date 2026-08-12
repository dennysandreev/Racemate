import { getDriverComparisonData, getPublishedSeasons } from "@/data/racemate-repository";
import {
  parseDriverComparisonShareCode,
  resolveDriverComparisonRound,
} from "@/lib/driver-comparison";
import { resolvePublicSiteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const parsed = parseDriverComparisonShareCode(code);

  if (!parsed) {
    return notFoundResponse();
  }

  const publishedSeasons = await getPublishedSeasons();

  if (!publishedSeasons.includes(parsed.season)) {
    return notFoundResponse();
  }

  const directory = await getDriverComparisonData(parsed.season, []);
  const left = directory.options.find((driver) => matchesDriverKey(driver, parsed.leftKey));
  const right = directory.options.find((driver) => matchesDriverKey(driver, parsed.rightKey));

  if (!left || !right || left.slug === right.slug) {
    return notFoundResponse();
  }

  const round = resolveDriverComparisonRound(
    String(parsed.round),
    directory.latestCompletedRound,
  );
  const raceName = directory.rounds.find((item) => item.round === round)?.raceName;

  if (!round || !raceName) {
    return notFoundResponse();
  }

  const origin = resolvePublicSiteOrigin(request.url);
  const comparisonParams = new URLSearchParams({
    season: String(parsed.season),
    a: left.slug,
    b: right.slug,
    round: String(round),
  });
  const destination = new URL(`/drivers/compare?${comparisonParams.toString()}`, origin);
  const ogImage = new URL(`/api/og/drivers/compare?${comparisonParams.toString()}`, origin);
  const shortUrl = new URL(`/c/${code}`, origin);
  const title = `${left.fullName} и ${right.fullName} — сравнение пилотов`;
  const description = `Сезон ${parsed.season}, этап ${round}: ${raceName}. Сравнение результатов на RaceSide.`;
  const isCurrentSeason = parsed.season === Math.max(...publishedSeasons);

  return new Response(renderRedirectPage({
    description,
    destination: destination.toString(),
    image: ogImage.toString(),
    shortUrl: shortUrl.toString(),
    title,
  }), {
    headers: {
      "Cache-Control": isCurrentSeason
        ? "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
        : "public, max-age=300, s-maxage=300, stale-while-revalidate=1800",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, follow, max-image-preview:large",
    },
  });
}

function matchesDriverKey(
  driver: { code?: string; number: number | null },
  key: string,
) {
  return driver.code?.toUpperCase() === key || String(driver.number ?? "") === key;
}

function renderRedirectPage({
  description,
  destination,
  image,
  shortUrl,
  title,
}: {
  description: string;
  destination: string;
  image: string;
  shortUrl: string;
  title: string;
}) {
  const escapedDescription = escapeHtml(description);
  const escapedDestination = escapeHtml(destination);
  const escapedImage = escapeHtml(image);
  const escapedShortUrl = escapeHtml(shortUrl);
  const escapedTitle = escapeHtml(title);

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapedTitle} | RaceSide</title>
    <meta name="description" content="${escapedDescription}">
    <meta name="robots" content="noindex, follow, max-image-preview:large">
    <link rel="canonical" href="${escapedShortUrl}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="RaceSide">
    <meta property="og:locale" content="ru_RU">
    <meta property="og:title" content="${escapedTitle}">
    <meta property="og:description" content="${escapedDescription}">
    <meta property="og:url" content="${escapedShortUrl}">
    <meta property="og:image" content="${escapedImage}">
    <meta property="og:image:secure_url" content="${escapedImage}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${escapedTitle}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapedTitle}">
    <meta name="twitter:description" content="${escapedDescription}">
    <meta name="twitter:image" content="${escapedImage}">
    <meta name="twitter:image:alt" content="${escapedTitle}">
    <meta http-equiv="refresh" content="0;url=${escapedDestination}">
  </head>
  <body style="margin:0;background:#090909;color:#f5f4f2;font-family:Arial,sans-serif">
    <main style="display:grid;min-height:100vh;place-items:center;padding:24px;text-align:center">
      <div>
        <p>Открываем сравнение пилотов…</p>
        <a href="${escapedDestination}" style="color:#ff312a">Перейти к сравнению</a>
      </div>
    </main>
    <script>window.location.replace(${JSON.stringify(destination)});</script>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function notFoundResponse() {
  return new Response("Ссылка не найдена", {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
    status: 404,
  });
}
