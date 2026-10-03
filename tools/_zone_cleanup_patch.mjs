/* 修复：战斗中途结束时预警格永久残留（一次性补丁，CRLF 安全）
 * 根因：读条/区域标记的清理挂在战斗时钟上，战斗在读条中途结束则无路径摘除；
 * 自动开战不重建棋盘，脏格带进下一场。修复=战斗结束钩子全清 + startBattle 防御性再清。 */
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

/* ===== 1. 全清 helper ===== */
patch(F,
`function zoneCls(u,base){ return u.side===0?base:base+' zone-foe'; }   // 敌方施法者：预警/闪光带 zone-foe 修饰（红/绯危险色，与敌方半场同语）`,
`function clearAllZoneMarks(){   // 战斗收尾：清空全部格子预警/闪光（战斗在读条/区域中途结束时不走逐单位清理路径）
  try{
    const b=$('board'); if(!b) return;
    b.querySelectorAll('.cell.zone-warn,.cell.zone-hit').forEach(el=>el.classList.remove('zone-warn','zone-foe','zone-hit'));
  }catch(e){}
}
function zoneCls(u,base){ return u.side===0?base:base+' zone-foe'; }   // 敌方施法者：预警/闪光带 zone-foe 修饰（红/绯危险色，与敌方半场同语）`,
'clear-all-helper');

/* ===== 2. 战斗结束钩子：停钟后立即清理棋子状态与格子标记 ===== */
patch(F,
`    if((alive0===0||alive1===0||t>60000)&&(t>60000||!skillImpactQueue.length)){
      stopTickLoop();
      if(t>60000&&alive0>0&&alive1>0) log(\`⏱ 战斗超时（60 秒）：按存活数判定 —— 我方 \${alive0} : 敌方 \${alive1}，\${alive0>=alive1?'我方判胜':'我方判负'}（与常规判定同口径：存活数不少于敌方即为胜）\`);`,
`    if((alive0===0||alive1===0||t>60000)&&(t>60000||!skillImpactQueue.length)){
      stopTickLoop();
      units.forEach(u=>{u.channel=null;u._castDir=null;u._zoneEls=null;u._zoneFoe=false;hideCastBar(u);});   // 读条中途战斗结束：状态与读条条一并清理
      clearAllZoneMarks();   // 否则预警格永久残留（自动开战不重建棋盘会带进下一场）
      if(t>60000&&alive0>0&&alive1>0) log(\`⏱ 战斗超时（60 秒）：按存活数判定 —— 我方 \${alive0} : 敌方 \${alive1}，\${alive0>=alive1?'我方判胜':'我方判负'}（与常规判定同口径：存活数不少于敌方即为胜）\`);`,
'battle-end-cleanup');

/* ===== 3. startBattle 防御性再清（覆盖自动连战/任何非常规路径） ===== */
patch(F,
`  stopTickLoop(); // 关闭任何残余的战斗时钟`,
`  stopTickLoop(); // 关闭任何残余的战斗时钟
  clearAllZoneMarks();   // 防御：清掉上一场遗留的格子预警/闪光（自动连战中间不重建棋盘）`,
'startbattle-defensive-wipe');

console.log(failed ? '\n== SOME PATCHES FAILED ==' : '\n== ALL PATCHES APPLIED ==');
if (failed) process.exit(1);
