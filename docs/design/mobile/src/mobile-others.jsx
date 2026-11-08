/* Atoikura — Mobile — Goals, Review, Journal, Master */

function MGoalsScreen() {
  return (
    <div data-screen-label="M · 03 目標" style={{width:402,height:874,overflow:"hidden"}}>
      <MScreen active="goals" header={<MHeader title="目標" showMonth={false} big="目標を整える" sub="無理せず続けられるラインで"/>}>
        {/* Variable budget hero */}
        <MCard style={{background:M.ink,color:"#fff",position:"relative",overflow:"hidden",padding:"20px 18px"}}>
          <div style={{position:"absolute",right:-30,top:-30,width:140,height:140,borderRadius:"50%",background:M.coral,opacity:0.25}}/>
          <div style={{position:"relative"}}>
            <div style={{fontSize:12,opacity:0.7,fontWeight:600}}>変動費の月次予算</div>
            <div style={{display:"flex",alignItems:"baseline",gap:5,marginTop:8}}>
              <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:44,letterSpacing:"-0.03em"}}>80,000</span>
              <span style={{fontFamily:"var(--font-jp-display)",fontWeight:700,fontSize:18}}>円</span>
              <span style={{marginLeft:"auto",padding:"7px 14px",borderRadius:999,background:"rgba(255,255,255,0.14)",border:"1.5px solid rgba(255,255,255,0.2)",fontSize:12,fontWeight:600}}>編集 ✎</span>
            </div>
            <div style={{height:1,background:"rgba(255,255,255,0.15)",margin:"16px 0"}}/>
            <div style={{fontSize:12,opacity:0.7,fontWeight:600}}>1日あたり利用可能額</div>
            <div style={{display:"flex",alignItems:"baseline",gap:8,marginTop:4}}>
              <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:30,color:M.mustard}}>¥{yenSlim(DAILY_BUDGET)}</span>
              <span style={{fontSize:11,opacity:0.65}}>= 80,000 ÷ 30日（自動）</span>
            </div>
          </div>
        </MCard>

        {/* Saving goal */}
        <div style={{margin:"18px 2px 10px",fontFamily:"var(--font-jp-display)",fontSize:15,fontWeight:700}}>貯金目標</div>
        <MCard>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:M.coralSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>💰</div>
            <div style={{fontSize:13,color:M.inkSoft,lineHeight:1.5,flex:1}}>叶えたいことを書いておこう</div>
          </div>
          <div style={{padding:"13px 15px",border:`1.5px solid ${M.hair}`,borderRadius:14,background:M.bgSoft,fontSize:14,lineHeight:1.6}}>
            来年の春に北海道旅行へ。新幹線とホテル代として確保しておきたい。
          </div>
          <div style={{display:"flex",gap:10,marginTop:12}}>
            <div style={{flex:1,padding:"12px 14px",border:`1.5px solid ${M.hair}`,borderRadius:14}}>
              <div style={{fontSize:11,color:M.inkSoft,fontWeight:600}}>目標金額</div>
              <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:22,marginTop:3}}>¥250,000</div>
            </div>
            <div style={{flex:1,padding:"12px 14px",border:`1.5px solid ${M.hair}`,borderRadius:14}}>
              <div style={{fontSize:11,color:M.inkSoft,fontWeight:600}}>目標日</div>
              <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:16,marginTop:5}}>2027/03/15</div>
            </div>
          </div>
          <div style={{marginTop:12,padding:"11px 14px",borderRadius:12,background:M.sageSoft,fontSize:12,color:M.sageDeep,fontWeight:600}}>
            🎉 このペースなら約10ヶ月で達成できそう
          </div>
        </MCard>

        {/* History */}
        <div style={{margin:"18px 2px 10px",fontFamily:"var(--font-jp-display)",fontSize:15,fontWeight:700}}>直近3ヶ月</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[
            { m:"3月", b:75000, a:71200, ok:true },
            { m:"4月", b:80000, a:82400, ok:false },
            { m:"5月", b:80000, a:47200, ok:true, ongoing:true },
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

function MReviewScreen() {
  const breakdown = [
    { type:"変動費", color:M.coral, total:47200, groups:[
      { name:"食費", emoji:"🍙", amount:24800, open:true, cats:[
        { name:"外食", amount:11200, note:"" },
        { name:"スーパー", amount:8400, note:"まとめ買いが効いた" },
        { name:"カフェ", amount:3600, note:"" },
      ]},
      { name:"日用品", emoji:"🧺", amount:6800 },
      { name:"趣味・娯楽", emoji:"🎈", amount:7400 },
      { name:"美容・健康", emoji:"🌿", amount:4000 },
    ]},
    { type:"固定費", color:M.sageDeep, total:96000, groups:[
      { name:"固定費", emoji:"🏠", amount:96000 },
    ]},
    { type:"対象外", color:M.excluded, total:15000, groups:[
      { name:"食費", emoji:"🍙", amount:15000 },
    ]},
  ];
  return (
    <div data-screen-label="M · 04 振り返り" style={{width:402,height:874,overflow:"hidden"}}>
      <MScreen active="review" header={<MHeader title="振り返り" big="5月の振り返り" sub="使い方の傾向を眺める"/>}>
        {/* month chips */}
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6,marginBottom:12}}>
          {["3月","4月","5月","6月"].map((m,i)=>(
            <div key={m} style={{flexShrink:0,padding:"8px 16px",borderRadius:999,border:`1.5px solid ${i===2?M.coral:M.hair}`,background:i===2?M.coral:"#fff",color:i===2?"#fff":M.ink,fontSize:13,fontWeight:600}}>{m}</div>
          ))}
        </div>

        {/* summary */}
        <div style={{display:"flex",gap:10,marginBottom:8}}>
          <MMiniStat tone="coral" label="変動費" value="¥47,200"/>
          <MMiniStat tone="sage" label="固定費" value="¥96,000"/>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:16}}>
          <MMiniStat tone="mustard" label="対象外" value="¥15,000"/>
          <MMiniStat tone="sage" label="総支出" value="¥158,200"/>
        </div>

        {breakdown.map(sec => (
          <div key={sec.type} style={{marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,padding:"0 2px"}}>
              <span style={{width:9,height:9,borderRadius:5,background:sec.color}}/>
              <span style={{fontFamily:"var(--font-jp-display)",fontWeight:900,fontSize:15}}>{sec.type}</span>
              <span style={{marginLeft:"auto",fontFamily:"DM Sans",fontWeight:700,fontSize:15}}>{yen(sec.total)}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {sec.groups.map((g,gi) => (
                <MCard key={gi} style={{padding:"13px 15px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:18}}>{g.emoji}</span>
                    <span style={{fontWeight:700,fontSize:14}}>{g.name}</span>
                    <span style={{marginLeft:"auto",fontFamily:"DM Sans",fontWeight:700,fontSize:15}}>{yen(g.amount)}</span>
                    {g.cats && <span style={{color:M.inkSoft,fontSize:12,marginLeft:4}}>{g.open?"▴":"▾"}</span>}
                  </div>
                  {g.cats && g.open && (
                    <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${M.hair}`,display:"flex",flexDirection:"column",gap:10}}>
                      {g.cats.map(c => (
                        <div key={c.name}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                            <span>{c.name}</span>
                            <span style={{fontFamily:"DM Sans",fontWeight:600}}>{yen(c.amount)}</span>
                          </div>
                          <div style={{marginTop:6,padding:"8px 12px",borderRadius:10,background:c.note?M.mustardSoft:M.bgSoft,border:`1px dashed ${c.note?M.mustard:M.hair}`,fontSize:12,color:c.note?M.ink:M.inkSoft,fontStyle:c.note?"normal":"italic"}}>
                            💭 {c.note || "メモを残す…"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </MCard>
              ))}
            </div>
          </div>
        ))}
      </MScreen>
    </div>
  );
}

function MJournalScreen() {
  const days = [...new Set(ENTRIES.map(e=>e.date))].sort().reverse();
  return (
    <div data-screen-label="M · 05 仕訳一覧" style={{width:402,height:874,overflow:"hidden"}}>
      <MScreen active="journal" header={<MHeader title="仕訳一覧" big="日々の記録"/>}>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6,marginBottom:14}}>
          {["3月","4月","5月","6月"].map((m,i)=>(
            <div key={m} style={{flexShrink:0,padding:"8px 16px",borderRadius:999,border:`1.5px solid ${i===2?M.coral:M.hair}`,background:i===2?M.coral:"#fff",color:i===2?"#fff":M.ink,fontSize:13,fontWeight:600}}>{m}</div>
          ))}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {days.map(date => {
            const items = ENTRIES.filter(e=>e.date===date);
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

function MMasterScreen() {
  return (
    <div data-screen-label="M · 06 マスタ" style={{width:402,height:874,overflow:"hidden"}}>
      <MScreen active="goals" header={<MHeader title="マスタ管理" showMonth={false} big="カテゴリを整える" sub="自分らしい分類で"/>}>
        <div style={{display:"flex",gap:6,padding:4,background:M.card,borderRadius:14,marginBottom:14,boxShadow:"0 4px 16px -10px rgba(80,40,10,0.2)"}}>
          <div style={{flex:1,textAlign:"center",padding:"10px",borderRadius:10,background:M.ink,color:"#fff",fontWeight:600,fontSize:13}}>大分類</div>
          <div style={{flex:1,textAlign:"center",padding:"10px",borderRadius:10,fontWeight:600,fontSize:13,color:M.inkSoft}}>生活区分</div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {GROUPS.map(g => {
            const cats = CATEGORIES.filter(c=>c.group===g.id);
            const t = cats[0]?.type;
            const tLabel = t==="food"?"食費":t==="fixed"?"固定費":t==="excluded"?"対象外":"その他";
            const tBg = t==="food"?M.mustardSoft:t==="fixed"?M.sageSoft:t==="excluded"?"#F4E9DC":"#E5EEF7";
            const tFg = t==="food"?M.mustardDeep:t==="fixed"?M.sageDeep:t==="excluded"?M.inkSoft:"#3F6B91";
            return (
              <MCard key={g.id} style={{padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:42,height:42,borderRadius:13,background:M.bgSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{g.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:15}}>{g.name}</div>
                    <div style={{fontSize:11,color:M.inkSoft,marginTop:2}}>{cats.length} 区分</div>
                  </div>
                  <span style={{padding:"4px 10px",borderRadius:999,background:tBg,color:tFg,fontSize:11,fontWeight:700}}>{tLabel}</span>
                  <span style={{color:M.inkSoft,fontSize:15,marginLeft:4}}>›</span>
                </div>
              </MCard>
            );
          })}
        </div>

        <button style={{width:"100%",marginTop:16,border:`1.5px dashed ${M.coral}`,background:"transparent",color:M.coralDeep,padding:"15px",borderRadius:16,fontFamily:"inherit",fontWeight:700,fontSize:15}}>＋ 大分類を追加</button>
      </MScreen>
    </div>
  );
}

Object.assign(window, { MGoalsScreen, MReviewScreen, MJournalScreen, MMasterScreen });
