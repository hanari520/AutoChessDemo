/* 格子预警全覆盖：菱形/方形/区域 helper + 7 枚棋子接入 + 6 处文案对齐（一次性补丁，CRLF 安全）
 * 仅经典端 index.html。 */
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

/* ===== 1. 形状 helper：方形（nearCells/battleZones 同形）与菱形（unitDist≤r 同形） ===== */
patch(F,
`function frontFoes(u,foes,dir,opt){   // 前方 N 格：沿锁定方向的条带（width=侧向半宽）或扇区（cone），2×2 头目任一格落入即命中`,
`function areaCells(x,y,r){   // 切比雪夫方形格子序号（与 battleZones/nearCells 的"周围 N 格"判定同形）
  const out=[];
  for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++){
    const cx=x+dx, cy=y+dy;
    if(cx>=0&&cy>=0&&cx<BOARD_W&&cy<BOARD_H) out.push(cy*BOARD_W+cx);
  }
  return out;
}
function areaCellsOf(u,r){   // 棋子占据格集合的方形并集（2×2 头目覆盖更宽）
  const out=new Set();
  for(const [ax,ay] of cellsOf(u)) areaCells(ax,ay,r).forEach(i=>out.add(i));
  return [...out];
}
function diamondCells(anchor,r){   // 曼哈顿菱形（与 unitDist≤r 的 field 判定同形）
  const out=new Set();
  for(const [ax,ay] of cellsOf(anchor))
    for(let dx=-r;dx<=r;dx++) for(let dy=-(r-Math.abs(dx));dy<=r-Math.abs(dx);dy++){
      const cx=ax+dx, cy=ay+dy;
      if(cx>=0&&cy>=0&&cx<BOARD_W&&cy<BOARD_H) out.add(cy*BOARD_W+cx);
    }
  return [...out];
}
function frontFoes(u,foes,dir,opt){   // 前方 N 格：沿锁定方向的条带（width=侧向半宽）或扇区（cone），2×2 头目任一格落入即命中`,
'area-diamond-helpers');

/* ===== 2. 羽入（周围型 cleave）：真实范围闪光 ===== */
patch(F,
`      if(k.front&&dir)markCells(frontCells(u,dir,k.front),zoneCls(u,'zone-hit'),450);`,
`      if(k.front&&dir)markCells(frontCells(u,dir,k.front),zoneCls(u,'zone-hit'),450);
      else markCells(areaCellsOf(u,1),zoneCls(u,'zone-hit'),450);   // 周围型 cleave（羽入）：真实范围闪光`,
'cleave-mahiru');

/* ===== 3. 突进系：轮刃溅射环 / 深雪落点 / 夜莺残影预警 ===== */
patch(F,
`    else if(target){hitList=[target];if(k.splash){const splash=v3NearestFoes(target,foes,1,3);splash.forEach(f=>{hit(f,k.splash);hitList.push(f);});}}`,
`    else if(target){hitList=[target];if(k.splash){const splash=v3NearestFoes(target,foes,1,3);splash.forEach(f=>{hit(f,k.splash);hitList.push(f);});}}
    if(k.splash&&target)markCells(diamondCells(target,1),zoneCls(u,'zone-hit'),450);   // 溅射落点环闪光`,
'dash-splash-kouichi');

patch(F,
`    if(k.mode==='dashCleave')vfxAt(u,'tex-slash',500);`,
`    if(k.mode==='dashCleave')vfxAt(u,'tex-slash',500);
    if(k.mode==='dashCleave')markCells(areaCellsOf(u,1),zoneCls(u,'zone-hit'),450);   // 落点周围格闪光（深雪）`,
'dashcleave-miyue');

patch(F,
`    if(k.afterimage&&target&&target.hp>0)target.v3Afterimage={left:2000,owner:u,damage:Math.round(power*.72),x:target.x,y:target.y};`,
`    if(k.afterimage&&target&&target.hp>0){target.v3Afterimage={left:2000,owner:u,damage:Math.round(power*.72),x:target.x,y:target.y};
      const zi=areaCellsOf(target,1), zels=markCells(zi,zoneCls(u,'zone-warn'));   // 残影爆点预警 2 秒（夜莺）
      setTimeout(()=>{zels.forEach(el=>el.classList.remove('zone-warn','zone-foe'));markCells(zi,zoneCls(u,'zone-hit'),450);},2000/(SPEED||1));}`,
'dash-afterimage-nox');

/* ===== 4. 自体菱形 field（晨露/星蚀）：真实范围闪光 ===== */
patch(F,
`    hitList=foes.filter(f=>unitDist(f,anchor)<=radius);
    hitList.forEach(f=>hit(f,k.mult));vfxAoe(anchor,Math.max(1,Math.ceil(radius/2)),u.id==='seki'?'drain':'',650);`,
`    hitList=foes.filter(f=>unitDist(f,anchor)<=radius);
    markCells(diamondCells(anchor,radius),zoneCls(u,'zone-hit'),450);   // 自体菱形范围闪光（晨露 r4 / 星蚀 r3）
    hitList.forEach(f=>hit(f,k.mult));vfxAoe(anchor,Math.max(1,Math.ceil(radius/2)),u.id==='seki'?'drain':'',650);`,
'field-circle-flash');

