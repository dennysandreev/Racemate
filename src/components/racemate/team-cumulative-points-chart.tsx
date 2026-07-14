"use client";

import { useState, type PointerEvent } from "react";
import { TrendingUp } from "lucide-react";

import { StitchPanel, StitchPanelHeader } from "@/components/racemate/stitch-primitives";
import type { DriverChartPoint, TeamCumulativePointsSeries, TeamProfile } from "@/types/racemate";

type HoveredSeries = {
  teamCode: string;
  name: string;
  color: string;
  x: number;
  y: number;
};

export function TeamCumulativePointsChart({ team }: { team: TeamProfile }) {
  const [hovered, setHovered] = useState<HoveredSeries | null>(null);
  const selectedCode = normalizeTeamCode(team.code);
  const selectedSeries = team.cumulativePointsSeries.find(
    (item) => normalizeTeamCode(item.teamCode) === selectedCode,
  );
  const rounds = selectedSeries?.points ?? team.cumulativePointsSeries[0]?.points ?? [];
  const series = team.cumulativePointsSeries;
  const max = Math.max(1, ...series.flatMap((item) => item.points.map((point) => point.value ?? 0)));
  const yTicks = Array.from({ length: 5 }, (_, index) => (max / 4) * index);
  const xLabelStep = Math.max(1, Math.ceil(Math.max(1, rounds.length - 1) / 8));

  function isSelected(item: TeamCumulativePointsSeries) {
    return normalizeTeamCode(item.teamCode) === selectedCode;
  }

  function handlePointerMove(event: PointerEvent<SVGPolylineElement>, item: TeamCumulativePointsSeries) {
    const color = isSelected(item)
      ? team.color
      : item.teamColor ?? "oklch(var(--primary))";

    setHovered({
      teamCode: item.teamCode,
      name: item.team,
      color,
      x: Math.min(event.clientX + 14, window.innerWidth - 196),
      y: Math.min(event.clientY + 14, window.innerHeight - 48),
    });
  }

  return (
    <StitchPanel className="min-w-0 overflow-hidden">
      <StitchPanelHeader icon={TrendingUp} title="Накопленные очки" />
      <div className="grid gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2 text-foreground">
            <span className="size-2 rounded-full" style={{ backgroundColor: team.color }} />
            {team.shortName}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-muted-foreground/60" />
            Остальные команды
          </span>
        </div>

        {rounds.length ? (
          <div className="relative h-64 min-w-0 select-none sm:h-72">
            <div className="absolute bottom-8 left-10 right-3 top-2">
              <svg
                aria-label={`Накопленные очки команды ${team.shortName} и остальных команд чемпионата`}
                className="h-full w-full overflow-visible"
                preserveAspectRatio="none"
                role="img"
                viewBox="0 0 100 100"
                onPointerLeave={() => setHovered(null)}
              >
                {yTicks.map((value) => {
                  const y = getY(value, max);

                  return (
                    <line
                      key={value}
                      stroke="currentColor"
                      strokeOpacity="0.14"
                      strokeWidth="0.45"
                      x1="0"
                      x2="100"
                      y1={y}
                      y2={y}
                    />
                  );
                })}
                <line stroke="currentColor" strokeOpacity="0.35" strokeWidth="0.55" x1="0" x2="0" y1="0" y2="100" />
                <line stroke="currentColor" strokeOpacity="0.35" strokeWidth="0.55" x1="0" x2="100" y1="100" y2="100" />

                {series.map((item) => {
                  const selected = isSelected(item);
                  const isHovered = hovered?.teamCode === item.teamCode;
                  const hasHover = Boolean(hovered);
                  const color = selected
                    ? team.color
                    : isHovered
                      ? item.teamColor ?? "oklch(var(--primary))"
                      : "currentColor";
                  const opacity = isHovered || (!hasHover && selected)
                    ? 1
                    : hasHover
                      ? 0.18
                      : selected
                        ? 1
                        : 0.32;

                  return (
                    <g key={item.teamCode} opacity={opacity}>
                      <polyline
                        fill="none"
                        points={getPath(item.points, max)}
                        stroke={color}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={isHovered || selected ? "2.5" : "1.05"}
                      />
                      {item.points.map((point, index, points) => (
                        <circle
                          cx={getX(index, points.length)}
                          cy={getY(point.value ?? 0, max)}
                          fill={color}
                          key={`${item.teamCode}-${point.round}`}
                          r={isHovered ? "1.75" : selected ? "1.35" : "0.75"}
                          stroke={selected || isHovered ? "oklch(var(--background))" : "none"}
                          strokeWidth="0.5"
                        />
                      ))}
                      <polyline
                        fill="none"
                        points={getPath(item.points, max)}
                        stroke="transparent"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="8"
                        onPointerEnter={(event) => handlePointerMove(event, item)}
                        onPointerMove={(event) => handlePointerMove(event, item)}
                      />
                    </g>
                  );
                })}
              </svg>

              {yTicks.map((value) => (
                <span
                  className="absolute -left-9 w-7 -translate-y-1/2 text-right font-telemetry text-[0.6rem] font-medium leading-none text-muted-foreground"
                  key={`label-${value}`}
                  style={{ top: `${getY(value, max)}%` }}
                >
                  {formatAxisValue(value)}
                </span>
              ))}

              {rounds.map((point, index, points) => {
                const isFirst = index === 0;
                const isLast = index === points.length - 1;

                if (!isFirst && !isLast && index % xLabelStep !== 0) {
                  return null;
                }

                return (
                  <span
                    className="absolute -bottom-5 -translate-x-1/2 font-telemetry text-[0.6rem] font-medium leading-none text-muted-foreground"
                    key={`round-${point.round}`}
                    style={{ left: `${getX(index, points.length)}%` }}
                  >
                    {point.round === 0 ? "0" : `R${point.round}`}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Данных для сравнения пока нет.</p>
        )}
      </div>

      {hovered ? (
        <div
          className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold shadow-lg"
          style={{ left: Math.max(12, hovered.x), top: Math.max(12, hovered.y) }}
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: hovered.color }} />
          {hovered.name}
        </div>
      ) : null}
    </StitchPanel>
  );
}

function getPath(points: DriverChartPoint[], max: number) {
  return points.map((point, index) => `${getX(index, points.length)},${getY(point.value ?? 0, max)}`).join(" ");
}

function getX(index: number, length: number) {
  return length <= 1 ? 0 : (index / (length - 1)) * 100;
}

function getY(value: number, max: number) {
  return 100 - (Math.max(0, Math.min(max, value)) / Math.max(1, max)) * 100;
}

function formatAxisValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function normalizeTeamCode(value: string) {
  return value.trim().toLowerCase();
}
