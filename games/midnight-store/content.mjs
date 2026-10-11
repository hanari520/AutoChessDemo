const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freezeDeep);
  }
  return value;
};

export const RULES_VERSION = '1';
export const CONTENT_VERSION = '1';
export const TAG_LABELS = freezeDeep({
  temperature: { hot: '热', cold: '冷', room: '常温' },
  taste: {
    bitter: '苦味', sweet: '甜味', floral: '花香', tangy: '酸味', creamy: '奶香',
    savory: '咸鲜', salty: '咸味', plain: '清淡',
  },
  boost: { 0: '不提神', 1: '温和提神', 2: '强提神' },
  storage: { warm: '保温柜', chilled: '冷柜', shelf: '常温货架' },
});

export const PRODUCTS = freezeDeep([
  {
    id: 'hot-coffee', name: '罐装黑咖啡', icon: '☕', cost: 5, price: 10,
    temperature: 'hot', temperatureLabel: '热', taste: 'bitter', tasteLabel: '苦味', boost: 2, boostLabel: '强提神', storage: 'warm',
    perishable: false, description: '苦味鲜明，提神很直接。常温保存。',
  },
  {
    id: 'hot-cocoa', name: '热可可', icon: '🍫', cost: 5, price: 10,
    temperature: 'hot', temperatureLabel: '热', taste: 'sweet', tasteLabel: '甜味', boost: 0, boostLabel: '不提神', storage: 'warm',
    perishable: false, description: '甜而柔和，不含咖啡因。常温保存。',
  },
  {
    id: 'herbal-tea', name: '桂花茶', icon: '🍵', cost: 4, price: 9,
    temperature: 'hot', temperatureLabel: '热', taste: 'floral', tasteLabel: '花香', boost: 1, boostLabel: '温和提神', storage: 'warm',
    perishable: false, description: '带一点花香，温和提神。常温保存。',
  },
  {
    id: 'cold-soda', name: '柠檬汽水', icon: '🥤', cost: 4, price: 9,
    temperature: 'cold', temperatureLabel: '冷', taste: 'tangy', tasteLabel: '酸味', boost: 2, boostLabel: '强提神', storage: 'chilled',
    perishable: false, description: '冰凉、酸爽，气泡很足。冷柜保存。',
  },
  {
    id: 'cold-milk', name: '鲜牛奶', icon: '🥛', cost: 4, price: 9,
    temperature: 'cold', temperatureLabel: '冷', taste: 'creamy', tasteLabel: '奶香', boost: 0, boostLabel: '不提神', storage: 'chilled',
    perishable: true, description: '口感柔和，不提神。冷柜保存，闭店后过期。',
  },
  {
    id: 'cold-yogurt', name: '酸奶', icon: '🍶', cost: 4, price: 9,
    temperature: 'cold', temperatureLabel: '冷', taste: 'sweet', tasteLabel: '甜味', boost: 0, boostLabel: '不提神', storage: 'chilled',
    perishable: true, description: '微甜清爽，不提神。冷柜保存，闭店后过期。',
  },
  {
    id: 'rice-ball', name: '盐昆布饭团', icon: '🍙', cost: 5, price: 11,
    temperature: 'room', temperatureLabel: '常温', taste: 'savory', tasteLabel: '咸鲜', boost: 0, boostLabel: '不提神', storage: 'shelf',
    perishable: true, description: '咸鲜扎实，适合垫肚子。常温保存，当夜售完。',
  },
  {
    id: 'crackers', name: '海盐苏打饼', icon: '🍘', cost: 3, price: 7,
    temperature: 'room', temperatureLabel: '常温', taste: 'salty', tasteLabel: '咸味', boost: 0, boostLabel: '不提神', storage: 'shelf',
    perishable: false, description: '干脆带咸味，密封包装。',
  },
  {
    id: 'citrus-gum', name: '柚子薄荷糖', icon: '🍬', cost: 3, price: 7,
    temperature: 'room', temperatureLabel: '常温', taste: 'tangy', tasteLabel: '酸味', boost: 1, boostLabel: '温和提神', storage: 'shelf',
    perishable: false, description: '柚子酸香里有一丝薄荷，能提一点神。',
  },
]);

