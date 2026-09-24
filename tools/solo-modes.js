/* Pure, serializable rules for the five single-player modes. No DOM or game globals. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SoloModes = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';

  const definitions = [
    { id: 'expedition', name: '巡演企划', description: '三站巡演、成长选择与终场压轴节目。' },
    { id: 'hunt', name: '首领狩猎', description: '三次准备行动后针对首领机制决战。' },
    { id: 'puzzle', name: '战术解题', description: '固定敌阵和预算，反复优化解法。' },
    { id: 'siege', name: '守城生存', description: '布置城防，应对十五波敌潮。' },
    { id: 'conquest', name: '战役征服', description: '四幕战役：推进地图、驻防据点并击败深渊之主。' }
  ];
  const bossKinds = ['shield', 'charge', 'summon'];
  const mechanicNames = { shield: '护盾', charge: '蓄力', summon: '召唤', flank: '侧翼突袭', none: '常规攻势' };
  const expeditionMechanicNames = { shield: '应援屏障', charge: '压轴蓄势', summon: '全息伴舞登场', flank: '侧台惊喜', none: '常规节目' };
  const relicNames = ['回响护符', '召唤核心', '坚守旗帜'];
  const expeditionRelicLabels = { 回响护符: '返场耳返', 召唤核心: '全息伴舞', 坚守旗帜: '应援手灯', 冒险徽章: '巡演纪念章' };
  const relicDescriptions = { 回响护符: '施放曲目后获得应援屏障', 召唤核心: '首次演绎曲目时召来伴舞', 坚守旗帜: '台前成员承受伤害降低', 冒险徽章: '让对手退场后回复能量' };
  const puzzleCandidates = [
    ['ein', 'goutan', 'yujiu', 'hoshimi', 'zhouyi', 'miting'],
    ['ein', 'goutan', 'likou', 'yuji', 'kanban', 'xuezhu'],
    ['kouichi', 'yua', 'songlv', 'likou', 'zhouyi', 'lianshiye']
  ];
  const puzzleHints = [
    ['敌方后排是主要威胁。', '护卫挡在正面；从侧翼切入或先破盾。', '可以部署刺客与破盾单位，并让前排吸收第一轮伤害。'],
    ['敌方刺客会绕到后排。', '把护卫布在被保护单位附近。', '用守护单位贴近核心，再配合治疗或控制。'],
    ['敌方的治疗和护盾会拖延战斗。', '考虑控制治疗单位或削弱护盾。', '控制与爆发并用，让输出集中到同一目标。']
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const empty = () => ({ gold: 0, hp: 0, items: [], refresh: 0, log: [], levelUp: 0, fortification: null, buildPoints: 0, recruit: null, swapArmy: null, armyUnlocked: null, puzzleReset: false });
  const hash = (seed, salt) => {
    let x = (Number(seed) || 1) >>> 0;
    for (const ch of String(salt)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0;
    return x || 1;
  };
  const random = (seed, salt, size) => hash(seed, salt) % size;
  const choice = (id, label, description, disabled) => ({ id, label, description, disabled: !!disabled });
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const result = (state, effects) => ({ state, effects: Object.assign(empty(), effects || {}) });
  const done = (state, outcome) => { state.phase = 'finished'; state.outcome = outcome; return state; };
  const hpChange = (state, amount, fx) => {
    const next = Math.max(0, Math.min(state.maxHp, state.hp + amount));
    fx.hp = next - state.hp;
    state.hp = next;
    if (!next) done(state, 'lost');
  };
  const encounter = (name, tier, count, boss, mechanic, seed, modifier) => ({
    name, tier, count, boss: !!boss, mechanic: mechanic || 'none', modifier: modifier || 'none', seed,
    roster: boss ? { front: 1, ranged: 1, assassin: 0, support: 1 } : {
      front: Math.max(1, Math.ceil(count / 2)),
      ranged: Math.floor(count / 3),
      assassin: count >= 6 ? 1 : 0,
      support: count >= 7 ? 1 : 0
    }
  });
  const expeditionOptions = (state) => {
    if (state.node === 5) return [{ id: 'boss', label: '终场压轴舞台', kind: 'boss', risk: 3 }];
    const pool = [
      { id: 'battle', label: '常规公演', kind: 'battle', risk: 1 },
      { id: 'elite', label: '特别舞台企划', kind: 'elite', risk: 2 },
      { id: 'camp', label: '后台休息', kind: 'camp', risk: 0 },
      { id: 'event', label: '巡演突发企划', kind: 'event', risk: 0 },
      { id: 'shop', label: '周边商店', kind: 'shop', risk: 0 }
    ];
    // Regular showcases always remain available; the other branch rotates deterministically.
    const alternative = pool[1 + random(state.seed, `route:${state.chapter}:${state.node}`, 4)];
    return [pool[0], alternative];
  };
  const advanceExpedition = state => {
    state.route.push({ chapter: state.chapter, node: state.node, kind: state.current });
    state.current = null;
    state.node++;
    if (state.node >= 6) { state.chapter++; state.node = 0; }
    if (state.chapter > 3) done(state, 'won');
    else state.phase = 'route';
  };
  /* ----- conquest v2: four acts, seeded layered DAG maps, armies and raids ----- */
  const conquestActs = {
    1: { name: '破晓低地', boss: '矿监巨像', tagline: '矿镐与锁链的低语在破晓中回荡。' },
    2: { name: '灰烬隘口', boss: '隘口守将', tagline: '灰烬掩埋的隘口上，号角再度吹响。' },
    3: { name: '静默王城', boss: '摄政影卫', tagline: '静默的王城里，只听得见影卫的脚步。' },
    4: { name: '深渊主城', boss: '深渊之主', tagline: '黑金王座之下，深渊凝视着最后的挑战者。' }
  };
  const conquestGoldMult = { 1: 1, 2: 1.3, 3: 1.6 };
  const conquestMaxHp = { 1: 15, 2: 12, 3: 10 };
  const conquestDiffLabel = { 1: 'I', 2: 'II', 3: 'III' };
  const conquestKindWeights = [['battle', 40], ['stronghold', 15], ['elite', 12], ['treasure', 10], ['event', 10], ['shop', 8], ['rest', 5]];
  const conquestSupplyCost = { battle: 1, elite: 2, stronghold: 2, treasure: 1, shop: 1, event: 1, rest: 1, boss: 3 };
  const conquestKindNames = { elite: '精锐营', treasure: '秘宝库', shop: '黑市商铺', event: '奇遇之地', rest: '休整营地' };
  const conquestStrongholdNames = { mine: '矿区', town: '城镇', fort: '要塞' };
  const conquestBattleNames = ['敌军营地', '前线哨所', '游荡兵团'];
  const conquestItems = ['sword', 'armor', 'staff', 'bow', 'vamp', 'mana'];
  const conquestItemNames = { sword: '炽焰长剑', armor: '黑金胸甲', staff: '秘法权杖', bow: '追风长弓', vamp: '汲血之刃', mana: '法力宝珠' };
  const conquestJobs = ['守护', '游侠', '法师'];
  const conquestRelicPool = [...relicNames, '冒险徽章'];
  const conquestAffixes = ['swift', 'regen', 'split'];
  const conquestBossMechanics = { 1: 'shield', 2: 'charge', 3: 'summon', 4: 'none' };
  const conquestRaidGap = 3;
  const conquestEvents = [
    { title: '矿工暴动', options: [
      { label: '发放抚恤金', description: '花费 4 金币安抚人心，本营+2', gold: -4, hp: 2 },
      { label: '强行征调', description: '强征物资充军：本营-2，获得装备', hp: -2, item: true }
    ] },
    { title: '流浪商人', options: [
      { label: '以物易物', description: '花费 4 金币换一件装备', gold: -4, item: true },
      { label: '婉拒赶路', description: '稍作休整：本营+2', hp: 2 }
    ] },
    { title: '敌军残部', options: [
      { label: '收编缴获', description: '补给+2', supply: 2 },
      { label: '追击残部', description: '短兵相接：本营-3，+6 金币', hp: -3, gold: 6 }
    ] }
  ];
  const conquestKindRoll = (seed, salt) => {
    let roll = random(seed, salt, 100);
    for (const entry of conquestKindWeights) {
      if (roll < entry[1]) return entry[0];
      roll -= entry[1];
    }
    return 'battle';
  };
  const clamp96 = value => Math.max(4, Math.min(96, value));

  function conquestMap(seed, act) {
    const range = act === 2 || act === 3 ? [10, 12] : [8, 10];
    const total = range[0] + random(seed, `act${act}:total`, range[1] - range[0] + 1);
    const layerCount = 6 + random(seed, `act${act}:layers`, 2);
    const middleCount = layerCount - 2;
    const sizes = [];
    for (let i = 0; i < middleCount; i++) sizes.push(1);
    let spare = total - 3 - middleCount;
    for (let i = 0; spare > 0; i++) {
      const idx = i < 64 ? random(seed, `act${act}:dist${i}`, middleCount) : i % middleCount;
      if (sizes[idx] < 3) { sizes[idx]++; spare--; }
    }
    const grid = [['battle', 'battle']];
    for (let k = 1; k <= middleCount; k++) {
      const row = [];
      for (let j = 0; j < sizes[k - 1]; j++) row.push(conquestKindRoll(seed, `act${act}:kind${k}:${j}`));
      grid.push(row);
    }
    grid.push(['boss']);
    const penIndex = grid.length - 2;
    if (!grid[penIndex].includes('rest')) grid[penIndex][0] = 'rest';
    const protectedRestJ = grid[penIndex].includes('rest') ? grid[penIndex].indexOf('rest') : -1;
    const kindMins = { stronghold: 2, elite: 1, shop: 1 };
    const donorOrder = ['battle', 'treasure', 'event', 'rest', 'elite', 'stronghold', 'shop'];
    for (let round = 0; round < 24; round++) {
      const counts = {};
      grid.slice(1, -1).flat().forEach(kind => { counts[kind] = (counts[kind] || 0) + 1; });
      const lacking = Object.keys(kindMins).find(kind => (counts[kind] || 0) < kindMins[kind]);
      if (!lacking) break;
      let converted = false;
      for (const donor of donorOrder) {
        if (!((counts[donor] || 0) > (kindMins[donor] || 0))) continue;
        for (let k = 1; k < grid.length - 1 && !converted; k++) for (let j = 0; j < grid[k].length && !converted; j++) {
          if (k === penIndex && j === protectedRestJ) continue;
          if (grid[k][j] === donor) { grid[k][j] = lacking; converted = true; }
        }
        if (converted) break;
      }
      if (!converted) break;
    }
    const raw = [];
    grid.forEach((row, layer) => row.forEach(kind => raw.push({ kind, layer })));
    let strongholdSeq = 0;
    raw.forEach(n => { if (n.kind === 'stronghold') n.sub = ['mine', 'town', 'fort'][(strongholdSeq++ + act - 1) % 3]; });
    const byLayer = {};
    raw.forEach((n, i) => { (byLayer[n.layer] = byLayer[n.layer] || []).push(i); });
    const nodes = raw.map((n, i) => {
      const row = byLayer[n.layer];
      const j = row.indexOf(i);
      const id = `a${act}n${i}`;
      const x = clamp96(Math.round(12 + ((j + 1) / (row.length + 1)) * 76 + random(seed, `${id}:x`, 11) - 5));
      const y = clamp96(Math.round(8 + (n.layer / (grid.length - 1)) * 84 + random(seed, `${id}:y`, 7) - 3));
      const name = n.kind === 'battle' ? conquestBattleNames[random(seed, `${id}:name`, conquestBattleNames.length)]
        : n.kind === 'stronghold' ? conquestStrongholdNames[n.sub]
        : n.kind === 'boss' ? conquestActs[act].boss
        : conquestKindNames[n.kind];
      return { id, kind: n.kind, sub: n.sub || null, name, links: [], layer: n.layer, x, y, cleared: false, garrison: false };
    });
    for (let k = 0; k < grid.length - 1; k++) {
      const cur = byLayer[k], next = byLayer[k + 1];
      cur.forEach(ci => {
        const node = nodes[ci];
        const p = random(seed, `${node.id}:link`, next.length);
        node.links.push(nodes[next[p]].id);
        if (cur.length > 1 && next.length > 1 && random(seed, `${node.id}:branch`, 2) === 0) {
          const q = (p + 1 + random(seed, `${node.id}:branch2`, next.length - 1)) % next.length;
          node.links.push(nodes[next[q]].id);
        }
      });
      next.forEach(ni => {
        const node = nodes[ni];
        if (!cur.some(ci => nodes[ci].links.includes(node.id))) {
          nodes[cur[random(seed, `${node.id}:fill`, cur.length)]].links.push(node.id);
        }
      });
    }
    return { nodes };
  }
  const conquestNode = (s, id) => s.map.nodes.find(n => n.id === id) || null;
  const syncConquestNodes = s => {
    s.map.nodes.forEach(n => {
      if (s.map.owned.includes(n.id)) n.cleared = true;
      n.garrison = s.armies.some(a => a.node === n.id);
    });
  };
  const conquestCursor = s => {
    const cursor = [];
    const push = id => {
      const n = s.map.nodes.find(x => x.id === id);
      if (n && !n.cleared && !cursor.includes(id)) cursor.push(id);
    };
    if (!s.map.owned.length) s.map.nodes.forEach(n => { if (n.layer === 0) push(n.id); });
    else {
      s.map.owned.forEach(id => { const n = conquestNode(s, id); if (n) n.links.forEach(push); });
      s.armies.forEach(a => { if (a.node) { const n = conquestNode(s, a.node); if (n) n.links.forEach(push); } });
    }
    if (!cursor.length) s.map.nodes.forEach(n => { if (!n.cleared) push(n.id); });
    return cursor;
  };
  const conquestTier = (s, node) => {
    const layers = Math.max(...s.map.nodes.map(n => n.layer)) + 1;
    const progress = Math.floor((node.layer / (layers - 1)) * 3);
    /* M5 平衡调整⑤：精锐/首领不再 +1 层（before: tier +1 → after: 与常规节点同表）。
       精锐特色保留 1.2× 强度倍率与侧翼突袭机制；深幕敌方 tier 曲线整体 -1。 */
    return s.act + progress + (s.difficulty - 1);
  };
  const conquestAffixList = (s, offset) => {
    const list = [];
    for (let i = 0; i < s.difficulty - 1; i++) list.push(conquestAffixes[(offset + i) % conquestAffixes.length]);
    return list;
  };
  const conquestEncounter = (s, node) => {
    const boss = node.kind === 'boss';
    const elite = node.kind === 'elite';
    /* M5 平衡调整①：精英/首领编制从「满层敌军」改为精锐小队（2+act，质≠量）。
       before: 常规公式 2+act+floor(layer/2) → act3 精英/首领 7-8 敌（精锐同时吃 1.2× 强度与侧翼机制，三重叠加成墙）
       after : 精英/首领 2+act → act1 3 敌、act4 6 敌。常规节点编制不变。 */
    /* M5 平衡调整⑦：常规节点编制曲线 floor(layer/2)→floor(layer/3)。
       before: act4 深层常规节点 9 敌（在 1.35× 缩放下是 act3/4 的主要败因）
       after : act2 深层 5、act3 深层 6、act4 深层 8。 */
    const count = (boss || elite) ? 2 + s.act : Math.min(9, 2 + s.act + Math.floor(node.layer / 3));
    const spec = encounter(node.name, conquestTier(s, node), count, boss,
      boss ? conquestBossMechanics[s.act] : elite ? 'flank' : 'none',
      hash(s.seed, `enc:${node.id}`),
      elite ? 'elite' : node.kind === 'stronghold' ? 'fortified' : 'none');
    spec.difficulty = s.difficulty;
    if (boss) spec.bossScript = { act: s.act };
    if (elite || boss) spec.affixes = conquestAffixList(s, s.act - 1);
    return spec;
  };
  const conquestDefenseEncounter = (s, node) => {
    const spec = encounter(`防守战·${node.name}`, s.act + 1 + (s.difficulty - 1), Math.max(2, 2 + s.act), false, 'flank',
      hash(s.seed, `defense:${node.id}:${s.stats.turns}`), 'counterattack');
    const garrison = s.armies.find(a => a.node === node.id);
    spec.difficulty = s.difficulty;
    spec.garrisonArmy = garrison ? garrison.id : 0;
    spec.affixes = conquestAffixList(s, s.act);
    return spec;
  };
  const setupConquestMap = (s, act) => {
    s.map = conquestMap(s.seed, act);
    s.map.owned = [];
    s.map.cursor = [];
    s.armies.forEach(a => { a.node = null; a.ap = 1; });
    s.supply = 3;
    s.telegraph = null;
    s.target = null;
    s.raidWait = 0;
    s.phase = 'map';
    syncConquestNodes(s);
    s.map.cursor = conquestCursor(s);
  };
  const snapshotConquest = s => {
    const cp = clone(s);
    delete cp.actCheckpoint;
    return cp;
  };
  const enterConquestAct = (s, act, fx) => {
    s.act = act;
    setupConquestMap(s, act);
    hpChange(s, 4, fx);
    s.actCheckpoint = snapshotConquest(s);
    fx.log.push(`大军开进第${act}幕·${conquestActs[act].name}`);
  };
  const advanceConquestTurn = (s, fx) => {
    if (s.phase === 'finished') return;
    s.stats.turns++;
    if (s.raidWait > 0) s.raidWait--;
    if (s.telegraph) {
      s.telegraph.countdown--;
      if (s.telegraph.countdown <= 0) {
        const node = conquestNode(s, s.telegraph.node);
        s.telegraph = null;
        s.raidWait = conquestRaidGap;
        if (node && s.map.owned.includes(node.id)) {
          const garrison = s.armies.find(a => a.node === node.id);
          if (garrison) {
            if (s.activeArmy !== garrison.id) fx.swapArmy = { from: s.activeArmy, to: garrison.id };
            s.activeArmy = garrison.id;
            s.phase = 'defense';
            s.target = node.id;
            fx.log.push(`敌军夜袭${node.name}，驻防部队就地迎击`);
            return;
          }
          s.map.owned = s.map.owned.filter(id => id !== node.id);
          node.cleared = false;
          fx.log.push(`${node.name}无人驻防，被敌军夺占`);
          hpChange(s, -4, fx);
          if (s.phase === 'finished') return;
        }
      }
    }
    s.armies.forEach(a => { a.ap = 1; });
    const ownedSubs = sub => s.map.owned.filter(id => {
      const n = conquestNode(s, id);
      return n && n.kind === 'stronghold' && n.sub === sub;
    }).length;
    s.supply = Math.min(s.maxSupply, s.supply + 1 + ownedSubs('town'));
    const mines = ownedSubs('mine');
    if (mines) fx.gold += 2 * mines;
    if (!s.telegraph && s.raidWait <= 0 && s.map.owned.length) {
      s.telegraph = { node: s.map.owned[random(s.seed, `raid:${s.stats.turns}`, s.map.owned.length)], countdown: 2 };
    }
    syncConquestNodes(s);
    s.map.cursor = conquestCursor(s);
  };
  const returnToConquestMap = (s, fx) => {
    s.phase = 'map';
    s.target = null;
    advanceConquestTurn(s, fx);
  };

  function create(mode, seed, options) {
    assert(definitions.some(d => d.id === mode), `Unknown mode: ${mode}`);
    const s = { mode, seed: hash(seed, 'solo'), phase: '', outcome: null, hp: 0, maxHp: 0, progress: 0 };
    const opt = options || {};
    if (mode === 'expedition') Object.assign(s, { phase: 'route', hp: 20, maxHp: 20, chapter: 1, node: 0, route: [], current: null, relics: [] });
    if (mode === 'hunt') Object.assign(s, { phase: 'prep', hp: 3, maxHp: 3, prep: 0, prepHistory: [], boss: opt.boss || bossKinds[Number.isInteger(opt.bossIndex) ? ((opt.bossIndex % 3) + 3) % 3 : random(s.seed, 'boss', 3)], attempts: 0, maxAttempts: 3, intel: false });
    if (mode === 'puzzle') Object.assign(s, { phase: 'fight', hp: 1, maxHp: 1, puzzle: Number.isInteger(opt.puzzleIndex) ? ((opt.puzzleIndex % 3) + 3) % 3 : Number.isInteger(opt.puzzle) ? ((opt.puzzle % 3) + 3) % 3 : random(s.seed, 'puzzle', 3), budget: 12, population: 4, candidates: [], hintLevel: 0, attempts: 0, medals: [] });
    if (mode === 'siege') Object.assign(s, { phase: 'build', hp: 20, maxHp: 20, wave: 1, targetWaves: 15, endless: false, buildPoints: 3, walls: 0, healers: 0, snares: 0, risk: false, economy: 0 });
    if (mode === 'conquest') {
      const difficulty = opt.difficulty === 2 || opt.difficulty === 3 ? opt.difficulty : 1;
      Object.assign(s, {
        difficulty, act: 1,
        hp: conquestMaxHp[difficulty], maxHp: conquestMaxHp[difficulty],
        armies: [{ id: 0, node: null, ap: 1 }], activeArmy: 0,
        supply: 3, maxSupply: 8,
        telegraph: null, target: null, raidWait: 0,
        relics: [], itemsSeen: [], actCheckpoint: null,
        stats: { turns: 1, battles: 0, losses: 0 }
      });
      setupConquestMap(s, 1);
      s.actCheckpoint = snapshotConquest(s);
    }
    if (mode === 'puzzle') s.candidates = puzzleCandidates[s.puzzle].slice();
    return s;
  }

  function view(state, context) {
    const s = state, gold = Math.max(0, Number((context || {}).gold) || 0);
    assert(s && definitions.some(d => d.id === s.mode), 'Invalid solo state');
    const base = { title: definitions.find(d => d.id === s.mode).name, subtitle: '', objective: '', enemyHint: '', choices: [], canFight: false, encounter: null, finished: s.phase === 'finished', outcome: s.outcome };
    if (s.mode === 'expedition') {
      base.subtitle = s.phase === 'finished' ? (s.outcome === 'won' ? '三站巡演圆满收官' : '巡演暂告一段落')
        : `第${s.chapter}站 · 节目${s.node + 1}/6 · 演出体力${s.hp}/${s.maxHp} · 应援纪念物：${s.relics.length ? s.relics.map(id => `${expeditionRelicLabels[id] || id}（${relicDescriptions[id]}）`).join('、') : '无'}`;
      base.objective = s.phase === 'finished' ? '巡演记录已保存' : '完成三站巡演，登上终场压轴舞台';
      base.enemyHint = s.phase === 'finished' ? '' : `本站压轴演出的特别环节：${expeditionMechanicNames[bossKinds[s.chapter - 1]]}`;
      if (s.phase === 'route') base.choices = expeditionOptions(s).map(n => choice(`route:${n.id}`, n.label, `演出挑战度${n.risk} · 节目单提前公开`));
      if (s.phase === 'fight') {
        base.canFight = true;
        const boss = s.current === 'boss', elite = s.current === 'elite';
        base.encounter = encounter(boss ? `第${s.chapter}站压轴演出` : elite ? '特别舞台企划' : '巡演公演', s.chapter + (elite ? 1 : 0), 3 + s.chapter + (elite ? 1 : 0), boss, boss ? bossKinds[s.chapter - 1] : elite ? 'flank' : 'none', hash(s.seed, `exp:${s.chapter}:${s.node}:${s.current}`), elite ? 'elite' : 'none');
      }
      if (s.phase === 'reward') base.choices = [choice('reward:gold', '领取巡演收益', '+6 金币'), choice('reward:relic', '领取应援纪念物', '随机获得：返场耳返（施放曲目后获得应援屏障）、全息伴舞（首次演绎曲目时召来伴舞）、应援手灯（台前成员承受伤害降低）'), ...['守护', '游侠', '法师'].map(job => choice(`reward:recruit:${job}`, `定向邀约·${job}`, `下次周边商店保证出现${job}定位成员`))];
      if (s.phase === 'camp') base.choices = [choice('camp:heal', '后台休息', '恢复 5 点演出体力'), choice('camp:train', '彩排', '获得巡演收入与团队成长')];
      if (s.phase === 'event') base.choices = [choice('event:safe', '稳妥合作', '+4 金币'), choice('event:risk', '尝试临时联动', '-2 点演出体力，获得巡演纪念章')];
      if (s.phase === 'shop') base.choices = [choice('shop:buy', '购买后台能量包', '花费 5 金币，恢复 5 点演出体力并刷新商店', gold < 5), choice('shop:leave', '继续巡演', '保留金币')];
    }
    if (s.mode === 'hunt') {
      base.subtitle = `准备${s.prep}/3 · 挑战${s.attempts}/${s.maxAttempts} · ${mechanicNames[s.boss]}首领`;
      base.objective = '完成三次准备行动，击败首领';
      base.enemyHint = `首领机制：${mechanicNames[s.boss]}；可以用控制、护盾或站位应对`;
      if (s.phase === 'prep') base.choices = [choice('prep:recruit', '定向招募', '+4 金币并刷新商店'), choice('prep:forge', '锻造装备', '获得随机装备'), choice('prep:scout', '侦察首领', '揭示情报并获得 2 金币')];
      if (s.phase === 'fight') { base.canFight = true; base.encounter = encounter('狩猎首领', 3, 5, true, s.boss, hash(s.seed, `hunt:${s.boss}`), s.intel ? 'scouted' : 'none'); }
      if (s.phase === 'retry') base.choices = [choice('retry:same', '调整阵容再战', '保留准备资源，不重复发放奖励')];
    }
    if (s.mode === 'puzzle') {
      base.subtitle = `题目${s.puzzle + 1}/3 · 预算${s.budget}金 · 最多${s.population}人口 · 尝试${s.attempts}`;
      base.objective = ['击败被护卫保护的后排', '保护己方核心单位', '在限定时间击败敌阵'][s.puzzle];
      base.enemyHint = ['前排护卫 + 远程火力', '刺客突袭后排', '治疗和护盾循环'][s.puzzle] + (s.hintLevel ? ` · 提示：${puzzleHints[s.puzzle][s.hintLevel - 1]}` : '');
      if (s.phase === 'fight') {
        base.canFight = true;
        base.choices = [choice('hint:next', '查看提示', `第${Math.min(3, s.hintLevel + 1)}级提示`, s.hintLevel >= 3)];
        base.encounter = encounter(`战术题${s.puzzle + 1}`, 2, 5, false, ['shield', 'flank', 'charge'][s.puzzle], hash(s.seed, `puzzle:${s.puzzle}`), 'fixed');
      }
      if (s.phase === 'retry') base.choices = [choice('retry:edit', '调整并重试', '重置题目预算与棋子，固定敌阵不变')];
      if (s.phase === 'complete') { base.finished = true; base.outcome = 'won'; base.choices = [choice('puzzle:next', '下一道题', '开始新题，重置预算与候选棋子')]; }
    }
    if (s.mode === 'siege') {
      base.subtitle = `第${s.wave}${s.endless ? '（无尽）' : '/15'}波 · 基地${s.hp}/${s.maxHp} · 建设点${s.buildPoints}`;
      base.objective = s.endless ? '争取更高波次' : '守住十五波并击败攻城首领';
      base.enemyHint = s.wave % 5 === 0 ? `下一波首领：${mechanicNames[bossKinds[Math.floor((s.wave - 1) / 5) % 3]]}` : `未来两波：第${s.wave}波${s.wave % 3 === 0 ? '双线突袭' : '常规攻势'}，第${s.wave + 1}波${(s.wave + 1) % 3 === 0 ? '双线突袭' : '常规攻势'}`;
      if (s.phase === 'build') base.choices = [choice('build:wall', '修建路障', '消耗 2 建设点，减少后续突破伤害', s.buildPoints < 2), choice('build:healer', '修建治疗装置', '消耗 3 建设点，波后恢复基地耐久', s.buildPoints < 3), choice('build:snare', '修建减速装置', '消耗 2 建设点，克制突袭', s.buildPoints < 2), choice('build:repair', '紧急修复', '消耗 2 建设点，恢复 5 耐久', s.buildPoints < 2 || s.hp === s.maxHp), choice('build:economy', '经营物资', '下一波胜利额外获得金币'), choice('build:risk', '挑战加压敌潮', '下一波更难，胜利额外获得 5 金币')];
      if (s.phase === 'fight') { base.canFight = true; base.encounter = encounter(`敌潮 ${s.wave}`, 1 + Math.floor((s.wave - 1) / 5), 3 + Math.min(6, Math.floor(s.wave / 2)) + (s.risk ? 2 : 0), s.wave % 5 === 0, s.wave % 5 === 0 ? bossKinds[Math.floor((s.wave - 1) / 5) % 3] : s.wave % 3 === 0 ? 'flank' : 'none', hash(s.seed, `wave:${s.wave}`), s.risk ? 'risk' : s.wave % 3 === 0 ? 'split' : 'none'); }
      if (s.phase === 'complete') { base.finished = true; base.outcome = 'won'; base.choices = [choice('continue:endless', '进入无尽挑战', '从第 16 波开始，独立记录最高波次')]; }
    }
    if (s.mode === 'conquest') {
      const info = conquestActs[s.act] || conquestActs[1];
      const army = s.armies[s.activeArmy] || s.armies[0];
      base.subtitle = `第${s.act}幕·${info.name} · 难度${conquestDiffLabel[s.difficulty]} · 回合${s.stats.turns} · 本营${s.hp}/${s.maxHp} · 补给${s.supply}/${s.maxSupply} · 军队${s.armies.length}/3`;
      if (s.phase === 'map') {
        base.objective = `攻克第${s.act}幕首领${info.boss}，打通去往下一幕的通路`;
        base.enemyHint = s.telegraph ? `敌袭预告：${(conquestNode(s, s.telegraph.node) || {}).name || '未知据点'} 将在 ${s.telegraph.countdown} 回合后遇袭` : '敌军按兵不动，正是推进的良机';
        const blurbs = {
          battle: '击败守军并纳入补给线', elite: '强敌据守，奖励丰厚', stronghold: '要地：占领后按类型产出',
          treasure: '无损开取三选一战利品', shop: '折扣购买装备', event: '处理突发状况',
          rest: '恢复本营或操练队伍', boss: `第${s.act}幕首领：${info.boss}`
        };
        s.map.cursor.forEach(id => {
          const n = conquestNode(s, id);
          if (!n) return;
          const cost = conquestSupplyCost[n.kind] || 1;
          base.choices.push(choice(`attack:${id}`, `攻打${n.name}`, `消耗${cost}补给 · ${blurbs[n.kind] || '占领节点'}`, s.supply < cost || army.ap < 1));
        });
        base.choices.push(choice('map:rest', '原地休整', '补给+2、本营+2，推进 1 回合'));
        const from = army.node ? conquestNode(s, army.node) : null;
        const destinations = (from ? from.links.filter(id => s.map.owned.includes(id)) : s.map.owned.slice()).filter(id => id !== army.node);
        destinations.forEach(id => {
          const n = conquestNode(s, id);
          base.choices.push(choice(`move:${id}`, `${from ? '移防' : '进驻'}${n ? n.name : id}`, '调整驻防位置，消耗 1 行动', army.ap < 1));
        });
        s.armies.forEach(other => {
          if (other.id === army.id) return;
          const at = other.node ? `驻防${(conquestNode(s, other.node) || {}).name || '未知据点'}` : '待命本营';
          base.choices.push(choice(`army:switch:${other.id}`, `切换至第${other.id + 1}队`, `${at} · 行动${other.ap}`));
        });
        base.choices.push(choice('map:end', '结束回合', '推进 1 回合，敌军按预告行动'));
      }
      if (s.phase === 'fight') {
        base.canFight = true;
        const n = conquestNode(s, s.target);
        base.objective = n ? `攻克${n.name}，将其纳入补给线` : '击败当前守军';
        base.enemyHint = !n ? '' : n.kind === 'boss' ? (s.act === 4 ? '深渊之主：半血后依次觉醒护盾、蓄力与召唤三阶段' : `幕首领机制：${mechanicNames[conquestBossMechanics[s.act]]}`)
          : n.kind === 'elite' ? '精锐侧翼突袭：留意敌方刺客切入后排' : '常规守军：稳扎稳打即可';
        base.encounter = n ? conquestEncounter(s, n) : null;
      }
      if (s.phase === 'defense') {
        base.canFight = true;
        const n = conquestNode(s, s.target);
        base.objective = n ? `守住${n.name}，击退敌军反扑` : '守住据点';
        base.enemyHint = '反扑敌军：胜利保住据点并获奖励，失败则据点失守、本营受损';
        base.encounter = n ? conquestDefenseEncounter(s, n) : null;
      }
      if (s.phase === 'reward') {
        base.objective = '战斗胜利，收取战利品后继续推进';
        base.enemyHint = '';
        base.choices.push(choice('reward:gold', '收取战利金', '+3 金币'));
        base.choices.push(choice('reward:item', '收取缴获装备', '获得一件随机装备'));
        conquestJobs.forEach(job => base.choices.push(choice(`reward:recruit:${job}`, `定向整编·${job}`, `下次招募优先提供${job}定位棋子`)));
      }
      if (s.phase === 'treasure') {
        base.objective = '秘宝库：三选一战利品';
        base.enemyHint = '';
        const item = conquestItems[random(s.seed, `treasure:${s.target}`, conquestItems.length)];
        base.choices.push(choice('treasure:item', `开取装备·${conquestItemNames[item]}`, '收入背包，立即生效'));
        const pool = conquestRelicPool.filter(r => !s.relics.includes(r));
        if (pool.length) {
          const relic = pool[random(s.seed, `treasurer:${s.target}`, pool.length)];
          base.choices.push(choice('treasure:relic', `供奉纪念物·${relic}`, `${relicDescriptions[relic]}（战役内全程生效）`));
        }
        base.choices.push(choice('treasure:gold', '兑换战利金', '+6 金币'));
      }
      if (s.phase === 'shop') {
        base.objective = '黑市商铺：折扣装备，购后离店';
        base.enemyHint = '';
        [0, 1].forEach(i => {
          const item = conquestItems[random(s.seed, `shop:${s.target}:${i}`, conquestItems.length)];
          const price = i === 0 ? 5 : 7;
          base.choices.push(choice(`shop:buy:${i}`, `购买${conquestItemNames[item]}`, `折扣价 ${price} 金币（原价 ${price + 3}）`, gold < price));
        });
        base.choices.push(choice('shop:leave', '离开商铺', '分文不动，继续推进'));
      }
      if (s.phase === 'rest') {
        base.objective = '休整营地：修复本营或操练队伍';
        base.enemyHint = '';
        base.choices.push(choice('rest:heal', '修复本营', '恢复 6 点本营耐久', s.hp === s.maxHp));
        base.choices.push(choice('rest:levelup', '操练队伍', '队伍等级 +1'));
      }
      if (s.phase === 'event') {
        const ev = conquestEvents[random(s.seed, `eventpick:${s.target}`, conquestEvents.length)];
        base.objective = `突发事件：${ev.title}`;
        base.enemyHint = '';
        ev.options.forEach((o, i) => base.choices.push(choice(`event:${i}`, o.label, o.description, o.gold < 0 && gold < -o.gold)));
      }
      if (s.phase === 'actClear') {
        const next = conquestActs[s.act + 1];
        base.objective = `第${s.act}幕已肃清，整军进入下一幕`;
        base.enemyHint = `下一幕首领：${next.boss}`;
        base.choices.push(choice('act:next', `进军第${s.act + 1}幕·${next.name}`, '本营耐久+4，军队、装备与纪念物全部保留，地图换新'));
      }
      if (s.phase === 'finished') {
        base.subtitle = s.outcome === 'won' ? '深渊之主陨落，四幕战役全通' : '本营陷落，战役暂时受挫';
        base.objective = s.outcome === 'won' ? '战役征服完成，可挑战更高难度' : '从本幕检查点重整旗鼓，或返回大厅';
        base.enemyHint = '';
        if (s.outcome !== 'won' && s.actCheckpoint) base.choices.push(choice('checkpoint:retry', `重开第${s.act}幕`, '从本幕起点的检查点恢复：地图、据点与耐久回到幕初'));
      }
    }
    return base;
  }

  function act(state, choiceId, context) {
    const s = clone(state), v = view(s, context), selected = v.choices.find(c => c.id === choiceId);
    assert(selected && !selected.disabled, `Unavailable choice: ${choiceId}`);
    const fx = empty();
    if (s.mode === 'expedition') {
      if (s.phase === 'route') {
        s.current = choiceId.slice(6);
        s.phase = ['battle', 'elite', 'boss'].includes(s.current) ? 'fight' : s.current;
      } else if (s.phase === 'reward') {
        if (choiceId === 'reward:gold') fx.gold = 6;
        if (choiceId === 'reward:relic') { const relic = relicNames[random(s.seed, `relic:${s.chapter}:${s.node}`, 3)]; s.relics.push(relic); fx.log.push(`获得${expeditionRelicLabels[relic] || relic}：${relicDescriptions[relic]}`); }
        if (choiceId.startsWith('reward:recruit:')) fx.recruit = choiceId.slice('reward:recruit:'.length);
        advanceExpedition(s);
      } else if (s.phase === 'camp') {
        if (choiceId === 'camp:heal') hpChange(s, 5, fx);
        else { fx.gold = 3; fx.levelUp = 1; }
        advanceExpedition(s);
      } else if (s.phase === 'event') {
        if (choiceId === 'event:safe') fx.gold = 4;
        else { hpChange(s, -2, fx); if (s.phase !== 'finished') { const relic = '冒险徽章'; s.relics.push(relic); fx.items.push('sword'); } }
        if (s.phase !== 'finished') advanceExpedition(s);
      } else if (s.phase === 'shop') {
        if (choiceId === 'shop:buy') { fx.gold = -5; hpChange(s, 5, fx); fx.refresh = 1; }
        advanceExpedition(s);
      }
    } else if (s.mode === 'hunt') {
      if (s.phase === 'prep') {
        s.prepHistory.push(choiceId);
        s.prep++;
        if (choiceId === 'prep:recruit') { fx.gold = 4; fx.refresh = 1; }
        if (choiceId === 'prep:forge') fx.items.push(['sword', 'armor', 'mana'][random(s.seed, `forge:${s.prep}`, 3)]);
        if (choiceId === 'prep:scout') { s.intel = true; fx.gold = 2; }
        if (s.prep === 3) s.phase = 'fight';
      } else if (s.phase === 'retry') s.phase = 'fight';
    } else if (s.mode === 'puzzle') {
      if (s.phase === 'fight') s.hintLevel++;
      else if (s.phase === 'retry') { s.phase = 'fight'; fx.puzzleReset = true; }
      else if (s.phase === 'complete') { s.puzzle++; s.candidates = puzzleCandidates[s.puzzle].slice(); s.hintLevel = 0; s.phase = 'fight'; s.medals = []; fx.puzzleReset = true; }
    } else if (s.mode === 'siege') {
      if (s.phase === 'complete') { s.endless = true; s.wave = 16; s.phase = 'build'; s.outcome = null; }
      else {
        const build = choiceId.slice(6);
        const costs = { wall: 2, healer: 3, snare: 2, repair: 2 };
        if (costs[build]) { s.buildPoints -= costs[build]; fx.buildPoints = -costs[build]; }
        if (build === 'wall') { s.walls++; fx.fortification = 'wall'; }
        if (build === 'healer') { s.healers++; fx.fortification = 'healer'; }
        if (build === 'snare') { s.snares++; fx.fortification = 'snare'; }
        if (build === 'repair') hpChange(s, 5, fx);
        if (build === 'economy') s.economy++;
        if (build === 'risk') s.risk = true;
        s.phase = 'fight';
      }
    } else if (s.mode === 'conquest') {
      if (choiceId.startsWith('attack:')) {
        const node = conquestNode(s, choiceId.slice(7));
        s.target = node.id;
        s.supply -= conquestSupplyCost[node.kind] || 1;
        s.armies[s.activeArmy].ap -= 1;
        if (['treasure', 'shop', 'rest', 'event'].includes(node.kind)) {
          node.cleared = true;
          syncConquestNodes(s);
        }
        s.phase = ['treasure', 'shop', 'rest', 'event'].includes(node.kind) ? node.kind : 'fight';
        fx.log.push(`向${node.name}进军`);
      } else if (choiceId.startsWith('move:')) {
        const id = choiceId.slice(5);
        const mover = s.armies[s.activeArmy];
        mover.node = id;
        mover.ap -= 1;
        syncConquestNodes(s);
        fx.log.push(`第${mover.id + 1}队移防${(conquestNode(s, id) || {}).name || id}`);
      } else if (choiceId.startsWith('army:switch:')) {
        const to = Number(choiceId.slice('army:switch:'.length));
        fx.swapArmy = { from: s.activeArmy, to };
        s.activeArmy = to;
      } else if (choiceId === 'map:rest') {
        s.supply = Math.min(s.maxSupply, s.supply + 2);
        hpChange(s, 2, fx);
        if (s.phase !== 'finished') advanceConquestTurn(s, fx);
      } else if (choiceId === 'map:end') {
        advanceConquestTurn(s, fx);
      } else if (choiceId === 'reward:gold') {
        fx.gold += 5;   // M5 平衡调整④：自选战利金 3→5
        returnToConquestMap(s, fx);
      } else if (choiceId === 'reward:item') {
        const item = conquestItems[random(s.seed, `loot:${s.target}`, conquestItems.length)];
        fx.items.push(item);
        s.itemsSeen.push(item);
        returnToConquestMap(s, fx);
      } else if (choiceId.startsWith('reward:recruit:')) {
        fx.recruit = choiceId.slice('reward:recruit:'.length);
        returnToConquestMap(s, fx);
      } else if (choiceId === 'treasure:item' || choiceId === 'treasure:relic' || choiceId === 'treasure:gold') {
        if (choiceId === 'treasure:item') {
          const item = conquestItems[random(s.seed, `treasure:${s.target}`, conquestItems.length)];
          fx.items.push(item);
          s.itemsSeen.push(item);
          fx.log.push(`开取${conquestItemNames[item]}`);
        }
        if (choiceId === 'treasure:relic') {
          const pool = conquestRelicPool.filter(r => !s.relics.includes(r));
          if (pool.length) {
            const relic = pool[random(s.seed, `treasurer:${s.target}`, pool.length)];
            s.relics.push(relic);
            fx.log.push(`获得纪念物${relic}：${relicDescriptions[relic]}`);
          }
        }
        if (choiceId === 'treasure:gold') fx.gold += 6;
        returnToConquestMap(s, fx);
      } else if (choiceId.startsWith('shop:buy:')) {
        const idx = Number(choiceId.slice('shop:buy:'.length));
        const price = idx === 0 ? 5 : 7;
        const item = conquestItems[random(s.seed, `shop:${s.target}:${idx}`, conquestItems.length)];
        fx.gold -= price;
        fx.items.push(item);
        s.itemsSeen.push(item);
        fx.log.push(`购入${conquestItemNames[item]}`);
        returnToConquestMap(s, fx);
      } else if (choiceId === 'shop:leave') {
        returnToConquestMap(s, fx);
      } else if (choiceId === 'rest:heal') {
        hpChange(s, 6, fx);
        if (s.phase !== 'finished') returnToConquestMap(s, fx);
      } else if (choiceId === 'rest:levelup') {
        fx.levelUp = 1;
        returnToConquestMap(s, fx);
      } else if (choiceId.startsWith('event:')) {
        const ev = conquestEvents[random(s.seed, `eventpick:${s.target}`, conquestEvents.length)];
        const opt = ev.options[Number(choiceId.slice('event:'.length))] || ev.options[0];
        if (opt.gold) fx.gold += opt.gold;
        if (opt.supply) s.supply = Math.min(s.maxSupply, s.supply + opt.supply);
        if (opt.item) {
          const item = conquestItems[random(s.seed, `eventitem:${s.target}`, conquestItems.length)];
          fx.items.push(item);
          s.itemsSeen.push(item);
        }
        if (opt.hp) hpChange(s, opt.hp, fx);
        fx.log.push(`${ev.title}：${opt.label}`);
        if (s.phase !== 'finished') returnToConquestMap(s, fx);
      } else if (choiceId === 'act:next') {
        enterConquestAct(s, s.act + 1, fx);
      } else if (choiceId === 'checkpoint:retry') {
        const cp = snapshotConquest(s.actCheckpoint);
        cp.actCheckpoint = clone(s.actCheckpoint);
        Object.keys(s).forEach(k => { delete s[k]; });
        Object.assign(s, cp);
        fx.log.push(`回到第${s.act}幕起点`);
      }
    }
    return result(s, fx);
  }

  function settle(state, report) {
    const s = clone(state), fx = empty(), r = report || {};
    assert(s.phase === 'fight' || s.phase === 'defense', 'No battle to settle');
    assert(typeof r.won === 'boolean', 'Battle result must specify won');
    const playerSurvivors = Math.max(0, Number(r.allies) || 0);
    const playerStartingCount = Math.max(0, Number(r.playerStartingCount) || 0);
    if (s.mode === 'expedition') {
      if (r.won) { fx.gold = s.current === 'boss' ? 8 : s.current === 'elite' ? 5 : 3; s.phase = 'reward'; }
      else { hpChange(s, -(s.current === 'boss' ? 7 : s.current === 'elite' ? 5 : 3), fx); if (s.phase !== 'finished') { s.phase = 'route'; s.current = null; } }
    } else if (s.mode === 'hunt') {
      s.attempts++;
      if (r.won) { fx.gold = 8; done(s, 'won'); }
      else { hpChange(s, -1, fx); if (s.phase !== 'finished' && s.attempts < s.maxAttempts) s.phase = 'retry'; else done(s, 'lost'); }
    } else if (s.mode === 'puzzle') {
      s.attempts++;
      if (r.won) {
        const medals = ['通关'];
        if (Number.isFinite(r.gold) && r.gold >= 4) medals.push('低预算');
        if (playerStartingCount > 0 && playerSurvivors === playerStartingCount) medals.push('全员存活');
        if (Number.isFinite(r.time) && r.time <= 30) medals.push('快速通关');
        s.medals = medals;
        if (s.puzzle < 2) { s.phase = 'complete'; s.outcome = 'won'; }
        else done(s, 'won');
      } else s.phase = 'retry';
    } else if (s.mode === 'siege') {
      if (r.won) {
        fx.gold = 2 + s.economy * 2 + (s.risk ? 5 : 0);
        if (s.healers) hpChange(s, Math.min(3, s.healers), fx);
      } else {
        const breach = Math.max(1, 5 + Math.floor(s.wave / 5) - Math.min(3, s.walls) - (s.wave % 3 === 0 ? Math.min(2, s.snares) : 0));
        hpChange(s, -breach, fx);
      }
      s.economy = 0; s.risk = false;
      if (s.phase !== 'finished') {
        const gain = Math.min(8, s.buildPoints + 2) - s.buildPoints;
        s.buildPoints += gain;
        fx.buildPoints += gain;
        if (s.wave === 15 && r.won && !s.endless) { s.phase = 'complete'; s.outcome = 'won'; }
        else { if (r.won || s.wave !== 15) s.wave++; s.phase = 'build'; }
      }
    } else if (s.mode === 'conquest') {
      s.stats.battles++;
      const mult = conquestGoldMult[s.difficulty];
      const node = s.target ? conquestNode(s, s.target) : null;
      if (s.phase === 'defense') {
        s.target = null;
        if (r.won) {
          /* M5 平衡调整④：奖励经济表（before → after）：
             常规战斗 3→4、精锐 5→7、矿区 5→7、幕 Boss 10→14、防守胜利 4→6、自选战利金 3→5（均再乘难度倍率）。
             理由：2★ 合成依赖商店随机 + 刷新开销，原经济下深幕前板子普遍停在 0-2 个 2★，
             tier-6 节点成为纯方差墙；上调后棋板能在 act3 前后到达其人口/星级天花板。 */
          fx.gold += Math.round(6 * mult);
          fx.log.push('防守成功：据点固若金汤');
        } else {
          s.stats.losses++;
          if (node) {
            s.map.owned = s.map.owned.filter(id => id !== node.id);
            node.cleared = false;
          }
          s.armies.forEach(a => { if (node && a.node === node.id) a.node = null; });   // 同驻多队全部撤回，不留孤儿驻防标记
          hpChange(s, -4, fx);
          fx.log.push('防守失败：据点失守，本营受损');
        }
        syncConquestNodes(s);
        if (s.phase !== 'finished') returnToConquestMap(s, fx);
      } else if (r.won) {
        if (node) {
          s.map.owned.push(node.id);
          node.cleared = true;
          s.armies[s.activeArmy].node = node.id;
          const baseline = node.kind === 'boss' ? 14 : node.kind === 'elite' ? 7 : node.kind === 'stronghold' && node.sub === 'mine' ? 7 : 4;
          fx.gold += Math.round(baseline * mult);
          if (node.kind === 'stronghold' && (node.sub === 'town' || node.sub === 'fort') && s.armies.length < 3) {
            const id = s.armies.length;
            s.armies.push({ id, node: null, ap: 1 });
            fx.armyUnlocked = id;
            fx.log.push(`攻占${node.name}，解锁第${id + 1}支军队`);
          } else {
            fx.log.push(`攻占${node.name}，纳入补给线`);
          }
          syncConquestNodes(s);
          if (node.kind === 'boss') {
            s.target = null;
            if (s.act >= 4) {
              fx.log.push('深渊之主陨落：战役征服完成');
              done(s, 'won');
            } else s.phase = 'actClear';
          } else s.phase = 'reward';
        } else s.phase = 'reward';
      } else {
        s.stats.losses++;
        hpChange(s, -3, fx);
        s.target = null;
        if (s.phase !== 'finished') returnToConquestMap(s, fx);
      }
    }
    return result(s, fx);
  }

  return { definitions, create, view, act, settle };
});
