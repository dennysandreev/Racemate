export const CURRENT_F1_SEASON = 2026;

export type SeasonSearchParams = Record<string, string | string[] | undefined>;

export function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolvePublishedSeason(
  value: string | string[] | undefined,
  publishedSeasons: number[],
) {
  const requestedSeason = getSearchParam(value);

  if (requestedSeason === undefined) {
    return publishedSeasons.includes(CURRENT_F1_SEASON) ? CURRENT_F1_SEASON : null;
  }

  if (!/^\d{4}$/.test(requestedSeason)) {
    return null;
  }

  const season = Number(requestedSeason);
  return publishedSeasons.includes(season) ? season : null;
}

export function buildSeasonHref(
  pathname: string,
  season: number,
  query: SeasonSearchParams = {},
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (key === "season" || value === undefined) {
      continue;
    }

    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      search.append(key, item);
    }
  }

  search.set("season", String(season));
  return `${pathname}?${search.toString()}`;
}
