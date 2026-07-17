import { CumulativePointsChart } from "@/components/racemate/cumulative-points-chart";
import type { TeamCumulativePointsSeries, TeamProfile } from "@/types/racemate";

export function TeamCumulativePointsChart({ team }: { team: TeamProfile }) {
  const selectedCode = normalizeTeamCode(team.code);

  function isSelected(item: TeamCumulativePointsSeries) {
    return normalizeTeamCode(item.teamCode) === selectedCode;
  }

  return (
    <CumulativePointsChart
      ariaLabel={`Накопленные очки команды ${team.shortName} и остальных команд чемпионата`}
      emptyLabel="Данных для сравнения пока нет."
      series={team.cumulativePointsSeries.map((item) => {
        const primary = isSelected(item);
        const slug = primary ? team.slug : item.teamSlug;

        return {
          id: item.teamCode,
          name: item.team,
          color: primary ? team.color : item.teamColor,
          href: slug ? `/teams/${slug}?season=${team.season}` : undefined,
          points: item.points,
          primary,
        };
      })}
    />
  );
}

function normalizeTeamCode(value: string) {
  return value.trim().toLowerCase();
}
