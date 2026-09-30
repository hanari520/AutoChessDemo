import '../tools/preparation-presentation.js?v=1';
import { postJson, reconnectDelay, reconcileAction } from './connection.js';
import { MAX_LEVEL, xpNeeded, interestGain } from './economy.js';
import { createBattleEffects } from './battle-effects.js?v=1';
import { mountClassicMatchLayout, closeMatchPanel } from './layout.js?v=2';
import { bondSummary, previewUnit } from './combat.js';
import { SKILL_NAMES } from './skill-names.js';
import { EQUIPMENT, recipe, SHOP_ODDS } from './equipment.js';
import { mountDragControls } from './interactions.js';
import { CLASSIC_SKILLS, CLASSIC_MARKS, classicAttackProfile } from './skill-catalog.js';
import '../tools/battle-audio.js?v=1';

const $ = (id) => document.getElementById(id);
mountClassicMatchLayout();
const STORAGE = 'star-stage-online-session-v1';
const API_STORAGE = 'star-stage-online-api-v1';
const NAME_STORAGE = 'star-stage-online-name-v1';
const DEFAULT_API = 'https://autochess-online-321604-12-1450980602.sh.run.tcloudbase.com'; // CloudBase 云托管（上海）
const skillVisuals = new Map();
fetch('assets/skill_signature_manifest.json').then(response => response.ok ? response.json() : null).then(manifest => {
  for (const unit of manifest?.units || []) {
    if (!/^[\w-]+$/.test(unit.id)) continue;
    skillVisuals.set(unit.id, {
      glyph: String(unit.glyph || '✦').slice(0, 2),
      shape: unit.shape || 'seal', attackStyle: unit.attackStyle || 'blade',
      color: /^#[0-9a-fA-F]{6}$/.test(unit.color) ? unit.color : '#dcb8ff',
      asset: /^assets\/[\w/-]+\.(?:png|webp)$/.test(unit.aiVfx || '') ? unit.aiVfx : '',
    });
  }
}).catch(() => {});

const state = {
  api: localStorage.getItem(API_STORAGE) || DEFAULT_API,
  session: readSession(),
  statMode:'damage',code: '', seat: null, lobby: null, view: null, socket: null,
  connected: false, busy: false, selected: null, seq: 1, pendingAction: null,
  deadline: null, phaseDurationMs: null, clockSkew: 0, spectateSeat: null,
  reconnectTimer: null, reconnectAttempts: 0, stopped: true,
  connectionTimer: null, heartbeatTimer: null, heartbeatDeadline: null,
  actionTimer: null, synced: false, lastMessageAt: 0, awaitingSync: false,
  battlePlayback: null, battleFrame: null, inspected: null,
};
mountDragControls({getSeat:()=>state.view?.me,canAct,sendAction,isBoardReadOnly:()=>state.spectateSeat!=null&&state.spectateSeat!==state.seat});
const audio=globalThis.ClassicBattleAudio.create({speed:()=>state.battlePlayback?.speed||1,silent:()=>false});
$('sfxBtn').addEventListener('click',()=>audio.toggleSfx());audio.paintSfxBtn();

// 旧会话保存的本地默认地址在 DEFAULT_API 变更后自动迁移，避免残留 localhost。
if (state.api !== DEFAULT_API && state.api === 'http://localhost:8787') {
  state.api = DEFAULT_API;
  localStorage.setItem(API_STORAGE, DEFAULT_API);
}


function readSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE) || 'null'); }
  catch { return null; }
}

