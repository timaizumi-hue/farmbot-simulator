(function(){
  function isPhoneLike(){
    return window.matchMedia('(max-width: 950px)').matches;
  }
  function isLandscape(){
    return window.matchMedia('(orientation: landscape)').matches;
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
    }
  }

  function apply(){
    const app = appRoot();
    const ov = overlay();
    if(app){
      app.classList.toggle('mobileLandscapeShell', isPhoneLike() && isLandscape());
    }
    if(ov){
      const show = isPhoneLike() && !isLandscape() && home() && home().classList.contains('hidden');
      ov.classList.toggle('show', show);
      ov.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    nudgeMobileDefaults();
  }

  function init(){
    apply();
    window.addEventListener('resize', apply, {passive:true});
    window.addEventListener('orientationchange', apply, {passive:true});
    document.addEventListener('click', (e)=>{
      if(e.target.closest('.modeCard') || e.target.closest('#backHomeBtn') || e.target.closest('[data-mobile-view]') || e.target.closest('[data-mobile-left]') || e.target.closest('.tab[data-panel]')) {
        setTimeout(apply, 20);
      }
    }, true);
  }

  window.FarmBotMobileShell = { init, apply, isPhoneLike, isLandscape };
})();
