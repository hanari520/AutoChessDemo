const $ = (id) => document.getElementById(id);
const STORAGE = 'star-stage-online-session-v1';
const API_STORAGE = 'star-stage-online-api-v1';
const NAME_STORAGE = 'star-stage-online-name-v1';
const DEFAULT_API = 'https://autochess-online-321604-12-1450980602.sh.run.tcloudbase.com'; // CloudBase 云托管（上海）

const state = {
  api: localStorage.getItem(API_STORAGE) || DEFAULT_API,
  session: readSession(),
  code: '', seat: null, lobby: null, view: null, socket: null,
  connected: false, busy: false, selected: null, seq: 1, pendingAction: null,
  deadline: null, clockSkew: 0, spectateSeat: null,
  reconnectTimer: null, reconnectAttempts: 0, stopped: true,
  battlePlayback: null, battleFrame: null,
};

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
  $('roomScreen').hidden = true;
  $('entryScreen').hidden = false;
  setConnection('idle', '未连接');
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

async function request(path, data) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('无法连接联机服务。请检查服务地址、网络及服务器是否启动。');
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error(`联机服务返回了无法读取的响应（HTTP ${response.status}）。`); }
  if (!response.ok) throw new Error(result.message || result.error?.message || `请求失败（HTTP ${response.status}）。`);
  return result;
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
  state.connected = false;
  state.pendingAction = null;
  const socket = state.socket;
  state.socket = null;
  if (socket) socket.close();
}

function connectSocket() {
  if (!state.session?.token || !state.code) return;
  state.stopped = false;
  clearTimeout(state.reconnectTimer);
  const socket = new WebSocket(wsUrl(state.code));
  state.socket = socket;
  setConnection('connecting', state.reconnectAttempts ? '正在重连' : '连接中');
  socket.addEventListener('open', () => {
    if (socket !== state.socket) return;
    socket.send(JSON.stringify({type:'auth', token: state.session.token}));
  });
  socket.addEventListener('message', event => {
    if (socket !== state.socket) return;
    let message;
    try { message = JSON.parse(event.data); }
    catch { return; }
    if (message.type === 'state') {
      state.connected = true;
      state.reconnectAttempts = 0;
      state.code = message.code || state.code;
      state.seat = message.seat ?? state.seat;
      state.lobby = message.lobby || state.lobby;
      state.view = message.view ?? null;
      state.deadline = message.deadline ?? null;
      if (Number.isFinite(message.serverTime)) state.clockSkew = Date.now() - message.serverTime;
      if (Number.isInteger(message.nextSeq) && message.nextSeq > 0) state.seq = message.nextSeq;
      setConnection('online', '已连接');
      setError('', true);
      render();
    } else if (message.type === 'ack') {
      if (state.pendingAction?.id === message.id) state.pendingAction = null;
      if (Number.isInteger(message.seq)) state.seq = Math.max(state.seq, message.seq + 1);
    } else if (message.type === 'error') {
      if (state.pendingAction?.id === message.id) state.pendingAction = null;
      const detail = message.message || message.code || '操作未完成。';
      if (state.connected) { setError(detail, true); toast(detail); }
      else { setError(`身份验证失败：${detail}`, true); setConnection('offline', '验证失败'); }
    }
  });
  socket.addEventListener('close', () => {
    if (socket !== state.socket || state.stopped) return;
    state.connected = false;
    state.pendingAction = null;
    setConnection('offline', '连接中断');
    $('roomHint').textContent = '连接中断，正在自动重连…';
    renderControls();
    const wait = Math.min(15000, 800 * 2 ** Math.min(state.reconnectAttempts++, 5));
    state.reconnectTimer = setTimeout(connectSocket, wait);
  });
  socket.addEventListener('error', () => {
    if (socket === state.socket) setConnection('offline', '网络异常');
  });
}

function send(message) {
  if (!state.connected || state.socket?.readyState !== WebSocket.OPEN) {
    toast('连接尚未恢复，请稍后重试。');
    return false;
  }
  state.socket.send(JSON.stringify(message));
  return true;
}

function sendAction(action) {
  if (!canAct()) return;
  if (state.pendingAction) { toast('上一项操作尚未确认，请稍候。'); return; }
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  state.pendingAction = {id, seq:state.seq};
  if (!send({type:'action', id, seq:state.seq, action})) state.pendingAction = null;
}

