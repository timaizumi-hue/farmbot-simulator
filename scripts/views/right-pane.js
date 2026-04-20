(function(){
  const KEY = 'farmbot_right_mobile_view';
  const VIEWS = ['live','camera','map'];

  function isMobile(){
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function root(){ return document.getElementById('appRoot'); }
  function right(){ return document.querySelector('.right'); }
  function tabs(){ return document.getElementById('rightMobileTabs'); }
  function stageCard(){ return document.getElementById('stageCard'); }
  function mapCard(){ return document.getElementById('mapCard'); }

  function readStored(){
    try{
      const v = localStorage.getItem(KEY);
      return VIEWS.includes(v) ? v : 'live';
    }catch(_){ return 'live'; }
  }

  let current = readStored();

  function persist(view){
    try{ localStorage.setItem(KEY, view); }catch(_){}
  }

  function apply(view){
    current = VIEWS.includes(view) ? view : 'live';
    const app = root();
    const rightEl = right();
    const mobileTabs = tabs();
    if(!app || !rightEl || !mobileTabs) return;
    app.dataset.mobileView = current;
    rightEl.dataset.mobileView = current;
    mobileTabs.querySelectorAll('[data-mobile-view]').forEach(btn=>{
      btn.classList.toggle('active', btn.dataset.mobileView === current);
    });
    if(stageCard()) stageCard().classList.toggle('cameraFocus', current === 'camera');
    if(mapCard()) mapCard().classList.toggle('mapFocus', current === 'map');
    mobileTabs.hidden = !isMobile();
    persist(current);
  }

  function bind(){
    const mobileTabs = tabs();
    if(!mobileTabs || mobileTabs.dataset.bound === '1') return;
    mobileTabs.dataset.bound = '1';
    mobileTabs.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-mobile-view]');
      if(!btn) return;
      apply(btn.dataset.mobileView);
    });
    window.addEventListener('resize', ()=>apply(current), {passive:true});
  }

  function init(){
    bind();
    apply(current);
  }

  window.FarmBotRightPane = { init, apply, isMobile, getCurrent:()=>current };
})();
