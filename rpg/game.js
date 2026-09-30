(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const W = canvas.width, H = canvas.height;
  const SAVE_KEY = 'astral_rpg_demo_v1';
  const root = '../assets/';
  const images = {};
  const assets = {
    courtyard: 'ui/idol-sky-stage.png', passage: 'ui/idol-arena-v2.png', abyss: 'ui/idol-arena-night.png',
    ein: 'units_big/ein.webp', chiharu: 'units_big/chiharu.webp', shadow: 'units_big/shadow.webp',
    nox: 'units_big/nox.webp', kroya: 'units_big/kroya.webp', seki: 'units_big/seki.webp',
    slash: 'fx/slash.png', starfall: 'fx/starfall.png', gate: 'fx/gate.png'
  };
  Object.entries(assets).forEach(([key, path]) => { const img = new Image(); img.src = root + path; images[key] = img; });
  const zones = [
    { name: '星穹庭院', sub: '晨光仍照着沉睡的门扉', tag: '安全区域', bg: 'courtyard' },
    { name: '碎星回廊', sub: '侵蚀之影游荡在云端', tag: '危险区域', bg: 'passage' },
    { name: '终夜之门', sub: '失落星灯的最后封印', tag: '首领区域', bg: 'abyss' }
  ];
  const enemyTemplates = [
    { id: 'shade1', name: '侵蚀之影', image: 'shadow', x: 445, y: 395, hp: 60, damage: 8, speed: 58 },
    { id: 'shade2', name: '裂隙守卫', image: 'kroya', x: 810, y: 465, hp: 78, damage: 9, speed: 46 },
    { id: 'shade3', name: '迷途星灵', image: 'seki', x: 630, y: 535, hp: 55, damage: 7, speed: 68 },
    { id: 'boss', name: '终夜执灯者', image: 'nox', x: 800, y: 430, hp: 185, damage: 13, speed: 48, boss: true }
  ];
  const state = { started: false, zone: 0, x: 350, y: 470, facing: 1, hp: 100, maxHp: 100, mp: 60, maxMp: 60, xp: 0, level: 1, potions: 2, shards: 0, spoken: false, kills: [], boss: false, complete: false, journal: ['命运的旅程，即将开始。'], cooldowns: { attack: 0, skill: 0, dash: 0 }, invuln: 0, actionFx: [], enemies: [], particles: [], dialogue: null, shake: 0, time: 0, saveTick: 0 };
  const held = new Set();
  let toastTimer = 0, lastTime = 0;

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return;
      for (const key of ['zone','x','y','hp','maxHp','mp','maxMp','xp','level','potions','shards','spoken','kills','boss','complete','journal']) {
        if (saved[key] !== undefined) state[key] = saved[key];
      }
      if (!Array.isArray(state.kills)) state.kills = [];
      if (!Array.isArray(state.journal)) state.journal = [];
      state.zone = Math.max(0, Math.min(2, Number(state.zone) || 0));
      state.x = Math.max(90, Math.min(1110, Number(state.x) || 350));
      state.y = Math.max(320, Math.min(575, Number(state.y) || 470));
      state.hp = Math.max(1, Math.min(state.maxHp, Number(state.hp) || state.maxHp));
      state.mp = Math.max(0, Math.min(state.maxMp, Number(state.mp) || 0));
    } catch (_) { /* Start a new game if the save is invalid. */ }
  }
  function save() {
    const keys = ['zone','x','y','hp','maxHp','mp','maxMp','xp','level','potions','shards','spoken','kills','boss','complete','journal'];
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(Object.fromEntries(keys.map(k => [k, state[k]])))); } catch (_) {}
  }
  function makeEnemies() {
    state.enemies = enemyTemplates.filter(e => (state.zone === 1 && !e.boss || state.zone === 2 && e.boss) && !state.kills.includes(e.id) && !(e.boss && state.boss)).map(e => ({ ...e, maxHp: e.hp, hitTimer: 0, attackTimer: 0, stun: 0, angle: Math.random() * 6 }));
  }
  function journal(message) { if (state.journal[0] !== message) state.journal.unshift(message); state.journal = state.journal.slice(0, 5); updateUI(); save(); }
  function toast(message) { const el = $('toast'); el.textContent = message; el.classList.remove('hidden'); toastTimer = 2.1; }
  function lines(name, portrait, text, after) { state.dialogue = { name, portrait, text, after }; $('dialogueName').textContent = name; $('dialoguePortrait').src = images[portrait].src; $('dialogueText').textContent = text; $('dialogue').classList.remove('hidden'); $('interactPrompt').classList.add('hidden'); }
  function closeDialogue() { if (!state.dialogue) return; const cb = state.dialogue.after; state.dialogue = null; $('dialogue').classList.add('hidden'); if (cb) cb(); }
  function quest() {
    if (state.complete) return ['星光重燃', '星灯已恢复光芒。序章完成，你守住了这片天空。', 3, 3];
    if (state.boss) return ['向守灯人复命', '回到星穹庭院，与知晴分享胜利的消息。', 2, 3];
    if (state.kills.length >= 3) return ['前往终夜之门', '穿过回廊右侧的传送门，击败终夜执灯者。', 2, 3];
    if (state.spoken) return ['净化碎星回廊', '击败回廊中 3 个侵蚀之影，收集散落的星屑。', state.kills.length, 3];
    return ['与守灯人交谈', '走近庭院中的知晴，按 E 了解星灯的异常。', 0, 3];
  }
  function updateUI() {
    $('level').textContent = state.level;
    $('hpText').textContent = `${Math.ceil(state.hp)} / ${state.maxHp}`; $('hpBar').style.width = `${100 * state.hp / state.maxHp}%`;
    $('mpText').textContent = `${Math.ceil(state.mp)} / ${state.maxMp}`; $('mpBar').style.width = `${100 * state.mp / state.maxMp}%`;
    $('xpText').textContent = `${state.xp} / ${state.level * 40}`; $('xpBar').style.width = `${100 * state.xp / (state.level * 40)}%`;
    $('potions').textContent = `× ${state.potions}`; $('shards').textContent = `× ${state.shards}`;
    const [title, desc, progress, total] = quest();
    $('questTitle').textContent = title; $('questText').textContent = desc; $('questProgress').textContent = `${progress} / ${total}`; $('questBar').style.width = `${100 * progress / total}%`;
    $('journal').replaceChildren(...state.journal.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
    const z = zones[state.zone]; $('zoneName').textContent = z.name; $('zoneSub').textContent = z.sub; $('zoneTag').textContent = z.tag; $('zoneIndex').textContent = `0${state.zone + 1} / 03`;
    $('zoneTag').style.borderColor = state.zone ? '#f0ac7977' : '#7fc5a466'; $('zoneTag').style.color = state.zone ? '#f4c39e' : '#a5e2c4';
  }
  function moveZone(zone, x) { state.zone = zone; state.x = x; state.y = 460; state.actionFx.length = 0; makeEnemies(); updateUI(); save(); toast(`进入 ${zones[zone].name}`); }
  function nearestEnemy(range) { let nearest = null, distance = range; for (const e of state.enemies) { const d = Math.hypot(e.x - state.x, (e.y - state.y) * 1.3); if (e.hp > 0 && d < distance) { nearest = e; distance = d; } } return nearest; }
  function damageEnemy(enemy, amount, strong = false) {
    if (!enemy) { toast('靠近敌人后再攻击'); return; }
    enemy.hp = Math.max(0, enemy.hp - amount); enemy.hitTimer = .3; enemy.stun = strong ? .5 : .16; state.shake = strong ? 8 : 3;
    state.actionFx.push({ type: strong ? 'burst' : 'slash', x: enemy.x, y: enemy.y - 75, life: .4, value: amount });
    if (enemy.hp <= 0) {
      state.kills.push(enemy.id); state.shards += enemy.boss ? 5 : 1; state.xp += enemy.boss ? 38 : 18;
      state.enemies = state.enemies.filter(e => e !== enemy);
      if (enemy.boss) { state.boss = true; journal('终夜执灯者倒下，星灯重新闪耀。'); lines('艾因', 'ein', '终于……星灯亮了。回庭院告诉知晴吧。'); }
      else { journal(`击败${enemy.name}，获得星屑。`); if (state.kills.length === 3) toast('回廊已净化！前往右侧传送门'); }
      while (state.xp >= state.level * 40) { state.xp -= state.level * 40; state.level++; state.maxHp += 16; state.maxMp += 8; state.hp = state.maxHp; state.mp = state.maxMp; toast(`升级！现在是 LV ${state.level}`); }
      save();
    }
    updateUI();
  }
  function perform(action) {
    if (!state.started) return;
    if (state.dialogue) { if (action === 'interact') closeDialogue(); return; }
    if (action === 'interact') { interact(); return; }
    if (action === 'potion') { if (!state.potions) return toast('药剂已用完'); if (state.hp >= state.maxHp) return toast('生命值已满'); state.potions--; state.hp = Math.min(state.maxHp, state.hp + 45); state.actionFx.push({ type: 'heal', x: state.x, y: state.y - 90, life: .7, value: 45 }); updateUI(); save(); return; }
    if (action === 'attack') { if (state.cooldowns.attack > 0) return; state.cooldowns.attack = .47; state.mp = Math.min(state.maxMp, state.mp + 8); const e = nearestEnemy(155); if (e) { state.facing = e.x >= state.x ? 1 : -1; damageEnemy(e, 22 + (state.level - 1) * 4); } else state.actionFx.push({ type: 'slash', x: state.x + state.facing * 82, y: state.y - 68, life: .35 }); updateUI(); return; }
    if (action === 'skill') { if (state.cooldowns.skill > 0) return; if (state.mp < 25) return toast('星能不足'); state.mp -= 25; state.cooldowns.skill = 3.1; const targets = state.enemies.filter(e => Math.hypot(e.x - state.x, e.y - state.y) < 250); state.actionFx.push({ type: 'star', x: state.x, y: state.y - 90, life: .7 }); targets.forEach(e => damageEnemy(e, 38 + (state.level - 1) * 5, true)); if (!targets.length) toast('技能范围内没有敌人'); updateUI(); return; }
    if (action === 'dash') { if (state.cooldowns.dash > 0) return; state.cooldowns.dash = 2.4; state.invuln = .45; state.actionFx.push({ type: 'dash', x: state.x, y: state.y - 45, life: .5 }); state.x = Math.max(95, Math.min(1105, state.x + state.facing * 115)); }
  }
  function nearby() {
    const choices = [];
    if (state.zone === 0) { choices.push({ x: 830, y: 440, label: '与知晴交谈', type: 'npc' }); choices.push({ x: 480, y: 420, label: '在星泉休息', type: 'shrine' }); choices.push({ x: 1070, y: 455, label: '前往碎星回廊', type: 'forward' }); }
    if (state.zone === 1) { choices.push({ x: 100, y: 455, label: '返回星穹庭院', type: 'back' }); choices.push({ x: 1080, y: 455, label: '前往终夜之门', type: 'forward' }); }
    if (state.zone === 2) choices.push({ x: 100, y: 455, label: '返回碎星回廊', type: 'back' });
    return choices.find(c => Math.hypot(c.x - state.x, c.y - state.y) < 100);
  }
  function interact() {
    const c = nearby(); if (!c) return toast('附近没有可交互的对象');
    if (c.type === 'npc') {
      if (state.boss && !state.complete) { lines('知晴 · 守灯人', 'chiharu', '你做到了！星光重新穿过云海。谢谢你，艾因。', () => { state.complete = true; journal('序章完成：星灯重燃。'); showEnding(); }); }
      else if (!state.spoken) { lines('知晴 · 守灯人', 'chiharu', '终夜之门的星灯熄灭了。请先净化回廊里的三处侵蚀，再去迎战执灯者。', () => { state.spoken = true; journal('知晴委托我找回失落的星灯。'); toast('新任务：净化碎星回廊'); }); }
      else lines('知晴 · 守灯人', 'chiharu', state.complete ? '星光会记得你。愿今后的旅途也有光相伴。' : '沿庭院右侧的门前进吧。受伤时可以回星泉恢复。');
    } else if (c.type === 'shrine') { state.hp = state.maxHp; state.mp = state.maxMp; state.actionFx.push({ type: 'heal', x: 480, y: 350, life: .8 }); updateUI(); save(); toast('星泉治愈了你'); }
    else if (c.type === 'back') moveZone(state.zone - 1, 995);
    else if (c.type === 'forward') { if (state.zone === 0 && !state.spoken) return toast('先与知晴交谈'); if (state.zone === 1 && state.kills.length < 3) return toast(`还需净化 ${3 - state.kills.length} 处侵蚀`); moveZone(state.zone + 1, 190); }
  }
  function showEnding() { $('overlay').classList.remove('hidden'); $('overlay').querySelector('.eyebrow').textContent = 'CHAPTER CLEAR'; $('overlay h1').innerHTML = '星灯<br><em>重燃</em>'; $('overlay p').textContent = '你净化了回廊，击败终夜执灯者，星光再次照亮天空。序章试玩完成，你仍可以自由探索。'; $('startBtn').textContent = '继续探索 →'; }
  function drawImage(key, x, y, width, height, alpha = 1) { const img = images[key]; if (!img || !img.complete || !img.naturalWidth) return; ctx.globalAlpha = alpha; ctx.drawImage(img, x, y, width, height); ctx.globalAlpha = 1; }
  function actor(key, x, y, size, label, isPlayer = false, hp = 0, maxHp = 1, hit = 0) {
    const bob = Math.sin(state.time * (isPlayer ? 3.1 : 2.3) + x * .01) * 3;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.fillStyle = '#050b24a0'; ctx.beginPath(); ctx.ellipse(0, -5, size * .30, size * .07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isPlayer ? '#b9d4ff44' : '#ee9cbb33'; ctx.beginPath(); ctx.ellipse(0, -6, size * .26, size * .055, 0, 0, Math.PI * 2); ctx.fill();
    if (isPlayer && state.invuln > 0) ctx.globalAlpha = .55 + .45 * Math.sin(state.time * 32);
    if (isPlayer && state.facing < 0) ctx.scale(-1, 1);
    drawImage(key, -size / 2, -size, size, size, hit > 0 ? .68 : ctx.globalAlpha);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.font = '600 13px "Noto Sans SC", sans-serif'; ctx.shadowColor = '#02051a'; ctx.shadowBlur = 8; ctx.fillStyle = '#fff'; ctx.fillText(label, x, y - size - 7); ctx.shadowBlur = 0;
    if (!isPlayer) { const w = Math.min(100, size * .67); ctx.fillStyle = '#151628'; ctx.fillRect(x - w / 2, y - size - 29, w, 5); ctx.fillStyle = hp / maxHp > .35 ? '#e37a91' : '#ffb06c'; ctx.fillRect(x - w / 2, y - size - 29, w * hp / maxHp, 5); }
  }
  function portal(x, y, label, locked = false) {
    const pulse = Math.sin(state.time * 3) * 6;
    ctx.save(); ctx.translate(x, y - 72); ctx.shadowColor = locked ? '#d7789c' : '#80dfff'; ctx.shadowBlur = 25 + pulse;
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 55); grad.addColorStop(0, locked ? '#d572a0aa' : '#b6ecffdc'); grad.addColorStop(.45, locked ? '#8c2c7988' : '#668ee5aa'); grad.addColorStop(1, '#4341a000'); ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(0, 0, 37, 66, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = locked ? '#e19cbe' : '#caeaff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 28 + pulse * .3, 52 + pulse * .3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore(); ctx.fillStyle = '#e5ebff'; ctx.font = '600 11px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#10152b'; ctx.shadowBlur = 8; ctx.fillText(label, x, y + 8); ctx.shadowBlur = 0;
  }
  function draw() {
    ctx.clearRect(0, 0, W, H); ctx.save(); if (state.shake > 0) ctx.translate((Math.random() - .5) * state.shake, (Math.random() - .5) * state.shake);
    drawImage(zones[state.zone].bg, 0, 0, W, H);
    const shade = ctx.createLinearGradient(0, 0, 0, H); shade.addColorStop(0, state.zone === 2 ? '#0b082922' : '#181d3e0d'); shade.addColorStop(1, state.zone === 2 ? '#09071890' : '#0b12345c'); ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
    if (state.zone === 0) { portal(1070, 455, '碎星回廊', !state.spoken); ctx.save(); ctx.translate(480, 395); ctx.shadowColor = '#89e9ff'; ctx.shadowBlur = 30; ctx.fillStyle = '#b9f0fff0'; ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(19, -8); ctx.lineTo(0, 23); ctx.lineTo(-19, -8); ctx.closePath(); ctx.fill(); ctx.restore(); ctx.fillStyle = '#eefcff'; ctx.font = '600 11px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('星泉', 480, 455); actor('chiharu', 830, 440, 165, '知晴 · 守灯人'); }
    if (state.zone === 1) { portal(100, 455, '星穹庭院'); portal(1080, 455, '终夜之门', state.kills.length < 3); }
    if (state.zone === 2) portal(100, 455, '碎星回廊');
    const actors = [...state.enemies.map(e => ({ y: e.y, draw: () => actor(e.image, e.x, e.y, e.boss ? 200 : 147, e.name, false, e.hp, e.maxHp, e.hitTimer) })), { y: state.y, draw: () => actor('ein', state.x, state.y, 155, '艾因', true) }];
    actors.sort((a, b) => a.y - b.y).forEach(a => a.draw());
    for (const fx of state.actionFx) { ctx.save(); ctx.globalAlpha = Math.min(1, fx.life * 2.3); if (fx.type === 'slash') drawImage('slash', fx.x - 55, fx.y - 48, 110, 95, ctx.globalAlpha); else if (fx.type === 'burst' || fx.type === 'star') drawImage('starfall', fx.x - 90, fx.y - 90, 180, 180, ctx.globalAlpha); else if (fx.type === 'heal') { ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#b7ffdf'; ctx.fillText(`+${fx.value || ''}`, fx.x, fx.y - (1 - fx.life) * 35); } else if (fx.type === 'dash') { ctx.strokeStyle = '#d3ddff'; ctx.lineWidth = 6; ctx.shadowColor = '#b4d7ff'; ctx.shadowBlur = 20; ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(state.x, state.y - 45); ctx.stroke(); } if (fx.value && fx.type !== 'heal') { ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#ffeac1'; ctx.textAlign = 'center'; ctx.shadowColor = '#231125'; ctx.shadowBlur = 8; ctx.fillText(`-${fx.value}`, fx.x, fx.y - 42 - (1 - fx.life) * 40); } ctx.restore(); }
    ctx.restore();
    const nearbyObject = state.started && !state.dialogue ? nearby() : null; const prompt = $('interactPrompt'); prompt.classList.toggle('hidden', !nearbyObject); if (nearbyObject) prompt.innerHTML = `按 <kbd>E</kbd> ${nearbyObject.label}`;
  }
  function update(dt) {
    state.time += dt; if (!state.started || state.dialogue || !$('overlay').classList.contains('hidden')) return;
    const vx = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0);
    const vy = (held.has('s') || held.has('arrowdown') ? 1 : 0) - (held.has('w') || held.has('arrowup') ? 1 : 0);
    if (vx || vy) { const scale = 205 * dt / Math.hypot(vx, vy); state.x = Math.max(86, Math.min(1115, state.x + vx * scale)); state.y = Math.max(322, Math.min(570, state.y + vy * scale)); if (vx) state.facing = Math.sign(vx); }
    for (const key of Object.keys(state.cooldowns)) state.cooldowns[key] = Math.max(0, state.cooldowns[key] - dt);
    state.invuln = Math.max(0, state.invuln - dt); state.shake = Math.max(0, state.shake - dt * 22); state.mp = Math.min(state.maxMp, state.mp + dt * 1.65);
    for (const enemy of state.enemies) {
      enemy.hitTimer = Math.max(0, enemy.hitTimer - dt); enemy.attackTimer = Math.max(0, enemy.attackTimer - dt); enemy.stun = Math.max(0, enemy.stun - dt);
      const dx = state.x - enemy.x, dy = state.y - enemy.y, distance = Math.hypot(dx, dy);
      if (enemy.stun <= 0 && distance < 430 && distance > 83) { enemy.x += dx / distance * enemy.speed * dt; enemy.y += dy / distance * enemy.speed * .65 * dt; }
      if (distance < 92 && enemy.attackTimer <= 0 && enemy.stun <= 0) { enemy.attackTimer = enemy.boss ? 1.5 : 1.8; if (state.invuln <= 0) { state.hp = Math.max(0, state.hp - enemy.damage); state.invuln = .55; state.shake = 7; state.actionFx.push({ type: 'slash', x: state.x, y: state.y - 80, life: .3 }); updateUI(); if (state.hp <= 0) { state.hp = Math.ceil(state.maxHp * .65); state.mp = state.maxMp; moveZone(0, 330); toast('被星泉救回庭院，生命已恢复'); journal('战斗失利，从星穹庭院重新出发。'); } } }
    }
    state.actionFx = state.actionFx.filter(fx => (fx.life -= dt) > 0);
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.add('hidden');
    state.saveTick += dt; if (state.saveTick > 4) { state.saveTick = 0; save(); updateUI(); }
  }
  function frame(t) { const dt = Math.min(.05, (t - lastTime) / 1000 || 0); lastTime = t; update(dt); draw(); requestAnimationFrame(frame); }
  function begin() { state.started = true; $('overlay').classList.add('hidden'); canvas.focus?.(); if (!state.spoken) toast('靠近知晴，按 E 交谈'); else toast(`继续任务：${quest()[0]}`); }
  function keydown(e) { const key = e.key.toLowerCase(); if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) e.preventDefault(); held.add(key); if (e.repeat) return; const actions = { j: 'attack', k: 'skill', l: 'dash', h: 'potion', e: 'interact', ' ': 'attack' }; if (actions[key]) perform(actions[key]); }
  document.addEventListener('keydown', keydown); document.addEventListener('keyup', e => held.delete(e.key.toLowerCase())); window.addEventListener('blur', () => held.clear());
  $('startBtn').addEventListener('click', begin); $('dialogue').addEventListener('click', closeDialogue);
  $('helpBtn').addEventListener('click', () => { if (state.dialogue) closeDialogue(); lines('冒险指南', 'ein', 'WASD / 方向键移动，E 交互，J 普攻，K 星辉斩，L 闪避，H 使用药剂。靠近目标再攻击。'); });
  document.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => perform(btn.dataset.action)));
  document.querySelectorAll('[data-move]').forEach(btn => { const key = { up: 'w', down: 's', left: 'a', right: 'd' }[btn.dataset.move]; btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture(e.pointerId); held.add(key); }); for (const type of ['pointerup','pointercancel','lostpointercapture']) btn.addEventListener(type, () => held.delete(key)); });
  canvas.addEventListener('click', e => { if (!state.started || state.dialogue) return; const bounds = canvas.getBoundingClientRect(); const x = (e.clientX - bounds.left) / bounds.width * W; const y = (e.clientY - bounds.top) / bounds.height * H; const target = nearby(); if (target && Math.hypot(target.x - x, target.y - y) < 85) interact(); else { const enemy = state.enemies.find(v => Math.hypot(v.x - x, v.y - y) < 90); if (enemy) perform('attack'); } });
  load(); makeEnemies(); updateUI(); requestAnimationFrame(frame);
})();
