// Desktop drag and touch long press share the same server-authoritative commands.
// Hover feedback (range preview, drop/equip highlight, sell banner) mirrors the
// classic board: painted via callbacks so the client owns DOM conventions.
export function mountDragControls({getSeat,canAct,sendAction,isBoardReadOnly=()=>false,unitOf,onHover,sfx}) {
  let drag=null,hold=null,pointer=null,ghost=null,suppressClickUntil=0,inSell=false;
  const source=target=>{
    const slot=target.closest('[data-zone][data-slot]');
    if(slot?.dataset.zone==='board'&&isBoardReadOnly())return null;
    if(slot){const unit=getSeat()?.[slot.dataset.zone]?.[Number(slot.dataset.slot)];return unit?{uid:unit.uid,unit}:null;}
    const item=target.closest('[data-equip]');
    if(item){const itemIndex=Number(item.dataset.equip),itemId=getSeat()?.items?.[itemIndex];return itemId?{itemIndex,itemId}:null;}
    return null;
  };
  const drop=target=>{
    if(!drag||!canAct())return;
    const slot=target?.closest('[data-zone][data-slot]');
    if(slot?.dataset.zone==='board'&&isBoardReadOnly())return;
    if(slot){
      if(drag.uid)sendAction({type:'move',uid:drag.uid,to:{zone:slot.dataset.zone,slot:Number(slot.dataset.slot)}});
      else if(getSeat()?.items?.[drag.itemIndex]===drag.itemId){const unit=getSeat()?.[slot.dataset.zone]?.[Number(slot.dataset.slot)];if(unit)sendAction({type:'equip',uid:unit.uid,itemIndex:drag.itemIndex});}
    } else if(drag.uid && target?.closest('#sellBtn,#shopList')) sendAction({type:'sell',uid:drag.uid});
    else if(!drag.uid && target?.closest('[data-equip]') && getSeat()?.items?.[drag.itemIndex]===drag.itemId)sendAction({type:'combine',a:drag.itemIndex,b:Number(target.closest('[data-equip]').dataset.equip)});
  };
  const hover=target=>{
    if(!drag){onHover?.(null);return;}
    const slot=target?.closest?.('[data-zone][data-slot]');
    const cell=slot?{zone:slot.dataset.zone,slot:Number(slot.dataset.slot)}:null;
    const sell=!!target?.closest?.('#sellBtn,#shopList');
    if(sell&&!inSell){inSell=true;if(drag.uid)sfx?.('sellhint');}
    if(!sell)inSell=false;
    onHover?.({cell,sell,unit:drag.unit||null,isItem:drag.uid==null});
  };
  const clean=()=>{clearTimeout(hold);hold=null;drag=null;pointer=null;inSell=false;ghost?.remove();ghost=null;document.body.classList.remove('online-dragging');onHover?.(null);};
  document.addEventListener('dragstart',event=>{
    if(!canAct())return;drag=source(event.target);
    if(!drag){event.preventDefault();return;}
    event.dataTransfer.setData('text/plain',JSON.stringify(drag));event.dataTransfer.effectAllowed='move';
    document.body.classList.add('online-dragging');
  });
  document.addEventListener('dragover',event=>{if(drag){event.preventDefault();event.dataTransfer.dropEffect='move';hover(event.target);}});
  document.addEventListener('drop',event=>{if(drag){event.preventDefault();drop(event.target);clean();}});
  document.addEventListener('dragend',clean);
  document.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'||!canAct())return;
    const candidate=source(event.target);if(!candidate)return;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
    hold=setTimeout(()=>{
      drag=candidate;document.body.classList.add('online-dragging');
      ghost=document.createElement('div');ghost.className='online-drag-ghost';
      if(candidate.unit){const safe=String(candidate.unit.id).replace(/[^\w-]/g,'');ghost.innerHTML=`<img src="assets/units_big/${safe}.webp" alt="">`;}
      else ghost.textContent='穿戴装备';
      document.body.append(ghost);
      ghost.style.left=`${pointer.x}px`;ghost.style.top=`${pointer.y}px`;
    },350);
  });
  document.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointer?.id)return;
    if(!drag){if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>8)clean();return;}
    event.preventDefault();ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;
    hover(document.elementFromPoint(event.clientX,event.clientY));
  },{passive:false});
  document.addEventListener('pointerup',event=>{if(event.pointerId!==pointer?.id)return;if(drag){event.preventDefault();suppressClickUntil=Date.now()+400;drop(document.elementFromPoint(event.clientX,event.clientY));}clean();});
  document.addEventListener('pointercancel',event=>{if(event.pointerId===pointer?.id)clean();});
  document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil||document.body.classList.contains('online-dragging')){event.preventDefault();event.stopImmediatePropagation();}},true);
}
