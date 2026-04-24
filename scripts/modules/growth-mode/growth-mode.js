(() => {
  'use strict';

  const VERSION = '25.12';
  const SAVE_KEY = 'farmbot_growth_session_v25_12';
  const TOTAL_DAYS = 90;
  const SEASON_REAL_MS = 60 * 60 * 1000; // 3か月を約1時間
  const DAY_MS = SEASON_REAL_MS / TOTAL_DAYS;

  const SEASONS = {
    spring_growth: {
      label: '春野菜', startMonth: 3,
      base: { temp: 18, humidity: 62, rain: 0.22, evap: 0.72 },
      crops: [
        {type:'lettuce', name:'レタス', x:420, y:520, optimal:[58,76], need:10},
        {type:'spinach', name:'ほうれん草', x:780, y:360, optimal:[52,72], need:9},
        {type:'radish', name:'ラディッシュ', x:1120, y:520, optimal:[48,68], need:8},
        {type:'lettuce', name:'レタス', x:1340, y:280, optimal:[58,76], need:10}
      ]
    },
    summer_growth: {
      label: '夏野菜', startMonth: 6,
      base: { temp: 28, humidity: 66, rain: 0.26, evap: 1.08 },
      crops: [
        {type:'tomato', name:'トマト', x:420, y:500, optimal:[46,66], need:15},
        {type:'cucumber', name:'きゅうり', x:780, y:330, optimal:[58,78], need:18},
        {type:'basil', name:'バジル', x:1120, y:520, optimal:[45,65], need:10},
        {type:'tomato', name:'トマト', x:1340, y:300, optimal:[46,66], need:15}
      ]
    },
    winter_growth: {
      label: '冬野菜', startMonth: 11,
      base: { temp: 9, humidity: 58, rain: 0.16, evap: 0.45 },
      crops: [
        {type:'spinach', name:'ほうれん草', x:430, y:520, optimal:[45,62], need:7},
        {type:'lettuce', name:'レタス', x:790, y:360, optimal:[50,66], need:8},
        {type:'carrot', name:'にんじん', x:1130, y:520, optimal:[42,60], need:6},
        {type:'spinach', name:'ほうれん草', x:1340, y:280, optimal:[45,62], need:7}
      ]
    }
  };

  let session = null;
  let timer = null;
  let lastTick = 0;

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const pad = n => String(n).padStart(2, '0');
  const dayInt = () => session ? Math.floor(session.day) : 0;
  function rnd(n){ const x = Math.sin(n * 999.321 + (session?.seed || 1)) * 10000; return x - Math.floor(x); }

  function injectStyles(){
    if($('#growthModeV2512Style')) return;
    const st = document.createElement('style');
    st.id = 'growthModeV2512Style';
    st.textContent = `
      #growthHudV2512{position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9800;width:min(1160px,calc(100vw - 18px));background:rgba(255,250,240,.98);border:2px solid #9bb68c;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.22);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#263027;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:8px 10px;box-sizing:border-box}
      #growthHudV2512 .g-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}.g-badge{background:#25452a;color:#fff;border-radius:999px;padding:4px 9px;font-size:12px;white-space:nowrap}.g-strong{font-weight:800;font-size:17px;white-space:nowrap}.g-chip{background:#eef5e8;border:1px solid #d3e1c8;border-radius:999px;padding:4px 8px;font-size:12px;white-space:nowrap}.g-actions{display:flex;gap:6px;align-items:center}.g-actions button,#growthPanelV2512 button{border:1px solid #c8d2bd;background:#fff;border-radius:9px;min-height:30px;padding:4px 9px;font-weight:700;cursor:pointer}.g-actions button.primary,#growthPanelV2512 button.primary{background:#2f6b36;color:#fff;border-color:#2f6b36}.g-actions button.warn{background:#fff3ca}.g-hidden{display:none!important}
      #growthPanelV2512{position:fixed;inset:62px 12px 12px 12px;z-index:9790;background:#f7f4ec;border:2px solid #d7ceb9;border-radius:16px;box-shadow:0 22px 60px rgba(0,0,0,.30);display:grid;grid-template-rows:auto 1fr;overflow:hidden;color:#263027;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}.gp-head{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#fffaf0;border-bottom:1px solid #ddd2bf;padding:10px 14px}.gp-head h2{margin:0;font-size:20px}.gp-head p{margin:2px 0 0;color:#60705f;font-size:12px}.gp-body{display:grid;grid-template-columns:270px 1fr 320px;gap:10px;padding:10px;min-height:0}.gp-card{background:#fff;border:1px solid #dfd7c9;border-radius:12px;padding:10px;overflow:auto;min-height:0}.gp-card h3{margin:2px 0 10px;font-size:15px}.gp-stat{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed #e4ddd1;padding:7px 0}.gp-stat span{color:#667064}.gp-stat strong{text-align:right}.forecast{display:grid;gap:6px}.forecast div{display:grid;grid-template-columns:44px 52px 1fr;gap:5px;align-items:center;border:1px solid #eee6d8;background:#fbfaf5;border-radius:9px;padding:6px;font-size:12px}.plant-list{display:grid;gap:8px}.plant-card{border:1px solid #e4ddd1;border-radius:12px;background:#fbfaf5;padding:9px}.plant-head{display:flex;justify-content:space-between;gap:8px}.plant-head strong{font-size:15px}.plant-head span{font-size:12px;border-radius:999px;padding:3px 8px}.good{background:#dff3df;color:#276b32}.warn{background:#fff0bd;color:#745600}.bad{background:#ffd7d0;color:#8b2c20}.bars{display:grid;gap:6px;margin-top:8px}.bars label{display:grid;grid-template-columns:42px 1fr 40px;gap:8px;align-items:center;font-size:12px}.bars meter{width:100%;height:12px}.mini-map{background:#e6dbc4;border:1px solid #a99475;border-radius:10px;overflow:hidden;margin-bottom:8px}.mini-map svg{display:block;width:100%;height:156px}.mini-map rect{fill:#e3d2b6;stroke:#9b8c70}.mini-map circle{fill:#5d9d51;stroke:#2e5e29;stroke-width:2}.mini-map text{font-size:12px;fill:#2f3e31}.sched-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sched-form label{font-size:12px;display:grid;gap:4px}.sched-form select,.sched-form input{min-height:34px;border:1px solid #d8d0bf;border-radius:8px;background:#fff;padding:4px 6px}.sched-list,.g-log{display:grid;gap:6px;margin-top:10px}.sched-item,.g-log div{border:1px solid #eee6d8;border-radius:9px;background:#fbfaf5;padding:7px;font-size:12px}.sched-item{display:grid;grid-template-columns:1fr auto;gap:5px;align-items:center}.sched-item button{grid-column:2;grid-row:1/3}.muted{color:#647164;font-size:12px}.lock-note{font-size:12px;background:#f1eadc;border:1px solid #e1d7c5;border-radius:9px;padding:7px;margin:8px 0}.gp-footer-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      @media(max-width:900px){#growthHudV2512{top:5px;width:calc(100vw - 10px);grid-template-columns:1fr;gap:5px;padding:5px 6px}.g-main{gap:5px!important}.g-strong{font-size:13px}.g-chip,.g-badge{font-size:10px;padding:3px 6px}.g-actions{overflow:auto}.g-actions button{min-height:28px;font-size:11px;padding:3px 6px}#growthPanelV2512{inset:50px 5px 5px 5px}.gp-head{padding:7px 8px}.gp-head h2{font-size:16px}.gp-head p{display:none}.gp-body{grid-template-columns:220px 1fr 245px;gap:6px;padding:6px}.gp-card{padding:7px}.sched-form{grid-template-columns:1fr}.mini-map svg{height:110px}}
    `;
    document.head.appendChild(st);
  }

  function stop(){ if(timer) clearInterval(timer); timer = null; if(session){ session.running = false; session.speed = 0; render(); save(); } }

  function makeSession(kind){
    const meta = SEASONS[kind] || SEASONS.spring_growth;
    const seed = Date.now() % 1000000;
    session = {
      version: VERSION,
      kind, label: meta.label, startMonth: meta.startMonth, base: meta.base, seed,
      day: 0, running: false, speed: 0, lockedPlants: true,
      createdAt: new Date().toISOString(), lastSaved: null,
      plants: meta.crops.map((c, i) => ({
        id: `${c.type}_${i}_${seed}`, species: c.type, type: c.type, name: c.name, x: c.x, y: c.y,
        optimal: c.optimal, waterNeed: c.need, water: clamp(55 + i*3,0,100), health: 86, growth: 2, yieldScore: 0, alive: true
      })),
      schedules: [{id:'default', name:'朝の定期水やり', enabled:true, every:3, amount:8, target:'all', lastRun:-999}],
      notes: []
    };
    log(`${session.label}を新規開始。植物は開始時に自動生成され、このセッションでは固定です。`);
    save();
  }

  function normalize(s){
    if(!s || !Array.isArray(s.plants)) return null;
    const meta = SEASONS[s.kind] || SEASONS.spring_growth;
    s.version = VERSION; s.label = s.label || meta.label; s.startMonth = s.startMonth || meta.startMonth; s.base = s.base || meta.base;
    s.day = clamp(Number(s.day||0),0,TOTAL_DAYS); s.running = false; s.speed = 0; s.lockedPlants = true;
    s.schedules = Array.isArray(s.schedules) ? s.schedules : []; s.notes = Array.isArray(s.notes) ? s.notes : [];
    s.plants = s.plants.map((p,i)=>({
      id:p.id||`plant_${i}_${Date.now()%100000}`, species:p.species||p.type||'lettuce', type:p.type||p.species||'lettuce', name:p.name||'植物', x:Number(p.x||500+i*180), y:Number(p.y||400),
      optimal:p.optimal||[48,68], waterNeed:Number(p.waterNeed||8), water:clamp(Number(p.water??55),0,100), health:clamp(Number(p.health??80),0,100), growth:clamp(Number(p.growth??0),0,100), yieldScore:clamp(Number(p.yieldScore??0),0,100), alive:p.alive!==false
    }));
    return s;
  }

  function load(){
    try{
      const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('farmbot_growth_mode_save_v5') || localStorage.getItem('farmbot_growth_mode_save_v4');
      const s = normalize(JSON.parse(raw||'null'));
      if(!s) return false;
      session = s; log('保存データを読み込みました。'); save(); return true;
    }catch(e){ console.warn('growth load failed', e); return false; }
  }

  function save(){ if(!session) return; session.lastSaved = new Date().toISOString(); localStorage.setItem(SAVE_KEY, JSON.stringify(session)); }
  function log(t){ if(!session) return; session.notes.unshift(`${dateText(session.day)} ${t}`); session.notes = session.notes.slice(0,40); }

  function dateText(day){
    if(!session) return '-'; const md=[31,28,31,30,31,30,31,31,30,31,30,31]; let m=session.startMonth; let d=Math.floor(day)+1;
    while(d > md[(m-1)%12]){ d -= md[(m-1)%12]; m = (m%12)+1; }
    const w=['月','火','水','木','金','土','日'][Math.floor(day)%7]; return `${m}/${pad(d)}（${w}）`;
  }
  function stage(day){ if(day<18) return '苗'; if(day<50) return '成長'; if(day<75) return '開花/肥大'; return '収穫前'; }
  function weather(d){
    if(!session) return {type:'-',temp:0,humidity:0,rain:0}; const b=session.base;
    const isRain = rnd(d+3.14) < b.rain; const cloudy = !isRain && rnd(d+8.8) < .32;
    const type = isRain ? '雨' : cloudy ? 'くもり' : '晴れ';
    return {type, temp:Math.round(b.temp + Math.sin(d/8)*2.4 + (rnd(d+1)-.5)*3 - (isRain?1:0)), humidity:Math.round(clamp(b.humidity + (isRain?15:cloudy?6:-4) + (rnd(d+2)-.5)*8,38,86)), rain:isRain?Math.round(3+rnd(d+4)*8):0};
  }
  function waterStatus(p){ const [lo,hi]=p.optimal; if(!p.alive) return ['枯れ','bad']; if(p.water<lo-12) return ['乾燥','bad']; if(p.water<lo) return ['やや乾燥','warn']; if(p.water>hi+12) return ['過湿','bad']; if(p.water>hi) return ['やや過湿','warn']; return ['適正','good']; }

  function advanceDay(){
    if(!session || session.day>=TOTAL_DAYS) return; const d=Math.floor(session.day); const w=weather(d); runSchedules(d);
    session.plants.forEach(p=>{ if(!p.alive) return; const evap=session.base.evap*(w.temp/22)*(1-w.humidity/190); p.water=clamp(p.water+w.rain*.45-evap*4.1,0,100); const [lo,hi]=p.optimal; let hd=.34; if(p.water<lo) hd-=(lo-p.water)*.052; if(p.water>hi) hd-=(p.water-hi)*.058; if(w.temp>33) hd-=.28; if(w.temp<3) hd-=.20; p.health=clamp(p.health+hd,0,100); const [st]=waterStatus(p); const gm=st==='適正'?1:st.includes('やや')?.58:.18; p.growth=clamp(p.growth+gm*(p.health/100)*1.15,0,100); p.yieldScore=Math.round(p.growth*.65+p.health*.35); if(p.health<=0){p.alive=false; log(`${p.name}が枯れました。`);} });
    session.day=clamp(Math.floor(session.day)+1,0,TOTAL_DAYS); if(session.day>=TOTAL_DAYS){session.running=false;session.speed=0;clearInterval(timer);timer=null;log('90日が終了しました。収穫結果を確認してください。');}
    syncApp(); save();
  }
  function stepDay(){ if(!session) return; advanceDay(); render(); }
  function play(speed=1){ if(!session) return; session.running=true; session.speed=speed; if(timer) clearInterval(timer); lastTick=Date.now(); timer=setInterval(()=>{ if(!session?.running) return; const now=Date.now(); const delta=now-lastTick; lastTick=now; const days = delta / DAY_MS * session.speed; const before=Math.floor(session.day); session.day=clamp(session.day+days,0,TOTAL_DAYS); const after=Math.floor(session.day); if(after>before){ session.day=before; for(let i=before;i<after;i++) advanceDay(); } render(); }, 1000); render(); }
  function pause(){ if(!session) return; session.running=false; session.speed=0; if(timer) clearInterval(timer); timer=null; render(); save(); }

  function water(target='all', amount=8){ if(!session) return; const plants=target==='all'?session.plants:session.plants.filter(p=>p.id===target); plants.forEach(p=>{ if(p.alive) p.water=clamp(p.water+amount*.9,0,100); }); log(`${target==='all'?'全体':plantName(target)}へ${amount}ml相当の水やり。`); syncApp(); render(); save(); }
  function runSchedules(day){ (session.schedules||[]).forEach(s=>{ if(!s.enabled || day<=0) return; if(day-s.lastRun<s.every || day%s.every!==0) return; s.lastRun=day; water(s.target,s.amount); log(`予約「${s.name}」を実行。`); }); }
  function plantName(id){ const p=session?.plants?.find(x=>x.id===id); return p?p.name:'対象'; }
  function nextSchedule(){ if(!session) return '-'; const today=Math.floor(session.day); let best=null; (session.schedules||[]).filter(s=>s.enabled).forEach(s=>{ for(let d=today+1;d<=TOTAL_DAYS;d++){ if(d-s.lastRun>=s.every && d%s.every===0){ if(!best||d<best.d) best={d,text:`${dateText(d)} / ${s.target==='all'?'全体':plantName(s.target)} ${s.amount}ml`}; break;} } }); return best?best.text:'予約なし'; }

  function ensureFreeMode(){ try{ window.FarmBotAppBridge?.ensureFreeMode?.(); }catch{} }
  function syncApp(){ try{ ensureFreeMode(); window.FarmBotAppBridge?.applyGrowthSession?.(session); }catch(e){ console.warn('growth sync failed', e); } }

  function ensureHud(){
    injectStyles(); let h=$('#growthHudV2512'); if(h) return h;
    h=document.createElement('div'); h.id='growthHudV2512'; h.innerHTML=`<div class="g-main"><span class="g-badge">育成B</span><strong class="g-strong" id="gSeason">-</strong><strong class="g-strong" id="gDate">-</strong><span class="g-chip" id="gDay">-</span><span class="g-chip" id="gWeather">-</span><span class="g-chip" id="gNext">次予約: -</span></div><div class="g-actions"><button id="gPause">停止</button><button class="primary" id="gPlay">進む</button><button id="gFast">早送り</button><button id="gStep">1日</button><button id="gDetail">詳細</button><button class="warn" id="gSave">保存</button></div>`;
    document.body.appendChild(h); $('#gPause',h).onclick=pause; $('#gPlay',h).onclick=()=>play(1); $('#gFast',h).onclick=()=>play(session?.speed>=8?3:8); $('#gStep',h).onclick=stepDay; $('#gDetail',h).onclick=()=>{ensurePanel().classList.remove('g-hidden');render();}; $('#gSave',h).onclick=()=>{log('手動保存しました。');save();render();}; return h;
  }

  function ensurePanel(){
    injectStyles(); let p=$('#growthPanelV2512'); if(p) return p;
    p=document.createElement('div'); p.id='growthPanelV2512'; p.innerHTML=`<div class="gp-head"><div><h2 id="gpTitle">育成モード</h2><p>元のMove・Water・Sequenceを使いながら、時間・天気・成長を管理します。植物は開始時に固定です。</p></div><div class="g-actions"><button id="gpMin">閉じる</button></div></div><div class="gp-body"><section class="gp-card"><h3>時間と天気</h3><div id="gpStats"></div><div class="gp-footer-actions"><button id="gpPause">停止</button><button class="primary" id="gpPlay">進む</button><button id="gpFast">早送り</button><button id="gpStep">1日進める</button></div><h3>7日天気予報</h3><div class="forecast" id="gpForecast"></div></section><section class="gp-card"><h3>固定された植物配置</h3><div class="mini-map" id="gpMini"></div><div class="lock-note">植物は新規開始時のみ自動生成されます。途中で追加・削除・種類変更はできません。</div><div class="plant-list" id="gpPlants"></div></section><section class="gp-card"><h3>予約シークエンス</h3><div class="sched-form"><label>対象<select id="gpTarget"></select></label><label>間隔<select id="gpEvery"><option value="1">毎日</option><option value="2">2日ごと</option><option value="3" selected>3日ごと</option><option value="5">5日ごと</option></select></label><label>水量<input id="gpAmount" type="number" value="8" min="2" max="30"></label><button class="primary" id="gpAdd">予約追加</button></div><div class="sched-list" id="gpSchedules"></div><h3>育成ログ</h3><div class="g-log" id="gpLog"></div></section></div>`;
    document.body.appendChild(p); $('#gpMin',p).onclick=()=>p.classList.add('g-hidden'); $('#gpPause',p).onclick=pause; $('#gpPlay',p).onclick=()=>play(1); $('#gpFast',p).onclick=()=>play(session?.speed>=8?3:8); $('#gpStep',p).onclick=stepDay; $('#gpAdd',p).onclick=()=>{ if(!session)return; const target=$('#gpTarget').value; const every=Number($('#gpEvery').value||3); const amount=Number($('#gpAmount').value||8); session.schedules.push({id:'custom_'+Date.now(),name:`${every}日ごとの水やり`,enabled:true,every,amount,target,lastRun:-999}); log('予約シークエンスを追加しました。'); render(); save();}; return p;
  }

  function miniMapHtml(){ const W=420,H=170,pad=18,fW=1500,fH=700; const pts=session.plants.map(p=>{const x=pad+(p.x/fW)*(W-pad*2); const y=H-pad-(p.y/fH)*(H-pad*2); return `<g><circle cx="${x}" cy="${y}" r="7"/><text x="${x+10}" y="${y+4}">${p.name}</text></g>`}).join(''); return `<svg viewBox="0 0 ${W} ${H}"><rect x="8" y="8" width="${W-16}" height="${H-16}" rx="10"/>${pts}</svg>`; }
  function render(){
    if(!session) return; injectStyles(); const w=weather(dayInt()); const h=ensureHud(); h.classList.remove('g-hidden');
    $('#gSeason',h).textContent=session.label; $('#gDate',h).textContent=dateText(session.day); $('#gDay',h).textContent=`${Math.floor(session.day)}/${TOTAL_DAYS}日・${stage(session.day)}・${session.running?(session.speed>=8?'早送り':'進行中'):'停止中'}`; $('#gWeather',h).textContent=`${w.type} ${w.temp}℃ 湿度${w.humidity}%`; $('#gNext',h).textContent=`次予約: ${nextSchedule()}`;
    const p=ensurePanel(); $('#gpTitle',p).textContent=`${session.label} 育成モード`; $('#gpStats',p).innerHTML=`<div class="gp-stat"><span>季節</span><strong>${session.label}</strong></div><div class="gp-stat"><span>日付</span><strong>${dateText(session.day)}</strong></div><div class="gp-stat"><span>経過</span><strong>${Math.floor(session.day)}/${TOTAL_DAYS}日 ${stage(session.day)}</strong></div><div class="gp-stat"><span>速度</span><strong>${session.running?(session.speed>=8?'早送り':'進行中'):'停止中'}</strong></div><div class="gp-stat"><span>天気</span><strong>${w.type} ${w.temp}℃ / 湿度${w.humidity}% / 雨${w.rain}mm</strong></div><div class="gp-stat"><span>保存</span><strong>${session.lastSaved?new Date(session.lastSaved).toLocaleString():'未保存'}</strong></div>`;
    let f=''; for(let i=0;i<7;i++){const ww=weather(dayInt()+i); f+=`<div><strong>${i===0?'今日':'+'+i+'日'}</strong><span>${ww.type}</span><em>${ww.temp}℃ / ${ww.humidity}%</em></div>`;} $('#gpForecast',p).innerHTML=f; $('#gpMini',p).innerHTML=miniMapHtml();
    const target=$('#gpTarget',p); const keep=target.value; target.innerHTML='<option value="all">全体</option>'+session.plants.map(pl=>`<option value="${pl.id}">${pl.name}</option>`).join(''); target.value=[...target.options].some(o=>o.value===keep)?keep:'all';
    $('#gpPlants',p).innerHTML=session.plants.map(pl=>{const [st,cls]=waterStatus(pl); return `<div class="plant-card"><div class="plant-head"><strong>${pl.name}</strong><span class="${cls}">${st}</span></div><div class="bars"><label>成長 <meter min="0" max="100" value="${pl.growth}"></meter><em>${Math.round(pl.growth)}%</em></label><label>健康 <meter min="0" max="100" value="${pl.health}"></meter><em>${Math.round(pl.health)}%</em></label><label>水分 <meter min="0" max="100" value="${pl.water}"></meter><em>${Math.round(pl.water)}%</em></label></div><div class="gp-footer-actions"><button data-water="${pl.id}">HUD水やり</button><span class="muted">適正 ${pl.optimal[0]}〜${pl.optimal[1]}%</span></div></div>`;}).join('');
    $$('[data-water]',p).forEach(b=>b.onclick=()=>water(b.dataset.water,8));
    $('#gpSchedules',p).innerHTML=(session.schedules||[]).map(s=>`<div class="sched-item"><strong>${s.name}</strong><span>${s.target==='all'?'全体':plantName(s.target)} / ${s.every}日ごと / ${s.amount}ml</span><button data-del="${s.id}">削除</button></div>`).join(''); $$('[data-del]',p).forEach(b=>b.onclick=()=>{session.schedules=session.schedules.filter(s=>s.id!==b.dataset.del);render();save();});
    $('#gpLog',p).innerHTML=(session.notes||[]).map(n=>`<div>${n}</div>`).join('');
  }

  function open(kind='spring_growth'){
    pause(); ensureFreeMode();
    if(kind==='load' || kind==='load_growth'){ if(!load()) makeSession('spring_growth'); }
    else makeSession(SEASONS[kind]?kind:'spring_growth');
    syncApp(); ensureHud(); ensurePanel().classList.remove('g-hidden'); render();
  }

  window.addEventListener('farmbot:water-applied', ev=>{ if(!session) return; const d=ev.detail||{}; const x=Number(d.x||0), y=Number(d.y||0), r=Math.max(120,Number(d.radius||120)); const near=session.plants.filter(p=>Math.hypot(p.x-x,p.y-y)<=r).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]; if(near) water(near.id, Math.max(2, Math.round(Number(d.amount||8)/2))); else {log('本体Waterを実行しましたが、育成植物の近くではありません。'); render(); save();} });

  window.FarmBotGrowthMode = { open, openLoad:()=>open('load'), render, save, load, getSession:()=>session, hasSave:()=>!!localStorage.getItem(SAVE_KEY) };
})();
