import { useState } from "react";
import { JournalEntryForm } from "./components/JournalEntryForm";
import { JournalEntryList } from "./components/JournalEntryList";
import { BudgetSettings } from "./components/BudgetSettings";
import { HomeGraph } from "./components/HomeGraph";

type Tab = "home" | "list" | "budget";

function NavButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 20px",
        borderRadius: 8,
        border: "none",
        background: active ? "#4ade80" : "#333",
        color: active ? "#000" : "#ccc",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );
}

export default function App() {
  const [active_tab, setActiveTab] = useState<Tab>("home");
  const [refresh_token, setRefreshToken] = useState(0);

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1>atoikura</h1>

      <nav style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <NavButton
          label="ホーム"
          active={active_tab === "home"}
          onClick={() => setActiveTab("home")}
        />
        <NavButton
          label="仕訳一覧"
          active={active_tab === "list"}
          onClick={() => setActiveTab("list")}
        />
        <NavButton
          label="目標設定"
          active={active_tab === "budget"}
          onClick={() => setActiveTab("budget")}
        />
      </nav>

      {active_tab === "home" && (
        <>
          <HomeGraph />
          <hr style={{ margin: "32px 0" }} />
          <JournalEntryForm onSuccess={() => setRefreshToken((t) => t + 1)} />
        </>
      )}

      {active_tab === "list" && (
        <JournalEntryList refresh_token={refresh_token} />
      )}

      {active_tab === "budget" && <BudgetSettings />}
    </main>
  );
}
