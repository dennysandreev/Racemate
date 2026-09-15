import { createElement, type CSSProperties, type ReactNode } from "react";
import { RaceSideShareLogo } from "@/components/racemate/driver-comparison-share-image";
import { formatGrandPrixNameRu } from "@/lib/race-display";
import type { Comparison, Channel } from "./types";
import {
  lapTime,
  number,
  getTraceColors,
  sessionName,
  lapAnalysisRows,
  sectorGapRows,
} from "./format";
export const shareFormats = {
  horizontal: [1600, 900],
  vertical: [1080, 1920],
} as const;
export type ShareFormat = keyof typeof shareFormats;
type GraphicChannel = Channel | "delta";

function xml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}

const chartSegments: Record<string, string> = {
  a: "M1 0.5H4",
  b: "M4.5 1V3",
  c: "M4.5 4V6",
  d: "M1 6.5H4",
  e: "M0.5 4V6",
  f: "M0.5 1V3",
  g: "M1 3.5H4",
};

const chartSegmentGlyphs: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  S: "acdfg",
};

const chartPathGlyphs: Record<string, string> = {
  м: "M0.5 6V1M0.5 1L2.5 3.6L4.5 1M4.5 1V6",
  T: "M0.5 0.5H4.5M2.5 0.5V6.5",
  "+": "M2.5 1.5V5.5M0.5 3.5H4.5",
  "-": "M0.7 3.5H4.3",
  ",": "M2.8 5.6L2.2 7",
};

function chartText(
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  anchor: "start" | "middle" | "end" = "start",
) {
  const cell = size / 7;
  const gap = cell * 1.25;
  const glyphWidth = cell * 5;
  const advances = [...text].map((character) =>
    character === " " ? cell * 3 : glyphWidth + gap,
  );
  const width = Math.max(
    0,
    advances.reduce((total, advance) => total + advance, 0) - gap,
  );
  const startX =
    anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  let cursor = startX;
  let shapes = "";

  [...text].forEach((character, characterIndex) => {
    const segmentNames = chartSegmentGlyphs[character];
    const paths = segmentNames
      ? [...segmentNames].map((segment) => chartSegments[segment])
      : chartPathGlyphs[character]
        ? [chartPathGlyphs[character]]
        : [];
    if (paths.length) {
      shapes += `<g transform="translate(${cursor.toFixed(2)} ${y.toFixed(2)}) scale(${cell.toFixed(4)})">${paths.map((path) => `<path d="${path}"/>`).join("")}</g>`;
    }
    cursor += advances[characterIndex];
  });

  return `<g fill="none" stroke="${color}" stroke-width="0.72" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>`;
}

function chartNumber(value: number, digits: number) {
  return Math.abs(value).toFixed(digits).replace(".", ",");
}

function deltaAxis(values: number[]) {
  const dataMin = values.length ? Math.min(0, ...values) : -0.05;
  const dataMax = values.length ? Math.max(0, ...values) : 0.05;
  const roughStep = Math.max(dataMax - dataMin, 0.05) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step =
    (normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10) * magnitude;
  let min = Math.floor(dataMin / step) * step;
  let max = Math.ceil(dataMax / step) * step;
  if (min === max) {
    min -= step;
    max += step;
  }
  const ticks: number[] = [];
  for (let value = max; value >= min - step * 0.01; value -= step)
    ticks.push(Math.abs(value) < step * 0.001 ? 0 : value);
  return { min, max, ticks };
}

