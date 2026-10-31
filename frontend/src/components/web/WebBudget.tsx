import { useEffect, useState } from "react";
import { budgetSource, useLedgerApi, type BudgetSummaryView } from "../../data/ledgerApi";
import { useDataVersion } from "../../session/sessionHooks";
import { T } from "../../theme";

type BudgetSummary = BudgetSummaryView;

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

function monthLabel(ym: string): string {
  return `${parseInt(ym.split("-")[1])}月`;
}

function todayDayJST(): number {
  return Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(8, 10));
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

type BudgetSubScreen = "income" | "recurring" | "savings";

interface Props {
  onNavigate: (screen: BudgetSubScreen) => void;
}

export function WebBudget({ onNavigate }: Props) {
  const api = useLedgerApi();
  const data_version = useDataVersion();
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [counts, setCounts] = useState<{
    income: number;
    recurring: number;
    savings: number;
  } | null>(null);
  const ym = currentMonthJST();
  const today_day = todayDayJST();
  const days_total = daysInMonth(ym);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getBudgetSummary(ym),
      api.listIncomeRecords(ym).then((r) => r.income_records),
      api.listRecurringExpenses().then((r) => r.recurring_expenses),
      api.listSavingsGoals().then((r) => r.savings_goals),
    ])
      .then(([s, incomes, recurring, savings]) => {
        if (cancelled) return;
        setSummary(s);
        setCounts({ income: incomes.length, recurring: recurring.length, savings: savings.length });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ym, api, data_version]);

  if (!summary || !counts) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>
        読み込み中…
      </div>
    );
  }

  // Find actual spending for the current month from the history array.
  // The history contains up to 3 months including the current month.
  const current_month_history = summary.history.find((h) => h.year_month === ym);
  const current_month_spent_yen = current_month_history?.actual ?? 0;

  const spent_pct =
    summary.variable_budget > 0
      ? Math.round((current_month_spent_yen / summary.variable_budget) * 100)
      : 0;

  const source = budgetSource(summary);
  // A tile without a screen is informational: income lives in the household
  // while it is attached, and allowances are set in the account settings.
  const tiles: {
    key: string;
    screen: BudgetSubScreen | null;
    sign: string;
    emoji: string;
    title: string;
    sub: string;
    amount: number;
    tone: { bg: string; fg: string; signBg: string };
  }[] = [
    {
      key: "source",
      screen: summary.allowance ? null : ("income" as BudgetSubScreen),
      sign: "+",
      emoji: summary.allowance ? "👛" : "💼",
      title: source.label,
      sub: source.description,
      amount: source.amount,
      tone: { bg: "#DEF1E6", fg: "#4FA481", signBg: "rgba(79,164,129,0.14)" },
    },
    {
      key: "recurring",
      screen: "recurring" as BudgetSubScreen,
      sign: "−",
      emoji: "🔁",
      title: "定期支出",
      sub: `${counts.recurring}件 · 家賃・光熱費・通信費 ほか`,
      amount: summary.recurring_total,
      tone: { bg: "#E5EEF7", fg: "#3F6B91", signBg: "rgba(63,107,145,0.12)" },
    },
    {
      key: "savings",
      screen: "savings" as BudgetSubScreen,
      sign: "−",
      emoji: "💰",
      title: "貯金",
      sub: `${counts.savings}件 · 目的別の積立`,
      amount: summary.savings_total,
      tone: { bg: "#FFF1CC", fg: "#A3791F", signBg: "rgba(255,194,71,0.18)" },
    },
    ...(summary.allowance_total > 0
      ? [
          {
            key: "allowances",
            screen: null,
            sign: "−",
            emoji: "👛",
            title: "お小遣い",
            sub: "メンバーのお小遣いの合計",
            amount: summary.allowance_total,
            tone: { bg: "#F6E6F0", fg: "#A0507E", signBg: "rgba(160,80,126,0.12)" },
          },
        ]
      : []),
  ];

  const current_month = currentMonthJST();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: "-0.01em",
            }}
          >
            今月の予算プラン
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>
            {summary.allowance
              ? "お小遣い（繰越込み） − 定期支出 − 貯金 で自動算出されます"
              : summary.allowance_total > 0
                ? "基準収入 − 定期支出 − 貯金 − お小遣い で自動算出されます"
                : "基準収入 − 定期支出 − 貯金 で自動算出されます"}
          </div>
        </div>
        <div
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            background: T.card,
            fontSize: 12,
            color: T.inkSoft,
          }}
        >
          {parseInt(ym.split("-")[1])}月
        </div>
      </div>

      {/* Hero card */}
      <div
        style={{
          background: T.card,
          borderRadius: 32,
          padding: 32,
          boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
          display: "flex",
          alignItems: "stretch",
          gap: 0,
        }}
      >
        <div style={{ flex: "0 0 480px", paddingRight: 32, borderRight: `1.5px solid ${T.hair}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                color: T.inkSoft,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              今月の予算
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                background: T.bgSoft,
                border: `1px solid ${T.hair}`,
                fontSize: 10,
                color: T.inkSoft,
                fontWeight: 700,
              }}
            >
              自動
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 800,
                fontSize: 72,
                letterSpacing: "-0.04em",
                color: T.coral,
                lineHeight: 1,
              }}
            >
              {yenSlim(summary.variable_budget)}
            </span>
            <span
              style={{
                fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                fontWeight: 700,
                fontSize: 24,
                color: T.ink,
              }}
            >
              円
            </span>
          </div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 8 }}>
            変動費に使える金額（今月分）
          </div>
          <div
            style={{
              height: 8,
              background: T.bgSoft,
              borderRadius: 999,
              marginTop: 16,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, spent_pct)}%`,
                background: `linear-gradient(90deg,${T.mustard},${T.coral})`,
                borderRadius: 999,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: T.inkSoft,
              marginTop: 6,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <span>残り {yen(Math.max(0, summary.variable_budget - current_month_spent_yen))}</span>
            <span>予算 {yen(summary.variable_budget)}</span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            paddingLeft: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            alignContent: "center",
          }}
        >
          {[
            {
              label: "1日あたり",
              value: `¥${yenSlim(summary.daily_budget)}`,
              sub: `÷ ${days_total}日`,
            },
            {
              label: "今月の残り",
              value: `${summary.days_remaining}日`,
              sub: `${parseInt(ym.split("-")[1])}/${today_day} 時点`,
            },
            { label: "消化ペース", value: `${spent_pct}%`, sub: "進行中" },
            {
              label: `${source.label} − 固定`,
              value: `¥${yenSlim(source.amount - summary.recurring_total)}`,
              sub: "変動費 + 貯金の元",
            },
          ].map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: "18px 22px",
                borderRight: i % 2 === 0 ? `1px solid ${T.hair}` : "none",
                borderBottom: i < 2 ? `1px solid ${T.hair}` : "none",
              }}
            >
              <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>{s.label}</div>
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: 26,
                  marginTop: 4,
                  color: T.ink,
                  letterSpacing: "-0.02em",
                }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tiles */}
      <div style={{ display: "flex", gap: 16 }}>
        {tiles.map((t) => (
          <div
            key={t.key}
            onClick={t.screen ? () => onNavigate(t.screen as BudgetSubScreen) : undefined}
            style={{
              flex: 1,
              background: T.card,
              borderRadius: 28,
              padding: "22px 24px",
              boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
              cursor: t.screen ? "pointer" : "default",
              position: "relative",
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!t.screen) return;
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 12px 32px -12px rgba(80,40,10,0.22)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 8px 24px -16px rgba(80,40,10,0.18)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  background: t.tone.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                }}
              >
                {t.emoji}
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                >
                  {t.title}
                </div>
                <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{t.sub}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  color: t.tone.fg,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: t.tone.signBg,
                }}
              >
                {t.sign}
              </span>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: 32,
                  letterSpacing: "-0.03em",
                  color: T.ink,
                }}
              >
                {yen(t.amount)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 3 }}>今月の合計</div>
            {t.screen && (
              <div
                style={{
                  position: "absolute",
                  bottom: 18,
                  right: 20,
                  fontSize: 22,
                  color: T.coral,
                  opacity: 0.55,
                }}
              >
                ›
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Formula */}
      <div
        style={{
          padding: "14px 20px",
          borderRadius: 16,
          background: T.bgSoft,
          border: `1px dashed ${T.hair}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <span style={{ color: "#4FA481", fontWeight: 700 }}>
          {source.label} {yen(source.amount)}
        </span>
        <span style={{ color: T.inkSoft }}>−</span>
        <span style={{ color: "#3F6B91", fontWeight: 700 }}>
          定期支出 {yen(summary.recurring_total)}
        </span>
        <span style={{ color: T.inkSoft }}>−</span>
        <span style={{ color: "#A3791F", fontWeight: 700 }}>貯金 {yen(summary.savings_total)}</span>
        {summary.allowance_total > 0 && (
          <>
            <span style={{ color: T.inkSoft }}>−</span>
            <span style={{ color: "#A0507E", fontWeight: 700 }}>
              お小遣い {yen(summary.allowance_total)}
            </span>
          </>
        )}
        <span style={{ fontSize: 18, color: T.hair, margin: "0 4px" }}>=</span>
        <span style={{ color: T.coralDeep, fontWeight: 800, fontSize: 15 }}>
          今月の予算 {yen(summary.variable_budget)}
        </span>
      </div>

      {/* History */}
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
            fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          直近3ヶ月の予算
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {summary.history.map((r) => {
            const pct = Math.min(100, r.budget > 0 ? (r.actual / r.budget) * 100 : 0);
            const ok = r.actual <= r.budget;
            const ongoing = r.year_month === current_month;
            return (
              <div
                key={r.year_month}
                style={{
                  flex: 1,
                  padding: "18px 20px",
                  borderRadius: 24,
                  background: ongoing ? "#FFF1CC" : T.bgSoft,
                  border: `1.5px solid ${ongoing ? T.mustard : T.hair}`,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
                    fontWeight: 700,
                    fontSize: 17,
                  }}
                >
                  {monthLabel(r.year_month)}
                  {ongoing && (
                    <span
                      style={{ fontSize: 11, marginLeft: 6, color: T.coralDeep, fontWeight: 700 }}
                    >
                      進行中
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 22,
                    marginTop: 8,
                  }}
                >
                  {yen(r.actual)}
                </div>
                <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                  予算 {yen(r.budget)}
                  {!ongoing &&
                    (ok
                      ? ` · ¥${yenSlim(r.budget - r.actual)} 余裕`
                      : ` · ¥${yenSlim(r.actual - r.budget)} 超過`)}
                </div>
                <div
                  style={{
                    height: 8,
                    background: "#fff",
                    borderRadius: 999,
                    marginTop: 10,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: ok ? T.sage : T.coral,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
