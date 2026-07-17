import { CumulativePointsChart } from "@/components/racemate/cumulative-points-chart";
import type { DriverProfile } from "@/types/racemate";

export function DriverCumulativePointsChart({ profile }: { profile: DriverProfile }) {
  const selectedSeries = profile.charts.topTenCumulativePoints.find((item) => item.driverId === profile.id);
  const rounds = selectedSeries?.points ?? [
    { round: 0, raceName: "Старт", value: 0 },
    ...profile.charts.cumulativePoints,
  ];
  const series = selectedSeries
    ? profile.charts.topTenCumulativePoints
    : [{
        driverId: profile.id,
        driver: profile.fullName,
        driverSlug: profile.slug,
        points: rounds,
        teamColor: profile.team.color ?? undefined,
      }];

  return (
    <CumulativePointsChart
      ariaLabel={`Накопленные очки ${profile.fullName} и лидеров чемпионата`}
      emptyLabel="Данных для графика пока нет."
      series={series.map((item) => {
        const isPrimary = item.driverId === profile.id;
        const slug = isPrimary ? profile.slug : item.driverSlug;

        return {
          id: item.driverId,
          name: item.driver,
          color: isPrimary
            ? profile.team.color ?? undefined
            : item.teamColor,
          href: slug ? `/drivers/${slug}?season=${profile.season}` : undefined,
          points: item.points,
          primary: isPrimary,
        };
      })}
    />
  );
}
