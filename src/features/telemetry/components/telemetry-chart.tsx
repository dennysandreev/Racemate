"use client";
import { memo, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { Channel, Comparison } from "../lib/types";
import type { CursorStore } from "../lib/client";
import {
  channelLabels,
  units,
  getTraceColors,
  number,
} from "../lib/format";
export const TelemetryChart = memo(function TelemetryChart({
  comparison,
  channel,
  range,
  onRange,
  cursor,
}: {
  comparison: Comparison;
  channel: Channel | "delta";
  range: [number, number];
  onRange: (range: [number, number]) => void;
  cursor: CursorStore;
}) {
  const traceColors = getTraceColors(comparison);
  const node = useRef<HTMLDivElement>(null),
    start = useRef<number | null>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const data = useMemo(
    () =>
      comparison.distance.map((distance, i) => ({
        distance,
        ...Object.fromEntries(
          comparison.traces.map((t, n) => [
            `t${n}`,
            channel === "delta"
              ? comparison.delta[n][i]
              : (t.points[i]?.[channel] ?? null),
          ]),
        ),
      })),
    [comparison, channel],
  );
  const visible = useMemo(
    () => data.filter((p) => p.distance >= range[0] && p.distance <= range[1]),
    [data, range],
  );
  const cornerLabels = useMemo(() => {
    const lanes: number[] = [];
    return comparison.track.corners
      .filter((corner) => corner.apex >= range[0] && corner.apex <= range[1])
      .sort((a, b) => a.apex - b.apex)
      .map((corner) => {
        const position = (corner.apex - range[0]) / (range[1] - range[0]);
        let lane = lanes.findIndex((last) => position - last >= 0.08);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = position;
        return { ...corner, position, lane };
      });
  }, [comparison.track.corners, range]);
  const position = (x: number) => {
    const rect = node.current!.getBoundingClientRect();
    return (
      range[0] +
      Math.max(0, Math.min(1, (x - rect.left - 48) / (rect.width - 64))) *
        (range[1] - range[0])
    );
  };
  const active = comparison.traces
    .map((_, i) => i)
    .filter((i) => channel !== "delta" || i !== comparison.config.reference);
  const available = active.some((i) =>
    visible.some((p) => (p as Record<string, unknown>)[`t${i}`] != null),
  );
  return (
    <section className="telemetry-chart" aria-label={channelLabels[channel]}>
      <div className="telemetry-chart-heading">
        <h3>{channelLabels[channel]}</h3>
        <span>{units[channel]}</span>
        <ChartValues
          comparison={comparison}
          channel={channel}
          cursor={cursor}
        />
      </div>
      {!available ? (
        <p className="telemetry-channel-empty">
          Этот канал недоступен для выбранных кругов
        </p>
      ) : (
        <div
          className="telemetry-plot"
          ref={node}
          style={{ touchAction: "pan-y" }}
          onPointerMove={(e) => {
            const d = position(e.clientX);
            cursor.set(d);
            if (start.current != null) setSelection([start.current, d]);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            start.current = position(e.clientX);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            start.current = null;
            setSelection(null);
          }}
          onPointerUp={(e) => {
            if (start.current != null) {
              const a = start.current,
                b = position(e.clientX),
                width = range[1] - range[0];
              if (Math.abs(a - b) > width * 0.02) {
                if (e.shiftKey) {
                  const from = Math.max(
                    0,
                    Math.min(comparison.track.length - width, range[0] + a - b),
                  );
                  onRange([from, from + width]);
                } else onRange([Math.min(a, b), Math.max(a, b)]);
              }
            }
            start.current = null;
            setSelection(null);
          }}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={1}
            initialDimension={{ width: 640, height: 200 }}
          >
            <LineChart
              data={visible}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
              accessibilityLayer
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--hub-grid, var(--border))"
                strokeDasharray="3 5"
              />
              <XAxis
                height={72}
                tickMargin={48}
                dataKey="distance"
                type="number"
                domain={range}
                allowDataOverflow
                tickFormatter={(v) => `${Math.round(v)} м`}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                minTickGap={45}
              />
              <YAxis
                width={48}
                domain={
                  channel === "throttle" || channel === "brake"
                    ? [0, 100]
                    : channel === "gear"
                      ? [0, 8]
                      : ["auto", "auto"]
                }
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              {comparison.track.corners.filter((corner) => corner.apex >= range[0] && corner.apex <= range[1]).map((corner) => (
                <ReferenceLine key={`corner-${corner.number}`} x={corner.apex} stroke="var(--muted-foreground)" strokeOpacity={0.22} strokeDasharray="2 4" />
              ))}
              {channel === "delta" && (
                <ReferenceLine y={0} stroke="var(--muted-foreground)" />
              )}
              {active.map((i) => (
                <Line
                  key={i}
                  dataKey={`t${i}`}
                  name={comparison.traces[i].driver.code}
                  type={
                    ["brake", "gear"].includes(channel)
                      ? "stepAfter"
                      : "linear"
                  }
                  stroke={traceColors[i]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="telemetry-corner-axis" aria-label="Повороты на дистанции">
            {cornerLabels.map((corner) => (
              <span key={corner.number} title={`Поворот ${corner.number} · ${Math.round(corner.apex)} м`} style={{ left: `${100 * corner.position}%`, top: corner.lane * 12 }}>Т{corner.number}</span>
            ))}
          </div>
          <CursorMarker cursor={cursor} range={range} />
          {selection && (
            <div
              className="telemetry-selection"
              style={{
                left: `calc(48px + (100% - 64px) * ${(Math.min(...selection) - range[0]) / (range[1] - range[0])})`,
                width: `calc((100% - 64px) * ${Math.abs(selection[1] - selection[0]) / (range[1] - range[0])})`,
              }}
            />
          )}
        </div>
      )}
    </section>
  );
});
function CursorMarker({
  cursor,
  range,
}: {
  cursor: CursorStore;
  range: [number, number];
}) {
  const d = useSyncExternalStore(cursor.subscribe, cursor.get, () => 0);
  return d >= range[0] && d <= range[1] ? (
    <div
      className="telemetry-cursor"
      style={{
        left: `calc(48px + (100% - 64px) * ${(d - range[0]) / (range[1] - range[0])})`,
      }}
    />
  ) : null;
}
function ChartValues({
  comparison,
  channel,
  cursor,
}: {
  comparison: Comparison;
  channel: Channel | "delta";
  cursor: CursorStore;
}) {
  const traceColors = getTraceColors(comparison);
  const d = useSyncExternalStore(cursor.subscribe, cursor.get, () => 0);
  let i = 0;
  while (i + 1 < comparison.distance.length && comparison.distance[i + 1] < d)
    i++;
  return (
    <div className="telemetry-chart-values">
      {comparison.traces.map((t, n) => (
        <span key={t.lap.id} style={{ color: traceColors[n] }}>
          <span aria-hidden="true" className="telemetry-line-swatch" />{t.driver.code}{" "}
          {number(
            channel === "delta"
              ? comparison.delta[n]?.[i]
              : t.points[i]?.[channel],
            channel === "delta" ? 3 : 0,
          )}
        </span>
      ))}
    </div>
  );
}
