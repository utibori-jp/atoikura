import { useEffect, useState } from "react";
import { JournalEntryForm } from "./components/JournalEntryForm";
import { JournalEntryList } from "./components/JournalEntryList";
import { BudgetSettings } from "./components/BudgetSettings";
import { HomeGraph } from "./components/HomeGraph";
import { SummaryCards } from "./components/SummaryCards";
import { MasterManagement } from "./components/MasterManagement";
import { ReviewScreen } from "./components/ReviewScreen";
import { LoginScreen } from "./components/LoginScreen";
import { UserInfo } from "./components/UserInfo";
import { api, AuthError, credentials_store } from "./api/client";
import type { components } from "./api/types";
import { T } from "./theme";

type Tab = "home" | "list" | "budget" | "master" | "review" | "account";
type UserProfile = components["schemas"]["UserResponse"];

function LogoIcon() {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 14,
      background: T.coral,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 4px 0 ${T.coralDeep}`,
      flexShrink: 0,
    }}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <circle cx="13" cy="13" r="9" fill={T.mustard} stroke="#fff" strokeWidth="2"/>
        <circle cx="10" cy="11" r="1.4" fill={T.coralDeep}/>
        <circle cx="16" cy="11" r="1.4" fill={T.coralDeep}/>
        <path d="M10 15.5 Q13 18 16 15.5" stroke={T.coralDeep} strokeWidth="1.6" strokeLinecap="round" fill="none"/>
      </svg>
    </div>
  );
}

const NAV_ITEMS: { id: Tab; label: string; emoji: string }[] = [
  { id: "home",   label: "ホーム",   emoji: "🌞" },
  { id: "budget", label: "目標",     emoji: "🎯" },
  { id: "review", label: "振り返り", emoji: "📖" },
  { id: "list",   label: "仕訳",     emoji: "📝" },
  { id: "master", label: "マスタ",   emoji: "🧰" },
];

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

interface UserPillProps {
  user: UserProfile;
  active: boolean;
  onClick: () => void;
}

function UserPill({ user, active, onClick }: UserPillProps) {
  const display = user.display_name?.trim() || user.email.split("@")[0];
  return (
    <button
      type="button"
      onClick={onClick}
      title="アカウント"
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 14px 6px 6px", borderRadius: 999,
        border: `1.5px solid ${active ? T.ink : T.hair}`,
        background: active ? T.ink : T.card,
        color: active ? "#fff" : T.ink,
        fontFamily: "inherit", fontWeight: 600, fontSize: 13,
        cursor: "pointer",
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: "50%",
        background: T.coral, color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 800,
      }}>
        {display.slice(0, 1).toUpperCase()}
      </span>
      <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {display}
      </span>
    </button>
  );
}

interface NavBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  listYearMonth: string;
  onListMonthChange: (ym: string) => void;
  user: UserProfile;
}

function NavBar({ active, onChange, listYearMonth, onListMonthChange, user }: NavBarProps) {
  const isCurrent = listYearMonth >= currentMonthJST();

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 36px",
      background: T.card,
      borderBottom: `1px solid ${T.hair}`,
      boxShadow: "0 2px 12px -8px rgba(80,40,10,0.12)",
      position: "sticky", top: 0, zIndex: 100,
      gap: 16,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <LogoIcon />
        <span style={{
          fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
          fontWeight: 900, fontSize: 22, letterSpacing: "-0.01em", color: T.ink,
        }}>Atoikura</span>
      </div>

      {/* Nav pills */}
      <nav style={{
        display: "flex", gap: 6,
        background: T.card,
        padding: 6, borderRadius: 999,
        boxShadow: "0 4px 16px -10px rgba(80,40,10,0.2)",
      }}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            style={{
              padding: "10px 18px", borderRadius: 999,
              border: "none",
              background: active === item.id ? T.ink : "transparent",
              color: active === item.id ? "#fff" : T.ink,
              fontWeight: 600, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "inherit",
              transition: "background 0.15s",
            }}
          >
            <span style={{ fontSize: 14 }}>{item.emoji}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Right: month nav (list) + user pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {active === "list" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => onListMonthChange(addMonths(listYearMonth, -1))}
              style={{
                width: 32, height: 32, borderRadius: 999, border: `1.5px solid ${T.hair}`,
                background: T.card, color: T.inkSoft, fontSize: 13, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >‹</button>
            <span style={{
              padding: "6px 16px", borderRadius: 999,
              border: `1.5px solid ${T.hair}`, background: T.card,
              fontSize: 13, fontWeight: 600, color: T.ink,
            }}>{formatMonthJP(listYearMonth)}</span>
            <button
              onClick={() => onListMonthChange(addMonths(listYearMonth, 1))}
              disabled={isCurrent}
              style={{
                width: 32, height: 32, borderRadius: 999, border: `1.5px solid ${T.hair}`,
                background: T.card, fontSize: 13, cursor: isCurrent ? "default" : "pointer",
                color: isCurrent ? T.hair : T.inkSoft,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >›</button>
          </div>
        )}
        <UserPill
          user={user}
          active={active === "account"}
          onClick={() => onChange("account")}
        />
      </div>
    </header>
  );
}

type AuthState =
  | { status: "checking" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: UserProfile };

export default function App() {
  const [auth_state, setAuthState] = useState<AuthState>(() =>
    credentials_store.load() ? { status: "checking" } : { status: "anonymous" },
  );
  const [active_tab, setActiveTab] = useState<Tab>("home");
  const [refresh_token, setRefreshToken] = useState(0);
  const [list_year_month, setListYearMonth] = useState(currentMonthJST());

  // On first load with stored credentials, verify them by fetching /users/me.
  // If the creds are stale/wrong, fall back to login.
  useEffect(() => {
    if (auth_state.status !== "checking") return;
    let cancelled = false;
    (async () => {
      try {
        const user = await api.getCurrentUser();
        if (!cancelled) setAuthState({ status: "authenticated", user });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AuthError) {
          credentials_store.clear();
        }
        setAuthState({ status: "anonymous" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth_state.status]);

  function handleLogout() {
    credentials_store.clear();
    setActiveTab("home");
    setAuthState({ status: "anonymous" });
  }

  if (auth_state.status === "checking") {
    return (
      <div style={{
        minHeight: "100vh", background: T.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: T.inkSoft, fontSize: 14,
      }}>
        読み込み中…
      </div>
    );
  }

  if (auth_state.status === "anonymous") {
    return (
      <LoginScreen
        onSuccess={(user) => setAuthState({ status: "authenticated", user })}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: T.bg }}>
      <NavBar
        active={active_tab}
        onChange={setActiveTab}
        listYearMonth={list_year_month}
        onListMonthChange={setListYearMonth}
        user={auth_state.user}
      />

      <main style={{ flex: 1, padding: "32px 36px", maxWidth: 1280, width: "100%", margin: "0 auto", alignSelf: "stretch" }}>
        {active_tab === "home" && (
          <>
            <SummaryCards />

            <div style={{
              background: T.card, borderRadius: 28, padding: 24,
              boxShadow: T.cardShadow, marginBottom: 20,
            }}>
              <HomeGraph />
            </div>

            <div style={{
              background: T.card, borderRadius: 28, padding: 28,
              boxShadow: T.cardShadow,
            }}>
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

        {active_tab === "review" && <ReviewScreen />}

        {active_tab === "budget" && <BudgetSettings />}

        {active_tab === "master" && <MasterManagement />}

        {active_tab === "account" && (
          <UserInfo user={auth_state.user} onLogout={handleLogout} />
        )}
      </main>
    </div>
  );
}
