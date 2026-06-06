import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { components } from "../api/types";
import { T } from "../theme";

type CategoryGroup = components["schemas"]["CategoryGroup"];
type ExpenseCategory = components["schemas"]["ExpenseCategory"];

interface Props {
  onSuccess: () => void;
}

const today_jst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

interface FieldProps {
  label: string;
  children: React.ReactNode;
  flex?: number | string;
}

function Field({ label, children, flex }: FieldProps) {
  return (
    <label
      style={{ display: "flex", flexDirection: "column", gap: 6, flex: flex ?? 1, minWidth: 0 }}
    >
      <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

interface ChipProps {
  active: boolean;
  tone?: "coral" | "mustard";
  onClick: () => void;
  children: React.ReactNode;
}

function Chip({ active, tone = "coral", onClick, children }: ChipProps) {
  const active_bg = tone === "mustard" ? T.mustard : T.coral;
  const active_border = tone === "mustard" ? T.mustard : T.coral;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1.5px solid ${active ? active_border : T.hair}`,
        background: active ? active_bg : "#fff",
        color: active ? "#fff" : T.ink,
        padding: "10px 16px",
        borderRadius: 999,
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub?: string;
}

function Toggle({ checked, onChange, label, sub }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 0,
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          width: 36,
          height: 22,
          borderRadius: 999,
          background: checked ? T.coral : T.hair,
          position: "relative",
          flexShrink: 0,
          transition: "background 0.15s",
          display: "inline-block",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: checked ? 16 : 2,
            top: 2,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            transition: "left 0.15s",
          }}
        />
      </span>
      <span style={{ fontSize: 13, color: T.inkSoft }}>
        {label}
        {sub && <span style={{ fontSize: 11, marginLeft: 4 }}>{sub}</span>}
      </span>
    </button>
  );
}

export function JournalEntryForm({ onSuccess }: Props) {
  const [category_groups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [all_expense_categories, setAllExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [selected_group_id, setSelectedGroupId] = useState("");
  const [selected_category_id, setSelectedCategoryId] = useState("");
  const [transaction_date, setTransactionDate] = useState(today_jst());
  const [amount, setAmount] = useState("");
  const [item, setItem] = useState("");
  const [is_excluded, setIsExcluded] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error_message, setErrorMessage] = useState("");

  useEffect(() => {
    api.listCategoryGroups().then((res) => setCategoryGroups(res.category_groups));
    api.listExpenseCategories().then((res) => setAllExpenseCategories(res.expense_categories));
  }, []);

  const filtered_categories = all_expense_categories.filter(
    (cat) => String(cat.group_id) === selected_group_id
  );

  const handle_group_select = (group_id: string) => {
    setSelectedGroupId(group_id === selected_group_id ? "" : group_id);
    setSelectedCategoryId("");
  };

  const handle_submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    const parsed_amount = parseInt(amount, 10);
    if (!selected_category_id) {
      setErrorMessage("生活区分を選択してください");
      return;
    }
    if (isNaN(parsed_amount) || parsed_amount < 1) {
      setErrorMessage("金額は1以上の整数を入力してください");
      return;
    }
    setSubmitting(true);
    try {
      await api.createJournalEntry({
        transaction_date,
        amount: parsed_amount,
        category_id: parseInt(selected_category_id, 10),
        is_excluded,
        item: item || null,
        note: note || null,
      });
      setSelectedGroupId("");
      setSelectedCategoryId("");
      setTransactionDate(today_jst());
      setAmount("");
      setItem("");
      setIsExcluded(false);
      setNote("");
      onSuccess();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handle_submit}>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontSize: 18,
            fontWeight: 700,
            color: T.ink,
          }}
        >
          支出を記録
        </h2>
        <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>サクッと入力してすぐ反映</p>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        <Field label="日付" flex="0 0 160px">
          <input
            type="date"
            value={transaction_date}
            onChange={(e) => setTransactionDate(e.target.value)}
            required
          />
        </Field>
        <Field label="金額" flex="0 0 140px">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            placeholder="¥0"
            required
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16 }}
          />
        </Field>
        <Field label="項目名">
          <input
            type="text"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="例: コンビニ弁当"
          />
        </Field>
      </div>

      {/* 大分類 chips */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>
          大分類
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {category_groups.map((g) => (
            <Chip
              key={g.id}
              active={selected_group_id === String(g.id)}
              tone="coral"
              onClick={() => handle_group_select(String(g.id))}
            >
              {g.group_name}
            </Chip>
          ))}
        </div>
      </div>

      {/* 生活区分 chips */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>
          生活区分
        </div>
        {!selected_group_id ? (
          <p style={{ fontSize: 13, color: T.inkSoft, fontStyle: "italic", margin: 0 }}>
            大分類を先に選択してください
          </p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {filtered_categories.map((cat) => (
              <Chip
                key={cat.id}
                active={selected_category_id === String(cat.id)}
                tone="mustard"
                onClick={() =>
                  setSelectedCategoryId(
                    selected_category_id === String(cat.id) ? "" : String(cat.id)
                  )
                }
              >
                {cat.category_name}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <Field label="メモ">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="メモを入力..."
            rows={2}
            style={{ resize: "vertical" }}
          />
        </Field>
      </div>

      {error_message && (
        <p style={{ color: T.coralDeep, fontSize: 13, marginBottom: 12 }}>{error_message}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Toggle
          checked={is_excluded}
          onChange={setIsExcluded}
          label="集計から除外する"
          sub="（記念日など）"
        />

        <button
          type="submit"
          disabled={submitting}
          style={{
            border: "none",
            background: submitting ? T.coralDeep : T.coral,
            color: "#fff",
            padding: "12px 28px",
            borderRadius: 999,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 15,
            cursor: submitting ? "default" : "pointer",
            boxShadow: submitting ? "none" : `0 4px 0 ${T.coralDeep}`,
            opacity: submitting ? 0.8 : 1,
          }}
        >
          {submitting ? "送信中..." : "＋ 記録する"}
        </button>
      </div>
    </form>
  );
}
