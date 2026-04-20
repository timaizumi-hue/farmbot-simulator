(function(){
  const KEY = 'farmbot_left_mobile_panel';
  const PANELS = ['control','water','plants','sequence','logs'];

  function isMobile(){
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function tabsRoot(){ return document.getElementById('leftMobileTabs'); }

  function readStored(){
    try{
      const v = localStorage.getItem(KEY);
      return PANELS.includes(v) ? v : 'control';
    }catch(_){ return 'control'; }
  }

  let current = readStored();

  function persist(panel){
    try{ localStorage.setItem(KEY, panel); }catch(_){ }
  }

  function apply(panel){
    current = PANELS.includes(panel) ? panel : 'control';
    const root = tabsRoot();
    if(root){
      root.hidden = !isMobile();
      root.querySelectorAll('[data-mobile-left]').forEach(btn=>{
        btn.classList.toggle('active', btn.dataset.mobileLeft === current);
      });
    }
  }

  function open(panel){
    const target = PANELS.includes(panel) ? panel : 'control';
    const desktopTab = document.querySelector(`.tab[data-panel="${target}"]`);
    if(desktopTab) desktopTab.click();
    apply(target);
    persist(target);
  }

  function syncFromDesktop(){
    const active = document.querySelector('.tab.active[data-panel]');
    const panel = active?.dataset?.panel || current || 'control';
    apply(panel);
    persist(panel);
  }

  function bind(){
    const root = tabsRoot();
    if(!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    root.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-mobile-left]');
      if(!btn) return;
      open(btn.dataset.mobileLeft);
    });
    document.querySelectorAll('.tab[data-panel]').forEach(tab=>{
      tab.addEventListener('click', ()=>{
        setTimeout(syncFromDesktop, 0);
      });
    });
    window.addEventListener('resize', ()=>apply(current), {passive:true});
  }

  function init(){
    bind();
    if(isMobile()) open(current);
    else apply(current);
  }

  window.FarmBotLeftPane = { init, open, apply, isMobile, getCurrent:()=>current, syncFromDesktop };
})();
