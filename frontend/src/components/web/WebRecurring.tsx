import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";
import { EmojiPicker } from "../EmojiPicker";

type RecurringExpense = components["schemas"]["RecurringExpense"];
type PendingRecurring = components["schemas"]["PendingRecurring"];
type ExpenseCategory = components["schemas"]["ExpenseCategory"];
type CategoryGroup = components["schemas"]["CategoryGroup"];

const FIXED_STATEMENT_TYPE_ID = 3;

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

// Fixed emoji choices for recurring expenses; the first is the pre-filled default.
const RECURRING_EMOJI_OPTIONS = ["🏠", "📱", "💡", "🚗", "📺", "💳"];
const DEFAULT_RECURRING_EMOJI = RECURRING_EMOJI_OPTIONS[0];

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

interface Props {
  onBack: () => void;
}

type FilterType = "fixed" | "variable" | "all";

// Form state for create / edit. id=null means "create mode".
interface RecurringFormState {
  id: number | null;
  name: string;
  emoji: string;
  billing_day: string;
  amount: string;
  type: "fixed" | "variable";
  category_id: string;
}

function blank_recurring_form(): RecurringFormState {
  return {
    id: null,
    name: "",
    emoji: DEFAULT_RECURRING_EMOJI,
    billing_day: "",
    amount: "",
    type: "fixed",
    category_id: "",
  };
}

function recurring_to_form(r: RecurringExpense): RecurringFormState {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    billing_day: String(r.billing_day),
    amount: r.amount != null ? String(r.amount) : "",
    type: r.type,
    category_id: String(r.category_id),
  };
}

