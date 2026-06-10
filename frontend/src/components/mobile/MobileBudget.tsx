import { useEffect, useState } from "react";
import { T } from "../../theme";
import { api } from "../../api/client";
import type { components } from "../../api/types";

type BudgetSummary = components["schemas"]["BudgetSummaryResponse"];

type BudgetSubScreen = "income" | "recurring" | "savings";

interface MobileBudgetProps {
  onNavigate: (screen: BudgetSubScreen) => void;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

function monthLabel(ym: string): string {
  return `${parseInt(ym.split("-")[1])}月`;
}

export function MobileBudget({ onNavigate }: MobileBudgetProps) {
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [counts, setCounts] = useState<{ income: number; recurring: number; savings: number } | null>(null);

  useEffect(() => {
    const ym = currentMonthJST();
    Promise.all([
      api.getBudgetSummary(ym),
      api.listIncomeRecords(ym).then((r) => r.income_records),
      api.listRecurringExpenses().then((r) => r.recurring_expenses),
      api.listSavingsGoals().then((r) => r.savings_goals),
    ]).then(([s, incomes, recurring, savings]) => {
      setSummary(s);
      setCounts({ income: incomes.length, recurring: recurring.length, savings: savings.length });
    });
  }, []);

  if (!summary || !counts) {
    return <p style={{ color: T.inkSoft, fontSize: 14, textAlign: "center" }}>読み込み中…</p>;
  }

  const tiles: Array<{
    screen: BudgetSubScreen;
    sign: string;
    emoji: string;
    title: string;
    sub: string;
    amount: number;
    tone: { bg: string; fg: string; signBg: string };
  }> = [
    {
      screen: "income",
      sign: "+",
      emoji: "💼",
      title: "収入",
      sub: `${counts.income}件 · 給与・副業・一時収入`,
      amount: summary.income_total,
      tone: { bg: T.sageSoft, fg: T.sageDeep, signBg: "rgba(123,196,164,0.18)" },
    },
    {
      screen: "recurring",
      sign: "−",
      emoji: "🔁",
      title: "定期支出",
      sub: `${counts.recurring}件 · 家賃・光熱費・通信費 ほか`,
      amount: summary.recurring_total,
      tone: { bg: "#E5EEF7", fg: "#3F6B91", signBg: "rgba(166,201,226,0.18)" },
    },
    {
      screen: "savings",
      sign: "−",
      emoji: "💰",
      title: "貯金",
      sub: `${counts.savings}件 · 目的別の積立`,
      amount: summary.savings_total,
      tone: { bg: T.mustardSoft, fg: T.mustardDeep, signBg: "rgba(255,194,71,0.18)" },
    },
  ];

  const currentMonth = currentMonthJST();

  return (
    <div>
      {/* Screen heading */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: "-0.01em",
            color: T.ink,
          }}
        >
          今月の予算プラン
        </div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>収入から自動で算出</div>
      </div>

      {/* Hero card */}
      <div
        style={{
          background: T.card,
          borderRadius: 28,
          padding: "22px 20px",
          boxShadow: "0 0 0 1px rgba(80,40,10,0.05), 0 6px 32px rgba(80,40,10,0.09)",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: T.inkSoft, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>今月の予算</span>
          <span style={{ padding: "2px 8px", borderRadius: 999, background: T.bgSoft, border: `1px solid ${T.hair}`, color: T.inkSoft, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em" }}>自動</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 8 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 50, letterSpacing: "-0.04em", color: T.coral, lineHeight: 1 }}>
            ¥{yenSlim(summary.variable_budget)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 6, fontWeight: 500 }}>変動費に使える金額（今月分）</div>

        <div style={{ height: 1, background: T.hair, margin: "16px 0" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: T.inkSoft, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>1日あたり</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 4 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, color: T.coral }}>
                ¥{yenSlim(summary.daily_budget)}
              </span>
              <span style={{ fontSize: 10, color: T.inkSoft, marginLeft: 2 }}>÷ 30日</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: T.inkSoft, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>今月の残り</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3, justifyContent: "flex-end", marginTop: 4 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 24, color: T.ink }}>{summary.days_remaining}</span>
              <span style={{ fontSize: 11, color: T.inkSoft }}>日</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section header */}
      <div style={{ display: "flex", alignItems: "baseline", margin: "20px 2px 10px" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>予算の内訳</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.inkSoft }}>タップで詳細</span>
      </div>

      {/* Navigation tiles */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tiles.map((tile) => (
          <button
            key={tile.screen}
            type="button"
            onClick={() => onNavigate(tile.screen)}
            style={{
              background: T.card,
              borderRadius: 28,
              padding: "14px 16px",
              boxShadow: T.cardShadow,
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: tile.tone.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                {tile.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{tile.title}</div>
                <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tile.sub}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: tile.tone.fg, padding: "1px 6px", borderRadius: 6, background: tile.tone.signBg }}>
                    {tile.sign}
                  </span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 17, color: T.ink }}>
                    ¥{yenSlim(tile.amount)}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: T.inkSoft, fontWeight: 600 }}>今月の合計</div>
              </div>
              <span style={{ color: T.coralDeep, fontSize: 22, fontWeight: 700, marginLeft: 2 }}>›</span>
            </div>
          </button>
        ))}
      </div>

      {/* Formula line */}
      <div style={{ margin: "12px 0 0", padding: "11px 14px", borderRadius: 14, background: T.bgSoft, border: `1px dashed ${T.hair}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: T.inkSoft, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
        <span style={{ color: T.sageDeep }}>収入</span>
        <span>−</span>
        <span style={{ color: "#3F6B91" }}>定期支出</span>
        <span>−</span>
        <span style={{ color: T.mustardDeep }}>貯金</span>
        <span style={{ color: T.ink, fontWeight: 700 }}>= 今月の予算</span>
      </div>

      {/* Savings memo */}
      <div style={{ margin: "20px 2px 10px", fontWeight: 700, fontSize: 15 }}>貯金の目的</div>
      <div style={{ background: T.card, borderRadius: 28, padding: 24, boxShadow: T.cardShadow }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T.coralSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💭</div>
          <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5, flex: 1 }}>叶えたいことを書いておこう</div>
        </div>
        <div style={{ padding: "13px 15px", border: `1.5px solid ${T.hair}`, borderRadius: 14, background: T.bgSoft, fontSize: 14, lineHeight: 1.6 }}>
          来年の春に北海道旅行へ。新幹線とホテル代として確保しておきたい。
        </div>
        <div style={{ marginTop: 12, padding: "11px 14px", borderRadius: 12, background: T.sageSoft, fontSize: 12, color: T.sageDeep, fontWeight: 600 }}>
          🎉 このペースなら約10ヶ月で達成できそう
        </div>
      </div>

      {/* Recent 3 months */}
      <div style={{ margin: "20px 2px 10px", fontWeight: 700, fontSize: 15 }}>直近3ヶ月の予算</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
        {summary.history.map((r) => {
          const pct = Math.min(100, (r.actual / r.budget) * 100);
          const ok = r.actual <= r.budget;
          const ongoing = r.year_month === currentMonth;
          return (
            <div
              key={r.year_month}
              style={{ background: T.card, borderRadius: 28, padding: "14px 16px", boxShadow: T.cardShadow }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 16, width: 36 }}>{monthLabel(r.year_month)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>{yen(r.actual)}</span>
                    <span style={{ fontSize: 11, color: T.inkSoft }}>予算 {yen(r.budget)}</span>
                  </div>
                  <div style={{ height: 7, background: T.bgSoft, borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: ok ? T.sage : T.coral, borderRadius: 999 }} />
                  </div>
                </div>
                <div style={{ fontSize: 18 }}>{ongoing ? "⏳" : ok ? "🌞" : "🌧"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
