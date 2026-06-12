import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";

type SavingsGoal = components["schemas"]["SavingsGoal"];

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

interface Props {
  onBack: () => void;
}

// Form state for create / edit. id=null means "create mode".
interface GoalFormState {
  id: number | null;
  name: string;
  emoji: string;
  monthly_amount_yen: string;
  target_amount_yen: string;
  deadline: string;
  memo: string;
}

function blank_goal_form(): GoalFormState {
  return {
    id: null,
    name: "",
    emoji: "",
    monthly_amount_yen: "",
    target_amount_yen: "0",
    deadline: "",
    memo: "",
  };
}

function goal_to_form(g: SavingsGoal): GoalFormState {
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    monthly_amount_yen: String(g.monthly_amount),
    target_amount_yen: String(g.target_amount),
    deadline: g.deadline ?? "",
    memo: g.memo ?? "",
  };
}

export function WebSavings({ onBack }: Props) {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const ym = currentMonthJST();

  // goal_form=null means the form is hidden
  const [goal_form, setGoalForm] = useState<GoalFormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form_error_msg, setFormErrorMsg] = useState("");

  const refresh_goals = async () => {
    const res = await api.listSavingsGoals();
    setGoals(res.savings_goals);
  };

  useEffect(() => {
    let cancelled = false;
    api
      .listSavingsGoals()
      .then((res) => {
        if (!cancelled) setGoals(res.savings_goals);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const monthly_total = goals.reduce((s, g) => s + g.monthly_amount, 0);

  const handle_delete = async (id: number) => {
    if (!window.confirm("この貯金目標を削除しますか？")) return;
    await api.deleteSavingsGoal(id).catch(() => {});
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const open_create_form = () => {
    setGoalForm(blank_goal_form());
    setFormErrorMsg("");
  };

  const open_edit_form = (g: SavingsGoal) => {
    setGoalForm(goal_to_form(g));
    setFormErrorMsg("");
  };

  const handle_goal_submit = async () => {
    if (!goal_form) return;
    setFormErrorMsg("");

    if (!goal_form.name.trim()) {
      setFormErrorMsg("名前を入力してください");
      return;
    }
    if (!goal_form.emoji.trim()) {
      setFormErrorMsg("絵文字を入力してください");
      return;
    }

    const parsed_monthly = parseInt(goal_form.monthly_amount_yen, 10);
    if (isNaN(parsed_monthly) || parsed_monthly < 0) {
      setFormErrorMsg("毎月の積立額を正しく入力してください");
      return;
    }

    const parsed_target = parseInt(goal_form.target_amount_yen, 10);
    if (isNaN(parsed_target) || parsed_target < 0) {
      setFormErrorMsg("目標金額を正しく入力してください");
      return;
    }

    setSubmitting(true);
    try {
      const request_body: components["schemas"]["SavingsGoalRequest"] = {
        name: goal_form.name.trim(),
        emoji: goal_form.emoji.trim(),
        monthly_amount: parsed_monthly,
        target_amount: parsed_target,
        deadline: goal_form.deadline.trim() || null,
        memo: goal_form.memo.trim(),
      };

      if (goal_form.id !== null) {
        await api.updateSavingsGoal(goal_form.id, request_body);
      } else {
        await api.createSavingsGoal(request_body);
      }

      await refresh_goals();
      setGoalForm(null);
    } catch (err) {
      setFormErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  const input_style: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: `1.5px solid ${T.hair}`,
    borderRadius: 12,
    fontFamily: "inherit",
    fontSize: 14,
    color: T.ink,
    background: T.bgSoft,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: T.inkSoft,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            <span onClick={onBack} style={{ cursor: "pointer", color: T.coral }}>
              予算
            </span>
            <span style={{ opacity: 0.4 }}>›</span>
            <span style={{ color: T.ink }}>貯金目標</span>
          </div>
          <div
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: "-0.01em",
            }}
          >
            貯金目標
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>
            目的別に積み立てて、着実に前進
          </div>
        </div>
        <button
          onClick={open_create_form}
          style={{
            border: "none",
            background: T.coral,
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 999,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: `0 4px 0 ${T.coralDeep}`,
          }}
        >
          ＋ 貯金目標を追加
        </button>
      </div>

      {/* Inline create / edit form */}
      {goal_form && (
        <div
          style={{
            padding: "18px 20px",
            borderRadius: 20,
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
            {goal_form.id !== null ? "貯金目標を編集" : "貯金目標を追加"}
          </div>

          {/* Row 1: emoji + name */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: "0 0 80px" }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>絵文字</div>
              <input
                type="text"
                value={goal_form.emoji}
                onChange={(e) => setGoalForm((f) => f && { ...f, emoji: e.target.value })}
                placeholder="✈️"
                style={{ ...input_style, textAlign: "center", fontSize: 20 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>名前</div>
              <input
                type="text"
                value={goal_form.name}
                onChange={(e) => setGoalForm((f) => f && { ...f, name: e.target.value })}
                placeholder="旅行積立"
                style={input_style}
              />
            </div>
          </div>

          {/* Row 2: monthly amount + target amount */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>
                毎月の積立額（円）
              </div>
              <input
                type="number"
                min={0}
                value={goal_form.monthly_amount_yen}
                onChange={(e) =>
                  setGoalForm((f) => f && { ...f, monthly_amount_yen: e.target.value })
                }
                placeholder="20000"
                style={input_style}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>目標金額（円）</div>
              <input
                type="number"
                min={0}
                value={goal_form.target_amount_yen}
                onChange={(e) =>
                  setGoalForm((f) => f && { ...f, target_amount_yen: e.target.value })
                }
                placeholder="250000"
                style={input_style}
              />
            </div>
          </div>

          {/* Row 3: deadline + memo */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>
                期限（YYYY/MM、任意）
              </div>
              <input
                type="text"
                value={goal_form.deadline}
                onChange={(e) => setGoalForm((f) => f && { ...f, deadline: e.target.value })}
                placeholder="2027/03"
                style={input_style}
              />
            </div>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>メモ（任意）</div>
              <input
                type="text"
                value={goal_form.memo}
                onChange={(e) => setGoalForm((f) => f && { ...f, memo: e.target.value })}
                placeholder="北海道旅行：新幹線とホテル代"
                style={input_style}
              />
            </div>
          </div>

          {form_error_msg && (
            <div style={{ color: T.coralDeep, fontSize: 13, marginBottom: 10 }}>
              {form_error_msg}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handle_goal_submit}
              disabled={submitting}
              style={{
                border: "none",
                background: T.coral,
                color: "#fff",
                padding: "9px 20px",
                borderRadius: 999,
                fontFamily: "inherit",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: `0 3px 0 ${T.coralDeep}`,
              }}
            >
              {submitting ? "保存中…" : "保存"}
            </button>
            <button
              onClick={() => setGoalForm(null)}
              style={{
                border: `1px solid ${T.hair}`,
                background: "#fff",
                color: T.inkSoft,
                padding: "9px 20px",
                borderRadius: 999,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Summary hero */}
      <div
        style={{
          background: T.card,
          borderRadius: 32,
          padding: "22px 28px",
          boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
          display: "flex",
          alignItems: "center",
          gap: 32,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: T.inkSoft,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            今月の貯金合計
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 800,
                fontSize: 52,
                letterSpacing: "-0.04em",
                color: T.coral,
                lineHeight: 1,
              }}
            >
              {yen(monthly_total)}
            </span>
          </div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>毎月自動で記録されます</div>
        </div>
        <div style={{ width: 1, height: 64, background: T.hair }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {goals.map((g) => (
            <div
              key={g.id}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                background: T.bgSoft,
                border: `1px solid ${T.hair}`,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{g.emoji}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", color: T.inkSoft, fontSize: 12 }}>
                ¥{yenSlim(g.monthly_amount)}/月
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Goals grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        {goals.map((g) => {
          const pct =
            g.target_amount > 0
              ? Math.min(100, Math.round((g.accumulated_amount / g.target_amount) * 100))
              : 0;
          return (
            <div
              key={g.id}
              style={{
                background: T.card,
                borderRadius: 28,
                padding: 24,
                boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: "#FFF1CC",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 26,
                  }}
                >
                  {g.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{g.name}</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 5,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: "#FFF1CC",
                        color: "#A3791F",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      ¥{yenSlim(g.monthly_amount)}/月
                    </span>
                    {g.is_posted_this_month ? (
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "#DEF1E6",
                          color: T.sageDeep,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        ✅ 今月済
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "#FFF1CC",
                          color: "#A3791F",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        ⏳ 今月待ち
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <span
                    onClick={() => open_edit_form(g)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: T.bgSoft,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      color: T.inkSoft,
                      cursor: "pointer",
                    }}
                  >
                    ✎
                  </span>
                  <span
                    onClick={() => handle_delete(g.id)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: T.bgSoft,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      color: T.inkSoft,
                      cursor: "pointer",
                    }}
                  >
                    🗑
                  </span>
                </div>
              </div>

              {g.memo && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: T.bgSoft,
                    fontSize: 13,
                    color: T.inkSoft,
                    lineHeight: 1.5,
                  }}
                >
                  💭 {g.memo}
                </div>
              )}

              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 16,
                  background: T.bgSoft,
                  border: `1.5px solid ${T.hair}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>積立累計</span>
                  <span style={{ fontSize: 11, color: T.inkSoft }}>
                    目標{" "}
                    <strong style={{ fontFamily: "'DM Sans', sans-serif", color: T.ink }}>
                      ¥{yenSlim(g.target_amount)}
                    </strong>
                    {g.deadline ? ` / ${g.deadline}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 22,
                      color: "#A3791F",
                    }}
                  >
                    ¥{yenSlim(g.accumulated_amount)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: T.inkSoft,
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 600,
                    }}
                  >
                    / {pct}%
                  </span>
                </div>
                <div
                  style={{ height: 8, background: "#fff", borderRadius: 999, overflow: "hidden" }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: `linear-gradient(90deg,${T.mustard},${T.coral})`,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>

              {!g.is_posted_this_month && (
                <button
                  onClick={() =>
                    api
                      .postMonthlySavings(g.id, g.monthly_amount, ym)
                      .then(() => api.listSavingsGoals().then((r) => setGoals(r.savings_goals)))
                      .catch(() => {})
                  }
                  style={{
                    border: "none",
                    background: T.mustard,
                    color: T.ink,
                    padding: "10px",
                    borderRadius: 12,
                    fontFamily: "inherit",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow: "0 3px 0 #F0A92E",
                  }}
                >
                  今月分を記録する
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
