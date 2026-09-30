(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const CHARACTERS = window.RPG_CHARACTERS || [];
  const SAVE_KEY = 'astral_princess_rpg_v1';
  const STAGES = [
    { title: '云径的巡守者', sub: '两只星蚀灵挡在回廊入口。', enemy: '星蚀灵', icon: '✧' },
    { title: '荆棘回声', sub: '受侵蚀的树灵开始袭击旅人。', enemy: '荆棘灵', icon: '❀' },
    { title: '沉默的灯塔', sub: '远处的咒术师正为黑雾蓄力。', enemy: '雾语者', icon: '◈' },
    { title: '封门骑士', sub: '守门人举起了燃烧的盾牌。', enemy: '黯星骑士', icon: '♜' },
    { title: '终夜执灯者', sub: '失落的星灯就在它身后。', enemy: '终夜执灯者', icon: '♛', boss: true }
  ];
  const MODE_ROLE = { guard: '坦克', guardLink: '坦克', teamShield: '坦克', heal: '治疗', team: '支援', support: '支援', single: '术师', field: '术师', zone: '术师', dash: '突击', burst: '突击', cleave: '突击', chain: '突击', combo: '突击', dashCleave: '突击', chaos: '术师', passive: '突击' };
  const UB_COPY = {
    guard: '为前排展开棱镜护盾，吸收伤害并反击。', guardLink: '连接队友并分担伤害，为全队提供护盾。', teamShield: '展开全队护盾，抵挡接下来的攻击。',
    dash: '突进敌阵重击目标，并从造成的伤害中恢复生命。', single: '集中轰击目标，造成高额伤害并打断行动。', burst: '引爆星辉，攻击全体敌人并短暂打断。',
    heal: '治疗生命比例最低的队友，并回复少量能量。', team: '鼓舞小队，造成范围伤害并提升全队攻击。', support: '为全队注入星能，提升攻击并加速必杀。',
    cleave: '斩击前排敌人，短时间削弱其防御。', passive: '唤醒专属印记，强化自身并重击当前目标。', field: '铺开持续侵蚀的星域，伤害全体敌人。',
    chain: '释放连锁星雷，依次打击多个敌人。', combo: '对目标打出三段连击，最后一击威力倍增。', dashCleave: '穿越敌阵并横扫全体敌人，同时恢复生命。',
    chaos: '引爆混沌星屑，随机造成伤害并扰乱敌阵。', zone: '冻结敌方行动，再对全体造成星辉伤害。'
  };
  const ALLY_IMAGE = id => `../assets/units_big/${id}.webp`;
  const ROLE_RANK = { '坦克': 0, '突击': 1, '术师': 2, '支援': 3, '治疗': 4 };
  const heroById = new Map(CHARACTERS.map(c => [c.id, c]));
  const meta = { clears: 0, memory: 0, bestStage: 0, bond: {}, teams: 0 };
  let selected = ['ein', 'kouichi', 'yua', 'likou', 'hoshimi'].filter(id => heroById.has(id));
  let inspectedId = selected[0] || CHARACTERS[0]?.id;
  let run = null;
  let battleTimer = 0;
  let toastTimer = 0;
  let pendingReward = null;

  function role(hero) { return MODE_ROLE[hero.skillMode] || '突击'; }
  function keyRole(hero) { return role(hero); }
  function safe(text) { return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function readMeta() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      Object.assign(meta, saved.meta || {});
      if (Array.isArray(saved.selected)) selected = saved.selected.filter(id => heroById.has(id)).slice(0, 5);
    } catch (_) {}
    if (selected.length > 5) selected = selected.slice(0, 5);
  }
  function saveMeta() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ meta, selected })); } catch (_) {} }
  function showToast(message) {
    const el = $('toast'); el.textContent = message; el.classList.remove('hidden'); toastTimer = 2.2;
  }
  function screen(id) { document.querySelectorAll('.screen').forEach(el => el.classList.toggle('hidden', el.id !== id)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function renderMeta() {
    $('memoryCount').textContent = meta.memory || 0;
    $('recordText').textContent = meta.clears ? `已通关 ${meta.clears} 次 · 最远 ${meta.bestStage}/5` : '尚未通关';
  }
  function renderRoster() {
    const query = $('heroSearch').value.trim().toLowerCase();
    const grid = $('rosterGrid');
    const list = CHARACTERS.filter(h => !query || `${h.name} ${h.skill} ${h.description}`.toLowerCase().includes(query));
    grid.innerHTML = list.map(h => {
      const index = selected.indexOf(h.id);
      const bond = meta.bond[h.id] || 0;
      return `<button class="hero-card ${index >= 0 ? 'selected' : ''} ${inspectedId === h.id ? 'active-detail' : ''}" data-hero="${safe(h.id)}" aria-pressed="${index >= 0}"><span class="role-dot">${keyRole(h)}</span>${index >= 0 ? `<span class="pick-index">${index + 1}</span>` : ''}<img loading="lazy" src="${ALLY_IMAGE(encodeURIComponent(h.id))}" alt=""><strong>${safe(h.name)}</strong><small>羁绊 Lv.${bond} · ${safe(h.skill)}</small></button>`;
    }).join('');
    $('teamCount').textContent = `${selected.length} / 5`;
    $('startChapter').disabled = selected.length !== 5;
    $('teamStyle').textContent = selected.length ? teamSummary() : '待编队';
    renderSlots(); renderDetail();
  }
  function teamSummary() {
    const counts = {};
    selected.forEach(id => { const h = heroById.get(id); if (h) counts[role(h)] = (counts[role(h)] || 0) + 1; });
    return Object.entries(counts).map(([name, n]) => `${name}×${n}`).join('　');
  }
  function renderSlots() {
    $('teamSlots').innerHTML = Array.from({ length: 5 }, (_, i) => {
      const h = heroById.get(selected[i]);
      return h ? `<button class="team-slot" data-remove="${safe(h.id)}" title="点击移出 ${safe(h.name)}"><span class="slot-number">${i + 1}</span><img src="${ALLY_IMAGE(encodeURIComponent(h.id))}" alt=""><span class="remove">×</span></button>` : `<div class="team-slot empty-slot"><span class="slot-number">${i + 1}</span></div>`;
    }).join('');
  }
  function renderDetail() {
    const h = heroById.get(inspectedId);
    if (!h) return;
    $('heroDetail').innerHTML = `<img src="${ALLY_IMAGE(encodeURIComponent(h.id))}" alt=""><b>${safe(h.name)}</b><span class="detail-role">${keyRole(h)}　·　${safe(h.attackStyle === 'blade' ? '近战' : '远程')}</span><p><span class="detail-skill">✦ ${safe(h.skill)}：</span>${safe(UB_COPY[h.skillMode] || h.description)}</p>`;
  }
  function updateRoute() {
    const current = run?.stage || 1;
    $('chapterNodes').innerHTML = STAGES.map((stage, index) => {
      const n = index + 1, cls = n < current ? 'cleared' : n === current ? 'current' : 'locked';
      const icon = n < current ? '✓' : stage.boss ? '♛' : `${n}`;
      return `<div class="chapter-node ${cls}"><span class="node-mark">${icon}</span><b>${n === 5 ? '章节首领' : `节点 ${n}`}</b><small>${safe(stage.title)}</small></div>`;
    }).join('');
    const ordered = getFormation();
    $('activeTeam').innerHTML = ordered.map(h => `<img title="${safe(h.name)} · ${keyRole(h)}" src="${ALLY_IMAGE(encodeURIComponent(h.id))}" alt="">`).join('');
    $('enterStage').textContent = current === 5 ? '挑战章节首领　→' : `前往节点 ${current}　→`;
    $('mapNotice').textContent = current === 3 ? '途中发现一处营地：可以恢复队伍，或进行训练。' : '自动战斗期间点击蓄满能量的角色头像，手动释放必杀技。';
  }
  function getFormation() {
    return selected.map((id, order) => heroById.get(id)).filter(Boolean).sort((a, b) => (ROLE_RANK[role(a)] ?? 2) - (ROLE_RANK[role(b)] ?? 2) || selected.indexOf(a.id) - selected.indexOf(b.id));
  }
  function startRun() {
    if (selected.length !== 5) return showToast('请先选满五位角色');
    if (battleTimer) { clearInterval(battleTimer); battleTimer = 0; }
    run = { stage: 1, elapsed: 0, party: getFormation().map((hero, i) => {
      const bond = Math.min(10, meta.bond[hero.id] || 0);
      const base = role(hero) === '坦克' ? 270 : role(hero) === '治疗' ? 188 : role(hero) === '支援' ? 195 : role(hero) === '术师' ? 170 : 205;
      const maxHp = Math.round(base * (1 + bond * .012));
      const atk = role(hero) === '坦克' ? 20 : role(hero) === '治疗' ? 21 : role(hero) === '支援' ? 22 : role(hero) === '术师' ? 29 : 26;
      return { hero, maxHp, hp: maxHp, atk: Math.round(atk * (1 + bond * .012)), tp: i === 0 ? 15 : 0, shield: 0, cooldown: .45 + i * .17, slow: 0, dead: false };
    }), bonus: { atk: 0, heal: 0 }, log: '远征小队已集结。', rewards: 0, paused: false };
    meta.teams = (meta.teams || 0) + 1; saveMeta(); renderMeta();
    showMap(); startBattle();
  }
  function showMap() { updateRoute(); screen('mapScreen'); }
  function makeEnemies(stage) {
    const scale = 1 + (stage - 1) * .14;
    const base = [
      { type: 'wisp', name: '星蚀灵', glyph: '✧', hp: 104, atk: 16, rate: 1.9, intent: '突袭前排' },
      { type: 'thorn', name: '荆棘灵', glyph: '❀', hp: 143, atk: 19, rate: 2.1, intent: '重击前排' },
      { type: 'caster', name: '雾语者', glyph: '◈', hp: 116, atk: 20, rate: 2.3, intent: '星雾齐射' },
      { type: 'guard', name: '黯星骑士', glyph: '♜', hp: 195, atk: 25, rate: 2.5, intent: '盾击前排' }
    ];
    let set;
    if (stage === 1) set = [base[0], base[0]];
    else if (stage === 2) set = [base[0], base[1], base[0]];
    else if (stage === 3) set = [base[1], base[2], base[1]];
    else if (stage === 4) set = [base[3], base[2], base[3]];
    else set = [
      { type: 'boss', name: '终夜执灯者', glyph: '♛', hp: 820, atk: 27, rate: 2.25, intent: '黑潮将至', boss: true },
      { type: 'wisp', name: '守灯残影', glyph: '✧', hp: 205, atk: 24, rate: 2.0, intent: '侵蚀' },
      { type: 'thorn', name: '荆棘护卫', glyph: '❀', hp: 255, atk: 27, rate: 2.3, intent: '缠绕' }
    ];
    return set.map((e, i) => ({ ...e, id: `s${stage}-e${i}`, maxHp: Math.round(e.hp * scale), hp: Math.round(e.hp * scale), atk: Math.round(e.atk * scale), clock: 1.05 + i * .3, stun: 0, weak: 0, alive: true, attacks: 0 }));
  }
  function startBattle() {
    if (!run) return;
    run.elapsed = 0; run.paused = false; run.enemies = makeEnemies(run.stage); run.target = run.enemies[0]?.id;
    run.party.forEach((u, i) => { u.cooldown = .35 + i * .17; u.slow = 0; });
    const stage = STAGES[run.stage - 1];
    $('battleStageLabel').textContent = `CHAPTER 01  ·  NODE 0${run.stage}`;
    $('battleTitle').textContent = stage.title;
    $('waveLabel').textContent = stage.boss ? 'BOSS BATTLE' : `WAVE 0${run.stage}`;
    $('arenaCaption').textContent = stage.boss ? '首領蓄力時會發動全體攻擊，注意手動施放必殺。' : '点击敌人集火 · 能量蓄满后手动释放必杀技';
    $('battleClock').textContent = '00:00';
    buildBattleUnits(); refreshBattle(); screen('battleScreen');
    if (battleTimer) clearInterval(battleTimer);
    battleTimer = setInterval(() => tick(.15), 150);
  }
  function buildBattleUnits() {
    $('partyFormation').innerHTML = run.party.map((u, i) => `<div class="battle-unit ally ${i < 2 ? 'front' : ''}" data-ally="${safe(u.hero.id)}"><div class="sprite-wrap"><img src="${ALLY_IMAGE(encodeURIComponent(u.hero.id))}" alt=""></div><span class="unit-name">${safe(u.hero.name)}</span><span class="unit-role">${i < 2 ? '前卫' : '后卫'} · ${keyRole(u.hero)}</span><div class="health-track"><i class="hp-fill"></i></div><div class="tp-track"><i class="tp-fill"></i></div></div>`).join('');
    $('partyHud').innerHTML = run.party.map(u => `<div class="hud-unit" data-hud="${safe(u.hero.id)}"><img class="hud-portrait" src="${ALLY_IMAGE(encodeURIComponent(u.hero.id))}" alt=""><span class="hud-name">${safe(u.hero.name)}</span><div class="health-track"><i class="hud-hp-fill"></i></div><button class="ub-button" data-ub="${safe(u.hero.id)}" title="${safe(u.hero.skill)}">必殺技　${safe(u.hero.skill)}</button></div>`).join('');
    $('enemyFormation').innerHTML = run.enemies.map((e, i) => `<div class="battle-unit enemy ${i === 0 ? 'focused' : ''}" data-enemy="${safe(e.id)}"><span class="intent">${safe(e.intent)}</span>${e.boss ? '<span class="creature-crown">♛</span>' : ''}<div class="enemy-creature"><div class="creature-core ${safe(e.type)}">${safe(e.glyph)}</div></div><span class="unit-name">${safe(e.name)}</span><div class="health-track"><i class="enemy-hp-fill"></i></div></div>`).join('');
  }
  function refreshBattle() {
    if (!run) return;
    for (const u of run.party) {
      const unit = document.querySelector(`[data-ally="${CSS.escape(u.hero.id)}"]`);
      const hud = document.querySelector(`[data-hud="${CSS.escape(u.hero.id)}"]`);
      if (!unit || !hud) continue;
      unit.classList.toggle('dead', u.hp <= 0); unit.classList.toggle('ready', u.tp >= 100);
      unit.querySelector('.hp-fill').style.width = `${Math.max(0, 100 * u.hp / u.maxHp)}%`;
      unit.querySelector('.tp-fill').style.width = `${Math.min(100, u.tp)}%`;
      hud.querySelector('.hud-hp-fill').style.width = `${Math.max(0, 100 * u.hp / u.maxHp)}%`;
      const button = hud.querySelector('.ub-button');
      button.classList.toggle('ready', u.tp >= 100 && u.hp > 0); button.disabled = u.tp < 100 || u.hp <= 0;
      button.textContent = u.tp >= 100 ? `✦ ${u.hero.skill}` : `${Math.floor(u.tp)}%　${u.hero.skill}`;
    }
    for (const e of run.enemies) {
      const el = document.querySelector(`[data-enemy="${CSS.escape(e.id)}"]`);
      if (!el) continue;
      el.classList.toggle('dead', e.hp <= 0); el.classList.toggle('focused', e.id === run.target);
      el.querySelector('.enemy-hp-fill').style.width = `${Math.max(0, 100 * e.hp / e.maxHp)}%`;
      el.querySelector('.intent').textContent = e.stun > 0 ? '眩晕中' : e.intent;
    }
    $('battleClock').textContent = `${String(Math.floor(run.elapsed / 60)).padStart(2,'0')}:${String(Math.floor(run.elapsed % 60)).padStart(2,'0')}`;
    $('battleLog').innerHTML = `<span>${safe(run.log)}</span>`;
  }
  function log(message) { if (!run) return; run.log = message; }
  function floating(text, big = false) {
    const el = document.createElement('span'); el.className = 'fx-label'; el.textContent = text; el.style.left = `${42 + Math.random() * 20}%`; el.style.top = `${34 + Math.random() * 24}%`; if (big) { el.style.fontSize = '30px'; el.style.color = '#fff1a9'; }
    $('combatEffects').appendChild(el); setTimeout(() => el.remove(), 850);
  }
  function hurtEnemy(enemy, amount) {
    if (!enemy || enemy.hp <= 0) return 0;
    const final = Math.max(1, Math.round(amount * (enemy.weak > 0 ? .78 : 1)));
    enemy.hp = Math.max(0, enemy.hp - final); floating(`-${final}`);
    if (enemy.hp === 0) { log(`${enemy.name} 被击倒了。`); }
    return final;
  }
  function hurtAlly(unit, amount) {
    if (!unit || unit.hp <= 0) return;
    const blocked = Math.min(unit.shield, amount); unit.shield -= blocked;
    const actual = Math.max(0, amount - blocked); unit.hp = Math.max(0, unit.hp - actual);
    unit.tp = Math.min(100, unit.tp + Math.min(26, actual / unit.maxHp * 135));
    if (actual > 0) floating(`-${actual}`);
    if (unit.hp <= 0) log(`${unit.hero.name} 暂时无法继续战斗。`);
  }
  function healUnit(unit, amount) { if (!unit || unit.hp <= 0) return 0; const before = unit.hp; unit.hp = Math.min(unit.maxHp, unit.hp + amount); const gained = unit.hp - before; if (gained) floating(`+${gained}`, true); return gained; }
  function aliveEnemies() { return run.enemies.filter(e => e.hp > 0); }
  function aliveParty() { return run.party.filter(u => u.hp > 0); }
  function focused() { return aliveEnemies().find(e => e.id === run.target) || aliveEnemies()[0]; }
  function applyAll(amount, scale = 1) { aliveEnemies().forEach(e => hurtEnemy(e, amount * scale)); }
  function shieldAll(ratio) { run.party.filter(u => u.hp > 0).forEach(u => { u.shield += Math.round(u.maxHp * ratio); }); }
  function mostInjured() { return aliveParty().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; }
  function castUB(id) {
    if (!run || run.paused) return;
    const u = run.party.find(v => v.hero.id === id); if (!u || u.hp <= 0 || u.tp < 100) return;
    const mode = u.hero.skillMode, target = focused(), all = aliveEnemies(), front = all.slice(0, 2); u.tp = 0;
    const atk = u.atk * (1 + run.bonus.atk + (u.attackBuff || 0));
    const strike = (enemy, ratio) => hurtEnemy(enemy, atk * ratio);
    switch (mode) {
      case 'guard': shieldAll(.13); u.shield += Math.round(u.maxHp * .24); strike(target, 1.4); log(`${u.hero.name} 展开棱镜守护！`); break;
      case 'guardLink': shieldAll(.19); run.party.filter(v => v.hp > 0).forEach(v => { v.link = 5; }); strike(target, 1.25); log(`${u.hero.name} 与队友建立守护链接。`); break;
      case 'teamShield': shieldAll(.22); applyAll(atk, .4); log(`${u.hero.name} 为全队展开护盾！`); break;
      case 'dash': { const dealt = strike(target, 2.35); healUnit(u, dealt * .16); if (target) target.stun = Math.max(target.stun, .4); log(`${u.hero.name} 突进并斩中 ${target?.name || '敌人'}！`); break; }
      case 'single': strike(target, 2.8); if (target) target.stun = Math.max(target.stun, 1.15); log(`${u.hero.name} 的单体必杀打断了敌人！`); break;
      case 'burst': applyAll(atk, 1.48); all.forEach(e => e.stun = Math.max(e.stun, .45)); log(`${u.hero.name} 引爆星辉，打断了敌阵！`); break;
      case 'heal': { const a = mostInjured(); if (a) { healUnit(a, a.maxHp * .42); a.tp = Math.min(100, a.tp + 12); } strike(target, .9); log(`${u.hero.name} 为 ${a?.hero.name || '队友'} 施放急救。`); break; }
      case 'team': applyAll(atk, .72); run.party.filter(v => v.hp > 0).forEach(v => v.attackBuff = Math.max(v.attackBuff || 0, .17)); log(`${u.hero.name} 鼓舞全队，攻击力提升！`); break;
      case 'support': run.party.filter(v => v.hp > 0).forEach(v => { v.tp = Math.min(100, v.tp + 28); v.attackBuff = Math.max(v.attackBuff || 0, .12); }); log(`${u.hero.name} 为队友注入星能！`); break;
      case 'cleave': front.forEach(e => { strike(e, 1.72); e.weak = 3; }); log(`${u.hero.name} 斩开敌方前列。`); break;
      case 'passive': u.shield += Math.round(u.maxHp * .16); strike(target, 2.65); u.tp = 0; log(`${u.hero.name} 唤醒专属印记！`); break;
      case 'field': applyAll(atk, 1.12); all.forEach(e => { e.dot = (e.dot || 0) + Math.round(atk * .22); }); log(`${u.hero.name} 展开持续侵蚀的星域。`); break;
      case 'chain': [1.8, 1.25, .85].forEach((ratio, i) => { const e = all[i]; if (e) strike(e, ratio); }); log(`${u.hero.name} 的星雷在敌阵间跳跃。`); break;
      case 'combo': if (target) { strike(target, 1); strike(target, 1.1); strike(target, 1.65); } log(`${u.hero.name} 打出三段必杀连击！`); break;
      case 'dashCleave': applyAll(atk, 1.48); healUnit(u, u.maxHp * .14); log(`${u.hero.name} 穿越敌阵并横扫全体。`); break;
      case 'chaos': all.forEach(e => { strike(e, .95 + Math.random() * 1.1); if (Math.random() < .45) e.stun = Math.max(e.stun, .55); }); log(`${u.hero.name} 引爆混沌星屑！`); break;
      case 'zone': all.forEach(e => { strike(e, 1.06); e.stun = Math.max(e.stun, .9); }); log(`${u.hero.name} 冻结了整片战场！`); break;
      default: strike(target, 2.05); log(`${u.hero.name} 释放了 ${u.hero.skill}！`);
    }
    floating('必殺技', true); refreshBattle();
    if (!aliveEnemies().length) finishBattle(true);
  }
  function enemyAction(enemy) {
    if (enemy.hp <= 0 || enemy.stun > 0) return;
    enemy.attacks++;
    if (enemy.boss && enemy.attacks % 3 === 0) {
      aliveParty().forEach(u => hurtAlly(u, enemy.atk * .55));
      log('终夜执灯者掀起黑潮，全队承受伤害！'); return;
    }
    let target;
    if (enemy.type === 'caster' && Math.random() < .55) target = aliveParty().slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!target) target = aliveParty().sort((a, b) => run.party.indexOf(a) - run.party.indexOf(b))[0];
    if (target) { const amount = enemy.atk * (enemy.type === 'guard' ? 1.18 : 1); if (target.link > 0) { const front = run.party.find(u => u.hero.skillMode === 'guardLink' && u.hp > 0); if (front && front !== target) hurtAlly(front, amount * .3); else hurtAlly(target, amount); } else hurtAlly(target, amount); log(`${enemy.name} 攻击了 ${target.hero.name}。`); }
  }
  function tick(dt) {
    if (!run || run.paused) return;
    run.elapsed += dt;
    for (const u of run.party) {
      if (u.hp <= 0) continue;
      u.cooldown -= dt * (u.slow > 0 ? .72 : 1); u.slow = Math.max(0, u.slow - dt); u.link = Math.max(0, (u.link || 0) - dt);
      if (u.attackBuff) u.attackBuff = Math.max(0, u.attackBuff - dt * .018);
      if (u.cooldown <= 0) {
        const target = focused();
        if (target) {
          hurtEnemy(target, u.atk * (1 + run.bonus.atk + (u.attackBuff || 0)));
          u.tp = Math.min(100, u.tp + 17); u.cooldown = role(u.hero) === '坦克' ? 1.72 : role(u.hero) === '治疗' ? 1.62 : 1.4;
        }
      }
    }
    for (const e of run.enemies) {
      if (e.hp <= 0) continue;
      if (e.dot > 0) { hurtEnemy(e, e.dot * dt); }
      e.weak = Math.max(0, e.weak - dt); e.stun = Math.max(0, e.stun - dt);
      e.clock -= dt;
      if (e.clock <= 0) { enemyAction(e); e.clock = e.rate; }
    }
    if (!aliveParty().length) { finishBattle(false); return; }
    if (!aliveEnemies().length) { finishBattle(true); return; }
    if (Math.floor(run.elapsed * 5) % 2 === 0) refreshBattle();
  }
  function finishBattle(victory) {
    if (battleTimer) { clearInterval(battleTimer); battleTimer = 0; }
    run.paused = true;
    meta.bestStage = Math.max(meta.bestStage || 0, run.stage);
    if (!victory) {
      const consolation = 3 + run.stage * 2; meta.memory += consolation; saveMeta(); renderMeta();
      $('defeatCopy').textContent = `本次远征推进到节点 ${run.stage}。调整队伍位置或选择不同角色，再来挑战。`;
      $('defeatReward').textContent = `✧ 星屑 × ${consolation}`; screen('gameOverScreen'); return;
    }
    run.rewards += run.stage === 5 ? 25 : 10;
    meta.memory = (meta.memory || 0) + (run.stage === 5 ? 25 : 10); saveMeta(); renderMeta();
    if (run.stage === 5) { chapterClear(); return; }
    pendingReward = makeRewards();
    $('resultIcon').textContent = run.stage === 4 ? '♛' : '✦';
    $('resultEyebrow').textContent = `NODE 0${run.stage} CLEARED`;
    $('resultTitle').textContent = `${STAGES[run.stage - 1].title} · 胜利`;
    $('resultCopy').textContent = '在前往下一段云径前，为小队选择一项远征祝福。';
    $('rewardSummary').textContent = `✧ 星屑 × ${run.stage === 5 ? 25 : 10}`;
    $('rewardChoices').innerHTML = pendingReward.map((r, i) => `<button class="reward-choice" data-reward="${i}"><span class="reward-icon">${r.icon}</span><b>${safe(r.title)}</b><small>${safe(r.text)}</small></button>`).join('');
    $('continueButton').disabled = true; screen('resultScreen');
  }
  function makeRewards() {
    const options = [
      { icon: '✦', title: '星辉祝福', text: '全队攻击力提升 8%。', apply: () => run.bonus.atk += .08 },
      { icon: '♡', title: '温柔疗愈', text: '全队恢复 35% 最大生命。', apply: () => run.party.forEach(u => healUnit(u, u.maxHp * .35)) },
      { icon: '♧', title: '坚韧祷言', text: '全队最大生命提升 8%，并恢复 12%。', apply: () => run.party.forEach(u => { const p = u.hp / u.maxHp; u.maxHp = Math.round(u.maxHp * 1.08); u.hp = Math.min(u.maxHp, Math.round(u.maxHp * p) + Math.round(u.maxHp * .12)); }) },
      { icon: '✧', title: '星泉露滴', text: '全队恢复 55% 最大生命。', apply: () => run.party.forEach(u => healUnit(u, u.maxHp * .55)) }
    ];
    const picked = []; while (picked.length < 3) { const i = Math.floor(Math.random() * options.length); if (!picked.includes(i)) picked.push(i); }
    return picked.map(i => options[i]);
  }
  function chapterClear() {
    meta.clears = (meta.clears || 0) + 1; meta.memory = (meta.memory || 0) + 60;
    selected.forEach(id => { meta.bond[id] = Math.min(10, (meta.bond[id] || 0) + 1); }); saveMeta(); renderMeta();
    $('clearTeamNames').textContent = getFormation().map(h => h.name).join('、');
    $('clearCount').textContent = `${meta.clears} 次`;
    $('clearCurrency').textContent = '+60 星屑'; screen('clearScreen');
  }
  function continueAfterReward(index) {
    if (!pendingReward || !pendingReward[index]) return;
    document.querySelectorAll('.reward-choice').forEach((el, i) => el.classList.toggle('selected', i === index));
    pendingReward[index].apply(); run.stage++; run.elapsed = 0; pendingReward = null; saveMeta(); renderMeta(); showMap();
  }
  function enterStage() {
    if (!run) return startRun();
    if (run.stage === 3 && !run.campDone) return showCamp();
    startBattle();
  }
  function showCamp() {
    $('campModal').classList.remove('hidden');
  }
  function chooseCamp(rest) {
    if (!run) return;
    $('campModal').classList.add('hidden');
    if (rest) run.party.forEach(u => healUnit(u, u.maxHp * .45)); else run.bonus.atk += .08;
    run.campDone = true; showToast(rest ? '全队在营地恢复了体力' : '全队完成训练，攻击力提升'); updateRoute(); startBattle();
  }
  function togglePause() {
    if (!run) return;
    run.paused = !run.paused;
    $('retreatButton').textContent = run.paused ? '继续战斗' : '暂停远征';
    log(run.paused ? '远征已暂停。' : '战斗继续。'); refreshBattle();
  }
  function onRosterClick(event) {
    const remove = event.target.closest('[data-remove]');
    if (remove) { selected = selected.filter(id => id !== remove.dataset.remove); renderRoster(); saveMeta(); return; }
    const card = event.target.closest('[data-hero]'); if (!card) return;
    const id = card.dataset.hero; inspectedId = id;
    const idx = selected.indexOf(id);
    if (idx >= 0) selected.splice(idx, 1);
    else if (selected.length < 5) selected.push(id);
    else showToast('小队已满，先点击队伍头像移除一位角色');
    renderRoster(); saveMeta();
  }
  function init() {
    readMeta(); renderMeta(); renderRoster();
    $('rosterGrid').addEventListener('click', onRosterClick);
    $('teamSlots').addEventListener('click', onRosterClick);
    $('heroSearch').addEventListener('input', renderRoster);
    $('startChapter').addEventListener('click', startRun);
    $('editTeam').addEventListener('click', () => { if (battleTimer) { clearInterval(battleTimer); battleTimer = 0; } screen('selectScreen'); renderRoster(); });
    $('enterStage').addEventListener('click', enterStage);
    $('enemyFormation').addEventListener('click', e => { const enemy = e.target.closest('[data-enemy]'); if (enemy) { run.target = enemy.dataset.enemy; refreshBattle(); } });
    $('partyHud').addEventListener('click', e => { const button = e.target.closest('[data-ub]'); if (button) castUB(button.dataset.ub); });
    $('partyFormation').addEventListener('click', e => { const unit = e.target.closest('[data-ally]'); if (unit) castUB(unit.dataset.ally); });
    $('continueButton').onclick = null;
    $('rewardChoices').addEventListener('click', e => {
      const choice = e.target.closest('[data-reward]'); if (!choice || !pendingReward) return;
      const index = Number(choice.dataset.reward);
      document.querySelectorAll('.reward-choice').forEach((el, i) => el.classList.toggle('selected', i === index));
      pendingReward[index].apply(); run.stage++; pendingReward = null;
      $('continueButton').disabled = false;
      $('continueButton').onclick = () => { $('continueButton').onclick = null; showMap(); };
      refreshBattle(); saveMeta();
    });
    $('replayButton').addEventListener('click', startRun);
    $('backRoster').addEventListener('click', () => { screen('selectScreen'); renderRoster(); });
    $('retryButton').addEventListener('click', () => { screen('selectScreen'); renderRoster(); });
    $('retreatButton').addEventListener('click', togglePause);
    $('campHeal').addEventListener('click', () => chooseCamp(true));
    $('campTrain').addEventListener('click', () => chooseCamp(false));
    $('campClose').addEventListener('click', () => chooseCamp(false));
    const modal = $('dialogModal');
    const openModal = () => modal.classList.remove('hidden');
    const closeModal = () => modal.classList.add('hidden');
    $('helpButton').addEventListener('click', openModal); $('closeModal').addEventListener('click', closeModal); $('modalOkay').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    setInterval(() => { if (toastTimer > 0 && (toastTimer -= .1) <= 0) $('toast').classList.add('hidden'); }, 100);
  }
  init();
})();
