import { useState } from "react";
import {
  createJournalEntry,
  listCategoryGroups,
  listExpenseCategories,
  updateJournalEntry,
  type JournalEntryView,
} from "../../data/journal";
import { useLedgerData, useLocalData } from "../../data/ledgerData";
import { T } from "../../theme";
import { emojiForGroup } from "./groupEmoji";
import { DateField } from "../DateField";

const COLORS = {
  coralSoft: "#FFE8DD",
  mustardSoft: "#FFF1CC",
};

const today_jst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

interface Props {
  onSuccess: () => void;
  edit_entry?: JournalEntryView | null;
}

export function MobileEntryForm({ onSuccess, edit_entry }: Props) {
  const is_edit = !!edit_entry;
  const ledger_data = useLedgerData();
  const { data: category_lists } = useLocalData(
    async (loaded_ledger_data) => ({
      category_groups: await listCategoryGroups(loaded_ledger_data),
      expense_categories: await listExpenseCategories(loaded_ledger_data),
    }),
    []
  );
  const category_groups = category_lists?.category_groups ?? [];
  const all_expense_categories = category_lists?.expense_categories ?? [];
  const [chosen_group_id, setChosenGroupId] = useState(edit_entry ? edit_entry.group_id : "");
  // A new entry starts on the first group once the categories have loaded.
  const selected_group_id = chosen_group_id || (edit_entry ? "" : (category_groups[0]?.id ?? ""));
  const [selected_category_id, setSelectedCategoryId] = useState(
    edit_entry ? edit_entry.category_id : ""
  );
  const [transaction_date, setTransactionDate] = useState(
    edit_entry?.transaction_date ?? today_jst()
  );
  const [amount, setAmount] = useState(edit_entry ? String(edit_entry.amount) : "");
  const [item, setItem] = useState(edit_entry?.item ?? "");
  const [is_excluded, setIsExcluded] = useState(edit_entry?.is_excluded ?? false);
  const [note, setNote] = useState(edit_entry?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error_message, setErrorMessage] = useState("");
  const [success_flash, setSuccessFlash] = useState(false);

  const filtered_categories = all_expense_categories.filter(
    (cat) => String(cat.group_id) === selected_group_id
  );

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
      const entry_fields = {
        transaction_date,
        amount: parsed_amount,
        category_id: selected_category_id,
        is_excluded,
        item: item || null,
        note: note || null,
      };
      if (is_edit && edit_entry) {
        await updateJournalEntry(ledger_data, edit_entry.id, entry_fields);
      } else {
        await createJournalEntry(ledger_data, entry_fields);
        setChosenGroupId("");
        setSelectedCategoryId("");
        setAmount("");
        setItem("");
        setIsExcluded(false);
        setNote("");
        setSuccessFlash(true);
        setTimeout(() => setSuccessFlash(false), 1600);
      }
      onSuccess();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handle_submit}>
      {/* Amount field — big */}
      <div
        style={{
          background: T.bgSoft,
          border: `1.5px solid ${T.coral}`,
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
            color: T.coralDeep,
          }}
        >
          ¥
        </span>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={1}
          placeholder="0"
          required
          aria-label="金額"
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 30,
            color: T.ink,
            padding: 0,
          }}
        />
        <span style={{ fontSize: 12, color: T.inkSoft, flexShrink: 0 }}>金額</span>
      </div>

      {/* Item + date row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <label
          style={{
            flex: 1,
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
            borderRadius: 14,
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 11, color: T.inkSoft }}>項目名</span>
          <input
            type="text"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="例: コンビニ弁当"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              fontFamily: "inherit",
              fontWeight: 600,
              fontSize: 14,
              color: T.ink,
              width: "100%",
              minWidth: 0,
            }}
          />
        </label>
        <label
          style={{
            flex: "0 0 130px",
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
            borderRadius: 14,
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <span style={{ fontSize: 11, color: T.inkSoft }}>日付</span>
          <DateField
            value={transaction_date}
            onChange={setTransactionDate}
            required
            ariaLabel="日付"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              fontSize: 14,
              color: T.ink,
              width: "100%",
            }}
          />
        </label>
      </div>

      {/* 大分類 — horizontal scroll */}
      <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>大分類</div>
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 12,
          marginLeft: -20,
          marginRight: -20,
          paddingLeft: 20,
          paddingRight: 20,
        }}
      >
        {category_groups.map((g) => {
          const on = selected_group_id === String(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setChosenGroupId(String(g.id));
                setSelectedCategoryId("");
              }}
              style={{
                flexShrink: 0,
                padding: "9px 14px",
                borderRadius: 999,
                border: `1.5px solid ${on ? T.coral : T.hair}`,
                background: on ? T.coral : "#fff",
                color: on ? "#fff" : T.ink,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span>{emojiForGroup(g.group_name, g.statement_type?.type_code)}</span>
              {g.group_name}
            </button>
          );
        })}
      </div>

      {/* 生活区分 — wrap */}
      <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>
        生活区分
      </div>
      {!selected_group_id ? (
        <p style={{ fontSize: 13, color: T.inkSoft, fontStyle: "italic", margin: "0 0 16px" }}>
          大分類を先に選択してください
        </p>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {filtered_categories.map((cat) => {
            const on = selected_category_id === String(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() =>
                  setSelectedCategoryId(
                    selected_category_id === String(cat.id) ? "" : String(cat.id)
                  )
                }
                style={{
                  padding: "9px 14px",
                  borderRadius: 999,
                  border: `1.5px solid ${on ? T.mustard : T.hair}`,
                  background: on ? COLORS.mustardSoft : "#fff",
                  color: T.ink,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                {cat.category_name}
              </button>
            );
          })}
        </div>
      )}

      {/* Memo */}
      <label
        style={{
          display: "block",
          background: T.bgSoft,
          border: `1.5px solid ${T.hair}`,
          borderRadius: 14,
          padding: "10px 14px",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 11, color: T.inkSoft, display: "block", marginBottom: 3 }}>
          メモ
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="メモを残す…"
          rows={2}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            padding: 0,
            fontFamily: "inherit",
            fontSize: 14,
            color: T.ink,
            width: "100%",
            resize: "vertical",
            minHeight: 36,
          }}
        />
      </label>

      {/* Exclude pill toggle */}
      <button
        type="button"
        onClick={() => setIsExcluded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "transparent",
          border: "none",
          padding: 0,
          marginBottom: 16,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            width: 42,
            height: 25,
            borderRadius: 999,
            background: is_excluded ? T.coral : T.hair,
            position: "relative",
            flexShrink: 0,
            transition: "background 0.15s",
            display: "inline-block",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: is_excluded ? 19 : 2,
              top: 2,
              width: 21,
              height: 21,
              borderRadius: 999,
              background: "#fff",
              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              transition: "left 0.15s",
            }}
          />
        </span>
        <span style={{ fontSize: 13, color: T.inkSoft }}>集計から除外する（記念日など）</span>
      </button>

      {error_message && (
        <p style={{ color: T.coralDeep, fontSize: 13, marginBottom: 10 }}>{error_message}</p>
      )}
      {success_flash && (
        <p style={{ color: T.sageDeep, fontSize: 13, marginBottom: 10, fontWeight: 600 }}>
          🌞 記録しました
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          width: "100%",
          border: "none",
          background: submitting ? T.coralDeep : T.coral,
          color: "#fff",
          padding: "16px",
          borderRadius: 18,
          fontFamily: "inherit",
          fontWeight: 700,
          fontSize: 16,
          cursor: submitting ? "default" : "pointer",
          boxShadow: submitting ? "none" : `0 6px 0 ${T.coralDeep}`,
          opacity: submitting ? 0.8 : 1,
        }}
      >
        {submitting ? "送信中…" : is_edit ? "保存する" : "＋ 記録する"}
      </button>
    </form>
  );
}
