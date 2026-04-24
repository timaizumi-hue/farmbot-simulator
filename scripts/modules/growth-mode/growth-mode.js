(() => {
  'use strict';

  const SAVE_KEY = 'farmbot_growth_mode_save_v5';
  const TOTAL_DAYS = 90;
  const REAL_MINUTES_FOR_SEASON = 60;
  const DAYS_PER_REAL_MINUTE = TOTAL_DAYS / REAL_MINUTES_FOR_SEASON;
  const TICK_MS = 1000;

  const SEASONS = {
    spring_growth: {
      label: '春野菜', startMonth: 3,
      base: { temp: 18, humidity: 62, rain: 0.22, evap: 0.70 },
      crops: [
        ['lettuce', 'レタス', 420, 520, [58, 76], 11, 0.90],
        ['spinach', 'ほうれん草', 790, 360, [52, 72], 10, 0.85],
        ['radish', 'ラディッシュ', 1130, 510, [48, 68], 9, 0.80],
        ['lettuce', 'レタス', 1320, 280, [58, 76], 11, 0.90]
      ]
    },
    summer_growth: {
      label: '夏野菜', startMonth: 6,
      base: { temp: 28, humidity: 67, rain: 0.28, evap: 1.05 },
      crops: [
        ['tomato', 'トマト', 420, 500, [46, 66], 16, 1.05],
        ['cucumber', 'きゅうり', 780, 330, [58, 78], 18, 1.10],
        ['basil', 'バジル', 1110, 520, [45, 65], 12, 0.85],
        ['tomato', 'トマト', 1340, 300, [46, 66], 16, 1.05]
      ]
    },
    winter_growth: {
      label: '冬野菜', startMonth: 11,
      base: { temp: 9, humidity: 58, rain: 0.16, evap: 0.42 },
      crops: [
        ['spinach', 'ほうれん草', 430, 520, [45, 62], 7, 0.75],
        ['lettuce', 'レタス', 790, 360, [50, 66], 8, 0.80],
        ['carrot', 'にんじん', 1130, 520, [42, 60], 6, 0.70],
        ['spinach', 'ほうれん草', 1340, 280, [45, 62], 7, 0.75]
      ]
    }
  };

  let session = null;
  let timer = null;
  let lastTick = 0;

  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const pad = (n) => String(n).padStart(2, '0');
  const rnd = (seed) => {
    const x = Math.sin(seed * 9283.221) * 10000;
    return x - Math.floor(x);
  };

  function stopTimer(){
    if(timer){ clearInterval(timer); timer = null; }
  }

  function makePlants(meta, seed){
    return meta.crops.map((c, i) => ({
      id: `${c[0]}_${i}_${seed}`,
      species: c[0],
      name: c[1],
      x: c[2],
      y: c[3],
      optimal: c[4],
      waterNeed: c[5],
      sensitivity: c[6],
      water: clamp(54 + i * 3, 0, 100),
      health: 84,
      growth: 2,
      yieldScore: 0,
      alive: true,
      plantedDay: 0
    }));
  }

  function newSession(kind){
    stopTimer();
    const meta = SEASONS[kind] || SEASONS.spring_growth;
    const seed = Math.floor(Date.now() % 1000000);
    session = {
      version: 5,
      kind,
      label: meta.label,
      startMonth: meta.startMonth,
      base: meta.base,
      seed,
      day: 0,
      running: false,
      speed: 0,
      lockedPlants: true,
      createdAt: new Date().toISOString(),
      lastSaved: null,
      plants: makePlants(meta, seed),
      schedules: [
        { id: 'default_water', name: '朝の定期水やり', enabled: true, every: 3, hour: 7, amount: 8, radius: 120, target: 'all', lastRun: -999 }
      ],
      notes: []
    };
    note(`${session.label}を新規開始しました。植物配置は開始時に固定され、途中変更できません。`);
    applyToApp();
    save();
  }

  function normalizeLoaded(obj){
    if(!obj || !Array.isArray(obj.plants)) return null;
    const meta = SEASONS[obj.kind] || SEASONS.spring_growth;
    obj.version = 5;
    obj.label = obj.label || meta.label;
    obj.startMonth = obj.startMonth || meta.startMonth;
    obj.base = obj.base || obj.weatherBase || meta.base;
    obj.lockedPlants = true;
    obj.day = clamp(Number(obj.day || 0), 0, TOTAL_DAYS);
    obj.speed = Number(obj.speed || 0);
    obj.running = false;
    obj.schedules = Array.isArray(obj.schedules) ? obj.schedules : [];
    obj.notes = Array.isArray(obj.notes) ? obj.notes : [];
    obj.plants = obj.plants.map((p, i) => ({
      id: p.id || `${p.species || 'plant'}_${i}_${Date.now()%100000}`,
      species: p.species || p.type || 'lettuce',
      name: p.name || p.species || '植物',
      x: Number(p.x || 500 + i * 180),
      y: Number(p.y || 400),
      optimal: p.optimal || [48, 68],
      waterNeed: Number(p.waterNeed || 8),
      sensitivity: Number(p.sensitivity || 0.9),
      water: clamp(Number(p.water ?? 55), 0, 100),
      health: clamp(Number(p.health ?? 80), 0, 100),
      growth: clamp(Number(p.growth ?? 0), 0, 100),
      yieldScore: clamp(Number(p.yieldScore ?? 0), 0, 100),
      alive: p.alive !== false,
      plantedDay: Number(p.plantedDay || 0)
    }));
    return obj;
  }

  function load(){
    try{
      const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('farmbot_growth_mode_save_v4');
      if(!raw) return false;
      const obj = normalizeLoaded(JSON.parse(raw));
      if(!obj) return false;
      stopTimer();
      session = obj;
      note('保存データを読み込みました。');
      applyToApp();
      save();
      return true;
    }catch(err){
      console.warn('growth load failed', err);
      return false;
    }
  }

  function save(){
    if(!session) return;
    session.lastSaved = new Date().toISOString();
    localStorage.setItem(SAVE_KEY, JSON.stringify(session));
  }

  function note(text){
    if(!session) return;
    session.notes.unshift(`${formatDay(session.day)} ${text}`);
    session.notes = session.notes.slice(0, 32);
  }

  function stage(day){
    if(day < 18) return '苗';
    if(day < 50) return '成長';
    if(day < 75) return '開花/肥大';
    return '収穫前';
  }

  function formatDay(day){
    if(!session) return '-';
    const md = [31,28,31,30,31,30,31,31,30,31,30,31];
    let month = session.startMonth;
    let d = Math.floor(day) + 1;
    while(d > md[(month - 1) % 12]){
      d -= md[(month - 1) % 12];
      month = (month % 12) + 1;
    }
    const week = ['月','火','水','木','金','土','日'][Math.floor(day) % 7];
    return `${month}/${pad(d)}（${week}）`;
  }

  function weather(day){
    if(!session) return { type:'-', temp:0, humidity:0, rain:0 };
    const b = session.base;
    const rain = rnd(day + session.seed * .01) < b.rain;
    const cloud = !rain && rnd(day * 2.31 + session.seed * .02) < 0.32;
    const type = rain ? '雨' : cloud ? 'くもり' : '晴れ';
    const temp = Math.round(b.temp + Math.sin(day / 8) * 2.6 + (rnd(day + 3.7) - .5) * 3 - (rain ? 1.2 : 0));
    const humidity = Math.round(clamp(b.humidity + (rain ? 16 : cloud ? 6 : -5) + (rnd(day + 8.8) - .5) * 8, 38, 86));
    const rainAmount = rain ? Math.round(3 + rnd(day + 5.5) * 8) : 0;
    return { type, temp, humidity, rain: rainAmount };
  }

  function waterStatus(p){
    const [lo, hi] = p.optimal;
    if(!p.alive) return ['枯れ', 'bad'];
    if(p.water < lo - 12) return ['乾燥', 'bad'];
    if(p.water < lo) return ['やや乾燥', 'warn'];
    if(p.water > hi + 12) return ['過湿', 'bad'];
    if(p.water > hi) return ['やや過湿', 'warn'];
    return ['適正', 'good'];
  }

  function advanceOneDay(){
    if(!session || session.day >= TOTAL_DAYS) return;
    const d = Math.floor(session.day);
    const w = weather(d);
    runSchedules(d, w);
    session.plants.forEach((p) => {
      if(!p.alive) return;
      const evap = session.base.evap * (w.temp / 22) * (1 - w.humidity / 190);
      p.water = clamp(p.water + w.rain * .45 - evap * 4.2, 0, 100);
      const [lo, hi] = p.optimal;
      let healthDelta = .34;
      if(p.water < lo) healthDelta -= (lo - p.water) * .052 * p.sensitivity;
      if(p.water > hi) healthDelta -= (p.water - hi) * .058 * p.sensitivity;
      if(w.temp > 33) healthDelta -= .30;
      if(w.temp < 3) healthDelta -= .22;
      p.health = clamp(p.health + healthDelta, 0, 100);
      const [st] = waterStatus(p);
      const growthMul = st === '適正' ? 1 : st.includes('やや') ? .58 : .18;
      p.growth = clamp(p.growth + growthMul * (p.health / 100) * 1.15, 0, 100);
      p.yieldScore = Math.round(p.growth * .65 + p.health * .35);
      if(p.health <= 0){ p.alive = false; note(`${p.name}が枯れました。`); }
    });
    session.day = clamp(session.day + 1, 0, TOTAL_DAYS);
    if(session.day >= TOTAL_DAYS){
      session.running = false;
      session.speed = 0;
      stopTimer();
      note('90日が終了しました。収穫結果を確認してください。');
    }
    applyToApp();
  }

  function stepDays(amount){
    if(!session) return;
    const whole = Math.max(1, Math.floor(amount));
    for(let i = 0; i < whole; i++) advanceOneDay();
    render();
    save();
  }

  function startTimer(speed){
    if(!session) return;
    session.running = true;
    session.speed = speed;
    stopTimer();
    lastTick = Date.now();
    timer = setInterval(() => {
      if(!session || !session.running){ stopTimer(); return; }
      const now = Date.now();
      const minutes = (now - lastTick) / 60000;
      lastTick = now;
      const days = minutes * DAYS_PER_REAL_MINUTE * (session.speed || 1);
      const before = Math.floor(session.day);
      session.day = clamp(session.day + days, 0, TOTAL_DAYS);
      const after = Math.floor(session.day);
      if(after > before){
        const count = after - before;
        session.day = before;
        for(let i=0;i<count;i++) advanceOneDay();
      }
      render();
      if(after % 3 === 0) save();
    }, TICK_MS);
    render();
  }

  function stopGrowth(){
    if(!session) return;
    session.running = false;
    session.speed = 0;
    stopTimer();
    render();
    save();
  }

  function waterPlants(target, amount = 8, radius = 120, log = true){
    if(!session) return;
    const plants = target === 'all' ? session.plants : session.plants.filter(p => p.id === target);
    plants.forEach((p) => {
      if(!p.alive) return;
      p.water = clamp(p.water + amount * .9, 0, 100);
    });
    if(log) note(`${target === 'all' ? '全体' : plantName(target)}へ${amount}ml相当の水やり。`);
    applyToApp();
    render();
    save();
  }

  function runSchedules(day){
    if(!session) return;
    (session.schedules || []).forEach((s) => {
      if(!s.enabled) return;
      if(day <= 0) return;
      if(day - s.lastRun < s.every) return;
      if(day % s.every !== 0) return;
      s.lastRun = day;
      waterPlants(s.target, s.amount, s.radius, false);
      note(`予約「${s.name}」を実行しました。`);
    });
  }

  function plantName(id){
    const p = session?.plants?.find(x => x.id === id);
    return p ? p.name : '対象';
  }

  function nextScheduleText(){
    if(!session || !(session.schedules || []).some(s => s.enabled)) return '予約なし';
    const today = Math.floor(session.day);
    let best = null;
    (session.schedules || []).filter(s => s.enabled).forEach((s) => {
      for(let d = today; d <= TOTAL_DAYS; d++){
        if(d - s.lastRun >= s.every && d > today && d % s.every === 0){
          const text = `${formatDay(d)} / ${s.target === 'all' ? '全体' : plantName(s.target)} ${s.amount}ml`;
          if(!best || d < best.day) best = { day: d, text };
          break;
        }
      }
    });
    return best ? best.text : '予約なし';
  }

  function remainText(){
    if(!session) return '-';
    const left = Math.max(0, TOTAL_DAYS - session.day);
    if(!session.running) return `停止中 / 残り${Math.ceil(left)}日`;
    const minutes = left / (DAYS_PER_REAL_MINUTE * (session.speed || 1));
    return minutes >= 60 ? `残り約${(minutes/60).toFixed(1)}時間` : `残り約${Math.ceil(minutes)}分`;
  }

  function applyToApp(){
    if(!session) return;
    if(window.FarmBotAppBridge){
      window.FarmBotAppBridge.ensureFreeMode?.();
      window.FarmBotAppBridge.applyGrowthSession?.(session);
    }
  }

  function ensureDock(){
    let d = qs('#growthTimeDock');
    if(d) return d;
    d = document.createElement('div');
    d.id = 'growthTimeDock';
    d.className = 'growthTimeDock hidden';
    d.innerHTML = `
      <div class="growthTimeMain">
        <span class="growthTimeBadge">育成B</span>
        <strong id="dockSeason">-</strong>
        <strong id="dockDate">-</strong>
        <span id="dockProgress">-</span>
        <span id="dockWeather">-</span>
        <span id="dockNext">次予約: -</span>
      </div>
      <div class="growthTimeActions">
        <button class="btn small" id="dockStop" type="button">停止</button>
        <button class="btn small primary" id="dockPlay" type="button">進む</button>
        <button class="btn small" id="dockFast" type="button">早送り</button>
        <button class="btn small" id="dockStep" type="button">1日</button>
        <button class="btn small" id="dockOpen" type="button">詳細</button>
      </div>`;
    document.body.appendChild(d);
    qs('#dockStop', d).onclick = stopGrowth;
    qs('#dockPlay', d).onclick = () => startTimer(1);
    qs('#dockFast', d).onclick = () => startTimer(session && session.speed >= 8 ? 3 : 8);
    qs('#dockStep', d).onclick = () => stepDays(1);
    qs('#dockOpen', d).onclick = () => { const o = ensureOverlay(); o.classList.remove('hidden'); render(); };
    return d;
  }

  function ensureOverlay(){
    let el = qs('#growthOverlay');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'growthOverlay';
    el.className = 'growthOverlay hidden';
    el.innerHTML = `
      <div class="growthShell" role="dialog" aria-label="育成モード詳細">
        <div class="growthTopbar">
          <div>
            <span class="cassetteKicker">練習モードB / 育成ゲーム</span>
            <h2 id="growthTitle">育成モード</h2>
            <p class="growthSub">元のMove・Water・Sequenceを使いながら、時間・天気・成長を管理します。植物は開始時に固定されます。</p>
          </div>
          <div class="growthTopActions">
            <button class="btn small" id="growthSaveBtn" type="button">保存</button>
            <button class="btn small" id="growthCloseBtn" type="button">詳細を閉じる</button>
          </div>
        </div>
        <div class="growthContent">
          <section class="growthPanel growthCalendar">
            <div class="growthStat"><span>季節</span><strong id="growthSeason">-</strong></div>
            <div class="growthStat"><span>日付</span><strong id="growthDate">-</strong></div>
            <div class="growthStat"><span>経過</span><strong id="growthProgress">-</strong></div>
            <div class="growthStat"><span>速度</span><strong id="growthSpeed">停止中</strong></div>
            <div class="growthStat"><span>天気</span><strong id="growthWeatherNow">-</strong></div>
            <div class="growthControls">
              <button class="btn" id="growthStopBtn" type="button">停止</button>
              <button class="btn primary" id="growthPlayBtn" type="button">進む</button>
              <button class="btn" id="growthFastBtn" type="button">早送り</button>
              <button class="btn" id="growthStepBtn" type="button">1日進める</button>
            </div>
            <div class="growthSaveState" id="growthSaveState">未保存</div>
            <h3>7日天気予報</h3>
            <div class="growthForecast" id="growthForecast"></div>
          </section>
          <section class="growthPanel growthPlants">
            <h3>固定された植物配置</h3>
            <div class="growthMapMini" id="growthMapMini"></div>
            <div class="growthLockNote">植物は新規開始時だけ自動生成されます。このセッション中は追加・削除・種類変更できません。</div>
            <div id="growthPlantList" class="growthPlantList"></div>
          </section>
          <section class="growthPanel growthScheduler">
            <h3>予約シークエンス</h3>
            <div class="growthSchedulerForm">
              <label>対象<select id="growthScheduleTarget"><option value="all">全体</option></select></label>
              <label>間隔<select id="growthScheduleEvery"><option value="1">毎日</option><option value="2">2日ごと</option><option value="3" selected>3日ごと</option><option value="5">5日ごと</option></select></label>
              <label>水量<input id="growthScheduleAmount" type="number" value="8" min="2" max="30"></label>
              <button class="btn primary" id="growthAddScheduleBtn" type="button">予約追加</button>
            </div>
            <div id="growthScheduleList" class="growthScheduleList"></div>
            <h3>育成ログ</h3>
            <div id="growthLog" class="growthLog"></div>
          </section>
        </div>
      </div>`;
    document.body.appendChild(el);
    qs('#growthCloseBtn', el).onclick = () => el.classList.add('hidden');
    qs('#growthSaveBtn', el).onclick = () => { note('手動保存しました。'); save(); render(); };
    qs('#growthStopBtn', el).onclick = stopGrowth;
    qs('#growthPlayBtn', el).onclick = () => startTimer(1);
    qs('#growthFastBtn', el).onclick = () => startTimer(session && session.speed >= 8 ? 3 : 8);
    qs('#growthStepBtn', el).onclick = () => stepDays(1);
    qs('#growthAddScheduleBtn', el).onclick = () => {
      if(!session) return;
      const target = qs('#growthScheduleTarget', el).value;
      const every = Number(qs('#growthScheduleEvery', el).value || 3);
      const amount = Number(qs('#growthScheduleAmount', el).value || 8);
      session.schedules.push({
        id: `custom_${Date.now()}`,
        name: `${every}日ごとの水やり`,
        enabled: true, every, hour: 7, amount, radius: 120, target, lastRun: -999
      });
      note('予約シークエンスを追加しました。');
      render(); save();
    };
    return el;
  }

  function forecastHtml(){
    let html = '';
    for(let i=0;i<7;i++){
      const w = weather(Math.floor(session.day) + i);
      html += `<div class="growthWeatherDay"><strong>${i===0?'今日':`+${i}日`}</strong><span>${w.type}</span><em>${w.temp}℃ / ${w.humidity}%</em></div>`;
    }
    return html;
  }

  function miniMap(){
    const W = 420, H = 170, farmW = 1500, farmH = 700, pad = 18;
    const pts = session.plants.map((p) => {
      const x = pad + (p.x / farmW) * (W - pad * 2);
      const y = H - pad - (p.y / farmH) * (H - pad * 2);
      return `<g><circle class="${p.alive ? '' : 'dead'}" cx="${x}" cy="${y}" r="7"/><text x="${x + 10}" y="${y + 4}">${p.name}</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" aria-label="育成ミニマップ"><rect x="8" y="8" width="${W-16}" height="${H-16}" rx="10"/>${pts}</svg>`;
  }

  function render(){
    if(!session) return;
    const w = weather(Math.floor(session.day));
    const dock = ensureDock();
    dock.classList.remove('hidden');
    qs('#dockSeason', dock).textContent = session.label;
    qs('#dockDate', dock).textContent = formatDay(session.day);
    qs('#dockProgress', dock).textContent = `${Math.floor(session.day)}/${TOTAL_DAYS}日・${stage(session.day)}・${remainText()}`;
    qs('#dockWeather', dock).textContent = `${w.type} ${w.temp}℃ 湿度${w.humidity}%`;
    qs('#dockNext', dock).textContent = `次予約: ${nextScheduleText()}`;
    qs('#dockPlay', dock).textContent = session.running ? '進行中' : '進む';
    qs('#dockFast', dock).textContent = session.running && session.speed >= 8 ? '高速中' : '早送り';

    const el = ensureOverlay();
    qs('#growthTitle', el).textContent = `${session.label} 育成モード`;
    qs('#growthSeason', el).textContent = session.label;
    qs('#growthDate', el).textContent = formatDay(session.day);
    qs('#growthProgress', el).textContent = `${Math.floor(session.day)}/${TOTAL_DAYS}日 ${stage(session.day)}`;
    qs('#growthSpeed', el).textContent = session.running ? (session.speed >= 8 ? '早送り' : session.speed >= 3 ? '高速' : '進行中') : '停止中';
    qs('#growthWeatherNow', el).textContent = `${w.type} ${w.temp}℃ / 湿度${w.humidity}% / 雨${w.rain}mm`;
    qs('#growthForecast', el).innerHTML = forecastHtml();
    qs('#growthMapMini', el).innerHTML = miniMap();
    const target = qs('#growthScheduleTarget', el);
    if(target){
      const keep = target.value;
      target.innerHTML = '<option value="all">全体</option>' + session.plants.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      target.value = [...target.options].some(o => o.value === keep) ? keep : 'all';
    }
    qs('#growthPlantList', el).innerHTML = session.plants.map((p) => {
      const [st, cls] = waterStatus(p);
      return `<div class="growthPlantCard">
        <div class="growthPlantHead"><strong>${p.name}</strong><span class="${cls}">${p.alive ? st : '枯れ'}</span></div>
        <div class="growthBars">
          <label>成長 <meter min="0" max="100" value="${p.growth}"></meter><em>${Math.round(p.growth)}%</em></label>
          <label>健康 <meter min="0" max="100" value="${p.health}"></meter><em>${Math.round(p.health)}%</em></label>
          <label>水分 <meter min="0" max="100" value="${p.water}"></meter><em>${Math.round(p.water)}%</em></label>
        </div>
        <div class="growthPlantActions"><button class="btn small" data-grow-water="${p.id}" ${!p.alive?'disabled':''} type="button">HUD水やり</button><span>適正 ${p.optimal[0]}〜${p.optimal[1]}%</span></div>
      </div>`;
    }).join('');
    qsa('[data-grow-water]', el).forEach(b => b.onclick = () => waterPlants(b.dataset.growWater, 8, 120, true));
    qs('#growthScheduleList', el).innerHTML = (session.schedules || []).map((s) => `<div class="growthScheduleItem"><strong>${s.name}</strong><span>${s.target === 'all' ? '全体' : plantName(s.target)} / ${s.every}日ごと / ${s.amount}ml</span><button class="btn small" data-del-schedule="${s.id}" type="button">削除</button></div>`).join('');
    qsa('[data-del-schedule]', el).forEach(b => b.onclick = () => { session.schedules = session.schedules.filter(s => s.id !== b.dataset.delSchedule); render(); save(); });
    qs('#growthLog', el).innerHTML = (session.notes || []).map(n => `<div>${n}</div>`).join('');
    const saveEl = qs('#growthSaveState', el);
    if(saveEl) saveEl.textContent = session.lastSaved ? `保存済み ${new Date(session.lastSaved).toLocaleString()}` : '未保存';
  }

  function open(kind = 'spring_growth'){
    if(kind === 'load_growth' || kind === 'load'){
      if(!load()) newSession('spring_growth');
    } else {
      newSession(SEASONS[kind] ? kind : 'spring_growth');
    }
    ensureDock().classList.remove('hidden');
    const overlay = ensureOverlay();
    overlay.classList.remove('hidden');
    render();
  }

  window.addEventListener('farmbot:water-applied', (ev) => {
    if(!session) return;
    const d = ev.detail || {};
    const radius = Math.max(140, Number(d.radius || 120));
    const nearest = session.plants.find(p => Math.hypot(p.x - Number(d.x || 0), p.y - Number(d.y || 0)) <= radius);
    if(nearest) waterPlants(nearest.id, Math.max(2, Math.round(Number(d.amount || 6) / 2)), radius, true);
    else note('本体WATERを実行しましたが、近くに育成植物がありませんでした。');
  });

  window.FarmBotGrowthMode = {
    open,
    openLoad: () => open('load'),
    hasSave: () => !!localStorage.getItem(SAVE_KEY) || !!localStorage.getItem('farmbot_growth_mode_save_v4'),
    save,
    load,
    render,
    getSession: () => session
  };
})();
