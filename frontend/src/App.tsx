import { useEffect, useState, useSyncExternalStore } from "react";
import { ReviewScreen } from "./components/ReviewScreen";
import { LoginScreen } from "./components/LoginScreen";
import { UserInfo } from "./components/UserInfo";
import { Modal } from "./components/Modal";
import { DialogProvider } from "./components/dialogs";
import { MobileHome } from "./components/mobile/MobileHome";
import { MobileJournal } from "./components/mobile/MobileJournal";
import { MobileEntryForm } from "./components/mobile/MobileEntryForm";
import { MobileBudget } from "./components/mobile/MobileBudget";
import { MobileRecurring } from "./components/mobile/MobileRecurring";
import { MobileSavings } from "./components/mobile/MobileSavings";
import { MobileIncome } from "./components/mobile/MobileIncome";
import { WebHome } from "./components/web/WebHome";
import { WebBudget } from "./components/web/WebBudget";
import { WebRecurring } from "./components/web/WebRecurring";
import { WebSavings } from "./components/web/WebSavings";
import { WebIncome } from "./components/web/WebIncome";
import { WebReview } from "./components/web/WebReview";
import { WebJournal } from "./components/web/WebJournal";
import { WebMaster } from "./components/web/WebMaster";
import { MonthSwitcher } from "./components/MonthSwitcher";
import { SyncStatusIndicator } from "./components/SyncStatusIndicator";
import type { JournalEntryView } from "./data/journal";
import { LedgerDataProvider } from "./data/LedgerDataProvider";
import { joinTokenFromHash } from "./data/household";
import { LedgerViewContext, useLedgerViewState } from "./data/ledgerData";
import { ArchiveViewer } from "./components/ArchiveViewer";
import { HouseholdSettings } from "./components/HouseholdSettings";
import { LedgerViewSwitcher } from "./components/LedgerViewSwitcher";
import { UpdateNotice } from "./pwa/UpdateNotice";
import { SessionProvider } from "./session/SessionContext";
import {
  createBrowserAppServices,
  SessionController,
  type AppServices,
  type UserProfile,
} from "./session/sessionController";
import { T } from "./theme";

type Tab = "home" | "list" | "budget" | "master" | "review" | "account";
type BudgetSubScreen = "hub" | "income" | "recurring" | "savings";

// A point in the in-app navigation, mirrored onto the browser history stack so
// the native Back button walks screens instead of leaving the SPA (#165).
// archive is the past household open on the account screen, if any.
type NavLocation = { tab: Tab; sub: BudgetSubScreen; archive?: string | null };

function useMobile(): boolean {
  const [is_mobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
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
  { id: "budget", label: "予算", emoji: "💰" },
  { id: "review", label: "振り返り", emoji: "📖" },
  { id: "list", label: "仕訳", emoji: "📝" },
  { id: "master", label: "マスタ", emoji: "🧰" },
];

const MOBILE_TAB_ITEMS: { id: Tab | "add"; label: string; emoji: string }[] = [
  { id: "home", label: "ホーム", emoji: "🌞" },
  { id: "review", label: "振り返り", emoji: "📖" },
  { id: "add", label: "", emoji: "＋" },
  { id: "list", label: "仕訳", emoji: "📝" },
  { id: "budget", label: "予算", emoji: "💰" },
];

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
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
  user: UserProfile;
}

function NavBar({ active, onChange, user }: NavBarProps) {
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
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
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 14 }}>{item.emoji}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Right: sync status + user pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <SyncStatusIndicator />
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SyncStatusIndicator is_mobile />
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
    </div>
  );
}

interface MobileTabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  onPlusClick: () => void;
  addTone?: "coral" | "sage";
}

function MobileTabBar({ active, onChange, onPlusClick, addTone = "coral" }: MobileTabBarProps) {
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
            <div
              key="add"
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                transform: "translateY(-14px)",
              }}
            >
              <button
                type="button"
                onClick={onPlusClick}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 20,
                  background: addTone === "sage" ? T.sage : T.coral,
                  color: "#fff",
                  fontSize: 30,
                  fontWeight: 300,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow:
                    addTone === "sage"
                      ? `0 6px 0 ${T.sageDeep}, 0 12px 20px -8px rgba(123,196,164,0.5)`
                      : `0 6px 0 ${T.coralDeep}, 0 12px 20px -8px rgba(242,107,63,0.5)`,
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
  edit_entry?: JournalEntryView | null;
  is_mobile?: boolean;
}

function EntrySheet({ onClose, edit_entry, is_mobile = false }: EntrySheetProps) {
  const is_edit = !!edit_entry;
  // Screens re-read local data on their own; an edit closes the sheet, while a
  // new entry keeps it open for the next one.
  const handle_success = () => {
    if (is_edit) onClose();
  };

  // On web this is a compact, width-constrained centered card; on mobile the
  // shared Modal renders its bottom-sheet variant, preserving the original
  // sheet UX while no longer filling the whole screen on desktop (#133).
  return (
    <Modal
      title={is_edit ? "支出を編集" : "支出を記録"}
      onClose={onClose}
      is_mobile={is_mobile}
      maxWidth={460}
    >
      <LedgerDataProvider>
        <MobileEntryForm onSuccess={handle_success} edit_entry={edit_entry} />
      </LedgerDataProvider>
    </Modal>
  );
}

