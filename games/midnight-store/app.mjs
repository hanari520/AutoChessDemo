import { createGame, createReplay, getEnding, getScene, previewRecommendation, reduceGame, STOCK_CAPACITY, STOCK_TYPE_CAPACITY, validateState } from './core.mjs';
import { CUSTOMERS, ENDINGS, PRODUCTS, TAG_LABELS } from './content.mjs';
import { createStorage, DEFAULT_SUPPORTED_VERSIONS } from '../../library/storage.mjs';
import { createSaveExport, exportSave, importSave, parseSaveImport } from '../../library/save-transfer.mjs';
import { listCollectibles, recordCompletion } from '../../library/collectibles.mjs';

const GAME = 'midnight-store';
const SLOT = 'main';
const RULES_VERSION = '1';
const SAVE_VERSIONS = DEFAULT_SUPPORTED_VERSIONS;
const storage = createStorage({
  supportedVersions: SAVE_VERSIONS,
  payloadValidators: {
    [GAME]: (payload) => validateState(payload) === true && payload?.replay === false,
  },
});
const { loadSave, saveGame } = storage;

const app = document.querySelector('#app');
const saveStatus = document.querySelector('#save-status');
const statusWrap = document.querySelector('.top-status');
const saveButton = document.querySelector('#save');
const exportButton = document.querySelector('#export');
const exportOriginalButton = document.querySelector('#export-original');
const importInput = document.querySelector('#import');
const fontSmaller = document.querySelector('#font-smaller');
const fontLarger = document.querySelector('#font-larger');
const noticeBox = document.querySelector('#notice');

