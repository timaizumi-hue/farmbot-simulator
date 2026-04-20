(() => {
  window.FarmBotTutorialCatalog = {
    movement_basic:{
      title:"移動の基本",
      subtitle:"機械を安全に動かす最初の授業です。まずは少しずつ動かして、次に選択座標へ移動します。",
      steps:[
        {sel:"#operateSection", title:"今日の授業", text:"この授業では『機械を動かす』だけに集中します。水やりやシークエンスは使いません。まずは右下の畑マップと、左の操作欄を見る練習から始めます。", goal:"右下の畑マップと左の操作欄の場所を確認したら『次へ』を押します。", allow:["#missionSection","#operateSection","#mapCard"], freeNext:true},
        {sel:"#jogStepWrap", title:"1. 動かす量を決める", text:"矢印移動は、先に『何mm動かすか』を決めてから使います。最初は 100mm に合わせます。", goal:"『100mm』ボタンを押してください。", allow:["#operateSection"], expected:{name:"setJogStep", check:(d)=>d.step===100}},
        {sel:"#jogXPlusBtn", title:"2. X方向へ少し動かす", text:"次は X+ を1回押して、機械が横に少し動く様子を見ます。右上の動作レビューと右下の畑マップがどちらも少し動くのを確認します。", goal:"『X+』を1回押してください。", allow:["#operateSection","#stageCard","#mapCard"], expected:{name:"jog", check:(d)=>d.dx===1}},
        {sel:"#mapCard", title:"3. 行きたい場所を選ぶ", text:"FarmBotでは、まず畑の場所を選んでから移動します。黄色の選択表示が出れば成功です。", goal:"右下の畑マップを1回クリックしてください。", allow:["#selectSection","#mapCard"], expected:{name:"mapClick", check:()=>true}},
        {sel:"#goBtn", title:"4. 選んだ場所へ移動する", text:"いま選んだ座標へ、機械を実際に動かします。左の『選択座標へ移動』を押すと、選んだ場所まで移動します。", goal:"『選択座標へ移動』を押してください。", allow:["#selectSection","#operateSection","#stageCard","#mapCard"], expected:{name:"moveComplete", check:(d)=>d.type==="goTo"}},
        {sel:"#missionSection", title:"授業のまとめ", text:"これで『動かす量を決める → 少し動かす → 畑で場所を選ぶ → その場所へ移動する』流れを体験できました。これが移動の基本です。", goal:"内容を確認したら『完了』を押します。", allow:["#missionSection"], freeNext:true}
      ]
    },
    water_basic:{
      title:"水やりの基本",
      subtitle:"水やりは、まず位置を決めてから始めます。移動 → 散水開始 → 土の変化を見る → 停止、の順で進みます。",
      steps:[
        {sel:"#operateSection", title:"今日の授業", text:"この授業では『水やりの順番』を覚えます。いきなり水を出すのではなく、まず位置を決めて移動してから散水します。", goal:"授業の流れを読んだら『次へ』を押します。", allow:["#operateSection","#panel-water","#mapCard"], freeNext:true},
        {sel:"#mapCard", title:"1. 先に場所を決める", text:"水やりは、どこに水を出すかを決めてから始めます。畑マップで、植物の近くを1回クリックしてください。", goal:"右下の畑マップを1回クリックしてください。", allow:["#mapCard","#selectSection"], expected:{name:"mapClick", check:()=>true}},
        {sel:"#goBtn", title:"2. 選んだ場所へ移動する", text:"選んだ場所へ機械を移動します。移動してから水を出すのが基本です。", goal:"『選択座標へ移動』を押してください。", allow:["#operateSection","#stageCard","#mapCard"], expected:{name:"moveComplete", check:(d)=>d.type==="goTo"}},
        {sel:'.tab[data-panel="water"]', title:"3. 水やりタブを開く", text:"次に、水やり専用の操作へ切り替えます。水量や半径、開始と停止はこのタブで行います。", goal:"上の『水やり』タブを押してください。", allow:[".leftTopTabs"], expected:{name:"openTab", check:(d)=>d.panel==="water"}},
        {sel:"#waterStartBtn", title:"4. 散水を始める", text:"『水やり開始』を押すと、現在の機械位置で散水が始まります。右上の動作レビューと畑マップで、土の変化を見ます。", goal:"『水やり開始』を押してください。", allow:["#panel-water","#stageCard","#mapCard"], expected:{name:"waterOn", check:()=>true}},
        {sel:"#waterStopBtn", title:"5. 散水を止める", text:"水は出し続けると多くなりすぎます。適度なところで止めるのが大切です。", goal:"『水やり停止』を押してください。", allow:["#panel-water","#stageCard","#mapCard"], expected:{name:"waterOff", check:()=>true}},
        {sel:"#missionSection", title:"授業のまとめ", text:"水やりは『場所を選ぶ → 移動する → 開始 → 土の変化を見る → 停止』の順で行います。わからなくなったときは、この順番に戻れば大丈夫です。", goal:"内容を確認したら『完了』を押します。", allow:["#missionSection"], freeNext:true}
      ]
    }
  };
})();
