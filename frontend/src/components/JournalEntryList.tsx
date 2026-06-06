import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { components } from "../api/types";
import { T } from "../theme";

type DailyJournalEntries = components["schemas"]["DailyJournalEntries"];
type JournalEntryResponse = components["schemas"]["JournalEntryResponse"];
type CategoryGroup = components["schemas"]["CategoryGroup"];
type ExpenseCategory = components["schemas"]["ExpenseCategory"];

interface Props {
  year_month: string;
  refresh_token: number;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDayHeader(date_str: string): { day: number; weekday: string } {
  const [y, m, d] = date_str.split("-").map(Number);
  return { day: d, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] };
}

function PencilIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

interface EditFormProps {
  entry: JournalEntryResponse;
  category_groups: CategoryGroup[];
  all_expense_categories: ExpenseCategory[];
  onSave: () => void;
  onCancel: () => void;
}

function InlineEditForm({
  entry,
  category_groups,
  all_expense_categories,
  onSave,
  onCancel,
}: EditFormProps) {
  const [transaction_date, setTransactionDate] = useState(entry.transaction_date);
  const [amount, setAmount] = useState(String(entry.amount));
  const [item, setItem] = useState(entry.item ?? "");
  const [selected_group_id, setSelectedGroupId] = useState(String(entry.group_id));
  const [selected_category_id, setSelectedCategoryId] = useState(String(entry.category_id));
  const [is_excluded, setIsExcluded] = useState(entry.is_excluded);
  const [note, setNote] = useState(entry.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error_message, setErrorMessage] = useState("");

  const filtered_categories = all_expense_categories.filter(
    (cat) => String(cat.group_id) === selected_group_id
  );

  const handle_group_change = (group_id: string) => {
    setSelectedGroupId(group_id);
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
      await api.updateJournalEntry(entry.id, {
        transaction_date,
        amount: parsed_amount,
        category_id: parseInt(selected_category_id, 10),
        is_excluded,
        item: item || null,
        note: note || null,
      });
      onSave();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "更新に失敗しました");
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handle_submit}
      style={{
        padding: 18,
        background: T.bgSoft,
        borderRadius: 16,
        border: `1.5px solid ${T.hair}`,
        margin: "6px 0",
      }}
    >
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>日付</label>
          <input
            type="date"
            value={transaction_date}
            onChange={(e) => setTransactionDate(e.target.value)}
            required
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>金額</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={1}
            required
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>項目名</label>
          <input
            type="text"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="例: コンビニ弁当"
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>大分類</label>
          <select value={selected_group_id} onChange={(e) => handle_group_change(e.target.value)}>
            <option value="">選択してください</option>
            {category_groups.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.group_name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>生活区分</label>
          <select
            value={selected_category_id}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            disabled={!selected_group_id}
            style={{ opacity: selected_group_id ? 1 : 0.5 }}
          >
            <option value="">{selected_group_id ? "選択してください" : "大分類を先に選択"}</option>
            {filtered_categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.category_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            fontSize: 12,
            color: T.inkSoft,
            fontWeight: 600,
            display: "block",
            marginBottom: 4,
          }}
        >
          メモ
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="メモを入力..."
          rows={2}
          style={{ resize: "vertical" }}
        />
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: T.inkSoft,
          cursor: "pointer",
          marginBottom: 14,
        }}
      >
        <input
          type="checkbox"
          checked={is_excluded}
          onChange={(e) => setIsExcluded(e.target.checked)}
          style={{ width: "auto" }}
        />
        集計から除外
      </label>
      {error_message && (
        <p style={{ color: T.coralDeep, fontSize: 12, marginBottom: 10 }}>{error_message}</p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            border: "none",
            background: T.coral,
            color: "#fff",
            padding: "8px 20px",
            borderRadius: 999,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 13,
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
            boxShadow: `0 3px 0 ${T.coralDeep}`,
          }}
        >
          {submitting ? "保存中..." : "保存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            border: `1.5px solid ${T.hair}`,
            borderRadius: 999,
            color: T.inkSoft,
            padding: "8px 18px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}

export function JournalEntryList({ year_month, refresh_token }: Props) {
  const [entries, setEntries] = useState<DailyJournalEntries[] | null>(null);
  const [error_message, setErrorMessage] = useState("");
  const [local_refresh, setLocalRefresh] = useState(0);
  const [editing_entry, setEditingEntry] = useState<JournalEntryResponse | null>(null);
  const [deleting_id, setDeletingId] = useState<number | null>(null);
  const [category_groups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [all_expense_categories, setAllExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [daily_notes_map, setDailyNotesMap] = useState<Record<string, string>>({});
  const [editing_note_date, setEditingNoteDate] = useState<string | null>(null);
  const [note_draft, setNoteDraft] = useState("");
  const [saving_note_date, setSavingNoteDate] = useState<string | null>(null);

  useEffect(() => {
    api.listCategoryGroups().then((res) => setCategoryGroups(res.category_groups));
    api.listExpenseCategories().then((res) => setAllExpenseCategories(res.expense_categories));
  }, []);

  useEffect(() => {
    let is_cancelled = false;
    Promise.all([api.listJournalEntries(year_month), api.getDailyNotes(year_month)])
      .then(([entries_res, notes_res]) => {
        if (is_cancelled) return;
        setErrorMessage("");
        setEditingNoteDate(null);
        setEntries(entries_res.entries);
        const notes_map: Record<string, string> = {};
        for (const n of notes_res.notes) {
          if (n.note != null) notes_map[n.date] = n.note;
        }
        setDailyNotesMap(notes_map);
      })
      .catch((err) => {
        if (!is_cancelled) {
          setErrorMessage(err instanceof Error ? err.message : "取得に失敗しました");
          setEntries([]);
        }
      });
    return () => {
      is_cancelled = true;
    };
  }, [year_month, refresh_token, local_refresh]);

  const refresh = () => {
    setEditingEntry(null);
    setLocalRefresh((n) => n + 1);
  };

  const handle_delete = async (id: number) => {
    if (!window.confirm("この仕訳を削除しますか？")) return;
    setDeletingId(id);
    try {
      await api.deleteJournalEntry(id);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  const handle_save_note = async (date: string) => {
    setSavingNoteDate(date);
    try {
      const saved = await api.updateDailyNote(date, note_draft.trim());
      setDailyNotesMap((prev) => {
        const next = { ...prev };
        if (saved.note == null || saved.note === "") delete next[date];
        else next[date] = saved.note;
        return next;
      });
      setEditingNoteDate(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "コメントの保存に失敗しました");
    } finally {
      setSavingNoteDate(null);
    }
  };

  const is_loading = entries === null && !error_message;
  const monthly_total = entries
    ? entries
        .flatMap((d) => d.journal_entries)
        .filter((e) => !e.is_excluded)
        .reduce((sum, e) => sum + e.amount, 0)
    : 0;

  return (
    <div>
      {/* Monthly total pill */}
      <div
        style={{
          background: "#DEF1E6",
          borderRadius: 24,
          padding: "18px 24px",
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 14, color: T.sageDeep, fontWeight: 700 }}>
          今月の合計（変動費）
        </span>
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 26,
            fontWeight: 700,
            color: T.ink,
            letterSpacing: "-0.5px",
          }}
        >
          {is_loading ? "—" : `¥${monthly_total.toLocaleString()}`}
        </span>
      </div>

      {is_loading && <p style={{ color: T.inkSoft, fontSize: 14 }}>読み込み中...</p>}
      {error_message && <p style={{ color: T.coralDeep, fontSize: 14 }}>{error_message}</p>}

      {!is_loading && entries !== null && entries.length === 0 && (
        <p style={{ color: T.inkSoft, fontSize: 14, marginTop: 8 }}>
          この月はまだ仕訳が登録されていません
        </p>
      )}

      {entries !== null &&
        entries.map((daily) => {
          const { day, weekday } = formatDayHeader(daily.date);
          const daily_total = daily.journal_entries.reduce((s, e) => s + e.amount, 0);
          const note = daily_notes_map[daily.date];

          return (
            <div
              key={daily.date}
              style={{
                background: T.card,
                borderRadius: 28,
                marginBottom: 16,
                boxShadow: T.cardShadow,
                overflow: "hidden",
              }}
            >
              {/* Day header */}
              <div
                style={{
                  padding: "16px 20px 0",
                  borderBottom: `1.5px solid ${T.hair}`,
                  paddingBottom: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                  {/* Date badge */}
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 18,
                      background: T.bgSoft,
                      border: `1.5px solid ${T.hair}`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: 22,
                        lineHeight: 1,
                        color: T.ink,
                      }}
                    >
                      {day}
                    </span>
                    <span style={{ fontSize: 10, color: T.inkSoft, marginTop: 2 }}>
                      {weekday}曜日
                    </span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 700,
                          fontSize: 18,
                          marginLeft: "auto",
                          color: T.ink,
                        }}
                      >
                        ¥{daily_total.toLocaleString()}
                      </span>
                      <button
                        onClick={() => {
                          if (editing_note_date === daily.date) {
                            setEditingNoteDate(null);
                          } else {
                            setNoteDraft(daily_notes_map[daily.date] ?? "");
                            setEditingNoteDate(daily.date);
                          }
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          background: "transparent",
                          border: "none",
                          color: note ? T.mustard : T.inkSoft,
                          fontSize: 13,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        💭 コメント
                      </button>
                    </div>

                    {/* Note preview or editor */}
                    {note && editing_note_date !== daily.date && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "8px 12px",
                          borderRadius: 12,
                          background: "#FFF6E5",
                          border: `1px dashed ${T.mustard}`,
                          fontSize: 13,
                          color: T.ink,
                        }}
                      >
                        {note}
                      </div>
                    )}
                    {editing_note_date === daily.date && (
                      <div
                        style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}
                      >
                        <textarea
                          value={note_draft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="この日のコメントを入力..."
                          rows={2}
                          style={{ resize: "vertical", fontSize: 13 }}
                          autoFocus
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handle_save_note(daily.date)}
                            disabled={saving_note_date === daily.date}
                            style={{
                              border: "none",
                              background: T.coral,
                              color: "#fff",
                              padding: "6px 16px",
                              borderRadius: 999,
                              fontFamily: "inherit",
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: saving_note_date === daily.date ? "default" : "pointer",
                              boxShadow: `0 3px 0 ${T.coralDeep}`,
                              opacity: saving_note_date === daily.date ? 0.7 : 1,
                            }}
                          >
                            {saving_note_date === daily.date ? "保存中..." : "保存"}
                          </button>
                          <button
                            onClick={() => setEditingNoteDate(null)}
                            style={{
                              background: "transparent",
                              border: `1.5px solid ${T.hair}`,
                              borderRadius: 999,
                              color: T.inkSoft,
                              padding: "6px 14px",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Entry rows */}
              {daily.journal_entries.map((entry, idx) => (
                <div key={entry.id}>
                  {editing_entry?.id === entry.id ? (
                    <div style={{ padding: "8px 16px" }}>
                      <InlineEditForm
                        entry={editing_entry}
                        category_groups={category_groups}
                        all_expense_categories={all_expense_categories}
                        onSave={refresh}
                        onCancel={() => setEditingEntry(null)}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "12px 20px",
                        borderBottom:
                          idx < daily.journal_entries.length - 1 ? `1px solid ${T.hair}` : "none",
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              color: entry.is_excluded ? T.inkSoft : T.ink,
                            }}
                          >
                            {entry.item ?? "—"}
                          </span>
                          <span
                            style={{
                              background: T.bgSoft,
                              borderRadius: 6,
                              fontSize: 11,
                              padding: "2px 8px",
                              color: T.inkSoft,
                              border: `1px solid ${T.hair}`,
                            }}
                          >
                            {entry.group_name}
                          </span>
                          <span
                            style={{
                              background: T.bgSoft,
                              borderRadius: 6,
                              fontSize: 11,
                              padding: "2px 8px",
                              color: T.inkSoft,
                              border: `1px solid ${T.hair}`,
                            }}
                          >
                            {entry.category_name}
                          </span>
                          {entry.is_excluded && (
                            <span
                              style={{
                                background: T.excluded,
                                borderRadius: 6,
                                fontSize: 11,
                                padding: "2px 8px",
                                color: "#fff",
                                fontWeight: 700,
                              }}
                            >
                              対象外
                            </span>
                          )}
                        </div>
                        {entry.note && (
                          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 3 }}>
                            {entry.note}
                          </div>
                        )}
                      </div>

                      <div
                        style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}
                      >
                        <span
                          style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: 15,
                            fontWeight: 700,
                            color: entry.is_excluded ? T.inkSoft : T.ink,
                            textDecoration: entry.is_excluded ? "line-through" : "none",
                          }}
                        >
                          ¥{entry.amount.toLocaleString()}
                        </span>
                        <button
                          onClick={() => setEditingEntry(entry)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: T.inkSoft,
                            cursor: "pointer",
                            padding: 4,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          onClick={() => handle_delete(entry.id)}
                          disabled={deleting_id === entry.id}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: deleting_id === entry.id ? T.hair : T.coralDeep,
                            cursor: deleting_id === entry.id ? "default" : "pointer",
                            padding: 4,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
    </div>
  );
}
