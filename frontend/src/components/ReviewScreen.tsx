import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { components } from "../api/types";
import { T } from "../theme";

type BreakdownItem = components["schemas"]["MonthlyBreakdownItem"];
type ReviewNote = components["schemas"]["MonthlyReviewNote"];

interface StatementGroup {
  statement_type_id: number;
  statement_type_name: string;
  category_groups: CategoryGroup[];
}

interface CategoryGroup {
  group_id: number;
  group_name: string;
  categories: BreakdownItem[];
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
      cg = { group_id: item.group_id, group_name: item.group_name, categories: [] };
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

function prevMonthJST(): string {
  const now = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const [y, m] = now.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthJP(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return `${year}年${month}月`;
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const STATEMENT_COLORS: Record<string, string> = {
  "変動費": T.coral,
  "固定費": T.sageDeep,
  "対象外": T.excluded,
};

type FetchState =
  | { status: "loading" }
  | { status: "done"; breakdown: BreakdownItem[]; memos: Record<number, string> }
  | { status: "error"; message: string };

export function ReviewScreen() {
  const [year_month, setYearMonth] = useState(prevMonthJST());
  const [fetch_state, setFetchState] = useState<FetchState>({ status: "loading" });
  const [memos, setMemos] = useState<Record<number, string>>({});
  const [saved_memos, setSavedMemos] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [save_message, setSaveMessage] = useState<string | null>(null);
  const [collapsed_statements, setCollapsedStatements] = useState<Set<number>>(new Set());
  const [collapsed_groups, setCollapsedGroups] = useState<Set<number>>(new Set());

  const current_month_jst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
  const is_at_limit = year_month >= addMonths(current_month_jst, -1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getMonthlyBreakdown(year_month), api.getMonthlyReviews(year_month)])
      .then(([breakdown_res, reviews_res]) => {
        if (cancelled) return;
        const memo_map: Record<number, string> = {};
        for (const n of reviews_res.notes) { memo_map[n.category_id] = n.note; }
        setFetchState({ status: "done", breakdown: breakdown_res.breakdown, memos: memo_map });
        setMemos(memo_map);
        setSavedMemos(memo_map);
        setSaveMessage(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFetchState({ status: "error", message: err instanceof Error ? err.message : "データ取得に失敗しました" });
      });
    return () => { cancelled = true; setFetchState({ status: "loading" }); };
  }, [year_month]);

  const breakdown = fetch_state.status === "done" ? fetch_state.breakdown : [];

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    const notes: ReviewNote[] = Object.entries(memos)
      .filter(([, note]) => note !== "")
      .map(([id, note]) => ({ category_id: Number(id), note }));
    try {
      const res = await api.updateMonthlyReviews(year_month, notes);
      const new_saved: Record<number, string> = {};
      for (const n of res.notes) { new_saved[n.category_id] = n.note; }
      setSavedMemos(new_saved);
      setMemos(new_saved);
      setSaveMessage("保存しました");
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const grouped = buildGrouped(breakdown);
  const has_unsaved = JSON.stringify(memos) !== JSON.stringify(saved_memos);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontSize: 28, fontWeight: 900, color: T.ink, letterSpacing: "-0.01em" }}>
          {formatMonthJP(year_month)}の振り返り
        </h1>
        <p style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>使い方の傾向を、月単位で眺めてみる</p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setYearMonth(addMonths(year_month, -1))}
            style={{
              width: 32, height: 32, borderRadius: 999, border: `1.5px solid ${T.hair}`,
              background: T.card, color: T.inkSoft, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >‹</button>
          <span style={{
            padding: "6px 18px", borderRadius: 999,
            border: `1.5px solid ${T.hair}`, background: T.card,
            fontSize: 13, fontWeight: 600, color: T.ink,
          }}>{formatMonthJP(year_month)}</span>
          <button
            onClick={() => setYearMonth(addMonths(year_month, 1))}
            disabled={is_at_limit}
            style={{
              width: 32, height: 32, borderRadius: 999, border: `1.5px solid ${T.hair}`,
              background: T.card, color: is_at_limit ? T.hair : T.inkSoft,
              fontSize: 16, cursor: is_at_limit ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >›</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {has_unsaved && (
            <span style={{ fontSize: 12, color: T.mustard, fontWeight: 600 }}>未保存の変更があります</span>
          )}
          {save_message && (
            <span style={{ fontSize: 12, color: save_message === "保存しました" ? T.sageDeep : T.coralDeep, fontWeight: 600 }}>
              {save_message}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              border: "none", background: saving ? T.bgSoft : T.coral, color: saving ? T.inkSoft : "#fff",
              padding: "9px 22px", borderRadius: 999, fontFamily: "inherit", fontWeight: 700, fontSize: 13,
              cursor: saving ? "default" : "pointer",
              boxShadow: saving ? "none" : `0 4px 0 ${T.coralDeep}`,
            }}
          >{saving ? "保存中..." : "保存"}</button>
        </div>
      </div>

      {fetch_state.status === "loading" && (
        <div style={{ color: T.inkSoft, fontSize: 14 }}>読み込み中...</div>
      )}
      {fetch_state.status === "error" && (
        <div style={{ color: T.coralDeep, fontSize: 14 }}>{fetch_state.message}</div>
      )}
      {fetch_state.status === "done" && breakdown.length === 0 && (
        <div style={{ color: T.inkSoft, fontSize: 14, padding: "40px 0", textAlign: "center" }}>
          選択した月の支出データがありません
        </div>
      )}

      {fetch_state.status === "done" && grouped.map((st) => {
        const st_total = st.category_groups.flatMap((cg) => cg.categories).reduce((sum, c) => sum + c.total, 0);
        const st_collapsed = collapsed_statements.has(st.statement_type_id);
        const dotColor = STATEMENT_COLORS[st.statement_type_name] ?? T.inkSoft;

        return (
          <div key={st.statement_type_id} style={{ marginBottom: 16, background: T.card, borderRadius: 24, boxShadow: T.cardShadow, overflow: "hidden" }}>
            {/* Statement type header */}
            <button
              onClick={() => setCollapsedStatements((prev) => {
                const next = new Set(prev);
                if (next.has(st.statement_type_id)) next.delete(st.statement_type_id);
                else next.add(st.statement_type_id);
                return next;
              })}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "16px 20px", background: "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 5, background: dotColor, flexShrink: 0 }} />
              <span style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif", fontWeight: 900, fontSize: 16, color: T.ink, flex: 1 }}>{st.statement_type_name}</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: T.ink }}>{yen(st_total)}</span>
              <span style={{ fontSize: 11, color: T.inkSoft, marginLeft: 8 }}>{st_collapsed ? "▶" : "▼"}</span>
            </button>

            {!st_collapsed && st.category_groups.map((cg) => {
              const cg_total = cg.categories.reduce((sum, c) => sum + c.total, 0);
              const cg_key = st.statement_type_id * 100000 + cg.group_id;
              const cg_collapsed = collapsed_groups.has(cg_key);

              return (
                <div key={`${st.statement_type_id}-${cg.group_id}`} style={{ borderTop: `1px solid ${T.hair}` }}>
                  <button
                    onClick={() => setCollapsedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(cg_key)) next.delete(cg_key);
                      else next.add(cg_key);
                      return next;
                    })}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "12px 20px 12px 36px", background: T.bgSoft,
                      border: "none", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14, color: T.ink, flex: 1 }}>{cg.group_name}</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, color: T.inkSoft }}>{yen(cg_total)}</span>
                    <span style={{ fontSize: 10, color: T.inkSoft, marginLeft: 8 }}>{cg_collapsed ? "▶" : "▼"}</span>
                  </button>

                  {!cg_collapsed && cg.categories.map((cat) => (
                    <div key={cat.category_id} style={{
                      display: "flex", alignItems: "center",
                      padding: "10px 20px 10px 52px",
                      borderTop: `1px solid ${T.hair}`, gap: 14,
                    }}>
                      <span style={{ fontSize: 13, color: T.inkSoft, flex: "0 0 130px" }}>{cat.category_name}</span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: T.ink, flex: "0 0 90px", textAlign: "right" }}>
                        {yen(cat.total)}
                      </span>
                      <input
                        type="text"
                        placeholder="メモを残す…"
                        value={memos[cat.category_id] ?? ""}
                        onChange={(e) => setMemos((prev) => ({ ...prev, [cat.category_id]: e.target.value }))}
                        style={{
                          flex: 1,
                          background: memos[cat.category_id] ? "#FFF6E5" : T.bgSoft,
                          border: `1px dashed ${memos[cat.category_id] ? T.mustard : T.hair}`,
                          borderRadius: 10, padding: "6px 12px",
                          fontSize: 12, color: T.ink, outline: "none",
                        }}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
