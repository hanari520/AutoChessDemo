const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freezeDeep);
  }
  return value;
};

export const MEMBERS = freezeDeep([
  {
    id: 'suiji',
    name: '岁己',
    portrait: '../../assets/game-library/studio-manager/suiji-v1.webp',
    skills: { game: 2, talk: 1, song: 0, lesson: 0, duo: 1 },
    synergyWith: ['huize'],
  },
  {
    id: 'kanban',
    name: '栞栞',
    portrait: '../../assets/units_big/kanban.webp',
    skills: { game: 0, talk: 1, song: 1, lesson: 2, duo: 1 },
    synergyWith: ['ein'],
  },
  {
    id: 'huize',
    name: '灰泽满',
    portrait: '../../assets/units_big/huize.webp',
    skills: { game: 0, talk: 2, song: 0, lesson: 1, duo: 1 },
    synergyWith: ['suiji'],
  },
  {
    id: 'nana7mi',
    name: '七海',
    portrait: '../../assets/units_big/nana7mi.webp',
    skills: { game: 1, talk: 0, song: 2, lesson: 0, duo: 1 },
    synergyWith: ['azi'],
  },
  {
    id: 'azi',
    name: '阿梓',
    portrait: '../../assets/units_big/azi.webp',
    skills: { game: 1, talk: 1, song: 0, lesson: 0, duo: 2 },
    synergyWith: ['nana7mi'],
  },
  {
    id: 'ein',
    name: '艾因',
    portrait: '../../assets/units_big/ein.webp',
    skills: { game: 1, talk: 0, song: 0, lesson: 1, duo: 2 },
    synergyWith: ['kanban'],
  },
]);

export const PROGRAMS = freezeDeep([
  {
    id: 'game',
    name: '虚拟作战室',
    category: '游戏',
    baseCost: 12,
    baseIncome: 44,
    baseHype: 4,
    energyCost: 18,
    minMembers: 1,
    maxMembers: 2,
    equipmentId: 'lighting',
  },
  {
    id: 'talk',
    name: '深夜杂谈',
    category: '杂谈',
    baseCost: 5,
    baseIncome: 28,
    baseHype: 3,
    energyCost: 12,
    minMembers: 1,
    maxMembers: 2,
    equipmentId: 'audio',
  },
  {
    id: 'song',
    name: '星光歌回',
    category: '歌回',
    baseCost: 16,
    baseIncome: 46,
    baseHype: 6,
    energyCost: 20,
    minMembers: 1,
    maxMembers: 2,
    equipmentId: 'audio',
  },
  {
    id: 'lesson',
    name: '轻松教学',
    category: '教学',
    baseCost: 10,
    baseIncome: 34,
    baseHype: 4,
    energyCost: 15,
    minMembers: 1,
    maxMembers: 2,
    equipmentId: 'set',
  },
  {
    id: 'duo',
    name: '双人联动',
    category: '双人联动',
    baseCost: 24,
    baseIncome: 60,
    baseHype: 8,
    energyCost: 26,
    minMembers: 2,
    maxMembers: 2,
    equipmentId: 'set',
  },
]);

