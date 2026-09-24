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
    { id: 'conquest', name: '战役征服', description: '夺取据点、维持补给并攻克主城。' }
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
  const map = {
    home: { name: '本营', links: ['mine', 'town'], depth: 0 },
    mine: { name: '矿区', links: ['home', 'pass'], depth: 1 },
    town: { name: '城镇', links: ['home', 'fort'], depth: 1 },
    pass: { name: '山口', links: ['mine', 'fort', 'capital'], depth: 2 },
    fort: { name: '要塞', links: ['town', 'pass', 'capital'], depth: 2 },
    capital: { name: '敌方主城', links: ['pass', 'fort'], depth: 3 }
  };
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
  const conquestTarget = state => {
    const front = state.owned.filter(id => id !== 'home' && map[id].links.some(next => !state.owned.includes(next)));
    return front.length ? front[random(state.seed, `assault:${state.turn}`, front.length)] : 'home';
  };
  const conquestAdvance = (state, fx) => {
    const target = state.telegraph;
    state.turn++;
    if (state.turn % 3 === 0 && target) {
      if (target === 'home') hpChange(state, -4, fx);
      else {
        state.owned = state.owned.filter(id => id !== target);
        state.armies.forEach(army => { if (army.position === target) army.position = 'home'; });
      }
      fx.log.push(`敌军袭击${map[target].name}`);
    }
    state.telegraph = conquestTarget(state);
    state.armies.forEach(army => { army.ap = 1; });
    state.supply = Math.min(5, state.supply + 1 + (state.owned.includes('town') ? 1 : 0));
    if (state.owned.includes('mine')) fx.gold += 2;
  };

  function create(mode, seed, options) {
    assert(definitions.some(d => d.id === mode), `Unknown mode: ${mode}`);
    const s = { mode, seed: hash(seed, 'solo'), phase: '', outcome: null, hp: 0, maxHp: 0, progress: 0 };
    const opt = options || {};
    if (mode === 'expedition') Object.assign(s, { phase: 'route', hp: 20, maxHp: 20, chapter: 1, node: 0, route: [], current: null, relics: [] });
    if (mode === 'hunt') Object.assign(s, { phase: 'prep', hp: 3, maxHp: 3, prep: 0, prepHistory: [], boss: opt.boss || bossKinds[Number.isInteger(opt.bossIndex) ? ((opt.bossIndex % 3) + 3) % 3 : random(s.seed, 'boss', 3)], attempts: 0, maxAttempts: 3, intel: false });
    if (mode === 'puzzle') Object.assign(s, { phase: 'fight', hp: 1, maxHp: 1, puzzle: Number.isInteger(opt.puzzleIndex) ? ((opt.puzzleIndex % 3) + 3) % 3 : Number.isInteger(opt.puzzle) ? ((opt.puzzle % 3) + 3) % 3 : random(s.seed, 'puzzle', 3), budget: 12, population: 4, candidates: [], hintLevel: 0, attempts: 0, medals: [] });
    if (mode === 'siege') Object.assign(s, { phase: 'build', hp: 20, maxHp: 20, wave: 1, targetWaves: 15, endless: false, buildPoints: 3, walls: 0, healers: 0, snares: 0, risk: false, economy: 0 });
    if (mode === 'conquest') Object.assign(s, { phase: 'map', hp: 15, maxHp: 15, turn: 1, owned: ['home'], supply: 3, telegraph: 'home', target: null, wins: 0, armies: [{ id: 0, position: 'home', ap: 1 }], activeArmy: 0 });
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
      const army = s.armies[s.activeArmy];
      base.subtitle = `第${s.turn}回合 · 第${army.id + 1}队驻${map[army.position].name} · 行动${army.ap} · 补给${s.supply}/5 · 本营${s.hp}/${s.maxHp}`;
      base.objective = '控制相邻据点，攻克敌方主城';
      base.enemyHint = `敌军下一轮目标：${map[s.telegraph].name}`;
      if (s.phase === 'map') {
        const neighbors = map[army.position].links.filter(id => !s.owned.includes(id));
        base.choices = neighbors.map(id => choice(`attack:${id}`, `攻打${map[id].name}`, `消耗${map[id].depth}补给与 1 行动；${id === 'capital' ? '最终决战' : '占领后提供战略收益'}`, s.supply < map[id].depth || army.ap < 1));
        base.choices.push(...map[army.position].links.filter(id => s.owned.includes(id)).map(id => choice(`move:${id}`, `移动至${map[id].name}`, '消耗 1 行动', army.ap < 1)));
        base.choices.push(...s.armies.filter(other => other.id !== army.id).map(other => choice(`army:switch:${other.id}`, `切换至第${other.id + 1}队`, `驻${map[other.position].name}，行动${other.ap}`)));
        base.choices.push(choice('map:rest', '休整', '补给 +2，本营恢复 2 生命'));
        base.choices.push(choice('map:end', '结束回合', '敌军执行预告行动'));
      }
      if (s.phase === 'fight') { base.canFight = true; const id = s.target; base.encounter = encounter(map[id].name, 1 + map[id].depth, 3 + map[id].depth, id === 'capital', id === 'capital' ? 'shield' : id === 'pass' ? 'flank' : 'none', hash(s.seed, `territory:${id}`), id === 'fort' ? 'fortified' : id === 'pass' ? 'highground' : 'none'); }
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
      if (choiceId.startsWith('attack:')) { s.target = choiceId.slice(7); s.supply -= map[s.target].depth; s.armies[s.activeArmy].ap--; s.phase = 'fight'; }
      else if (choiceId.startsWith('move:')) { s.armies[s.activeArmy].position = choiceId.slice(5); s.armies[s.activeArmy].ap--; }
      else if (choiceId.startsWith('army:switch:')) { const to = Number(choiceId.slice('army:switch:'.length)); fx.swapArmy = { from: s.activeArmy, to }; s.activeArmy = to; }
      else {
        if (choiceId === 'map:rest') { s.supply = Math.min(5, s.supply + 2); hpChange(s, 2, fx); }
        if (s.phase !== 'finished') conquestAdvance(s, fx);
      }
    }
    return result(s, fx);
  }

  function settle(state, report) {
    const s = clone(state), fx = empty(), r = report || {};
    assert(s.phase === 'fight', 'No battle to settle');
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
      if (r.won) {
        s.owned.push(s.target); s.wins++;
        s.armies[s.activeArmy].position = s.target;
        if ((s.target === 'town' || s.target === 'fort') && s.armies.length < 3) {
          const id = s.armies.length;
          s.armies.push({ id, position: 'home', ap: 1 });
          fx.armyUnlocked = id;
        }
        fx.gold = s.target === 'mine' ? 5 : s.target === 'capital' ? 10 : 3;
        if (s.target === 'capital') done(s, 'won');
      } else hpChange(s, -3, fx);
      s.target = null;
      if (s.phase !== 'finished') { s.phase = 'map'; conquestAdvance(s, fx); }
    }
    return result(s, fx);
  }

  return { definitions, create, view, act, settle };
});
