/* Direction A — 予算ハブ + サブ画面 (定期支出 / 貯金目標 / 収入記録)
   Issues #25 / #27 / #28 / #29 — 1200px web layout */

// ═══ Data ════════════════════════════════════════════════════════════

const RECURRING = [
  { id:1, name:"家賃",       emoji:"🏠", day:25, amount:80000, type:"fixed",    grpId:7 },
  { id:2, name:"電気代",     emoji:"💡", day:10, amount:null,  type:"variable", grpId:7 },
  { id:3, name:"ガス代",     emoji:"🔥", day:15, amount:null,  type:"variable", grpId:7 },
  { id:4, name:"通信費",     emoji:"📱", day:27, amount:6800,  type:"fixed",    grpId:7 },
  { id:5, name:"Netflix",    emoji:"🎬", day:5,  amount:1490,  type:"fixed",    grpId:4 },
  { id:6, name:"ジム月会費", emoji:"🏋", day:13, amount:2400,  type:"fixed",    grpId:6 },
];

const PENDING_RECURRING = [
  { id:2, name:"電気代", emoji:"💡", day:10, lastAmount:7480 },
  { id:3, name:"ガス代", emoji:"🔥", day:15, lastAmount:4220 },
];

const SAVINGS_GOALS_WEB = [
  { id:1, name:"旅行積立", emoji:"✈️", monthly:20000, target:250000, accumulated:170000, deadline:"2027/03", posted:true,  memo:"北海道旅行：新幹線とホテル代" },
  { id:2, name:"緊急費用", emoji:"🛟", monthly:15000, target:500000, accumulated:285000, deadline:null,      posted:true,  memo:"生活費3ヶ月分が目安" },
  { id:3, name:"新しいPC", emoji:"💻", monthly:10000, target:180000, accumulated:60000,  deadline:"2027/01", posted:false, memo:"作業環境を整えたい" },
];
const SAVINGS_MONTHLY_TOTAL = SAVINGS_GOALS_WEB.reduce((s,g) => s + g.monthly, 0); // 45,000

const A_INCOME_TYPES = {
  salary: { label:"給与",     bg:"#DEF1E6", fg:"#4FA481" },
  side:   { label:"副業",     bg:"#E5EEF7", fg:"#3F6B91" },
  bonus:  { label:"ボーナス", bg:"#FFF1CC", fg:"#F0A92E" },
  oneoff: { label:"一時収入", bg:"#FFE8DD", fg:"#F26B3F" },
};

const INCOMES_DATA = [
  { id:1, date:"2026-05-25", amount:280000, name:"6月給与",         type:"salary", emoji:"🏢", note:"" },
  { id:2, date:"2026-05-20", amount:18500,  name:"ライティング案件", type:"side",   emoji:"✍️", note:"フリーランスnote" },
  { id:3, date:"2026-05-15", amount:16500,  name:"イラスト副業",     type:"side",   emoji:"🎨", note:"" },
  { id:4, date:"2026-05-08", amount:3200,   name:"医療費還付",       type:"oneoff", emoji:"💊", note:"確定申告分" },
  { id:5, date:"2026-05-02", amount:5000,   name:"親戚からのお祝い", type:"oneoff", emoji:"🎉", note:"" },
];
const INCOME_TOTAL_WEB    = INCOMES_DATA.reduce((s,i) => s + i.amount, 0); // 323,200
const BASE_INCOME_WEB     = 280000;
const SURPLUS_WEB         = INCOME_TOTAL_WEB - BASE_INCOME_WEB;             // 43,200
const FIXED_TOTAL_WEB     = 96000;
const VARIABLE_BUDGET_WEB = INCOME_TOTAL_WEB - FIXED_TOTAL_WEB - SAVINGS_MONTHLY_TOTAL; // 182,200
const DAILY_BUDGET_V2_WEB = Math.round(VARIABLE_BUDGET_WEB / 30);           // 6,073

// ═══ Sub-screen chrome wrapper ════════════════════════════════════════

