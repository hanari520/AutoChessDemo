import { ROSTER, RULESET, tierFor } from './core.mjs';

const paths=[
 {name:'森林伴舞团',ids:['songlv','yujiu','goutan','pako','mahiru']},
 {name:'午后成长队',ids:['goutan','agari','likou','yukie','huali','miki']},
 {name:'聚光支援队',ids:['goutan','agari','ein','kouichi','yua','aza','ruiya','nana7mi']},
 {name:'茶会培养队',ids:['suiji','agari','lianshiye','shengge','mumu','miki','haruka']},
 {name:'返场守护队',ids:['songlv','hoshimi','kanban','shiliu','seki','liAn','rei','taodai']},
 {name:'震场接力队',ids:['shadow','xuezhu','tiandou','diansu','agari']},
 {name:'星火舞团',ids:['songlv','mahiru','kanban','zeyin','miyue']},
 {name:'镜像破阵队',ids:['quanrong','rinco','youyi','youyu','agari']},
];
// Front is slot zero. Seeds cover early shops, full five-unit teams and later scaling.
export const PRESET_TEAMS=Array.from({length:30},(_,index)=>paths.map((path,p)=>{
 const round=index+1,tier=tierFor(round),eligible=path.ids.map(id=>ROSTER.find(u=>u.id===id)).filter(u=>u.tier<=tier);
 const count=Math.min(5,round===1?2:round===2?3:round===3?4:5);
 const team=Array.from({length:5},(_,i)=>{if(i>=count)return null;const d=eligible[i%eligible.length];const growth=Math.max(0,round-3);const boosted=i===0?Math.ceil(growth*.7):Math.floor(growth*.45);return {uid:`preset-${round}-${p}-${i}`,id:d.id,atk:Math.min(50,d.atk+boosted),hp:Math.min(50,d.hp+boosted),xp:round>=12&&i<2?2:0,level:round>=12&&i<2?2:1,perk:round>=9&&i===0?'garlic':round>=5&&p===0&&i<2?'honey':null};});
 return {id:`${RULESET}-r${round}-p${p}`,name:path.name,round,ruleset:RULESET,source:'training',team};
})).flat();
export function presetsFor(round){return PRESET_TEAMS.filter(x=>x.round===Math.min(30,round));}
