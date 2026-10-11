// Verified playable entries; unimplemented games remain in the upcoming catalog.
export const games = [
  {id:'midnight-store',title:'下播后的便利店',category:'经营叙事',description:'雨夜的最后一盏灯，为下播的人留着。备货、推荐商品，听岁己、栞栞和灰泽满讲完七夜的故事。',entry:'games/midnight-store/',art:'assets/game-library/midnight-store/store-v1.webp',cast:['suiji','kanban','huize'],portraits:{suiji:'assets/game-library/midnight-store/suiji-v1.webp',kanban:'assets/game-library/midnight-store/kanban-v1.webp',huize:'assets/game-library/midnight-store/huize-v1.webp'},tags:['单人','鼠标 / 触屏','七夜故事'],label:'新作试玩',keywords:'岁己 栞栞 灰泽满 便利店 经营 故事 剧情',order:0},
  {id:'studio-manager',title:'今晚谁来播',category:'模拟经营',description:'选三位成员，安排十二档节目。把四周的日常，变成一场闪闪发光的联合演出。',entry:'games/studio-manager/',art:'assets/game-library/studio-manager/studio-v1.webp',cast:['suiji','kanban','huize'],tags:['单人','鼠标 / 触屏','可随时保存'],label:'已开放',keywords:'岁己 栞栞 灰泽满 七海 阿梓 工作室 直播',order:1},
  {id:'classic',title:'星域棋战',category:'策略对战',description:'招募虚拟偶像，搭配羁绊与装备，在每一轮备战中寻找自己的获胜阵容。',entry:'classic.html',art:'assets/hall/idol-sky-stage.webp',cast:['suiji','nana7mi','azi'],tags:['单人闯关','鼠标 / 触屏','本地存档'],label:'经典作品',keywords:'自走棋 单机 岁己 七海 阿梓 每日挑战',order:2},
  {id:'arena',title:'星域小队',category:'策略对战',description:'组建小队，迎战对手阵容。在有限的金币和生命之间，向十座奖杯出发。',entry:'arena.html',art:'assets/hall/idol-arena-v2.webp',cast:['kanban','huize'],tags:['异步竞技场','联网 / 本地训练','鼠标 / 触屏'],label:'小队竞技',keywords:'竞技场 自走棋 栞栞 灰泽满',order:3},
  {id:'survival',title:'星域幸存者',category:'动作冒险',description:'走位、升级、构筑技能，在不断涌来的敌群中守住属于你的舞台。',entry:'survival.html',art:'assets/hall/idol-arena-night.webp',cast:['azi','suiji'],tags:['单人','键盘 / 触屏'],label:'生存挑战',keywords:'幸存者 肉鸽 阿梓 岁己',order:4},
  {id:'rpg',title:'星渊手记',category:'动作冒险',description:'五人同行，前后排协作，手动释放必杀。启程寻找第一章里失落的星灯。',entry:'rpg/',art:'assets/hall/idol-sky-stage.webp',cast:['nana7mi','kanban'],tags:['五人编队 RPG','鼠标 / 触屏','第一章'],label:'星灯远征',keywords:'角色扮演 剧情 七海 栞栞',order:5},
  {id:'online',title:'星域棋战 · 八人联机',category:'策略对战',description:'和其他玩家同场备战，选棋、升级、调整站位，一起迎接下一轮对决。',entry:'online.html',art:'assets/hall/idol-arena-v2.webp',cast:['huize','nana7mi','azi'],tags:['在线多人','需联网服务','鼠标 / 触屏'],label:'联机对战',keywords:'多人 自走棋 联网 灰泽满 七海 阿梓',order:6},
  {id:'rpg-action',title:'星渊手记 · 自由探索',category:'动作冒险',description:'走进早期探索原型，自由移动、遭遇敌人，体验另一种星渊冒险。',entry:'rpg/action.html',art:'assets/hall/idol-arena-night.webp',cast:['huize','suiji'],tags:['单人','键盘 / 触屏','早期原型'],label:'探索原型',keywords:'自由移动 动作 原型 灰泽满 岁己',order:7},
];

export function selectGames(catalog,{query='',category='all',tab='all',favorites=[],recent=[],sort='recommended'}={}) {
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const selected=catalog.filter(g=>(category==='all'||g.category===category)&&
    (tab!=='favorites'||favorites.includes(g.id))&&(tab!=='recent'||recent.includes(g.id))&&
    words.every(word=>`${g.title} ${g.description} ${g.category} ${g.keywords} ${g.tags.join(' ')}`.toLocaleLowerCase().includes(word)));
  return selected.sort((a,b)=>tab==='recent'?recent.indexOf(a.id)-recent.indexOf(b.id):sort==='title'?a.title.localeCompare(b.title,'zh-CN'):a.order-b.order);
}