export const CUSTOMERS = freezeDeep([
  {
    id: 'suiji', name: '岁己', pronoun: '她', portrait: '../../assets/game-library/midnight-store/suiji-v1.webp',
    description: '夜里收集城市声音的剪辑师。话不多，记得住每一段细小的回声。',
    path: '她在整理一段关于旧街的声音档案，也在决定哪些声音值得留下。',
  },
  {
    id: 'kanban', name: '栞栞', pronoun: '她', portrait: '../../assets/game-library/midnight-store/kanban-v1.webp',
    description: '负责街区公告栏的志愿者。习惯把零散的消息排成清楚的日历。',
    path: '她想让街坊公告栏重新热闹起来，并给每个小小的约定留一个位置。',
  },
]);

const listenReply = (id, text, response) => ({
  id: `${id}-listen`,
  text,
  response,
  effects: { listen: true },
});

const otherReply = (id, text, response, effects) => ({
  id: `${id}-choice`,
  text,
  response,
  effects,
});

const makeScene = ({
  id, night, slot, customerId, title, text, clue, wanted, replies, reaction,
}) => ({
  id, night, slot, customerId, title, text, clue, wanted,
  reaction: reaction ?? {
    full: '她看了一眼标签，点点头：这正合适。',
    partial: '她接过饮料，笑说至少有一半猜对了。',
    miss: '她还是接下了这份好意，不过眼下需要的确实不是这个。',
  },
  replies,
});

