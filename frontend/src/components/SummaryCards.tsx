import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { components } from "../api/types";

type DailyCumulativeResponse = components["schemas"]["DailyCumulativeResponse"];

function currentMonthJST(): string {
  return new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
    .slice(0, 7);
}

function todayDayJST(): number {
  return Number(
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(8, 10),
  );
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
  const days_left = daysInMonthJST() - today_day;
  const daily_available = days_left > 0 ? Math.floor(remaining_budget / days_left) : 0;
  return { total_spend, remaining_budget, daily_available, days_left };
}

function WalletIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x={1} y={4} width={22} height={16} rx={2} ry={2} />
      <line x1={1} y1={10} x2={23} y2={10} />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23,6 13.5,15.5 8.5,10.5 1,18" />
      <polyline points="17,6 23,6 23,12" />
    </svg>
  );
}

interface CardProps {
  icon: React.ReactNode;
  icon_bg: string;
  label: string;
  value: string;
  sub?: string;
}

function SummaryCard({ icon, icon_bg, label, value, sub }: CardProps) {
  return (
    <div
      style={{
        flex: 1,
        background: "#161616",
        border: "1px solid #222",
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          background: icon_bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "#fff",
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, color: "#777", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        flex: 1,
        height: 96,
        background: "#161616",
        border: "1px solid #222",
        borderRadius: 12,
      }}
    />
  );
}

export function SummaryCards() {
  const [data, setData] = useState<DailyCumulativeResponse | null>(null);

  useEffect(() => {
    api.getDailyCumulative(currentMonthJST()).then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const { total_spend, remaining_budget, daily_available, days_left } = computeSummary(data);
  const green_bg = "#14532d";
  const gold_bg = "#78350f";

  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
      <SummaryCard
        icon={<WalletIcon />}
        icon_bg={green_bg}
        label="今月の支出"
        value={`¥${total_spend.toLocaleString()}`}
      />
      <SummaryCard
        icon={<TrendUpIcon />}
        icon_bg={green_bg}
        label="残り予算"
        value={`¥${remaining_budget.toLocaleString()}`}
      />
      <SummaryCard
        icon={<TrendUpIcon />}
        icon_bg={gold_bg}
        label="1日あたり利用可能額"
        value={`¥${daily_available.toLocaleString()}`}
        sub={`残り${days_left}日`}
      />
    </div>
  );
}
