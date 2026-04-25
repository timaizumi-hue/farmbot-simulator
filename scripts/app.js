
(() => {
  const {garden,$,$$,clamp,lerp,dist,now,icons,plantLabels,stageLabels,stageHeightScale,stageEmoji,heights,plantColors,targetWater,rootRadiusByStage,canopyReachByStage,speciesCanopyFactor,climateProfiles,deepClone,defaults,keyFor} = window.FarmBotSimConfig;
  const tutorialCatalog = window.FarmBotTutorialCatalog;
  const canvasUtils = window.FarmBotCanvasUtils;
  let state = defaults();
  let running = null;
  let tutorial = {active:false, step:0, stepDone:false, lessonId:null};

  function lessonEvent(type, detail={}){
    try{ window.dispatchEvent(new CustomEvent('farmbot:lesson-event', {detail:{type, ...detail}})); }catch{}
  }

  let lastMapClickPx = {x:30,y:30};
  let mapInfoHideTimer = null;
  const __canvasSizeCache = new WeakMap();
  let __renderQueued = false;
  let __lastIdleRenderAt = 0;
  let waterInterval = null;
  let waterElapsedTimer = null;

  function safeLoad(mode){
    try{ const raw = localStorage.getItem(keyFor(mode)); if(!raw) return null; return {...defaults(), ...JSON.parse(raw), mode}; }
    catch{ return null; }
  }
  function saveState(mark='自動保存'){
    try{
      state.saveStamp = `${mark} ${now()}`;
      localStorage.setItem(keyFor(state.mode), JSON.stringify(state));
      $('#saveChip').textContent = state.saveStamp;
    }catch{}
  }
  function log(msg){ state.logs.unshift(`[${now()}] ${msg}`); state.logs = state.logs.slice(0,300); renderLog(); }
  function modeLabel(){
    const m={free:'フリーモード',tutorial:'チュートリアル',practice_quick:'練習モードA',practice_goal:'練習モードB'};
    return m[state.mode]||'モード';
  }
  function updateMission(){
    const box=$('#missionBox');
    const title = state.mission?.title || '目標なし';
    const detail = state.mission?.detail || '自由操作';
    const done = !!state.mission?.done;
    box.innerHTML = `<div style="font-weight:700;margin-bottom:6px">${title} ${done?'<span class="badge">達成</span>':''}</div><div>${detail}</div>`;
  }
  function waterRangeText(type, stage){
    const range = targetWater[type]?.[stage] || [0,0];
    return `${plantLabels[type]} / ${stageLabels[stage]} : 目安 ${range[0]}〜${range[1]}（やや不足/多めも判定）`;
  }
  function basePlantHeight(type){ return heights[type] || 50; }
  function effectivePlantHeight(type, stage){ return Math.round(basePlantHeight(type) * (stageHeightScale[stage] || 1)); }
  function getPlantTargetRange(plant){ return targetWater[plant.type]?.[plant.stage || 'growing'] || [0,0]; }
  function plantRootRadius(plant){
    const base = rootRadiusByStage[plant.stage || 'growing'] || 170;
    const speciesAdjust = {lettuce:1.1,basil:0.95,spinach:1.0,tomato:1.15,cucumber:1.1,carrot:0.9,radish:0.88}[plant.type] || 1;
    return base * speciesAdjust;
  }
  function canopyPassThroughAt(x,y){
    let pass = 1;
    for(const plant of state.plants||[]){
      const reach = (canopyReachByStage[plant.stage || 'growing'] || 110) * ((speciesCanopyFactor[plant.type] || 0.85) > 0 ? 1 : 1);
      const d = Math.hypot(plant.x - x, plant.y - y);
      if(d > reach) continue;
      const stageFactor = {seedling:0.92,growing:0.72,fruiting:0.52}[plant.stage || 'growing'] || 0.72;
      const speciesFactor = speciesCanopyFactor[plant.type] || 0.85;
      const t = 1 - d / Math.max(1, reach);
      const localPass = 1 - (1 - stageFactor * speciesFactor) * (0.35 + 0.65 * t);
      pass *= localPass;
    }
    return clamp(pass, 0.18, 1);
  }

  function leafDensityScore(plant){
    const stageFactor = {seedling:0.42,growing:0.78,fruiting:1}[plant.stage || 'growing'] || 0.78;
    const speciesFactor = {tomato:1.0,lettuce:0.72,carrot:0.64,radish:0.58,cucumber:0.92,basil:0.82,spinach:0.76}[plant.type] || 0.75;
    return clamp(stageFactor * speciesFactor, 0.25, 1);
  }
  function canopyRadius(plant){
    return (canopyReachByStage[plant.stage || 'growing'] || 110) * (speciesCanopyFactor[plant.type] || 0.85) * 1.02;
  }
  function plantLeafWetness(plant, idx){
    const key = String(idx);
    return clamp((state.leafWater && state.leafWater[key]) || 0, 0, 1.2);
  }
  function nearestPlantsUnderNozzle(x,y,maxCount=3){
    return (state.plants||[])
      .map((p,idx)=>({plant:p, idx, d:Math.hypot(p.x-x,p.y-y), reach:canopyRadius(p)}))
      .filter(v=>v.d <= v.reach * 1.15)
      .sort((a,b)=>a.d-b.d)
      .slice(0,maxCount);
  }
  function canopyInterceptionAt(x,y){
    const plants = nearestPlantsUnderNozzle(x,y,4);
    if(!plants.length) return {toLeaf:0,toSoil:1,top:null,drip:0,runoff:0};
    let leafCover = 0;
    for(const entry of plants){
      const density = leafDensityScore(entry.plant);
      const near = 1 - entry.d / Math.max(1, entry.reach);
      leafCover += density * Math.max(0, near) * 0.34;
    }
    leafCover = clamp(leafCover, 0, 0.56);
    const drip = clamp(0.18 + leafCover * 0.42, 0.18, 0.42); // 葉に当たっても一部は根元へ落ちる
    const runoff = clamp(leafCover * 0.18, 0.02, 0.12);
    const toLeaf = leafCover;
    const toSoil = clamp(1 - toLeaf + drip - runoff, 0.34, 0.92);
    return {toLeaf, toSoil, top:plants[0], drip, runoff};
  }
  function waterAtArea(center, radiusMm=170){
    const cx = center.x/garden.w*garden.cols;
    const cy = center.y/garden.h*garden.rows;
    const rad = Math.max(1.3, radiusMm / (garden.w/garden.cols));
    let total = 0, weight = 0;
    for(let y=Math.floor(cy-rad-1); y<=Math.ceil(cy+rad+1); y++){
      for(let x=Math.floor(cx-rad-1); x<=Math.ceil(cx+rad+1); x++){
        if(x<0||y<0||x>=garden.cols||y>=garden.rows) continue;
        const d=Math.hypot(x+0.5-cx,y+0.5-cy);
        if(d>rad) continue;
        const w=Math.max(0.14,1-d/Math.max(rad,0.001));
        total += (state.waterCells[`${x},${y}`]||0) * w;
        weight += w;
      }
    }
    return Math.round((total/Math.max(1,weight))*10)/10;
  }
  function getPlantWaterState(plant){
    const val=waterAtPlant(plant), [mi,ma]=getPlantTargetRange(plant);
    const soft = Math.max(0.8, (ma-mi)*0.55);
    if(val<mi-soft) return {key:'low', color:'rgba(190,75,73,.95)', text:'不足', value:val, target:[mi,ma]};
    if(val<mi) return {key:'near_low', color:'rgba(235,161,78,.95)', text:'やや不足', value:val, target:[mi,ma]};
    if(val>ma+soft) return {key:'high', color:'rgba(48,50,54,.95)', text:'過多', value:val, target:[mi,ma]};
    if(val>ma) return {key:'near_high', color:'rgba(84,94,104,.95)', text:'やや多い', value:val, target:[mi,ma]};
    return {key:'ok', color:'rgba(79,149,232,.95)', text:'適正', value:val, target:[mi,ma]};
  }
  function drawTopPlant(ctx,x,y,plant,scale=1){
    const leaf=plantColors[plant.type] || '#5da04d';
    const stateInfo=getPlantWaterState(plant);
    const density = leafDensityScore(plant);
    const wetLevel = plantLeafWetness(plant, (state.plants||[]).indexOf(plant));
    const stage = plant.stage || 'growing';
    const spread = (stage==='seedling' ? 15 : stage==='growing' ? 24 : 31) * (0.82 + density*0.34);
    const rings = stage==='seedling' ? 2 : stage==='growing' ? 4 : 5;
    const leafCount = stage==='seedling' ? 5 : stage==='growing' ? 10 : 15;
    ctx.save();
    ctx.translate(x,y);
    const shadowGrad = ctx.createRadialGradient(0,8*scale,4,0,8*scale,spread*1.15*scale);
    shadowGrad.addColorStop(0,'rgba(20,18,14,.18)');
    shadowGrad.addColorStop(1,'rgba(20,18,14,0)');
    ctx.fillStyle=shadowGrad;
    ctx.beginPath(); ctx.ellipse(0,8*scale,spread*1.02*scale,7.8*scale,0,0,Math.PI*2); ctx.fill();

    for(let ring=0; ring<rings; ring++){
      const localCount = Math.max(4, leafCount-ring*2);
      const ringSpread = spread*(0.36 + ring*0.18);
      const ringLift = -1.5*ring*scale;
      for(let i=0;i<localCount;i++){
        const a=((Math.PI*2)/localCount)*i + ring*0.28 + ((i%2)?0.12:-0.09);
        const len=(stage==='seedling'?10:14) + ring*3.1 + (i%3)*1.2 + density*1.4;
        const wid=(stage==='seedling'?4.6:6.0) + ring*0.8 + (i%2)*0.5;
        ctx.save();
        ctx.rotate(a);
        ctx.translate(ringSpread*scale, ringLift);
        const grad=ctx.createLinearGradient(0,-len*0.9*scale,0,len*0.9*scale);
        grad.addColorStop(0,'rgba(255,255,255,.26)');
        grad.addColorStop(0.18,adjustHex(leaf,18));
        grad.addColorStop(0.62,leaf);
        grad.addColorStop(1,adjustHex(leaf,-34));
        ctx.fillStyle=grad;
        ctx.beginPath();
        ctx.moveTo(0,-len*1.02*scale);
        ctx.quadraticCurveTo(wid*1.05*scale,-len*0.34*scale,wid*0.48*scale,len*0.58*scale);
        ctx.quadraticCurveTo(0,len*0.96*scale,-wid*0.52*scale,len*0.56*scale);
        ctx.quadraticCurveTo(-wid*1.02*scale,-len*0.30*scale,0,-len*1.02*scale);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle='rgba(24,64,28,.22)';
        ctx.lineWidth=Math.max(0.7,0.9*scale);
        ctx.beginPath();
        ctx.moveTo(0,-len*0.88*scale);
        ctx.quadraticCurveTo(0,-len*0.08*scale,0,len*0.75*scale);
        ctx.stroke();
        if(wetLevel>0.06){
          ctx.fillStyle=`rgba(214,228,239,${Math.min(0.32, wetLevel*0.28)})`;
          ctx.beginPath();
          ctx.ellipse(wid*0.10*scale,-len*0.15*scale,Math.max(1.1,wid*0.22)*scale,Math.max(0.9,wid*0.12)*scale,-0.22,0,Math.PI*2);
          ctx.fill();
          if(wetLevel>0.22){
            ctx.beginPath();
            ctx.ellipse(-wid*0.18*scale,len*0.18*scale,Math.max(1.0,wid*0.16)*scale,Math.max(0.8,wid*0.1)*scale,0.1,0,Math.PI*2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    const coreGrad=ctx.createRadialGradient(0,0,1,0,0,7.5*scale);
    coreGrad.addColorStop(0,'#7b5a3c');
    coreGrad.addColorStop(1,stage==='fruiting' ? '#5f3d26' : '#628b3e');
    ctx.fillStyle=coreGrad;
    ctx.beginPath(); ctx.arc(0,0,7.2*scale,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.arc(-1.6*scale,-2.2*scale,2.1*scale,0,Math.PI*2); ctx.fill();

    if(stage==='fruiting'){
      const fruitCol = plant.type==='tomato' ? '#c4473b' : plant.type==='cucumber' ? '#3c8e4d' : '#8dc45b';
      [[-7,-4,4.2],[5,-3,3.6],[1,6,3.4]].forEach(([fx,fy,fr])=>{
        ctx.fillStyle=fruitCol; ctx.beginPath(); ctx.arc(fx*scale,fy*scale,fr*scale,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.24)'; ctx.beginPath(); ctx.arc((fx-1.1)*scale,(fy-1.2)*scale,fr*0.32*scale,0,Math.PI*2); ctx.fill();
      });
    }

    ctx.strokeStyle=stateInfo.color;
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,0,(spread+3)*scale,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
  function drawIsoPlant(ctx,base,top,plant){
    const leaf=plantColors[plant.type] || '#5da04d';
    const info=getPlantWaterState(plant);
    const stage = plant.stage || 'growing';
    const leafCount = stage==='seedling' ? 4 : stage==='growing' ? 8 : 11;
    const spread = stage==='seedling' ? 10 : stage==='growing' ? 18 : 24;
    const leafW = stage==='seedling' ? 8 : stage==='growing' ? 12 : 15;
    const leafH = stage==='seedling' ? 4 : stage==='growing' ? 6 : 8;

    ctx.save();
    ctx.fillStyle='rgba(10,12,12,.12)';
    ctx.beginPath(); ctx.ellipse(base.x,base.y+8,spread+8,6+leafH*0.7,0,0,Math.PI*2); ctx.fill();

    const stemGrad=ctx.createLinearGradient(base.x,base.y,top.x,top.y);
    stemGrad.addColorStop(0,'#6f553a');
    stemGrad.addColorStop(1,'#3f7c37');
    ctx.strokeStyle=stemGrad; ctx.lineWidth=4.4;
    ctx.beginPath(); ctx.moveTo(base.x,base.y-1); ctx.lineTo(top.x,top.y+2); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.22)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(base.x+1.5,base.y-1); ctx.lineTo(top.x+1.5,top.y+1); ctx.stroke();

    for(let layer=0; layer<2; layer++){
      for(let i=0;i<leafCount;i++){
        const ang = (i/leafCount)*Math.PI*2 + (layer?0.35:0);
        const radius = spread*(layer?0.72:1);
        const lx = top.x + Math.cos(ang)*radius;
        const ly = top.y + Math.sin(ang)*radius*0.52 - layer*2;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(Math.cos(ang)*0.6 - 0.2);
        const lg=ctx.createLinearGradient(0,-leafH,0,leafH);
        lg.addColorStop(0,'rgba(255,255,255,.22)');
        lg.addColorStop(0.18,leaf);
        lg.addColorStop(1,'#2f6f35');
        ctx.fillStyle=lg;
        ctx.beginPath();
        ctx.moveTo(0,-leafH*1.2);
        ctx.quadraticCurveTo(leafW*0.95,-leafH*0.35,0,leafH*1.25);
        ctx.quadraticCurveTo(-leafW*0.95,-leafH*0.35,0,-leafH*1.2);
        ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.18)';
        ctx.lineWidth=0.8;
        ctx.beginPath(); ctx.moveTo(0,-leafH*0.95); ctx.lineTo(0,leafH*1.0); ctx.stroke();
        ctx.restore();
      }
    }

    ctx.fillStyle='#4d883b';
    ctx.beginPath(); ctx.arc(top.x,top.y,stage==='seedling'?4.5:6.5,0,Math.PI*2); ctx.fill();

    if(stage==='fruiting'){
      const fruitColor = plant.type==='tomato' ? '#c4473b' : plant.type==='cucumber' ? '#3d904b' : '#89ba57';
      [[-9,2,4.5],[8,-1,4.1],[-2,5,3.8]].forEach(([dx,dy,r])=>{
        ctx.fillStyle='rgba(0,0,0,.12)';
        ctx.beginPath(); ctx.arc(top.x+dx+1.2,top.y+dy+1.8,r,0,Math.PI*2); ctx.fill();
        const fg=ctx.createRadialGradient(top.x+dx-1,top.y+dy-1,0.6,top.x+dx,top.y+dy,r);
        fg.addColorStop(0,'rgba(255,255,255,.25)');
        fg.addColorStop(0.25,fruitColor);
        fg.addColorStop(1,'#6b2c25');
        ctx.fillStyle=fg;
        ctx.beginPath(); ctx.arc(top.x+dx,top.y+dy,r,0,Math.PI*2); ctx.fill();
      });
    }

    ctx.strokeStyle=info.color;
    ctx.lineWidth=2.2;
    ctx.beginPath(); ctx.ellipse(base.x, base.y+7, spread+11, 8+leafH*0.6, 0, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }
  function makePlant(x,y,type,stage='growing'){
    return {
      id:(crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random())),
      x,y,type,stage,
      height:effectivePlantHeight(type, stage)
    };
  }
  function randomPlantLayout(n=8){
    const types=['tomato','lettuce','carrot','radish','cucumber','basil','spinach'];
    const stages=['seedling','growing','fruiting'];
    const out=[];
    for(let i=0;i<n;i++){
      const type=types[Math.floor(Math.random()*types.length)];
      const stage=stages[Math.floor(Math.random()*stages.length)];
      out.push(makePlant(220+Math.random()*(garden.w-440),120+Math.random()*(garden.h-240),type,stage));
    }
    return out;
  }
  function seedMode(mode){
    state.plants = [];
    state.sequence = [];
    state.pathHistory = [];
    state.recentPath = null;
    state.waterCells = {};
    state.waterHistory = [];
    state.pos = {x:0,y:0,z:0};
    state.selected = {x:0,y:0,z:0};
    state.watering = false;
    if(mode==='tutorial'){
      state.plants = [makePlant(420,320,'lettuce','seedling'), makePlant(1400,760,'tomato','growing'), makePlant(2350,1020,'carrot','fruiting')];
      state.mission = {title:'チュートリアル', detail:'画面の説明に沿って、座標選択 → Move To → Safe Z → 水量設定 → 予約開始を順番に試します。', done:false};
    } else if(mode==='practice_quick'){
      state.plants = randomPlantLayout(9);
      const target = state.plants[Math.floor(Math.random()*state.plants.length)];
      state.mission = {title:'練習A', detail:`${plantLabels[target.type]} の近くへ移動し、散水半径と量を調整して水やりシークエンスを作ってください。`, done:false};
    } else if(mode==='practice_goal'){
      state.plants = randomPlantLayout(8);
      state.mission = {title:'練習B', detail:'Safe Zを使い、移動回数と野菜ごとの適正水量を意識してください。全植物が適正範囲なら成功、近ければおしい判定です。', done:false};
    } else {
      state.mission = {title:'フリー', detail:'自由に植物配置、移動、水やり、シークエンスを試します。', done:false};
    }
  }


  function applyTrainingScenario(scenario){
    if(!scenario) return;
    const id = scenario.id || 'move_basic';
    const target = scenario.target || {x:900,y:450,z:0};
    const isWater = id === 'water_basic' || id === 'mission_water';
    const isSeq = id === 'sequence_basic';
    const missionSpec = scenario.mission || null;
    const titleMap = {
      move_basic:'基本操作レッスン',
      water_basic:'水やりレッスン',
      sequence_basic:'シークエンスレッスン',
      mission_water:'課題モード：適量水やり'
    };
    const detailMap = {
      move_basic:`初期位置 X0/Y0/Z0 から開始します。目標座標 X${Math.round(target.x)} / Y${Math.round(target.y)} / Z${Math.round(target.z||0)} を選択して Move してください。`,
      water_basic:`水やり対象の株を用意しました。黄色の目標株 X${Math.round(target.x)} / Y${Math.round(target.y)} を選択し、移動後に Water ON/OFF を練習してください。`,
      sequence_basic:`シークエンス対象の株を用意しました。黄色の目標株 X${Math.round(target.x)} / Y${Math.round(target.y)} を選択し、Move → 水量/半径 → 待機 → メッセージ → Home位置へ戻るMove → 実行の順で登録してください。`,
      mission_water:`課題対象の株を用意しました。黄色の目標株を適量水やりしてください。簡易版では操作完了までを確認します。`
    };
    state = defaults();
    state.mode = 'practice_quick';
    state.pos = {x:0,y:0,z:0};
    state.selected = {x:0,y:0,z:0};
    state.stageZoom = 1.0;
    state.mapZoom = 1.2;
    state.waterRadius = missionSpec?.radius || (isWater ? 52 : 42);
    state.waterRate = missionSpec?.rate || (isWater ? 6 : 5);
    state.trainingScenario = {
      id,
      title:titleMap[id] || '練習レッスン',
      target:{x:target.x,y:target.y,z:target.z||0},
      tolerance: scenario.tolerance || 70,
      mission: missionSpec ? {...missionSpec} : null
    };
    if(isWater || id === 'mission_water'){
      const missionType = missionSpec?.type || (id === 'mission_water' ? 'lettuce' : 'lettuce');
      state.plants = [
        makePlant(target.x,target.y,missionType,'growing'),
        makePlant(1160,620,'basil','growing'),
        makePlant(1480,760,'radish','seedling')
      ];
    } else if(isSeq){
      state.plants = [
        makePlant(target.x,target.y,'tomato','growing'),
        makePlant(720,380,'lettuce','seedling'),
        makePlant(1380,700,'basil','growing')
      ];
    } else {
      state.plants = [
        makePlant(720,360,'lettuce','seedling'),
        makePlant(target.x,target.y,'radish','growing'),
        makePlant(1240,640,'basil','growing'),
        makePlant(1740,760,'tomato','growing')
      ];
    }
    state.sequence = [];
    state.pathHistory = [];
    state.recentPath = null;
    state.waterCells = {};
    state.waterHistory = [];
    state.leafWater = {};
    state.mission = {
      title:titleMap[id] || '練習レッスン',
      detail:detailMap[id] || '指定された目標に従って練習してください。',
      done:false
    };
    if($('#appRoot')) $('#appRoot').classList.remove('hidden');
    if($('#homeScreen')) $('#homeScreen').classList.add('hidden');
    applyStateToControls();
    if(id === 'mission_water') activateTab('sequence');
    else if(isWater) activateTab('water');
    if(isSeq) activateTab('sequence');
    if(!isWater && !isSeq && id !== 'mission_water') activateTab('control');
    renderSequence();
    renderAll();
    centerScrollableCanvas($('#stageCanvas'),0.5,0.55);
    centerScrollableCanvas($('#mapCanvas'),0.5,0.5);
    saveState('練習初期化');
    log(`${titleMap[id] || '練習'} 初期化：目標 X${Math.round(target.x)} / Y${Math.round(target.y)} / Z${Math.round(target.z||0)}`);
  }

  function isNearTrainingTarget(pt){
    const sc = state.trainingScenario;
    if(!sc || !sc.target) return true;
    const tol = sc.tolerance || 55;
    return Math.hypot((pt.x||0)-sc.target.x, (pt.y||0)-sc.target.y) <= tol;
  }

  function applyUiDensity(){
    const density = state.uiDensity || 'standard';
    document.body.classList.remove('compact','comfortable');
    if(density === 'compact') document.body.classList.add('compact');
    if(density === 'comfortable') document.body.classList.add('comfortable');
    const btn = $('#densityBtn');
    if(btn){
      const label = density === 'compact' ? '小さめ' : density === 'comfortable' ? '広め' : '標準';
      btn.textContent = '表示密度: ' + label;
    }
  }
  function cycleUiDensity(){
    const next = state.uiDensity === 'standard' ? 'compact' : state.uiDensity === 'compact' ? 'comfortable' : 'standard';
    state.uiDensity = next;
    applyUiDensity();
    renderAll();
    saveState('表示密度変更');
  }
  function applyStateToControls(){
    $('#inputX').value = Math.round(state.selected.x);
    $('#inputY').value = Math.round(state.selected.y);
    $('#inputZ').value = Math.round(clamp(state.selected.z,garden.zMin,garden.zMax));
    $('#seqX').value = Math.round(state.selected.x);
    $('#seqY').value = Math.round(state.selected.y);
    $('#seqZ').value = Math.round(clamp(state.selected.z,garden.zMin,garden.zMax));
    $('#speedRange').value = state.speed;
    $('#speedLabel').textContent = `${state.speed}%`;
    $('#speedChip').textContent = `速度 ${state.speed}%`;
    $('#waterRadius').value = state.waterRadius;
    $('#waterRate').value = state.waterRate;
    if($('#waterPulseLabel')) $('#waterPulseLabel').textContent = state.watering && state.waterStartTime ? `散水開始から ${((Date.now()-state.waterStartTime)/1000).toFixed(1)}秒` : '散水開始から 0.0秒';
    if($('#waterSprayModeLabel')) $('#waterSprayModeLabel').textContent = state.watering ? '現在位置から継続散水中' : 'WATER ONで現在位置から継続散水';
    if($('#stageZoom')) $('#stageZoom').value = Math.max(1, Math.min(5, state.stageZoom || 1.1));
    if($('#mapZoom')) $('#mapZoom').value = state.mapZoom || 1.3;
    $('#seqRadius').value = state.waterRadius;
    $('#seqRate').value = state.waterRate;
    $('#waterRadiusLabel').textContent = `半径 ${state.waterRadius}`;
    $('#waterRateLabel').textContent = `量 ${state.waterRate}`;
    $('#plantWaterHint').textContent = waterRangeText($('#plantType').value, $('#plantStage').value);
    if($('#jogCustomInput')) $('#jogCustomInput').value = state.jogStep || 100;
    if($('#envRegion')) $('#envRegion').value = state.env?.region || 'tokyo';
    if($('#envSeason')) $('#envSeason').value = state.env?.season || 'spring';
    if($('#envTime')) $('#envTime').value = state.env?.time || 'morning';
    if($('#envPrevDay')) $('#envPrevDay').value = state.env?.prevDay || 'normal';
    $('#modeChip').textContent = modeLabel();
    $('#stagePosText').textContent = `X${Math.round(state.pos.x)} Y${Math.round(state.pos.y)} Z${Math.round(state.pos.z)}`;
    updateEnvPreview();
    updateMission();
  }
  function setSelected(x,y,z=state.pos.z, reflect=true){
    state.selected = {x:clamp(x,0,garden.w), y:clamp(y,0,garden.h), z:clamp(z,garden.zMin,garden.zMax)};
    $('#selX').textContent = Math.round(state.selected.x);
    $('#selY').textContent = Math.round(state.selected.y);
    $('#selZ').textContent = Math.round(state.selected.z);
    if($('#curX')) $('#curX').textContent = Math.round(state.pos.x);
    if($('#curY')) $('#curY').textContent = Math.round(state.pos.y);
    if($('#curZ')) $('#curZ').textContent = Math.round(state.pos.z);
    if(reflect){
      $('#inputX').value = Math.round(state.selected.x);
      $('#inputY').value = Math.round(state.selected.y);
      $('#inputZ').value = Math.round(state.selected.z);
      $('#seqX').value = Math.round(state.selected.x);
      $('#seqY').value = Math.round(state.selected.y);
      $('#seqZ').value = Math.round(state.selected.z);
    }
    showMapInfo();
    renderAll();
    lessonEvent('select', {selected: deepClone(state.selected), target: deepClone(state.trainingScenario?.target || null), targetOk: isNearTrainingTarget(state.selected)});
  }
  function setStatus(text){
    state.status=text;
    const chip=$('#stateChip');
    chip.textContent=text;
    chip.className='chip'+(text.includes('停止')?' stop':text.includes('予約')?' warn':'');
  }
  function isGrowthPlantLocked(){ return !!state.growthModeActive && !!state.growthPlantLocked; }
  function updateGrowthPlantLockUI(){
    document.body.classList.toggle('growth-plant-locked', isGrowthPlantLocked());
    const locked = isGrowthPlantLocked();
    ['plantMode','clearPlantsBtn','seedPracticeBtn'].forEach(id=>{ const el=$('#'+id); if(el){ el.disabled=locked; el.title=locked?'育成モード中は植物配置を変更できません':''; } });
    if(locked && $('#plantMode')) $('#plantMode').value='off';
  }
  function clearPathAndWater(){ state.pathHistory=[]; state.recentPath=null; state.waterCells={}; state.waterHistory=[]; state.leafWater={}; }
  function initMode(mode){
    state = safeLoad(mode) || defaults();
    state.mode=mode;
    if(!safeLoad(mode)) seedMode(mode);
    if(!state.selected) state.selected={x:0,y:0,z:0};
    if(!Array.isArray(state.pathHistory)) state.pathHistory=[];
    if(typeof state.waterCells!=='object' || state.waterCells===null) state.waterCells={};
    if(!Array.isArray(state.waterHistory)) state.waterHistory=[];
    if(typeof state.leafWater!=='object' || state.leafWater===null) state.leafWater={};
    if(!Array.isArray(state.sequence)) state.sequence=[];
    if(!state.env) state.env={region:'tokyo',season:'spring',time:'morning',prevDay:'normal'};
    state.plants = (state.plants || []).map(p=>{
      const stage = p.stage || 'growing';
      return {...p, stage, height:effectivePlantHeight(p.type, stage)};
    });
    applyStateToControls();
    updateGrowthPlantLockUI();
    $('#appRoot').classList.remove('hidden');
    $('#homeScreen').classList.add('hidden');
    renderAll();
    centerScrollableCanvas($('#stageCanvas'),0.5,0.55);
    centerScrollableCanvas($('#mapCanvas'),state.selected.x/garden.w,state.selected.y/garden.h);
    if(mode==='tutorial') openTutorialLessonMenu(state.tutorialLesson || 'movement_basic');
  }

  function currentZoomForCanvas(canvas){ return canvasUtils.currentZoomForCanvas(canvas, state); }
  function resizeCanvas(canvas){ return canvasUtils.resizeCanvas(canvas, state, __canvasSizeCache); }
  function centerScrollableCanvas(canvas, focusX=0.5, focusY=0.5){ return canvasUtils.centerScrollableCanvas(canvas, focusX, focusY); }
  function mapToPx(pt,size){ return canvasUtils.mapToPx(pt, size, garden); }
  function pxToMap(pt,size){ return canvasUtils.pxToMap(pt, size, garden); }

  function getClimateProfile(){ return climateProfiles[state.env?.region] || climateProfiles.tokyo; }
  function envAverageTemp(){ const p=getClimateProfile(); return p.temp[state.env?.season || 'spring']; }
  function envBaseMoisture(){
    const p=getClimateProfile();
    const season=state.env?.season || 'spring';
    const time=state.env?.time || 'morning';
    const prev=state.env?.prevDay || 'normal';
    const temp=p.temp[season], humidity=p.humidity[season];
    const timeAdjust={dawn:1.2,morning:0.4,noon:-1.6,evening:0.7,night:1.0}[time] || 0;
    const prevAdjust={dry:-2.2,normal:0,rainy:3.2}[prev] || 0;
    return clamp(6 + humidity*0.035 - temp*0.17 + timeAdjust + prevAdjust, 0, 14);
  }
  function moistureAtPoint(pt=state.selected){
    const cx = pt.x/garden.w*garden.cols;
    const cy = pt.y/garden.h*garden.rows;
    let total=0, weight=0;
    for(let y=Math.floor(cy-1); y<=Math.ceil(cy+1); y++){
      for(let x=Math.floor(cx-1); x<=Math.ceil(cx+1); x++){
        if(x<0||y<0||x>=garden.cols||y>=garden.rows) continue;
        const d=Math.hypot(x+0.5-cx,y+0.5-cy);
        const w=Math.max(0.2,1.5-d);
        total += ((state.waterCells[`${x},${y}`]||0) + envBaseMoisture()) * w;
        weight += w;
      }
    }
    return Math.round((total/Math.max(1,weight))*10)/10;
  }
  function moistureClass(value){ if(value<5.5) return 'low'; if(value>18.5) return 'high'; return 'ok'; }
  function moistureColor(value){ const cls=moistureClass(value); return cls==='low' ? '#be4b49' : cls==='high' ? '#222' : '#4f95e8'; }
  function moistureText(value){ const cls=moistureClass(value); return cls==='low' ? '不足' : cls==='high' ? '過多' : '適正'; }
  function soilWetStyle(amount){
    if(amount < 0.025) return null;
    if(amount < 0.07) return {fill:'rgba(142,108,82,.13)', puddle:false, gloss:0, edge:'rgba(112,84,62,.05)'};
    if(amount < 0.16) return {fill:'rgba(122,92,68,.20)', puddle:false, gloss:0, edge:'rgba(95,70,52,.06)'};
    if(amount < 0.34) return {fill:'rgba(96,71,52,.30)', puddle:false, gloss:0, edge:'rgba(72,53,40,.08)'};
    if(amount < 0.62) return {fill:'rgba(67,50,38,.42)', puddle:false, gloss:0.02, edge:'rgba(42,31,24,.10)'};
    if(amount < 0.90) return {fill:'rgba(41,33,28,.52)', puddle:true, gloss:0.12, edge:'rgba(22,18,16,.14)'};
    return {fill:'rgba(28,26,25,.58)', puddle:true, gloss:Math.min(0.34, 0.18 + (amount-0.9)*0.22), edge:'rgba(16,14,14,.18)'};
  }
  function decayWaterAndLeaves(){
    // 練習モードの評価や確認を安定させるため、時間経過による乾燥は一旦停止
    return;
  }
  function moistureDisplayStyle(value){
    return soilWetStyle(Math.max(0, (value - envBaseMoisture()) / 18));
  }
  function nearestPlantTo(x,y){
    const plants = state.plants || [];
    if(!plants.length) return null;
    let best=null, bestD=Infinity;
    for(const p of plants){
      const d=Math.hypot(p.x-x,p.y-y);
      if(d<bestD){ bestD=d; best=p; }
    }
    return best;
  }
  function recentWaterEvents(limit=140){
    const arr = state.waterHistory || [];
    return arr.length<=limit ? arr : arr.slice(-limit);
  }
  function updateEnvPreview(){
    const temp=envAverageTemp(), base=envBaseMoisture();
    if($('#envTempLabel')) $('#envTempLabel').textContent = `平均気温の目安 ${temp}℃`;
    if($('#envMoistureLabel')) $('#envMoistureLabel').textContent = `初期土壌水分 ${base.toFixed(1)}`;
    if($('#moistureEnvEffect')) $('#moistureEnvEffect').textContent = `${getClimateProfile().label} / ${temp}℃ / 基準 ${base.toFixed(1)}`;
  }
  function waterAtPlant(plant){
    return waterAtArea(plant, plantRootRadius(plant));
  }
  function checkGoalMode(){
    if(state.mode!=='practice_goal'){ return; }
    let ok=true, near=0, over=0, under=0;
    for(const p of state.plants){
      const val=waterAtPlant(p);
      const [min,max]=getPlantTargetRange(p);
      if(val>=min && val<=max) continue;
      ok=false;
      const margin = Math.max(1, (max-min)*0.35);
      if((val < min && val >= min - margin) || (val > max && val <= max + margin)) near++;
      else if(val > max) over++;
      else under++;
    }
    state.mission.done=ok;
    if(ok){
      state.mission.detail = '成功：全植物が適正範囲です。Safe Z・移動・散水設定の流れも確認できました。';
    }else if(near>0 && over===0 && under===0){
      state.mission.detail = `おしい：あと少しで適正です（近い判定 ${near}株）。`;
    }else{
      state.mission.detail = `不足 ${under} / 過多 ${over} / おしい ${near}。全植物を適正範囲へ近づけてください。`;
    }
    updateMission();
  }


  function setJogStep(step){
    state.jogStep=step;
    $('#jogStepLabel').textContent=`現在のステップ: ${step}mm`;
    $$('.jogStepBtn').forEach(btn=>btn.classList.toggle('primary', +btn.dataset.step===step));
    saveState('自動保存');
  }
  function jog(dx,dy,dz){
    const step = state.jogStep || 100;
    const target={
      x: clamp(state.pos.x + dx*step, 0, garden.w),
      y: clamp(state.pos.y + dy*step, 0, garden.h),
      z: clamp(state.pos.z + dz*Math.max(1,Math.min(100,step)), garden.zMin, garden.zMax)
    };
    setSelected(target.x,target.y,target.z,true);
    animateMove(target);
  }

  function drawMap(){
    const c=$('#mapCanvas'), size=resizeCanvas(c), ctx=c.getContext('2d');
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); ctx.clearRect(0,0,size.w,size.h);
    const farmMapView = window.FarmBotFarmMapView;
    if(!farmMapView || !farmMapView.drawFarmMap) return;
    farmMapView.drawFarmMap(ctx, size, {state, garden, soilWetStyle, mapToPx, drawTopPlant, getPlantWaterState});
    if(window.FarmBotGrowthMode && window.FarmBotGrowthMode.drawMapOverlay){
      try{ window.FarmBotGrowthMode.drawMapOverlay(ctx, size, {state, garden, mapToPx}); }catch(e){ console.warn('growth map overlay failed', e); }
    }
  }

  function stageViewProject(x,y,z,cfg){
    const wx=(x-garden.w/2)/1000;
    const wy=(y-garden.h/2)/1000;
    const wz=(z-garden.zMin)/1000;
    const cy=Math.cos(cfg.yaw), sy=Math.sin(cfg.yaw);
    const cp=Math.cos(cfg.pitch), sp=Math.sin(cfg.pitch);
    const x1 = wx*cy - wy*sy;
    const y1 = wx*sy + wy*cy;
    const z1 = wz;
    const y2 = y1*cp - z1*sp;
    const z2 = y1*sp + z1*cp;
    const d = cfg.distance;
    const persp = d/(d + y2 + 2.8);
    return {x:cfg.cx + x1*cfg.scale*persp, y:cfg.cy - z2*cfg.scale*persp, depth:y2, persp};
  }

  function drawLine3D(ctx,a,b,cfg,width,color){
    const p1=stageViewProject(a.x,a.y,a.z,cfg), p2=stageViewProject(b.x,b.y,b.z,cfg);
    ctx.strokeStyle=color; ctx.lineWidth=Math.max(1,width*((p1.persp+p2.persp)/2));
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
    return {p1,p2};
  }

  function drawPoly3D(ctx,pts,cfg,fill,stroke=null){
    const pp=pts.map(p=>stageViewProject(p.x,p.y,p.z,cfg));
    ctx.beginPath(); ctx.moveTo(pp[0].x,pp[0].y);
    for(let i=1;i<pp.length;i++) ctx.lineTo(pp[i].x,pp[i].y);
    ctx.closePath();
    ctx.fillStyle=fill; ctx.fill();
    if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=1; ctx.stroke(); }
    return pp;
  }

  function adjustHex(hex, amt){
    hex=hex.replace('#','');
    const to=v=>Math.max(0,Math.min(255,v));
    const r=to(parseInt(hex.slice(0,2),16)+amt), g=to(parseInt(hex.slice(2,4),16)+amt), b=to(parseInt(hex.slice(4,6),16)+amt);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  function drawBox3D(ctx,x,y,z,w,d,h,cfg,topColor,sideColor,frontColor,stroke='rgba(255,255,255,.08)'){
    const p000={x,y,z}, p100={x:x+w,y,z}, p110={x:x+w,y:y+d,z}, p010={x,y:y+d,z};
    const p001={x,y,z:z+h}, p101={x:x+w,y,z:z+h}, p111={x:x+w,y:y+d,z:z+h}, p011={x,y:y+d,z:z+h};
    const faces=[
      {pts:[p001,p101,p111,p011], fill:topColor},
      {pts:[p101,p100,p110,p111], fill:sideColor},
      {pts:[p011,p111,p110,p010], fill:frontColor},
    ];
    faces.sort((a,b)=>{
      const da=a.pts.reduce((m,p)=>m+stageViewProject(p.x,p.y,p.z,cfg).depth,0)/a.pts.length;
      const db=b.pts.reduce((m,p)=>m+stageViewProject(p.x,p.y,p.z,cfg).depth,0)/b.pts.length;
      return da-db;
    });
    faces.forEach(f=>drawPoly3D(ctx,f.pts,cfg,f.fill,stroke));
  }


  function drawStageMoistureOverlay(ctx,cfg){
    if(state.showMoisturePanel===false) return;
    const stepX=garden.w/14, stepY=garden.h/8;
    for(let yy=stepY*0.5; yy<garden.h; yy+=stepY){
      for(let xx=stepX*0.5; xx<garden.w; xx+=stepX){
        const v=moistureAtPoint({x:xx,y:yy});
        const wet=moistureDisplayStyle(v); if(!wet) continue;
        const p=stageViewProject(xx,yy,garden.zMin+1,cfg);
        ctx.fillStyle=wet.fill;
        ctx.beginPath(); ctx.ellipse(p.x,p.y,16*p.persp,8*p.persp,0,0,Math.PI*2); ctx.fill();
        if(wet.puddle){
          ctx.fillStyle=`rgba(228,236,244,${Math.max(0.08,wet.gloss*0.85)})`;
          ctx.beginPath(); ctx.ellipse(p.x-3*p.persp,p.y-2*p.persp,6.2*p.persp,2.6*p.persp,-0.26,0,Math.PI*2); ctx.fill();
        }
      }
    }
  }
  function drawStageLeafSprite(ctx, sprite, p0, p1, widthPx, wetLevel=0, alpha=1){
    if(!sprite || !sprite.complete || !sprite.naturalWidth) return;
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if(len < 2) return;
    const ang = Math.atan2(dy, dx) + Math.PI/2;
    ctx.save();
    ctx.translate((p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha;
    const h = len * 1.08;
    const w = Math.max(5, widthPx);
    ctx.drawImage(sprite, -w*0.5, -h*0.72, w, h);
    if(wetLevel > 0.03){
      ctx.globalCompositeOperation='source-atop';
      const g=ctx.createLinearGradient(0,-h*0.58,0,h*0.5);
      g.addColorStop(0, `rgba(255,255,255,${0.02 + wetLevel*0.04})`);
      g.addColorStop(0.45, `rgba(209,229,240,${0.02 + wetLevel*0.04})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle=g;
      ctx.fillRect(-w*0.5,-h*0.72,w,h*1.1);
      ctx.globalCompositeOperation='source-over';
    }
    ctx.restore();
  }

  function drawOrbitalPlant(ctx,plant,cfg){
    const stage=plant.stage||'growing';
    const baseH=effectivePlantHeight(plant.type, stage);
    const wetLevel = plantLeafWetness(plant, (state.plants||[]).indexOf(plant));
    const profile = speciesPlantProfile(plant);
    const spreadBase = (stage==='seedling' ? 42 : stage==='growing' ? 92 : 128) * profile.spreadMul;
    const layers = profile.rings;
    const leavesPer = Math.max(4, Math.round(profile.leafCount * (stage==='seedling' ? 0.84 : 0.72)));
    const base = stageViewProject(plant.x,plant.y,garden.zMin,cfg);
    ctx.fillStyle='rgba(20,20,20,.12)';
    ctx.beginPath(); ctx.ellipse(base.x,base.y+5, 20*base.persp*profile.spreadMul, 10*base.persp, 0,0,Math.PI*2); ctx.fill();
    drawLine3D(ctx,{x:plant.x,y:plant.y,z:garden.zMin},{x:plant.x,y:plant.y,z:garden.zMin+baseH*profile.heightMul},cfg,7,'#507d3c');

    const leafItems=[];
    for(let layer=0; layer<layers; layer++){
      const h = garden.zMin + baseH*(0.16 + layer*(0.60/Math.max(1,layers-1))) * profile.heightMul;
      const spread = spreadBase*(profile.habit==='rosette' ? (0.28 + layer*0.13) : profile.habit==='feathery' ? (0.18 + layer*0.10) : (0.22 + layer*0.12));
      const localLeaves = Math.max(4, Math.round(leavesPer - layer*(profile.habit==='upright'?0.8:1.1)));
      for(let i=0;i<localLeaves;i++){
        const ang = (Math.PI*2/localLeaves)*i + layer*(profile.habit==='upright'?0.26:0.18) + (i%2)*0.04;
        const seed = plant.x*0.01 + plant.y*0.013 + layer*7.1 + i*3.17;
        const tip={x:plant.x + Math.cos(ang)*spread, y:plant.y + Math.sin(ang)*spread*profile.yScale, z:h + 20 + layer*5 + Math.max(0,Math.sin(ang))*10};
        const stem={x:plant.x + Math.cos(ang)*spread*0.12, y:plant.y + Math.sin(ang)*spread*0.08, z:h + layer*3};
        const p0=stageViewProject(stem.x,stem.y,stem.z,cfg);
        const p1=stageViewProject(tip.x,tip.y,tip.z,cfg);
        const widthPx=(7.2 + layer*1.2 + (Math.abs(Math.sin(seed))*2.0)) * profile.widMul * p1.persp;
        const depth=(p0.depth + p1.depth)*0.5;
        const alpha=clamp(0.82 + layer*0.03, 0.82, 0.98);
        const sprite = __leafSprites[(Math.abs(Math.floor(seed*1000)) % __leafSprites.length)];
        leafItems.push({depth, draw:()=>drawStageLeafSprite(ctx, sprite, p0, p1, widthPx, wetLevel, alpha)});
      }
    }
    leafItems.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());

    if(profile.fruitCount>0){
      for(let i=0;i<profile.fruitCount;i++){
        const ang = i*(Math.PI*2/profile.fruitCount)+0.4;
        const fp=stageViewProject(plant.x + Math.cos(ang)*spreadBase*0.22, plant.y + Math.sin(ang)*spreadBase*0.15, garden.zMin + baseH*0.56, cfg);
        const r=(plant.type==='cucumber'?7:6)*fp.persp;
        const col=plant.type==='tomato' ? '#d3483c' : plant.type==='cucumber' ? '#3d8e4f' : '#9cd463';
        ctx.fillStyle=col;
        if(plant.type==='cucumber'){
          ctx.save();
          ctx.translate(fp.x,fp.y);
          ctx.rotate(ang*0.4);
          ctx.beginPath(); ctx.ellipse(0,0,r*1.6,r*0.76,0,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.22)'; ctx.beginPath(); ctx.ellipse(-r*0.3,-r*0.12,r*0.46,r*0.16,0,0,Math.PI*2); ctx.fill();
          ctx.restore();
        }else{
          ctx.beginPath(); ctx.arc(fp.x,fp.y,r,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(fp.x-r*0.25,fp.y-r*0.25,r*0.35,0,Math.PI*2); ctx.fill();
        }
      }
    }
    const info=getPlantWaterState(plant);
    ctx.strokeStyle=info.color; ctx.lineWidth=Math.max(1,2.0*base.persp);
    ctx.beginPath(); ctx.arc(base.x,base.y, Math.max(7,18*base.persp), 0, Math.PI*2); ctx.stroke();
  }

  function drawStage(){
    const c=$('#stageCanvas'), size=resizeCanvas(c), ctx=c.getContext('2d');
    const drawW=size.w, drawH=size.h;
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); ctx.clearRect(0,0,drawW,drawH);
    const sky=ctx.createLinearGradient(0,0,0,drawH*0.64); sky.addColorStop(0,'#dceaf4'); sky.addColorStop(1,'#f5efe3'); ctx.fillStyle=sky; ctx.fillRect(0,0,drawW,drawH);
    const hill=ctx.createLinearGradient(0,drawH*0.46,0,drawH*0.7); hill.addColorStop(0,'#b7c8a2'); hill.addColorStop(1,'#8ea26e');
    ctx.fillStyle=hill; ctx.beginPath(); ctx.moveTo(0,drawH*0.58);
    ctx.bezierCurveTo(drawW*0.18,drawH*0.47,drawW*0.34,drawH*0.55,drawW*0.53,drawH*0.50);
    ctx.bezierCurveTo(drawW*0.73,drawH*0.44,drawW*0.86,drawH*0.56,drawW,drawH*0.48);
    ctx.lineTo(drawW,drawH*0.77); ctx.lineTo(0,drawH*0.77); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.20)'; ctx.fillRect(0,drawH*0.63,drawW,2);
    for(let i=0;i<7;i++){
      const tx=drawW*(0.08+i*0.14); const ty=drawH*(0.55+((i%3)-1)*0.014);
      ctx.fillStyle='#688b55'; ctx.beginPath(); ctx.moveTo(tx,ty-17); ctx.lineTo(tx-9,ty+8); ctx.lineTo(tx+9,ty+8); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#7b644a'; ctx.fillRect(tx-1.4,ty+8,2.8,14);
    }
    const orbit = state.stageOrbit || {yaw:-0.85,pitch:0.56};
    const sceneZoom = clamp(state.stageZoom || 1.1, 1, 5.0);
    const zoomT = (sceneZoom - 1) / 4.0;
    const cfg={
      yaw:orbit.yaw,
      pitch:orbit.pitch,
      cx:drawW*0.5,
      cy:drawH*(0.71 - zoomT*0.14),
      scale:drawW*(0.145 + sceneZoom*0.165),
      distance:6.3 - zoomT*3.6
    };

    drawPoly3D(ctx,[{x:0,y:0,z:garden.zMin},{x:garden.w,y:0,z:garden.zMin},{x:garden.w,y:garden.h,z:garden.zMin},{x:0,y:garden.h,z:garden.zMin}],cfg,'#886344','rgba(255,255,255,.12)');
    drawStageMoistureOverlay(ctx,cfg);
    for(let band=0; band<garden.rows; band++){
      const y0=band*(garden.h/garden.rows);
      const alpha=(band%2===0)?0.045:0.022;
      drawLine3D(ctx,{x:0,y:y0,z:garden.zMin+2},{x:garden.w,y:y0,z:garden.zMin+2},cfg,2,`rgba(255,255,255,${alpha})`);
    }
    for(let mm=0; mm<=garden.w; mm+=250) drawLine3D(ctx,{x:mm,y:0,z:garden.zMin},{x:mm,y:garden.h,z:garden.zMin},cfg,1,'rgba(255,255,255,.06)');
    for(let mm=0; mm<=garden.h; mm+=250) drawLine3D(ctx,{x:0,y:mm,z:garden.zMin},{x:garden.w,y:mm,z:garden.zMin},cfg,1,'rgba(255,255,255,.06)');

    for(const [key,amt] of Object.entries(state.waterCells||{})){
      const wet = soilWetStyle(amt); if(!wet) continue;
      const [ix,iy]=key.split(',').map(Number);
      const gx=(ix+0.5)/garden.cols*garden.w, gy=(iy+0.5)/garden.rows*garden.h;
      const p=stageViewProject(gx,gy,garden.zMin+1,cfg);
      ctx.fillStyle=wet.fill;
      ctx.beginPath(); ctx.ellipse(p.x,p.y,14*p.persp,7.2*p.persp,0,0,Math.PI*2); ctx.fill();
      if(wet.edge){
        ctx.strokeStyle=wet.edge;
        ctx.lineWidth=Math.max(0.6,0.9*p.persp);
        ctx.beginPath(); ctx.ellipse(p.x,p.y,13.3*p.persp,6.8*p.persp,0,0,Math.PI*2); ctx.stroke();
      }
      if(wet.puddle){
        ctx.fillStyle=`rgba(228,236,244,${Math.max(0.08,wet.gloss)})`;
        ctx.beginPath(); ctx.ellipse(p.x-3*p.persp,p.y-2*p.persp,7.4*p.persp,3.2*p.persp,-0.24,0,Math.PI*2); ctx.fill();
      }
    }

    const sortedPlants=(state.plants||[]).slice().sort((a,b)=>stageViewProject(a.x,a.y,garden.zMin,cfg).depth - stageViewProject(b.x,b.y,garden.zMin,cfg).depth);
    sortedPlants.forEach(p=>drawOrbitalPlant(ctx,p,cfg));

    const railW=30, railH=22;
    drawBox3D(ctx,0,-railW/2,-railH,garden.w,railW,railH,cfg,'#b7c0c8','#7b8590','#68727d');
    drawBox3D(ctx,0,garden.h-railW/2,-railH,garden.w,railW,railH,cfg,'#b7c0c8','#7b8590','#68727d');

    const columnW=24, columnD=18, columnH=-garden.zMin+34;
    [[-16,-46],[garden.w-8,-46],[-16,garden.h+28],[garden.w-8,garden.h+28]].forEach(([cx,cy])=>{
      drawBox3D(ctx,cx,cy,garden.zMin,columnW,columnD,columnH,cfg,'#d1d8de','#8a949e','#78828d');
    });
    [0,garden.w*0.25,garden.w*0.5,garden.w*0.75,garden.w].forEach(px=>{
      drawBox3D(ctx,px-16,-44,garden.zMin,32,18,-garden.zMin,cfg,'#d1d8de','#919aa3','#79828d');
      drawBox3D(ctx,px-16,garden.h+26,garden.zMin,32,18,-garden.zMin,cfg,'#d1d8de','#919aa3','#79828d');
    });

    drawBox3D(ctx,state.pos.x-26,0,-20,52,garden.h,20,cfg,'#adb7c0','#707a84','#626c76');
    drawLine3D(ctx,{x:state.pos.x,y:0,z:-3},{x:state.pos.x,y:garden.h,z:-3},cfg,2,'#eef3f7');
    drawLine3D(ctx,{x:state.pos.x,y:0,z:-11},{x:state.pos.x,y:garden.h,z:-11},cfg,1.6,'rgba(255,255,255,.42)');
    drawBox3D(ctx,state.pos.x-35,state.pos.y-72,-34,70,144,18,cfg,'#909aa4','#59626d','#66707a');
    drawBox3D(ctx,state.pos.x-14,state.pos.y-14,state.pos.z,-28,28,-Math.max(18,Math.abs(state.pos.z)),cfg,'#6c7680','#404851','#4c5560');
    drawBox3D(ctx,state.pos.x-24,state.pos.y-18,state.pos.z-26,48,36,26,cfg,'#434a53','#293039','#333b44');
    drawBox3D(ctx,state.pos.x+17,state.pos.y+8,state.pos.z-16,12,24,18,cfg,'#2e343c','#181d22','#252b32');

    const carrierPts = [];
    for(let t=0;t<=1.0;t+=0.08){
      carrierPts.push({
        x: state.pos.x + 24,
        y: garden.h*(0.08 + 0.84*t),
        z: -18 + Math.sin(t*Math.PI)*18
      });
    }
    for(let i=0;i<carrierPts.length-1;i++){
      drawLine3D(ctx, carrierPts[i], carrierPts[i+1], cfg, 3.1, 'rgba(40,43,48,.58)');
      drawLine3D(ctx, {...carrierPts[i], z:carrierPts[i].z+2}, {...carrierPts[i+1], z:carrierPts[i+1].z+2}, cfg, 1.2, 'rgba(210,216,222,.18)');
    }

    const carriage=stageViewProject(state.pos.x,state.pos.y,0,cfg);
    const nozzle=stageViewProject(state.pos.x,state.pos.y,state.pos.z,cfg);
    const shadow=stageViewProject(state.pos.x,state.pos.y,garden.zMin,cfg);
    ctx.fillStyle='rgba(20,25,30,.16)'; ctx.beginPath(); ctx.ellipse(shadow.x,shadow.y+5,22*shadow.persp,10*shadow.persp,0,0,Math.PI*2); ctx.fill();
    drawBox3D(ctx,state.pos.x-26,state.pos.y-58,-36,52,116,36,cfg,'#384049','#232a32','#2b333b');
    drawBox3D(ctx,state.pos.x-12,state.pos.y-12,state.pos.z,-24,24,-Math.max(18,Math.abs(state.pos.z)),cfg,'#66707a','#404851','#4c5560');
    drawBox3D(ctx,state.pos.x-20,state.pos.y-14,state.pos.z-22,40,28,22,cfg,'#454d56','#293039','#333b44');
    ctx.fillStyle='#89d9ff'; ctx.beginPath(); ctx.arc(carriage.x,carriage.y,7.5*carriage.persp,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2e353d'; ctx.beginPath(); ctx.arc(nozzle.x,nozzle.y,11*nozzle.persp,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#72c7ff'; ctx.beginPath(); ctx.arc(nozzle.x,nozzle.y,4.5*nozzle.persp,0,Math.PI*2); ctx.fill();
    const cam=stageViewProject(state.pos.x+23,state.pos.y+18,state.pos.z-12,cfg);
    ctx.fillStyle='rgba(36,40,45,.96)'; ctx.beginPath(); ctx.arc(cam.x,cam.y,5.4*cam.persp,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(145,216,255,.92)'; ctx.beginPath(); ctx.arc(cam.x+1.2*cam.persp,cam.y-0.4*cam.persp,2.6*cam.persp,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(145,216,255,.28)'; ctx.lineWidth=1.0*cam.persp; ctx.beginPath(); ctx.moveTo(cam.x,cam.y); ctx.lineTo(cam.x+24*cam.persp,cam.y+8*cam.persp); ctx.stroke();

    if(state.watering){
      const canopy = canopyPassThroughAt(state.pos.x, state.pos.y);
      const zSpread = Math.max(24, state.waterRadius * (0.60 + (state.pos.z-garden.zMin)/(garden.zMax-garden.zMin)*0.48));
      for(let i=0;i<16;i++){
        const ang=Math.random()*Math.PI*2;
        const rr=Math.random()*zSpread;
        const tx=state.pos.x + Math.cos(ang)*rr;
        const ty=state.pos.y + Math.sin(ang)*rr*0.84;
        const end=stageViewProject(tx,ty,garden.zMin,cfg);
        ctx.strokeStyle=`rgba(120,190,248,${0.03 + Math.random()*0.06})`;
        ctx.lineWidth=(0.28+Math.random()*0.22)*((nozzle.persp+end.persp)/2);
        ctx.beginPath();
        ctx.moveTo(nozzle.x + (Math.random()-0.5)*6, nozzle.y + 1);
        ctx.quadraticCurveTo((nozzle.x+end.x)/2, (nozzle.y+end.y)/2 - 6 - (1-canopy)*8, end.x, end.y);
        ctx.stroke();
      }
      ctx.fillStyle='rgba(255,255,255,.86)'; ctx.font='12px sans-serif'; ctx.textAlign='left';
      ctx.fillText(`根元へ届く目安 ${(canopy*100).toFixed(0)}% / ドラッグで回転`, 16, 22);
    } else {
      ctx.fillStyle='rgba(70,76,82,.75)'; ctx.font='12px sans-serif'; ctx.textAlign='left';
      ctx.fillText('ドラッグで360°回転 / ホイールで拡大', 16, 22);
    }

    if($('#stageViewHint')) $('#stageViewHint').textContent=`角度 Y ${(orbit.yaw*57.3).toFixed(0)}° / P ${(orbit.pitch*57.3).toFixed(0)}°`;
    $('#stagePosText').textContent = `X${Math.round(state.pos.x)} Y${Math.round(state.pos.y)} Z${Math.round(state.pos.z)}`;
  }

  function drawToolCamera(){
    const hud=$('#stageHud'); if(hud) hud.classList.toggle('hidden', state.showToolCam===false);
    const c=$('#toolCamCanvas'); if(!c || state.showToolCam===false) return;
    const size=resizeCanvas(c), ctx=c.getContext('2d');
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); ctx.clearRect(0,0,size.w,size.h);
    const zoom = +($('#cameraZoom')?.value || 1.8);
    $('#cameraZoomLabel').textContent=`${zoom.toFixed(1)}x`;

    const viewW = Math.max(220, garden.w/zoom/1.7), viewH = Math.max(170, garden.h/zoom/1.9);
    const left = clamp(state.pos.x - viewW/2, 0, Math.max(0,garden.w-viewW));
    const top = clamp(state.pos.y - viewH/2, 0, Math.max(0,garden.h-viewH));
    const sx = size.w/viewW, sy = size.h/viewH;
    const toLocal = (x,y)=>({x:(x-left)*sx,y:(y-top)*sy});
    const nozzle=toLocal(state.pos.x,state.pos.y);
    const intercept = canopyInterceptionAt(state.pos.x,state.pos.y);
    const nearest = intercept.top ? intercept.top.plant : nearestPlantTo(state.pos.x, state.pos.y);
    const nearestIdx = intercept.top ? intercept.top.idx : ((state.plants||[]).indexOf(nearest));
    const zNorm = clamp((state.pos.z-garden.zMin)/(garden.zMax-garden.zMin),0,1);

    const bg = ctx.createLinearGradient(0,0,0,size.h);
    bg.addColorStop(0,'#8f6b4a'); bg.addColorStop(0.58,'#7b5b42'); bg.addColorStop(1,'#604734');
    ctx.fillStyle=bg; ctx.fillRect(0,0,size.w,size.h);
    const gardenRect = {x:(0-left)*sx, y:size.h-((garden.h-bottom)*sy), w:garden.w*sx, h:garden.h*sy};
    ctx.strokeStyle='rgba(255,255,255,.16)';
    ctx.lineWidth=1.2;
    ctx.strokeRect(gardenRect.x, gardenRect.y, gardenRect.w, gardenRect.h);


    for(let i=0;i<240;i++){
      const x=(i*137.77)%size.w, y=(i*91.53)%size.h;
      const a=0.028 + (i%7)*0.004;
      ctx.fillStyle=`rgba(${88+(i%5)*12},${64+(i%4)*8},${46+(i%3)*6},${a})`;
      ctx.beginPath(); ctx.ellipse(x,y,2+(i%4),1.2+((i*3)%3),((i%9)-4)*0.12,0,Math.PI*2); ctx.fill();
    }

    const cellW = garden.w/garden.cols, cellH = garden.h/garden.rows;
    Object.entries(state.waterCells||{}).forEach(([key,amt])=>{
      const wet=soilWetStyle(amt); if(!wet) return;
      const [ix,iy]=key.split(',').map(Number);
      const gx=(ix+0.5)*cellW, gy=(iy+0.5)*cellH;
      if(gx<left-cellW||gx>left+viewW+cellW||gy<top-cellH||gy>top+viewH+cellH) return;
      const p=toLocal(gx,gy);
      const rx=Math.max(5,cellW*sx*0.5), ry=Math.max(4,cellH*sy*0.5);
      const g=ctx.createRadialGradient(p.x-1,p.y-1,1,p.x,p.y,Math.max(rx,ry)*1.05);
      g.addColorStop(0, wet.fill);
      g.addColorStop(0.75, wet.fill);
      g.addColorStop(1, wet.edge || 'rgba(46,33,22,.18)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.ellipse(p.x,p.y,rx,ry,0,0,Math.PI*2); ctx.fill();
      if(wet.puddle){
        ctx.fillStyle=`rgba(228,236,244,${Math.max(0.08,wet.gloss)})`;
        ctx.beginPath(); ctx.ellipse(p.x-4,p.y-2,Math.max(3.5,cellW*sx*0.22),Math.max(2.4,cellH*sy*0.16),-0.28,0,Math.PI*2); ctx.fill();
      }
    });

    const plantScale = clamp(0.68 * zoom, 0.9, 2.8);
    (state.plants||[]).forEach((p, idx)=>{
      if(p.x<left-20||p.x>left+viewW+20||p.y<top-20||p.y>top+viewH+20) return;
      const q=toLocal(p.x,p.y);
      drawTopPlant(ctx, q.x, q.y, p, plantScale);
      const wet = plantLeafWetness(p, idx);
      if(wet>0.06){
        ctx.fillStyle=`rgba(212,226,239,${Math.min(0.26,wet*0.24)})`;
        ctx.beginPath(); ctx.ellipse(q.x-4*plantScale,q.y-10*plantScale,8.5*plantScale,3.2*plantScale,-0.2,0,Math.PI*2); ctx.fill();
      }
    });

    if(nearest){
      const pr = toLocal(nearest.x, nearest.y);
      const rr = Math.max(18, canopyRadius(nearest) * sx);
      ctx.strokeStyle='rgba(255,255,255,.16)';
      ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
    }

    const bodyY = 18;
    const bodyW = 110;
    ctx.fillStyle='rgba(42,46,52,.94)';
    ctx.fillRect(nozzle.x-bodyW*0.5, bodyY-8, bodyW, 18);
    ctx.fillStyle='rgba(86,92,98,.96)';
    ctx.fillRect(nozzle.x-26, 8, 52, 11);
    ctx.fillStyle='rgba(185,192,198,.95)';
    ctx.fillRect(nozzle.x-3.8, 12, 7.6, 34);
    ctx.fillStyle='rgba(34,38,44,.98)';
    ctx.beginPath(); ctx.arc(nozzle.x, 48, 18, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(109,207,246,.98)'; ctx.beginPath(); ctx.arc(nozzle.x, 48, 7.8, 0, Math.PI*2); ctx.fill();
    const camX = nozzle.x+34;
    ctx.fillStyle='rgba(56,61,67,.98)';
    ctx.fillRect(camX-5, 12, 10, 30);
    ctx.fillStyle='rgba(196,201,206,.98)';
    ctx.beginPath(); ctx.roundRect(camX-10, 20, 20, 42, 8); ctx.fill();
    ctx.fillStyle='rgba(26,30,36,.98)'; ctx.beginPath(); ctx.arc(camX, 41, 7.2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(168,225,255,.94)'; ctx.beginPath(); ctx.arc(camX+1.2, 39.8, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(30,34,40,.6)'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(camX+5,16); ctx.bezierCurveTo(camX+22,8,camX+36,10,camX+48,22); ctx.stroke();

    const crossR = 11;
    ctx.strokeStyle='rgba(255,255,255,.24)';
    ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(nozzle.x-crossR,nozzle.y); ctx.lineTo(nozzle.x+crossR,nozzle.y); ctx.moveTo(nozzle.x,nozzle.y-crossR); ctx.lineTo(nozzle.x,nozzle.y+crossR); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.10)';
    ctx.strokeRect(9,9,size.w-18,size.h-18);

    if(state.watering){
      const sprayR = Math.max(16, state.waterRadius * sx * (0.30 + zNorm*0.36));
      for(let i=0;i<20;i++){
        const ang=(i/20)*Math.PI*2 + ((Date.now()/450)%1)*Math.PI*2;
        const rr=sprayR*(0.18 + ((i%7)/7)*0.82);
        const px=nozzle.x + Math.cos(ang)*rr*(0.78+Math.random()*0.16);
        const py=nozzle.y + Math.sin(ang)*rr*0.62 + 8 + Math.random()*8;
        ctx.fillStyle='rgba(206,227,240,.42)';
        ctx.beginPath(); ctx.arc(px,py,1.6+Math.random()*1.1,0,Math.PI*2); ctx.fill();
      }
      ctx.strokeStyle='rgba(196,220,238,.22)';
      ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.ellipse(nozzle.x,nozzle.y+10,sprayR,sprayR*0.62,0,0,Math.PI*2); ctx.stroke();
    }

    if(nearest){
      const rootState = getPlantWaterState(nearest);
      const leafWet = plantLeafWetness(nearest, nearestIdx);
      const leafTake = intercept.top ? intercept.toLeaf : 0;
      const soilTake = intercept.top ? intercept.toSoil : 1;
      const badgeW = 118, badgeH = 52, bx = size.w-badgeW-10, by = size.h-badgeH-10;
      ctx.fillStyle='rgba(28,31,35,.48)';
      ctx.beginPath(); ctx.roundRect(bx,by,badgeW,badgeH,10); ctx.fill();
      const bar=(x,y,w,h,v,col)=>{ ctx.fillStyle='rgba(255,255,255,.08)'; ctx.beginPath(); ctx.roundRect(x,y,w,h,h/2); ctx.fill(); ctx.fillStyle=col; ctx.beginPath(); ctx.roundRect(x,y,Math.max(6,w*clamp(v,0,1)),h,h/2); ctx.fill(); };
      bar(bx+10, by+12, badgeW-20, 8, leafTake, '#96c983');
      bar(bx+10, by+25, badgeW-20, 8, soilTake, '#8aa4bf');
      bar(bx+10, by+38, badgeW-20, 8, leafWet, rootState.color);
    }

    const vignette=ctx.createRadialGradient(size.w*0.5,size.h*0.45,Math.min(size.w,size.h)*0.18,size.w*0.5,size.h*0.45,Math.max(size.w,size.h)*0.68);
    vignette.addColorStop(0,'rgba(0,0,0,0)');
    vignette.addColorStop(1,'rgba(0,0,0,.24)');
    ctx.fillStyle=vignette; ctx.fillRect(0,0,size.w,size.h);
  }
  function drawMoistureSensor(){
    const panel=$('#stageSensorPanel');
    if(panel) panel.classList.remove('hidden');
    if($('#moistureToggleBtn')) $('#moistureToggleBtn').textContent = `水分重ね: ${state.showMoisturePanel===false?'OFF':'ON'}`;
    if($('#stageMoistureToggleBtn')) $('#stageMoistureToggleBtn').textContent = `水分重ね: ${state.showMoisturePanel===false?'OFF':'ON'}`;
    if($('#moisturePanelState')) $('#moisturePanelState').textContent = state.showMoisturePanel===false ? 'OFF' : '重ね表示';
    const viewW = 340, viewH = 250;
    const left = clamp(state.pos.x - viewW/2, 0, Math.max(0,garden.w-viewW));
    const top = clamp(state.pos.y - viewH/2, 0, Math.max(0,garden.h-viewH));
    let total=0, count=0;
    const cols=10, rows=7;
    for(let gy=0; gy<rows; gy++){
      for(let gx=0; gx<cols; gx++){
        const pt={x:left + (gx+0.5)/cols*viewW, y:top + (gy+0.5)/rows*viewH};
        total += moistureAtPoint(pt); count += 1;
      }
    }
    const value = total/Math.max(1,count);
    if($('#moistureValue')) $('#moistureValue').innerHTML = `ノズル周辺の平均水分 <span class="sensorBadge" style="background:${moistureColor(value)}">${moistureText(value)}</span> ${value.toFixed(1)}`;
    if($('#moistureStatus')) $('#moistureStatus').textContent = '赤=不足 / 青=適正 / 黒=過多 / 最も近い1株';
    if($('#moisturePos')) $('#moisturePos').textContent = `X${Math.round(left)}〜${Math.round(left+viewW)} / Y${Math.round(top)}〜${Math.round(top+viewH)}`;
    const nearestPlant = state.plants.slice().sort((a,b)=>Math.hypot(a.x-state.pos.x,a.y-state.pos.y)-Math.hypot(b.x-state.pos.x,b.y-state.pos.y))[0];
    if($('#plantNeedLegend')){
      if(!nearestPlant) $('#plantNeedLegend').innerHTML='近くに野菜はありません';
      else {
        const info=getPlantWaterState(nearestPlant), [mi,ma]=getPlantTargetRange(nearestPlant);
        const d=Math.hypot(nearestPlant.x-state.pos.x, nearestPlant.y-state.pos.y);
        $('#plantNeedLegend').innerHTML = `<div><span class="sensorBadge" style="background:${info.color}">${plantLabels[nearestPlant.type]} ${stageLabels[nearestPlant.stage||'growing']}</span> 目安 ${mi}〜${ma} / 周辺平均 ${info.value.toFixed(1)} (${info.text})<div class="sensorSmall" style="margin-top:6px">最も近い株 / 距離 ${Math.round(d)} mm / X${Math.round(nearestPlant.x)} Y${Math.round(nearestPlant.y)}</div></div>`;
      }
    }
  }
  function describeStep(s){
    if(s.type==='move') return `Move To X${Math.round(s.x)} Y${Math.round(s.y)} Z${Math.round(s.z)}`;
    if(s.type==='safez') return 'Safe Zへ';
    if(s.type==='set_water') return `水量/半径 量${s.rate} 半径${s.radius}`;
    if(s.type==='water_on') return '水やり開始';
    if(s.type==='water_off') return '水やり停止';
    if(s.type==='wait') return `待機 ${s.arg||1}秒`;
    if(s.type==='reserve') return `開始予約 ${s.at||'未設定'}`;
    if(s.type==='home') return 'Home';
    if(s.type==='message') return `メッセージ: ${s.arg||''}`;
    return s.type;
  }
  function renderSequence(){
    const box=$('#seqList'); box.innerHTML='';
    state.sequence.forEach((s,i)=>{
      const el=document.createElement('div');
      el.className='seqItem';
      el.innerHTML=`<div><div class="seqTitle">${i+1}. ${describeStep(s)}</div><div class="seqMeta">${s.type}</div></div><div style="display:flex;gap:6px"><button class="btn small" data-up="${i}">↑</button><button class="btn small" data-down="${i}">↓</button><button class="btn small danger" data-del="${i}">削除</button></div>`;
      box.appendChild(el);
    });
    box.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ state.sequence.splice(+b.dataset.del,1); renderSequence(); renderAll(); saveState('自動保存'); });
    box.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.up; if(i>0) [state.sequence[i-1],state.sequence[i]]=[state.sequence[i],state.sequence[i-1]]; renderSequence(); renderAll(); saveState('自動保存'); });
    box.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.down; if(i<state.sequence.length-1) [state.sequence[i+1],state.sequence[i]]=[state.sequence[i],state.sequence[i+1]]; renderSequence(); renderAll(); saveState('自動保存'); });
  }
  function renderLog(){ $('#logBox').textContent = state.logs.join('\n'); }
  function requestRender(force=false){
    if(force){
      __renderQueued = false;
      renderAll();
      return;
    }
    if(__renderQueued) return;
    __renderQueued = true;
    requestAnimationFrame(()=>{
      __renderQueued = false;
      renderAll();
    });
  }
  function renderAll(){
    __lastIdleRenderAt = Date.now();
    $('#selX').textContent=Math.round(state.selected.x);
    $('#selY').textContent=Math.round(state.selected.y);
    $('#selZ').textContent=Math.round(state.selected.z);
    if($('#curX')) $('#curX').textContent=Math.round(state.pos.x);
    if($('#curY')) $('#curY').textContent=Math.round(state.pos.y);
    if($('#curZ')) $('#curZ').textContent=Math.round(state.pos.z);
    $('#saveChip').textContent=state.saveStamp;
    $('#modeChip').textContent=modeLabel();
    drawStage(); drawMap(); drawToolCamera(); drawMoistureSensor(); renderSequence(); renderLog(); updateMission(); checkGoalMode();
    if($('#togglePathBtn')) $('#togglePathBtn').textContent=`軌跡表示: ${state.showPaths===false?'OFF':'ON'}`;
    if($('#mapCoordChip')) $('#mapCoordChip').textContent = `選択 X${Math.round(state.selected.x)} / Y${Math.round(state.selected.y)} / Z${Math.round(state.selected.z)}`;
    if($('#jogStepLabel')) $('#jogStepLabel').textContent=`現在のステップ: ${state.jogStep||100}mm`;
    if($('#cameraZoomLabel') && $('#cameraZoom')) $('#cameraZoomLabel').textContent=`${(+$('#cameraZoom').value).toFixed(1)}x`;
    if($('#toolCamToggleBtn')) $('#toolCamToggleBtn').textContent=`手元カメラ: ${state.showToolCam===false?'OFF':'ON'}`;
    if($('#waterPulseLabel')) $('#waterPulseLabel').textContent = state.watering && state.waterStartTime ? `散水開始から ${((Date.now()-state.waterStartTime)/1000).toFixed(1)}秒` : '散水開始から 0.0秒';
    if($('#waterSprayModeLabel')) $('#waterSprayModeLabel').textContent = state.watering ? '現在位置から継続散水中' : 'WATER ONで現在位置から継続散水';
    $$('.jogStepBtn').forEach(btn=>btn.classList.toggle('primary', +btn.dataset.step===(state.jogStep||100))); 
  }

  function makeDroplets(radius, rate, z=state.pos.z){
    const zNorm = clamp((z-garden.zMin)/(garden.zMax-garden.zMin),0,1);
    const spreadFactor = 0.72 + zNorm*0.95;
    const count = Math.max(14, Math.min(48, Math.round(12 + radius*0.22 + rate*1.6 + zNorm*4)));
    const droplets=[];
    for(let i=0;i<count;i++){
      const ang=Math.random()*Math.PI*2;
      const spread=Math.pow(Math.random(),0.92)*radius*1.06*spreadFactor;
      droplets.push({
        dx:Math.cos(ang)*spread,
        dy:Math.sin(ang)*spread,
        len:0.7 + Math.random()*2.0,
        size:0.45 + Math.random()*0.75,
        zNorm
      });
    }
    return droplets;
  }
  function addWaterAt(pt, radius=state.waterRadius, rate=state.waterRate, strength=1){
    const z = pt.z ?? state.pos.z;
    const droplets = makeDroplets(radius, rate, z);
    state.waterHistory.push({x:pt.x,y:pt.y,z,radius,rate,ts:Date.now(),droplets});
    if(state.waterHistory.length>1200) state.waterHistory = state.waterHistory.slice(-1200);
    const zNorm = clamp((z-garden.zMin)/(garden.zMax-garden.zMin),0,1);
    const heightSpread = 0.88 + zNorm*0.42;
    const impactForce = 1.02 - zNorm*0.14;
    for(const d of droplets){
      const wx=clamp(pt.x + d.dx*heightSpread, 0, garden.w-1);
      const wy=clamp(pt.y + d.dy*heightSpread, 0, garden.h-1);
      const ix=Math.floor(wx/garden.w*garden.cols);
      const iy=Math.floor(wy/garden.h*garden.rows);
      const key=`${ix},${iy}`;
      const interception = canopyInterceptionAt(wx, wy);
      const soilGain = rate*0.0105*d.size*strength*impactForce*Math.max(0.55, interception.toSoil + interception.toLeaf*0.42);
      state.waterCells[key]=(state.waterCells[key]||0)+soilGain;
      if(interception.top){
        const leafKey = String(interception.top.idx);
        const leafGain = rate*0.0010*d.size*strength*interception.toLeaf;
        state.leafWater[leafKey] = clamp((state.leafWater[leafKey]||0) + leafGain, 0, 1.2);
      }
    }
  }
  function startContinuousWater(){
    if(waterInterval){ clearInterval(waterInterval); waterInterval=null; }
    if(waterElapsedTimer){ clearInterval(waterElapsedTimer); waterElapsedTimer=null; }
    state.watering=true;
    state.waterStartTime=Date.now();
    setStatus('水やり中');
    window.dispatchEvent(new CustomEvent('farmbot:water-started', {detail:{x:state.pos.x,y:state.pos.y,z:state.pos.z,radius:state.waterRadius,rate:state.waterRate}}));
    addWaterAt(state.pos, state.waterRadius, state.waterRate, 1.35);
    waterInterval=setInterval(()=>{
      if(!state.watering) return;
      addWaterAt(state.pos, state.waterRadius, state.waterRate, 1.35);
      renderAll();
    }, 120);
    waterElapsedTimer=setInterval(()=>{
      if(!state.watering || !state.waterStartTime){
        if($('#waterPulseLabel')) $('#waterPulseLabel').textContent='散水開始から 0.0秒';
        return;
      }
      if($('#waterPulseLabel')) $('#waterPulseLabel').textContent=`散水開始から ${((Date.now()-state.waterStartTime)/1000).toFixed(1)}秒`;
    }, 100);
    requestRender(true);
  }
  function stopContinuousWater(){
    const waterEndTime = Date.now();
    const waterSeconds = state.waterStartTime ? Math.max(0, (waterEndTime - state.waterStartTime) / 1000) : 0;
    const waterDetail = {x: state.pos.x, y: state.pos.y, z: state.pos.z, radius: state.waterRadius, rate: state.waterRate, seconds: waterSeconds, amount: Math.round(state.waterRate * Math.max(1, waterSeconds) * 10) / 10};
    if(waterInterval){ clearInterval(waterInterval); waterInterval=null; }
    if(waterElapsedTimer){ clearInterval(waterElapsedTimer); waterElapsedTimer=null; }
    state.watering=false;
    state.waterStartTime=null;
    setStatus('停止中');
    if($('#waterPulseLabel')) $('#waterPulseLabel').textContent='散水開始から 0.0秒';
    if($('#waterSprayModeLabel')) $('#waterSprayModeLabel').textContent='WATER ONで現在位置から継続散水';
    window.dispatchEvent(new CustomEvent('farmbot:water-applied', {detail: waterDetail}));
    saveState('自動保存');
    renderAll();
  }
  async function animateMove(target){
    if(running) return false;
    window.dispatchEvent(new CustomEvent('farmbot:move-started', {detail:{target}}));
    const start=deepClone(state.pos), end={x:clamp(target.x,0,garden.w), y:clamp(target.y,0,garden.h), z:clamp(target.z,garden.zMin,garden.zMax)};
    const duration=Math.max(350,dist(start,end)*(12-state.speed/10));
    running={cancel:false}; setStatus(state.watering?'移動中（水やり）':'移動中'); state.recentPath={a:start,b:end};
    return new Promise(resolve=>{
      const t0=performance.now();
      function frame(t){
        if(running.cancel){ running=null; setStatus('停止中'); resolve(false); return; }
        const p=clamp((t-t0)/duration,0,1);
        state.pos={x:lerp(start.x,end.x,p), y:lerp(start.y,end.y,p), z:lerp(start.z,end.z,p)};
        if(state.watering && Math.floor((t-t0)/240)!==Math.floor((t-t0-16)/240)) addWaterAt(state.pos, state.waterRadius, state.waterRate, 1.0);
        renderAll();
        if(p<1) requestAnimationFrame(frame);
        else {
          state.pos=end; state.pathHistory.unshift({a:start,b:end}); state.pathHistory=state.pathHistory.slice(0,18); state.recentPath={a:start,b:end};
          if(state.watering && Math.floor((t-t0)/240)!==Math.floor((t-t0-16)/240)) addWaterAt(state.pos, state.waterRadius, state.waterRate, 1.0);
          running=null; setStatus(state.watering?'水やり中':'停止中'); saveState('自動保存'); renderAll(); resolve(true);
        }
      }
      requestAnimationFrame(frame);
    });
  }
  async function goToSelected(){ const ok=await animateMove({x:+$('#inputX').value||0, y:+$('#inputY').value||0, z:clamp(+$('#inputZ').value||0,garden.zMin,garden.zMax)}); if(ok!==false){ tutorialEvent('moveComplete',{type:'goTo',pos:deepClone(state.pos)}); lessonEvent('move', {pos:deepClone(state.pos), target: deepClone(state.trainingScenario?.target || null), targetOk: isNearTrainingTarget(state.pos)}); } }
  async function goHome(){ if(running) return; await animateMove({x:0,y:0,z:0}); state.pos={x:0,y:0,z:0}; setSelected(0,0,0,true); log('Home 実行'); lessonEvent('home', {pos:deepClone(state.pos)}); saveState('自動保存'); renderAll(); }
  async function safeZ(){ if(running) return; await animateMove({x:state.pos.x,y:state.pos.y,z:0}); log('Safe Z 実行'); lessonEvent('safeZ', {pos:deepClone(state.pos)}); }
  function stopMotion(){ if(running){ running.cancel=true; log('停止'); } if(state.watering) stopContinuousWater(); else { setStatus('停止中'); renderAll(); } }

  async function runSequence(){
    if(running) return;
    log('シークエンス開始');
    for(const s of state.sequence){
      if(s.type==='reserve'){
        const target=new Date(s.at);
        if(!isNaN(target.getTime())){
          const ms=target.getTime()-Date.now();
          if(ms>0){ setStatus('予約待機'); log(`予約待機 ${target.toLocaleString('ja-JP')}`); await new Promise(r=>setTimeout(r,ms)); }
        }
      } else if(s.type==='set_water'){
        state.waterRadius=clamp(+s.radius||state.waterRadius,8,70);
        state.waterRate=clamp(+s.rate||state.waterRate,1,14);
        $('#waterRadius').value=state.waterRadius; $('#waterRate').value=state.waterRate; $('#seqRadius').value=state.waterRadius; $('#seqRate').value=state.waterRate;
        $('#waterRadiusLabel').textContent=`半径 ${state.waterRadius}`; $('#waterRateLabel').textContent=`量 ${state.waterRate}`;
        log(`水量/半径設定: 半径 ${state.waterRadius} 量 ${state.waterRate}`);
      } else if(s.type==='move'){ await animateMove(s);
      } else if(s.type==='safez'){ await safeZ();
      } else if(s.type==='water_on'){ startContinuousWater(); log('水やり開始');
      } else if(s.type==='water_off'){ stopContinuousWater(); log('水やり停止');
      } else if(s.type==='wait'){ const sec=Math.max(1,+s.arg||1); log(`待機 ${sec}秒`); await new Promise(r=>setTimeout(r,sec*1000));
      } else if(s.type==='home'){ await goHome();
      } else if(s.type==='message'){ log(s.arg||'メッセージ'); }
    }
    setStatus(state.watering?'水やり中':'停止中'); log('シークエンス完了'); saveState('自動保存'); checkGoalMode(); lessonEvent('seqRun', {sequence:deepClone(state.sequence)});
  }
  function exportState(){
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`farmbot_${state.mode}_${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  function importState(file){
    const fr=new FileReader();
    fr.onload=()=>{ try{ state={...defaults(),...JSON.parse(fr.result), mode:state.mode}; applyStateToControls(); renderAll(); saveState('読込'); log('状態読込'); }catch{ alert('読込に失敗しました'); } };
    fr.readAsText(file,'utf-8');
  }
  function refreshSeqFields(){
    const t=$('#seqType').value;
    $('#seqMoveFields').style.display=t==='move'?'grid':'none';
    $('#seqWaterFields').style.display=t==='set_water'?'grid':'none';
    $('#seqReserveField').style.display=t==='reserve'?'block':'none';
    $('#seqArg').placeholder=t==='wait'?'秒数':t==='message'?'メッセージ':'補足値';
  }
  function showMapInfo(){
    const info=$('#mapInfo'), wrap=info.parentElement.getBoundingClientRect();
    if(mapInfoHideTimer){ clearTimeout(mapInfoHideTimer); mapInfoHideTimer = null; }
    info.classList.remove('hidden');
    info.innerHTML=`<div style="font-weight:700;margin-bottom:4px">選択座標</div>
    <div style="margin-bottom:6px">X ${Math.round(state.selected.x)} / Y ${Math.round(state.selected.y)} / Z ${Math.round(state.selected.z)}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn small" id="mapMoveBtn">移動</button>
      <button class="btn small" id="mapWaterBtn">現在位置で水やり</button>
      <button class="btn small" id="mapSeqBtn">Seq追加</button>
    </div>`;
    const bubbleWidth = Math.min(230, Math.max(170, wrap.width - 20));
    const margin = 10;
    const desiredLeft = lastMapClickPx.x + 12;
    const desiredTop = lastMapClickPx.y + 12;
    const maxLeft = Math.max(margin, wrap.width - bubbleWidth - margin);
    const maxTop = Math.max(margin, wrap.height - 96);
    info.style.width = `${bubbleWidth}px`;
    info.style.left = `${Math.max(margin, Math.min(maxLeft, desiredLeft))}px`;
    info.style.top = `${Math.max(margin, Math.min(maxTop, desiredTop))}px`;
    info.querySelector('#mapMoveBtn').onclick=()=>goToSelected();
    info.querySelector('#mapWaterBtn').onclick=()=>{
      startContinuousWater(); log('現在位置で水やり開始');
    };
    info.querySelector('#mapSeqBtn').onclick=()=>{
      state.sequence.push({type:'move',x:Math.round(state.selected.x),y:Math.round(state.selected.y),z:Math.round(state.selected.z)});
      renderSequence(); renderAll(); saveState('自動保存'); log('マップからシークエンス追加');
      lessonEvent('seqAdd', {seqType:'move', sequence:deepClone(state.sequence)});
    };
    mapInfoHideTimer = setTimeout(()=>{
      info.classList.add('hidden');
      mapInfoHideTimer = null;
    },3000);
  }
  function activateTab(panel){
    $$('.tab').forEach(x=>x.classList.remove('active'));
    const tab=$(`.tab[data-panel="${panel}"]`); if(tab) tab.classList.add('active');
    $$('.panel').forEach(p=>p.classList.add('hidden'));
    const target=$(`#panel-${panel}`); if(target) target.classList.remove('hidden');
    if(window.FarmBotLeftPane && window.FarmBotLeftPane.syncFromDesktop) window.FarmBotLeftPane.syncFromDesktop();
  }
  function clearTutorialLocks(){
    $$('.tutorialBlocked,.tutorialAllowed,.highlight').forEach(el=>el.classList.remove('tutorialBlocked','tutorialAllowed','highlight'));
  }
  function allowTutorialSelector(sel){
    $$(sel).forEach(node=>{
      let cur=node;
      while(cur && cur!==document.body){
        cur.classList.remove('tutorialBlocked');
        cur.classList.add('tutorialAllowed');
        cur=cur.parentElement;
      }
    });
  }
  function applyTutorialLocks(allowSelectors=[]){
    clearTutorialLocks();
    ['.topbar','.left','.right'].forEach(sel=>{ const el=$(sel); if(el) el.classList.add('tutorialBlocked'); });
    allowSelectors.forEach(allowTutorialSelector);
  }
  function updateTutorialStatus(text, ok=false){
    const box=$('#tutStatus'); if(!box) return;
    box.className='tutStatus';
    box.innerHTML = ok ? `✅ ${text}` : `👉 ${text}`;
  }
  function tutorialEvent(name,data={}){
    if(!tutorial.active) return;
    const lesson=tutorialCatalog[tutorial.lessonId];
    const step=lesson?.steps?.[tutorial.step];
    if(!step || tutorial.stepDone || !step.expected || step.expected.name!==name) return;
    const passed = step.expected.check ? !!step.expected.check(data) : true;
    if(!passed) return;
    tutorial.stepDone=true;
    updateTutorialStatus('できました。次へ進めます。', true);
    const btn=$('#tutNext'); if(btn) btn.disabled=false;
  }
  function openTutorialLessonMenu(focusId='movement_basic'){
    tutorial.active=false;
    clearTutorialLocks();
    const overlay=$('#tutorialOverlay');
    overlay.style.display='block';
    document.body.classList.add('tutorialMode');
    const cards=Object.entries(tutorialCatalog).map(([id,v])=>`<div class="lessonCard"><h4>${v.title}</h4><div>${v.subtitle}</div><div class="lessonMeta">完全初心者向け。見本→操作→確認の順で、1つずつ進みます。</div><div style="margin-top:10px"><button class="btn small ${focusId===id?'primary':''}" data-tutchoose="${id}">この内容を学ぶ</button></div></div>`).join('');
    overlay.innerHTML=`<div class="lessonChooser"><div style="display:flex;justify-content:space-between;gap:16px;align-items:start"><div><div class="badge">チュートリアル目次</div><h2 style="margin:8px 0 6px">学びたい内容を選びます</h2><div class="muted">本の目次のように、最初の授業をここから選びます。1つの授業はその場で完結します。</div></div><button class="btn small" id="closeChooserBtn">目次を閉じる</button></div><div class="lessonGrid">${cards}</div></div>`;
    $('#closeChooserBtn').onclick=()=>{ overlay.style.display='none'; overlay.innerHTML=''; clearTutorialLocks(); document.body.classList.remove('tutorialMode'); };
    $$('[data-tutchoose]').forEach(btn=>btn.onclick=()=>{ state.tutorialLesson=btn.dataset.tutchoose; saveState('自動保存'); startTutorial(btn.dataset.tutchoose); });
  }
  function startTutorial(lessonId='movement_basic'){
    tutorial.active=true; tutorial.lessonId = tutorialCatalog[lessonId] ? lessonId : 'movement_basic'; tutorial.step=0; tutorial.stepDone=false;
    state.tutorialLesson = tutorial.lessonId;
    const overlay=$('#tutorialOverlay');
    overlay.style.display='block';
    document.body.classList.add('tutorialMode');
    seedMode('tutorial');
    applyStateToControls();
    renderAll();
    function show(){
      const lesson=tutorialCatalog[tutorial.lessonId];
      const steps=lesson.steps;
      if(tutorial.step>=steps.length){
        overlay.style.display='none'; overlay.innerHTML=''; tutorial.active=false; document.body.classList.remove('tutorialMode'); clearTutorialLocks();
        state.mission={title:'チュートリアル完了', detail:`${lesson.title} を完了しました。次は別の授業を選ぶか、フリーモードで復習できます。`, done:true};
        updateMission(); renderAll(); saveState('自動保存');
        return;
      }
      const st=steps[tutorial.step];
      if(st.sel.includes('tab[data-panel="water"]')) activateTab('control');
      applyTutorialLocks(st.allow || [st.sel]);
      if(st.sel.includes('tab[data-panel="water"]')) allowTutorialSelector('.leftTopTabs');
      const target=$(st.sel); if(target) target.classList.add('highlight');
      tutorial.stepDone=!!st.freeNext;
      overlay.innerHTML='';
      const card=document.createElement('div');
      card.className='tutorialCard';
      const last=tutorial.step===steps.length-1;
      card.innerHTML=`<div style="font-weight:700;margin-bottom:6px">${lesson.title} ${tutorial.step+1}/${steps.length}</div><div style="font-size:20px;font-weight:700;margin-bottom:8px">${st.title}</div><div style="line-height:1.8;margin-bottom:10px">${st.text}</div><div class="tutGoal"><strong>今すること:</strong> ${st.goal}</div><div id="tutStatus" class="tutStatus"></div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><button class="btn small" id="tutBackToMenu">目次へ戻る</button><button class="btn small primary" id="tutNext" ${tutorial.stepDone?'':'disabled'}>${last?'完了':'次へ'}</button></div>`;
      overlay.appendChild(card);
      updateTutorialStatus(tutorial.stepDone ? '内容を確認できたら次へ進めます。' : st.goal, tutorial.stepDone);
      $('#tutBackToMenu').onclick=()=>openTutorialLessonMenu(tutorial.lessonId);
      $('#tutNext').onclick=()=>{ if(!tutorial.stepDone) return; clearTutorialLocks(); tutorial.step++; show(); };
    }
    show();
  }

  function bind(){
    $$('.modeCard').forEach(el=>el.onclick=()=>{ try{ initMode(el.dataset.mode); } catch(err){ console.error(err); alert('モード開始に失敗しました\n詳細: '+(err?.message||err)); } });
    $$('.tab').forEach(t=>t.onclick=()=>{
      $$('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
      $$('.panel').forEach(p=>p.classList.add('hidden'));
      $('#panel-'+t.dataset.panel).classList.remove('hidden');
      tutorialEvent('openTab',{panel:t.dataset.panel});
      if(window.FarmBotLeftPane && window.FarmBotLeftPane.syncFromDesktop) window.FarmBotLeftPane.syncFromDesktop();
      if(t.dataset.panel!=='plants' && $('#plantMode').value!=='off'){ $('#plantMode').value='off'; log('植物配置モードを自動OFF'); }
    });

    $('#mapCanvas').addEventListener('click',e=>{
      const size=resizeCanvas($('#mapCanvas'));
      const rect=e.target.getBoundingClientRect();
      lastMapClickPx={x:e.clientX-rect.left,y:e.clientY-rect.top};
      const pt=pxToMap({x:e.clientX-rect.left,y:e.clientY-rect.top},size);
      const mode=$('#plantMode').value;
      if(isGrowthPlantLocked() && (mode==='place' || mode==='delete')){ log('育成モード中は植物配置を変更できません'); $('#plantMode').value='off'; updateGrowthPlantLockUI(); return; }
      if(mode==='place'){ state.plants.push(makePlant(pt.x,pt.y,$('#plantType').value,$('#plantStage').value)); log('植物配置'); saveState('自動保存'); renderAll(); return; }
      if(mode==='delete'){
        const idx=state.plants.findIndex(p=>Math.hypot(p.x-pt.x,p.y-pt.y)<45);
        if(idx>=0){ state.plants.splice(idx,1); log('植物削除'); saveState('自動保存'); renderAll(); }
        return;
      }
      if(window.FarmBotGrowthMode && window.FarmBotGrowthMode.handleMapClick){
        try{ if(window.FarmBotGrowthMode.handleMapClick(pt)){ renderAll(); return; } }catch(err){ console.warn('growth map tool failed', err); }
      }
      setSelected(pt.x,pt.y,state.pos.z,true);
      tutorialEvent('mapClick',{x:pt.x,y:pt.y});
    });

    $('#goBtn').onclick=()=>goToSelected();
    $('#homeBtn').onclick=()=>goHome();
    $('#safeZBtn').onclick=()=>safeZ();
    $('#stopBtn').onclick=()=>stopMotion();
    $('#waterStartBtn').onclick=()=>{ log('現在位置で水やり開始'); startContinuousWater(); tutorialEvent('waterOn'); lessonEvent('waterOn', {pos:deepClone(state.pos), target:deepClone(state.trainingScenario?.target || null), targetOk:isNearTrainingTarget(state.pos)}); };
    $('#waterStopBtn').onclick=()=>{ if(state.watering) stopContinuousWater(); tutorialEvent('waterOff'); lessonEvent('waterOff', {pos:deepClone(state.pos), target:deepClone(state.trainingScenario?.target || null), targetOk:isNearTrainingTarget(state.pos)}); log('水やり停止'); };
    $('#clearWaterBtn').onclick=()=>{ state.waterCells={}; state.waterHistory=[]; renderAll(); saveState('自動保存'); };
    $('#clearPathBtn').onclick=()=>{ state.pathHistory=[]; state.recentPath=null; renderAll(); saveState('自動保存'); };
    if($('#clearPathBtn2')) $('#clearPathBtn2').onclick=()=>{ state.pathHistory=[]; state.recentPath=null; renderAll(); saveState('自動保存'); };
    if($('#togglePathBtn')) $('#togglePathBtn').onclick=()=>{ state.showPaths = state.showPaths===false ? true : false; renderAll(); saveState('自動保存'); };
    if($('#moistureToggleBtn')) $('#moistureToggleBtn').onclick=()=>{ state.showMoisturePanel = state.showMoisturePanel===false ? true : false; renderAll(); saveState('自動保存'); };
    if($('#stageMoistureToggleBtn')) $('#stageMoistureToggleBtn').onclick=()=>{ state.showMoisturePanel = state.showMoisturePanel===false ? true : false; renderAll(); saveState('自動保存'); };
    if($('#toolCamToggleBtn')) $('#toolCamToggleBtn').onclick=()=>{ state.showToolCam = state.showToolCam===false ? true : false; renderAll(); saveState('自動保存'); };

    $('#speedRange').oninput=e=>{ state.speed=+e.target.value; $('#speedLabel').textContent=`${state.speed}%`; $('#speedChip').textContent=`速度 ${state.speed}%`; saveState('自動保存'); };
    $$('.jogStepBtn').forEach(btn=>btn.onclick=()=>setJogStep(+btn.dataset.step));
    if($('#applyJogCustomBtn')) $('#applyJogCustomBtn').onclick=()=>{ const v=clamp(+($('#jogCustomInput').value||100),1,10000); setJogStep(v); $('#jogCustomInput').value=v; };
    if($('#jogCustomInput')) $('#jogCustomInput').onkeydown=(e)=>{ if(e.key==='Enter'){ const v=clamp(+($('#jogCustomInput').value||100),1,10000); setJogStep(v); $('#jogCustomInput').value=v; } };
    ['envRegion','envSeason','envTime','envPrevDay'].forEach(id=>{ if($("#"+id)) $("#"+id).onchange=()=>{ state.env={region:$('#envRegion').value,season:$('#envSeason').value,time:$('#envTime').value,prevDay:$('#envPrevDay').value}; updateEnvPreview(); renderAll(); saveState('自動保存'); }; });
    if($('#jogXMinusBtn')) $('#jogXMinusBtn').onclick=()=>jog(-1,0,0);
    if($('#jogXPlusBtn')) $('#jogXPlusBtn').onclick=()=>jog(1,0,0);
    if($('#jogYMinusBtn')) $('#jogYMinusBtn').onclick=()=>jog(0,-1,0);
    if($('#jogYPlusBtn')) $('#jogYPlusBtn').onclick=()=>jog(0,1,0);
    if($('#jogZPlusBtn')) $('#jogZPlusBtn').onclick=()=>jog(0,0,1);
    if($('#jogZMinusBtn')) $('#jogZMinusBtn').onclick=()=>jog(0,0,-1);
    if($('#jogXYCenterBtn')) $('#jogXYCenterBtn').onclick=()=>setSelected(state.pos.x,state.pos.y,state.selected.z,true);
    if($('#cameraZoom')) $('#cameraZoom').oninput=()=>{ renderAll(); saveState('自動保存'); };
    $('#waterRadius').oninput=e=>{ state.waterRadius=+e.target.value; $('#waterRadiusLabel').textContent=`半径 ${state.waterRadius}`; $('#seqRadius').value=state.waterRadius; saveState('自動保存'); renderAll(); };
    $('#waterRate').oninput=e=>{ state.waterRate=Math.min(14,+e.target.value); $('#waterRateLabel').textContent=`量 ${state.waterRate}`; $('#seqRate').value=state.waterRate; saveState('自動保存'); renderAll(); };
    $('#inputZ').oninput=e=>{ e.target.value=clamp(+e.target.value||0,garden.zMin,garden.zMax); };
    $('#seqZ').oninput=e=>{ e.target.value=clamp(+e.target.value||0,garden.zMin,garden.zMax); };

    $('#clearPlantsBtn').onclick=()=>{ if(isGrowthPlantLocked()){ log('育成モード中は植物を全消去できません'); return; } state.plants=[]; renderAll(); saveState('自動保存'); };
    $('#seedPracticeBtn').onclick=()=>{ if(isGrowthPlantLocked()){ log('育成モード中は練習配置を入れ替えできません'); return; } const targetMode = state.mode==='free' ? 'practice_quick' : state.mode; seedMode(targetMode); state.mode = targetMode; applyStateToControls(); updateGrowthPlantLockUI(); renderAll(); saveState('読込'); };
    $('#plantType').onchange=()=>{ $('#plantWaterHint').textContent = waterRangeText($('#plantType').value, $('#plantStage').value); };
    $('#plantStage').onchange=()=>{ $('#plantWaterHint').textContent = waterRangeText($('#plantType').value, $('#plantStage').value); };
    $('#seqType').onchange=refreshSeqFields;
    $('#addSeqFromSelectionBtn').onclick=()=>{ $('#seqX').value=Math.round(state.selected.x); $('#seqY').value=Math.round(state.selected.y); $('#seqZ').value=Math.round(state.selected.z); };
    $('#mapToSeqBtn').onclick=()=>{ $('#seqX').value=Math.round(state.selected.x); $('#seqY').value=Math.round(state.selected.y); $('#seqZ').value=Math.round(state.selected.z); $$('.tab').forEach(x=>x.classList.remove('active')); $('.tab[data-panel="sequence"]').classList.add('active'); $$('.panel').forEach(p=>p.classList.add('hidden')); $('#panel-sequence').classList.remove('hidden'); };
    $('#addSeqBtn').onclick=()=>{
      const t=$('#seqType').value; let s={type:t};
      if(t==='move') s={type:t,x:+$('#seqX').value||0,y:+$('#seqY').value||0,z:clamp(+$('#seqZ').value||0,garden.zMin,garden.zMax)};
      if(t==='wait'||t==='message') s.arg=$('#seqArg').value;
      if(t==='set_water') s={type:t,radius:clamp(+$('#seqRadius').value||state.waterRadius,8,70),rate:clamp(+$('#seqRate').value||state.waterRate,1,14)};
      if(t==='reserve') s={type:t,at:$('#seqDateTime').value};
      state.sequence.push(s); renderSequence(); renderAll(); saveState('自動保存');
      lessonEvent('seqAdd', {seqType:s.type, step:deepClone(s), sequence:deepClone(state.sequence)});
    };
    $('#runSeqBtn').onclick=()=>runSequence();
    $('#clearSeqBtn').onclick=()=>{ state.sequence=[]; renderSequence(); renderAll(); saveState('自動保存'); };
    $('#clearLogBtn').onclick=()=>{ state.logs=[]; renderLog(); saveState('自動保存'); };
    $('#backHomeBtn').onclick=()=>{ stopMotion(); try{ if(window.FarmBotGrowthMode && window.FarmBotGrowthMode.close) window.FarmBotGrowthMode.close(); }catch(e){ console.warn('growth close on home failed', e); } $('#appRoot').classList.add('hidden'); $('#homeScreen').classList.remove('hidden'); saveState('自動保存'); };
    if($('#densityBtn')) $('#densityBtn').onclick=cycleUiDensity;
    $$('.quickJump').forEach(btn=>btn.onclick=()=>{
      const target = btn.dataset.target;
      if(target === 'camera'){
        const el = $('#stageHud');
        if(el) el.scrollIntoView({block:'nearest', behavior:'smooth'});
        return;
      }
      activateTab(target);
      const panel = $('#panel-'+target);
      if(panel) panel.scrollIntoView({block:'nearest', behavior:'smooth'});
    });
    $('#tutorialBtn').onclick=()=>openTutorialLessonMenu(state.tutorialLesson || 'movement_basic');
    $('#exportBtn').onclick=()=>exportState();
    $('#importBtn').onclick=()=>$('#importFile').click();
    $('#importFile').onchange=e=>e.target.files[0]&&importState(e.target.files[0]);
    if($('#stageZoom')) $('#stageZoom').oninput=e=>{ state.stageZoom=+e.target.value; renderAll(); centerScrollableCanvas($('#stageCanvas'),0.5,0.55); saveState('自動保存'); };
    if($('#mapZoom')) $('#mapZoom').oninput=e=>{ state.mapZoom=+e.target.value; renderAll(); centerScrollableCanvas($('#mapCanvas'), state.selected.x/garden.w, state.selected.y/garden.h); saveState('自動保存'); };
    if($('#stageCenterBtn')) $('#stageCenterBtn').onclick=()=>centerScrollableCanvas($('#stageCanvas'),0.5,0.55);
    if($('#stageViewResetBtn')) $('#stageViewResetBtn').onclick=()=>{ state.stageOrbit={yaw:-0.85,pitch:0.56}; renderAll(); saveState('自動保存'); };
    if($('#stageViewTopBtn')) $('#stageViewTopBtn').onclick=()=>{ state.stageOrbit={yaw:-0.85,pitch:0.92}; renderAll(); saveState('自動保存'); };
    const stageViewportEl = $('#stageViewport');
    if(stageViewportEl){
      let drag=null;
      stageViewportEl.addEventListener('pointerdown', e=>{
        if(e.target && e.target.id==='stageCanvas'){
          drag={x:e.clientX,y:e.clientY,yaw:(state.stageOrbit?.yaw ?? -0.85),pitch:(state.stageOrbit?.pitch ?? 0.56)};
          stageViewportEl.setPointerCapture?.(e.pointerId);
        }
      });
      stageViewportEl.addEventListener('pointermove', e=>{
        if(!drag) return;
        const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
        const touchBoost = (e.pointerType==='touch' || (window.FarmBotMobileShell?.isPhoneLike?.() && window.FarmBotMobileShell?.isLandscape?.())) ? 1.9 : 1.0;
        state.stageOrbit={yaw:drag.yaw + dx*0.008*touchBoost, pitch:clamp(drag.pitch + dy*0.006*touchBoost, 0.18, 1.18)};
        renderAll();
      });
      const clearDrag=()=>{ if(drag){ drag=null; saveState('自動保存'); } };
      stageViewportEl.addEventListener('pointerup', clearDrag);
      stageViewportEl.addEventListener('pointercancel', clearDrag);
    }
    if($('#mapCenterBtn')) $('#mapCenterBtn').onclick=()=>centerScrollableCanvas($('#mapCanvas'), state.selected.x/garden.w, state.selected.y/garden.h);
    let resizeRenderTimer=null;
    window.addEventListener('resize',()=>{
      if(resizeRenderTimer) clearTimeout(resizeRenderTimer);
      resizeRenderTimer=setTimeout(()=>requestRender(true), 80);
    });
  }


  /* ===== v20.7 overrides: split / camera realism / info panel ===== */
  function cameraPanelSet(id, value){ const el=$(id); if(el) el.textContent = value; }
  function cameraBarSet(id, value, color){
    const el=$(id); if(!el) return;
    el.style.width = `${Math.max(4, Math.min(100, value*100))}%`;
    if(color) el.style.background = color;
  }
  function seededPlantRand(seed){
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function speciesPlantProfile(plant){
    const type = plant.type || 'lettuce';
    const stage = plant.stage || 'growing';
    const density = leafDensityScore(plant);
    const byType = {
      lettuce:{habit:'rosette', spread:1.16, height:0.66, rings:[2,4,5], leaves:[7,13,19], length:1.02, width:1.18, tilt:0.22, lift:-1.6, yScale:0.62, fruit:0},
      spinach:{habit:'rosette', spread:1.02, height:0.82, rings:[2,4,5], leaves:[6,12,17], length:1.12, width:1.04, tilt:0.30, lift:-1.9, yScale:0.66, fruit:0},
      basil:{habit:'upright', spread:0.78, height:1.06, rings:[2,3,4], leaves:[5,9,12], length:0.92, width:0.88, tilt:0.52, lift:-2.5, yScale:0.74, fruit:0},
      tomato:{habit:'upright', spread:0.94, height:1.16, rings:[2,4,5], leaves:[6,12,17], length:1.08, width:0.90, tilt:0.56, lift:-2.9, yScale:0.72, fruit:4},
      cucumber:{habit:'vine', spread:1.08, height:0.96, rings:[2,4,5], leaves:[6,11,15], length:1.00, width:1.14, tilt:0.40, lift:-2.2, yScale:0.70, fruit:3},
      carrot:{habit:'feathery', spread:0.82, height:1.12, rings:[2,4,5], leaves:[7,13,18], length:1.18, width:0.58, tilt:0.62, lift:-3.0, yScale:0.82, fruit:0},
      radish:{habit:'tuft', spread:0.90, height:0.98, rings:[2,4,5], leaves:[6,11,15], length:1.08, width:0.76, tilt:0.52, lift:-2.4, yScale:0.78, fruit:2}
    };
    const cfg = byType[type] || byType.lettuce;
    const stageIdx = stage==='seedling' ? 0 : stage==='growing' ? 1 : 2;
    return {
      habit: cfg.habit,
      spreadMul: cfg.spread * (0.92 + density*0.10),
      heightMul: cfg.height,
      rings: cfg.rings[stageIdx],
      leafCount: cfg.leaves[stageIdx],
      lenMul: cfg.length,
      widMul: cfg.width,
      tiltMul: cfg.tilt,
      liftMul: cfg.lift,
      yScale: cfg.yScale,
      fruitCount: stage==='fruiting' ? cfg.fruit : 0
    };
  }

  function drawDetailedLeaf(ctx, seed, len, wid, tone, wetLevel, scale){
    const jitter1 = (seededPlantRand(seed)-0.5) * wid * 0.35;
    const jitter2 = (seededPlantRand(seed+2)-0.5) * wid * 0.28;
    const topBend = (seededPlantRand(seed+3)-0.5) * len * 0.12;
    const grad=ctx.createLinearGradient(-wid*0.3*scale,-len*0.9*scale,wid*0.3*scale,len*0.9*scale);
    grad.addColorStop(0,'rgba(255,255,255,.22)');
    grad.addColorStop(0.15,adjustHex(tone,22));
    grad.addColorStop(0.55,tone);
    grad.addColorStop(0.84,adjustHex(tone,-22));
    grad.addColorStop(1,adjustHex(tone,-42));
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.moveTo(0,-len*1.02*scale);
    ctx.bezierCurveTo(wid*0.82*scale + jitter1,-len*0.46*scale + topBend,wid*0.78*scale + jitter2,len*0.18*scale,wid*0.16*scale,len*0.96*scale);
    ctx.quadraticCurveTo(0,len*1.08*scale,-wid*0.18*scale,len*0.98*scale);
    ctx.bezierCurveTo(-wid*0.84*scale + jitter2,len*0.18*scale,-wid*0.76*scale + jitter1,-len*0.42*scale + topBend,0,-len*1.02*scale);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle='rgba(22,56,25,.26)';
    ctx.lineWidth=Math.max(0.65,0.85*scale);
    ctx.beginPath();
    ctx.moveTo(0,-len*0.9*scale);
    ctx.quadraticCurveTo(-wid*0.05*scale,-len*0.06*scale,0,len*0.86*scale);
    ctx.stroke();

    // side veins
    ctx.strokeStyle='rgba(35,72,34,.11)';
    ctx.lineWidth=Math.max(0.45,0.55*scale);
    for(let t=0.24;t<0.78;t+=0.16){
      const y=(-len*0.66 + len*1.36*t)*scale;
      ctx.beginPath();
      ctx.moveTo(0,y);
      ctx.lineTo((wid*(0.18+0.42*(1-t)))*scale,y-2.2*scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0,y);
      ctx.lineTo((-wid*(0.18+0.42*(1-t)))*scale,y-1.8*scale);
      ctx.stroke();
    }

    if(wetLevel>0.04){
      for(let i=0;i<Math.min(4, 1 + Math.floor(wetLevel*10)); i++){
        const rx = (seededPlantRand(seed+10+i)-0.5) * wid * 0.65 * scale;
        const ry = (-len*0.35 + seededPlantRand(seed+15+i)*len*0.95) * scale;
        const r = (0.7 + seededPlantRand(seed+20+i)*1.4) * scale;
        ctx.fillStyle=`rgba(223,235,245,${Math.min(0.5,0.16 + wetLevel*0.28)})`;
        ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.32)';
        ctx.beginPath(); ctx.arc(rx-r*0.25, ry-r*0.25, Math.max(0.3,r*0.25), 0, Math.PI*2); ctx.fill();
      }
    }
  }

  drawTopPlant = function(ctx,x,y,plant,scale=1){
    const leaf = plantColors[plant.type] || '#5da04d';
    const density = leafDensityScore(plant);
    const wetLevel = plantLeafWetness(plant, (state.plants||[]).indexOf(plant));
    const stage = plant.stage || 'growing';
    const profile = speciesPlantProfile(plant);
    const baseSpread = (stage==='seedling' ? 15 : stage==='growing' ? 24 : 31);
    const spread = baseSpread * profile.spreadMul;
    const rings = profile.rings;
    const leafCount = profile.leafCount;
    ctx.save();
    ctx.translate(x,y);

    const shadowGrad = ctx.createRadialGradient(0,10*scale,4,0,10*scale,spread*1.18*scale);
    shadowGrad.addColorStop(0,'rgba(16,14,11,.22)');
    shadowGrad.addColorStop(1,'rgba(16,14,11,0)');
    ctx.fillStyle=shadowGrad;
    ctx.beginPath(); ctx.ellipse(0,10*scale,spread*1.02*scale,Math.max(6.5,spread*0.26)*scale,0,0,Math.PI*2); ctx.fill();

    const leafItems=[];
    for(let layer=0; layer<rings; layer++){
      const localCount = Math.max(4, Math.round(leafCount - layer*(profile.habit==='upright'?1.4:1.8)));
      const ringSpread = spread*(profile.habit==='rosette' ? (0.14 + layer*0.14) : profile.habit==='feathery' ? (0.10 + layer*0.12) : (0.12 + layer*0.13));
      const layerLift = (profile.liftMul - layer*(profile.habit==='upright'?1.9:1.3)) * scale;
      for(let i=0;i<localCount;i++){
        const seed = (plant.x*0.013 + plant.y*0.021 + layer*11 + i*3.7 + density*7);
        const base = ((Math.PI*2)/localCount)*i + seededPlantRand(seed)*0.52 + layer*(profile.habit==='upright'?0.34:0.20);
        const front = Math.max(0, Math.sin(base));
        const lenBase = (stage==='seedling'?11:15) + layer*2.3 + seededPlantRand(seed+1.5)*3.8 + density*1.4;
        const widBase = (stage==='seedling'?4.9:6.1) + layer*0.66 + seededPlantRand(seed+5.5)*1.6;
        const len = lenBase * profile.lenMul * (0.94 + front*0.14);
        const wid = widBase * profile.widMul * (0.92 + front*0.10);
        const tilt = (seededPlantRand(seed+8)-0.5) * (0.24 + profile.tiltMul);
        const dx = (seededPlantRand(seed+13)-0.5) * (profile.habit==='rosette'?4.0:5.2) * scale;
        const dy = (seededPlantRand(seed+17)-0.5) * (profile.habit==='upright'?3.2:4.4) * scale;
        leafItems.push({depth: Math.sin(base) + layer*0.22, draw:()=>{
          ctx.save();
          ctx.rotate(base);
          ctx.translate(ringSpread*scale + dx, layerLift + dy + Math.sin(base)*profile.yScale*2.2*scale);
          ctx.rotate(tilt);
          drawDetailedLeaf(ctx, seed, len, wid, leaf, wetLevel, scale);
          ctx.restore();
        }});
      }
    }
    leafItems.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());

    const coreGrad=ctx.createRadialGradient(0,0,1,0,0,8.2*scale);
    coreGrad.addColorStop(0,'#886344');
    coreGrad.addColorStop(1,stage==='fruiting' ? '#5b3a28' : '#678c46');
    ctx.fillStyle=coreGrad;
    ctx.beginPath(); ctx.arc(0,0,6.8*scale,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.15)';
    ctx.beginPath(); ctx.arc(-1.8*scale,-2.1*scale,1.9*scale,0,Math.PI*2); ctx.fill();

    if(profile.fruitCount>0){
      const fruitCol = plant.type==='tomato' ? '#c4473b' : plant.type==='cucumber' ? '#3c8e4d' : '#8dc45b';
      for(let i=0;i<profile.fruitCount;i++){
        const ang = (Math.PI*2/profile.fruitCount)*i + 0.4;
        const rr = spread*(plant.type==='tomato'?0.28:0.34);
        const fx = Math.cos(ang)*rr;
        const fy = Math.sin(ang)*rr*0.62 + 2*scale;
        const fr = (plant.type==='cucumber' ? 4.6 : 3.8) * (0.9 + seededPlantRand(i+plant.x*0.1)*0.24);
        ctx.fillStyle=fruitCol;
        if(plant.type==='cucumber'){
          ctx.save();
          ctx.translate(fx*scale, fy*scale);
          ctx.rotate(ang*0.45);
          ctx.beginPath(); ctx.ellipse(0,0,fr*1.5*scale,fr*0.78*scale,0,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.16)';
          ctx.beginPath(); ctx.ellipse(-fr*0.35*scale,-fr*0.18*scale,fr*0.42*scale,fr*0.18*scale,0,0,Math.PI*2); ctx.fill();
          ctx.restore();
        }else{
          ctx.beginPath(); ctx.arc(fx*scale,fy*scale,fr*scale,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='rgba(255,255,255,.16)';
          ctx.beginPath(); ctx.arc((fx-1.2)*scale,(fy-1.4)*scale,fr*0.38*scale,0,Math.PI*2); ctx.fill();
        }
      }
    }
    ctx.restore();
  };

  drawToolCamera = function(){
    const hud=$('#stageHud'); if(hud) hud.classList.toggle('hidden', state.showToolCam===false);
    const c=$('#toolCamCanvas'); if(!c || state.showToolCam===false) return;
    const size=resizeCanvas(c), ctx=c.getContext('2d');
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); ctx.clearRect(0,0,size.w,size.h);
    const zoom = +($('#cameraZoom')?.value || 1.8);
    $('#cameraZoomLabel').textContent=`${zoom.toFixed(1)}x`;

    // 手元カメラは常にノズル真上中心。端でも画面端へ寄せず、散水円が欠けない余白を確保する
    const baseViewW = clamp(860 / zoom, 180, 780);
    const baseViewH = clamp(620 / zoom, 140, 560);
    const sprayPadWorld = Math.max(state.waterRadius * 2.6, 130);
    const viewW = Math.max(baseViewW, sprayPadWorld * 2.0);
    const viewH = Math.max(baseViewH, sprayPadWorld * 2.0);
    const left = state.pos.x - viewW/2;
    const bottom = state.pos.y - viewH/2;
    const sx = size.w/viewW, sy = size.h/viewH;
    // 畑マップ・動作ビューと同じく「上が奥、下が手前」の向きに合わせる
    const toLocal = (x,y)=>({x:(x-left)*sx, y:size.h-((y-bottom)*sy)});
    const nozzle={x:size.w*0.5, y:size.h*0.5};
    const intercept = canopyInterceptionAt(state.pos.x,state.pos.y);
    const nearest = intercept.top ? intercept.top.plant : nearestPlantTo(state.pos.x, state.pos.y);
    const nearestIdx = intercept.top ? intercept.top.idx : ((state.plants||[]).indexOf(nearest));
    const zNorm = clamp((state.pos.z-garden.zMin)/(garden.zMax-garden.zMin),0,1);
    const sprayR = Math.max(34, (state.waterRadius / Math.max(1, viewW)) * size.w * (5.4 + zNorm*0.28));
    const sprayRy = sprayR;

    const bg = ctx.createLinearGradient(0,0,0,size.h);
    bg.addColorStop(0,'#ddc7af'); bg.addColorStop(0.45,'#b58f71'); bg.addColorStop(1,'#745543');
    ctx.fillStyle=bg; ctx.fillRect(0,0,size.w,size.h);
    const gardenRect = {x:(0-left)*sx, y:size.h-((garden.h-bottom)*sy), w:garden.w*sx, h:garden.h*sy};
    ctx.strokeStyle='rgba(255,255,255,.16)';
    ctx.lineWidth=1.2;
    ctx.strokeRect(gardenRect.x, gardenRect.y, gardenRect.w, gardenRect.h);


    // 土の粒感
    for(let i=0;i<380;i++){
      const x=(i*131.77)%size.w, y=(i*89.53)%size.h;
      const a=0.016 + (i%7)*0.0032;
      ctx.fillStyle=`rgba(${102+(i%5)*10},${74+(i%4)*8},${56+(i%3)*6},${a})`;
      ctx.beginPath(); ctx.ellipse(x,y,1.8+(i%4),1.0+((i*3)%3),((i%9)-4)*0.12,0,Math.PI*2); ctx.fill();
    }

    const cellW = garden.w/garden.cols, cellH = garden.h/garden.rows;
    Object.entries(state.waterCells||{}).forEach(([key,amt])=>{
      const wet=soilWetStyle(amt); if(!wet) return;
      const [ix,iy]=key.split(',').map(Number);
      const gx=(ix+0.5)*cellW, gy=(iy+0.5)*cellH;
      if(gx<left-cellW*2||gx>left+viewW+cellW*2||gy<bottom-cellH*2||gy>bottom+viewH+cellH*2) return;
      const p=toLocal(gx,gy);
      const rx=Math.max(4.5,cellW*sx*0.52), ry=Math.max(3.8,cellH*sy*0.52);
      const g=ctx.createRadialGradient(p.x-1,p.y-1,1,p.x,p.y,Math.max(rx,ry)*1.08);
      g.addColorStop(0, wet.fill); g.addColorStop(0.74, wet.fill); g.addColorStop(1, wet.edge || 'rgba(46,33,22,.18)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(p.x,p.y,rx,ry,0,0,Math.PI*2); ctx.fill();
      if(wet.puddle){
        ctx.fillStyle=`rgba(228,236,244,${Math.max(0.08,wet.gloss)})`;
        ctx.beginPath(); ctx.ellipse(p.x-rx*0.12,p.y-ry*0.16,rx*0.36,ry*0.2,-0.28,0,Math.PI*2); ctx.fill();
      }
    });

    const plantScale = clamp(0.42 * zoom, 0.5, 1.55);
    const visiblePlants=[];
    (state.plants||[]).forEach((p, idx)=>{
      const camReach = canopyRadius(p) * 0.62; // 端でも欠けにくいよう少し余裕を持たせる
      if(p.x<left-camReach||p.x>left+viewW+camReach||p.y<bottom-camReach||p.y>bottom+viewH+camReach) return;
      visiblePlants.push({p, idx, q:toLocal(p.x,p.y)});
    });

    visiblePlants.sort((a,b)=>a.p.y-b.p.y).forEach(({p,idx,q})=>{
      drawTopPlant(ctx, q.x, q.y, p, plantScale);
      const wet = plantLeafWetness(p, idx);
      if(wet>0.03){
        ctx.fillStyle=`rgba(220,234,244,${Math.min(0.24,0.08+wet*0.16)})`;
        ctx.beginPath(); ctx.ellipse(q.x-3.5*plantScale,q.y-6*plantScale,7*plantScale,2.7*plantScale,-0.18,0,Math.PI*2); ctx.fill();
      }
      const dx=q.x-nozzle.x, dy=q.y-nozzle.y;
      const d=Math.hypot(dx,dy);
      const canopyR=(12 + leafDensityScore(p)*9)*plantScale;
      const sprayInfluence = clamp(1 - d / Math.max(18, sprayR + canopyR*0.9), 0, 1);
      if(state.watering && sprayInfluence>0.06){
        ctx.fillStyle=`rgba(198,221,239,${0.045 + sprayInfluence*0.08})`;
        ctx.beginPath(); ctx.ellipse(q.x,q.y+1*plantScale,canopyR*0.95,canopyR*0.38,0,0,Math.PI*2); ctx.fill();
      }
    });

    // 散水の見え方は水やり設定の半径値に直接追従
    if(state.watering){
      for(let i=0;i<68;i++){
        const ang=(i/68)*Math.PI*2 + ((Date.now()/620)%1)*Math.PI*2;
        const rr=sprayR*(0.08 + ((i%13)/13)*0.94);
        const px=nozzle.x + Math.cos(ang)*rr*(0.98+seededPlantRand(i+Date.now()*0.001)*0.035);
        const py=nozzle.y + Math.sin(ang)*rr*(0.92+zNorm*0.05) + seededPlantRand(i+9+Date.now()*0.001)*2.4;
        const sz=0.8 + (i%3)*0.42;
        ctx.fillStyle='rgba(205,225,240,.42)';
        ctx.beginPath(); ctx.arc(px,py,sz,0,Math.PI*2); ctx.fill();
      }
      ctx.strokeStyle='rgba(196,220,238,.26)'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.ellipse(nozzle.x,nozzle.y,sprayR,sprayRy,0,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.18)';
      ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.ellipse(nozzle.x,nozzle.y,sprayR*0.66,sprayRy*0.66,0,0,Math.PI*2); ctx.stroke();
    }

    // ノズル位置だけを小さく示す
    ctx.strokeStyle='rgba(255,255,255,.24)'; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(nozzle.x-8,nozzle.y); ctx.lineTo(nozzle.x+8,nozzle.y); ctx.moveTo(nozzle.x,nozzle.y-8); ctx.lineTo(nozzle.x,nozzle.y+8); ctx.stroke();

    ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.strokeRect(9,9,size.w-18,size.h-18);
    const vignette=ctx.createRadialGradient(size.w*0.5,size.h*0.45,Math.min(size.w,size.h)*0.18,size.w*0.5,size.h*0.45,Math.max(size.w,size.h)*0.70);
    vignette.addColorStop(0,'rgba(0,0,0,0)'); vignette.addColorStop(1,'rgba(0,0,0,.22)');
    ctx.fillStyle=vignette; ctx.fillRect(0,0,size.w,size.h);

    if(nearest){
      const rootState = getPlantWaterState(nearest);
      const leafWet = plantLeafWetness(nearest, nearestIdx);
      const need = `${rootState.target[0].toFixed(1)}〜${rootState.target[1].toFixed(1)}`;
      const current = rootState.value.toFixed(1);
      cameraPanelSet('#cameraNeedNow', `${need} / ${current}`);
      cameraBarSet('#cameraNeedBar', clamp(rootState.value / Math.max(1, rootState.target[1]), 0, 1.2), rootState.color);
      const hitLabel = intercept.toLeaf > 0.44 ? '葉多め / 根元にも届く' : intercept.toLeaf > 0.20 ? '葉と根元に分かれる' : '根元へ届きやすい';
      cameraPanelSet('#cameraHitInfo', `${Math.round(state.waterRadius)}mm / ${hitLabel}`);
      cameraBarSet('#cameraLeafBar', clamp(state.waterRadius/220,0,1), 'linear-gradient(90deg,#6aa8ff,#95d7d0)');
      cameraPanelSet('#cameraRootState', `${rootState.text} / 葉の濡れ ${Math.round(leafWet*100)}%`);
      cameraBarSet('#cameraWetBar', leafWet, 'linear-gradient(90deg,#9fb8cf,#d5e3ef)');
    }else{
      cameraPanelSet('#cameraNeedNow', '-- / --');
      cameraPanelSet('#cameraHitInfo', `${Math.round(state.waterRadius)}mm / --`);
      cameraPanelSet('#cameraRootState', '-- / --');
      cameraBarSet('#cameraNeedBar', 0.04);
      cameraBarSet('#cameraLeafBar', clamp(state.waterRadius/220,0,1));
      cameraBarSet('#cameraWetBar', 0.04);
    }
    const temp = envAverageTemp();
    const climate = getClimateProfile();
    const drySense = temp>=28 ? '乾きやすい' : temp<=14 ? '乾きにくい' : '標準';
    cameraPanelSet('#cameraEnvInfo', `${climate.label} / ${drySense}`);
    cameraPanelSet('#cameraEnvNote', `季節や時間帯を変えた時に、乾き方や葉の濡れ方の違いを見るための表示です。操作中は必要水分・現在水分・植物の状態を中心に見てください。`);
  };

  state.stageZoom = 1.1;




  /* ===== v21.8 real image leaf override ===== */
  const __leafSpritePaths = ['assets/leaf_sprite_1.png','assets/leaf_sprite_2.png','assets/leaf_sprite_3.png','assets/leaf_sprite_4.png'];
  const __leafSprites = __leafSpritePaths.map(src => {
    const img = new Image();
    img.src = src;
    img.decoding = 'async';
    return img;
  });
  let __leafSpritesReady = false;
  let __leafLoadCount = 0;
  __leafSprites.forEach(img => {
    img.onload = () => {
      __leafLoadCount++;
      if(__leafLoadCount >= __leafSprites.length){
        __leafSpritesReady = true;
        try{ renderAll(); }catch(e){}
      }
    };
  });

  function drawLeafSpriteReal(ctx, sprite, x, y, length, width, angle, wetLevel, depth, lift=0){
    ctx.save();
    ctx.translate(x, y - lift);
    ctx.rotate(angle);

    // subtle shadow
    ctx.save();
    ctx.translate(2 + depth*1.1, 5 + depth*1.4 + lift*0.15);
    ctx.rotate(0.05);
    ctx.fillStyle='rgba(0,0,0,.08)';
    ctx.beginPath();
    ctx.ellipse(0, 0, width*0.55, length*0.16, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    const targetW = width * 1.92;
    const targetH = length * 2.06;
    if(__leafSpritesReady && sprite && sprite.complete && sprite.naturalWidth){
      ctx.globalAlpha = clamp(0.86 + depth*0.08, 0.82, 1);
      ctx.drawImage(sprite, -targetW/2, -targetH*0.82, targetW, targetH);

      if(wetLevel > 0.03){
        // matte leaf: keep wet effect subtle
        ctx.globalCompositeOperation = 'source-atop';
        const g = ctx.createLinearGradient(0,-targetH*0.72,0,targetH*0.55);
        g.addColorStop(0, `rgba(255,255,255,${0.02 + wetLevel*0.05})`);
        g.addColorStop(0.45, `rgba(210,230,240,${0.02 + wetLevel*0.04})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-targetW/2, -targetH*0.86, targetW, targetH*1.4);
        ctx.globalCompositeOperation = 'source-over';

        const drops = Math.min(4, 1 + Math.floor(wetLevel*8));
        for(let i=0;i<drops;i++){
          const dx = (-0.22 + seededPlantRand(length + i*7)*0.44) * width;
          const dy = (-0.36 + seededPlantRand(width + i*11)*0.76) * length;
          const rr = Math.max(0.9, width*0.07*(0.75 + seededPlantRand(i+19)));
          ctx.fillStyle=`rgba(217,233,244,${0.10 + wetLevel*0.12})`;
          ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI*2); ctx.fill();
        }
      }
    }else{
      ctx.fillStyle='rgba(82,145,72,.92)';
      ctx.beginPath();
      ctx.ellipse(0,0,width*0.52,length*0.94,0,0,Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawTopPlant = function(ctx,x,y,plant,scale=1){
    const density = leafDensityScore(plant);
    const wetLevel = plantLeafWetness(plant, (state.plants||[]).indexOf(plant));
    const stage = plant.stage || 'growing';
    const stageMul = stage==='seedling' ? 0.66 : stage==='growing' ? 1.00 : 1.18;

    const rings = stage==='seedling' ? 2 : stage==='growing' ? 3 : 4;
    const baseLeaves = stage==='seedling' ? 5 : stage==='growing' ? 7 : 8;
    const spread = (10.5 + density*6.8) * stageMul * scale;

    ctx.save();
    ctx.translate(x,y);

    const sg = ctx.createRadialGradient(0, 8*scale, 2, 0, 8*scale, spread*1.34);
    sg.addColorStop(0,'rgba(18,12,8,.14)');
    sg.addColorStop(1,'rgba(18,12,8,0)');
    ctx.fillStyle=sg;
    ctx.beginPath(); ctx.ellipse(0, 8*scale, spread*1.16, spread*0.38, 0, 0, Math.PI*2); ctx.fill();

    const front = [];
    for(let ring=0; ring<rings; ring++){
      const count = baseLeaves + ring + Math.round(density*1.2);
      const radialBase = spread * (0.08 + ring*0.15);
      const depth = ring / Math.max(1, rings-1);
      for(let i=0; i<count; i++){
        const seed = plant.x*0.019 + plant.y*0.013 + ring*23.1 + i*4.91 + density*8.7;
        const phase = (Math.PI*2/count)*i + seededPlantRand(seed)*0.44 + ring*0.10;
        const frontBias = Math.sin(phase);
        const radial = radialBase * (0.78 + seededPlantRand(seed+2.2)*0.36);
        const lx = Math.cos(phase)*radial + (seededPlantRand(seed+7)-0.5)*spread*0.10;
        const ly = Math.sin(phase)*radial*0.54 + (seededPlantRand(seed+10)-0.5)*spread*0.10;
        const length = (16 + ring*4.1 + seededPlantRand(seed+3.7)*5.2 + density*2.0) * stageMul * scale * (0.98 + frontBias*0.08);
        const width  = (6.3 + seededPlantRand(seed+6.8)*1.9 + ring*0.66) * stageMul * scale * (0.94 + frontBias*0.08);
        const angle  = phase + Math.PI/2 + (seededPlantRand(seed+11)-0.5)*0.34;
        const lift = Math.max(0, (frontBias*6.2 + ring*2.9)) * scale;
        const sprite = __leafSprites[(Math.abs(Math.floor(seed*1000)) % __leafSprites.length)];
        const item = (ctx)=>drawLeafSpriteReal(ctx, sprite, lx, ly - ring*0.55*scale, length, width, angle, wetLevel, depth, frontBias >= 0.10 ? lift : lift*0.35);
        if(frontBias < 0.15) item(ctx); else front.push(item);
      }
    }
    for(const fn of front) fn(ctx);

    const coreGrad = ctx.createRadialGradient(0,0,1,0,0,5.4*scale);
    coreGrad.addColorStop(0, '#7a5a40');
    coreGrad.addColorStop(1, '#4d7a40');
    ctx.fillStyle=coreGrad;
    ctx.beginPath(); ctx.arc(0,0,5.2*scale,0,Math.PI*2); ctx.fill();

    if(stage==='fruiting'){
      const fruitCol = plant.type==='tomato' ? '#c4473b' : plant.type==='cucumber' ? '#4e9b4c' : '#94c75f';
      [[-7,-4,3.8],[6,-2,3.5],[-3,7,3.3],[9,5,3.1]].forEach(([fx,fy,fr])=>{
        ctx.fillStyle=fruitCol;
        ctx.beginPath(); ctx.arc(fx*scale,fy*scale,fr*scale,0,Math.PI*2); ctx.fill();
      });
    }
    ctx.restore();
  };



  window.addEventListener('farmbot:training-command', (ev)=>{
    const detail = ev.detail || {};
    const map = {
      startBasicMove:'move_basic',
      startWaterBasic:'water_basic',
      startSequenceBasic:'sequence_basic',
      startMissionWater:'mission_water'
    };
    if(map[detail.command]){
      applyTrainingScenario({id:map[detail.command], target:detail.target, tolerance:detail.tolerance});
    }
  });

  function seedGrowthSeasonLayout(kind){
    if($('#appRoot')?.classList.contains('hidden')) initMode('free');
    const seasonal = {
      spring_growth:[
        ['lettuce',300,560,'growing'],['spinach',520,560,'growing'],['radish',740,560,'growing'],['lettuce',960,560,'seedling'],
        ['spinach',300,360,'growing'],['radish',520,360,'seedling'],['lettuce',740,360,'growing'],['spinach',960,360,'seedling'],
        ['radish',1180,460,'growing']
      ],
      summer_growth:[
        ['tomato',320,560,'growing'],['cucumber',560,560,'growing'],['basil',800,560,'growing'],['tomato',1040,560,'seedling'],
        ['cucumber',320,340,'seedling'],['basil',560,340,'growing'],['tomato',800,340,'growing'],['cucumber',1040,340,'growing'],
        ['basil',1240,450,'seedling']
      ],
      winter_growth:[
        ['spinach',320,560,'growing'],['carrot',560,560,'growing'],['radish',800,560,'growing'],['spinach',1040,560,'seedling'],
        ['carrot',320,340,'seedling'],['radish',560,340,'seedling'],['spinach',800,340,'growing'],['carrot',1040,340,'growing'],
        ['radish',1240,450,'growing']
      ]
    };
    const spec = seasonal[kind] || seasonal.spring_growth;
    state.plants = spec.map(([type,x,y,stage])=>makePlant(x,y,type,stage));
    state.sequence = Array.isArray(state.sequence) ? state.sequence : [];
    state.pathHistory=[]; state.recentPath=null; state.waterCells={}; state.waterHistory=[]; state.leafWater={};
    state.pos = {x:0,y:0,z:0}; state.selected={x:0,y:0,z:0};
    applyStateToControls(); renderAll(); saveState('育成配置');
    return deepClone(state.plants || []);
  }

  window.FarmBotAppBridge = {
    ensureFreeMode(){
      if($('#appRoot')?.classList.contains('hidden')) initMode('free');
      return true;
    },
    applyGrowthSession(growthSession){
      if(!growthSession || !Array.isArray(growthSession.plants)) return;
      if($('#appRoot')?.classList.contains('hidden')) initMode('free');
      state.growthModeActive = true;
      state.growthPlantLocked = true;
      state.growthSeasonLabel = growthSession.label || '育成';
      if(growthSession.resetMainStateOnce){
        state.pos = {x:0,y:0,z:0};
        state.selected = {x:0,y:0,z:0};
        state.watering = false;
        state.waterStartTime = null;
        state.waterCells = {};
        state.waterHistory = [];
        state.leafWater = {};
        state.pathHistory = [];
        state.recentPath = null;
        state.sequence = Array.isArray(state.sequence) ? state.sequence : [];
      }
      state.plants = growthSession.plants.map((p)=>{
        const type = p.species || p.type || 'lettuce';
        const stage = p.stage || (p.growth>=75 ? 'fruiting' : p.growth>=28 ? 'growing' : 'seedling');
        return {id:p.id, type, x:p.x, y:p.y, stage, height:effectivePlantHeight(type, stage), health:p.health, water:p.waterPct, waterPct:p.waterPct, fertility:p.fertility, growth:p.growth};
      });
      state.mission={title:'練習モードB / 育成中', detail:'通常のMove・周辺機器・シークエンスを使いながら、育成時間と植物状態を管理します。植物配置は育成開始時に固定されています。', done:false};
      updateMission();
      updateGrowthPlantLockUI();
      applyStateToControls();
      renderPlants(); renderAll(); saveState('自動保存');
    },
    getPlantsSnapshot(){ return deepClone(state.plants || []); },
    seedGrowthSeasonLayout,
    setPlantLock(locked){ state.growthModeActive = !!locked; state.growthPlantLocked = !!locked; updateGrowthPlantLockUI(); saveState('自動保存'); },
    getCurrentPosition(){ return deepClone(state.pos); },
    render(){ renderAll(); },
    activateTab
  };

  if(window.FarmBotRightPane && window.FarmBotRightPane.init) window.FarmBotRightPane.init();
  if(window.FarmBotLeftPane && window.FarmBotLeftPane.init) window.FarmBotLeftPane.init();
  if(window.FarmBotMobileShell && window.FarmBotMobileShell.init) window.FarmBotMobileShell.init();
  bind(); refreshSeqFields();
  setInterval(()=>{
    if(state.watering) return;
    if(document.hidden) return;
    const now = Date.now();
    const mapWrap = $('#mapCanvas')?.parentElement;
    const stageWrap = $('#stageCanvas')?.closest('.stageViewport');
    const stableViewport = (!!mapWrap && mapWrap.clientHeight > 0 && !!stageWrap && stageWrap.clientHeight > 0);
    if(!stableViewport) return;
    if(now - __lastIdleRenderAt < 1800) return;
    requestRender();
  }, 2200);
})();
