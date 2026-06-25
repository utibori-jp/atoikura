import { useEffect, useState } from "react";
import { T } from "../../theme";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { EmojiPicker } from "../EmojiPicker";
import { useConfirm } from "../dialogContext";
import { useEntityForm, type UseEntityForm } from "../forms";

type RecurringExpense = components["schemas"]["RecurringExpense"];
type PendingRecurring = components["schemas"]["PendingRecurring"];
type ExpenseCategory = components["schemas"]["ExpenseCategory"];
type CategoryGroup = components["schemas"]["CategoryGroup"];

const FIXED_STATEMENT_TYPE_ID = 3;

interface MobileRecurringProps {
  onBack: () => void;
}

// Fixed emoji choices for recurring expenses; the first is the pre-filled default.
const RECURRING_EMOJI_OPTIONS = ["🏠", "📱", "💡", "🚗", "📺", "💳"];
const DEFAULT_RECURRING_EMOJI = RECURRING_EMOJI_OPTIONS[0];

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

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

// Bottom-sheet wrapper shared style
const sheet_overlay_style: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  background: "rgba(42,37,32,0.45)",
};

const sheet_inner_style: React.CSSProperties = {
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
};

const input_style: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  border: `1.5px solid ${T.hair}`,
  borderRadius: 12,
  fontFamily: "inherit",
  fontSize: 14,
  color: T.ink,
  background: T.bgSoft,
  outline: "none",
  boxSizing: "border-box",
};

interface RecurringSheetProps {
  recurring_form: UseEntityForm<RecurringFormState, RecurringExpense>;
  expense_categories: ExpenseCategory[];
}

function RecurringSheet({ recurring_form, expense_categories }: RecurringSheetProps) {
  const form = recurring_form.form;
  if (!form) return null;

  const title_text = recurring_form.isEdit ? "定期支出を編集" : "定期支出を追加";
  const on_close = recurring_form.close;

  return (
    <div style={sheet_overlay_style} onClick={on_close}>
      <div style={sheet_inner_style} onClick={(e) => e.stopPropagation()}>
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

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 19, fontWeight: 900 }}>{title_text}</div>
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

        {/* Emoji + 名前 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: "0 0 70px" }}>
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>絵文字</div>
            <input
              type="text"
              value={form.emoji}
              onChange={(e) => recurring_form.setField("emoji", e.target.value)}
              placeholder="🏠"
              style={{ ...input_style, textAlign: "center", fontSize: 20 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>名前</div>
            <input
              type="text"
              value={form.name}
              onChange={(e) => recurring_form.setField("name", e.target.value)}
              placeholder="家賃"
              style={input_style}
            />
          </div>
        </div>

        {/* Quick emoji picker */}
        <div style={{ marginBottom: 12 }}>
          <EmojiPicker
            value={form.emoji}
            onSelect={(emoji) => recurring_form.setField("emoji", emoji)}
            options={RECURRING_EMOJI_OPTIONS}
            accent={T.coral}
            accentSoft={T.coralSoft}
          />
        </div>

        {/* 引落日 + 金額 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>引落日（1〜31日）</div>
            <input
              type="number"
              min={1}
              max={31}
              value={form.billing_day}
              onChange={(e) => recurring_form.setField("billing_day", e.target.value)}
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
              value={form.amount}
              onChange={(e) => recurring_form.setField("amount", e.target.value)}
              placeholder="80000"
              style={input_style}
            />
          </div>
        </div>

        {/* タイプ segmented */}
        <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600, marginBottom: 6 }}>
          タイプ
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: 4,
            background: T.bgSoft,
            borderRadius: 14,
            marginBottom: 12,
          }}
        >
          {(["fixed", "variable"] as const).map((type_option) => {
            const is_active = form.type === type_option;
            return (
              <button
                key={type_option}
                type="button"
                onClick={() => recurring_form.setField("type", type_option)}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "10px",
                  borderRadius: 10,
                  fontFamily: "inherit",
                  fontWeight: 600,
                  fontSize: 13,
                  border: "none",
                  cursor: "pointer",
                  background: is_active ? T.coral : "transparent",
                  color: is_active ? "#fff" : T.inkSoft,
                  boxShadow: is_active ? `0 2px 0 ${T.coralDeep}` : "none",
                }}
              >
                {type_option === "fixed" ? "固定（毎月同額）" : "要確認（変動）"}
              </button>
            );
          })}
        </div>

        {/* カテゴリ */}
        <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>カテゴリ</div>
        <select
          value={form.category_id}
          onChange={(e) => recurring_form.setField("category_id", e.target.value)}
          style={{ ...input_style, appearance: "auto", marginBottom: 16 }}
        >
          <option value="">選択してください</option>
          {expense_categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.category_name}
            </option>
          ))}
        </select>

        {/* Error */}
        {recurring_form.error && (
          <div style={{ color: T.coralDeep, fontSize: 13, marginBottom: 10 }}>
            {recurring_form.error}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={recurring_form.submit}
          disabled={recurring_form.submitting}
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
            cursor: "pointer",
            opacity: recurring_form.submitting ? 0.7 : 1,
          }}
        >
          {recurring_form.submitting ? "保存中…" : "保存する"}
        </button>
      </div>
    </div>
  );
}