export const SCENES = freezeDeep([
  makeScene({
    id: 'n1-s0', night: 1, slot: 0, customerId: 'suiji', title: '旧街的回声',
    text: '岁己把一副耳机摘下一边。她正在剪一段老街录音，路口的风声盖住了最后一句采访。',
    clue: '她想要【热 / 花香 / 温和提神】的饮料，方便慢慢听完录音。',
    wanted: { temperature: 'hot', taste: 'floral', boost: 1 },
    replies: [
      listenReply('n1-s0', '把剪辑进度先放一放，听她说完', '你没有催她交稿。她把耳机里的风声也放给你听。'),
      otherReply('n1-s0', '答应替她留一张夜间录音的空白卡', '你在柜台便签上写下“留一格空白”。', { commitment: 'make' }),
    ],
    reaction: {
      full: '岁己喝了一口桂花茶，耳机里的街声终于有了空隙。',
      partial: '她把饮料放在剪辑台边，继续听那段风声。',
      miss: '她礼貌地接过饮料，仍把耳机音量调低了一格。',
    },
  }),
  makeScene({
    id: 'n1-s1', night: 1, slot: 1, customerId: 'kanban', title: '公告栏上的空格',
    text: '栞栞抱着一卷新纸，袖口沾了点胶水。街区公告栏还空着一半，她不想用广告把那些位置填满。',
    clue: '她想要【常温 / 酸味 / 温和提神】的东西，准备把公告排到天亮前。',
    wanted: { temperature: 'room', taste: 'tangy', boost: 1 },
    replies: [
      listenReply('n1-s1', '问她哪些消息应该先留在公告栏上', '栞栞说，先把没人愿意问出口的事写得更容易看见。'),
      otherReply('n1-s1', '答应下次把街坊留言空栏留给她', '你答应给公告栏留出一块不被促销占走的位置。', { commitment: 'make' }),
    ],
    reaction: {
      full: '柚子薄荷糖让她清醒了一点，她顺手把空白栏的尺寸记下来。',
      partial: '她把饮料放到卷纸旁，继续整理公告的顺序。',
      miss: '她收下饮料，先用手背把胶水擦掉。',
    },
  }),
  makeScene({
    id: 'n1-s2', night: 1, slot: 2, customerId: 'suiji', title: '把街声贴到地图上',
    text: '岁己在店门口按下录音键，栞栞摊开一张还没有标注的街区图。她们想做一份夜里也看得懂的散步路线，先从哪段路最安静开始记。',
    clue: '岁己想要【常温 / 咸味 / 不提神】的东西，边听雨声边整理第一份路线笔记。',
    wanted: { temperature: 'room', taste: 'salty', boost: 0 },
    replies: [
      listenReply('n1-s2', '听岁己和栞栞商量路线要从哪里开始', '岁己把最清楚的一段雨声放给栞栞听；栞栞决定先标出有屋檐、能停下来读地图的店铺。'),
      otherReply('n1-s2', '答应替她们留一张夜路路线卡', '你在柜台边留下一张空白卡，等她们把第一段路线确认好。', { commitment: 'make' }),
    ],
    reaction: {
      full: '海盐饼干刚好垫住了空腹，岁己把耳机递给栞栞，两个人听见同一阵雨落在屋檐上。',
      partial: '她们把路线图挪到柜台边，继续核对哪几家店夜里还开着。',
      miss: '岁己收下点心，栞栞先把容易被雨淋到的地图折进纸袋。',
    },
  }),
  makeScene({
    id: 'n2-s0', night: 2, slot: 0, customerId: 'suiji', title: '留白的那一格',
    text: '岁己把昨天的录音卡带来了。那句采访没有剪掉，她在旁边留了一段安静的空白。',
    clue: '她想要【热 / 苦味 / 强提神】的饮料，今晚要把旧街的最后一段剪完。',
    wanted: { temperature: 'hot', taste: 'bitter', boost: 2 },
    replies: [
      listenReply('n2-s0', '听她解释为什么留下那段沉默', '她说，有些停顿不是空白，是对方还没有准备好继续。'),
      otherReply('n2-s0', '记下她偏好的苦味和提神程度', '你在她的常客小票上记下了“苦一点、提神强”。', { preference: true }),
    ],
    reaction: {
      full: '她喝完咖啡，手指在剪辑键上停稳了。',
      partial: '她抿了一口，又把耳机戴回去。',
      miss: '她把饮料放在桌边，仍照自己的节奏剪辑。',
    },
  }),
  makeScene({
    id: 'n2-s1', night: 2, slot: 1, customerId: 'kanban', title: '先写哪一张',
    text: '栞栞带来三张街坊留言：修伞、找猫、周末合唱。她想把最急的一张放在最显眼的位置。',
    clue: '她想要【冷 / 甜味 / 不提神】的饮料，让嗓子在贴公告前歇一歇。',
    wanted: { temperature: 'cold', taste: 'sweet', boost: 0 },
    replies: [
      listenReply('n2-s1', '请她说说三张留言各自等了多久', '栞栞决定先贴修伞的消息，因为雨季已经到了。'),
      otherReply('n2-s1', '记住她喜欢清甜、无咖啡因的饮料', '你把“清甜、不提神”记在她的常客小票上。', { preference: true }),
    ],
    reaction: {
      full: '酸奶的甜味不抢嗓子，她终于能把留言念出声。',
      partial: '她把饮料放好，照旧先排了一遍留言顺序。',
      miss: '她收下饮料，清了清嗓子继续整理。',
    },
  }),
  makeScene({
    id: 'n2-s2', night: 2, slot: 2, customerId: 'kanban', title: '施工围挡旁的替代路线',
    text: '栞栞把昨晚的录音标在地图上：桥边施工声太响，路牌也被挡住了。岁己拿出另一段录音，两人试着从有路灯的巷子绕过去。',
    clue: '栞栞想要【热 / 甜味 / 不提神】的饮料，边核对地图边把绕行说明写清楚。',
    wanted: { temperature: 'hot', taste: 'sweet', boost: 0 },
    replies: [
      listenReply('n2-s2', '请栞栞说说怎样让绕路说明更容易照着走', '她把两盏路灯和一处能避雨的屋檐圈出来；岁己补上录音里听见的施工噪声位置。'),
      otherReply('n2-s2', '记住她整理路线时想喝甜而不提神的东西', '你在栞栞的常客小票上记下“甜一点，不要咖啡因”。', { preference: true }),
    ],
    reaction: {
      full: '热可可压下了夜风的凉意，栞栞把绕行路线抄清楚，岁己在旁边标上录音时间。',
      partial: '她们把地图折好，准备明晚去实地确认那两盏路灯。',
      miss: '栞栞收下饮料，先把桥边容易误走的路口圈了起来。',
    },
  }),
  makeScene({
    id: 'n3-s0', night: 3, slot: 0, customerId: 'suiji', title: '纸卡没有丢',
    text: '岁己找回了旧街采访的原始文件。她把一段邻居哼歌的录音单独放进了文件夹，没有急着发布。',
    clue: '她想要【冷 / 酸味 / 强提神】的饮料，好把最后一遍校对做完。',
    wanted: { temperature: 'cold', taste: 'tangy', boost: 2 },
    replies: [
      listenReply('n3-s0', '问她愿不愿意把那段歌声留在档案里', '她说会先问过唱歌的人，再决定要不要让更多人听见。'),
      otherReply('n3-s0', '把留好的空白录音卡交给她', '你把答应留下的空白卡递给她；那格空白终于有了去处。', { commitment: 'fulfill' }),
    ],
    reaction: {
      full: '汽水的酸爽把她从困意里拉回来，她把最后一遍校对完了。',
      partial: '她抿了一口，接着检查录音文件名。',
      miss: '她把饮料放到一旁，先确认原始文件已经备份。',
    },
  }),
  makeScene({
    id: 'n3-s1', night: 3, slot: 1, customerId: 'kanban', title: '雨天修伞处',
    text: '栞栞把公告栏重新排过了。最上面不再是活动广告，而是附近修伞摊的营业时间。',
    clue: '她想要【热 / 花香 / 温和提神】的饮料，趁雨停前把新纸贴牢。',
    wanted: { temperature: 'hot', taste: 'floral', boost: 1 },
    replies: [
      listenReply('n3-s1', '陪她确认每张公告都有人能联系', '你们给每张纸都补上了清楚的时间和地点。'),
      otherReply('n3-s1', '把公告栏的空白位置留给街坊留言', '你兑现了不拿空栏做广告的约定，栞栞把留言纸贴了上去。', { commitment: 'fulfill' }),
    ],
    reaction: {
      full: '花香让她的嗓子松下来，她一张张把公告贴平。',
      partial: '她把饮料放在胶带旁，接着压住被风吹起的一角。',
      miss: '她接过饮料，先把公告重新贴牢。',
    },
  }),
  makeScene({
    id: 'n3-s2', night: 3, slot: 2, customerId: 'suiji', title: '让路口留在声音里',
    text: '岁己和栞栞沿着绕行路线走回来。她们发现路口的灯不算亮，但店铺关门前会有人把门前的小灯留着；岁己想把这段安静的脚步声录下来。',
    clue: '岁己想要【常温 / 咸味 / 不提神】的东西，和栞栞分着吃完再整理录音。',
    wanted: { temperature: 'room', taste: 'salty', boost: 0 },
    replies: [
      listenReply('n3-s2', '听她们说说实地走过后改了哪些标记', '栞栞说，路线不能只标最短；岁己补录了一段店门口的风铃声，提醒人们已经走到转弯处。'),
      otherReply('n3-s2', '把留好的夜路路线卡交给她们', '你兑现了留卡片的约定。栞栞把确认过的路线抄上去，岁己添了一句声音提示。', { commitment: 'fulfill' }),
    ],
    reaction: {
      full: '海盐饼干正好够两个人分，岁己把最后一点碎屑抖进纸袋，栞栞把确认过的路线卡收好。',
      partial: '她们把点心收好，准备带着地图去看下一处路口。',
      miss: '岁己道了谢，先把录音卡备份，免得刚才的声音被覆盖。',
    },
  }),
  makeScene({
    id: 'n4-s0', night: 4, slot: 0, customerId: 'suiji', title: '把风声交还给风',
    text: '岁己把剪好的录音送给采访对象听。对方只要求改一个地方：把自己的名字从文件名里拿掉。',
    clue: '她想要【热 / 苦味 / 强提神】的饮料，准备把匿名版本导出。',
    wanted: { temperature: 'hot', taste: 'bitter', boost: 2 },
    replies: [
      listenReply('n4-s0', '问她怎样确认对方听了会安心', '岁己说，她会先把成片交回去，而不是把试听链接发给陌生人。'),
      otherReply('n4-s0', '记住她以后要先确认录音对象的意愿', '你把她的工作习惯记下来：发布前先让对方听过。', { preference: true }),
    ],
    reaction: {
      full: '黑咖啡的苦味很干净，她把文件名改成了“街口的风”。',
      partial: '她喝了一口，确认匿名版本的音量没有突兀变化。',
      miss: '她把饮料留在柜台，逐项检查了文件名。',
    },
  }),
  makeScene({
    id: 'n4-s1', night: 4, slot: 1, customerId: 'kanban', title: '一张不着急的海报',
    text: '栞栞画了一张周末合唱的小海报。她没有写“最后名额”，只写了“路过也可以听一首”。',
    clue: '她想要【冷 / 奶香 / 不提神】的饮料，贴海报前想让声音休息一下。',
    wanted: { temperature: 'cold', taste: 'creamy', boost: 0 },
    replies: [
      listenReply('n4-s1', '请她读一遍海报上最想留下的那句话', '她念出“路过也可以听一首”，然后把笔放下了。'),
      otherReply('n4-s1', '记下她偏好不太甜、能润嗓子的冷饮', '你记住她更喜欢奶香轻、不会抢嗓子的冷饮。', { preference: true }),
    ],
    reaction: {
      full: '牛奶的口感很轻，她把海报贴在了不挡住修伞公告的位置。',
      partial: '她把饮料放好，先确认公告栏没有被新海报挤满。',
      miss: '她收下饮料，轻声把海报上的话又念了一遍。',
    },
  }),
  makeScene({
    id: 'n4-s2', night: 4, slot: 2, customerId: 'kanban', title: '给第一次来的人留一张图',
    text: '栞栞把路线图贴在公告栏上，岁己陪她看一位路过的人从哪里停下来读。那人没进店，只在图边写了“这里的路灯坏了”。',
    clue: '栞栞想要【热 / 花香 / 温和提神】的饮料，今晚要把公告栏上的路线说明补完整。',
    wanted: { temperature: 'hot', taste: 'floral', boost: 1 },
    replies: [
      listenReply('n4-s2', '问栞栞准备怎样处理路灯坏掉的留言', '她不想只把留言贴上去，还想先确认报修电话；岁己答应录一段简短的口述说明。'),
      otherReply('n4-s2', '记住她排公告时喜欢带香气的热茶', '你记住栞栞整理公告时喜欢温和提神、带点香气的热茶。', { preference: true }),
    ],
    reaction: {
      full: '桂花茶的香气很轻，栞栞把报修电话写上公告，岁己录下了不会暴露留言者身份的说明。',
      partial: '她们把饮料放在地图旁，继续确认报修消息该贴在哪个位置。',
      miss: '栞栞收下饮料，先把那条没有联系方式的留言单独夹好。',
    },
  }),
  makeScene({
    id: 'n5-s0', night: 5, slot: 0, customerId: 'suiji', title: '旧桥录音的备份',
    text: '岁己把旧桥录音备份了两份。她说，档案不是为了收藏声音，而是让说话的人以后还能找到自己的那一份。',
    clue: '她想要【热 / 花香 / 温和提神】的饮料，边核对两份备份边休息。',
    wanted: { temperature: 'hot', taste: 'floral', boost: 1 },
    replies: [
      listenReply('n5-s0', '问她最想把哪一段声音还给街坊', '她选了旧桥下的报时钟声，因为附近的店家都听得出来。'),
      otherReply('n5-s0', '记住她喜欢把档案交回录音者手中', '你记住了：每段声音都要让录音的人先听见。', { preference: true }),
    ],
    reaction: {
      full: '桂花茶刚好温着，她终于把两份备份放进了不同的袋子。',
      partial: '她喝了一口，继续对照两张文件清单。',
      miss: '她把饮料搁下，先确认备份日期没有写错。',
    },
  }),
  makeScene({
    id: 'n5-s1', night: 5, slot: 1, customerId: 'kanban', title: '合唱团第一次排练',
    text: '栞栞的海报引来了七个人。有人只打算站在门口听，她也给那个人留了一张写着歌名的纸。',
    clue: '她想要【冷 / 甜味 / 不提神】的饮料，排练前想润润喉咙。',
    wanted: { temperature: 'cold', taste: 'sweet', boost: 0 },
    replies: [
      listenReply('n5-s1', '问她要不要把旁听的人也写进合唱名单', '她说名单可以留白，来的人什么时候开口都算数。'),
      otherReply('n5-s1', '记住她想让公告栏留给路过的人', '你记住了她海报上的那句话：路过也可以听一首。', { preference: true }),
    ],
    reaction: {
      full: '酸奶的甜味很轻，她念完歌名以后没有清嗓子。',
      partial: '她接过饮料，等大家把第一段旋律唱熟。',
      miss: '她先把饮料放到一旁，跟着合唱团打了拍子。',
    },
  }),
  makeScene({
    id: 'n5-s2', night: 5, slot: 2, customerId: 'suiji', title: '听见公告栏前的停顿',
    text: '岁己把路线的声音版放在店门口试听。有人停下来听完，却没有留下名字；栞栞说，地图旁也该有一块地方让人只看不留言。',
    clue: '岁己想要【常温 / 咸鲜 / 不提神】的东西，和栞栞分着吃，听听试听者愿意留下的意见。',
    wanted: { temperature: 'room', taste: 'savory', boost: 0 },
    replies: [
      listenReply('n5-s2', '问她们怎样让路过的人不必留下姓名也能参与', '栞栞准备放一个匿名意见盒；岁己会保留空白，不把没有说出口的话补进录音里。'),
      otherReply('n5-s2', '记住她整理录音时喜欢咸鲜、能垫肚子的东西', '你在岁己的常客小票上记下咸鲜、能垫肚子，而且不提神。', { preference: true }),
    ],
    reaction: {
      full: '饭团够两个人分，她们把匿名意见盒放到地图旁，又给不想开口的人留了一个空白选项。',
      partial: '她们把饭团放在试听机旁，继续核对声音版和纸面地图是否一致。',
      miss: '岁己道了谢，先把试听音量调低，免得盖过店里的声音。',
    },
  }),
  makeScene({
    id: 'n6-s0', night: 6, slot: 0, customerId: 'suiji', title: '剪辑室的第一遍回放',
    text: '岁己把匿名成片拿给街坊试听。大家认出了钟声，却没有人追问录音里的名字。',
    clue: '她想要【常温 / 酸味 / 温和提神】的东西，听完反馈再做最后一次剪辑。',
    wanted: { temperature: 'room', taste: 'tangy', boost: 1 },
    replies: [
      listenReply('n6-s0', '问试听的人有没有哪一秒想停下来', '她记下了一个意见：风声可以再多留半秒。'),
      otherReply('n6-s0', '记住她会先听完反馈再公开声音', '你把她谨慎发布的习惯记在了常客小票上。', { preference: true }),
    ],
    reaction: {
      full: '柚子香让她清醒了一点，她把那半秒风声加了回来。',
      partial: '她把饮料放在耳机旁，继续听街坊的反馈。',
      miss: '她先确认试听反馈都记下了，再去处理饮料。',
    },
  }),
  makeScene({
    id: 'n6-s1', night: 6, slot: 1, customerId: 'kanban', title: '公告栏上的合唱日',
    text: '周末合唱的时间被写进了公告栏。修伞摊老板也说会来，只是不确定能不能唱。',
    clue: '她想要【冷 / 奶香 / 不提神】的饮料，想先让嗓子放松。',
    wanted: { temperature: 'cold', taste: 'creamy', boost: 0 },
    replies: [
      listenReply('n6-s1', '请她说说公告栏最想一直保留哪一张', '她说是那张修伞营业时间，因为很多人第一次是靠它找到摊位。'),
      otherReply('n6-s1', '记住她会把急用信息放在最上面', '你记住她会先照顾最急的消息，再安排活动。', { preference: true }),
    ],
    reaction: {
      full: '牛奶的口感柔和，她把合唱日贴在了修伞时间下面。',
      partial: '她喝了一口，继续调整海报和公告之间的间距。',
      miss: '她收下饮料，先确认合唱日没有和街区清扫撞期。',
    },
  }),
  makeScene({
    id: 'n6-s2', night: 6, slot: 2, customerId: 'kanban', title: '地图交到街坊手里',
    text: '栞栞拿来一叠已经折好的路线图。岁己把最后一段声音剪短了些，让第一次听的人能分清路口，也能随时停下来。',
    clue: '栞栞想要【热 / 苦味 / 强提神】的饮料，趁公告栏前最后一轮试读把说明校完。',
    wanted: { temperature: 'hot', taste: 'bitter', boost: 2 },
    replies: [
      listenReply('n6-s2', '请栞栞读一遍最容易让人走错的那段说明', '她读到桥边时停下来；岁己把声音提示挪到转弯之前，而不是之后。'),
      otherReply('n6-s2', '记住她校对路线时喜欢苦一点、提神足的咖啡', '你记住了栞栞夜里校对时的习惯：苦一点，提神要足。', { preference: true }),
    ],
    reaction: {
      full: '黑咖啡的苦味让栞栞清醒了一点，她把改好的路线图交给岁己，两个人终于读出同一个清楚的转弯提示。',
      partial: '她把饮料放在地图旁，继续听岁己调整声音版的节奏。',
      miss: '栞栞把饮料放下，先把最后一个容易误读的地名改成了街坊常用的叫法。',
    },
  }),
  makeScene({
    id: 'n7-s0', night: 7, slot: 0, customerId: 'suiji', title: '一段属于旧街的声音',
    text: '岁己带来一张小小的试听卡。录音里没有旁白，只有旧桥的钟声、风声，以及街坊认得出的脚步。',
    clue: '她想要【热 / 花香 / 温和提神】的饮料，听完最后一遍就准备交档。',
    wanted: { temperature: 'hot', taste: 'floral', boost: 1 },
    replies: [
      listenReply('n7-s0', '和她一起听完，不急着评价', '你们听到结尾才摘下耳机。岁己把试听卡留在柜台一晚。'),
      otherReply('n7-s0', '记住她希望录音先回到街坊手里', '你答应继续给录音的人留出先听见的时间。', { preference: true }),
    ],
    reaction: {
      full: '桂花茶的香气很轻，她把最后一遍回放听完了。',
      partial: '她把试听卡收好，说明天再来听一次。',
      miss: '她把饮料放下，仍从头到尾听完了那段声音。',
    },
  }),
  makeScene({
    id: 'n7-s1', night: 7, slot: 1, customerId: 'kanban', title: '公告栏没有被填满',
    text: '栞栞最后一次整理公告栏。上面有合唱、修伞、找猫，也留着几块没有标题的小纸片。',
    clue: '她想要【冷 / 甜味 / 不提神】的饮料，准备站在公告栏旁等大家来。',
    wanted: { temperature: 'cold', taste: 'sweet', boost: 0 },
    replies: [
      listenReply('n7-s1', '听她读一遍每张公告的第一句话', '她读得很慢，像在确认每个消息都还属于写下它的人。'),
      otherReply('n7-s1', '记住她总会给路过的人留一处位置', '你答应以后也给临时留言留出一小块地方。', { preference: true }),
    ],
    reaction: {
      full: '酸奶甜得恰好，她说今晚应该会有人来唱一首。',
      partial: '她喝了一口，拿着新的留言纸走向公告栏。',
      miss: '她把饮料放在纸卷边，仍站在那里等来访的人。',
    },
  }),
  makeScene({
    id: 'n7-s2', night: 7, slot: 2, customerId: 'suiji', title: '把夜路还给每个路过的人',
    text: '岁己和栞栞把最后一份地图放在店门边，声音版也能从公告栏的小卡片里听见。有人拿走一份，有人只听了一段，谁都不必留下名字。',
    clue: '岁己想要【热 / 苦味 / 强提神】的饮料，陪栞栞听完最后一次路线回放。',
    wanted: { temperature: 'hot', taste: 'bitter', boost: 2 },
    replies: [
      listenReply('n7-s2', '和她们一起听完，不急着替这条路线下结论', '栞栞说，地图还会继续改；岁己把耳机留在柜台，让下一位路过的人也能试听。'),
      otherReply('n7-s2', '记住她们希望路线先回到街坊手里', '你记住了：每一段录音和每一张地图，都先交给走过这条街的人。', { preference: true }),
    ],
    reaction: {
      full: '黑咖啡够苦够醒，岁己和栞栞把最后一段回放听完，随后把地图留在了门边。',
      partial: '她们把饮料放在柜台边，约好下次路过时再听听街道有什么变化。',
      miss: '岁己把饮料放到一旁，先确认试听卡上没有留下任何人的名字。',
    },
  }),
]);

export const ENDINGS = freezeDeep([
  {
    id: 'kept-word', title: '留在灯下的约定',
    text: '七个夜晚过去，柜台边的小纸条没有被风吹走。你记得的不是一份好感账，而是几件说到做到的小事。',
  },
  {
    id: 'remembered', title: '记得每个人的那一杯',
    text: '熟客不必每次重新解释自己。你记得他们说过的话，店里也就多了一点愿意再回来的理由。',
  },
  {
    id: 'open-late', title: '还亮着的窗',
    text: '有些话没有说完，有些饮料也没有猜对。但门口那盏灯还亮着，下一次见面仍有新的开始。',
  },
]);
