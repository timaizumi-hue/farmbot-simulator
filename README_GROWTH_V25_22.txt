FarmBot v25.22 育成モードB 整合性修正

目的:
- 新規開始時に前回の植物状態・水分履歴を引き継がない。
- 練習画面のWater ON/OFFをHUD水分へ確実に反映する。

修正内容:
1. 新規開始時だけ本体側状態を完全初期化
   - 現在位置 X0/Y0/Z0
   - 選択位置 X0/Y0/Z0
   - 水分セル
   - 水履歴
   - 葉水履歴
   - 移動軌跡

2. 保存データ再開時は初期化しない
   - 前回の続きは保持
   - 新規開始だけ resetMainStateOnce を使って初期化

3. 育成セッションの水分を本体植物へ同期
   - app.js 側の植物に waterPct / fertility / growth を渡す

4. Water OFF の反映を復旧
   - 練習画面のWater操作をHUD植物のwaterPctに反映
   - 対象判定半径を少し広げ、植物近辺で反映しやすくした

確認方法:
GitHub Pagesへ上書き後、以下で確認:
https://timaizumi-hue.github.io/farmbot-simulator/?v=2522