function AppContent({
  is_mobile,
  session_controller,
}: {
  is_mobile: boolean;
  session_controller: SessionController;
}) {
  const session_state = useSyncExternalStore(
    session_controller.subscribe,
    session_controller.getState
  );
  // An invitation link lands on the account screen's household settings.
  const [active_tab, setActiveTab] = useState<Tab>(() =>
    joinTokenFromHash(window.location.hash) ? "account" : "home"
  );
  const [budget_sub, setBudgetSub] = useState<BudgetSubScreen>("hub");
  const [archive_ledger_id, setArchiveLedgerId] = useState<string | null>(null);
  const [list_year_month, setListYearMonth] = useState(currentMonthJST());
  const [show_entry_sheet, setShowEntrySheet] = useState(false);
  const [edit_entry, setEditEntry] = useState<JournalEntryView | null>(null);
  const ledger_view_state = useLedgerViewState();
  // An invitation link opens the app with #join=<token>. The token is taken out
  // of the URL right away so it doesn't linger in history, and the household
  // settings ask before joining.
  const [pending_join_token, setPendingJoinToken] = useState<string | null>(() =>
    joinTokenFromHash(window.location.hash)
  );
  useEffect(() => {
    const clearJoinHash = () =>
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`
      );
    if (joinTokenFromHash(window.location.hash)) clearJoinHash();
    // A link opened in a tab that already shows the app only changes the hash.
    const handle_hashchange = () => {
      const join_token = joinTokenFromHash(window.location.hash);
      if (!join_token) return;
      clearJoinHash();
      setPendingJoinToken(join_token);
      setActiveTab("account");
      setArchiveLedgerId(null);
    };
    window.addEventListener("hashchange", handle_hashchange);
    return () => window.removeEventListener("hashchange", handle_hashchange);
  }, []);

  // ── In-app history (#165) ──────────────────────────────────────────────────
  // Screen navigation is React state, not URL routes, so without History API
  // integration the browser Back button leaves the SPA entirely. Every screen
  // transition goes through `navigate`, which mirrors the new location onto the
  // history stack; `popstate` restores it. Back then walks budget sub-screen →
  // budget hub → home before the browser finally exits the app.
  const navigate = (patch: Partial<NavLocation>) => {
    // Any other navigation closes an open archive.
    const next_archive = patch.archive ?? null;
    const next: NavLocation = {
      tab: patch.tab ?? active_tab,
      sub: patch.sub ?? budget_sub,
      ...(next_archive ? { archive: next_archive } : {}),
    };
    if (next.tab === active_tab && next.sub === budget_sub && next_archive === archive_ledger_id)
      return;
    setActiveTab(next.tab);
    setBudgetSub(next.sub);
    setArchiveLedgerId(next_archive);
    window.history.pushState({ nav: next }, "");
  };

  // Seed the first history entry once the user is authenticated so the initial
  // popstate has a location to restore and Back from home exits cleanly.
  useEffect(() => {
    if (session_state.status !== "ready") return;
    window.history.replaceState({ nav: { tab: "home", sub: "hub" } satisfies NavLocation }, "");
  }, [session_state.status]);

  useEffect(() => {
    const handle_popstate = (event: PopStateEvent) => {
      const nav = (event.state as { nav?: NavLocation } | null)?.nav;
      setActiveTab(nav?.tab ?? "home");
      setBudgetSub(nav?.sub ?? "hub");
      setArchiveLedgerId(nav?.archive ?? null);
    };
    window.addEventListener("popstate", handle_popstate);
    return () => window.removeEventListener("popstate", handle_popstate);
  }, []);

  useEffect(() => {
    void session_controller.initialize();
  }, [session_controller]);

  async function handleLogout(options?: { discard_pending_changes?: boolean }) {
    const logout_result = await session_controller.logout(options);
    if (logout_result.outcome === "signed_out") {
      setActiveTab("home");
      setArchiveLedgerId(null);
    }
    return logout_result;
  }

  if (session_state.status === "checking" || session_state.status === "unavailable") {
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
        {session_state.status === "unavailable" ? session_state.message : "読み込み中…"}
      </div>
    );
  }

  if (session_state.status === "anonymous") {
    return (
      <LoginScreen
        notice={session_state.notice}
        onLogin={(email, password) => session_controller.login(email, password)}
        onSignup={(email, password, display_name) =>
          session_controller.signup(email, password, display_name)
        }
      />
    );
  }

  const { session } = session_state;

  return (
    <SessionProvider session={session}>
      <LedgerViewContext.Provider value={ledger_view_state}>
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
            <MobileHeader user={session.user} onAvatarClick={() => navigate({ tab: "account" })} />
          ) : (
            <NavBar
              active={active_tab}
              // Tapping a nav button always lands on a tab's top-level view, so
              // reset the budget sub-screen to the hub (#134) — otherwise the
              // header "予算" button leaves you stranded on income/recurring.
              onChange={(tab) => navigate({ tab, sub: "hub" })}
              user={session.user}
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
            {/* The account screen works before the first sync, so sign-out is always
              reachable; every other screen waits for the ledger's data. */}
            {active_tab === "account" && archive_ledger_id ? (
              <LedgerDataProvider>
                <ArchiveViewer
                  archive_ledger_id={archive_ledger_id}
                  // Opening pushed a history entry; going back pops it.
                  onBack={() => window.history.back()}
                  is_mobile={is_mobile}
                />
              </LedgerDataProvider>
            ) : active_tab === "account" ? (
              <>
                <UserInfo user={session.user} onLogout={handleLogout} />
                <LedgerDataProvider>
                  <HouseholdSettings
                    pending_join_token={pending_join_token}
                    onJoinTokenHandled={() => setPendingJoinToken(null)}
                    onOpenArchive={(opened_archive_id) =>
                      navigate({ tab: "account", archive: opened_archive_id })
                    }
                  />
                </LedgerDataProvider>
              </>
            ) : (
              <LedgerDataProvider>
                <LedgerViewSwitcher />
                {/* Month navigation for list tab on mobile */}
                {is_mobile && active_tab === "list" && (
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                    <MonthSwitcher
                      year_month={list_year_month}
                      onYearMonthChange={setListYearMonth}
                      is_mobile
                    />
                  </div>
                )}

                {active_tab === "home" &&
                  (is_mobile ? (
                    <MobileHome onShowList={() => navigate({ tab: "list" })} />
                  ) : (
                    <WebHome />
                  ))}

                {active_tab === "list" &&
                  (is_mobile ? (
                    <MobileJournal
                      year_month={list_year_month}
                      onEditEntry={(entry) => {
                        setEditEntry(entry);
                        setShowEntrySheet(true);
                      }}
                    />
                  ) : (
                    <WebJournal
                      year_month={list_year_month}
                      onYearMonthChange={setListYearMonth}
                      onEditEntry={(entry) => {
                        setEditEntry(entry);
                        setShowEntrySheet(true);
                      }}
                    />
                  ))}

                {active_tab === "review" && (is_mobile ? <ReviewScreen /> : <WebReview />)}

                {active_tab === "budget" &&
                  (() => {
                    if (is_mobile) {
                      if (budget_sub === "income")
                        return <MobileIncome onBack={() => navigate({ sub: "hub" })} />;
                      if (budget_sub === "recurring")
                        return <MobileRecurring onBack={() => navigate({ sub: "hub" })} />;
                      if (budget_sub === "savings")
                        return <MobileSavings onBack={() => navigate({ sub: "hub" })} />;
                      return <MobileBudget onNavigate={(s) => navigate({ sub: s })} />;
                    }
                    if (budget_sub === "income")
                      return <WebIncome onBack={() => navigate({ sub: "hub" })} />;
                    if (budget_sub === "recurring")
                      return <WebRecurring onBack={() => navigate({ sub: "hub" })} />;
                    if (budget_sub === "savings")
                      return <WebSavings onBack={() => navigate({ sub: "hub" })} />;
                    return <WebBudget onNavigate={(s) => navigate({ sub: s })} />;
                  })()}

                {active_tab === "master" && <WebMaster />}
              </LedgerDataProvider>
            )}
          </main>

          {is_mobile && (
            <MobileTabBar
              active={active_tab}
              // Always return to the budget hub on a tab tap, including when the
              // tapped tab is "予算" itself (#134).
              onChange={(tab) => navigate({ tab, sub: "hub" })}
              onPlusClick={() => {
                setEditEntry(null);
                setShowEntrySheet(true);
              }}
              addTone={active_tab === "budget" && budget_sub === "income" ? "sage" : "coral"}
            />
          )}

          {show_entry_sheet && (
            <EntrySheet
              onClose={() => {
                setShowEntrySheet(false);
                setEditEntry(null);
              }}
              edit_entry={edit_entry}
              is_mobile={is_mobile}
            />
          )}
        </div>
      </LedgerViewContext.Provider>
    </SessionProvider>
  );
}

export default function App({ services }: { services?: AppServices }) {
  // One DialogProvider at the root renders the in-app confirm/alert Modal (#166);
  // `is_mobile` is resolved once here and threaded through both the dialogs and
  // the screen tree so the sheet/centered-card variant stays consistent.
  const is_mobile = useMobile();
  // Tests pass their own services (in-memory database, fake storage).
  const [session_controller] = useState(
    () => new SessionController(services ?? createBrowserAppServices())
  );
  return (
    <DialogProvider is_mobile={is_mobile}>
      <AppContent is_mobile={is_mobile} session_controller={session_controller} />
      <UpdateNotice is_mobile={is_mobile} />
    </DialogProvider>
  );
}
