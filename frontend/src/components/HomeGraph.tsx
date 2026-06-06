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
import { T } from "../theme";

type DailyCumulativeResponse = components["schemas"]["DailyCumulativeResponse"];

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
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
        background: T.ink,
        borderRadius: 14,
        padding: "10px 16px",
        fontSize: 13,
        boxShadow: "0 8px 24px -8px rgba(80,40,10,0.3)",
      }}
    >
      <p style={{ margin: "0 0 6px", color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{label}日</p>
      {payload.map((entry: TooltipPayloadEntry) => (
        <p
          key={String(entry.name)}
          style={{
            margin: "2px 0",
            color: entry.color ?? "#fff",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
          }}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 18,
              fontWeight: 700,
              color: T.ink,
            }}
          >
            変動費の累積
          </h2>
          {data && (
            <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
              このペースなら月末は{" "}
              <strong style={{ color: T.coralDeep }}>
                ¥
                {Math.round(
                  ((actual_rows[actual_rows.length - 1]?.total ?? 0) / (last_actual + 1)) *
                    chart_data.length
                ).toLocaleString()}
              </strong>
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setYearMonth(addMonths(year_month, -1))}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: `1.5px solid ${T.hair}`,
              background: T.card,
              color: T.inkSoft,
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ‹
          </button>
          <span
            style={{
              padding: "6px 16px",
              borderRadius: 999,
              border: `1.5px solid ${T.hair}`,
              background: T.bgSoft,
              fontSize: 13,
              fontWeight: 600,
              color: T.ink,
              minWidth: 90,
              textAlign: "center",
            }}
          >
            {formatMonthLabel(year_month)}
          </span>
          <button
            onClick={() => setYearMonth(addMonths(year_month, 1))}
            disabled={is_at_current}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: `1.5px solid ${T.hair}`,
              background: is_at_current ? T.bgSoft : T.card,
              color: is_at_current ? T.hair : T.inkSoft,
              fontSize: 16,
              cursor: is_at_current ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ›
          </button>
        </div>
      </div>

      {fetch_state.status === "error" && (
        <p style={{ color: T.coralDeep, fontSize: 14 }}>{fetch_state.message}</p>
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
              stroke={T.hair}
              tick={{ fontSize: 10, fill: T.inkSoft, fontFamily: "'DM Sans', sans-serif" }}
            />
            <YAxis
              stroke={T.hair}
              tick={{ fontSize: 10, fill: T.inkSoft, fontFamily: "'DM Sans', sans-serif" }}
              tickFormatter={(v: number) => (v >= 10000 ? `¥${Math.round(v / 1000)}k` : `¥${v}`)}
            />
            <Tooltip content={CustomTooltip} />
            <Legend
              formatter={(value: string) => (
                <span
                  style={{
                    fontSize: 12,
                    color: T.inkSoft,
                    fontFamily: "'M PLUS Rounded 1c', sans-serif",
                  }}
                >
                  {value}
                </span>
              )}
            />

            <Line
              data={actual_rows}
              dataKey="food"
              name="食費"
              stroke={T.mustard}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              data={actual_rows}
              dataKey="other"
              name="その他"
              stroke={T.sky}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              data={actual_rows}
              dataKey="total"
              name="合計"
              stroke={T.coral}
              strokeWidth={3.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              data={actual_rows}
              dataKey="budget"
              name="基準"
              stroke={T.sage}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              isAnimationActive={false}
            />

            <Line
              data={forecast_rows}
              dataKey="food"
              stroke={T.mustard}
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
              stroke={T.sky}
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
              stroke={T.coral}
              strokeWidth={2.5}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
            <Line
              data={forecast_rows}
              dataKey="budget"
              stroke={T.sage}
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
        <p style={{ marginTop: 8, color: T.mustard, fontSize: 13 }}>予算を設定してください</p>
      )}
    </>
  );
}
