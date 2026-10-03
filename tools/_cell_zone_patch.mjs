/* 方向性 AOE 格子预警/命中闪光（一次性补丁，CRLF 安全）
 * 范围：仅 index.html / tools/battle-presentation.css。联机系统不动。 */
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

/* ===== 1. frontFoes 重构：以 frontCells（格子序号集合）为单一形状来源 ===== */
patch(F,
`function frontFoes(u,foes,dir,opt){   // 前方 N 格：沿锁定方向的条带（width=侧向半宽）或扇区（cone），2×2 头目任一格落入即命中
  if(!dir||(!dir.dx&&!dir.dy)) return [];
  return foes.filter(f=>cellsOf(f).some(([cx,cy])=>{
    const ox=cx-u.x, oy=cy-u.y;
    const along=ox*dir.dx+oy*dir.dy;
    if(along<1||along>opt.depth) return false;
    const lat=Math.abs(ox*(-dir.dy)+oy*dir.dx);
    return opt.cone? lat<=along : lat<=opt.width;
  }));
}`,
`function frontCells(u,dir,opt){   // 前方 N 格的格子序号列表（预警/闪光的视觉区，纵深 d 侧偏 l，cone 时 |l|≤d）
  if(!dir||(!dir.dx&&!dir.dy)) return [];
  const out=new Set();
  for(let d=1;d<=opt.depth;d++) for(let l=-opt.depth;l<=opt.depth;l++){
    if(opt.cone? Math.abs(l)>d : Math.abs(l)>opt.width) continue;
    const cx=u.x+dir.dx*d-dir.dy*l, cy=u.y+dir.dy*d+dir.dx*l;
    if(cx>=0&&cy>=0&&cx<BOARD_W&&cy<BOARD_H) out.add(cy*BOARD_W+cx);
  }
  return [...out];
}
function frontFoes(u,foes,dir,opt){   // 前方 N 格：沿锁定方向的条带（width=侧向半宽）或扇区（cone），2×2 头目任一格落入即命中
  const zone=new Set(frontCells(u,dir,opt));
  if(!zone.size) return [];
  return foes.filter(f=>cellsOf(f).some(([cx,cy])=>zone.has(cy*BOARD_W+cx)));
}`,
'frontCells-refactor');

/* ===== 2. 格子标记 helper + 引导预警区生命周期 ===== */
patch(F,
`function showCastBar(u,ms){   // ⏳ 读条条：挂在棋子元素上方，引导期间随时间排空`,
`function markCells(idx,cls,dur){   // 给棋盘格子加临时状态类（zone-warn 预警 / zone-hit 命中闪光），dur 毫秒后自动摘除
  try{
    const b=$('board'); if(!b) return [];
    const els=[];
    idx.forEach(i=>{ const el=b.querySelector('.cell[data-i="'+i+'"]'); if(el){ el.classList.add(cls); els.push(el); } });
    if(dur) setTimeout(()=>els.forEach(el=>el.classList.remove(cls)),dur/(SPEED||1));
    return els;
  }catch(e){ return []; }
}
function showCastZone(u){   // 引导预警：将要命中的格子持续点亮（对手也可见，站位博弈信息）
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
}
function showCastBar(u,ms){   // ⏳ 读条条：挂在棋子元素上方，引导期间随时间排空`,
'markcell-helpers');

/* ===== 3. 引导开始：点亮预警格 ===== */
patch(F,
`          showCastBar(u,_ct);`,
`          showCastBar(u,_ct);
          showCastZone(u);`,
'channel-zone-start');

/* ===== 4. 引导完成：预警格转命中闪光 ===== */
patch(F,
`            u.channel=null;hideCastBar(u);
            u.mana=0;`,
`            u.channel=null;hideCastBar(u);hideCastZone(u,true);   // 预警格转命中闪光
            u.mana=0;`,
'channel-zone-flash');

/* ===== 5. 引导被打断：预警格立即熄灭 ===== */
patch(F,
`          u.channel=null;u._castDir=null;hideCastBar(u);`,
`          u.channel=null;u._castDir=null;hideCastBar(u);hideCastZone(u,false);`,
'channel-zone-interrupt');

/* ===== 6. 引导中死亡：清理预警格 ===== */
patch(F,
`      if(u.hp<=0){ if(u.channel){u.channel=null;hideCastBar(u);} continue; }`,
`      if(u.hp<=0){ if(u.channel){u.channel=null;u._castDir=null;hideCastBar(u);hideCastZone(u,false);} continue; }`,
'channel-zone-death');

/* ===== 7. 即时方向性技能（非引导）：命中格直接闪光 ===== */
patch(F,
`      const list=k.front?frontFoes(u,foes,dir,k.front):foes.filter(f=>nearCells(f,u,1));   // 前方扇区（纵深 2 格）或周围 1 格`,
`      const list=k.front?frontFoes(u,foes,dir,k.front):foes.filter(f=>nearCells(f,u,1));   // 前方扇区（纵深 2 格）或周围 1 格
      if(k.front&&dir)markCells(frontCells(u,dir,k.front),'zone-hit',450);`,
'cleave-flash');

patch(F,
`    if(k.front&&dir){hitList=frontFoes(u,foes,dir,k.front);`,
`    if(k.front&&dir){hitList=frontFoes(u,foes,dir,k.front);markCells(frontCells(u,dir,k.front),'zone-hit',450);`,
'burst-flash');

patch(F,
`      hitList=frontFoes(u,foes,dir,k.front);
      hitList.forEach(f=>hit(f,k.mult));`,
`      hitList=frontFoes(u,foes,dir,k.front);
      markCells(frontCells(u,dir,k.front),'zone-hit',450);
      hitList.forEach(f=>hit(f,k.mult));`,
'field-flash');

/* ===== 8. CSS 版本号 ===== */
patch(F,
`<link rel="stylesheet" href="tools/battle-presentation.css?v=2">`,
`<link rel="stylesheet" href="tools/battle-presentation.css?v=3">`,
'version-css');

/* ===== 9. CSS：预警格呼吸点亮 + 命中格闪光（沿用 drop-hl 的格子直染模式，兼容深浅主题） ===== */
{
  const css = 'tools/battle-presentation.css';
  let c = readFileSync(css, 'utf8');
  const block = `
/* ⏳ 前方 N 格：引导预警格（琥珀呼吸）与命中闪光格 */
.cell.zone-warn{ background:rgba(255,190,90,.30); box-shadow:inset 0 0 0 2px rgba(240,170,70,.8),0 0 14px rgba(255,170,60,.45); animation:cellZoneWarn calc(1.1s/var(--spd,1)) ease-in-out infinite; }
@keyframes cellZoneWarn{0%,100%{filter:brightness(.92)}50%{filter:brightness(1.3)}}
.cell.zone-hit{ background:rgba(255,215,130,.55); box-shadow:inset 0 0 0 2px #f0b545,0 0 20px rgba(255,180,80,.65); animation:cellZoneHit calc(.45s/var(--spd,1)) ease-out forwards; }
@keyframes cellZoneHit{0%{filter:brightness(1.8)}100%{filter:brightness(1)}}
`;
  if (c.includes('cellZoneWarn')) { console.log('skip [css] already patched'); }
  else { writeFileSync(css, c + block.replace(/\n/g, c.includes('\r\n') ? '\r\n' : '\n')); console.log(`ok [css] ${css}`); }
}

console.log(failed ? '\n== SOME PATCHES FAILED ==' : '\n== ALL PATCHES APPLIED ==');
if (failed) process.exit(1);
