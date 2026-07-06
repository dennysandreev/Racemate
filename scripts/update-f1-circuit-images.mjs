import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const racingBaseUrl = "https://www.formula1.com/en/racing/2026";
const outputDir = path.join(process.cwd(), "public", "f1", "circuits");
const attributionPath = path.join(process.cwd(), "public", "f1", "ATTRIBUTION.md");
const downloadedDate = new Date().toISOString().slice(0, 10);

const racePages = [
  ["australia", "australia"],
  ["china", "china"],
  ["japan", "japan"],
  ["miami", "miami"],
  ["canada", "canada"],
  ["monaco", "monaco"],
  ["barcelona-catalunya", "barcelona-catalunya"],
  ["austria", "austria"],
  ["great-britain", "great-britain"],
  ["belgium", "belgium"],
  ["hungary", "hungary"],
  ["netherlands", "netherlands"],
  ["italy", "italy"],
  ["azerbaijan", "baku"],
  ["singapore", "singapore"],
  ["united-states", "usa"],
  ["mexico", "mexico"],
  ["brazil", "brazil"],
  ["las-vegas", "las-vegas"],
  ["spain", "spain"],
  ["qatar", "qatar"],
  ["united-arab-emirates", "abu-dhabi"],
];

const displayNames = {
  australia: "Australia",
  china: "China",
  japan: "Japan",
  miami: "Miami",
  canada: "Canada",
  monaco: "Monaco",
  "barcelona-catalunya": "Barcelona-Catalunya",
  austria: "Austria",
  "great-britain": "Great Britain",
  belgium: "Belgium",
  hungary: "Hungary",
  netherlands: "Netherlands",
  italy: "Italy",
  baku: "Azerbaijan/Baku",
  singapore: "Singapore",
  usa: "United States/COTA",
  mexico: "Mexico",
  brazil: "Brazil",
  "las-vegas": "Las Vegas",
  spain: "Spain/Madring",
  qatar: "Qatar",
  "abu-dhabi": "Abu Dhabi",
};

const teamAttributionLines = [
  "## Team Logos",
  "",
  "- Alpine: https://media.formula1.com/image/upload/c_lfill,w_160/q_auto/v1740000001/common/f1/2026/alpine/2026alpinelogowhite.webp",
  "- Aston Martin: https://assets.astonmartinf1.com/public/cms/29S4paAKB9c3x7bCuLWApv/ecd8fe87c0f069d3f33ad1e5a66d7760/2025_AMF1_Team__logo_wide_white_RGB_BG.svg",
  "- Audi: https://media.formula1.com/image/upload/c_lfill,w_160/q_auto/v1740000001/common/f1/2026/audi/2026audilogowhite.webp",
  "- Cadillac: https://media.formula1.com/image/upload/c_lfill,w_160/q_auto/v1740000001/common/f1/2026/cadillac/2026cadillaclogowhite.webp",
  "- Ferrari: https://media.formula1.com/image/upload/c_lfill,w_160/q_auto/v1740000001/common/f1/2026/ferrari/2026ferrarilogowhite.webp",
  "- Haas F1 Team: https://www.haasf1team.com/themes/haas/assets/logos/new/TGRHF1_Team_Logo_Full_Vert.svg",
  "- McLaren: https://media.formula1.com/image/upload/c_lfill,w_160/q_auto/v1740000001/common/f1/2026/mclaren/2026mclarenlogowhite.webp",
  "- Mercedes: https://media.formula1.com/image/upload/c_lfill,w_160/q_auto/v1740000001/common/f1/2026/mercedes/2026mercedeslogowhite.webp",
  "- Racing Bulls: https://media.formula1.com/image/upload/c_lfill,w_160/q_auto/v1740000001/common/f1/2026/racingbulls/2026racingbullslogowhite.webp",
  "- Red Bull Racing: https://www.redbullracing.com/_next/static/media/ORBR_logo_2026.4059dac5.svg",
  "- Williams: https://media.formula1.com/image/upload/c_lfill,w_160/q_auto/v1740000001/common/f1/2026/williams/2026williamslogowhite.webp",
];

function findTrackImageUrl(html) {
  const urls = Array.from(
    html.matchAll(
      /https:\/\/media\.formula1\.com\/image\/upload\/[^"'\\\s]+common\/f1\/2026\/track\/[^"'\\\s]+detailed\.webp/g,
    ),
    ([url]) => url,
  );

  return urls.find((url) => url.includes("c_fit,h_704")) ?? urls[0] ?? null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 RaceMateAssetSync/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 RaceMateAssetSync/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

await mkdir(outputDir, { recursive: true });

const manifest = [];

for (const [pageSlug, fileSlug] of racePages) {
  const pageUrl = `${racingBaseUrl}/${pageSlug}`;
  const html = await fetchText(pageUrl);
  const imageUrl = findTrackImageUrl(html);

  if (!imageUrl) {
    throw new Error(`Track image was not found on ${pageUrl}`);
  }

  const image = await fetchBytes(imageUrl);
  const outputPath = path.join(outputDir, `${fileSlug}.webp`);

  await writeFile(outputPath, image);
  manifest.push({ file: `/f1/circuits/${fileSlug}.webp`, pageUrl, sourceUrl: imageUrl });
  console.log(`updated ${fileSlug}.webp`);
}

await writeFile(
  path.join(outputDir, "formula1-2026-sources.json"),
  `${JSON.stringify({ downloadedAt: new Date().toISOString(), sources: manifest }, null, 2)}\n`,
);

const circuitAttributionLines = [
  "# RaceMate F1 Assets Attribution",
  "",
  "## Circuit Images",
  "",
  `Downloaded on ${downloadedDate} from the official Formula1.com 2026 race pages / media.formula1.com for local display in RaceMate.`,
  "",
  ...manifest.map((source) => {
    const slug = source.file.split("/").pop()?.replace(".webp", "") ?? source.file;
    const label = displayNames[slug] ?? slug;
    return `- ${label}: ${source.sourceUrl} (page: ${source.pageUrl})`;
  }),
  "",
  ...teamAttributionLines,
  "",
];

await writeFile(attributionPath, circuitAttributionLines.join("\n"));
