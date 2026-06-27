import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";
import { emojiForGroup } from "../mobile/groupEmoji";
import { Modal } from "../Modal";
import { useAlert, useConfirm } from "../dialogContext";

type CategoryGroup = components["schemas"]["CategoryGroup"];
type ExpenseCategory = components["schemas"]["ExpenseCategory"];
type StatementType = components["schemas"]["StatementTypeSummary"];

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
void yen;

type ActiveTab = "groups" | "categories";

interface GroupFormState {
  id: number | null;
  name: string;
  emoji: string;
  statement_type_id: string;
}

interface CategoryFormState {
  id: number | null;
  name: string;
  category_code: string;
  group_id: string;
}

export function WebMaster() {
  const confirm = useConfirm();
  const alert = useAlert();
  const [active_tab, setActiveTab] = useState<ActiveTab>("groups");
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [statement_types, setStatementTypes] = useState<StatementType[]>([]);
  const [loading, setLoading] = useState(false);

  const [group_form, setGroupForm] = useState<GroupFormState | null>(null);
  const [cat_form, setCatForm] = useState<CategoryFormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error_msg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [g_res, c_res, s_res] = await Promise.all([
          api.listCategoryGroups(),
          api.listExpenseCategories(),
          api.listStatementTypes(),
        ]);
        if (cancelled) return;
        setGroups(g_res.category_groups);
        setCategories(c_res.expense_categories);
        setStatementTypes(s_res.statement_types);
      } catch {
        /* ignore fetch errors */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    const [g_res, c_res] = await Promise.all([
      api.listCategoryGroups(),
      api.listExpenseCategories(),
    ]);
    setGroups(g_res.category_groups);
    setCategories(c_res.expense_categories);
  };

  const handle_group_submit = async () => {
    if (!group_form) return;
    setErrorMsg("");
    if (!group_form.name.trim()) {
      setErrorMsg("名前を入力してください");
      return;
    }
    if (!group_form.statement_type_id) {
      setErrorMsg("変動費種別を選択してください");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        group_name: group_form.name.trim(),
        emoji: group_form.emoji.trim() || "📦",
        statement_type_id: parseInt(group_form.statement_type_id, 10),
      };
      if (group_form.id) {
        await api.updateCategoryGroup(group_form.id, body);
      } else {
        await api.createCategoryGroup(body);
      }
      await refresh();
      setGroupForm(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handle_group_delete = async (id: number) => {
    const confirmed = await confirm({
      title: "削除の確認",
      message: "この大分類を削除しますか？",
      confirmLabel: "削除",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.deleteCategoryGroup(id);
      await refresh();
    } catch (err) {
      await alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const handle_cat_submit = async () => {
    if (!cat_form) return;
    setErrorMsg("");
    if (!cat_form.name.trim()) {
      setErrorMsg("名前を入力してください");
      return;
    }
    if (!cat_form.group_id) {
      setErrorMsg("大分類を選択してください");
      return;
    }
    if (!cat_form.category_code.trim()) {
      setErrorMsg("コードを入力してください");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        category_name: cat_form.name.trim(),
        category_code: cat_form.category_code.trim(),
        group_id: parseInt(cat_form.group_id, 10),
      };
      if (cat_form.id) {
        await api.updateExpenseCategory(cat_form.id, body);
      } else {
        await api.createExpenseCategory(body);
      }
      await refresh();
      setCatForm(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handle_cat_delete = async (id: number) => {
    const confirmed = await confirm({
      title: "削除の確認",
      message: "この生活区分を削除しますか？",
      confirmLabel: "削除",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.deleteExpenseCategory(id);
      await refresh();
    } catch (err) {
      await alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const input_style: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: `1.5px solid ${T.hair}`,
    borderRadius: 12,
    fontFamily: "inherit",
    fontSize: 14,
    color: T.ink,
    background: T.bgSoft,
    outline: "none",
    boxSizing: "border-box",
  };

  const categories_by_group = groups.map((g) => ({
    group: g,
    cats: categories.filter((c) => c.group_id === g.id),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div
          style={{
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: "-0.01em",
          }}
        >
          マスタ管理
        </div>
        <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>
          自分らしいカテゴリで管理しよう
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {(
          [
            { id: "groups", label: "大分類" },
            { id: "categories", label: "生活区分" },
          ] as const
        ).map((tab) => {
          const active = active_tab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: `1.5px solid ${active ? T.coral : T.hair}`,
                background: active ? T.coral : "#fff",
                color: active ? "#fff" : T.ink,
                padding: "10px 16px",
                borderRadius: 999,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>
          読み込み中…
        </div>
      ) : active_tab === "groups" ? (
        <div
          style={{
            background: T.card,
            borderRadius: 32,
            padding: 28,
            boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 18,
            }}
          >
            <div
              style={{
                fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              大分類（{groups.length}件）
            </div>
            <button
              onClick={() => {
                setGroupForm({ id: null, name: "", emoji: "", statement_type_id: "" });
                setErrorMsg("");
              }}
              style={{
                border: "none",
                background: T.coral,
                color: "#fff",
                padding: "10px 18px",
                borderRadius: 999,
                fontFamily: "inherit",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: `0 4px 0 ${T.coralDeep}`,
              }}
            >
              ＋ 大分類を追加
            </button>
          </div>

          {group_form && (
            <Modal
              title={group_form.id ? "大分類を編集" : "大分類を追加"}
              onClose={() => setGroupForm(null)}
              maxWidth={520}
            >
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: "0 0 80px" }}>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>絵文字</div>
                  <input
                    type="text"
                    value={group_form.emoji}
                    onChange={(e) => setGroupForm((f) => f && { ...f, emoji: e.target.value })}
                    placeholder="🍙"
                    style={{ ...input_style, textAlign: "center", fontSize: 20 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>名前</div>
                  <input
                    type="text"
                    value={group_form.name}
                    onChange={(e) => setGroupForm((f) => f && { ...f, name: e.target.value })}
                    placeholder="食費"
                    style={input_style}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>変動費種別</div>
                  <select
                    value={group_form.statement_type_id}
                    onChange={(e) =>
                      setGroupForm((f) => f && { ...f, statement_type_id: e.target.value })
                    }
                    style={input_style}
                  >
                    <option value="">選択…</option>
                    {statement_types.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.statement_type_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {error_msg && (
                <div style={{ color: T.coralDeep, fontSize: 13, marginBottom: 10 }}>
                  {error_msg}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handle_group_submit}
                  disabled={submitting}
                  style={{
                    border: "none",
                    background: T.coral,
                    color: "#fff",
                    padding: "9px 20px",
                    borderRadius: 999,
                    fontFamily: "inherit",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: `0 3px 0 ${T.coralDeep}`,
                  }}
                >
                  {submitting ? "保存中…" : "保存"}
                </button>
                <button
                  onClick={() => setGroupForm(null)}
                  style={{
                    border: `1px solid ${T.hair}`,
                    background: "#fff",
                    color: T.inkSoft,
                    padding: "9px 20px",
                    borderRadius: 999,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  キャンセル
                </button>
              </div>
            </Modal>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {groups.map((g) => {
              const type_name = g.statement_type?.statement_type_name ?? "";
              const type_colors: Record<string, { bg: string; fg: string }> = {
                変動費: { bg: "#FFF1CC", fg: "#A3791F" },
                固定費: { bg: "#DEF1E6", fg: T.sageDeep },
                対象外: { bg: "#F4E9DC", fg: T.inkSoft },
              };
              const type_c = type_colors[type_name] ?? { bg: "#E5EEF7", fg: "#3F6B91" };
              const cat_count = categories.filter((c) => c.group_id === g.id).length;
              return (
                <div
                  key={g.id}
                  style={{
                    padding: "16px 18px",
                    borderRadius: 20,
                    background: T.bgSoft,
                    border: `1.5px solid ${T.hair}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      boxShadow: "0 2px 0 #F2E4D2",
                    }}
                  >
                    {emojiForGroup(g.group_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{g.group_name}</div>
                    <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                      {cat_count} 区分
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: type_c.bg,
                      color: type_c.fg,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {type_name}
                  </div>
                  <div style={{ display: "flex", gap: 4, color: T.inkSoft }}>
                    <button
                      onClick={() => {
                        setGroupForm({
                          id: g.id,
                          name: g.group_name,
                          emoji: "",
                          statement_type_id: String(g.statement_type?.id ?? ""),
                        });
                        setErrorMsg("");
                      }}
                      style={{
                        padding: "4px 6px",
                        fontSize: 13,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: T.inkSoft,
                      }}
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handle_group_delete(g.id)}
                      style={{
                        padding: "4px 6px",
                        fontSize: 13,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: T.inkSoft,
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: T.card,
            borderRadius: 32,
            padding: 28,
            boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 18,
            }}
          >
            <div
              style={{
                fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              生活区分（大分類ごと）
            </div>
            {/* The redundant top-right "＋ 生活区分を追加" button was removed (#130);
                the per-group "＋ 追加" buttons are the single, in-context add entry. */}
          </div>

          {cat_form && (
            <Modal
              title={cat_form.id ? "生活区分を編集" : "生活区分を追加"}
              onClose={() => setCatForm(null)}
              maxWidth={520}
            >
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>名前</div>
                  <input
                    type="text"
                    value={cat_form.name}
                    onChange={(e) => setCatForm((f) => f && { ...f, name: e.target.value })}
                    placeholder="外食"
                    style={input_style}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>コード</div>
                  <input
                    type="text"
                    value={cat_form.category_code}
                    onChange={(e) =>
                      setCatForm((f) => f && { ...f, category_code: e.target.value })
                    }
                    placeholder="eating_out"
                    style={input_style}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>大分類</div>
                  <select
                    value={cat_form.group_id}
                    onChange={(e) => setCatForm((f) => f && { ...f, group_id: e.target.value })}
                    style={input_style}
                  >
                    <option value="">選択…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.group_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {error_msg && (
                <div style={{ color: T.coralDeep, fontSize: 13, marginBottom: 10 }}>
                  {error_msg}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handle_cat_submit}
                  disabled={submitting}
                  style={{
                    border: "none",
                    background: T.coral,
                    color: "#fff",
                    padding: "9px 20px",
                    borderRadius: 999,
                    fontFamily: "inherit",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: `0 3px 0 ${T.coralDeep}`,
                  }}
                >
                  {submitting ? "保存中…" : "保存"}
                </button>
                <button
                  onClick={() => setCatForm(null)}
                  style={{
                    border: `1px solid ${T.hair}`,
                    background: "#fff",
                    color: T.inkSoft,
                    padding: "9px 20px",
                    borderRadius: 999,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  キャンセル
                </button>
              </div>
            </Modal>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {categories_by_group.map(({ group: g, cats }) => (
              <div key={g.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 18 }}>{emojiForGroup(g.group_name)}</span>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{g.group_name}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 28 }}>
                  {cats.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 999,
                        background: T.bgSoft,
                        border: `1.5px solid ${T.hair}`,
                        fontSize: 13,
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {c.category_name}
                      <button
                        onClick={() => {
                          setCatForm({
                            id: c.id,
                            name: c.category_name,
                            category_code: c.category_code ?? "",
                            group_id: String(c.group_id),
                          });
                          setErrorMsg("");
                        }}
                        style={{
                          color: T.inkSoft,
                          fontSize: 11,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handle_cat_delete(c.id)}
                        style={{
                          color: T.inkSoft,
                          fontSize: 11,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setCatForm({ id: null, name: "", category_code: "", group_id: String(g.id) });
                      setErrorMsg("");
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      background: "transparent",
                      border: `1.5px dashed ${T.coral}`,
                      color: T.coralDeep,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ＋ 追加
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