export const EVENTS = freezeDeep([
  {
    id: 'mic-check',
    title: '麦克风有杂音',
    body: '试播时发现底噪，开播前还有时间做一次处理。',
    options: [
      { id: 'tune', label: '请技术同伴调音', description: '花费 8，稳定收音并提升现场表现。', cost: 8, qualityDelta: 8, hypeDelta: 0, fundsDelta: 0, energyDelta: 0 },
      { id: 'soft-filter', label: '开启基础滤镜', description: '不花钱，但杂音仍会影响听感。', cost: 0, qualityDelta: -4, hypeDelta: 0, fundsDelta: 0, energyDelta: 0 },
    ],
  },
  {
    id: 'rainy-evening',
    title: '下雨的晚上',
    body: '观众来得比平时慢，聊天节奏需要调整。',
    options: [
      { id: 'warm-welcome', label: '慢一点暖场', description: '不花钱，用轻松开场留住观众。', cost: 0, qualityDelta: 4, hypeDelta: 1, fundsDelta: 0, energyDelta: 0 },
      { id: 'warm-drink', label: '准备暖饮抽奖', description: '花费 10，让活动更有参与感。', cost: 10, qualityDelta: 6, hypeDelta: 3, fundsDelta: 0, energyDelta: 0 },
    ],
  },
  {
    id: 'thumbnail-mixup',
    title: '封面传错版本',
    body: '预约页挂上了旧封面，团队可以临时修正或直接开播。',
    options: [
      { id: 'quick-redraw', label: '现场重做封面', description: '花费 12，修正后再开播。', cost: 12, qualityDelta: 7, hypeDelta: 1, fundsDelta: 0, energyDelta: 0 },
      { id: 'explain-first', label: '开场解释一下', description: '不花钱，用清楚的说明减少误会，但封面仍有影响。', cost: 0, qualityDelta: -2, hypeDelta: 0, fundsDelta: 0, energyDelta: 0 },
    ],
  },
  {
    id: 'raid-visit',
    title: '邻台观众来串门',
    body: '隔壁节目刚结束，一群新观众顺路进了直播间。',
    options: [
      { id: 'welcome-raid', label: '认真欢迎新朋友', description: '不花钱，热情接住这波串门观众。', cost: 0, qualityDelta: 5, hypeDelta: 3, fundsDelta: 0, energyDelta: 0 },
      { id: 'shared-giveaway', label: '加一份联动小礼物', description: '花费 14，把串门变成小型庆祝。', cost: 14, qualityDelta: 8, hypeDelta: 5, fundsDelta: 0, energyDelta: 0 },
    ],
  },
  {
    id: 'topic-question',
    title: '观众提了个好问题',
    body: '弹幕里出现一个值得展开的提问，可以延长互动，也可以保持原计划。',
    options: [
      { id: 'take-question', label: '留出时间认真回答', description: '不花钱，节目节奏更贴近观众。', cost: 0, qualityDelta: 6, hypeDelta: 2, fundsDelta: 0, energyDelta: -3 },
      { id: 'pin-question', label: '整理成下期话题', description: '不花钱，把问题记下来给下次节目。', cost: 0, qualityDelta: 2, hypeDelta: 1, fundsDelta: 0, energyDelta: 2 },
    ],
  },
  {
    id: 'lighting-flicker',
    title: '灯光忽明忽暗',
    body: '舞台灯光出现小故障，工作人员正在检查线路。',
    options: [
      { id: 'repair-light', label: '更换备用灯管', description: '花费 9，恢复稳定灯光。', cost: 9, qualityDelta: 7, hypeDelta: 0, fundsDelta: 0, energyDelta: 0 },
      { id: 'lower-brightness', label: '调低亮度继续', description: '不花钱，画面略暗但节目能继续。', cost: 0, qualityDelta: -4, hypeDelta: 0, fundsDelta: 0, energyDelta: 0 },
    ],
  },
  {
    id: 'schedule-share',
    title: '节目被社团号转发',
    body: '社团的短预告被转发了，临时多了些预约观众。',
    options: [
      { id: 'thank-viewers', label: '在开场感谢大家', description: '不花钱，让新观众感到受欢迎。', cost: 0, qualityDelta: 3, hypeDelta: 4, fundsDelta: 0, energyDelta: 0 },
      { id: 'boost-post', label: '追加一次小额推广', description: '花费 12，扩大预告的触达范围。', cost: 12, qualityDelta: 4, hypeDelta: 5, fundsDelta: 0, energyDelta: 0 },
    ],
  },
  {
    id: 'set-prop',
    title: '道具箱里多了件小道具',
    body: '布景同伴找到一件适合本场节目的道具。',
    options: [
      { id: 'use-prop', label: '把道具融进节目', description: '不花钱，增加一点临场感。', cost: 0, qualityDelta: 5, hypeDelta: 1, fundsDelta: 0, energyDelta: 0 },
      { id: 'polish-prop', label: '再做一点装饰', description: '花费 8，让道具更醒目。', cost: 8, qualityDelta: 8, hypeDelta: 2, fundsDelta: 0, energyDelta: 0 },
    ],
  },
  {
    id: 'fan-letter',
    title: '收到一封观众来信',
    body: '一位老观众写信说，最近的节目陪自己度过了忙碌的一周。',
    options: [
      { id: 'read-letter', label: '读出信里的感谢', description: '不花钱，分享这份心意。', cost: 0, qualityDelta: 3, hypeDelta: 4, fundsDelta: 0, energyDelta: 1 },
      { id: 'reply-letter', label: '准备一份回信礼物', description: '花费 10，给观众一个小小惊喜。', cost: 10, qualityDelta: 4, hypeDelta: 6, fundsDelta: 0, energyDelta: 1 },
    ],
  },
  {
    id: 'venue-credit',
    title: '场地方送来饮料券',
    body: '合作场地送来一小批饮料券，可以用于补给或留到社团公共账。',
    options: [
      { id: 'share-drinks', label: '分给出场成员', description: '不花钱，出场成员恢复 6 点精力。', cost: 0, qualityDelta: 1, hypeDelta: 0, fundsDelta: 0, energyDelta: 6 },
      { id: 'sell-coupons', label: '折价转给场地方', description: '不花钱，社团收入增加 12。', cost: 0, qualityDelta: 0, hypeDelta: 0, fundsDelta: 12, energyDelta: 0 },
    ],
  },
  {
    id: 'late-arrival',
    title: '嘉宾差点迟到',
    body: '合作嘉宾路上遇到堵车，可能晚几分钟到场。',
    options: [
      { id: 'fill-time', label: '先用互动环节暖场', description: '不花钱，成员多投入一点精力。', cost: 0, qualityDelta: 4, hypeDelta: 2, fundsDelta: 0, energyDelta: -4 },
      { id: 'car-pickup', label: '安排车辆接应', description: '花费 15，让联动更快进入正题。', cost: 15, qualityDelta: 9, hypeDelta: 3, fundsDelta: 0, energyDelta: 0 },
    ],
  },
  {
    id: 'quiet-chat',
    title: '开场时弹幕有些安静',
    body: '观众还没进入状态，开场需要一个舒服的切入点。',
    options: [
      { id: 'easy-prompt', label: '抛出一个轻松问题', description: '不花钱，慢慢把聊天带起来。', cost: 0, qualityDelta: 4, hypeDelta: 2, fundsDelta: 0, energyDelta: 0 },
      { id: 'small-prize', label: '准备一份小奖品', description: '花费 8，给参与互动的观众一点鼓励。', cost: 8, qualityDelta: 5, hypeDelta: 4, fundsDelta: 0, energyDelta: 0 },
    ],
  },
]);

export const EQUIPMENT = freezeDeep([
  {
    id: 'audio',
    name: '收音台',
    description: '提升杂谈与歌回的收音质量。',
    upgradeCosts: [35, 55],
    bonusPrograms: ['talk', 'song'],
  },
  {
    id: 'lighting',
    name: '灯光组',
    description: '提升游戏节目的画面表现。',
    upgradeCosts: [35, 55],
    bonusPrograms: ['game'],
  },
  {
    id: 'set',
    name: '布景台',
    description: '提升教学与双人联动的舞台表现。',
    upgradeCosts: [35, 55],
    bonusPrograms: ['lesson', 'duo'],
  },
]);

