/* Atoikura Mobile — 予算 Hub (Budget) screen — Issue #29
   Replaces the old 目標 screen. Acts as the hub for 収入 / 定期支出 / 貯金.
   Hero: 今月の予算 (auto = 収入 − 定期支出 − 貯金)
   Below: three tappable nav tiles → 収入記録 / 定期支出 / 貯金目標 */

const INCOME_THIS_MONTH = 323200;     // matches INCOMES total
const FIXED_TOTAL       = 96000;       // matches Review固定費
const SAVINGS_MONTHLY   = 45000;       // matches SAVINGS_TOTAL
const VARIABLE_BUDGET   = INCOME_THIS_MONTH - FIXED_TOTAL - SAVINGS_MONTHLY; // 182,200
const DAILY_BUDGET_V2   = Math.round(VARIABLE_BUDGET / 30);

function MBudgetScreen() {
  const tiles = [
    {
      sign: "+", emoji: "💼",
      title: "収入",       sub: `${INCOMES.length}件 · 給与・副業・一時収入`,
      amount: INCOME_THIS_MONTH,
      tone: { bg:M.sageSoft, fg:M.sageDeep, signBg:"rgba(123,196,164,0.18)" },
    },
    {
      sign: "−", emoji: "🔁",
      title: "定期支出",   sub: `${RECURRING.length}件 · 家賃・光熱費・通信費 ほか`,
      amount: FIXED_TOTAL,
      tone: { bg:"#E5EEF7", fg:"#3F6B91", signBg:"rgba(166,201,226,0.18)" },
    },
    {
      sign: "−", emoji: "💰",
      title: "貯金",       sub: `${SAVINGS_GOALS.length}件 · 目的別の積立`,
      amount: SAVINGS_MONTHLY,
      tone: { bg:M.mustardSoft, fg:M.mustardDeep, signBg:"rgba(255,194,71,0.18)" },
    },
  ];

  return (
    <div data-screen-label="M · 03v3 予算ハブ" style={{width:402,height:874,overflow:"hidden"}}>
      <MScreen active="goals" header={<MHeader title="予算" showMonth={true} big="今月の予算プラン" sub="収入から自動で算出"/>}>

        {/* ────── 今月の予算 hero ────── */}
        <MCard style={{background:M.card,boxShadow:"0 0 0 1px rgba(80,40,10,0.05), 0 6px 32px rgba(80,40,10,0.09)",padding:"22px 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:10,color:M.inkSoft,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>今月の予算</span>
            <span style={{padding:"2px 8px",borderRadius:999,background:M.bgSoft,border:`1px solid ${M.hair}`,color:M.inkSoft,fontSize:9,fontWeight:700,letterSpacing:"0.04em"}}>自動</span>
          </div>
          <div style={{display:"flex",alignItems:"baseline",gap:5,marginTop:8}}>
            <span style={{fontFamily:"DM Sans",fontWeight:800,fontSize:50,letterSpacing:"-0.04em",color:M.coral,lineHeight:1}}>¥{yenSlim(VARIABLE_BUDGET)}</span>
          </div>
          <div style={{fontSize:11,color:M.inkSoft,marginTop:6,fontWeight:500}}>変動費に使える金額（今月分）</div>

          <div style={{height:1,background:M.hair,margin:"16px 0"}}/>

          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:10,color:M.inkSoft,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase"}}>1日あたり</div>
              <div style={{display:"flex",alignItems:"baseline",gap:3,marginTop:4}}>
                <span style={{fontFamily:"DM Sans",fontWeight:800,fontSize:24,color:M.coral}}>¥{yenSlim(DAILY_BUDGET_V2)}</span>
                <span style={{fontSize:10,color:M.inkSoft,marginLeft:2}}>÷ 30日</span>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:M.inkSoft,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase"}}>今月の残り</div>
              <div style={{display:"flex",alignItems:"baseline",gap:3,justifyContent:"flex-end",marginTop:4}}>
                <span style={{fontFamily:"DM Sans",fontWeight:800,fontSize:24,color:M.ink}}>{DAYS_IN_MONTH-TODAY}</span>
                <span style={{fontSize:11,color:M.inkSoft}}>日</span>
              </div>
            </div>
          </div>
        </MCard>

        {/* ────── 予算の内訳：3 つの tap-tile ────── */}
        <div style={{display:"flex",alignItems:"baseline",margin:"20px 2px 10px"}}>
          <span style={{fontFamily:"var(--font-jp-display)",fontWeight:700,fontSize:15}}>予算の内訳</span>
          <span style={{marginLeft:"auto",fontSize:11,color:M.inkSoft}}>タップで詳細</span>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {tiles.map(t => (
            <MCard key={t.title} style={{padding:"14px 16px",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:13}}>
                <div style={{width:46,height:46,borderRadius:14,background:t.tone.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{t.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:15}}>{t.title}</div>
                  <div style={{fontSize:11,color:M.inkSoft,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.sub}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:3}}>
                    <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:13,color:t.tone.fg,padding:"1px 6px",borderRadius:6,background:t.tone.signBg}}>{t.sign}</span>
                    <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:17,color:M.ink}}>¥{yenSlim(t.amount)}</span>
                  </div>
                  <div style={{fontSize:10,color:M.inkSoft,fontWeight:600}}>今月の合計</div>
                </div>
                <span style={{color:M.coralDeep,fontSize:22,fontWeight:700,marginLeft:2}}>›</span>
              </div>
            </MCard>
          ))}
        </div>

        {/* Formula line, compact */}
        <div style={{margin:"12px 0 0",padding:"11px 14px",borderRadius:14,background:M.bgSoft,border:`1px dashed ${M.hair}`,display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontSize:11,color:M.inkSoft,fontWeight:600,fontFamily:"DM Sans"}}>
          <span style={{color:M.sageDeep}}>収入</span>
          <span>−</span>
          <span style={{color:"#3F6B91"}}>定期支出</span>
          <span>−</span>
          <span style={{color:M.mustardDeep}}>貯金</span>
          <span style={{color:M.ink,fontWeight:700}}>= 今月の予算</span>
        </div>

        {/* ────── 貯金の目的 ────── */}
        <div style={{margin:"20px 2px 10px",fontFamily:"var(--font-jp-display)",fontSize:15,fontWeight:700}}>貯金の目的</div>
        <MCard>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:M.coralSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>💭</div>
            <div style={{fontSize:13,color:M.inkSoft,lineHeight:1.5,flex:1}}>叶えたいことを書いておこう</div>
          </div>
          <div style={{padding:"13px 15px",border:`1.5px solid ${M.hair}`,borderRadius:14,background:M.bgSoft,fontSize:14,lineHeight:1.6}}>
            来年の春に北海道旅行へ。新幹線とホテル代として確保しておきたい。
          </div>
          <div style={{marginTop:12,padding:"11px 14px",borderRadius:12,background:M.sageSoft,fontSize:12,color:M.sageDeep,fontWeight:600}}>
            🎉 このペースなら約10ヶ月で達成できそう
          </div>
        </MCard>

        {/* ────── 直近3ヶ月 ────── */}
        <div style={{margin:"20px 2px 10px",fontFamily:"var(--font-jp-display)",fontSize:15,fontWeight:700}}>直近3ヶ月の予算</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,paddingBottom:8}}>
          {[
            { m:"3月", b:142000, a:131200, ok:true },
            { m:"4月", b:178000, a:182400, ok:false },
            { m:"5月", b:VARIABLE_BUDGET, a:47200, ok:true, ongoing:true },
          ].map(r => (
            <MCard key={r.m} style={{padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontFamily:"var(--font-jp-display)",fontWeight:700,fontSize:16,width:36}}>{r.m}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:15}}>{yen(r.a)}</span>
                    <span style={{fontSize:11,color:M.inkSoft}}>予算 {yen(r.b)}</span>
                  </div>
                  <div style={{height:7,background:M.bgSoft,borderRadius:999,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.min(100,(r.a/r.b)*100)}%`,background:r.ok?M.sage:M.coral,borderRadius:999}}/>
                  </div>
                </div>
                <div style={{fontSize:18}}>{r.ongoing?"⏳":r.ok?"🌞":"🌧"}</div>
              </div>
            </MCard>
          ))}
        </div>
      </MScreen>
    </div>
  );
}

// Keep the old name exported too so any external reference still works
const MGoalsScreenV2 = MBudgetScreen;

Object.assign(window, {
  INCOME_THIS_MONTH, FIXED_TOTAL, SAVINGS_MONTHLY, VARIABLE_BUDGET, DAILY_BUDGET_V2,
  MBudgetScreen, MGoalsScreenV2,
});
