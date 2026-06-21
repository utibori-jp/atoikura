/* Direction A — "Soft & Sunny" — Home screen
   warm cream + coral / mustard / sage, big number focus, friendly. */

const A_THEME = {
  bg: "#FFF4E8",
  bgSoft: "#FFFAF2",
  card: "#FFFFFF",
  ink: "#2A2520",
  inkSoft: "#7A6B5E",
  hair: "#F2E4D2",
  coral: "#FF8A5C",
  coralDeep: "#F26B3F",
  mustard: "#FFC247",
  sage: "#7BC4A4",
  sageDeep: "#4FA481",
  sky: "#A6C9E2",
  excluded: "#C9B7A1",
};

function ASunBadge({ size = 88 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 88 88">
      <circle cx="44" cy="44" r="22" fill={A_THEME.mustard} />
      {Array.from({length:12}).map((_,i)=>{
        const a = (i/12)*Math.PI*2;
        const x1 = 44 + Math.cos(a)*30, y1 = 44 + Math.sin(a)*30;
        const x2 = 44 + Math.cos(a)*40, y2 = 44 + Math.sin(a)*40;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={A_THEME.mustard} strokeWidth="4" strokeLinecap="round"/>;
      })}
    </svg>
  );
}

function AAreaChart({ width = 920, height = 360 }) {
  const padL = 56, padR = 24, padT = 24, padB = 40;
  const w = width - padL - padR, h = height - padT - padB;
  const maxY = MONTHLY_BUDGET * 1.05;
  const xAt = (d) => padL + ((d - 1) / (DAYS_IN_MONTH - 1)) * w;
  const yAt = (v) => padT + h - (v / maxY) * h;

  const pastSeries = SERIES.filter(s => s.isPast);
  const totalPts = pastSeries.map(s => [xAt(s.day), yAt(s.total)]);
  const foodPts  = pastSeries.map(s => [xAt(s.day), yAt(s.food)]);
  const otherPts = pastSeries.map(s => [xAt(s.day), yAt(s.other)]);

  const forecastSeries = SERIES.filter(s => s.day >= TODAY);
  const fTotal = forecastSeries.map(s => [xAt(s.day), yAt(s.forecastTotal)]);

  const totalPath = smoothPath(totalPts);
  const totalFill = `${totalPath} L ${xAt(TODAY)} ${yAt(0)} L ${xAt(1)} ${yAt(0)} Z`;
  const foodPath = smoothPath(foodPts);
  const otherPath = smoothPath(otherPts);
  const forecastPath = smoothPath(fTotal);

  const baseStart = [xAt(1), yAt(0)];
  const baseEnd = [xAt(DAYS_IN_MONTH), yAt(MONTHLY_BUDGET)];

  const yTicks = [0, 20000, 40000, 60000, 80000];
  const xTicks = [1, 5, 10, 15, 20, 25, 30];

  return (
    <svg width={width} height={height} style={{display:"block"}}>
      <defs>
        <linearGradient id="aTotalFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={A_THEME.coral} stopOpacity="0.32"/>
          <stop offset="100%" stopColor={A_THEME.coral} stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="aFoodFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={A_THEME.mustard} stopOpacity="0.0"/>
          <stop offset="100%" stopColor={A_THEME.mustard} stopOpacity="0"/>
        </linearGradient>
      </defs>

      {/* y grid */}
      {yTicks.map(t => (
        <g key={t}>
          <line x1={padL} x2={width-padR} y1={yAt(t)} y2={yAt(t)} stroke={A_THEME.hair} strokeDasharray="2 4"/>
          <text x={padL-10} y={yAt(t)+4} textAnchor="end" fontFamily="DM Sans" fontSize="11" fill={A_THEME.inkSoft}>
            {t === 0 ? "0" : `${t/1000}k`}
          </text>
        </g>
      ))}

      {/* baseline (budget pace) */}
      <line x1={baseStart[0]} y1={baseStart[1]} x2={baseEnd[0]} y2={baseEnd[1]}
            stroke={A_THEME.sage} strokeWidth="2" strokeDasharray="6 6" strokeLinecap="round" opacity="0.7"/>

      {/* total fill + line */}
      <path d={totalFill} fill="url(#aTotalFill)"/>
      <path d={totalPath} fill="none" stroke={A_THEME.coral} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round"/>

      {/* food line */}
      <path d={foodPath} fill="none" stroke={A_THEME.mustard} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {/* other line */}
      <path d={otherPath} fill="none" stroke={A_THEME.sky} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>

      {/* forecast (dotted continuation of total) */}
      <path d={forecastPath} fill="none" stroke={A_THEME.coralDeep} strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" opacity="0.65"/>

      {/* today marker */}
      <line x1={xAt(TODAY)} y1={padT} x2={xAt(TODAY)} y2={padT+h} stroke={A_THEME.ink} strokeWidth="1" opacity="0.15"/>

      {/* today dot */}
      <circle cx={xAt(TODAY)} cy={yAt(SPENT_SO_FAR)} r="7" fill="#fff" stroke={A_THEME.coral} strokeWidth="3"/>

      {/* today tooltip */}
      <g transform={`translate(${xAt(TODAY)+12}, ${yAt(SPENT_SO_FAR)-44})`}>
        <rect width="116" height="38" rx="12" fill={A_THEME.ink}/>
        <text x="14" y="16" fill="#fff" fontFamily="M PLUS Rounded 1c" fontSize="10" opacity="0.6">今日</text>
        <text x="14" y="30" fill="#fff" fontFamily="DM Sans" fontWeight="700" fontSize="14">{yen(SPENT_SO_FAR)}</text>
      </g>

      {/* x ticks */}
      {xTicks.map(d => (
        <text key={d} x={xAt(d)} y={padT+h+18} textAnchor="middle"
              fontFamily="DM Sans" fontSize="11" fill={A_THEME.inkSoft}>{d}</text>
      ))}
      <text x={width - padR} y={padT+h+34} textAnchor="end" fontFamily="M PLUS Rounded 1c" fontSize="11" fill={A_THEME.inkSoft}>5月</text>
    </svg>
  );
}