/* ===== 5. 持续区域：区域格点亮至结束（r≥3 大领域由 vfxAoe 圈承担，避免满屏染色） ===== */
patch(F,
`  battleZones.push({x,y,r:z.r,dur:z.dur,dmg:z.dps>0?Math.max(1,Math.round(u.atk*z.dps)):0,slow:z.slow||0,manaBurn:z.manaBurn||0,side:u.side,acc:0,u});
  vfxAoe(u,z.r,'frost',z.dur); sfx('zone');
}`,
`  battleZones.push({x,y,r:z.r,dur:z.dur,dmg:z.dps>0?Math.max(1,Math.round(u.atk*z.dps)):0,slow:z.slow||0,manaBurn:z.manaBurn||0,side:u.side,acc:0,u});
  vfxAoe(u,z.r,'frost',z.dur); sfx('zone');
  if((z.r||1)<=2){   // 区域格点亮至区域结束（冰烛/时空/节拍/星蚀留场）
    const zels=markCells(areaCells(x,y,z.r||1),zoneCls(u,'zone-warn'));
    setTimeout(()=>zels.forEach(el=>['zone-warn','zone-foe'].forEach(cc=>el.classList.remove(cc))),z.dur/(SPEED||1));
  }
}`,
'spawnzone-mark');

/* ===== 6. 文案对齐：直线/菱形/区域形状明示 ===== */
patch(F,
`nana7mi:v3Kit('鲨皇潮','burst','短引导 0.6 秒，鲨潮沿出手锁定的方向冲撞前方 3 格：造成 210% 伤害、拉近敌人并减速 35%；血量越低伤害越高。引导被打断则损失一半法力。'`,
`nana7mi:v3Kit('鲨皇潮','burst','短引导 0.6 秒，鲨潮沿出手锁定的方向冲撞正前方直线 3 格：造成 210% 伤害、拉近敌人并减速 35%；血量越低伤害越高。引导被打断则损失一半法力。'`,
'desc-nana7mi');

patch(F,
`rinco:v3Kit('十二点拉闸','cleave','引导 1.2 秒，沿出手锁定的方向拉下总闸，电浪席卷前方纵深 3 格：造成 210% 伤害并沉默 1.8 秒；自身获得 25% 吸血，直到战斗结束。引导被打断则损失一半法力。'`,
`rinco:v3Kit('十二点拉闸','cleave','引导 1.2 秒，沿出手锁定的方向拉下总闸，电浪席卷正前方直线纵深 3 格：造成 210% 伤害并沉默 1.8 秒；自身获得 25% 吸血，直到战斗结束。引导被打断则损失一半法力。'`,
'desc-rinco');

patch(F,
`seki:v3Kit('星蚀低语','field','在自身周围展开星蚀领域，对范围内敌人造成 150% 伤害、沉默 2.6 秒并持续烧蓝。'`,
`seki:v3Kit('星蚀低语','field','以自身为中心展开星蚀领域，3 格内敌人受到 150% 伤害、沉默 2.6 秒并持续烧蓝。'`,
'desc-seki');

patch(F,
`liAn:v3Kit('晨露凝霜','field','将全场最危险的敌人群体冻结 1.4 秒并造成 125% 伤害；冻结结束后目标获得易伤。'`,
`liAn:v3Kit('晨露凝霜','field','锁定攻击最高的敌人，将其周围 4 格内的敌人群体冻结 1.4 秒并造成 125% 伤害；冻结结束后目标获得易伤。'`,
'desc-liAn');

patch(F,
`xuezhu:v3Kit('冰烛禁区','zone','冻结最远敌人 2 秒并造成 170% 伤害，在脚下生成 2.7 秒冰封禁区。'`,
`xuezhu:v3Kit('冰烛禁区','zone','冻结最远敌人 2 秒并造成 170% 伤害，在其脚下生成 2.7 秒冰封禁区（3×3 格）。'`,
'desc-xuezhu');

patch(F,
`ruiya:v3Kit('时空封存','zone','冻结最远敌人 2.4 秒并造成 200% 伤害；生成时空区，区域内敌人攻速降低 60%。'`,
`ruiya:v3Kit('时空封存','zone','冻结最远敌人 2.4 秒并造成 200% 伤害；在其脚下生成 3×3 格时空区，区域内敌人攻速降低 60%。'`,
'desc-ruiya');

patch(F,
`aza:v3Kit('节拍装甲','team','以鼓点强化全队：回复 70% 攻击生命、攻击 +12%，并在施法者脚下留下 2 秒震荡圈。'`,
`aza:v3Kit('节拍装甲','team','以鼓点强化全队：回复 70% 攻击生命、攻击 +12%，并在施法者脚下留下 2 秒震荡圈（3×3 格）。'`,
'desc-aza');

console.log(failed ? '\n== SOME PATCHES FAILED ==' : '\n== ALL PATCHES APPLIED ==');
if (failed) process.exit(1);