function canAct() {
  const mine = state.view?.players?.find(p => p.seat === state.seat);
  return state.connected && state.lobby?.status === 'playing' && state.view?.phase === 'prep' && !mine?.ready && !isSpectator();
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
  $('lobbySection').hidden = gameVisible;
  $('gameSection').hidden = !gameVisible;
  $('roomCaption').textContent = gameVisible ? 'ONLINE MATCH' : 'ROOM LOBBY';
  $('roomHint').textContent = !state.connected ? '连接中断，正在自动重连…'
    : lobby?.status === 'finished' ? '本局已结束 · 可查看最终战况'
    : gameVisible ? `第 ${state.view?.round ?? '—'} 回合 · ${phaseName(state.view?.phase)}`
    : '等待八位玩家入座并就绪';
  renderLobby();
  if (gameVisible) renderGame();
  renderControls();
}

function renderLobby() {
  const lobby = state.lobby;
  const players = lobby?.players || [];
  const canManageBots = state.seat === 0 && lobby?.status === 'waiting';
  $('occupancy').textContent = `${players.length} / ${lobby?.capacity || 8}`;
  $('lobbySeats').innerHTML = Array.from({length: lobby?.capacity || 8}, (_, seat) => {
    const player = players.find(p => p.seat === seat);
    const status = !player ? '等待入座' : player.bot ? (player.ready ? '机器人 · 已就绪' : '机器人') : !player.connected ? '暂时离线' : player.ready ? '已就绪' : '准备中';
    const kick = player?.bot && canManageBots ? `<button type="button" class="seat-kick" data-kickbot="${player.seat}" aria-label="移除机器人 ${escapeHtml(player.name)}">✕</button>` : '';
    return `<li class="seat ${seat === state.seat ? 'mine' : ''}"><span class="seat-number">${seat + 1}</span><div class="seat-info"><div class="seat-name">${player?.bot ? '<span class="bot-badge" title="机器人替补">🤖</span>' : ''}${player ? escapeHtml(player.name) : '空席位'}${seat === state.seat ? ' · 你' : ''}</div><div class="seat-status ${player?.ready ? 'ready' : ''}">${status}</div></div>${kick}</li>`;
  }).join('');
  const mine = players.find(p => p.seat === state.seat);
  $('lobbyReadyBtn').textContent = mine?.ready ? '取消就绪' : '我已准备';
  $('lobbyNotice').textContent = players.length < 8 ? `还差 ${8 - players.length} 人入座（可用机器人补位）` : '等待所有玩家就绪';
  $('addBotBtn').hidden = !(state.connected && canManageBots && players.length < (lobby?.capacity || 8));
  $('addBotBtn').textContent = players.length <= 1 ? '添加机器人替补（可连点补满）' : '再添一名机器人';
}

function phaseName(phase) {
  return ({prep:'备战',combat:'对战中',result:'结算',over:'对局结束'})[phase] || '等待同步';
}

function updateCountdown() {
  const view = state.view;
  if (!view) return;
  const seconds = state.deadline ? Math.max(0, Math.ceil((state.deadline + state.clockSkew - Date.now()) / 1000)) : null;
  $('phaseLabel').textContent = `${isSpectator() ? '观战 · ' : ''}${phaseName(view.phase)}${seconds === null ? '' : ` · ${seconds} 秒`}`;
}

function battleUnitName(unit) { return unit?.name || unit?.id || '棋子'; }

function battleEventText(event, view, battle) {
  const source = view.players.find(player => player.board?.some(unit => unit && String(unit.uid) === String(event.from)))?.name || '棋子';
  const target = view.players.find(player => player.board?.some(unit => unit && String(unit.uid) === String(event.target)))?.name || '目标';
  if (event.type === 'cast') return `${source}发动技能`;
  if (event.type === 'heal') return `${source}治疗队友`;
  if (event.type === 'shield') return `${source}获得护盾`;
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
  for (const [side, formation] of [['A', battle.formationA], ['B', battle.formationB]]) {
    for (const entry of formation || []) {
      const unit = entry.unit;
      if (!unit) continue;
      const x = entry.slot % 8, y = Math.floor(entry.slot / 8);
      units.push({
        ...unit, uid: String(unit.uid), side, x, y, alive: true,
      });
    }
  }
  const duration = 8000;
  const remaining = state.deadline ? Math.max(0, state.deadline + state.clockSkew - Date.now()) : duration;
  const elapsed = view.phase === 'combat' ? Math.min(duration, Math.max(0, duration - remaining)) : duration;
  return {
    key: `${view.round}:${battle.a}:${battle.b}`,
    battle, units, cursor: 0, elapsed, duration,
    startedAt: performance.now() - elapsed,
    lastPaint: 0, feed: '双方阵容已锁定，战斗由服务器模拟。', feedHoldUntil: 0,
    flash: null,
  };
}

