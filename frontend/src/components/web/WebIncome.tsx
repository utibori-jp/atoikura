import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";
import { EmojiPicker } from "../EmojiPicker";
import { DateField } from "../DateField";
import { Modal } from "../Modal";
import {
  useEntityForm,
  FormField,
  AmountField,
  SelectField,
  FormError,
  inputStyle,
} from "../forms";

type IncomeRecord = components["schemas"]["IncomeRecord"];
type BaseIncomeSetting = components["schemas"]["BaseIncomeSetting"];
type SavingsGoal = components["schemas"]["SavingsGoal"];
type SurplusAllocation = components["schemas"]["SurplusAllocation"];

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

// Fixed emoji choices for income records; the first is the pre-filled default.
const INCOME_EMOJI_OPTIONS = ["🏢", "💼", "📈", "💰", "🎁", "⭐"];
const DEFAULT_INCOME_EMOJI = INCOME_EMOJI_OPTIONS[0];

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
    emoji: DEFAULT_INCOME_EMOJI,
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

// Allocation form state (null = hidden)
interface AllocFormState {
  amount_yen: string;
  destination: "savings" | "budget";
  savings_goal_id: number | null;
}

function blank_alloc_form(savings_goals: SavingsGoal[]): AllocFormState {
  return {
    amount_yen: "",
    destination: "savings",
    savings_goal_id: savings_goals.length > 0 ? savings_goals[0].id : null,
  };
}