export function MobileRecurring({ onBack }: MobileRecurringProps) {
  const confirm = useConfirm();
  const [recurring, setRecurring] = useState<RecurringExpense[] | null>(null);
  const [pending, setPending] = useState<PendingRecurring[] | null>(null);
  const [expense_categories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [category_groups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  // Map of pending item id → confirm amount string
  const [confirm_amounts, setConfirmAmounts] = useState<Record<number, string>>({});
  const [confirming_id, setConfirmingId] = useState<number | null>(null);

  const currentMonthJST = () =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);

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

  const handle_delete = async (id: number) => {
    const confirmed = await confirm({
      title: "削除の確認",
      message: "この定期支出を削除しますか？",
      confirmLabel: "削除",
      danger: true,
    });
    if (!confirmed) return;
    await api.deleteRecurringExpense(id).catch(() => {});
    setRecurring((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
  };

  const handle_confirm = async (pending_item: PendingRecurring) => {
    const amount_str = confirm_amounts[pending_item.id];
    const confirm_amount = parseInt(amount_str ?? "", 10);
    if (isNaN(confirm_amount) || confirm_amount < 1) return;
    setConfirmingId(pending_item.id);
    try {
      await api.confirmRecurringExpense(pending_item.id, confirm_amount, ym);
      await refresh_lists();
      setConfirmAmounts((prev) => {
        const updated = { ...prev };
        delete updated[pending_item.id];
        return updated;
      });
    } catch {
      // Silently ignore (e.g. 409 already confirmed)
    } finally {
      setConfirmingId(null);
    }
  };

  const is_loading = recurring === null;

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
        <div style={{ fontWeight: 900, fontSize: 22, color: T.ink }}>定期支出</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
          毎月の固定・半固定費を管理
        </div>
      </div>

      {is_loading && (
        <p style={{ color: T.inkSoft, fontSize: 14, textAlign: "center" }}>読み込み中…</p>
      )}

      {!is_loading && pending && pending.length > 0 && (
        <>
          {/* Pending confirmations */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 2px 10px" }}>
            <span style={{ fontWeight: 900, fontSize: 15, color: T.coralDeep }}>💬 確認待ち</span>
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
            <span style={{ marginLeft: "auto", fontSize: 11, color: T.inkSoft }}>今月分</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {pending.map((p) => (
              <div
                key={p.id}
                style={{
                  background: T.card,
                  borderRadius: 24,
                  padding: "14px 16px",
                  boxShadow: T.cardShadow,
                  border: `1.5px solid ${T.coralSoft}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 13,
                      background: T.coralSoft,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                    }}
                  >
                    {p.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: T.coral,
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        要確認
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: T.inkSoft,
                        marginTop: 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>{p.group_name}</span>
                      <span>·</span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                        前回 ¥{yenSlim(p.last_amount)}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: T.bgSoft,
                      border: `1px solid ${T.hair}`,
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 11,
                      color: T.inkSoft,
                    }}
                  >
                    {p.billing_day}日
                  </div>
                </div>

                {/* Confirm amount input + button */}
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
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handle_confirm(p)}
                    disabled={confirming_id === p.id}
                    style={{
                      flex: 1,
                      border: "none",
                      background: T.coral,
                      color: "#fff",
                      padding: "11px",
                      borderRadius: 14,
                      fontFamily: "inherit",
                      fontWeight: 700,
                      fontSize: 13,
                      boxShadow: `0 4px 0 ${T.coralDeep}`,
                      cursor: "pointer",
                      opacity: confirming_id === p.id ? 0.7 : 1,
                    }}
                  >
                    {confirming_id === p.id ? "確定中…" : "金額を確定"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!is_loading && recurring && (
        <>
          {/* Recurring list */}
          <div style={{ display: "flex", alignItems: "center", margin: "4px 2px 10px" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>繰り返し設定</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: T.inkSoft }}>
              {recurring.length}件
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recurring.map((r) => {
              const is_fixed = r.type === "fixed";
              return (
                <div
                  key={r.id}
                  style={{
                    background: T.card,
                    borderRadius: 24,
                    padding: "14px 16px",
                    boxShadow: T.cardShadow,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        background: T.bgSoft,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                      }}
                    >
                      {r.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: "#E5EEF7",
                            color: "#3F6B91",
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          毎月 {r.billing_day}日
                        </span>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: is_fixed ? T.sageSoft : T.mustardSoft,
                            color: is_fixed ? T.sageDeep : T.mustardDeep,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {is_fixed ? "固定" : "要確認"}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 700,
                          fontSize: 15,
                          color: r.amount ? T.ink : T.inkSoft,
                        }}
                      >
                        {r.amount ? yen(r.amount) : "—"}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          type="button"
                          aria-label="編集"
                          onClick={() => recurring_form.openEdit(r)}
                          style={{
                            width: 30,
                            height: 30,
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
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          aria-label="削除"
                          onClick={() => handle_delete(r.id)}
                          style={{
                            width: 30,
                            height: 30,
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
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={recurring_form.openCreate}
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
        ＋ 定期支出を追加
      </button>

      {recurring_form.form && (
        <RecurringSheet
          recurring_form={recurring_form}
          expense_categories={fixed_expense_categories}
        />
      )}
    </div>
  );
}