function ABudgetSubChrome({ label, title, subtitle, breadcrumb, headerRight, active, children }) {
  return (
    <div data-screen-label={label} style={{
      width:1200, background:A_THEME.bg, fontFamily:"var(--font-jp)", color:A_THEME.ink,
      padding:32, display:"flex", flexDirection:"column", gap:24
    }}>
      <ANavBar active={active || "budget"}/>
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
        <div>
          {breadcrumb && (
            <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:A_THEME.inkSoft, fontWeight:600, marginBottom:6 }}>
              <span
                onClick={() => window.AtoikuraNavigate?.("budget")}
                style={{ cursor:"pointer", color:A_THEME.coral }}>予算</span>
              <span style={{ opacity:0.4 }}>›</span>
              <span style={{ color:A_THEME.ink }}>{breadcrumb}</span>
            </div>
          )}
          <div style={{ fontFamily:"var(--font-jp-display)", fontSize:30, fontWeight:900, letterSpacing:"-0.01em" }}>{title}</div>
          <div style={{ fontSize:14, color:A_THEME.inkSoft, marginTop:4 }}>{subtitle}</div>
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

// ─── Tile → sub-screen routing ────────────────────────────────────────
const TILE_NAV = { "収入":"income", "定期支出":"recurring", "貯金":"savings" };

// ═══ 予算ハブ ══════════════════════════════════════════════════════════