export function WebIncome({ onBack }: Props) {
  const current_ym = currentMonthJST();
  const [active_ym, setActiveYm] = useState(current_ym);
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [base_income, setBaseIncome] = useState<BaseIncomeSetting | null>(null);
  const [savings_goals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [surplus_allocations, setSurplusAllocations] = useState<SurplusAllocation[]>([]);

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

  const refresh_allocations = async () => {
    const res = await api.listSurplusAllocations(active_ym);
    setSurplusAllocations(res.surplus_allocations);
  };

  const refresh_savings_goals = async () => {
    const res = await api.listSavingsGoals();
    setSavingsGoals(res.savings_goals);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.listIncomeRecords(active_ym),
      api.getBaseIncome(),
      api.listSavingsGoals(),
      api.listSurplusAllocations(active_ym),
    ])
      .then(([income_res, base_res, goals_res, allocs_res]) => {
        if (cancelled) return;
        setRecords(income_res.income_records);
        setBaseIncome(base_res);
        setSavingsGoals(goals_res.savings_goals);
        setSurplusAllocations(allocs_res.surplus_allocations);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active_ym]);

  const income_total = records.reduce((s, r) => s + r.amount, 0);
  const base_amount = base_income?.amount ?? 0;
  const surplus = income_total - base_amount;
  const allocated_total = surplus_allocations.reduce((s, a) => s + a.amount, 0);
  const unallocated = Math.max(0, surplus - allocated_total);

  const days_with_income = [...new Set(records.map((r) => r.transaction_date))].sort().reverse();

  const handle_delete = async (id: number) => {
    if (!window.confirm("この収入記録を削除しますか？")) return;
    await api.deleteIncomeRecord(id).catch(() => {});
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  // Income record create / edit form.
  const income_form = useEntityForm<IncomeRecordFormState, IncomeRecord>({
    // Default transaction date to the first day of the active month.
    blank: () => blank_income_form(`${active_ym}-01`),
    fromEntity: income_record_to_form,
    validate: (f) => {
      if (!f.name.trim()) return "名前を入力してください";
      const parsed_amount = parseInt(f.amount_yen, 10);
      if (isNaN(parsed_amount) || parsed_amount < 1) return "金額を正しく入力してください";
      if (!f.transaction_date) return "日付を入力してください";
      return null;
    },
    onSubmit: async (f) => {
      const request_body: components["schemas"]["IncomeRecordRequest"] = {
        name: f.name.trim(),
        emoji: f.emoji.trim() || DEFAULT_INCOME_EMOJI,
        amount: parseInt(f.amount_yen, 10),
        transaction_date: f.transaction_date,
        income_type: f.income_type as "salary" | "side" | "bonus" | "oneoff",
        note: f.note.trim() || undefined,
      };
      if (f.id !== null) {
        await api.updateIncomeRecord(f.id, request_body);
      } else {
        await api.createIncomeRecord(request_body);
      }
      await refresh_records();
    },
  });

  // Surplus allocation form (create-only).
  const alloc_form = useEntityForm<AllocFormState, never>({
    blank: () => blank_alloc_form(savings_goals),
    fromEntity: () => blank_alloc_form(savings_goals),
    validate: (f) => {
      const parsed_amount = parseInt(f.amount_yen, 10);
      if (isNaN(parsed_amount) || parsed_amount <= 0 || parsed_amount > unallocated)
        return "金額を正しく入力してください（余剰以内）";
      if (f.destination === "savings" && f.savings_goal_id === null)
        return "貯金目標を選択してください";
      return null;
    },
    onSubmit: async (f) => {
      await api.createSurplusAllocation({
        year_month: active_ym,
        amount: parseInt(f.amount_yen, 10),
        destination: f.destination,
        ...(f.destination === "savings" && f.savings_goal_id !== null
          ? { savings_goal_id: f.savings_goal_id }
          : {}),
      });
      await refresh_allocations();
      await refresh_savings_goals();
    },
  });

  // Base-income inline editor (single-value edit; opens pre-filled with the current base).
  const base_form = useEntityForm<{ amount_yen: string }, BaseIncomeSetting>({
    blank: () => ({ amount_yen: String(base_amount) }),
    fromEntity: (b) => ({ amount_yen: String(b.amount) }),
    validate: (f) => {
      const amount = parseInt(f.amount_yen, 10);
      return isNaN(amount) || amount < 1 ? "基準収入を正しく入力してください" : null;
    },
    onSubmit: async (f) => {
      const res = await api.updateBaseIncome(parseInt(f.amount_yen, 10));
      setBaseIncome(res);
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
          onClick={income_form.openCreate}
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

      {/* Create / edit form as a centered modal popup (#132) */}
      {income_form.form && (
        <Modal
          title={income_form.isEdit ? "収入記録を編集" : "収入を記録"}
          onClose={income_form.close}
          maxWidth={520}
        >
          {/* Row 1: emoji + name */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: "0 0 80px" }}>
              <FormField
                label="絵文字"
                value={income_form.form.emoji}
                onChange={(v) => income_form.setField("emoji", v)}
                placeholder="🏢"
                style={{ textAlign: "center", fontSize: 20 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <FormField
                label="名前"
                value={income_form.form.name}
                onChange={(v) => income_form.setField("name", v)}
                placeholder="6月給与"
              />
            </div>
          </div>

          {/* Quick emoji picker */}
          <div style={{ marginBottom: 12 }}>
            <EmojiPicker
              value={income_form.form.emoji}
              onSelect={(emoji) => income_form.setField("emoji", emoji)}
              options={INCOME_EMOJI_OPTIONS}
              accent={T.sage}
              accentSoft={T.sageSoft}
            />
          </div>

          {/* Row 2: amount + income type */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <AmountField
                label="金額（円）"
                min={1}
                value={income_form.form.amount_yen}
                onChange={(v) => income_form.setField("amount_yen", v)}
                placeholder="280000"
              />
            </div>
            <div style={{ flex: 1 }}>
              <SelectField
                label="収入種別"
                value={income_form.form.income_type}
                onChange={(v) => income_form.setField("income_type", v)}
                options={INCOME_TYPE_OPTIONS}
              />
            </div>
          </div>

          {/* Row 3: transaction date + note */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>日付</div>
              <DateField
                value={income_form.form.transaction_date}
                onChange={(iso) => income_form.setField("transaction_date", iso)}
                ariaLabel="日付"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 2 }}>
              <FormField
                label="メモ（任意）"
                value={income_form.form.note}
                onChange={(v) => income_form.setField("note", v)}
                placeholder="先月繰越分を含む"
              />
            </div>
          </div>

          <FormError message={income_form.error} />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={income_form.submit}
              disabled={income_form.submitting}
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
              {income_form.submitting ? "保存中…" : "保存"}
            </button>
            <button
              onClick={income_form.close}
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
        </Modal>
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
              </div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>
                毎月の見込み・予算の元
              </div>
              {!base_form.form && (
                <button
                  onClick={base_form.openCreate}
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

              {/* Base income edit as a centered modal popup (#132) */}
              {base_form.form && (
                <Modal title="基準収入を編集" onClose={base_form.close} maxWidth={360}>
                  <AmountField
                    label="金額（円）"
                    min={1}
                    value={base_form.form.amount_yen}
                    onChange={(v) => base_form.setField("amount_yen", v)}
                    placeholder="280000"
                  />
                  <FormError message={base_form.error} />
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      onClick={base_form.submit}
                      disabled={base_form.submitting}
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
                      {base_form.submitting ? "保存中…" : "保存"}
                    </button>
                    <button
                      onClick={base_form.close}
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
                </Modal>
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
                {unallocated > 0 && (
                  <span
                    style={{
                      padding: "2px 7px",
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
              <button
                onClick={alloc_form.openCreate}
                style={{
                  marginTop: 10,
                  padding: "9px 16px",
                  border: "none",
                  borderRadius: 999,
                  background: T.mustard,
                  color: T.ink,
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 3px 0 #F0A92E",
                }}
              >
                振り分ける →
              </button>

              {/* Allocation form as a centered modal popup (#132) */}
              {alloc_form.form && (
                <Modal title="余剰を振り分ける" onClose={alloc_form.close} maxWidth={420}>
                  {/* Amount */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>
                      金額（円）※ 余剰 {yen(unallocated)} 以内
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={unallocated}
                      value={alloc_form.form.amount_yen}
                      onChange={(e) => alloc_form.setField("amount_yen", e.target.value)}
                      placeholder={String(unallocated)}
                      style={inputStyle}
                    />
                    {/* Quick-fill chips */}
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {[
                        { label: "全額", value: unallocated },
                        { label: "½", value: Math.floor(unallocated / 2) },
                        { label: "¥10,000", value: 10000 },
                      ].map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => alloc_form.setField("amount_yen", String(chip.value))}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 8,
                            border: `1.5px solid ${String(chip.value) === alloc_form.form!.amount_yen ? T.mustard : T.hair}`,
                            background:
                              String(chip.value) === alloc_form.form!.amount_yen
                                ? T.mustardSoft
                                : "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            color: T.ink,
                          }}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Destination */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>
                      振り分け先
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["savings", "budget"] as const).map((dest) => {
                        const labels = { savings: "貯金", budget: "今月の予算に追加" };
                        const sel = alloc_form.form!.destination === dest;
                        return (
                          <button
                            key={dest}
                            type="button"
                            onClick={() => alloc_form.setField("destination", dest)}
                            style={{
                              padding: "9px 14px",
                              borderRadius: 999,
                              border: `1.5px solid ${sel ? T.coral : T.hair}`,
                              background: sel ? T.coralSoft : "#fff",
                              color: sel ? T.coralDeep : T.ink,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {labels[dest]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Savings goal selector */}
                  {alloc_form.form.destination === "savings" && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>
                        貯金目標
                      </div>
                      <select
                        value={alloc_form.form.savings_goal_id ?? ""}
                        onChange={(e) =>
                          alloc_form.setField(
                            "savings_goal_id",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        style={inputStyle}
                      >
                        <option value="">選択してください</option>
                        {savings_goals.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.emoji} {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <FormError message={alloc_form.error} />

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={alloc_form.submit}
                      disabled={
                        alloc_form.submitting ||
                        !alloc_form.form.amount_yen ||
                        (alloc_form.form.destination === "savings" &&
                          alloc_form.form.savings_goal_id === null)
                      }
                      style={{
                        border: "none",
                        background: T.mustard,
                        color: T.ink,
                        padding: "9px 20px",
                        borderRadius: 999,
                        fontFamily: "inherit",
                        fontWeight: 700,
                        cursor: "pointer",
                        boxShadow: "0 3px 0 #F0A92E",
                      }}
                    >
                      {alloc_form.submitting ? "振り分け中…" : "振り分ける"}
                    </button>
                    <button
                      onClick={alloc_form.close}
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
                </Modal>
              )}
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
                              onClick={() => income_form.openEdit(e)}
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
