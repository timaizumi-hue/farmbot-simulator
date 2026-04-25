FarmBot v25.23 育成B 再設計メモ

目的:
- 育成Bの水分・植物状態の正を「練習画面」に一本化する。
- HUDは表示・時間・天気・ゲームイベントの補助にする。
- 今後、水分同期の修正を容易にする。

重要な設計変更:
1. 練習画面が正
   - Water ON/OFF、土壌水分、植物表示は本体 app.js 側を正とする。
   - HUD側で独自に水分を増減しない。

2. HUD水分は読み取り専用
   - GrowthMode は FarmBotAppBridge.getGrowthMoistureSnapshot() で本体の植物水分を取得。
   - 表示する % は本体の水分ユニットを、植物ごとの目標水分範囲に合わせて変換する。
   - 目標中央値 = 50%、目標下限 = 40%、目標上限 = 60%。

3. 新規開始
   - 育成セッション作成時のみ本体側の植物・水分を初期化する。
   - 保存データから再開する場合は本体状態を極力維持する。

4. 水やり反映
   - farmbot:water-applied を受けたら、HUDが水分を加算するのではなく、本体の水分状態を再取得して同期する。
   - これにより、手元カメラ・畑マップ・HUD詳細の水分差をなくす。

今後触る場所:
- 本体水分→HUD%変換:
  scripts/app.js
  growthUnitToPercent()
  growthMoistureSnapshot()

- HUD側の同期:
  scripts/modules/growth-mode/growth-mode.js
  syncMoistureFromMain()

確認方法:
- index.html直接起動ではなく、GitHub Pages または start.bat の localhost で確認する。
- GitHub Pages確認URL例:
  https://timaizumi-hue.github.io/farmbot-simulator/?v=2523
