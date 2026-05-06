import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { components } from "../api/types";

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
      cg = {
        group_id: item.group_id,
        group_name: item.group_name,
        categories: [],
      };
      st.category_groups.push(cg);
    }
    cg.categories.push(item);
  }

  const result = [...statement_map.values()].sort(
    (a, b) => a.statement_type_id - b.statement_type_id,
  );
  for (const st of result) {
    st.category_groups.sort((a, b) => a.group_name.localeCompare(b.group_name));
    for (const cg of st.category_groups) {
      cg.categories.sort((a, b) =>
        a.category_name.localeCompare(b.category_name),
      );
    }
  }
  return result;
}

function prevMonthJST(): string {
  const now = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
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

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

const nav_btn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 6,
  border: "1px solid #2e2e2e",
  background: "#1a1a1a",
  color: "#aaa",
  fontSize: 13,
  cursor: "pointer",
};

type FetchState =
  | { status: "loading" }
  | {
      status: "done";
      breakdown: BreakdownItem[];
      memos: Record<number, string>;
    }
  | { status: "error"; message: string };

export function ReviewScreen() {
  const [year_month, setYearMonth] = useState(prevMonthJST());
  const [fetch_state, setFetchState] = useState<FetchState>({
    status: "loading",
  });
  const [memos, setMemos] = useState<Record<number, string>>({});
  const [saved_memos, setSavedMemos] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [save_message, setSaveMessage] = useState<string | null>(null);
  const [collapsed_statements, setCollapsedStatements] = useState<Set<number>>(
    new Set(),
  );
  const [collapsed_groups, setCollapsedGroups] = useState<Set<number>>(
    new Set(),
  );

  const current_month_jst = new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
    .slice(0, 7);
  const is_at_limit = year_month >= addMonths(current_month_jst, -1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getMonthlyBreakdown(year_month),
      api.getMonthlyReviews(year_month),
    ])
      .then(([breakdown_res, reviews_res]) => {
        if (cancelled) return;
        const memo_map: Record<number, string> = {};
        for (const n of reviews_res.notes) {
          memo_map[n.category_id] = n.note;
        }
        setFetchState({
          status: "done",
          breakdown: breakdown_res.breakdown,
          memos: memo_map,
        });
        setMemos(memo_map);
        setSavedMemos(memo_map);
        setSaveMessage(null);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setFetchState({
            status: "error",
            message:
              err instanceof Error ? err.message : "データ取得に失敗しました",
          });
      });
    return () => {
      cancelled = true;
      setFetchState({ status: "loading" });
    };
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
      for (const n of res.notes) {
        new_saved[n.category_id] = n.note;
      }
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

  const subtotal_style: React.CSSProperties = {
    marginLeft: "auto",
    color: "#aaa",
    fontSize: 13,
  };

  return (
    <div>
      {/* Month nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setYearMonth(addMonths(year_month, -1))}
            style={nav_btn}
          >
            &lt;
          </button>
          <div
            style={{
              padding: "5px 14px",
              borderRadius: 6,
              border: "1px solid #2e2e2e",
              background: "#1a1a1a",
              color: "#ccc",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {formatMonthJP(year_month)}
          </div>
          <button
            onClick={() => setYearMonth(addMonths(year_month, 1))}
            disabled={is_at_limit}
            style={{
              ...nav_btn,
              color: is_at_limit ? "#3a3a3a" : "#aaa",
              cursor: is_at_limit ? "default" : "pointer",
            }}
          >
            &gt;
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {has_unsaved && (
            <span style={{ fontSize: 12, color: "#f59e0b" }}>
              未保存の変更があります
            </span>
          )}
          {save_message && (
            <span
              style={{
                fontSize: 12,
                color: save_message === "保存しました" ? "#22c55e" : "#ef4444",
              }}
            >
              {save_message}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "none",
              background: saving ? "#2a2a2a" : "#22c55e",
              color: saving ? "#555" : "#000",
              fontWeight: 600,
              fontSize: 13,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {fetch_state.status === "loading" && (
        <div style={{ color: "#555", fontSize: 14 }}>読み込み中...</div>
      )}

      {fetch_state.status === "error" && (
        <div style={{ color: "#ef4444", fontSize: 14 }}>
          {fetch_state.message}
        </div>
      )}

      {fetch_state.status === "done" && breakdown.length === 0 && (
        <div
          style={{
            color: "#555",
            fontSize: 14,
            padding: "40px 0",
            textAlign: "center",
          }}
        >
          選択した月の支出データがありません
        </div>
      )}

      {fetch_state.status === "done" &&
        grouped.map((st) => {
          const st_total = st.category_groups
            .flatMap((cg) => cg.categories)
            .reduce((sum, c) => sum + c.total, 0);
          const st_collapsed = collapsed_statements.has(st.statement_type_id);

          return (
            <div
              key={st.statement_type_id}
              style={{
                marginBottom: 12,
                border: "1px solid #222",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {/* Statement type header */}
              <button
                onClick={() =>
                  setCollapsedStatements((prev) => {
                    const next = new Set(prev);
                    if (next.has(st.statement_type_id)) {
                      next.delete(st.statement_type_id);
                    } else {
                      next.add(st.statement_type_id);
                    }
                    return next;
                  })
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "12px 16px",
                  background: "#1a1a1a",
                  border: "none",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  textAlign: "left",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 10, color: "#666" }}>
                  {st_collapsed ? "▶" : "▼"}
                </span>
                <span>{st.statement_type_name}</span>
                <span style={subtotal_style}>{formatYen(st_total)}</span>
              </button>

              {!st_collapsed &&
                st.category_groups.map((cg) => {
                  const cg_total = cg.categories.reduce(
                    (sum, c) => sum + c.total,
                    0,
                  );
                  const cg_key = `${st.statement_type_id}-${cg.group_id}`;
                  const cg_collapsed = collapsed_groups.has(
                    st.statement_type_id * 100000 + cg.group_id,
                  );

                  return (
                    <div
                      key={cg_key}
                      style={{ borderTop: "1px solid #1e1e1e" }}
                    >
                      {/* Category group header */}
                      <button
                        onClick={() =>
                          setCollapsedGroups((prev) => {
                            const key =
                              st.statement_type_id * 100000 + cg.group_id;
                            const next = new Set(prev);
                            if (next.has(key)) {
                              next.delete(key);
                            } else {
                              next.add(key);
                            }
                            return next;
                          })
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                          padding: "10px 16px 10px 28px",
                          background: "#161616",
                          border: "none",
                          color: "#ccc",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                          textAlign: "left",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 10, color: "#555" }}>
                          {cg_collapsed ? "▶" : "▼"}
                        </span>
                        <span>{cg.group_name}</span>
                        <span style={subtotal_style}>
                          {formatYen(cg_total)}
                        </span>
                      </button>

                      {!cg_collapsed &&
                        cg.categories.map((cat) => (
                          <div
                            key={cat.category_id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "8px 16px 8px 44px",
                              borderTop: "1px solid #1a1a1a",
                              gap: 12,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                color: "#aaa",
                                flex: "0 0 120px",
                              }}
                            >
                              {cat.category_name}
                            </span>
                            <span
                              style={{
                                fontSize: 13,
                                color: "#fff",
                                flex: "0 0 90px",
                                textAlign: "right",
                              }}
                            >
                              {formatYen(cat.total)}
                            </span>
                            <input
                              type="text"
                              placeholder="メモを入力..."
                              value={memos[cat.category_id] ?? ""}
                              onChange={(e) =>
                                setMemos((prev) => ({
                                  ...prev,
                                  [cat.category_id]: e.target.value,
                                }))
                              }
                              style={{
                                flex: 1,
                                background: "#1a1a1a",
                                border: "1px solid #2e2e2e",
                                borderRadius: 6,
                                color: "#ccc",
                                fontSize: 12,
                                padding: "5px 10px",
                                outline: "none",
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
