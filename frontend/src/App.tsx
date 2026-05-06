import { useState } from "react";
import { JournalEntryForm } from "./components/JournalEntryForm";
import { JournalEntryList } from "./components/JournalEntryList";
import { BudgetSettings } from "./components/BudgetSettings";

type Tab = "home" | "budget";

export default function App() {
  const [active_tab, setActiveTab] = useState<Tab>("home");
  const [refresh_token, setRefreshToken] = useState(0);

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1>atoikura</h1>

      <nav style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab("home")}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: active_tab === "home" ? "#4ade80" : "#333",
            color: active_tab === "home" ? "#000" : "#ccc",
            fontWeight: active_tab === "home" ? 600 : 400,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ホーム
        </button>
        <button
          onClick={() => setActiveTab("budget")}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: active_tab === "budget" ? "#4ade80" : "#333",
            color: active_tab === "budget" ? "#000" : "#ccc",
            fontWeight: active_tab === "budget" ? 600 : 400,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          目標設定
        </button>
      </nav>

      {active_tab === "home" && (
        <>
          <JournalEntryForm onSuccess={() => setRefreshToken((t) => t + 1)} />
          <hr style={{ margin: "32px 0" }} />
          <JournalEntryList refresh_token={refresh_token} />
        </>
      )}

      {active_tab === "budget" && <BudgetSettings />}
    </main>
  );
}
