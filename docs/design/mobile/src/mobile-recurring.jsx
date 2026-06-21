/* Atoikura Mobile — Recurring Expense (定期支出) screen + add sheet + updated Journal */

// ---- Reusable bottom-sheet shell (matches MEntryScreen pattern) ----
function MSheetShell({ title, fadedScreen, children }) {
  return (
    <div style={{width:402,height:874,overflow:"hidden",position:"relative",background:M.bg}}>
      <div style={{position:"absolute",inset:0,filter:"blur(1.5px)",opacity:0.55}}>
        {fadedScreen}
      </div>
      <div style={{position:"absolute",inset:0,background:"rgba(42,37,32,0.45)"}}/>
      <div style={{position:"absolute",left:0,right:0,bottom:0,background:M.card,borderTopLeftRadius:32,borderTopRightRadius:32,padding:"12px 20px 28px",boxShadow:"0 -20px 50px -20px rgba(0,0,0,0.3)",maxHeight:"90%",overflowY:"auto"}}>
        <div style={{width:42,height:5,borderRadius:999,background:M.hair,margin:"0 auto 14px"}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{fontFamily:"var(--font-jp-display)",fontSize:19,fontWeight:900}}>{title}</div>
          <div style={{width:30,height:30,borderRadius:999,background:M.bgSoft,display:"flex",alignItems:"center",justifyContent:"center",color:M.inkSoft,fontSize:15}}>✕</div>
        </div>
        {children}
      </div>
    </div>
  );
}

// Sample recurring templates
const RECURRING = [
  { id:1, name:"家賃",       emoji:"🏠", day:25, amount:80000, type:"fixed",   group:7, cat:15 },
  { id:2, name:"電気代",     emoji:"💡", day:10, amount:null,  type:"variable",group:7, cat:16 },
  { id:3, name:"ガス代",     emoji:"🔥", day:15, amount:null,  type:"variable",group:7, cat:16 },
  { id:4, name:"通信費",     emoji:"📱", day:27, amount:6800,  type:"fixed",   group:7, cat:17 },
  { id:5, name:"Netflix",    emoji:"🎬", day:5,  amount:1490,  type:"fixed",   group:4, cat:10 },
  { id:6, name:"ジム月会費", emoji:"🏋", day:13, amount:2400,  type:"fixed",   group:6, cat:14 },
];

const PENDING_RECURRING = [
  { id:2, name:"電気代", emoji:"💡", day:10, lastAmount:7480, group:"固定費" },
  { id:3, name:"ガス代", emoji:"🔥", day:15, lastAmount:4220, group:"固定費" },
];

