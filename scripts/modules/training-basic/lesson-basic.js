(() => {
  const STORAGE_KEY = 'farmbot_basic_lesson_v2';
  let active = false;
  let lessonId = null;
  let step = 0;
  let lastEvent = '';
  let missionScore = null;
  let missionSeed = 1;

  const lessons = {
    move_basic: {
      title: '基本操作レッスン',
      subtitle: '座標選択 → Move → Home → Safe Z を、実際の操作で順番に練習します。',
      startCommand:'startBasicMove',
      target: {x:900, y:450, z:0},
      tolerance: 55,
      steps: [
        { id:'select', title:'指定座標を選択', body:'畑マップに表示された黄色の「目標 X900 / Y450」をクリックして、移動先として指定してください。', event:'select', requireTarget:true },
        { id:'move', title:'目標へ Move', body:'Move To を押して、指定した X900 / Y450 / Z0 へ移動してください。違う場所へ移動した場合は進みません。', event:'move', requireTarget:true },
        { id:'home', title:'Home に戻る', body:'Home ボタンを押して、X0 / Y0 / Z0 へ戻ってください。', event:'home' },
        { id:'safez', title:'Safe Z を使う', body:'Safe Z ボタンを押して、Z軸の安全移動を確認してください。', event:'safeZ' }
      ],
      doneText:'基本操作レッスン完了。指定座標の選択、Move、Home、Safe Z の流れを確認できました。'
    },
    water_basic: {
      title: '水やりレッスン',
      subtitle: '指定された株へ移動し、半径と水量を意識して散水します。',
      startCommand:'startWaterBasic',
      target: {x:820, y:420, z:0},
      tolerance: 70,
      steps: [
        { id:'select', title:'水やり対象を選択', body:'黄色の目標株（レタス）を選択してください。水やりでは、まず対象の位置を正しく指定します。', event:'select', requireTarget:true },
        { id:'move', title:'対象株へ Move', body:'Move To を押して、ノズルを目標株の上へ移動してください。', event:'move', requireTarget:true },
        { id:'water_on', title:'Water ON', body:'周辺機器の Water ON を押して散水を開始してください。半径と量は初期設定のままで進められます。', event:'waterOn' },
        { id:'water_off', title:'Water OFF', body:'1〜2秒ほど散水したら Water OFF を押してください。水やりは開始だけでなく停止も重要です。', event:'waterOff' }
      ],
      doneText:'水やりレッスン完了。対象選択、移動、散水開始、停止の流れを確認できました。'
    },
    sequence_basic: {
      title: 'シークエンスレッスン',
      subtitle: 'Safe Z感覚、Move、水量設定、待機、ログ、帰還までを1本の手順にします。',
      startCommand:'startSequenceBasic',
      target: {x:980, y:520, z:0},
      tolerance: 70,
      steps: [
        { id:'select', title:'① 目標株を選択', body:'黄色の目標株を選択してください。この座標をシークエンスの最初の Move 手順に使います。', event:'select', requireTarget:true },
        { id:'add_move_target', title:'② 目標へ Move を追加', body:'Sequencesで Move を選び、「選択座標から入力」→「追加」を押してください。目標株へ移動する工程です。', event:'seqAdd', requireSeqType:'move', requireSeqMove:'target' },
        { id:'add_water', title:'③ 水量/半径を追加', body:'Sequencesで「水量/半径」を選び、半径と水量を手順に追加してください。散水条件を先に決める工程です。', event:'seqAdd', requireSeqType:'set_water' },
        { id:'add_wait', title:'④ 待機を追加', body:'Sequencesで「待機」を選び、2秒前後の待機を追加してください。水が落ち着く時間を想定します。', event:'seqAdd', requireSeqType:'wait' },
        { id:'add_message', title:'⑤ メッセージを追加', body:'Sequencesで「メッセージ」を選び、「水やり確認」などの短いメモを追加してください。記録を残す練習です。', event:'seqAdd', requireSeqType:'message' },
        { id:'add_move_home', title:'⑥ Home位置へ戻る Move を追加', body:'Sequencesで Move を選び、X0 / Y0 / Z0 の手順を追加してください。作業後に安全な基準位置へ戻す工程です。', event:'seqAdd', requireSeqType:'move', requireSeqMove:'home' },
        { id:'run', title:'⑦ シークエンス実行', body:'Run Sequence を押して、登録した複数工程を順番に実行してください。', event:'seqRun' }
      ],
      doneText:'シークエンスレッスン完了。目標Move、水量設定、待機、記録、Home帰還、実行までの複数工程を確認できました。'
    },
    mission_water: {
      title: '課題モード：ランダム水やりシークエンステスト',
      subtitle: 'ランダム生成された株に対して、シークエンスだけで移動・水やり・停止・帰還まで組み、場所/時間/水量を採点します。',
      startCommand:'startMissionWater',
      target: {x:760, y:420, z:0},
      tolerance: 75,
      mission: { radius:48, rate:6, wait:3, maxSteps:7, maxTime:42, label:'レタス', type:'lettuce' },
      steps: [
        { id:'select', title:'① ランダム課題株を確認・選択', body:'黄色の課題株を選択してください。課題ごとに場所と目標水量が変わります。', event:'select', requireTarget:true },
        { id:'add_move_target', title:'② 目標株へ Move を追加', body:'Sequencesで Move To を選び、選択座標から入力して追加してください。場所の正確さが評価対象です。', event:'seqAdd', requireSeqType:'move', requireSeqMove:'target' },
        { id:'add_water_setting', title:'③ 水量/半径設定を追加', body:'Sequencesで「水量/半径設定」を追加してください。課題カードの目標値に近いほど高評価です。', event:'seqAdd', requireSeqType:'set_water' },
        { id:'add_water_on', title:'④ 水やり開始を追加', body:'Sequencesで「水やり開始」を追加してください。', event:'seqAdd', requireSeqType:'water_on' },
        { id:'add_wait', title:'⑤ 待機を追加', body:'Sequencesで「待機」を追加してください。課題カードの目標時間に近いほど高評価です。', event:'seqAdd', requireSeqType:'wait' },
        { id:'add_water_off', title:'⑥ 水やり停止を追加', body:'Sequencesで「水やり停止」を追加してください。', event:'seqAdd', requireSeqType:'water_off' },
        { id:'add_return', title:'⑦ Homeへ戻る工程を追加', body:'Sequencesで Home、または X0/Y0/Z0 のMoveを追加してください。終了後の安全位置も評価します。', event:'seqAdd', requireAnyReturn:true },
        { id:'run', title:'⑧ Run Sequenceで提出', body:'Run Sequence を押してください。実行後に場所・時間・水量・順番から SS〜C 評価を出します。', event:'seqRun', evaluateMission:true }
      ],
      doneText:'課題完了。採点結果を確認してください。'
    }  };

  const comingSoon = {
  };

  function qs(sel, root=document){ return root.querySelector(sel); }
  function load(){
    try{
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if(data && data.lessonId){ active=!!data.active; lessonId=data.lessonId; step=data.step||0; }
    }catch{}
  }
  function save(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify({active, lessonId, step, savedAt:new Date().toISOString()})); }catch{}
  }
  function ensurePanel(){
    let panel = qs('#basicLessonPanel');
    if(panel) return panel;
    panel = document.createElement('section');
    panel.id = 'basicLessonPanel';
    panel.className = 'basicLessonPanel hidden';
    const leftBody = qs('.leftBody') || qs('.left') || qs('#appRoot');
    if(leftBody) leftBody.prepend(panel); else document.body.appendChild(panel);
    return panel;
  }

  function clampNum(v,min,max){ return Math.max(min, Math.min(max, Number(v)||0)); }
  function rand(seed){ const x = Math.sin(seed * 999.91) * 10000; return x - Math.floor(x); }
  function makeMissionSpec(){
    missionSeed = Date.now() % 1000000;
    const targets = [
      {x:520,y:360,type:'lettuce',label:'レタス'},
      {x:860,y:520,type:'basil',label:'バジル'},
      {x:1180,y:420,type:'radish',label:'ラディッシュ'},
      {x:1450,y:680,type:'tomato',label:'トマト'},
      {x:1780,y:560,type:'spinach',label:'ほうれん草'}
    ];
    const t = targets[Math.floor(rand(missionSeed+1)*targets.length)];
    return {
      target:{x:t.x,y:t.y,z:0,type:t.type,label:t.label},
      radius: Math.round(38 + rand(missionSeed+2)*20),
      rate: Math.round(4 + rand(missionSeed+3)*5),
      wait: Math.round(2 + rand(missionSeed+4)*4),
      maxSteps: 7,
      maxTime: 42
    };
  }
  function missionCardHtml(lesson){
    if(!lesson || lessonId !== 'mission_water') return '';
    const m = lesson.mission || {};
    const t = lesson.target || {};
    return `<div class="missionCard"><strong>ランダム課題</strong><div>対象: ${m.label || '野菜'} / X${Math.round(t.x||0)} Y${Math.round(t.y||0)}</div><div>目標: 半径 ${m.radius} / 水量 ${m.rate} / 待機 ${m.wait}秒</div><div>評価: 位置精度・水量/半径・散水時間・工程順・帰還</div></div>`;
  }
  function scoreHtml(){
    if(!missionScore) return '';
    const items = missionScore.items.map(it=>`<li><span>${it.name}</span><strong>${it.point}</strong><small>${it.note}</small></li>`).join('');
    return `<div class="missionScore ${missionScore.grade}"><div class="scoreHead"><span>評価</span><strong>${missionScore.grade}</strong><em>${missionScore.total}/100</em></div><ul>${items}</ul></div>`;
  }
  function distance(a,b){ return Math.hypot((+a.x||0)-(+b.x||0),(+a.y||0)-(+b.y||0)); }
  function firstStep(seq,type){ return (seq||[]).find(s=>s.type===type); }
  function evaluateMission(sequence, lesson){
    const seq = Array.isArray(sequence) ? sequence : [];
    const m = lesson.mission || {};
    const target = lesson.target || {};
    const move = seq.find(s=>s.type==='move');
    const water = firstStep(seq,'set_water') || {};
    const wait = firstStep(seq,'wait') || {};
    const hasOn = seq.some(s=>s.type==='water_on');
    const hasOff = seq.some(s=>s.type==='water_off');
    const ret = seq.find(s=>s.type==='home') || seq.find(s=>s.type==='move' && distance(s,{x:0,y:0})<=45 && Math.abs(+s.z||0)<=5);
    const moveErr = move ? distance(move,target) : 9999;
    const posPoint = move ? Math.round(clampNum(30 - moveErr/3,0,30)) : 0;
    const radiusErr = Math.abs((+water.radius||0) - (+m.radius||0));
    const rateErr = Math.abs((+water.rate||0) - (+m.rate||0));
    const waterPoint = water.type ? Math.round(clampNum(25 - radiusErr*0.8 - rateErr*3,0,25)) : 0;
    const waitErr = Math.abs((+wait.arg||0) - (+m.wait||0));
    const timePoint = wait.type ? Math.round(clampNum(18 - waitErr*4,0,18)) : 0;
    const orderText = seq.map(s=>s.type).join('>');
    const orderOk = /move>set_water>water_on>wait>water_off/.test(orderText);
    const orderPoint = (orderOk?17:8) + (ret?5:0);
    const efficiencyPoint = Math.round(clampNum(10 - Math.max(0, seq.length-(m.maxSteps||7))*2,0,10));
    const total = Math.min(100, posPoint+waterPoint+timePoint+orderPoint+efficiencyPoint);
    const grade = total>=92?'SS':total>=82?'S':total>=70?'A':total>=55?'B':'C';
    return {grade,total,items:[
      {name:'場所', point:`${posPoint}/30`, note: move?`誤差 約${Math.round(moveErr)}mm`:'Move工程なし'},
      {name:'水量/半径', point:`${waterPoint}/25`, note: water.type?`半径差${radiusErr} / 水量差${rateErr}`:'水量設定なし'},
      {name:'時間', point:`${timePoint}/18`, note: wait.type?`待機差${waitErr}秒`:'待機なし'},
      {name:'工程順/帰還', point:`${orderPoint}/22`, note: `${hasOn?'ONあり':'ONなし'} / ${hasOff?'OFFあり':'OFFなし'} / ${ret?'帰還あり':'帰還なし'}`},
      {name:'効率', point:`${efficiencyPoint}/10`, note:`工程数 ${seq.length}`}
    ]};
  }

  function stepHtml(lesson){
    const completed = step >= lesson.steps.length;
    const steps = lesson.steps.map((s,i)=>{
      const cls = i < step ? 'done' : i === step ? 'active' : '';
      const mark = i < step ? '✓' : String(i+1);
      return `<li class="${cls}"><span>${mark}</span><div><strong>${s.title}</strong><small>${s.body}</small></div></li>`;
    }).join('');
    const current = completed ? lesson.doneText : lesson.steps[step].body;
    const title = completed ? '完了' : lesson.steps[step].title;
    return `
      <div class="basicLessonHead">
        <div><small>練習モードA</small><h3>${lesson.title}</h3></div>
        <button class="btn small" type="button" id="basicLessonCloseBtn">閉じる</button>
      </div>
      ${missionCardHtml(lesson)}
      <div class="basicLessonNow ${completed?'complete':''}">
        <strong>${title}</strong>
        <p>${current}</p>
        ${lastEvent ? `<em>直前の操作: ${lastEvent}</em>` : ''}
      </div>
      <ol class="basicLessonSteps">${steps}</ol>
      ${scoreHtml()}
      <div class="basicLessonActions">
        <button class="btn small" type="button" id="basicLessonResetBtn">最初から</button>
        <button class="btn small primary" type="button" id="basicLessonMenuBtn">練習A目次</button>
      </div>`;
  }
  function comingSoonHtml(info){
    return `
      <div class="basicLessonHead">
        <div><small>練習モードA</small><h3>${info.title}</h3></div>
        <button class="btn small" type="button" id="basicLessonCloseBtn">閉じる</button>
      </div>
      <div class="basicLessonNow">
        <strong>設計済み / 次段階で実装</strong>
        <p>${info.body}</p>
      </div>
      <div class="basicLessonActions">
        <button class="btn small primary" type="button" id="basicLessonMenuBtn">練習A目次</button>
      </div>`;
  }
  function render(){
    const panel = ensurePanel();
    if(!active || !lessonId){ panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const lesson = lessons[lessonId];
    if(lesson) panel.innerHTML = stepHtml(lesson);
    else panel.innerHTML = comingSoonHtml(comingSoon[lessonId] || {title:'練習項目', body:'この練習項目は準備中です。'});
    const close = qs('#basicLessonCloseBtn', panel);
    if(close) close.onclick = () => { active=false; save(); render(); };
    const reset = qs('#basicLessonResetBtn', panel);
    if(reset) reset.onclick = () => {
      const lesson = lessons[lessonId];
      step=0; lastEvent=''; missionScore=null;
      if(lessonId === 'mission_water' && lesson){ const spec=makeMissionSpec(); lesson.target={x:spec.target.x,y:spec.target.y,z:0}; lesson.mission={radius:spec.radius,rate:spec.rate,wait:spec.wait,maxSteps:spec.maxSteps,maxTime:spec.maxTime,label:spec.target.label,type:spec.target.type}; }
      if(lesson && lesson.startCommand){
        window.dispatchEvent(new CustomEvent('farmbot:training-command', {detail:{command:lesson.startCommand, lessonId, target:lesson.target, tolerance:lesson.tolerance, mission:lesson.mission}}));
      }
      save(); render();
    };
    const menu = qs('#basicLessonMenuBtn', panel);
    if(menu) menu.onclick = () => { if(window.FarmBotModeCassettes) window.FarmBotModeCassettes.openTrainingA(); };
  }
  function start(id){
    active = true;
    lessonId = id;
    step = 0;
    lastEvent = '';
    missionScore = null;
    const lesson = lessons[id];
    if(id === 'mission_water' && lesson){ const spec=makeMissionSpec(); lesson.target={x:spec.target.x,y:spec.target.y,z:0}; lesson.mission={radius:spec.radius,rate:spec.rate,wait:spec.wait,maxSteps:spec.maxSteps,maxTime:spec.maxTime,label:spec.target.label,type:spec.target.type}; }
    if(lesson && lesson.startCommand){
      window.dispatchEvent(new CustomEvent('farmbot:training-command', {detail:{command:lesson.startCommand, lessonId:id, target:lesson.target, tolerance:lesson.tolerance, mission:lesson.mission}}));
    }
    save();
    window.setTimeout(render, 80);
    window.setTimeout(render, 450);
  }
  function stop(){ active=false; save(); render(); }
  function seqMoveOk(rule, detail, lesson){
    if(!rule) return true;
    const st = detail && detail.step;
    if(!st || st.type !== 'move') return false;
    const target = lesson && lesson.target ? lesson.target : null;
    if(rule === 'target' && target){
      const tol = lesson.tolerance || 70;
      return Math.hypot((+st.x||0)-target.x, (+st.y||0)-target.y) <= tol;
    }
    if(rule === 'home'){
      return Math.hypot(+st.x||0, +st.y||0) <= 40 && Math.abs(+st.z||0) <= 5;
    }
    return true;
  }
  function seqTypeLabel(type){
    const labels = {move:'Move', set_water:'水量/半径', wait:'待機', message:'メッセージ', reserve:'予約'};
    return labels[type] || type || '';
  }
  function onLessonEvent(type, detail={}){
    if(!active || !lessonId) return;
    const lesson = lessons[lessonId];
    if(!lesson || step >= lesson.steps.length){ render(); return; }
    const current = lesson.steps[step];
    const expected = current.event;
    if(type === expected){
      if(current.requireTarget && detail && detail.targetOk === false){
        lastEvent = '指定位置と違います。黄色の目標座標を選んでください。';
        render();
        return;
      }
      if(current.requireSeqType && detail && detail.seqType !== current.requireSeqType){
        lastEvent = `追加した手順が違います。今回は ${seqTypeLabel(current.requireSeqType)} を追加してください。`;
        render();
        return;
      }
      if(current.requireAnyReturn){
        const st = detail && detail.step;
        const okReturn = (detail.seqType === 'home') || (st && st.type === 'move' && seqMoveOk('home', detail, lesson));
        if(!okReturn){ lastEvent = '終了工程が違います。Home、または X0 / Y0 / Z0 のMoveを追加してください。'; render(); return; }
      }
      if(current.requireSeqMove && !seqMoveOk(current.requireSeqMove, detail, lesson)){
        lastEvent = current.requireSeqMove === 'home'
          ? 'Move の座標が違います。今回は X0 / Y0 / Z0 を追加してください。'
          : 'Move の座標が違います。黄色の目標座標を使って追加してください。';
        render();
        return;
      }
      if(current.evaluateMission){ missionScore = evaluateMission(detail.sequence || [], lesson); lastEvent = `採点完了: ${missionScore.grade} (${missionScore.total}/100)`; }
      else { lastEvent = labelFor(type, detail); }
      step++;
      save();
      render();
    }
  }
  function labelFor(type, detail){
    if(type==='select' && detail.selected) return `座標選択 X${Math.round(detail.selected.x)} / Y${Math.round(detail.selected.y)}`;
    if(type==='move' && detail.pos) return `Move完了 X${Math.round(detail.pos.x)} / Y${Math.round(detail.pos.y)} / Z${Math.round(detail.pos.z)}`;
    if(type==='home') return 'Home 実行';
    if(type==='safeZ') return 'Safe Z 実行';
    if(type==='waterOn') return 'Water ON 実行';
    if(type==='waterOff') return 'Water OFF 実行';
    if(type==='seqAdd') return `シークエンス追加: ${detail.seqType || ''}`;
    if(type==='seqRun') return 'シークエンス実行完了';
    return type;
  }
  window.addEventListener('farmbot:lesson-event', (ev)=>{
    onLessonEvent(ev.detail?.type, ev.detail||{});
  });
  window.addEventListener('DOMContentLoaded', ()=>{ load(); render(); });
  window.addEventListener('load', ()=>{ load(); render(); });
  window.FarmBotBasicLesson = {start, stop, render, onLessonEvent};
})();
