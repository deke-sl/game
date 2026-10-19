/* 末日双人行 · 前端逻辑（无构建，原生 JS） */
const $ = (id) => document.getElementById(id);
const STAT_LABELS = { sight:'视力', hearing:'听力', strength:'力量', intel:'智商', agility:'敏捷', intuition:'直觉', luck:'幸运' };
const STAT_ORDER = ['sight','hearing','strength','intel','agility','intuition','luck'];

let state = {
  playerId: localStorage.getItem('mr_pid') || ('p_' + Math.random().toString(36).slice(2, 10)),
  code: null,
  room: null,
  species: 'human',
  stats: null,
  lastLogId: 0,
  pollTimer: null,
  lastActionTs: 0
};
localStorage.setItem('mr_pid', state.playerId);

const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
};

function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function show(name) {
  ['home','lobby','game'].forEach(n => $('screen-' + n).classList.toggle('hidden', n !== name));
}

/* ============ 首页 ============ */
async function loadModes() {
  try {
    const { modes } = await api('/api/modes');
    const m = modes[0];
    $('modeCard').innerHTML = `<div class="m-name">${m.icon} ${m.name}</div><div class="m-intro">${m.intro}</div>`;
  } catch (e) { /* 忽略 */ }
}

$('btnCreate').onclick = async () => {
  try {
    const { code } = await api('/api/room/create', { method: 'POST', body: { mode: 'apocalypse', playerId: state.playerId } });
    state.code = code;
    history.replaceState(null, '', '?c=' + code);
    enterLobby();
  } catch (e) { toast(e.message); }
};
$('btnJoin').onclick = () => $('joinBox').classList.toggle('hidden');
$('btnJoinGo').onclick = async () => {
  const code = ($('joinCode').value || '').trim().toUpperCase();
  if (code.length !== 4) return toast('请输入 4 位房间号');
  try {
    const { room } = await api(`/api/room/${code}/join`, { method: 'POST', body: { playerId: state.playerId } });
    state.code = code; state.room = room;
    history.replaceState(null, '', '?c=' + code);
    routeByRoom();
  } catch (e) { toast(e.message); }
};

/* 支持从分享链接 ?c=XXXX 直接进入 */
async function autojoinFromUrl() {
  const m = location.search.match(/[?&]c=([A-Z0-9]{4})/i);
  if (!m) { show('home'); return; }
  const code = m[1].toUpperCase();
  try {
    const { room } = await api(`/api/room/${code}/join`, { method: 'POST', body: { playerId: state.playerId } });
    state.code = code; state.room = room;
    routeByRoom();
  } catch (e) {
    show('home');
    toast(e.message);
  }
}

/* ============ 大厅 / 创角 ============ */
function enterLobby() {
  show('lobby');
  $('lobbyCode').textContent = state.code;
  resetCharForm();
  startPolling();
}

function resetCharForm() {
  state.species = 'human';
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('on', b.dataset.species === 'human'));
  $('speciesHint').textContent = '人类：末日开始时一定不会感染，永远不会直接变成丧尸，有无限可能。';
  state.stats = null;
  renderStats();
}

document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.onclick = () => {
    state.species = btn.dataset.species;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('on', b === btn));
    $('speciesHint').textContent = state.species === 'zombie'
      ? '丧尸：末日第一批感染者，夜间全属性+40%，另有 人性/伪装/躯体完整 三项数值，末日开始时解锁。'
      : '人类：末日开始时一定不会感染，永远不会直接变成丧尸，有无限可能。';
    reroll();
  };
});

async function reroll() {
  const identity = $('fIdentity').value.trim();
  try {
    const { stats } = await api('/api/roll', { method: 'POST', body: { species: state.species, identity } });
    state.stats = stats;
  } catch (e) {
    // 兜底本地掷点
    const r = (n) => Math.max(1, Math.min(10, n + Math.floor(Math.random() * 3) - 1));
    state.stats = {}; STAT_ORDER.forEach(k => state.stats[k] = r(5));
  }
  renderStats();
}
$('btnReroll').onclick = reroll;

