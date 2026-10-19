/**
 * 末日双人行 · 后端服务
 * 房间异步回合：A、B 轮流提交行动 → 两人都提交后统一结算（AI/模拟）。
 */
const express = require('express');
const path = require('path');
const { MODES, MODE } = require('./lib/modes');
const store = require('./lib/store');
const engine = require('./lib/engine');

store.load();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 简单加载 .env（无需第三方依赖）
try {
  const fs = require('fs');
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
  }
} catch (_) {}

// ---------- 工具 ----------
function findSlot(room, playerId) {
  if (room.players['1'].id === playerId) return '1';
  if (room.players['2'].id === playerId) return '2';
  return null;
}

// 客户端视角：私聊条目只返回给本人
function roomView(room, playerId) {
  const slot = findSlot(room, playerId);
  const log = room.log.map(l => {
    if (l.type === 'private' && l.slot !== slot) return null;
    return l;
  }).filter(Boolean);
  const r = Object.assign({}, room, { log, busy: !!room.busy });
  // 不把房主填写的 Key 下发给前端
  if (r.llm) r.llm = r.llm.apiKey ? { configured: true, baseUrl: r.llm.baseUrl, model: r.llm.model } : { configured: false };
  r.mySlot = slot;
  r.hasLLM = engine.hasLLM(room);
  return r;
}

// ---------- 模式列表 ----------
app.get('/api/modes', (req, res) => {
  res.json({
    modes: Object.values(MODES).map(m => ({ id: m.id, name: m.name, icon: m.icon, intro: m.intro }))
  });
});

// 掷点（创角实时预览）
app.post('/api/roll', (req, res) => {
  const { species, identity } = req.body || {};
  res.json({ stats: MODE.rollStats(species, identity) });
});

// ---------- 创建房间 ----------
app.post('/api/room/create', (req, res) => {
  const { mode, playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: '缺少玩家标识' });
  const modeId = MODES[mode] ? mode : 'apocalypse';
  const room = store.createRoom(modeId, playerId);
  res.json({ code: room.code });
});

// ---------- 加入房间 ----------
app.post('/api/room/:code/join', (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = store.getRoom(code);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const { playerId } = req.body || {};
  let slot = findSlot(room, playerId);
  if (!slot) {
    if (room.players['2'].id) return res.status(403).json({ error: '房间已满（双人房）' });
    room.players['2'].id = playerId;
    room.players['2'].lastSeen = Date.now();
    slot = '2';
    store.putRoom(room);
  }
  res.json({ slot, room: roomView(room, playerId) });
});

// ---------- 提交角色 ----------
app.post('/api/room/:code/char', (req, res) => {
  const room = store.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const { playerId, form } = req.body || {};
  const slot = findSlot(room, playerId);
  if (!slot) return res.status(403).json({ error: '你不在该房间' });
  if (!form || !form.name || !form.species) return res.status(400).json({ error: '请至少填写姓名并选择物种' });
  const mode = MODES[room.mode] || MODE;
  room.players[slot].char = mode.newCharacter(slot, form);
  room.players[slot].ready = true;
  store.putRoom(room);
  res.json({ ok: true, room: roomView(room, playerId) });
});

// ---------- 房主设置（系统名 / 模型Key） ----------
app.post('/api/room/:code/settings', (req, res) => {
  const room = store.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const { playerId, systemName, baseUrl, apiKey, model } = req.body || {};
  if (room.hostId !== playerId) return res.status(403).json({ error: '仅房主可设置' });
  if (systemName) room.systemName = String(systemName).slice(0, 12);
  if (apiKey !== undefined || baseUrl !== undefined || model !== undefined) {
    room.llm = {
      apiKey: apiKey || room.llm?.apiKey || '',
      baseUrl: baseUrl || room.llm?.baseUrl || '',
      model: model || room.llm?.model || ''
    };
  }
  store.putRoom(room);
  res.json({ ok: true, hasLLM: engine.hasLLM(room) });
});

// ---------- 开始游戏 ----------
app.post('/api/room/:code/start', (req, res) => {
  const room = store.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const { playerId } = req.body || {};
  if (room.hostId !== playerId) return res.status(403).json({ error: '仅房主可开始' });
  if (!room.players['1'].char || !room.players['2'].char) {
    return res.status(400).json({ error: '需要两位玩家都完成创角' });
  }
  if (room.status === 'playing') return res.json({ ok: true, room: roomView(room, playerId) });

  const mode = MODES[room.mode] || MODE;
  room.world = mode.newWorld();
  room.status = 'playing';
  room.round = 1;
  room.activeSlot = '1';
  const p1 = room.players['1'].char;
  const p2 = room.players['2'].char;
  store.appendLog(room, {
    type: 'narration',
    text:
`你睁开眼，发现手中的手机一直在震。
打开，一个空白文档，正在一点点出现字：
「系统已接入。欢迎来到末日前的 3 个月，你将拥有任何选择。」
——我是你们的专属系统「${room.systemName}」。
${p1.name} 与 ${p2.name}，你们生活在同一座城市。今天是周末上午 10:30，没有任何异常。
距离末日，还有 ${room.world.countdownDays} 天。
你们可以查看手机、出门、囤物资，或做任何想做的事。
（玩法：两人轮流各走一步，A 先行动，B 再行动，随后系统统一结算。）`
  });
  store.putRoom(room);
  res.json({ ok: true, room: roomView(room, playerId) });
});

// ---------- 提交行动 ----------
app.post('/api/room/:code/action', async (req, res) => {
  const room = store.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const { playerId, text } = req.body || {};
  const slot = findSlot(room, playerId);
  if (!slot) return res.status(403).json({ error: '你不在该房间' });
  if (room.status !== 'playing') return res.status(400).json({ error: '游戏尚未开始' });
  if (room.busy) return res.status(429).json({ error: '系统正在结算，请稍候' });
  if (slot !== room.activeSlot) return res.status(400).json({ error: '还没轮到你，请等待对方行动' });

  const action = String(text || '').trim().slice(0, 300);
  if (!action) return res.status(400).json({ error: '行动不能为空' });

  room.actions[slot] = action;
  if (slot === '1') {
    room.activeSlot = '2';
    store.putRoom(room);
    return res.json({ ok: true, waiting: true, room: roomView(room, playerId) });
  }

  // slot 2 已提交 → 统一结算
  room.busy = true;
  store.putRoom(room);
  res.json({ ok: true, settling: true, room: roomView(room, playerId) });

  try {
    await engine.settle(room);
  } catch (e) {
    console.error('[settle] 结算失败：', e);
    store.appendLog(room, { type: 'system', text: '⚠️ 本轮结算异常：' + e.message });
    // 出错则重置，避免卡死
    room.actions = { 1: null, 2: null };
    room.activeSlot = '1';
  } finally {
    room.busy = false;
    store.putRoom(room);
  }
});

// ---------- 轮询房间 ----------
app.get('/api/room/:code', (req, res) => {
  const room = store.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const playerId = req.query.playerId;
  if (playerId) {
    const slot = findSlot(room, playerId);
    if (slot) room.players[slot].lastSeen = Date.now();
  }
  res.json({ room: roomView(room, playerId) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`末日双人行已启动：http://0.0.0.0:${PORT}`);
});
