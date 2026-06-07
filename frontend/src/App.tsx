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
import { api, AuthError, token_store } from "./api/client";
import type { components } from "./api/types";
import { T } from "./theme";

type Tab = "home" | "list" | "budget" | "master" | "review" | "account";
type UserProfile = components["schemas"]["UserResponse"];

function useMobile(): boolean {
  const [is_mobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 1023px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return is_mobile;
}

function LogoIcon() {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        background: T.coral,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 4px 0 ${T.coralDeep}`,
        flexShrink: 0,
      }}
    >
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <circle cx="13" cy="13" r="9" fill={T.mustard} stroke="#fff" strokeWidth="2" />
        <circle cx="10" cy="11" r="1.4" fill={T.coralDeep} />
        <circle cx="16" cy="11" r="1.4" fill={T.coralDeep} />
        <path
          d="M10 15.5 Q13 18 16 15.5"
          stroke={T.coralDeep}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

const NAV_ITEMS: { id: Tab; label: string; emoji: string }[] = [
  { id: "home", label: "ホーム", emoji: "🌞" },
  { id: "budget", label: "目標", emoji: "🎯" },
  { id: "review", label: "振り返り", emoji: "📖" },
  { id: "list", label: "仕訳", emoji: "📝" },
  { id: "master", label: "マスタ", emoji: "🧰" },
];

const MOBILE_TAB_ITEMS: { id: Tab | "add"; label: string; emoji: string }[] = [
  { id: "home", label: "ホーム", emoji: "🌞" },
  { id: "review", label: "振り返り", emoji: "📖" },
  { id: "add", label: "", emoji: "＋" },
  { id: "list", label: "仕訳", emoji: "📝" },
  { id: "budget", label: "目標", emoji: "🎯" },
];

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
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
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px 6px 6px",
        borderRadius: 999,
        border: `1.5px solid ${active ? T.ink : T.hair}`,
        background: active ? T.ink : T.card,
        color: active ? "#fff" : T.ink,
        fontFamily: "inherit",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: T.coral,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        {display.slice(0, 1).toUpperCase()}
      </span>
      <span
        style={{
          maxWidth: 140,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
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
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 36px",
        background: T.card,
        borderBottom: `1px solid ${T.hair}`,
        boxShadow: "0 2px 12px -8px rgba(80,40,10,0.12)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        gap: 16,
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <LogoIcon />
        <span
          style={{
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: "-0.01em",
            color: T.ink,
          }}
        >
          Atoikura
        </span>
      </div>

      {/* Nav pills */}
      <nav
        style={{
          display: "flex",
          gap: 6,
          background: T.card,
          padding: 6,
          borderRadius: 999,
          boxShadow: "0 4px 16px -10px rgba(80,40,10,0.2)",
        }}
      >
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "none",
              background: active === item.id ? T.ink : "transparent",
              color: active === item.id ? "#fff" : T.ink,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
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
                width: 32,
                height: 32,
                borderRadius: 999,
                border: `1.5px solid ${T.hair}`,
                background: T.card,
                color: T.inkSoft,
                fontSize: 13,
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
                background: T.card,
                fontSize: 13,
                fontWeight: 600,
                color: T.ink,
              }}
            >
              {formatMonthJP(listYearMonth)}
            </span>
            <button
              onClick={() => onListMonthChange(addMonths(listYearMonth, 1))}
              disabled={isCurrent}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                border: `1.5px solid ${T.hair}`,
                background: T.card,
                fontSize: 13,
                cursor: isCurrent ? "default" : "pointer",
                color: isCurrent ? T.hair : T.inkSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ›
            </button>
          </div>
        )}
        <UserPill user={user} active={active === "account"} onClick={() => onChange("account")} />
      </div>
    </header>
  );
}

interface MobileHeaderProps {
  user: UserProfile;
  onAvatarClick: () => void;
}

function MobileHeader({ user, onAvatarClick }: MobileHeaderProps) {
  const display = user.display_name?.trim() || user.email.split("@")[0];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "env(safe-area-inset-top, 0px) 20px 12px",
        paddingTop: "max(env(safe-area-inset-top, 0px), 16px)",
        background: T.bg,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 30 * 0.32,
            background: T.coral,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 3px 0 ${T.coralDeep}`,
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 26 26" fill="none">
            <circle cx="13" cy="13" r="9" fill={T.mustard} stroke="#fff" strokeWidth="2" />
            <circle cx="10" cy="11" r="1.4" fill={T.coralDeep} />
            <circle cx="16" cy="11" r="1.4" fill={T.coralDeep} />
            <path
              d="M10 15.5 Q13 18 16 15.5"
              stroke={T.coralDeep}
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
        <span
          style={{
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontWeight: 900,
            fontSize: 19,
            letterSpacing: "-0.01em",
            color: T.ink,
          }}
        >
          Atoikura
        </span>
      </div>
      <button
        type="button"
        onClick={onAvatarClick}
        title="アカウント"
        style={{
          width: 34,
          height: 34,
          minWidth: 44,
          minHeight: 44,
          borderRadius: "50%",
          background: T.sage,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 14,
          border: "none",
          cursor: "pointer",
        }}
      >
        {display.slice(0, 1).toUpperCase()}
      </button>
    </div>
  );
}

