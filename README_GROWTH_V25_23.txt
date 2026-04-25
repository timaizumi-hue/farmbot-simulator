FarmBot v25.23 Growth Water Detail Sync

目的:
- 手元カメラ側の水やり反映と、育成HUD詳細の水分%を一致させる。

修正:
- Water OFF時に本体app.jsからGrowthModeへ直接水やり結果を通知。
- 従来のCustomEventだけに依存しないため、イベント順やキャッシュで同期が漏れにくい。
- 育成植物への反映範囲を少し広げ、現在位置近くの対象植物に確実に水分%を加算。
- 二重反映を避けるため、通常のWater OFFイベントにはskipGrowthEventを付与。

確認:
- 育成B開始後、練習画面でWater ON→Water OFF。
- HUD詳細の対象植物の水分%が上がること。
