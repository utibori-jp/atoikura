import { useEffect, useRef, useState } from "react";
import { deleteJournalEntry, listJournalDays, type JournalEntryView } from "../../data/journal";
import { useLedgerData, useLocalData } from "../../data/ledgerData";
import { listDailyNotes, saveDailyNote } from "../../data/notes";
import { T } from "../../theme";
import { MonthSwitcher } from "../MonthSwitcher";
import { useConfirm } from "../dialogContext";
import { emojiForGroup } from "../mobile/groupEmoji";

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateParts(date_str: string): { day: number; month: number; weekday: string } {
  const [y, m, d] = date_str.split("-").map(Number);
  return { day: d, month: m, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] };
}

interface Props {
  year_month: string;
  onYearMonthChange: (year_month: string) => void;
  onEditEntry: (entry: JournalEntryView) => void;
}

function DailyNoteField({ date, initial_note }: { date: string; initial_note: string }) {
  const ledger_data = useLedgerData();
  const [value, setValue] = useState(initial_note);
  const [saving, setSaving] = useState(false);
  const save_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const is_focused = useRef(false);

  // Follow changes from a sync, but never while the user is typing: the saved
  // value would overwrite what they typed after it.
  useEffect(() => {
    if (is_focused.current) return;
    void Promise.resolve().then(() => setValue(initial_note));
  }, [initial_note]);

  const handle_change = (new_val: string) => {
    setValue(new_val);
    if (save_timer.current) clearTimeout(save_timer.current);
    save_timer.current = setTimeout(() => {
      setSaving(true);
      saveDailyNote(ledger_data, date, new_val.trim())
        .catch(() => {})
        .finally(() => setSaving(false));
    }, 800);
  };

  const is_filled = value.trim() !== "";
  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => handle_change(e.target.value)}
        onFocus={() => {
          is_focused.current = true;
        }}
        onBlur={() => {
          is_focused.current = false;
        }}
        placeholder="💭 この日のひとことを残す…"
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 14,
          background: is_filled ? "#FFF6E5" : T.bgSoft,
          border: `1px dashed ${is_filled ? T.mustard : T.hair}`,
          fontSize: 13,
          color: is_filled ? T.ink : T.inkSoft,
          fontStyle: is_filled ? "normal" : "italic",
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {saving && (
        <span
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 11,
            color: T.inkSoft,
          }}
        >
          保存中…
        </span>
      )}
    </div>
  );
}

