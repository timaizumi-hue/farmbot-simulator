(function(){
  function currentZoomForCanvas(canvas, state){
    if(canvas.id==='stageCanvas') return 1;
    if(canvas.id==='mapCanvas') return Math.max(1, state.mapZoom || 1.2);
    return 1;
  }

  function resizeCanvas(canvas, state, sizeCache){
    let viewport = null;
    if(canvas.id==='stageCanvas') viewport = canvas.closest('.stageViewport');
    else if(canvas.id==='mapCanvas') viewport = canvas.closest('.canvasWrap');
    else viewport = canvas.parentElement;
    const host=(viewport||canvas.parentElement);
    const zoom=currentZoomForCanvas(canvas, state);
    const baseW=Math.max(1, host.clientWidth || host.getBoundingClientRect().width);
    const baseH=Math.max(1, host.clientHeight || host.getBoundingClientRect().height);
    let cssW, cssH;
    if(canvas.id==='stageCanvas'){
      const aspect = 16/9;
      const stageBaseW = Math.max(baseW, baseH * aspect);
      const stageBaseH = stageBaseW / aspect;
      cssW = Math.round(stageBaseW * zoom);
      cssH = Math.round(stageBaseH * zoom);
      const wrap = canvas.parentElement;
      if(wrap){
        wrap.style.width = `${cssW}px`;
        wrap.style.height = `${cssH}px`;
      }
    } else {
      cssW=Math.max(baseW, Math.round(baseW*zoom));
      cssH=Math.max(baseH, Math.round(baseH*zoom));
    }

    const cached=sizeCache && sizeCache.get(canvas);
    if(!cached || cached.cssW!==cssW || cached.cssH!==cssH){
      canvas.style.width=`${cssW}px`;
      canvas.style.height=`${cssH}px`;
      canvas.width=Math.max(1, Math.round(cssW*devicePixelRatio));
      canvas.height=Math.max(1, Math.round(cssH*devicePixelRatio));
      if(sizeCache) sizeCache.set(canvas,{cssW,cssH});
    }
    return {w:cssW,h:cssH, viewW:baseW, viewH:baseH, zoom};
  }

  function centerScrollableCanvas(canvas, focusX=0.5, focusY=0.5){
    const wrap = canvas.id==='stageCanvas' ? canvas.closest('.stageViewport') : canvas.parentElement;
    requestAnimationFrame(()=>{
      if(!wrap) return;
      const maxX=Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const maxY=Math.max(0, wrap.scrollHeight - wrap.clientHeight);
      const nextLeft=Math.max(0, Math.min(maxX, canvas.clientWidth*focusX - wrap.clientWidth/2));
      const nextTop=Math.max(0, Math.min(maxY, canvas.clientHeight*focusY - wrap.clientHeight/2));
      wrap.scrollLeft=nextLeft;
      wrap.scrollTop=nextTop;
    });
  }

  function mapToPx(pt, size, garden){
    return {x:pt.x/garden.w*size.w, y:size.h - (pt.y/garden.h*size.h)};
  }
  function pxToMap(pt, size, garden){
    return {x:pt.x/size.w*garden.w, y:(1 - pt.y/size.h)*garden.h};
  }

  window.FarmBotCanvasUtils={
    currentZoomForCanvas,
    resizeCanvas,
    centerScrollableCanvas,
    mapToPx,
    pxToMap,
  };
})();
