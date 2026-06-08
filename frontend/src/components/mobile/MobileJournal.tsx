import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";
import { emojiForGroup } from "./groupEmoji";

type DailyJournalEntries = components["schemas"]["DailyJournalEntries"];
type JournalEntryResponse = components["schemas"]["JournalEntryResponse"];

const COLORS = {
  coralSoft: "#FFE8DD",
  mustardSoft: "#FFF1CC",
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

interface Props {
  year_month: string;
  refresh_token: number;
  onEditEntry: (entry: JournalEntryResponse) => void;
}

function formatDateParts(date_str: string): { day: number; month: number; weekday: string } {
  const [y, m, d] = date_str.split("-").map(Number);
  return {
    day: d,
    month: m,
    weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()],
  };
}

export function MobileJournal({ year_month, refresh_token, onEditEntry }: Props) {
  const [entries, setEntries] = useState<DailyJournalEntries[] | null>(null);
  const [error_message, setErrorMessage] = useState("");
  const [daily_notes_map, setDailyNotesMap] = useState<Record<string, string>>({});
  const [editing_note_date, setEditingNoteDate] = useState<string | null>(null);
  const [note_draft, setNoteDraft] = useState("");
  const [saving_note_date, setSavingNoteDate] = useState<string | null>(null);
  const [deleting_id, setDeletingId] = useState<number | null>(null);
  const [local_refresh, setLocalRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listJournalEntries(year_month), api.getDailyNotes(year_month)])
      .then(([entries_res, notes_res]) => {
        if (cancelled) return;
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
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "取得に失敗しました");
        setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [year_month, refresh_token, local_refresh]);

  const handle_delete = async (id: number) => {
    if (!window.confirm("この仕訳を削除しますか？")) return;
    setDeletingId(id);
    try {
      await api.deleteJournalEntry(id);
      setLocalRefresh((n) => n + 1);
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

  return (
    <div>
      {is_loading && (
        <p style={{ color: T.inkSoft, fontSize: 14, textAlign: "center" }}>読み込み中…</p>
      )}
      {error_message && (
        <p style={{ color: T.coralDeep, fontSize: 14, textAlign: "center" }}>{error_message}</p>
      )}
      {!is_loading && entries !== null && entries.length === 0 && (
        <p style={{ color: T.inkSoft, fontSize: 14, marginTop: 8, textAlign: "center" }}>
          この月はまだ仕訳が登録されていません
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {entries?.map((daily) => {
          const { day, month, weekday } = formatDateParts(daily.date);
          const day_total = daily.journal_entries
            .filter((e) => !e.is_excluded)
            .reduce((s, e) => s + e.amount, 0);
          const note = daily_notes_map[daily.date];
          const is_editing_note = editing_note_date === daily.date;
          return (
            <div key={daily.date}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 2px 8px",
                }}
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
                <button
                  type="button"
                  onClick={() => {
                    if (is_editing_note) {
                      setEditingNoteDate(null);
                    } else {
                      setNoteDraft(note ?? "");
                      setEditingNoteDate(daily.date);
                    }
                  }}
                  style={{
                    marginLeft: 8,
                    background: "transparent",
                    border: "none",
                    color: note ? T.mustard : T.inkSoft,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: "4px 6px",
                    fontFamily: "inherit",
                  }}
                >
                  💬
                </button>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  {yen(day_total)}
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
                {note && !is_editing_note && (
                  <div
                    style={{
                      padding: "10px 12px",
                      margin: "8px 0",
                      borderRadius: 12,
                      background: COLORS.mustardSoft,
                      border: `1px dashed ${T.mustard}`,
                      fontSize: 12,
                      color: T.ink,
                    }}
                  >
                    💬 {note}
                  </div>
                )}
                {is_editing_note && (
                  <div style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                    <textarea
                      value={note_draft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="この日のコメントを入力…"
                      rows={2}
                      style={{ resize: "vertical", fontSize: 13 }}
                      autoFocus
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handle_save_note(daily.date)}
                        disabled={saving_note_date === daily.date}
                        style={{
                          border: "none",
                          background: T.coral,
                          color: "#fff",
                          padding: "8px 16px",
                          borderRadius: 999,
                          fontFamily: "inherit",
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: saving_note_date === daily.date ? "default" : "pointer",
                          boxShadow: `0 3px 0 ${T.coralDeep}`,
                          opacity: saving_note_date === daily.date ? 0.7 : 1,
                        }}
                      >
                        {saving_note_date === daily.date ? "保存中…" : "保存"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNoteDate(null)}
                        style={{
                          background: "transparent",
                          border: `1.5px solid ${T.hair}`,
                          borderRadius: 999,
                          color: T.inkSoft,
                          padding: "8px 14px",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
                {daily.journal_entries.map((e, i) => {
                  const emoji = emojiForGroup(e.group_name);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onEditEntry(e)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 0",
                        borderBottom:
                          i < daily.journal_entries.length - 1 ? `1px solid ${T.hair}` : "none",
                        background: "transparent",
                        border: "none",
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
                          background: e.is_excluded ? "#F4E9DC" : COLORS.coralSoft,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 17,
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
                            gap: 6,
                            color: T.ink,
                          }}
                        >
                          <span
                            style={{
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {e.item ?? e.category_name}
                          </span>
                          {e.is_excluded && (
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: 9,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 6,
                                background: T.excluded,
                                color: "#fff",
                              }}
                            >
                              対象外
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: T.inkSoft,
                            marginTop: 1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {e.category_name}
                          {e.note ? ` · ${e.note}` : ""}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontWeight: 700,
                            fontSize: 15,
                            color: e.is_excluded ? T.inkSoft : T.ink,
                            textDecoration: e.is_excluded ? "line-through" : "none",
                          }}
                        >
                          {yen(e.amount)}
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handle_delete(e.id);
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              ev.stopPropagation();
                              handle_delete(e.id);
                            }
                          }}
                          aria-label="削除"
                          style={{
                            color: deleting_id === e.id ? T.hair : T.inkSoft,
                            cursor: deleting_id === e.id ? "default" : "pointer",
                            padding: 4,
                            fontSize: 14,
                          }}
                        >
                          ✕
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
