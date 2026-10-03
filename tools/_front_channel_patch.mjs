/* 经典端「前方 N 格」方向性 AOE + 引导读条改造（一次性补丁，CRLF 安全）
 * 范围：仅 index.html / tools/battle-presentation.css / sw.js。联机系统不动。 */
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

/* ===== 1. 七枚棋子 kit：front 形状参数 + castT 引导时长 + 文案 ===== */
patch(F,
`  songlv:v3Kit('根系重击','burst','以根锤震击周围敌人，造成 150% 伤害、眩晕 0.8 秒并回复自身 20% 造成伤害的生命。','#9be36a','blade',{mult:1.5,stun:.8,lifesteal:.20,attackStyle:'blade'}),`,
`  songlv:v3Kit('根系重击','burst','以根锤砸向出手时锁定的前方扇区（纵深 2 格），造成 150% 伤害、眩晕 0.8 秒并回复自身 20% 造成伤害的生命。','#9be36a','blade',{mult:1.5,stun:.8,lifesteal:.20,front:{depth:2,cone:1},attackStyle:'blade'}),`,
'kit-songlv');

patch(F,
`  chiharu:v3Kit('夜岚折返','cleave','向前方扇区斩出两道夜岚，合计造成 165% 伤害并使命中者受到的下一次普攻伤害提高 25%。','#8fbcff','blade',{mult:.825,hits:2,wound:.25,attackStyle:'blade'}),`,
`  chiharu:v3Kit('夜岚折返','cleave','向出手时锁定的前方扇区（纵深 2 格）斩出两道夜岚，合计造成 165% 伤害并使命中者受到的下一次普攻伤害提高 25%。','#8fbcff','blade',{mult:.825,hits:2,wound:.25,front:{depth:2,cone:1},attackStyle:'blade'}),`,
'kit-chiharu');

patch(F,
`  nana7mi:v3Kit('鲨皇潮','burst','召唤鲨潮冲撞前方，造成 210% 伤害、拉近敌人并减速 35%；血量越低伤害越高。','#67d4e8','arc',{mult:2.1,slow:.35,pull:true,lowHPBoost:.6,attackStyle:'blade'}),`,
`  nana7mi:v3Kit('鲨皇潮','burst','短引导 0.6 秒，鲨潮沿出手锁定的方向冲撞前方 3 格：造成 210% 伤害、拉近敌人并减速 35%；血量越低伤害越高。引导被打断则损失一半法力。','#67d4e8','arc',{mult:2.1,slow:.35,pull:true,lowHPBoost:.6,front:{depth:3,width:0},castT:0.6,attackStyle:'blade'}),`,
'kit-nana7mi');

patch(F,
`  haruka:v3Kit('白刃拍击','cleave','以白刃拍击周围敌人，造成 180% 伤害并削减 25% 攻击；被削弱者攻击会给白神遥回 4 点法力。','#f6f3ff','blade',{mult:1.8,weaken:.25,mana:4,attackStyle:'blade'}),`,
`  haruka:v3Kit('白刃拍击','cleave','白刃横扫出手时锁定的前方扇区（纵深 2 格），造成 180% 伤害并削减 25% 攻击；被削弱者攻击会给白神遥回 4 点法力。','#f6f3ff','blade',{mult:1.8,weaken:.25,mana:4,front:{depth:2,cone:1},attackStyle:'blade'}),`,
'kit-haruka');

patch(F,
`  azi:v3Kit('高音震魂','field','释放高音震魂波，范围内敌人受到 130% 伤害并眩晕 1.5 秒；每命中一人，阿梓获得 6 点法力。','#ffbd6a','arc',{mult:1.3,stun:1.5,mana:6,attackStyle:'pulse'}),`,
`  azi:v3Kit('高音震魂','field','引导 1.2 秒，向出手锁定的方向释放高音震魂波：前方 3 格（宽 3 格）内敌人受到 160% 伤害并眩晕 1.5 秒，每命中一人阿梓获得 6 点法力。引导被打断则损失一半法力。','#ffbd6a','arc',{mult:1.6,stun:1.5,mana:6,front:{depth:3,width:1},castT:1.2,attackStyle:'pulse'}),`,
'kit-azi');

patch(F,
`  rei:v3Kit('灵界之门','field','开启灵界之门，范围敌人受到 135% 伤害并沉默 2.4 秒；门会把其中一次治疗的 40% 转成伤害。','#b78cff','void',{mult:1.35,silence:2.4,enemyHealDown:.40,attackStyle:'pulse'}),`,
`  rei:v3Kit('灵界之门','field','引导 1.5 秒开启灵界之门，向出手锁定的方向喷涌灵界洪流：前方 3 格（宽 3 格）内敌人受到 150% 伤害并沉默 2.4 秒，门会把其中一次治疗的 40% 转成伤害。引导被打断则损失一半法力。','#b78cff','void',{mult:1.5,silence:2.4,enemyHealDown:.40,front:{depth:3,width:1},castT:1.5,attackStyle:'pulse'}),`,
'kit-rei');

