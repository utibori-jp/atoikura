import { useEffect, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipContentProps,
  type TooltipPayloadEntry,
  type TooltipValueType,
} from "recharts";
import type { NameType } from "recharts/types/component/DefaultTooltipContent";
import { api } from "../api/client";
import type { components } from "../api/types";

type DailyCumulativeResponse = components["schemas"]["DailyCumulativeResponse"];

function currentMonthJST(): string {
  return new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
    .slice(0, 7);
}

function addMonths(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return `${year}年${month}月`;
}

interface ChartRow {
  day: number;
  food: number;
  other: number;
  total: number;
  budget: number;
  is_actual: boolean;
}

function buildChartData(data: DailyCumulativeResponse): ChartRow[] {
  const daily_budget = data.daily_budget;
  return data.days.map((entry, index) => ({
    day: index + 1,
    food: entry.food,
    other: entry.other,
    total: entry.total,
    budget: daily_budget * (index + 1),
    is_actual: entry.is_actual,
  }));
}

function CustomTooltip(props: TooltipContentProps<TooltipValueType, NameType>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid #444",
        padding: "8px 12px",
        borderRadius: 6,
        fontSize: 13,
      }}
    >
      <p style={{ margin: "0 0 4px", color: "#ccc" }}>{label}日</p>
      {payload.map((entry: TooltipPayloadEntry) => (
        <p
          key={String(entry.name)}
          style={{ margin: "2px 0", color: entry.color ?? "#fff" }}
        >
          {entry.name}: ¥
          {typeof entry.value === "number"
            ? entry.value.toLocaleString()
            : String(entry.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

function MonthNavigator({
  value,
  onChange,
}: {
  value: string;
  onChange: (ym: string) => void;
}) {
  const current_month = currentMonthJST();
  const is_at_current = value >= current_month;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 12,
      }}
    >
      <button
        onClick={() => onChange(addMonths(value, -1))}
        style={{
          padding: "4px 12px",
          borderRadius: 6,
          border: "1px solid #444",
          background: "#222",
          color: "#ccc",
          cursor: "pointer",
        }}
      >
        &lt;
      </button>
      <span style={{ fontWeight: 600, minWidth: 90, textAlign: "center" }}>
        {formatMonthLabel(value)}
      </span>
      <button
        onClick={() => onChange(addMonths(value, 1))}
        disabled={is_at_current}
        style={{
          padding: "4px 12px",
          borderRadius: 6,
          border: "1px solid #444",
          background: is_at_current ? "#111" : "#222",
          color: is_at_current ? "#555" : "#ccc",
          cursor: is_at_current ? "default" : "pointer",
        }}
      >
        &gt;
      </button>
    </div>
  );
}

function lastActualIndex(rows: ChartRow[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].is_actual) return i;
  }
  return -1;
}

type FetchState =
  | { status: "loading" }
  | { status: "success"; data: DailyCumulativeResponse }
  | { status: "error"; message: string };

export function HomeGraph() {
  const [year_month, setYearMonth] = useState<string>(currentMonthJST());
  const [fetch_state, setFetchState] = useState<FetchState>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    api
      .getDailyCumulative(year_month)
      .then((data) => {
        if (!cancelled) setFetchState({ status: "success", data });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setFetchState({
            status: "error",
            message:
              err instanceof Error ? err.message : "データ取得に失敗しました",
          });
      });
    return () => {
      cancelled = true;
      setFetchState({ status: "loading" });
    };
  }, [year_month]);

  const data = fetch_state.status === "success" ? fetch_state.data : null;
  const chart_data = data ? buildChartData(data) : [];

  const last_actual = lastActualIndex(chart_data);
  const actual_rows = chart_data.slice(0, last_actual + 1);
  const forecast_rows = chart_data.slice(last_actual);

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>変動費累積グラフ</h2>
      <MonthNavigator value={year_month} onChange={setYearMonth} />

      {fetch_state.status === "error" && (
        <p style={{ color: "#f87171" }}>{fetch_state.message}</p>
      )}

      {data && (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
            <XAxis
              dataKey="day"
              type="number"
              domain={[1, chart_data.length]}
              tickCount={chart_data.length}
              tickFormatter={(v: number) => String(v)}
              stroke="#888"
              tick={{ fontSize: 11, fill: "#888" }}
            />
            <YAxis
              stroke="#888"
              tick={{ fontSize: 11, fill: "#888" }}
              tickFormatter={(v: number) =>
                v >= 10000 ? `¥${Math.round(v / 1000)}k` : `¥${v}`
              }
            />
            <Tooltip content={CustomTooltip} />
            <Legend
              formatter={(value: string) => (
                <span style={{ fontSize: 12, color: "#ccc" }}>{value}</span>
              )}
            />

            {/* Actual days — solid lines */}
            <Line
              data={actual_rows}
              dataKey="food"
              name="食費"
              stroke="#4ade80"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              data={actual_rows}
              dataKey="other"
              name="その他"
              stroke="#facc15"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              data={actual_rows}
              dataKey="total"
              name="合計"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              data={actual_rows}
              dataKey="budget"
              name="基準"
              stroke="#fb923c"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              isAnimationActive={false}
            />

            {/* Forecast days — dashed and faded */}
            <Line
              data={forecast_rows}
              dataKey="food"
              stroke="#4ade80"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeOpacity={0.4}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
            <Line
              data={forecast_rows}
              dataKey="other"
              stroke="#facc15"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeOpacity={0.4}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
            <Line
              data={forecast_rows}
              dataKey="total"
              stroke="#a78bfa"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeOpacity={0.4}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
            <Line
              data={forecast_rows}
              dataKey="budget"
              stroke="#fb923c"
              strokeWidth={2}
              strokeDasharray="6 3"
              strokeOpacity={0.4}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {data?.monthly_budget === 0 && (
        <p style={{ marginTop: 8, color: "#facc15", fontSize: 14 }}>
          予算を設定してください
        </p>
      )}
    </section>
  );
}