function saveSession(session) {
  state.session = session;
  localStorage.setItem(STORAGE, JSON.stringify(session));
  updateResume();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function normalizedApi() {
  const raw = $('apiBase').value.trim() || DEFAULT_API;
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('联机服务地址不是有效网址。'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('联机服务地址必须以 http:// 或 https:// 开头。');
  if (location.protocol === 'https:' && url.protocol === 'http:' && !['localhost','127.0.0.1'].includes(url.hostname)) {
    throw new Error('当前页面使用 HTTPS，联机服务也需要 HTTPS。');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function apiUrl(path) { return `${state.api}${path}`; }
function wsUrl(code) {
  const url = new URL(apiUrl(`/api/rooms/${encodeURIComponent(code)}/ws`));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function setConnection(kind, label) {
  const element = $('connection');
  element.dataset.state = kind;
  element.lastElementChild.textContent = label;
}

function setError(message, inRoom = false) {
  const element = inRoom ? $('roomAlert') : $('entryError');
  element.textContent = message;
  element.hidden = !message;
}

let toastTimer;
function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 3500);
}

function updateResume() {
  const session = state.session;
  $('resumeBox').hidden = !(session?.token && session?.code);
  if (session?.code) $('resumeBtn').textContent = `重连房间 ${session.code} →`;
}

function showRoom() {
  $('entryScreen').hidden = true;
  $('roomScreen').hidden = false;
  $('roomCode').textContent = state.code;
  $('roomCodeInput').value = state.code;
  const url = new URL(location.href);
  url.searchParams.set('room', state.code);
  history.replaceState(null, '', url);
  render();
}

function showEntry() {
  closeMatchPanel();
  if(state.battleFrame !== null)cancelAnimationFrame(state.battleFrame);
  state.battleFrame=null;
  state.battlePlayback?.renderer?.destroy();state.battlePlayback=null;
  $('roomScreen').hidden = true;
  $('entryScreen').hidden = false;
  document.body.classList.remove('online-playing');
  setConnection('idle', '未连接');
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

async function request(path, data) {
  return postJson(apiUrl(path), data);
}

async function enterRoom(mode) {
  if (state.busy) return;
  setError('');
  let api;
  try { api = normalizedApi(); }
  catch (error) { setError(error.message); return; }
  const name = $('playerName').value.trim();
  if (!name) { setError('请先输入昵称。'); $('playerName').focus(); return; }
  const code = $('roomCodeInput').value.trim().toUpperCase();
  if (mode === 'join' && !/^[A-Z0-9]{3,12}$/.test(code)) {
    setError('请输入有效的房间码。'); $('roomCodeInput').focus(); return;
  }
  state.busy = true;
  $('createBtn').disabled = $('joinBtn').disabled = true;
  state.api = api;
  localStorage.setItem(API_STORAGE, api);
  localStorage.setItem(NAME_STORAGE, name);
  setConnection('connecting', '连接中');
  try {
    const result = mode === 'create'
      ? await request('/api/rooms', {name})
      : await request(`/api/rooms/${encodeURIComponent(code)}/join`, {
          name,
          ...(state.session?.code === code && state.session?.api === api ? {token: state.session.token} : {}),
        });
    if (!result.code || !result.token) throw new Error('联机服务未返回房间码或重连令牌。');
    closeSocket();
    state.code = result.code;
    state.seat = result.seat;
    state.lobby = result.lobby || null;
    state.view = null;
    state.selected = null;
    saveSession({code: result.code, token: result.token, seat: result.seat, name, api});
    showRoom();
    connectSocket();
  } catch (error) {
    setConnection('offline', '连接失败');
    setError(error.message || '无法进入房间。');
  } finally {
    state.busy = false;
    $('createBtn').disabled = $('joinBtn').disabled = false;
  }
}

async function resumeRoom() {
  const session = state.session;
  if (!session?.token || !session?.code) return;
  $('apiBase').value = session.api || state.api;
  $('playerName').value = session.name || $('playerName').value;
  $('roomCodeInput').value = session.code;
  await enterRoom('join');
}

async function addBot() {
  if (!state.session?.token || !state.code || state.busy) return;
  state.busy = true;
  $('addBotBtn').disabled = true;
  try {
    const result = await request(`/api/rooms/${encodeURIComponent(state.code)}/bots`, {token: state.session.token});
    if (result.lobby) { state.lobby = result.lobby; render(); }
  } catch (error) {
    toast(error.message || '添加机器人失败。');
  } finally {
    state.busy = false;
    $('addBotBtn').disabled = false;
  }
}

async function removeBot(seat) {
  if (!state.session?.token || !state.code) return;
  try {
    const result = await request(`/api/rooms/${encodeURIComponent(state.code)}/bots/remove`, {token: state.session.token, seat});
    if (result.lobby) { state.lobby = result.lobby; render(); }
  } catch (error) {
    toast(error.message || '移除机器人失败。');
  }
}

function closeSocket() {
  state.stopped = true;
  clearTimeout(state.reconnectTimer);
  clearConnectionTimers();
  state.connected = false;
  state.synced = false;
  state.pendingAction = null;
  const socket = state.socket;
  state.socket = null;
  if (socket) socket.close();
}

function clearConnectionTimers() {
  clearTimeout(state.connectionTimer);
  clearInterval(state.heartbeatTimer);
  clearTimeout(state.heartbeatDeadline);
  state.heartbeatDeadline = null;
  clearTimeout(state.actionTimer);
}

function retryConnection() {
  if (state.stopped || !state.session?.token || !state.code) return;
  state.connected = false;
  state.synced = false;
  state.awaitingSync = true;
  setConnection('offline', '连接中断');
  renderControls();
  const socket = state.socket;
  state.socket = null;
  clearConnectionTimers();
  if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  scheduleReconnect();
}

function resumeTransport() {
  if (state.stopped || !state.session?.token || !state.code || navigator.onLine === false) return;
  if (!state.connected || Date.now() - state.lastMessageAt > 25_000) {
    retryConnection();
    clearTimeout(state.reconnectTimer);
    connectSocket();
  }
  else requestSync();
}

function scheduleReconnect() {
  clearTimeout(state.reconnectTimer);
  const wait = reconnectDelay(state.reconnectAttempts++);
  state.reconnectTimer = setTimeout(connectSocket, wait);
}

function requestSync() {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN || !state.connected) { retryConnection(); return; }
  state.synced = false;
  state.awaitingSync = true;
  setConnection('connecting', '正在同步');
  renderControls();
  try { state.socket.send(JSON.stringify({type:'sync'})); }
  catch { retryConnection(); return; }
  clearTimeout(state.connectionTimer);
  state.connectionTimer = setTimeout(retryConnection, 6000);
}

function armActionTimeout() {
  clearTimeout(state.actionTimer);
  if (state.pendingAction) state.actionTimer = setTimeout(() => {
    if (state.pendingAction) requestSync();
  }, 8000);
}

function startHeartbeat(socket) {
  clearInterval(state.heartbeatTimer);
  state.heartbeatTimer = setInterval(() => {
    if (socket !== state.socket || document.hidden || !state.connected || socket.readyState !== WebSocket.OPEN) return;
    if (state.heartbeatDeadline) return;
    try { socket.send(JSON.stringify({type:'ping'})); }
    catch { retryConnection(); return; }
    state.heartbeatDeadline = setTimeout(() => {
      state.heartbeatDeadline = null;
      retryConnection();
    }, 10000);
  }, 15000);
}

function settlePending(snapshot) {
  const pending = state.pendingAction;
  if (!pending) return 'none';
  const outcome = reconcileAction(pending, snapshot);
  if (outcome === 'retry') {
    try { state.socket.send(JSON.stringify(pending.envelope)); armActionTimeout(); }
    catch { retryConnection(); }
    return outcome;
  }
  if (outcome === 'unknown') {
    setError('无法确认上一项操作的结果，请刷新后检查棋盘。', true);
  } else if (outcome === 'stale') {
    toast('上一回合的操作已过期，未重新提交。');
  } else if (outcome === 'conflict') {
    toast('操作序号已变化，已按服务器状态同步。');
  }
  if (outcome !== 'unknown') state.pendingAction = null;
  clearTimeout(state.actionTimer);
  return outcome;
}

function connectSocket() {
  if (!state.session?.token || !state.code) return;
  if (navigator.onLine === false) { scheduleReconnect(); return; }
  state.stopped = false;
  clearTimeout(state.reconnectTimer);
  clearConnectionTimers();
  state.connected = false;
  state.synced = false;
  state.awaitingSync = true;
  const socket = new WebSocket(wsUrl(state.code));
  let transientAuthTimeout = false;
  state.socket = socket;
  setConnection('connecting', state.reconnectAttempts ? '正在重连' : '连接中');
  state.connectionTimer = setTimeout(() => { if (socket === state.socket) retryConnection(); }, 10000);
  socket.addEventListener('open', () => {
    if (socket !== state.socket) return;
    try { socket.send(JSON.stringify({type:'auth', token: state.session.token})); }
    catch { retryConnection(); }
  });
  socket.addEventListener('message', event => {
    if (socket !== state.socket) return;
    let message;
    try { message = JSON.parse(event.data); }
    catch { return; }
    state.lastMessageAt = Date.now();
    if (message.type === 'state') {
      clearTimeout(state.connectionTimer);
      state.connected = true;
      state.synced = true;
      state.reconnectAttempts = 0;
      const pendingOutcome = state.awaitingSync ? settlePending(message) : 'none';
      if (!state.awaitingSync && state.pendingAction && reconcileAction(state.pendingAction, message) === 'confirmed') {
        state.pendingAction = null;
        clearTimeout(state.actionTimer);
      }
      state.awaitingSync = false;
      state.code = message.code || state.code;
      state.seat = message.seat ?? state.seat;
      state.lobby = message.lobby || state.lobby;
      state.view = message.view ?? null;
      state.phaseDurationMs = message.phaseDurationMs;
      state.deadline = message.deadline ?? null;
      state.maintenance = !!message.maintenance;
      if (Number.isFinite(message.serverTime)) state.clockSkew = Date.now() - message.serverTime;
      if (Number.isInteger(message.nextSeq) && message.nextSeq > 0) state.seq = message.nextSeq;
      setConnection('online', '已连接');
      if (pendingOutcome !== 'unknown') setError(compatibleBoard()?'':'线上服务器尚未同步新版棋盘规则，请更新服务端后新建房间。', true);
      startHeartbeat(socket);
      render();
    } else if (message.type === 'ack') {
      if(state.pendingAction?.envelope.id===message.id){const key={buy:'buy',sell:'sell',reroll:'roll',buyXp:'lvlup',equip:'equip',autoEquip:'equip',unequip:'equip',combine:'equip',combineWorn:'equip',autoDeploy:'deploy',tidy:'tidy'}[state.pendingAction.type];if(key)audio.sfx(key);}
      if (state.pendingAction?.envelope.id === message.id) { state.pendingAction = null; clearTimeout(state.actionTimer); }
      if (Number.isInteger(message.seq)) state.seq = Math.max(state.seq, message.seq + 1);
      renderControls();
    } else if (message.type === 'pong') {
      clearTimeout(state.heartbeatDeadline);
      state.heartbeatDeadline = null;
    } else if (message.type === 'error') {
      if (!state.connected && message.code === 'auth_timeout') transientAuthTimeout = true;
      if (state.pendingAction?.envelope.id === message.id) { state.pendingAction = null; clearTimeout(state.actionTimer); }
      const detail = message.message || message.code || '操作未完成。';
      if (state.connected) { setError(detail, true); toast(detail); }
      else { setError(`身份验证失败：${detail}`, true); setConnection('offline', '验证失败'); }
    }
  });
  socket.addEventListener('close', event => {
    if (socket !== state.socket || state.stopped) return;
    clearConnectionTimers();
    state.connected = false;
    state.synced = false;
    state.awaitingSync = true;
    setConnection('offline', '连接中断');
    if ([4000,4001,4002,4003,4005].includes(event.code)
        && !(event.code === 4003 && (transientAuthTimeout || event.reason === 'authentication timeout'))) {
      state.stopped=true;
      $('roomHint').textContent=event.code===4001?'此座位已在另一窗口连接，本窗口停止重连。':'房间或座位已失效，请返回入口重新建房或加入。';
      renderControls();
      return;
    }
    $('roomHint').textContent = '连接中断，正在自动重连…';
    renderControls();
    scheduleReconnect();
  });
  socket.addEventListener('error', () => {
    if (socket === state.socket) setConnection('offline', '网络异常');
  });
}

function send(message) {
  if (!state.connected || !state.synced || state.socket?.readyState !== WebSocket.OPEN) {
    toast('连接尚未恢复，请稍后重试。');
    return false;
  }
  try { state.socket.send(JSON.stringify(message)); return true; }
  catch { retryConnection(); return false; }
}

function sendAction(action) {
  if (state.pendingAction) { toast('上一项操作尚未确认，请稍候。'); return; }
  if (!canAct()) return;
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const envelope = {type:'action', id, seq:state.seq, round:state.view.round, action};
  state.pendingAction = {envelope, round:state.view.round, type:action.type};
  if (!send(envelope)) state.pendingAction = null;
  else { armActionTimeout(); renderControls(); }
}

function compatibleBoard(){return !state.view||state.view.me?.board?.length===64;}

function canAct() {
  const mine = state.view?.players?.find(p => p.seat === state.seat);
  return compatibleBoard() && state.connected && state.synced && !state.pendingAction && state.lobby?.status === 'playing' && state.view?.phase === 'prep' && !mine?.ready && !isSpectator();
}

function isSpectator() {
  const player = state.view?.players?.find(p => p.seat === state.seat);
  return !!state.view && (player?.alive === false || (state.view.me && state.view.me.hp <= 0));
}

function playerName(seat) {
  return state.lobby?.players?.find(p => p.seat === seat)?.name
    || state.view?.players?.find(p => p.seat === seat)?.name
    || `席位 ${Number(seat) + 1}`;
}

function render() {
  const lobby = state.lobby;
  const gameVisible = lobby?.status === 'playing' || lobby?.status === 'finished';
  document.body.classList.toggle('online-playing', gameVisible);
  $('lobbySection').hidden = gameVisible;
  $('gameSection').hidden = !gameVisible;
  $('roomCaption').textContent = gameVisible ? 'ONLINE MATCH' : 'ROOM LOBBY';
  $('roomHint').textContent = !state.connected ? '连接中断，正在自动重连…'
    : lobby?.status === 'finished' ? '本局已结束 · 可查看最终战况'
    : gameVisible ? `第 ${state.view?.round ?? '—'} 回合 · ${phaseName(state.view?.phase)}`
    : '等待八位玩家入座并就绪';
  if (state.maintenance) $('roomHint').textContent += ' · 服务维护中，当前对局可继续';
  renderLobby();
  if (gameVisible) renderGame();
  renderControls();
}

function renderLobby() {
  const lobby = state.lobby;
  const players = lobby?.players || [];
  const canManageBots = state.seat === lobby?.hostSeat && lobby?.status === 'waiting';
  $('occupancy').textContent = `${players.length} / ${lobby?.capacity || 8}`;
  $('lobbySeats').innerHTML = Array.from({length: lobby?.capacity || 8}, (_, seat) => {
    const player = players.find(p => p.seat === seat);
    const status = (!player ? '等待入座' : player.bot ? (player.ready ? '机器人 · 已就绪' : '机器人') : !player.connected ? '暂时离线 · 90 秒内可重连' : player.ready ? '已就绪' : '准备中')+(player && seat===lobby.hostSeat?' · 房主':'');
    const kick = player?.bot && canManageBots ? `<button type="button" class="seat-kick" data-kickbot="${player.seat}" aria-label="移除机器人 ${escapeHtml(player.name)}">✕</button>` : '';
    return `<li class="seat ${seat === state.seat ? 'mine' : ''}"><span class="seat-number">${seat + 1}</span><div class="seat-info"><div class="seat-name">${player?.bot ? '<span class="bot-badge" title="机器人替补">🤖</span>' : ''}${player ? escapeHtml(player.name) : '空席位'}${seat === state.seat ? ' · 你' : ''}</div><div class="seat-status ${player?.ready ? 'ready' : ''}">${status}</div></div>${kick}</li>`;
  }).join('');
  const mine = players.find(p => p.seat === state.seat);
  $('lobbyReadyBtn').textContent = mine?.ready ? '取消就绪' : '我已准备';
  $('lobbyNotice').textContent = players.length < 8 ? `还差 ${8 - players.length} 人入座（可用机器人补位）` : '等待所有玩家就绪';
  $('addBotBtn').hidden = !(state.connected && state.synced && canManageBots && players.length < (lobby?.capacity || 8));
  $('addBotBtn').textContent = players.length <= 1 ? '添加机器人替补（可连点补满）' : '再添一名机器人';
}

function phaseName(phase) {
  return ({prep:'备战',combat:'对战中',result:'结算',over:'对局结束'})[phase] || '等待同步';
}

function updateCountdown() {
  const view = state.view;
  if (!view) return;
  const seconds = state.deadline ? Math.max(0, Math.ceil((state.deadline + state.clockSkew - Date.now()) / 1000)) : null;
  $('countdownValue').textContent = seconds===null||view.phase==='over'?'—':String(seconds);
  $('phaseCountdown').classList.toggle('urgent',seconds!==null&&seconds<=10&&view.phase==='prep');
  $('phaseLabel').textContent = `${isSpectator() ? '观战 · ' : ''}${phaseName(view.phase)}${seconds === null ? '' : ` · ${seconds} 秒`}`;
}

function battleUnitName(unit) { return unit?.name || unit?.id || '棋子'; }

function battleEventText(event, playback) {
  if(event.type==='mark')return `获得【${event.label}】印记`;
  if(event.type==='markBurst')return `【${event.label}】印记触发`;
  if(event.label)return event.label;
  const source = battleUnitName(playback.units.find(unit => unit.uid === String(event.from)));
  const target = battleUnitName(playback.units.find(unit => unit.uid === String(event.target)));
  if (event.type === 'cast') return `${source} · 发动技能`;
  if (event.type === 'heal') return `${source}治疗${target} · +${event.amount || 0}`;
  if (event.type === 'shield') return `${target}获得护盾 · +${event.amount || 0}`;
  if (event.type === 'death') return `${target}退场`;
  if (event.type === 'dodge') return `${target}闪避攻击`;
  if (event.type === 'move') return '棋子正在调整站位';
  if (event.type === 'attack' || event.type === 'skill' || event.type === 'bounce') {
    return `${source}对${target}造成 ${event.amount || 0} 点伤害`;
  }
  return event.type === 'shield' ? '护盾生效' : '战斗进行中';
}

function makeBattlePlayback(view, battle) {
  const units = [];
  const starting = new Map((battle.startingUnits || []).map(unit => [String(unit.uid),unit]));
  const ownSide = (state.spectateSeat ?? state.seat) === battle.b ? 'B' : 'A';
  for (const [side, formation] of [['A', battle.formationA], ['B', battle.formationB]]) {
    for (const entry of formation || []) {
      const unit = entry.unit;
      if (!unit) continue;
      const x = entry.slot % 8, y = Math.floor(entry.slot / 8);
      units.push({
        ...unit, ...starting.get(String(unit.uid)), uid: String(unit.uid), side,
        x, y:ownSide === 'B' ? 7 - y : y, alive: true,
      });
    }
  }
  const duration = state.phaseDurationMs || Math.max(8000,(battle.durationMs || 0) + 1000);
  const remaining = state.deadline ? Math.max(0, state.deadline + state.clockSkew - Date.now()) : duration;
  const elapsed = view.phase === 'combat' ? Math.min(duration, Math.max(0, duration - remaining)) : duration;
  return {
    key: `${view.round}:${battle.a}:${battle.b}:${state.spectateSeat ?? state.seat}`,
    battle, units, ownSide, cursor: 0, elapsed, duration,
    startedAt: performance.now() - elapsed,
    lastPaint: 0, feed: '双方阵容已锁定，战斗由服务器模拟。', feedHoldUntil: 0, log: [], logPainted: -1,
    painted: false,
    speed: Math.max(1,(battle.durationMs || 0) / Math.max(1,duration-500)), catchingUp: elapsed > 500,
  };
}

function applyBattleEvent(playback, event, view) {
  const target = playback.units.find(item => item.uid === String(event.target));
  const actor = playback.units.find(item => item.uid === String(event.from));
  if (event.type === 'move') {
    const unit = playback.units.find(item => item.uid === String(event.unit));
    if (unit) { unit.x = event.x; unit.y = playback.ownSide === 'B' ? 7 - event.y : event.y; }
  } else if (event.type === 'death') {
    const unit = target;
    if (unit) unit.alive = false;
  }
  if (target) {
    for (const field of ['hp','shield','mana']) if (Number.isFinite(event[field])) target[field] = event[field];
    if (event.type === 'mana' && !Number.isFinite(event.mana)) target.mana = Math.min(target.maxmana || 50,(target.mana || 0) + (event.amount || 0));
  }
  if(target&&event.type==='mark')target.sigMark=event.mark;
  if(target&&['markBurst','markExpired'].includes(event.type))target.sigMark=null;
  if (target && event.type === 'status') { target.statuses = event.statuses; Object.assign(target,event.stats); }
  if(actor&&['attack','skill','bounce','item','bond','counter','echo','tempo','spark','zoneDamage','afterimage','thorns','reflect','link','burn','dot'].includes(event.type)){actor.damage=(actor.damage||0)+(event.amount||0);const metric=event.dtype==='magic'?'magicDamage':'physicalDamage';actor[metric]=(actor[metric]||0)+(event.amount||0);}
  if(target&&event.amount>0&&!['heal','shield','mana','manaBurn'].includes(event.type))target.taken=(target.taken||0)+event.amount;
  if(actor&&event.type==='cast')actor.casts=(actor.casts||0)+1;
  if(event.type==='death'){const killer=playback.units.find(u=>u.uid===String(event.by));if(killer)killer.kills=(killer.kills||0)+1;}
  if(actor&&event.type==='heal')actor.healing=(actor.healing||0)+(event.amount||0);
  if (!playback.catchingUp) {
    const kit=actor&&CLASSIC_SKILLS[actor.id];
    if(event.type==='cast'&&kit)audio.skillSound(audio.v3Impact(kit,actor),actor,false);
    else if(event.type==='death')audio.sfx('die',{scale:true});
    const recipients=event.type==='cast'?(playback.battle.events||[]).filter(item=>item.at===event.at&&String(item.from)===String(event.from)&&['skill','heal','shield'].includes(item.type)).map(item=>item.target):[];
    playback.renderer?.event(event,recipients);
  }
  if (actor && event.type === 'cast') actor.mana = Number.isFinite(event.mana) ? event.mana : 0;
  if (['attack', 'skill', 'bounce', 'cast', 'heal', 'shield', 'death', 'dodge'].includes(event.type)) {
    const now = performance.now();
    // A cast and its damage often share one server tick. Keep the cast visible
    // through subsequent replay frames instead of replacing it immediately.
    if (event.type === 'cast') playback.feedHoldUntil = now + 700;
    if (event.type === 'cast' || now >= playback.feedHoldUntil) {
      playback.feed = battleEventText(event, playback);
    }
    if(['cast','death','heal','shield','bond','counter','echo','zoneDamage','mark','markBurst'].includes(event.type))playback.log.push(`${(event.at/1000).toFixed(1)} 秒 · ${battleEventText(event,playback)}`);
  }
}

function paintBattle(playback) {
  const ownSide = (isSpectator() ? state.spectateSeat : state.seat) === playback.battle.b ? 'B' : 'A';
  if (!playback.painted) {
    $('battleArena').innerHTML = Array.from({length:64}, (_,slot) => `<div class="battle-cell ${slot < 32 ? 'enemy-side' : 'own-side'}"></div>`).join('') + '<div class="battle-unit-layer"></div>';
    const layer = $('battleArena').lastElementChild;
    playback.nodes = new Map();
    for (const unit of playback.units) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'battle-piece unit battle-unit';
      button.dataset.inspectBattle = unit.uid;
      const passive=previewUnit(unit)?.skill?.mode==='passive';
      button.innerHTML = `<img class="piece-art pt" src="${unitImage(unit.id)}" alt="">${passive?'':'<div class="mpbar battle-mp"><div class="mpfill"></div></div>'}<div class="hpbar battle-hp"><div class="hpfill"></div></div><i class="team-badge" aria-hidden="true"></i><span class="fz" aria-hidden="true"></span>`;
      layer.append(button);
      playback.nodes.set(unit.uid,button);
    }
    const effects = document.createElement('div'); effects.className='battle-effects';
    $('battleArena').append(effects);
    effects.style.setProperty('--spd',playback.speed);
    layer.style.setProperty('--spd',playback.speed);
    playback.renderer=createBattleEffects(effects,playback.nodes,playback.units,skillVisuals,playback.speed);
    playback.painted = true;
  }
  for (const unit of playback.units) {
    const node = playback.nodes.get(unit.uid);
    if (!node) continue;
    node.style.setProperty('--battle-x',unit.x);
    node.style.setProperty('--battle-y',unit.y);
    node.classList.toggle('team-own',unit.side === ownSide);
    node.classList.toggle('team-foe',unit.side !== ownSide);
    node.classList.toggle('ally',unit.side === ownSide);
    node.classList.toggle('enemy',unit.side !== ownSide);
    node.classList.toggle('battle-dead',!unit.alive);
    const statuses=unit.statuses||[];
    const statusIcons={freeze:'❄',stun:'💫',weakenT:'🔻',slow:'🐌',noShield:'🔨',healDownT:'💉',silence:'🔇',taunt:'🎯',arDownT:'🪓',mrDownT:'🔯'};
    node.querySelector('.fz').textContent = statuses.map(key=>statusIcons[key]||'').join('');
    for(const [key,cls] of Object.entries({freeze:'frozen',stun:'stunned',weakenT:'weakened',slow:'slowed'}))node.classList.toggle(cls,statuses.includes(key));
    node.classList.toggle('shielded',(unit.shield||0)>0);
    node.classList.toggle('ult-ready',unit.alive&&(unit.mana||0)>=(unit.maxmana||50)&&!statuses.some(key=>['stun','freeze','silence'].includes(key)));
    node.querySelector('.hpfill').style.width = `${Math.max(0,Math.min(100,(unit.hp ?? unit.maxhp ?? 1)/(unit.maxhp || 1)*100))}%`;
    const mp=node.querySelector('.mpfill');
    if(mp)mp.style.width = `${Math.max(0,Math.min(100,(unit.mana || 0)/(unit.maxmana || 50)*100))}%`;
    node.setAttribute('aria-label',`${battleUnitName(unit)}，${unit.side === ownSide ? '我方' : '对手'}，生命 ${Math.round(unit.hp ?? unit.maxhp ?? 0)} / ${unit.maxhp || 0}，法力 ${Math.round(unit.mana || 0)} / ${unit.maxmana || 50}`);
  }
  $('battleFeed').textContent = playback.feed;
  if(playback.logPainted!==playback.log.length){$('battleLog').innerHTML=playback.log.slice(-40).map(line=>`<p>${escapeHtml(line)}</p>`).join('');playback.logPainted=playback.log.length;}
  const damagePanel=$('battleDamage');
  if(damagePanel) {
    const mode=state.statMode,labels={damage:'⚔ 输出',healing:'💚 治疗',taken:'🛡 抗伤'};
    const ranked=playback.units.filter(u=>(u[mode]||0)>0).sort((a,b)=>(b[mode]||0)-(a[mode]||0)).slice(0,5);
    const total=Math.max(1,...ranked.map(u=>u[mode]||0));
    const html=`<div class="battle-stat-tabs">${Object.entries(labels).map(([key,label])=>`<button type="button" class="button ${mode===key?'on':''}" data-stat="${key}" aria-pressed="${mode===key}">${label}</button>`).join('')}</div>`+
      (ranked.length?ranked.map(u=>`<div class="battle-damage-row"><span title="${u.side===ownSide?'我方':'对手'}"><img class="stat-piece" src="${unitImage(u.id)}" alt="${escapeHtml(battleUnitName(u))}"><small>${'★'.repeat(Math.min(3,u.star||1))}</small></span><span class="battle-damage-track">${mode==='damage'?`<i class="physical" style="width:${(u.physicalDamage||0)/total*100}%"></i><i class="magic" style="width:${(u.magicDamage||0)/total*100}%"></i>`:`<i class="${mode}" style="width:${u[mode]/total*100}%"></i>`}</span><b>${Math.round(u[mode]||0)}</b></div>`).join(''):'<p class="empty-message">本回合暂无该类数据</p>');
    if(damagePanel.innerHTML!==html)damagePanel.innerHTML=html;
  }
  if (state.inspected?.battle) renderInspect();
}

function renderBattlePlayback(view) {
  const panel = $('combatPanel');
  const watchingSeat = state.spectateSeat ?? state.seat;
  const battle = view.battles?.find(item => item.a === watchingSeat || item.b === watchingSeat);
  if (!battle || battle.b === null) {
    if (state.battleFrame !== null) cancelAnimationFrame(state.battleFrame);
    state.battleFrame = null;
    state.battlePlayback?.renderer?.destroy();
    state.battlePlayback = null;
    panel.hidden = view.phase !== 'combat' && view.phase !== 'result' && view.phase !== 'over';
    $('battleArena').innerHTML = '';
    $('battleFeed').textContent = view.phase==='prep'?'备战中，购买棋子并调整阵容。':battle?.b === null ? '本轮轮空，生命与阵容保持不变。' : '你已淘汰，可在八席战况中查看最终名次。';
    $('combatCaption').textContent = battle?.b === null ? '轮空' : '战况回放';
    return;
  }
  panel.hidden = false;
  const key = `${view.round}:${battle.a}:${battle.b}:${watchingSeat}`;
  if (state.battlePlayback?.key !== key) { state.battlePlayback?.renderer?.destroy(); state.battlePlayback = makeBattlePlayback(view,battle); }
  const playback = state.battlePlayback;
  playback.battle = battle;
  $('combatTitle').textContent = `战斗 · ${playerName(battle.a)} VS ${playerName(battle.b)}`;
  $('combatCaption').textContent = '双方阵容已锁定';

  if (!playback.painted) paintBattle(playback);
  const renderFrame = (now) => {
    state.battleFrame = null;
    const elapsed = view.phase === 'combat' ? Math.min(playback.duration, Math.max(0, now - playback.startedAt)) : playback.duration;
    playback.elapsed = elapsed;
    const simElapsed = Math.min(battle.durationMs || 0,elapsed * playback.speed);
    const events = battle.events || [];
    while (playback.cursor < events.length && (view.phase !== 'combat' || events[playback.cursor].at <= simElapsed)) {
      applyBattleEvent(playback, events[playback.cursor++], view);
    }
    playback.catchingUp = false;
    const ownAlive=playback.units.filter(u=>u.alive&&u.side===playback.ownSide).length;
    const foeAlive=playback.units.filter(u=>u.alive&&u.side!==playback.ownSide).length;
    $('combatCaption').textContent=`我方 ${ownAlive} · 对手 ${foeAlive} · ${Math.ceil(Math.max(0,(battle.durationMs || 0)-simElapsed)/1000)} 秒`;
    // Server timestamps drive movement and actions at their original cadence.
    if (elapsed - playback.lastPaint >= 16 || view.phase !== 'combat' || playback.lastPaint === 0) {
      playback.lastPaint = elapsed;
      if (simElapsed >= (battle.durationMs || 0)) {
        const result = view.results?.find(item => item.a === battle.a && item.b === battle.b);
        const winner = result?.winner != null ? playerName(result.winner)
          : battle.winner === 'A' ? playerName(battle.a) : battle.winner === 'B' ? playerName(battle.b) : '双方';
        playback.feed = result ? `战斗结束 · ${winner}获胜 · 造成 ${result.damage} 点玩家伤害`
          : `战斗结束 · ${winner}${battle.winner === 'draw' ? '存活更多' : '获胜'}`;
      }
      paintBattle(playback);
    }
    if (view.phase === 'combat' && elapsed < playback.duration) state.battleFrame = requestAnimationFrame(renderFrame);
  };
  if (state.battleFrame !== null) cancelAnimationFrame(state.battleFrame);
  renderFrame(performance.now());
}

function unitImage(id) {
  const safe = String(id || '').replace(/[^\w-]/g, '');
  return safe ? `assets/units_big/${safe}.webp` : '';
}

// Same atlas order and card hierarchy as the classic recruitment tray.
const shopTraitOrder = ['深海','星际','毛茸乐园','音律','四禧丸子','学园','夜幕','花语','魔道','森之国','工造','P-SP','刀客','守护','游侠','刺客','法师','咒术','医者','歌势','偶像','狂战'];
function shopTraits(unit) {
  return [...new Set([unit.fac,unit.fac2,unit.job,unit.job2].filter(Boolean).flatMap(name=>name.split('/')))].slice(0,3).map(name=>{
    const index=shopTraitOrder.indexOf(name);
    const icon=index<0?'':`<i class="shop-trait-icon" aria-hidden="true" style="--syn-x:${index%5*25}%;--syn-y:${Math.floor(index/5)*25}%"></i>`;
    return `<span class="shop-trait" title="${escapeHtml(name)}">${icon}${escapeHtml(name)}</span>`;
  }).join('');
}

function unitTitle(unit) {
  return `${unit.name || unit.id || '未知棋子'} · ${unit.star || 1} 星 · ${unit.cost || 1} 金币`;
}

const statusNames={stun:'眩晕',freeze:'冻结',silence:'沉默',slow:'减速',taunt:'嘲讽',poison:'中毒',noShield:'禁盾',hasteT:'加速',attackBuffT:'强化',drT:'减伤',woundT:'易伤',weakenT:'虚弱',healDownT:'重伤',arDownT:'破甲',mrDownT:'减抗',reflectT:'反伤',blockT:'格挡',petrifyT:'石化',healLock:'禁疗',counterT:'盾破反击',tempoT:'心拍',hex:'变形',phaseT:'潜行'};
const itemNames = Object.fromEntries(Object.entries(EQUIPMENT).map(([id,item])=>[id,item.n]));
const itemEffects = Object.fromEntries(Object.entries(EQUIPMENT).map(([id,item])=>[id,item.desc]));
const skillModes = {
  guard:'自身护盾与嘲讽', guardLink:'护盾、嘲讽与队友分担伤害', dash:'突进并攻击目标',
  cleave:'攻击附近多个敌人', single:'对目标造成技能伤害', heal:'治疗队友',
  team:'强化或治疗全队', teamShield:'为全队提供护盾', support:'回复队友法力与生命',
  chain:'弹射攻击多个敌人', zone:'攻击并控制目标区域', field:'范围技能',
  combo:'连续攻击', passive:'普通攻击触发被动效果',
};
function attackText(id){const p=classicAttackProfile(id);const styles={blade:'弧形刃光',shot:'追踪箭矢',arc:'棱晶法弹',pulse:'节拍光环',burst:'碎星爆点'};const effects={none:'稳定命中',bleed:`${Math.round(p.proc*100)}% 概率造成流血`,slow:`${Math.round(p.proc*100)}% 概率减速`,spark:`${Math.round(p.proc*100)}% 概率溅射电弧`,mana:'命中时额外回蓝',shieldbreak:'优先攻击护盾目标，破盾后强化下一击',rainveil:'雨露闪避后召唤雨幕护盾',soulmate:'命中时与队友共享治疗'};return `${styles[p.style]} · ${effects[p.onHit]||'专属命中回响'}（${Math.round(p.mult*100)}% 攻击）`;}
function skillText(skill) {
  if(skill?.desc)return skill.desc;
  if (!skill) return '本棋子没有联机技能数据。';
  const parts = [skillModes[skill.mode] || '发动技能'];
  if (skill.mult) parts.push(`伤害 ${Math.round(skill.mult * 100)}% 攻击`);
  if (skill.heal) parts.push(`治疗 ${Math.round(skill.heal * 100)}% 攻击`);
  if (skill.shield) parts.push(`护盾 ${Math.round(skill.shield * 100)}% 最大生命`);
  if (skill.stun) parts.push(`眩晕 ${skill.stun / 1000} 秒`);
  if (skill.freeze) parts.push(`冻结 ${skill.freeze / 1000} 秒`);
  if (skill.silence) parts.push(`沉默 ${skill.silence / 1000} 秒`);
  return parts.join(' · ');
}
function renderInspect() {
  const inspected = state.inspected;
  const unit = inspected?.battle
    ? state.battlePlayback?.units.find(item => item.uid === inspected.uid)
    : [...(state.view?.me?.board || []), ...(state.view?.me?.bench || []),
       ...(state.spectateSeat!=null ? state.view?.players?.find(p => p.seat === state.spectateSeat)?.board || [] : [])]
      .find(item => item && String(item.uid) === inspected?.uid);
  $('closeInspectBtn').hidden = !unit;
  if (!unit) {
    state.inspected = null;
    $('unitInspect').innerHTML = '<p class="empty-message">点击场上、备战席或战斗中的棋子查看属性、技能和装备。</p>';
    return;
  }
  const stats = previewUnit(unit);
  if (!stats) return;
  const shown = inspected.battle ? {...stats,atk:unit.atk ?? stats.atk,speed:unit.speed ?? stats.speed,
    range:unit.range ?? stats.range,armor:unit.armor ?? stats.armor,resist:unit.resist ?? stats.resist} : stats;
  const hp = inspected.battle ? Math.round(unit.hp ?? stats.hp) : stats.hp;
  const mp = inspected.battle ? Math.round(unit.mana ?? 0) : 0;
  const items = (unit.items || []).map(id => `<span class="inspect-item" title="${escapeHtml(itemEffects[id] || '联机装备效果')}">${escapeHtml(itemNames[id] || id)}<small>${escapeHtml(itemEffects[id] || '复合装备')}</small></span>`).join('');
  $('unitInspect').innerHTML = `<div class="inspect-heading"><img src="${unitImage(unit.id)}" alt=""><div><strong>${escapeHtml(unit.name || unit.id)}</strong><span>${'★'.repeat(unit.star || 1)} · ${unit.cost || 1} 金币</span><small>${escapeHtml([unit.fac,unit.fac2,unit.job,unit.job2].filter(Boolean).join(' · '))}</small></div></div>
    <div class="inspect-stat-grid"><span>生命 <b>${hp} / ${inspected.battle ? unit.maxhp || stats.hp : stats.hp}</b></span><span>攻击 <b>${shown.atk}</b></span><span>攻速 <b>${shown.speed.toFixed(2)}/秒</b></span><span>射程 <b>${shown.range} 格</b></span><span>护甲 <b>${shown.armor}</b></span><span>魔抗 <b>${Math.round(shown.resist * 100)}%</b></span><span>形式 <b>${stats.melee ? '近战' : '远程'} · ${stats.damageType === 'phys' ? '物理' : '法术'}</b></span>${inspected.battle ? `<span>法力 <b>${mp} / ${unit.maxmana || 50}</b></span>` : ''}</div>
    <div class="inspect-skill inspect-attack"><strong>普攻特性</strong><p>${escapeHtml(attackText(unit.id))}</p></div><div class="inspect-skill"><strong>✦ ${escapeHtml(SKILL_NAMES[unit.id] || '战斗技能')}（${stats.skill?.mode === 'passive' ? '被动' : '主动'}）</strong><p>${escapeHtml(skillText(stats.skill))}</p><p>${escapeHtml(CLASSIC_MARKS[unit.id]?`专属印记【${CLASSIC_MARKS[unit.id].label}】：${stats.skill?.mode==='passive'?'普攻后留给目标':'技能命中后留给目标，治疗/保护技能留给自身'}，下次受伤增伤/减伤 ${Math.round(CLASSIC_MARKS[unit.id].amp*100)}%，持续 ${CLASSIC_MARKS[unit.id].dur} 秒。`: '')}</p></div>
    ${inspected.battle ? `<div class="inspect-live-grid"><span>护盾 <b>${Math.round(unit.shield||0)}</b></span><span>伤害 <b>${Math.round(unit.damage||0)}</b></span><span>承伤 <b>${Math.round(unit.taken||0)}</b></span><span>治疗 <b>${Math.round(unit.healing||0)}</b></span><span>施法 <b>${unit.casts||0}</b></span><span>击杀 <b>${unit.kills||0}</b></span></div><p class="inspect-status">${escapeHtml((unit.statuses||[]).map(key=>statusNames[key]||key).join(' · ')||'无异常状态')}</p>` : ''}
    ${unit.sigMark?`<p class="inspect-status">【${escapeHtml(unit.sigMark.label)}】${unit.sigMark.guard?'下次受击减伤':'下次受伤增伤'} ${Math.round(unit.sigMark.amp*100)}%</p>`:''}
    <div class="inspect-equipment"><strong>装备</strong><div>${items || '<span class="muted">暂无装备</span>'}</div></div>`;
}
function inspectUnit(unit, battle = false) {
  if (!unit) return;
  state.inspected = {uid:String(unit.uid),battle};
  renderInspect();
}

function preparationPiece(unit,selected){
  const owned=[...(state.view?.me?.board||[]),...(state.view?.me?.bench||[])].filter(Boolean);
  const pair=unit.star===1&&owned.filter(u=>u.id===unit.id&&u.star===1).length>=2;
  const traits=[unit.fac,unit.fac2,unit.job,unit.job2].filter(Boolean);
  const items=(unit.items||[]).map(id=>EQUIPMENT[id]?.e||'').join('');
  const inner=ClassicPreparationPresentation.inner(unit,{traits,items});
  return `<span class="unit prep-unit cost${unit.cost||1} ${selected?'sel':''} ${pair?'pair':''}" data-uid="${unit.uid}">${inner}</span>`;
}

function renderUnitSlot(unit, zone, slot) {
  const selected = state.selected?.uid === unit?.uid;
  const canMove = canAct() && !!state.selected && !unit;
  if (!unit) return `<button type="button" class="unit-slot empty ${canMove ? 'can-move' : ''}" data-zone="${zone}" data-slot="${slot}" ${canAct() ? '' : 'disabled'} aria-label="${zone === 'board' ? '棋盘' : '备战席'}空位 ${slot + 1}">${canMove ? '移至此处' : '空位'}</button>`;
  return `<button type="button" draggable="${canAct()}" class="unit-slot ${selected?'selected':''}" data-zone="${zone}" data-slot="${slot}" aria-label="查看 ${escapeHtml(unitTitle(unit))}">${preparationPiece(unit,selected)}</button>`;
}

// The server stores all 64 stage cells; only the lower 32 are deployable.
function renderBoard(board,readOnly=false) {
  const focus=(board||[]).findIndex(unit=>unit&&String(unit.uid)===state.inspected?.uid&&!state.inspected?.battle);const reach=focus>=0?previewUnit(board[focus])?.range||0:0;
  const rangeClass=cell=>focus<0?'':cell===focus?' rng-src':Math.abs(cell%8-focus%8)+Math.abs(Math.floor(cell/8)-Math.floor(focus/8))<=reach?' rng-hl':'';
  return Array.from({length:64}, (_, cell) => {
    const side = cell < 32 ? 'enemy-side' : 'own-side';
    if (cell < 32) return `<div class="battle-cell ${side}${rangeClass(cell)}" aria-hidden="true"></div>`;
    const unit = board?.[cell];
    const selected = state.selected?.uid === unit?.uid;
    const canMove = !readOnly && canAct() && !!state.selected && !unit;
    const label = unit ? `${unitTitle(unit)}，第 ${Math.floor(cell / 8) - 3} 排第 ${cell % 8 + 1} 列${selected ? '，已选中' : ''}` : `第 ${Math.floor(cell / 8) - 3} 排第 ${cell % 8 + 1} 列${canMove ? '，可移入' : '，空位'}`;
    return `<div class="battle-cell ${side} deploy-cell${rangeClass(cell)}"><button type="button" draggable="${!!unit && canAct() && !readOnly}" class="board-position ${unit ? 'occupied' : 'empty'} ${selected ? 'selected' : ''} ${canMove ? 'can-move' : ''}" data-zone="board" data-slot="${cell}" ${unit || (canAct() && !readOnly) ? '' : 'disabled'} aria-label="${escapeHtml(label)}">${unit ? preparationPiece(unit,selected) : ''}</button></div>`;
  }).join('');
}

function renderGame() {
  const view = state.view;
  document.body.dataset.phase = view?.phase || '';
  if(view&&state.audioPhase!==`${view.round}:${view.phase}`){state.audioPhase=`${view.round}:${view.phase}`;if(view.phase==='combat')audio.sfx('battleStart');if(view.phase==='result'){const result=view.results?.find(r=>r.a===state.seat||r.b===state.seat);if(result)audio.sfx(result.winner===state.seat?'win':'lose');audio.stopBattle();}}
  if (!view) {
    $('phaseLabel').textContent = '正在同步';
    $('roundTitle').textContent = '等待对局数据';
    return;
  }
  const players = view.players || [];
  if (isSpectator()) {
    if (!players.some(player => player.seat === state.spectateSeat && player.alive !== false)) {
      state.spectateSeat = players.find(player => player.alive !== false)?.seat ?? null;
    }
  } else if(state.spectateSeat!=null&&!players.some(p=>p.seat===state.spectateSeat))state.spectateSeat=null;
  if (view.phase !== 'prep') state.selected = null;
  updateCountdown();
  renderBattlePlayback(view);
  $('arenaPanel').hidden = view.phase === 'combat' && !$('combatPanel').hidden;
  $('roundTitle').textContent = `第 ${view.round ?? '—'} 回合`;
  const me = view.me || {};
  const xpRequired = xpNeeded(me.level || 1);
  const maxLevel = (me.level || 1) >= MAX_LEVEL;
  $('levelProgressText').textContent = maxLevel ? '等级 11 · 已满级' : `等级 ${me.level || 1} · ${me.xp || 0} / ${xpRequired} 经验`;
  $('levelProgressNext').textContent = maxLevel ? '最高等级' : `再需 ${Math.max(0,xpRequired - (me.xp || 0))} 经验`;
  $('levelProgressFill').style.width = `${maxLevel ? 100 : Math.min(100,(me.xp || 0) / xpRequired * 100)}%`;
  $('levelProgressTrack').setAttribute('aria-valuenow',String(maxLevel ? 1 : me.xp || 0));
  $('levelProgressTrack').setAttribute('aria-valuemax',String(maxLevel ? 1 : xpRequired));
  const stats = [
    ['生命', me.hp ?? '—'], ['金币', me.gold ?? '—'], ['等级', me.level ?? '—'], ['经验', me.xp ?? '—'],
  ];
  $('playerStats').innerHTML = stats.map(([label,value]) => `<span class="stat">${label} <b>${escapeHtml(value)}</b></span>`).join('');
  $('aliveCount').textContent = `${players.filter(p => p.alive !== false).length} 人存活`;
  $('scoreboard').innerHTML = [...players].sort((a,b) => (b.hp || 0) - (a.hp || 0)).map((p,index) => `<li class="score-item ${p.seat === state.seat ? 'mine' : ''} ${p.alive === false ? 'out' : ''} ${p.seat === state.spectateSeat ? 'watching' : ''}"><button type="button" class="score-button" data-watch="${p.seat}"  aria-label="观战 ${escapeHtml(p.name || playerName(p.seat))}"><span class="place">${p.place ? `#${p.place}` : String(index + 1).padStart(2,'0')}</span><span class="name">${escapeHtml(p.name || playerName(p.seat))}${p.seat === state.seat ? ' · 你' : ''}</span><span class="hp">${escapeHtml(p.hp ?? 0)} HP</span><span class="seat-hp-track" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,(p.hp||0)/40*100))}%"></i></span></button></li>`).join('');
  const pairing = view.pairings?.find(p => p.a === state.seat || p.b === state.seat);
  $('pairingText').textContent = pairing ? pairing.b == null ? '本轮轮空' : `本轮对手：${playerName(pairing.a === state.seat ? pairing.b : pairing.a)}` : '本轮配对尚未公布';
  const watched = state.spectateSeat!=null ? players.find(p => p.seat === state.spectateSeat) : null;
  const boardOwner = watched || me;
  $('arenaTitle').textContent = watched ? `观战 · ${watched.name}` : '上阵棋盘';
  $('boardCount').textContent = `${(boardOwner.board || []).filter(Boolean).length} / ${boardOwner.level || 1}`;
  $('boardGrid').innerHTML = renderBoard(boardOwner.board || Array(64).fill(null),!!watched&&watched.seat!==state.seat);
  $('benchGrid').innerHTML = (me.bench || Array(8).fill(null)).map((unit,slot) => renderUnitSlot(unit,'bench',slot)).join('');
  const bonds = bondSummary(boardOwner.board);
  $('bondList').innerHTML = bonds.length ? bonds.map(bond=>{
    const tier=bond.tiers.filter(n=>bond.count>=n).length,next=bond.tiers.find(n=>n>bond.count)||bond.tiers.at(-1);
    const descriptions=globalThis.ClassicBondRules.descriptions[bond.name]||[];
    return `<div class="bond-row ${bond.active?'active':''}"><div class="bond-top">${ClassicPreparationPresentation.icon(bond.name)}<strong>${escapeHtml(bond.name)}</strong><span class="bond-pips">${bond.tiers.map((n,i)=>`<i class="${bond.count>=n?'on':''}">●</i>`).join('')}</span><b>${bond.count}/${next}</b></div><p>${escapeHtml(tier?`T${tier} ${descriptions[Math.min(tier-1,descriptions.length-1)]||''}`:`未激活 · 还需 ${Math.max(0,next-bond.count)} 名不同棋子`)}</p></div>`;
  }).join('') : '<p class="empty-message">上阵棋子后显示羁绊档位。</p>';
  $('inventoryList').innerHTML = (me.items || []).length
    ? me.items.map((id,index) => `<button type="button" class="button inventory-item" draggable="${canAct()}" data-equip="${index}" ${canAct() ? '' : 'disabled'}>${escapeHtml(itemNames[id] || id)}<small>${escapeHtml(itemEffects[id] || '复合装备')} · ${state.selected ? '装备给所选棋子' : '先选择棋子'}</small></button>`).join('')
    : '<p class="empty-message">暂无道具。后续回合会获得装备。</p>';
  const pairs=[];
  for(let a=0;a<(me.items||[]).length;a++)for(let b=a+1;b<me.items.length;b++){
    const result=recipe(me.items[a],me.items[b]);if(result)pairs.push(`<button class="button" data-combine-a="${a}" data-combine-b="${b}" ${canAct()?'':'disabled'} title="${escapeHtml(EQUIPMENT[result].desc)}">${escapeHtml(itemNames[me.items[a]])} + ${escapeHtml(itemNames[me.items[b]])} → ${escapeHtml(itemNames[result])}</button>`);
  }
  $('equipmentRecipes').innerHTML=pairs.join('') || '<p class="empty-message">凑齐两件基础装备即可合成。</p>';
  const selected=[...(me.board||[]),...(me.bench||[])].find(unit=>unit?.uid===state.selected?.uid);
  const inspectedUnit=[...(me.board||[]),...(me.bench||[])].find(unit=>String(unit?.uid)===state.inspected?.uid)||selected;
  $('unitLoadout').innerHTML=inspectedUnit?`<p>${escapeHtml(inspectedUnit.name||inspectedUnit.id)} · ${(inspectedUnit.items||[]).length}/3 格</p><div class="loadout-slots">${Array.from({length:3},(_,i)=>{const id=inspectedUnit.items?.[i],item=EQUIPMENT[id];return `<span title="${escapeHtml(item?.desc||'空装备位')}">${item?`${escapeHtml(item.e)} ${escapeHtml(item.n)}`:'空位'}</span>`;}).join('')}</div>`:'<p>点击棋子查看穿戴情况，也可把背包装备拖到棋子上。</p>';
  $('combineWornBtn').disabled=!canAct()||!selected||!recipe(selected.items[0],selected.items[1]);
  $('economyInfo').textContent=`利息 +${interestGain(me.gold||0)} · 连胜/败 ${Math.abs(me.streak||0)}`;
  $('shopOdds').textContent=(SHOP_ODDS[Math.min(MAX_LEVEL,me.level||2)]||[]).map((chance,i)=>`${i+1}费 ${chance}%`).join(' · ');
  $('shopList').innerHTML = (me.shop || Array(5).fill(null)).map((unit,slot) => {
    if (!unit) return `<div class="shop-unit classic-shop-card sold" aria-label="第 ${slot+1} 格已售出"><span>已售出</span></div>`;
    const src = unitImage(unit.id);
    const copies=[...(me.board||[]),...(me.bench||[])].filter(owned=>owned?.id===unit.id&&owned.star===1).length;
    const badge=copies>=2?'对子·可升星':copies===1?'1/3':'';
    return `<button type="button" class="shop-unit classic-shop-card cost${unit.cost}${copies>=2?' paircard':''}" data-buy="${slot}" ${canAct() && (me.gold ?? 0) >= unit.cost ? '' : 'disabled'} aria-label="购买 ${escapeHtml(unit.name || unit.id)}，${unit.cost} 金币" title="${escapeHtml(unit.name || unit.id)} · ${unit.cost} 金币 · 生命 ${unit.hp} · 攻击 ${unit.atk}"><span class="shop-artbg" style="background-image:url('${src}')" aria-hidden="true"></span><span class="shop-costbar" aria-hidden="true"></span>${badge?`<span class="shop-owned-badge">${badge}</span>`:''}<span class="shop-name">${escapeHtml(unit.name || unit.id)}</span><span class="shop-traits">${shopTraits(unit)}</span><span class="shop-card-stats"><span class="shop-card-hp" title="生命" aria-label="生命 ${unit.hp}">♥ ${unit.hp}</span><span class="shop-card-atk" title="攻击" aria-label="攻击 ${unit.atk}">♠ ${unit.atk}</span><b class="shop-card-cost" title="${unit.cost} 金币">${unit.cost}</b></span></button>`;
  }).join('');
  const results = view.results || [];
  $('resultCaption').textContent = results.length ? `${results.length} 场对战` : '尚未结算';
  $('resultsList').innerHTML = results.length ? results.map(result => {
    const left = playerName(result.a);
    const right = result.b == null ? '轮空' : playerName(result.b);
    const winner = result.winner == null ? '未分胜负' : playerName(result.winner);
    return `<div class="result ${result.a === state.seat || result.b === state.seat ? 'mine' : ''}">${escapeHtml(left)} VS ${escapeHtml(right)}<br><strong>${escapeHtml(winner)}胜</strong>${result.damage ? ` · ${escapeHtml(result.damage)} 伤害` : ''}</div>`;
  }).join('') : '<p class="empty-message">对战结束后将在这里显示战果。</p>';
  if (state.selected) {
    const found = [...(me.board || []), ...(me.bench || [])].some(unit => unit?.uid === state.selected.uid);
    if (!found) state.selected = null;
  }
  $('selectionBar').hidden = !state.selected;
  $('selectionText').textContent = state.selected ? `已选择 ${state.selected.name} · 点击棋盘或备战席空位移动` : '';
  renderInspect();
}

function renderControls() {
  const lobby = state.lobby;
  $('lobbyReadyBtn').disabled = !state.connected || !state.synced || lobby?.status !== 'waiting';
  const active = canAct();
  const me = state.view?.me || {};
  $('rerollBtn').disabled = !active || (me.gold ?? 0) < 2;
  $('buyXpBtn').disabled = !active || (me.gold ?? 0) < 5 || me.level >= MAX_LEVEL;
  const mine = state.view?.players?.find(p => p.seat === state.seat);
  $('gameReadyBtn').disabled = !active || !!mine?.ready;
  $('gameReadyBtn').textContent = mine?.ready ? '已锁定阵容' : '锁定阵容 · 结束备战';
  $('sellBtn').disabled = !active || !state.selected;
  $('autoDeployBtn').disabled = !active || ![...(me.board || []),...(me.bench || [])].some(Boolean);
  $('tidyBenchBtn').disabled = !active || !(me.bench || []).some(Boolean);
  $('lockShopBtn').disabled = !active;
  $('lockShopBtn').textContent = me.shopLocked ? '解锁商店 (L)' : '锁商店 (L)';
  $('lockShopBtn').setAttribute('aria-pressed',String(!!me.shopLocked));
  $('autoEquipBtn').disabled = !active || !me.items?.length || !(me.board || []).some(unit => unit && unit.items.length < 3);
  $('unequipBtn').disabled = !active || !state.selected || ![...(me.board || []),...(me.bench || [])].some(unit => unit?.uid === state.selected.uid && unit.items.length);
  $('actionHint').textContent = !state.connected ? '连接中断，操作暂不可用。'
    : !state.synced ? '正在同步服务器状态，请稍候。'
    : state.pendingAction ? '上一项操作正在确认，请稍候。'
    : isSpectator() ? '你已淘汰。点击八席战况中的玩家可观看其棋盘。'
    : state.view?.phase === 'prep' ? '购买棋子，布置站位，然后锁定阵容。'
    : state.view?.phase === 'over' ? '本局对战结束。'
    : '等待本轮结算，随后进入下一轮备战。';
}

function handleSlotClick(event) {
  const target = event.target.closest('[data-zone][data-slot]');
  if (!target) return;
  const zone = target.dataset.zone;
  const slot = Number(target.dataset.slot);
  if(zone==='board'&&state.spectateSeat!=null&&state.spectateSeat!==state.seat){const owner=state.view?.players?.find(p=>p.seat===state.spectateSeat);if(owner?.board?.[slot])inspectUnit(owner.board[slot]);return;}
  const unit = (isSpectator() && zone === 'board'
    ? state.view?.players?.find(p => p.seat === state.spectateSeat)?.board
    : state.view?.me?.[zone])?.[slot];
  if (unit) {
    inspectUnit(unit);
    if (canAct()) state.selected = state.selected?.uid === unit.uid ? null : {uid:unit.uid,name:unit.name || unit.id};
    renderGame();
    renderControls();
    return;
  }
  if (!canAct()) return;
  if (state.selected) {
    sendAction({type:'move', uid:state.selected.uid, to:{zone,slot}});
    state.selected = null;
    renderGame();
    renderControls();
  }
}

$('apiBase').value = state.api;
for (const [id,type] of [['autoDeployBtn','autoDeploy'],['tidyBenchBtn','tidy'],['lockShopBtn','lockShop'],['autoEquipBtn','autoEquip']]) {
  $(id).addEventListener('click',()=>sendAction({type}));
}
$('unequipBtn').addEventListener('click',()=>{if(state.selected)sendAction({type:'unequip',uid:state.selected.uid});});
$('combineWornBtn').addEventListener('click',()=>{if(state.selected)sendAction({type:'combineWorn',uid:state.selected.uid});});
$('equipmentRecipes').addEventListener('click',event=>{const button=event.target.closest('[data-combine-a]');if(button)sendAction({type:'combine',a:Number(button.dataset.combineA),b:Number(button.dataset.combineB)});});
for (const id of ['boardGrid','benchGrid']) $(id).addEventListener('contextmenu',event=>{
  const target=event.target.closest('[data-zone][data-slot]');
  if(target?.dataset.zone==='board'&&state.spectateSeat!=null&&state.spectateSeat!==state.seat)return;
  const unit=state.view?.me?.[target?.dataset.zone]?.[Number(target?.dataset.slot)];
  if(!unit||!canAct())return;
  event.preventDefault();sendAction({type:'unequip',uid:unit.uid});
});
window.addEventListener('keydown',event=>{
  if(!document.body.classList.contains('online-playing')||!canAct()||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
  if(event.target?.closest?.('input,textarea,select,[contenteditable],dialog')||document.querySelector('dialog[open]'))return;
  const buttons={r:'autoDeployBtn',a:'autoDeployBtn',t:'tidyBenchBtn',d:'rerollBtn',f:'buyXpBtn',l:'lockShopBtn',e:'sellBtn',x:'sellBtn',delete:'sellBtn',' ':'gameReadyBtn'};
  // Physical keys preserve classic controls when a non-Latin keyboard layout is active.
  const key=/^Key[A-Z]$/.test(event.code)?event.code.slice(3).toLowerCase():event.key.toLowerCase();
  const id=buttons[key];
  if(id){event.preventDefault();if(!$(id).disabled)$(id).click();}
});
$('playerName').value = localStorage.getItem(NAME_STORAGE) || '';
const inviteCode = new URL(location.href).searchParams.get('room');
if (inviteCode) $('roomCodeInput').value = inviteCode.toUpperCase();
updateResume();
$('createBtn').addEventListener('click', () => enterRoom('create'));
$('joinBtn').addEventListener('click', () => enterRoom('join'));
$('resumeBtn').addEventListener('click', resumeRoom);
$('roomCodeInput').addEventListener('keydown', event => { if (event.key === 'Enter') enterRoom('join'); });
$('lobbyReadyBtn').addEventListener('click', () => {
  const mine = state.lobby?.players?.find(p => p.seat === state.seat);
  send({type:'ready', ready:!mine?.ready, id:crypto.randomUUID?.() || String(Date.now())});
});
$('addBotBtn').addEventListener('click', addBot);
$('lobbySeats').addEventListener('click', event => {
  const button = event.target.closest('[data-kickbot]');
  if (button) removeBot(Number(button.dataset.kickbot));
});
$('rerollBtn').addEventListener('click', () => sendAction({type:'reroll'}));
$('buyXpBtn').addEventListener('click', () => sendAction({type:'buyXp'}));
$('gameReadyBtn').addEventListener('click', () => sendAction({type:'ready'}));
$('sellBtn').addEventListener('click', () => {
  if (!state.selected) return;
  sendAction({type:'sell',uid:state.selected.uid});
  state.selected = null;
  renderGame();
  renderControls();
});
$('cancelSelectionBtn').addEventListener('click', () => { state.selected = null; renderGame(); renderControls(); });
$('boardGrid').addEventListener('click', handleSlotClick);
$('benchGrid').addEventListener('click', handleSlotClick);
$('battleArena').addEventListener('click', event => {
  const button = event.target.closest('[data-inspect-battle]');
  const unit = state.battlePlayback?.units.find(item => item.uid === button?.dataset.inspectBattle);
  if (unit) inspectUnit(unit,true);
});
$('closeInspectBtn').addEventListener('click', () => { state.inspected = null; renderInspect(); });
$('scoreboard').addEventListener('click', event => {
  const button = event.target.closest('[data-watch]');
  if (button) {
    const seat=Number(button.dataset.watch);state.spectateSeat=seat===state.seat?null:seat;
    state.selected=null;
    renderGame();
    renderControls();
  }
});
$('shopList').addEventListener('click', event => {
  const button = event.target.closest('[data-buy]');
  if (button) sendAction({type:'buy',slot:Number(button.dataset.buy)});
});
$('inventoryList').addEventListener('click', event => {
  const button = event.target.closest('[data-equip]');
  if (button && state.selected) {
    sendAction({type:'equip', uid:state.selected.uid, itemIndex:Number(button.dataset.equip)});
    state.selected = null;
    renderGame();
    renderControls();
  } else if(button)toast('选择棋子后点击装备，或将装备拖到棋子身上。');
});
$('copyInviteBtn').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('room', state.code);
  try { await navigator.clipboard.writeText(url.toString()); toast('邀请链接已复制。'); }
  catch { toast(`房间码：${state.code}`); }
});
$('leaveBtn').addEventListener('click', async () => {
  if ($('leaveBtn').disabled) return;
  $('leaveBtn').disabled=true;
  try {
    if (state.code && state.session?.token) await request(`/api/rooms/${encodeURIComponent(state.code)}/leave`,{token:state.session.token});
  } catch (error) {
    if (![401,404].includes(error.status)) {
      setError(`退出失败：${error.message}`,true);
      $('leaveBtn').disabled=false;
      return;
    }
  }
  closeSocket();
  state.code = '';
  state.view = state.lobby = null;
  state.selected = null;
  state.session=null;
  localStorage.removeItem(STORAGE);
  updateResume();
  $('leaveBtn').disabled=false;
  showEntry();
});

if (inviteCode && state.session?.code === inviteCode.toUpperCase()) {
  $('playerName').value = state.session.name || $('playerName').value;
  $('apiBase').value = state.session.api || state.api;
  resumeRoom();
}
setInterval(updateCountdown, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeTransport(); });
window.addEventListener('online', resumeTransport);
window.addEventListener('offline', () => { if (!state.stopped) retryConnection(); });

$('battleDamage').addEventListener('click',event=>{const mode=event.target.closest('[data-stat]')?.dataset.stat;if(['damage','healing','taken'].includes(mode)){state.statMode=mode;if(state.battlePlayback)paintBattle(state.battlePlayback);}});
