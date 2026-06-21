/* Atoikura Mobile V2 — assembles new + updated screens on a canvas. */

const MV2_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "warm"
}/*EDITMODE-END*/;

function applyMobilePaletteV2(name) {
  const palettes = {
    warm:  { bg:"#FFF4E8", bgSoft:"#FFFAF2", coral:"#FF8A5C", coralDeep:"#F26B3F", mustard:"#FFC247", mustardDeep:"#F0A92E", sage:"#7BC4A4", sageDeep:"#4FA481", coralSoft:"#FFE8DD", mustardSoft:"#FFF1CC", sageSoft:"#DEF1E6", hair:"#F2E4D2" },
  };
  Object.assign(M, palettes[name] || palettes.warm);
}

function MobileAppV2() {
  const [tweaks, setTweak] = useTweaks(MV2_TWEAK_DEFAULTS);
  React.useEffect(() => { applyMobilePaletteV2(tweaks.palette); }, [tweaks.palette]);
  const themeKey = tweaks.palette;

  const frame = (node) => (
    <IOSDevice width={402} height={874}>{node}</IOSDevice>
  );

  return (
    <React.Fragment>
      <DesignCanvas key={themeKey} initialZoom={0.55} background="#efeae2">
        <DCSection
          id="new-screens"
          title="新規画面（Issues #25 / #27 / #28）"
          subtitle="定期支出、貯金目標、収入記録の3画面と、それぞれの追加シート。既存のスマホUIと同じ語彙・密度で揃えています。"
        >
          <DCArtboard id="m-recurring" label="A · 定期支出" width={402} height={874}>
            {frame(<MRecurringScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-recurring-sheet" label="A · 定期支出を追加" width={402} height={874}>
            {frame(<MRecurringSheetScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-savings" label="B · 貯金目標" width={402} height={874}>
            {frame(<MSavingsScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-savings-sheet" label="B · 貯金目標を追加" width={402} height={874}>
            {frame(<MSavingsSheetScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-income" label="C · 収入記録" width={402} height={874}>
            {frame(<MIncomeScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-income-sheet" label="C · 収入を記録（共通＋）" width={402} height={874}>
            {frame(<MIncomeSheetScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-allocate-sheet" label="C · 余剰を振り分ける" width={402} height={874}>
            {frame(<MAllocateSheetScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-edit-base-sheet" label="C · 基準収入を編集" width={402} height={874}>
            {frame(<MEditBaseSheetScreen/>)}
          </DCArtboard>
        </DCSection>

        <DCSection
          id="updated-screens"
          title="更新画面（Issue #29）"
          subtitle="「目標」を「予算」ハブに再設計。今月の予算を主表示し、収入 / 定期支出 / 貯金の3画面へタップで移動。仕訳には🔁定期ラベル。"
        >
          <DCArtboard id="m-budget" label="D · 予算ハブ（新設計）" width={402} height={874}>
            {frame(<MBudgetScreen/>)}
          </DCArtboard>
          <DCArtboard id="m-journal-v2" label="仕訳（🔁 定期マーク付）" width={402} height={874}>
            {frame(<MJournalScreenV2/>)}
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="メモ">
          <div style={{fontSize:12,color:"#666",lineHeight:1.7}}>
            6枚の新規アートボード + 2枚の更新アートボード。<br/>
            ドラッグで並び替え、ダブルクリックで全画面表示、各端末内もスクロール可能です。<br/>
            <br/>
            <strong>関連 Issue:</strong><br/>
            #25 定期支出管理 / #27 貯金目標管理<br/>
            #28 収入記録 / #29 「予算」ハブと自動算出
          </div>
        </TweakSection>
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<MobileAppV2/>);
