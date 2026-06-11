import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";
import { emojiForGroup } from "../mobile/groupEmoji";

type BreakdownItem = components["schemas"]["MonthlyBreakdownItem"];
type ReviewNote = components["schemas"]["MonthlyReviewNote"];

interface StatementGroup {
  statement_type_id: number;
  statement_type_name: string;
  category_groups: CategoryGroupData[];
}

interface CategoryGroupData {
  group_id: number;
  group_name: string;
  categories: BreakdownItem[];
  expanded: boolean;
}

function buildGrouped(items: BreakdownItem[]): StatementGroup[] {
  const statement_map = new Map<number, StatementGroup>();
  for (const item of items) {
    if (!statement_map.has(item.statement_type_id)) {
      statement_map.set(item.statement_type_id, {
        statement_type_id: item.statement_type_id,
        statement_type_name: item.statement_type_name,
        category_groups: [],
      });
    }
    const st = statement_map.get(item.statement_type_id)!;
    let cg = st.category_groups.find((g) => g.group_id === item.group_id);
    if (!cg) {
      cg = { group_id: item.group_id, group_name: item.group_name, categories: [], expanded: false };
      st.category_groups.push(cg);
    }
    cg.categories.push(item);
  }
  const result = [...statement_map.values()].sort((a, b) => a.statement_type_id - b.statement_type_id);
  for (const st of result) {
    st.category_groups.sort((a, b) => a.group_name.localeCompare(b.group_name));
    for (const cg of st.category_groups) {
      cg.categories.sort((a, b) => a.category_name.localeCompare(b.category_name));
    }
  }
  return result;
}

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