patch(F,
`  rinco:v3Kit('十二点拉闸','cleave','拉下总闸，对周围敌人造成 210% 伤害并沉默 1.8 秒；自身获得 25% 吸血，直到战斗结束。','#ff5f70','void',{mult:2.1,silence:1.8,lifesteal:.25,attackStyle:'blade'})`,
`  rinco:v3Kit('十二点拉闸','cleave','引导 1.2 秒，沿出手锁定的方向拉下总闸，电浪席卷前方纵深 3 格：造成 210% 伤害并沉默 1.8 秒；自身获得 25% 吸血，直到战斗结束。引导被打断则损失一半法力。','#ff5f70','void',{mult:2.1,silence:1.8,lifesteal:.25,front:{depth:3,width:0},castT:1.2,attackStyle:'blade'})`,
'kit-rinco');

/* ===== 2. 几何 helper：8 向锁定 + 前方条带/扇区判定 ===== */
patch(F,
`function nearCells(f,u,r){   // 两棋子占据格集合的切比雪夫距离 ≤ r（cleave/slam/volley 的"周围 N 格"）
  return cellsOf(f).some(([fx,fy])=>cellsOf(u).some(([ux,uy])=>Math.abs(fx-ux)<=r&&Math.abs(fy-uy)<=r));
}`,
`function nearCells(f,u,r){   // 两棋子占据格集合的切比雪夫距离 ≤ r（cleave/slam/volley 的"周围 N 格"）
  return cellsOf(f).some(([fx,fy])=>cellsOf(u).some(([ux,uy])=>Math.abs(fx-ux)<=r&&Math.abs(fy-uy)<=r));
}
function dirOf(u,f){   // 出手方向：朝目标向量的 8 向 sign；无向量时朝敌方半场
  if(!f) return {dx:0,dy:u.side===0?-1:1};
  const dx=Math.sign(f.x-u.x), dy=Math.sign(f.y-u.y);
  return (dx||dy)?{dx,dy}:{dx:0,dy:u.side===0?-1:1};
}
function frontFoes(u,foes,dir,opt){   // 前方 N 格：沿锁定方向的条带（width=侧向半宽）或扇区（cone），2×2 头目任一格落入即命中
  if(!dir||(!dir.dx&&!dir.dy)) return [];
  return foes.filter(f=>cellsOf(f).some(([cx,cy])=>{
    const ox=cx-u.x, oy=cy-u.y;
    const along=ox*dir.dx+oy*dir.dy;
    if(along<1||along>opt.depth) return false;
    const lat=Math.abs(ox*(-dir.dy)+oy*dir.dx);
    return opt.cone? lat<=along : lat<=opt.width;
  }));
}`,
'helpers-dir-front');

/* ===== 3. castV3Skill：出手瞬间锁定方向（引导技开条时已锁） ===== */
patch(F,
`  const target=v3PickTarget(u,foes,k), mark=svOf(u.id).sigMark;`,
`  const target=v3PickTarget(u,foes,k), mark=svOf(u.id).sigMark;
  const dir=u._castDir||((target||foes[0])?dirOf(u,target||foes[0]):null); u._castDir=null;   // 出手瞬间锁定攻击方向`,
'castv3-dir');

/* ===== 4. cleave：带 front 的走前方扇区，其余保留周围判定（羽入等） ===== */
patch(F,
`  } else if(k.mode==='cleave'){
    const times=k.hits||1;for(let i=0;i<times;i++){
      const list=foes.filter(f=>nearCells(f,u,1));`,
`  } else if(k.mode==='cleave'){
    const times=k.hits||1;for(let i=0;i<times;i++){
      const list=k.front?frontFoes(u,foes,dir,k.front):foes.filter(f=>nearCells(f,u,1));   // 前方扇区（纵深 2 格）或周围 1 格`,
'branch-cleave');

/* ===== 5. burst：鲨皇潮→前方条带，根性→前方扇区，其余保留 ===== */
patch(F,
`  } else if(k.mode==='burst'){
    if(u.id==='songlv')hitList=foes.filter(f=>nearCells(f,u,1));
    else if(target)hitList=[target,...v3NearestFoes(target,foes,1,2)];
    hitList.forEach(f=>hit(f,k.mult));
  }`,
`  } else if(k.mode==='burst'){
    if(k.front&&dir){hitList=frontFoes(u,foes,dir,k.front);
      const gv=unitVisual(u);const sw=fxNode('sweep',gv.x,gv.y,520);if(sw)sw.style['--rot']=(Math.atan2(dir.dy,dir.dx)*180/Math.PI).toFixed(0)+'deg';}
    else if(u.id==='songlv')hitList=foes.filter(f=>nearCells(f,u,1));
    else if(target)hitList=[target,...v3NearestFoes(target,foes,1,2)];
    hitList.forEach(f=>hit(f,k.mult));
  }`,
'branch-burst');

