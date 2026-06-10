import { useEffect, useState } from "react";
import { T } from "../../theme";
import { api } from "../../api/client";
import type { components } from "../../api/types";

type RecurringExpense = components["schemas"]["RecurringExpense"];
type PendingRecurring = components["schemas"]["PendingRecurring"];

interface MobileRecurringProps {
  onBack: () => void;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

const SHEET_GROUPS = [
  { id: 1, name: "食費", emoji: "🍙" },
  { id: 2, name: "日用品", emoji: "🧺" },
  { id: 3, name: "交通", emoji: "🚃" },
  { id: 4, name: "趣味・娯楽", emoji: "🎈" },
  { id: 5, name: "交際", emoji: "🍻" },
  { id: 6, name: "美容・健康", emoji: "🌿" },
];

const SHEET_CATEGORIES = ["家賃", "光熱費", "通信費"];

interface MobileRecurringSheetProps {
  onClose: () => void;
}

export function MobileRecurringSheet({ onClose }: MobileRecurringSheetProps) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(42,37,32,0.45)" }}
      onClick={onClose}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: T.card,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          padding: "12px 20px",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)",
          boxShadow: "0 -20px 50px -20px rgba(0,0,0,0.3)",
          maxHeight: "90dvh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 42, height: 5, borderRadius: 999, background: T.hair, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>定期支出を追加</div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 30, height: 30, minWidth: 44, minHeight: 44, borderRadius: 999, background: T.bgSoft, border: "none", cursor: "pointer", color: T.inkSoft, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ✕
          </button>
        </div>

        {/* 項目名 */}
        <div style={{ background: T.bgSoft, border: `1.5px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>項目名</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: T.inkSoft, fontStyle: "italic" }}>例：電気代</div>
        </div>

        {/* 大分類 */}
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>大分類</div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
          {SHEET_GROUPS.map((g) => (
            <div
              key={g.id}
              style={{ flexShrink: 0, padding: "9px 14px", borderRadius: 999, border: `1.5px solid ${T.hair}`, background: "#fff", color: T.ink, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}
            >
              <span>{g.emoji}</span>{g.name}
            </div>
          ))}
        </div>

        {/* 生活区分 */}
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>生活区分</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {SHEET_CATEGORIES.map((name) => (
            <div
              key={name}
              style={{ padding: "9px 14px", borderRadius: 999, border: `1.5px solid ${T.hair}`, background: "#fff", color: T.ink, fontSize: 13, fontWeight: 600 }}
            >
              {name}
            </div>
          ))}
        </div>

        {/* 金額 + 毎月何日 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: T.bgSoft, border: `1.5px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>金額（任意）</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 18, color: T.coralDeep }}>¥</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 18, color: T.inkSoft }}>—</span>
            </div>
          </div>
          <div style={{ flex: "0 0 116px", background: T.bgSoft, border: `1.5px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>毎月</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 18 }}>—</span>
              <span style={{ fontSize: 11, color: T.inkSoft }}>日</span>
            </div>
          </div>
        </div>

        {/* タイプ segmented */}
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>タイプ</div>
        <div style={{ display: "flex", gap: 6, padding: 4, background: T.bgSoft, borderRadius: 14, marginBottom: 14 }}>
          <div style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 10, fontWeight: 600, fontSize: 13, background: T.coral, color: "#fff", boxShadow: `0 2px 0 ${T.coralDeep}` }}>固定（毎月同額）</div>
          <div style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 10, fontWeight: 600, fontSize: 13, color: T.inkSoft }}>要確認（変動）</div>
        </div>

        {/* メモ */}
        <div style={{ background: T.bgSoft, border: `1.5px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px", marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>メモ（任意）</div>
          <div style={{ fontSize: 13, color: T.inkSoft, fontStyle: "italic" }}>例：検針日に確認</div>
        </div>

        <button
          type="button"
          style={{ width: "100%", border: "none", background: T.coral, color: "#fff", padding: "16px", borderRadius: 18, fontFamily: "inherit", fontWeight: 700, fontSize: 16, boxShadow: `0 6px 0 ${T.coralDeep}`, cursor: "pointer" }}
        >
          保存する
        </button>
      </div>
    </div>
  );
}

