import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { components } from "../api/types";

type CategoryGroup = components["schemas"]["CategoryGroup"];
type ExpenseCategory = components["schemas"]["ExpenseCategory"];
type StatementType = components["schemas"]["StatementTypeSummary"];

const INPUT_STYLE: React.CSSProperties = {
  background: "#111",
  border: "1px solid #333",
  borderRadius: 6,
  color: "#fff",
  padding: "7px 10px",
  fontSize: 13,
  outline: "none",
};

const BTN_PRIMARY: React.CSSProperties = {
  background: "#4ade80",
  color: "#000",
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const BTN_GHOST: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #444",
  borderRadius: 6,
  color: "#aaa",
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
};

const BTN_DANGER: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #7f1d1d",
  borderRadius: 6,
  color: "#f87171",
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
};

// ─── Category Groups Tab ──────────────────────────────────────────────────────

interface CategoryGroupsTabProps {
  groups: CategoryGroup[];
  statement_types: StatementType[];
  onRefresh: () => void;
}

function CategoryGroupsTab({ groups, statement_types, onRefresh }: CategoryGroupsTabProps) {
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
      <div
        style={{
          background: "#161616",
          border: "1px solid #222",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ color: "#aaa", fontSize: 13, marginBottom: 10 }}>大分類を追加</div>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            style={{ ...INPUT_STYLE, flex: "1 1 140px" }}
            placeholder="大分類名 *"
            value={add_name}
            onChange={(e) => setAddName(e.target.value)}
            maxLength={100}
            required
          />
          <select
            style={{ ...INPUT_STYLE, flex: "1 1 120px" }}
            value={add_type_id}
            onChange={(e) => setAddTypeId(Number(e.target.value))}
          >
            {statement_types.map((t) => (
              <option key={t.id} value={t.id}>{t.statement_type_name}</option>
            ))}
          </select>
          <input
            style={{ ...INPUT_STYLE, flex: "2 1 180px" }}
            placeholder="説明（任意）"
            value={add_desc}
            onChange={(e) => setAddDesc(e.target.value)}
            maxLength={200}
          />
          <button type="submit" style={BTN_PRIMARY} disabled={adding}>
            {adding ? "追加中..." : "追加"}
          </button>
        </form>
        {add_error && (
          <p style={{ color: "#f87171", fontSize: 12, margin: "8px 0 0" }}>{add_error}</p>
        )}
      </div>

      {/* List */}
      <div
        style={{
          background: "#161616",
          border: "1px solid #222",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {groups.length === 0 ? (
          <p style={{ color: "#555", fontSize: 13, padding: 16, margin: 0 }}>大分類が登録されていません</p>
        ) : (
          groups.map((g, idx) => (
            <div
              key={g.id}
              style={{
                padding: "12px 16px",
                borderBottom: idx < groups.length - 1 ? "1px solid #1e1e1e" : "none",
              }}
            >
              {editing_id === g.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      style={{ ...INPUT_STYLE, flex: "1 1 140px" }}
                      value={edit_name}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={100}
                    />
                    <select
                      style={{ ...INPUT_STYLE, flex: "1 1 120px" }}
                      value={edit_type_id}
                      onChange={(e) => setEditTypeId(Number(e.target.value))}
                    >
                      {statement_types.map((t) => (
                        <option key={t.id} value={t.id}>{t.statement_type_name}</option>
                      ))}
                    </select>
                    <input
                      style={{ ...INPUT_STYLE, flex: "2 1 180px" }}
                      placeholder="説明（任意）"
                      value={edit_desc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      maxLength={200}
                    />
                    <button style={BTN_PRIMARY} onClick={() => handleSaveEdit(g.id)}>保存</button>
                    <button style={BTN_GHOST} onClick={() => setEditingId(null)}>キャンセル</button>
                  </div>
                  {edit_error && (
                    <p style={{ color: "#f87171", fontSize: 12, margin: 0 }}>{edit_error}</p>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "#fff", fontSize: 14, fontWeight: 500, flex: "0 0 auto" }}>
                    {g.group_name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      background: "#1e2a1e",
                      color: "#4ade80",
                      borderRadius: 4,
                      padding: "2px 7px",
                      flex: "0 0 auto",
                    }}
                  >
                    {g.statement_type.statement_type_name}
                  </span>
                  {g.description && (
                    <span style={{ color: "#666", fontSize: 13, flex: 1 }}>{g.description}</span>
                  )}
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto", flex: "0 0 auto" }}>
                    <button style={BTN_GHOST} onClick={() => startEdit(g)}>編集</button>
                    <button style={BTN_DANGER} onClick={() => handleDelete(g.id)}>削除</button>
                  </div>
                </div>
              )}
              {row_error[g.id] && (
                <p style={{ color: "#f87171", fontSize: 12, margin: "6px 0 0" }}>{row_error[g.id]}</p>
              )}
            </div>
          ))
        )}
      </div>
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

  // Sync default group_id when groups load/change
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

  // Group categories by group_name for display
  const grouped = categories.reduce<Record<string, ExpenseCategory[]>>((acc, c) => {
    (acc[c.group_name] ??= []).push(c);
    return acc;
  }, {});
  const group_names = Object.keys(grouped).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Add form */}
      <div
        style={{
          background: "#161616",
          border: "1px solid #222",
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div style={{ color: "#aaa", fontSize: 13, marginBottom: 10 }}>生活区分を追加</div>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            style={{ ...INPUT_STYLE, flex: "1 1 140px" }}
            placeholder="生活区分名 *"
            value={add_name}
            onChange={(e) => setAddName(e.target.value)}
            maxLength={100}
            required
          />
          <select
            style={{ ...INPUT_STYLE, flex: "1 1 140px" }}
            value={add_group_id}
            onChange={(e) => setAddGroupId(Number(e.target.value))}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.group_name}</option>
            ))}
          </select>
          <input
            style={{ ...INPUT_STYLE, flex: "2 1 180px" }}
            placeholder="説明（任意）"
            value={add_desc}
            onChange={(e) => setAddDesc(e.target.value)}
            maxLength={200}
          />
          <button type="submit" style={BTN_PRIMARY} disabled={adding || groups.length === 0}>
            {adding ? "追加中..." : "追加"}
          </button>
        </form>
        {add_error && (
          <p style={{ color: "#f87171", fontSize: 12, margin: "8px 0 0" }}>{add_error}</p>
        )}
        {groups.length === 0 && (
          <p style={{ color: "#777", fontSize: 12, margin: "8px 0 0" }}>
            先に大分類を追加してください
          </p>
        )}
      </div>

      {/* List grouped by category group */}
      {categories.length === 0 ? (
        <div
          style={{
            background: "#161616",
            border: "1px solid #222",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <p style={{ color: "#555", fontSize: 13, margin: 0 }}>生活区分が登録されていません</p>
        </div>
      ) : (
        group_names.map((group_name) => (
          <div
            key={group_name}
            style={{
              background: "#161616",
              border: "1px solid #222",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                background: "#1a1a1a",
                borderBottom: "1px solid #222",
                color: "#aaa",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.05em",
              }}
            >
              {group_name}
            </div>
            {grouped[group_name].map((c, idx) => (
              <div
                key={c.id}
                style={{
                  padding: "11px 16px",
                  borderBottom:
                    idx < grouped[group_name].length - 1 ? "1px solid #1e1e1e" : "none",
                }}
              >
                {editing_id === c.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input
                        style={{ ...INPUT_STYLE, flex: "1 1 140px" }}
                        value={edit_name}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={100}
                      />
                      <select
                        style={{ ...INPUT_STYLE, flex: "1 1 140px" }}
                        value={edit_group_id}
                        onChange={(e) => setEditGroupId(Number(e.target.value))}
                      >
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.group_name}</option>
                        ))}
                      </select>
                      <input
                        style={{ ...INPUT_STYLE, flex: "2 1 180px" }}
                        placeholder="説明（任意）"
                        value={edit_desc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        maxLength={200}
                      />
                      <button style={BTN_PRIMARY} onClick={() => handleSaveEdit(c.id)}>保存</button>
                      <button style={BTN_GHOST} onClick={() => setEditingId(null)}>キャンセル</button>
                    </div>
                    {edit_error && (
                      <p style={{ color: "#f87171", fontSize: 12, margin: 0 }}>{edit_error}</p>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "#fff", fontSize: 14, fontWeight: 500, flex: "0 0 auto" }}>
                      {c.category_name}
                    </span>
                    {c.description && (
                      <span style={{ color: "#666", fontSize: 13, flex: 1 }}>{c.description}</span>
                    )}
                    <div style={{ display: "flex", gap: 6, marginLeft: "auto", flex: "0 0 auto" }}>
                      <button style={BTN_GHOST} onClick={() => startEdit(c)}>編集</button>
                      <button style={BTN_DANGER} onClick={() => handleDelete(c.id)}>削除</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))
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

  if (loading) {
    return <p style={{ color: "#aaa", padding: 24 }}>読み込み中...</p>;
  }
  if (load_error) {
    return <p style={{ color: "#f87171", padding: 24 }}>{load_error}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #222", paddingBottom: 0 }}>
        {(["大分類", "生活区分"] as MasterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: active_tab === tab ? "2px solid #4ade80" : "2px solid transparent",
              color: active_tab === tab ? "#fff" : "#666",
              fontSize: 14,
              fontWeight: active_tab === tab ? 600 : 400,
              padding: "8px 16px",
              cursor: "pointer",
              marginBottom: -1,
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