export function telemetryGraphic(
  c: Comparison,
  kind: GraphicChannel | "map",
  canvasHeight = 430,
  renderedWidth = 900,
  rotation: number | "fit" = "fit",
) {
  const traceColors = getTraceColors(c);
  const W = 900,
    H = canvasHeight,
    showMap = kind === "map",
    channel: GraphicChannel = kind === "map" ? "delta" : kind;
  const labelSize = Math.min(22, Math.max(12, (12 * W) / renderedWidth));
  let content = "";
  if (showMap && c.track.points.length) {
    let angle = typeof rotation === "number" ? (rotation * Math.PI) / 180 : 0;
    if (rotation === "fit") {
      let bestScale = 0;
      for (let degrees = 0; degrees < 180; degrees += 5) {
        const candidate = (degrees * Math.PI) / 180;
        const xs = c.track.points.map(
          (p) => p.x * Math.cos(candidate) - p.y * Math.sin(candidate),
        );
        const ys = c.track.points.map(
          (p) => p.x * Math.sin(candidate) + p.y * Math.cos(candidate),
        );
        const scale = Math.min(
          (W - 120) / (Math.max(...xs) - Math.min(...xs) || 1),
          (H - 70) / (Math.max(...ys) - Math.min(...ys) || 1),
        );
        if (scale > bestScale) {
          bestScale = scale;
          angle = candidate;
        }
      }
    }
    const p = c.track.points.map((point) => ({
        ...point,
        x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
        y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
      })),
      xs = p.map((p) => p.x),
      ys = p.map((p) => p.y),
      minX = Math.min(...xs),
      minY = Math.min(...ys),
      scale = Math.min(
        (W - 120) / (Math.max(...xs) - minX || 1),
        (H - 70) / (Math.max(...ys) - minY || 1),
      );
    const offsetX = (W - (Math.max(...xs) - minX) * scale) / 2;
    const offsetY = (H - (Math.max(...ys) - minY) * scale) / 2;
    const pointCoordinates = (d: number) => {
      let i = 0;
      while (i + 1 < p.length && p[i + 1].distance < d) i++;
      const a = p[i],
        b = p[Math.min(i + 1, p.length - 1)],
        r =
          b.distance > a.distance
            ? (d - a.distance) / (b.distance - a.distance)
            : 0;
      return {
        x: offsetX + (a.x + (b.x - a.x) * r - minX) * scale,
        y: offsetY + (a.y + (b.y - a.y) * r - minY) * scale,
      };
    };
    const point = (d: number) => {
      const coordinates = pointCoordinates(d);
      return `${coordinates.x.toFixed(1)},${coordinates.y.toFixed(1)}`;
    };
    const ref = c.config.reference,
      other = c.traces.findIndex((_, i) => i !== ref);
    for (const s of c.segments) {
      const gain = s.gain[other],
        color =
          gain == null || Math.abs(gain) < 0.025
            ? "#4b515b"
            : traceColors[gain > 0 ? ref : other];
      const line = [
        point(s.from),
        ...p
          .filter((p) => p.distance > s.from && p.distance < s.to)
          .map((p) => point(p.distance)),
        point(s.to),
      ].join(" ");
      content += `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/>`;
    }
    const tangentDistance = Math.max(20, c.track.length * 0.004);
    for (const sector of c.track.sectors.filter(
      (distance) => distance > 0 && distance < c.track.length,
    )) {
      const center = pointCoordinates(sector);
      const before = pointCoordinates(Math.max(0, sector - tangentDistance));
      const after = pointCoordinates(
        Math.min(c.track.length, sector + tangentDistance),
      );
      const tangentLength =
        Math.hypot(after.x - before.x, after.y - before.y) || 1;
      const normalX = -(after.y - before.y) / tangentLength;
      const normalY = (after.x - before.x) / tangentLength;
      const halfLength = Math.max(13, labelSize * 0.9);
      const x1 = center.x - normalX * halfLength;
      const y1 = center.y - normalY * halfLength;
      const x2 = center.x + normalX * halfLength;
      const y2 = center.y + normalY * halfLength;
      const coordinates = `x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"`;
      content += `<line ${coordinates} stroke="#090909" stroke-width="8" stroke-linecap="butt"/><line ${coordinates} stroke="#f5f4f2" stroke-width="3" stroke-linecap="butt"/>`;
    }
    const trackCenter = {
      x: offsetX + ((Math.max(...xs) - minX) * scale) / 2,
      y: offsetY + ((Math.max(...ys) - minY) * scale) / 2,
    };
    const labels: { x: number; y: number }[] = [];
    c.track.corners.forEach((corner, index) => {
      const apex = pointCoordinates(corner.apex);
      const dx = apex.x - trackCenter.x;
      const dy = apex.y - trackCenter.y;
      const length = Math.hypot(dx, dy) || 1;
      const radius = Math.max(13, labelSize * 0.72);
      let distance = radius * (index % 2 ? 1.7 : 1.3);
      let label = {
        x: apex.x + (dx / length) * distance,
        y: apex.y + (dy / length) * distance,
      };
      for (let attempt = 0; attempt < 4; attempt++) {
        if (
          labels.every(
            (other) =>
              Math.hypot(other.x - label.x, other.y - label.y) > radius * 2.1,
          )
        )
          break;
        distance += radius * 1.35;
        label = {
          x: apex.x + (dx / length) * distance,
          y: apex.y + (dy / length) * distance,
        };
      }
      label.x = Math.max(radius + 2, Math.min(W - radius - 2, label.x));
      label.y = Math.max(radius + 2, Math.min(H - radius - 2, label.y));
      labels.push(label);
      content += `<line x1="${apex.x.toFixed(1)}" y1="${apex.y.toFixed(1)}" x2="${label.x.toFixed(1)}" y2="${label.y.toFixed(1)}" stroke="#707782" stroke-width="1"/>`;
      content += `<circle cx="${label.x.toFixed(1)}" cy="${label.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="#0d1014" stroke="#606873" stroke-width="1.5"/>`;
      content += chartText(
        String(corner.number),
        label.x,
        label.y - labelSize * 0.5,
        labelSize,
        "#f5f4f2",
        "middle",
      );
    });
  } else {
    const from = 0,
      to = c.track.length;
    const activeTraces = c.traces
      .map((_, index) => index)
      .filter((index) => channel !== "delta" || index !== c.config.reference);
    if (!activeTraces.length && c.traces.length) activeTraces.push(0);
    const series = c.traces.map((trace, traceIndex) =>
      channel === "delta"
        ? c.distance.map((distance, pointIndex) => ({
            distance,
            value: c.delta[traceIndex]?.[pointIndex],
          }))
        : trace.points.map((point) => ({
            distance: point.distance,
            value: point[channel],
          })),
    );
    const all = activeTraces.flatMap((traceIndex) =>
      series[traceIndex]
        .filter((point) => point.distance >= from && point.distance <= to)
        .map((point) => point.value)
        .filter(
          (value): value is number => value != null && Number.isFinite(value),
        ),
    );
    const rawMin = all.length ? Math.min(...all) : 0;
    const rawMax = all.length ? Math.max(...all) : 1;
    const deltaScale = deltaAxis(all);
    const fixedScale =
      channel === "throttle" || channel === "brake"
        ? { min: 0, max: 100 }
        : channel === "gear"
          ? { min: 0, max: 8 }
          : channel === "speed"
            ? { min: 0, max: Math.max(100, Math.ceil(rawMax / 50) * 50) }
            : channel === "rpm"
              ? {
                  min: Math.max(0, Math.floor(rawMin / 2500) * 2500),
                  max: Math.max(5000, Math.ceil(rawMax / 2500) * 2500),
                }
              : deltaScale;
    const min = fixedScale.min;
    const max = fixedScale.max;
    const plotLeft = 94;
    const plotRight = 878;
    const plotTop = labelSize * 2.6;
    const plotBottom = H - labelSize * 2.15;
    const gridValues =
      channel === "delta"
        ? deltaScale.ticks
        : Array.from(
            { length: 5 },
            (_, index) => max - index * ((max - min) / 4),
          );
    gridValues.forEach((value) => {
      const y =
        plotBottom -
        ((value - min) / (max - min || 1)) * (plotBottom - plotTop);
      content += `<line x1="${plotLeft}" y1="${y.toFixed(1)}" x2="${plotRight}" y2="${y.toFixed(1)}" stroke="#343943" stroke-width="1"/>`;
      const tick =
        channel === "delta"
          ? Math.abs(value) < 0.0005
            ? "0,00"
            : `${value > 0 ? "+" : "-"}${chartNumber(value, 2)}`
          : String(Math.round(value));
      content += chartText(
        tick,
        plotLeft - 12,
        y - labelSize * 0.5,
        labelSize,
        "#b6beca",
        "end",
      );
    });
    if (channel === "delta" && min < 0 && max > 0) {
      const zeroY =
        plotBottom - ((0 - min) / (max - min || 1)) * (plotBottom - plotTop);
      content += `<line x1="${plotLeft}" y1="${zeroY.toFixed(1)}" x2="${plotRight}" y2="${zeroY.toFixed(1)}" stroke="#a6a6ad" stroke-opacity="0.8" stroke-width="1.5"/>`;
    }
    activeTraces.forEach((traceIndex) => {
      let path = "",
        broken = true;
      for (const point of series[traceIndex]) {
        if (point.distance < from || point.distance > to) continue;
        if (point.value == null || !Number.isFinite(point.value)) {
          broken = true;
          continue;
        }
        const x =
            plotLeft +
            ((point.distance - from) / (to - from || 1)) *
              (plotRight - plotLeft),
          y =
            plotBottom -
            ((point.value - min) / (max - min || 1)) * (plotBottom - plotTop);
        path += `${broken ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
        broken = false;
      }
      content += `<path d="${path}" fill="none" stroke="${traceColors[traceIndex]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    const boundaries = [0, ...c.track.sectors, c.track.length];
    for (let index = 0; index + 1 < boundaries.length; index++) {
      const center =
        plotLeft +
        (((boundaries[index] + boundaries[index + 1]) / 2 - from) /
          (to - from || 1)) *
          (plotRight - plotLeft);
      content += chartText(
        `S${index + 1}`,
        center,
        labelSize * 0.08,
        labelSize * 0.82,
        "#e10600",
        "middle",
      );
    }
    for (const sector of c.track.sectors.filter(
      (distance) => distance > from && distance < to,
    )) {
      const x =
        plotLeft +
        ((sector - from) / (to - from || 1)) * (plotRight - plotLeft);
      content += `<line x1="${x.toFixed(1)}" y1="${plotTop.toFixed(1)}" x2="${x.toFixed(1)}" y2="${plotBottom.toFixed(1)}" stroke="#e10600" stroke-opacity="0.45" stroke-width="1.2"/>`;
    }
    const cornerLanes: number[] = [];
    c.track.corners.forEach((corner) => {
      const position = (corner.apex - from) / (to - from || 1);
      let lane = cornerLanes.findIndex((last) => position - last >= 0.075);
      if (lane < 0) lane = cornerLanes.length;
      if (lane > 1) return;
      cornerLanes[lane] = position;
      const x = plotLeft + position * (plotRight - plotLeft);
      content += chartText(
        String(corner.number),
        x,
        plotBottom + labelSize * (0.38 + lane * 0.78),
        labelSize * 0.72,
        "#9299a3",
        "middle",
      );
    });
  }
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><title>${xml(c.track.name)}</title>${content}</svg>`).toString("base64")}`;
}
const shareTheme = {
  ink: "#f5f4f2",
  muted: "#a8adb5",
  border: "rgba(82, 224, 230, 0.38)",
  surface: "rgba(13, 17, 21, 0.92)",
  red: "#e10600",
};

function driverName(name: string) {
  const last = name.trim().split(/\s+/).at(-1) ?? name;
  return last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
}

function Panel({
  children,
  style = {},
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
        border: `1px solid ${shareTheme.border}`,
        borderRadius: 10,
        background: shareTheme.surface,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function WeatherStrip({
  comparison,
  compact,
}: {
  comparison: Comparison;
  compact: boolean;
}) {
  const weather = comparison.traces.find((trace) => trace.lap.weather)?.lap
    .weather;
  const items = [
    [weather?.air == null ? "—" : `${number(weather.air, 0)}°C`, "Воздух"],
    [weather?.track == null ? "—" : `${number(weather.track, 0)}°C`, "Трасса"],
    [weather?.wind == null ? "—" : `${number(weather.wind, 1)} м/с`, "Ветер"],
    [`${number(comparison.track.length / 1000, 3)} км`, "Длина круга"],
  ];
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        alignItems: "stretch",
        height: compact ? 58 : 82,
        border: `1px solid ${shareTheme.border}`,
        borderRadius: 10,
        background: "rgba(8, 18, 21, 0.78)",
        overflow: "hidden",
      }}
    >
      {items.map(([value, label], index) => (
        <div
          key={label}
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            padding: compact ? "6px 15px" : "10px 22px",
            borderLeft: index ? "1px solid rgba(255,255,255,0.12)" : "none",
          }}
        >
          <span
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: compact ? 15 : 21,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            {value}
          </span>
          <span
            style={{
              display: "flex",
              marginTop: compact ? 3 : 7,
              color: shareTheme.muted,
              fontSize: compact ? 10 : 14,
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function DriverSummary({
  comparison,
  portraits,
  vertical,
}: {
  comparison: Comparison;
  portraits: (string | null)[];
  vertical: boolean;
}) {
  const colors = getTraceColors(comparison);
  const times = comparison.traces.map((trace) => trace.lap.time);
  const difference =
    times[0] != null && times[1] != null ? times[0] - times[1] : null;
  const winner = difference != null && difference > 0 ? 1 : 0;
  return (
    <Panel
      style={{
        height: vertical ? 130 : 92,
        width: "100%",
        flexDirection: "row",
        flexShrink: 0,
        borderLeft: `3px solid ${colors[0]}`,
        borderRight: `3px solid ${colors[1]}`,
      }}
    >
      {comparison.traces.slice(0, 2).map((trace, index) => (
        <div
          key={trace.lap.id}
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            flexDirection: index === 0 ? "row" : "row-reverse",
            gap: vertical ? 16 : 12,
            padding: vertical ? "14px 18px" : "10px 18px",
            order: index === 0 ? 0 : 2,
          }}
        >
          {portraits[index] &&
            createElement("img", {
              src: portraits[index],
              width: vertical ? 68 : 54,
              height: vertical ? 68 : 54,
              style: {
                objectFit: "contain",
                borderRadius: 999,
                background: "#1a1e24",
                border: `2px solid ${colors[index]}`,
              },
              alt: "",
            })}
          <div
            style={{
              display: "flex",
              flex: 1,
              minWidth: 0,
              flexDirection: "column",
              alignItems: index === 0 ? "flex-start" : "flex-end",
            }}
          >
            <span
              style={{
                display: "flex",
                fontSize: vertical ? 22 : 18,
                fontWeight: 900,
              }}
            >
              {driverName(trace.driver.name)}
            </span>
            <span
              style={{
                display: "flex",
                marginTop: 3,
                fontFamily: "Geist Mono",
                color: colors[index],
                fontSize: vertical ? 15 : 13,
                fontWeight: 800,
              }}
            >
              {trace.driver.code} ·{" "}
              {trace.lap.kind === "race_average"
                ? `СРЕДНИЙ · ${trace.lap.sampleCount ?? 0} КР.`
                : `КРУГ ${trace.lap.number}`}
            </span>
            <span
              style={{
                display: "flex",
                marginTop: vertical ? 7 : 4,
                fontFamily: "Geist Mono",
                fontSize: vertical ? 28 : 25,
                fontWeight: 900,
              }}
            >
              {lapTime(trace.lap.time)}
            </span>
          </div>
        </div>
      ))}
      <div
        style={{
          display: "flex",
          width: vertical ? 250 : 245,
          flexShrink: 0,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          order: 1,
          borderLeft: "1px solid rgba(255,255,255,0.13)",
          borderRight: "1px solid rgba(255,255,255,0.13)",
          background: "rgba(255,255,255,0.025)",
        }}
      >
        <span
          style={{
            display: "flex",
            color: shareTheme.muted,
            fontSize: vertical ? 13 : 11,
          }}
        >
          Разница на финише
        </span>
        <span
          style={{
            display: "flex",
            marginTop: 4,
            color: difference == null ? shareTheme.ink : colors[winner],
            fontFamily: "Geist Mono",
            fontSize: vertical ? 26 : 23,
            fontWeight: 900,
          }}
        >
          {difference == null
            ? "Нет данных"
            : Math.abs(difference) < 0.0005
              ? "Равное время"
              : `${comparison.traces[winner].driver.code} −${number(Math.abs(difference), 3)} с`}
        </span>
      </div>
    </Panel>
  );
}

function ChartPanel({
  comparison,
  channel,
  height,
  imageWidth,
}: {
  comparison: Comparison;
  channel: GraphicChannel;
  height: number;
  imageWidth: number;
}) {
  const labels: Record<GraphicChannel, [string, string]> = {
    delta: ["Разница времени", "с"],
    speed: ["Скорость", "км/ч"],
    throttle: ["Газ", "%"],
    brake: ["Торможение", "%"],
    gear: ["Передача", ""],
    rpm: ["Обороты", "об/мин"],
  };
  const [label, unit] = labels[channel];
  const chartHeight = Math.max(78, height - 36);
  return (
    <Panel
      style={{
        width: imageWidth + 24,
        height,
        flexShrink: 0,
        padding: "10px 12px 8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ display: "flex", fontSize: 14, fontWeight: 800 }}>
          {label}
        </span>
        {unit && (
          <span
            style={{
              display: "flex",
              color: shareTheme.muted,
              fontFamily: "Geist Mono",
              fontSize: 10,
            }}
          >
            {unit}
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {createElement("img", {
          src: telemetryGraphic(
            comparison,
            channel,
            (chartHeight * 900) / imageWidth,
            imageWidth,
          ),
          width: imageWidth,
          height: chartHeight,
          alt: "",
        })}
      </div>
    </Panel>
  );
}

function TrackPanel({
  comparison,
  height,
  imageWidth,
}: {
  comparison: Comparison;
  height: number;
  imageWidth: number;
}) {
  const colors = getTraceColors(comparison);
  const sectors = sectorGapRows(comparison).map(({ winner, delta }) => ({
    winner,
    difference: delta == null ? null : Math.abs(delta),
  }));
  const mapHeight = Math.max(100, height - 91);
  return (
    <Panel
      style={{
        width: imageWidth + 24,
        height,
        flexShrink: 0,
        padding: "10px 12px 8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ display: "flex", fontSize: 14, fontWeight: 800 }}>
          Карта трассы
        </span>
        <span
          style={{
            display: "flex",
            color: shareTheme.muted,
            fontFamily: "Geist Mono",
            fontSize: 10,
          }}
        >
          {number(comparison.track.length / 1000, 3)} км
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {createElement("img", {
          src: telemetryGraphic(
            comparison,
            "map",
            (mapHeight * 900) / imageWidth,
            imageWidth,
          ),
          width: imageWidth,
          height: mapHeight,
          alt: "",
        })}
      </div>
      <div
        style={{
          display: "flex",
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {sectors.map((sector, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              padding: "7px 8px 2px",
              borderLeft:
                index > 0 ? "1px solid rgba(255,255,255,0.1)" : "none",
            }}
          >
            <span
              style={{
                display: "flex",
                color: shareTheme.muted,
                fontSize: 9,
              }}
            >
              Сектор {index + 1}
            </span>
            <span
              style={{
                display: "flex",
                marginTop: 2,
                color:
                  sector.winner == null
                    ? shareTheme.muted
                    : colors[sector.winner],
                fontFamily: "Geist Mono",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {sector.winner == null
                ? "—"
                : `${comparison.traces[sector.winner].driver.code} ${number(sector.difference, 3)} с`}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AnalysisPanel({
  comparison,
  height,
  large = false,
}: {
  comparison: Comparison;
  height: number;
  large?: boolean;
}) {
  const colors = getTraceColors(comparison);
  const rows = lapAnalysisRows(comparison);
  return (
    <Panel style={{ height, flex: 1, flexShrink: 0, padding: "10px 12px" }}>
      <span
        style={{
          display: "flex",
          fontSize: large ? 19 : 14,
          fontWeight: 900,
        }}
      >
        Разбор круга
      </span>
      <div
        style={{
          display: "flex",
          marginTop: 6,
          padding: "5px 0",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          fontFamily: "Geist Mono",
          fontSize: large ? 12 : 10,
        }}
      >
        <span
          style={{ display: "flex", width: "48%", color: shareTheme.muted }}
        >
          Показатель
        </span>
        {comparison.traces.slice(0, 2).map((trace, index) => (
          <span
            key={trace.lap.id}
            style={{
              display: "flex",
              width: "26%",
              justifyContent: "flex-end",
              color: colors[index],
              fontWeight: 800,
            }}
          >
            {trace.driver.code}
          </span>
        ))}
      </div>
      {rows.map((row, rowIndex) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            flex: 1,
            minHeight: 20,
            alignItems: "center",
            borderBottom:
              rowIndex === rows.length - 1
                ? "none"
                : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span
            style={{
              display: "flex",
              width: "48%",
              color: shareTheme.muted,
              fontSize: large ? 13 : 10,
            }}
          >
            {row.label}
          </span>
          {row.values.slice(0, 2).map((value, index) => (
            <span
              key={index}
              style={{
                display: "flex",
                width: "26%",
                justifyContent: "flex-end",
                fontFamily: "Geist Mono",
                fontSize: large ? 13 : 10,
                fontWeight: row.best[index] ? 900 : 600,
                color: row.best[index] ? colors[index] : shareTheme.ink,
              }}
            >
              {value}
            </span>
          ))}
        </div>
      ))}
    </Panel>
  );
}

function ShareFooter({ vertical }: { vertical: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: vertical ? 138 : 76,
        padding: vertical ? "0 42px" : "0 44px",
        alignItems: "center",
        justifyContent: "space-between",
        background: shareTheme.red,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            display: "flex",
            fontSize: vertical ? 38 : 29,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          Каждая доля секунды
        </span>
        <span
          style={{
            display: "flex",
            marginTop: vertical ? 9 : 5,
            fontSize: vertical ? 17 : 13,
            fontWeight: 700,
          }}
        >
          Сравнивай круги и пилотов на RaceSide
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
        }}
      >
        <span
          style={{
            display: "flex",
            fontFamily: "Geist Mono",
            fontSize: vertical ? 19 : 15,
            fontWeight: 900,
          }}
        >
          raceside.online/telemetry
        </span>
        <span
          style={{
            display: "flex",
            marginTop: 5,
            fontFamily: "Geist Mono",
            fontSize: vertical ? 10 : 8,
            fontWeight: 700,
            letterSpacing: 1.5,
            opacity: 0.78,
          }}
        >
          НАЙДИ, ГДЕ ВЫИГРАНО ВРЕМЯ
        </span>
      </div>
    </div>
  );
}

function ShareHeader({
  comparison,
  title,
  vertical,
}: {
  comparison: Comparison;
  title: string;
  vertical: boolean;
}) {
  const session = [
    ...new Set(
      comparison.traces.map((trace) => sessionName(trace.session.name)),
    ),
  ].join(" / ");
  const heading = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span
        style={{
          display: "flex",
          fontSize: vertical ? 48 : 38,
          fontWeight: 900,
          letterSpacing: "-0.045em",
          lineHeight: 1,
        }}
      >
        {title}
      </span>
      <span
        style={{
          display: "flex",
          marginTop: vertical ? 9 : 6,
          color: shareTheme.muted,
          fontSize: vertical ? 20 : 15,
        }}
      >
        {comparison.track.name} · {comparison.traces[0].session.season} ·{" "}
        {session}
      </span>
    </div>
  );
  return vertical ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 82,
        }}
      >
        {heading}
        <RaceSideShareLogo />
      </div>
      <WeatherStrip comparison={comparison} compact={false} />
    </div>
  ) : (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 70,
        gap: 20,
      }}
    >
      {heading}
      <div style={{ display: "flex", width: 450 }}>
        <WeatherStrip comparison={comparison} compact />
      </div>
      <RaceSideShareLogo />
    </div>
  );
}

export function TelemetryShareImage({
  comparison,
  format,
  meetingName,
  portraits = [],
}: {
  comparison: Comparison;
  format: ShareFormat;
  meetingName?: string;
  portraits?: (string | null)[];
}) {
  const [width, height] = shareFormats[format];
  const vertical = format === "vertical";
  const pad = vertical ? 36 : 24;
  const footerHeight = vertical ? 138 : 76;
  const title =
    comparison.track.id === "madring"
      ? "Гран-при Испании"
      : meetingName
        ? formatGrandPrixNameRu(meetingName)
        : comparison.track.name;
  const innerWidth = width - pad * 2;
  const horizontalColumn = (innerWidth - 440 - 20) / 2;
  const horizontalChartHeight = 192;
  const verticalChartWidth = innerWidth - 26;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        width,
        height,
        padding: `${vertical ? 26 : 16}px ${pad}px ${footerHeight + 12}px`,
        overflow: "hidden",
        color: shareTheme.ink,
        fontFamily: "Geist",
        background:
          "radial-gradient(circle at 0% 45%, rgba(225,6,0,0.22), transparent 34%), radial-gradient(circle at 100% 42%, rgba(0,216,210,0.18), transparent 34%), #07090b",
      }}
    >
      <ShareHeader comparison={comparison} title={title} vertical={vertical} />
      <div style={{ display: "flex", marginTop: 10 }}>
        <DriverSummary
          comparison={comparison}
          portraits={portraits}
          vertical={vertical}
        />
      </div>
      {vertical ? (
        <div
          style={{
            display: "flex",
            flex: 1,
            minHeight: 0,
            flexDirection: "column",
            gap: 10,
            marginTop: 10,
          }}
        >
          <ChartPanel
            comparison={comparison}
            channel="delta"
            height={220}
            imageWidth={verticalChartWidth}
          />
          <ChartPanel
            comparison={comparison}
            channel="speed"
            height={220}
            imageWidth={verticalChartWidth}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <ChartPanel
              comparison={comparison}
              channel="throttle"
              height={190}
              imageWidth={(innerWidth - 10) / 2 - 26}
            />
            <ChartPanel
              comparison={comparison}
              channel="brake"
              height={190}
              imageWidth={(innerWidth - 10) / 2 - 26}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <ChartPanel
              comparison={comparison}
              channel="gear"
              height={190}
              imageWidth={(innerWidth - 10) / 2 - 26}
            />
            <ChartPanel
              comparison={comparison}
              channel="rpm"
              height={190}
              imageWidth={(innerWidth - 10) / 2 - 26}
            />
          </div>
          <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 10 }}>
            <TrackPanel
              comparison={comparison}
              height={560}
              imageWidth={(innerWidth - 10) / 2 - 26}
            />
            <AnalysisPanel comparison={comparison} height={560} large />
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flex: 1,
            minHeight: 0,
            gap: 10,
            marginTop: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              width: horizontalColumn,
              flexDirection: "column",
              gap: 8,
            }}
          >
            <ChartPanel
              comparison={comparison}
              channel="delta"
              height={horizontalChartHeight}
              imageWidth={horizontalColumn - 26}
            />
            <ChartPanel
              comparison={comparison}
              channel="throttle"
              height={horizontalChartHeight}
              imageWidth={horizontalColumn - 26}
            />
            <ChartPanel
              comparison={comparison}
              channel="brake"
              height={horizontalChartHeight}
              imageWidth={horizontalColumn - 26}
            />
          </div>
          <div
            style={{
              display: "flex",
              width: horizontalColumn,
              flexDirection: "column",
              gap: 8,
            }}
          >
            <ChartPanel
              comparison={comparison}
              channel="speed"
              height={horizontalChartHeight}
              imageWidth={horizontalColumn - 26}
            />
            <ChartPanel
              comparison={comparison}
              channel="gear"
              height={horizontalChartHeight}
              imageWidth={horizontalColumn - 26}
            />
            <ChartPanel
              comparison={comparison}
              channel="rpm"
              height={horizontalChartHeight}
              imageWidth={horizontalColumn - 26}
            />
          </div>
          <div
            style={{
              display: "flex",
              width: 440,
              flexDirection: "column",
              gap: 8,
            }}
          >
            <TrackPanel comparison={comparison} height={340} imageWidth={414} />
            <AnalysisPanel comparison={comparison} height={244} />
          </div>
        </div>
      )}
      <ShareFooter vertical={vertical} />
    </div>
  );
}