function ALegendDot({ color, label, dashed }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:A_THEME.inkSoft}}>
      {dashed
        ? <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke={color} strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round"/></svg>
        : <span style={{width:14,height:14,borderRadius:7,background:color,display:"inline-block"}}/>}
      <span>{label}</span>
    </div>
  );
}

function AStatPill({ tone, label, value, sub }) {
  const bg = { coral:"#FFE8DD", mustard:"#FFF1CC", sage:"#DEF1E6" }[tone];
  const fg = { coral:A_THEME.coralDeep, mustard:"#A3791F", sage:A_THEME.sageDeep }[tone];
  return (
    <div style={{background:bg,borderRadius:24,padding:"18px 22px",flex:1,minWidth:0}}>
      <div style={{fontSize:12,color:fg,fontWeight:700,letterSpacing:"0.04em"}}>{label}</div>
      <div style={{fontFamily:"DM Sans",fontWeight:700,fontSize:26,color:A_THEME.ink,marginTop:4}}>{value}</div>
      <div style={{fontSize:12,color:A_THEME.inkSoft,marginTop:2}}>{sub}</div>
    </div>
  );
}

function AInputField({ label, children, flex }) {
  return (
    <label style={{display:"flex",flexDirection:"column",gap:6,flex:flex||1,minWidth:0}}>
      <span style={{fontSize:12,color:A_THEME.inkSoft,fontWeight:500}}>{label}</span>
      {children}
    </label>
  );
}

function APill({ active, children, tone="coral", onClick }) {
  const bg = active ? A_THEME[tone] : "#fff";
  const fg = active ? "#fff" : A_THEME.ink;
  const bd = active ? A_THEME[tone] : A_THEME.hair;
  return (
    <button onClick={onClick} style={{
      border:`1.5px solid ${bd}`, background:bg, color:fg, padding:"10px 16px",
      borderRadius:999, fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer",
      whiteSpace:"nowrap"
    }}>{children}</button>
  );
}

