import { useEffect, useState } from "react";
import { T } from "../../theme";
import { api } from "../../api/client";
import type { components } from "../../api/types";

type IncomeRecord = components["schemas"]["IncomeRecord"];
type BaseIncomeSetting = components["schemas"]["BaseIncomeSetting"];
type SavingsGoal = components["schemas"]["SavingsGoal"];
type SurplusAllocation = components["schemas"]["SurplusAllocation"];

interface MobileIncomeProps {
  onBack: () => void;
}

type ActiveSheet = null | "income" | "allocate" | "edit-base";

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

const INCOME_TYPES: Record<string, { label: string; bg: string; fg: string }> = {
  salary: { label: "給与", bg: T.sageSoft, fg: T.sageDeep },
  side: { label: "副業", bg: "#E5EEF7", fg: "#3F6B91" },
  bonus: { label: "ボーナス", bg: T.mustardSoft, fg: T.mustardDeep },
  oneoff: { label: "一時収入", bg: T.coralSoft, fg: T.coralDeep },
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const EMOJI_OPTIONS = ["🏢", "💼", "📈", "💰", "🎁", "⭐"];

type IncomeType = "salary" | "side" | "bonus" | "oneoff";

function formatDateParts(date_str: string): { day: number; month: number; weekday: string } {
  const [y, m, d] = date_str.split("-").map(Number);
  return { day: d, month: m, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] };
}

// Form state for create / edit. editing_id=null means create mode.
interface IncomeFormState {
  editing_id: number | null;
  name: string;
  emoji: string;
  amount_yen: string;
  transaction_date: string;
  income_type: IncomeType;
  note: string;
}

function blank_income_form(default_date: string): IncomeFormState {
  return {
    editing_id: null,
    name: "",
    emoji: "🏢",
    amount_yen: "",
    transaction_date: default_date,
    income_type: "salary",
    note: "",
  };
}

function income_record_to_form(record: IncomeRecord): IncomeFormState {
  return {
    editing_id: record.id,
    name: record.name,
    emoji: record.emoji,
    amount_yen: String(record.amount),
    transaction_date: record.transaction_date,
    income_type: record.income_type,
    note: record.note ?? "",
  };
}

// ── Sheets ──────────────────────────────────────────────────────────────

interface IncomeSheetProps {
  initial_form: IncomeFormState;
  onClose: () => void;
  onSaved: () => void;
}

