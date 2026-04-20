(function(){
  const DISMISS_KEY = 'farmbot_mobile_rotate_hint_dismissed';
  function isPhoneLike(){
    const narrow = window.matchMedia('(max-width: 950px)').matches;
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints||0) > 0;
    return narrow && touch;
  }
  function viewportLandscape(){
    const vv = window.visualViewport;
    const w = vv?.width || window.innerWidth || document.documentElement.clientWidth || 0;
    const h = vv?.height || window.innerHeight || document.documentElement.clientHeight || 0;
    return w > h * 1.02;
  }
  function screenLandscape(){
    const so = window.screen?.orientation?.type || '';
    if(so) return /landscape/.test(so);
    if(typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;
    return false;
  }
  function isLandscape(){
    return viewportLandscape() || screenLandscape() || window.matchMedia('(orientation: landscape)').matches;
  }
  function appRoot(){ return document.getElementById('appRoot'); }
  function overlay(){ return document.getElementById('rotateHintOverlay'); }
  function home(){ return document.getElementById('homeScreen'); }
  function dismissBtn(){ return document.getElementById('rotateHintContinueBtn'); }

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
        const val = Math.max(1, Math.min(5, Number(zoom.value || 1.1)));
        if(val > 1.0){
          zoom.value = '1.0';
          if(window.state) window.state.stageZoom = 1.0;
          window.__mobileStageZoomAdjusted = true;
          setTimeout(()=>window.renderAll?.(), 0);
        }
      }
    }
  }

  function shouldShowOverlay(){
    if(!isPhoneLike()) return false;
    if(isLandscape()) return false;
    if(localStorage.getItem(DISMISS_KEY)==='1') return false;
    return home() && home().classList.contains('hidden');
  }

  function apply(){
    const app = appRoot();
    const ov = overlay();
    if(app){
      app.classList.toggle('mobileLandscapeShell', isPhoneLike() && isLandscape());
    }
    if(ov){
      const show = shouldShowOverlay();
      ov.classList.toggle('show', show);
      ov.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    nudgeMobileDefaults();
  }

  function scheduleApply(){
    [0, 80, 220, 500].forEach(ms => setTimeout(apply, ms));
  }

  function init(){
    scheduleApply();
    window.addEventListener('resize', scheduleApply, {passive:true});
    window.addEventListener('orientationchange', scheduleApply, {passive:true});
    window.addEventListener('pageshow', scheduleApply, {passive:true});
    document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) scheduleApply(); }, {passive:true});
    dismissBtn()?.addEventListener('click', ()=>{ localStorage.setItem(DISMISS_KEY,'1'); apply(); });
    document.addEventListener('click', (e)=>{
      if(e.target.closest('.modeCard') || e.target.closest('#backHomeBtn') || e.target.closest('[data-mobile-view]') || e.target.closest('[data-mobile-left]') || e.target.closest('.tab[data-panel]')) {
        scheduleApply();
      }
    }, true);
  }

  window.FarmBotMobileShell = { init, apply, isPhoneLike, isLandscape, viewportLandscape };
})();
