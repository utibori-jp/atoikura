import { useEffect, useState } from "react";
import { T } from "../../theme";
import { api } from "../../api/client";
import type { components } from "../../api/types";

type IncomeRecord = components["schemas"]["IncomeRecord"];
type BaseIncomeSetting = components["schemas"]["BaseIncomeSetting"];
type SavingsGoal = components["schemas"]["SavingsGoal"];

interface MobileIncomeProps {
  onBack: () => void;
}

type ActiveSheet = null | "income" | "allocate" | "edit-base";

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

const INCOME_TYPES: Record<string, { label: string; bg: string; fg: string }> = {
  salary: { label: "給与",     bg: T.sageSoft,    fg: T.sageDeep },
  side:   { label: "副業",     bg: "#E5EEF7",     fg: "#3F6B91" },
  bonus:  { label: "ボーナス", bg: T.mustardSoft, fg: T.mustardDeep },
  oneoff: { label: "一時収入", bg: T.coralSoft,   fg: T.coralDeep },
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateParts(date_str: string): { day: number; month: number; weekday: string } {
  const [y, m, d] = date_str.split("-").map(Number);
  return { day: d, month: m, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] };
}

// ── Sheets ──────────────────────────────────────────────────────────────

interface IncomeSheetProps {
  onClose: () => void;
}

