"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AdminCostTimelineRow } from "@/types/admin";

const chartConfig = {
  ai_cost_usd: {
    label: "AI API",
    color: "var(--primary)",
  },
  x_api_cost_usd: {
    label: "X API",
    color: "var(--warning)",
  },
} satisfies ChartConfig;

export function AdminCostChart({ data }: { data: AdminCostTimelineRow[] }) {
  const chartData = data.map((row) => ({
    ...row,
    label: new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", timeZone: "UTC" })
      .format(new Date(`${row.day}T00:00:00Z`))
      .replace(".", ""),
  }));

  return (
    <ChartContainer
      aria-label="Расходы AI API и X API по дням за последние 30 дней"
      className="h-72 w-full min-w-[42rem] aspect-auto"
      config={chartConfig}
      role="img"
    >
      <LineChart accessibilityLayer data={chartData} margin={{ left: 4, right: 16, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis axisLine={false} dataKey="label" interval="preserveStartEnd" minTickGap={28} tickLine={false} />
        <YAxis axisLine={false} tickFormatter={(value) => `$${Number(value).toFixed(2)}`} tickLine={false} width={54} />
        <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line dataKey="ai_cost_usd" dot={false} stroke="var(--color-ai_cost_usd)" strokeWidth={2} type="monotone" />
        <Line dataKey="x_api_cost_usd" dot={false} stroke="var(--color-x_api_cost_usd)" strokeWidth={2} type="monotone" />
      </LineChart>
    </ChartContainer>
  );
}
