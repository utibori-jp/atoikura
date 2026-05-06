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
        border: "1px solid #333",
        padding: "8px 12px",
        borderRadius: 6,
        fontSize: 13,
      }}
    >
      <p style={{ margin: "0 0 4px", color: "#aaa" }}>{label}日</p>
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

function TrendIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23,6 13.5,15.5 8.5,10.5 1,18" />
      <polyline points="17,6 23,6 23,12" />
    </svg>
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
  const [fetch_state, setFetchState] = useState<FetchState>({ status: "loading" });

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
            message: err instanceof Error ? err.message : "データ取得に失敗しました",
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
  const current_month = currentMonthJST();
  const is_at_current = year_month >= current_month;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: "#ccc" }}>
          <TrendIcon />
          変動費累積グラフ
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setYearMonth(addMonths(year_month, -1))}
            style={{
              padding: "3px 10px",
              borderRadius: 6,
              border: "1px solid #2e2e2e",
              background: "#1e1e1e",
              color: "#aaa",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            &lt;
          </button>
          <span style={{ fontSize: 13, color: "#aaa", minWidth: 80, textAlign: "center" }}>
            {formatMonthLabel(year_month)}
          </span>
          <button
            onClick={() => setYearMonth(addMonths(year_month, 1))}
            disabled={is_at_current}
            style={{
              padding: "3px 10px",
              borderRadius: 6,
              border: "1px solid #2e2e2e",
              background: is_at_current ? "#141414" : "#1e1e1e",
              color: is_at_current ? "#3a3a3a" : "#aaa",
              fontSize: 13,
              cursor: is_at_current ? "default" : "pointer",
            }}
          >
            &gt;
          </button>
        </div>
      </div>

      {fetch_state.status === "error" && (
        <p style={{ color: "#f87171", fontSize: 14 }}>{fetch_state.message}</p>
      )}

      {data && (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="day"
              type="number"
              domain={[1, chart_data.length]}
              tickCount={chart_data.length}
              tickFormatter={(v: number) => String(v)}
              stroke="#333"
              tick={{ fontSize: 10, fill: "#555" }}
            />
            <YAxis
              stroke="#333"
              tick={{ fontSize: 10, fill: "#555" }}
              tickFormatter={(v: number) =>
                v >= 10000 ? `¥${Math.round(v / 1000)}k` : `¥${v}`
              }
            />
            <Tooltip content={CustomTooltip} />
            <Legend
              formatter={(value: string) => (
                <span style={{ fontSize: 12, color: "#888" }}>{value}</span>
              )}
            />

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

            <Line
              data={forecast_rows}
              dataKey="food"
              stroke="#4ade80"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeOpacity={0.35}
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
              strokeOpacity={0.35}
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
              strokeOpacity={0.35}
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
              strokeOpacity={0.35}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {data?.monthly_budget === 0 && (
        <p style={{ marginTop: 8, color: "#facc15", fontSize: 13 }}>
          予算を設定してください
        </p>
      )}
    </>
  );
}