export function MobileIncomeSheet({ onClose }: IncomeSheetProps) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(42,37,32,0.45)" }}
      onClick={onClose}
    >
      <div
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: T.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: "12px 20px", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)", boxShadow: "0 -20px 50px -20px rgba(0,0,0,0.3)", maxHeight: "90dvh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 42, height: 5, borderRadius: 999, background: T.hair, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>収入を記録</div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, minWidth: 44, minHeight: 44, borderRadius: 999, background: T.bgSoft, border: "none", cursor: "pointer", color: T.inkSoft, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Amount */}
        <div style={{ background: T.bgSoft, border: `1.5px solid ${T.sage}`, borderRadius: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 30, color: T.sageDeep }}>¥</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 30, color: T.inkSoft }}>—</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: T.inkSoft }}>金額</span>
        </div>

        {/* 収入名 + 日付 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: T.bgSoft, border: `1.5px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>収入名</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: T.inkSoft, fontStyle: "italic" }}>例：ライティング案件</div>
          </div>
          <div style={{ flex: "0 0 116px", background: T.bgSoft, border: `1.5px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>日付</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, color: T.inkSoft }}>—</div>
          </div>
        </div>

        {/* 種別 */}
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>種別</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {Object.entries(INCOME_TYPES).map(([k, t]) => (
            <div key={k} style={{ padding: "9px 14px", borderRadius: 999, border: `1.5px solid ${T.hair}`, background: "#fff", color: T.ink, fontSize: 13, fontWeight: 600 }}>{t.label}</div>
          ))}
        </div>

        {/* メモ */}
        <div style={{ background: T.bgSoft, border: `1.5px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px", marginBottom: 18, minHeight: 56 }}>
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>メモ（任意）</div>
          <div style={{ fontSize: 13, color: T.inkSoft, fontStyle: "italic" }}>例：フリーランスnote</div>
        </div>

        <button type="button" style={{ width: "100%", border: "none", background: T.coral, color: "#fff", padding: "16px", borderRadius: 18, fontFamily: "inherit", fontWeight: 700, fontSize: 16, boxShadow: `0 6px 0 ${T.coralDeep}`, cursor: "pointer" }}>
          ＋ 記録する
        </button>
      </div>
    </div>
  );
}

interface AllocateSheetProps {
  onClose: () => void;
  surplus: number;
  savings_goals: SavingsGoal[];
}

export function MobileAllocateSheet({ onClose, surplus, savings_goals }: AllocateSheetProps) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(42,37,32,0.45)" }}
      onClick={onClose}
    >
      <div
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: T.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: "12px 20px", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)", boxShadow: "0 -20px 50px -20px rgba(0,0,0,0.3)", maxHeight: "90dvh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 42, height: 5, borderRadius: 999, background: T.hair, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>余剰を振り分ける</div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, minWidth: 44, minHeight: 44, borderRadius: 999, background: T.bgSoft, border: "none", cursor: "pointer", color: T.inkSoft, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Amount */}
        <div style={{ background: T.bgSoft, border: `1.5px solid ${T.mustard}`, borderRadius: 18, padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 28, color: T.mustardDeep }}>¥</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 28, color: T.inkSoft }}>—</span>
          <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>振り分け額</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: T.mustardDeep, fontWeight: 700 }}>余剰 ¥{yenSlim(surplus)}</span>
          </div>
        </div>

        {/* Quick-fill */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {["全額", "½", "¥10,000"].map((p, i) => (
            <div key={p} style={{ flex: 1, padding: "7px 0", textAlign: "center", borderRadius: 10, border: `1.5px solid ${T.hair}`, background: i === 2 ? T.mustardSoft : "#fff", color: T.ink, fontSize: 11, fontWeight: 700 }}>{p}</div>
          ))}
        </div>

        {/* Destination */}
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>振り分け先</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {[
            { id: "savings", emoji: "💰", label: "貯金", sub: "貯金目標を選んで積立", selected: true },
            { id: "budget", emoji: "📅", label: "今月の予算に追加", sub: "今月の変動費予算に上乗せ", selected: false },
          ].map((o) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 16, border: `1.5px solid ${o.selected ? T.coral : T.hair}`, background: o.selected ? T.coralSoft : "#fff" }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: o.selected ? "#fff" : T.bgSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{o.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{o.label}</div>
                <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>{o.sub}</div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: 999, border: `2px solid ${o.selected ? T.coral : T.hair}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {o.selected && <div style={{ width: 10, height: 10, borderRadius: 999, background: T.coral }} />}
              </div>
            </div>
          ))}
        </div>

        {/* Savings goal sub-selector */}
        <div style={{ padding: "12px 14px 14px", borderRadius: 16, background: T.coralSoft, border: `1.5px dashed ${T.coral}`, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
            <span style={{ color: T.coralDeep, fontSize: 14, fontWeight: 900 }}>↳</span>
            <span style={{ fontSize: 11, color: T.coralDeep, fontWeight: 700 }}>どの貯金目標に積み立てますか？</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {savings_goals.map((g, i) => {
              const sel = i === 1;
              return (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "#fff", border: `1.5px solid ${sel ? T.coral : "transparent"}` }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: T.mustardSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{g.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                    <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 1, fontFamily: "'DM Sans', sans-serif" }}>累計 ¥{yenSlim(g.accumulated_amount)} / ¥{yenSlim(g.target_amount)}</div>
                  </div>
                  <div style={{ width: 18, height: 18, borderRadius: 999, border: `2px solid ${sel ? T.coral : T.hair}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {sel && <div style={{ width: 8, height: 8, borderRadius: 999, background: T.coral }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* メモ */}
        <div style={{ background: T.bgSoft, border: `1.5px solid ${T.hair}`, borderRadius: 14, padding: "12px 14px", marginBottom: 18, minHeight: 56 }}>
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>メモ（任意）</div>
          <div style={{ fontSize: 13, color: T.inkSoft, fontStyle: "italic" }}>例：5月の副業分を緊急費用に。</div>
        </div>

        <button type="button" style={{ width: "100%", border: "none", background: T.coral, color: "#fff", padding: "16px", borderRadius: 18, fontFamily: "inherit", fontWeight: 700, fontSize: 16, boxShadow: `0 6px 0 ${T.coralDeep}`, cursor: "pointer" }}>
          ＋ 記録する
        </button>
      </div>
    </div>
  );
}

interface EditBaseSheetProps {
  onClose: () => void;
  base_amount: number;
}

export function MobileEditBaseSheet({ onClose, base_amount }: EditBaseSheetProps) {
  const PRESETS = [
    { label: "先月", value: base_amount },
    { label: "3ヶ月平均", value: 291000 },
    { label: "半年平均", value: 286500 },
  ];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(42,37,32,0.45)" }}
      onClick={onClose}
    >
      <div
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: T.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: "12px 20px", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)", boxShadow: "0 -20px 50px -20px rgba(0,0,0,0.3)", maxHeight: "90dvh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 42, height: 5, borderRadius: 999, background: T.hair, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>基準収入を編集</div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, minWidth: 44, minHeight: 44, borderRadius: 999, background: T.bgSoft, border: "none", cursor: "pointer", color: T.inkSoft, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Amount */}
        <div style={{ background: T.bgSoft, border: `1.5px solid ${T.sage}`, borderRadius: 18, padding: "16px 20px", display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 34, color: T.sageDeep }}>¥</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 34, color: T.ink, letterSpacing: "-0.02em" }}>{yenSlim(base_amount)}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: T.inkSoft }}>基準</span>
        </div>

        {/* Help */}
        <div style={{ padding: "12px 14px", borderRadius: 14, background: T.sageSoft, marginBottom: 18, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 16, marginTop: 1 }}>💡</span>
          <div style={{ fontSize: 12, color: T.sageDeep, lineHeight: 1.6, fontWeight: 600 }}>
            毎月の見込み収入を入力します。<br />
            <span style={{ fontWeight: 500, opacity: 0.85 }}>給与など、毎月安定して入る金額を設定すると、上振れ分が「余剰金額」として表示されます。</span>
          </div>
        </div>

        {/* Presets */}
        <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600, marginBottom: 8 }}>過去の平均から</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {PRESETS.map((p, i) => (
            <div key={p.label} style={{ flex: 1, padding: "9px 8px", borderRadius: 12, border: `1.5px solid ${i === 0 ? T.sage : T.hair}`, background: i === 0 ? T.sageSoft : "#fff", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.inkSoft, fontWeight: 600 }}>{p.label}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, marginTop: 2, color: i === 0 ? T.sageDeep : T.ink }}>¥{yenSlim(p.value)}</div>
            </div>
          ))}
        </div>

        <button type="button" style={{ width: "100%", border: "none", background: T.coral, color: "#fff", padding: "16px", borderRadius: 18, fontFamily: "inherit", fontWeight: 700, fontSize: 16, boxShadow: `0 6px 0 ${T.coralDeep}`, cursor: "pointer" }}>
          保存する
        </button>
      </div>
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────

export function MobileIncome({ onBack }: MobileIncomeProps) {
  const [incomes, setIncomes] = useState<IncomeRecord[] | null>(null);
  const [base_income, setBaseIncome] = useState<BaseIncomeSetting | null>(null);
  const [savings_goals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [active_sheet, setActiveSheet] = useState<ActiveSheet>(null);

  useEffect(() => {
    const ym = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
    Promise.all([
      api.listIncomeRecords(ym).then((r) => r.income_records),
      api.getBaseIncome(),
      api.listSavingsGoals().then((r) => r.savings_goals),
    ]).then(([inc, base, goals]) => {
      setIncomes(inc);
      setBaseIncome(base);
      setSavingsGoals(goals);
    });
  }, []);

  const is_loading = incomes === null;
  const income_total = incomes?.reduce((s, e) => s + e.amount, 0) ?? 0;
  const surplus = base_income ? income_total - base_income.amount : 0;
  const unique_dates = incomes ? [...new Set(incomes.map((e) => e.transaction_date))].sort().reverse() : [];

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
        <div style={{ fontWeight: 900, fontSize: 22, color: T.ink }}>収入記録</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>基準と余剰を分けて管理</div>
      </div>

      {is_loading && (
        <p style={{ color: T.inkSoft, fontSize: 14, textAlign: "center" }}>読み込み中…</p>
      )}

      {!is_loading && base_income && (
        <>
          {/* Hero card */}
          <div style={{ background: T.card, borderRadius: 28, padding: "18px", boxShadow: "0 0 0 1px rgba(80,40,10,0.05), 0 6px 32px rgba(80,40,10,0.09)", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: T.inkSoft, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>今月の収入合計</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, color: T.ink }}>¥{yenSlim(income_total)}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: T.inkSoft, fontWeight: 600 }}>{incomes?.length ?? 0}件</span>
            </div>

            <div style={{ height: 1, background: T.hair, margin: "12px 0 14px" }} />

            <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
              {/* Base income */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: T.inkSoft, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>基準収入</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "-0.03em", color: T.ink }}>¥{yenSlim(base_income.amount)}</span>
                </div>
                <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 3 }}>毎月の見込み・予算の元</div>
                <button
                  type="button"
                  onClick={() => setActiveSheet("edit-base")}
                  style={{ marginTop: 10, padding: "6px 12px", border: `1px solid ${T.hair}`, background: T.bgSoft, color: T.inkSoft, borderRadius: 999, fontFamily: "inherit", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
                >
                  <span>✎</span><span>編集</span>
                </button>
              </div>

              <div style={{ width: 1, background: T.hair }} />

              {/* Surplus */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: T.inkSoft, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>余剰金額</span>
                  <span style={{ padding: "1px 6px", borderRadius: 999, background: T.bgSoft, border: `1px solid ${T.hair}`, color: T.inkSoft, fontSize: 9, fontWeight: 700 }}>未振分</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginTop: 6 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 14, color: T.sageDeep }}>+</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, color: T.sageDeep, letterSpacing: "-0.03em" }}>¥{yenSlim(Math.max(0, surplus))}</span>
                </div>
                <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 3 }}>基準を超えた今月の上振れ</div>
                <button
                  type="button"
                  onClick={() => setActiveSheet("allocate")}
                  style={{ marginTop: 10, padding: "7px 13px", border: "none", borderRadius: 999, background: T.mustard, color: T.ink, fontFamily: "inherit", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 4, boxShadow: `0 3px 0 ${T.mustardDeep}`, cursor: "pointer" }}
                >
                  <span>振り分ける</span><span>→</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section title */}
          <div style={{ margin: "0 2px 12px", fontWeight: 700, fontSize: 15 }}>収入の記録</div>

          {/* Month chips */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 12 }}>
            {["3月", "4月", "5月", "6月"].map((m, i) => (
              <div
                key={m}
                style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 999, border: `1.5px solid ${i === 2 ? T.coral : T.hair}`, background: i === 2 ? T.coral : "#fff", color: i === 2 ? "#fff" : T.ink, fontSize: 13, fontWeight: 600 }}
              >
                {m}
              </div>
            ))}
          </div>

          {/* Day-grouped list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {unique_dates.map((date) => {
              const items = incomes!.filter((e) => e.transaction_date === date);
              const total = items.reduce((s, e) => s + e.amount, 0);
              const { day, month, weekday } = formatDateParts(date);
              return (
                <div key={date}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 2px 8px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 20 }}>{day}</span>
                      <span style={{ fontSize: 11, color: T.inkSoft }}>{month}月 {weekday}</span>
                    </div>
                    <span style={{ marginLeft: "auto", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: T.sageDeep }}>+{yen(total)}</span>
                  </div>
                  <div style={{ background: T.card, borderRadius: 24, padding: "4px 16px", boxShadow: "0 8px 24px -18px rgba(80,40,10,0.25)" }}>
                    {items.map((e, i) => {
                      const t = INCOME_TYPES[e.income_type] ?? INCOME_TYPES.oneoff;
                      const is_base = e.income_type === "salary";
                      return (
                        <div
                          key={e.id}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < items.length - 1 ? `1px solid ${T.hair}` : "none" }}
                        >
                          <div style={{ width: 36, height: 36, borderRadius: 11, background: T.sageSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>
                            {e.emoji}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
                              <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 6, background: t.bg, color: t.fg, fontSize: 10, fontWeight: 700 }}>{t.label}</span>
                              {is_base && (
                                <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 6, background: "rgba(42,37,32,0.08)", color: T.inkSoft, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em" }}>基準</span>
                              )}
                            </div>
                            {e.note && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>{e.note}</div>}
                          </div>
                          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: T.sageDeep }}>
                            +¥{yenSlim(e.amount)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Record income button */}
          <button
            type="button"
            onClick={() => setActiveSheet("income")}
            style={{ width: "100%", marginTop: 16, border: `1.5px dashed ${T.sage}`, background: "transparent", color: T.sageDeep, padding: "15px", borderRadius: 16, fontFamily: "inherit", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            ＋ 収入を記録
          </button>
        </>
      )}

      {/* Sheets */}
      {active_sheet === "income" && (
        <MobileIncomeSheet onClose={() => setActiveSheet(null)} />
      )}
      {active_sheet === "allocate" && (
        <MobileAllocateSheet
          onClose={() => setActiveSheet(null)}
          surplus={Math.max(0, surplus)}
          savings_goals={savings_goals}
        />
      )}
      {active_sheet === "edit-base" && base_income && (
        <MobileEditBaseSheet
          onClose={() => setActiveSheet(null)}
          base_amount={base_income.amount}
        />
      )}
    </div>
  );
}