let state = null;
let savedEnvelope = null;
let revision = 0;
let recoveryId = null;
let invalidSave = false;
let replaceInvalidConfirmed = false;
let storageUnavailable = false;
let conflict = false;
let busy = true;
let view = 'game';
let replayState = null;
let collectibles = [];
let awardMessage = '';
let noticeTimer;
let sceneWasRead = new Set();
let collapsedScenes = new Set();

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const activeState = () => replayState ?? state;
const isReplay = () => Boolean(replayState);
const validState = (candidate) => validateState(candidate) === true;
const validSaveState = (candidate) => validState(candidate) && candidate.replay === false;
const actionId = () => globalThis.crypto?.randomUUID?.() ?? `store-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const productById = (id) => PRODUCTS.find((product) => product.id === id);
const customerById = (id) => CUSTOMERS.find((customer) => customer.id === id);
const portraitByCustomer = (customer) => ({
  suiji: '../../assets/game-library/midnight-store/suiji-v1.webp',
  kanban: '../../assets/game-library/midnight-store/kanban-v1.webp',
}[customer?.id] ?? customer?.portrait ?? '');

function setStatus(message, warning = false) {
  saveStatus.textContent = message;
  statusWrap.classList.toggle('warning', warning);
}

function notice(message, error = false) {
  noticeBox.textContent = message;
  noticeBox.classList.toggle('error', error);
  noticeBox.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { noticeBox.hidden = true; }, 7000);
}

function updateTopControls() {
  const locked = busy || conflict;
  saveButton.disabled = locked || !state || isReplay();
  exportButton.disabled = busy || (!state && !invalidSave && !savedEnvelope);
  exportOriginalButton.hidden = !invalidSave;
  exportOriginalButton.disabled = busy;
  importInput.disabled = locked;
  fontSmaller.disabled = locked;
  fontLarger.disabled = locked;
  const importLabel = document.querySelector('label[for="import"]');
  if (importLabel) {
    importLabel.setAttribute('aria-disabled', String(locked));
    importLabel.tabIndex = locked ? -1 : 0;
    importLabel.classList.toggle('disabled', locked);
  }
}

function loadingRender() {
  app.innerHTML = '<section class="loading-card" aria-live="polite"><span class="loading-star" aria-hidden="true">✦</span><p>把门口的灯打开，马上就好。</p></section>';
  updateTopControls();
}

function getFontScale() {
  try {
    const saved = Number(localStorage.getItem('vtlib:midnight-store:font-scale'));
    if (Number.isFinite(saved)) return Math.min(1.2, Math.max(.9, saved));
  } catch { /* Storage preferences are optional. */ }
  return 1;
}

function setFontScale(value) {
  const scale = Math.min(1.2, Math.max(.9, Math.round(value * 100) / 100));
  document.documentElement.style.setProperty('--font-scale', String(scale));
  try { localStorage.setItem('vtlib:midnight-store:font-scale', String(scale)); } catch { /* Page remains usable without preference storage. */ }
}

function loadReadScenes() {
  try {
    const value = JSON.parse(localStorage.getItem('vtlib:midnight-store:read-scenes') ?? '[]');
    if (Array.isArray(value)) sceneWasRead = new Set(value.filter((item) => typeof item === 'string').slice(-180));
  } catch { sceneWasRead = new Set(); }
}

function storeReadScenes() {
  try { localStorage.setItem('vtlib:midnight-store:read-scenes', JSON.stringify([...sceneWasRead].slice(-180))); } catch { /* Read-skip is an optional convenience. */ }
}

function currentSceneKey(gameState, scene) {
  return `${gameState?.runId ?? 'unknown'}:${scene?.id ?? `n${gameState?.night}-s${gameState?.slot}`}`;
}

function displayValue(value, dictionary = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value);
  if (dictionary[key] !== undefined) return dictionary[key];
  if (typeof value === 'number') return `${value}`;
  return key;
}

const temperatureNames = { hot: '热', warm: '温热', cold: '冷', room: '常温', chilled: '冷藏', frozen: '冷冻' };
const tasteNames = { sweet: '甜味', savory: '咸鲜', sour: '酸味', tangy: '酸味', bitter: '苦味', plain: '清淡', spicy: '微辣', creamy: '奶香', floral: '花香', salty: '咸味' };
const boostNames = { 0: '不提神', 1: '温和提神', 2: '强提神', none: '不提神', gentle: '温和提神', mild: '温和提神', medium: '适度提神', strong: '强提神', high: '强提神' };
const flagNames = { listen: '你认真听完了她的话', preference: '你记住了她的口味偏好', promise: '你兑现了那句约定' };

function tagList(product) {
  const labels = [
    displayValue(product.temperature, TAG_LABELS.temperature ?? temperatureNames),
    displayValue(product.taste, TAG_LABELS.taste ?? tasteNames),
    displayValue(product.boost, TAG_LABELS.boost ?? boostNames),
    displayValue(product.storage, TAG_LABELS.storage ?? {}),
  ];
  return labels.map((label) => `<span class="tag">${esc(label)}</span>`).join('');
}

function inventoryCount(gameState, productId) {
  const item = gameState?.inventory?.[productId];
  if (typeof item === 'number') return Math.max(0, item);
  if (Array.isArray(item)) return item.length;
  if (item && typeof item === 'object' && Number.isFinite(item.quantity)) return Math.max(0, item.quantity);
  return 0;
}

function distinctStockTypes(gameState) {
  return PRODUCTS.filter((product) => inventoryCount(gameState, product.id) > 0).length;
}

function sceneTextLines(scene) {
  const lines = [];
  if (typeof scene?.text === 'string' && scene.text.trim()) lines.push(scene.text);
  if (Array.isArray(scene?.contextLines)) lines.push(...scene.contextLines.filter((line) => typeof line === 'string' && line.trim()));
  else if (typeof scene?.contextText === 'string' && scene.contextText.trim()) lines.push(scene.contextText);
  if (!lines.length && typeof scene?.dialogue === 'string') lines.push(scene.dialogue);
  return [...new Set(lines)];
}

function sceneClues(scene) {
  if (Array.isArray(scene?.clue)) return scene.clue.filter(Boolean);
  if (typeof scene?.clue === 'string' && scene.clue.trim()) return [scene.clue];
  if (Array.isArray(scene?.wanted)) return scene.wanted.filter(Boolean);
  if (typeof scene?.wanted === 'string' && scene.wanted.trim()) return [scene.wanted];
  if (scene?.wanted && typeof scene.wanted === 'object') {
    const wanted = scene.wanted;
    return [
      wanted.temperature ? `温度：${displayValue(wanted.temperature, temperatureNames)}` : '',
      wanted.taste ? `口味：${displayValue(wanted.taste, tasteNames)}` : '',
      wanted.boost !== undefined ? `提神：${displayValue(wanted.boost, boostNames)}` : '',
    ].filter(Boolean);
  }
  return [];
}

function scenePanel(gameState, scene) {
  const character = customerById(scene?.customerId);
  const key = currentSceneKey(gameState, scene);
  const seenBefore = sceneWasRead.has(key);
  const collapsed = collapsedScenes.has(key);
  const lines = sceneTextLines(scene);
  const clueItems = sceneClues(scene);
  if (!seenBefore) {
    sceneWasRead.add(key);
    storeReadScenes();
  }
  const portrait = portraitByCustomer(character);
  const fallbackName = character?.name?.trim()?.[0] ?? '✦';
  return `<div class="night-scene">
    <section class="panel scene-copy" aria-label="来客对话">
      <span class="eyebrow">第 ${esc(gameState.night)} 夜 · 第 ${esc(Number(gameState.slot) + 1)} 位来客</span>
      <h2>${esc(scene?.title ?? character?.name ?? scene?.customerName ?? '夜里的客人')}</h2>
      <div class="story-text ${collapsed ? 'is-hidden' : ''}">${lines.map((line) => `<p>${esc(line)}</p>`).join('') || '<p>夜风掠过门口的风铃，她稍稍停了一下。</p>'}</div>
      ${seenBefore ? `<button class="read-control" type="button" data-action="toggle-read" data-id="${esc(key)}">${collapsed ? '展开已读正文' : '收起已读正文'}</button>` : ''}
      ${clueItems.length ? `<div class="clue-box"><strong>她已经说出的线索</strong><ul class="clue-list">${clueItems.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></div>` : ''}
    </section>
    <aside class="panel customer-card" aria-label="来客资料">
      <span class="portrait-wrap">${portrait ? `<img src="${esc(portrait)}" alt="${esc(character?.name ?? '来客')}" loading="lazy" data-fallback="${esc(fallbackName)}">` : `<span class="portrait-fallback" aria-hidden="true">${esc(fallbackName)}</span>`}</span>
      <div><span class="eyebrow">今晚的来客</span><h3>${esc(character?.name ?? scene?.customerName ?? '来客')}</h3><p>${esc(character?.description ?? '下班后路过店里的熟面孔。')}</p></div>
    </aside>
  </div>`;
}

function heroArt(label = '雨夜里的便利店') {
  const sampleCustomer = customerById('suiji');
  const portrait = portraitByCustomer(sampleCustomer);
  return `<div class="hero-art" role="img" aria-label="${esc(label)}"><div class="hero-window"></div><span class="hero-moon"></span><div class="hero-city"></div><div class="hero-awning"></div><div class="hero-counter"></div><img class="hero-portrait" src="${esc(portrait)}" alt="${esc(sampleCustomer?.name ?? '岁己')}" data-fallback="${esc(sampleCustomer?.name?.[0] ?? '岁')}" loading="eager"><span class="hero-sign">MIDNIGHT · OPEN</span></div>`;
}

function warningBanner() {
  if (conflict) return `<div class="warning-box" role="alert">另一标签页已经更新了这份档案。为了避免覆盖较新的进度，本页暂时锁定经营操作；请先导出当前内存进度，再重新读取档案。<div class="actions-row"><button type="button" data-action="reload" class="soft-action">重新读取进度</button></div></div>`;
  if (invalidSave) return `<div class="warning-box" role="alert">发现损坏或本游戏暂不支持的旧档。原始档案已隔离保留；开始新故事或导入前，请先导出原档备份。有效档案导入后会明确替换隔离档案。</div>`;
  if (storageUnavailable) return `<div class="warning-box" role="status">本机存储暂不可用。当前页面仍可继续经营，也可以导出内存中的进度；未成功保存前不会登记纪念物。</div>`;
  return '';
}

function introPage() {
  const canResume = Boolean(state);
  return `<section class="welcome-card">
    ${warningBanner()}
    <div class="welcome-copy">
      <div>
        <span class="eyebrow">✦ 小小的夜班，长长的故事</span>
        <h1>下播之后，<br>还有一盏灯为你亮着。</h1>
        <p>照看一家雨夜便利店，迎接岁己与栞栞，也听她们聊聊街坊的日常。再从已经听见的线索里挑一份合适的夜宵。七个夜晚，二十一次相遇；不赶时间，也没有错过全部故事的选项。</p>
        <div class="welcome-start">
          ${canResume ? `<button class="primary" type="button" data-action="resume">继续第 ${esc(state.night)} 夜</button>` : `<button class="primary" type="button" data-action="start">${invalidSave ? '确认后开始新故事' : '打开便利店 · 开始七夜故事'}</button>`}
          ${canResume ? '<button class="soft-action" type="button" data-action="album">打开故事相册</button>' : ''}
          <a class="soft-action" href="../../index.html">返回星夜游戏馆</a>
        </div>
        <p class="storage-note">每晚三个来客时段。每种商品进货价、售价、口味、温度和保质说明都会提前标出；热水与倾听始终免费。</p>
      </div>
      ${heroArt('雨夜便利店的温暖柜台')}
    </div>
    <details class="quick-rules"><summary>店长便签 · 看看今晚怎么经营</summary><p>开店前补充最多三种商品，每种最多四份；鲜食会在夜末作废，包装食品可以留到下一晚。推荐前会显示商品标签和与线索的贴合理由。即使推荐不合适，或一件商品都没备，也能继续三段故事并完成七夜。倾听、记住口味和兑现约定会影响具体回访，不会显示抽象好感值。</p></details>
  </section>`;
}

function gameHeader(gameState) {
  const phaseText = ({ stock: '开店备货', recommend: '挑选一份夜宵', reply: '听她把话说完', receipt: '本次收款与回音', 'night-end': '打烊记账', complete: '故事落幕' })[gameState.phase] ?? '今晚营业中';
  return `<header class="game-head"><div><span class="eyebrow">✦ 第 ${esc(gameState.night)} 夜 · ${esc(phaseText)}</span><h1>${gameState.phase === 'complete' ? '谢谢你陪她们走过这七夜。' : `把今晚的灯，留给${esc(gameState.phase === 'stock' ? '下一位来客' : '这位来客')}。`}</h1><p>${gameState.phase === 'stock' ? '看好每件商品的价格与保质说明，备货后随时开门。' : '柜台的热水和一把椅子，一直都在。'}</p></div><div class="stats"><div class="stat"><small>手边资金</small><strong>${esc(gameState.funds)}</strong></div><div class="stat"><small>夜次</small><strong>${esc(gameState.night)} <small style="display:inline">/ 7</small></strong></div><div class="stat"><small>今晚来客</small><strong>${esc(Math.min(3, Number(gameState.slot) + 1))} <small style="display:inline">/ 3</small></strong></div></div></header>
    <nav class="game-nav" aria-label="便利店面板"><button type="button" data-action="counter" class="${view === 'game' ? 'active' : ''}" aria-pressed="${view === 'game'}">回到柜台</button><button type="button" data-action="album" class="${view === 'album' ? 'active' : ''}" aria-pressed="${view === 'album'}">故事相册</button></nav>`;
}

function productCard(product, gameState, { stock = false, selected = false, preview = null } = {}) {
  const count = inventoryCount(gameState, product.id);
  const maxTypes = distinctStockTypes(gameState) >= STOCK_TYPE_CAPACITY && count === 0;
  const canBuy = count < STOCK_CAPACITY && !maxTypes && gameState.funds >= product.cost;
  const isPerishable = Boolean(product.perishable);
  const reasonLines = Array.isArray(preview?.reasons) ? preview.reasons.map(reasonText).filter(Boolean) : [];
  const matchText = Number(preview?.match) === 3 ? '三个标签都很贴合' : Number(preview?.match) > 0 ? '有些标签和线索贴合' : preview?.ok === false ? '当前不能推荐这件商品' : '这份推荐没有对上线索';
  const verdictClass = Number(preview?.match) === 3 ? 'good' : Number(preview?.match) > 0 ? 'mixed' : 'soft';
  const previewMessage = preview?.message ? `<p>${esc(preview.message)}</p>` : '';
  const previewReasons = reasonLines.length ? `<p>${reasonLines.map(esc).join(' · ')}</p>` : '';
  const income = Number.isFinite(preview?.income) ? `<p>预计入账 ${esc(preview.income)}</p>` : '';
  return `<article class="product-card ${selected ? 'selected' : ''}">
    <div class="product-top"><span class="product-icon" aria-hidden="true">${esc(product.icon ?? '✦')}</span><div class="product-name"><strong>${esc(product.name)}</strong><small>${stock ? `货架剩余 ${count} 份` : count > 0 ? `库存 ${count} 份` : '当前缺货'}</small></div></div>
    <p class="product-desc">${esc(product.description)}</p>
    <div class="product-tags">${tagList(product)}</div>
    <div class="product-meta"><span>进价 <strong>${esc(product.cost)}</strong></span><span>售价 <strong>${esc(product.price)}</strong></span></div>
    <div class="expiry">${isPerishable ? '鲜食 · 夜末作废' : '包装食品 · 可留到下一夜'}</div>
    ${preview ? `<div class="recommend-preview ${verdictClass}"><strong>${esc(matchText)}</strong>${previewMessage}${previewReasons}${income}</div>` : ''}
    ${stock ? `<div class="product-actions"><button type="button" data-action="buy" data-id="${esc(product.id)}" ${!canBuy ? 'disabled' : ''}>补货 +1</button><button type="button" data-action="return" data-id="${esc(product.id)}" ${count <= 0 ? 'disabled' : ''}>退回 −1</button></div>` : `<div class="product-actions"><button class="primary" type="button" data-action="recommend" data-id="${esc(product.id)}" ${count <= 0 ? 'disabled' : ''}>${count > 0 ? '推荐这份' : '暂时缺货'}</button><span class="quantity" aria-label="剩余数量">${esc(count)}</span></div>`}
    ${stock && count >= STOCK_CAPACITY ? `<small>每种最多备 ${STOCK_CAPACITY} 份</small>` : ''}${stock && maxTypes ? `<small>同时最多备 ${STOCK_TYPE_CAPACITY} 种；退回某种最后一份后可更换商品</small>` : ''}${stock && gameState.funds < product.cost ? '<small>资金不足；可退回商品或空手开门</small>' : ''}
  </article>`;
}

function reasonText(reason) {
  if (typeof reason === 'string') return reason;
  if (!reason || typeof reason !== 'object') return '';
  if (typeof reason.text === 'string') return reason.text;
  if (typeof reason.reason === 'string') return reason.reason;
  if (typeof reason.label === 'string') return `${reason.label}${typeof reason.value === 'number' ? ` ${reason.value > 0 ? '+' : ''}${reason.value}` : ''}`;
  return Object.values(reason).filter((value) => ['string', 'number'].includes(typeof value)).map(String).join(' · ');
}

function matchDescription(match) {
  if (Number(match) >= 3) return '三个标签都合适';
  if (Number(match) > 0) return '部分线索合拍';
  if (match === true) return '很贴合';
  if (match === false) return '不太合拍';
  return '这次没有标签对上，故事仍会继续';
}

function stockView(gameState) {
  const banner = warningBanner();
  return `${gameHeader(gameState)}${banner}
    <section class="panel inventory-panel">
      <div class="section-heading"><div><h2>开门前，把货架补齐</h2><small>已选 ${distinctStockTypes(gameState)} / ${STOCK_TYPE_CAPACITY} 种 · 每种最多 ${STOCK_CAPACITY} 份</small></div><small>温度、口味、提神与货架类型均标在商品卡片上；退回最后一份即可更换商品</small></div>
      <div class="product-grid">${PRODUCTS.map((product) => productCard(product, gameState, { stock: true })).join('')}</div>
      <div class="night-actions" style="margin-top:20px"><button class="primary" type="button" data-action="open">打开店门，迎接第一位来客</button><span class="small-muted">空手开店也可以照常提供热水、倾听并完成今晚故事。</span></div>
    </section>${storyLedgerLink(gameState)}`;
}

function recommendationView(gameState) {
  const scene = getScene(gameState);
  return `${gameHeader(gameState)}${warningBanner()}${scenePanel(gameState, scene)}
    <section class="panel section-panel">
      <div class="section-heading"><div><h2>从已听见的线索里，挑一份推荐</h2><small>每张卡片都会说明标签是否贴合以及原因；选错也不会卡住故事。</small></div><small>缺货的商品会留在货架列表里，但不能推荐</small></div>
      <div class="product-grid recommend-grid">${PRODUCTS.map((product) => productCard(product, gameState, { preview: previewRecommendation(gameState, product.id) })).join('')}
        <article class="water-card"><div><span class="product-icon" aria-hidden="true">♨</span><h3>柜台热水</h3><p>不占库存，不收钱。她可以边暖手，边慢慢说。</p></div><button class="primary" type="button" data-action="recommend" data-id="water">递上一杯热水 · 免费</button></article>
      </div>
    </section>${storyLedgerLink(gameState)}`;
}

function replyView(gameState) {
  const scene = getScene(gameState);
  const replies = Array.isArray(scene?.replies) ? scene.replies.filter((reply) => reply.available !== false) : [];
  const pending = gameState.pending ?? {};
  const chosen = pending.water ? { name: '柜台热水', icon: '♨' } : productById(pending.productId) ?? { name: pending.productName ?? '暂未标明的商品', icon: '✦' };
  return `${gameHeader(gameState)}${warningBanner()}${scenePanel(gameState, scene)}
    <section class="panel section-panel">
      <div class="section-heading"><div><h2>要怎么回应她？</h2><small>具体的回应会留下故事里的记号，不会变成抽象好感数值。</small></div></div>
      <div class="recommend-summary"><span class="product-icon" aria-hidden="true">${esc(chosen.icon)}</span><span><strong>你递给她：${esc(chosen.name)}</strong><small>${pending.water ? '热水一直免费供应。' : `线索反馈：${esc(matchDescription(pending.match))}`}</small></span></div>
      <div class="choice-list">${replies.map((reply) => `<button class="choice-button" type="button" data-action="reply" data-id="${esc(reply.id)}"><strong>${esc(reply.text)}</strong>${reply.effects?.listen ? '<small>倾听 · 不改变经营资金 · 随时可选</small>' : reply.hint ? `<small>${esc(reply.hint)}</small>` : ''}</button>`).join('') || '<p class="empty-state">这段对话暂时没有可选回应。请返回后重新读取存档。</p>'}</div>
      <p class="choice-note">每个回应都会推动这次相遇。倾听选项在每一段对话中都可以使用。</p>
    </section>${storyLedgerLink(gameState)}`;
}

function receiptView(gameState) {
  const receipt = gameState.lastReceipt ?? gameState.history?.at?.(-1) ?? {};
  const character = customerById(receipt.customerId);
  const product = receipt.productId === 'water' ? { name: '柜台热水' } : productById(receipt.productId);
  const matchLabel = matchDescription(receipt.match);
  const reasons = Array.isArray(receipt.reasons) ? receipt.reasons.map(reasonText).filter(Boolean) : [];
  const previous = Array.isArray(gameState.history)
    ? [...gameState.history].reverse().find((entry) => entry.customerId === receipt.customerId && entry.sceneId !== receipt.sceneId)
    : null;
  const previousFlags = previous?.flagsAfter ?? {};
  const flags = receipt.flagsAfter && typeof receipt.flagsAfter === 'object' ? Object.entries(receipt.flagsAfter)
    .filter(([key, value]) => value === true && previousFlags[key] !== true)
    .map(([key]) => flagNames[key] ?? '') : [];
  const feedback = [...new Set(flags.filter(Boolean))];
  if (receipt.commitmentAfter === true && previous?.commitmentAfter !== true) feedback.push('你在柜台便签上留下一件小约定');
  if (receipt.commitmentAfter === false && previous?.commitmentAfter === true && receipt.flagsAfter?.promise === true) feedback.push(flagNames.promise);
  const replyText = receipt.replyText ? `<p class="reply-text">${esc(receipt.replyText)}</p>` : '';
  const dialogue = receipt.dialogue ? `<p>${esc(receipt.dialogue)}</p>` : '';
  const clue = receipt.clue ? `<div class="clue-box"><strong>她说出的线索</strong><span>${esc(receipt.clue)}</span></div>` : '';
  const reaction = receipt.reaction ? `<div class="receipt-reaction">${esc(receipt.reaction)}</div>` : '';
  const response = receipt.response ? `<p class="reply-text">${esc(receipt.response)}</p>` : '';
  const income = Number.isFinite(receipt.income) ? receipt.income : 0;
  const isReplayMode = isReplay();
  return `${gameHeader(gameState)}${warningBanner()}<section class="panel receipt-card">
    <span class="eyebrow">收银台回执 · 第 ${esc(receipt.night ?? gameState.night)} 夜 / 第 ${esc(Number(receipt.slot ?? gameState.slot) + 1)} 位来客</span>
    <h1>${esc(character?.name ?? receipt.customerName ?? '这次相遇')}</h1>
    <div class="receipt-data"><span>递给她<strong>${esc(product?.name ?? receipt.productName ?? '一份心意')}</strong></span><span>线索反馈<strong>${esc(matchLabel)}</strong></span><span>本次入账<strong>${esc(income)}</strong></span></div>
    ${dialogue}${clue}${reaction}${replyText}${response}
    ${reasons.length ? `<h3>这次反应的理由</h3><ul class="reason-list">${reasons.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul>` : ''}
    ${feedback.length ? `<div class="flag-feedback" aria-label="故事记号">${feedback.map((label) => `<span>${esc(label)}</span>`).join('')}</div>` : ''}
    ${receipt.commitmentAfter ? '<p class="small-muted">柜台便签上还留着一件待兑现的小约定。</p>' : ''}
    <div class="actions-row"><button class="primary" type="button" data-action="advance">${Number(gameState.slot) < 2 ? '送她到门口 · 迎接下一位' : '送她到门口 · 今晚打烊'}</button>${isReplayMode ? '<button type="button" data-action="leave-replay">结束独立回看</button>' : ''}</div>
    <p class="readonly-note">${isReplayMode ? '独立回看不会影响主档、账本或纪念物。' : '收款与故事记号已在本次选择后结算并自动保存。'}</p>
  </section>${storyLedgerLink(gameState)}`;
}

function recordsForNight(gameState, night) {
  return Array.isArray(gameState.history) ? gameState.history.filter((entry) => Number(entry.night) === Number(night)) : [];
}

function ledgerForNight(gameState, night) {
  const entries = Array.isArray(gameState.ledgers) ? gameState.ledgers.filter((entry) => Number(entry?.night) === Number(night)) : [];
  if (!entries.length) return null;
  const buys = entries.filter((entry) => entry.kind === 'buy').reduce((sum, entry) => sum + entry.amount, 0);
  const refunds = entries.filter((entry) => entry.kind === 'return').reduce((sum, entry) => sum + entry.amount, 0);
  const income = entries.filter((entry) => entry.kind === 'sale').reduce((sum, entry) => sum + entry.amount, 0);
  const expired = entries.filter((entry) => entry.kind === 'spoilage').map((entry) => {
    const name = productById(entry.productId)?.name ?? '鲜食';
    return `${name}${entry.quantity > 1 ? ` ×${entry.quantity}` : ''}`;
  });
  const aid = entries.find((entry) => entry.kind === 'relief')?.message ?? '';
  return { night, entries, income, expenses: buys - refunds, expired, note: aid };
}

function ledgerSummary(gameState, night) {
  const ledger = ledgerForNight(gameState, night) ?? {};
  const rows = recordsForNight(gameState, night);
  const income = Number.isFinite(ledger.income) ? ledger.income : rows.reduce((sum, row) => sum + (Number(row.income) || 0), 0);
  const expenses = Number.isFinite(ledger.expenses) ? ledger.expenses : Number.isFinite(ledger.cost) ? ledger.cost : 0;
  const expired = ledger.expired ?? ledger.spoiled ?? ledger.expiredItems ?? [];
  const expiredText = Array.isArray(expired) ? expired.map((entry) => typeof entry === 'string' ? entry : `${entry?.name ?? entry?.productName ?? '鲜食'}${Number.isFinite(entry?.quantity) ? ` ×${entry.quantity}` : ''}`).join('、') : typeof expired === 'number' ? `${expired} 份鲜食` : String(expired || '没有鲜食作废');
  const note = ledger.summary ?? ledger.note ?? ledger.text ?? '';
  return { ledger, rows, income, expenses, expiredText: expiredText || '没有鲜食作废', note, entries: ledger.entries ?? [] };
}

function nightLedgerCard(gameState, night, { replay = false } = {}) {
  const summary = ledgerSummary(gameState, night);
  const visitRows = summary.rows.map((record, index) => {
    const customer = customerById(record.customerId);
    const product = record.productId === 'water' ? { name: '柜台热水' } : productById(record.productId);
    const reply = record.replyText ?? record.reaction ?? record.dialogue ?? '这段相遇留在了夜记里。';
    return `<article class="ledger-visit"><header><strong>来客 ${index + 1} · ${esc(customer?.name ?? record.customerName ?? '夜里的客人')}</strong><span>${esc(product?.name ?? record.productName ?? '未记录商品')} · 入账 ${esc(Number(record.income) || 0)}</span></header>${record.dialogue ? `<p>${esc(record.dialogue)}</p>` : ''}<p class="ledger-choice">${esc(reply)}</p></article>`;
  }).join('');
  const activity = summary.entries.length ? `<details class="ledger-activity"><summary>经营流水 · ${summary.entries.length} 笔</summary><ul>${summary.entries.map((entry) => `<li>${esc(entry.message)} <small>资金变化 ${entry.fundsDelta > 0 ? '+' : ''}${esc(entry.fundsDelta)}</small></li>`).join('')}</ul></details>` : '';
  return `<section class="panel night-ledger">
    <div class="section-heading"><div><h2>第 ${esc(night)} 夜 · 打烊账本</h2><small>逐次收款和回音都保存在这里。</small></div></div>
    <div class="ledger-summary"><div><small>来客次数</small><strong>${summary.rows.length} / 3</strong></div><div><small>卖货入账</small><strong>${esc(summary.income)}</strong></div><div><small>补货支出</small><strong>${esc(summary.expenses)}</strong></div><div><small>夜末鲜食</small><strong>${esc(summary.expiredText)}</strong></div></div>
    ${summary.note ? `<div class="ledger-night"><p>${esc(summary.note)}</p></div>` : ''}
    <div class="ledger-visits">${visitRows || '<div class="empty-state">这晚还没有已完成的相遇。</div>'}</div>
    ${activity}
    ${replay ? '<p class="readonly-note">正在独立回看：账本只读，不会改变主档。</p>' : ''}
  </section>`;
}

function storyLedgerLink(gameState) {
  if (!['night-end', 'complete'].includes(gameState.phase)) return '';
  const night = Number(gameState.night);
  const ledger = ledgerForNight(gameState, night);
  return ledger ? nightLedgerCard(gameState, night, { replay: isReplay() }) : '';
}

function completedNightCount(gameState) {
  if (gameState.phase === 'complete') return 7;
  if (gameState.phase === 'night-end') return Math.max(0, Number(gameState.night) || 0);
  return Math.max(0, (Number(gameState.night) || 1) - 1);
}

function canReplayNight(gameState, night) {
  if (night > completedNightCount(gameState)) return false;
  const starts = gameState.nightStarts;
  if (Array.isArray(starts)) return starts[night - 1] !== undefined || starts[night] !== undefined;
  if (starts && typeof starts === 'object') return starts[night] !== undefined || starts[String(night)] !== undefined;
  return false;
}

function nightAlbumCard(gameState, night) {
  const summary = ledgerSummary(gameState, night);
  const replayable = canReplayNight(gameState, night);
  return `<article class="album-night ${replayable ? 'complete' : ''}"><h3>第 ${night} 夜 <span class="tag">${replayable ? '已完成' : night === Number(gameState.night) ? '正在营业' : '尚未到来'}</span></h3><p>${summary.rows.length ? `遇见 ${summary.rows.map((entry) => customerById(entry.customerId)?.name ?? entry.customerName ?? '熟面孔').map(esc).join('、')} · 卖货入账 ${esc(summary.income)}` : '这一页还没有故事记录。'}</p><div class="night-actions">${replayable ? `<button class="primary" type="button" data-action="replay" data-id="${night}">独立重演这一夜</button>` : '<button type="button" disabled>完成这一夜后开放</button>'}</div></article>`;
}

function albumView(gameState) {
  const max = 7;
  const count = completedNightCount(gameState);
  const cards = Array.from({ length: max }, (_, index) => nightAlbumCard(gameState, index + 1)).join('');
  const entries = Array.isArray(gameState.history) ? gameState.history.map((record, index) => {
    const customer = customerById(record.customerId);
    const product = record.productId === 'water' ? { name: '柜台热水' } : productById(record.productId);
    return `<details><summary>第 ${esc(record.night)} 夜 · ${esc(customer?.name ?? record.customerName ?? '来客')} · ${esc(product?.name ?? record.productName ?? '未记录商品')}</summary>${record.dialogue ? `<p>${esc(record.dialogue)}</p>` : ''}${record.reaction ? `<p>${esc(record.reaction)}</p>` : ''}${record.replyText ? `<p>${esc(record.replyText)}</p>` : ''}<p class="readonly-note">回音 ${esc(record.match === true ? '很贴合' : record.match === false ? '不太合拍' : '仍然继续')} · 入账 ${esc(Number(record.income) || 0)}</p></details>`;
  }).join('') : '';
  return `<section class="panel album-panel">
    <span class="eyebrow">✦ 留给下一个夜班的故事</span><h1>故事相册</h1><p>已完成 ${count} / 7 夜。对话记录只读保存；重演会从那晚的独立快照开始，不写回主档，也不再次登记纪念物。</p>
    <div class="album-grid">${cards}</div>
    <div class="album-entry"><h2>已读过的对话</h2>${entries || '<div class="empty-state">故事还没开始。等第一位客人推门时，这里会留下她说过的话。</div>'}</div>
    <p class="readonly-note">相册中的数额只是历史记录；重演时产生的新结算不会带回主经营档案。</p>
  </section>`;
}

function nightEndView(gameState) {
  const summary = ledgerSummary(gameState, gameState.night);
  const replay = isReplay();
  const hasAid = Boolean(gameState.aidNotice);
  const heading = replay ? '这段回看，先停在这里。' : Number(gameState.night) >= 7 ? '最后一盏灯，也平安熄下了。' : '把零钱记好，明晚还会有人来。';
  return `${gameHeader(gameState)}${warningBanner()}${nightLedgerCard(gameState, gameState.night, { replay })}<section class="panel section-panel">
    <h2>${heading}</h2><p>${esc(summary.note || `今晚迎来了 ${summary.rows.length} 位客人，卖货入账 ${summary.income}。${summary.expiredText !== '没有鲜食作废' ? ` 鲜食夜末作废：${summary.expiredText}。` : ' 鲜食处理情况已记入夜账。'}`)}</p>
    ${hasAid ? `<div class="clue-box"><strong>基础补货支援已启用</strong><span>${esc(typeof gameState.aidNotice === 'string' ? gameState.aidNotice : gameState.aidNotice?.message ?? '资金见底时，店里提供了一次明确的基础补货支援。')}</span></div>` : ''}
    <div class="night-actions" style="margin-top:18px">${replay ? '<button class="primary" type="button" data-action="leave-replay">返回故事相册</button>' : Number(gameState.night) >= 7 ? '<button class="primary" type="button" data-action="next-night">读完最后一页</button>' : '<button class="primary" type="button" data-action="next-night">收好夜账 · 准备第 ' + (Number(gameState.night) + 1) + ' 夜</button>'}<button type="button" data-action="album">看看故事相册</button></div>
  </section>`;
}

function closuresView(ending) {
  const closures = Array.isArray(ending?.characterClosures) ? ending.characterClosures : [];
  if (!closures.length) return '';
  return `<div class="character-closures">${closures.map((item) => {
    const id = typeof item === 'string' ? item : item.customerId ?? item.id;
    const character = customerById(id);
    const text = typeof item === 'string' ? '' : item.text ?? item.closure ?? item.description ?? '';
    return `<article class="character-closure"><strong>${esc(character?.name ?? item.name ?? '她')}</strong>${text ? `<p>${esc(text)}</p>` : ''}</article>`;
  }).join('')}</div>`;
}

function allCustomerFlag(gameState, flag) {
  const flags = gameState.flags ?? {};
  return CUSTOMERS.length > 0 && CUSTOMERS.every((customer) => flags[customer.id]?.[flag] === true);
}

async function awardCompletion() {
  if (!state || state.replay || state.phase !== 'complete' || !savedEnvelope || isReplay()) return;
  let persisted = false;
  try { persisted = JSON.stringify(savedEnvelope.payload) === JSON.stringify(state); } catch { persisted = false; }
  if (!persisted) return;
  const ending = getEnding(state);
  const rewardIds = ['store-first'];
  if (allCustomerFlag(state, 'listen')) rewardIds.push('store-listener');
  if (allCustomerFlag(state, 'promise')) rewardIds.push('store-promises');
  const result = await recordCompletion({
    gameId: GAME,
    runId: String(state.runId),
    completionId: `midnight-store:${state.runId}:complete`,
    rulesVersion: String(state.rulesVersion ?? RULES_VERSION),
    outcome: String(ending?.id ?? state.endingId ?? 'completed'),
    rewardIds,
    verification: 'local',
  });
  if (!result.ok) {
    awardMessage = `纪念物暂时没有登记：${result.error.message}。已保存的故事仍在，可以稍后重试。`;
    notice(awardMessage, true);
    return;
  }
  const listed = await listCollectibles(GAME);
  if (listed.ok) collectibles = listed.value;
  awardMessage = '';
}

function completeView(gameState) {
  const ending = getEnding(gameState) ?? {};
  const title = ending.title ?? ENDINGS?.find?.((item) => item.id === ending.id)?.title ?? '下班之后，故事仍在继续';
  const text = ending.text ?? ending.description ?? '谢谢你陪她们走过这七个夜晚。';
  const saved = Boolean(savedEnvelope && JSON.stringify(savedEnvelope.payload) === JSON.stringify(gameState));
  const earned = collectibles.filter((item) => item.gameId === GAME);
  return `${gameHeader(gameState)}${warningBanner()}<section class="panel ending-card">
    <span class="eyebrow">✦ 第七夜 · 完成</span><div class="ending-stars" aria-hidden="true">✦ ✧ ✦</div><h1>${esc(title)}</h1><p>${esc(text)}</p>
    ${closuresView(ending)}
    <h2 style="margin-top:24px">本地纪念物</h2>
    ${awardMessage ? `<p class="warning-box">${esc(awardMessage)}</p>` : saved ? earned.length ? `<div class="flag-feedback">${earned.map((item) => `<span>✦ ${esc(item.title)}</span>`).join('')}</div>` : '<p class="small-muted">本次完成已记录在本机。</p>' : '<p class="warning-box">最终故事尚未成功保存，所以暂不登记纪念物。请导出进度或恢复本机存储后再试。</p>'}
    <div class="actions-row">${saved ? '<button type="button" data-action="retry-award">重试纪念物登记</button>' : '<button type="button" data-action="save" class="primary">重试保存</button>'}<button type="button" data-action="album">重看七夜相册</button><button type="button" data-action="new" class="primary">重新经营七个夜晚</button><a href="../../index.html">返回星夜游戏馆</a></div>
  </section>${view === 'album' ? albumView(gameState) : ''}`;
}

function replayBanner() {
  return isReplay() ? `<div class="replay-banner"><span>正在独立回看第 ${esc(replayState.night)} 夜。这里的选择不会写入主档，也不会再次结算纪念物。</span><button type="button" data-action="leave-replay">结束回看，返回主档</button></div>` : '';
}

function render() {
  if (busy && !state && !invalidSave && !storageUnavailable) {
    loadingRender();
    return;
  }
  const gameState = activeState();
  if (!gameState) {
    app.innerHTML = introPage();
  } else if (view === 'album' && !isReplay() && gameState.phase !== 'complete') {
    app.innerHTML = `${gameHeader(gameState)}${warningBanner()}${albumView(gameState)}`;
  } else if (view === 'album' && !isReplay() && gameState.phase === 'complete') {
    app.innerHTML = completeView(gameState);
  } else {
    const content = gameState.phase === 'stock' ? stockView(gameState)
      : gameState.phase === 'recommend' ? recommendationView(gameState)
        : gameState.phase === 'reply' ? replyView(gameState)
          : gameState.phase === 'receipt' ? receiptView(gameState)
            : gameState.phase === 'night-end' ? nightEndView(gameState)
              : gameState.phase === 'complete' ? completeView(gameState)
                : `<section class="panel"><h1>暂时无法显示这个经营阶段</h1><p>请导出档案保留进度，然后重新读取。</p><button type="button" data-action="reload">重新读取进度</button></section>`;
    app.innerHTML = `${replayBanner()}${content}`;
  }
  app.classList.toggle('busy-mask', busy);
  app.querySelectorAll('img[data-fallback]').forEach((image) => image.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = image.classList.contains('hero-portrait') ? 'hero-portrait-fallback' : 'portrait-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = image.dataset.fallback || '✦';
    image.replaceWith(fallback);
  }, { once: true }));
  app.querySelectorAll('button[data-action]').forEach((button) => {
    const action = button.dataset.action;
    button.disabled = busy || (conflict && action !== 'reload');
  });
  updateTopControls();
}

function envelopeFor(candidate, nextRevision) {
  return {
    gameId: GAME,
    slotId: SLOT,
    saveVersion: '1',
    rulesVersion: String(candidate.rulesVersion ?? RULES_VERSION),
    contentVersion: String(candidate.contentVersion ?? RULES_VERSION),
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
    payload: candidate,
  };
}

function markStorageUnavailable(result) {
  const code = result?.error?.code ?? '';
  const message = result?.error?.message ?? '浏览器未能保存这次选择。';
  if (code === 'REVISION_CONFLICT' || code === 'CONFLICT') {
    conflict = true;
    setStatus('发现另一标签页的更新；本页经营已锁定，请先导出再重新读取。', true);
    return false;
  }
  if (['STORAGE_UNAVAILABLE', 'STORAGE_BLOCKED', 'STORAGE_WRITE_FAILED', 'STORAGE_FULL'].includes(code)) storageUnavailable = true;
  if (result?.error?.details?.quarantineId) recoveryId = result.error.details.quarantineId;
  const suffix = storageUnavailable ? '当前进度还留在本页面，可导出 JSON；成功保存前不会登记纪念物。' : '当前进度还留在本页面，可导出 JSON。';
  setStatus(`本次没有保存：${message} ${suffix}`, true);
  return false;
}

async function persist() {
  if (!state || !validSaveState(state) || isReplay() || conflict) return false;
  if (invalidSave && !replaceInvalidConfirmed) return false;
  const next = envelopeFor(state, revision + 1);
  const result = await saveGame(next, revision, invalidSave && recoveryId ? { recoveryId } : undefined);
  if (!result.ok) return markStorageUnavailable(result);
  savedEnvelope = result.value;
  revision = result.value.revision;
  invalidSave = false;
  recoveryId = null;
  replaceInvalidConfirmed = false;
  storageUnavailable = false;
  setStatus('已保存到此浏览器 · 每次经营选择都会自动保存');
  return true;
}

function createNewGame() {
  const seed = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 0xffffffff);
  const runId = globalThis.crypto?.randomUUID?.() ?? `store-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return createGame({ seed, runId });
}

