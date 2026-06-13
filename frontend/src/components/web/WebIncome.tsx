import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";

type IncomeRecord = components["schemas"]["IncomeRecord"];
type BaseIncomeSetting = components["schemas"]["BaseIncomeSetting"];

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

function addMonths(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  return `${parseInt(ym.split("-")[1])}月`;
}

const INCOME_TYPES: Record<string, { label: string; bg: string; fg: string }> = {
  salary: { label: "給与", bg: "#DEF1E6", fg: "#4FA481" },
  side: { label: "副業", bg: "#E5EEF7", fg: "#3F6B91" },
  bonus: { label: "ボーナス", bg: "#FFF1CC", fg: "#F0A92E" },
  oneoff: { label: "一時収入", bg: "#FFE8DD", fg: "#F26B3F" },
};

const INCOME_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "salary", label: "給与" },
  { value: "side", label: "副業" },
  { value: "bonus", label: "ボーナス" },
  { value: "oneoff", label: "一時収入" },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function dateSquareParts(date_str: string): { day: number; month: number; weekday: string } {
  const [y, m, d] = date_str.split("-").map(Number);
  return { day: d, month: m, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] };
}

interface Props {
  onBack: () => void;
}

// Form state for create / edit. id=null means "create mode".
interface IncomeRecordFormState {
  id: number | null;
  name: string;
  emoji: string;
  amount_yen: string;
  transaction_date: string;
  income_type: string;
  note: string;
}

function blank_income_form(default_date: string): IncomeRecordFormState {
  return {
    id: null,
    name: "",
    emoji: "",
    amount_yen: "",
    transaction_date: default_date,
    income_type: "salary",
    note: "",
  };
}

function income_record_to_form(record: IncomeRecord): IncomeRecordFormState {
  return {
    id: record.id,
    name: record.name,
    emoji: record.emoji,
    amount_yen: String(record.amount),
    transaction_date: record.transaction_date,
    income_type: record.income_type,
    note: record.note ?? "",
  };
}

