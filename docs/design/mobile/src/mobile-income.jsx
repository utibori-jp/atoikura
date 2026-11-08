/* Atoikura Mobile — 収入記録 (Income) screen (redesigned)
   - Hero contrasts 基準収入 (baseline) vs 余剰金額 (surplus this month)
   - Pencil ✎ on 基準収入 opens the "edit base" sheet
   - 振り分ける button opens the allocation sheet (savings goal / add to budget)
   - Month chips at the top of the list section
   - The global tab-bar ＋ turns sage on this screen (no separate FAB) */

const INCOME_TYPES = {
  salary:   { label:"給与",     bg:M.sageSoft,    fg:M.sageDeep },
  side:     { label:"副業",     bg:"#E5EEF7",     fg:"#3F6B91" },
  bonus:    { label:"ボーナス", bg:"#FFF1CC",     fg:"#F0A92E" },
  oneoff:   { label:"一時収入", bg:"#FFE8DD",     fg:"#F26B3F" },
};

const INCOMES = [
  { id:1, date:"2026-05-25", amount:280000, name:"6月給与",      type:"salary", emoji:"🏢", note:"" },
  { id:2, date:"2026-05-20", amount:18500,  name:"ライティング案件", type:"side",   emoji:"✍️", note:"フリーランスnote" },
  { id:3, date:"2026-05-15", amount:16500,  name:"イラスト副業",   type:"side",   emoji:"🎨", note:"" },
  { id:4, date:"2026-05-08", amount:3200,   name:"医療費還付",    type:"oneoff", emoji:"💊", note:"確定申告分" },
  { id:5, date:"2026-05-02", amount:5000,   name:"親戚からのお祝い", type:"oneoff", emoji:"🎉", note:"" },
];

const INCOME_TOTAL = INCOMES.reduce((s,i)=>s+i.amount,0);

// Baseline expected monthly income (salary). Surplus = actual − base.
const BASE_INCOME = 280000;
const SURPLUS     = INCOME_TOTAL - BASE_INCOME; // 43,200