function applyBattleEvent(playback, event, view) {
  if (event.type === 'move') {
    const unit = playback.units.find(item => item.uid === event.unit);
    if (unit) { unit.x = event.x; unit.y = event.y; }
  } else if (event.type === 'death') {
    const unit = playback.units.find(item => item.uid === event.target);
    if (unit) unit.alive = false;
  }
  if (['attack', 'skill', 'bounce', 'cast', 'heal', 'shield', 'death', 'dodge'].includes(event.type)) {
    const now = performance.now();
    // A cast and its damage often share one server tick. Keep the cast visible
    // through subsequent replay frames instead of replacing it immediately.
    if (event.type === 'cast') playback.feedHoldUntil = now + 700;
    if (event.type === 'cast' || now >= playback.feedHoldUntil) {
      playback.feed = battleEventText(event, view, playback.battle);
    }
    playback.flash = {event, at: now};
  }
}

function paintBattle(playback) {
  const cells = Array.from({length:64}, () => []);
  for (const unit of playback.units) {
    if (!unit.alive) continue;
    const slot = unit.y * 8 + unit.x;
    if (slot < 0 || slot >= 64) continue;
    const flashed = playback.flash && performance.now() - playback.flash.at < 480 &&
      [playback.flash.event.from, playback.flash.event.target, playback.flash.event.unit].includes(unit.uid);
    const image = unitImage(unit.id);
    cells[slot].push(`<span class="battle-piece ${unit.side === 'A' ? 'team-a' : 'team-b'} ${flashed ? 'battle-flash' : ''}" style="${image ? `background-image:url('${image}')` : ''}" title="${escapeHtml(battleUnitName(unit))} · ${unit.star || 1} 星"><span>${escapeHtml(battleUnitName(unit))}</span></span>`);
  }
  $('battleArena').innerHTML = cells.map((items, slot) => `<div class="battle-cell ${slot < 24 ? 'enemy-side' : slot >= 40 ? 'own-side' : 'middle-lane'}">${items.join('')}</div>`).join('');
  $('battleFeed').textContent = playback.feed;
}