export function WebIncome({ onBack }: Props) {
  const current_ym = currentMonthJST();
  const [active_ym, setActiveYm] = useState(current_ym);
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [base_income, setBaseIncome] = useState<BaseIncomeSetting | null>(null);
  const [editing_base, setEditingBase] = useState(false);
  const [base_draft, setBaseDraft] = useState("");

  // income_form=null means the form is hidden
  const [income_form, setIncomeForm] = useState<IncomeRecordFormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form_error_msg, setFormErrorMsg] = useState("");

  const available_months = [
    addMonths(current_ym, -2),
    addMonths(current_ym, -1),
    current_ym,
    addMonths(current_ym, 1),
  ];

  const refresh_records = async () => {
    const res = await api.listIncomeRecords(active_ym);
    setRecords(res.income_records);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listIncomeRecords(active_ym), api.getBaseIncome()])
      .then(([income_res, base_res]) => {
        if (cancelled) return;
        setRecords(income_res.income_records);
        setBaseIncome(base_res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active_ym]);

  const income_total = records.reduce((s, r) => s + r.amount, 0);
  const base_amount = base_income?.amount ?? 0;
  const surplus = income_total - base_amount;

  const days_with_income = [...new Set(records.map((r) => r.transaction_date))].sort().reverse();

  const handle_base_save = async () => {
    const amount = parseInt(base_draft, 10);
    if (isNaN(amount) || amount < 1) return;
    try {
      const res = await api.updateBaseIncome(amount);
      setBaseIncome(res);
      setEditingBase(false);
    } catch {
      // ignore
    }
  };

  const handle_delete = async (id: number) => {
    if (!window.confirm("この収入記録を削除しますか？")) return;
    await api.deleteIncomeRecord(id).catch(() => {});
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const open_create_form = () => {
    // Default transaction date to the first day of the active month
    const default_date = `${active_ym}-01`;
    setIncomeForm(blank_income_form(default_date));
    setFormErrorMsg("");
  };

  const open_edit_form = (record: IncomeRecord) => {
    setIncomeForm(income_record_to_form(record));
    setFormErrorMsg("");
  };

  const handle_income_submit = async () => {
    if (!income_form) return;
    setFormErrorMsg("");

    if (!income_form.name.trim()) {
      setFormErrorMsg("名前を入力してください");
      return;
    }
    if (!income_form.emoji.trim()) {
      setFormErrorMsg("絵文字を入力してください");
      return;
    }

    const parsed_amount = parseInt(income_form.amount_yen, 10);
    if (isNaN(parsed_amount) || parsed_amount < 1) {
      setFormErrorMsg("金額を正しく入力してください");
      return;
    }

    if (!income_form.transaction_date) {
      setFormErrorMsg("日付を入力してください");
      return;
    }

    setSubmitting(true);
    try {
      const request_body: components["schemas"]["IncomeRecordRequest"] = {
        name: income_form.name.trim(),
        emoji: income_form.emoji.trim(),
        amount: parsed_amount,
        transaction_date: income_form.transaction_date,
        income_type: income_form.income_type as "salary" | "side" | "bonus" | "oneoff",
        note: income_form.note.trim() || undefined,
      };

      if (income_form.id !== null) {
        await api.updateIncomeRecord(income_form.id, request_body);
      } else {
        await api.createIncomeRecord(request_body);
      }

      await refresh_records();
      setIncomeForm(null);
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
            <span style={{ color: T.ink }}>収入記録</span>
          </div>
          <div
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: "-0.01em",
            }}
          >
            収入記録
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>
            基準と余剰を分けて管理します
          </div>
        </div>
        <button
          onClick={open_create_form}
          style={{
            border: "none",
            background: T.sage,
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 999,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: `0 4px 0 ${T.sageDeep}`,
          }}
        >
          ＋ 収入を記録
        </button>
      </div>

      {/* Inline create / edit form */}
      {income_form && (
        <div
          style={{
            padding: "18px 20px",
            borderRadius: 20,
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
            {income_form.id !== null ? "収入記録を編集" : "収入を記録"}
          </div>

          {/* Row 1: emoji + name */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: "0 0 80px" }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>絵文字</div>
              <input
                type="text"
                value={income_form.emoji}
                onChange={(e) => setIncomeForm((f) => f && { ...f, emoji: e.target.value })}
                placeholder="🏢"
                style={{ ...input_style, textAlign: "center", fontSize: 20 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>名前</div>
              <input
                type="text"
                value={income_form.name}
                onChange={(e) => setIncomeForm((f) => f && { ...f, name: e.target.value })}
                placeholder="6月給与"
                style={input_style}
              />
            </div>
          </div>

          {/* Row 2: amount + income type */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>金額（円）</div>
              <input
                type="number"
                min={1}
                value={income_form.amount_yen}
                onChange={(e) => setIncomeForm((f) => f && { ...f, amount_yen: e.target.value })}
                placeholder="280000"
                style={input_style}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>収入種別</div>
              <select
                value={income_form.income_type}
                onChange={(e) => setIncomeForm((f) => f && { ...f, income_type: e.target.value })}
                style={{ ...input_style }}
              >
                {INCOME_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: transaction date + note */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>日付</div>
              <input
                type="date"
                value={income_form.transaction_date}
                onChange={(e) =>
                  setIncomeForm((f) => f && { ...f, transaction_date: e.target.value })
                }
                style={input_style}
              />
            </div>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>メモ（任意）</div>
              <input
                type="text"
                value={income_form.note}
                onChange={(e) => setIncomeForm((f) => f && { ...f, note: e.target.value })}
                placeholder="先月繰越分を含む"
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
              onClick={handle_income_submit}
              disabled={submitting}
              style={{
                border: "none",
                background: T.sage,
                color: "#fff",
                padding: "9px 20px",
                borderRadius: 999,
                fontFamily: "inherit",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: `0 3px 0 ${T.sageDeep}`,
              }}
            >
              {submitting ? "保存中…" : "保存"}
            </button>
            <button
              onClick={() => setIncomeForm(null)}
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

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* Left: summary */}
        <div style={{ flex: "0 0 380px" }}>
          <div
            style={{
              background: T.card,
              borderRadius: 28,
              padding: 24,
              boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>
                {monthLabel(active_ym)}の収入合計
              </span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: T.ink }}>
                {yen(income_total)}
              </span>
            </div>

            <div style={{ height: 1, background: T.hair, marginBottom: 16 }} />

            <div>
              <div
                style={{
                  fontSize: 11,
                  color: T.inkSoft,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                基準収入
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                {editing_base ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                    <input
                      type="number"
                      value={base_draft}
                      onChange={(e) => setBaseDraft(e.target.value)}
                      placeholder="金額を入力"
                      autoFocus
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        border: `1.5px solid ${T.coral}`,
                        borderRadius: 10,
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 18,
                        fontWeight: 700,
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={handle_base_save}
                      style={{
                        border: "none",
                        background: T.coral,
                        color: "#fff",
                        padding: "8px 14px",
                        borderRadius: 10,
                        fontFamily: "inherit",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingBase(false)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: T.inkSoft,
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 800,
                      fontSize: 32,
                      letterSpacing: "-0.02em",
                      color: T.ink,
                    }}
                  >
                    {yen(base_amount)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>
                毎月の見込み・予算の元
              </div>
              {!editing_base && (
                <button
                  onClick={() => {
                    setEditingBase(true);
                    setBaseDraft(String(base_amount));
                  }}
                  style={{
                    marginTop: 10,
                    padding: "7px 14px",
                    border: `1px solid ${T.hair}`,
                    background: T.bgSoft,
                    color: T.inkSoft,
                    borderRadius: 999,
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ✎ 基準収入を編集
                </button>
              )}
            </div>

            <div style={{ height: 1, background: T.hair, margin: "16px 0" }} />

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: T.inkSoft,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  余剰金額
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
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
                    fontSize: 32,
                    color: T.sageDeep,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {yen(Math.max(0, surplus))}
                </span>
              </div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>
                基準を超えた今月の上振れ
              </div>
            </div>
          </div>
        </div>

        {/* Right: income list */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {available_months.map((m) => {
              const active = m === active_ym;
              return (
                <button
                  key={m}
                  onClick={() => setActiveYm(m)}
                  style={{
                    border: `1.5px solid ${active ? T.coral : T.hair}`,
                    background: active ? T.coral : "#fff",
                    color: active ? "#fff" : T.ink,
                    padding: "10px 16px",
                    borderRadius: 999,
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {monthLabel(m)}
                </button>
              );
            })}
          </div>

          {days_with_income.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
              収入の記録がありません
            </div>
          ) : (
            days_with_income.map((date) => {
              const items = records.filter((r) => r.transaction_date === date);
              const day_total = items.reduce((s, r) => s + r.amount, 0);
              const { day, month } = dateSquareParts(date);

              return (
                <div
                  key={date}
                  style={{
                    background: T.card,
                    borderRadius: 24,
                    padding: "20px 24px",
                    boxShadow: "0 8px 24px -16px rgba(80,40,10,0.12)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      paddingBottom: 12,
                      borderBottom: `1.5px solid ${T.hair}`,
                    }}
                  >
                    <div
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 16,
                        background: T.bgSoft,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        border: `1.5px solid ${T.hair}`,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 700,
                          fontSize: 20,
                          lineHeight: 1,
                        }}
                      >
                        {day}
                      </div>
                      <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 1 }}>{month}月</div>
                    </div>
                    <div
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: 18,
                        color: T.sageDeep,
                        marginLeft: "auto",
                      }}
                    >
                      +{yen(day_total)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
                    {items.map((e, i) => {
                      const type_info = INCOME_TYPES[e.income_type] ?? INCOME_TYPES.oneoff;
                      const is_base = e.income_type === "salary";
                      return (
                        <div
                          key={e.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            padding: "12px 4px",
                            borderBottom: i < items.length - 1 ? `1px solid ${T.hair}` : "none",
                          }}
                        >
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 12,
                              background: "#DEF1E6",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 18,
                            }}
                          >
                            {e.emoji}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 14,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              {e.name}
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  background: type_info.bg,
                                  color: type_info.fg,
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {type_info.label}
                              </span>
                              {is_base && (
                                <span
                                  style={{
                                    padding: "2px 7px",
                                    borderRadius: 6,
                                    background: "rgba(42,37,32,0.08)",
                                    color: T.inkSoft,
                                    fontSize: 10,
                                    fontWeight: 700,
                                  }}
                                >
                                  基準
                                </span>
                              )}
                            </div>
                            {e.note && (
                              <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                                {e.note}
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              fontFamily: "'DM Sans', sans-serif",
                              fontWeight: 700,
                              fontSize: 16,
                              color: T.sageDeep,
                            }}
                          >
                            +{yen(e.amount)}
                          </div>
                          <div style={{ display: "flex", gap: 6, opacity: 0.45 }}>
                            <span
                              onClick={() => open_edit_form(e)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 8,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              ✎
                            </span>
                            <span
                              onClick={() => handle_delete(e.id)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 8,
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              🗑
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