function renderStats() {
  const grid = $('statsGrid');
  grid.innerHTML = '';
  STAT_ORDER.forEach(k => {
    const v = state.stats ? state.stats[k] : '?';
    const pct = state.stats ? (v / 10 * 100) : 0;
    grid.insertAdjacentHTML('beforeend',
      `<div class="stat-row"><span>${STAT_LABELS[k]}</span><span class="bar"><i style="width:${pct}%"></i></span><b>${v}</b></div>`);
  });
}

$('btnSubmitChar').onclick = async () => {
  const form = {
    name: $('fName').value.trim(),
    gender: $('fGender').value.trim(),
    age: $('fAge').value.trim(),
    orientation: $('fOrient').value.trim(),
    appearance: $('fLook').value.trim(),
    species: state.species,
    identity: $('fIdentity').value.trim(),
    city: '本市'
  };
  if (!form.name) { $('charErr').textContent = '请填写姓名'; return; }
  if (!form.identity) { $('charErr').textContent = '请填写身份，用于生成数值'; return; }
  $('charErr').textContent = '';
  try {
    const sysName = $('fSystem').value.trim();
    if (sysName) {
      await api(`/api/room/${state.code}/settings`, { method: 'POST', body: { playerId: state.playerId, systemName: sysName } });
    }
    const { room } = await api(`/api/room/${state.code}/char`, { method: 'POST', body: { playerId: state.playerId, form } });
    state.room = room;
    toast('创角成功，等待对方');
    renderLobby();
  } catch (e) { toast(e.message); }
};

$('btnSaveLLM').onclick = async () => {
  try {
    const data = await api(`/api/room/${state.code}/settings`, {
      method: 'POST',
      body: {
        playerId: state.playerId,
        baseUrl: $('llmBase').value.trim(),
        model: $('llmModel').value.trim(),
        apiKey: $('llmKey').value.trim()
      }
    });
    toast(data.hasLLM ? '已接入大模型，将由 AI 判定' : '已保存（当前仍为本地模拟）');
  } catch (e) { toast(e.message); }
};

$('btnStart').onclick = async () => {
  try {
    const { room } = await api(`/api/room/${state.code}/start`, { method: 'POST', body: { playerId: state.playerId } });
    state.room = room;
    routeByRoom();
  } catch (e) { toast(e.message); }
};

$('btnLobbyBack').onclick = () => {
  if (confirm('离开该房间？（房间会保留，可凭房间号再进）')) {
    stopPolling();
    state.code = null;
    history.replaceState(null, '', location.pathname);
    show('home');
  }
};

/* ============ 分享 ============ */
async function shareLink() {
  const url = location.origin + location.pathname + '?c=' + state.code;
  const text = `我在「末日双人行」开了房，房间号 ${state.code}，点链接进来和我一起末日求生：\n${url}`;
  if (navigator.share) {
    try { await navigator.share({ title: '末日双人行', text, url }); return; } catch (_) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('邀请信息已复制，去微信粘贴给好友即可');
  } catch (_) {
    prompt('复制以下邀请信息发给微信好友：', text);
  }
}
$('btnShare').onclick = shareLink;
$('btnShare2').onclick = shareLink;

