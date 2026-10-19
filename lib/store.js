/**
 * 极简 JSON 文件存储：房间 / 玩家 / 日志 / 记忆
 * 免费云平台文件系统可能在重启后清空，Demo 可接受；正式版可替换为 Redis/数据库。
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'rooms.json');

let cache = { rooms: {} };

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!cache.rooms) cache.rooms = {};
    }
  } catch (e) {
    console.error('[store] 读取存档失败，使用空存档：', e.message);
    cache = { rooms: {} };
  }
}

let saveTimer = null;
function save() {
  // 简单防抖落盘
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      ensureDir();
      fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
      console.error('[store] 写存档失败：', e.message);
    }
  }, 150);
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(modeId, hostId) {
  let code;
  do {
    code = genCode();
  } while (cache.rooms[code]);

  const room = {
    code,
    mode: modeId,
    status: 'waiting', // waiting | playing | ended
    hostId,
    createdAt: Date.now(),
    ts: Date.now(),
    round: 0,
    activeSlot: '1',
    actions: { 1: null, 2: null },
    players: {
      1: { id: hostId, char: null, ready: false, lastSeen: Date.now() },
      2: { id: null, char: null, ready: false, lastSeen: null }
    },
    world: null,
    log: [],
    memory: { summary: '', facts: [] },
    systemName: '系统',
    engine: 'pending' // pending | llm | mock
  };
  cache.rooms[code] = room;
  save();
  return room;
}

function getRoom(code) {
  return cache.rooms[(code || '').toUpperCase()] || null;
}

function putRoom(room) {
  room.ts = Date.now();
  cache.rooms[room.code] = room;
  save();
}

function appendLog(room, entry) {
  const id = room.log.length + 1;
  room.log.push(Object.assign({ id, ts: Date.now() }, entry));
  // 限制日志长度，避免无限膨胀（记忆摘长期保留）
  if (room.log.length > 600) room.log = room.log.slice(-600);
}

module.exports = { load, save, createRoom, getRoom, putRoom, appendLog };
