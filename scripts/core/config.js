(() => {
  const SimConfig = {};
  const garden = {w:3000,h:1500,zMin:-300,zMax:0, cols:60, rows:30};
  const $ = s=>document.querySelector(s), $$ = s=>[...document.querySelectorAll(s)];
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
  const now=()=>new Date().toLocaleTimeString('ja-JP');
  const icons={tomato:'🍅', lettuce:'🥬', carrot:'🥕', radish:'🌱', cucumber:'🥒', basil:'🌿', spinach:'🥬'};
  const plantLabels={tomato:'トマト', lettuce:'レタス', carrot:'にんじん', radish:'ラディッシュ', cucumber:'きゅうり', basil:'バジル', spinach:'ほうれん草'};
  const stageLabels={seedling:'苗', growing:'成長中', fruiting:'実なり'};
  const stageHeightScale={seedling:0.42, growing:0.72, fruiting:1};
  const stageEmoji={seedling:'🌱', growing:'🌿', fruiting:'✨'};
  const heights={tomato:130, lettuce:85, carrot:55, radish:45, cucumber:125, basil:74, spinach:68};
  const plantColors={tomato:'#5da04d', lettuce:'#6ab56a', carrot:'#78b84d', radish:'#83c566', cucumber:'#5aa050', basil:'#4b9f5a', spinach:'#4d9b57'};
  const targetWater={
    tomato:{seedling:[3,7], growing:[6,11], fruiting:[9,15]},
    lettuce:{seedling:[2,5], growing:[4,8], fruiting:[6,10]},
    carrot:{seedling:[2,4], growing:[3,6], fruiting:[4,8]},
    radish:{seedling:[1.5,3.5], growing:[2.5,5.5], fruiting:[3.5,6.5]},
    cucumber:{seedling:[3,7], growing:[6,11], fruiting:[8,14]},
    basil:{seedling:[2,5], growing:[3,7], fruiting:[4,8]},
    spinach:{seedling:[2,5], growing:[4,8], fruiting:[5,9]}
  };
  const rootRadiusByStage={seedling:110,growing:170,fruiting:240};
  const canopyReachByStage={seedling:55,growing:110,fruiting:150};
  const speciesCanopyFactor={tomato:0.88,lettuce:0.72,carrot:0.94,radish:0.9,cucumber:0.68,basil:0.74,spinach:0.76};
  const climateProfiles={
    sapporo:{label:'北海道 札幌', temp:{spring:8, summer:22, autumn:12, winter:-2}, humidity:{spring:52, summer:68, autumn:61, winter:58}},
    tokyo:{label:'東京', temp:{spring:16, summer:28, autumn:19, winter:7}, humidity:{spring:58, summer:74, autumn:65, winter:54}},
    nagoya:{label:'名古屋', temp:{spring:17, summer:29, autumn:19, winter:6}, humidity:{spring:57, summer:72, autumn:64, winter:53}},
    osaka:{label:'大阪', temp:{spring:17, summer:29, autumn:20, winter:7}, humidity:{spring:58, summer:73, autumn:64, winter:54}},
    fukuoka:{label:'福岡', temp:{spring:17, summer:28, autumn:20, winter:8}, humidity:{spring:61, summer:77, autumn:67, winter:57}},
    naha:{label:'沖縄 那覇', temp:{spring:23, summer:30, autumn:27, winter:19}, humidity:{spring:74, summer:80, autumn:76, winter:71}}
  };
  const deepClone=o=>JSON.parse(JSON.stringify(o));

  const keyFor = mode => `farmbot_sim_v24_0_${mode}`;

  const defaults = () => ({
    mode:'free', pos:{x:0,y:0,z:0}, selected:{x:0,y:0,z:0}, speed:60, status:'停止中', watering:false, stageZoom:1.1, mapZoom:1.2,
    waterRadius:24, waterRate:3, plants:[], pathHistory:[], recentPath:null, waterCells:{}, waterHistory:[], leafWater:{}, sequence:[], waterStartTime:null,
    logs:[`[${now()}] 起動`], saveStamp:'未保存', mission:{title:'自由操作', detail:'目標なし', done:false}, showPaths:true, showMoisturePanel:true, showToolCam:true, jogStep:100,
    env:{region:'tokyo',season:'spring',time:'morning',prevDay:'normal'}, stageOrbit:{yaw:-0.85,pitch:0.56}
  });
  let state = defaults();
  let running = null;
  let tutorial = {active:false, step:0, stepDone:false, lessonId:null};

  Object.assign(SimConfig, {garden,$,$$,clamp,lerp,dist,now,icons,plantLabels,stageLabels,stageHeightScale,stageEmoji,heights,plantColors,targetWater,rootRadiusByStage,canopyReachByStage,speciesCanopyFactor,climateProfiles,deepClone,defaults,keyFor});
  window.FarmBotSimConfig = SimConfig;
})();
