(() => {
  const STORAGE_KEY = 'farmbot_active_cassette_v1';

  const trainingA = {
    title: '練習モードA',
    subtitle: '操作を覚えるためのスキル練習パック',
    mode: 'practice_quick',
    cards: [
      {id:'move_basic', title:'基本操作', tag:'練習', desc:'座標を選び、Move / Safe Z / Home の流れを確認します。', goal:'選択座標へ移動し、Homeへ戻る操作を反復する。'},
      {id:'water_basic', title:'水やり', tag:'練習', desc:'植物の必要水量を見て、半径と散水量を調整します。', goal:'不足・適正・過湿の違いを見ながら散水する。'},
      {id:'sequence_basic', title:'シークエンス', tag:'練習', desc:'Move と Water を順番に並べ、実行の流れを確認します。', goal:'座標移動と水やりを1つの手順として組む。'},
      {id:'mission_water', title:'課題モード', tag:'課題', desc:'条件つきミッションで、正確さ・水量・移動回数を意識します。', goal:'指定株を適正水分に近づけ、過湿を避ける。', targetMode:'practice_goal'}
    ]
  };

  const growthB = {
    title: '練習モードB',
    subtitle: '3か月の栽培を短時間で追体験する育成パック（設計導入版）',
    mode: 'practice_goal',
    cards: [
      {id:'spring_growth', title:'春野菜', tag:'育成', desc:'レタス・ほうれん草・ラディッシュを中心に、苗から収穫までの水管理を体験します。', goal:'春野菜の成長段階に合わせて水やりとシークエンスを調整する。'},
      {id:'summer_growth', title:'夏野菜', tag:'育成', desc:'トマト・きゅうり・バジルを中心に、乾きやすい環境での水管理を体験します。', goal:'高温時の乾きやすさを見て、水量と頻度を調整する。'},
      {id:'winter_growth', title:'冬野菜', tag:'育成', desc:'低温・乾きにくい条件で、過湿を避ける管理を体験します。', goal:'少ない水量と間隔を意識し、根腐れを避ける。'},
      {id:'load_growth', title:'保存データを読込', tag:'再開', desc:'前回保存した育成データから再開します。植物配置・品種・進行日数は保存時の状態を維持します。', goal:'途中から同じ畑を続ける。'}
    ]
  };

  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function saveSelection(pack, card){
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      pack: pack.title,
      packMode: pack.mode,
      id: card.id,
      title: card.title,
      tag: card.tag,
      desc: card.desc,
      goal: card.goal,
      startedAt: new Date().toISOString()
    }));
  }

  function readSelection(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch { return null; }
  }

  function ensureOverlay(){
    let overlay = qs('#cassetteOverlay');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'cassetteOverlay';
    overlay.className = 'cassetteOverlay hidden';
    overlay.innerHTML = `
      <div class="cassettePanel" role="dialog" aria-modal="true" aria-labelledby="cassetteTitle">
        <div class="cassetteHead">
          <div>
            <div class="cassetteKicker">モードパック読込</div>
            <h2 id="cassetteTitle">練習モード</h2>
            <p id="cassetteSubtitle">読み込む内容を選択してください。</p>
          </div>
          <button class="cassetteClose" type="button" aria-label="閉じる">×</button>
        </div>
        <div class="cassetteGrid" id="cassetteGrid"></div>
        <div class="cassetteFooter">
          <div class="cassetteNote">本体機能はそのままに、練習内容だけをカセットのように読み込みます。重い育成モードは後から独立拡張できます。</div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    qs('.cassetteClose', overlay).addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (ev) => { if(ev.target === overlay) closeOverlay(); });
    return overlay;
  }

  function closeOverlay(){
    const overlay = qs('#cassetteOverlay');
    if(overlay) overlay.classList.add('hidden');
  }

  function openPack(pack){
    const overlay = ensureOverlay();
    qs('#cassetteTitle', overlay).textContent = pack.title;
    qs('#cassetteSubtitle', overlay).textContent = pack.subtitle;
    const grid = qs('#cassetteGrid', overlay);
    grid.innerHTML = '';
    const oldOptions = qs('#growthStartOptions', overlay);
    if(oldOptions) oldOptions.remove();
    if(pack.title === '練習モードB'){
      const opt = document.createElement('div');
      opt.id = 'growthStartOptions';
      opt.className = 'growth-difficulty';
      opt.innerHTML = `
        <label>難易度
          <select id="growthDifficultySelect">
            <option value="beginner">初級：水分許容広め・イベント少なめ</option>
            <option value="normal" selected>中級：標準</option>
            <option value="advanced">上級：水分許容狭め・イベントやや多め</option>
          </select>
        </label>
        <label>植物量
          <select id="growthPlantAmountSelect">
            <option value="small">少ない（6株）</option>
            <option value="medium" selected>中程度（9株）</option>
            <option value="large">多い（12株）</option>
          </select>
        </label>`;
      grid.before(opt);
    }
    pack.cards.forEach(card => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cassetteCard';
      btn.innerHTML = `
        <span class="cassetteTag">${card.tag}</span>
        <strong>${card.title}</strong>
        <span>${card.desc}</span>
        <em>${card.goal}</em>`;
      btn.addEventListener('click', () => startCassette(pack, card));
      grid.appendChild(btn);
    });
    overlay.classList.remove('hidden');
  }

  function startCassette(pack, card){
    saveSelection(pack, card);
    closeOverlay();

    // 練習モードBは本体の通常モードへ遷移させず、育成カセットを直接開く。
    // 植物は開始時に自動生成し、そのセッション内では変更不可。
    if(pack.title === '練習モードB'){
      if(window.FarmBotBasicLesson) window.FarmBotBasicLesson.stop();
      if(window.FarmBotGrowthMode){
        if(card.id === 'load_growth') window.FarmBotGrowthMode.openLoad();
        else {
          const difficulty = qs('#growthDifficultySelect')?.value || 'normal';
          const plantAmount = qs('#growthPlantAmountSelect')?.value || 'medium';
          window.FarmBotGrowthMode.open(card.id, {difficulty, plantAmount});
        }
        window.setTimeout(applyCassetteHud, 80);
        return;
      }
      alert('育成モードの読込に失敗しました。ページを再読み込みしてください。');
      return;
    }

    const targetMode = card.targetMode || pack.mode;
    const modeCard = qs(`.modeCard[data-mode="${targetMode}"]`);
    if(modeCard && typeof modeCard.onclick === 'function'){
      modeCard.onclick();
      if(window.FarmBotBasicLesson){
        if(pack.title === '練習モードA') window.FarmBotBasicLesson.start(card.id);
        else window.FarmBotBasicLesson.stop();
      }
      window.setTimeout(applyCassetteHud, 80);
      window.setTimeout(applyCassetteHud, 400);
    } else {
      alert('モード読込に失敗しました。ページを再読み込みしてください。');
    }
  }

  function applyCassetteHud(){
    const sel = readSelection();
    if(!sel) return;
    const mission = qs('#missionBox');
    if(mission){
      mission.innerHTML = `
        <div class="cassetteMissionTitle">${sel.pack} / ${sel.title} <span class="badge">${sel.tag}</span></div>
        <div class="cassetteMissionDesc">${sel.desc}</div>
        <div class="cassetteMissionGoal">今回の目標：${sel.goal}</div>`;
    }
    const chip = qs('#modeChip');
    if(chip) chip.textContent = `${sel.pack}：${sel.title}`;
    ensureCassetteDock(sel);
  }

  function ensureCassetteDock(sel){
    let dock = qs('#cassetteDock');
    if(!dock){
      dock = document.createElement('div');
      dock.id = 'cassetteDock';
      dock.className = 'cassetteDock';
      const left = qs('.leftBody') || qs('.left');
      if(left) left.prepend(dock);
    }
    dock.innerHTML = `
      <div class="cassetteDockHead"><span>読込中</span><strong>${sel.title}</strong></div>
      <div class="cassetteDockText">${sel.goal}</div>
      <div class="cassetteDockActions">
        <button class="btn small" type="button" data-cassette-open="A">練習A目次</button>
        <button class="btn small" type="button" data-cassette-open="B">育成B目次</button>
      </div>`;
  }

  function enhanceHomeCards(){
    const a = qs('.modeCard[data-mode="practice_quick"]');
    const b = qs('.modeCard[data-mode="practice_goal"]');
    if(a){
      a.querySelector('h2').textContent = '練習モードA';
      const divs = a.querySelectorAll('div');
      if(divs[0]) divs[0].textContent = '基本操作・水やり・シークエンス・課題を、目次から選んで読み込みます。';
      const foot = a.querySelector('.modeFoot'); if(foot) foot.textContent = 'カセット式 / スキル練習';
    }
    if(b){
      b.querySelector('h2').textContent = '練習モードB';
      const divs = b.querySelectorAll('div');
      if(divs[0]) divs[0].textContent = '春・夏・冬野菜の育成パックを読み込み、成長期間を短時間で追体験する準備モードです。';
      const foot = b.querySelector('.modeFoot'); if(foot) foot.textContent = 'カセット式 / 育成';
    }
  }

  document.addEventListener('click', (ev) => {
    const card = ev.target.closest && ev.target.closest('.modeCard');
    if(card && card.dataset.mode === 'practice_quick'){
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      openPack(trainingA);
      return;
    }
    if(card && card.dataset.mode === 'practice_goal'){
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      openPack(growthB);
      return;
    }
    const dockBtn = ev.target.closest && ev.target.closest('[data-cassette-open]');
    if(dockBtn){
      ev.preventDefault();
      openPack(dockBtn.dataset.cassetteOpen === 'B' ? growthB : trainingA);
    }
  }, true);

  window.addEventListener('DOMContentLoaded', () => {
    enhanceHomeCards();
    applyCassetteHud();
  });
  window.addEventListener('load', () => {
    enhanceHomeCards();
    applyCassetteHud();
  });

  window.FarmBotModeCassettes = {openTrainingA:()=>openPack(trainingA), openGrowthB:()=>openPack(growthB), applyCassetteHud};
})();