async function startCampaign() {
  if (busy || conflict) return;
  if (invalidSave && !replaceInvalidConfirmed) {
    if (!confirm('当前档案损坏或版本较新。开始新故事会替换隔离档案；请先用“导出原档”保存备份。继续吗？')) return;
    replaceInvalidConfirmed = true;
  } else if ((state || savedEnvelope) && !confirm('开始新故事会替换当前便利店进度，但已登记的纪念物会保留。建议先导出当前档案。继续吗？')) {
    return;
  }
  busy = true;
  state = createNewGame();
  replayState = null;
  view = 'game';
  render();
  try {
    const saved = await persist();
    if (!saved && !conflict) notice('新故事已在本页面开始，但没有写入本地存储。离开前请导出进度。', true);
  } finally {
    busy = false;
    render();
  }
}

async function dispatch(type, payload = {}) {
  if (busy || conflict) return;
  const target = activeState();
  if (!target) return;
  busy = true;
  render();
  try {
    const before = JSON.stringify(target);
    const next = reduceGame(target, { type, ...payload, actionId: actionId() });
    if (!validState(next)) throw new Error('这次经营动作没有生成有效进度，已保留上一个状态。');
    if (isReplay()) replayState = next;
    else state = next;
    if (JSON.stringify(next) === before) {
      notice('这次选择没有改变经营状态，请检查当前可用选项。', true);
      return;
    }
    if (!isReplay()) {
      const saved = await persist();
      if (state?.phase === 'complete' && saved) await awardCompletion();
    }
  } catch (error) {
    notice(error?.message ?? '经营动作失败，请重新尝试。', true);
  } finally {
    busy = false;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function downloadJson(serialized, filename) {
  const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportCurrent() {
  if (busy) return;
  if (!state && !savedEnvelope && !invalidSave) {
    notice('目前还没有可导出的游戏档案。');
    return;
  }
  if (!state && invalidSave) {
    const raw = await exportSave(GAME, SLOT, { storage });
    if (!raw.ok) {
      notice(`原档暂时无法导出：${raw.error.message}`, true);
      return;
    }
    downloadJson(raw.value, 'midnight-store-recovery.json');
    return;
  }
  const exportedEnvelope = envelopeFor(state, Math.max(1, revision + (savedEnvelope && JSON.stringify(savedEnvelope.payload) === JSON.stringify(state) ? 0 : 1)));
  const result = createSaveExport(exportedEnvelope);
  if (!result.ok) {
    notice(result.error.message, true);
    return;
  }
  downloadJson(result.value, 'midnight-store-save.json');
}

async function exportOriginal() {
  if (busy || !invalidSave) return;
  const result = await exportSave(GAME, SLOT, { storage });
  if (!result.ok) {
    notice(`原始档案暂时无法导出：${result.error.message}`, true);
    return;
  }
  downloadJson(result.value, 'midnight-store-original-save.json');
  notice('已导出原始档案备份；它不会直接作为有效游戏档案导入。');
}

async function importFile(file) {
  if (!file || busy || conflict) return;
  if (file.size > 2 * 1024 * 1024) {
    notice('档案超过 2 MiB，暂不导入。', true);
    return;
  }
  busy = true;
  updateTopControls();
  try {
    const serialized = await file.text();
    const parsed = parseSaveImport(serialized, { expectedGameId: GAME, expectedSlotId: SLOT });
    if (!parsed.ok) throw new Error(parsed.error.message);
    if (!validSaveState(parsed.value.payload)) throw new Error('档案中的游戏状态不完整、属于独立回看或版本不兼容。');
    if ((state || savedEnvelope || invalidSave) && !confirm('导入会替换当前便利店进度。损坏档案会继续保留为隔离备份。建议先导出当前档案。继续吗？')) return;
    if (invalidSave) replaceInvalidConfirmed = true;
    const imported = await importSave(serialized, {
      expectedGameId: GAME,
      expectedSlotId: SLOT,
      expectedRevision: revision,
      storage,
      ...(recoveryId ? { recoveryId } : {}),
    });
    if (!imported.ok) {
      if (['STORAGE_UNAVAILABLE', 'STORAGE_BLOCKED', 'STORAGE_WRITE_FAILED', 'STORAGE_FULL'].includes(imported.error.code)) {
        state = parsed.value.payload;
        savedEnvelope = null;
        replayState = null;
        view = 'game';
        storageUnavailable = true;
        setStatus(`有效档案已载入当前页面，但暂时无法存入浏览器：${imported.error.message} 请在离开前导出。`, true);
        notice('有效进度已在当前页面打开；成功保存前不会登记纪念物。', true);
        return;
      }
      if (['REVISION_CONFLICT', 'CONFLICT'].includes(imported.error.code)) conflict = true;
      throw new Error(imported.error.message);
    }
    location.reload();
  } catch (error) {
    notice(error?.message ?? '无法导入这个档案。', true);
  } finally {
    busy = false;
    render();
  }
}

function startReplay(night) {
  if (busy || conflict || !state) return;
  try {
    const candidate = createReplay(state, Number(night));
    if (candidate?.ok === false) throw new Error(candidate.error?.message ?? '这一夜还没有可供回看的快照。');
    replayState = candidate?.value ?? candidate;
    if (!validState(replayState)) throw new Error('这一夜的独立回放数据不完整。');
    view = 'game';
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (error) {
    notice(error?.message ?? '暂时无法回看这一夜。', true);
  }
}

app.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (busy || (conflict && action !== 'reload')) return;
  if (action === 'start') { await startCampaign(); return; }
  if (action === 'resume') { view = 'game'; render(); return; }
  if (action === 'album') { if (isReplay()) return; view = 'album'; render(); return; }
  if (action === 'counter') { view = 'game'; render(); return; }
  if (action === 'replay') { startReplay(id); return; }
  if (action === 'leave-replay') { replayState = null; view = 'album'; render(); return; }
  if (action === 'toggle-read') {
    if (collapsedScenes.has(id)) collapsedScenes.delete(id); else collapsedScenes.add(id);
    render();
    return;
  }
  if (action === 'reload') { if (confirm('重新读取会放弃本页未保存的内存进度。你可以先导出档案。继续吗？')) location.reload(); return; }
  if (action === 'new') {
    await startCampaign();
    return;
  }
  if (action === 'save') {
    busy = true;
    render();
    const result = await persist();
    if (result && state?.phase === 'complete') await awardCompletion();
    busy = false;
    render();
    return;
  }
  if (action === 'retry-award') {
    if (!state || !savedEnvelope || JSON.stringify(savedEnvelope.payload) !== JSON.stringify(state)) {
      notice('纪念物只会从已成功保存的最终故事登记。', true);
      return;
    }
    busy = true;
    render();
    await awardCompletion();
    busy = false;
    render();
    return;
  }
  if (action === 'buy') { await dispatch('buy', { productId: id, quantity: 1 }); return; }
  if (action === 'return') { await dispatch('return', { productId: id, quantity: 1 }); return; }
  if (action === 'open') { await dispatch('open'); return; }
  if (action === 'recommend') { await dispatch('recommend', { productId: id }); return; }
  if (action === 'reply') { await dispatch('reply', { replyId: id }); return; }
  if (action === 'advance') { await dispatch('advance'); return; }
  if (action === 'next-night') { await dispatch('next-night'); return; }
});

saveButton.addEventListener('click', async () => {
  if (busy || conflict || !state || isReplay()) return;
  busy = true;
  render();
  const saved = await persist();
  if (saved && state?.phase === 'complete') await awardCompletion();
  busy = false;
  render();
});
exportButton.addEventListener('click', exportCurrent);
exportOriginalButton.addEventListener('click', exportOriginal);
importInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  await importFile(file);
});
document.querySelector('label[for="import"]').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (!busy && !conflict) importInput.click();
});
fontSmaller.addEventListener('click', () => setFontScale(getFontScale() - .05));
fontLarger.addEventListener('click', () => setFontScale(getFontScale() + .05));

