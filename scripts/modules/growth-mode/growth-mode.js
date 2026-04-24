(() => {
  'use strict';

  const VERSION = '25.13';
  const SAVE_KEY = 'farmbot_growth_session_v25_13';
  const TOTAL_DAYS = 90;
  const SEASON_REAL_MS = 60 * 60 * 1000;
  const DAY_MS = SEASON_REAL_MS / TOTAL_DAYS;

  const SEASONS = {
    spring_growth: {label:'春野菜', startMonth:3, base:{temp:18, humidity:62, rain:0.22, evap:0.72}},
    summer_growth: {label:'夏野菜', startMonth:6, base:{temp:28, humidity:66, rain:0.26, evap:1.08}},
    winter_growth: {label:'冬野菜', startMonth:11, base:{temp:9, humidity:58, rain:0.16, evap:0.45}}
  };
  const CROP = {
    lettuce:{name:'レタス', optimal:[58,76], need:10}, spinach:{name:'ほうれん草', optimal:[52,72], need:9}, radish:{name:'ラディッシュ', optimal:[48,68], need:8},
    tomato:{name:'トマト', optimal:[46,66], need:15}, cucumber:{name:'きゅうり', optimal:[58,78], need:18}, basil:{name:'バジル', optimal:[45,65], need:10}, carrot:{name:'にんじん', optimal:[42,60], need:6}
  };
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const clamp = (v,a,b)=>Math.max(a, Math.min(b, v));
  const pad = n=>String(n).padStart(2,'0');

  let session = null;
  let timer = null;
  let lastTick = 0;

  function cropMeta(type){ return CROP[type] || {name:'植物', optimal:[48,68], need:8}; }
  function rnd(day, salt=0){ const seed = session?.seed || 1; const x = Math.sin(seed*0.013 + day*12.9898 + salt*78.233)*43758.5453; return x - Math.floor(x); }
  function dateText(day){
    if(!session) return '-';
    const md=[31,28,31,30,31,30,31,31,30,31,30,31]; let m=session.startMonth; let d=Math.floor(day)+1;
    while(d > md[(m-1)%12]){ d -= md[(m-1)%12]; m=(m%12)+1; }
    const w=['月','火','水','木','金','土','日'][Math.floor(day)%7];
    return `${m}/${pad(d)}（${w}）`;
  }
  function stageText(){ const d=Math.floor(session?.day||0); if(d<14) return '苗'; if(d<42) return '成長期'; if(d<68) return '充実期'; return '収穫期'; }
  function weatherAt(day){
    const b = session?.base || SEASONS.spring_growth.base;
    const rainish = rnd(day,3) < b.rain;
    const temp = Math.round(b.temp + (rnd(day,1)-.5)*5 + Math.sin(day/8)*2);
    const humidity = Math.round(clamp(b.humidity + (rainish?10:0) + (rnd(day,2)-.5)*12, 35, 86));
    const rain = rainish ? Math.round(2 + rnd(day,4)*6) : 0;
    const label = rain ? '小雨' : (temp >= 30 ? '晴れ・高温' : temp <= 8 ? '曇り・低温' : '晴れ');
    return {label, temp, humidity, rain};
  }
  function waterStatus(p){ const [lo,hi]=p.optimal||[45,70]; if(!p.alive) return ['枯れ','bad']; if(p.water<lo-12) return ['乾燥','bad']; if(p.water<lo) return ['やや乾燥','warn']; if(p.water>hi+12) return ['過湿','bad']; if(p.water>hi) return ['やや過湿','warn']; return ['適正','good']; }
  function log(t){ if(!session) return; session.notes.unshift(`${dateText(session.day)} ${t}`); session.notes=session.notes.slice(0,50); }

  function injectStyles(){
    if($('#growthModeV2513Style')) return;
    const st=document.createElement('style'); st.id='growthModeV2513Style';
    st.textContent = `
      #growthHudV2513{position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9800;width:min(1160px,calc(100vw - 18px));background:rgba(255,250,240,.98);border:2px solid #9bb68c;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.22);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#263027;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:8px 10px;box-sizing:border-box}.g-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}.g-badge{background:#25452a;color:#fff;border-radius:999px;padding:4px 9px;font-size:12px;white-space:nowrap}.g-strong{font-weight:800;font-size:17px;white-space:nowrap}.g-chip{background:#eef5e8;border:1px solid #d3e1c8;border-radius:999px;padding:4px 8px;font-size:12px;white-space:nowrap}.g-actions{display:flex;gap:6px;align-items:center}.g-actions button,#growthPanelV2513 button{border:1px solid #c8d2bd;background:#fff;border-radius:9px;min-height:30px;padding:4px 9px;font-weight:700;cursor:pointer}.g-actions button.primary{background:#2f6b36;color:#fff;border-color:#2f6b36}.g-hidden{display:none!important}
      #growthPanelV2513{position:fixed;inset:62px 12px 12px 12px;z-index:9790;background:#f7f4ec;border:2px solid #d7ceb9;border-radius:16px;box-shadow:0 22px 60px rgba(0,0,0,.30);display:grid;grid-template-rows:auto 1fr;overflow:hidden;color:#263027;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}.gp-head{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#fffaf0;border-bottom:1px solid #ddd2bf;padding:10px 14px}.gp-head h2{margin:0;font-size:20px}.gp-head p{margin:2px 0 0;color:#60705f;font-size:12px}.gp-body{display:grid;grid-template-columns:270px 1fr 320px;gap:10px;padding:10px;min-height:0}.gp-card{background:#fff;border:1px solid #dfd7c9;border-radius:12px;padding:10px;overflow:auto;min-height:0}.gp-card h3{margin:2px 0 10px;font-size:15px}.gp-stat{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed #e4ddd1;padding:7px 0}.gp-stat span{color:#667064}.gp-stat strong{text-align:right}.forecast{display:grid;gap:6px}.forecast div{display:grid;grid-template-columns:44px 52px 1fr;gap:5px;align-items:center;border:1px solid #eee6d8;background:#fbfaf5;border-radius:9px;padding:6px;font-size:12px}.plant-list{display:grid;gap:8px}.plant-card{border:1px solid #e4ddd1;border-radius:12px;background:#fbfaf5;padding:9px}.plant-head{display:flex;justify-content:space-between;gap:8px}.plant-head strong{font-size:15px}.plant-head span{font-size:12px;border-radius:999px;padding:3px 8px}.good{background:#dff3df;color:#276b32}.warn{background:#fff0bd;color:#745600}.bad{background:#ffd7d0;color:#8b2c20}.bars{display:grid;gap:6px;margin-top:8px}.bars label{display:grid;grid-template-columns:42px 1fr 40px;gap:8px;align-items:center;font-size:12px}.bars meter{width:100%;height:12px}.mini-map{background:#e6dbc4;border:1px solid #a99475;border-radius:10px;overflow:hidden;margin-bottom:8px}.mini-map svg{display:block;width:100%;height:156px}.mini-map rect{fill:#e3d2b6;stroke:#9b8c70}.mini-map circle{fill:#5d9d51;stroke:#2e5e29;stroke-width:2}.mini-map text{font-size:12px;fill:#2f3e31}.lock-note{font-size:12px;background:#f1eadc;border:1px solid #e1d7c5;border-radius:9px;padding:7px;margin:8px 0}.g-log{display:grid;gap:6px;margin-top:10px}.g-log div{border:1px solid #eee6d8;border-radius:9px;background:#fbfaf5;padding:7px;font-size:12px}.muted{color:#647164;font-size:12px}.gp-footer-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      body.growth-plant-locked #panel-plants::before{content:'育成モード中：植物配置は固定されています。追加・削除・全消去・練習配置の変更はできません。';display:block;margin:0 0 8px;padding:8px 10px;border:1px solid #d9c79b;border-radius:10px;background:#fff4cc;color:#6f4e00;font-weight:700;font-size:12px}body.growth-plant-locked #plantMode,body.growth-plant-locked #clearPlantsBtn,body.growth-plant-locked #seedPracticeBtn{opacity:.45;pointer-events:none}
      @media(max-width:900px){#growthHudV2513{top:5px;width:calc(100vw - 10px);grid-template-columns:1fr;gap:5px;padding:5px 6px}.g-main{gap:5px!important}.g-strong{font-size:13px}.g-chip,.g-badge{font-size:10px;padding:3px 6px}.g-actions{overflow:auto}.g-actions button{min-height:28px;font-size:11px;padding:3px 6px}#growthPanelV2513{inset:50px 5px 5px 5px}.gp-head{padding:7px 8px}.gp-head h2{font-size:16px}.gp-head p{display:none}.gp-body{grid-template-columns:220px 1fr 245px;gap:6px;padding:6px}.gp-card{padding:7px}.mini-map svg{height:110px}}
    `;
    document.head.appendChild(st);
  }

  function snapshotFromMain(){
    try{ window.FarmBotAppBridge?.ensureFreeMode?.(); const arr=window.FarmBotAppBridge?.getPlantsSnapshot?.(); if(Array.isArray(arr)&&arr.length) return arr; }catch(e){ console.warn(e); }
    return [
      {id:'fallback_1', type:'lettuce', x:420, y:520, stage:'growing'},
      {id:'fallback_2', type:'spinach', x:780, y:360, stage:'growing'},
      {id:'fallback_3', type:'tomato', x:1120, y:520, stage:'growing'},
      {id:'fallback_4', type:'basil', x:1340, y:280, stage:'growing'}
    ];
  }
  function makeSession(kind){
    const meta=SEASONS[kind]||SEASONS.spring_growth; const seed=Date.now()%1000000; const src=snapshotFromMain();
    session={version:VERSION, kind, label:meta.label, startMonth:meta.startMonth, base:meta.base, seed, day:0, running:false, speed:0, lockedPlants:true, mainScreenIsSource:true, createdAt:new Date().toISOString(), lastSaved:null, plants:[], notes:[]};
    session.plants=src.map((p,i)=>{ const type=p.type||p.species||'lettuce'; const cm=cropMeta(type); return {id:p.id||`${type}_${i}_${seed}`, species:type, type, name:p.name||cm.name, x:Number(p.x||420+i*220), y:Number(p.y||360), optimal:p.optimal||cm.optimal, waterNeed:Number(p.waterNeed||cm.need), water:clamp(Number(p.water??55+i*3),0,100), health:clamp(Number(p.health??86),0,100), growth:clamp(Number(p.growth??2),0,100), yieldScore:0, alive:p.alive!==false}; });
    log(`${session.label}を開始。植物配置は練習画面の現在配置を固定しました。`); log('HUDは表示専用です。Move / Water / Sequenceは練習画面を使います。'); save();
  }
  function normalize(s){ if(!s||!Array.isArray(s.plants)) return null; const meta=SEASONS[s.kind]||SEASONS.spring_growth; s.version=VERSION; s.label=s.label||meta.label; s.startMonth=s.startMonth||meta.startMonth; s.base=s.base||meta.base; s.day=clamp(Number(s.day||0),0,TOTAL_DAYS); s.running=false; s.speed=0; s.lockedPlants=true; s.notes=Array.isArray(s.notes)?s.notes:[]; s.plants=s.plants.map((p,i)=>{ const type=p.type||p.species||'lettuce'; const cm=cropMeta(type); return {id:p.id||`${type}_${i}_${Date.now()%100000}`, species:type, type, name:p.name||cm.name, x:Number(p.x||500+i*180), y:Number(p.y||400), optimal:p.optimal||cm.optimal, waterNeed:Number(p.waterNeed||cm.need), water:clamp(Number(p.water??55),0,100), health:clamp(Number(p.health??80),0,100), growth:clamp(Number(p.growth??0),0,100), yieldScore:clamp(Number(p.yieldScore??0),0,100), alive:p.alive!==false}; }); return s; }
  function save(){ if(!session) return; session.lastSaved=new Date().toISOString(); localStorage.setItem(SAVE_KEY, JSON.stringify(session)); }
  function load(){ try{ const raw=localStorage.getItem(SAVE_KEY)||localStorage.getItem('farmbot_growth_session_v25_12')||localStorage.getItem('farmbot_growth_mode_save_v5'); const s=normalize(JSON.parse(raw||'null')); if(!s) return false; session=s; log('保存データを読み込みました。'); save(); return true; }catch(e){ console.warn('growth load failed', e); return false; } }

  function forecastHtml(){ return Array.from({length:7},(_,i)=>{ const d=Math.floor(session.day)+i; const w=weatherAt(d); return `<div><strong>${dateText(d).split('（')[0]}</strong><span>${w.label}</span><span>${w.temp}℃ / 湿度${w.humidity}% / 雨${w.rain}mm</span></div>`; }).join(''); }
  function miniMapHtml(){ const W=420,H=170,pad=18,fW=1500,fH=700; const pts=session.plants.map(p=>{const x=pad+(p.x/fW)*(W-pad*2); const y=H-pad-(p.y/fH)*(H-pad*2); return `<g><circle cx="${x}" cy="${y}" r="7"/><text x="${x+10}" y="${y+4}">${p.name}</text></g>`}).join(''); return `<svg viewBox="0 0 ${W} ${H}"><rect x="8" y="8" width="${W-16}" height="${H-16}" rx="10"/>${pts}</svg>`; }
  function ensureHud(){
    injectStyles(); let h=$('#growthHudV2513'); if(h) return h;
    h=document.createElement('div'); h.id='growthHudV2513'; h.innerHTML=`<div class="g-main"><span class="g-badge" id="gSeason">育成</span><span class="g-strong" id="gDate">--</span><span class="g-chip" id="gDay">--</span><span class="g-chip" id="gStage">--</span><span class="g-chip" id="gSpeed">停止</span><span class="g-chip" id="gWeather">--</span><span class="g-chip" id="gNext">予約: Sequence側</span></div><div class="g-actions"><button id="gPause">停止</button><button class="primary" id="gPlay">進む</button><button id="gFast">早送り</button><button id="gStep">1日</button><button id="gDetail">詳細</button><button id="gSave">保存</button></div>`;
    document.body.appendChild(h); $('#gPause',h).onclick=pause; $('#gPlay',h).onclick=()=>play(1); $('#gFast',h).onclick=()=>play(session?.speed>=8?3:8); $('#gStep',h).onclick=stepDay; $('#gDetail',h).onclick=()=>{ensurePanel().classList.remove('g-hidden'); render();}; $('#gSave',h).onclick=()=>{log('手動保存しました。'); save(); render();}; return h;
  }
  function ensurePanel(){
    injectStyles(); let p=$('#growthPanelV2513'); if(p) return p;
    p=document.createElement('div'); p.id='growthPanelV2513'; p.innerHTML=`<div class="gp-head"><div><h2>育成モードB</h2><p>練習画面が実行のメインです。HUDは時間・天気・植物状態の表示に専念します。</p></div><div class="g-actions"><button id="gpMin">閉じる</button></div></div><div class="gp-body"><section class="gp-card"><h3>時間と天気</h3><div id="gpStats"></div><div class="gp-footer-actions"><button id="gpPause">停止</button><button class="primary" id="gpPlay">進む</button><button id="gpFast">早送り</button><button id="gpStep">1日進める</button></div><h3>7日天気予報</h3><div class="forecast" id="gpForecast"></div></section><section class="gp-card"><h3>固定された植物配置</h3><div class="mini-map" id="gpMini"></div><div class="lock-note">植物配置は練習画面側を基準に固定します。育成中は植物の追加・削除・練習配置の入れ替えをできません。</div><div class="plant-list" id="gpPlants"></div></section><section class="gp-card"><h3>Sequence運用</h3><div class="lock-note">予約・自動実行はHUDではなく、元の練習画面の「Sequences」を使用します。HUDは次の実行や成長結果を確認する補助です。</div><div class="gp-stat"><span>水やり反映</span><strong>練習画面の Water OFF</strong></div><div class="gp-stat"><span>予約</span><strong>Sequences の開始予約</strong></div><div class="gp-stat"><span>次の整理予定</span><strong>複数Sequence管理</strong></div><h3>育成ログ</h3><div class="g-log" id="gpLog"></div></section></div>`;
    document.body.appendChild(p); $('#gpMin',p).onclick=()=>p.classList.add('g-hidden'); $('#gpPause',p).onclick=pause; $('#gpPlay',p).onclick=()=>play(1); $('#gpFast',p).onclick=()=>play(session?.speed>=8?3:8); $('#gpStep',p).onclick=stepDay; return p;
  }
  function render(){
    if(!session) return; const h=ensureHud(), p=ensurePanel(); const w=weatherAt(Math.floor(session.day));
    $('#gSeason',h).textContent=session.label; $('#gDate',h).textContent=dateText(session.day); $('#gDay',h).textContent=`${Math.floor(session.day)+1}/${TOTAL_DAYS}日`; $('#gStage',h).textContent=stageText(); $('#gSpeed',h).textContent=session.running?`速度 x${session.speed}`:'停止中'; $('#gWeather',h).textContent=`${w.label} ${w.temp}℃ 湿度${w.humidity}%`; $('#gNext',h).textContent='予約: Sequence側';
    $('#gpStats',p).innerHTML=`<div class="gp-stat"><span>季節</span><strong>${session.label}</strong></div><div class="gp-stat"><span>日付</span><strong>${dateText(session.day)}</strong></div><div class="gp-stat"><span>経過</span><strong>${Math.floor(session.day)+1}/${TOTAL_DAYS}日</strong></div><div class="gp-stat"><span>段階</span><strong>${stageText()}</strong></div><div class="gp-stat"><span>速度</span><strong>${session.running?'x'+session.speed:'停止'}</strong></div><div class="gp-stat"><span>天気</span><strong>${w.label} / ${w.temp}℃ / 湿度${w.humidity}%</strong></div>`;
    $('#gpForecast',p).innerHTML=forecastHtml(); $('#gpMini',p).innerHTML=miniMapHtml();
    $('#gpPlants',p).innerHTML=session.plants.map(pl=>{ const [st,cls]=waterStatus(pl); return `<div class="plant-card"><div class="plant-head"><strong>${pl.name}</strong><span class="${cls}">${st}</span></div><div class="bars"><label>成長 <meter min="0" max="100" value="${pl.growth}"></meter><em>${Math.round(pl.growth)}%</em></label><label>健康 <meter min="0" max="100" value="${pl.health}"></meter><em>${Math.round(pl.health)}%</em></label><label>水分 <meter min="0" max="100" value="${pl.water}"></meter><em>${Math.round(pl.water)}%</em></label></div><div class="gp-footer-actions"><span class="muted">適正 ${pl.optimal[0]}〜${pl.optimal[1]}% / 水やりは練習画面のWaterで反映</span></div></div>`; }).join('');
    $('#gpLog',p).innerHTML=(session.notes||[]).slice(0,18).map(n=>`<div>${n}</div>`).join('') || '<div>ログはまだありません。</div>';
    document.body.classList.add('growth-plant-locked');
  }

  function applyToMain(){ try{ window.FarmBotAppBridge?.applyGrowthSession?.(session); window.FarmBotAppBridge?.setPlantLock?.(true); }catch(e){ console.warn('growth apply failed', e); } }
  function advanceDay(){
    if(!session) return; const d=Math.floor(session.day); const w=weatherAt(d);
    session.plants.forEach(p=>{ if(!p.alive) return; const evap=session.base.evap*(w.temp/22)*(1-w.humidity/190); p.water=clamp(p.water+w.rain*.45-evap*4.1,0,100); const [lo,hi]=p.optimal; let hd=.34; if(p.water<lo) hd-=(lo-p.water)*.052; if(p.water>hi) hd-=(p.water-hi)*.058; if(w.temp>33) hd-=.24; if(w.temp<3) hd-=.18; p.health=clamp(p.health+hd,0,100); const [st]=waterStatus(p); const gm=st==='適正'?1:st.includes('やや')?.58:.18; p.growth=clamp(p.growth+gm*(p.health/100)*1.15,0,100); p.yieldScore=Math.round(p.growth*.65+p.health*.35); if(p.health<=0){p.alive=false; log(`${p.name}が枯れました。`);} });
    applyToMain(); save();
  }
  function stepDay(){ if(!session) return; session.day=clamp(Math.floor(session.day)+1,0,TOTAL_DAYS); advanceDay(); render(); }
  function play(speed=1){ if(!session) return; session.running=true; session.speed=speed; if(timer) clearInterval(timer); lastTick=Date.now(); timer=setInterval(()=>{ if(!session?.running) return; const now=Date.now(); const delta=now-lastTick; lastTick=now; const before=Math.floor(session.day); session.day=clamp(session.day + delta/DAY_MS*session.speed,0,TOTAL_DAYS); const after=Math.floor(session.day); if(after>before){ for(let i=before;i<after;i++) advanceDay(); } render(); }, 1000); render(); }
  function pause(){ if(!session) return; session.running=false; session.speed=0; if(timer) clearInterval(timer); timer=null; render(); save(); }
  function applyWaterFromMain(x,y,radius,amount){ if(!session) return; const near=session.plants.filter(p=>Math.hypot(p.x-x,p.y-y)<=radius).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]; if(near){ near.water=clamp(near.water + amount*.9, 0, 100); log(`${near.name}へ練習画面のWaterを反映。`); } else { log('Waterを実行しましたが、育成植物の近くではありません。'); } applyToMain(); render(); save(); }

  function open(kind){ injectStyles(); if(kind==='load'){ if(!load()) makeSession('spring_growth'); } else { makeSession(kind||'spring_growth'); } applyToMain(); ensureHud(); ensurePanel().classList.remove('g-hidden'); render(); }
  function close(){ pause(); document.body.classList.remove('growth-plant-locked'); window.FarmBotAppBridge?.setPlantLock?.(false); $('#growthHudV2513')?.remove(); $('#growthPanelV2513')?.remove(); }

  window.addEventListener('farmbot:water-applied', ev=>{ if(!session) return; const d=ev.detail||{}; applyWaterFromMain(Number(d.x||0), Number(d.y||0), Math.max(120,Number(d.radius||120)), Math.max(2, Math.round(Number(d.amount||8)/2))); });
  window.FarmBotGrowthMode = { open, openLoad:()=>open('load'), render, save, load, close, getSession:()=>session, hasSave:()=>!!localStorage.getItem(SAVE_KEY) };
})();
