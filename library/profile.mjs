import { failure, isIdentifier, isSitePath, validateProfile } from './contracts.mjs';
import { listCollectibles } from './collectibles.mjs';

export const PROFILE_STORAGE_KEY = 'vtlib:profile:v1';
export const DISPLAY_SLOT_COUNT = 6;

export const FAVORITE_CHARACTERS = Object.freeze([
  Object.freeze({ id: 'suiji', displayName: '岁己', portrait: '../assets/units_big/suiji.webp' }),
  Object.freeze({ id: 'kanban', displayName: '栞栞', portrait: '../assets/units_big/kanban.webp' }),
]);

const DEFAULT_FAVORITE = FAVORITE_CHARACTERS[0].id;
const DEFAULT_PROFILE_ID = 'local-player';
const MAX_DISPLAY_NAME_LENGTH = 24;

const SOURCE_GAMES = Object.freeze({
  'studio-manager': Object.freeze({ title: '今晚谁来播', task: 'G1', entry: '../games/studio-manager/index.html' }),
  'midnight-store': Object.freeze({ title: '下播后的便利店', task: 'G2', entry: '../games/midnight-store/index.html' }),
});

export function createDefaultProfile() {
  return {
    localProfileId: DEFAULT_PROFILE_ID,
    displayName: '星夜访客',
    favoriteCharacterId: DEFAULT_FAVORITE,
    displaySlots: Array(DISPLAY_SLOT_COUNT).fill(null),
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeDisplayName(value) {
  if (typeof value !== 'string') return createDefaultProfile().displayName;
  const trimmed = value.trim();
  if (!trimmed) return createDefaultProfile().displayName;
  return [...trimmed].slice(0, MAX_DISPLAY_NAME_LENGTH).join('');
}

export function parseStoredProfile(raw) {
  if (raw === null || raw === undefined) return { ok: true, value: null, state: 'missing' };
  if (typeof raw !== 'string') return { ok: false, value: null, state: 'invalid' };
  try {
    const value = JSON.parse(raw);
    if (!isPlainObject(value)) return { ok: false, value: null, state: 'invalid' };
    return { ok: true, value, state: 'loaded' };
  } catch {
    return { ok: false, value: null, state: 'invalid' };
  }
}

export function getOwnedCollectibleChoices(collectibles) {
  if (!Array.isArray(collectibles)) return [];
  const byId = new Map();
  for (const collectible of collectibles) {
    if (!isPlainObject(collectible) || !isIdentifier(collectible.id) || !isIdentifier(collectible.gameId)) continue;
    const rows = byId.get(collectible.id) || [];
    rows.push(collectible);
    byId.set(collectible.id, rows);
  }
  // The frozen profile contract stores only collectible IDs, while storage keys them
  // by gameId and ID. A cross-game ID collision cannot be represented safely.
  return [...byId.values()]
    .filter((rows) => rows.length === 1)
    .map(([collectible]) => collectible);
}

export function resolveCollectibleSource(collectibleOrGameId) {
  const gameId = typeof collectibleOrGameId === 'string' ? collectibleOrGameId : collectibleOrGameId?.gameId;
  const source = SOURCE_GAMES[gameId];
  return source
    ? { gameId, gameTitle: source.title, task: source.task, entry: source.entry }
    : { gameId: typeof gameId === 'string' ? gameId : '', gameTitle: `游戏 ${typeof gameId === 'string' ? gameId : '来源未知'}`, task: '', entry: null };
}

export function getSlotChoices(collectibles, selectedId = null, otherSlotIds = []) {
  const otherIds = new Set(otherSlotIds.filter((id) => id !== null && id !== undefined && id !== selectedId));
  return getOwnedCollectibleChoices(collectibles).filter((collectible) => collectible.id === selectedId || !otherIds.has(collectible.id));
}

export function normalizeProfile(profile, collectibles, { ownershipAvailable = true } = {}) {
  const defaults = createDefaultProfile();
  const value = isPlainObject(profile) ? profile : {};
  const characterIds = new Set(FAVORITE_CHARACTERS.map((character) => character.id));
  const chosenCharacter = characterIds.has(value.favoriteCharacterId) ? value.favoriteCharacterId : defaults.favoriteCharacterId;
  const rawSlots = Array.isArray(value.displaySlots) ? value.displaySlots.slice(0, DISPLAY_SLOT_COUNT) : [];
  const choices = ownershipAvailable ? getOwnedCollectibleChoices(collectibles) : [];
  const ownedIds = new Set(choices.map((collectible) => collectible.id));
  const seen = new Set();
  const removed = [];
  const displaySlots = Array.from({ length: DISPLAY_SLOT_COUNT }, (_, index) => {
    const candidate = rawSlots[index] ?? null;
    if (candidate === null) return null;
    if (!isIdentifier(candidate) || seen.has(candidate) || (ownershipAvailable && !ownedIds.has(candidate))) {
      removed.push({ index, id: candidate });
      return null;
    }
    seen.add(candidate);
    return candidate;
  });
  const normalized = {
    localProfileId: isIdentifier(value.localProfileId) ? value.localProfileId : defaults.localProfileId,
    displayName: normalizeDisplayName(value.displayName),
    favoriteCharacterId: chosenCharacter,
    displaySlots,
  };
  const checked = validateProfile(normalized);
  return {
    profile: checked.ok ? normalized : defaults,
    removedSlots: removed,
    ownershipChecked: ownershipAvailable,
  };
}

export function validateProfileDraft(profile, collectibles) {
  const valid = validateProfile(profile);
  if (!valid.ok) return valid;
  if (typeof profile.displayName !== 'string' || !profile.displayName.trim() || [...profile.displayName.trim()].length > MAX_DISPLAY_NAME_LENGTH) {
    return failure('INVALID_PROFILE_NAME', `Display name must contain 1 to ${MAX_DISPLAY_NAME_LENGTH} characters.`);
  }
  if (!FAVORITE_CHARACTERS.some((character) => character.id === profile.favoriteCharacterId)) {
    return failure('INVALID_FAVORITE_CHARACTER', 'Choose one of the two available favorite characters.');
  }
  if (new Set(profile.displaySlots.filter((id) => id !== null)).size !== profile.displaySlots.filter((id) => id !== null).length) {
    return failure('DUPLICATE_DISPLAY_SLOT', 'A collectible can only appear in one display slot.');
  }
  const ownedIds = new Set(getOwnedCollectibleChoices(collectibles).map((collectible) => collectible.id));
  const unowned = profile.displaySlots.filter((id) => id !== null && !ownedIds.has(id));
  if (unowned.length) return failure('COLLECTIBLE_NOT_OWNED', 'Display slots may only contain collectibles currently owned in this browser.', { ids: unowned });
  return { ok: true, value: profile };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function getLocalStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readProfileStorage(storage) {
  if (!storage) return { ok: false, value: null, state: 'unavailable' };
  try {
    return parseStoredProfile(storage.getItem(PROFILE_STORAGE_KEY));
  } catch {
    return { ok: false, value: null, state: 'unavailable' };
  }
}

function imageUrl(siteRelativePath) {
  if (typeof siteRelativePath !== 'string' || !isSitePath(siteRelativePath)) return null;
  try {
    return new URL(`../${siteRelativePath}`, import.meta.url).href;
  } catch {
    return null;
  }
}

function characterFor(id) {
  return FAVORITE_CHARACTERS.find((character) => character.id === id) || FAVORITE_CHARACTERS[0];
}

function verificationLabel(verification) {
  return verification === 'server' ? '服务端验证' : '本地纪念';
}

function setStatus(element, message, kind = 'info') {
  element.textContent = message;
  element.dataset.kind = kind;
}

function installImageFallbacks(root) {
  for (const image of root.querySelectorAll('[data-image-fallback]')) {
    const wrapper = image.closest('[data-art-wrap]');
    image.addEventListener('error', () => {
      image.hidden = true;
      wrapper?.classList.add('is-missing');
    }, { once: true });
    image.addEventListener('load', () => wrapper?.classList.remove('is-missing'), { once: true });
  }
}

function buildSlotMarkup(index, collectible, ownershipAvailable) {
  const number = String(index + 1).padStart(2, '0');
  if (!ownershipAvailable) {
    return `<li class="stage-slot slot-unavailable" data-stage-slot="${index}"><span class="slot-number">${number}</span><div class="empty-art" aria-hidden="true">…</div><div class="slot-copy"><strong>暂不可读取</strong><span>等待本地纪念物列表</span></div></li>`;
  }
  if (!collectible) {
    return `<li class="stage-slot slot-empty" data-stage-slot="${index}"><span class="slot-number">${number}</span><div class="empty-art" aria-hidden="true">✧</div><div class="slot-copy"><strong>留给下一段故事</strong><span>这个位置还空着</span></div></li>`;
  }
  const source = resolveCollectibleSource(collectible);
  const art = imageUrl(collectible.image);
  const sourceMarkup = source.entry
    ? `<a class="source-link" data-source-game="${escapeHtml(source.gameId)}" href="${escapeHtml(source.entry)}">来自《${escapeHtml(source.gameTitle)}》 <span aria-hidden="true">↗</span></a>`
    : `<span class="source-link">来自《${escapeHtml(source.gameTitle)}》</span>`;
  const imageMarkup = art
    ? `<div class="collectible-art" data-game="${escapeHtml(collectible.gameId)}" data-art-wrap><span class="art-fallback" aria-hidden="true">✦</span><img data-image-fallback src="${escapeHtml(art)}" alt="" loading="lazy"></div>`
    : `<div class="collectible-art is-missing" data-game="${escapeHtml(collectible.gameId)}" data-art-wrap><span class="art-fallback" aria-hidden="true">✦</span></div>`;
  return `<li class="stage-slot" data-stage-slot="${index}"><span class="slot-number">${number}</span>${imageMarkup}<div class="slot-copy"><strong>${escapeHtml(collectible.title)}</strong>${sourceMarkup}<span class="trust-label">${escapeHtml(verificationLabel(collectible.verification))}</span></div></li>`;
}

function initProfilePage() {
  const form = document.querySelector('#profile-form');
  if (!form) return;
  const dom = {
    form,
    name: document.querySelector('#display-name'),
    favorite: document.querySelector('#favorite-character'),
    slotControls: document.querySelector('#slot-controls'),
    stageName: document.querySelector('#stage-name'),
    stageFavorite: document.querySelector('#stage-favorite'),
    stageAvatar: document.querySelector('#stage-avatar'),
    stageAvatarWrap: document.querySelector('#stage-avatar-wrap'),
    stageSlots: document.querySelector('#stage-slots'),
    count: document.querySelector('#collection-count'),
    profileStatus: document.querySelector('#profile-status'),
    collectibleStatus: document.querySelector('#collectible-status'),
    retry: document.querySelector('#retry-collectibles'),
    save: document.querySelector('#save-profile'),
  };
  const state = {
    profile: createDefaultProfile(),
    collectibles: [],
    choices: [],
    ownershipAvailable: false,
    storageAvailable: true,
    storageState: 'missing',
    pendingRepairCount: 0,
    saving: false,
  };

  function currentSlots() {
    if (!state.ownershipAvailable) return [...state.profile.displaySlots];
    return [...dom.slotControls.querySelectorAll('[data-slot-index]')].map((select) => select.value || null);
  }

  function currentDraft() {
    return {
      ...state.profile,
      displayName: dom.name.value,
      favoriteCharacterId: dom.favorite.value || null,
      displaySlots: currentSlots(),
    };
  }

  function updateStage() {
    const draft = currentDraft();
    const character = characterFor(draft.favoriteCharacterId);
    dom.stageName.textContent = draft.displayName.trim() || '星夜访客';
    dom.stageFavorite.textContent = `最喜欢的角色 · ${character.displayName}`;
    dom.stageAvatarWrap.classList.remove('is-missing');
    dom.stageAvatar.hidden = false;
    dom.stageAvatar.src = imageUrl(character.portrait) || character.portrait;
    const byId = new Map(state.choices.map((collectible) => [collectible.id, collectible]));
    dom.stageSlots.innerHTML = Array.from({ length: DISPLAY_SLOT_COUNT }, (_, index) => {
      const collectible = state.ownershipAvailable ? byId.get(draft.displaySlots[index]) : null;
      return buildSlotMarkup(index, collectible, state.ownershipAvailable);
    }).join('');
    installImageFallbacks(dom.stageSlots);
    const filled = state.ownershipAvailable ? draft.displaySlots.filter(Boolean).length : 0;
    dom.count.textContent = state.ownershipAvailable ? `${filled} / ${DISPLAY_SLOT_COUNT}` : `— / ${DISPLAY_SLOT_COUNT}`;
  }

  function syncSlotOptions(selectedSlots = currentSlots()) {
    for (let index = 0; index < DISPLAY_SLOT_COUNT; index += 1) {
      const select = dom.slotControls.querySelector(`[data-slot-index="${index}"]`);
      if (!select) continue;
      const selectedId = selectedSlots[index] || null;
      const otherIds = selectedSlots.filter((id, otherIndex) => otherIndex !== index && id !== null);
      const choices = getSlotChoices(state.choices, selectedId, otherIds);
      const optionMarkup = [
        '<option value="">留空</option>',
        ...choices.map((collectible) => {
          const source = resolveCollectibleSource(collectible);
          return `<option value="${escapeHtml(collectible.id)}">${escapeHtml(source.gameTitle)} · ${escapeHtml(collectible.title)}</option>`;
        }),
      ].join('');
      select.innerHTML = optionMarkup;
      select.value = selectedId || '';
      select.disabled = !state.ownershipAvailable;
    }
  }

  function buildSlotControls() {
    dom.slotControls.innerHTML = Array.from({ length: DISPLAY_SLOT_COUNT }, (_, index) => {
      const number = String(index + 1).padStart(2, '0');
      return `<label class="slot-control" for="display-slot-${index + 1}"><span class="slot-control-number">${number}<span>展示位</span></span><select id="display-slot-${index + 1}" data-slot-index="${index}" aria-label="第 ${index + 1} 个纪念物展示位" aria-describedby="collectible-status"></select></label>`;
    }).join('');
    syncSlotOptions(state.profile.displaySlots);
  }

  function setCollectibleState(result) {
    state.ownershipAvailable = Boolean(result?.ok && Array.isArray(result.value));
    state.collectibles = state.ownershipAvailable ? result.value : [];
    state.choices = getOwnedCollectibleChoices(state.collectibles);
    dom.retry.hidden = state.ownershipAvailable;
    if (!state.ownershipAvailable) {
      const reason = result?.error?.message ? ` ${result.error.message}` : '';
      setStatus(dom.collectibleStatus, `纪念物暂时无法读取。现在无法确认已获得的内容，因此展示位保持只读。${reason}`, 'error');
    } else if (state.choices.length === 0) {
      setStatus(dom.collectibleStatus, '这里还没有可展示的纪念物。完成一段游戏故事后，已获得的纪念物就能放上来。', 'empty');
    } else {
      const hiddenCollisions = state.collectibles.length - state.choices.length;
      const collisionNote = hiddenCollisions > 0 ? ` 有 ${hiddenCollisions} 条 ID 重复记录无法安全区分，暂未提供选择。` : '';
      setStatus(dom.collectibleStatus, `已读取 ${state.choices.length} 份本地纪念物。${collisionNote}`, 'success');
    }
  }

  function setInitialProfileStatus() {
    if (!state.storageAvailable) {
      setStatus(dom.profileStatus, '浏览器暂不允许读取个人资料。本页仍可编辑，刷新后无法保留未保存内容。', 'error');
    } else if (state.storageState === 'invalid') {
      setStatus(dom.profileStatus, '已有个人资料无法解析。页面已载入默认内容；保存后会用当前展示重建本地资料。', 'error');
    } else if (state.pendingRepairCount > 0) {
      setStatus(dom.profileStatus, `有 ${state.pendingRepairCount} 个展示位不再对应可读取的纪念物，已暂时留空；保存后才会写入修正。`, 'warning');
    } else if (state.storageState === 'loaded') {
      setStatus(dom.profileStatus, '已读取上次保存的个人展示资料。', 'success');
    } else {
      setStatus(dom.profileStatus, '本地展示台已准备好。调整内容后，记得保存。', 'info');
    }
  }

  function repairCurrentSlots(rawSlots) {
    const normalized = normalizeProfile({ ...state.profile, displaySlots: rawSlots }, state.choices, { ownershipAvailable: true });
    return normalized;
  }

  function onSlotChange() {
    const raw = [...dom.slotControls.querySelectorAll('[data-slot-index]')].map((select) => select.value || null);
    const normalized = repairCurrentSlots(raw);
    state.profile.displaySlots = normalized.profile.displaySlots;
    if (normalized.removedSlots.length) {
      setStatus(dom.profileStatus, '每份纪念物只能展示一次；重复或无效的位置已留空。', 'warning');
    }
    syncSlotOptions(state.profile.displaySlots);
    updateStage();
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (state.saving) return;
    const candidate = currentDraft();
    candidate.displayName = candidate.displayName.trim();
    if (!state.ownershipAvailable) candidate.displaySlots = [...state.profile.displaySlots];
    const validation = state.ownershipAvailable ? validateProfileDraft(candidate, state.choices) : validateProfile(candidate);
    if (!validation.ok) {
      setStatus(dom.profileStatus, validation.error.message, 'error');
      if (validation.error.code === 'INVALID_PROFILE_NAME') dom.name.focus();
      return;
    }
    state.saving = true;
    dom.save.disabled = true;
    const storage = getLocalStorage();
    let stored = false;
    try {
      if (!storage) throw new Error('浏览器不允许访问本地存储');
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(candidate));
      stored = true;
    } catch {
      stored = false;
    }
    state.profile = candidate;
    state.saving = false;
    dom.save.disabled = false;
    if (stored) {
      state.storageAvailable = true;
      state.storageState = 'loaded';
      state.pendingRepairCount = 0;
      setStatus(dom.profileStatus, '展示台已保存在此浏览器，刷新后仍会保留。', 'success');
    } else {
      setStatus(dom.profileStatus, '浏览器拒绝写入本地资料；当前页面仍保留这些修改，刷新后不会保留。', 'error');
    }
    updateStage();
  }

  async function retryCollectibles() {
    dom.retry.disabled = true;
    dom.retry.textContent = '正在读取…';
    let result;
    try {
      result = await listCollectibles();
    } catch (error) {
      result = { ok: false, error: { message: error?.message || '读取请求失败' } };
    }
    setCollectibleState(result);
    if (state.ownershipAvailable) {
      const normalized = normalizeProfile(state.profile, state.choices);
      state.profile = normalized.profile;
      state.pendingRepairCount += normalized.removedSlots.length;
      syncSlotOptions(state.profile.displaySlots);
    }
    dom.retry.disabled = false;
    dom.retry.textContent = '重新读取纪念物';
    updateStage();
  }

  async function start() {
    const storage = getLocalStorage();
    const saved = readProfileStorage(storage);
    state.storageAvailable = saved.state !== 'unavailable';
    state.storageState = saved.state;
    let collectibleResult;
    try {
      collectibleResult = await listCollectibles();
    } catch (error) {
      collectibleResult = { ok: false, error: { message: error?.message || '读取请求失败' } };
    }
    setCollectibleState(collectibleResult);
    const normalized = normalizeProfile(saved.value, state.choices, { ownershipAvailable: state.ownershipAvailable });
    state.profile = normalized.profile;
    state.pendingRepairCount = normalized.removedSlots.length;
    dom.name.value = state.profile.displayName;
    dom.favorite.innerHTML = FAVORITE_CHARACTERS.map((character) => `<option value="${character.id}">${escapeHtml(character.displayName)}</option>`).join('');
    dom.favorite.value = state.profile.favoriteCharacterId;
    buildSlotControls();
    setInitialProfileStatus();
    updateStage();
  }

  dom.name.addEventListener('input', updateStage);
  dom.favorite.addEventListener('change', updateStage);
  dom.slotControls.addEventListener('change', (event) => {
    if (event.target.closest('[data-slot-index]')) onSlotChange();
  });
  dom.form.addEventListener('submit', saveProfile);
  dom.retry.addEventListener('click', retryCollectibles);
  dom.stageAvatar.addEventListener('error', () => dom.stageAvatarWrap.classList.add('is-missing'));
  dom.stageAvatar.addEventListener('load', () => dom.stageAvatarWrap.classList.remove('is-missing'));
  start();
}

if (typeof document !== 'undefined') initProfilePage();
