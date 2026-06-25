import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";
import { EmojiPicker } from "../EmojiPicker";
import { Modal } from "../Modal";
import {
  useEntityForm,
  FormField,
  AmountField,
  SelectField,
  FormError,
  FormActions,
} from "../forms";

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

  const recurring_form = useEntityForm<RecurringFormState, RecurringExpense>({
    blank: blank_recurring_form,
    fromEntity: recurring_to_form,
    validate: (f) => {
      if (!f.name.trim()) return "名前を入力してください";
      const parsed_billing_day = parseInt(f.billing_day, 10);
      if (isNaN(parsed_billing_day) || parsed_billing_day < 1 || parsed_billing_day > 31)
        return "引落日を1〜31で入力してください";
      if (isNaN(parseInt(f.category_id, 10))) return "カテゴリを選択してください";
      if (f.amount.trim() !== "") {
        const parsed_amount = parseInt(f.amount, 10);
        if (isNaN(parsed_amount) || parsed_amount < 0) return "金額を正しく入力してください";
      }
      return null;
    },
    onSubmit: async (f) => {
      const request_body: components["schemas"]["RecurringExpenseRequest"] = {
        name: f.name.trim(),
        emoji: f.emoji.trim() || DEFAULT_RECURRING_EMOJI,
        billing_day: parseInt(f.billing_day, 10),
        amount: f.amount.trim() !== "" ? parseInt(f.amount, 10) : null,
        type: f.type,
        category_id: parseInt(f.category_id, 10),
      };
      if (f.id !== null) {
        await api.updateRecurringExpense(f.id, request_body);
      } else {
        await api.createRecurringExpense(request_body);
      }
      await refresh_lists();
    },
  });

  const filterPills: { id: FilterType; label: string }[] = [
    { id: "fixed", label: "固定" },
    { id: "variable", label: "要確認" },
    { id: "all", label: "すべて" },
  ];

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
          onClick={recurring_form.openCreate}
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

      {/* Create / edit form as a centered modal popup (#131) */}
      {recurring_form.form && (
        <Modal
          title={recurring_form.isEdit ? "定期支出を編集" : "定期支出を追加"}
          onClose={recurring_form.close}
          maxWidth={520}
        >
          {/* Row 1: emoji + name */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: "0 0 80px" }}>
              <FormField
                label="絵文字"
                value={recurring_form.form.emoji}
                onChange={(v) => recurring_form.setField("emoji", v)}
                placeholder="🏠"
                style={{ textAlign: "center", fontSize: 20 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <FormField
                label="名前"
                value={recurring_form.form.name}
                onChange={(v) => recurring_form.setField("name", v)}
                placeholder="家賃"
              />
            </div>
          </div>

          {/* Quick emoji picker */}
          <div style={{ marginBottom: 12 }}>
            <EmojiPicker
              value={recurring_form.form.emoji}
              onSelect={(emoji) => recurring_form.setField("emoji", emoji)}
              options={RECURRING_EMOJI_OPTIONS}
              accent={T.coral}
              accentSoft={T.coralSoft}
            />
          </div>

          {/* Row 2: billing day + amount */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <FormField
                label="引落日（1〜31日）"
                type="number"
                min={1}
                max={31}
                value={recurring_form.form.billing_day}
                onChange={(v) => recurring_form.setField("billing_day", v)}
                placeholder="25"
              />
            </div>
            <div style={{ flex: 1 }}>
              <AmountField
                label="金額（円）（任意）"
                value={recurring_form.form.amount}
                onChange={(v) => recurring_form.setField("amount", v)}
                placeholder="80000"
              />
            </div>
          </div>

          {/* Row 3: type + category */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <SelectField
                label="種別"
                value={recurring_form.form.type}
                onChange={(v) => recurring_form.setField("type", v as "fixed" | "variable")}
                options={[
                  { value: "fixed", label: "固定（毎月同じ金額）" },
                  { value: "variable", label: "要確認（毎月変動）" },
                ]}
              />
            </div>
            <div style={{ flex: 1 }}>
              <SelectField
                label="カテゴリ"
                value={recurring_form.form.category_id}
                onChange={(v) => recurring_form.setField("category_id", v)}
                placeholder="選択してください"
                options={fixed_expense_categories.map((cat) => ({
                  value: String(cat.id),
                  label: cat.category_name,
                }))}
              />
            </div>
          </div>

          <FormError message={recurring_form.error} />

          <FormActions
            onSubmit={recurring_form.submit}
            onCancel={recurring_form.close}
            submitting={recurring_form.submitting}
          />
        </Modal>
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
                      onClick={() => recurring_form.openEdit(r)}
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
          onClick={recurring_form.openCreate}
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