function renderBattlePlayback(view) {
  const panel = $('combatPanel');
  const watchingSeat = isSpectator() ? state.spectateSeat : state.seat;
  const battle = view.battles?.find(item => item.a === watchingSeat || item.b === watchingSeat);
  if (!battle || battle.b === null) {
    if (state.battleFrame !== null) cancelAnimationFrame(state.battleFrame);
    state.battleFrame = null;
    state.battlePlayback = null;
    panel.hidden = view.phase !== 'combat' && view.phase !== 'result' && view.phase !== 'over';
    $('battleArena').innerHTML = '';
    $('battleFeed').textContent = battle?.b === null ? '本轮轮空，生命与阵容保持不变。' : '你已淘汰，可在八席战况中查看最终名次。';
    $('combatCaption').textContent = battle?.b === null ? '轮空' : '战况回放';
    return;
  }
  panel.hidden = false;
  const key = `${view.round}:${battle.a}:${battle.b}`;
  if (state.battlePlayback?.key !== key) state.battlePlayback = makeBattlePlayback(view, battle);
  const playback = state.battlePlayback;
  playback.battle = battle;
  $('combatTitle').textContent = `战斗 · ${playerName(battle.a)} VS ${playerName(battle.b)}`;
  $('combatCaption').textContent = battle.eventsTruncated ? `同步 ${battle.eventCount} 个事件（已节选）` : `${battle.eventCount ?? battle.events?.length ?? 0} 个服务端事件`;

  const renderFrame = (now) => {
    state.battleFrame = null;
    const elapsed = view.phase === 'combat' ? Math.min(playback.duration, Math.max(0, now - playback.startedAt)) : playback.duration;
    playback.elapsed = elapsed;
    const simElapsed = playback.duration ? elapsed / playback.duration * (battle.durationMs || 0) : 0;
    const events = battle.events || [];
    while (playback.cursor < events.length && (view.phase !== 'combat' || events[playback.cursor].at <= simElapsed)) {
      applyBattleEvent(playback, events[playback.cursor++], view);
    }
    if (elapsed - playback.lastPaint >= 90 || view.phase !== 'combat' || playback.lastPaint === 0) {
      playback.lastPaint = elapsed;
      if (elapsed >= playback.duration) {
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

function unitTitle(unit) {
  return `${unit.name || unit.id || '未知棋子'} · ${unit.star || 1} 星 · ${unit.cost || 1} 金币`;
}

const itemNames = {sword:'长剑',staff:'法杖',armor:'护甲',bow:'长弓',vamp:'吸血',mana:'魔力'};

function renderUnitSlot(unit, zone, slot) {
  const selected = state.selected?.uid === unit?.uid;
  const canMove = canAct() && !!state.selected && !unit;
  if (!unit) return `<button type="button" class="unit-slot empty ${canMove ? 'can-move' : ''}" data-zone="${zone}" data-slot="${slot}" ${canAct() ? '' : 'disabled'} aria-label="${zone === 'board' ? '棋盘' : '备战席'}空位 ${slot + 1}">${canMove ? '移至此处' : '空位'}</button>`;
  const art = unitImage(unit.id);
  const items = (unit.items || []).map(id => itemNames[id] || id).join('、');
  return `<button type="button" class="unit-slot ${selected ? 'selected' : ''}" data-zone="${zone}" data-slot="${slot}" ${canAct() ? '' : 'disabled'} aria-label="${escapeHtml(unitTitle(unit))}${items ? `，装备 ${escapeHtml(items)}` : ''}${selected ? '，已选中' : ''}"><span class="unit-art" ${art ? `style="background-image:url('${art}')"` : ''}></span><span class="unit-meta"><span class="unit-name">${escapeHtml(unit.name || unit.id)}</span><small>★${unit.star || 1} · ${escapeHtml(unit.fac || '')} ${escapeHtml(unit.job || '')}${items ? ` · ${escapeHtml(items)}` : ''}</small></span></button>`;
}

function renderGame() {
  const view = state.view;
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
  } else state.spectateSeat = null;
  if (view.phase !== 'prep') state.selected = null;
  updateCountdown();
  renderBattlePlayback(view);
  $('roundTitle').textContent = `第 ${view.round ?? '—'} 回合`;
  const me = view.me || {};
  const stats = [
    ['生命', me.hp ?? '—'], ['金币', me.gold ?? '—'], ['等级', me.level ?? '—'], ['经验', me.xp ?? '—'],
  ];
  $('playerStats').innerHTML = stats.map(([label,value]) => `<span class="stat">${label} <b>${escapeHtml(value)}</b></span>`).join('');
  $('aliveCount').textContent = `${players.filter(p => p.alive !== false).length} 人存活`;
  $('scoreboard').innerHTML = [...players].sort((a,b) => (b.hp || 0) - (a.hp || 0)).map((p,index) => `<li class="score-item ${p.seat === state.seat ? 'mine' : ''} ${p.alive === false ? 'out' : ''} ${p.seat === state.spectateSeat ? 'watching' : ''}"><button type="button" class="score-button" data-watch="${p.seat}" ${isSpectator() ? '' : 'disabled'} aria-label="观战 ${escapeHtml(p.name || playerName(p.seat))}"><span class="place">${p.place ? `#${p.place}` : String(index + 1).padStart(2,'0')}</span><span class="name">${escapeHtml(p.name || playerName(p.seat))}${p.seat === state.seat ? ' · 你' : ''}</span><span class="hp">${escapeHtml(p.hp ?? 0)} HP</span></button></li>`).join('');
  const pairing = view.pairings?.find(p => p.a === state.seat || p.b === state.seat);
  $('pairingText').textContent = pairing ? pairing.b == null ? '本轮轮空' : `本轮对手：${playerName(pairing.a === state.seat ? pairing.b : pairing.a)}` : '本轮配对尚未公布';
  const watched = isSpectator() ? players.find(p => p.seat === state.spectateSeat) : null;
  const boardOwner = watched || me;
  $('arenaTitle').textContent = watched ? `观战 · ${watched.name}` : '上阵棋盘';
  $('boardCount').textContent = `${(boardOwner.board || []).filter(Boolean).length} / ${boardOwner.level || 1}`;
  $('boardGrid').innerHTML = (boardOwner.board || Array(8).fill(null)).map((unit,slot) => renderUnitSlot(unit,'board',slot)).join('');
  $('benchGrid').innerHTML = (me.bench || Array(8).fill(null)).map((unit,slot) => renderUnitSlot(unit,'bench',slot)).join('');
  $('inventoryList').innerHTML = (me.items || []).length
    ? me.items.map((id,index) => `<button type="button" class="button inventory-item" data-equip="${index}" ${canAct() && state.selected ? '' : 'disabled'}>${escapeHtml(itemNames[id] || id)}<small>${state.selected ? '装备给所选棋子' : '先选择棋子'}</small></button>`).join('')
    : '<p class="empty-message">暂无道具。后续回合会获得简化装备。</p>';
  $('shopList').innerHTML = (me.shop || Array(5).fill(null)).map((unit,slot) => {
    if (!unit) return `<div class="shop-unit empty-message">${slot + 1} · 已售出</div>`;
    const src = unitImage(unit.id);
    return `<div class="shop-unit"><img src="${src}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><div class="shop-name">${escapeHtml(unit.name || unit.id)}</div><div class="shop-traits">★${unit.star || 1} · ${escapeHtml(unit.fac || '')} ${escapeHtml(unit.job || '')}</div></div><button type="button" class="button" data-buy="${slot}" ${canAct() && (me.gold ?? 0) >= unit.cost ? '' : 'disabled'} aria-label="购买 ${escapeHtml(unit.name || unit.id)}，${unit.cost} 金币">${unit.cost} 金币</button></div>`;
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
}

function renderControls() {
  const lobby = state.lobby;
  $('lobbyReadyBtn').disabled = !state.connected || lobby?.status !== 'waiting';
  const active = canAct();
  const me = state.view?.me || {};
  $('rerollBtn').disabled = !active || (me.gold ?? 0) < 2;
  $('buyXpBtn').disabled = !active || (me.gold ?? 0) < 4;
  const mine = state.view?.players?.find(p => p.seat === state.seat);
  $('gameReadyBtn').disabled = !active || !!mine?.ready;
  $('gameReadyBtn').textContent = mine?.ready ? '已锁定阵容' : '锁定阵容 · 结束备战';
  $('sellBtn').disabled = !active || !state.selected;
  $('actionHint').textContent = !state.connected ? '连接中断，操作暂不可用。'
    : isSpectator() ? '你已淘汰。点击八席战况中的玩家可观看其棋盘。'
    : state.view?.phase === 'prep' ? '购买棋子，布置站位，然后锁定阵容。'
    : state.view?.phase === 'over' ? '本局对战结束。'
    : '等待本轮结算，随后进入下一轮备战。';
}

function handleSlotClick(event) {
  const target = event.target.closest('[data-zone][data-slot]');
  if (!target || !canAct()) return;
  const zone = target.dataset.zone;
  const slot = Number(target.dataset.slot);
  const unit = state.view?.me?.[zone]?.[slot];
  if (unit) {
    state.selected = state.selected?.uid === unit.uid ? null : {uid:unit.uid,name:unit.name || unit.id};
    renderGame();
    renderControls();
    return;
  }
  if (state.selected) {
    sendAction({type:'move', uid:state.selected.uid, to:{zone,slot}});
    state.selected = null;
    renderGame();
    renderControls();
  }
}

$('apiBase').value = state.api;
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
$('scoreboard').addEventListener('click', event => {
  const button = event.target.closest('[data-watch]');
  if (button && isSpectator()) {
    state.spectateSeat = Number(button.dataset.watch);
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
  }
});
$('copyInviteBtn').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('room', state.code);
  try { await navigator.clipboard.writeText(url.toString()); toast('邀请链接已复制。'); }
  catch { toast(`房间码：${state.code}`); }
});
$('leaveBtn').addEventListener('click', () => {
  closeSocket();
  state.code = '';
  state.view = state.lobby = null;
  state.selected = null;
  showEntry();
});

if (inviteCode && state.session?.code === inviteCode.toUpperCase()) {
  $('playerName').value = state.session.name || $('playerName').value;
  $('apiBase').value = state.session.api || state.api;
  resumeRoom();
}
setInterval(updateCountdown, 1000);
