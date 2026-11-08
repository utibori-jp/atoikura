/* Atoikura Mobile — assemble screens in iOS frames on a design canvas. */

const M_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "warm"
}/*EDITMODE-END*/;

function applyMobilePalette(name) {
  const palettes = {
    warm:  { bg:"#FFF4E8", bgSoft:"#FFFAF2", coral:"#FF8A5C", coralDeep:"#F26B3F", mustard:"#FFC247", mustardDeep:"#F0A92E", sage:"#7BC4A4", sageDeep:"#4FA481", coralSoft:"#FFE8DD", mustardSoft:"#FFF1CC", sageSoft:"#DEF1E6", hair:"#F2E4D2" },
    berry: { bg:"#FFF1F4", bgSoft:"#FFF7F9", coral:"#E8527A", coralDeep:"#B83560", mustard:"#FFB347", mustardDeep:"#E08A1E", sage:"#9C7BD9", sageDeep:"#6E50A8", coralSoft:"#FBDCE6", mustardSoft:"#FFE9CC", sageSoft:"#EADFF7", hair:"#F3DDE3" },
    ocean: { bg:"#EAF2F7", bgSoft:"#F4F9FC", coral:"#3FA5C9", coralDeep:"#1F7E9D", mustard:"#FFC247", mustardDeep:"#F0A92E", sage:"#5DD3B8", sageDeep:"#2E9C7E", coralSoft:"#D6ECF4", mustardSoft:"#FFF1CC", sageSoft:"#D5F2EA", hair:"#D8E6EE" },
  };
  Object.assign(M, palettes[name] || palettes.warm);
}

function MobileApp() {
  const [tweaks, setTweak] = useTweaks(M_TWEAK_DEFAULTS);
  React.useEffect(() => { applyMobilePalette(tweaks.palette); }, [tweaks.palette]);
  const themeKey = tweaks.palette;

  const frame = (node) => (
    <IOSDevice width={402} height={874}>{node}</IOSDevice>
  );

  return (
    <React.Fragment>
      <DesignCanvas key={themeKey} initialZoom={0.6} background="#efeae2">
        <DCSection id="mobile" title="Atoikura — スマホ版（PWA）" subtitle="402×874 で再設計。ボトムタブ＋中央の＋ボタン、ヒーローはリングゲージ、入力はボトムシート。">
          <DCArtboard id="m-home" label="01 ホーム" width={402} height={874}>
            {frame(<MHomeScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-entry" label="02 支出入力（シート）" width={402} height={874}>
            {frame(<MEntryScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-review" label="03 振り返り" width={402} height={874}>
            {frame(<MReviewScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-journal" label="04 仕訳一覧" width={402} height={874}>
            {frame(<MJournalScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-goals" label="05 目標" width={402} height={874}>
            {frame(<MGoalsScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-master" label="06 マスタ" width={402} height={874}>
            {frame(<MMasterScreen/>)}
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Palette">
          <TweakColor
            label="カラーパレット"
            value={tweaks.palette}
            options={[
              { value:"warm",  swatch:["#FF8A5C","#FFC247","#7BC4A4"] },
              { value:"berry", swatch:["#E8527A","#9C7BD9","#FFB347"] },
              { value:"ocean", swatch:["#3FA5C9","#5DD3B8","#FFC247"] },
            ]}
            onChange={v=>setTweak("palette",v)}
          />
        </TweakSection>
        <TweakSection label="メモ">
          <div style={{fontSize:12,color:"#666",lineHeight:1.6}}>
            実機サイズ（iPhone）の6画面。アートボードはドラッグで並び替え、ダブルクリックで全画面表示。各画面内もスクロールできます。
          </div>
        </TweakSection>
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<MobileApp/>);
