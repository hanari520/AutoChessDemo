import '../tools/preparation-presentation.js?v=1';
import '../tools/bond-runtime.js';
import { postJson, reconnectDelay, reconcileAction } from './connection.js';
import { MAX_LEVEL, xpNeeded, interestGain, sellRefund, SHOP_ODDS } from './economy.js';
import { createBattleEffects } from './battle-effects.js?v=1';
import { bondSummary, previewUnit, ROSTER_LIST } from './combat.js';
import { UNIT_NAMES } from './core.js';
import { SKILL_NAMES } from './skill-names.js';
import { EQUIPMENT, recipe } from './equipment.js';
import { CLASSIC_SKILLS, CLASSIC_MARKS, classicAttackProfile } from './skill-catalog.js';
import { mountCodex } from './codex.js?v=2';
import '../tools/battle-audio.js?v=1';

/* ============================================================================
   八人联机 · 经典模式操作界面
   DOM 结构、渲染函数与交互（拖拽 / 点选 / 快捷键 / 出售 / 装备 / 战斗层）逐段照搬
   index.html 的经典实现；差异仅两处：
   ①状态来源是服务器快照（state.view），动作走 WS（sendAction），移动/出售/装备做乐观渲染；
   ②右侧增加「八人战况」面板（经典 arenaPanel 同款样式），展示 8 名玩家血量与名次。
   ============================================================================ */

const $ = (id) => document.getElementById(id);
mountCodex();
ensureCastFeed();
const BOARD_W = 8, BOARD_H = 8, BENCH = 8;
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

const STORAGE = 'star-stage-online-session-v1';
const API_STORAGE = 'star-stage-online-api-v1';
const NAME_STORAGE = 'star-stage-online-name-v1';
const INVITE_STORAGE = 'star-stage-online-invitation-v1';
const AUTO_INSPECT_KEY = 'vc_autoinspect';
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
  code: '', seat: null, lobby: null, view: null, socket: null,
  connected: false, busy: false, seq: 1, pendingAction: null, actionQueue: [],
  invitation: '',
  deadline: null, phaseDurationMs: null, clockSkew: 0, spectateSeat: null,
  reconnectTimer: null, reconnectAttempts: 0, stopped: true,
  connectionTimer: null, heartbeatTimer: null, heartbeatDeadline: null,
  actionTimer: null, synced: false, lastMessageAt: 0, awaitingSync: false,
  battlePlayback: null, battleFrame: null,
  selUid: null, selItem: null, inspectUid: null, rangeFocus: null, moveSel: null,
  statMode: 'deal', logArr: [], audioPhase: '', openingSig: '',
};
let autoInspect = (()=>{ try{ return localStorage.getItem(AUTO_INSPECT_KEY)==='1' }catch(e){ return false } })();

const audio = globalThis.ClassicBattleAudio.create({speed:()=>1,silent:()=>false});
const sfx = (...args)=>audio.sfx(...args);

/* ===== 名册 / 标签工具（照搬经典 facsOf/jobsOf/synIconHTML 一族） ===== */
const byId = id => ROSTER_LIST.find(u => u.id === id);
const cname = u => UNIT_NAMES[u?.id] || u?.name || u?.id || '';
const facsOf = d => d ? (d.fac2 ? [d.fac, d.fac2] : [d.fac]) : [];
const jobsOf = d => d ? (d.job2 ? [d.job, d.job2] : [d.job]) : [];
const facLabel = d => d ? (d.fac2 ? d.fac+'/'+d.fac2 : d.fac) : '';
const jobLabel = d => d ? (d.job2 ? d.job+'/'+d.job2 : d.job) : '';
const SYN_IMG = {'深海':'shenhai','星际':'xingji','毛茸乐园':'maorong','音律':'yinlv','四禧丸子':'sixi','学园':'xueyuan','夜幕':'yemu','花语':'huayu','魔道':'modao','森之国':'senzhiguo','工造':'gongzao','P-SP':'psp','刀客':'daoke','守护':'shouhu','游侠':'youxia','刺客':'cike','法师':'fashi','咒术':'zhoushu','医者':'yizhe','歌势':'geshi','偶像':'ouxiang','狂战':'kuangzhan'};
const SYN_ICON_ORDER = Object.keys(SYN_IMG), SYN_ICON_INDEX = Object.create(null);
SYN_ICON_ORDER.forEach((k,i)=>SYN_ICON_INDEX[k]=i);
function synIconHTML(k, extra=''){
  const i = SYN_ICON_INDEX[k]; if(i===undefined) return '';
  return `<i class="syn-atlas${extra?' '+extra:''}" title="${k}" style="--syn-x:${(i%5)*25}%;--syn-y:${Math.floor(i/5)*25}%"></i>`;
}
const synIconsHTML = (d, on=false) => { const ks=[...facsOf(d),...jobsOf(d)];
  return ks.length?`<span class="syn">${ks.map(k=>SYN_IMG[k]?synIconHTML(k,`sy${on?' on':''}`):'').join('')}</span>`:''; };
function heroHue(id){
  let h=0x811c9dc5;
  for(const ch of String(id||'idol')) h=Math.imul(h^ch.charCodeAt(0),0x01000193);
  return (h>>>0)%360;
}
const itemStr = u => (u.items||[]).map(k=>EQUIPMENT[k]?.e||'').join('');
function pairCount(id){ // 同名 1★ 拥有数（备战席+场上）
  const me=state.view?.me; if(!me) return 0;
  return [...(me.board||[]),...(me.bench||[])].filter(u=>u&&u.id===id&&(u.star||1)===1).length;
}
const has2star = id => [...(state.view?.me?.board||[]),...(state.view?.me?.bench||[])].some(u=>u&&u.id===id&&(u.star||1)===2);
const has3star = id => [...(state.view?.me?.board||[]),...(state.view?.me?.bench||[])].some(u=>u&&u.id===id&&(u.star||1)>=3);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function unitImage(id){ const safe=String(id||'').replace(/[^\w-]/g,''); return safe?`assets/units_big/${safe}.webp`:''; }

/* ===== 技能文案（沿用联机端已有的目录化描述，与经典详情面板字段一致） ===== */
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
  if (!skill) return '本棋子没有技能数据。';
  const parts = [skillModes[skill.mode] || '发动技能'];
  if (skill.mult) parts.push(`伤害 ${Math.round(skill.mult * 100)}% 攻击`);
  if (skill.heal) parts.push(`治疗 ${Math.round(skill.heal * 100)}% 攻击`);
  if (skill.shield) parts.push(`护盾 ${Math.round(skill.shield * 100)}% 最大生命`);
  if (skill.stun) parts.push(`眩晕 ${skill.stun / 1000} 秒`);
  if (skill.freeze) parts.push(`冻结 ${skill.freeze / 1000} 秒`);
  if (skill.silence) parts.push(`沉默 ${skill.silence / 1000} 秒`);
  return parts.join(' · ');
}
const isPassive = u => previewUnit(u)?.skill?.mode==='passive';

/* ================= 会话 / 网络（沿用联机传输层） ================= */
function readSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE) || 'null'); }
  catch { return null; }
}
function saveSession(session) {
  state.session = session;
  localStorage.setItem(STORAGE, JSON.stringify(session));
  updateResume();
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
  url.search = ''; url.hash = '';
  return url.toString().replace(/\/$/, '');
}
const apiUrl = path => `${state.api}${path}`;
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
function removeQueuedAction(id) {
  if (typeof id === 'string') state.actionQueue = state.actionQueue.filter(queued => queued !== id);
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
  cancelAnimationFrame(state.battleFrame??0); state.battleFrame=null;
  state.battlePlayback?.renderer?.destroy(); state.battlePlayback=null;
  $('roomScreen').hidden = true;
  $('entryScreen').hidden = false;
  document.body.classList.remove('online-playing');
  setConnection('idle', '未连接');
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
}
async function request(path, data) { return postJson(apiUrl(path), data); }

async function verifyInvitation() {
  if (state.busy) return;
  const inviteCode = $('invitationCode').value.trim();
  if (!inviteCode) { setError('请先填写邀请码。'); $('invitationCode').focus(); return; }
  state.busy = true;
  $('invitationBtn').disabled = true;
  setError('');
  try {
    state.api = normalizedApi();
    await request('/api/invitation', {inviteCode});
    state.invitation = inviteCode;
    sessionStorage.setItem(INVITE_STORAGE, inviteCode);
    $('invitationForm').hidden = true;
    $('roomEntryFields').hidden = false;
    $('playerName').focus();
  } catch (error) {
    state.invitation = '';
    sessionStorage.removeItem(INVITE_STORAGE);
    setError(error.message || '邀请码验证失败，请稍后重试。');
  } finally {
    state.busy = false;
    $('invitationBtn').disabled = false;
  }
  if (state.invitation && inviteCodeParam && state.session?.code === inviteCodeParam.toUpperCase()) resumeRoom();
}

async function enterRoom(mode) {
  if (state.busy) return;
  if (!state.invitation) { setError('请先验证邀请码。'); $('invitationCode').focus(); return; }
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
      ? await request('/api/rooms', {name, inviteCode:state.invitation})
      : await request(`/api/rooms/${encodeURIComponent(code)}/join`, {
          name, inviteCode:state.invitation,
          ...(state.session?.code === code && state.session?.api === api ? {token: state.session.token} : {}),
        });
    if (!result.code || !result.token) throw new Error('联机服务未返回房间码或重连令牌。');
    closeSocket();
    state.code = result.code;
    state.seat = result.seat;
    state.lobby = result.lobby || null;
    state.view = null;
    state.logArr = [];
    saveSession({code: result.code, token: result.token, seat: result.seat, name, api});
    showRoom();
    connectSocket();
  } catch (error) {
    setConnection('offline', '连接失败');
    const raw = error.message || '';
    setError(/fetch|network|Failed|加载|服务器/i.test(raw)
      ? '连不上联机服务器：请检查「联机服务器地址」或稍后再试。'
      : (raw || '无法进入房间。'));
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
  state.actionQueue = [];
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
    log('⚠ 无法确认上一项操作的结果，已按服务器状态同步');
  } else if (outcome === 'stale') {
    toast('上一回合的操作已过期，未重新提交。');
  } else if (outcome === 'conflict') {
    toast('操作序号已变化，已按服务器状态同步。');
  }
  if (outcome !== 'unknown') {
    removeQueuedAction(pending.envelope.id);
    state.pendingAction = null;
  }
  if (outcome === 'conflict' || outcome === 'stale') state.actionQueue = [];
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
        removeQueuedAction(state.pendingAction.envelope.id);
        state.pendingAction = null;
        clearTimeout(state.actionTimer);
      }
      state.awaitingSync = false;
      state.code = message.code || state.code;
      state.seat = message.seat ?? state.seat;
      state.lobby = message.lobby || state.lobby;
      const prev = state.view;
      state.view = message.view ?? null;
      state.phaseDurationMs = message.phaseDurationMs;
      state.deadline = message.deadline ?? null;
      state.maintenance = !!message.maintenance;
      if (Number.isFinite(message.serverTime)) state.clockSkew = Date.now() - message.serverTime;
      if (Number.isInteger(message.nextSeq) && message.nextSeq > 0) state.seq = Math.max(state.seq, message.nextSeq);
      setConnection('online', '已连接');
      if (pendingOutcome !== 'unknown' && state.view && state.view.me?.board?.length !== 64) {
        setError('线上服务器尚未同步新版棋盘规则，请更新服务端后新建房间。', true);
      } else if (state.maintenance) setError('服务维护中，当前对局可继续。', true);
      else setError('', true);
      startHeartbeat(socket);
      render(prev);
    } else if (message.type === 'ack') {
      removeQueuedAction(message.id);
      if (state.pendingAction?.envelope.id === message.id) { state.pendingAction = null; clearTimeout(state.actionTimer); }
      if (Number.isInteger(message.seq)) state.seq = Math.max(state.seq, message.seq + 1);
      renderControls();
    } else if (message.type === 'pong') {
      clearTimeout(state.heartbeatDeadline);
      state.heartbeatDeadline = null;
    } else if (message.type === 'error') {
      if (!state.connected && message.code === 'auth_timeout') transientAuthTimeout = true;
      removeQueuedAction(message.id);
      if (state.pendingAction?.envelope.id === message.id) { state.pendingAction = null; clearTimeout(state.actionTimer); }
      const detail = message.message || message.code || '操作未完成。';
      if (state.connected) { setError('', true); toast(detail); log('⚠ '+detail); }
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
      return;
    }
    $('roomHint').textContent = '连接中断，正在自动重连…';
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
/* 动作发送：seq 在发送时即前移（服务端要求严格递增），在途动作仅保留最后一个用于断线重放；
   乐观渲染保证手感，服务器快照回来后整体校正。 */
function sendAction(action, {optimistic} = {}) {
  const readyToggle = action?.type === 'ready';
  if (readyToggle ? (state.view?.phase !== 'prep' || state.view?.autoLocked || isSpectator()) : !canAct()) return false;
  if (state.actionQueue.length >= 8) { toast('操作太快了，稍等一下。'); return false; }
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const envelope = {type:'action', id, seq:state.seq, round:state.view.round, action};
  state.seq++;
  state.actionQueue.push(id);
  state.pendingAction = {envelope, round:state.view.round, type:action.type};
  if (!send(envelope)) { state.pendingAction = null; state.seq--; state.actionQueue = state.actionQueue.filter(x=>x!==id); return false; }
  armActionTimeout();
  const key={buy:'buy',sell:'sell',reroll:'roll',buyXp:'lvlup',equip:'equip',autoEquip:'equip',unequip:'equip',combine:'equip',combineWorn:'equip',autoDeploy:'deploy',tidy:'tidy'}[action.type];
  if(key&&!optimistic)sfx(key);
  return true;
}