/* ===== 6. field：阿梓/灵门→前方条带波，晨露/星蚀保留自体圆形 ===== */
patch(F,
`  } else if(k.mode==='field'){
    const anchor=u.id==='liAn'?(foes.slice().sort((a,b)=>eatk(b)-eatk(a))[0]||target):u;
    const radius=u.id==='liAn'?4:3;
    hitList=foes.filter(f=>unitDist(f,anchor)<=radius);
    hitList.forEach(f=>hit(f,k.mult));vfxAoe(anchor,Math.max(1,Math.ceil(radius/2)),u.id==='seki'?'drain':'',650);`,
`  } else if(k.mode==='field'){
    if(k.front&&dir){   // 前方条带波（阿梓/灵门）：出手方向锁定
      hitList=frontFoes(u,foes,dir,k.front);
      hitList.forEach(f=>hit(f,k.mult));
      const gv=unitVisual(u);
      const sw=fxNode('sweep',gv.x,gv.y,560);
      if(sw)sw.style['--rot']=(target?fxDir(u,target).ang*180/Math.PI:Math.atan2(dir.dy,dir.dx)*180/Math.PI).toFixed(0)+'deg';
    }else{
    const anchor=u.id==='liAn'?(foes.slice().sort((a,b)=>eatk(b)-eatk(a))[0]||target):u;
    const radius=u.id==='liAn'?4:3;
    hitList=foes.filter(f=>unitDist(f,anchor)<=radius);
    hitList.forEach(f=>hit(f,k.mult));vfxAoe(anchor,Math.max(1,Math.ceil(radius/2)),u.id==='seki'?'drain':'',650);
    }`,
'branch-field');

/* ===== 7. 候选施法者排除引导中单位 ===== */
patch(F,
`      ? units.filter(v=>v.hp>0&&!v.isPassiveFlag&&v.stun<=0&&v.frozen<=0&&v.silenceT<=0&&v.hexT<=0&&v.mana>=v.maxmana&&v.skillCd<=0)`,
`      ? units.filter(v=>v.hp>0&&!v.isPassiveFlag&&!v.channel&&v.stun<=0&&v.frozen<=0&&v.silenceT<=0&&v.hexT<=0&&v.mana>=v.maxmana&&v.skillCd<=0)`,
'readycasters-excl-channel');

/* ===== 8. 引导状态机：每跳检查打断 / 完成结算（死亡清理顺带覆盖） ===== */
patch(F,
`      if(u.v3SoulShieldCd>0)u.v3SoulShieldCd-=TICK;
      if(u.hp<=0)continue;`,
`      if(u.v3SoulShieldCd>0)u.v3SoulShieldCd-=TICK;
      if(u.hp<=0){ if(u.channel){u.channel=null;hideCastBar(u);} continue; }
      if(u.channel){
        const ch=u.channel;
        if(u.stun>0||u.frozen>0||u.petrifyT>0||u.hexT>0||u.x!==ch.x||u.y!==ch.y){
          /* 引导被打断：硬控（眩晕/冰冻/石化/变形）或位移（拉近/击退）→ 退还一半蓝、不进技能 CD */
          u.channel=null;u._castDir=null;hideCastBar(u);
          u.mana=Math.min(u.maxmana,u.mana+u.maxmana*.5);
          vfxAt(u,'ring',500);dmgPopup(null,u,'❗打断','cast');
          log(\`　❗ \${u.side===0?'我方':'敌方'}\${byId(u.id).name} 的【\${byId(u.id).sk[0]}】引导被打断\`);
        } else {
          ch.left-=TICK;
          if(ch.left<=0){   // 引导完成：蓝/CD 在此刻才结算，方向沿用开条时锁定
            u.channel=null;hideCastBar(u);
            u.mana=0;
            const haste=Math.min(0.6,(u.side===0?augTotal('skillhaste')/100:0)+(u.skillHaste||0));
            u.skillCd=SKILL_CD*(1-haste);
            castSkill(u,null,units,u.skMul);
            if(bondModern())BondRuntime.cast(u,units);
            { const _bc=bsRec(u); if(_bc) _bc.casts++; }
            u.cd=Math.max(u.cd,SKILL_RECOVERY);
            if(u.side===0) lastCastAt0=t; else lastCastAt1=t;
            lastCastAt=t;nextCastSide=1-u.side;
          } else continue;   // 引导中静立：不移动、不普攻
        }
      }`,
'channel-tick');

