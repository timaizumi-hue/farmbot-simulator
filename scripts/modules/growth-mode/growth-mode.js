(() => {
  'use strict';

  const VERSION='25.16';
  const SAVE_KEY='farmbot_growth_session_v25_16';
  const OLD_KEYS=['farmbot_growth_session_v25_15','farmbot_growth_session_v25_14','farmbot_growth_session_v25_13','farmbot_growth_session_v25_12'];
  const TOTAL_DAYS=90;
  const SEASON_REAL_MS=60*60*1000;
  const DAY_MS=SEASON_REAL_MS/TOTAL_DAYS;
  const MAX_WATER_UNIT=15;
  const AUTO_SAVE_MS=4500;

  const SEASONS={
    spring_growth:{label:'春野菜',startMonth:3,base:{temp:18,humidity:62,rain:0.22,evap:0.72},crops:['lettuce','spinach','radish']},
    summer_growth:{label:'夏野菜',startMonth:6,base:{temp:28,humidity:66,rain:0.26,evap:1.08},crops:['tomato','cucumber','basil']},
    winter_growth:{label:'冬野菜',startMonth:11,base:{temp:9,humidity:58,rain:0.16,evap:0.45},crops:['spinach','carrot','radish']}
  };
  const TARGET_UNITS={
    tomato:{seedling:[3,7],growing:[6,11],fruiting:[9,15]}, lettuce:{seedling:[2,5],growing:[4,8],fruiting:[6,10]}, carrot:{seedling:[2,4],growing:[3,6],fruiting:[4,8]}, radish:{seedling:[1.5,3.5],growing:[2.5,5.5],fruiting:[3.5,6.5]}, cucumber:{seedling:[3,7],growing:[6,11],fruiting:[8,14]}, basil:{seedling:[2,5],growing:[3,7],fruiting:[4,8]}, spinach:{seedling:[2,5],growing:[4,8],fruiting:[5,9]}
  };
  const LABELS={tomato:'トマト',lettuce:'レタス',carrot:'にんじん',radish:'ラディッシュ',cucumber:'きゅうり',basil:'バジル',spinach:'ほうれん草'};
  const TOOL_LABEL={none:'なし',fertilizer:'肥料',pesticide:'殺虫剤',weed:'雑草駆除'};
  const $=(s,r=document)=>r.querySelector(s);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const pad=n=>String(n).padStart(2,'0');
  const pctFromUnit=u=>Math.round(clamp(u/MAX_WATER_UNIT*100,0,100));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

  let session=null;
  let timer=null;
  let lastTick=0;
  let autosaveTimer=null;
  let audio=null;
  let hudSize='compact';

  function cropName(type){return LABELS[type]||'植物';}
  function unitRange(type,stage){return (TARGET_UNITS[type]&&TARGET_UNITS[type][stage||'growing'])||[4,8];}
  function pctRange(type,stage){const r=unitRange(type,stage);return [pctFromUnit(r[0]),pctFromUnit(r[1])];}
  function rnd(day,salt=0){const seed=session?.seed||1;const x=Math.sin(seed*.013+day*12.9898+salt*78.233)*43758.5453;return x-Math.floor(x);}
  function dateText(day){if(!session)return'-';const md=[31,28,31,30,31,30,31,31,30,31,30,31];let m=session.startMonth;let d=Math.floor(day)+1;while(d>md[(m-1)%12]){d-=md[(m-1)%12];m=(m%12)+1;}const w=['月','火','水','木','金','土','日'][Math.floor(day)%7];return `${m}/${pad(d)}（${w}）`;}
  function stageText(){const d=Math.floor(session?.day||0);if(d<14)return'苗';if(d<42)return'成長期';if(d<68)return'充実期';return'収穫期';}
  function weatherAt(day){const b=session?.base||SEASONS.spring_growth.base;const rainish=rnd(day,3)<b.rain;const temp=Math.round(b.temp+(rnd(day,1)-.5)*5+Math.sin(day/8)*2);const humidity=Math.round(clamp(b.humidity+(rainish?10:0)+(rnd(day,2)-.5)*12,35,86));const rain=rainish?Math.round(2+rnd(day,4)*6):0;const label=rain?'小雨':(temp>=30?'晴れ・高温':temp<=8?'曇り・低温':'晴れ');return{label,temp,humidity,rain};}
  function waterStatus(p){const[lo,hi]=p.optimalPct||pctRange(p.type,p.stage);if(!p.alive)return['枯れ','bad'];if(p.waterPct<lo-12)return['乾燥','bad'];if(p.waterPct<lo)return['やや乾燥','warn'];if(p.waterPct>hi+12)return['過湿','bad'];if(p.waterPct>hi)return['やや過湿','warn'];return['適正','good'];}
  function log(t){if(!session)return;session.notes.unshift(`${dateText(session.day)} ${t}`);session.notes=session.notes.slice(0,80);}
  function autoSave(){if(!session)return;session.lastSaved=new Date().toISOString();localStorage.setItem(SAVE_KEY,JSON.stringify(session));}
  function ensureAutoSave(){if(autosaveTimer)return;autosaveTimer=setInterval(autoSave,AUTO_SAVE_MS);}

  function injectStyles(){
    if($('#growthModeV2516Style'))return;
    const st=document.createElement('style');st.id='growthModeV2516Style';
    st.textContent=`
      #growthHudV2515{position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9800;width:min(1040px,calc(100vw - 22px));background:rgba(255,250,240,.96);border:2px solid #9bb68c;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.18);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#263027;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:6px 8px;box-sizing:border-box;pointer-events:none}.g-main{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0}.g-badge{background:#25452a;color:#fff;border-radius:999px;padding:3px 8px;font-size:12px;white-space:nowrap}.g-strong{font-weight:800;font-size:15px;white-space:nowrap}.g-chip{background:#eef5e8;border:1px solid #d3e1c8;border-radius:999px;padding:3px 7px;font-size:12px;white-space:nowrap}.g-actions{display:flex;gap:5px;align-items:center;flex-wrap:nowrap;justify-content:flex-end;pointer-events:auto}.g-actions button,#growthPanelV2515 button{border:1px solid #c8d2bd;background:#fff;border-radius:9px;min-height:29px;padding:3px 8px;font-weight:700;cursor:pointer;white-space:nowrap}.g-actions button.active,#growthPanelV2515 button.active{background:#2f6b36!important;color:#fff!important;border-color:#2f6b36!important}.g-actions button.tool-active,#gToolBtn.tool-active{background:#7a5b25!important;color:#fff!important;border-color:#7a5b25!important}.g-hidden{display:none!important}.g-save-indicator{font-size:11px;color:#60705f}.g-plant-strip{display:none!important}
      #gToolMenu{position:absolute;right:270px;top:42px;z-index:9810;display:none;grid-template-columns:1fr;gap:5px;background:#fffaf0;border:1px solid #d7ceb9;border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,.22);padding:8px;pointer-events:auto}#gToolMenu.open{display:grid}#gToolMenu button{min-width:112px;text-align:left}.g-size-compact #growthHudV2515{width:min(900px,calc(100vw - 22px));font-size:12px}.g-size-wide #growthHudV2515{width:min(1220px,calc(100vw - 22px))}
      #growthPanelV2515{position:fixed;left:36px;top:78px;width:min(1180px,calc(100vw - 72px));height:min(650px,calc(100vh - 100px));z-index:9790;background:#f7f4ec;border:2px solid #d7ceb9;border-radius:16px;box-shadow:0 22px 60px rgba(0,0,0,.30);display:grid;grid-template-rows:auto 1fr;overflow:hidden;color:#263027;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;resize:both;min-width:720px;min-height:430px;max-width:calc(100vw - 24px);max-height:calc(100vh - 70px)}.gp-head{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#fffaf0;border-bottom:1px solid #ddd2bf;padding:9px 12px;cursor:move}.gp-head h2{margin:0;font-size:19px}.gp-head p{margin:2px 0 0;color:#60705f;font-size:12px}.gp-body{display:grid;grid-template-columns:230px 1fr 280px;gap:9px;padding:9px;min-height:0}.gp-card{background:#fff;border:1px solid #dfd7c9;border-radius:12px;padding:9px;overflow:auto;min-height:0}.gp-card h3{margin:2px 0 9px;font-size:14px}.gp-stat{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed #e4ddd1;padding:6px 0}.gp-stat span{color:#667064}.gp-stat strong{text-align:right}.forecast{display:grid;gap:5px}.forecast div{display:grid;grid-template-columns:42px 50px 1fr;gap:5px;align-items:center;border:1px solid #eee6d8;background:#fbfaf5;border-radius:9px;padding:5px;font-size:12px}.plant-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:7px}.plant-card{border:1px solid #e4ddd1;border-radius:12px;background:#fbfaf5;padding:8px}.plant-head{display:flex;justify-content:space-between;gap:8px}.plant-head strong{font-size:14px}.plant-head span{font-size:12px;border-radius:999px;padding:3px 8px}.good{background:#dff3df;color:#276b32}.warn{background:#fff0bd;color:#745600}.bad{background:#ffd7d0;color:#8b2c20}.bars{display:grid;gap:5px;margin-top:7px}.bars label{display:grid;grid-template-columns:40px 1fr 40px;gap:7px;align-items:center;font-size:12px}.bars meter{width:100%;height:11px}.mini-map{background:#e6dbc4;border:1px solid #a99475;border-radius:10px;overflow:hidden;margin-bottom:8px}.mini-map svg{display:block;width:100%;height:135px}.mini-map rect{fill:#e3d2b6;stroke:#9b8c70}.mini-map circle{fill:#5d9d51;stroke:#2e5e29;stroke-width:2}.mini-map text{font-size:12px;fill:#2f3e31}.lock-note{font-size:12px;background:#f1eadc;border:1px solid #e1d7c5;border-radius:9px;padding:7px;margin:8px 0}.g-log{display:grid;gap:6px;margin-top:10px}.g-log div{border:1px solid #eee6d8;border-radius:9px;background:#fbfaf5;padding:7px;font-size:12px}.muted{color:#647164;font-size:12px}.tool-help{font-size:12px;background:#fff8df;border:1px solid #eadca8;border-radius:9px;padding:7px;margin-top:6px}.gp-footer-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      body.growth-plant-locked #panel-plants::before{content:'育成モード中：植物配置は固定されています。追加・削除・全消去・練習配置の変更はできません。';display:block;margin:0 0 8px;padding:8px 10px;border:1px solid #d9c79b;border-radius:10px;background:#fff4cc;color:#6f4e00;font-weight:700;font-size:12px}body.growth-plant-locked #plantMode,body.growth-plant-locked #clearPlantsBtn,body.growth-plant-locked #seedPracticeBtn{opacity:.45;pointer-events:none}
      body.growth-tool-fertilizer #mapCanvas{cursor:copy}body.growth-tool-pesticide #mapCanvas{cursor:crosshair}body.growth-tool-weed #mapCanvas{cursor:cell}
      @media(max-width:900px){#growthHudV2515{top:5px;width:calc(100vw - 10px);grid-template-columns:1fr;gap:4px;padding:5px 6px}.g-main{gap:5px!important}.g-strong{font-size:13px}.g-chip,.g-badge{font-size:10px;padding:3px 6px}.g-actions{overflow:auto;justify-content:flex-start}.g-actions button{min-height:28px;font-size:11px;padding:3px 6px}#gToolMenu{right:auto;left:8px;top:74px}#growthPanelV2515{left:5px;top:50px;width:calc(100vw - 10px);height:calc(100vh - 55px);min-width:0;min-height:0}.gp-head{padding:7px 8px}.gp-head h2{font-size:16px}.gp-head p{display:none}.gp-body{grid-template-columns:210px 1fr 230px;gap:6px;padding:6px}.gp-card{padding:7px}.mini-map svg{height:110px}.plant-list{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}}
    `;
    document.head.appendChild(st);
  }

  function baseSeasonSpec(kind){
    const fallback={
      spring_growth:[['lettuce',300,560,'growing'],['spinach',520,560,'growing'],['radish',740,560,'growing'],['lettuce',960,560,'seedling'],['spinach',300,360,'growing'],['radish',520,360,'seedling'],['lettuce',740,360,'growing'],['spinach',960,360,'seedling'],['radish',1180,460,'growing']],
      summer_growth:[['tomato',320,560,'growing'],['cucumber',560,560,'growing'],['basil',800,560,'growing'],['tomato',1040,560,'seedling'],['cucumber',320,340,'seedling'],['basil',560,340,'growing'],['tomato',800,340,'growing'],['cucumber',1040,340,'growing'],['basil',1240,450,'seedling']],
      winter_growth:[['spinach',320,560,'growing'],['carrot',560,560,'growing'],['radish',800,560,'growing'],['spinach',1040,560,'seedling'],['carrot',320,340,'seedling'],['radish',560,340,'seedling'],['spinach',800,340,'growing'],['carrot',1040,340,'growing'],['radish',1240,450,'growing']]
    };
    return fallback[kind]||fallback.spring_growth;
  }
  function getSeasonPlants(kind){
    try{const arr=window.FarmBotAppBridge?.seedGrowthSeasonLayout?.(kind);if(Array.isArray(arr)&&arr.length)return arr;}catch(e){console.warn(e);}
    return baseSeasonSpec(kind).map(([type,x,y,stage],i)=>({id:`${kind}_${i}`,type,x,y,stage}));
  }
  function normalizePlant(p,i){
    const type=p.type||p.species||'lettuce';const stage=p.stage||'growing';const unit=unitRange(type,stage);const pct=pctRange(type,stage);
    return {id:p.id||`${type}_${i}_${Date.now()%100000}`,type,species:type,name:cropName(type),stage,x:Number(p.x||400+i*180),y:Number(p.y||350),optimalUnit:unit,optimalPct:pct,waterNeedUnit:Math.round((unit[0]+unit[1])/2*10)/10,waterPct:clamp(Number(p.waterPct??p.water??Math.round((pct[0]+pct[1])/2)),0,100),fertility:clamp(Number(p.fertility??58+Math.random()*18),0,100),health:clamp(Number(p.health??86),0,100),growth:clamp(Number(p.growth??2),0,100),yieldScore:0,alive:p.alive!==false,bugs:!!p.bugs};
  }
  function normalize(s){if(!s||!Array.isArray(s.plants))return null;const meta=SEASONS[s.kind]||SEASONS.spring_growth;s.version=VERSION;s.label=s.label||meta.label;s.startMonth=s.startMonth||meta.startMonth;s.base=s.base||meta.base;s.day=clamp(Number(s.day||0),0,TOTAL_DAYS);s.running=!!s.running;s.speed=Number(s.speed||0);s.lockedPlants=true;s.activeTool=s.activeTool||'none';s.notes=Array.isArray(s.notes)?s.notes:[];s.weeds=Array.isArray(s.weeds)?s.weeds:[];s.plants=s.plants.map(normalizePlant);return s;}
  function makeSession(kind){
    const meta=SEASONS[kind]||SEASONS.spring_growth;const seed=Date.now()%1000000;const mainPlants=getSeasonPlants(kind);
    session={version:VERSION,kind,label:meta.label,startMonth:meta.startMonth,base:meta.base,seed,day:0,running:false,speed:0,lockedPlants:true,activeTool:'none',createdAt:new Date().toISOString(),lastSaved:null,plants:mainPlants.map(normalizePlant),weeds:[],notes:[]};
    log(`${session.label}を開始。季節に合った植物を練習画面へ配置し、固定しました。`);log('実行のメインは練習画面です。HUDは時間・天気・植物状態・ツール状態を表示します。');autoSave();
  }
  function load(){try{let raw=localStorage.getItem(SAVE_KEY);if(!raw){for(const k of OLD_KEYS){raw=localStorage.getItem(k);if(raw)break;}}const s=normalize(JSON.parse(raw||'null'));if(!s)return false;session=s;log('保存データを読み込みました。');return true;}catch(e){console.warn('growth load failed',e);return false;}}

  function forecastHtml(){return Array.from({length:7},(_,i)=>{const d=Math.floor(session.day)+i;const w=weatherAt(d);return`<div><strong>${dateText(d).split('（')[0]}</strong><span>${w.label}</span><span>${w.temp}℃ / 湿度${w.humidity}% / 雨${w.rain}mm</span></div>`;}).join('');}
  function miniMapHtml(){const W=420,H=165,pad=18,fW=1500,fH=700;const pts=session.plants.map(p=>{const x=pad+(p.x/fW)*(W-pad*2);const y=H-pad-(p.y/fH)*(H-pad*2);const bug=p.bugs?`<text x="${x-7}" y="${y-11}">🐛</text>`:'';return`<g><circle cx="${x}" cy="${y}" r="7"/><text x="${x+10}" y="${y+4}">${p.name}</text>${bug}</g>`}).join('');const weeds=(session.weeds||[]).map(w=>{const x=pad+(w.x/fW)*(W-pad*2);const y=H-pad-(w.y/fH)*(H-pad*2);return`<text x="${x}" y="${y}">🌿</text>`}).join('');return`<svg viewBox="0 0 ${W} ${H}"><rect x="8" y="8" width="${W-16}" height="${H-16}" rx="10"/>${pts}${weeds}</svg>`;}

  function makePanelDraggable(p){
    const head=p.querySelector('.gp-head'); if(!head||head.dataset.dragReady)return; head.dataset.dragReady='1';
    let sx=0,sy=0,sl=0,st=0,drag=false;
    head.addEventListener('pointerdown',ev=>{ if(ev.target.closest('button'))return; drag=true; sx=ev.clientX; sy=ev.clientY; const r=p.getBoundingClientRect(); sl=r.left; st=r.top; head.setPointerCapture?.(ev.pointerId); });
    head.addEventListener('pointermove',ev=>{ if(!drag)return; const nx=Math.max(4,Math.min(window.innerWidth-120,sl+ev.clientX-sx)); const ny=Math.max(4,Math.min(window.innerHeight-80,st+ev.clientY-sy)); p.style.left=nx+'px'; p.style.top=ny+'px'; p.style.right='auto'; p.style.bottom='auto'; });
    head.addEventListener('pointerup',()=>{drag=false;});
    head.addEventListener('pointercancel',()=>{drag=false;});
  }
  function ensureHud(){
    injectStyles();let h=$('#growthHudV2515');if(h)return h;
    h=document.createElement('div');h.id='growthHudV2515';h.innerHTML=`<div class="g-main"><span class="g-badge" id="gSeason">育成</span><span class="g-strong" id="gDate">--</span><span class="g-chip" id="gDay">--</span><span class="g-chip" id="gStage">--</span><span class="g-chip" id="gSpeed">停止</span><span class="g-chip" id="gWeather">--</span><span class="g-chip" id="gTool">ツール: なし</span><span class="g-save-indicator" id="gSaveState">自動保存</span></div><div class="g-actions"><button id="gToolBtn">ツール ▾</button><button id="gPause">停止</button><button id="gPlay">進む</button><button id="gFast">早送り</button><button id="gStep">1日</button><button id="gMusic">音楽</button><button id="gSize">サイズ</button><button id="gDetail">詳細</button><button id="gSave">保存</button></div><div id="gToolMenu"><button data-gtool="fertilizer">🌿 肥料</button><button data-gtool="pesticide">🐛 殺虫剤</button><button data-gtool="weed">🔪 雑草駆除</button><button data-gtool="none">解除</button></div>`;
    document.body.appendChild(h);$('#gPause',h).onclick=pause;$('#gPlay',h).onclick=()=>play(1);$('#gFast',h).onclick=()=>play(8);$('#gStep',h).onclick=stepDay;$('#gDetail',h).onclick=()=>{ensurePanel().classList.remove('g-hidden');render();};$('#gSave',h).onclick=()=>{log('手動保存しました。');autoSave();render();};$('#gMusic',h).onclick=toggleMusic;$('#gToolBtn',h).onclick=()=>$('#gToolMenu',h)?.classList.toggle('open');$('#gSize',h).onclick=cycleHudSize;h.querySelectorAll('[data-gtool]').forEach(b=>b.onclick=()=>{const t=b.dataset.gtool==='none'?'none':b.dataset.gtool;setTool(session?.activeTool===t?'none':t);$('#gToolMenu',h)?.classList.remove('open');});return h;
  }
  function ensurePanel(){
    injectStyles();let p=$('#growthPanelV2515');if(p)return p;
    p=document.createElement('div');p.id='growthPanelV2515';p.className='g-hidden';p.innerHTML=`<div class="gp-head"><div><h2>育成モードB</h2><p>練習画面が実行のメインです。HUDは表示・補助ツール・自動保存を担当します。</p></div><div class="g-actions"><button id="gpMin">閉じる</button></div></div><div class="gp-body"><section class="gp-card"><h3>時間と天気</h3><div id="gpStats"></div><div class="gp-footer-actions"><button id="gpPause">停止</button><button id="gpPlay">進む</button><button id="gpFast">早送り</button><button id="gpStep">1日進める</button></div><h3>7日天気予報</h3><div class="forecast" id="gpForecast"></div></section><section class="gp-card"><h3>固定された植物配置</h3><div class="mini-map" id="gpMini"></div><div class="lock-note">植物配置は開始時に練習画面へ作成し、その後は固定です。</div><div class="plant-list" id="gpPlants"></div></section><section class="gp-card"><h3>ツールとイベント</h3><div class="gp-stat"><span>選択中</span><strong id="gpToolName">なし</strong></div><div class="tool-help">肥料：植物をクリックして肥料を追加。殺虫剤：虫アイコンのある植物をクリック。雑草駆除：畑マップの雑草アイコンをクリック。</div><div class="gp-footer-actions"><button data-gtool="fertilizer">肥料</button><button data-gtool="pesticide">殺虫剤</button><button data-gtool="weed">雑草駆除</button></div><h3>育成ログ</h3><div class="g-log" id="gpLog"></div></section></div>`;
    document.body.appendChild(p);$('#gpMin',p).onclick=()=>p.classList.add('g-hidden');$('#gpPause',p).onclick=pause;$('#gpPlay',p).onclick=()=>play(1);$('#gpFast',p).onclick=()=>play(8);$('#gpStep',p).onclick=stepDay;p.querySelectorAll('[data-gtool]').forEach(b=>b.onclick=()=>setTool(session?.activeTool===b.dataset.gtool?'none':b.dataset.gtool));makePanelDraggable(p);return p;
  }
  function plantMiniHtml(){return session.plants.slice(0,10).map(p=>{const[st,cls]=waterStatus(p);return`<div class="g-mini-plant ${cls}"><b>${p.name}${p.bugs?' 🐛':''}</b><div class="minirow"><span>水${Math.round(p.waterPct)}%</span><span>肥${Math.round(p.fertility)}%</span></div><div class="bar"><i style="width:${p.health}%"></i></div></div>`;}).join('');}
  function render(){
    if(!session)return;const h=ensureHud(),p=ensurePanel();const w=weatherAt(Math.floor(session.day));
    $('#gSeason',h).textContent=session.label;$('#gDate',h).textContent=dateText(session.day);$('#gDay',h).textContent=`${Math.floor(session.day)+1}/${TOTAL_DAYS}日`;$('#gStage',h).textContent=stageText();$('#gSpeed',h).textContent=session.running?`速度 x${session.speed}`:'停止中';$('#gWeather',h).textContent=`${w.label} ${w.temp}℃ 湿度${w.humidity}%`;$('#gTool',h).textContent=`ツール: ${TOOL_LABEL[session.activeTool]||'なし'}`;$('#gSaveState',h).textContent=`自動保存 ${session.lastSaved?new Date(session.lastSaved).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'待機'}`;
    $('#gpStats',p).innerHTML=`<div class="gp-stat"><span>季節</span><strong>${session.label}</strong></div><div class="gp-stat"><span>日付</span><strong>${dateText(session.day)}</strong></div><div class="gp-stat"><span>経過</span><strong>${Math.floor(session.day)+1}/${TOTAL_DAYS}日</strong></div><div class="gp-stat"><span>段階</span><strong>${stageText()}</strong></div><div class="gp-stat"><span>速度</span><strong>${session.running?'x'+session.speed:'停止'}</strong></div><div class="gp-stat"><span>天気</span><strong>${w.label} / ${w.temp}℃ / 湿度${w.humidity}%</strong></div><div class="gp-stat"><span>虫</span><strong>${session.plants.filter(x=>x.bugs).length}株</strong></div><div class="gp-stat"><span>雑草</span><strong>${session.weeds.length}本</strong></div>`;
    $('#gpForecast',p).innerHTML=forecastHtml();$('#gpMini',p).innerHTML=miniMapHtml();$('#gpToolName',p).textContent=TOOL_LABEL[session.activeTool]||'なし';
    $('#gpPlants',p).innerHTML=session.plants.map(pl=>{const[st,cls]=waterStatus(pl);return`<div class="plant-card"><div class="plant-head"><strong>${pl.name}${pl.bugs?' 🐛':''}</strong><span class="${cls}">${st}</span></div><div class="bars"><label>成長 <meter min="0" max="100" value="${pl.growth}"></meter><em>${Math.round(pl.growth)}%</em></label><label>健康 <meter min="0" max="100" value="${pl.health}"></meter><em>${Math.round(pl.health)}%</em></label><label>水分 <meter min="0" max="100" value="${pl.waterPct}"></meter><em>${Math.round(pl.waterPct)}%</em></label><label>肥料 <meter min="0" max="100" value="${pl.fertility}"></meter><em>${Math.round(pl.fertility)}%</em></label></div><div class="gp-footer-actions"><span class="muted">練習目安 ${pl.optimalUnit[0]}〜${pl.optimalUnit[1]} = HUD ${pl.optimalPct[0]}〜${pl.optimalPct[1]}%</span></div></div>`;}).join('');
    $('#gpLog',p).innerHTML=(session.notes||[]).slice(0,22).map(n=>`<div>${n}</div>`).join('')||'<div>ログはまだありません。</div>';
    document.body.classList.add('growth-plant-locked');updateButtons();updateCursorClass();
  }

  function cycleHudSize(){
    const order=['compact','normal','wide'];
    const i=order.indexOf(hudSize);
    hudSize=order[(i+1)%order.length];
    document.body.classList.remove('g-size-compact','g-size-wide');
    if(hudSize==='compact')document.body.classList.add('g-size-compact');
    if(hudSize==='wide')document.body.classList.add('g-size-wide');
    render();
  }
  function updateButtons(){['gPause','gpPause','gPlay','gpPlay','gFast','gpFast'].forEach(id=>$('#'+id)?.classList.remove('active'));if(!session?.running){$('#gPause')?.classList.add('active');$('#gpPause')?.classList.add('active');}else if(session.speed>=8){$('#gFast')?.classList.add('active');$('#gpFast')?.classList.add('active');}else{$('#gPlay')?.classList.add('active');$('#gpPlay')?.classList.add('active');}document.querySelectorAll('[data-gtool]').forEach(b=>b.classList.toggle('tool-active',session?.activeTool===b.dataset.gtool));$('#gToolBtn')?.classList.toggle('tool-active',!!session?.activeTool&&session.activeTool!=='none');}
  function updateCursorClass(){document.body.classList.remove('growth-tool-fertilizer','growth-tool-pesticide','growth-tool-weed');if(session?.activeTool&&session.activeTool!=='none')document.body.classList.add('growth-tool-'+session.activeTool);}
  function applyToMain(){try{window.FarmBotAppBridge?.applyGrowthSession?.(session);window.FarmBotAppBridge?.setPlantLock?.(true);}catch(e){console.warn('growth apply failed',e);}}
  function advanceDay(){
    if(!session)return;const d=Math.floor(session.day);const w=weatherAt(d);
    if(rnd(d,30)<0.10&&session.plants.length){const p=session.plants[Math.floor(rnd(d,31)*session.plants.length)];if(p&&!p.bugs){p.bugs=true;log(`${p.name}に虫がつきました。殺虫剤で対処できます。`);}}
    if(rnd(d,40)<0.08&&session.weeds.length<6){session.weeds.push({id:'weed_'+d+'_'+Math.floor(rnd(d,42)*999),x:180+rnd(d,41)*1140,y:170+rnd(d,43)*420});log('畑に雑草が出ました。雑草駆除ツールで取り除けます。');}
    const weedPenalty=session.weeds.length*.045;
    session.plants.forEach(p=>{if(!p.alive)return;const evap=session.base.evap*(w.temp/22)*(1-w.humidity/190);p.waterPct=clamp(p.waterPct+w.rain*.45-evap*4.1,0,100);p.fertility=clamp(p.fertility-.42,0,100);const[lo,hi]=p.optimalPct;let hd=.34;if(p.waterPct<lo)hd-=(lo-p.waterPct)*.052;if(p.waterPct>hi)hd-=(p.waterPct-hi)*.058;if(p.fertility<28)hd-=.22;if(p.fertility>92)hd-=.08;if(p.bugs)hd-=.72;hd-=weedPenalty;if(w.temp>33)hd-=.24;if(w.temp<3)hd-=.18;p.health=clamp(p.health+hd,0,100);const[st]=waterStatus(p);const waterMul=st==='適正'?1:st.includes('やや')?.58:.18;const fertMul=p.fertility>=35&&p.fertility<=90?1:p.fertility<20?.35:.65;p.growth=clamp(p.growth+waterMul*fertMul*(p.health/100)*1.15,0,100);p.yieldScore=Math.round(p.growth*.55+p.health*.30+p.fertility*.15);if(p.health<=0){p.alive=false;log(`${p.name}が枯れました。`);}});
    applyToMain();autoSave();
  }
  function stepDay(){if(!session)return;session.day=clamp(Math.floor(session.day)+1,0,TOTAL_DAYS);advanceDay();render();}
  function play(speed=1){if(!session)return;session.running=true;session.speed=speed;if(timer)clearInterval(timer);lastTick=Date.now();timer=setInterval(()=>{if(!session?.running)return;const now=Date.now();const delta=now-lastTick;lastTick=now;const before=Math.floor(session.day);session.day=clamp(session.day+delta/DAY_MS*session.speed,0,TOTAL_DAYS);const after=Math.floor(session.day);if(after>before){for(let i=before;i<after;i++)advanceDay();}render();},1000);render();}
  function pause(){if(!session)return;session.running=false;session.speed=0;if(timer)clearInterval(timer);timer=null;render();autoSave();}
  function setTool(t){if(!session)return;session.activeTool=t||'none';log(`ツールを「${TOOL_LABEL[session.activeTool]||'なし'}」にしました。`);render();autoSave();}
  function applyWaterFromMain(x,y,radius,amount){if(!session)return;const near=session.plants.filter(p=>Math.hypot(p.x-x,p.y-y)<=radius).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];if(near){const addPct=amount/MAX_WATER_UNIT*100;near.waterPct=clamp(near.waterPct+addPct,0,100);log(`${near.name}へ練習画面のWaterを反映（+${Math.round(addPct)}%）。`);}else log('Waterを実行しましたが、育成植物の近くではありません。');applyToMain();render();autoSave();}
  function handleMapClick(pt){
    if(!session||!session.activeTool||session.activeTool==='none')return false;
    if(session.activeTool==='fertilizer'){const p=session.plants.find(pl=>dist(pl,pt)<70);if(p){p.fertility=clamp(p.fertility+24,0,100);p.health=clamp(p.health+2,0,100);log(`${p.name}に肥料を追加しました。`);render();autoSave();return true;}log('肥料は植物をクリックしてください。');render();return true;}
    if(session.activeTool==='pesticide'){const p=session.plants.find(pl=>pl.bugs&&dist(pl,pt)<78);if(p){p.bugs=false;p.health=clamp(p.health+8,0,100);log(`${p.name}の虫を取り除きました。`);render();autoSave();return true;}log('虫アイコンのある植物をクリックしてください。');render();return true;}
    if(session.activeTool==='weed'){const i=session.weeds.findIndex(w=>dist(w,pt)<80);if(i>=0){session.weeds.splice(i,1);session.plants.forEach(p=>p.health=clamp(p.health+1.5,0,100));log('雑草を取り除きました。');render();autoSave();return true;}log('雑草アイコンをクリックしてください。');render();return true;}
    return false;
  }
  function drawMapOverlay(ctx,size,env){
    if(!session||!env?.mapToPx)return;ctx.save();ctx.font='18px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    session.weeds.forEach(w=>{const p=env.mapToPx(w,size);ctx.fillStyle='rgba(20,90,30,.18)';ctx.beginPath();ctx.arc(p.x,p.y,14,0,Math.PI*2);ctx.fill();ctx.fillText('🌿',p.x,p.y);});
    session.plants.forEach(pl=>{const p=env.mapToPx(pl,size);if(pl.bugs){ctx.fillStyle='rgba(150,70,20,.18)';ctx.beginPath();ctx.arc(p.x,p.y-18,13,0,Math.PI*2);ctx.fill();ctx.fillText('🐛',p.x,p.y-18);}if(session.activeTool==='fertilizer'){ctx.fillStyle='rgba(122,91,37,.95)';ctx.fillText('＋肥',p.x,p.y+24);}});
    if(session.activeTool&&session.activeTool!=='none'){ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(10,10,160,28);ctx.fillStyle='white';ctx.font='13px sans-serif';ctx.textAlign='left';ctx.fillText(`ツール: ${TOOL_LABEL[session.activeTool]}`,18,24);}
    ctx.restore();
  }
  function startMusic(){
    if(audio?.running)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ctx=new AC();const master=ctx.createGain();master.gain.value=.045;master.connect(ctx.destination);const chords=[[261.63,329.63,392.00],[196.00,246.94,329.63],[220.00,261.63,349.23],[174.61,220.00,261.63]];let step=0;function pluck(freq,t,dur=.42){const o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.8,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+.05);}function loop(){if(!audio?.running)return;const now=ctx.currentTime+.05;const chord=chords[step%chords.length];for(let i=0;i<8;i++){pluck(chord[i%3]*(i%2?2:1),now+i*.25,.32);}step++;audio.timeout=setTimeout(loop,1900);}audio={ctx,running:true,timeout:null};loop();$('#gMusic')?.classList.add('active');}
  function stopMusic(){if(!audio)return;audio.running=false;if(audio.timeout)clearTimeout(audio.timeout);try{audio.ctx.close();}catch{}audio=null;$('#gMusic')?.classList.remove('active');}
  function toggleMusic(){if(audio?.running)stopMusic();else startMusic();}
  function open(kind){injectStyles();if(kind==='load'){if(!load())makeSession('spring_growth');}else makeSession(kind||'spring_growth');applyToMain();ensureHud();ensurePanel().classList.add('g-hidden');ensureAutoSave();render();}
  function close(){pause();stopMusic();document.body.classList.remove('growth-plant-locked','growth-tool-fertilizer','growth-tool-pesticide','growth-tool-weed');window.FarmBotAppBridge?.setPlantLock?.(false);$('#growthHudV2515')?.remove();$('#growthPanelV2515')?.remove();}

  window.addEventListener('farmbot:water-started',()=>{if(session)play(1);});
  window.addEventListener('farmbot:move-started',()=>{if(session&&!session.running)play(1);});
  window.addEventListener('farmbot:water-applied',ev=>{if(!session)return;const d=ev.detail||{};applyWaterFromMain(Number(d.x||0),Number(d.y||0),Math.max(120,Number(d.radius||120)),Math.max(2,Math.round(Number(d.amount||8)/2)));});
  window.FarmBotGrowthMode={open,openLoad:()=>open('load'),render,save:autoSave,load,close,getSession:()=>session,hasSave:()=>!!localStorage.getItem(SAVE_KEY),handleMapClick,drawMapOverlay,setTool};
})();
