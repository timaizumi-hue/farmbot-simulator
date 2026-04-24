FarmBot 練習シミュレーター 再整理メモ

この版は、見た目の微調整ではなく、今後の再開発をしやすくするための構造整理版です。

■ 今回分けたもの
- scripts/core/config.js
  定数、初期状態、共通ヘルパー。
- scripts/core/tutorial-data.js
  チュートリアル定義だけ。
- scripts/app.js
  状態更新、イベント接続、描画。

■ まず触る場所
- 文言や初期値: scripts/core/config.js
- 授業内容: scripts/core/tutorial-data.js
- UI挙動: scripts/app.js

■ 次に分ける候補
1. 畑マップ描画
2. 動作レビュー描画
3. Move / Water 操作
4. 保存読込

■ 注意
- 畑マップは座標変換と見た目が強く結びついているため、CSSだけで広げすぎない
- defaults() の state 形を変えたら保存読込も確認する


[2026-04 restructure step]
- scripts/core/canvas-utils.js
  Canvas size calculation, scroll centering, map coordinate conversion.
  Safe area to adjust view sizing without touching state logic or watering logic.


[2026-04 restructure note]
- 畑マップ描画を scripts/views/farm-map.js へ分離。
- スマートフォン対応の土台として styles/mobile-foundation.css を追加。
- 今後は map 描画を app.js から直接触らず、farm-map.js 側で改修する。
- スマホ対応の次段階は、右ビュー3面の表示優先順位切替とタッチ操作最適化。


[追加整理 v24.5]
- scripts/views/left-pane.js を追加
- スマホ時の左パネル切替(操作/周辺機器/植物/Seq/ログ)を分離
- PC側の既存タブと同期する構造に整理
- 今後はスマホ用の左操作導線を left-pane.js / mobile-foundation.css で進める


[v24.7 mobile landscape shell]
- styles/mobile-landscape.css を追加
- scripts/views/mobile-shell.js を追加
- スマホ横向き時は右側を主画面化し、Live / Camera / Map を大きく切替
- スマホ縦向き時は回転案内を表示
- PC版レイアウトは維持

=== v25.0 カセット式モード整理 ===
追加:
- scripts/modules/mode-cassettes.js
- styles/cassettes.css
- modules/training-basic/README.txt
- modules/growth-mode/README.txt

目的:
ホームから練習モードA/Bを直接開始するのではなく、ゲームカセットのように「目次パック」を開いて、練習内容を選んで読み込む構造へ整理しました。

練習モードA:
- 基本操作
- 水やり
- シークエンス
- 課題モード

練習モードB:
- 春野菜
- 夏野菜
- 冬野菜

今後の拡張:
各モードの採点、成長エンジン、季節データは modules/ 配下に追加し、本体 app.js への直接追加を減らします。