/* ===== 9. 施法入口：带 castT 的技能进入引导（不消耗蓝/不进 CD） ===== */
patch(F,
`      if(u===nextCaster && u.silenceT<=0 && u.hexT<=0 && u.mana>=u.maxmana && u.skillCd<=0){
        if(bondModern()&&BondRuntime.beforeCast(u,units))continue;
        u.mana=0;`,
`      if(u===nextCaster && u.silenceT<=0 && u.hexT<=0 && u.mana>=u.maxmana && u.skillCd<=0){
        if(bondModern()&&BondRuntime.beforeCast(u,units))continue;
        const _ck=COMBAT_KITS[u.id], _ct=_ck&&_ck.castT?Math.round(_ck.castT*1000):0;
        if(_ct>0 && units.some(v=>v.hp>0&&v.side!==u.side)){
          /* ⏳ 引导读条：出手瞬间锁定攻击方向；蓝/CD 留到引导完成才结算 */
          const _dir=dirOf(u,v3PickTarget(u,units.filter(v=>v.hp>0&&v.side!==u.side),_ck));
          u.channel={left:_ct,total:_ct,dx:_dir.dx,dy:_dir.dy,x:u.x,y:u.y};
          u._castDir={dx:_dir.dx,dy:_dir.dy};
          vfxAt(u,'charge',_ct);
          showCastBar(u,_ct);
          log(\`　⏳ \${u.side===0?'我方':'敌方'}\${byId(u.id).name} 开始引导【\${_ck.name}】…\`);
        } else {
        u.mana=0;`,
'cast-entry-channel');

patch(F,
`        lastCastAt=t;   // 全场施法间隔
        nextCastSide=1-u.side;
      }`,
`        lastCastAt=t;   // 全场施法间隔
        nextCastSide=1-u.side;
        }
      }`,
'cast-entry-else-close');

/* ===== 10. 读条条 UI 挂载（跟随棋子元素，无 DOM 环境下静默） ===== */
patch(F,
`function fxNode(cls,x,y,dur){    // 在棋盘坐标 (x,y)（=元素中心）生成一个自动回收的特效节点`,
`function showCastBar(u,ms){   // ⏳ 读条条：挂在棋子元素上方，引导期间随时间排空
  try{
    const host=unitVisual(u).el; if(!host) return;
    hideCastBar(u,true);
    const wrap=document.createElement('div'); wrap.className='castbar';
    const fill=document.createElement('i');
    fill.style.animationDuration=Math.max(200,Math.round(ms/(SPEED||1)))+'ms';
    wrap.appendChild(fill); host.appendChild(wrap);
    u._castBarEl=wrap;
  }catch(e){}
}
function hideCastBar(u,instant){
  const el=u._castBarEl; u._castBarEl=null; if(!el) return;
  try{ if(instant){el.remove();} else {el.classList.add('done'); setTimeout(()=>el.remove(),200);} }catch(e){}
}
function fxNode(cls,x,y,dur){    // 在棋盘坐标 (x,y)（=元素中心）生成一个自动回收的特效节点`,
'castbar-fns');

/* ===== 11. CSS：读条条样式 ===== */
{
  const css = 'tools/battle-presentation.css';
  let c = readFileSync(css, 'utf8');
  const block = `
/* ⏳ 引导读条条（挂在棋子元素上方，随引导时间排空） */
.castbar{position:absolute;left:12%;right:12%;top:-9px;height:6px;border-radius:3px;background:rgba(8,12,24,.78);border:1px solid rgba(255,208,112,.5);box-shadow:0 0 8px rgba(255,190,90,.35);pointer-events:none;z-index:70;overflow:hidden}
.castbar i{display:block;height:100%;width:100%;border-radius:2px;background:linear-gradient(90deg,#ffe1a0,#ff9d5c);transform-origin:left center;animation:castbarDrain linear forwards}
@keyframes castbarDrain{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.castbar.done{opacity:0;transition:opacity .18s ease-out}
`;
  if (c.includes('castbarDrain')) { console.log('skip [css] already patched'); }
  else { writeFileSync(css, c + block.replace(/\n/g, c.includes('\r\n') ? '\r\n' : '\n')); console.log(`ok [css] ${css}`); }
}

/* ===== 12. 版本号：battle-presentation.css ?v= 1→2；sw CACHE v132→v133 ===== */
patch(F,
`<link rel="stylesheet" href="tools/battle-presentation.css?v=1">`,
`<link rel="stylesheet" href="tools/battle-presentation.css?v=2">`,
'version-css');

patch('sw.js',
`const CACHE = 'vcache-v132-queue-arena-home';`,
`const CACHE = 'vcache-v133-front-channel';`,
'version-sw');

console.log(failed ? '\n== SOME PATCHES FAILED ==' : '\n== ALL PATCHES APPLIED ==');
if (failed) process.exit(1);