export function MobileRecurring({ onBack }: MobileRecurringProps) {
  const [recurring, setRecurring] = useState<RecurringExpense[] | null>(null);
  const [pending, setPending] = useState<PendingRecurring[] | null>(null);
  const [show_sheet, setShowSheet] = useState(false);

  const currentMonthJST = () =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);

  useEffect(() => {
    Promise.all([
      api.listRecurringExpenses().then((r) => r.recurring_expenses),
      api.listPendingRecurring(currentMonthJST()).then((r) => r.pending),
    ]).then(([r, p]) => {
      setRecurring(r);
      setPending(p);
    });
  }, []);

  const is_loading = recurring === null;

  return (
    <div>
      {/* Back button row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16 }}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: "transparent", border: "none", color: T.inkSoft, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "8px 4px", display: "flex", alignItems: "center", gap: 3, fontFamily: "inherit" }}
        >
          ‹ 予算
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: T.ink }}>定期支出</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>毎月の固定・半固定費を管理</div>
      </div>

      {is_loading && (
        <p style={{ color: T.inkSoft, fontSize: 14, textAlign: "center" }}>読み込み中…</p>
      )}

      {!is_loading && pending && pending.length > 0 && (
        <>
          {/* Pending confirmations */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 2px 10px" }}>
            <span style={{ fontWeight: 900, fontSize: 15, color: T.coralDeep }}>💬 確認待ち</span>
            <span style={{ padding: "2px 9px", borderRadius: 999, background: T.coral, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11 }}>{pending.length}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: T.inkSoft }}>今月分</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {pending.map((p) => (
              <div
                key={p.id}
                style={{ background: T.card, borderRadius: 24, padding: "14px 16px", boxShadow: T.cardShadow, border: `1.5px solid ${T.coralSoft}` }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 13, background: T.coralSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{p.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
                      <span style={{ padding: "2px 8px", borderRadius: 999, background: T.coral, color: "#fff", fontSize: 10, fontWeight: 700 }}>要確認</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{p.group_name}</span>
                      <span>·</span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>前回 ¥{yenSlim(p.last_amount)}</span>
                    </div>
                  </div>
                  <div style={{ padding: "4px 10px", borderRadius: 999, background: T.bgSoft, border: `1px solid ${T.hair}`, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, color: T.inkSoft }}>
                    {p.billing_day}日
                  </div>
                </div>
                <button
                  type="button"
                  style={{ width: "100%", marginTop: 12, border: "none", background: T.coral, color: "#fff", padding: "11px", borderRadius: 14, fontFamily: "inherit", fontWeight: 700, fontSize: 13, boxShadow: `0 4px 0 ${T.coralDeep}`, cursor: "pointer" }}
                >
                  金額を確定
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {!is_loading && recurring && (
        <>
          {/* Recurring list */}
          <div style={{ display: "flex", alignItems: "center", margin: "4px 2px 10px" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>繰り返し設定</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: T.inkSoft }}>{recurring.length}件</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recurring.map((r) => {
              const is_fixed = r.type === "fixed";
              return (
                <div
                  key={r.id}
                  style={{ background: T.card, borderRadius: 24, padding: "14px 16px", boxShadow: T.cardShadow }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 13, background: T.bgSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{r.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                        <span style={{ padding: "3px 9px", borderRadius: 999, background: "#E5EEF7", color: "#3F6B91", fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
                          毎月 {r.billing_day}日
                        </span>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: is_fixed ? T.sageSoft : T.mustardSoft,
                            color: is_fixed ? T.sageDeep : T.mustardDeep,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {is_fixed ? "固定" : "要確認"}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: r.amount ? T.ink : T.inkSoft }}>
                        {r.amount ? yen(r.amount) : "—"}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 8, background: T.bgSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.inkSoft }}>✎</span>
                        <span style={{ width: 26, height: 26, borderRadius: 8, background: T.bgSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.inkSoft }}>🗑</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setShowSheet(true)}
        style={{ width: "100%", marginTop: 16, border: `1.5px dashed ${T.coral}`, background: "transparent", color: T.coralDeep, padding: "15px", borderRadius: 16, fontFamily: "inherit", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
      >
        ＋ 定期支出を追加
      </button>

      {show_sheet && <MobileRecurringSheet onClose={() => setShowSheet(false)} />}
    </div>
  );
}
