/* 方向性 AOE 预警/闪光敌我分色（一次性补丁，CRLF 安全）
 * 我方=琥珀金（与技能特效同色系），敌方=红/绯危险色。仅经典端。 */
import { readFileSync, writeFileSync } from 'node:fs';

let failed = false;
function patch(file, oldS, newS, tag) {
  let c = readFileSync(file, 'utf8');
  const crlf = c.includes('\r\n');
  const o = crlf ? oldS.split('\n').join('\r\n') : oldS;
  const n = crlf ? newS.split('\n').join('\r\n') : newS;
  const cnt = c.split(o).length - 1;
  if (cnt !== 1) { console.error(`FAIL [${tag}] ${file}: count=${cnt}`); failed = true; return; }
  c = c.replace(o, n);
  writeFileSync(file, c);
  console.log(`ok [${tag}] ${file}`);
}

const F = 'index.html';

/* ===== 1. markCells 支持多类（空格分隔），方便带 zone-foe 修饰 ===== */
patch(F,
`function markCells(idx,cls,dur){   // 给棋盘格子加临时状态类（zone-warn 预警 / zone-hit 命中闪光），dur 毫秒后自动摘除
  try{
    const b=$('board'); if(!b) return [];
    const els=[];
    idx.forEach(i=>{ const el=b.querySelector('.cell[data-i="'+i+'"]'); if(el){ el.classList.add(cls); els.push(el); } });
    if(dur) setTimeout(()=>els.forEach(el=>el.classList.remove(cls)),dur/(SPEED||1));
    return els;
  }catch(e){ return []; }
}`,
`function zoneCls(u,base){ return u.side===0?base:base+' zone-foe'; }   // 敌方施法者：预警/闪光带 zone-foe 修饰（红/绯危险色，与敌方半场同语）
function markCells(idx,cls,dur){   // 给棋盘格子加临时状态类（zone-warn 预警 / zone-hit 命中闪光，可空格分隔多类），dur 毫秒后自动摘除
  try{
    const b=$('board'); if(!b) return [];
    const list=cls.split(/\\s+/).filter(Boolean);
    const els=[];
    idx.forEach(i=>{ const el=b.querySelector('.cell[data-i="'+i+'"]'); if(el){ list.forEach(cc=>el.classList.add(cc)); els.push(el); } });
    if(dur) setTimeout(()=>els.forEach(el=>list.forEach(cc=>el.classList.remove(cc))),dur/(SPEED||1));
    return els;
  }catch(e){ return []; }
}`,
'markcells-multiclass');

/* ===== 2. showCastZone / hideCastZone：记录施法方阵营，闪光沿用同色 ===== */
patch(F,
`function showCastZone(u){   // 引导预警：将要命中的格子持续点亮（对手也可见，站位博弈信息）
  try{
    const k=COMBAT_KITS[u.id]; if(!k||!k.front||!u._castDir) return;
    hideCastZone(u,false);
    u._zoneEls=markCells(frontCells(u,u._castDir,k.front),'zone-warn');
  }catch(e){}
}
function hideCastZone(u,flash){
  const els=u._zoneEls; u._zoneEls=null; if(!els||!els.length) return;
  try{
    if(flash){ els.forEach(el=>{el.classList.remove('zone-warn');el.classList.add('zone-hit');});
      setTimeout(()=>els.forEach(el=>el.classList.remove('zone-hit')),500/(SPEED||1)); }
    else els.forEach(el=>el.classList.remove('zone-warn'));
  }catch(e){}
}`,
`function showCastZone(u){   // 引导预警：将要命中的格子持续点亮（敌我分色，双方都可读）
  try{
    const k=COMBAT_KITS[u.id]; if(!k||!k.front||!u._castDir) return;
    hideCastZone(u,false);
    u._zoneFoe=u.side!==0;
    u._zoneEls=markCells(frontCells(u,u._castDir,k.front),zoneCls(u,'zone-warn'));
  }catch(e){}
}
function hideCastZone(u,flash){
  const els=u._zoneEls, foe=u._zoneFoe; u._zoneEls=null; u._zoneFoe=false;
  if(!els||!els.length) return;
  const strip=el=>['zone-warn','zone-foe','zone-hit'].forEach(cc=>el.classList.remove(cc));
  try{
    if(flash){ const cls=foe?'zone-hit zone-foe':'zone-hit';
      els.forEach(el=>{strip(el);cls.split(/\\s+/).forEach(cc=>el.classList.add(cc));});
      setTimeout(()=>els.forEach(el=>['zone-hit','zone-foe'].forEach(cc=>el.classList.remove(cc))),500/(SPEED||1)); }
    else els.forEach(strip);
  }catch(e){}
}`,
'zone-side-lifecycle');

/* ===== 3. 即时技命中闪光：带阵营色 ===== */
patch(F,
`      if(k.front&&dir)markCells(frontCells(u,dir,k.front),'zone-hit',450);`,
`      if(k.front&&dir)markCells(frontCells(u,dir,k.front),zoneCls(u,'zone-hit'),450);`,
'cleave-flash-side');

patch(F,
`    if(k.front&&dir){hitList=frontFoes(u,foes,dir,k.front);markCells(frontCells(u,dir,k.front),'zone-hit',450);`,
`    if(k.front&&dir){hitList=frontFoes(u,foes,dir,k.front);markCells(frontCells(u,dir,k.front),zoneCls(u,'zone-hit'),450);`,
'burst-flash-side');

patch(F,
`      markCells(frontCells(u,dir,k.front),'zone-hit',450);`,
`      markCells(frontCells(u,dir,k.front),zoneCls(u,'zone-hit'),450);`,
'field-flash-side');

/* ===== 4. CSS 版本号 ===== */
patch(F,
`<link rel="stylesheet" href="tools/battle-presentation.css?v=3">`,
`<link rel="stylesheet" href="tools/battle-presentation.css?v=4">`,
'version-css');

/* ===== 5. CSS：敌方施法者的预警/闪光=红绯危险色（琥珀金仍属我方） ===== */
{
  const css = 'tools/battle-presentation.css';
  let c = readFileSync(css, 'utf8');
  const block = `
/* 敌方施法者的预警/命中格：红绯危险色（我方保持琥珀金） */
#board .cell.zone-warn.zone-foe{ background:rgba(255,80,115,.34)!important; box-shadow:inset 0 0 0 2px rgba(235,70,105,.9),0 0 16px rgba(255,70,105,.55)!important; }
#board .cell.zone-hit.zone-foe{ background:rgba(255,120,150,.55)!important; box-shadow:inset 0 0 0 2px #e8557f,0 0 22px rgba(255,90,120,.7)!important; }
`;
  if (c.includes('zone-warn.zone-foe')) { console.log('skip [css] already patched'); }
  else { writeFileSync(css, c + block.replace(/\n/g, c.includes('\r\n') ? '\r\n' : '\n')); console.log(`ok [css] ${css}`); }
}

console.log(failed ? '\n== SOME PATCHES FAILED ==' : '\n== ALL PATCHES APPLIED ==');
if (failed) process.exit(1);