export function WebRecurring({ onBack }: Props) {
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [pending, setPending] = useState<PendingRecurring[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [confirm_amounts, setConfirmAmounts] = useState<Record<number, string>>({});
  const [confirming_id, setConfirmingId] = useState<number | null>(null);
  const [expense_categories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [category_groups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const ym = currentMonthJST();

  // recurring_form=null means the form is hidden
  const [recurring_form, setRecurringForm] = useState<RecurringFormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form_error_msg, setFormErrorMsg] = useState("");

  const refresh_lists = async () => {
    const [rec_res, pend_res] = await Promise.all([
      api.listRecurringExpenses(),
      api.listPendingRecurring(ym),
    ]);
    setRecurring(rec_res.recurring_expenses);
    setPending(pend_res.pending);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.listRecurringExpenses(),
      api.listPendingRecurring(ym),
      api.listExpenseCategories(),
      api.listCategoryGroups(),
    ])
      .then(([rec_res, pend_res, cat_res, group_res]) => {
        if (cancelled) return;
        setRecurring(rec_res.recurring_expenses);
        setPending(pend_res.pending);
        setExpenseCategories(cat_res.expense_categories);
        setCategoryGroups(group_res.category_groups);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ym]);

  const fixed_group_id_set = new Set(
    category_groups.filter((g) => g.statement_type.id === FIXED_STATEMENT_TYPE_ID).map((g) => g.id)
  );

  const fixed_expense_categories = expense_categories.filter((cat) =>
    fixed_group_id_set.has(cat.group_id)
  );

  const filtered = recurring.filter((r) => {
    if (filter === "fixed") return r.type === "fixed";
    if (filter === "variable") return r.type === "variable";
    return true;
  });

  const handle_confirm = async (id: number) => {
    const amount_str = confirm_amounts[id];
    const amount = parseInt(amount_str ?? "", 10);
    if (isNaN(amount) || amount < 1) return;
    setConfirmingId(id);
    try {
      await api.confirmRecurringExpense(id, amount, ym);
      const [rec_res, pend_res] = await Promise.all([
        api.listRecurringExpenses(),
        api.listPendingRecurring(ym),
      ]);
      setRecurring(rec_res.recurring_expenses);
      setPending(pend_res.pending);
      setConfirmAmounts((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    } catch {
      // ignore
    } finally {
      setConfirmingId(null);
    }
  };

  const handle_delete = async (id: number) => {
    if (!window.confirm("この定期支出を削除しますか？")) return;
    await api.deleteRecurringExpense(id).catch(() => {});
    setRecurring((prev) => prev.filter((r) => r.id !== id));
  };

  const open_create_form = () => {
    setRecurringForm(blank_recurring_form());
    setFormErrorMsg("");
  };

  const open_edit_form = (r: RecurringExpense) => {
    setRecurringForm(recurring_to_form(r));
    setFormErrorMsg("");
  };

  const handle_recurring_submit = async () => {
    if (!recurring_form) return;
    setFormErrorMsg("");

    if (!recurring_form.name.trim()) {
      setFormErrorMsg("名前を入力してください");
      return;
    }
    const parsed_billing_day = parseInt(recurring_form.billing_day, 10);
    if (isNaN(parsed_billing_day) || parsed_billing_day < 1 || parsed_billing_day > 31) {
      setFormErrorMsg("引落日を1〜31で入力してください");
      return;
    }

    const parsed_category_id = parseInt(recurring_form.category_id, 10);
    if (isNaN(parsed_category_id)) {
      setFormErrorMsg("カテゴリを選択してください");
      return;
    }

    let parsed_amount: number | null = null;
    if (recurring_form.amount.trim() !== "") {
      parsed_amount = parseInt(recurring_form.amount, 10);
      if (isNaN(parsed_amount) || parsed_amount < 0) {
        setFormErrorMsg("金額を正しく入力してください");
        return;
      }
    }

    setSubmitting(true);
    try {
      const request_body: components["schemas"]["RecurringExpenseRequest"] = {
        name: recurring_form.name.trim(),
        emoji: recurring_form.emoji.trim() || DEFAULT_RECURRING_EMOJI,
        billing_day: parsed_billing_day,
        amount: parsed_amount,
        type: recurring_form.type,
        category_id: parsed_category_id,
      };

      if (recurring_form.id !== null) {
        await api.updateRecurringExpense(recurring_form.id, request_body);
      } else {
        await api.createRecurringExpense(request_body);
      }

      await refresh_lists();
      setRecurringForm(null);
    } catch (err) {
      setFormErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  const filterPills: { id: FilterType; label: string }[] = [
    { id: "fixed", label: "固定" },
    { id: "variable", label: "要確認" },
    { id: "all", label: "すべて" },
  ];

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
            <span style={{ color: T.ink }}>定期支出</span>
          </div>
          <div
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: "-0.01em",
            }}
          >
            定期支出
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>
            毎月の固定・半固定費を管理します
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
          ＋ 定期支出を追加
        </button>
      </div>

      {/* Inline create / edit form */}
      {recurring_form && (
        <div
          style={{
            padding: "18px 20px",
            borderRadius: 20,
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
            {recurring_form.id !== null ? "定期支出を編集" : "定期支出を追加"}
          </div>

          {/* Row 1: emoji + name */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: "0 0 80px" }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>絵文字</div>
              <input
                type="text"
                value={recurring_form.emoji}
                onChange={(e) => setRecurringForm((f) => f && { ...f, emoji: e.target.value })}
                placeholder="🏠"
                style={{ ...input_style, textAlign: "center", fontSize: 20 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>名前</div>
              <input
                type="text"
                value={recurring_form.name}
                onChange={(e) => setRecurringForm((f) => f && { ...f, name: e.target.value })}
                placeholder="家賃"
                style={input_style}
              />
            </div>
          </div>

          {/* Quick emoji picker */}
          <div style={{ marginBottom: 12 }}>
            <EmojiPicker
              value={recurring_form.emoji}
              onSelect={(emoji) => setRecurringForm((f) => f && { ...f, emoji })}
              options={RECURRING_EMOJI_OPTIONS}
              accent={T.coral}
              accentSoft={T.coralSoft}
            />
          </div>

          {/* Row 2: billing day + amount */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>
                引落日（1〜31日）
              </div>
              <input
                type="number"
                min={1}
                max={31}
                value={recurring_form.billing_day}
                onChange={(e) =>
                  setRecurringForm((f) => f && { ...f, billing_day: e.target.value })
                }
                placeholder="25"
                style={input_style}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>
                金額（円）（任意）
              </div>
              <input
                type="number"
                min={0}
                value={recurring_form.amount}
                onChange={(e) => setRecurringForm((f) => f && { ...f, amount: e.target.value })}
                placeholder="80000"
                style={input_style}
              />
            </div>
          </div>

          {/* Row 3: type + category */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>種別</div>
              <select
                value={recurring_form.type}
                onChange={(e) =>
                  setRecurringForm(
                    (f) => f && { ...f, type: e.target.value as "fixed" | "variable" }
                  )
                }
                style={{ ...input_style, appearance: "auto" }}
              >
                <option value="fixed">固定（毎月同じ金額）</option>
                <option value="variable">要確認（毎月変動）</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>カテゴリ</div>
              <select
                value={recurring_form.category_id}
                onChange={(e) =>
                  setRecurringForm((f) => f && { ...f, category_id: e.target.value })
                }
                style={{ ...input_style, appearance: "auto" }}
              >
                <option value="">選択してください</option>
                {fixed_expense_categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.category_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {form_error_msg && (
            <div style={{ color: T.coralDeep, fontSize: 13, marginBottom: 10 }}>
              {form_error_msg}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handle_recurring_submit}
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
              onClick={() => setRecurringForm(null)}
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

      {pending.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span
              style={{
                fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                fontWeight: 900,
                fontSize: 15,
                color: T.coralDeep,
              }}
            >
              💬 確認待ち
            </span>
            <span
              style={{
                padding: "2px 9px",
                borderRadius: 999,
                background: T.coral,
                color: "#fff",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              {pending.length}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: T.inkSoft }}>
              {parseInt(ym.split("-")[1])}月分
            </span>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {pending.map((p) => (
              <div
                key={p.id}
                style={{
                  flex: 1,
                  background: T.card,
                  borderRadius: 24,
                  padding: "20px 22px",
                  border: `1.5px solid #FFE8DD`,
                  boxShadow: "0 8px 24px -16px rgba(80,40,10,0.12)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      background: "#FFE8DD",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                    }}
                  >
                    {p.emoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</span>
                      <span
                        style={{
                          padding: "3px 9px",
                          borderRadius: 999,
                          background: T.coral,
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        要確認
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
                      前回{" "}
                      <strong style={{ fontFamily: "'DM Sans', sans-serif", color: T.ink }}>
                        {yen(p.last_amount)}
                      </strong>{" "}
                      · 毎月 {p.billing_day}日
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    placeholder={String(p.last_amount)}
                    value={confirm_amounts[p.id] ?? ""}
                    onChange={(e) =>
                      setConfirmAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      border: `1.5px solid ${T.hair}`,
                      borderRadius: 10,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 15,
                      fontWeight: 700,
                      outline: "none",
                      background: T.bgSoft,
                    }}
                  />
                  <button
                    onClick={() => handle_confirm(p.id)}
                    disabled={confirming_id === p.id}
                    style={{
                      flex: 1,
                      border: "none",
                      background: T.coral,
                      color: "#fff",
                      padding: "12px",
                      borderRadius: 14,
                      fontFamily: "inherit",
                      fontWeight: 700,
                      fontSize: 14,
                      boxShadow: `0 4px 0 ${T.coralDeep}`,
                      cursor: "pointer",
                    }}
                  >
                    金額を確定する
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          background: T.card,
          borderRadius: 32,
          padding: 28,
          boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            繰り返し設定&nbsp;
            <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 400 }}>
              {filtered.length}件
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {filterPills.map((fp) => {
              const active = filter === fp.id;
              return (
                <button
                  key={fp.id}
                  onClick={() => setFilter(fp.id)}
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
                  {fp.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {filtered.map((r) => {
            const is_fixed = r.type === "fixed";
            return (
              <div
                key={r.id}
                style={{
                  padding: "16px 18px",
                  borderRadius: 20,
                  background: T.bgSoft,
                  border: `1.5px solid ${T.hair}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    boxShadow: `0 2px 0 ${T.hair}`,
                  }}
                >
                  {r.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: "#E5EEF7",
                        color: "#3F6B91",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      毎月 {r.billing_day}日
                    </span>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: is_fixed ? "#DEF1E6" : "#FFF1CC",
                        color: is_fixed ? T.sageDeep : "#A3791F",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {is_fixed ? "固定" : "要確認"}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 16,
                      color: r.amount ? T.ink : T.inkSoft,
                    }}
                  >
                    {r.amount ? yen(r.amount) : "—"}
                  </div>
                  <div
                    style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}
                  >
                    <span
                      onClick={() => open_edit_form(r)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: "#fff",
                        border: `1px solid ${T.hair}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        color: T.inkSoft,
                        cursor: "pointer",
                      }}
                    >
                      ✎
                    </span>
                    <span
                      onClick={() => handle_delete(r.id)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: "#fff",
                        border: `1px solid ${T.hair}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        color: T.inkSoft,
                        cursor: "pointer",
                      }}
                    >
                      🗑
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={open_create_form}
          style={{
            width: "100%",
            marginTop: 16,
            border: `1.5px dashed ${T.coral}`,
            background: "transparent",
            color: T.coralDeep,
            padding: "14px",
            borderRadius: 16,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          ＋ 定期支出を追加
        </button>
      </div>
    </div>
  );
}
