import { useState } from "react";
import { JournalEntryForm } from "./components/JournalEntryForm";
import { JournalEntryList } from "./components/JournalEntryList";
import { BudgetSettings } from "./components/BudgetSettings";
import { HomeGraph } from "./components/HomeGraph";
import { SummaryCards } from "./components/SummaryCards";
import { MasterManagement } from "./components/MasterManagement";

type Tab = "home" | "list" | "budget" | "master";

function HomeIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1={8} y1={6} x2={21} y2={6} />
      <line x1={8} y1={12} x2={21} y2={12} />
      <line x1={8} y1={18} x2={21} y2={18} />
      <line x1={3} y1={6} x2="3.01" y2={6} />
      <line x1={3} y1={12} x2="3.01" y2={12} />
      <line x1={3} y1={18} x2="3.01" y2={18} />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1={18} y1={20} x2={18} y2={10} />
      <line x1={12} y1={20} x2={12} y2={4} />
      <line x1={6} y1={20} x2={6} y2={14} />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={10} />
      <circle cx={12} cy={12} r={6} />
      <circle cx={12} cy={12} r={2} />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x={3} y={4} width={18} height={18} rx={2} ry={2} />
      <line x1={16} y1={2} x2={16} y2={6} />
      <line x1={8} y1={2} x2={8} y2={6} />
      <line x1={3} y1={10} x2={21} y2={10} />
    </svg>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function NavItem({ icon, label, active, onClick, disabled }: NavItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        background: active ? "#252525" : "transparent",
        color: active ? "#fff" : disabled ? "#3a3a3a" : "#777",
        fontWeight: active ? 600 : 400,
        fontSize: 14,
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

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

function formatMonthJP(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return `${year}年${month}月`;
}

function todayJST(): string {
  return new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const nav_btn_style: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 6,
  border: "1px solid #2e2e2e",
  background: "#1a1a1a",
  color: "#aaa",
  fontSize: 13,
  cursor: "pointer",
};

interface MonthNavProps {
  value: string;
  onChange: (ym: string) => void;
}

function MonthNav({ value, onChange }: MonthNavProps) {
  const is_current = value >= currentMonthJST();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        onClick={() => onChange(addMonths(value, -1))}
        style={nav_btn_style}
      >
        &lt;
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 14px",
          borderRadius: 6,
          border: "1px solid #2e2e2e",
          background: "#1a1a1a",
          color: "#ccc",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <CalendarIcon />
        {formatMonthJP(value)}
      </div>
      <button
        onClick={() => onChange(addMonths(value, 1))}
        disabled={is_current}
        style={{
          ...nav_btn_style,
          color: is_current ? "#3a3a3a" : "#aaa",
          cursor: is_current ? "default" : "pointer",
        }}
      >
        &gt;
      </button>
    </div>
  );
}

const PAGE_TITLES: Record<Tab, string> = {
  home: "ダッシュボード",
  list: "仕訳一覧",
  budget: "目標設定",
  master: "マスタ管理",
};

export default function App() {
  const [active_tab, setActiveTab] = useState<Tab>("home");
  const [refresh_token, setRefreshToken] = useState(0);
  const [list_year_month, setListYearMonth] = useState(currentMonthJST());

  return (
    <div style={{ display: "flex", height: "100%", background: "#0c0c0c", color: "#fff" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          minWidth: 220,
          background: "#111",
          display: "flex",
          flexDirection: "column",
          padding: "20px 12px",
          borderRight: "1px solid #1a1a1a",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 4px",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 15,
              color: "#000",
              flexShrink: 0,
            }}
          >
            A
          </div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Atoikura</span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          <NavItem
            icon={<HomeIcon />}
            label="ホーム"
            active={active_tab === "home"}
            onClick={() => setActiveTab("home")}
          />
          <NavItem
            icon={<ListIcon />}
            label="仕訳一覧"
            active={active_tab === "list"}
            onClick={() => setActiveTab("list")}
          />
          <NavItem
            icon={<BarChartIcon />}
            label="振り返り"
            active={false}
            onClick={() => {}}
            disabled
          />
          <NavItem
            icon={<TargetIcon />}
            label="目標設定"
            active={active_tab === "budget"}
            onClick={() => setActiveTab("budget")}
          />
          <NavItem
            icon={<SettingsIcon />}
            label="マスタ管理"
            active={active_tab === "master"}
            onClick={() => setActiveTab("master")}
          />
        </nav>

        <div style={{ fontSize: 11, color: "#3a3a3a", padding: "0 4px" }}>
          v1.0.0 プロトタイプ
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto", padding: "32px 36px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>{PAGE_TITLES[active_tab]}</h1>
          {active_tab === "list" ? (
            <MonthNav value={list_year_month} onChange={setListYearMonth} />
          ) : (
            <span style={{ color: "#555", fontSize: 14 }}>{todayJST()}</span>
          )}
        </div>

        {active_tab === "home" && (
          <>
            <SummaryCards />

            <div
              style={{
                background: "#161616",
                border: "1px solid #222",
                borderRadius: 12,
                padding: "24px 24px 20px",
                marginBottom: 20,
              }}
            >
              <HomeGraph />
            </div>

            <div
              style={{
                background: "#161616",
                border: "1px solid #222",
                borderRadius: 12,
                padding: "24px",
              }}
            >
              <JournalEntryForm onSuccess={() => setRefreshToken((t) => t + 1)} />
            </div>
          </>
        )}

        {active_tab === "list" && (
          <JournalEntryList
            year_month={list_year_month}
            refresh_token={refresh_token}
          />
        )}

        {active_tab === "budget" && <BudgetSettings />}

        {active_tab === "master" && <MasterManagement />}
      </main>
    </div>
  );
}
