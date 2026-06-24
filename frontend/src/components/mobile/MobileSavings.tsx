import { useEffect, useState } from "react";
import { T } from "../../theme";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { useEntityForm, type UseEntityForm } from "../forms";

type SavingsGoal = components["schemas"]["SavingsGoal"];

interface MobileSavingsProps {
  onBack: () => void;
}

const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

const EMOJI_OPTIONS = ["📷", "✈️", "🏠", "💻", "🛟", "🎁"];

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

// Form state for create / edit. goal_id=null means "create mode".
interface GoalFormState {
  goal_id: number | null;
  name: string;
  emoji: string;
  monthly_amount_yen: string;
  target_amount_yen: string;
  deadline: string;
  memo: string;
}

function blank_goal_form(): GoalFormState {
  return {
    goal_id: null,
    name: "",
    emoji: EMOJI_OPTIONS[0],
    monthly_amount_yen: "",
    target_amount_yen: "0",
    deadline: "",
    memo: "",
  };
}

function goal_to_form(g: SavingsGoal): GoalFormState {
  return {
    goal_id: g.id,
    name: g.name,
    emoji: g.emoji,
    monthly_amount_yen: String(g.monthly_amount),
    target_amount_yen: String(g.target_amount),
    deadline: g.deadline ?? "",
    memo: g.memo ?? "",
  };
}

interface MobileSavingsSheetProps {
  goal_form: UseEntityForm<GoalFormState, SavingsGoal>;
}

