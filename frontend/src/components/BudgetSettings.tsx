import { useEffect, useState } from "react";
import { api } from "../api/client";

function getDaysInCurrentMonthJst(): number {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
  );
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

const GOAL_AMOUNT_MAX = 200_000;
const MONTHLY_BUDGET_MIN = 10_000;
const MONTHLY_BUDGET_MAX = 500_000;

export function BudgetSettings() {
  const [monthly_budget, setMonthlyBudget] = useState<number>(0);
  const [goal_text, setGoalText] = useState<string>("");
  const [goal_amount, setGoalAmount] = useState<number>(0);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  const days_in_month = getDaysInCurrentMonthJst();
  const daily_budget =
    monthly_budget > 0 ? Math.floor(monthly_budget / days_in_month) : 0;

  useEffect(() => {
    api
      .getBudgets()
      .then((data) => {
        setMonthlyBudget(data.monthly_budget ?? 0);
        setGoalText(data.goal_text ?? "");
        setGoalAmount(data.goal_amount ?? 0);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      })
      .finally(() => setLoading(false));
  }, []);

  function handleSaveClick() {
    setError(null);
    setSuccess(false);
    setConfirming(true);
  }

  async function handleConfirm() {
    setError(null);
    try {
      const body = {
        monthly_budget: monthly_budget > 0 ? monthly_budget : null,
        goal_text: goal_text.trim() !== "" ? goal_text.trim() : null,
        goal_amount: goal_amount > 0 ? goal_amount : null,
      };
      const data = await api.updateBudgets(body);
      setMonthlyBudget(data.monthly_budget ?? 0);
      setGoalText(data.goal_text ?? "");
      setGoalAmount(data.goal_amount ?? 0);
      setConfirming(false);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  }

  function handleCancel() {
    setConfirming(false);
    setError(null);
  }

  if (loading) {
    return <p style={{ padding: 24, color: "#aaa" }}>読み込み中...</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Settings card */}
      <div
        style={{
          background: "#1a1a1a",
          borderRadius: 12,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#ccc",
          }}
        >
          <span>⚙</span>
          <span style={{ fontWeight: 600 }}>設定</span>
        </div>

        {/* goal_text */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ color: "#ccc", fontSize: 14 }}>貯金の目的</label>
          <input
            type="text"
            value={goal_text}
            maxLength={200}
            onChange={(e) => {
              setGoalText(e.target.value);
              setSuccess(false);
            }}
            style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 8,
              color: "#fff",
              padding: "10px 14px",
              fontSize: 14,
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
            placeholder="例）来年の引越し資金"
          />
        </div>

        {/* goal_amount */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <label style={{ color: "#ccc", fontSize: 14 }}>
              毎月の貯金目標
            </label>
            <span style={{ color: "#fff", fontWeight: 600 }}>
              ¥{goal_amount.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={GOAL_AMOUNT_MAX}
            step={1000}
            value={goal_amount}
            onChange={(e) => {
              setGoalAmount(Number(e.target.value));
              setSuccess(false);
            }}
            style={{ width: "100%", accentColor: "#4ade80" }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "#666",
              fontSize: 12,
            }}
          >
            <span>¥0</span>
            <span>¥{GOAL_AMOUNT_MAX.toLocaleString()}</span>
          </div>
        </div>

        {/* monthly_budget */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <label style={{ color: "#ccc", fontSize: 14 }}>
              月間予算（変動費）
            </label>
            <span style={{ color: "#fff", fontWeight: 600 }}>
              ¥{monthly_budget.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={MONTHLY_BUDGET_MIN}
            max={MONTHLY_BUDGET_MAX}
            step={1000}
            value={monthly_budget > 0 ? monthly_budget : MONTHLY_BUDGET_MIN}
            onChange={(e) => {
              setMonthlyBudget(Number(e.target.value));
              setSuccess(false);
            }}
            style={{ width: "100%", accentColor: "#4ade80" }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "#666",
              fontSize: 12,
            }}
          >
            <span>¥{MONTHLY_BUDGET_MIN.toLocaleString()}</span>
            <span>¥{MONTHLY_BUDGET_MAX.toLocaleString()}</span>
          </div>
        </div>

        <button
          onClick={handleSaveClick}
          style={{
            background: "#4ade80",
            color: "#000",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            alignSelf: "flex-end",
          }}
        >
          保存
        </button>

        {success && (
          <p style={{ color: "#4ade80", fontSize: 13, margin: 0 }}>
            保存しました
          </p>
        )}
      </div>

      {/* Daily budget card */}
      <div
        style={{
          background: "#1a1000",
          border: "1px solid #b45309",
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ color: "#d97706", fontSize: 13, marginBottom: 16 }}>
          ⊙ 1日あたり利用可能額
        </div>
        <div
          style={{
            color: "#f59e0b",
            fontSize: 48,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          {daily_budget > 0 ? `¥${daily_budget.toLocaleString()}` : "—"}
        </div>
        {daily_budget > 0 && (
          <div style={{ color: "#92400e", fontSize: 13 }}>
            ¥{monthly_budget.toLocaleString()} ÷ {days_in_month}日
          </div>
        )}
      </div>

      {/* Confirmation popup */}
      {confirming && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: 12,
              padding: 32,
              maxWidth: 360,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>
              この内容で保存しますか？
            </h3>
            <div style={{ color: "#aaa", fontSize: 13, lineHeight: 1.6 }}>
              <div>貯金の目的: {goal_text.trim() || "（未設定）"}</div>
              <div>
                毎月の貯金目標:{" "}
                {goal_amount > 0
                  ? `¥${goal_amount.toLocaleString()}`
                  : "（未設定）"}
              </div>
              <div>
                月間予算（変動費）:{" "}
                {monthly_budget > 0
                  ? `¥${monthly_budget.toLocaleString()}`
                  : "（未設定）"}
              </div>
            </div>
            {error && (
              <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>
                {error}
              </p>
            )}
            <div
              style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
            >
              <button
                onClick={handleCancel}
                style={{
                  background: "transparent",
                  border: "1px solid #444",
                  borderRadius: 8,
                  color: "#aaa",
                  padding: "8px 20px",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  background: "#4ade80",
                  border: "none",
                  borderRadius: 8,
                  color: "#000",
                  padding: "8px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
