/* Standalone presentation layer for the five single-player modes. */
(() => {
  'use strict';

  const MODES = [
    { id: 'expedition', label: '巡演企划', icon: '✦', tone: 'primary', badge: '推荐玩法', description: '完成三站巡演、收集应援纪念物并登上终场压轴舞台。' },
    { id: 'hunt', label: '首领狩猎', icon: '⚔', tone: 'secondary', description: '围绕首领机制调整阵容，完成限时狩猎。' },
    { id: 'puzzle', label: '战术解题', icon: '◇', tone: 'secondary', description: '在给定条件下寻找破局阵容与战术。' },
    { id: 'siege', label: '守城生存', icon: '⬡', tone: 'secondary', description: '抵挡连续攻势，守住城防并争取生存。' },
    { id: 'conquest', label: '战役征服', icon: '✧', tone: 'secondary', description: '四幕战役推图、防守补给线，攻克深渊主城。' },
  ];

  const byId = new Map(MODES.map((mode) => [mode.id, mode]));
  let handlers = {};
  let latest = { active: false, mode: 'expedition', state: {}, view: {}, saves: {} };
  let hubNode = null;
  let panelNode = null;
  let launcherNode = null;
  let hubCardsNode = null;
  let hubStatusNode = null;
  let hubTitleNode = null;
  let panelTitleNode = null;
  let panelModeNode = null;
  let panelSubtitleNode = null;
  let panelObjectiveNode = null;
  let panelEnemyNode = null;
  let panelEncounterNode = null;
  let panelOutcomeNode = null;
  let panelResourcesNode = null;
  let panelChoicesNode = null;
  let panelFightNode = null;
  let panelFightHelpNode = null;
  let panelCampMountNode = null;
  let campaignMapMounted = false;
  let campaignMapSignature = '';
  let fightPending = false;
  let fightStartedAt = 0;
  let fightSawBattle = false;
  let focusBeforeHub = null;
  const modeSelections = { hunt: 0, puzzle: 0, conquest: 0 };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function button(className, text, action, mode) {
    const element = node('button', className, text);
    element.type = 'button';
    element.dataset.action = action;
    if (mode) element.dataset.mode = mode;
    return element;
  }

  function modeId(value) {
    if (typeof value === 'string' && byId.has(value)) return value;
    return 'expedition';
  }

  function modeDefinition(mode) {
    const definitions = window.SoloModes && window.SoloModes.definitions;
    return Array.isArray(definitions) ? definitions.find((definition) => definition && definition.id === mode.id) : null;
  }

  function modeLabel(mode) {
    const definition = modeDefinition(mode);
    return String((definition && definition.name) || mode.label);
  }

  function modeDescription(mode) {
    const definition = modeDefinition(mode);
    return String((definition && definition.description) || mode.description);
  }

  function call(name, ...args) {
    const handler = handlers && handlers[name];
    if (typeof handler !== 'function') return undefined;
    try { return handler(...args); }
    catch (error) {
      if (window.console && typeof window.console.error === 'function') window.console.error(`[SoloUI] ${name} handler failed`, error);
      return undefined;
    }
  }

  function appendText(parent, tagName, className, value) {
    const element = node(tagName, className, value);
    parent.appendChild(element);
    return element;
  }

  function buildHub() {
    if (hubNode) return;
    const overlay = node('div', 'solo-hub');
    overlay.id = 'soloHub';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');

    const dialog = node('section', 'solo-hub-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'soloHubTitle');
    dialog.setAttribute('aria-describedby', 'soloHubIntro');

    const head = node('header', 'solo-hub-head');
    const titleBlock = node('div', 'solo-hub-title-block');
    appendText(titleBlock, 'p', 'solo-kicker', 'SOLO ADVENTURES · 单人冒险');
    hubTitleNode = appendText(titleBlock, 'h2', '', '选择你的挑战');
    hubTitleNode.tabIndex = -1;
    const close = button('solo-icon-button', '关闭', 'close-hub');
    close.setAttribute('aria-label', '关闭单人冒险大厅');
    close.title = '关闭';
    close.textContent = '×';
    head.append(titleBlock, close);

    const intro = appendText(dialog, 'p', 'solo-hub-intro', '每种玩法拥有独立进度与存档。继续可载入该模式的进度；重新开始会覆盖它。');
    intro.id = 'soloHubIntro';
    hubCardsNode = node('div', 'solo-hub-cards');
    hubCardsNode.id = 'soloHubCards';
    hubCardsNode.setAttribute('aria-label', '单人玩法');
    hubStatusNode = appendText(dialog, 'p', 'solo-hub-status', '');
    hubStatusNode.id = 'soloHubStatus';
    hubStatusNode.setAttribute('role', 'status');
    hubStatusNode.setAttribute('aria-live', 'polite');

    dialog.append(head, intro, hubCardsNode, hubStatusNode);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', onHubClick);
    overlay.addEventListener('change', onHubChange);
    overlay.addEventListener('keydown', onHubKeydown);
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) closeHub();
    });
    document.body.appendChild(overlay);
    hubNode = overlay;
  }

  function buildPanel() {
    if (panelNode) return;
    const panel = node('section', 'solo-panel');
    panel.id = 'soloPanel';
    panel.hidden = true;
    panel.setAttribute('aria-label', '单人冒险进度');
    panel.setAttribute('aria-live', 'polite');

    const identity = node('div', 'solo-panel-identity');
    panelModeNode = appendText(identity, 'p', 'solo-panel-mode', '单人冒险 · 巡演企划');
    panelTitleNode = appendText(identity, 'h2', 'solo-panel-title', '');
    panelSubtitleNode = appendText(identity, 'p', 'solo-panel-subtitle', '');

    panelCampMountNode = node('div', 'solo-camp-mount');
    panelCampMountNode.hidden = true;

    const details = node('div', 'solo-panel-details');
    panelOutcomeNode = appendText(details, 'p', 'solo-panel-outcome', '');
    panelOutcomeNode.hidden = true;
    panelObjectiveNode = appendText(details, 'p', 'solo-panel-objective', '');
    panelEnemyNode = appendText(details, 'p', 'solo-panel-enemy', '');
    panelEnemyNode.hidden = true;
    panelEncounterNode = appendText(details, 'p', 'solo-panel-encounter', '');
    panelEncounterNode.hidden = true;
    panelResourcesNode = appendText(details, 'p', 'solo-panel-resources', '');

    const actions = node('div', 'solo-panel-actions');
    panelChoicesNode = node('div', 'solo-panel-choices');
    panelChoicesNode.setAttribute('aria-label', '当前战术选择');
    const controls = node('div', 'solo-panel-controls');
    panelFightNode = button('solo-action-button solo-fight-button', '开启演出', 'fight');
    panelFightNode.setAttribute('aria-describedby', 'soloFightHelp');
    panelFightHelpNode = appendText(controls, 'span', 'solo-sr-only', '仅在演出准备完成后可开启演出。');
    panelFightHelpNode.id = 'soloFightHelp';
    const exit = button('solo-action-button solo-exit-button', '返回单人大厅', 'exit');
    const retry = button('solo-action-button solo-retry-button', '再战一次', 'retry');
    retry.hidden = true;
    controls.append(retry, panelFightNode, exit);
    actions.append(panelChoicesNode, controls);

    panel.append(identity, panelCampMountNode, details, actions);
    panel.addEventListener('click', onPanelClick);

    const main = document.getElementById('main');
    const topbar = document.getElementById('topbar');
    if (main && main.parentNode) main.parentNode.insertBefore(panel, main);
    else if (topbar && topbar.parentNode) topbar.parentNode.insertBefore(panel, topbar.nextSibling);
    else document.body.appendChild(panel);
    panelNode = panel;
  }

  function buildLauncher() {
    if (launcherNode) return;
    const homeNew = document.getElementById('homeNew');
    if (homeNew) {
      launcherNode = homeNew;
      launcherNode.setAttribute('aria-haspopup', 'dialog');
      launcherNode.setAttribute('aria-expanded', 'false');
      return;
    }
    launcherNode = button('solo-hub-launch', '单人冒险', 'open-hub');
    launcherNode.id = 'soloHubLaunch';
    launcherNode.setAttribute('aria-haspopup', 'dialog');
    launcherNode.setAttribute('aria-expanded', 'false');
    launcherNode.addEventListener('click', openHub);
    launcherNode.classList.add('solo-launch-fallback');
    document.body.appendChild(launcherNode);
  }

  function saveFor(mode) {
    const saves = latest.saves;
    if (!saves) return null;
    if (Array.isArray(saves)) {
      return saves.find((save) => save && (save.mode === mode || save.modeId === mode || save.id === mode)) || null;
    }
    if (typeof saves !== 'object') return null;
    const byMode = saves.byMode && typeof saves.byMode === 'object' ? saves.byMode : saves;
    const value = byMode[mode];
    if (value === true) return { exists: true };
    if (!value || value === false) return null;
    if (typeof value !== 'object') return { exists: true, summary: String(value) };
    if (value.exists === false || value.hasSave === false) return null;
    return value;
  }

  function hasSave(save) {
    return !!save && save.exists !== false && save.hasSave !== false;
  }

  function saveCanContinue(save) {
    return hasSave(save) && save.canContinue !== false && !save.expired && !save.finished;
  }

  function saveSummary(save) {
    if (!save) return '尚无存档';
    const summary = save.summary || save.description || save.label;
    if (summary) return String(summary);
    const parts = [];
    if (save.chapter !== undefined && save.chapter !== null) parts.push(`第 ${save.chapter} 章`);
    if (save.round !== undefined && save.round !== null) parts.push(`第 ${save.round} 回合`);
    if (save.stage !== undefined && save.stage !== null) parts.push(`阶段 ${save.stage}`);
    if (save.updatedAt) parts.push(`更新于 ${save.updatedAt}`);
    return parts.join(' · ') || (save.expired ? '存档已过期' : '已有独立存档');
  }

  function campaignClearedDifficulty() {
    let cleared = 0;
    try {
      const raw = window.localStorage ? window.localStorage.getItem('vc_campaign_meta') : null;
      if (raw) {
        const meta = JSON.parse(raw);
        const value = Number(meta && meta.maxClearedDifficulty);
        if (Number.isFinite(value)) cleared = Math.max(0, Math.min(3, Math.floor(value)));
      }
    } catch (error) {
      cleared = 0;
    }
    return cleared;
  }

  function campaignAllowedDifficulty() {
    return Math.min(3, campaignClearedDifficulty() + 1);
  }

  function addModeSelector(card, modeIdValue) {
    if (modeIdValue !== 'hunt' && modeIdValue !== 'puzzle' && modeIdValue !== 'conquest') return;
    if (modeIdValue === 'conquest') {
      const field = node('label', 'solo-mode-select-field');
      appendText(field, 'span', 'solo-mode-select-label', '战役难度');
      const select = node('select', 'solo-mode-select');
      select.dataset.modeOption = 'difficulty';
      select.dataset.mode = 'conquest';
      select.setAttribute('aria-label', '战役难度');
      const allowedIndex = campaignAllowedDifficulty() - 1;
      if (modeSelections.conquest > allowedIndex) modeSelections.conquest = allowedIndex;
      const choices = [['0', '难度 I · 普通'], ['1', '难度 II · 噩梦'], ['2', '难度 III · 地狱']];
      choices.forEach(([value, label], index) => {
        const locked = index > allowedIndex;
        const option = node('option', '', locked ? `${label}（需通关上一难度）` : label);
        option.value = value;
        option.disabled = locked;
        select.appendChild(option);
      });
      select.value = String(modeSelections.conquest || 0);
      field.appendChild(select);
      card.appendChild(field);
      return;
    }
    const field = node('label', 'solo-mode-select-field');
    const caption = modeIdValue === 'hunt' ? '狩猎目标' : '选择题目';
    appendText(field, 'span', 'solo-mode-select-label', caption);
    const select = node('select', 'solo-mode-select');
    select.dataset.modeOption = modeIdValue === 'hunt' ? 'bossIndex' : 'puzzleIndex';
    select.dataset.mode = modeIdValue;
    select.setAttribute('aria-label', caption);
    const choices = modeIdValue === 'hunt'
      ? [['0', '护盾守卫'], ['1', '蓄力术师'], ['2', '召唤领主']]
      : [['0', '题目 1'], ['1', '题目 2'], ['2', '题目 3']];
    for (const [value, label] of choices) {
      const option = node('option', '', label);
      option.value = value;
      select.appendChild(option);
    }
    select.value = String(modeSelections[modeIdValue] || 0);
    field.appendChild(select);
    card.appendChild(field);
  }

  function selectedStartOptions(mode) {
    if (mode === 'hunt') return { bossIndex: modeSelections.hunt };
    if (mode === 'puzzle') return { puzzleIndex: modeSelections.puzzle };
    if (mode === 'conquest') return { difficulty: modeSelections.conquest + 1 };
    return {};
  }

  function startMode(mode, confirmed) {
    const result = call('onStart', mode, !!confirmed, selectedStartOptions(mode));
    return finishHubAction(result);
  }

  function finishHubAction(result) {
    const rejected = () => {
      if (hubStatusNode) hubStatusNode.textContent = '操作未完成，大厅仍保持打开。请查看提示后重试。';
    };
    if (result && typeof result.then === 'function') {
      if (hubStatusNode) hubStatusNode.textContent = '正在载入…';
      result.then((accepted) => {
        if (accepted === false) rejected();
        else closeHub();
      }).catch(rejected);
    } else if (result === false) rejected();
    else closeHub();
    return result;
  }

  function renderHub() {
    if (!hubCardsNode) return;
    const active = document.activeElement;
    const focusKey = active && hubNode && hubNode.contains(active) ? active.dataset.focusKey : '';
    const fragment = document.createDocumentFragment();
    for (const mode of MODES) {
      const label = modeLabel(mode);
      const description = modeDescription(mode);
      const save = saveFor(mode.id);
      const exists = hasSave(save);
      const card = node('article', `solo-mode-card solo-mode-${mode.tone}`);
      card.dataset.mode = mode.id;
      const top = node('div', 'solo-mode-top');
      const icon = appendText(top, 'span', 'solo-mode-icon', mode.icon);
      icon.setAttribute('aria-hidden', 'true');
      const kindLabel = appendText(top, 'span', 'solo-mode-kind', mode.tone === 'primary' ? '主线推荐' : '挑战玩法');
      kindLabel.setAttribute('aria-hidden', 'true');
      card.appendChild(top);
      appendText(card, 'h3', 'solo-mode-title', label);
      appendText(card, 'p', 'solo-mode-description', description);
      addModeSelector(card, mode.id);
      const saveLine = appendText(card, 'p', `solo-save-summary${exists ? ' has-save' : ''}`, saveSummary(save));
      saveLine.setAttribute('role', 'status');
      const actions = node('div', 'solo-mode-actions');
      if (saveCanContinue(save)) {
        const continueButton = button('solo-action-button solo-continue-button', `继续${label}`, 'continue', mode.id);
        continueButton.dataset.focusKey = `${mode.id}-continue`;
        actions.appendChild(continueButton);
      }
      const startLabel = exists ? '重新开始 · 覆盖存档' : `开始${label}`;
      const start = button(`solo-action-button ${exists ? 'solo-restart-button' : 'solo-start-button'}`, startLabel, 'start', mode.id);
      start.dataset.focusKey = `${mode.id}-start`;
      actions.appendChild(start);
      card.appendChild(actions);

      if (exists) {
        const confirm = node('div', 'solo-restart-confirm');
        confirm.hidden = true;
        confirm.dataset.confirmMode = mode.id;
        confirm.setAttribute('role', 'group');
        confirm.setAttribute('aria-label', `确认覆盖${label}存档`);
        appendText(confirm, 'p', 'solo-confirm-copy', `重新开始${label}会覆盖此模式的现有存档。`);
        const confirmActions = node('div', 'solo-confirm-actions');
        const cancel = button('solo-action-button solo-cancel-button', '取消', 'cancel-restart', mode.id);
        cancel.dataset.focusKey = `${mode.id}-cancel`;
        const accept = button('solo-action-button solo-confirm-button', '确认重新开始', 'confirm-restart', mode.id);
        accept.dataset.focusKey = `${mode.id}-confirm`;
        confirmActions.append(cancel, accept);
        confirm.appendChild(confirmActions);
        card.appendChild(confirm);
      }
      fragment.appendChild(card);
    }
    hubCardsNode.replaceChildren(fragment);
    if (focusKey) {
      const next = hubCardsNode.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
      if (next) next.focus();
    }
  }

  function activateMode(mode, action, confirmed) {
    const result = confirmed === true ? call(action, mode, true) : call(action, mode);
    return finishHubAction(result);
  }

  function onHubChange(event) {
    const select = event.target;
    if (!select || !select.dataset || !select.dataset.modeOption) return;
    const mode = select.dataset.mode;
    if (mode !== 'hunt' && mode !== 'puzzle' && mode !== 'conquest') return;
    const index = Number(select.value);
    if (Number.isInteger(index) && index >= 0 && index <= 2) modeSelections[mode] = index;
  }

  function onHubClick(event) {
    const target = event.target.closest && event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const mode = target.dataset.mode;
    if (action === 'close-hub') {
      closeHub();
      return;
    }
    if (!byId.has(mode)) return;
    if (action === 'continue') {
      activateMode(mode, 'onContinue');
      return;
    }
    if (action === 'start') {
      const save = saveFor(mode);
      if (hasSave(save)) {
        const confirm = hubCardsNode.querySelector(`[data-confirm-mode="${CSS.escape(mode)}"]`);
        if (confirm) confirm.hidden = false;
        if (hubStatusNode) hubStatusNode.textContent = `请确认是否覆盖${modeLabel(byId.get(mode))}的现有存档。`;
        const accept = hubCardsNode.querySelector(`[data-action="confirm-restart"][data-mode="${CSS.escape(mode)}"]`);
        if (accept) accept.focus();
      } else startMode(mode, false);
      return;
    }
    if (action === 'cancel-restart') {
      const confirm = hubCardsNode.querySelector(`[data-confirm-mode="${CSS.escape(mode)}"]`);
      if (confirm) confirm.hidden = true;
      if (hubStatusNode) hubStatusNode.textContent = `${modeLabel(byId.get(mode))}的存档已保留。`;
      const start = hubCardsNode.querySelector(`[data-action="start"][data-mode="${CSS.escape(mode)}"]`);
      if (start) start.focus();
      return;
    }
    if (action === 'confirm-restart') {
      startMode(mode, true);
    }
  }

  function focusableInHub() {
    if (!hubNode) return [];
    return Array.from(hubNode.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.closest('[hidden]'));
  }

  function onHubKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHub();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = focusableInHub();
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (!focusables.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function describeValue(value) {
    if (value === undefined || value === null || value === false || value === '') return '';
    if (typeof value !== 'object') return String(value);
    return String(value.title || value.name || value.label || value.summary || value.description || value.text || '');
  }

  function currentPhase(data) {
    return String(data.phase || (data.state && data.state.phase) || (data.view && data.view.phase) || '').toLowerCase();
  }

  function updateFightState(data) {
    const view = data.view || {};
    const phase = currentPhase(data);
    const inBattle = phase === 'battle' || phase === 'fighting' || view.inBattle === true || view.fighting === true || view.pending === true;
    if (fightPending) {
      if (inBattle) fightSawBattle = true;
      if (view.canFight === false || view.finished || (fightSawBattle && !inBattle) || Date.now() - fightStartedAt > 16000) {
        fightPending = false;
        fightSawBattle = false;
      }
    }
    return inBattle;
  }

  function campaignMapSignatureOf(state, view) {
    const map = state.map || {};
    return JSON.stringify([
      state.phase, state.act, state.difficulty, state.hp, state.maxHp,
      state.supply, state.maxSupply, state.activeArmy, state.armies,
      state.telegraph, state.target, map.nodes, map.owned, map.cursor,
      view.choices, view.finished
    ]);
  }

  function syncCampaignMapMount() {
    if (!panelCampMountNode) return;
    const component = window.CampaignMap;
    const state = latest.state || {};
    const view = latest.view || {};
    /* 地图全幅上屏仅限战役地图两相；其余阶段回到紧凑面板，棋盘区恢复显示 */
    const mapPhase = state.phase === 'map' || state.phase === 'actClear';
    const show = !!latest.active
      && modeId(latest.mode) === 'conquest'
      && state.mode === 'conquest'
      && mapPhase
      && !!component
      && typeof component.render === 'function'
      && !view.finished;
    if (!show) {
      panelCampMountNode.hidden = true;
      document.body.classList.remove('solo-camp-map-open');
      if (campaignMapMounted && component && typeof component.destroy === 'function') component.destroy();
      campaignMapMounted = false;
      campaignMapSignature = '';
      return;
    }
    panelCampMountNode.hidden = false;
    const signature = campaignMapSignatureOf(state, view);
    if (!campaignMapMounted || signature !== campaignMapSignature) {
      component.render(panelCampMountNode, { state, view, onAction: (choiceId) => call('onAction', choiceId) });
      campaignMapSignature = signature;
    }
    campaignMapMounted = true;
    document.body.classList.add('solo-camp-map-open');
  }

  function renderPanel(inBattle) {
    if (!panelNode) return;
    const isActive = !!latest.active;
    panelNode.hidden = !isActive;
    panelNode.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    syncCampaignMapMount();
    if (!isActive) return;

    const mode = byId.get(modeId(latest.mode));
    const view = latest.view || {};
    const state = latest.state || {};
    const label = modeLabel(mode);
    const expedition = mode.id === 'expedition';
    panelModeNode.textContent = `单人冒险 · ${label}`;
    panelTitleNode.textContent = view.title || `${label}进行中`;
    panelSubtitleNode.textContent = view.subtitle || '';
    panelSubtitleNode.hidden = !panelSubtitleNode.textContent;
    panelObjectiveNode.textContent = view.objective ? `${expedition ? '巡演目标' : '目标'}：${describeValue(view.objective)}` : '';
    panelObjectiveNode.hidden = !panelObjectiveNode.textContent;

    const enemyHint = describeValue(view.enemyHint);
    panelEnemyNode.textContent = enemyHint ? `${expedition ? '舞台预告' : '敌情'}：${enemyHint}` : '';
    panelEnemyNode.hidden = !enemyHint;
    const encounter = describeValue(view.encounter);
    panelEncounterNode.textContent = encounter ? `${expedition ? '演出阵容' : '遭遇'}：${encounter}` : '';
    panelEncounterNode.hidden = !encounter;

    const outcome = describeValue(view.outcome);
    panelOutcomeNode.textContent = view.finished ? `${expedition ? '巡演结果' : '本段结果'}：${outcome || '已完成'}` : '';
    panelOutcomeNode.hidden = !view.finished;
    const hp = latest.hp !== undefined ? latest.hp : state.hp;
    const gold = latest.gold !== undefined ? latest.gold : state.gold;
    const resources = [];
    if (hp !== undefined && hp !== null) resources.push(`${expedition ? '演出体力' : '生命'} ${hp}`);
    if (gold !== undefined && gold !== null) resources.push(`金币 ${gold}`);
    panelResourcesNode.textContent = resources.join(' · ');
    panelResourcesNode.hidden = resources.length === 0;

    const choices = Array.isArray(view.choices) ? view.choices : [];
    panelChoicesNode.replaceChildren();
    if (!choices.length) {
      const empty = appendText(panelChoicesNode, 'span', 'solo-no-choices', view.finished ? '结果已记录' : '暂无额外选择');
      empty.setAttribute('aria-live', 'polite');
    } else {
      const fragment = document.createDocumentFragment();
      choices.forEach((choice, index) => {
        const safeChoice = choice || {};
        const label = describeValue(safeChoice.label || safeChoice.title || safeChoice.name || safeChoice.id || `选项 ${index + 1}`);
        const option = button('solo-choice-button', label, 'choice');
        option.dataset.index = String(index);
        option.disabled = !!safeChoice.disabled;
        option.setAttribute('aria-disabled', option.disabled ? 'true' : 'false');
        if (safeChoice.description) {
          const description = appendText(option, 'span', 'solo-choice-description', describeValue(safeChoice.description));
          const descriptionId = `soloChoiceDescription${index}`;
          description.id = descriptionId;
          option.setAttribute('aria-describedby', descriptionId);
        }
        fragment.appendChild(option);
      });
      panelChoicesNode.appendChild(fragment);
    }

    const canFight = !!view.canFight && !inBattle && !fightPending && !view.finished;
    const defenseBattle = mode.id === 'conquest' && typeof view.subtitle === 'string' && view.subtitle.includes('防守战');
    const buttonCopy = expedition
      ? { active: '演出进行中', pending: '正在准备演出…', ready: '开启演出', waiting: '等待舞台安排', title: '开启当前演出', disabledTitle: '当前阶段暂不可开启演出' }
      : { active: '战斗进行中', pending: '正在进入战斗…', ready: defenseBattle ? '开始防守战' : '开战', waiting: '等待遭遇', title: '开始当前遭遇战', disabledTitle: '当前阶段不可开战' };
    if (panelFightHelpNode) panelFightHelpNode.textContent = expedition ? '仅在演出准备完成后可开启演出。' : '仅在遭遇战准备完成后可开战。';
    panelFightNode.disabled = !canFight;
    panelFightNode.textContent = inBattle ? buttonCopy.active : fightPending ? buttonCopy.pending : view.finished ? '本段已结束' : view.canFight ? buttonCopy.ready : buttonCopy.waiting;
    panelFightNode.title = canFight ? buttonCopy.title : buttonCopy.disabledTitle;
    const retry = panelNode.querySelector('[data-action="retry"]');
    /* 战役终局重试走规则层 checkpoint:retry；面板「再战一次」是整局清档重开，对战役隐藏防误点覆盖存档 */
    if (retry) retry.hidden = !view.finished || typeof handlers.onRetry !== 'function' || mode.id === 'conquest';
  }

  function onPanelClick(event) {
    const target = event.target.closest && event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    if (action === 'choice') {
      const choices = Array.isArray(latest.view && latest.view.choices) ? latest.view.choices : [];
      const choice = choices[Number(target.dataset.index)];
      if (choice && !choice.disabled) call('onAction', choice.id);
      return;
    }
    if (action === 'fight') {
      const view = latest.view || {};
      const phase = currentPhase(latest);
      if (!view.canFight || view.finished || phase === 'battle' || fightPending) return;
      fightPending = true;
      fightSawBattle = false;
      fightStartedAt = Date.now();
      renderPanel(false);
      const result = call('onFight');
      if (result === false) {
        fightPending = false;
        renderPanel(false);
      } else if (result && typeof result.then === 'function') {
        result.then((value) => {
          if (value === false) fightPending = false;
          renderPanel(updateFightState(latest));
        }).catch(() => {
          fightPending = false;
          renderPanel(updateFightState(latest));
        });
      }
      return;
    }
    if (action === 'retry') {
      if (latest.view && latest.view.finished && typeof handlers.onRetry === 'function') call('onRetry', latest.mode);
      return;
    }
    if (action === 'exit') {
      const result = call('onExit');
      if (result && typeof result.then === 'function') {
        result.then((accepted) => {
          if (accepted === false) return;
          latest = { ...latest, active: false };
          renderPanel(false);
        }).catch(() => {});
      } else if (result !== false) {
        latest = { ...latest, active: false };
        renderPanel(false);
      }
    }
  }

  function mount(options) {
    handlers = options || {};
    buildHub();
    buildPanel();
    buildLauncher();
    renderHub();
    renderPanel(false);
    return window.SoloUI;
  }

  function render(data) {
    const next = data || {};
    latest = {
      ...latest,
      ...next,
      state: next.state || latest.state || {},
      view: next.view || latest.view || {},
      mode: modeId(next.mode || latest.mode),
    };
    if (next.handlers && typeof next.handlers === 'object') handlers = next.handlers;
    const inBattle = updateFightState(latest);
    renderPanel(inBattle);
    if (hubNode && !hubNode.hidden) renderHub();
    return window.SoloUI;
  }

  function openHub() {
    if (!hubNode) mount(handlers);
    focusBeforeHub = document.activeElement;
    hubStatusNode.textContent = '';
    renderHub();
    hubNode.hidden = false;
    hubNode.setAttribute('aria-hidden', 'false');
    document.body.classList.add('solo-hub-open');
    if (launcherNode) launcherNode.setAttribute('aria-expanded', 'true');
    const heading = hubTitleNode;
    if (heading) heading.focus();
  }

  function closeHub() {
    if (!hubNode || hubNode.hidden) return;
    hubNode.hidden = true;
    hubNode.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('solo-hub-open');
    if (launcherNode) launcherNode.setAttribute('aria-expanded', 'false');
    const target = focusBeforeHub && focusBeforeHub.isConnected ? focusBeforeHub : launcherNode;
    if (target && typeof target.focus === 'function') target.focus();
    focusBeforeHub = null;
  }

  window.SoloUI = { mount, render, openHub, closeHub };
})();