export function MobileSavingsSheet({ goal_form }: MobileSavingsSheetProps) {
  const form = goal_form.form;
  if (!form) return null;

  const is_edit_mode = goal_form.isEdit;
  const on_close = goal_form.close;

  const input_style: React.CSSProperties = {
    width: "100%",
    padding: "11px 13px",
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
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(42,37,32,0.45)" }}
      onClick={on_close}
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
        {/* Drag handle */}
        <div
          style={{
            width: 42,
            height: 5,
            borderRadius: 999,
            background: T.hair,
            margin: "0 auto 14px",
          }}
        />

        {/* Sheet header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 19, fontWeight: 900 }}>
            {is_edit_mode ? "貯金目標を編集" : "貯金目標を追加"}
          </div>
          <button
            type="button"
            onClick={on_close}
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

        {/* 目標名 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>目標名</div>
          <input
            type="text"
            value={form.name}
            onChange={(e) => goal_form.setField("name", e.target.value)}
            placeholder="例：新しいカメラ"
            style={input_style}
          />
        </div>

        {/* アイコン選択 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            padding: "12px 14px",
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 11, color: T.inkSoft }}>アイコン</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {EMOJI_OPTIONS.map((emoji_opt) => (
              <button
                key={emoji_opt}
                type="button"
                onClick={() => goal_form.setField("emoji", emoji_opt)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: form.emoji === emoji_opt ? T.mustardSoft : "#fff",
                  border: `1.5px solid ${form.emoji === emoji_opt ? T.mustard : T.hair}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                  cursor: "pointer",
                }}
              >
                {emoji_opt}
              </button>
            ))}
          </div>
        </div>

        {/* 毎月の積立額 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>毎月の積立額（円）</div>
          <div
            style={{
              background: T.bgSoft,
              border: `1.5px solid ${T.mustard}`,
              borderRadius: 18,
              padding: "8px 18px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 28,
                color: T.mustardDeep,
              }}
            >
              ¥
            </span>
            <input
              type="number"
              min={0}
              value={form.monthly_amount_yen}
              onChange={(e) => goal_form.setField("monthly_amount_yen", e.target.value)}
              placeholder="20000"
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 28,
                color: T.ink,
                outline: "none",
                padding: 0,
              }}
            />
          </div>
        </div>

        {/* 目標金額 + 目標日 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>目標金額（任意）</div>
            <input
              type="number"
              min={0}
              value={form.target_amount_yen}
              onChange={(e) => goal_form.setField("target_amount_yen", e.target.value)}
              placeholder="250000"
              style={input_style}
            />
          </div>
          <div style={{ flex: "0 0 138px" }}>
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>目標日（任意）</div>
            <input
              type="text"
              value={form.deadline}
              onChange={(e) => goal_form.setField("deadline", e.target.value)}
              placeholder="YYYY/MM"
              style={input_style}
            />
          </div>
        </div>

        {/* メモ */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>メモ（任意）</div>
          <textarea
            value={form.memo}
            onChange={(e) => goal_form.setField("memo", e.target.value)}
            placeholder="例：旅行記録用に。レンズ込みで揃えたい。"
            rows={3}
            style={{
              ...input_style,
              resize: "none",
              lineHeight: 1.5,
            }}
          />
        </div>

        {goal_form.error && (
          <div style={{ color: T.coralDeep, fontSize: 13, marginBottom: 12 }}>
            {goal_form.error}
          </div>
        )}

        <button
          type="button"
          onClick={goal_form.submit}
          disabled={goal_form.submitting}
          style={{
            width: "100%",
            border: "none",
            background: T.coral,
            color: "#fff",
            padding: "16px",
            borderRadius: 18,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 16,
            boxShadow: `0 6px 0 ${T.coralDeep}`,
            cursor: goal_form.submitting ? "not-allowed" : "pointer",
            opacity: goal_form.submitting ? 0.7 : 1,
          }}
        >
          {goal_form.submitting ? "保存中…" : "保存する"}
        </button>
      </div>
    </div>
  );
}

export function MobileSavings({ onBack }: MobileSavingsProps) {
  const [savings_goals, setSavingsGoals] = useState<SavingsGoal[] | null>(null);
  const ym = currentMonthJST();

  const refresh_goals = async () => {
    const res = await api.listSavingsGoals();
    setSavingsGoals(res.savings_goals);
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
        emoji: f.emoji.trim() || EMOJI_OPTIONS[0],
        monthly_amount: parseInt(f.monthly_amount_yen, 10),
        target_amount: parseInt(f.target_amount_yen, 10),
        deadline: f.deadline.trim() || null,
        memo: f.memo.trim(),
      };
      if (f.goal_id !== null) {
        await api.updateSavingsGoal(f.goal_id, request_body);
      } else {
        await api.createSavingsGoal(request_body);
      }
      await refresh_goals();
    },
  });

  useEffect(() => {
    let cancelled = false;
    api
      .listSavingsGoals()
      .then((res) => {
        if (!cancelled) setSavingsGoals(res.savings_goals);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const is_loading = savings_goals === null;
  const savings_monthly_total = savings_goals?.reduce((sum, g) => sum + g.monthly_amount, 0) ?? 0;

  const handle_delete = async (goal_id: number) => {
    if (!window.confirm("この貯金目標を削除しますか？")) return;
    await api.deleteSavingsGoal(goal_id).catch(() => {});
    setSavingsGoals((prev) => (prev ? prev.filter((g) => g.id !== goal_id) : prev));
  };

  const handle_post_monthly = async (g: SavingsGoal) => {
    await api.postMonthlySavings(g.id, g.monthly_amount, ym).catch(() => {});
    await refresh_goals();
  };

  return (
    <div>
      {/* Back button row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: T.inkSoft,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: "8px 4px",
            display: "flex",
            alignItems: "center",
            gap: 3,
            fontFamily: "inherit",
          }}
        >
          ‹ 予算
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: T.ink }}>貯金目標</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>目的別に積み上げる</div>
      </div>

      {is_loading && (
        <p style={{ color: T.inkSoft, fontSize: 14, textAlign: "center" }}>読み込み中…</p>
      )}

      {!is_loading && savings_goals && (
        <>
          {/* Hero card */}
          <div
            style={{
              background: T.card,
              borderRadius: 28,
              padding: "22px 20px",
              boxShadow: "0 0 0 1px rgba(80,40,10,0.05), 0 6px 32px rgba(80,40,10,0.09)",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: T.inkSoft,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              今月の貯金合計
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: 40,
                  letterSpacing: "-0.04em",
                  color: T.coral,
                  lineHeight: 1,
                }}
              >
                ¥{yenSlim(savings_monthly_total)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 5, fontWeight: 500 }}>
              毎月自動で記録されます
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
              {savings_goals.map((g) => (
                <span
                  key={g.id}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: T.bgSoft,
                    border: `1px solid ${T.hair}`,
                    color: T.ink,
                    fontSize: 10,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 11 }}>{g.emoji}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", color: T.inkSoft }}>
                    {yenSlim(g.monthly_amount / 1000)}k
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Goal list header */}
          <div style={{ display: "flex", alignItems: "center", margin: "0 2px 10px" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>目標一覧</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: T.inkSoft }}>
              {savings_goals.length}件
            </span>
          </div>

          {/* Goal cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {savings_goals.map((g) => {
              const progress_pct =
                g.target_amount > 0
                  ? Math.min(100, Math.round((g.accumulated_amount / g.target_amount) * 100))
                  : 0;
              return (
                <div
                  key={g.id}
                  style={{
                    background: T.card,
                    borderRadius: 28,
                    padding: "16px",
                    boxShadow: T.cardShadow,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        background: T.mustardSoft,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                      }}
                    >
                      {g.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: T.mustardSoft,
                            color: T.mustardDeep,
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          ¥{yenSlim(g.monthly_amount)}/月
                        </span>
                        {g.is_posted_this_month ? (
                          <span
                            style={{
                              padding: "3px 9px",
                              borderRadius: 999,
                              background: T.sageSoft,
                              color: T.sageDeep,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            ✅ 今月済
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: "3px 9px",
                              borderRadius: 999,
                              background: T.mustardSoft,
                              color: T.mustardDeep,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            ⏳ 今月分待ち
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => goal_form.openEdit(g)}
                        style={{
                          width: 30,
                          height: 30,
                          minWidth: 44,
                          minHeight: 44,
                          borderRadius: 8,
                          background: T.bgSoft,
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          color: T.inkSoft,
                          cursor: "pointer",
                        }}
                        aria-label="編集"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => handle_delete(g.id)}
                        style={{
                          width: 30,
                          height: 30,
                          minWidth: 44,
                          minHeight: 44,
                          borderRadius: 8,
                          background: T.bgSoft,
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          color: T.inkSoft,
                          cursor: "pointer",
                        }}
                        aria-label="削除"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {g.memo && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "9px 12px",
                        borderRadius: 10,
                        background: T.bgSoft,
                        fontSize: 12,
                        color: T.inkSoft,
                        lineHeight: 1.5,
                      }}
                    >
                      💭 {g.memo}
                    </div>
                  )}

                  {/* Progress */}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.hair}` }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>
                        積立累計
                      </span>
                      <span style={{ fontSize: 11, color: T.inkSoft }}>
                        目標{" "}
                        <strong style={{ fontFamily: "'DM Sans', sans-serif", color: T.ink }}>
                          ¥{yenSlim(g.target_amount)}
                        </strong>
                        {g.deadline ? ` / ${g.deadline}` : ""}
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 7 }}
                    >
                      <span
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 700,
                          fontSize: 20,
                          color: T.mustardDeep,
                        }}
                      >
                        ¥{yenSlim(g.accumulated_amount)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: T.inkSoft,
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 600,
                        }}
                      >
                        / {progress_pct}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 7,
                        background: T.bgSoft,
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${progress_pct}%`,
                          background: `linear-gradient(90deg, ${T.mustard}, ${T.coral})`,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </div>

                  {/* Post-monthly button — only shown when not yet posted */}
                  {!g.is_posted_this_month && (
                    <button
                      type="button"
                      onClick={() => handle_post_monthly(g)}
                      style={{
                        marginTop: 12,
                        width: "100%",
                        border: "none",
                        background: T.mustard,
                        color: T.ink,
                        padding: "10px",
                        borderRadius: 12,
                        fontFamily: "inherit",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        boxShadow: `0 3px 0 ${T.mustardDeep}`,
                      }}
                    >
                      今月分を記録する
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={goal_form.openCreate}
        style={{
          width: "100%",
          marginTop: 16,
          border: `1.5px dashed ${T.coral}`,
          background: "transparent",
          color: T.coralDeep,
          padding: "15px",
          borderRadius: 16,
          fontFamily: "inherit",
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        ＋ 貯金目標を追加
      </button>

      {goal_form.form && <MobileSavingsSheet goal_form={goal_form} />}
    </div>
  );
}
