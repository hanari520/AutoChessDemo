/* Preparation pieces use one markup contract in classic and online modes. */
(function(root){
  const names=['深海','星际','毛茸乐园','音律','四禧丸子','学园','夜幕','花语','魔道','森之国','工造','P-SP','刀客','守护','游侠','刺客','法师','咒术','医者','歌势','偶像','狂战'];
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=(name,extra='')=>{const i=names.indexOf(name);return i<0?'':`<i class="syn-atlas ${extra}" title="${escape(name)}" style="--syn-x:${i%5*25}%;--syn-y:${Math.floor(i/5)*25}%"></i>`;};
  function inner(unit,{name,traits=[],items='',icons}={}){
    const id=String(unit.id).replace(/[^\w-]/g,'');
    return `<i class="pt" style="background-image:url(assets/units_big/${id}.webp)"></i>${items?`<span class="its">${escape(items)}</span>`:''}${icons??`<span class="syn">${traits.map(n=>icon(n,'sy')).join('')}</span>`}<span class="st">${'★'.repeat(Math.min(4,unit.star||1))}</span><span class="nm">${escape(name||unit.name||unit.id)}</span>`;
  }
  root.ClassicPreparationPresentation={inner,icon};
})(globalThis);
