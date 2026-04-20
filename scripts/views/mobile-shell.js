(function(){
  function isPhoneLike(){
    const narrow = window.matchMedia('(max-width: 950px)').matches;
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints||0) > 0;
    return narrow && touch;
  }

  function viewportLandscape(){
    const vv = window.visualViewport;
    const w = vv?.width || window.innerWidth || document.documentElement.clientWidth || 0;
    const h = vv?.height || window.innerHeight || document.documentElement.clientHeight || 0;
    return w > h;
  }

  function isLandscape(){
    return viewportLandscape();
  }

  function appRoot(){ return document.getElementById('appRoot'); }
  function overlay(){ return document.getElementById('rotateHintOverlay'); }
  function home(){ return document.getElementById('homeScreen'); }

  function currentVisiblePanel(){
    const active = document.querySelector('.tab.active[data-panel]');
    return active?.dataset?.panel || 'control';
  }

  function nudgeMobileDefaults(){
    if(!window.FarmBotRightPane || !window.FarmBotLeftPane) return;
    if(isPhoneLike() && isLandscape()) {
      window.FarmBotRightPane.apply('live');
      const current = currentVisiblePanel();
      if(current !== 'control' && current !== 'water') window.FarmBotLeftPane.open('control');
      const zoom = document.getElementById('stageZoom');
      if(zoom && (!window.__mobileStageZoomAdjusted)){
        const val = Number(zoom.value || 1.0);
        if(val > 1.0){
          zoom.value = '1.0';
          if(window.state) window.state.stageZoom = 1.0;
          window.__mobileStageZoomAdjusted = true;
          setTimeout(()=>window.renderAll?.(), 0);
        }
      }
    }
  }

  function shouldBlockForRotate(){
    if(!isPhoneLike()) return false;
    if(home() && !home().classList.contains('hidden')) return false;
    return !isLandscape();
  }

  function apply(){
    const phone = isPhoneLike();
    const landscape = isLandscape();
    const app = appRoot();
    const ov = overlay();
    if(app){
      app.classList.toggle('mobileLandscapeShell', phone && landscape);
      app.classList.toggle('mobileRotateBlocked', phone && !landscape);
    }
    if(ov){
      const show = shouldBlockForRotate();
      ov.classList.toggle('show', show);
      ov.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    document.body.classList.toggle('mobileRotateBlockedBody', phone && !landscape);
    nudgeMobileDefaults();
  }

  function scheduleApply(){
    [0, 50, 150, 350, 700].forEach(ms => setTimeout(apply, ms));
  }

  function init(){
    scheduleApply();
    window.addEventListener('resize', scheduleApply, {passive:true});
    window.addEventListener('orientationchange', scheduleApply, {passive:true});
    window.addEventListener('pageshow', scheduleApply, {passive:true});
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) scheduleApply(); }, {passive:true});
    document.addEventListener('click', (e)=>{
      if(e.target.closest('.modeCard') || e.target.closest('#backHomeBtn') || e.target.closest('[data-mobile-view]') || e.target.closest('[data-mobile-left]') || e.target.closest('.tab[data-panel]')) {
        scheduleApply();
      }
    }, true);
  }

  window.FarmBotMobileShell = { init, apply, isPhoneLike, isLandscape, viewportLandscape };
})();
