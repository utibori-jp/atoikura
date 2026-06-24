import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";
import { EmojiPicker } from "../EmojiPicker";
import { useEntityForm, FormField, AmountField, FormError, FormActions } from "../forms";

type SavingsGoal = components["schemas"]["SavingsGoal"];

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

// Fixed emoji choices for savings goals; the first is the pre-filled default.
// Mirrors MobileSavings so both viewports offer the same set (#107).
const SAVINGS_EMOJI_OPTIONS = ["📷", "✈️", "🏠", "💻", "🛟", "🎁"];
const DEFAULT_SAVINGS_EMOJI = SAVINGS_EMOJI_OPTIONS[0];

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
    emoji: DEFAULT_SAVINGS_EMOJI,
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

  const goal_form = useEntityForm<GoalFormState, SavingsGoal>({
    blank: blank_goal_form,
    fromEntity: goal_to_form,
    validate: (f) => {
      if (!f.name.trim()) return "名前を入力してください";
      const parsed_monthly = parseInt(f.monthly_amount_yen, 10);
      if (isNaN(parsed_monthly) || parsed_monthly < 0)
        return "毎月の積立額を正しく入力してください";
      const parsed_target = parseInt(f.target_amount_yen, 10);
      if (isNaN(parsed_target) || parsed_target < 0) return "目標金額を正しく入力してください";
      return null;
    },
    onSubmit: async (f) => {
      const request_body: components["schemas"]["SavingsGoalRequest"] = {
        name: f.name.trim(),
        emoji: f.emoji.trim() || DEFAULT_SAVINGS_EMOJI,
        monthly_amount: parseInt(f.monthly_amount_yen, 10),
        target_amount: parseInt(f.target_amount_yen, 10),
        deadline: f.deadline.trim() || null,
        memo: f.memo.trim(),
      };
      if (f.id !== null) {
        await api.updateSavingsGoal(f.id, request_body);
      } else {
        await api.createSavingsGoal(request_body);
      }
      await refresh_goals();
    },
  });

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
          onClick={goal_form.openCreate}
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
      {goal_form.form && (
        <div
          style={{
            padding: "18px 20px",
            borderRadius: 20,
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
            {goal_form.isEdit ? "貯金目標を編集" : "貯金目標を追加"}
          </div>

          {/* Row 1: emoji + name */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: "0 0 80px" }}>
              <FormField
                label="絵文字"
                value={goal_form.form.emoji}
                onChange={(v) => goal_form.setField("emoji", v)}
                placeholder="📷"
                style={{ textAlign: "center", fontSize: 20 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <FormField
                label="名前"
                value={goal_form.form.name}
                onChange={(v) => goal_form.setField("name", v)}
                placeholder="旅行積立"
              />
            </div>
          </div>

          {/* Quick emoji picker */}
          <div style={{ marginBottom: 12 }}>
            <EmojiPicker
              value={goal_form.form.emoji}
              onSelect={(emoji) => goal_form.setField("emoji", emoji)}
              options={SAVINGS_EMOJI_OPTIONS}
              accent={T.mustard}
              accentSoft={T.mustardSoft}
            />
          </div>

          {/* Row 2: monthly amount + target amount */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <AmountField
                label="毎月の積立額（円）"
                value={goal_form.form.monthly_amount_yen}
                onChange={(v) => goal_form.setField("monthly_amount_yen", v)}
                placeholder="20000"
              />
            </div>
            <div style={{ flex: 1 }}>
              <AmountField
                label="目標金額（円）"
                value={goal_form.form.target_amount_yen}
                onChange={(v) => goal_form.setField("target_amount_yen", v)}
                placeholder="250000"
              />
            </div>
          </div>

          {/* Row 3: deadline + memo */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <FormField
                label="期限（YYYY/MM、任意）"
                value={goal_form.form.deadline}
                onChange={(v) => goal_form.setField("deadline", v)}
                placeholder="2027/03"
              />
            </div>
            <div style={{ flex: 2 }}>
              <FormField
                label="メモ（任意）"
                value={goal_form.form.memo}
                onChange={(v) => goal_form.setField("memo", v)}
                placeholder="北海道旅行：新幹線とホテル代"
              />
            </div>
          </div>

          <FormError message={goal_form.error} />

          <FormActions
            onSubmit={goal_form.submit}
            onCancel={goal_form.close}
            submitting={goal_form.submitting}
          />
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
                    onClick={() => goal_form.openEdit(g)}
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
