(function(){
  function drawFarmMap(ctx, size, deps){
    const {state, garden, soilWetStyle, mapToPx, drawTopPlant, getPlantWaterState} = deps;
    const grd=ctx.createLinearGradient(0,0,0,size.h); grd.addColorStop(0,'#9b7652'); grd.addColorStop(1,'#74553d');
    ctx.fillStyle=grd; ctx.fillRect(0,0,size.w,size.h);
    const cw=size.w/garden.cols, rh=size.h/garden.rows;
    for(let y=0;y<garden.rows;y++) for(let x=0;x<garden.cols;x++){
      ctx.fillStyle=(x+y)%2===0?'rgba(255,255,255,.028)':'rgba(0,0,0,.022)';
      ctx.fillRect(x*cw,y*rh,cw,rh);
    }
    ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=1;
    for(let i=0;i<=garden.cols;i++){ctx.beginPath();ctx.moveTo(i*cw,0);ctx.lineTo(i*cw,size.h);ctx.stroke();}
    for(let i=0;i<=garden.rows;i++){ctx.beginPath();ctx.moveTo(0,i*rh);ctx.lineTo(size.w,i*rh);ctx.stroke();}

    Object.entries(state.waterCells||{}).forEach(([key,amt])=>{
      const wet=soilWetStyle(amt); if(!wet) return;
      const [ix,iy]=key.split(',').map(Number);
      const px=ix*cw+cw/2, py=size.h - (iy*rh+rh/2);
      const rx=Math.max(cw*0.46, 4.2), ry=Math.max(rh*0.46, 4.2);
      ctx.fillStyle=wet.fill;
      ctx.beginPath(); ctx.ellipse(px,py,rx,ry,0,0,Math.PI*2); ctx.fill();
      if(wet.edge){
        ctx.strokeStyle=wet.edge;
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.ellipse(px,py,rx*0.96,ry*0.96,0,0,Math.PI*2); ctx.stroke();
      }
      if(wet.puddle){
        ctx.fillStyle=`rgba(228,236,244,${Math.max(0.08,wet.gloss)})`;
        ctx.beginPath(); ctx.ellipse(px-rx*0.16,py-ry*0.18,rx*0.42,ry*0.22,-0.28,0,Math.PI*2); ctx.fill();
      }
    });

    if(state.showPaths!==false){
      state.pathHistory.forEach((seg,i)=>{
        const a=mapToPx(seg.a,size), b=mapToPx(seg.b,size);
        ctx.lineCap='round'; ctx.strokeStyle=`rgba(40,70,95,${Math.max(.02,.055-i*0.004)})`; ctx.lineWidth=1.4;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      });
      if(state.recentPath){
        const a=mapToPx(state.recentPath.a,size), b=mapToPx(state.recentPath.b,size);
        ctx.strokeStyle='rgba(26,88,178,.14)'; ctx.lineWidth=2.0;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }
    }

    ctx.fillStyle='rgba(255,255,255,.72)'; ctx.font='12px sans-serif';
    ctx.textBaseline='bottom';
    for(let mm=500; mm<garden.w; mm+=500){
      const x=mm/garden.w*size.w; ctx.textAlign='left'; ctx.fillText(String(mm), x+3, size.h-4);
      ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,size.h); ctx.stroke();
    }
    ctx.textAlign='left';
    for(let mm=500; mm<garden.h; mm+=500){
      const y=size.h - (mm/garden.h*size.h); ctx.fillText(String(mm), 6, y-4);
      ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(size.w,y); ctx.stroke();
    }

    if(state.trainingScenario && state.trainingScenario.target){
      const tp=mapToPx(state.trainingScenario.target,size);
      ctx.save();
      ctx.strokeStyle='rgba(255,230,80,.95)';
      ctx.fillStyle='rgba(255,230,80,.12)';
      ctx.lineWidth=3;
      ctx.setLineDash([8,5]);
      ctx.beginPath(); ctx.arc(tp.x,tp.y,26,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle='rgba(60,45,0,.92)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(tp.x-34,tp.y); ctx.lineTo(tp.x+34,tp.y); ctx.moveTo(tp.x,tp.y-34); ctx.lineTo(tp.x,tp.y+34); ctx.stroke();
      ctx.fillStyle='rgba(45,35,0,.86)';
      ctx.font='bold 12px sans-serif';
      ctx.textAlign='left'; ctx.textBaseline='bottom';
      ctx.fillText(`目標 X${Math.round(state.trainingScenario.target.x)} / Y${Math.round(state.trainingScenario.target.y)}`, tp.x+12, tp.y-12);
      ctx.restore();
    }

    (state.plants||[]).forEach(p=>{
      const pp=mapToPx(p,size);
      const info=getPlantWaterState(p);
      ctx.save();
      ctx.shadowColor='rgba(0,0,0,.18)'; ctx.shadowBlur=6;
      drawTopPlant(ctx, pp.x, pp.y, p, 0.56);
      ctx.restore();
      ctx.strokeStyle=info.color; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.arc(pp.x,pp.y,14,0,Math.PI*2); ctx.stroke();
    });

    const sel=mapToPx(state.selected,size);
    ctx.strokeStyle='rgba(255,239,102,.72)'; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.arc(sel.x,sel.y,12,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sel.x-12,sel.y); ctx.lineTo(sel.x+12,sel.y); ctx.moveTo(sel.x,sel.y-12); ctx.lineTo(sel.x,sel.y+12); ctx.stroke();

    const pos=mapToPx(state.pos,size);
    ctx.fillStyle='rgba(28,34,38,.82)'; ctx.beginPath(); ctx.arc(pos.x,pos.y,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#80d7ff'; ctx.beginPath(); ctx.arc(pos.x,pos.y,3.5,0,Math.PI*2); ctx.fill();
  }

  window.FarmBotFarmMapView = { drawFarmMap };
})();
