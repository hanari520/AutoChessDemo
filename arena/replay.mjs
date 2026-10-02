// Replay presentation also accepts saved events from before actor metadata existed.
export const EVENT_LABELS={revive:['↺','返场演出'],volley:['◎','双重聚光'],tripleZap:['✦','三重星轨'],lastWord:['↯','谢幕震波'],attackSnipe:['➶','剑舞破后'],sniperSupport:['◎','精准伴奏'],revengeSnipe:['↩','离场追光'],shieldBreak:['↑','破盾觉醒'],copy:['◇','镜像合演'],rearGrow:['↑','接力应援'],hurtGrow:['↑','受伤成长'],hurtGift:['↗','逆境传递'],friendlyHit:['♫','震场节拍'],knockout:['➶','破阵追击'],faintGrow:['↑','谢幕接棒'],summonTrain:['✦','舞团编排'],weakening:['◎','聚光压制'],relayAttack:['↗','聚光传递'],roundEndStart:['◷','回合结束'],roundEnd:['↑','回合结束成长'],start:['✦','双方登场'],attack:['⚔','前排交锋'],snipe:['◎','开场狙击'],support:['✧','后排支援'],cleave:['➶','波及后排'],retaliate:['↩','受伤反击'],shield:['◈','护盾展开'],buff:['↑','援护增益'],heal:['♥','生命恢复'],summon:['＋','召唤登场'],faint:['↓','队员退场'],end:['⚑','战斗结算']};
export function eventChanges(event,previous){
 const changes=[];
 for(const side of ['a','b']){
  const before=new Map((previous?.[side]||[]).filter(Boolean).map(u=>[u.uid,u]));
  for(const u of (event[side]||[]).filter(Boolean)){
   const old=before.get(u.uid);before.delete(u.uid);
   if(!old){if(previous)changes.push({side,uid:u.uid,type:'enter',unit:u});continue;}
   const hp=u.hp-old.hp,atk=u.atk-old.atk,shield=(u.shield||0)-(old.shield||0);
   if(hp||atk||shield)changes.push({side,uid:u.uid,type:'stats',hp,atk,shield,unit:u});
  }
  for(const u of before.values())changes.push({side,uid:u.uid,type:'exit',unit:u});
 }
 return changes;
}
export function eventActors(event,previous,name){
 if(event.actors)return event.actors;
 if(event.type==='attack')return ['a','b'].flatMap(side=>{const u=(previous?.[side]||event[side]).find(Boolean);return u?[{side,uid:u.uid}]:[];});
 if(['start','end','faint','summon'].includes(event.type))return [];
 for(const side of ['a','b'])for(const u of [...(previous?.[side]||[]),...(event[side]||[])].filter(Boolean))if(event.text.startsWith(name(u)))return [{side,uid:u.uid}];
 return [];
}
export function actionFeedback(before,after,action,info){
 const labels={buy:'招募',food:'使用道具',sell:'出售',roll:'刷新商店',merge:'合并',move:'调整队伍',freeze:'冻结商品',bonus:'领取升级奖励'};
 const actor=action.type==='sell'?before.team[action.slot]:action.type==='buy'||action.type==='food'?after.team[action.to]:action.type==='merge'?after.team[action.to]:null;
 const text=labels[action.type]||'操作完成',notes=[{text:`${text}${actor?' · '+info(actor.id).name:''}`,caption:text,uids:actor?[actor.uid]:[],shop:['roll','bonus'].includes(action.type),departure:action.type==='sell'?{unit:actor,slot:action.slot}:null}];
 for(const c of eventChanges({a:after.team,b:[]},{a:before.team,b:[]}))if(c.type==='stats')notes.push({text:`${info(c.unit.id).name} ${c.atk?`攻击 ${c.atk>0?'+':''}${c.atk}`:''} ${c.hp?`生命 ${c.hp>0?'+':''}${c.hp}`:''}`.trim(),uids:[c.uid],atk:c.atk,hp:c.hp});
 for(const u of after.team.filter(Boolean)){
  const old=before.team.find(v=>v?.uid===u.uid);if(!old)continue;
  if(u.level>old.level)notes.push({text:`${info(u.id).name} 升至 ${u.level} 级，技能强化`,uids:[u.uid],level:u.level});
  else if(u.xp>old.xp)notes.push({text:`${info(u.id).name} 经验 +${u.xp-old.xp}`,uids:[u.uid]});
  if(u.perk!==old.perk)notes.push({text:`${info(u.id).name} 装备携带道具`,uids:[u.uid]});
  if(action.type==='roll'&&u.rollIncomeRound!==old.rollIncomeRound)notes.push({text:`${info(u.id).name} 刷新收益 +${u.level} 金币`,uids:[u.uid],gold:u.level});
 }
 const recruited=action.type==='buy'&&!before.team[action.to]?after.team[action.to]:null;
 for(const u of after.team.filter(Boolean)){
  const kind=info(u.id).kind;
  const trigger=kind==='foodShare'&&action.type==='food'||kind==='allyBuy'&&recruited&&recruited!==u&&info(recruited.id).tier===1||kind==='teamLevel'&&after.team.some(v=>v&&v!==u&&before.team.some(old=>old?.uid===v.uid&&old.level<v.level));
  if(trigger)notes.push({text:`${info(u.id).name} · ${info(u.id).title}触发`,caption:info(u.id).title,uids:[u.uid]});
 }
 if(action.type==='sell')notes.push({text:`出售获得 ${after.gold-before.gold} 金币`,uids:[],gold:after.gold-before.gold});
 return notes;
}