function MIncomeScreen() {
  const days = [...new Set(INCOMES.map(e=>e.date))].sort().reverse();
  return (
    <div data-screen-label="M · 09 収入記録" style={{width:402,height:874,overflow:"hidden"}}>
      <MScreen active="goals" addTone="sage" header={<MHeader back="予算" showMonth={false} big="収入記録" sub="基準と余剰を分けて管理"/>}>

        {/* ────── Hero: base vs surplus ────── */}
        <MCard style={{background:M.card,boxShadow:"0 0 0 1px rgba(80,40,10,0.05), 0 6px 32px rgba(80,40,10,0.09)",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:M.inkSoft,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>5月の収入合計</span>
            <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:11,color:M.ink}}>¥{yenSlim(INCOME_TOTAL)}</span>
            <span style={{marginLeft:"auto",fontSize:10,color:M.inkSoft,fontWeight:600}}>{INCOMES.length}件</span>
          </div>

          <div style={{height:1,background:M.hair,margin:"12px 0 14px"}}/>

          {/* Two-zone split: base | surplus */}
          <div style={{display:"flex",gap:14,alignItems:"stretch"}}>
            {/* Base income */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,color:M.inkSoft,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>基準収入</div>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:6}}>
                <span style={{fontFamily:"DM Sans",fontWeight:800,fontSize:24,letterSpacing:"-0.03em",color:M.ink}}>¥{yenSlim(BASE_INCOME)}</span>
              </div>
              <div style={{fontSize:10,color:M.inkSoft,marginTop:3}}>毎月の見込み・予算の元</div>
              <button style={{marginTop:10,padding:"6px 12px",border:`1px solid ${M.hair}`,background:M.bgSoft,color:M.inkSoft,borderRadius:999,fontFamily:"inherit",fontSize:11,fontWeight:700,display:"inline-flex",alignItems:"center",gap:5,cursor:"pointer"}}>
                <span style={{fontSize:11}}>✎</span>
                <span>編集</span>
              </button>
            </div>

            {/* Divider */}
            <div style={{width:1,background:M.hair}}/>

            {/* Surplus */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10,color:M.inkSoft,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>余剰金額</span>
                <span style={{padding:"1px 6px",borderRadius:999,background:M.bgSoft,border:`1px solid ${M.hair}`,color:M.inkSoft,fontSize:9,fontWeight:700,letterSpacing:"0.04em"}}>未振分</span>
              </div>
              <div style={{display:"flex",alignItems:"baseline",gap:2,marginTop:6}}>
                <span style={{fontFamily:"DM Sans",fontWeight:800,fontSize:14,color:M.sageDeep}}>+</span>
                <span style={{fontFamily:"DM Sans",fontWeight:800,fontSize:24,color:M.sageDeep,letterSpacing:"-0.03em"}}>¥{yenSlim(SURPLUS)}</span>
              </div>
              <div style={{fontSize:10,color:M.inkSoft,marginTop:3}}>基準を超えた今月の上振れ</div>
              <button style={{marginTop:10,padding:"7px 13px",border:"none",borderRadius:999,background:M.mustard,color:M.ink,fontFamily:"inherit",fontSize:11,fontWeight:800,display:"inline-flex",alignItems:"center",gap:4,boxShadow:`0 3px 0 ${M.mustardDeep}`,cursor:"pointer"}}>
                <span>振り分ける</span>
                <span style={{fontSize:13}}>→</span>
              </button>
            </div>
          </div>
        </MCard>

        {/* ────── List section ────── */}
        <div style={{margin:"20px 2px 10px",fontFamily:"var(--font-jp-display)",fontSize:15,fontWeight:700}}>収入の記録</div>

        {/* Month chips */}
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6,marginBottom:12}}>
          {["3月","4月","5月","6月"].map((m,i)=>(
            <div key={m} style={{flexShrink:0,padding:"8px 16px",borderRadius:999,border:`1.5px solid ${i===2?M.coral:M.hair}`,background:i===2?M.coral:"#fff",color:i===2?"#fff":M.ink,fontSize:13,fontWeight:600}}>{m}</div>
          ))}
        </div>

        {/* Day-grouped income list */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {days.map(date => {
            const items = INCOMES.filter(e=>e.date===date);
            const total = items.reduce((s,e)=>s+e.amount,0);
            const d = parseInt(date.split("-")[2]);
            return (
              <div key={date}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 2px 8px"}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:5}}>
                    <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:20}}>{d}</span>
                    <span style={{fontSize:11,color:M.inkSoft}}>5月 {["月","火","水","木","金","土","日"][d%7]}</span>
                  </div>
                  <span style={{marginLeft:"auto",fontFamily:"DM Sans",fontWeight:700,fontSize:15,color:M.sageDeep}}>+{yen(total)}</span>
                </div>
                <MCard style={{padding:"4px 16px"}}>
                  {items.map((e,i) => {
                    const t = INCOME_TYPES[e.type];
                    const isBase = e.type === "salary";
                    return (
                      <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:i<items.length-1?`1px solid ${M.hair}`:"none"}}>
                        <div style={{width:36,height:36,borderRadius:11,background:M.sageSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{e.emoji}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:6}}>
                            <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.name}</span>
                            <span style={{flexShrink:0,padding:"2px 7px",borderRadius:6,background:t.bg,color:t.fg,fontSize:10,fontWeight:700}}>{t.label}</span>
                            {isBase && <span style={{flexShrink:0,padding:"2px 7px",borderRadius:6,background:"rgba(42,37,32,0.08)",color:M.inkSoft,fontSize:9,fontWeight:700,letterSpacing:"0.04em"}}>基準</span>}
                          </div>
                          {e.note && <div style={{fontSize:11,color:M.inkSoft,marginTop:2}}>{e.note}</div>}
                        </div>
                        <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:15,color:M.sageDeep}}>+¥{yenSlim(e.amount)}</div>
                      </div>
                    );
                  })}
                </MCard>
              </div>
            );
          })}
        </div>
      </MScreen>
    </div>
  );
}