export function WebJournal({ year_month, onYearMonthChange, onEditEntry }: Props) {
  const confirm = useConfirm();
  const ledger_data = useLedgerData();
  const { data: journal_data, error_message: load_error_message } = useLocalData(
    async (loaded_ledger_data) => ({
      journal_days: await listJournalDays(loaded_ledger_data, year_month),
      daily_notes: await listDailyNotes(loaded_ledger_data, year_month),
    }),
    [year_month]
  );
  const entries = journal_data?.journal_days ?? null;
  const daily_notes = journal_data?.daily_notes ?? {};
  const [delete_error_message, setDeleteErrorMessage] = useState("");
  const error_msg = delete_error_message || load_error_message;
  const [deleting_id, setDeletingId] = useState<string | null>(null);
  const [search_query, setSearchQuery] = useState("");

  const handle_delete = async (id: string) => {
    const confirmed = await confirm({
      title: "削除の確認",
      message: "この仕訳を削除しますか？",
      confirmLabel: "削除",
      danger: true,
    });
    if (!confirmed) return;
    setDeletingId(id);
    try {
      setDeleteErrorMessage("");
      await deleteJournalEntry(ledger_data, id);
    } catch (delete_error) {
      setDeleteErrorMessage(
        delete_error instanceof Error ? delete_error.message : "削除に失敗しました"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const filtered_days = entries
    ? entries.filter(
        (d) =>
          search_query === "" ||
          d.journal_entries.some(
            (e) =>
              (e.item ?? "").includes(search_query) ||
              (e.category_name ?? "").includes(search_query) ||
              (e.group_name ?? "").includes(search_query)
          )
      )
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: "-0.01em",
            }}
          >
            仕訳一覧
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>
            日ごとの記録をふりかえり、コメントを残せます
          </div>
        </div>
      </div>

      <div
        style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}
      >
        <MonthSwitcher year_month={year_month} onYearMonthChange={onYearMonthChange} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            // Same height as the month switcher next to it.
            height: 32,
            boxSizing: "border-box",
            padding: "0 14px",
            borderRadius: 999,
            background: "#fff",
            border: `1.5px solid ${T.hair}`,
            fontSize: 13,
            color: T.inkSoft,
          }}
        >
          <span>🔍</span>
          <input
            type="text"
            placeholder="検索"
            value={search_query}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              padding: 0,
              fontFamily: "inherit",
              fontSize: 13,
              color: T.ink,
              width: 120,
            }}
          />
        </div>
      </div>

      {error_msg && <div style={{ color: T.coralDeep, fontSize: 13 }}>{error_msg}</div>}

      {filtered_days === null ? (
        <div style={{ padding: 32, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>
          読み込み中…
        </div>
      ) : filtered_days.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>
          {search_query ? "該当する記録が見つかりません" : "この月の仕訳はありません"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {filtered_days.map((day) => {
            const { day: d_num, month: m_num, weekday } = formatDateParts(day.date);
            const day_total = day.journal_entries
              .filter((e) => !e.is_excluded)
              .reduce((s, e) => s + e.amount, 0);
            const note = daily_notes[day.date] ?? "";

            return (
              <div
                key={day.date}
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
                    alignItems: "flex-start",
                    gap: 18,
                    paddingBottom: 14,
                    borderBottom: `1.5px solid ${T.hair}`,
                  }}
                >
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 20,
                      background: T.bgSoft,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1.5px solid ${T.hair}`,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: 22,
                        lineHeight: 1,
                      }}
                    >
                      {d_num}
                    </div>
                    <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 2 }}>{m_num}月</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                          fontWeight: 700,
                          fontSize: 16,
                        }}
                      >
                        {weekday}曜日
                      </div>
                      <div
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 700,
                          fontSize: 18,
                          marginLeft: "auto",
                        }}
                      >
                        {yen(day_total)}
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <DailyNoteField date={day.date} initial_note={note} />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                  {day.journal_entries.map((e) => {
                    const emoji = emojiForGroup(e.group_name ?? "");
                    return (
                      <div
                        key={e.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          padding: "12px 6px",
                          borderBottom: `1px solid ${T.hair}`,
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            background: e.is_excluded ? "#F4E9DC" : "#FFE8DD",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 18,
                            flexShrink: 0,
                          }}
                        >
                          {emoji}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 14,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: 220,
                              }}
                            >
                              {e.item ?? e.category_name}
                            </span>
                            {e.is_recurring && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  background: "#E5EEF7",
                                  color: "#3F6B91",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                🔁 定期
                              </span>
                            )}
                            {e.is_excluded && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  background: T.excluded,
                                  color: "#fff",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                対象外
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                            {e.group_name} · {e.category_name}
                            {e.note && ` — ${e.note}`}
                          </div>
                        </div>
                        <div
                          style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontWeight: 700,
                            fontSize: 16,
                            color: e.is_excluded ? T.inkSoft : T.ink,
                            textDecoration: e.is_excluded ? "line-through" : "none",
                            flexShrink: 0,
                          }}
                        >
                          {yen(e.amount)}
                        </div>
                        {e.can_edit && (
                          <div style={{ display: "flex", gap: 6, opacity: 0.5, flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => onEditEntry(e)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 8,
                                fontSize: 12,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              disabled={deleting_id === e.id}
                              onClick={() => handle_delete(e.id)}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 8,
                                fontSize: 12,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                            >
                              🗑
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
