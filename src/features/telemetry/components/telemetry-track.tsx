"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Comparison } from "../lib/types";
import type { CursorStore } from "../lib/client";
import { getTraceColors, number, sectorGapRows } from "../lib/format";
export function TelemetryTrack({
  comparison,
  cursor,
  onCorner,
  onSector,
  selectedCorner,
}: {
  comparison: Comparison;
  cursor: CursorStore;
  onCorner: (n: number) => void;
  onSector: (index: number) => void;
  selectedCorner?: number;
}) {
  const traceColors = getTraceColors(comparison);
  const track = comparison.track;
  const points = useMemo(() => {
    const angle = ((track.id === "monza" ? 30 : 0) * Math.PI) / 180;
    return track.points.map((point) => ({
      ...point,
      x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
      y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
    }));
  }, [track]);
  const geometry = useMemo(() => {
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    const minX = Math.min(...xs),
      minY = Math.min(...ys),
      scale = Math.min(
        480 / Math.max(Math.max(...xs) - minX, 1),
        340 / Math.max(Math.max(...ys) - minY, 1),
      );
    const offsetX = (560 - (Math.max(...xs) - minX) * scale) / 2,
      offsetY = (420 - (Math.max(...ys) - minY) * scale) / 2;
    return (d: number) => {
      let i = 0;
      while (i + 1 < points.length && points[i + 1].distance < d) i++;
      const a = points[i],
        b = points[Math.min(i + 1, points.length - 1)],
        ratio =
          b.distance > a.distance
            ? (d - a.distance) / (b.distance - a.distance)
            : 0;
      return {
        x: offsetX + (a.x + (b.x - a.x) * ratio - minX) * scale,
        y: offsetY + (a.y + (b.y - a.y) * ratio - minY) * scale,
      };
    };
  }, [points]);
  if (points.length < 3)
    return (
      <p className="telemetry-channel-empty">
        Координаты этой трассы пока недоступны. Сравнение графиков работает.
      </p>
    );
  const path = (from: number, to: number) => {
    const samples = [
      geometry(from),
      ...points
        .filter((p) => p.distance > from && p.distance < to)
        .map((p) => geometry(p.distance)),
      geometry(to),
    ];
    return samples
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  };
  const ref = comparison.config.reference,
    other = comparison.traces.findIndex((_, i) => i !== ref);
  const sectorGaps = sectorGapRows(comparison);
  const start = geometry(0);
  return (
    <section className="telemetry-map">
      <div className="telemetry-chart-heading">
        <h3>Карта трассы</h3>
        <span>{number(track.length / 1000, 3)} км</span>
      </div>
      <svg
        viewBox="0 0 560 420"
        role="img"
        aria-label="Карта трассы. Выберите поворот на карте или в меню участка."
      >
        <path
          d={path(0, track.length)}
          fill="none"
          stroke="var(--border)"
          strokeWidth="10"
          strokeLinejoin="round"
        />
        {comparison.segments.map((s) => (
          <path
            key={s.from}
            d={path(s.from, s.to)}
            fill="none"
            stroke={
              s.gain[other] == null || Math.abs(s.gain[other]!) < 0.025
                ? "var(--border)"
                : s.gain[other]! > 0
                  ? traceColors[ref]
                  : traceColors[other]
            }
            strokeWidth="5"
            strokeLinecap="round"
            onPointerMove={() => cursor.set((s.from + s.to) / 2)}
          >
            <title>
              {Math.round(s.from)}–{Math.round(s.to)} м:{" "}
              {s.gain[other] == null
                ? "нет данных"
                : `${comparison.traces[s.gain[other]! > 0 ? ref : other].driver.code} выигрывает ${number(Math.abs(s.gain[other]!), 3)} с`}
            </title>
          </path>
        ))}
        <rect
          x={start.x - 5}
          y={start.y - 5}
          width="10"
          height="10"
          fill="var(--foreground)"
        />
        <text
          x={start.x + 10}
          y={start.y - 9}
          fill="var(--foreground)"
          fontSize="11"
        >
          Старт
        </text>
        {track.sectors.map((d, i) => {
          const p = geometry(d);
          return (
            <text
              key={i}
              x={p.x + 10}
              y={p.y}
              fill="var(--muted-foreground)"
              fontSize="12"
            >
              S{i + 1}
            </text>
          );
        })}
        {track.corners.map((c) => {
          const p = geometry(c.apex);
          const before = geometry(Math.max(0, c.apex - 15));
          const after = geometry(Math.min(track.length, c.apex + 15));
          const length =
            Math.hypot(after.x - before.x, after.y - before.y) || 1;
          // Put labels beside the line so close chicanes remain visible.
          const side = c.number % 2 ? 1 : -1;
          const label = {
            x: p.x - ((after.y - before.y) / length) * 23 * side,
            y: p.y + ((after.x - before.x) / length) * 23 * side,
          };
          return (
            <g
              key={c.number}
              onClick={() => onCorner(c.number)}
              className="telemetry-map-turn"
            >
              <line
                x1={p.x}
                y1={p.y}
                x2={label.x}
                y2={label.y}
                stroke="var(--muted-foreground)"
                strokeWidth="1"
              />
              <circle
                cx={label.x}
                cy={label.y}
                r="11"
                fill={
                  selectedCorner === c.number
                    ? "var(--foreground)"
                    : "var(--hub-panel, var(--background))"
                }
                stroke="var(--border)"
              />
              <text
                x={label.x}
                y={label.y + 4}
                textAnchor="middle"
                fill={
                  selectedCorner === c.number
                    ? "var(--background)"
                    : "var(--foreground)"
                }
                fontSize="11"
              >
                {c.number}
              </text>
            </g>
          );
        })}
        <TrackCursor
          geometry={geometry}
          cursor={cursor}
          comparison={comparison}
        />
      </svg>
      <div className="telemetry-map-legend">
        {comparison.traces.map((t, i) => (
          <span key={t.lap.id} style={{ color: traceColors[i] }}>
            <span aria-hidden="true" className="telemetry-line-swatch" />
            {t.driver.code}
          </span>
        ))}
        <span>Тёмно-серый — близкий темп</span>
      </div>
      <div className="telemetry-sector-summary">
        {sectorGaps.map(({ index, delta, winner }) => {
          return (
            <button
              key={index}
              onClick={() => onSector(index)}
              aria-label={`Приблизить сектор ${index + 1}`}
            >
              <span>Сектор {index + 1}</span>
              <strong
                style={{
                  color:
                    delta == null || winner == null
                      ? undefined
                      : traceColors[winner],
                }}
              >
                {delta == null ? "—" : `${number(Math.abs(delta), 3)} с`}
              </strong>
              <span>
                {delta == null
                  ? "Нет данных"
                  : `${comparison.traces[winner!].driver.code} быстрее`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
function TrackCursor({
  geometry,
  cursor,
  comparison,
}: {
  geometry: (d: number) => { x: number; y: number };
  cursor: CursorStore;
  comparison: Comparison;
}) {
  const traceColors = getTraceColors(comparison);
  const d = useSyncExternalStore(cursor.subscribe, cursor.get, () => 0),
    p = geometry(d);
  return (
    <g pointerEvents="none">
      {comparison.traces.map((t, i) => (
        <g key={t.lap.id}>
          <circle
            cx={p.x + (i ? 6 : -6)}
            cy={p.y}
            r="6"
            fill={traceColors[i]}
            stroke="var(--background)"
            strokeWidth="2"
          />
        </g>
      ))}
    </g>
  );
}
