import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/types";
import { T } from "../../theme";

type SavingsGoal = components["schemas"]["SavingsGoal"];

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

function currentMonthJST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

interface Props {
  onBack: () => void;
}

export function WebSavings({ onBack }: Props) {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const ym = currentMonthJST();

  useEffect(() => {
    let cancelled = false;
    api
      .listSavingsGoals()
      .then((res) => {
        if (!cancelled) setGoals(res.savings_goals);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const monthly_total = goals.reduce((s, g) => s + g.monthly_amount, 0);

  const handle_delete = async (id: number) => {
    if (!window.confirm("この貯金目標を削除しますか？")) return;
    await api.deleteSavingsGoal(id).catch(() => {});
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: T.inkSoft,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            <span onClick={onBack} style={{ cursor: "pointer", color: T.coral }}>
              予算
            </span>
            <span style={{ opacity: 0.4 }}>›</span>
            <span style={{ color: T.ink }}>貯金目標</span>
          </div>
          <div
            style={{
              fontFamily: "'Zen Maru Gothic', 'M PLUS Rounded 1c', sans-serif",
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: "-0.01em",
            }}
          >
            貯金目標
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 4 }}>
            目的別に積み立てて、着実に前進
          </div>
        </div>
        <button
          style={{
            border: "none",
            background: T.coral,
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 999,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: `0 4px 0 ${T.coralDeep}`,
          }}
        >
          ＋ 貯金目標を追加
        </button>
      </div>

      {/* Summary hero */}
      <div
        style={{
          background: T.card,
          borderRadius: 32,
          padding: "22px 28px",
          boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
          display: "flex",
          alignItems: "center",
          gap: 32,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: T.inkSoft,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            今月の貯金合計
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 800,
                fontSize: 52,
                letterSpacing: "-0.04em",
                color: T.coral,
                lineHeight: 1,
              }}
            >
              {yen(monthly_total)}
            </span>
          </div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>毎月自動で記録されます</div>
        </div>
        <div style={{ width: 1, height: 64, background: T.hair }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {goals.map((g) => (
            <div
              key={g.id}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                background: T.bgSoft,
                border: `1px solid ${T.hair}`,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{g.emoji}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", color: T.inkSoft, fontSize: 12 }}>
                ¥{yenSlim(g.monthly_amount)}/月
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Goals grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        {goals.map((g) => {
          const pct =
            g.target_amount > 0
              ? Math.min(100, Math.round((g.accumulated_amount / g.target_amount) * 100))
              : 0;
          return (
            <div
              key={g.id}
              style={{
                background: T.card,
                borderRadius: 28,
                padding: 24,
                boxShadow: "0 8px 24px -16px rgba(80,40,10,0.18)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: "#FFF1CC",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 26,
                  }}
                >
                  {g.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{g.name}</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 5,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: "#FFF1CC",
                        color: "#A3791F",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      ¥{yenSlim(g.monthly_amount)}/月
                    </span>
                    {g.is_posted_this_month ? (
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "#DEF1E6",
                          color: T.sageDeep,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        ✅ 今月済
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "#FFF1CC",
                          color: "#A3791F",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        ⏳ 今月待ち
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: T.bgSoft,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      color: T.inkSoft,
                      cursor: "pointer",
                    }}
                  >
                    ✎
                  </span>
                  <span
                    onClick={() => handle_delete(g.id)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: T.bgSoft,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      color: T.inkSoft,
                      cursor: "pointer",
                    }}
                  >
                    🗑
                  </span>
                </div>
              </div>

              {g.memo && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: T.bgSoft,
                    fontSize: 13,
                    color: T.inkSoft,
                    lineHeight: 1.5,
                  }}
                >
                  💭 {g.memo}
                </div>
              )}

              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 16,
                  background: T.bgSoft,
                  border: `1.5px solid ${T.hair}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>積立累計</span>
                  <span style={{ fontSize: 11, color: T.inkSoft }}>
                    目標{" "}
                    <strong style={{ fontFamily: "'DM Sans', sans-serif", color: T.ink }}>
                      ¥{yenSlim(g.target_amount)}
                    </strong>
                    {g.deadline ? ` / ${g.deadline}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 22,
                      color: "#A3791F",
                    }}
                  >
                    ¥{yenSlim(g.accumulated_amount)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: T.inkSoft,
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 600,
                    }}
                  >
                    / {pct}%
                  </span>
                </div>
                <div
                  style={{ height: 8, background: "#fff", borderRadius: 999, overflow: "hidden" }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: `linear-gradient(90deg,${T.mustard},${T.coral})`,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>

              {!g.is_posted_this_month && (
                <button
                  onClick={() =>
                    api
                      .postMonthlySavings(g.id, g.monthly_amount, ym)
                      .then(() => api.listSavingsGoals().then((r) => setGoals(r.savings_goals)))
                      .catch(() => {})
                  }
                  style={{
                    border: "none",
                    background: T.mustard,
                    color: T.ink,
                    padding: "10px",
                    borderRadius: 12,
                    fontFamily: "inherit",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow: "0 3px 0 #F0A92E",
                  }}
                >
                  今月分を記録する
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