function addMonths(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

const STATEMENT_COLORS: Record<string, string> = {
  変動費: T.coral,
  固定費: T.sageDeep,
  対象外: T.excluded,
};

interface StatPillProps {
  tone: "sage" | "mustard" | "coral";
  label: string;
  value: string;
  sub: string;
}

function StatPill({ tone, label, value, sub }: StatPillProps) {
  const bg = { coral: "#FFE8DD", mustard: "#FFF1CC", sage: "#DEF1E6" }[tone];
  const fg = { coral: T.coralDeep, mustard: "#A3791F", sage: T.sageDeep }[tone];
  return (
    <div style={{ background: bg, borderRadius: 24, padding: "18px 22px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: fg, fontWeight: 700, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 26, color: T.ink, marginTop: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export function WebReview() {
  const current_ym = currentMonthJST();
  const available_months = [
    addMonths(current_ym, -2),
    addMonths(current_ym, -1),
    current_ym,
    addMonths(current_ym, 1),
  ];
  const [year_month, setYearMonth] = useState(addMonths(current_ym, -1));
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [memos, setMemos] = useState<Record<number, string>>({});
  const [saved_memos, setSavedMemos] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [save_msg, setSaveMsg] = useState("");
  const [expanded_groups, setExpandedGroups] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.getMonthlyBreakdown(year_month), api.getMonthlyReviews(year_month)])
      .then(([breakdown_res, reviews_res]) => {
        if (cancelled) return;
        const memo_map: Record<number, string> = {};
        for (const n of reviews_res.notes) {
          memo_map[n.category_id] = n.note;
        }
        setBreakdown(breakdown_res.breakdown);
        setMemos(memo_map);
        setSavedMemos(memo_map);
        setSaveMsg("");
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year_month]);

  const grouped = buildGrouped(breakdown);

  const handle_save = async () => {
    setSaving(true);
    setSaveMsg("");
    const notes: ReviewNote[] = Object.entries(memos)
      .filter(([, note]) => note !== "")
      .map(([id, note]) => ({ category_id: Number(id), note }));
    try {
      const res = await api.updateMonthlyReviews(year_month, notes);
      const new_saved: Record<number, string> = {};
      for (const n of res.notes) new_saved[n.category_id] = n.note;
      setSavedMemos(new_saved);
      setMemos(new_saved);
      setSaveMsg("保存しました");
    } catch {
      setSaveMsg("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const variable_total = grouped.find((s) => s.statement_type_name === "変動費")?.category_groups
    .reduce((s, g) => s + g.categories.reduce((a, c) => a + c.total, 0), 0) ?? 0;
  const fixed_total = grouped.find((s) => s.statement_type_name === "固定費")?.category_groups
    .reduce((s, g) => s + g.categories.reduce((a, c) => a + c.total, 0), 0) ?? 0;
  const excluded_total = grouped.find((s) => s.statement_type_name === "対象外")?.category_groups
    .reduce((s, g) => s + g.categories.reduce((a, c) => a + c.total, 0), 0) ?? 0;
  const total = variable_total + fixed_total + excluded_total;

  const has_unsaved = JSON.stringify(memos) !== JSON.stringify(saved_memos);

  const month_num = parseInt(year_month.split("-")[1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif", fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em" }}>
            {month_num}月の振り返り
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>使い方の傾向を、月単位で眺めてみる</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {has_unsaved && (
            <span style={{ fontSize: 12, color: T.mustard, fontWeight: 600 }}>未保存の変更</span>
          )}
          {save_msg && (
            <span style={{ fontSize: 12, color: save_msg === "保存しました" ? T.sageDeep : T.coralDeep, fontWeight: 600 }}>
              {save_msg}
            </span>
          )}
          <button
            onClick={handle_save}
            disabled={saving}
            style={{
              border: "none", background: saving ? T.bgSoft : T.coral, color: saving ? T.inkSoft : "#fff",
              padding: "9px 22px", borderRadius: 999,
              fontFamily: "inherit", fontWeight: 700, fontSize: 13,
              cursor: saving ? "default" : "pointer",
              boxShadow: saving ? "none" : `0 4px 0 ${T.coralDeep}`,
            }}
          >
            {saving ? "保存中..." : "メモを保存"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {available_months.map((m) => {
          const active = m === year_month;
          return (
            <button
              key={m}
              onClick={() => setYearMonth(m)}
              style={{
                border: `1.5px solid ${active ? T.coral : T.hair}`,
                background: active ? T.coral : "#fff",
                color: active ? "#fff" : T.ink,
                padding: "10px 16px", borderRadius: 999,
                fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {parseInt(m.split("-")[1])}月
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <StatPill tone="sage" label="変動費合計" value={yen(variable_total)} sub="変動費の月次合計" />
        <StatPill tone="mustard" label="固定費合計" value={yen(fixed_total)} sub="固定費の月次合計" />
        <StatPill tone="coral" label="対象外" value={yen(excluded_total)} sub="集計除外の支出" />
        <StatPill tone="sage" label="総支出" value={yen(total)} sub="全支出の合計" />
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>読み込み中…</div>
      ) : (
        <div style={{ background: T.card, borderRadius: 32, padding: 28, boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)" }}>
          {grouped.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: T.inkSoft, fontSize: 14 }}>
              選択した月の支出データがありません
            </div>
          ) : (
            grouped.map((sec, si) => {
              const sec_color = STATEMENT_COLORS[sec.statement_type_name] ?? T.inkSoft;
              const sec_total = sec.category_groups.reduce(
                (s, g) => s + g.categories.reduce((a, c) => a + c.total, 0), 0
              );
              return (
                <div key={sec.statement_type_id} style={{ marginBottom: si < grouped.length - 1 ? 24 : 0 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 0", borderBottom: `1.5px solid ${T.hair}`, marginBottom: 14,
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: sec_color, flexShrink: 0 }} />
                    <div style={{ fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif", fontWeight: 900, fontSize: 18 }}>
                      {sec.statement_type_name}
                    </div>
                    <div style={{ marginLeft: "auto", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 18 }}>
                      {yen(sec_total)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {sec.category_groups.map((g, gi) => {
                      const group_total = g.categories.reduce((s, c) => s + c.total, 0);
                      const is_expanded = expanded_groups.has(g.group_id);
                      return (
                        <div key={g.group_id} style={{
                          borderRadius: 20,
                          background: gi % 2 === 0 ? T.bgSoft : "#fff",
                          padding: "14px 18px",
                          border: `1.5px solid ${T.hair}`,
                        }}>
                          <div
                            style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                            onClick={() => setExpandedGroups((prev) => {
                              const n = new Set(prev);
                              if (n.has(g.group_id)) n.delete(g.group_id);
                              else n.add(g.group_id);
                              return n;
                            })}
                          >
                            <span style={{ fontSize: 20 }}>{emojiForGroup(g.group_name)}</span>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>{g.group_name}</span>
                            <span style={{ marginLeft: "auto", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16 }}>
                              {yen(group_total)}
                            </span>
                            <span style={{ fontSize: 12, color: T.inkSoft, marginLeft: 8 }}>
                              {is_expanded ? "▴" : "▾"}
                            </span>
                          </div>
                          {is_expanded && (
                            <div style={{ marginTop: 12, paddingLeft: 32, display: "flex", flexDirection: "column", gap: 8 }}>
                              {g.categories.map((c) => {
                                const memo = memos[c.category_id] ?? "";
                                const is_filled = memo.trim() !== "";
                                return (
                                  <div key={c.category_id} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                                    <div style={{ flex: "0 0 140px", fontSize: 14 }}>{c.category_name}</div>
                                    <div style={{ flex: "0 0 90px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, textAlign: "right" }}>
                                      {yen(c.total)}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <input
                                        type="text"
                                        value={memo}
                                        onChange={(e) => setMemos((prev) => ({ ...prev, [c.category_id]: e.target.value }))}
                                        placeholder="メモを残す…"
                                        style={{
                                          width: "100%",
                                          padding: "6px 12px",
                                          borderRadius: 12,
                                          background: is_filled ? "#FFF6E5" : "transparent",
                                          border: `1px dashed ${is_filled ? T.mustard : T.hair}`,
                                          fontSize: 13,
                                          color: is_filled ? T.ink : T.inkSoft,
                                          fontStyle: is_filled ? "normal" : "italic",
                                          fontFamily: "inherit",
                                          outline: "none",
                                          boxSizing: "border-box",
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