interface MobileTabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  onPlusClick: () => void;
}

function MobileTabBar({ active, onChange, onPlusClick }: MobileTabBarProps) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: T.card,
        borderTop: `1.5px solid ${T.hair}`,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-around",
        padding: "10px 10px 0",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)",
        position: "sticky",
        bottom: 0,
        zIndex: 100,
        boxShadow: "0 -8px 24px -16px rgba(80,40,10,0.18)",
      }}
    >
      {MOBILE_TAB_ITEMS.map((item) => {
        if (item.id === "add") {
          return (
            <div key="add" style={{ flex: 1, display: "flex", justifyContent: "center", transform: "translateY(-14px)" }}>
              <button
                type="button"
                onClick={onPlusClick}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 20,
                  background: T.coral,
                  color: "#fff",
                  fontSize: 30,
                  fontWeight: 300,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 6px 0 ${T.coralDeep}, 0 12px 20px -8px rgba(242,107,63,0.5)`,
                }}
              >
                ＋
              </button>
            </div>
          );
        }
        const on = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id as Tab)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              flex: 1,
              paddingTop: 4,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              minHeight: 44,
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 20, filter: on ? "none" : "grayscale(0.6) opacity(0.55)" }}>
              {item.emoji}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: on ? T.coralDeep : T.inkSoft }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface EntrySheetProps {
  onClose: () => void;
  onSuccess: () => void;
}

function EntrySheet({ onClose, onSuccess }: EntrySheetProps) {
  const handle_success = () => {
    onSuccess();
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(42,37,32,0.45)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: T.card,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          padding: "12px 20px",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)",
          boxShadow: "0 -20px 50px -20px rgba(0,0,0,0.3)",
          maxHeight: "90dvh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 42,
            height: 5,
            borderRadius: 999,
            background: T.hair,
            margin: "0 auto 14px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 19,
              fontWeight: 900,
              color: T.ink,
            }}
          >
            支出を記録
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              minWidth: 44,
              minHeight: 44,
              borderRadius: 999,
              background: T.bgSoft,
              border: "none",
              cursor: "pointer",
              color: T.inkSoft,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
        <JournalEntryForm onSuccess={handle_success} />
      </div>
    </div>
  );
}

type AuthState =
  | { status: "checking" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: UserProfile };

export default function App() {
  const [auth_state, setAuthState] = useState<AuthState>(() =>
    token_store.load() ? { status: "checking" } : { status: "anonymous" }
  );
  const [active_tab, setActiveTab] = useState<Tab>("home");
  const [refresh_token, setRefreshToken] = useState(0);
  const [list_year_month, setListYearMonth] = useState(currentMonthJST());
  const [show_entry_sheet, setShowEntrySheet] = useState(false);
  const is_mobile = useMobile();

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
          token_store.clear();
        }
        setAuthState({ status: "anonymous" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth_state.status]);

  function handleLogout() {
    token_store.clear();
    setActiveTab("home");
    setAuthState({ status: "anonymous" });
  }

  if (auth_state.status === "checking") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: T.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: T.inkSoft,
          fontSize: 14,
        }}
      >
        読み込み中…
      </div>
    );
  }

  if (auth_state.status === "anonymous") {
    return <LoginScreen onSuccess={(user) => setAuthState({ status: "authenticated", user })} />;
  }

  const isCurrent = list_year_month >= currentMonthJST();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: T.bg,
        overflowX: "hidden",
      }}
    >
      {is_mobile ? (
        <MobileHeader
          user={auth_state.user}
          onAvatarClick={() => setActiveTab("account")}
        />
      ) : (
        <NavBar
          active={active_tab}
          onChange={setActiveTab}
          listYearMonth={list_year_month}
          onListMonthChange={setListYearMonth}
          user={auth_state.user}
        />
      )}

      <main
        style={{
          flex: 1,
          padding: is_mobile ? "16px 20px 96px" : "32px 36px",
          maxWidth: is_mobile ? undefined : 1280,
          width: "100%",
          margin: "0 auto",
          alignSelf: "stretch",
          overflowX: "hidden",
        }}
      >
        {/* Month navigation for list tab on mobile */}
        {is_mobile && active_tab === "list" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => setListYearMonth(addMonths(list_year_month, -1))}
              style={{
                width: 44,
                height: 44,
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
                padding: "10px 20px",
                borderRadius: 999,
                border: `1.5px solid ${T.hair}`,
                background: T.card,
                fontSize: 14,
                fontWeight: 600,
                color: T.ink,
              }}
            >
              {formatMonthJP(list_year_month)}
            </span>
            <button
              onClick={() => setListYearMonth(addMonths(list_year_month, 1))}
              disabled={isCurrent}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                border: `1.5px solid ${T.hair}`,
                background: T.card,
                fontSize: 16,
                cursor: isCurrent ? "default" : "pointer",
                color: isCurrent ? T.hair : T.inkSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ›
            </button>
          </div>
        )}

        {active_tab === "home" && (
          <>
            <SummaryCards />

            <div
              style={{
                background: T.card,
                borderRadius: 28,
                padding: is_mobile ? 16 : 24,
                boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
                marginBottom: 20,
                overflowX: "hidden",
              }}
            >
              <HomeGraph />
            </div>

            {!is_mobile && (
              <div
                style={{
                  background: T.card,
                  borderRadius: 28,
                  padding: 28,
                  boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
                }}
              >
                <JournalEntryForm onSuccess={() => setRefreshToken((t) => t + 1)} />
              </div>
            )}
          </>
        )}

        {active_tab === "list" && (
          <JournalEntryList year_month={list_year_month} refresh_token={refresh_token} />
        )}

        {active_tab === "review" && <ReviewScreen />}

        {active_tab === "budget" && <BudgetSettings />}

        {active_tab === "master" && <MasterManagement />}

        {active_tab === "account" && (
          <UserInfo user={auth_state.user} onLogout={handleLogout} />
        )}
      </main>

      {is_mobile && (
        <MobileTabBar
          active={active_tab}
          onChange={setActiveTab}
          onPlusClick={() => setShowEntrySheet(true)}
        />
      )}

      {is_mobile && show_entry_sheet && (
        <EntrySheet
          onClose={() => setShowEntrySheet(false)}
          onSuccess={() => setRefreshToken((t) => t + 1)}
        />
      )}
    </div>
  );
}