document.documentElement.style.setProperty('--font-scale', String(getFontScale()));
loadReadScenes();
loadingRender();

try {
  const loaded = await loadSave(GAME, SLOT);
  if (!loaded.ok) {
    const code = loaded.error.code;
    recoveryId = loaded.error.details?.quarantineId ?? null;
    revision = loaded.error.details?.currentRevision ?? 0;
    invalidSave = ['CORRUPT_SAVE', 'UNSUPPORTED_VERSION', 'INVALID_SAVE', 'INVALID_PAYLOAD'].includes(code);
    storageUnavailable = ['STORAGE_UNAVAILABLE', 'STORAGE_BLOCKED', 'STORAGE_WRITE_FAILED'].includes(code);
    const message = invalidSave ? '原始档案已隔离保留；请先导出备份，再导入有效档案恢复。' : storageUnavailable ? '本地存储不可用；本页仍可试玩并导出当前进度。' : loaded.error.message;
    setStatus(`读取档案失败：${message}`, true);
  } else if (loaded.value) {
    savedEnvelope = loaded.value;
    revision = loaded.value.revision;
    if (validSaveState(loaded.value.payload)) {
      state = loaded.value.payload;
      setStatus('已恢复上次夜班进度');
      if (state.phase === 'complete') await awardCompletion();
    } else {
      savedEnvelope = null;
      invalidSave = true;
      setStatus('游戏状态损坏或不兼容；原档仍可导出和恢复。', true);
    }
  } else {
    setStatus('本机还没有便利店档案 · 开始后自动保存');
  }
} catch (error) {
  storageUnavailable = true;
  setStatus(`无法读取本机存储：${error?.message ?? '未知错误'}；可以在当前页面试玩并导出。`, true);
}

busy = false;
render();
