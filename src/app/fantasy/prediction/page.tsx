import FantasyPage, { type FantasySearchParams } from "@/app/fantasy/page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  description: "Конструктор прогноза RaceSide: квалификация, топ-10 гонки и дополнительные выборы.",
  path: "/fantasy/prediction",
  title: "Прогноз на Гран-при",
});

export default async function FantasyPredictionRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return FantasyPage({ searchParams: Promise.resolve(normalizeQuery(query, "picks")) });
}

function normalizeQuery(
  query: Record<string, string | string[] | undefined>,
  tab: FantasySearchParams["tab"],
): FantasySearchParams {
  return Object.fromEntries(
    Object.entries({ ...query, tab }).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.at(-1) : value,
    ]),
  ) as FantasySearchParams;
}