function ABudgetScreen() {
  const spentPct = Math.round((SPENT_SO_FAR / VARIABLE_BUDGET_WEB) * 100);

  const tiles = [
    {
      sign:"+", emoji:"💼", title:"収入",
      sub:`${INCOMES_DATA.length}件 · 給与・副業・一時収入`,
      amount: INCOME_TOTAL_WEB,
      tone:{ bg:"#DEF1E6", fg:"#4FA481", signBg:"rgba(79,164,129,0.14)" },
    },
    {
      sign:"−", emoji:"🔁", title:"定期支出",
      sub:`${RECURRING.length}件 · 家賃・光熱費・通信費 ほか`,
      amount: FIXED_TOTAL_WEB,
      tone:{ bg:"#E5EEF7", fg:"#3F6B91", signBg:"rgba(63,107,145,0.12)" },
    },
    {
      sign:"−", emoji:"💰", title:"貯金",
      sub:`${SAVINGS_GOALS_WEB.length}件 · 目的別の積立`,
      amount: SAVINGS_MONTHLY_TOTAL,
      tone:{ bg:"#FFF1CC", fg:"#A3791F", signBg:"rgba(255,194,71,0.18)" },
    },
  ];

  return (
    <div data-screen-label="A · 02 予算" style={{
      width:1200, background:A_THEME.bg, fontFamily:"var(--font-jp)", color:A_THEME.ink,
      padding:32, display:"flex", flexDirection:"column", gap:24
    }}>
      <ANavBar active="budget"/>

      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontFamily:"var(--font-jp-display)", fontSize:30, fontWeight:900, letterSpacing:"-0.01em" }}>今月の予算プラン</div>
          <div style={{ fontSize:14, color:A_THEME.inkSoft, marginTop:4 }}>収入 − 定期支出 − 貯金 で自動算出されます</div>
        </div>
        <div style={{ padding:"8px 14px", borderRadius:999, background:A_THEME.card, fontSize:12, color:A_THEME.inkSoft }}>2026年 5月 ▾</div>
      </div>

      {/* Hero */}
      <div style={{ background:A_THEME.card, borderRadius:32, padding:32, boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)", display:"flex", alignItems:"stretch", gap:0 }}>
        <div style={{ flex:"0 0 480px", paddingRight:32, borderRight:`1.5px solid ${A_THEME.hair}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:12, color:A_THEME.inkSoft, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>今月の予算</span>
            <span style={{ padding:"2px 8px", borderRadius:999, background:A_THEME.bgSoft, border:`1px solid ${A_THEME.hair}`, fontSize:10, color:A_THEME.inkSoft, fontWeight:700 }}>自動</span>
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:8, marginTop:12 }}>
            <span style={{ fontFamily:"DM Sans", fontWeight:800, fontSize:72, letterSpacing:"-0.04em", color:A_THEME.coral, lineHeight:1 }}>
              {yenSlim(VARIABLE_BUDGET_WEB)}
            </span>
            <span style={{ fontFamily:"var(--font-jp-display)", fontWeight:700, fontSize:24, color:A_THEME.ink }}>円</span>
          </div>
          <div style={{ fontSize:13, color:A_THEME.inkSoft, marginTop:8 }}>変動費に使える金額（今月分）</div>
          <div style={{ height:8, background:A_THEME.bgSoft, borderRadius:999, marginTop:16, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${spentPct}%`, background:`linear-gradient(90deg,${A_THEME.mustard},${A_THEME.coral})`, borderRadius:999 }}/>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:A_THEME.inkSoft, marginTop:6, fontFamily:"DM Sans" }}>
            <span>使用済 {yen(SPENT_SO_FAR)}（{spentPct}%）</span>
            <span>残り {yen(VARIABLE_BUDGET_WEB - SPENT_SO_FAR)}</span>
          </div>
        </div>

        <div style={{ flex:1, paddingLeft:0, display:"grid", gridTemplateColumns:"1fr 1fr", alignContent:"center" }}>
          {[
            { label:"1日あたり",   value:`¥${yenSlim(DAILY_BUDGET_V2_WEB)}`, sub:"÷ 30日" },
            { label:"今月の残り",   value:`${DAYS_IN_MONTH - TODAY}日`,       sub:"5/18 時点" },
            { label:"消化ペース",   value:`${spentPct}%`,                     sub:"いいペースです" },
            { label:"収入 − 固定", value:`¥${yenSlim(INCOME_TOTAL_WEB - FIXED_TOTAL_WEB)}`, sub:"変動費 + 貯金の元" },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding:"18px 22px",
              borderRight:  i % 2 === 0 ? `1px solid ${A_THEME.hair}` : "none",
              borderBottom: i < 2      ? `1px solid ${A_THEME.hair}` : "none",
            }}>
              <div style={{ fontSize:12, color:A_THEME.inkSoft, fontWeight:600 }}>{s.label}</div>
              <div style={{ fontFamily:"DM Sans", fontWeight:800, fontSize:26, marginTop:4, color:A_THEME.ink, letterSpacing:"-0.02em" }}>{s.value}</div>
              <div style={{ fontSize:11, color:A_THEME.inkSoft, marginTop:2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Budget breakdown tiles */}
      <div style={{ display:"flex", gap:16 }}>
        {tiles.map(t => (
          <div key={t.title}
            onClick={() => window.AtoikuraNavigate?.(TILE_NAV[t.title])}
            style={{
              flex:1, background:A_THEME.card, borderRadius:28, padding:"22px 24px",
              boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)",
              cursor:"pointer", position:"relative", transition:"transform 0.1s, box-shadow 0.1s"
            }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
              <div style={{ width:46, height:46, borderRadius:14, background:t.tone.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{t.emoji}</div>
              <div>
                <div style={{ fontFamily:"var(--font-jp-display)", fontWeight:700, fontSize:16 }}>{t.title}</div>
                <div style={{ fontSize:12, color:A_THEME.inkSoft, marginTop:2 }}>{t.sub}</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
              <span style={{ fontFamily:"DM Sans", fontWeight:700, fontSize:13, color:t.tone.fg, padding:"2px 8px", borderRadius:6, background:t.tone.signBg }}>{t.sign}</span>
              <span style={{ fontFamily:"DM Sans", fontWeight:800, fontSize:32, letterSpacing:"-0.03em", color:A_THEME.ink }}>{yen(t.amount)}</span>
            </div>
            <div style={{ fontSize:11, color:A_THEME.inkSoft, marginTop:3 }}>今月の合計</div>
            <div style={{ position:"absolute", bottom:18, right:20, fontSize:22, color:A_THEME.coral, opacity:0.55 }}>›</div>
          </div>
        ))}
      </div>

      {/* Formula */}
      <div style={{ padding:"14px 20px", borderRadius:16, background:A_THEME.bgSoft, border:`1px dashed ${A_THEME.hair}`, display:"flex", alignItems:"center", justifyContent:"center", gap:10, fontSize:13, fontWeight:600, fontFamily:"DM Sans" }}>
        <span style={{ color:"#4FA481", fontWeight:700 }}>収入 {yen(INCOME_TOTAL_WEB)}</span>
        <span style={{ color:A_THEME.inkSoft }}>−</span>
        <span style={{ color:"#3F6B91", fontWeight:700 }}>定期支出 {yen(FIXED_TOTAL_WEB)}</span>
        <span style={{ color:A_THEME.inkSoft }}>−</span>
        <span style={{ color:"#A3791F", fontWeight:700 }}>貯金 {yen(SAVINGS_MONTHLY_TOTAL)}</span>
        <span style={{ fontSize:18, color:A_THEME.hair, margin:"0 4px" }}>=</span>
        <span style={{ color:A_THEME.coralDeep, fontWeight:800, fontSize:15 }}>今月の予算 {yen(VARIABLE_BUDGET_WEB)}</span>
      </div>

      {/* 3-month history */}
      <div style={{ background:A_THEME.card, borderRadius:32, padding:28, boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)" }}>
        <div style={{ fontFamily:"var(--font-jp-display)", fontSize:16, fontWeight:700, marginBottom:16 }}>直近3ヶ月の予算</div>
        <div style={{ display:"flex", gap:16 }}>
          {[
            { m:"3月", b:142000, a:131200, ok:true  },
            { m:"4月", b:178000, a:182400, ok:false },
            { m:"5月", b:VARIABLE_BUDGET_WEB, a:47200, ok:true, ongoing:true },
          ].map(r => (
            <div key={r.m} style={{
              flex:1, padding:"18px 20px", borderRadius:24,
              background: r.ongoing ? "#FFF1CC" : A_THEME.bgSoft,
              border: `1.5px solid ${r.ongoing ? A_THEME.mustard : A_THEME.hair}`
            }}>
              <div style={{ fontFamily:"var(--font-jp-display)", fontWeight:700, fontSize:17 }}>
                {r.m}
                {r.ongoing && <span style={{ fontSize:11, marginLeft:6, color:A_THEME.coralDeep, fontWeight:700 }}>進行中</span>}
              </div>
              <div style={{ fontFamily:"DM Sans", fontWeight:700, fontSize:22, marginTop:8 }}>{yen(r.a)}</div>
              <div style={{ fontSize:12, color:A_THEME.inkSoft, marginTop:2 }}>
                予算 {yen(r.b)}
                {!r.ongoing && (r.ok ? ` · ¥${yenSlim(r.b - r.a)} 余裕` : ` · ¥${yenSlim(r.a - r.b)} 超過`)}
              </div>
              <div style={{ height:8, background:"#fff", borderRadius:999, marginTop:10, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${Math.min(100,(r.a/r.b)*100)}%`, background:r.ok?A_THEME.sage:A_THEME.coral, borderRadius:999 }}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══ 定期支出 ══════════════════════════════════════════════════════════

function ARecurringScreen() {
  return (
    <ABudgetSubChrome
      label="A · 06 定期支出"
      title="定期支出"
      subtitle="毎月の固定・半固定費を管理します"
      breadcrumb="定期支出"
      headerRight={
        <button style={{ border:"none", background:A_THEME.coral, color:"#fff", padding:"12px 24px", borderRadius:999, fontFamily:"inherit", fontWeight:700, fontSize:14, cursor:"pointer", boxShadow:`0 4px 0 ${A_THEME.coralDeep}` }}>
          ＋ 定期支出を追加
        </button>
      }
    >
      {/* Pending confirmations */}
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <span style={{ fontFamily:"var(--font-jp-display)", fontWeight:900, fontSize:15, color:A_THEME.coralDeep }}>💬 確認待ち</span>
          <span style={{ padding:"2px 9px", borderRadius:999, background:A_THEME.coral, color:"#fff", fontFamily:"DM Sans", fontWeight:700, fontSize:11 }}>
            {PENDING_RECURRING.length}
          </span>
          <span style={{ marginLeft:"auto", fontSize:12, color:A_THEME.inkSoft }}>5月分</span>
        </div>
        <div style={{ display:"flex", gap:16 }}>
          {PENDING_RECURRING.map(p => (
            <div key={p.id} style={{ flex:1, background:A_THEME.card, borderRadius:24, padding:"20px 22px", border:"1.5px solid #FFE8DD", boxShadow:"0 8px 24px -16px rgba(80,40,10,0.12)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:46, height:46, borderRadius:14, background:"#FFE8DD", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{p.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontWeight:700, fontSize:16 }}>{p.name}</span>
                    <span style={{ padding:"3px 9px", borderRadius:999, background:A_THEME.coral, color:"#fff", fontSize:11, fontWeight:700 }}>要確認</span>
                  </div>
                  <div style={{ fontSize:12, color:A_THEME.inkSoft, marginTop:4 }}>
                    前回 <strong style={{ fontFamily:"DM Sans", color:A_THEME.ink }}>{yen(p.lastAmount)}</strong> · 毎月 {p.day}日
                  </div>
                </div>
              </div>
              <button style={{ width:"100%", marginTop:14, border:"none", background:A_THEME.coral, color:"#fff", padding:"12px", borderRadius:14, fontFamily:"inherit", fontWeight:700, fontSize:14, boxShadow:`0 4px 0 ${A_THEME.coralDeep}`, cursor:"pointer" }}>
                金額を確定する
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Recurring template list */}
      <div style={{ background:A_THEME.card, borderRadius:32, padding:28, boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
          <div style={{ fontFamily:"var(--font-jp-display)", fontSize:16, fontWeight:700 }}>
            繰り返し設定&nbsp;
            <span style={{ fontSize:12, color:A_THEME.inkSoft, fontWeight:400 }}>{RECURRING.length}件</span>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <APill>固定</APill>
            <APill>要確認</APill>
            <APill active>すべて</APill>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          {RECURRING.map(r => {
            const isFixed = r.type === "fixed";
            return (
              <div key={r.id} style={{ padding:"16px 18px", borderRadius:20, background:A_THEME.bgSoft, border:`1.5px solid ${A_THEME.hair}`, display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:14, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, boxShadow:`0 2px 0 ${A_THEME.hair}` }}>{r.emoji}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{r.name}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5 }}>
                    <span style={{ padding:"3px 8px", borderRadius:999, background:"#E5EEF7", color:"#3F6B91", fontSize:11, fontWeight:700, fontFamily:"DM Sans" }}>毎月 {r.day}日</span>
                    <span style={{ padding:"3px 8px", borderRadius:999, background:isFixed?"#DEF1E6":"#FFF1CC", color:isFixed?A_THEME.sageDeep:"#A3791F", fontSize:11, fontWeight:700 }}>
                      {isFixed ? "固定" : "要確認"}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"DM Sans", fontWeight:700, fontSize:16, color:r.amount ? A_THEME.ink : A_THEME.inkSoft }}>
                    {r.amount ? yen(r.amount) : "—"}
                  </div>
                  <div style={{ display:"flex", gap:4, marginTop:6, justifyContent:"flex-end" }}>
                    <span style={{ width:28, height:28, borderRadius:8, background:"#fff", border:`1px solid ${A_THEME.hair}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:A_THEME.inkSoft, cursor:"pointer" }}>✎</span>
                    <span style={{ width:28, height:28, borderRadius:8, background:"#fff", border:`1px solid ${A_THEME.hair}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:A_THEME.inkSoft, cursor:"pointer" }}>🗑</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button style={{ width:"100%", marginTop:16, border:`1.5px dashed ${A_THEME.coral}`, background:"transparent", color:A_THEME.coralDeep, padding:"14px", borderRadius:16, fontFamily:"inherit", fontWeight:700, fontSize:14, cursor:"pointer" }}>
          ＋ 定期支出を追加
        </button>
      </div>
    </ABudgetSubChrome>
  );
}

// ═══ 貯金目標 ══════════════════════════════════════════════════════════

function ASavingsScreen() {
  return (
    <ABudgetSubChrome
      label="A · 07 貯金目標"
      title="貯金目標"
      subtitle="目的別に積み立てて、着実に前進"
      breadcrumb="貯金目標"
      headerRight={
        <button style={{ border:"none", background:A_THEME.coral, color:"#fff", padding:"12px 24px", borderRadius:999, fontFamily:"inherit", fontWeight:700, fontSize:14, cursor:"pointer", boxShadow:`0 4px 0 ${A_THEME.coralDeep}` }}>
          ＋ 貯金目標を追加
        </button>
      }
    >
      {/* Summary hero */}
      <div style={{ background:A_THEME.card, borderRadius:32, padding:"22px 28px", boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)", display:"flex", alignItems:"center", gap:32 }}>
        <div>
          <div style={{ fontSize:12, color:A_THEME.inkSoft, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>今月の貯金合計</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:8 }}>
            <span style={{ fontFamily:"DM Sans", fontWeight:800, fontSize:52, letterSpacing:"-0.04em", color:A_THEME.coral, lineHeight:1 }}>{yen(SAVINGS_MONTHLY_TOTAL)}</span>
          </div>
          <div style={{ fontSize:12, color:A_THEME.inkSoft, marginTop:4 }}>毎月自動で記録されます</div>
        </div>
        <div style={{ width:1, height:64, background:A_THEME.hair }}/>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          {SAVINGS_GOALS_WEB.map(g => (
            <div key={g.id} style={{ padding:"8px 14px", borderRadius:999, background:A_THEME.bgSoft, border:`1px solid ${A_THEME.hair}`, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:14 }}>{g.emoji}</span>
              <span style={{ fontWeight:700, fontSize:13 }}>{g.name}</span>
              <span style={{ fontFamily:"DM Sans", color:A_THEME.inkSoft, fontSize:12 }}>¥{yenSlim(g.monthly)}/月</span>
            </div>
          ))}
        </div>
      </div>

      {/* Goals grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20 }}>
        {SAVINGS_GOALS_WEB.map(g => {
          const pct = Math.min(100, Math.round((g.accumulated / g.target) * 100));
          return (
            <div key={g.id} style={{ background:A_THEME.card, borderRadius:28, padding:24, boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)", display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:52, height:52, borderRadius:16, background:"#FFF1CC", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>{g.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:16 }}>{g.name}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5, flexWrap:"wrap" }}>
                    <span style={{ padding:"3px 10px", borderRadius:999, background:"#FFF1CC", color:"#A3791F", fontSize:11, fontWeight:700, fontFamily:"DM Sans" }}>
                      ¥{yenSlim(g.monthly)}/月
                    </span>
                    {g.posted
                      ? <span style={{ padding:"3px 10px", borderRadius:999, background:"#DEF1E6", color:A_THEME.sageDeep, fontSize:11, fontWeight:700 }}>✅ 今月済</span>
                      : <span style={{ padding:"3px 10px", borderRadius:999, background:"#FFF1CC", color:"#A3791F", fontSize:11, fontWeight:700 }}>⏳ 今月待ち</span>
                    }
                  </div>
                </div>
                <span style={{ width:28, height:28, borderRadius:8, background:A_THEME.bgSoft, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:A_THEME.inkSoft, cursor:"pointer" }}>✎</span>
              </div>

              {g.memo && (
                <div style={{ padding:"10px 14px", borderRadius:12, background:A_THEME.bgSoft, fontSize:13, color:A_THEME.inkSoft, lineHeight:1.5 }}>
                  💭 {g.memo}
                </div>
              )}

              <div style={{ padding:"14px 16px", borderRadius:16, background:A_THEME.bgSoft, border:`1.5px solid ${A_THEME.hair}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
                  <span style={{ fontSize:11, color:A_THEME.inkSoft, fontWeight:600 }}>積立累計</span>
                  <span style={{ fontSize:11, color:A_THEME.inkSoft }}>
                    目標 <strong style={{ fontFamily:"DM Sans", color:A_THEME.ink }}>¥{yenSlim(g.target)}</strong>
                    {g.deadline ? ` / ${g.deadline}` : ""}
                  </span>
                </div>
                <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:8 }}>
                  <span style={{ fontFamily:"DM Sans", fontWeight:700, fontSize:22, color:"#A3791F" }}>¥{yenSlim(g.accumulated)}</span>
                  <span style={{ fontSize:12, color:A_THEME.inkSoft, fontFamily:"DM Sans", fontWeight:600 }}>/ {pct}%</span>
                </div>
                <div style={{ height:8, background:"#fff", borderRadius:999, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${A_THEME.mustard},${A_THEME.coral})`, borderRadius:999 }}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ABudgetSubChrome>
  );
}

// ═══ 収入記録 ══════════════════════════════════════════════════════════

function AIncomeScreen() {
  const incomeDays = [...new Set(INCOMES_DATA.map(e => e.date))].sort().reverse();

  return (
    <ABudgetSubChrome
      label="A · 08 収入記録"
      title="収入記録"
      subtitle="基準と余剰を分けて管理します"
      breadcrumb="収入記録"
      headerRight={
        <button style={{ border:"none", background:A_THEME.sage, color:"#fff", padding:"12px 24px", borderRadius:999, fontFamily:"inherit", fontWeight:700, fontSize:14, cursor:"pointer", boxShadow:`0 4px 0 ${A_THEME.sageDeep}` }}>
          ＋ 収入を記録
        </button>
      }
    >
      <div style={{ display:"flex", gap:24, alignItems:"flex-start" }}>
        {/* Left: hero */}
        <div style={{ flex:"0 0 380px" }}>
          <div style={{ background:A_THEME.card, borderRadius:28, padding:24, boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <span style={{ fontSize:12, color:A_THEME.inkSoft, fontWeight:600 }}>5月の収入合計</span>
              <span style={{ fontFamily:"DM Sans", fontWeight:700, color:A_THEME.ink }}>{yen(INCOME_TOTAL_WEB)}</span>
            </div>

            <div style={{ height:1, background:A_THEME.hair, marginBottom:16 }}/>

            {/* Base income */}
            <div>
              <div style={{ fontSize:11, color:A_THEME.inkSoft, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>基準収入</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:6 }}>
                <span style={{ fontFamily:"DM Sans", fontWeight:800, fontSize:32, letterSpacing:"-0.02em", color:A_THEME.ink }}>{yen(BASE_INCOME_WEB)}</span>
              </div>
              <div style={{ fontSize:11, color:A_THEME.inkSoft, marginTop:3 }}>毎月の見込み・予算の元</div>
              <button style={{ marginTop:10, padding:"7px 14px", border:`1px solid ${A_THEME.hair}`, background:A_THEME.bgSoft, color:A_THEME.inkSoft, borderRadius:999, fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                ✎ 基準収入を編集
              </button>
            </div>

            <div style={{ height:1, background:A_THEME.hair, margin:"16px 0" }}/>

            {/* Surplus */}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:11, color:A_THEME.inkSoft, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase" }}>余剰金額</span>
                <span style={{ padding:"2px 7px", borderRadius:999, background:A_THEME.bgSoft, border:`1px solid ${A_THEME.hair}`, fontSize:9, fontWeight:700, color:A_THEME.inkSoft }}>未振分</span>
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:4, marginTop:6 }}>
                <span style={{ fontFamily:"DM Sans", fontWeight:800, fontSize:14, color:A_THEME.sageDeep }}>+</span>
                <span style={{ fontFamily:"DM Sans", fontWeight:800, fontSize:32, color:A_THEME.sageDeep, letterSpacing:"-0.02em" }}>{yen(SURPLUS_WEB)}</span>
              </div>
              <div style={{ fontSize:11, color:A_THEME.inkSoft, marginTop:3 }}>基準を超えた今月の上振れ</div>
              <button style={{ marginTop:10, padding:"9px 16px", border:"none", borderRadius:999, background:A_THEME.mustard, color:A_THEME.ink, fontFamily:"inherit", fontSize:12, fontWeight:800, cursor:"pointer", boxShadow:"0 3px 0 #F0A92E" }}>
                振り分ける →
              </button>
            </div>
          </div>
        </div>

        {/* Right: income list */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ display:"flex", gap:8 }}>
            {["3月","4月","5月","6月"].map((m, i) => (
              <APill key={m} active={i === 2}>{m}</APill>
            ))}
          </div>

          {incomeDays.map(date => {
            const items = INCOMES_DATA.filter(e => e.date === date);
            const total = items.reduce((s, e) => s + e.amount, 0);
            const d = parseInt(date.split("-")[2]);
            return (
              <div key={date} style={{ background:A_THEME.card, borderRadius:24, padding:"20px 24px", boxShadow:"0 8px 24px -16px rgba(80,40,10,0.12)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, paddingBottom:12, borderBottom:`1.5px solid ${A_THEME.hair}` }}>
                  <div style={{ width:50, height:50, borderRadius:16, background:A_THEME.bgSoft, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:`1.5px solid ${A_THEME.hair}` }}>
                    <div style={{ fontFamily:"DM Sans", fontWeight:700, fontSize:20, lineHeight:1 }}>{d}</div>
                    <div style={{ fontSize:10, color:A_THEME.inkSoft, marginTop:1 }}>5月</div>
                  </div>
                  <div style={{ fontFamily:"DM Sans", fontWeight:700, fontSize:18, color:A_THEME.sageDeep, marginLeft:"auto" }}>+{yen(total)}</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", marginTop:4 }}>
                  {items.map((e, i) => {
                    const t = A_INCOME_TYPES[e.type];
                    const isBase = e.type === "salary";
                    return (
                      <div key={e.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 4px", borderBottom:i < items.length - 1 ? `1px solid ${A_THEME.hair}` : "none" }}>
                        <div style={{ width:38, height:38, borderRadius:12, background:"#DEF1E6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>{e.emoji}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:14, display:"flex", alignItems:"center", gap:8 }}>
                            {e.name}
                            <span style={{ padding:"2px 8px", borderRadius:6, background:t.bg, color:t.fg, fontSize:11, fontWeight:700 }}>{t.label}</span>
                            {isBase && <span style={{ padding:"2px 7px", borderRadius:6, background:"rgba(42,37,32,0.08)", color:A_THEME.inkSoft, fontSize:10, fontWeight:700, letterSpacing:"0.04em" }}>基準</span>}
                          </div>
                          {e.note && <div style={{ fontSize:12, color:A_THEME.inkSoft, marginTop:2 }}>{e.note}</div>}
                        </div>
                        <div style={{ fontFamily:"DM Sans", fontWeight:700, fontSize:16, color:A_THEME.sageDeep }}>+{yen(e.amount)}</div>
                        <div style={{ display:"flex", gap:6, opacity:0.45 }}>
                          <span style={{ padding:"4px 8px", borderRadius:8, fontSize:12, cursor:"pointer" }}>✎</span>
                          <span style={{ padding:"4px 8px", borderRadius:8, fontSize:12, cursor:"pointer" }}>🗑</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ABudgetSubChrome>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────
Object.assign(window, {
  RECURRING, PENDING_RECURRING,
  SAVINGS_GOALS_WEB, SAVINGS_MONTHLY_TOTAL,
  A_INCOME_TYPES, INCOMES_DATA,
  INCOME_TOTAL_WEB, BASE_INCOME_WEB, SURPLUS_WEB,
  FIXED_TOTAL_WEB, VARIABLE_BUDGET_WEB, DAILY_BUDGET_V2_WEB,
  ABudgetSubChrome, ABudgetScreen, ARecurringScreen, ASavingsScreen, AIncomeScreen,
});