const compatibleBoard = () => !state.view || state.view.me?.board?.length === 64;
function canAct() {
  const mine = state.view?.players?.find(p => p.seat === state.seat);
  return compatibleBoard() && state.connected && state.synced && state.lobby?.status === 'playing'
    && state.view?.phase === 'prep' && !mine?.ready && !isSpectator();
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
function phaseName(phase) {
  return ({prep:'备战',combat:'对战中',result:'结算',over:'对局结束'})[phase] || '等待同步';
}
function inPrep() { return state.view?.phase === 'prep'; }
function myTurnBoard() { return state.view?.me?.board || Array(64).fill(null); }
function getAt(t,i){ return t==='board' ? myTurnBoard()[i] : state.view?.me?.bench?.[i]; }
function watchedPlayer(){ return state.spectateSeat!=null && state.spectateSeat!==state.seat
  ? state.view?.players?.find(p=>p.seat===state.spectateSeat) : null; }

/* ================= 施法播报条（#castFeed，与经典同款双槽卡片） =================
   经典由 tools/idol-ui-redesign.js 建；联机页不加载它，这里按同一 DOM 契约自建，
   复用 idol-redesign.css 的 #castFeed/.cf-item 样式；战斗中占位 26px 不推挤棋盘。 */
const CAST_GLYPHS = {cleave:'✦',dash:'➤',shred:'⌁',rapid:'»',massstun:'✧',massfreeze:'❄',masssilence:'♫',chain:'ϟ',frost:'❄',fireball:'☼',slam:'✹',hex:'◇',heal:'♡',aheal:'♫',teamshield:'✧',bulwark:'⬡',guard:'♡',poison:'❋',starfall:'✦',time:'◷'};
function ensureCastFeed(){
  let feed=$('castFeed');
  if(feed) return feed;
  const host=$('boardwrap'); if(!host) return null;
  feed=document.createElement('div'); feed.id='castFeed';
  feed.setAttribute('role','status'); feed.setAttribute('aria-live','polite');
  feed.innerHTML='<div class="cf-slot ally"></div><div class="cf-slot foe"></div>';
  host.insertBefore(feed, host.firstChild);
  return feed;
}
function castFeedPush(unit, isAlly){
  const feed=ensureCastFeed(); if(!feed||!unit) return;
  const slot=feed.querySelector(isAlly?'.cf-slot.ally':'.cf-slot.foe'); if(!slot) return;
  const kit=CLASSIC_SKILLS[unit.id]||{};
  const arch=String(kit.mode||'magic').replace(/[^a-z0-9-]/gi,'').toLowerCase();
  const item=document.createElement('div');
  item.className=`cf-item arch-${arch}`;
  item.style.setProperty('--hero-color', `hsl(${heroHue(unit.id)} 78% 66%)`);
  item.innerHTML=`<img src="${unitImage(unit.id)}" alt="${escapeHtml(cname(unit))}" draggable="false">`
    +`<b>${escapeHtml(cname(unit))}</b><span>${CAST_GLYPHS[arch]||'✦'} ${escapeHtml(SKILL_NAMES[unit.id]||'技能')}</span>`;
  slot.prepend(item);
  setTimeout(()=>item.classList.add('old'),1150);
  setTimeout(()=>item.classList.add('bye'),1750);
  setTimeout(()=>item.remove(),2100);
  slot.querySelectorAll('.cf-item:not(.bye)').forEach((stale,idx)=>{ if(idx>=2){stale.classList.add('bye');setTimeout(()=>stale.remove(),300);} });
}

/* ================= 战报（经典 #log） ================= */
function log(t){ state.logArr.unshift(t); if(state.logArr.length>60)state.logArr.pop(); renderLog(); }
function renderLog(){ const el=$('log'); if(el) el.innerHTML=state.logArr.map(x=>'· '+escapeHtml(x)).join('<br>'); }

/* ================= 渲染：棋子（照搬经典 unitInner/unitHTML） ================= */
function unitInner(u){
  const d=byId(u.id)||{};
  const st=(u.frozen>0?'❄':'')+(u.stun>0?'💫':'')+(u.atkDownT>0?'🔻':'')+(u.slowT>0?'🐌':'')
    +(u.noShieldT>0?'🔨':'')+(u.healDownT>0?'💉':'')+(u.silenceT>0?'🔇':'')+(u.tauntT>0?'🎯':'')
    +(u.hexT>0?'🐧':'')+(u.petrifyT>0?'🗿':'')+(u.arDownT>0?'🪓':'')+(u.mrDownT>0?'🔯':'');
  const fz = st ? `<span class="fz">${st}</span>` : '';
  const inBattle = u.side===0||u.side===1;
  if(!inBattle&&globalThis.ClassicPreparationPresentation)return ClassicPreparationPresentation.inner(u,{name:cname(u),items:itemStr(u),icons:synIconsHTML(d)});
  const w = u.hp!=null&&u.maxhp ? (u.hp/u.maxhp*100) : 100;
  const m = u.maxmana ? ((u.mana||0)/u.maxmana*100) : 0;
  const mp = inBattle ? ((u.isPassive||isPassive(u)) ? '<span class="sk">被动</span>'
      : `<div class="mpbar"><div class="mpfill" style="width:${m}%"></div></div>`) : '';
  return `<i class="pt" style="background-image:url(${unitImage(d.id)})"></i>${itemStr(u)?`<span class="its">${itemStr(u)}</span>`:''}${fz}${synIconsHTML(d,u.bvOn)}
    <span class="st">${'★'.repeat(Math.min(4,u.star||1))}</span>
    <span class="nm">${cname(u)}</span>
    ${mp}
    ${inBattle?`<div class="hpbar"><div class="hpfill" style="width:${Math.max(0,w)}%"></div></div>`:''}`;
}
function unitTitle(u){
  const d=byId(u.id)||{};
  return `${cname(u)} · ${'★'.repeat(u.star||1)} ${facLabel(d)}·${jobLabel(d)}\n攻击方式：${d.range>1?'远程':'近战'} · ${previewUnit(u)?.damageType==='phys'?'物理':'法术'}伤害\n普攻特性：${attackText(u.id)}\n${SKILL_NAMES[u.id]||'战斗技能'}（${isPassive(u)?'被动':'主动'}）\n${skillText(previewUnit(u)?.skill)}`
    + ((u.items&&u.items.length)?`\n装备：${u.items.map(k=>EQUIPMENT[k]?EQUIPMENT[k].n+'（'+EQUIPMENT[k].desc+'）':k).join('、')}`:'');
}
function unitHTML(u,sel){
  const d=byId(u.id)||{};
  const stCls=(u.frozen>0?'frozen ':'')+(u.stun>0?'stunned ':'')+(u.atkDownT>0?'weakened ':'')+(u.slowT>0?'slowed':'');
  let pairCls='';
  if((u.star||1)===1){ const n=pairCount(u.id); pairCls = n>=2?'pair':(n===1?'solo':''); }
  const tip=unitTitle(u).replace(/"/g,'&quot;').replace(/\n/g,'&#10;');
  return `<div class="unit prep-unit cost${d.cost||1} ${stCls} ${pairCls} ${sel?'sel':''} ${u.shield>0?'shielded':''}" data-uid="${u.uid}" data-unit-id="${d.id}" style="--hero-hue:${heroHue(d.id)}" title="${tip}">${unitInner(u)}</div>`;
}

/* ================= 渲染：棋盘 / 备战席 ================= */
let _geo=null;
function boardGeo(){
  const b=$('board');
  const fp=b?b.offsetWidth+'x'+b.offsetHeight:'0x0';
  if(_geo && _geo.fp===fp) return _geo;
  let cw=54, ch=54, gx=2, gy=2, sx=56, sy=56, cellX=0, cellY=0;
  try{
    const c0=b.children[0], c1=b.children[1], cr=b.children[BOARD_W];
    if(c0 && c0.classList.contains('cell') && c1){
      cw=c0.offsetWidth; ch=c0.offsetHeight;
      sx=c1.offsetLeft-c0.offsetLeft; sy=cr?cr.offsetTop-c0.offsetTop:sx;
      gx=Math.max(0,sx-cw); gy=Math.max(0,sy-ch);
      cellX=c0.offsetLeft; cellY=c0.offsetTop;
    }
  }catch(e){}
  _geo={fp,cw,ch,gx,gy,sx,sy,cellX,cellY};
  return _geo;
}
const _unitSize=new Map();
function unitSizeOf(u,el){
  const key=(u.big?'b':'n')+':'+(_geo?_geo.cw:0);
  let s=_unitSize.get(key);
  if(!s){ s={w:el.offsetWidth||0,h:el.offsetHeight||0}; if(s.w)_unitSize.set(key,s); }
  return s||{w:0,h:0};
}
function unitVisual(u){
  const g=boardGeo(), layer=document.getElementById('unitLayer');
  const el=layer&&layer.querySelector(`[data-uid="${u.uid}"]`);
  const sz={w:g.cw-8,h:g.ch-8};
  if(!el) return { x:g.cellX+u.x*g.sx+g.cw/2, y:g.cellY+u.y*g.sy+g.ch/2, el:null };
  return { x:g.cellX+(parseFloat(el.style.left)||0)+sz.w/2, y:g.cellY+(parseFloat(el.style.top)||0)+sz.h/2, el };
}
function setRangeFocus(idx,rng){ state.rangeFocus=(idx==null||rng==null)?null:{idx,rng}; }
function clearRangeFocus(){ state.rangeFocus=null; }
function paintRange(){
  const b=$('board'); if(!b) return;
  const focus=state.rangeFocus;
  // 战斗层存在时格子被战斗占用，不做备战高亮
  if(document.getElementById('unitLayer')){ b.querySelectorAll('.cell.rng-hl,.cell.rng-src').forEach(c=>c.classList.remove('rng-hl','rng-src')); return; }
  b.querySelectorAll('.cell').forEach(c=>c.classList.remove('rng-hl','rng-src'));
  if(!focus) return;
  const sx=focus.idx%BOARD_W, sy=Math.floor(focus.idx/BOARD_W), rr=focus.rng;
  for(let yy=0;yy<BOARD_H;yy++) for(let xx=0;xx<BOARD_W;xx++){
    const i=yy*BOARD_W+xx; if(i===focus.idx) continue;
    if(Math.abs(xx-sx)+Math.abs(yy-sy)<=rr){
      const c=b.children[i]; if(c) c.classList.add('rng-hl');
    }
  }
  const sc=b.children[focus.idx]; if(sc) sc.classList.add('rng-src');
}
/* 羁绊徽章悬浮层（照搬经典 paintSynBadges：脱离棋子、按格子定位画在全板最高层） */
function paintSynBadges(board,opts={}){
  const b=$('board'); if(!b) return;
  const old=document.getElementById('synBadgeLayer'); if(old) old.remove();
  const g=boardGeo(); if(!g.cw) return;
  let html='';
  const put=(u,x,y,big)=>{
    if(!u || x<0 || y<0 || x>=BOARD_W || y>=BOARD_H) return;
    const d=byId(u.id); if(!d) return;
    const s=synIconsHTML(d); if(!s) return;
    const n=(s.match(/class="sy/g)||[]).length || 1;
    const bw=g.cw*(big?0.30:0.19);
    const w=n*bw+(n-1)*2;
    const left=g.cellX+x*g.sx+(big?2*g.cw+g.gx:g.cw)-4-w;
    const top =g.cellY+(big?Math.max(0,y-1):y)*g.sy-(big?0.45:0.58)*g.ch;
    html+=`<div style="left:${left}px;top:${top}px"${big?' class="big-badge"':''}>${s}</div>`;
  };
  const putStar=(u,x,y,big)=>{
    if(!u || !u.star) return;
    const left=g.cellX+x*g.sx+g.cw*0.04;
    const top =g.cellY+(big?Math.max(0,y-1):y)*g.sy+(big?2:1)*g.ch*0.74;
    html+=`<div style="left:${left}px;top:${top}px"${big?' class="big-badge"':''}><span class="st">${'★'.repeat(Math.min(4,u.star))}</span></div>`;
  };
  for(let i=0;i<BOARD_W*BOARD_H;i++){
    const p=board[i];
    if(p){ const x=i%BOARD_W, y=(i/BOARD_W)|0; put(p,x,y,!!p.big); putStar(p,x,y,!!p.big); continue; }
    if(opts.enemyBoard && opts.enemyBoard[i]){ const x=i%BOARD_W, y=(i/BOARD_W)|0; put(opts.enemyBoard[i],x,y,!!opts.enemyBoard[i].big); putStar(opts.enemyBoard[i],x,y,!!opts.enemyBoard[i].big); }
  }
  if(!html) return;
  const layer=document.createElement('div'); layer.id='synBadgeLayer'; layer.innerHTML=html;
  b.appendChild(layer);
}
function renderBoard(){
  const b=$('board'); if(!b) return;
  if(state.view&&state.view.phase!=='prep') return;   // 战斗/结算中棋盘由战斗层接管
  b.innerHTML='';
  $('aliveBar')?.remove();
  const watched=watchedPlayer();
  const board=watched?(watched.board||[]):myTurnBoard();
  for(let y=0;y<BOARD_H;y++) for(let x=0;x<BOARD_W;x++){
    const i=y*BOARD_W+x;
    const cell=document.createElement('div');
    cell.className='cell'+(y<BOARD_H/2?' enemy-side':'');
    cell.dataset.i=i;
    cell.style.zIndex=String(1+y);
    const u=board[i];
    const readOnly=!!watched||!canAct();
    if(u){
      cell.innerHTML=unitHTML(u, !watched&&state.selUid===u.uid);
      if(watched){ const pe=cell.querySelector('.unit'); if(pe) pe.classList.add('preview'); }
    }
    cell.onclick=()=>cellClick(i);
    if(!readOnly&&u) cell.querySelector('.unit').style.cursor='grab';
    b.appendChild(cell);
  }
  paintRange();
  paintMoveSel();
  repaintDragHover();
  paintSynBadges(board);
}
function renderBench(){
  const b=$('bench'); if(!b) return;
  b.innerHTML='<span style="grid-column:1/-1;font-size:11px;color:var(--tx2);letter-spacing:2px;text-align:left;line-height:1.2">备战席</span>';
  const src=state.view?.me?.bench||[];
  const bench=Array.from({length:BENCH},(_,i)=>src[i]??null);
  for(let i=0;i<BENCH;i++){
    const s=document.createElement('div'); s.className='bslot'; s.dataset.bi=i;
    const u=bench[i];
    if(u) s.innerHTML=unitHTML(u, state.selUid===u.uid);
    s.onclick=()=>benchClick(i);
    b.appendChild(s);
  }
  paintMoveSel();
}

/* ================= 渲染：商店（照搬经典 renderShop） ================= */
function synTriggers(u){ // 购买该棋子后【新触发】的羁绊档位
  const me=state.view?.me||{};
  const base=bondSummary(me.board||[]);
  const cur={}; base.forEach(b=>cur[b.name]=b);
  const next=bondSummary([...(me.board||[]).filter(Boolean),u]);
  const out=[];
  for(const b of next){
    const before=cur[b.name];
    const tierN=before?before.active:0;
    if(b.active>tierN) out.push(`${b.name} T${b.active}`);
  }
  return out;
}
function synTags(u){ // 可补全（已有成员但尚未满档）的羁绊名
  const me=state.view?.me||{};
  return bondSummary(me.board||[]).filter(b=>b.count>0&&b.active<b.tiers.length&&b.tiers.some(n=>n>b.count)).map(b=>b.name)
    .filter(name=>[u.fac,u.fac2,u.job,u.job2].filter(Boolean).includes(name));
}
function traitIcons(u){
  const d=byId(u.id)||{};
  const ks=[...facsOf(d),...jobsOf(d)].filter(k=>SYN_IMG[k]).slice(0,3);
  return ks.map(k=>`<span class="tb" title="${k}">${synIconHTML(k,'ti')}${k}</span>`).join('');
}
function previewShopInspect(u){
  const d=byId(u.id)||{}; const stats=previewUnit(u)||{};
  $('inspect').innerHTML=`
    <div class="in-hd"><b>${cname(u)}</b><span class="in-star">★</span>
      <img class="in-pt" src="${unitImage(d.id)}" alt=""></div>
    <div class="in-tag">${facLabel(d)} · ${jobLabel(d)} ｜ ${d.cost||u.cost} 费</div>
    <div class="in-row r-hp"><span>生命</span><div class="bar"><i style="width:${Math.min(100,(stats.hp||0)/1.5)}%"></i></div><b>${stats.hp??'—'}</b></div>
    <div class="in-row r-atk"><span>攻击</span><div class="bar"><i style="width:${Math.min(100,(stats.atk||0)*4)}%"></i></div><b>${stats.atk??'—'}</b></div>
    <div class="in-row r-spd"><span>攻速</span><div class="bar"><i style="width:${Math.min(100,(stats.speed||0)*60)}%"></i></div><b>${(stats.speed||0).toFixed(2)}/s</b></div>
    <div class="in-row r-rng"><span>射程</span><div class="bar"><i style="width:${Math.min(100,(stats.range||0)*18)}%"></i></div><b>${stats.range??'—'} 格</b></div>
    <div class="in-row r-plain"><span>护甲</span><b>${stats.armor??0}</b><span>魔抗</span><b>${Math.round((stats.resist||0)*100)}%</b><span>形式</span><b>${stats.melee?'近战':'远程'} · ${stats.damageType==='phys'?'物理':'法术'}</b></div>
    <div class="in-sk">✦ ${SKILL_NAMES[u.id]||'战斗技能'}（${stats.skill?.mode==='passive'?'被动':'主动'}）</div>
    <div class="in-desc">${escapeHtml(skillText(stats.skill))}</div>`;
}
function renderShop(){
  const s=$('shop'); if(!s) return;
  s.innerHTML='';
  const me=state.view?.me||{};
  (me.shop||[]).forEach((u,i)=>{
    const c=document.createElement('div');
    c.className='card'+(u?'':' sold');
    if(u) c.classList.add('cost'+(u.cost||1));
    const isPair = u && pairCount(u.id)>=2;
    const isSolo = u && !isPair && pairCount(u.id)===1;
    const owned3 = u && !isPair && has3star(u.id);
    const owned2 = u && !isPair && !owned3 && has2star(u.id);
    const trig = u ? synTriggers(u) : [];
    const synNames = u && !trig.length ? synTags(u) : [];
    if(isPair) c.classList.add('paircard');
    const bds=[
      isPair ? '<span class="bd pair">🎴 对子·可升星</span>' : '',
      owned3 ? '<span class="bd c3">⭐ 三星达成</span>' : '',
      owned2 ? '<span class="bd c3">⭐ 追三</span>' : '',
      trig.length ? '<span class="bd trig">🔗 '+trig.join(' ')+'</span>' : '',
      (!trig.length && synNames.length) ? '<span class="bd syn">🔗 '+synNames.join('/')+'</span>' : '',
      (isSolo && !owned2 && !owned3) ? '<span class="bd dim">1/3</span>' : '',
    ].filter(Boolean).join('');
    if(u){
      const d=byId(u.id)||{};
      c.innerHTML=`<div class="costbar"></div>`+
        `<div class="artbg" style="background-image:url('${unitImage(u.id)}')" aria-hidden="true"></div>`+
        `<div class="art"></div>`+
        `<div class="cn">${cname(u)}</div>`+
        `<div class="tis">${traitIcons(u)}</div>`+
        `<div class="stb"><span class="stat hp"><i></i>${u.hp??d.hp??''}</span><span class="stat atk"><i></i>${u.atk??d.atk??''}</span><b class="cc2">${u.cost||d.cost}</b></div>`+
        (bds?`<div class="badges">${bds}</div>`:'');
      c.onmouseenter=()=>previewShopInspect(u);
      c.onclick=()=>buy(i);
    }
    s.appendChild(c);
  });
}
function buy(i){
  if(!inPrep()||!canAct()) return;
  const u=state.view?.me?.shop?.[i];
  if(!u) return;
  if(sendAction({type:'buy',slot:i})) log('购买 '+(cname(u)));
}

/* ================= 渲染：顶栏 / 等级盒（照搬经典 renderTop） ================= */
function renderTop(){
  const me=state.view?.me||{};
  const players=state.view?.players||[];
  $('round').textContent=String(state.view?.round??'—');
  $('roundMax').textContent='/联机';
  { const rt=$('roundTicks');
    if(rt){
      const n=8, cur=Math.max(0,8-players.filter(p=>p.alive!==false).length);
      if(rt.childElementCount!==n) rt.innerHTML=Array.from({length:n},()=>'<i></i>').join('');
      [...rt.children].forEach((el,i)=>el.classList.toggle('on',i<=cur));
    } }
  $('hp').textContent=String(me.hp??'—'); $('gold').textContent=String(me.gold??0);
  const ig=interestGain(me.gold||0);
  $('interest').textContent = inPrep() && (me.level||1)<MAX_LEVEL && ig ? `+${ig}` : '';
  $('goldChipN').textContent=String(me.gold??0);
  $('goldChipI').textContent = inPrep() && ig ? ` +${ig}息` : '';
  const pop=(me.board||[]).filter(Boolean).length;
  $('pop').textContent=String(pop); $('popMax').textContent=String(me.level||1);
  const popLazy = inPrep() && pop<(me.level||1) && (me.bench||[]).some(Boolean);
  $('pop').closest('.res')?.classList.toggle('pop-warn', !!popLazy);
  $('deployBtn')?.classList.toggle('pulse', !!popLazy);
  $('deployBtn').title = popLazy
    ? `⚠ 场上只上了 ${pop}/${me.level||1} 人，还有空位——按 R 择优上阵（或拖动棋子）`
    : '从场上与备战席择优选人，并稳定调整站位（R）';
  $('streak').textContent=String(Math.abs(me.streak||0));
  $('resStreak').querySelector('.rl').textContent=(me.streak||0)<0?'连败':'连胜';
  const need=xpNeeded(me.level||1);
  $('lvlNum').textContent=String(me.level||1);
  const capped=(me.level||1)>=MAX_LEVEL;
  $('xpText').textContent = capped ? '人口已满' : `经验 ${me.xp||0}/${need}`;
  $('xpText').title='';
  $('xpFill').style.width = capped ? '100%' : Math.min(100,(me.xp||0)/need*100)+'%';
  $('lvlBtn').textContent = capped ? '人口已满' : (state.view?.round===1 ? '首回合不可买经验' : (IS_TOUCH?'买经验 -5金':'买经验 (F) +4经验 -5金'));
  { // 各费用出现率（照搬经典 oddsRow）
    const orow=$('oddsRow');
    if(orow){
      const lv=Math.min(MAX_LEVEL,me.level||2);
      const od=SHOP_ODDS[lv]||SHOP_ODDS[11];
      orow.innerHTML=[1,2,3,4,5].map(c=>`<i class="oc${c}" title="${c} 费棋子出现率"><b>${od[c-1]??0}%</b><u>${c}费</u></i>`).join('');
    }
  }
  $('refreshBtn').textContent=(IS_TOUCH?'刷新':'刷新 (D)')+' -2金';
  const sel=state.selUid!=null?findUnit(state.selUid):null;
  const selUnit=sel?getAt(sel[0],sel[1]):null;
  if(selUnit){
    $('sellBtn').textContent=(IS_TOUCH?`出售 +${sellRefund(selUnit)}金`:`出售 +${sellRefund(selUnit)}金 (E)`);
    $('sellBtn').disabled=false;
  } else {
    $('sellBtn').textContent=IS_TOUCH?'出售':'出售 (E)';
    $('sellBtn').disabled=true;
  }
  $('lockBtn').textContent=me.shopLocked?(IS_TOUCH?'已锁定':'已锁定 (L)'):(IS_TOUCH?'锁定':'锁定 (L)');
  $('lockBtn').classList.toggle('on',!!me.shopLocked);
  $('gold2').textContent=String(me.gold??0);
  $('interest2').textContent=`利息 +${ig}`;
  $('interest2').title='每 10 金 +1，上限 3';
  // 敌方信息栏：备战=对手与倒计时；战斗=双方存活
  const pairing=state.view?.pairings?.find(p=>p.a===state.seat||p.b===state.seat);
  const watched=watchedPlayer();
  const secs=state.deadline?Math.max(0,Math.ceil((state.deadline+state.clockSkew-Date.now())/1000)):null;
  const phaseClock=$('phaseCountdown');
  if (phaseClock) {
    $('countdownValue').textContent=secs===null?'—':String(secs);
    phaseClock.classList.toggle('urgent',secs!==null&&secs<=10);
    phaseClock.dataset.phase=state.view?.phase||'';
    phaseClock.setAttribute('aria-label',`${phaseName(state.view?.phase)}倒计时${secs===null?'不可用':`${secs}秒`}`);
  }
  let info='';
  if(!state.connected) info='⚠ 连接中断，正在自动重连…';
  else if(watched) info=`👁 观战中：<b>${escapeHtml(watched.name||playerName(watched.seat))}</b> · 等级 ${watched.level||1}${inPrep()?'（当前阵容）':''}`;
  else if(state.view?.phase==='combat'){
    // 战斗中：8 人血量紧凑条常驻在棋盘上方（高度与原对手条一致，零挤压）；
    // 点触屏可打开「战况」抽屉看名次/观战
    const playback=state.battlePlayback;
    let live='';
    if(playback){
      const own=playback.units.filter(u=>u.alive&&u.side===playback.ownSide).length;
      const foe=playback.units.filter(u=>u.alive&&u.side!==playback.ownSide).length;
      live=` · 🔵<b>${own}</b>:<b>${foe}</b>🔴`;
    }
    info=`⚔ 战斗中${live} <span class="hp-strip">${players.map(p=>{
      const mine=p.seat===state.seat, dead=p.alive===false;
      const full=p.name||playerName(p.seat);
      const nm=String(full).slice(0,2);
      return `<i class="${mine?'me':''}${dead?' out':''}" title="${escapeHtml(full)}（席位 ${p.seat+1}${dead?' · 已淘汰':''}）">${escapeHtml(nm)}${dead?'✕':'❤'+escapeHtml(p.hp??0)}</i>`;
    }).join('')}</span>`;
  }
  else if(pairing) info=pairing.b==null?'本轮轮空 · 生命与阵容保持不变':`本轮对手：<b style="color:var(--gold-hi)">${escapeHtml(playerName(pairing.a===state.seat?pairing.b:pairing.a))}</b>${secs!=null?` · ${secs}s 后开战`:''}`;
  else info='等待配对…';
  if(isSpectator()&&!watched) info='💀 你已淘汰 · 点击右侧「八人战况」可观战其他玩家';
  $('enemyInfo').innerHTML=info;
}

/* ================= 渲染：羁绊列（照搬经典 synBadges/renderSynergy） ================= */
function bondDesc(name,cfg){ const list=globalThis.ClassicBondRules?.descriptions?.[name]||[]; return list; }
function synBadges(cnt){
  const items=Object.entries(cnt).map(([k,c])=>{
    const n=c.count, tiers=c.tiers||[];
    if(n===0) return null;
    const tier=c.active||0;
    const next=tiers.find(x=>x>n);
    return {k,tiers,tier,n,gap:next?next-n:0,prog:n>=(tiers[tiers.length-1]||0)?'MAX':`${n}/${next??n}`};
  }).filter(Boolean)
    .sort((a,b)=>(b.tier>0?1:0)-(a.tier>0?1:0) || b.tier-a.tier || a.gap-b.gap);
  return items.map(({k,tiers,tier,prog})=>{
    const pips=tiers.map((x,i)=>`<i class="${i<tier?'on':''}"></i>`).join('');
    const desc=bondDesc(k);
    const effs=desc.slice(0,tier).map((d,i)=>`<div class="syn-eff">T${i+1} ${escapeHtml(d)}</div>`).join('');
    return `<div class="syn-badge ${tier>0?('on t'+tier):''}" title="${k}\n${desc.map((d,i)=>`T${i+1}(${tiers[i]}人)：${d}`).join('\n')}">
      <div class="syn-top">${synIconHTML(k,'ico')||'<span class="ico">❓</span>'}<span>${k}</span><span class="pips">${pips}</span><span class="cnt">${prog}</span></div>${effs}</div>`;
  }).join('') || '<div class="syn-empty">上场棋子后显示羁绊</div>';
}
function renderSynergy(){
  const watched=watchedPlayer();
  const board=(watched?.board)||myTurnBoard();
  const bonds=bondSummary(board);
  const cnt=Object.fromEntries(bonds.map(b=>[b.name,b]));
  $('synAll').innerHTML=synBadges(cnt);
  const me=state.view?.me||{};
  $('pop2').textContent=String((me.board||[]).filter(Boolean).length);
  $('popMax2').textContent=String(me.level||1);
}

/* ================= 渲染：装备面板（照搬经典 renderEquip 的结构） ================= */
function renderEquip(){
  const e=$('equip'); if(!e) return;
  const me=state.view?.me||{};
  const items=me.items||[];
  const pos=state.inspectUid!=null?findUnit(state.inspectUid):null;
  const u=pos?getAt(pos[0],pos[1]):null;
  const worn=u&&u.items||[];
  const wornHtml=`<section class="gear-worn"><div class="gear-section-head"><div><span class="gear-kicker">CURRENT LOADOUT</span><b>${u?escapeHtml(cname(u))+' · 已穿戴':'棋子装备栏'}</b></div><small>${worn.length}/3 格</small></div>`+
    (worn.length?`<div class="gear-worn-items">${worn.map((k,idx)=>`<span class="in-item-chip worn" data-ii="${idx}" title="${escapeHtml(EQUIPMENT[k]?.desc||'')}；${escapeHtml(EQUIPMENT[k]?.trait||'')}。备战期点按卸下，或拖到背包卸下">${EQUIPMENT[k]?.e||''} ${escapeHtml(EQUIPMENT[k]?.n||k)} <i>×</i></span>`).join('')}</div>`:
      `<div class="gear-worn-empty">${u?'选中的棋子还没有装备':'点选棋子查看穿戴情况，也可把装备直接拖到棋子上'}</div>`)+`</section>`;
  const pairs=[];
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const prod=recipe(items[i],items[j]);if(prod)pairs.push({i,j,prod,a:items[i],b:items[j]});
  }
  const itemRoute=k=>{const it=EQUIPMENT[k],from=it.from||[];return `<div class="gear-route"><span class="gear-route-icons">${from.length?from.map(x=>EQUIPMENT[x]?.e||'').join(' + '):'✦'}</span><b>${it.e} ${escapeHtml(it.n)}</b><small>${escapeHtml(it.desc)}</small><em>${escapeHtml(it.trait||'')}</em></div>`;};
  const routeBook=Object.keys(EQUIPMENT).filter(k=>EQUIPMENT[k].crafted);
  const routeBookHtml=`<details class="gear-routebook"><summary>查看全部 ${routeBook.length} 条合成路线</summary><div class="gear-route-grid">${routeBook.map(itemRoute).join('')}</div></details>`;
  const autoDisabled=!canAct()||!items.length;
  e.innerHTML=`<div class="gear-workshop">
    <header class="gear-hero"><div><span class="gear-kicker">FIELD ARMORY · ${routeBook.length} RECIPES</span><h3>装备工坊</h3><p>组件会继承到成品，成品再带来一条独有战斗机制。</p></div>
      <button class="btn gear-auto" id="autoEquipBtn" ${autoDisabled?'disabled':''} title="自动合成可用配方，再按主C与前排分配装备">⚡ 一键整理</button></header>
    ${wornHtml}
    <section class="gear-bag"><div class="gear-section-head"><div><span class="gear-kicker">BACKPACK · ${items.length} ITEMS</span><b>背包装备</b></div><small>${pairs.length?`可合成 ${pairs.length} 件`:'拖拽穿戴 · 点选后再点棋子'}</small></div>
      ${items.length?`<div class="gear-inventory" id="gearInventory"></div>`:`<div class="gear-empty"><span>✧</span><b>背包暂时空了</b><small>每 5 回合的野怪战会掉落装备。</small></div>`}
      ${pairs.length?`<div class="gear-ready"><div class="gear-subhead">现在可以合成</div><div class="gear-ready-grid">${pairs.slice(0,4).map(p=>`<article class="gear-ready-card"><div class="gear-ready-route">${EQUIPMENT[p.a]?.e} + ${EQUIPMENT[p.b]?.e}<span>→</span>${EQUIPMENT[p.prod]?.e}</div><b>${escapeHtml(EQUIPMENT[p.prod]?.n||'')}</b><em>${escapeHtml(EQUIPMENT[p.prod]?.trait||'')}</em><button class="btn" data-combine="${p.i},${p.j}" ${canAct()?'':'disabled'}>合成此装备</button></article>`).join('')}</div>${pairs.length>4?`<small class="gear-more">另有 ${pairs.length-4} 件可合成</small>`:''}</div>`:''}
    </section>
    ${routeBookHtml}
  </div>`;
  $('autoEquipBtn').onclick=()=>{ if(canAct()&&sendAction({type:'autoEquip'})) log('⚡ 一键整理装备'); };
  e.querySelectorAll('[data-combine]').forEach(btn=>btn.onclick=()=>{
    if(!canAct())return;
    const [i,j]=btn.dataset.combine.split(',').map(Number);
    if(sendAction({type:'combine',a:i,b:j})){
      const it=EQUIPMENT[recipe(items[i],items[j])];
      log(`⛓ 合成 ${it?it.e+it.n:''}`);
    }
  });
  bindWornChips();
  const inventory=$('gearInventory');
  if(inventory)items.forEach((k,i)=>{
    const it=EQUIPMENT[k],c=document.createElement('div');
    c.className='gear-item-card'+(state.selItem===i?' sel':'')+(it.crafted?' crafted':'');
    c.setAttribute('role','button');c.setAttribute('aria-pressed',String(state.selItem===i));c.tabIndex=0;
    c.title=(it.desc)+' · '+(it.trait||'')+'（拖到棋子上穿戴，或点选后再点棋子）';
    c.innerHTML=`<div class="item-chip ${state.selItem===i?'sel':''}${it.crafted?' crafted':''}"><span class="gear-item-icon">${it.e}</span><span>${escapeHtml(it.n)}</span><i>${it.crafted?'成品':'组件'}</i></div><small>${escapeHtml(it.desc)}</small><em>${escapeHtml(it.trait||'')}</em>`;
    c.onclick=()=>{if(Date.now()<chipClickSuppressedUntil)return;state.selItem=state.selItem===i?null:i;renderEquip();if(IS_TOUCH&&state.selItem!=null){closeDrawer();log(`🎒 已选 ${it.n}：点要穿戴的棋子（再点该装备取消）`);}};
    c.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();c.click();}};
    c.addEventListener('pointerdown',ev=>{if(ev.button!==0||!canAct())return;ev.stopPropagation();itemDrag={i,x0:ev.clientX,y0:ev.clientY,ghost:null};});
    inventory.appendChild(c);
  });
}
function equipTo(u,itemIndex){
  if(!u||!inPrep()||!canAct())return;
  if(sendAction({type:'equip',uid:u.uid,itemIndex},{optimistic:true})){
    const me=state.view.me, item=me.items?.[itemIndex];
    if(item!=null){ me.items.splice(itemIndex,1); u.items=u.items||[]; if(u.items.length<3)u.items.push(item); }
    log(`🎽 ${cname(u)} 穿上 ${EQUIPMENT[item]?.n||''}`);
    renderAll();
  }
}
function unequipOne(uid,idx){
  if(!inPrep()||!canAct())return;
  const pos=findUnit(uid); if(!pos)return;
  const u=getAt(pos[0],pos[1]);
  if(!u||!u.items||u.items[idx]==null)return;
  if(sendAction({type:'unequip',uid,index:idx},{optimistic:true})){
    const me=state.view.me, k=u.items.splice(idx,1)[0];
    me.items=me.items||[]; me.items.push(k);
    log(`🧥 ${cname(u)} 卸下 ${EQUIPMENT[k]?.n||k}`);
    renderAll();
    if(state.inspectUid===uid)showInspectFor(pos[0],pos[1]);
  }
}
function combineWornByUid(uid){
  if(!inPrep()||!canAct())return;
  if(sendAction({type:'combineWorn',uid}))log('⛓ 就地合成身上的前两件装备');
}
function bindWornChips(){
  document.querySelectorAll('#equip .worn').forEach(ch=>{
    ch.addEventListener('pointerdown', ev=>{
      if(ev.button!==0||!canAct()||state.inspectUid==null) return;
      ev.stopPropagation();
      unequipDrag={ uid:state.inspectUid, idx:+ch.dataset.ii, x0:ev.clientX, y0:ev.clientY, ghost:null };
    });
  });
}

/* ================= 渲染：棋子详情（照搬经典 showInspect） ================= */
const INSPECT_EMPTY='<div class="in-empty">点击场上 / 备战席的棋子<br>查看属性 · 技能 · 装备详情</div>';
function showInspect(u){
  const d=byId(u.id)||{}; const stats=previewUnit(u)||{};
  const itemChips=(u.items&&u.items.length)
    ? u.items.map((k,idx)=>`<span class="in-item-chip" data-ii="${idx}" title="${escapeHtml(EQUIPMENT[k]?.n||k)}（${escapeHtml(EQUIPMENT[k]?.desc||'')}；${escapeHtml(EQUIPMENT[k]?.trait||'')}）：拖到下方装备栏卸下；点按也可卸下">${EQUIPMENT[k]?.e||''} ${escapeHtml(EQUIPMENT[k]?.n||k)}</span>`).join('')
    : '<span style="color:#8f88b0">无</span>';
  $('inspect').innerHTML=`
    <div class="in-hd"><b>${cname(u)}</b><span class="in-star">${'★'.repeat(Math.min(4,u.star||1))}</span>
      <img class="in-pt" src="${unitImage(d.id)}" alt="">
      <span class="in-close" title="关闭" id="inClose">✕</span></div>
    <div class="in-tag">${facLabel(d)} · ${jobLabel(d)} ｜ ${d.cost||u.cost} 费</div>
    <div class="in-row r-hp"><span>生命</span><div class="bar"><i style="width:${Math.min(100,(stats.hp||0)/1.5)}%"></i></div><b>${stats.hp??'—'}</b></div>
    <div class="in-row r-atk"><span>攻击</span><div class="bar"><i style="width:${Math.min(100,(stats.atk||0)*4)}%"></i></div><b>${stats.atk??'—'}</b></div>
    <div class="in-row r-spd"><span>攻速</span><div class="bar"><i style="width:${Math.min(100,(stats.speed||0)*60)}%"></i></div><b>${(stats.speed||0).toFixed(2)}/s</b></div>
    <div class="in-row r-rng"><span>射程</span><div class="bar"><i style="width:${Math.min(100,(stats.range||0)*18)}%"></i></div><b>${stats.range??'—'} 格</b></div>
    <div class="in-row r-plain"><span>护甲</span><b>${stats.armor??0}</b><span>魔抗</span><b>${Math.round((stats.resist||0)*100)}%</b><span>出售</span><b>${sellRefund(u)}金</b></div>
    <div class="in-row r-plain"><span>形式</span><b>${stats.melee?'近战':'远程'} · ${stats.damageType==='phys'?'物理':'法术'}</b></div>
    <div class="in-sk">✦ ${SKILL_NAMES[u.id]||'战斗技能'}（${stats.skill?.mode==='passive'?'被动':'主动'}）</div>
    <div class="in-desc">${escapeHtml(skillText(stats.skill))}</div>
    <div class="in-desc" style="color:#8a93c4;font-size:11.5px">${escapeHtml(attackText(u.id))}</div>
    ${CLASSIC_MARKS[u.id]?`<div class="in-desc" style="color:#dcb8ff;font-size:11.5px">专属印记【${CLASSIC_MARKS[u.id].label}】：${stats.skill?.mode==='passive'?'普攻后留给目标':'技能命中后留给目标，治疗/保护技能留给自身'}，下次受伤增伤/减伤 ${Math.round(CLASSIC_MARKS[u.id].amp*100)}%，持续 ${CLASSIC_MARKS[u.id].dur} 秒。</div>`:''}
    <div class="in-item">🎒 装备：<span id="inItemChips">${itemChips}</span></div>
    ${(IS_TOUCH&&u.items&&u.items.length)?`<div class="in-unequip" id="inUnequipAll">🧥 卸下全部装备</div>`:''}
    ${(u.items&&u.items.length>=2&&recipe(u.items[0],u.items[1]))?`<div class="in-combo" id="inCombo">⛓ 就地合成 → ${(()=>{const pr=recipe(u.items[0],u.items[1]);return (EQUIPMENT[pr]?.e||'')+(EQUIPMENT[pr]?.n||'');})()}</div>`:''}
    <div class="in-sell" id="inSell">💸 出售（+${sellRefund(u)}💰）</div>`;
  state.inspectUid=u.uid;
  $('inClose').onclick=hideInspect;
  $('inSell').onclick=sellInspect;
  const combo=$('inCombo'); if(combo)combo.onclick=()=>combineWornByUid(u.uid);
  const une=$('inUnequipAll'); if(une)une.onclick=unequipInspect;
  document.querySelectorAll('#inspect .in-item-chip').forEach(ch=>{
    ch.addEventListener('pointerdown', ev=>{
      if(ev.button!==0||!canAct()||state.inspectUid==null) return;
      ev.stopPropagation();
      unequipDrag={ uid:state.inspectUid, idx:+ch.dataset.ii, x0:ev.clientX, y0:ev.clientY, ghost:null };
    });
  });
}
function showEnemyInspect(u,ownerLabel='敌方'){ // 观战/敌方预览棋子：无出售按钮
  const d=byId(u.id)||{}; const stats=previewUnit(u)||{};
  $('inspect').innerHTML=`
    <div class="in-hd"><b>${cname(u)}</b><span class="in-star">${'★'.repeat(Math.min(4,u.star||1))}</span>
      <span class="in-tag" style="margin-left:6px;color:#ff9a9a">${escapeHtml(ownerLabel)}</span>
      <img class="in-pt" src="${unitImage(d.id)}" alt="">
      <span class="in-close" title="关闭" id="inClose">✕</span></div>
    <div class="in-tag">${facLabel(d)} · ${jobLabel(d)} ｜ ${d.cost||u.cost} 费</div>
    <div class="in-row r-hp"><span>生命</span><div class="bar"><i style="width:${Math.min(100,(stats.hp||0)/1.5)}%"></i></div><b>${stats.hp??'—'}</b></div>
    <div class="in-row r-atk"><span>攻击</span><div class="bar"><i style="width:${Math.min(100,(stats.atk||0)*4)}%"></i></div><b>${stats.atk??'—'}</b></div>
    <div class="in-row r-spd"><span>攻速</span><div class="bar"><i style="width:${Math.min(100,(stats.speed||0)*60)}%"></i></div><b>${(stats.speed||0).toFixed(2)}/s</b></div>
    <div class="in-row r-rng"><span>射程</span><div class="bar"><i style="width:${Math.min(100,(stats.range||0)*18)}%"></i></div><b>${stats.range??'—'} 格</b></div>
    <div class="in-row r-plain"><span>护甲</span><b>${stats.armor??0}</b><span>魔抗</span><b>${Math.round((stats.resist||0)*100)}%</b><span>站位</span><b>${d.job==='刺客'?'切后排':(stats.melee?'前排':'后排')}</b></div>
    <div class="in-row r-plain"><span>形式</span><b>${stats.melee?'近战':'远程'} · ${stats.damageType==='phys'?'物理':'法术'}</b></div>
    <div class="in-sk">✦ ${SKILL_NAMES[u.id]||'战斗技能'}（${stats.skill?.mode==='passive'?'被动':'主动'}）</div>
    <div class="in-desc">${escapeHtml(skillText(stats.skill))}</div>`;
  state.inspectUid=null;
  $('inClose').onclick=hideInspect;
}
function showInspectFor(t,i){
  const u=getAt(t,i);
  if(!u){ hideInspect(); return; }
  showInspect(u);
  renderEquip();
}
function hideInspect(){ state.inspectUid=null; $('inspect').innerHTML=INSPECT_EMPTY; }
function sellInspect(){
  if(!inPrep()||state.inspectUid==null)return;
  state.selUid=state.inspectUid;
  sellSelected();
}
function unequipInspect(){
  if(!inPrep()||state.inspectUid==null)return;
  const pos=findUnit(state.inspectUid); if(!pos)return;
  const u=getAt(pos[0],pos[1]);
  if(!u.items||!u.items.length)return;
  if(sendAction({type:'unequip',uid:u.uid})){
    const me=state.view.me, names=u.items.map(k=>EQUIPMENT[k]?.n||k).join('、');
    me.items=(me.items||[]).concat(u.items); u.items=[];
    log(`🧥 ${cname(u)} 卸下装备：${names}`);
    renderAll(); showInspectFor(pos[0],pos[1]);
  }
}
function findUnit(uid){
  const me=state.view?.me; if(!me)return null;
  const board=me.board||[];
  for(let i=0;i<board.length;i++) if(board[i]&&String(board[i].uid)===String(uid)) return ['board',i];
  const bench=me.bench||[];
  for(let i=0;i<bench.length;i++) if(bench[i]&&String(bench[i].uid)===String(uid)) return ['bench',i];
  return null;
}

/* ================= 交互：点击 / 拖拽（照搬经典） ================= */
function benchClick(i){ clickUnit('bench', i); }
function cellClick(i){ clickUnit('board', i); }
function moveOrSwap(ft,fi,tt,ti){
  const src=getAt(ft,fi);
  if(src==null||(ft===tt&&fi===ti)) return;
  if(!canAct())return;
  // 乐观渲染：先动本地，服务器快照回来后校正
  const me=state.view.me, bench=me.bench||(me.bench=Array(8).fill(null)), board=me.board;
  const dst=tt==='board'?board[ti]:bench[ti];
  if(tt==='board'&&ti<32) return;   // 只能布置在我方半区
  if(ft==='bench'&&tt==='board'&&!dst&&board.filter(Boolean).length>=(me.level||1)){ log('⚠ 人口已满，先升级人口！'); return; }
  if(sendAction({type:'move',uid:src.uid,to:{zone:tt,slot:ti}},{optimistic:true})){
    if(tt==='board')board[ti]=src; else bench[ti]=src;
    if(ft==='board')board[fi]=dst??null; else bench[fi]=dst??null;
    renderAll();
  }
}
function clickUnit(t,i){
  if(!inPrep()) return;
  const watched=watchedPlayer();
  const u = watched&&t==='board' ? (watched.board||[])[i] : getAt(t,i);
  if(watched&&t==='board'){   // 观战：只看详情，不可操作
    if(u) showEnemyInspect(u, watched.name||playerName(watched.seat));
    else hideInspect();
    return;
  }
  if(state.selItem!=null){   // 装备穿戴模式：点棋子即穿上
    if(!u){ log('⚠ 请点击要穿戴装备的棋子'); return; }
    equipTo(u, state.selItem);
    state.selItem=null;
    if(state.inspectUid===u.uid) showInspectFor(t,i);
    renderEquip();
    return;
  }
  if(IS_TOUCH){
    if(state.moveSel){
      const src=findUnit(state.moveSel.uid);
      if(src && u && String(u.uid)===String(state.moveSel.uid)){
        state.moveSel=null; state.selUid=null; hideInspect(); clearRangeFocus(); renderAll(); return;
      }
      if(src){
        moveOrSwap(src[0],src[1],t,i);
        state.moveSel=null; state.selUid=null; hideInspect(); clearRangeFocus(); closeDrawer(); renderAll(); return;
      }
      state.moveSel=null;
    }
    if(u){ state.selUid=u.uid; state.moveSel={uid:u.uid}; showInspectFor(t,i); setRangeFocus(t==='board'?i:null, t==='board'?(previewUnit(u)?.range||1):null); if(autoInspect) openDrawer('side'); }
    else { state.selUid=null; hideInspect(); clearRangeFocus(); }
    renderBoard(); renderBench(); renderTop(); renderEquip();
    return;
  }
  // 桌面：单击 = 查看详情 + 攻击范围；换位走拖拽
  if(u){ state.selUid=u.uid; showInspectFor(t,i); setRangeFocus(t==='board'?i:null, t==='board'?(previewUnit(u)?.range||1):null); }
  else { state.selUid=null; hideInspect(); clearRangeFocus(); }
  renderBoard(); renderBench(); renderTop(); renderEquip();
}
function paintMoveSel(){
  document.querySelectorAll('.mvsrc').forEach(x=>x.classList.remove('mvsrc'));
  document.querySelectorAll('.mv-hl').forEach(x=>x.classList.remove('mv-hl'));
  const hint=$('moveHint');
  const active = IS_TOUCH && inPrep() && state.moveSel && findUnit(state.moveSel.uid);
  if(!active){
    if(hint) hint.style.display='none';
    if(state.moveSel&&(!IS_TOUCH||!inPrep())) state.moveSel=null;
    return;
  }
  const srcEl=document.querySelector(`.unit[data-uid="${state.moveSel.uid}"]`);
  if(srcEl) srcEl.classList.add('mvsrc');
  const cells=$('board').children;
  for(let i=BOARD_W*BOARD_H/2;i<BOARD_W*BOARD_H;i++) if(cells[i]) cells[i].classList.add('mv-hl');
  document.querySelectorAll('#bench .bslot').forEach(s=>s.classList.add('mv-hl'));
  if(hint){
    const src=state.moveSel?findUnit(state.moveSel.uid):null;
    const u=src?getAt(src[0],src[1]):null;
    const rng=src&&src[0]==='board'&&u?(previewUnit(u)?.range??1):null;
    hint.textContent = rng!=null
      ? `射程 ${rng} 格（蓝格可攻击）· 点目标格移动/换位`
      : '已选中，点目标格移动/换位（点原棋子取消）';
    hint.style.display='block';
    try{ hint.style.bottom=(($('shopbar')&&$('shopbar').offsetHeight||90)+10)+'px'; }catch(e){}
  }
}
/* 装备拖拽落点高亮 */
function paintEquipDrop(clientX, clientY){
  document.querySelectorAll('.equip-hl').forEach(x=>x.classList.remove('equip-hl'));
  const tgt=document.elementFromPoint(clientX,clientY);
  const cell=tgt&&tgt.closest&&tgt.closest('.cell,.bslot');
  if(!cell) return null;
  const t=cell.classList.contains('cell')?'board':'bench';
  const i=cell.classList.contains('cell')?+cell.dataset.i:+cell.dataset.bi;
  const u=t==='board'?(watchedPlayer()?.board||myTurnBoard())[i]:getAt('bench',i);
  if(u&&t==='board'&&!watchedPlayer()) cell.classList.add('equip-hl');
  else if(u&&t==='bench') cell.classList.add('equip-hl');
  return u?{t,i,u}:null;
}
let drag=null, itemDrag=null, unequipDrag=null, chipClickSuppressedUntil=0, dragHoverCell=null;
/* 联机特有：每次 state 广播都会重建棋盘 DOM，拖拽/移动中的落点高亮会被冲掉。
   renderBoard 重排后按最近一次悬停补画（经典本地状态无此问题）。 */
function repaintDragHover(){
  if(!dragHoverCell) return;
  if(dragHoverCell.zone==='board'){ const c=$('board')?.children?.[dragHoverCell.slot]; if(c)c.classList.add('drop-hl'); }
  else { const slot=document.querySelector(`#bench .bslot[data-bi="${dragHoverCell.slot}"]`); if(slot)slot.classList.add('drop-hl'); }
}
document.addEventListener('pointerdown', e=>{
  if(e.button!==0) return;
  if(!inPrep()) return;
  const el = e.target.closest && e.target.closest('.unit');
  if(!el) return;
  if(el.classList.contains('preview')) return;
  const cell = el.closest('.cell'), slot = el.closest('.bslot');
  if(!cell && !slot) return;
  drag = { t: cell?'board':'bench', i: cell?+cell.dataset.i:+slot.dataset.bi,
           x0:e.clientX, y0:e.clientY, ghost:null, el, wasInSell:false };
  if(drag.t==='board'){ const u=getAt('board',drag.i); if(u){ setRangeFocus(drag.i, previewUnit(u)?.range||1); paintRange(); } }
});
document.addEventListener('pointermove', e=>{
  if(unequipDrag){
    if(!unequipDrag.ghost && Math.hypot(e.clientX-unequipDrag.x0, e.clientY-unequipDrag.y0)>6){
      const pos=findUnit(unequipDrag.uid);
      const u=pos?getAt(pos[0],pos[1]):null;
      const k=u&&u.items?u.items[unequipDrag.idx]:null;
      const g=$('dragGhost'); g.innerHTML=`<div class="unit item-ghost">${k?(EQUIPMENT[k]?.e||'')+' '+(EQUIPMENT[k]?.n||''):''}</div>`;
      g.style.display='block'; unequipDrag.ghost=g;
    }
    if(unequipDrag.ghost){
      unequipDrag.ghost.style.left=(e.clientX-34)+'px';
      unequipDrag.ghost.style.top=(e.clientY-34)+'px';
      const ov=document.elementFromPoint(e.clientX,e.clientY);
      const eq=$('equip'), pnl=eq&&eq.closest?eq.closest('.panel'):null;
      const over=!!(ov&&ov.closest&&ov.closest('#equip'));
      if(pnl) pnl.classList.toggle('drop-panel-hl', over);
    }
    return;
  }
  if(itemDrag){
    if(!itemDrag.ghost && Math.hypot(e.clientX-itemDrag.x0, e.clientY-itemDrag.y0)>6){
      const g=$('dragGhost'); g.innerHTML=`<div class="unit item-ghost">${EQUIPMENT[state.view?.me?.items?.[itemDrag.i]]?(EQUIPMENT[state.view.me.items[itemDrag.i]].e+' '+EQUIPMENT[state.view.me.items[itemDrag.i]].n):''}</div>`;
      g.style.display='block'; itemDrag.ghost=g;
    }
    if(itemDrag.ghost){
      itemDrag.ghost.style.left=(e.clientX-34)+'px';
      itemDrag.ghost.style.top=(e.clientY-34)+'px';
      const hit=paintEquipDrop(e.clientX,e.clientY);
      const ov=document.elementFromPoint(e.clientX,e.clientY);
      const insp=$('inspect');
      if(insp) insp.classList.toggle('inspect-hl', !hit && !!(ov&&ov.closest&&ov.closest('#inspect')));
    }
    return;
  }
  if(!drag) return;
  if(!drag.ghost && Math.hypot(e.clientX-drag.x0, e.clientY-drag.y0)>6){
    const g=$('dragGhost'); g.innerHTML=unitHTML(getAt(drag.t,drag.i),false);
    g.style.display='block'; drag.ghost=g;
  }
  if(drag.ghost){
    drag.ghost.style.left=(e.clientX-34)+'px';
    drag.ghost.style.top=(e.clientY-34)+'px';
    document.querySelectorAll('.drop-hl').forEach(x=>x.classList.remove('drop-hl'));
    document.querySelectorAll('.sell-hl').forEach(x=>x.classList.remove('sell-hl'));
    const tgt=document.elementFromPoint(e.clientX,e.clientY);
    const c=tgt&&tgt.closest && tgt.closest('.cell,.bslot');
    if(c){
      const tt2 = c.classList.contains('cell')?'board':'bench';
      const ti2 = c.classList.contains('cell')?+c.dataset.i:+c.dataset.bi;
      if(tt2==='board'){ const du=getAt(drag.t,drag.i); if(du){ setRangeFocus(ti2, previewUnit(du)?.range||1); paintRange(); } }
      else { clearRangeFocus(); paintRange(); }
    }
    if(c) c.classList.add('drop-hl');
    dragHoverCell = c ? {zone:c.classList.contains('cell')?'board':'bench', slot:c.classList.contains('cell')?+c.dataset.i:+c.dataset.bi} : null;
    const sb=tgt&&tgt.closest && tgt.closest('#sellBtn');
    if(sb) sb.classList.add('sell-hl');
    const inShop = tgt && tgt.closest && tgt.closest('#shop');
    const shopEl=$('shop'), bn=$('sellBanner');
    shopEl.classList.toggle('sell-zone', !!inShop);
    if(inShop){
      const su=getAt(drag.t,drag.i);
      if(su){
        bn.textContent=`松手出售 +${sellRefund(su)}金`;
        bn.style.display='block';
        const r=shopEl.getBoundingClientRect();
        bn.style.left=Math.max(8, Math.min(innerWidth-210, r.left+r.width/2-90))+'px';
        bn.style.top=Math.max(6, r.top-34)+'px';
      }
      drag.ghost.style.top=(e.clientY-34-24)+'px';
      drag.ghost.classList.add('in-sell');
      if(!drag.wasInSell){ drag.wasInSell=true; sfx('sellhint'); }
    } else {
      bn.style.display='none';
      drag.ghost.classList.remove('in-sell');
      drag.wasInSell=false;
    }
  }
});
document.addEventListener('pointerup', e=>{
  if(unequipDrag){
    const ud=unequipDrag; unequipDrag=null;
    document.querySelectorAll('.drop-panel-hl').forEach(x=>x.classList.remove('drop-panel-hl'));
    $('dragGhost').style.display='none';
    if(!findUnit(ud.uid)) return;
    if(!ud.ghost){ unequipOne(ud.uid, ud.idx); return; }
    const ov=document.elementFromPoint(e.clientX,e.clientY);
    if(ov&&ov.closest&&ov.closest('#equip')) unequipOne(ud.uid, ud.idx);
    else log('⚠ 拖到「装备」背包栏松手才卸下（点按身上的装备芯片也可直接卸下）');
    return;
  }
  if(itemDrag){
    const id=itemDrag; itemDrag=null;
    document.querySelectorAll('.equip-hl').forEach(x=>x.classList.remove('equip-hl'));
    const ip=$('inspect'); if(ip) ip.classList.remove('inspect-hl');
    $('dragGhost').style.display='none';
    $('shop').classList.remove('sell-zone'); $('sellBanner').style.display='none'; $('dragGhost').classList.remove('in-sell');
    if(id.ghost){
      chipClickSuppressedUntil=Date.now()+400;
      const hit=paintEquipDrop(e.clientX,e.clientY);
      if(hit&&!watchedPlayer()){ equipTo(hit.u, id.i); }
      else {
        const ov=document.elementFromPoint(e.clientX,e.clientY);
        const ip2=(ov&&ov.closest&&ov.closest('#inspect')&&state.inspectUid!=null)?findUnit(state.inspectUid):null;
        if(ip2){ equipTo(getAt(ip2[0],ip2[1]), id.i); }
        else {
          log(ov&&ov.closest&&ov.closest('#shop')
            ? '⚠ 装备不能出售：请拖到棋子身上穿戴（右键棋子可卸下装备）'
            : '⚠ 请把装备拖到棋子身上');
        }
      }
    } else {
      state.selItem = state.selItem===id.i ? null : id.i; renderEquip();
    }
    return;
  }
  if(!drag) return;
  const d=drag; drag=null;
  dragHoverCell=null;
  clearRangeFocus();
  $('dragGhost').style.display='none';
  document.querySelectorAll('.drop-hl').forEach(x=>x.classList.remove('drop-hl'));
  document.querySelectorAll('.sell-hl').forEach(x=>x.classList.remove('sell-hl'));
  $('shop').classList.remove('sell-zone'); $('sellBanner').style.display='none'; $('dragGhost').classList.remove('in-sell');
  if(!d.ghost) return;
  const tgt=document.elementFromPoint(e.clientX,e.clientY);
  const sell=tgt&&tgt.closest && tgt.closest('#sellBtn,#shop');
  if(sell && inPrep()){
    const u=getAt(d.t,d.i);
    if(u) sellUnit(u);
    return;
  }
  const c=tgt&&tgt.closest && tgt.closest('.cell,.bslot');
  if(c){
    const tt = c.classList.contains('cell')?'board':'bench';
    const ti = c.classList.contains('cell')?+c.dataset.i:+c.dataset.bi;
    moveOrSwap(d.t,d.i,tt,ti);
    state.selUid=null;
  }
});
function sellUnit(u){
  if(!u||!inPrep()||!canAct())return;
  if(sendAction({type:'sell',uid:u.uid},{optimistic:true})){
    const me=state.view.me;
    const pos=findUnit(u.uid);
    if(pos){ if(pos[0]==='board')me.board[pos[1]]=null; else me.bench[pos[1]]=null; }
    me.gold=(me.gold||0)+sellRefund(u);
    log(`💸 出售 ${cname(u)} +${sellRefund(u)}金`);
    if(state.selUid===u.uid)state.selUid=null;
    if(state.inspectUid===u.uid)hideInspect();
    renderAll();
  }
}
function sellSelected(){
  const sel=state.selUid!=null?findUnit(state.selUid):null;
  if(!sel)return;
  sellUnit(getAt(sel[0],sel[1]));
}
/* 右键 = 卸下全部装备（照搬经典） */
document.addEventListener('contextmenu', e=>{
  if(IS_TOUCH){ e.preventDefault(); return; }
  if(!inPrep()) return;
  const el=e.target.closest && e.target.closest('.unit');
  if(!el) return;
  const cell=el.closest('.cell'), slot=el.closest('.bslot');
  if(!cell && !slot) return;
  e.preventDefault();
  const u = cell ? myTurnBoard()[+cell.dataset.i] : state.view?.me?.bench?.[+slot.dataset.bi];
  if(!u) return;
  if(!u.items || !u.items.length){ log(`⚠ ${cname(u)} 身上没有装备`); return; }
  if(sendAction({type:'unequip',uid:u.uid})){
    const me=state.view.me, names=u.items.map(k=>EQUIPMENT[k]?.n||k).join('、');
    me.items=(me.items||[]).concat(u.items); u.items=[];
    log(`🧥 ${cname(u)} 卸下装备：${names}`);
    renderAll();
  }
});
/* 键盘快捷键（照搬经典：D/F/L/R/A/T/E/X/Delete/空格） */
window.addEventListener('keydown',e=>{
  if(!document.body.classList.contains('online-playing'))return;
  if(!inPrep()||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
  if(e.target?.closest?.('input,textarea,select,[contenteditable],dialog')||document.querySelector('dialog[open]'))return;
  const key=/^Key[A-Z]$/.test(e.code)?e.code.slice(3).toLowerCase():e.key.toLowerCase();
  if(key==='d')$('refreshBtn').click();
  else if(key==='f')$('lvlBtn').click();
  else if(key==='l')$('lockBtn').click();
  else if(key==='a'||key==='r')$('deployBtn').click();
  else if(key==='t')$('tidyBtn').click();
  else if((key==='delete'||key==='x'||key==='e')&&state.selUid!=null)sellSelected();
  else if(key===' '){ e.preventDefault(); $('fightBtn').click(); }
});

/* ================= 渲染：八人战况（新增：8 名玩家血量/名次/观战） ================= */
function renderPlayersHUD(){
  const info=$('arenaInfo'); if(!info)return;
  const players=state.view?.players||[];
  if(!players.length){ info.innerHTML='<div class="pl-hint">等待对局数据…</div>'; return; }
  const maxHp=Math.max(40,...players.map(p=>p.hp||0));
  const alive=players.filter(p=>p.alive!==false).sort((a,b)=>(b.hp||0)-(a.hp||0));
  const out=players.filter(p=>p.alive===false).sort((a,b)=>(a.place||99)-(b.place||99));
  const row=(p,rank,dead)=>{
    const mine=p.seat===state.seat, watching=p.seat===state.spectateSeat;
    return `<button type="button" class="pl-row${mine?' me':''}${dead?' out':''}${watching?' watching':''}" data-watch="${p.seat}">
      <span>${dead?`#${p.place||rank} ·`:rank+'.'} ${escapeHtml(p.name||playerName(p.seat))}${mine?' (你)':''}${p.bot?' 🤖':''}</span>
      <span class="pl-hp-track" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,(p.hp||0)/maxHp*100))}%"></i></span>
      <span>${dead?'淘汰':'❤'+(p.hp??0)+' · Lv'+(p.level||1)}</span></button>`;
  };
  info.innerHTML=alive.map((p,i)=>row(p,i+1,false)).join('')+
    out.map(p=>row(p,alive.length+1,true)).join('')+
    `<div class="pl-hint">${isSpectator()?'点击玩家观战其棋盘 · 点自己返回':'点击玩家可观战其棋盘'}</div>`;
}
$('arenaInfo')?.addEventListener('click',event=>{
  const row=event.target.closest('[data-watch]');
  if(!row)return;
  const seat=Number(row.dataset.watch);
  state.spectateSeat = seat===state.seat ? null : seat;
  state.selUid=null; state.inspectUid=null; hideInspect(); clearRangeFocus();
  renderAll();
});

/* ================= 渲染：战斗统计（照搬经典 statBar） ================= */
const STAT_META={deal:['⚔ 输出','m-deal'],heal:['💚 治疗','m-heal'],take:['🛡 抗伤','m-take']};
function renderStatBar(){
  const bar=$('statBar'); if(!bar) return;
  const playback=state.battlePlayback;
  if(!playback){ bar.innerHTML=''; return; }
  const ownSide=playback.ownSide;
  const rows=playback.units
    .map(u=>({id:u.id,star:u.star||1,side:u.side===ownSide?0:1,
      deal:u.damage||0,dealP:u.physicalDamage||0,dealM:u.magicDamage||0,heal:u.healing||0,take:u.taken||0}))
    .filter(r=>r[state.statMode]>0)
    .sort((a,b)=>b[state.statMode]-a[state.statMode]).slice(0,5);
  const mx=rows.length?rows[0][state.statMode]:1;
  bar.innerHTML = `<div class="stb-tabs">${Object.keys(STAT_META).map(m=>
      `<div class="stb-tab${m===state.statMode?' on':''}" data-stat="${m}">${STAT_META[m][0]}</div>`).join('')}</div>` +
    (rows.length ? rows.map(r=>{
      const wP = state.statMode==='deal' ? Math.round((r.dealP||0)/mx*100) : 0;
      const wM = state.statMode==='deal' ? Math.round((r.dealM||0)/mx*100) : 0;
      const body = state.statMode==='deal'
        ? `<i class="m-deal" style="width:${wP}%"></i><i class="m-dealM" style="width:${wM}%"></i>`
        : `<i class="${STAT_META[state.statMode][1]}" style="width:${Math.max(7,Math.round(r[state.statMode]/mx*100))}%"></i>`;
      return `<div class="stb-row"><i class="stb-side ${r.side===0?'ally':'enemy'}" title="${r.side===0?'我方':'敌方'}"></i><img src="assets/units/${r.id}.png" alt=""><span class="stb-star">${'★'.repeat(r.star)}</span>`+
        `<div class="stb-bar">${body}</div><b>${Math.round(r[state.statMode])}</b></div>`;
      }).join('')
      : `<div class="stb-empty">本回合暂无该类数据</div>`);
}
$('statBar')?.addEventListener('click',event=>{
  const tab=event.target.closest('[data-stat]');
  if(tab){ state.statMode=tab.dataset.stat; renderStatBar(); }
});
let _stbT=0;
function statBarTick(){ const now=Date.now(); if(now-_stbT>500){ _stbT=now; renderStatBar(); } }

/* ================= 战斗（服务器事件 → 经典 renderBattle 棋盘层） ================= */
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
        ...unit, ...starting.get(String(unit.uid)), uid: String(unit.uid), id:unit.id, side,
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
    if (target) target.alive = false;
  }
  if (target) {
    for (const field of ['hp','shield','mana']) if (Number.isFinite(event[field])) target[field] = event[field];
    if (event.type === 'mana' && !Number.isFinite(event.mana)) target.mana = Math.min(target.maxmana || 50,(target.mana || 0) + (event.amount || 0));
  }
  if(target&&event.type==='mark')target.sigMark=event.mark;
  if(target&&['markBurst','markExpired'].includes(event.type))target.sigMark=null;
  if (target && event.type === 'status') { target.statuses = event.statuses; Object.assign(target,event.stats||{}); }
  if(actor&&['attack','skill','bounce','item','bond','counter','echo','tempo','spark','zoneDamage','afterimage','thorns','reflect','link','burn','dot'].includes(event.type)){actor.damage=(actor.damage||0)+(event.amount||0);const metric=event.dtype==='magic'?'magicDamage':'physicalDamage';actor[metric]=(actor[metric]||0)+(event.amount||0);}
  if(target&&event.amount>0&&!['heal','shield','mana','manaBurn'].includes(event.type))target.taken=(target.taken||0)+event.amount;
  if(actor&&event.type==='cast')actor.casts=(actor.casts||0)+1;
  if(event.type==='death'){const killer=playback.units.find(u=>u.uid===String(event.by));if(killer)killer.kills=(killer.kills||0)+1;}
  if(actor&&event.type==='heal')actor.healing=(actor.healing||0)+(event.amount||0);
  if (!playback.catchingUp) {
    const kit=actor&&CLASSIC_SKILLS[actor.id];
    if(event.type==='cast'&&actor)castFeedPush(actor, actor.side===playback.ownSide);
    if(event.type==='cast'&&kit)audio.skillSound(audio.v3Impact(kit,actor),actor,false);
    else if(event.type==='death')audio.sfx('die',{scale:true});
    const recipients=event.type==='cast'?(playback.battle.events||[]).filter(item=>item.at===event.at&&String(item.from)===String(event.from)&&['skill','heal','shield'].includes(item.type)).map(item=>item.target):[];
    playback.renderer?.event(event,recipients);
    // 伤害数字（经典 dmg 弹字）
    if(target&&event.amount>0&&!['heal','shield','mana','manaBurn'].includes(event.type))spawnDamageText(target,`-${event.amount}`,event.crit?'crit':'');
    else if(target&&event.type==='heal'&&event.amount>0)spawnDamageText(target,`+${event.amount}`,'heal');
  }
  if (actor && event.type === 'cast') actor.mana = Number.isFinite(event.mana) ? event.mana : 0;
  // 战报：关键事件落 #log（替代经典战报由 sim 写入的路径）
  if(['cast','death'].includes(event.type)&&!playback.catchingUp){
    const nm=u=>byId(u?.id)?.name||'?';
    if(event.type==='cast')log(`✦ ${nm(actor)} 发动 ${SKILL_NAMES[actor?.id]||'技能'}`);
    else if(event.type==='death')log(`💀 ${nm(target)} 退场${event.by?`（${nm(playback.units.find(x=>x.uid===String(event.by)))} 击杀）`:''}`);
  }
}
function spawnDamageText(u,text,cls){
  const b=$('board'); if(!b)return;
  const p=unitVisual(u);
  const el=document.createElement('div');
  el.className='dmg'+(cls?' '+cls:''); el.textContent=text;
  el.style.left=(p.x-24)+'px'; el.style.top=(p.y-30)+'px';
  b.appendChild(el); setTimeout(()=>el.remove(),800);
}
const STATUS_CLASS={freeze:'frozen',stun:'stunned',weakenT:'weakened',slow:'slowed'};
const STATUS_ICON={freeze:'❄',stun:'💫',weakenT:'🔻',slow:'🐌',noShield:'🔨',healDownT:'💉',silence:'🔇',taunt:'🎯',arDownT:'🪓',mrDownT:'🔯',hex:'🐧',petrifyT:'🗿'};
function renderBattle(playback){
  const b=$('board'); if(!b) return;
  let layer=document.getElementById('unitLayer');
  if(!layer){
    b.innerHTML='';
    for(let i=0;i<64;i++){
      const cell=document.createElement('div');
      cell.className='cell'+(i<32?' enemy-side':'');
      cell.dataset.i=i; cell.style.zIndex=String(1+(i/8|0));
      b.appendChild(cell);
    }
    layer=document.createElement('div'); layer.id='unitLayer';
    b.appendChild(layer);
    _geo=null;
  }
  if(!playback.nodes) playback.nodes=new Map();
  let fx=b.querySelector('.battle-effects');
  if(!fx){ fx=document.createElement('div'); fx.className='battle-effects'; b.appendChild(fx); }
  if(!playback.renderer) playback.renderer=createBattleEffects(fx,playback.nodes,playback.units,skillVisuals,playback.speed);
  const g=boardGeo();
  const seen=new Set();
  for(const u of playback.units){
    if(u.alive===false) continue;
    seen.add(String(u.uid));
    let el=layer.querySelector(`[data-uid="${u.uid}"]`);
    if(!el){
      el=document.createElement('div');
      el.className='unit battle-unit cost'+(byId(u.id)?.cost||1)+(u.side===playback.ownSide?' ally':' enemy');
      el.dataset.uid=u.uid;
      el.title=(u.side===playback.ownSide?'我方 · ':'对手 · ')+unitTitle(u).replace(/"/g,'&quot;').replace(/\n/g,'&#10;');
      el.innerHTML=unitInner(u);
      const teamBadge=document.createElement('span'); teamBadge.className='team-badge';
      teamBadge.setAttribute('aria-hidden','true'); el.appendChild(teamBadge);
      const pe=el.querySelector('.pt'); if(pe) pe.style.animationDelay=(-((Number(u.uid)*137)%2600)/1000)+'s';
      layer.appendChild(el);
      playback.nodes.set(u.uid,el);
    }
    const sz=unitSizeOf(u,el);
    const px=u.x*g.sx+((u.big?2*g.cw+g.gx:g.cw)-sz.w)/2,
          py=u.y*g.sy+((u.big?2*g.ch+g.gy:g.ch)-sz.h)/2;
    el.style.left=px+'px'; el.style.top=py+'px';
    const z=String(10+u.y*2+(u.big?1:0));
    if(el._zk!==z){ el.style.zIndex=z; el._zk=z; }
    if(el.dataset.gx!==undefined && (+el.dataset.gx!==u.x || +el.dataset.gy!==u.y)){
      el.classList.add('walking');
      clearTimeout(el._wt); el._wt=setTimeout(()=>el.classList.remove('walking'), 520);
    }
    el.dataset.gx=u.x; el.dataset.gy=u.y;
    const hp=el.querySelector('.hpfill');
    if(hp){ const hw=Math.max(0,(u.hp??0)/(u.maxhp||1)*100)+'%'; if(el._hw!==hw){ el._hw=hw; hp.style.width=hw; } }
    const mp=el.querySelector('.mpfill');
    if(mp){ const mw=Math.min(100,(u.mana||0)/(u.maxmana||50)*100)+'%'; if(el._mw!==mw){ el._mw=mw; mp.style.width=mw; } }
    el.classList.toggle('ult-ready', u.alive!==false && !(u.isPassive||isPassive(u)) && (u.mana||0)>=(u.maxmana||50) && !(u.statuses||[]).some(s=>['stun','freeze','silence'].includes(s)));
    el.classList.toggle('shielded',(u.shield||0)>0);
    const statuses=u.statuses||[];
    for(const [key,cls] of Object.entries(STATUS_CLASS))el.classList.toggle(cls,statuses.includes(key));
    const stTxt=statuses.map(k=>STATUS_ICON[k]||'').join('');
    let fz=el.querySelector('.fz');
    if(stTxt){
      if(!fz){ fz=document.createElement('span'); fz.className='fz'; el.appendChild(fz); }
      if(el._fz!==stTxt){ el._fz=stTxt; fz.textContent=stTxt; }
    } else if(fz) fz.remove();
  }
  for(const el of [...layer.children]){
    if(!seen.has(el.dataset.uid)) el.remove();
  }
  // 双方存活计数（经典 #aliveBar）
  let ab=$('aliveBar');
  const own=playback.units.filter(u=>u.alive&&u.side===playback.ownSide).length;
  const foe=playback.units.filter(u=>u.alive&&u.side!==playback.ownSide).length;
  if(!ab){ ab=document.createElement('div'); ab.id='aliveBar';
    ab.innerHTML='<span class="ab-me">🔵 我 <b>0</b></span><span class="ab-sep">:</span><span class="ab-foe"><b>0</b> 🔴 敌</span>';
    const synAll=$('synAll');
    if(!IS_TOUCH&&synAll&&synAll.parentNode)synAll.parentNode.insertBefore(ab,synAll);
    else $('oppBar').appendChild(ab);
  }
  ab.querySelector('.ab-me b').textContent=String(own);
  ab.querySelector('.ab-foe b').textContent=String(foe);
}
function renderBattlePlayback(view) {
  const watchingSeat = state.spectateSeat ?? state.seat;
  const battle = view.battles?.find(item => item.a === watchingSeat || item.b === watchingSeat);
  const inBattlePhase = ['combat','result','over'].includes(view.phase);
  if (!battle || battle.b === null || !inBattlePhase) {
    if (state.battleFrame !== null) { cancelAnimationFrame(state.battleFrame); state.battleFrame=null; }
    if(state.battlePlayback){ state.battlePlayback?.renderer?.destroy(); state.battlePlayback=null; $('aliveBar')?.remove(); }
    return;
  }
  const key = `${view.round}:${battle.a}:${battle.b}:${watchingSeat}`;
  if (state.battlePlayback?.key !== key) {
    state.battlePlayback?.renderer?.destroy(); $('aliveBar')?.remove();
    state.battlePlayback = makeBattlePlayback(view,battle);
  }
  const playback = state.battlePlayback;
  playback.battle = battle;
  if (!playback.painted){ renderBattle(playback); playback.painted=true; }
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
    renderBattle(playback);
    statBarTick();
    if (view.phase === 'combat' && elapsed < playback.duration) state.battleFrame = requestAnimationFrame(renderFrame);
    else if(view.phase!=='combat'){
      renderTop();   // 战斗结束后敌方信息栏切回结果提示
    }
  };
  if (state.battleFrame !== null) cancelAnimationFrame(state.battleFrame);
  renderFrame(performance.now());
}

/* ================= 棋盘自适应（照搬经典 fitBoardCell / fitBoard） ================= */
function fitBoardCell(){
  if(typeof matchMedia!=='function') return;
  const wide=matchMedia('(min-width:881px)').matches && !matchMedia('(orientation:landscape) and (max-height:540px)').matches;
  if(!wide){ document.body.style.removeProperty('--cell'); return; }
  const main=$('main'); if(!main) return;
  const syn=$('synCol'), side=$('side');
  const synW=(syn&&syn.offsetParent!==null)?syn.offsetWidth:0;
  const sideW=(side&&side.offsetParent!==null)?side.offsetWidth:0;
  const wAv=main.clientWidth-20-synW-sideW-32;
  const hAv=main.clientHeight-16;
  const ab=$('aliveBar'); const abH=(ab&&ab.offsetParent!==null)?ab.offsetHeight+4:0;
  const c=Math.max(40,Math.min(104,(wAv-14)/8,(hAv-62-abH)/8.85));
  document.body.style.setProperty('--cell',c.toFixed(1)+'px');
  _geo=null;
}
function fitBoard(){
  const w=$('boardwrap'), b=$('board'); if(!w||!b) return;
  const st=w.style;
  if(innerWidth>880){ st.transform=''; st.marginBottom=''; return; }
  const landscape = innerWidth>innerHeight;
  const reserved = ($('shopbar').offsetHeight||0) + (landscape?16:24);
  const main=$('main')||w.parentElement;
  const siblingW=main?[...main.children].filter(el=>el!==w&&getComputedStyle(el).display!=='none').reduce((sum,el)=>sum+el.offsetWidth,0):0;
  const availW = landscape ? Math.max(0,(main?.clientWidth||innerWidth)-siblingW-12) : innerWidth-8;
  const availH = landscape
    ? innerHeight - reserved
    : Math.max(0, (main?.clientHeight || innerHeight - reserved) - 14);
  const s = Math.max(0.35, Math.min(1, availW/w.offsetWidth, availH/w.offsetHeight));
  st.transformOrigin='top center';
  st.transform = s<1 ? `scale(${s})` : '';
  st.marginBottom = s<1 ? (-w.offsetHeight*(1-s))+'px' : '';
}
addEventListener('resize',()=>{ fitBoardCell(); fitBoard(); if(!document.getElementById('unitLayer')) renderBoard(); });

/* ================= 渲染总入口 ================= */
function renderAll(){
  renderBoard();
  renderBench();
  renderShop();
  renderTop();
  renderSynergy();
  renderEquip();
  renderPlayersHUD();
  renderControls();
  fitBoardCell();
}
let lastRenderKey='';
function render(prev){
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
  renderLobby();
  renderControls();
  if (gameVisible) renderGame();
  renderOpening(state.view);
}
function renderGame(){
  const view=state.view;
  if(!view)return;
  // data-phase 用经典取值（prep/battle/chapter/over）：tools 皮肤里 body[data-phase=...] 规则两模式共享
  document.body.dataset.phase=({prep:'prep',combat:'battle',result:'chapter',over:'over'})[view.phase]||'prep';
  const phaseKey=`${view.round}:${view.phase}`;
  if(state.audioPhase!==phaseKey){
    const prevPhase=state.audioPhase.split(':')[1];
    state.audioPhase=phaseKey;
    if(view.phase==='combat'){audio.sfx('battleStart');log(`—— 第 ${view.round} 回合 · 开战 ——`);}
    else if(view.phase==='prep'&&prevPhase==='result'){log(`—— 第 ${view.round} 回合 · 备战 ——`);}
    else if(view.phase==='prep'&&prevPhase===undefined){log(`—— 第 ${view.round} 回合 · 备战 ——`);}
    else if(view.phase==='result'){
      const result=view.results?.find(r=>r.a===state.seat||r.b===state.seat);
      if(result){
        const won=result.winner===state.seat;
        audio.sfx(won?'win':'lose');
        log(won?`🏆 战斗胜利（对 ${playerName(result.a===state.seat?result.b:result.a)}）`:`🩹 战斗失利（对 ${playerName(result.a===state.seat?result.b:result.a)}）${result.damage?` · -${result.damage} 生命`:''}`);
      }
      audio.stopBattle();
    }
  }
  if(view.phase!=='prep'){ state.selUid=null; state.selItem=null; state.moveSel=null; clearRangeFocus(); }
  renderBattlePlayback(view);
  renderAll();
  if(state.inspectUid!=null){
    const pos=findUnit(state.inspectUid);
    if(!pos){ hideInspect(); }
  }
  renderControls();
}
function renderOpening(view){
  const offer=view?.me?.openingOffer;
  let ov=document.getElementById('openingOfferOverlay');
  const active=Array.isArray(offer)&&offer.length&&view?.phase==='prep'&&view?.round===1&&!isSpectator();
  if(!active){ if(ov)ov.remove(); state.openingSig=''; return; }
  const sig=offer.map(u=>u.uid).join(',');
  if(ov&&state.openingSig===sig)return;
  state.openingSig=sig;
  if(ov)ov.remove();
  ov=document.createElement('div'); ov.id='openingOfferOverlay'; ov.className='stg-overlay';
  const card=(u,i)=>{ const d=byId(u.id)||{};
    const syn=[...facsOf(d),...jobsOf(d)].join(' / ');
    return `<button type="button" data-i="${i}" class="stg-pick">
      <img src="${unitImage(u.id)}" alt="">
      <div class="stg-pick-name">${escapeHtml(cname(u))}</div>
      <div class="stg-pick-meta">${d.cost||1} 费 · ${escapeHtml(syn)}</div>
      <div class="stg-pick-role">${escapeHtml(skillText(previewUnit(u)?.skill)).slice(0,46)}</div></button>`; };
  ov.innerHTML=`<div class="stg-card stg-card--wide">
    <div class="stg-kicker">OPENING · 开局应援</div>
    <div class="stg-title">选择你的第一位成员</div>
    <div class="stg-sub">免费加入备战席；倒计时结束未选将自动获得第一位</div>
    <div class="stg-picks">${offer.map(card).join('')}</div></div>`;
  ov.addEventListener('click',e=>{
    const btn=e.target.closest('button[data-i]'); if(!btn)return;
    const slot=Number(btn.dataset.i);
    ov.remove(); state.openingSig='';
    if(sendAction({type:'pickOpening',slot}))log('🎤 开局应援：已选择成员');
  });
  document.body.appendChild(ov);
}
function renderLobby(){
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
function updateCountdown(){
  if(!state.view)return;
  renderTop();   // 倒计时走敌方信息栏
}
function renderControls(){
  const me=state.view?.me||{};
  const active=canAct();
  const capped=(me.level||1)>=MAX_LEVEL;
  $('lobbyReadyBtn').disabled = !state.connected || !state.synced || state.lobby?.status !== 'waiting';
  $('lvlBtn').disabled = !active || capped || state.view?.round===1 || (me.gold??0)<5;
  $('lvlBtn').textContent = capped?'人口已满':(state.view?.round===1?'首回合不可买经验':(IS_TOUCH?'买经验 -5金':'买经验 (F) +4经验 -5金'));
  $('refreshBtn').disabled = !active || (me.gold??0)<2;
  $('lockBtn').disabled = !active;
  $('deployBtn').disabled = !active || ![...(me.board||[]),...(me.bench||[])].some(Boolean);
  $('tidyBtn').disabled = !active || !(me.bench||[]).some(Boolean);
  const sel=state.selUid!=null?findUnit(state.selUid):null;
  $('sellBtn').disabled = !active || !sel;
  const mine=state.view?.players?.find(p=>p.seat===state.seat);
  const autoLocked=!!state.view?.autoLocked;
  const fight=$('fightBtn');
  fight.disabled = !state.connected || !state.synced || !inPrep() || isSpectator() || (view=>{
    return view.phase!=='prep'||autoLocked;
  })(state.view||{});
  fight.textContent = !inPrep() ? (state.view?.phase==='combat'?'⚔ 战斗中':'等待下一轮')
    : autoLocked ? '⏳ 阵容已冻结'
    : mine?.ready ? (IS_TOUCH?'✓ 已锁定':'✓ 已锁定（点击解锁）')
    : (IS_TOUCH?'⚔ 锁定阵容':'⚔ 锁定阵容 (空格)');
}

/* ================= 按钮动作 ================= */
$('refreshBtn').addEventListener('click',()=>{
  if(state.view?.me?.shopLocked){ toast('🔒 商店已锁定，不消耗金币刷新'); return; }
  if(sendAction({type:'reroll'}))log('🔄 刷新商店 -2金');
});
$('lvlBtn').addEventListener('click',()=>{ if(sendAction({type:'buyXp'}))log('📖 买经验 +4 -5金'); });
$('lockBtn').addEventListener('click',()=>{ if(sendAction({type:'lockShop'}))log(state.view?.me?.shopLocked?'🔓 商店已解锁':'🔒 商店已锁定'); });
$('deployBtn').addEventListener('click',()=>{ if(sendAction({type:'autoDeploy'}))log('⚡ 一键上阵（择优布阵）'); });
$('tidyBtn').addEventListener('click',()=>{ if(sendAction({type:'tidy'}))log('🧹 整理备战席'); });
$('sellBtn').addEventListener('click',sellSelected);
$('fightBtn').addEventListener('click',()=>{
  const mine=state.view?.players?.find(p=>p.seat===state.seat);
  if(!inPrep()||state.view?.autoLocked)return;
  if(sendAction({type:'ready',ready:!mine?.ready}))log(mine?.ready?'🔓 已解除锁定':'🔒 阵容已锁定，等待其他玩家');
});
$('sfxBtn').addEventListener('click',()=>audio.toggleSfx());audio.paintSfxBtn();
$('helpBtn').addEventListener('click',()=>$('hotkeyDialog').showModal());
$('codexBtn2').addEventListener('click',()=>$('codexBtn').click());
$('enemyInfo').addEventListener('click',()=>{ if(IS_TOUCH&&document.body.classList.contains('online-playing')) openDrawer('side'); });
$('themeBtn2').addEventListener('click',()=>$('themeBtn').click());
$('hotkeyClose').addEventListener('click',()=>$('hotkeyDialog').close());
$('inviteBtn2').addEventListener('click',async()=>{
  const url=new URL(location.href); url.searchParams.set('room',state.code);
  try{ await navigator.clipboard.writeText(url.toString()); toast('邀请链接已复制。'); }
  catch{ toast(`房间码：${state.code}`); }
});
$('leaveBtn2').addEventListener('click',()=>$('leaveBtn').click());
$('lobbyReadyBtn').addEventListener('click',()=>{
  const mine = state.lobby?.players?.find(p => p.seat === state.seat);
  send({type:'ready', ready:!mine?.ready, id:crypto.randomUUID?.() || String(Date.now())});
});
$('addBotBtn').addEventListener('click',addBot);
$('lobbySeats').addEventListener('click', event => {
  const button = event.target.closest('[data-kickbot]');
  if (button) removeBot(Number(button.dataset.kickbot));
});
$('apiBase').value = state.api;
$('playerName').value = localStorage.getItem(NAME_STORAGE) || '';
const inviteCodeParam = new URL(location.href).searchParams.get('room');
if (inviteCodeParam) $('roomCodeInput').value = inviteCodeParam.toUpperCase();
updateResume();
$('invitationForm').addEventListener('submit', event => { event.preventDefault(); verifyInvitation(); });
$('createBtn').addEventListener('click', () => enterRoom('create'));
$('joinBtn').addEventListener('click', () => enterRoom('join'));
$('resumeBtn').addEventListener('click', resumeRoom);
$('roomCodeInput').addEventListener('keydown', event => { if (event.key === 'Enter') enterRoom('join'); });
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
  state.selUid=state.inspectUid=null;
  state.logArr=[];
  state.session=null;
  localStorage.removeItem(STORAGE);
  updateResume();
  $('leaveBtn').disabled=false;
  showEntry();
});
const savedInvitation = sessionStorage.getItem(INVITE_STORAGE);
if (savedInvitation) {
  $('invitationCode').value = savedInvitation;
  if (state.session?.code === inviteCodeParam?.toUpperCase()) $('apiBase').value = state.session.api || state.api;
  verifyInvitation();
}
window.__onlineState = state;   // 测试/调试句柄
window.closeDrawer = closeDrawer;   // tools/portrait-ui.js 等共享脚本按经典全局约定调用
window.openDrawer = openDrawer;
window.fitBoard = fitBoard;
setInterval(updateCountdown, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeTransport(); });
window.addEventListener('online', resumeTransport);
window.addEventListener('offline', () => { if (!state.stopped) retryConnection(); });

/* ================= 经典布局迁移：详情/敌方信息入左栏；触屏抽屉 ================= */
(function initClassicLayout(){
  if(!IS_TOUCH){
    try{ $('synCol').insertBefore($('oppBar'), $('synAll')); }catch(e){}
    try{ const ip=$('inspectPanel'), sc=$('synCol'); if(ip&&sc) sc.insertBefore(ip, sc.firstChild); }catch(e){}
  }
  fitBoardCell(); fitBoard();
  paintAutoInspectBtn();
})();
function paintAutoInspectBtn(){ const b=$('mAutoInspectBtn'); if(b){ b.textContent=autoInspect?'详情直开：开':'详情直开：关'; b.classList.toggle('on',autoInspect); } }
function drawerMode(){
  const d=$('mDrawer');
  if(!d||d.classList.contains('hidden')) return null;
  if(!$('mShopSec').classList.contains('hidden')) return 'shop';
  if(!$('mBondSec').classList.contains('hidden')) return 'bond';
  if(!$('mEquipSec').classList.contains('hidden')) return 'equip';
  if($('mMenuSec')&&!$('mMenuSec').classList.contains('hidden')) return 'menu';
  return 'side';
}
function openDrawer(mode){
  const d=$('mDrawer'); if(!d)return;
  $('mShopSec').classList.toggle('hidden', mode!=='shop');
  $('mBondSec').classList.toggle('hidden', mode!=='bond');
  $('mEquipSec').classList.toggle('hidden', mode!=='equip');
  $('mSideSec').classList.toggle('hidden', mode!=='side');
  $('mMenuSec')?.classList.toggle('hidden', mode!=='menu');
  $('mDrawerTitle').textContent = mode==='shop' ? '🏪 商店（买牌 / 刷新 / 锁定）'
    : mode==='bond' ? '🔗 羁绊（阵营 / 职业 · 档位效果）'
    : mode==='equip' ? '🎒 装备（拖到棋子身上穿；点身上的装备卸下）'
    : mode==='menu' ? '更多功能'
    : '📋 八人战况 · 棋子详情 · 战报';
  try{ $('mDrawerBox').style.marginBottom = (($('shopbar')&&$('shopbar').offsetHeight)||0)+'px'; }catch(e){}
  d.classList.remove('hidden');
  try{ if(!(history.state&&history.state.vcLayer)) history.pushState({vcLayer:1},''); }catch(e){}   // 返回键先关抽屉
}
function closeDrawer(){
  const d=$('mDrawer'); if(!d||d.classList.contains('hidden')) return;
  d.classList.add('hidden');
  try{ if(history.state&&history.state.vcLayer) history.back(); }catch(e){}
}
window.addEventListener('popstate',()=>{ const d=$('mDrawer'); if(d&&!d.classList.contains('hidden')) d.classList.add('hidden'); });
if(IS_TOUCH&&document.body){
  document.body.classList.add('touch');
  const rel=(id,txt)=>{ const b=document.getElementById(id); if(b) b.textContent=txt; };
  rel('deployBtn','⚡ 一键上阵');
  rel('tidyBtn','🧹 整理备战席');
  rel('fightBtn','⚔ 锁定阵容');
  $('mShopSec').appendChild($('shop'));
  $('mShopSec').appendChild($('shopctlCol'));
  $('mShopSec').appendChild($('pbtns'));
  $('mBondSec').appendChild($('synCol'));
  $('mEquipSec').appendChild($('equipPanel'));
  $('mSideSec').appendChild($('side'));
  const mdraw=(id,mode)=>{ $(id).onclick=()=>{
    if(!inPrep()){ closeDrawer(); return; }
    drawerMode()===mode ? closeDrawer() : openDrawer(mode); }; };
  mdraw('mShopBtn','shop'); mdraw('mBondBtn','bond'); mdraw('mEquipBtn','equip'); mdraw('mSideBtn','side');
  rel('mSideBtn','战况');   // 八人战况/详情/战报同抽屉：触屏上这是观战其他玩家的入口
  { // 更多功能抽屉（照搬经典 mMenuSec 思路）：音效 / 玩法 / 邀请 / 离房
    const menu=$('mMenuSec');
    [['棋子图鉴','codexBtn'],['切换主题','themeBtn'],['音效开关','sfxBtn'],['操作说明','helpBtn'],['复制邀请链接','inviteBtn2'],['退出对局返回入口','leaveBtn2']].forEach(([label,id])=>{
      const b=document.createElement('button'); b.className='btn'; b.textContent=label;
      b.onclick=()=>{ closeDrawer(); const t=$(id); if(t) setTimeout(()=>t.click(),160); };   // 等抽屉的 history 撤销完成再开新层（图鉴），避免连锁竞态
      menu.appendChild(b);
    });
    $('mMenuBtn').onclick=()=>{ drawerMode()==='menu' ? closeDrawer() : openDrawer('menu'); };
  }
  $('mDrawerClose').onclick=closeDrawer;
  const aib=$('mAutoInspectBtn');
  if(aib){ $('mSideSec').insertBefore(aib,$('side')); aib.onclick=()=>{ autoInspect=!autoInspect;
    try{ localStorage.setItem(AUTO_INSPECT_KEY, autoInspect?'1':'0') }catch(e){}
    paintAutoInspectBtn();
    log(autoInspect?'📋 详情直开：开（单击棋子直接看详情）':'📋 详情直开：关（单击棋子优先点选移动，详情走 📋 按钮）');
  }; }
}
