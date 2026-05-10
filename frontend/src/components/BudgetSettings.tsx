import { useEffect, useState } from "react";
import { api } from "../api/client";
import { T } from "../theme";

function getDaysInCurrentMonthJst(): number {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

const GOAL_AMOUNT_MAX = 200_000;
const MONTHLY_BUDGET_MIN = 10_000;
const MONTHLY_BUDGET_MAX = 500_000;

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

interface FieldProps { label: string; sub?: string; children: React.ReactNode; }

function Field({ label, sub, children }: FieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <label style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{label}</label>
        {sub && <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function BudgetSettings() {
  const [monthly_budget, setMonthlyBudget] = useState<number>(0);
  const [goal_text, setGoalText] = useState<string>("");
  const [goal_amount, setGoalAmount] = useState<number>(0);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  const days_in_month = getDaysInCurrentMonthJst();
  const daily_budget = monthly_budget > 0 ? Math.floor(monthly_budget / days_in_month) : 0;

  useEffect(() => {
    api.getBudgets()
      .then((data) => {
        setMonthlyBudget(data.monthly_budget ?? 0);
        setGoalText(data.goal_text ?? "");
        setGoalAmount(data.goal_amount ?? 0);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  function handleSaveClick() { setError(null); setSuccess(false); setConfirming(true); }

  async function handleConfirm() {
    setError(null);
    try {
      const data = await api.updateBudgets({
        monthly_budget: monthly_budget > 0 ? monthly_budget : null,
        goal_text: goal_text.trim() !== "" ? goal_text.trim() : null,
        goal_amount: goal_amount > 0 ? goal_amount : null,
      });
      setMonthlyBudget(data.monthly_budget ?? 0);
      setGoalText(data.goal_text ?? "");
      setGoalAmount(data.goal_amount ?? 0);
      setConfirming(false);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  }

  if (loading) {
    return <p style={{ color: T.inkSoft }}>読み込み中...</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif", fontSize: 30, fontWeight: 900, color: T.ink, letterSpacing: "-0.01em" }}>
          今月の目標
        </h1>
        <p style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>無理せず続けられるラインを決めましょう</p>
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        {/* Savings goal card */}
        <div style={{ flex: 1, background: T.card, borderRadius: 28, padding: 28, boxShadow: T.cardShadow }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: "#FFE8DD", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>💰</div>
            <div>
              <div style={{ fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif", fontSize: 16, fontWeight: 700 }}>貯金目標</div>
              <div style={{ fontSize: 12, color: T.inkSoft }}>叶えたいことを書いておこう</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="貯金の目的">
              <input
                type="text"
                value={goal_text}
                maxLength={200}
                onChange={(e) => { setGoalText(e.target.value); setSuccess(false); }}
                placeholder="例）来年の引越し資金"
              />
            </Field>

            <Field label="毎月の貯金目標" sub={yen(goal_amount)}>
              <input
                type="range" min={0} max={GOAL_AMOUNT_MAX} step={1000}
                value={goal_amount}
                onChange={(e) => { setGoalAmount(Number(e.target.value)); setSuccess(false); }}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.inkSoft }}>
                <span>¥0</span><span>{yen(GOAL_AMOUNT_MAX)}</span>
              </div>
            </Field>
          </div>
        </div>

        {/* Monthly budget card */}
        <div style={{ flex: 1, background: T.card, borderRadius: 28, padding: 28, boxShadow: T.cardShadow, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -40, top: -40, width: 180, height: 180, borderRadius: "50%", background: T.mustard, opacity: 0.12 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, position: "relative" }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: "#FFF1CC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🌞</div>
            <div>
              <div style={{ fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif", fontSize: 16, fontWeight: 700 }}>変動費の月次予算</div>
              <div style={{ fontSize: 12, color: T.inkSoft }}>食費・日用品など変動するもの合計</div>
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 52, letterSpacing: "-0.03em", color: T.ink, lineHeight: 1 }}>
                {monthly_budget > 0 ? monthly_budget.toLocaleString() : "—"}
              </span>
              <span style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontSize: 18, fontWeight: 700, color: T.ink }}>円</span>
            </div>

            <input
              type="range"
              min={MONTHLY_BUDGET_MIN} max={MONTHLY_BUDGET_MAX} step={1000}
              value={monthly_budget > 0 ? monthly_budget : MONTHLY_BUDGET_MIN}
              onChange={(e) => { setMonthlyBudget(Number(e.target.value)); setSuccess(false); }}
              style={{ width: "100%", marginBottom: 6 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.inkSoft, marginBottom: 20 }}>
              <span>{yen(MONTHLY_BUDGET_MIN)}</span><span>{yen(MONTHLY_BUDGET_MAX)}</span>
            </div>

            <div style={{ height: 1, background: T.hair, marginBottom: 20 }} />

            <div>
              <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 6 }}>1日あたり利用可能額</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 32, color: T.coralDeep }}>
                  {daily_budget > 0 ? yen(daily_budget) : "—"}
                </span>
                {daily_budget > 0 && (
                  <span style={{ fontSize: 12, color: T.inkSoft }}>
                    = {yen(monthly_budget)} ÷ {days_in_month}日（自動計算）
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {success && (
        <p style={{ color: T.sageDeep, fontSize: 13, fontWeight: 600 }}>✓ 保存しました</p>
      )}
      {error && <p style={{ color: T.coralDeep, fontSize: 13 }}>{error}</p>}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSaveClick}
          style={{
            border: "none", background: T.coral, color: "#fff",
            padding: "13px 32px", borderRadius: 999, fontFamily: "inherit",
            fontWeight: 700, fontSize: 15, cursor: "pointer",
            boxShadow: `0 5px 0 ${T.coralDeep}`,
          }}
        >保存する</button>
      </div>

      {/* Confirmation modal */}
      {confirming && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(42,37,32,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: T.card, borderRadius: 28, padding: 32,
            maxWidth: 380, width: "90%",
            boxShadow: "0 24px 64px -16px rgba(80,40,10,0.3)",
          }}>
            <h3 style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", color: T.ink, margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>
              この内容で保存しますか？
            </h3>
            <div style={{ color: T.inkSoft, fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
              <div>貯金の目的: {goal_text.trim() || "（未設定）"}</div>
              <div>毎月の貯金目標: {goal_amount > 0 ? yen(goal_amount) : "（未設定）"}</div>
              <div>月間予算（変動費）: {monthly_budget > 0 ? yen(monthly_budget) : "（未設定）"}</div>
            </div>
            {error && <p style={{ color: T.coralDeep, fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setConfirming(false); setError(null); }}
                style={{
                  background: "transparent", border: `1.5px solid ${T.hair}`,
                  borderRadius: 999, color: T.inkSoft, padding: "10px 22px",
                  fontSize: 14, cursor: "pointer",
                }}
              >キャンセル</button>
              <button
                onClick={handleConfirm}
                style={{
                  border: "none", background: T.coral, color: "#fff",
                  borderRadius: 999, padding: "10px 22px",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  boxShadow: `0 4px 0 ${T.coralDeep}`,
                }}
              >確定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
