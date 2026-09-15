import FantasyPage, { type FantasySearchParams } from "@/app/fantasy/page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  description: "Лиги RaceSide: соревнуйся с друзьями, вступай в открытые лиги и следи за рейтингом.",
  path: "/fantasy/leagues",
  title: "Фентази-лиги",
});

export default async function FantasyLeaguesRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return FantasyPage({ searchParams: Promise.resolve(normalizeQuery(query, "leagues")) });
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
