import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { components } from "../api/types";
import { T } from "../theme";
import { dailyAvailableTone } from "./SummaryCards.utils";

type DailyCumulativeResponse = components["schemas"]["DailyCumulativeResponse"];

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

function todayDayJST(): number {
  return Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(8, 10));
}

function daysInMonthJST(): number {
  const ym = currentMonthJST();
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function computeSummary(data: DailyCumulativeResponse) {
  const last_actual = [...data.days].reverse().find((d) => d.is_actual);
  const total_spend = last_actual?.total ?? 0;
  const remaining_budget = data.monthly_budget - total_spend;
  const today_day = todayDayJST();
  const days_in_month = daysInMonthJST();
  const days_left = days_in_month - today_day;
  const daily_available = days_left > 0 ? Math.floor(remaining_budget / days_left) : 0;
  const monthly_budget = data.monthly_budget;
  const daily_budget = data.daily_budget;
  const baseline_today =
    monthly_budget > 0 ? Math.round((monthly_budget / days_in_month) * today_day) : 0;
  const budget_margin = baseline_today - total_spend;
  return {
    total_spend,
    remaining_budget,
    daily_available,
    days_left,
    monthly_budget,
    daily_budget,
    budget_margin,
  };
}

type Tone = "coral" | "mustard" | "sage" | "danger";

const TONE_COLORS: Record<Tone, { bg: string; fg: string }> = {
  coral: { bg: "#FFE8DD", fg: T.coralDeep },
  mustard: { bg: "#FFF1CC", fg: "#A3791F" },
  sage: { bg: "#DEF1E6", fg: T.sageDeep },
  danger: { bg: "#FEE2E2", fg: "#B91C1C" },
};

interface StatPillProps {
  tone: Tone;
  label: string;
  value: string;
  sub?: string;
}

function StatPill({ tone, label, value, sub }: StatPillProps) {
  const { bg, fg } = TONE_COLORS[tone];
  return (
    <div
      style={{
        background: bg,
        borderRadius: 24,
        padding: "18px 22px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color: fg, fontWeight: 700, letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: 26,
          color: T.ink,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SkeletonPill() {
  return (
    <div
      style={{
        flex: 1,
        height: 88,
        borderRadius: 24,
        background: "#F2E4D2",
        opacity: 0.5,
      }}
    />
  );
}

export function SummaryCards() {
  const [data, setData] = useState<DailyCumulativeResponse | null>(null);

  useEffect(() => {
    api
      .getDailyCumulative(currentMonthJST())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <SkeletonPill />
        <SkeletonPill />
        <SkeletonPill />
      </div>
    );
  }

  const {
    total_spend,
    remaining_budget,
    daily_available,
    days_left,
    monthly_budget,
    daily_budget,
    budget_margin,
  } = computeSummary(data);
  const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
      <StatPill
        tone="coral"
        label="今月の支出"
        value={yen(total_spend)}
        sub={monthly_budget > 0 ? `予算 ${yen(monthly_budget)} のうち` : undefined}
      />
      <StatPill
        tone="mustard"
        label="残り予算"
        value={yen(remaining_budget)}
        sub={
          budget_margin >= 0
            ? `基準より ${yen(budget_margin)} 余裕`
            : `基準より ${yen(-budget_margin)} オーバー`
        }
      />
      <StatPill
        tone={dailyAvailableTone(daily_available, daily_budget)}
        label="1日あたり利用可能額"
        value={yen(daily_available)}
        sub={`残り${days_left}日`}
      />
    </div>
  );
}
