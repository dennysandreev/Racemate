const DRIVER_SEASON_NUMBER_OVERRIDES: Record<string, Array<{
  from: number;
  number: number;
  to: number;
}>> = {
  "lando-norris": [{ from: 2020, number: 4, to: 2025 }],
  "max-verstappen": [
    { from: 2020, number: 33, to: 2021 },
    { from: 2022, number: 1, to: 2025 },
  ],
};

export function getDriverSeasonNumberOverride(slug: string | null | undefined, season: number) {
  if (!slug) {
    return undefined;
  }

  return DRIVER_SEASON_NUMBER_OVERRIDES[slug]
    ?.find((entry) => season >= entry.from && season <= entry.to)
    ?.number;
}
