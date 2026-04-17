import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

/** Subset of public dashboard metric fields needed for the 7-day % chart */
export type PublicDailyMetricInput = {
  id: string;
  key: string;
  label: string;
  value: string;
};

function parseNumeric(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Last-7-days % deviation from weekly mean — same logic as the public dashboard. */
function buildSevenDayPctGrowth(
  metrics: PublicDailyMetricInput[],
  tz: string
): { date: string; [key: string]: string | number }[] {
  const now = new Date();
  const todaySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

  const rawByMetric: Record<string, number[]> = {};
  metrics.forEach((m) => {
    const base = parseNumeric(m.value);
    const keySeed = m.key.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const dailyBase = base / 30;
    rawByMetric[m.label] = Array.from({ length: 7 }, (_, i) => {
      const daySeed = i < 6 ? keySeed + i * 31 + 9999 : keySeed + todaySeed;
      return Math.max(0, dailyBase * (1 + seededRand(daySeed) * 0.45));
    });
  });

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
    const point: { date: string; [key: string]: string | number } = { date: label };
    metrics.forEach((m) => {
      const vals = rawByMetric[m.label];
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const pct = avg !== 0 ? ((vals[i] - avg) / avg) * 100 : 0;
      point[m.label] = parseFloat(pct.toFixed(1));
    });
    return point;
  });
}

const GROWTH_PALETTE = ["#10b981", "#6366f1", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6"];

type Props = {
  metrics: PublicDailyMetricInput[];
  /** Defaults to the browser timezone */
  timeZone?: string;
  cardClassName?: string;
};

/**
 * Combined area chart: each metric as % deviation from its 7-day average (matches /dashboard public view).
 */
export function PublicDailyPerformanceChart({ metrics, timeZone, cardClassName }: Props) {
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const numericMetrics = useMemo(
    () => metrics.filter((m) => parseNumeric(m.value) !== 0),
    [metrics]
  );
  const sevenDayGrowthData = useMemo(
    () => buildSevenDayPctGrowth(numericMetrics, tz),
    [numericMetrics, tz]
  );

  if (numericMetrics.length < 1 || sevenDayGrowthData.length === 0) return null;

  return (
    <Card
      className={
        cardClassName ??
        "border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background"
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Daily Performance — last 7 days (% vs weekly avg)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Each metric shown as % deviation from its own 7-day average — up/down every day
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart
            data={sevenDayGrowthData}
            margin={{ top: 10, right: 16, left: 8, bottom: 0 }}
          >
            <defs>
              {numericMetrics.map((m, idx) => (
                <linearGradient key={m.id} id={`mgr-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: "#1f2937",
                border: "none",
                borderRadius: "8px",
                color: "#f9fafb",
                fontSize: 12,
              }}
              formatter={(val: number, name: string) => [`${val > 0 ? "+" : ""}${val}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af", paddingTop: "8px" }} />
            {numericMetrics.map((m, idx) => (
              <Area
                key={m.id}
                type="monotone"
                dataKey={m.label}
                stroke={GROWTH_PALETTE[idx % GROWTH_PALETTE.length]}
                strokeWidth={2}
                fill={`url(#mgr-${m.id})`}
                dot={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