// ───────────────────────────────────────────────────
// Sheet: 収入を記録 (global + flow) — opened from the tab bar's sage +
// ───────────────────────────────────────────────────
function MIncomeSheetScreen() {
  return (
    <div data-screen-label="M · 09b 収入を記録">
      <MSheetShell title="収入を記録" fadedScreen={<MIncomeScreen/>}>
        {/* Amount — big, sage accent */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.sage}`,borderRadius:18,padding:"14px 18px",display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:30,color:M.sageDeep}}>¥</span>
          <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:30,color:M.ink}}>18,500</span>
          <span style={{marginLeft:"auto",fontSize:12,color:M.inkSoft}}>金額</span>
        </div>

        {/* Name + date */}
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1,background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>収入名</div>
            <div style={{fontWeight:600,fontSize:14}}>ライティング案件</div>
          </div>
          <div style={{flex:"0 0 116px",background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>日付</div>
            <div style={{fontFamily:"DM Sans",fontWeight:600,fontSize:14}}>5/20</div>
          </div>
        </div>

        {/* Type — chips */}
        <div style={{fontSize:12,color:M.inkSoft,fontWeight:600,marginBottom:8}}>種別</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          {Object.entries(INCOME_TYPES).map(([k,t],i)=>(
            <div key={k} style={{padding:"9px 14px",borderRadius:999,border:`1.5px solid ${i===1?M.sage:M.hair}`,background:i===1?M.sageSoft:"#fff",color:i===1?M.sageDeep:M.ink,fontSize:13,fontWeight:600}}>{t.label}</div>
          ))}
        </div>

        {/* Note */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px",marginBottom:18,minHeight:56}}>
          <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>メモ（任意）</div>
          <div style={{fontSize:13,color:M.inkSoft,fontStyle:"italic"}}>例：フリーランスnote</div>
        </div>

        <button style={{width:"100%",border:"none",background:M.coral,color:"#fff",padding:"16px",borderRadius:18,fontFamily:"inherit",fontWeight:700,fontSize:16,boxShadow:`0 6px 0 ${M.coralDeep}`}}>＋ 記録する</button>
      </MSheetShell>
    </div>
  );
}

// ───────────────────────────────────────────────────
// Sheet: 余剰を振り分ける (Allocate surplus)
// ───────────────────────────────────────────────────
function MAllocateSheetScreen() {
  return (
    <div data-screen-label="M · 09c 余剰を振り分ける">
      <MSheetShell title="余剰を振り分ける" fadedScreen={<MIncomeScreen/>}>
        {/* Amount field */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.mustard}`,borderRadius:18,padding:"14px 18px",display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:28,color:M.mustardDeep}}>¥</span>
          <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:28,color:M.ink}}>30,000</span>
          <div style={{marginLeft:"auto",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
            <span style={{fontSize:11,color:M.inkSoft,fontWeight:600}}>振り分け額</span>
            <span style={{fontFamily:"DM Sans",fontSize:10,color:M.mustardDeep,fontWeight:700}}>余剰 ¥{yenSlim(SURPLUS)}</span>
          </div>
        </div>

        {/* Quick-fill chips */}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {["全額","½","¥10,000"].map((p,i)=>(
            <div key={p} style={{flex:1,padding:"7px 0",textAlign:"center",borderRadius:10,border:`1.5px solid ${M.hair}`,background:i===2?M.mustardSoft:"#fff",color:M.ink,fontSize:11,fontWeight:700,fontFamily:i===2?"DM Sans":"inherit"}}>{p}</div>
          ))}
        </div>

        {/* Destination — radio cards */}
        <div style={{fontSize:12,color:M.inkSoft,fontWeight:600,marginBottom:8}}>振り分け先</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
          {[
            { id:"savings", emoji:"💰", label:"貯金",                  sub:"貯金目標を選んで積立",        on:true },
            { id:"budget",  emoji:"📅", label:"今月の予算に追加",       sub:"5月の変動費予算に上乗せ",     on:false },
          ].map(o => (
            <div key={o.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 14px",borderRadius:16,border:`1.5px solid ${o.on?M.coral:M.hair}`,background:o.on?M.coralSoft:"#fff"}}>
              <div style={{width:36,height:36,borderRadius:11,background:o.on?"#fff":M.bgSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{o.emoji}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14}}>{o.label}</div>
                <div style={{fontSize:11,color:M.inkSoft,marginTop:2}}>{o.sub}</div>
              </div>
              <div style={{width:22,height:22,borderRadius:999,border:`2px solid ${o.on?M.coral:M.hair}`,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {o.on && <div style={{width:10,height:10,borderRadius:999,background:M.coral}}/>}
              </div>
            </div>
          ))}
        </div>

        {/* Secondary: savings goal selector (visible because 貯金 is selected) */}
        <div style={{padding:"12px 14px 14px",borderRadius:16,background:M.coralSoft,border:`1.5px dashed ${M.coral}`,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:9}}>
            <span style={{color:M.coralDeep,fontSize:14,fontWeight:900}}>↳</span>
            <span style={{fontSize:11,color:M.coralDeep,fontWeight:700}}>どの貯金目標に積み立てますか？</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {SAVINGS_GOALS.map((g,i)=>{
              const sel = i===1; // 緊急費用
              return (
                <div key={g.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,background:"#fff",border:`1.5px solid ${sel?M.coral:"transparent"}`,boxShadow:sel?"0 4px 12px -8px rgba(80,40,10,0.25)":"none"}}>
                  <div style={{width:30,height:30,borderRadius:9,background:M.mustardSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{g.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13}}>{g.name}</div>
                    <div style={{fontSize:10,color:M.inkSoft,marginTop:1,fontFamily:"DM Sans"}}>累計 ¥{yenSlim(g.accumulated)} / ¥{yenSlim(g.target)}</div>
                  </div>
                  <div style={{width:18,height:18,borderRadius:999,border:`2px solid ${sel?M.coral:M.hair}`,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {sel && <div style={{width:8,height:8,borderRadius:999,background:M.coral}}/>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Comment */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px",marginBottom:18,minHeight:56}}>
          <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>メモ（任意）</div>
          <div style={{fontSize:13,color:M.ink,lineHeight:1.5}}>5月の副業分を緊急費用に。</div>
        </div>

        <button style={{width:"100%",border:"none",background:M.coral,color:"#fff",padding:"16px",borderRadius:18,fontFamily:"inherit",fontWeight:700,fontSize:16,boxShadow:`0 6px 0 ${M.coralDeep}`}}>＋ 記録する</button>
      </MSheetShell>
    </div>
  );
}

// ───────────────────────────────────────────────────
// Sheet: 基準収入を編集 (Edit base income) — small modal
// ───────────────────────────────────────────────────
function MEditBaseSheetScreen() {
  return (
    <div data-screen-label="M · 09d 基準収入を編集">
      <MSheetShell title="基準収入を編集" fadedScreen={<MIncomeScreen/>}>
        {/* Big amount input */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.sage}`,borderRadius:18,padding:"16px 20px",display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:34,color:M.sageDeep}}>¥</span>
          <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:34,color:M.ink,letterSpacing:"-0.02em"}}>280,000</span>
          <span style={{marginLeft:"auto",fontSize:12,color:M.inkSoft}}>基準</span>
        </div>

        {/* Help text */}
        <div style={{padding:"12px 14px",borderRadius:14,background:M.sageSoft,marginBottom:18,display:"flex",gap:10,alignItems:"flex-start"}}>
          <span style={{fontSize:16,marginTop:1}}>💡</span>
          <div style={{fontSize:12,color:M.sageDeep,lineHeight:1.6,fontWeight:600}}>
            毎月の見込み収入を入力します。<br/>
            <span style={{fontWeight:500,opacity:0.85}}>給与など、毎月安定して入る金額を設定すると、上振れ分が「余剰金額」として表示されます。</span>
          </div>
        </div>

        {/* Suggested presets */}
        <div style={{fontSize:11,color:M.inkSoft,fontWeight:600,marginBottom:8}}>過去の平均から</div>
        <div style={{display:"flex",gap:6,marginBottom:18}}>
          {[
            { label:"先月", value:"¥280,000" },
            { label:"3ヶ月平均", value:"¥291,000" },
            { label:"半年平均", value:"¥286,500" },
          ].map((p,i)=>(
            <div key={p.label} style={{flex:1,padding:"9px 8px",borderRadius:12,border:`1.5px solid ${i===0?M.sage:M.hair}`,background:i===0?M.sageSoft:"#fff",textAlign:"center"}}>
              <div style={{fontSize:10,color:M.inkSoft,fontWeight:600}}>{p.label}</div>
              <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:13,marginTop:2,color:i===0?M.sageDeep:M.ink}}>{p.value}</div>
            </div>
          ))}
        </div>

        <button style={{width:"100%",border:"none",background:M.coral,color:"#fff",padding:"16px",borderRadius:18,fontFamily:"inherit",fontWeight:700,fontSize:16,boxShadow:`0 6px 0 ${M.coralDeep}`}}>保存する</button>
      </MSheetShell>
    </div>
  );
}

Object.assign(window, {
  INCOME_TYPES, INCOMES, INCOME_TOTAL, BASE_INCOME, SURPLUS,
  MIncomeScreen, MIncomeSheetScreen, MAllocateSheetScreen, MEditBaseSheetScreen,
});
