"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type PointerEvent } from "react";
import { TrendingUp } from "lucide-react";

import { StitchPanel, StitchPanelHeader } from "@/components/racemate/stitch-primitives";
import type { DriverChartPoint } from "@/types/racemate";

export type CumulativePointsChartSeries = {
  id: string;
  name: string;
  color?: string;
  href?: string;
  points: DriverChartPoint[];
  primary?: boolean;
};

type HoveredPoint = {
  index: number;
  seriesId: string;
};

export function CumulativePointsChart({
  ariaLabel,
  emptyLabel,
  series,
}: {
  ariaLabel: string;
  emptyLabel: string;
  series: CumulativePointsChartSeries[];
}) {
  const router = useRouter();
  const gradientId = useId().replaceAll(":", "");
  const [hovered, setHovered] = useState<HoveredPoint | null>(null);
  const trimmedSeries = series
    .map((item) => ({ ...item, points: trimTrailingEmptyPoints(item.points) }))
    .filter((item) => item.points.length > 0);
  const preparedSeries = [
    ...trimmedSeries.filter((item) => item.primary),
    ...trimmedSeries.filter((item) => !item.primary),
  ];
  const renderedSeries = [
    ...preparedSeries.filter((item) => !item.primary),
    ...preparedSeries.filter((item) => item.primary),
  ];
  const primarySeries = preparedSeries.find((item) => item.primary) ?? preparedSeries[0];
  const rounds = primarySeries?.points ?? [];
  const max = getChartMaximum(preparedSeries);
  const yTicks = Array.from({ length: 5 }, (_, index) => (max / 4) * index);
  const xLabelStep = Math.max(1, Math.ceil(Math.max(1, rounds.length - 1) / 7));
  const lastPoint = primarySeries ? getLastPoint(primarySeries.points) : null;
  const hoveredSeries = hovered
    ? preparedSeries.find((item) => item.id === hovered.seriesId) ?? null
    : null;
  const hoveredIndex = hovered?.index ?? 0;
  const hoveredPoint = hoveredSeries
    ? hoveredSeries.points[Math.min(hoveredIndex, hoveredSeries.points.length - 1)]
    : null;
  const hoveredValue = hoveredSeries && hoveredPoint
    ? getPointValue(hoveredSeries.points, hoveredIndex)
    : null;
  const hoveredX = hoveredSeries
    ? getX(Math.min(hoveredIndex, hoveredSeries.points.length - 1), hoveredSeries.points.length)
    : 0;
  const hoveredY = hoveredValue === null ? 100 : getY(hoveredValue, max);

  function updateHoveredPoint(
    event: PointerEvent<SVGPathElement>,
    item: CumulativePointsChartSeries,
  ) {
    const svg = event.currentTarget.ownerSVGElement;

    if (!svg || item.points.length === 0) {
      return;
    }

    const bounds = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
    const index = Math.round(ratio * Math.max(0, item.points.length - 1));

    setHovered((current) => current?.seriesId === item.id && current.index === index
      ? current
      : { index, seriesId: item.id });
  }

  return (
    <StitchPanel className="min-w-0 overflow-hidden">
      <StitchPanelHeader
        action={lastPoint ? (
          <div className="shrink-0 text-right">
            <p className="stitch-label text-muted-foreground">После этапа {lastPoint.round}</p>
            <p className="mt-1 font-telemetry text-base font-bold text-foreground">
              {formatPoints(lastPoint.value)} оч.
            </p>
          </div>
        ) : null}
        icon={TrendingUp}
        title="Накопленные очки"
      />

      {rounds.length ? (
        <div className="grid min-w-0 gap-0">
          <div className="relative h-[17rem] min-w-0 select-none bg-muted/10 sm:h-[20rem]">
            <div className="absolute bottom-9 left-11 right-4 top-4 sm:left-12 sm:right-5 sm:top-5">
              <svg
                aria-label={ariaLabel}
                className="h-full w-full overflow-visible"
                preserveAspectRatio="none"
                role="img"
                viewBox="0 0 100 100"
                onPointerLeave={() => setHovered(null)}
              >
                <defs>
                  <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={getSeriesColor(primarySeries)} stopOpacity="0.24" />
                    <stop offset="70%" stopColor={getSeriesColor(primarySeries)} stopOpacity="0.05" />
                    <stop offset="100%" stopColor={getSeriesColor(primarySeries)} stopOpacity="0" />
                  </linearGradient>
                  <pattern height="12.5" id={`${gradientId}-grid`} patternUnits="userSpaceOnUse" width="12.5">
                    <path d="M 12.5 0 L 0 0 0 12.5" fill="none" stroke="currentColor" strokeOpacity="0.045" strokeWidth="0.35" />
                  </pattern>
                </defs>

                <rect fill={`url(#${gradientId}-grid)`} height="100" width="100" />

                {yTicks.map((value, index) => {
                  const y = getY(value, max);

                  return (
                    <line
                      key={`${value}-${index}`}
                      stroke="currentColor"
                      strokeDasharray={index === 0 ? undefined : "2 3"}
                      strokeOpacity={index === 0 ? "0.28" : "0.13"}
                      strokeWidth={index === 0 ? "0.7" : "0.4"}
                      vectorEffect="non-scaling-stroke"
                      x1="0"
                      x2="100"
                      y1={y}
                      y2={y}
                    />
                  );
                })}

                {primarySeries ? (
                  <path
                    d={getAreaPath(primarySeries.points, max)}
                    fill={`url(#${gradientId}-area)`}
                    pointerEvents="none"
                  />
                ) : null}

                {hovered ? (
                  <line
                    pointerEvents="none"
                    stroke="currentColor"
                    strokeDasharray="2 2"
                    strokeOpacity="0.34"
                    strokeWidth="0.75"
                    vectorEffect="non-scaling-stroke"
                    x1={hoveredX}
                    x2={hoveredX}
                    y1="0"
                    y2="100"
                  />
                ) : null}

                {renderedSeries.map((item, seriesIndex) => {
                  const isHovered = hovered?.seriesId === item.id;
                  const hasHover = Boolean(hovered);
                  const color = isHovered || item.primary
                    ? getSeriesColor(item)
                    : "var(--muted-foreground)";
                  const opacity = isHovered
                    ? 1
                    : hasHover
                      ? item.primary ? 0.34 : 0.1
                      : item.primary ? 1 : 0.25;
                  const lineWidth = isHovered ? 3.1 : item.primary ? 2.7 : 1.65;
                  const hitPath = (
                    <path
                      className={item.href ? "cursor-pointer" : undefined}
                      d={getLinePath(item.points, max)}
                      fill="none"
                      stroke="transparent"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="14"
                      vectorEffect="non-scaling-stroke"
                      onPointerEnter={(event) => updateHoveredPoint(event, item)}
                      onPointerMove={(event) => updateHoveredPoint(event, item)}
                    />
                  );

                  return (
                    <g
                      key={item.id}
                      opacity={opacity}
                      style={{ transition: "opacity 180ms ease" }}
                    >
                      {isHovered || item.primary ? (
                        <path
                          d={getLinePath(item.points, max)}
                          fill="none"
                          pointerEvents="none"
                          stroke={color}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeOpacity={isHovered ? "0.22" : "0.13"}
                          strokeWidth={isHovered ? "8" : "6"}
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}
                      <path
                        d={getLinePath(item.points, max)}
                        fill="none"
                        pointerEvents="none"
                        stroke={color}
                        strokeDasharray={seriesIndex > 0 && !item.primary && seriesIndex % 3 === 0 ? "5 3" : undefined}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={lineWidth}
                        style={{ transition: "stroke-width 180ms ease" }}
                        vectorEffect="non-scaling-stroke"
                      />
                      {item.href ? (
                        <a
                          aria-label={`Открыть профиль: ${item.name}`}
                          href={item.href}
                          onClick={(event) => {
                            event.preventDefault();
                            router.push(item.href as string);
                          }}
                          onFocus={() => setHovered({ index: Math.max(0, item.points.length - 1), seriesId: item.id })}
                        >
                          {hitPath}
                        </a>
                      ) : hitPath}
                    </g>
                  );
                })}
              </svg>

              {primarySeries ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-[0_0_0_3px_color-mix(in_srgb,currentColor_18%,transparent)]"
                  style={{
                    backgroundColor: getSeriesColor(primarySeries),
                    color: getSeriesColor(primarySeries),
                    left: `${getX(primarySeries.points.length - 1, primarySeries.points.length)}%`,
                    top: `${getY(getPointValue(primarySeries.points, primarySeries.points.length - 1) ?? 0, max)}%`,
                  }}
                />
              ) : null}

              {hoveredSeries && hoveredPoint && hoveredValue !== null ? (
                <>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-[0_0_0_4px_color-mix(in_srgb,currentColor_20%,transparent)]"
                    style={{
                      backgroundColor: getSeriesColor(hoveredSeries),
                      color: getSeriesColor(hoveredSeries),
                      left: `${hoveredX}%`,
                      top: `${hoveredY}%`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute z-10 min-w-40 border border-border bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm"
                    style={{
                      left: `${hoveredX}%`,
                      top: `${hoveredY}%`,
                      transform: `translate(${hoveredX > 72 ? "calc(-100% - 12px)" : "12px"}, ${hoveredY > 58 ? "calc(-100% + 4px)" : "-4px"})`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-4 w-0.5 shrink-0" style={{ backgroundColor: getSeriesColor(hoveredSeries) }} />
                      <p className="truncate text-xs font-bold text-foreground">{hoveredSeries.name}</p>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        <p className="stitch-label text-muted-foreground">Этап {hoveredPoint.round}</p>
                        <p className="mt-1 max-w-32 truncate text-xs text-muted-foreground">{hoveredPoint.raceName}</p>
                      </div>
                      <p className="font-telemetry text-lg font-bold text-foreground">{formatPoints(hoveredValue)}</p>
                    </div>
                  </div>
                </>
              ) : null}

              {yTicks.map((value, index) => (
                <span
                  className="absolute -left-10 w-8 -translate-y-1/2 text-right font-telemetry text-[0.62rem] font-semibold leading-none text-muted-foreground"
                  key={`label-${index}`}
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
                    className="absolute -bottom-6 -translate-x-1/2 font-telemetry text-[0.62rem] font-semibold leading-none text-muted-foreground"
                    key={`round-${point.round}-${index}`}
                    style={{ left: `${getX(index, points.length)}%` }}
                  >
                    {point.round === 0 ? "СТАРТ" : `R${point.round}`}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </StitchPanel>
  );
}

function trimTrailingEmptyPoints(points: DriverChartPoint[]) {
  const lastValueIndex = points.findLastIndex((point) => point.value !== null);

  return lastValueIndex >= 0 ? points.slice(0, lastValueIndex + 1) : [];
}

function getChartMaximum(series: CumulativePointsChartSeries[]) {
  const maximum = Math.max(
    1,
    ...series.flatMap((item) => item.points.map((point) => point.value ?? 0)),
  );

  return Math.ceil(maximum / 10) * 10 || 1;
}

function getLastPoint(points: DriverChartPoint[]) {
  return points.findLast((point) => point.value !== null) ?? null;
}

function getPointValue(points: DriverChartPoint[], index: number) {
  for (let current = Math.min(index, points.length - 1); current >= 0; current -= 1) {
    if (points[current]?.value !== null && points[current]?.value !== undefined) {
      return points[current].value;
    }
  }

  return null;
}

function getLinePath(points: DriverChartPoint[], max: number) {
  return points
    .map((_, index) => {
      const value = getPointValue(points, index) ?? 0;
      const command = index === 0 ? "M" : "L";

      return `${command} ${getX(index, points.length)} ${getY(value, max)}`;
    })
    .join(" ");
}

function getAreaPath(points: DriverChartPoint[], max: number) {
  if (!points.length) {
    return "";
  }

  const line = getLinePath(points, max);
  const lastX = getX(points.length - 1, points.length);

  return `${line} L ${lastX} 100 L 0 100 Z`;
}

function getX(index: number, length: number) {
  return length <= 1 ? 0 : (index / (length - 1)) * 100;
}

function getY(value: number, max: number) {
  return 100 - (Math.max(0, Math.min(max, value)) / Math.max(1, max)) * 100;
}

function getSeriesColor(series?: CumulativePointsChartSeries | null) {
  return series?.color || "var(--primary)";
}

function formatAxisValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPoints(value?: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
