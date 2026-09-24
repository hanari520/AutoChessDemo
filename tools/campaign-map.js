/* Campaign conquest v2 map renderer (presentation only).
 *
 * window.CampaignMap.render(container, { state, view, onAction })
 * window.CampaignMap.destroy()
 *
 * Presentation-only component: it never touches SoloHost/SoloUI or any game
 * global. Every user interaction is reported back through the injected
 * onAction(choiceId) callback. Each render() call is a full redraw (maps have
 * at most ~12 nodes, so no diffing is needed). All motion is pure CSS; no JS
 * timers. Rendering failures are contained: the previous map stays on screen.
 */
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  /* Simple stroke icons drawn in the game's existing 24x24 stroke-2 icon style. */
  const KIND_ICONS = {
    battle: '<path d="M13.5 4.5L20 11l-8 8-3-3zM6.5 17.5L4 20l1-3.5M16 8l-8 8"/>',
    elite: '<path d="M12 3a7 7 0 0 0-7 7c0 2.7 1.4 4.5 3 5.5V19h8v-3.5c1.6-1 3-2.8 3-5.5a7 7 0 0 0-7-7z"/><circle cx="9.3" cy="10.6" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10.6" r="1.3" fill="currentColor" stroke="none"/><path d="M10.4 19v2M13.6 19v2"/>',
    stronghold: '<path d="M6 21V4"/><path d="M6 5h11l-2.6 3.5L17 12H6"/>',
    treasure: '<rect x="4" y="10" width="16" height="9" rx="1.5"/><path d="M4 10c0-3.2 3.6-5 8-5s8 1.8 8 5"/><path d="M12 13.4v2.4"/><circle cx="12" cy="12.4" r="1" fill="currentColor" stroke="none"/>',
    shop: '<path d="M4 4h7.2l8.8 8.8-7.2 7.2L4 11.2z"/><circle cx="8.2" cy="8.2" r="1.3"/>',
    event: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1 .9-1 1.6M12 16.5h.01"/>',
    rest: '<path d="M12 4L3.5 20h17z"/><path d="M12 4l4 16"/>',
    boss: '<path d="M5 17.5L3.8 8.5 9 12.5l3-7 3 7 5.2-4L19 17.5z"/><path d="M5.5 20.5h13"/>'
  };
  const SHIELD_ICON = '<path d="M12 3.5l6.5 2.6v5.2c0 4.3-3 7-6.5 8.7-3.5-1.7-6.5-4.4-6.5-8.7V6.1z"/>';
  const KIND_LABELS = { battle: '战斗', elite: '精锐', stronghold: '据点', treasure: '秘宝', shop: '商铺', event: '奇遇', rest: '休整', boss: '首领' };
  /* Static display copy mirroring the conquest act table in the rules layer. */
  const ACT_NAMES = { 1: '破晓低地', 2: '灰烬隘口', 3: '静默王城', 4: '深渊主城' };
  const DIFF_LABELS = { 1: 'I', 2: 'II', 3: 'III' };

  let containerRef = null;
  let rootRef = null;

  function num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function logError(message, error) {
    if (typeof console !== 'undefined' && console && typeof console.error === 'function') console.error(message, error);
  }

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function iconHolder(markup, className, title) {
    const holder = el('span', className);
    holder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${markup}</svg>`;
    if (title) holder.title = title;
    return holder;
  }

  function kindOf(node) {
    const kind = node && typeof node.kind === 'string' ? node.kind : '';
    return Object.prototype.hasOwnProperty.call(KIND_ICONS, kind) ? kind : 'battle';
  }

  function normalize(payload) {
    const data = payload || {};
    const state = data.state && typeof data.state === 'object' ? data.state : {};
    const view = data.view && typeof data.view === 'object' ? data.view : {};
    const map = state.map && typeof state.map === 'object' ? state.map : {};
    const nodes = Array.isArray(map.nodes)
      ? map.nodes.filter((node) => node && typeof node === 'object' && typeof node.id === 'string' && node.id)
      : [];
    const choices = Array.isArray(view.choices)
      ? view.choices.filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id)
      : [];
    return {
      state, view, map, nodes, choices,
      onAction: typeof data.onAction === 'function' ? data.onAction : null
    };
  }

  function describeNodes(data) {
    const { state, map, nodes, choices } = data;
    const ownedSet = new Set((Array.isArray(map.owned) ? map.owned : []).map(String));
    const cursorList = Array.isArray(map.cursor) ? map.cursor.map(String) : null;
    const cursorSet = cursorList ? new Set(cursorList) : null;
    const telegraph = state.telegraph && typeof state.telegraph === 'object' ? state.telegraph : null;
    const armies = Array.isArray(state.armies) ? state.armies : [];
    const activeArmy = armies.length ? (armies[num(state.activeArmy, 0)] || armies[0]) : null;
    const currentNodeId = activeArmy && activeArmy.node ? String(activeArmy.node) : null;
    const findChoice = (id) => choices.find((entry) => entry.id === id) || null;

    return nodes.map((node, index) => {
      const id = String(node.id);
      const attack = findChoice(`attack:${id}`);
      const move = findChoice(`move:${id}`);
      const cleared = ownedSet.has(id) || node.cleared === true;
      const garrisoned = node.garrison === true || armies.some((army) => army && army.node === node.id);
      const threatened = !!(telegraph && String(telegraph.node) === id);
      const attackable = !!attack && !attack.disabled && (!cursorSet || cursorSet.has(id));
      const movable = !!move && !move.disabled && cleared;
      const current = currentNodeId === id;
      return {
        node, id, index, attack, move, cleared, garrisoned, threatened, attackable, movable, current,
        countdown: threatened ? Math.max(0, Math.floor(num(telegraph.countdown, 0))) : null,
        locked: !attackable && !cleared
      };
    });
  }

  function buildHud(data) {
    const state = data.state;
    const act = num(state.act, 1);
    const actName = ACT_NAMES[act] ? `·${ACT_NAMES[act]}` : '';
    const difficulty = DIFF_LABELS[state.difficulty] || num(state.difficulty, 1);
    const hp = num(state.hp, 0);
    const maxHp = num(state.maxHp, 0);
    const supply = num(state.supply, 0);
    const maxSupply = num(state.maxSupply, 0);
    const armyCount = Array.isArray(state.armies) ? state.armies.length : 0;

    const hud = el('p', 'solo-camp-hud');
    const hpItem = el('span', 'solo-camp-hud-item', `本营 ${hp}/${maxHp}`);
    if (maxHp > 0 && hp <= maxHp * 0.34) hpItem.classList.add('solo-camp-hud-hp-low');
    const items = [
      el('span', 'solo-camp-hud-item', `第${act}幕${actName}`),
      el('span', 'solo-camp-hud-item', `难度${difficulty}`),
      hpItem,
      el('span', 'solo-camp-hud-item', `补给 ${supply}/${maxSupply}`),
      el('span', 'solo-camp-hud-item', `军队 ${armyCount}/3`)
    ];
    items.forEach((item, index) => {
      if (index) hud.appendChild(el('span', 'solo-camp-hud-sep', '·'));
      hud.appendChild(item);
    });
    return hud;
  }

  function buildLinks(infos) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'solo-camp-links');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const byId = new Map(infos.map((info) => [info.id, info]));
    infos.forEach((info) => {
      const links = Array.isArray(info.node.links) ? info.node.links : [];
      const x1 = clamp(num(info.node.x, 50), 0, 100);
      const y1 = clamp(num(info.node.y, 50), 0, 100);
      links.forEach((targetId) => {
        const target = byId.get(String(targetId));
        if (!target) return;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(clamp(num(target.node.x, 50), 0, 100)));
        line.setAttribute('y2', String(clamp(num(target.node.y, 50), 0, 100)));
        line.setAttribute('class', info.cleared ? 'solo-camp-link-on' : 'solo-camp-link-off');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(line);
      });
    });
    return svg;
  }

  function runAction(data, choiceId) {
    if (!data.onAction) return;
    try { data.onAction(choiceId); }
    catch (error) { logError('[CampaignMap] onAction failed', error); }
  }

  function activateNode(info, data) {
    if (info.attack && !info.attack.disabled) {
      runAction(data, `attack:${info.id}`);
      return;
    }
    if (info.movable) runAction(data, `move:${info.id}`);
  }

  function buildNode(info, data) {
    const node = info.node;
    const kind = kindOf(node);
    const classes = ['solo-camp-node', `solo-camp-kind-${kind}`];
    if (info.attackable) classes.push('solo-camp-attackable');
    if (info.cleared) classes.push('solo-camp-cleared');
    if (info.threatened) classes.push('solo-camp-threatened');
    if (info.garrisoned) classes.push('solo-camp-garrisoned');
    if (info.movable) classes.push('solo-camp-movable');
    if (info.current) classes.push('solo-camp-current');
    if (info.locked) classes.push('solo-camp-locked');

    const button = el('button', classes.join(' '));
    button.type = 'button';
    button.dataset.campKey = info.id;
    button.style.left = `${clamp(num(node.x, 50), 0, 100)}%`;
    button.style.top = `${clamp(num(node.y, 50), 0, 100)}%`;

    const name = node.name || KIND_LABELS[kind] || '节点';
    const statusText = info.attackable ? '可攻打'
      : info.threatened ? `遇袭预警，${info.countdown === null ? 0 : info.countdown} 回合后`
      : info.cleared ? (info.movable ? '已占领，可移防' : '已占领')
      : '未探明';
    button.setAttribute('aria-label', `${name}（${KIND_LABELS[kind] || '节点'} · ${statusText}）`);
    if (!info.attackable && !info.movable) { button.disabled = true; button.setAttribute('aria-disabled', 'true'); }
    let title = '';
    if (info.attack) title = `${info.attack.label || '攻打'}${info.attack.disabled ? '（暂不可用）' : ''}：${info.attack.description || ''}`;
    else if (info.movable) title = `${info.move.label || '移防'}：${info.move.description || ''}`;
    if (title && title.slice(-1) !== '：') button.title = title;

    button.appendChild(el('span', 'solo-camp-node-dot'));
    button.appendChild(iconHolder(KIND_ICONS[kind], 'solo-camp-node-icon'));
    button.appendChild(el('span', 'solo-camp-node-name', name));
    if (info.garrisoned) button.appendChild(iconHolder(SHIELD_ICON, 'solo-camp-node-garrison', '有军队驻防'));
    if (info.threatened) {
      button.appendChild(el('span', 'solo-camp-node-countdown', String(info.countdown === null ? 0 : info.countdown)));
    }
    button.addEventListener('click', () => activateNode(info, data));
    return button;
  }

  function buildBoard(data, infos) {
    const board = el('div', 'solo-camp-board');
    board.setAttribute('role', 'group');
    board.setAttribute('aria-label', '战役地图节点');

    const act = num(data.state.act, 1);
    if (act >= 1 && act <= 4) {
      const backdrop = el('div', 'solo-camp-board-bg');
      /* document.baseURI 基准：Chromium 会把内联自定义属性里的相对 url() 按样式表基址解析成 tools/… */
      backdrop.style.setProperty('--camp-act-img', `url("${new URL(`assets/campaign/act${act}.webp`, document.baseURI).href}")`);
      board.appendChild(backdrop);
    }
    if (data.state.phase === 'actClear') {
      /* 幕攻克时刻：Boss 立绘角卡（图片缺失自动移除，不影响布局） */
      const card = el('div', 'solo-camp-boss-card');
      const img = el('img', 'solo-camp-boss-img');
      img.src = new URL(`assets/campaign/boss${Math.max(1, Math.min(4, act))}.webp`, document.baseURI).href;
      img.alt = '';
      img.onerror = () => img.remove();
      card.appendChild(img);
      card.appendChild(el('p', 'solo-camp-boss-title', `第${act}幕攻克`));
      board.appendChild(card);
    }
    board.appendChild(buildLinks(infos));

    if (!infos.length) {
      board.appendChild(el('p', 'solo-camp-empty', '暂无战役地图数据'));
      return board;
    }

    const byLayer = new Map();
    infos.forEach((info) => {
      const layer = num(info.node.layer, 0);
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer).push(info);
    });
    Array.from(byLayer.keys()).sort((a, b) => a - b).forEach((layer) => {
      const group = byLayer.get(layer);
      const isBossLayer = group.some((info) => kindOf(info.node) === 'boss');
      board.appendChild(el('div', 'solo-camp-layer-label', isBossLayer ? `首领 · 第 ${layer + 1} 层` : `第 ${layer + 1} 层`));
      group.forEach((info) => board.appendChild(buildNode(info, data)));
    });
    return board;
  }

  function render(container, payload) {
    try {
      if (typeof document === 'undefined' || !container || typeof container.appendChild !== 'function') return;
      const data = normalize(payload);
      const infos = describeNodes(data);

      const active = document.activeElement;
      const focusKey = active && rootRef && rootRef.contains(active) && active.dataset ? active.dataset.campKey || null : null;

      const root = el('div', 'solo-camp-root');
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', '战役征服地图');
      root.appendChild(buildHud(data));
      root.appendChild(buildBoard(data, infos));

      if (rootRef && rootRef.parentNode) rootRef.parentNode.removeChild(rootRef);
      container.appendChild(root);
      containerRef = container;
      rootRef = root;

      if (focusKey) {
        const safeKey = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(focusKey) : focusKey.replace(/"/g, '');
        const next = root.querySelector(`[data-camp-key="${safeKey}"]`);
        if (next && typeof next.focus === 'function') next.focus({ preventScroll: true });
      }
    } catch (error) {
      /* Keep the previous map on screen; never propagate into the game loop. */
      logError('[CampaignMap] render failed', error);
    }
  }

  function destroy() {
    try {
      const focusNow = document.activeElement;
      if (rootRef && focusNow && rootRef.contains(focusNow)) {
        const title = document.querySelector('#soloPanel .solo-panel-title');
        if (title) { title.setAttribute('tabindex', '-1'); title.focus(); }   // 焦点归还面板标题，键盘用户不从 body 重摸
      }
      if (rootRef && rootRef.parentNode) rootRef.parentNode.removeChild(rootRef);
    } catch (error) {
      logError('[CampaignMap] destroy failed', error);
    }
    containerRef = null;
    rootRef = null;
  }

  window.CampaignMap = { render, destroy };
})();
