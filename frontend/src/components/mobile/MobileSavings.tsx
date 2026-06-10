import { useEffect, useState } from "react";
import { T } from "../../theme";
import { api } from "../../api/client";
import type { components } from "../../api/types";

type SavingsGoal = components["schemas"]["SavingsGoal"];

interface MobileSavingsProps {
  onBack: () => void;
}

const yenSlim = (n: number) => Math.round(n).toLocaleString("ja-JP");

const EMOJI_OPTIONS = ["📷", "✈️", "🏠", "💻", "🛟", "🎁"];

interface MobileSavingsSheetProps {
  onClose: () => void;
}

export function MobileSavingsSheet({ onClose }: MobileSavingsSheetProps) {
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
        <div
          style={{
            width: 42,
            height: 5,
            borderRadius: 999,
            background: T.hair,
            margin: "0 auto 14px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 19, fontWeight: 900 }}>貯金目標を追加</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              minWidth: 44,
              minHeight: 44,
              borderRadius: 999,
              background: T.bgSoft,
              border: "none",
              cursor: "pointer",
              color: T.inkSoft,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* 目標名 */}
        <div
          style={{
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>目標名</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: T.inkSoft, fontStyle: "italic" }}>
            例：新しいカメラ
          </div>
        </div>

        {/* アイコン */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
            padding: "12px 14px",
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 11, color: T.inkSoft }}>アイコン</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {EMOJI_OPTIONS.map((e, i) => (
              <span
                key={e}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: i === 0 ? T.mustardSoft : "#fff",
                  border: `1.5px solid ${i === 0 ? T.mustard : T.hair}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                }}
              >
                {e}
              </span>
            ))}
          </div>
        </div>

        {/* 毎月の積立額 */}
        <div
          style={{
            background: T.bgSoft,
            border: `1.5px solid ${T.mustard}`,
            borderRadius: 18,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 28,
              color: T.mustardDeep,
            }}
          >
            ¥
          </span>
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 28,
              color: T.inkSoft,
            }}
          >
            —
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: T.inkSoft }}>毎月の積立額</span>
        </div>

        {/* 目標金額 + 目標日 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div
            style={{
              flex: 1,
              background: T.bgSoft,
              border: `1.5px solid ${T.hair}`,
              borderRadius: 14,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>目標金額（任意）</div>
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 17,
                color: T.inkSoft,
              }}
            >
              —
            </div>
          </div>
          <div
            style={{
              flex: "0 0 138px",
              background: T.bgSoft,
              border: `1.5px solid ${T.hair}`,
              borderRadius: 14,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>目標日（任意）</div>
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                fontSize: 14,
                color: T.inkSoft,
              }}
            >
              YYYY/MM
            </div>
          </div>
        </div>

        {/* メモ */}
        <div
          style={{
            background: T.bgSoft,
            border: `1.5px solid ${T.hair}`,
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 18,
            minHeight: 64,
          }}
        >
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 3 }}>メモ（任意）</div>
          <div style={{ fontSize: 13, color: T.inkSoft, fontStyle: "italic" }}>
            例：旅行記録用に。レンズ込みで揃えたい。
          </div>
        </div>

        <button
          type="button"
          style={{
            width: "100%",
            border: "none",
            background: T.coral,
            color: "#fff",
            padding: "16px",
            borderRadius: 18,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 16,
            boxShadow: `0 6px 0 ${T.coralDeep}`,
            cursor: "pointer",
          }}
        >
          保存する
        </button>
      </div>
    </div>
  );
}

export function MobileSavings({ onBack }: MobileSavingsProps) {
  const [goals, setGoals] = useState<SavingsGoal[] | null>(null);
  const [show_sheet, setShowSheet] = useState(false);

  useEffect(() => {
    api.listSavingsGoals().then((r) => setGoals(r.savings_goals));
  }, []);

  const is_loading = goals === null;
  const savings_total = goals?.reduce((s, g) => s + g.monthly_amount, 0) ?? 0;

  return (
    <div>
      {/* Back button row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 16 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: T.inkSoft,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: "8px 4px",
            display: "flex",
            alignItems: "center",
            gap: 3,
            fontFamily: "inherit",
          }}
        >
          ‹ 予算
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: T.ink }}>貯金目標</div>
        <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>目的別に積み上げる</div>
      </div>

      {is_loading && (
        <p style={{ color: T.inkSoft, fontSize: 14, textAlign: "center" }}>読み込み中…</p>
      )}

      {!is_loading && goals && (
        <>
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
            <div
              style={{
                fontSize: 10,
                color: T.inkSoft,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              今月の貯金合計
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: 40,
                  letterSpacing: "-0.04em",
                  color: T.coral,
                  lineHeight: 1,
                }}
              >
                ¥{yenSlim(savings_total)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 5, fontWeight: 500 }}>
              毎月自動で記録されます
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
              {goals.map((g) => (
                <span
                  key={g.id}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: T.bgSoft,
                    border: `1px solid ${T.hair}`,
                    color: T.ink,
                    fontSize: 10,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 11 }}>{g.emoji}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", color: T.inkSoft }}>
                    {yenSlim(g.monthly_amount / 1000)}k
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Goal list header */}
          <div style={{ display: "flex", alignItems: "center", margin: "0 2px 10px" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>目標一覧</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: T.inkSoft }}>
              {goals.length}件
            </span>
          </div>

          {/* Goal cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((g.accumulated_amount / g.target_amount) * 100));
              return (
                <div
                  key={g.id}
                  style={{
                    background: T.card,
                    borderRadius: 28,
                    padding: "16px",
                    boxShadow: T.cardShadow,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        background: T.mustardSoft,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                      }}
                    >
                      {g.emoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: T.mustardSoft,
                            color: T.mustardDeep,
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          ¥{yenSlim(g.monthly_amount)}/月
                        </span>
                        {g.is_posted_this_month ? (
                          <span
                            style={{
                              padding: "3px 9px",
                              borderRadius: 999,
                              background: T.sageSoft,
                              color: T.sageDeep,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            ✅ 今月済
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: "3px 9px",
                              borderRadius: 999,
                              background: T.mustardSoft,
                              color: T.mustardDeep,
                              fontSize: 10,
                              fontWeight: 700,
                            }}
                          >
                            ⏳ 今月分待ち
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          background: T.bgSoft,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          color: T.inkSoft,
                        }}
                      >
                        ✎
                      </span>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          background: T.bgSoft,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          color: T.inkSoft,
                        }}
                      >
                        🗑
                      </span>
                    </div>
                  </div>

                  {g.memo && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "9px 12px",
                        borderRadius: 10,
                        background: T.bgSoft,
                        fontSize: 12,
                        color: T.inkSoft,
                        lineHeight: 1.5,
                      }}
                    >
                      💭 {g.memo}
                    </div>
                  )}

                  {/* Progress */}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.hair}` }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>
                        積立累計
                      </span>
                      <span style={{ fontSize: 11, color: T.inkSoft }}>
                        目標{" "}
                        <strong style={{ fontFamily: "'DM Sans', sans-serif", color: T.ink }}>
                          ¥{yenSlim(g.target_amount)}
                        </strong>
                        {g.deadline ? ` / ${g.deadline}` : ""}
                      </span>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 7 }}
                    >
                      <span
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 700,
                          fontSize: 20,
                          color: T.mustardDeep,
                        }}
                      >
                        ¥{yenSlim(g.accumulated_amount)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: T.inkSoft,
                          fontFamily: "'DM Sans', sans-serif",
                          fontWeight: 600,
                        }}
                      >
                        / {pct}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 7,
                        background: T.bgSoft,
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${T.mustard}, ${T.coral})`,
                          borderRadius: 999,
                        }}
                      />
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
        style={{
          width: "100%",
          marginTop: 16,
          border: `1.5px dashed ${T.coral}`,
          background: "transparent",
          color: T.coralDeep,
          padding: "15px",
          borderRadius: 16,
          fontFamily: "inherit",
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        ＋ 貯金目標を追加
      </button>

      {show_sheet && <MobileSavingsSheet onClose={() => setShowSheet(false)} />}
    </div>
  );
}
