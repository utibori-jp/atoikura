import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { components } from "../api/types";
import { T } from "../theme";

type CategoryGroup = components["schemas"]["CategoryGroup"];
type ExpenseCategory = components["schemas"]["ExpenseCategory"];
type StatementType = components["schemas"]["StatementTypeSummary"];

const INPUT_STYLE: React.CSSProperties = {
  background: T.bgSoft,
  border: `1.5px solid ${T.hair}`,
  borderRadius: 10,
  color: T.ink,
  padding: "8px 12px",
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
};

const BTN_PRIMARY: React.CSSProperties = {
  background: T.coral,
  color: "#fff",
  border: "none",
  borderRadius: 999,
  padding: "8px 18px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: `0 3px 0 ${T.coralDeep}`,
  fontFamily: "inherit",
};

const BTN_GHOST: React.CSSProperties = {
  background: "transparent",
  border: `1.5px solid ${T.hair}`,
  borderRadius: 999,
  color: T.inkSoft,
  padding: "6px 14px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

const STATEMENT_TYPE_STYLES: Record<string, { bg: string; fg: string }> = {
  "変動費":  { bg: "#FFF1CC", fg: "#A3791F" },
  "固定費":  { bg: "#DEF1E6", fg: T.sageDeep },
  "対象外":  { bg: "#F4E9DC", fg: T.inkSoft },
};

function statementTypePill(name: string) {
  const style = STATEMENT_TYPE_STYLES[name] ?? { bg: "#E5EEF7", fg: "#3F6B91" };
  return (
    <span style={{
      padding: "4px 10px", borderRadius: 999,
      background: style.bg, color: style.fg,
      fontSize: 11, fontWeight: 700, flexShrink: 0,
    }}>
      {name}
    </span>
  );
}

// ─── Category Groups Tab ──────────────────────────────────────────────────────

interface CategoryGroupsTabProps {
  groups: CategoryGroup[];
  statement_types: StatementType[];
  category_count_map: Record<number, number>;
  onRefresh: () => void;
}

function CategoryGroupsTab({ groups, statement_types, category_count_map, onRefresh }: CategoryGroupsTabProps) {
  const [add_name, setAddName] = useState("");
  const [add_type_id, setAddTypeId] = useState<number>(statement_types[0]?.id ?? 0);
  const [add_desc, setAddDesc] = useState("");
  const [add_error, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editing_id, setEditingId] = useState<number | null>(null);
  const [edit_name, setEditName] = useState("");
  const [edit_type_id, setEditTypeId] = useState<number>(0);
  const [edit_desc, setEditDesc] = useState("");
  const [edit_error, setEditError] = useState<string | null>(null);
  const [row_error, setRowError] = useState<Record<number, string>>({});

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!add_name.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.createCategoryGroup({
        group_name: add_name.trim(),
        statement_type_id: add_type_id,
        description: add_desc.trim() || undefined,
      });
      setAddName("");
      setAddDesc("");
      onRefresh();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(g: CategoryGroup) {
    setEditingId(g.id);
    setEditName(g.group_name);
    setEditTypeId(g.statement_type.id);
    setEditDesc(g.description ?? "");
    setEditError(null);
  }

  async function handleSaveEdit(id: number) {
    if (!edit_name.trim()) return;
    setEditError(null);
    try {
      await api.updateCategoryGroup(id, {
        group_name: edit_name.trim(),
        statement_type_id: edit_type_id,
        description: edit_desc.trim() || undefined,
      });
      setEditingId(null);
      onRefresh();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "更新に失敗しました");
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("この大分類を削除しますか？")) return;
    setRowError((prev) => ({ ...prev, [id]: "" }));
    try {
      await api.deleteCategoryGroup(id);
      onRefresh();
    } catch (err: unknown) {
      setRowError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "削除に失敗しました",
      }));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Add form */}
      <div style={{ background: T.card, borderRadius: 24, padding: 20, boxShadow: T.cardShadow }}>
        <div style={{ fontSize: 13, color: T.inkSoft, fontWeight: 600, marginBottom: 12 }}>大分類を追加</div>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input style={{ ...INPUT_STYLE, flex: "1 1 140px" }} placeholder="大分類名 *" value={add_name} onChange={(e) => setAddName(e.target.value)} maxLength={100} required />
          <select style={{ ...INPUT_STYLE, flex: "1 1 120px" }} value={add_type_id} onChange={(e) => setAddTypeId(Number(e.target.value))}>
            {statement_types.map((t) => (<option key={t.id} value={t.id}>{t.statement_type_name}</option>))}
          </select>
          <input style={{ ...INPUT_STYLE, flex: "2 1 180px" }} placeholder="説明（任意）" value={add_desc} onChange={(e) => setAddDesc(e.target.value)} maxLength={200} />
          <button type="submit" style={BTN_PRIMARY} disabled={adding}>{adding ? "追加中..." : "＋ 追加"}</button>
        </form>
        {add_error && <p style={{ color: T.coralDeep, fontSize: 12, margin: "8px 0 0" }}>{add_error}</p>}
      </div>

      {/* 2-column grid list */}
      {groups.length === 0 ? (
        <p style={{ color: T.inkSoft, fontSize: 13 }}>大分類が登録されていません</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {groups.map((g) => (
            <div key={g.id}>
              {editing_id === g.id ? (
                <div style={{ background: T.card, borderRadius: 20, padding: "16px 18px", boxShadow: T.cardShadow }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input style={{ ...INPUT_STYLE, flex: "1 1 120px" }} value={edit_name} onChange={(e) => setEditName(e.target.value)} maxLength={100} />
                      <select style={{ ...INPUT_STYLE, flex: "1 1 100px" }} value={edit_type_id} onChange={(e) => setEditTypeId(Number(e.target.value))}>
                        {statement_types.map((t) => (<option key={t.id} value={t.id}>{t.statement_type_name}</option>))}
                      </select>
                      <input style={{ ...INPUT_STYLE, flex: "2 1 160px" }} placeholder="説明（任意）" value={edit_desc} onChange={(e) => setEditDesc(e.target.value)} maxLength={200} />
                    </div>
                    {edit_error && <p style={{ color: T.coralDeep, fontSize: 12, margin: 0 }}>{edit_error}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={BTN_PRIMARY} onClick={() => handleSaveEdit(g.id)}>保存</button>
                      <button style={BTN_GHOST} onClick={() => setEditingId(null)}>キャンセル</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: T.bgSoft, borderRadius: 20,
                  border: `1.5px solid ${T.hair}`,
                  padding: "16px 18px",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{g.group_name}</div>
                    <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                      {category_count_map[g.id] ?? 0} 区分
                    </div>
                  </div>
                  {statementTypePill(g.statement_type.statement_type_name)}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(g)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: T.inkSoft, fontSize: 13 }}
                      title="編集"
                    >✏</button>
                    <button
                      onClick={() => handleDelete(g.id)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: T.coralDeep, fontSize: 13 }}
                      title="削除"
                    >🗑</button>
                  </div>
                </div>
              )}
              {row_error[g.id] && <p style={{ color: T.coralDeep, fontSize: 12, margin: "6px 0 0" }}>{row_error[g.id]}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Expense Categories Tab ───────────────────────────────────────────────────

interface ExpenseCategoriesTabProps {
  categories: ExpenseCategory[];
  groups: CategoryGroup[];
  onRefresh: () => void;
}

function ExpenseCategoriesTab({ categories, groups, onRefresh }: ExpenseCategoriesTabProps) {
  const [add_name, setAddName] = useState("");
  const [add_group_id, setAddGroupId] = useState<number>(groups[0]?.id ?? 0);
  const [add_desc, setAddDesc] = useState("");
  const [add_error, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editing_id, setEditingId] = useState<number | null>(null);
  const [edit_name, setEditName] = useState("");
  const [edit_group_id, setEditGroupId] = useState<number>(0);
  const [edit_desc, setEditDesc] = useState("");
  const [edit_error, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (add_group_id === 0 && groups.length > 0) {
      setAddGroupId(groups[0].id);
    }
  }, [groups, add_group_id]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!add_name.trim() || add_group_id === 0) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.createExpenseCategory({
        category_name: add_name.trim(),
        group_id: add_group_id,
        description: add_desc.trim() || undefined,
      });
      setAddName("");
      setAddDesc("");
      onRefresh();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(c: ExpenseCategory) {
    setEditingId(c.id);
    setEditName(c.category_name);
    setEditGroupId(c.group_id);
    setEditDesc(c.description ?? "");
    setEditError(null);
  }

  async function handleSaveEdit(id: number) {
    if (!edit_name.trim() || edit_group_id === 0) return;
    setEditError(null);
    try {
      await api.updateExpenseCategory(id, {
        category_name: edit_name.trim(),
        group_id: edit_group_id,
        description: edit_desc.trim() || undefined,
      });
      setEditingId(null);
      onRefresh();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "更新に失敗しました");
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("この生活区分を削除しますか？")) return;
    try {
      await api.deleteExpenseCategory(id);
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }

  // Build ordered group list preserving server order, only groups that have categories
  const group_order = groups.filter((g) => categories.some((c) => c.group_id === g.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Add form */}
      <div style={{ background: T.card, borderRadius: 24, padding: 20, boxShadow: T.cardShadow }}>
        <div style={{ fontSize: 13, color: T.inkSoft, fontWeight: 600, marginBottom: 12 }}>生活区分を追加</div>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input style={{ ...INPUT_STYLE, flex: "1 1 140px" }} placeholder="生活区分名 *" value={add_name} onChange={(e) => setAddName(e.target.value)} maxLength={100} required />
          <select style={{ ...INPUT_STYLE, flex: "1 1 140px" }} value={add_group_id} onChange={(e) => setAddGroupId(Number(e.target.value))}>
            {groups.map((g) => (<option key={g.id} value={g.id}>{g.group_name}</option>))}
          </select>
          <input style={{ ...INPUT_STYLE, flex: "2 1 180px" }} placeholder="説明（任意）" value={add_desc} onChange={(e) => setAddDesc(e.target.value)} maxLength={200} />
          <button type="submit" style={BTN_PRIMARY} disabled={adding || groups.length === 0}>{adding ? "追加中..." : "＋ 追加"}</button>
        </form>
        {add_error && <p style={{ color: T.coralDeep, fontSize: 12, margin: "8px 0 0" }}>{add_error}</p>}
        {groups.length === 0 && <p style={{ color: T.inkSoft, fontSize: 12, margin: "8px 0 0" }}>先に大分類を追加してください</p>}
      </div>

      {/* Grouped pill chips */}
      {categories.length === 0 ? (
        <div style={{ background: T.card, borderRadius: 24, padding: 20, boxShadow: T.cardShadow }}>
          <p style={{ color: T.inkSoft, fontSize: 13, margin: 0 }}>生活区分が登録されていません</p>
        </div>
      ) : (
        <div style={{ background: T.card, borderRadius: 24, padding: 24, boxShadow: T.cardShadow, display: "flex", flexDirection: "column", gap: 20 }}>
          {group_order.map((g) => {
            const group_cats = categories.filter((c) => c.group_id === g.id);
            return (
              <div key={g.id}>
                <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, marginBottom: 10 }}>{g.group_name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 4 }}>
                  {group_cats.map((c) => (
                    <div key={c.id}>
                      {editing_id === c.id ? (
                        <div style={{ background: T.bgSoft, borderRadius: 16, padding: "12px 16px", border: `1.5px solid ${T.hair}`, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <input style={{ ...INPUT_STYLE, flex: "1 1 120px" }} value={edit_name} onChange={(e) => setEditName(e.target.value)} maxLength={100} />
                            <select style={{ ...INPUT_STYLE, flex: "1 1 120px" }} value={edit_group_id} onChange={(e) => setEditGroupId(Number(e.target.value))}>
                              {groups.map((g2) => (<option key={g2.id} value={g2.id}>{g2.group_name}</option>))}
                            </select>
                          </div>
                          {edit_error && <p style={{ color: T.coralDeep, fontSize: 12, margin: 0 }}>{edit_error}</p>}
                          <div style={{ display: "flex", gap: 8 }}>
                            <button style={BTN_PRIMARY} onClick={() => handleSaveEdit(c.id)}>保存</button>
                            <button style={BTN_GHOST} onClick={() => setEditingId(null)}>キャンセル</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "8px 14px",
                          borderRadius: 999,
                          background: T.bgSoft,
                          border: `1.5px solid ${T.hair}`,
                          fontSize: 13, fontWeight: 500, color: T.ink,
                        }}>
                          <span>{c.category_name}</span>
                          <button
                            onClick={() => startEdit(c)}
                            style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 2px", color: T.inkSoft, fontSize: 12, lineHeight: 1 }}
                            title="編集"
                          >✏</button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 2px", color: T.coralDeep, fontSize: 12, lineHeight: 1 }}
                            title="削除"
                          >🗑</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Master Management Root ───────────────────────────────────────────────────

type MasterTab = "大分類" | "生活区分";

export function MasterManagement() {
  const [active_tab, setActiveTab] = useState<MasterTab>("大分類");
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [statement_types, setStatementTypes] = useState<StatementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [load_error, setLoadError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [groups_res, cats_res, types_res] = await Promise.all([
        api.listCategoryGroups(),
        api.listExpenseCategories(),
        api.listStatementTypes(),
      ]);
      setGroups(groups_res.category_groups);
      setCategories(cats_res.expense_categories);
      setStatementTypes(types_res.statement_types);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const category_count_map: Record<number, number> = {};
  for (const cat of categories) {
    category_count_map[cat.group_id] = (category_count_map[cat.group_id] ?? 0) + 1;
  }

  if (loading) {
    return <p style={{ color: T.inkSoft }}>読み込み中...</p>;
  }
  if (load_error) {
    return <p style={{ color: T.coralDeep }}>{load_error}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif", fontSize: 30, fontWeight: 900, color: T.ink, letterSpacing: "-0.01em" }}>
          マスタ管理
        </h1>
        <p style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>自分らしいカテゴリで管理しよう</p>
      </div>

      {/* Tab pills */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["大分類", "生活区分"] as MasterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              border: `1.5px solid ${active_tab === tab ? T.coral : T.hair}`,
              background: active_tab === tab ? T.coral : T.card,
              color: active_tab === tab ? "#fff" : T.ink,
              padding: "10px 22px", borderRadius: 999, fontFamily: "inherit",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              boxShadow: active_tab === tab ? `0 3px 0 ${T.coralDeep}` : "none",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {active_tab === "大分類" && (
        <CategoryGroupsTab
          groups={groups}
          statement_types={statement_types}
          category_count_map={category_count_map}
          onRefresh={fetchAll}
        />
      )}
      {active_tab === "生活区分" && (
        <ExpenseCategoriesTab
          categories={categories}
          groups={groups}
          onRefresh={fetchAll}
        />
      )}
    </div>
  );
}