export function MobileIncomeSheet({ initial_form, onClose, onSaved }: IncomeSheetProps) {
  const [form, setForm] = useState<IncomeFormState>(initial_form);
  const [submitting, setSubmitting] = useState(false);
  const [error_msg, setErrorMsg] = useState("");

  const handle_submit = async () => {
    setErrorMsg("");

    if (!form.name.trim()) {
      setErrorMsg("収入名を入力してください");
      return;
    }
    const parsed_amount = parseInt(form.amount_yen, 10);
    if (isNaN(parsed_amount) || parsed_amount < 1) {
      setErrorMsg("金額を正しく入力してください");
      return;
    }
    if (!form.transaction_date) {
      setErrorMsg("日付を入力してください");
      return;
    }

    setSubmitting(true);
    try {
      const request_body: components["schemas"]["IncomeRecordRequest"] = {
        name: form.name.trim(),
        emoji: form.emoji.trim() || EMOJI_OPTIONS[0],
        amount: parsed_amount,
        transaction_date: form.transaction_date,
        income_type: form.income_type,
        note: form.note.trim() || undefined,
      };

      if (form.editing_id !== null) {
        await api.updateIncomeRecord(form.editing_id, request_body);
      } else {
        await api.createIncomeRecord(request_body);
      }

      onSaved();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
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
    background: "transparent",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(42,37,32,0.45)" }}
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
          <div style={{ fontSize: 19, fontWeight: 900 }}>
            {form.editing_id !== null ? "収入を編集" : "収入を記録"}
          </div>
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

        {/* Amount */}
        <div
          style={{
            background: T.bgSoft,
            border: `1.5px solid ${T.sage}`,
            borderRadius: 18,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 30,
              color: T.sageDeep,
            }}
          >
            ¥
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={form.amount_yen}
            onChange={(e) => setForm((f) => ({ ...f, amount_yen: e.target.value }))}
            placeholder="例: 280000"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 30,
              color: T.ink,
              outline: "none",
              minWidth: 0,
            }}
          />
          <span style={{ fontSize: 12, color: T.inkSoft }}>金額</span>
        </div>

        {/* 収入名 + 日付 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div
            style={{
              flex: 1,
              background: T.bgSoft,
              border: `1.5px solid ${T.hair}`,
              borderRadius: 14,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>収入名</div>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例：ライティング案件"
              style={{ ...input_style, padding: "0", border: "none", fontSize: 14 }}
            />
          </div>
          <div
            style={{
              flex: "0 0 116px",
              background: T.bgSoft,
              border: `1.5px solid ${T.hair}`,
              borderRadius: 14,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>日付</div>
            <input
              type="date"
              value={form.transaction_date}
              onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
              style={{
                ...input_style,
                padding: "0",
                border: "none",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                width: "100%",
              }}
            />
          </div>
        </div>

        {/* 絵文字 */}
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>
          絵文字
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
          {EMOJI_OPTIONS.map((emoji_option) => (
            <button
              key={emoji_option}
              type="button"
              onClick={() => setForm((f) => ({ ...f, emoji: emoji_option }))}
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                border: `1.5px solid ${form.emoji === emoji_option ? T.sage : T.hair}`,
                background: form.emoji === emoji_option ? T.sageSoft : "#fff",
                fontSize: 18,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {emoji_option}
            </button>
          ))}
          <input
            type="text"
            value={form.emoji}
            onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
            placeholder="🏢"
            style={{
              flex: 1,
              padding: "8px 10px",
              border: `1.5px solid ${T.hair}`,
              borderRadius: 11,
              fontFamily: "inherit",
              fontSize: 18,
              color: T.ink,
              background: T.bgSoft,
              outline: "none",
              minWidth: 0,
            }}
          />
        </div>

        {/* 種別 */}
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>種別</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {(
            Object.entries(INCOME_TYPES) as [
              IncomeType,
              { label: string; bg: string; fg: string },
            ][]
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              onClick={() => setForm((f) => ({ ...f, income_type: k }))}
              style={{
                padding: "9px 14px",
                borderRadius: 999,
                border: `1.5px solid ${form.income_type === k ? t.fg : T.hair}`,
                background: form.income_type === k ? t.bg : "#fff",
                color: form.income_type === k ? t.fg : T.ink,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* メモ */}
        <div
          style={{
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 18,
            minHeight: 56,
          }}
        >
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>メモ（任意）</div>
          <textarea
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="例：フリーランスnote"
            rows={2}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 13,
              color: T.ink,
              outline: "none",
              resize: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {error_msg && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              borderRadius: 12,
              background: T.coralSoft,
              color: T.coralDeep,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {error_msg}
          </div>
        )}

        <button
          type="button"
          onClick={handle_submit}
          disabled={submitting}
          style={{
            width: "100%",
            border: "none",
            background: submitting ? T.inkSoft : T.coral,
            color: "#fff",
            padding: "16px",
            borderRadius: 18,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 16,
            boxShadow: submitting ? "none" : `0 6px 0 ${T.coralDeep}`,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "保存中…" : form.editing_id !== null ? "更新する" : "＋ 記録する"}
        </button>
      </div>
    </div>
  );
}

// ── MobileAllocateSheet ──────────────────────────────────────────────────────

interface AllocateSheetProps {
  onClose: () => void;
  unallocated: number;
  active_ym: string;
  savings_goals: SavingsGoal[];
  onAllocated: () => void;
}

export function MobileAllocateSheet({
  onClose,
  unallocated,
  active_ym,
  savings_goals,
  onAllocated,
}: AllocateSheetProps) {
  const [amount_yen, setAmountYen] = useState("");
  const [destination, setDestination] = useState<"savings" | "budget">("savings");
  const [selected_goal_id, setSelectedGoalId] = useState<number | null>(
    savings_goals.length > 0 ? savings_goals[0].id : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error_msg, setErrorMsg] = useState("");

  const parsed_amount = parseInt(amount_yen, 10);
  const amount_valid = !isNaN(parsed_amount) && parsed_amount > 0 && parsed_amount <= unallocated;
  const submit_disabled =
    submitting || !amount_valid || (destination === "savings" && selected_goal_id === null);

  const handle_quick_fill = (value: number) => {
    setAmountYen(String(value));
  };

  const handle_submit = async () => {
    setErrorMsg("");
    if (!amount_valid) {
      setErrorMsg("金額を正しく入力してください");
      return;
    }
    if (destination === "savings" && selected_goal_id === null) {
      setErrorMsg("貯金目標を選択してください");
      return;
    }
    setSubmitting(true);
    try {
      await api.createSurplusAllocation({
        year_month: active_ym,
        amount: parsed_amount,
        destination,
        ...(destination === "savings" && selected_goal_id !== null
          ? { savings_goal_id: selected_goal_id }
          : {}),
      });
      onAllocated();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(42,37,32,0.45)" }}
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
          <div style={{ fontSize: 19, fontWeight: 900 }}>余剰を振り分ける</div>
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

        {/* Amount input */}
        <div
          style={{
            background: T.bgSoft,
            border: `1.5px solid ${T.mustard}`,
            borderRadius: 18,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
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
            inputMode="numeric"
            value={amount_yen}
            onChange={(e) => setAmountYen(e.target.value)}
            placeholder="振り分け額"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 28,
              color: T.ink,
              outline: "none",
              minWidth: 0,
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>振り分け額</span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 10,
                color: T.mustardDeep,
                fontWeight: 700,
              }}
            >
              余剰 ¥{Math.round(unallocated).toLocaleString("ja-JP")}
            </span>
          </div>
        </div>

        {/* Quick-fill chips */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[
            { label: "全額", value: unallocated },
            { label: "½", value: Math.floor(unallocated / 2) },
            { label: "¥10,000", value: 10000 },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handle_quick_fill(chip.value)}
              style={{
                flex: 1,
                padding: "7px 0",
                textAlign: "center",
                borderRadius: 10,
                border: `1.5px solid ${String(chip.value) === amount_yen ? T.mustard : T.hair}`,
                background: String(chip.value) === amount_yen ? T.mustardSoft : "#fff",
                color: T.ink,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Destination selector */}
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>
          振り分け先
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {(
            [
              {
                id: "savings" as const,
                emoji: "💰",
                label: "貯金",
                sub: "貯金目標を選んで積立",
              },
              {
                id: "budget" as const,
                emoji: "📅",
                label: "今月の予算に追加",
                sub: "今月の変動費予算に上乗せ",
              },
            ] as const
          ).map((opt) => {
            const selected = destination === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDestination(opt.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 14px",
                  borderRadius: 16,
                  border: `1.5px solid ${selected ? T.coral : T.hair}`,
                  background: selected ? T.coralSoft : "#fff",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    background: selected ? "#fff" : T.bgSoft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {opt.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>{opt.sub}</div>
                </div>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    border: `2px solid ${selected ? T.coral : T.hair}`,
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {selected && (
                    <div
                      style={{ width: 10, height: 10, borderRadius: 999, background: T.coral }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Savings goal sub-selector */}
        {destination === "savings" && savings_goals.length > 0 && (
          <div
            style={{
              padding: "12px 14px 14px",
              borderRadius: 16,
              background: T.coralSoft,
              border: `1.5px dashed ${T.coral}`,
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
              <span style={{ color: T.coralDeep, fontSize: 14, fontWeight: 900 }}>↳</span>
              <span style={{ fontSize: 11, color: T.coralDeep, fontWeight: 700 }}>
                どの貯金目標に積み立てますか？
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {savings_goals.map((g) => {
                const sel = selected_goal_id === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGoalId(g.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "#fff",
                      border: `1.5px solid ${sel ? T.coral : "transparent"}`,
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        background: T.mustardSoft,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      {g.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                      <div
                        style={{
                          fontSize: 10,
                          color: T.inkSoft,
                          marginTop: 1,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        累計 ¥{Math.round(g.accumulated_amount).toLocaleString("ja-JP")} / ¥
                        {Math.round(g.target_amount).toLocaleString("ja-JP")}
                      </div>
                    </div>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        border: `2px solid ${sel ? T.coral : T.hair}`,
                        background: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {sel && (
                        <div
                          style={{ width: 8, height: 8, borderRadius: 999, background: T.coral }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error_msg && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              borderRadius: 12,
              background: T.coralSoft,
              color: T.coralDeep,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {error_msg}
          </div>
        )}

        <button
          type="button"
          onClick={handle_submit}
          disabled={submit_disabled}
          style={{
            width: "100%",
            border: "none",
            background: submit_disabled ? T.inkSoft : T.coral,
            color: "#fff",
            padding: "16px",
            borderRadius: 18,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 16,
            boxShadow: submit_disabled ? "none" : `0 6px 0 ${T.coralDeep}`,
            cursor: submit_disabled ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "振り分け中…" : "＋ 振り分ける"}
        </button>
      </div>
    </div>
  );
}

interface EditBaseSheetProps {
  onClose: () => void;
  base_amount: number;
  onSaved: (new_amount: number) => void;
}

export function MobileEditBaseSheet({ onClose, base_amount, onSaved }: EditBaseSheetProps) {
  const [draft_amount, setDraftAmount] = useState(String(base_amount));
  const [submitting, setSubmitting] = useState(false);
  const [error_msg, setErrorMsg] = useState("");

  const PRESETS = [
    { label: "先月", value: base_amount },
    { label: "3ヶ月平均", value: 291000 },
    { label: "半年平均", value: 286500 },
  ];

  const handle_save = async () => {
    setErrorMsg("");
    const parsed_amount = parseInt(draft_amount, 10);
    if (isNaN(parsed_amount) || parsed_amount < 1) {
      setErrorMsg("金額を正しく入力してください");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.updateBaseIncome(parsed_amount);
      onSaved(res.amount);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(42,37,32,0.45)" }}
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
          <div style={{ fontSize: 19, fontWeight: 900 }}>基準収入を編集</div>
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

        {/* Amount input */}
        <div
          style={{
            background: T.bgSoft,
            border: `1.5px solid ${T.sage}`,
            borderRadius: 18,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 34,
              color: T.sageDeep,
            }}
          >
            ¥
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={draft_amount}
            onChange={(e) => setDraftAmount(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 34,
              color: T.ink,
              letterSpacing: "-0.02em",
              outline: "none",
              minWidth: 0,
            }}
          />
          <span style={{ fontSize: 12, color: T.inkSoft }}>基準</span>
        </div>

        {/* Help */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 14,
            background: T.sageSoft,
            marginBottom: 18,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: 16, marginTop: 1 }}>💡</span>
          <div style={{ fontSize: 12, color: T.sageDeep, lineHeight: 1.6, fontWeight: 600 }}>
            毎月の見込み収入を入力します。
            <br />
            <span style={{ fontWeight: 500, opacity: 0.85 }}>
              給与など、毎月安定して入る金額を設定すると、上振れ分が「余剰金額」として表示されます。
            </span>
          </div>
        </div>

        {/* Presets */}
        <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>
          過去の平均から
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setDraftAmount(String(p.value))}
              style={{
                flex: 1,
                padding: "9px 8px",
                borderRadius: 12,
                border: `1.5px solid ${String(p.value) === draft_amount ? T.sage : T.hair}`,
                background: String(p.value) === draft_amount ? T.sageSoft : "#fff",
                textAlign: "center",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontSize: 10, color: T.inkSoft, fontWeight: 600 }}>{p.label}</div>
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  marginTop: 2,
                  color: i === 0 ? T.sageDeep : T.ink,
                }}
              >
                ¥{yenSlim(p.value)}
              </div>
            </button>
          ))}
        </div>

        {error_msg && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              borderRadius: 12,
              background: T.coralSoft,
              color: T.coralDeep,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {error_msg}
          </div>
        )}

        <button
          type="button"
          onClick={handle_save}
          disabled={submitting}
          style={{
            width: "100%",
            border: "none",
            background: submitting ? T.inkSoft : T.coral,
            color: "#fff",
            padding: "16px",
            borderRadius: 18,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 16,
            boxShadow: submitting ? "none" : `0 6px 0 ${T.coralDeep}`,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "保存中…" : "保存する"}
        </button>
      </div>
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────

export function MobileIncome({ onBack }: MobileIncomeProps) {
  const [incomes, setIncomes] = useState<IncomeRecord[] | null>(null);
  const [base_income, setBaseIncome] = useState<BaseIncomeSetting | null>(null);
  const [savings_goals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [surplus_allocations, setSurplusAllocations] = useState<SurplusAllocation[]>([]);
  const [active_sheet, setActiveSheet] = useState<ActiveSheet>(null);
  // income_form_state=null when sheet is closed; set when opening create or edit
  const [income_form_state, setIncomeFormState] = useState<IncomeFormState | null>(null);

  const current_ym = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);

  const refresh_incomes = async () => {
    const res = await api.listIncomeRecords(current_ym);
    setIncomes(res.income_records);
  };

  const refresh_allocations = async () => {
    const res = await api.listSurplusAllocations(current_ym);
    setSurplusAllocations(res.surplus_allocations);
  };

  const refresh_savings_goals = async () => {
    const res = await api.listSavingsGoals();
    setSavingsGoals(res.savings_goals);
  };

  useEffect(() => {
    Promise.all([
      api.listIncomeRecords(current_ym).then((r) => r.income_records),
      api.getBaseIncome(),
      api.listSavingsGoals().then((r) => r.savings_goals),
      api.listSurplusAllocations(current_ym).then((r) => r.surplus_allocations),
    ]).then(([inc, base, goals, allocs]) => {
      setIncomes(inc);
      setBaseIncome(base);
      setSavingsGoals(goals);
      setSurplusAllocations(allocs);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const is_loading = incomes === null;
  const income_total = incomes?.reduce((s, e) => s + e.amount, 0) ?? 0;
  const surplus = base_income ? income_total - base_income.amount : 0;
  const allocated_total = surplus_allocations.reduce((s, a) => s + a.amount, 0);
  const unallocated = Math.max(0, surplus - allocated_total);
  const unique_dates = incomes
    ? [...new Set(incomes.map((e) => e.transaction_date))].sort().reverse()
    : [];

  const handle_open_create = () => {
    const default_date = `${current_ym}-01`;
    setIncomeFormState(blank_income_form(default_date));
    setActiveSheet("income");
  };

  const handle_open_edit = (record: IncomeRecord) => {
    setIncomeFormState(income_record_to_form(record));
    setActiveSheet("income");
  };

  const handle_delete = async (record_id: number) => {
    if (!window.confirm("この収入記録を削除しますか？")) return;
    await api.deleteIncomeRecord(record_id).catch(() => {});
    setIncomes((prev) => (prev ? prev.filter((r) => r.id !== record_id) : prev));
  };

  const handle_close_income_sheet = () => {
    setActiveSheet(null);
    setIncomeFormState(null);
  };

  const handle_base_saved = (new_amount: number) => {
    setBaseIncome({ amount: new_amount });
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
        <div style={{ fontWeight: 900, fontSize: 22, color: T.ink }}>収入記録</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>基準と余剰を分けて管理</div>
      </div>

      {is_loading && (
        <p style={{ color: T.inkSoft, fontSize: 14, textAlign: "center" }}>読み込み中…</p>
      )}

      {!is_loading && base_income && (
        <>
          {/* Hero card */}
          <div
            style={{
              background: T.card,
              borderRadius: 28,
              padding: "18px",
              boxShadow: "0 0 0 1px rgba(80,40,10,0.05), 0 6px 32px rgba(80,40,10,0.09)",
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  color: T.inkSoft,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                今月の収入合計
              </span>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 11,
                  color: T.ink,
                }}
              >
                ¥{yenSlim(income_total)}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: T.inkSoft, fontWeight: 600 }}>
                {incomes?.length ?? 0}件
              </span>
            </div>

            <div style={{ height: 1, background: T.hair, margin: "12px 0 14px" }} />

            <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
              {/* Base income */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: T.inkSoft,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  基準収入
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 800,
                      fontSize: 24,
                      letterSpacing: "-0.03em",
                      color: T.ink,
                    }}
                  >
                    ¥{yenSlim(base_income.amount)}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 3 }}>
                  毎月の見込み・予算の元
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSheet("edit-base")}
                  style={{
                    marginTop: 10,
                    padding: "6px 12px",
                    border: `1px solid ${T.hair}`,
                    background: T.bgSoft,
                    color: T.inkSoft,
                    borderRadius: 999,
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    cursor: "pointer",
                  }}
                >
                  <span>✎</span>
                  <span>編集</span>
                </button>
              </div>

              <div style={{ width: 1, background: T.hair }} />

              {/* Surplus */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: T.inkSoft,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    余剰金額
                  </span>
                  {unallocated > 0 && (
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: 999,
                        background: T.bgSoft,
                        border: `1px solid ${T.hair}`,
                        fontSize: 9,
                        fontWeight: 700,
                        color: T.inkSoft,
                      }}
                    >
                      未振分
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginTop: 6 }}>
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 800,
                      fontSize: 14,
                      color: T.sageDeep,
                    }}
                  >
                    +
                  </span>
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 800,
                      fontSize: 24,
                      color: T.sageDeep,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    ¥{yenSlim(Math.max(0, surplus))}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 3 }}>
                  基準を超えた今月の上振れ
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSheet("allocate")}
                  style={{
                    marginTop: 8,
                    padding: "6px 12px",
                    border: "none",
                    borderRadius: 999,
                    background: T.mustard,
                    color: T.ink,
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: `0 2px 0 ${T.mustardDeep}`,
                  }}
                >
                  振り分ける →
                </button>
              </div>
            </div>
          </div>

          {/* Section title */}
          <div style={{ margin: "0 2px 12px", fontWeight: 700, fontSize: 15 }}>収入の記録</div>

          {/* Month chips */}
          <div
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 6,
              marginBottom: 12,
            }}
          >
            {["3月", "4月", "5月", "6月"].map((m, i) => (
              <div
                key={m}
                style={{
                  flexShrink: 0,
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: `1.5px solid ${i === 2 ? T.coral : T.hair}`,
                  background: i === 2 ? T.coral : "#fff",
                  color: i === 2 ? "#fff" : T.ink,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {m}
              </div>
            ))}
          </div>

          {/* Day-grouped list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {unique_dates.map((date) => {
              const items = incomes!.filter((e) => e.transaction_date === date);
              const total = items.reduce((s, e) => s + e.amount, 0);
              const { day, month, weekday } = formatDateParts(date);
              return (
                <div key={date}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 2px 8px" }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 700,
                          fontSize: 20,
                        }}
                      >
                        {day}
                      </span>
                      <span style={{ fontSize: 11, color: T.inkSoft }}>
                        {month}月 {weekday}
                      </span>
                    </div>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: 15,
                        color: T.sageDeep,
                      }}
                    >
                      +{yen(total)}
                    </span>
                  </div>
                  <div
                    style={{
                      background: T.card,
                      borderRadius: 24,
                      padding: "4px 16px",
                      boxShadow: "0 8px 24px -18px rgba(80,40,10,0.25)",
                    }}
                  >
                    {items.map((e, i) => {
                      const t = INCOME_TYPES[e.income_type] ?? INCOME_TYPES.oneoff;
                      const is_base = e.income_type === "salary";
                      return (
                        <div
                          key={e.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "12px 0",
                            borderBottom: i < items.length - 1 ? `1px solid ${T.hair}` : "none",
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 11,
                              background: T.sageSoft,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 17,
                            }}
                          >
                            {e.emoji}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 14,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span
                                style={{
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {e.name}
                              </span>
                              <span
                                style={{
                                  flexShrink: 0,
                                  padding: "2px 7px",
                                  borderRadius: 6,
                                  background: t.bg,
                                  color: t.fg,
                                  fontSize: 10,
                                  fontWeight: 700,
                                }}
                              >
                                {t.label}
                              </span>
                              {is_base && (
                                <span
                                  style={{
                                    flexShrink: 0,
                                    padding: "2px 7px",
                                    borderRadius: 6,
                                    background: "rgba(42,37,32,0.08)",
                                    color: T.inkSoft,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  基準
                                </span>
                              )}
                            </div>
                            {e.note && (
                              <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>
                                {e.note}
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              fontFamily: "'DM Sans', sans-serif",
                              fontWeight: 700,
                              fontSize: 15,
                              color: T.sageDeep,
                            }}
                          >
                            +¥{yenSlim(e.amount)}
                          </div>
                          {/* Edit / delete action buttons */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => handle_open_edit(e)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: T.bgSoft,
                                border: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                color: T.inkSoft,
                                cursor: "pointer",
                              }}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => handle_delete(e.id)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                background: T.bgSoft,
                                border: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                color: T.inkSoft,
                                cursor: "pointer",
                              }}
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Record income button */}
          <button
            type="button"
            onClick={handle_open_create}
            style={{
              width: "100%",
              marginTop: 16,
              border: `1.5px dashed ${T.sage}`,
              background: "transparent",
              color: T.sageDeep,
              padding: "15px",
              borderRadius: 16,
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            ＋ 収入を記録
          </button>
        </>
      )}

      {/* Sheets */}
      {active_sheet === "income" && income_form_state && (
        <MobileIncomeSheet
          initial_form={income_form_state}
          onClose={handle_close_income_sheet}
          onSaved={refresh_incomes}
        />
      )}
      {active_sheet === "edit-base" && base_income && (
        <MobileEditBaseSheet
          onClose={() => setActiveSheet(null)}
          base_amount={base_income.amount}
          onSaved={handle_base_saved}
        />
      )}
      {active_sheet === "allocate" && (
        <MobileAllocateSheet
          onClose={() => setActiveSheet(null)}
          unallocated={unallocated}
          active_ym={current_ym}
          savings_goals={savings_goals}
          onAllocated={async () => {
            await refresh_allocations();
            await refresh_savings_goals();
          }}
        />
      )}
    </div>
  );
}