/* ============ 游戏渲染 ============ */
function renderChat(room) {
  const box = $('chatScroll');
  const newLogs = room.log.filter(l => l.id > state.lastLogId);
  const atBottom = box.scrollTop + box.clientHeight > box.scrollHeight - 80;
  newLogs.forEach(l => {
    const div = document.createElement('div');
    if (l.type === 'system') { div.className = 'msg sys'; div.textContent = l.text; }
    else if (l.type === 'narration') { div.className = 'msg narration'; div.textContent = l.text; }
    else if (l.type === 'action') {
      const c = room.players[l.slot].char;
      div.className = 'msg action ' + (l.slot === '1' ? 'a' : 'b');
      div.innerHTML = `<span class="who">${c ? c.name : '玩家' + l.slot} 的行动</span>${escapeHtml(l.text)}`;
    } else if (l.type === 'private') {
      div.className = 'msg private';
      div.textContent = '🔒 仅你可见：' + l.text;
    }
    box.appendChild(div);
  });
  if (newLogs.length && (atBottom || newLogs.some(l => l.type === 'narration'))) {
    box.scrollTop = box.scrollHeight;
  }
  if (room.log.length) state.lastLogId = room.log[room.log.length - 1].id;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function renderTurn(room) {
  const mySlot = room.mySlot;
  $('gameCode').textContent = '房间 ' + room.code;
  const tag = $('turnTag');
  const input = $('actionInput');
  const send = $('btnSend');
  if (room.busy) {
    tag.className = 'turn-tag wait'; tag.textContent = '系统结算中…';
    input.disabled = true; send.disabled = true;
  } else if (room.activeSlot === mySlot) {
    tag.className = 'turn-tag ' + (mySlot === '1' ? 'a' : 'b');
    tag.textContent = '轮到你了';
    input.disabled = false; send.disabled = false;
  } else {
    const other = room.players[mySlot === '1' ? '2' : '1'].char;
    tag.className = 'turn-tag wait';
    tag.textContent = '等待 ' + (other ? other.name : '对方') + ' 行动';
    input.disabled = true; send.disabled = true;
  }
}

/* 状态抽屉 */
$('btnStatus').onclick = () => { renderDrawer(); $('drawer').classList.toggle('hidden'); };
$('drawer').onclick = (e) => { if (e.target === $('drawer')) $('drawer').classList.add('hidden'); };

function renderDrawer() {
  const room = state.room;
  const me = room.players[room.mySlot];
  const c = me.char;
  const w = room.world;
  const statLine = (label, val, max) =>
    `<div class="row"><span>${label}</span><span>${val == null ? '—' : val + (max ? '/' + max : '')}</span></div>`;
  let html = `<h3>🪪 ${c.name} ${c.species === 'zombie' ? '🧟丧尸' : '🧑人类'}</h3>`;
  html += `<div class="dsec">
    <div class="row"><span>${w.phase === 'pre' ? '末日倒计时' : '末日第' + w.day + '天'}</span><span>${w.phase === 'pre' ? w.countdownDays + ' 天' : '已爆发'}</span></div>
    <div class="row"><span>当前时间</span><span>${w.time}</span></div>
    <div class="row"><span>位置</span><span>${c.location.city} ${c.location.place}</span></div>
    <div class="row"><span>现金</span><span>¥${c.money}</span></div></div>`;

  let s = '<div class="dsec"><h4 style="margin:0 0 8px">七维属性</h4>';
  STAT_ORDER.forEach(k => s += statLine(STAT_LABELS[k], c.stats[k], null));
  s += '</div>';
  html += s;

  if (w.phase === 'post') {
    let sv = '<div class="dsec"><h4 style="margin:0 0 8px">生存数值</h4>';
    sv += statLine('饥饿值', c.survival.hunger, 100);
    sv += statLine('口渴值', c.survival.thirst, 100);
    sv += statLine('感染度', c.survival.infection, 100) + '%';
    sv += statLine('手机电量', c.survival.battery, 100) + '%';
    sv += '</div>';
    html += sv;
    if (c.species === 'zombie') {
      let z = '<div class="dsec"><h4 style="margin:0 0 8px">丧尸数值</h4>';
      z += statLine('人性值', c.zombie.humanity, 100);
      z += statLine('伪装值', c.zombie.disguise, 100);
      z += statLine('躯体完整', c.zombie.integrity, 100);
      z += statLine('夜间模式', c.zombie.nightMode ? '已激活' : '未激活');
      z += '</div>';
      html += z;
    }
  }

  html += `<div class="dsec"><h4 style="margin:0 0 8px">🎒 物资</h4>`;
  if (!c.inventory.length) html += '<div class="muted">尚未整理物资，可在行动中输入“物资”整理清单。</div>';
  else c.inventory.forEach(i => html += `<div class="item-line">${i.name} ×${i.qty}${i.meta ? '（' + i.meta + '）' : ''}</div>`);
  html += '</div>';

  if (room.memory.facts.length) {
    html += `<div class="dsec"><h4 style="margin:0 0 8px">🧠 深度记忆</h4>` +
      room.memory.facts.slice(-15).map(f => `<div class="item-line">· ${escapeHtml(f)}</div>`).join('') + '</div>';
  }
  html += `<p class="muted">引擎：${room.engine === 'llm' ? '大模型 AI' : '本地模拟（未配置Key）'}<br/>房间号：${room.code}</p>`;
  $('drawerInner').innerHTML = html;
}

/* 快捷指令与发送 */
document.querySelectorAll('.qb').forEach(btn => {
  btn.onclick = () => {
    if ($('actionInput').disabled) return toast('还没轮到你');
    $('actionInput').value = btn.dataset.cmd;
    $('actionInput').focus();
  };
});

async function sendAction() {
  const input = $('actionInput');
  const text = input.value.trim();
  if (!text) return;
  if ($('sendBtn').disabled) return;
  try {
    await api(`/api/room/${state.code}/action`, { method: 'POST', body: { playerId: state.playerId, text } });
    input.value = '';
    state.lastActionTs = Date.now();
    poll(true);
  } catch (e) { toast(e.message); }
}
$('btnSend').onclick = sendAction;
$('actionInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendAction(); });

/* ============ 大厅渲染 ============ */
function renderLobby() {
  const room = state.room;
  $('lobbyCode').textContent = room.code;
  const p1 = room.players['1'], p2 = room.players['2'];
  const mySlot = room.mySlot;

  const chip = (p, el) => {
    el.classList.toggle('ready', !!p.char);
    el.querySelector('.pc-name').textContent = p.char ? p.char.name : (p.id ? '已加入·创角中' : '等待加入');
  };
  chip(p1, $('chip1'));
  chip(p2, $('chip2'));

  const meReady = room.players[mySlot].char;
  $('charCard').classList.toggle('hidden', !!meReady);
  $('waitCard').classList.toggle('hidden', !meReady);

  const isHost = room.hostId === state.playerId;
  $('hostSettings').classList.toggle('hidden', !isHost);
  const bothReady = !!p1.char && !!p2.char;
  $('btnStart').classList.toggle('hidden', !(isHost && bothReady));
  $('waitText').textContent = bothReady
    ? '两位玩家均已就绪，房主点击开始游戏。'
    : '把房间号或分享链接发给对方，对方创角后由房主开始。';
  $('llmStatus').textContent = room.hasLLM ? '✅ 当前由大模型 AI 判定与生成' : '当前为本地模拟引擎';
}

/* ============ 路由与轮询 ============ */
function routeByRoom() {
  if (!state.room) { show('home'); return; }
  if (state.room.status === 'playing') {
    show('game');
    $('gameCode').textContent = '房间 ' + state.code;
    state.lastLogId = 0;
    $('chatScroll').innerHTML = '';
    renderChat(state.room);
    renderTurn(state.room);
  } else {
    enterLobby();
    renderLobby();
  }
}

async function poll(force) {
  if (!state.code) return;
  try {
    const { room } = await api(`/api/room/${state.code}?playerId=${state.playerId}`);
    const prev = state.room;
    state.room = room;
    if (room.status === 'playing') {
      if (!prev || prev.status !== 'playing') {
        show('game');
        state.lastLogId = 0; $('chatScroll').innerHTML = '';
      }
      renderChat(room);
      renderTurn(room);
    } else {
      if (location.pathname && $('screen-game').classList.contains('hidden') === false) {
        /* game ended? */
      }
      renderLobby();
    }
  } catch (e) {
    if (String(e.message).includes('不存在')) { stopPolling(); toast('房间已不存在'); }
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(poll, 1500);
}
function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

/* 初始化 */
loadModes();
if (/[?&]c=/.test(location.search)) {
  autojoinFromUrl();
} else {
  show('home');
}
startPolling();
reroll();