function MRecurringScreen() {
  return (
    <div data-screen-label="M · 07 定期支出" style={{width:402,height:874,overflow:"hidden"}}>
      <MScreen active="goals" header={<MHeader back="予算" showMonth={false} big="定期支出" sub="毎月の固定・半固定費を管理"/>}>

        {/* Pending confirmations */}
        <div style={{display:"flex",alignItems:"center",gap:8,margin:"6px 2px 10px"}}>
          <span style={{fontFamily:"var(--font-jp-display)",fontWeight:900,fontSize:15,color:M.coralDeep}}>💬 確認待ち</span>
          <span style={{padding:"2px 9px",borderRadius:999,background:M.coral,color:"#fff",fontFamily:"DM Sans",fontWeight:700,fontSize:11}}>{PENDING_RECURRING.length}</span>
          <span style={{marginLeft:"auto",fontSize:11,color:M.inkSoft}}>5月分</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
          {PENDING_RECURRING.map(p => (
            <MCard key={p.id} style={{padding:"14px 16px",border:`1.5px solid ${M.coralSoft}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:13,background:M.coralSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{p.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontWeight:700,fontSize:14}}>{p.name}</span>
                    <span style={{padding:"2px 8px",borderRadius:999,background:M.coral,color:"#fff",fontSize:10,fontWeight:700}}>要確認</span>
                  </div>
                  <div style={{fontSize:11,color:M.inkSoft,marginTop:2,display:"flex",alignItems:"center",gap:6}}>
                    <span>{p.group}</span>
                    <span>·</span>
                    <span style={{fontFamily:"DM Sans",fontWeight:600}}>前回 ¥{yenSlim(p.lastAmount)}</span>
                  </div>
                </div>
                <div style={{padding:"4px 10px",borderRadius:999,background:M.bgSoft,border:`1px solid ${M.hair}`,fontFamily:"DM Sans",fontWeight:700,fontSize:11,color:M.inkSoft}}>5/{p.day}</div>
              </div>
              <button style={{width:"100%",marginTop:12,border:"none",background:M.coral,color:"#fff",padding:"11px",borderRadius:14,fontFamily:"inherit",fontWeight:700,fontSize:13,boxShadow:`0 4px 0 ${M.coralDeep}`}}>金額を確定</button>
            </MCard>
          ))}
        </div>

        {/* Template list */}
        <div style={{display:"flex",alignItems:"center",margin:"4px 2px 10px"}}>
          <span style={{fontFamily:"var(--font-jp-display)",fontWeight:700,fontSize:15}}>繰り返し設定</span>
          <span style={{marginLeft:"auto",fontSize:11,color:M.inkSoft}}>{RECURRING.length}件</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {RECURRING.map(r => {
            const fixed = r.type === "fixed";
            return (
              <MCard key={r.id} style={{padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:42,height:42,borderRadius:13,background:M.bgSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{r.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14}}>{r.name}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
                      <span style={{padding:"3px 9px",borderRadius:999,background:"#E5EEF7",color:"#3F6B91",fontSize:10,fontWeight:700,fontFamily:"DM Sans"}}>毎月 {r.day}日</span>
                      <span style={{padding:"3px 9px",borderRadius:999,background:fixed?M.sageSoft:M.mustardSoft,color:fixed?M.sageDeep:M.mustardDeep,fontSize:10,fontWeight:700}}>{fixed?"固定":"要確認"}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:15,color:r.amount?M.ink:M.inkSoft}}>{r.amount?yen(r.amount):"—"}</div>
                    <div style={{display:"flex",gap:4}}>
                      <span style={{width:26,height:26,borderRadius:8,background:M.bgSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:M.inkSoft}}>✎</span>
                      <span style={{width:26,height:26,borderRadius:8,background:M.bgSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:M.inkSoft}}>🗑</span>
                    </div>
                  </div>
                </div>
              </MCard>
            );
          })}
        </div>

        <button style={{width:"100%",marginTop:16,border:`1.5px dashed ${M.coral}`,background:"transparent",color:M.coralDeep,padding:"15px",borderRadius:16,fontFamily:"inherit",fontWeight:700,fontSize:15}}>＋ 定期支出を追加</button>
      </MScreen>
    </div>
  );
}

function MRecurringSheetScreen() {
  return (
    <div data-screen-label="M · 07b 定期支出（追加シート）">
      <MSheetShell title="定期支出を追加" fadedScreen={<MRecurringScreen/>}>
        {/* 項目名 */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px",marginBottom:10}}>
          <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>項目名</div>
          <div style={{fontWeight:600,fontSize:14}}>電気代</div>
        </div>

        {/* 大分類 */}
        <div style={{fontSize:12,color:M.inkSoft,fontWeight:600,marginBottom:8}}>大分類</div>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8,marginBottom:12}}>
          {GROUPS.slice(0,6).map((g,i)=>(
            <div key={g.id} style={{flexShrink:0,padding:"9px 14px",borderRadius:999,border:`1.5px solid ${i===4?M.coral:M.hair}`,background:i===4?M.coral:"#fff",color:i===4?"#fff":M.ink,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
              <span>{g.id===7?"🏠":g.emoji}</span>{g.id===7?"固定費":g.name}
            </div>
          ))}
        </div>

        {/* 生活区分 */}
        <div style={{fontSize:12,color:M.inkSoft,fontWeight:600,marginBottom:8}}>生活区分</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
          {["家賃","光熱費","通信費"].map((n,i)=>(
            <div key={n} style={{padding:"9px 14px",borderRadius:999,border:`1.5px solid ${i===1?M.mustard:M.hair}`,background:i===1?M.mustardSoft:"#fff",color:M.ink,fontSize:13,fontWeight:600}}>{n}</div>
          ))}
        </div>

        {/* 金額 + 毎月何日 */}
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1,background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>金額（任意）</div>
            <div style={{display:"flex",alignItems:"baseline",gap:4}}>
              <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:18,color:M.coralDeep}}>¥</span>
              <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:18,color:M.inkSoft}}>—</span>
            </div>
          </div>
          <div style={{flex:"0 0 116px",background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>毎月</div>
            <div style={{display:"flex",alignItems:"baseline",gap:3}}>
              <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:18}}>10</span>
              <span style={{fontSize:11,color:M.inkSoft}}>日</span>
            </div>
          </div>
        </div>

        {/* タイプ segmented */}
        <div style={{fontSize:12,color:M.inkSoft,fontWeight:600,marginBottom:8}}>タイプ</div>
        <div style={{display:"flex",gap:6,padding:4,background:M.bgSoft,borderRadius:14,marginBottom:14}}>
          <div style={{flex:1,textAlign:"center",padding:"10px",borderRadius:10,fontWeight:600,fontSize:13,color:M.inkSoft}}>固定（毎月同額）</div>
          <div style={{flex:1,textAlign:"center",padding:"10px",borderRadius:10,background:M.coral,color:"#fff",fontWeight:600,fontSize:13,boxShadow:`0 2px 0 ${M.coralDeep}`}}>要確認（変動）</div>
        </div>

        {/* メモ */}
        <div style={{background:M.bgSoft,border:`1.5px solid ${M.hair}`,borderRadius:14,padding:"12px 14px",marginBottom:18}}>
          <div style={{fontSize:11,color:M.inkSoft,marginBottom:3}}>メモ（任意）</div>
          <div style={{fontSize:13,color:M.inkSoft,fontStyle:"italic"}}>例：検針日に確認</div>
        </div>

        <button style={{width:"100%",border:"none",background:M.coral,color:"#fff",padding:"16px",borderRadius:18,fontFamily:"inherit",fontWeight:700,fontSize:16,boxShadow:`0 6px 0 ${M.coralDeep}`}}>保存する</button>
      </MSheetShell>
    </div>
  );
}

// ---- Updated Journal with 🔁 badge for recurring entries ----
function MJournalScreenV2() {
  // Mark a couple entries as recurring for visual demo
  const RECURRING_IDS = new Set([10]); // ジム月会費
  // Inject one extra recurring entry into the demo data
  const extra = { id:101, date:"2026-05-05", amount:1490, name:"Netflix", group:4, cat:10, excluded:false, note:"", recurring:true };
  const augmented = [...ENTRIES.map(e => ({...e, recurring: RECURRING_IDS.has(e.id)})), extra];
  const days = [...new Set(augmented.map(e=>e.date))].sort().reverse();
  return (
    <div data-screen-label="M · 05v2 仕訳一覧（🔁 定期マーク付）" style={{width:402,height:874,overflow:"hidden"}}>
      <MScreen active="journal" header={<MHeader title="仕訳一覧" big="日々の記録"/>}>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6,marginBottom:14}}>
          {["3月","4月","5月","6月"].map((m,i)=>(
            <div key={m} style={{flexShrink:0,padding:"8px 16px",borderRadius:999,border:`1.5px solid ${i===2?M.coral:M.hair}`,background:i===2?M.coral:"#fff",color:i===2?"#fff":M.ink,fontSize:13,fontWeight:600}}>{m}</div>
          ))}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {days.map(date => {
            const items = augmented.filter(e=>e.date===date);
            const total = items.reduce((s,e)=>s+(e.excluded?0:e.amount),0);
            const note = DAILY_NOTES[date];
            const d = parseInt(date.split("-")[2]);
            return (
              <div key={date}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 2px 8px"}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:5}}>
                    <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:20}}>{d}</span>
                    <span style={{fontSize:11,color:M.inkSoft}}>5月 {["月","火","水","木","金","土","日"][d%7]}</span>
                  </div>
                  <span style={{marginLeft:"auto",fontFamily:"DM Sans",fontWeight:700,fontSize:15}}>{yen(total)}</span>
                </div>
                <MCard style={{padding:"4px 16px"}}>
                  {note && (
                    <div style={{padding:"10px 12px",margin:"8px 0",borderRadius:12,background:M.mustardSoft,border:`1px dashed ${M.mustard}`,fontSize:12,color:M.ink}}>
                      💬 {note}
                    </div>
                  )}
                  {items.map((e,i) => {
                    const g = GROUPS.find(x=>x.id===e.group);
                    const c = CATEGORIES.find(x=>x.id===e.cat);
                    return (
                      <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:i<items.length-1?`1px solid ${M.hair}`:"none"}}>
                        <div style={{width:36,height:36,borderRadius:11,background:e.excluded?"#F4E9DC":M.coralSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{g.emoji}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:6}}>
                            <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.name}</span>
                            {e.recurring && <span style={{flexShrink:0,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:6,background:"#E5EEF7",color:"#3F6B91",display:"inline-flex",alignItems:"center",gap:3}}>🔁 定期</span>}
                            {e.excluded && <span style={{flexShrink:0,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:6,background:M.excluded,color:"#fff"}}>対象外</span>}
                          </div>
                          <div style={{fontSize:11,color:M.inkSoft,marginTop:1}}>{c.name}{e.note?` · ${e.note}`:""}</div>
                        </div>
                        <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:15,color:e.excluded?M.inkSoft:M.ink,textDecoration:e.excluded?"line-through":"none"}}>{yen(e.amount)}</div>
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

Object.assign(window, { MSheetShell, MRecurringScreen, MRecurringSheetScreen, MJournalScreenV2, RECURRING, PENDING_RECURRING });
