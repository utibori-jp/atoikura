/* Atoikura Mobile — Savings Goal Management (貯金目標) screen + add sheet */

const SAVINGS_GOALS = [
  {
    id:1, name:"旅行積立", emoji:"✈️",
    monthly:20000, target:250000, accumulated:170000,
    deadline:"2027/03",
    posted:true,
    memo:"北海道旅行：新幹線とホテル代",
  },
  {
    id:2, name:"緊急費用", emoji:"🛟",
    monthly:15000, target:500000, accumulated:285000,
    deadline:null,
    posted:true,
    memo:"生活費3ヶ月分が目安",
  },
  {
    id:3, name:"新しいPC", emoji:"💻",
    monthly:10000, target:180000, accumulated:60000,
    deadline:"2027/01",
    posted:false,
    memo:"作業環境を整えたい",
  },
];

const SAVINGS_TOTAL = SAVINGS_GOALS.reduce((s,g)=>s+g.monthly,0);

function MSavingsScreen() {
  return (
    <div data-screen-label="M · 08 貯金目標" style={{width:402,height:874,overflow:"hidden"}}>
      <MScreen active="goals" header={<MHeader back="予算" showMonth={false} big="貯金目標" sub="目的別に積み上げる"/>}>

        {/* Summary hero */}
        <MCard style={{background:M.card,boxShadow:"0 0 0 1px rgba(80,40,10,0.05), 0 6px 32px rgba(80,40,10,0.09)",padding:"22px 20px"}}>
          <div style={{fontSize:10,color:M.inkSoft,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>今月の貯金合計</div>
          <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:8}}>
            <span style={{fontFamily:"DM Sans",fontWeight:800,fontSize:40,letterSpacing:"-0.04em",color:M.coral,lineHeight:1}}>¥{yenSlim(SAVINGS_TOTAL)}</span>
          </div>
          <div style={{fontSize:11,color:M.inkSoft,marginTop:5,fontWeight:500}}>毎月自動で記録されます</div>
          <div style={{display:"flex",gap:6,marginTop:16}}>
            {SAVINGS_GOALS.map(g => (
              <span key={g.id} style={{padding:"5px 10px",borderRadius:999,background:M.bgSoft,border:`1px solid ${M.hair}`,color:M.ink,fontSize:10,fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:11}}>{g.emoji}</span>
                <span style={{fontFamily:"DM Sans",color:M.inkSoft}}>{yenSlim(g.monthly/1000)}k</span>
              </span>
            ))}
          </div>
        </MCard>

        {/* Goal list */}
        <div style={{display:"flex",alignItems:"center",margin:"18px 2px 10px"}}>
          <span style={{fontFamily:"var(--font-jp-display)",fontWeight:700,fontSize:15}}>目標一覧</span>
          <span style={{marginLeft:"auto",fontSize:11,color:M.inkSoft}}>{SAVINGS_GOALS.length}件</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {SAVINGS_GOALS.map(g => {
            const pct = Math.min(100, Math.round((g.accumulated / g.target) * 100));
            return (
              <MCard key={g.id} style={{padding:"16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:42,height:42,borderRadius:13,background:M.mustardSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{g.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14}}>{g.name}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                      <span style={{padding:"3px 9px",borderRadius:999,background:M.mustardSoft,color:M.mustardDeep,fontSize:10,fontWeight:700,fontFamily:"DM Sans"}}>¥{yenSlim(g.monthly)}/月</span>
                      {g.posted
                        ? <span style={{padding:"3px 9px",borderRadius:999,background:M.sageSoft,color:M.sageDeep,fontSize:10,fontWeight:700}}>✅ 今月済</span>
                        : <span style={{padding:"3px 9px",borderRadius:999,background:M.mustardSoft,color:M.mustardDeep,fontSize:10,fontWeight:700}}>⏳ 今月分待ち</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    <span style={{width:26,height:26,borderRadius:8,background:M.bgSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:M.inkSoft}}>✎</span>
                    <span style={{width:26,height:26,borderRadius:8,background:M.bgSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:M.inkSoft}}>🗑</span>
                  </div>
                </div>

                {/* Memo */}
                {g.memo && (
                  <div style={{marginTop:12,padding:"9px 12px",borderRadius:10,background:M.bgSoft,fontSize:12,color:M.inkSoft,lineHeight:1.5}}>
                    💭 {g.memo}
                  </div>
                )}

                {/* Progress */}
                <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${M.hair}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                    <span style={{fontSize:11,color:M.inkSoft,fontWeight:600}}>積立累計</span>
                    <span style={{fontSize:11,color:M.inkSoft}}>目標 <strong style={{fontFamily:"DM Sans",color:M.ink}}>¥{yenSlim(g.target)}</strong>{g.deadline?` / ${g.deadline}`:""}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:7}}>
                    <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:20,color:M.mustardDeep}}>¥{yenSlim(g.accumulated)}</span>
                    <span style={{fontSize:11,color:M.inkSoft,fontFamily:"DM Sans",fontWeight:600}}>/ {pct}%</span>
                  </div>
                  <div style={{height:7,background:M.bgSoft,borderRadius:999,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg, ${M.mustard}, ${M.coral})`,borderRadius:999}}/>
                  </div>
                </div>
              </MCard>
            );
          })}
        </div>

        <button style={{width:"100%",marginTop:16,border:`1.5px dashed ${M.coral}`,background:"transparent",color:M.coralDeep,padding:"15px",borderRadius:16,fontFamily:"inherit",fontWeight:700,fontSize:15}}>＋ 貯金目標を追加</button>
      </MScreen>
    </div>
  );
}

function MSavingsSheetScreen() {
  return (
    <div data-screen-label="M · 08b 貯金目標（追加シート）">
      <MSheetShell title="貯金目標を追加" fadedScreen={<MSavingsScreen/>}>
        {/* Goal name */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px",marginBottom:10}}>
          <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>目標名</div>
          <div style={{fontWeight:600,fontSize:14}}>新しいカメラ</div>
        </div>

        {/* Emoji picker hint */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"12px 14px",background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14}}>
          <div style={{fontSize:11,color:M.inkSoft}}>アイコン</div>
          <div style={{marginLeft:"auto",display:"flex",gap:6}}>
            {["📷","✈️","🏠","💻","🛟","🎁"].map((e,i)=>(
              <span key={e} style={{width:34,height:34,borderRadius:10,background:i===0?M.mustardSoft:"#fff",border:`1.5px solid ${i===0?M.mustard:M.hair}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{e}</span>
            ))}
          </div>
        </div>

        {/* Monthly amount — big */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.mustard}`,borderRadius:18,padding:"14px 18px",display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:28,color:M.mustardDeep}}>¥</span>
          <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:28,color:M.ink}}>12,000</span>
          <span style={{marginLeft:"auto",fontSize:12,color:M.inkSoft}}>毎月の積立額</span>
        </div>

        {/* Target & deadline */}
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1,background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>目標金額（任意）</div>
            <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:17}}>¥180,000</div>
          </div>
          <div style={{flex:"0 0 138px",background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>目標日（任意）</div>
            <div style={{fontFamily:"DM Sans",fontWeight:600,fontSize:14}}>2027/03</div>
          </div>
        </div>

        {/* Memo */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px",marginBottom:18,minHeight:64}}>
          <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>メモ（任意）</div>
          <div style={{fontSize:13,color:M.ink,lineHeight:1.6}}>旅行記録用に。レンズ込みで揃えたい。</div>
        </div>

        <button style={{width:"100%",border:"none",background:M.coral,color:"#fff",padding:"16px",borderRadius:18,fontFamily:"inherit",fontWeight:700,fontSize:16,boxShadow:`0 6px 0 ${M.coralDeep}`}}>保存する</button>
      </MSheetShell>
    </div>
  );
}

Object.assign(window, { SAVINGS_GOALS, SAVINGS_TOTAL, MSavingsScreen, MSavingsSheetScreen });
