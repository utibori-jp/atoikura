/* Direction A — other screens: Goals, Review, Journal, Master */

function AScreenChrome({ label, title, subtitle, children, active }) {
  return (
    <div data-screen-label={label} style={{
      width:1200, background:A_THEME.bg, fontFamily:"var(--font-jp)", color:A_THEME.ink,
      padding:32, display:"flex", flexDirection:"column", gap:24
    }}>
      <ANavBar active={active}/>
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div style={{fontFamily:"var(--font-jp-display)",fontSize:30,fontWeight:900,letterSpacing:"-0.01em"}}>{title}</div>
          <div style={{fontSize:14,color:A_THEME.inkSoft,marginTop:4}}>{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function AGoalsScreen() {
  return (
    <AScreenChrome label="A · 02 目標" active="goals" title="今月の目標" subtitle="無理せず続けられるラインを決めましょう">
      <div style={{display:"flex",gap:24}}>
        <div style={{flex:1,background:A_THEME.card,borderRadius:32,padding:32,boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
            <div style={{width:48,height:48,borderRadius:16,background:"#FFE8DD",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>💰</div>
            <div>
              <div style={{fontFamily:"var(--font-jp-display)",fontSize:18,fontWeight:700}}>貯金目標</div>
              <div style={{fontSize:12,color:A_THEME.inkSoft}}>叶えたいことを書いておこう</div>
            </div>
          </div>
          <div style={{padding:"16px 18px",border:`1.5px solid ${A_THEME.hair}`,borderRadius:18,background:A_THEME.bgSoft,fontSize:15,lineHeight:1.6}}>
            来年の春に北海道旅行へ。新幹線とホテル代として確保しておきたい。
          </div>
          <div style={{display:"flex",gap:14,marginTop:18}}>
            <div style={{flex:1,padding:"14px 18px",border:`1.5px solid ${A_THEME.hair}`,borderRadius:18,background:"#fff"}}>
              <div style={{fontSize:11,color:A_THEME.inkSoft,fontWeight:600}}>目標金額</div>
              <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:4}}>
                <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:28}}>¥250,000</span>
              </div>
            </div>
            <div style={{flex:1,padding:"14px 18px",border:`1.5px solid ${A_THEME.hair}`,borderRadius:18,background:"#fff"}}>
              <div style={{fontSize:11,color:A_THEME.inkSoft,fontWeight:600}}>目標日</div>
              <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:18,marginTop:4}}>2027/03/15</div>
            </div>
          </div>
        </div>

        <div style={{flex:1,background:A_THEME.card,borderRadius:32,padding:32,boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",right:-40,top:-40,width:180,height:180,borderRadius:"50%",background:A_THEME.mustard,opacity:0.18}}/>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,position:"relative"}}>
            <div style={{width:48,height:48,borderRadius:16,background:"#FFF1CC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🌞</div>
            <div>
              <div style={{fontFamily:"var(--font-jp-display)",fontSize:18,fontWeight:700}}>変動費の月次予算</div>
              <div style={{fontSize:12,color:A_THEME.inkSoft}}>食費・日用品など、変動するもの合計</div>
            </div>
          </div>
          <div style={{position:"relative",display:"flex",alignItems:"baseline",gap:6}}>
            <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:64,letterSpacing:"-0.03em"}}>80,000</span>
            <span style={{fontFamily:"var(--font-jp-display)",fontSize:22,fontWeight:700}}>円</span>
            <span style={{marginLeft:"auto",padding:"6px 12px",borderRadius:999,background:"#FFE8DD",color:A_THEME.coralDeep,fontSize:12,fontWeight:700}}>編集 ✎</span>
          </div>
          <div style={{height:1,background:A_THEME.hair,margin:"22px 0",position:"relative"}}/>
          <div style={{position:"relative"}}>
            <div style={{fontSize:12,color:A_THEME.inkSoft,fontWeight:600,marginBottom:6}}>1日あたり利用可能額</div>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:36,color:A_THEME.coralDeep}}>¥{yenSlim(DAILY_BUDGET)}</span>
              <span style={{fontSize:12,color:A_THEME.inkSoft}}>= 80,000 ÷ 30日（自動計算）</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{background:A_THEME.card,borderRadius:32,padding:28,boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)"}}>
        <div style={{fontFamily:"var(--font-jp-display)",fontSize:16,fontWeight:700,marginBottom:16}}>ここ3ヶ月の予算と実績</div>
        <div style={{display:"flex",gap:16}}>
          {[
            { m:"3月", b:75000, a:71200, ok:true },
            { m:"4月", b:80000, a:82400, ok:false },
            { m:"5月", b:80000, a:47200, ok:true, ongoing:true },
          ].map(r => (
            <div key={r.m} style={{flex:1,padding:"18px 20px",borderRadius:24,background:r.ongoing?"#FFF1CC":A_THEME.bgSoft,border:`1.5px solid ${r.ongoing?A_THEME.mustard:A_THEME.hair}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontFamily:"var(--font-jp-display)",fontWeight:700,fontSize:17}}>{r.m}{r.ongoing && <span style={{fontSize:11,marginLeft:6,color:A_THEME.coralDeep,fontWeight:700}}>進行中</span>}</div>
                <span style={{fontSize:18}}>{r.ok ? "🌞" : "🌧"}</span>
              </div>
              <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:22,marginTop:8}}>{yen(r.a)}</div>
              <div style={{fontSize:12,color:A_THEME.inkSoft,marginTop:2}}>予算 {yen(r.b)}{!r.ongoing && (r.ok?` · ¥${yenSlim(r.b-r.a)} 残せた`:` · ¥${yenSlim(r.a-r.b)} 超過`)}</div>
              <div style={{height:8,background:"#fff",borderRadius:999,marginTop:10,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(100,(r.a/r.b)*100)}%`,background:r.ok?A_THEME.sage:A_THEME.coral,borderRadius:999}}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AScreenChrome>
  );
}

function AReviewScreen() {
  const breakdown = [
    { type:"変動費", color:A_THEME.coral, total:47200, groups:[
      { name:"食費", emoji:"🍙", amount:24800, cats:[
        { name:"外食", amount:11200, note:"" },
        { name:"スーパー", amount:8400, note:"今月はまとめ買いが効いた" },
        { name:"カフェ", amount:3600, note:"" },
        { name:"コンビニ", amount:1600, note:"" },
      ]},
      { name:"日用品", emoji:"🧺", amount:6800 },
      { name:"交通", emoji:"🚃", amount:4200 },
      { name:"趣味・娯楽", emoji:"🎈", amount:7400, cats:[
        { name:"本・雑誌", amount:4800, note:"技術書3冊買った" },
        { name:"サブスク", amount:2600, note:"" },
      ]},
      { name:"美容・健康", emoji:"🌿", amount:4000 },
    ]},
    { type:"固定費", color:A_THEME.sageDeep, total:96000, groups:[
      { name:"固定費", emoji:"🏠", amount:96000 },
    ]},
    { type:"対象外", color:A_THEME.excluded, total:15000, groups:[
      { name:"食費", emoji:"🍙", amount:15000, cats:[
        { name:"記念日（外食）", amount:15000, note:"結婚記念日。気にしない！" },
      ]},
    ]},
  ];

  return (
    <AScreenChrome label="A · 03 振り返り" active="review" title="5月の振り返り" subtitle="使い方の傾向を、月単位で眺めてみる">
      <div style={{display:"flex",gap:12,alignItems:"center"}}>
        {["3月","4月","5月","6月"].map((m,i)=>(
          <APill key={m} active={i===2}>{m}</APill>
        ))}
      </div>

      <div style={{display:"flex",gap:16}}>
        {[
          { l:"変動費合計", v:"¥47,200", s:"予算 ¥80,000 内", t:"sage" },
          { l:"固定費合計", v:"¥96,000", s:"いつもどおり", t:"mustard" },
          { l:"対象外", v:"¥15,000", s:"特別な日 1件", t:"coral" },
          { l:"総支出", v:"¥158,200", s:"先月比 −¥4,200", t:"sage" },
        ].map(s => <AStatPill key={s.l} tone={s.t} label={s.l} value={s.v} sub={s.s}/>)}
      </div>

      <div style={{background:A_THEME.card,borderRadius:32,padding:28,boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)"}}>
        {breakdown.map((sec,si)=>(
          <div key={sec.type} style={{marginBottom: si<breakdown.length-1 ? 24 : 0}}>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1.5px solid ${A_THEME.hair}`,marginBottom:14}}>
              <span style={{width:10,height:10,borderRadius:5,background:sec.color}}/>
              <div style={{fontFamily:"var(--font-jp-display)",fontWeight:900,fontSize:18}}>{sec.type}</div>
              <div style={{marginLeft:"auto",fontFamily:"DM Sans",fontWeight:700,fontSize:18}}>{yen(sec.total)}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {sec.groups.map((g,gi)=>(
                <div key={g.name+gi} style={{borderRadius:20,background:gi%2===0?A_THEME.bgSoft:"#fff",padding:"14px 18px",border:`1.5px solid ${A_THEME.hair}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:20}}>{g.emoji}</span>
                    <span style={{fontWeight:700,fontSize:15}}>{g.name}</span>
                    <span style={{marginLeft:"auto",fontFamily:"DM Sans",fontWeight:700,fontSize:16}}>{yen(g.amount)}</span>
                    {g.cats && <span style={{fontSize:12,color:A_THEME.inkSoft,marginLeft:8}}>▾</span>}
                  </div>
                  {g.cats && (
                    <div style={{marginTop:12,paddingLeft:32,display:"flex",flexDirection:"column",gap:8}}>
                      {g.cats.map(c=>(
                        <div key={c.name} style={{display:"flex",alignItems:"flex-start",gap:14}}>
                          <div style={{flex:"0 0 140px",fontSize:14}}>{c.name}</div>
                          <div style={{flex:"0 0 90px",fontFamily:"DM Sans",fontWeight:600,fontSize:14,textAlign:"right"}}>{yen(c.amount)}</div>
                          <div style={{flex:1,padding:"6px 12px",borderRadius:12,background:c.note?"#FFF6E5":"transparent",border:c.note?`1px dashed ${A_THEME.mustard}`:`1px dashed ${A_THEME.hair}`,fontSize:13,color:c.note?A_THEME.ink:A_THEME.inkSoft,fontStyle:c.note?"normal":"italic"}}>
                            {c.note || "メモを残す…"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AScreenChrome>
  );
}

const JOURNAL_RECURRING_IDS = new Set([10]); // ジム月会費

function AJournalScreen() {
  const days = [...new Set(ENTRIES.map(e=>e.date))].sort().reverse();
  return (
    <AScreenChrome label="A · 04 仕訳一覧" active="journal" title="仕訳一覧" subtitle="日ごとの記録をふりかえり、コメントを残せます">
      <div style={{display:"flex",gap:12,alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:8}}>
          {["3月","4月","5月","6月"].map((m,i)=>(<APill key={m} active={i===2}>{m}</APill>))}
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={{padding:"10px 14px",borderRadius:999,background:"#fff",border:`1.5px solid ${A_THEME.hair}`,fontSize:13,color:A_THEME.inkSoft}}>🔍 検索</div>
          <button style={{border:"none",background:A_THEME.coral,color:"#fff",padding:"12px 22px",borderRadius:999,fontFamily:"inherit",fontWeight:700,fontSize:14,boxShadow:`0 4px 0 ${A_THEME.coralDeep}`,cursor:"pointer"}}>＋ 追加</button>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:18}}>
        {days.map(date => {
          const items = ENTRIES.filter(e=>e.date===date);
          const dayTotal = items.reduce((s,e)=>s+(e.excluded?0:e.amount),0);
          const note = DAILY_NOTES[date];
          const dParts = date.split("-");
          return (
            <div key={date} style={{background:A_THEME.card,borderRadius:28,padding:24,boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:18,paddingBottom:14,borderBottom:`1.5px solid ${A_THEME.hair}`}}>
                <div style={{width:60,height:60,borderRadius:20,background:A_THEME.bgSoft,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:`1.5px solid ${A_THEME.hair}`}}>
                  <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:22,lineHeight:1}}>{parseInt(dParts[2])}</div>
                  <div style={{fontSize:10,color:A_THEME.inkSoft,marginTop:2}}>5月</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{fontFamily:"var(--font-jp-display)",fontWeight:700,fontSize:16}}>{["月","火","水","木","金","土","日"][parseInt(dParts[2])%7]}曜日</div>
                    <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:18,marginLeft:"auto"}}>{yen(dayTotal)}</div>
                  </div>
                  <div style={{marginTop:8,padding:"10px 14px",borderRadius:14,background:note?"#FFF6E5":A_THEME.bgSoft,border:`1px dashed ${note?A_THEME.mustard:A_THEME.hair}`,fontSize:13,color:note?A_THEME.ink:A_THEME.inkSoft,fontStyle:note?"normal":"italic"}}>
                    💭 {note || "この日のひとことを残す…"}
                  </div>
                </div>
              </div>

              <div style={{display:"flex",flexDirection:"column",marginTop:6}}>
                {items.map(e=>{
                  const g = GROUPS.find(x=>x.id===e.group);
                  const c = CATEGORIES.find(x=>x.id===e.cat);
                  return (
                    <div key={e.id} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 6px",borderBottom:`1px solid ${A_THEME.hair}`}}>
                      <div style={{width:36,height:36,borderRadius:12,background:e.excluded?"#F4E9DC":"#FFE8DD",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{g.emoji}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:8}}>
                          {e.name}
                          {JOURNAL_RECURRING_IDS.has(e.id) && <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6,background:"#E5EEF7",color:"#3F6B91",display:"inline-flex",alignItems:"center",gap:3}}>🔁 定期</span>}
                          {e.excluded && <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6,background:A_THEME.excluded,color:"#fff"}}>対象外</span>}
                        </div>
                        <div style={{fontSize:12,color:A_THEME.inkSoft,marginTop:2}}>{g.name} · {c.name}{e.note && ` — ${e.note}`}</div>
                      </div>
                      <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:16,color:e.excluded?A_THEME.inkSoft:A_THEME.ink,textDecoration:e.excluded?"line-through":"none"}}>{yen(e.amount)}</div>
                      <div style={{display:"flex",gap:6,opacity:0.5}}>
                        <span style={{padding:"4px 8px",borderRadius:8,fontSize:12}}>✎</span>
                        <span style={{padding:"4px 8px",borderRadius:8,fontSize:12}}>🗑</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AScreenChrome>
  );
}

function AMasterScreen() {
  return (
    <AScreenChrome label="A · 05 マスタ" active="master" title="マスタ管理" subtitle="自分らしいカテゴリで管理しよう">
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <APill active>大分類</APill>
        <APill>生活区分</APill>
      </div>

      <div style={{background:A_THEME.card,borderRadius:32,padding:28,boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontFamily:"var(--font-jp-display)",fontSize:18,fontWeight:700}}>大分類（8件）</div>
          <button style={{border:"none",background:A_THEME.coral,color:"#fff",padding:"10px 18px",borderRadius:999,fontFamily:"inherit",fontWeight:700,fontSize:13,cursor:"pointer",boxShadow:`0 4px 0 ${A_THEME.coralDeep}`}}>＋ 大分類を追加</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {GROUPS.map(g => {
            const cats = CATEGORIES.filter(c=>c.group===g.id);
            const typeLabel = cats[0]?.type === "food" ? "食費" : cats[0]?.type === "fixed" ? "固定費" : cats[0]?.type === "excluded" ? "対象外" : "その他";
            const typeBg = typeLabel==="食費"?"#FFF1CC":typeLabel==="固定費"?"#DEF1E6":typeLabel==="対象外"?"#F4E9DC":"#E5EEF7";
            const typeFg = typeLabel==="食費"?"#A3791F":typeLabel==="固定費"?A_THEME.sageDeep:typeLabel==="対象外"?A_THEME.inkSoft:"#3F6B91";
            return (
              <div key={g.id} style={{padding:"16px 18px",borderRadius:20,background:A_THEME.bgSoft,border:`1.5px solid ${A_THEME.hair}`,display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:44,height:44,borderRadius:14,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:"0 2px 0 #F2E4D2"}}>{g.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:15}}>{g.name}</div>
                  <div style={{fontSize:12,color:A_THEME.inkSoft,marginTop:2}}>{cats.length} 区分</div>
                </div>
                <div style={{padding:"4px 10px",borderRadius:999,background:typeBg,color:typeFg,fontSize:11,fontWeight:700}}>{typeLabel}</div>
                <div style={{display:"flex",gap:4,color:A_THEME.inkSoft}}>
                  <span style={{padding:"4px 6px",fontSize:13}}>✎</span>
                  <span style={{padding:"4px 6px",fontSize:13}}>🗑</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{background:A_THEME.card,borderRadius:32,padding:28,boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)"}}>
        <div style={{fontFamily:"var(--font-jp-display)",fontSize:16,fontWeight:700,marginBottom:14}}>生活区分（大分類ごと）</div>
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          {GROUPS.slice(0,3).map(g=>(
            <div key={g.id}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <span style={{fontSize:18}}>{g.emoji}</span>
                <div style={{fontWeight:700,fontSize:14}}>{g.name}</div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,paddingLeft:28}}>
                {CATEGORIES.filter(c=>c.group===g.id).map(c=>(
                  <div key={c.id} style={{padding:"8px 14px",borderRadius:999,background:A_THEME.bgSoft,border:`1.5px solid ${A_THEME.hair}`,fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:8}}>
                    {c.name}
                    <span style={{color:A_THEME.inkSoft,fontSize:11}}>✎</span>
                  </div>
                ))}
                <div style={{padding:"8px 14px",borderRadius:999,background:"transparent",border:`1.5px dashed ${A_THEME.coral}`,color:A_THEME.coralDeep,fontSize:13,fontWeight:700}}>＋ 追加</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AScreenChrome>
  );
}

Object.assign(window, { AGoalsScreen, AReviewScreen, AJournalScreen, AMasterScreen });