function AHomeScreen() {
  const remainingPct = Math.round((REMAINING / MONTHLY_BUDGET) * 100);
  const dailyLeft = Math.round(REMAINING / (DAYS_IN_MONTH - TODAY));
  const onTrack = PROJECTED_END <= MONTHLY_BUDGET;

  return (
    <div data-screen-label="A · 01 ホーム" style={{
      width:1200, background:A_THEME.bg, fontFamily:"var(--font-jp)", color:A_THEME.ink,
      padding:32, display:"flex", flexDirection:"column", gap:24
    }}>
      <ANavBar active="home"/>

      {/* Greeting + hero */}
      <div style={{display:"flex",gap:24,alignItems:"stretch"}}>
        <div style={{flex:"0 0 360px",background:A_THEME.card,borderRadius:28,padding:"24px 28px 28px",boxShadow:"0 4px 20px -12px rgba(80,40,10,0.14)",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
            <div style={{fontSize:12,color:A_THEME.inkSoft}}>5月18日（月）</div>
            <div style={{fontFamily:"var(--font-jp-display)",fontSize:14,fontWeight:700,color:A_THEME.inkSoft}}>おかえりなさい！</div>
          </div>

          <div style={{fontSize:13,color:A_THEME.inkSoft,fontWeight:500,marginTop:10,marginBottom:8}}>今月あといくら使える？</div>

          {/* Donut chart */}
          <div style={{position:"relative",width:240,height:240}}>
            {(() => {
              const r = 96, cx = 120, cy = 120;
              const circ = 2 * Math.PI * r;
              const spentArc = circ * (100 - remainingPct) / 100;
              return (
                <svg width="240" height="240" viewBox="0 0 240 240">
                  <defs>
                    <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={A_THEME.mustard}/>
                      <stop offset="100%" stopColor={A_THEME.coral}/>
                    </linearGradient>
                  </defs>
                  {/* Track */}
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke="#FFE8DD" strokeWidth="26"/>
                  {/* Spent arc */}
                  <circle cx={cx} cy={cy} r={r} fill="none"
                    stroke="url(#donutGrad)" strokeWidth="26"
                    strokeDasharray={`${spentArc} ${circ}`}
                    strokeLinecap="round"
                    style={{transform:"rotate(-90deg)",transformOrigin:`${cx}px ${cy}px`}}
                  />
                </svg>
              );
            })()}
            {/* Centre label */}
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{display:"flex",alignItems:"baseline",gap:3}}>
                <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:38,letterSpacing:"-0.03em",color:A_THEME.ink,lineHeight:1}}>{yenSlim(REMAINING)}</span>
                <span style={{fontFamily:"var(--font-jp-display)",fontWeight:700,fontSize:17,color:A_THEME.ink}}>円</span>
              </div>
              <div style={{fontSize:12,color:A_THEME.inkSoft,marginTop:6}}>
                残り <strong style={{color:A_THEME.coralDeep}}>{remainingPct}%</strong> · あと {DAYS_IN_MONTH - TODAY}日
              </div>
            </div>
          </div>
        </div>

        <div style={{flex:1,background:A_THEME.card,borderRadius:32,padding:28,boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontFamily:"var(--font-jp-display)",fontSize:18,fontWeight:700}}>変動費の累積</div>
              <div style={{fontSize:12,color:A_THEME.inkSoft,marginTop:4}}>このペースなら月末は <strong style={{color:onTrack?A_THEME.sageDeep:A_THEME.coralDeep}}>{yen(PROJECTED_END)}</strong>{onTrack?"。いいペース！":"。少し抑えめに。"}</div>
            </div>
            <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
              <ALegendDot color={A_THEME.coral} label="合計"/>
              <ALegendDot color={A_THEME.mustard} label="食費"/>
              <ALegendDot color={A_THEME.sky} label="その他"/>
              <ALegendDot color={A_THEME.sage} label="基準" dashed/>
            </div>
          </div>
          <div style={{marginTop:8}}>
            <AAreaChart width={760} height={300}/>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{display:"flex",gap:16}}>
        <AStatPill tone="coral" label="今日まで" value={yen(SPENT_SO_FAR)} sub={`基準より ${yen(MONTHLY_BUDGET/DAYS_IN_MONTH*TODAY - SPENT_SO_FAR)} 余裕`}/>
        <AStatPill tone="mustard" label="月末予測" value={yen(PROJECTED_END)} sub={onTrack?"予算内におさまりそう":"あと少し気をつけて"}/>
        <AStatPill tone="sage" label="1日あたり" value={yen(DAILY_BUDGET)} sub={`残り ${DAYS_IN_MONTH-TODAY} 日 × ${yen(dailyLeft)}`}/>
      </div>

      {/* Entry form */}
      <div style={{background:A_THEME.card,borderRadius:32,padding:28,boxShadow:"0 8px 24px -16px rgba(80,40,10,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div>
            <div style={{fontFamily:"var(--font-jp-display)",fontSize:18,fontWeight:700}}>支出を記録</div>
            <div style={{fontSize:12,color:A_THEME.inkSoft,marginTop:2}}>サクッと入力してすぐ反映</div>
          </div>
          <div style={{fontSize:12,color:A_THEME.inkSoft}}>⌘ + Enter で保存</div>
        </div>

        <div style={{display:"flex",gap:14,marginBottom:16}}>
          <AInputField label="日付" flex={0.7}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 14px",border:`1.5px solid ${A_THEME.hair}`,borderRadius:16,background:A_THEME.bgSoft}}>
              <span style={{fontFamily:"DM Sans",fontWeight:600}}>2026/05/18</span>
              <span style={{marginLeft:"auto",fontSize:11,color:A_THEME.inkSoft}}>📅</span>
            </div>
          </AInputField>
          <AInputField label="金額" flex={0.6}>
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"12px 14px",border:`1.5px solid ${A_THEME.coral}`,borderRadius:16,background:"#fff"}}>
              <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:20,color:A_THEME.coralDeep}}>¥</span>
              <span style={{fontFamily:"DM Sans",fontWeight:700,fontSize:20}}>1,480</span>
            </div>
          </AInputField>
          <AInputField label="項目名" flex={1.4}>
            <div style={{padding:"12px 14px",border:`1.5px solid ${A_THEME.hair}`,borderRadius:16,background:A_THEME.bgSoft,fontWeight:500}}>
              唐揚げ定食
            </div>
          </AInputField>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,color:A_THEME.inkSoft,fontWeight:500,marginBottom:8}}>大分類</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {GROUPS.slice(0,6).map((g,i) => (
              <APill key={g.id} active={i===0} tone={i===0?"coral":"mustard"}>
                <span style={{marginRight:6}}>{g.emoji}</span>{g.name}
              </APill>
            ))}
            <APill>＋</APill>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,color:A_THEME.inkSoft,fontWeight:500,marginBottom:8}}>生活区分</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {CATEGORIES.filter(c=>c.group===1).map((c,i)=>(
              <APill key={c.id} active={i===0} tone="mustard">{c.name}</APill>
            ))}
          </div>
        </div>

        <div style={{display:"flex",gap:14,alignItems:"center",justifyContent:"space-between",marginTop:18}}>
          <label style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:A_THEME.inkSoft,cursor:"pointer"}}>
            <span style={{width:36,height:22,borderRadius:999,background:A_THEME.hair,position:"relative"}}>
              <span style={{position:"absolute",left:2,top:2,width:18,height:18,borderRadius:999,background:"#fff",boxShadow:"0 1px 2px rgba(0,0,0,0.1)"}}/>
            </span>
            集計から除外する <span style={{fontSize:11,color:A_THEME.inkSoft}}>（記念日など）</span>
          </label>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <button style={{border:"none",background:"transparent",color:A_THEME.inkSoft,fontFamily:"inherit",fontSize:13,cursor:"pointer"}}>キャンセル</button>
            <button style={{border:"none",background:A_THEME.coral,color:"#fff",padding:"12px 28px",borderRadius:999,fontFamily:"inherit",fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:`0 6px 0 ${A_THEME.coralDeep}`}}>
              ＋ 記録する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ANavBar({ active }) {
  const items = [
    { id:"home", label:"ホーム", emoji:"🌞" },
    { id:"budget", label:"予算", emoji:"💰" },
    { id:"review", label:"振り返り", emoji:"📖" },
    { id:"journal", label:"仕訳", emoji:"📝" },
    { id:"master", label:"マスタ", emoji:"🧰" },
  ];
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:44,height:44,borderRadius:14,background:A_THEME.coral,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 0 ${A_THEME.coralDeep}`,position:"relative"}}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <circle cx="13" cy="13" r="9" fill={A_THEME.mustard} stroke="#fff" strokeWidth="2"/>
            <circle cx="10" cy="11" r="1.4" fill={A_THEME.coralDeep}/>
            <circle cx="16" cy="11" r="1.4" fill={A_THEME.coralDeep}/>
            <path d="M10 15.5 Q13 18 16 15.5" stroke={A_THEME.coralDeep} strokeWidth="1.6" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div style={{fontFamily:"var(--font-jp-display)",fontWeight:900,fontSize:22,letterSpacing:"-0.01em"}}>Atoikura</div>
      </div>
      <div style={{display:"flex",gap:6,background:A_THEME.card,padding:6,borderRadius:999,boxShadow:"0 4px 16px -10px rgba(80,40,10,0.2)"}}>
        {items.map(it => (
          <div key={it.id}
            onClick={() => window.AtoikuraNavigate?.(it.id)}
            style={{
              padding:"10px 18px", borderRadius:999,
              background: active===it.id ? A_THEME.ink : "transparent",
              color: active===it.id ? "#fff" : A_THEME.ink,
              fontWeight:600, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6,
              transition:"background 0.15s, color 0.15s",
            }}>
            <span style={{fontSize:14}}>{it.emoji}</span>{it.label}
          </div>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{padding:"8px 14px",borderRadius:999,background:A_THEME.card,fontSize:12,color:A_THEME.inkSoft}}>2026年 5月 ▾</div>
        <div style={{width:40,height:40,borderRadius:999,background:A_THEME.sage,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>K</div>
      </div>
    </div>
  );
}

Object.assign(window, { A_THEME, AHomeScreen, ANavBar, ASunBadge, APill });
