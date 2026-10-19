/**
 * 结算引擎：两位玩家都提交行动后，调用大模型（或本地模拟）推进世界，
 * 完成“可行性判定 + 叙事 + 属性/物资/世界变更 + 深度记忆”。
 */
const { chatCompletion, extractJson } = require('./llm');
const { MODE } = require('./modes');

function getConfig(room) {
  // 优先使用部署时环境变量；否则用房主在设置里填写的 Key
  const env = process.env;
  return {
    baseUrl: env.LLM_BASE_URL || room.llm?.baseUrl || '',
    apiKey: env.LLM_API_KEY || room.llm?.apiKey || '',
    model: env.LLM_MODEL || room.llm?.model || ''
  };
}

function hasLLM(room) {
  const c = getConfig(room);
  return !!(c.baseUrl && c.apiKey && c.model);
}

function charBrief(p) {
  if (!p || !p.char) return '(未创建角色)';
  const c = p.char;
  const s = c.stats;
  const species = c.species === 'zombie' ? '丧尸' : '人类';
  let str = `${c.name}（${species}，${c.gender || '?'}，${c.age || '?'}岁，身份：${c.identity || '未知'}）位于【${c.location.city}${c.location.district || ''}${c.location.place}】。属性：视力${s.sight} 听力${s.hearing} 力量${s.strength} 智商${s.intel} 敏捷${s.agility} 直觉${s.intuition} 幸运${s.luck}`;
  if (c.inventory.length) str += `。物资：${c.inventory.map(i => i.name + 'x' + i.qty).join('、')}`;
  str += `。现金约¥${c.money}`;
  return str;
}

function buildMessages(room) {
  const mode = require('./modes').MODES[room.mode] || MODE;
  const p1 = room.players['1'].char;
  const p2 = room.players['2'].char;
  const recent = room.log.slice(-24).map(l => {
    if (l.type === 'action') return `[玩家${l.slot} 行动] ${l.text}`;
    if (l.type === 'private') return `[仅玩家${l.slot}可见] ${l.text}`;
    return `[系统] ${l.text}`;
  }).join('\n');

  const mem = room.memory.facts.slice(-30).map((f, i) => `${i + 1}. ${f}`).join('\n') || '（暂无）';

  const system = [
    mode.rules,
    '',
    mode.outputContract,
    '',
    '【系统名】两位玩家的专属系统名为：' + room.systemName + '（叙述中以该名自称）。'
  ].join('\n');

  const user = [
    '【当前世界状态】',
    `阶段：${room.world.phase === 'pre' ? '末日前倒计时' : '末日开始后'}；末日前倒计时：${room.world.countdownDays}天；游戏内第${room.world.day}天；当前时间：${room.world.time}；天气：${room.world.weather}。`,
    '',
    '【玩家A】',
    charBrief(room.players['1']),
    '【玩家B】',
    charBrief(room.players['2']),
    '',
    '【长期记忆（关键事实）】',
    mem,
    '',
    '【最近经过】',
    recent || '（游戏刚开始）',
    '',
    '【本轮两位玩家的行动】',
    `玩家A（${p1 ? p1.name : 'A'}）：${room.actions['1']}`,
    `玩家B（${p2 ? p2.name : 'B'}）：${room.actions['2']}`,
    '',
    '请严格按 JSON 契约一次性结算这一轮。'
  ].join('\n');

  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// ============ 应用结算结果（对 LLM / 模拟通用） ============
function clamp(n, min, max) {
  if (n == null || isNaN(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function applyResult(room, r) {
  const now = Date.now();
  // 叙事
  if (r.narration) require('./store').appendLog(room, { type: 'narration', text: r.narration, ts: now });
  for (const slot of ['1', '2']) {
    const priv = r.private && r.private[slot];
    if (priv) require('./store').appendLog(room, { type: 'private', slot, text: priv, ts: now });
  }

  for (const slot of ['1', '2']) {
    const p = room.players[slot];
    const c = p && p.char;
    const pc = r.players && r.players[slot];
    if (!c || !pc) continue;

    // 属性
    if (pc.stats) {
      for (const k of Object.keys(c.stats)) {
        const v = clamp(pc.stats[k], 1, 10);
        if (v != null) c.stats[k] = v;
      }
    }
    // 生存数值
    if (pc.survival) {
      const map = { hunger: 100, thirst: 100, infection: 100, battery: 100 };
      for (const k of Object.keys(map)) {
        const v = clamp(pc.survival[k], 0, map[k]);
        if (v != null) c.survival[k] = v;
      }
    }
    // 丧尸专属
    if (pc.zombie && c.species === 'zombie') {
      if (clamp(pc.zombie.humanity, 0, 100) != null) c.zombie.humanity = clamp(pc.zombie.humanity, 0, 100);
      if (clamp(pc.zombie.disguise, 0, 100) != null) c.zombie.disguise = clamp(pc.zombie.disguise, 0, 100);
      if (clamp(pc.zombie.integrity, 0, 100) != null) c.zombie.integrity = clamp(pc.zombie.integrity, 0, 100);
      if (typeof pc.zombie.nightMode === 'boolean') c.zombie.nightMode = pc.zombie.nightMode;
    }
    // 位置
    if (pc.location) {
      ['city', 'district', 'place'].forEach(k => {
        if (pc.location[k]) c.location[k] = pc.location[k];
      });
    }
    // 物资
    if (Array.isArray(pc.addItems)) {
      for (const item of pc.addItems) {
        if (!item || !item.name) continue;
        const qty = clamp(item.qty, 1, 9999) || 1;
        const found = c.inventory.find(i => i.name === item.name);
        if (found) found.qty += qty;
        else c.inventory.push({ name: item.name, qty, meta: item.meta || '' });
      }
    }
    if (Array.isArray(pc.removeItems)) {
      for (const name of pc.removeItems) {
        const found = c.inventory.find(i => i.name === name || i.name.includes(name));
        if (found) {
          found.qty -= 1;
          if (found.qty <= 0) c.inventory = c.inventory.filter(i => i !== found);
        }
      }
    }
    if (pc.moneyDelta != null && !isNaN(pc.moneyDelta)) {
      c.money = Math.max(0, c.money + Number(pc.moneyDelta));
    }
    if (typeof pc.alive === 'boolean') c.alive = pc.alive;
  }

  // 世界
  if (r.world) {
    const w = room.world;
    if (r.world.phase === 'pre' || r.world.phase === 'post') w.phase = r.world.phase;
    if (clamp(r.world.countdownDays, 0, 365) != null) w.countdownDays = clamp(r.world.countdownDays, 0, 365);
    if (r.world.day != null && !isNaN(r.world.day)) w.day = Number(r.world.day);
    if (r.world.time) w.time = r.world.time;
    if (r.world.weather) w.weather = r.world.weather;
    if (w.phase === 'pre' && w.countdownDays === 0) w.phase = 'post';
  }

  // 记忆
  if (Array.isArray(r.memory)) {
    for (const f of r.memory) if (f && String(f).trim()) room.memory.facts.push(String(f).trim());
    if (room.memory.facts.length > 60) room.memory.facts = room.memory.facts.slice(-60);
  }
  if (Array.isArray(r.newEvents)) {
    for (const e of r.newEvents) if (e) room.world.globalEvents.push(String(e));
    if (room.world.globalEvents.length > 80) room.world.globalEvents = room.world.globalEvents.slice(-80);
  }
}

// ============ 本地模拟引擎（无 Key 时保证可玩性） ============
const SHOP_ITEMS = {
  水: { name: '矿泉水', qty: 6, cost: 18 },
  食物: { name: '压缩饼干', qty: 4, cost: 40 },
  罐头: { name: '肉罐头', qty: 3, cost: 45 },
  药: { name: '常用药品', qty: 2, cost: 60 },
  绷带: { name: '绷带', qty: 2, cost: 20 },
  电池: { name: '电池', qty: 4, cost: 25 },
  刀: { name: '多功能刀', qty: 1, cost: 35 },
  打火机: { name: '打火机', qty: 2, cost: 6 },
  绳索: { name: '绳索', qty: 1, cost: 28 }
};

function mockSettle(room) {
  const a = room.actions['1'] || '';
  const b = room.actions['2'] || '';
  const p1 = room.players['1'].char;
  const p2 = room.players['2'].char;
  const result = {
    narration: '',
    private: { 1: '', 2: '' },
    verdict: { 1: { action: a, feasible: 'yes', reason: '' }, 2: { action: b, feasible: 'yes', reason: '' } },
    players: { 1: { stats: {}, survival: {}, zombie: {}, location: {}, addItems: [], removeItems: [], moneyDelta: null, alive: true },
               2: { stats: {}, survival: {}, zombie: {}, location: {}, addItems: [], removeItems: [], moneyDelta: null, alive: true } },
    world: { phase: null, countdownDays: null, day: null, time: null, weather: null },
    memory: [],
    newEvents: []
  };

  const bothEnd = /结束今天/.test(a) && /结束今天/.test(b);
  const lines = [];
  lines.push(`（本地模拟引擎·第${room.round + 1}轮｜配置大模型Key后将切换为AI自由判定）`);

  function handle(slot, action) {
    const c = room.players[slot].char;
    const isEnd = /结束今天/.test(action);
    const isBuy = /买|下单|囤|采购|购物|淘宝|拼多多|京东|超市/.test(action);
    const isGoOut = /出门|去|前往|超市|药店|商场|图书馆|学校|医院|车站|找|汇合|见面/.test(action);
    const isPhone = /手机|刷|抖音|b站|哔哩|小说|新闻|地图|天气|搜索|查/.test(action);

    if (isEnd) {
      result.verdict[slot].feasible = 'yes';
      lines.push(`${room.systemName}：${c.name}决定今天先到这里。`);
      return;
    }

    if (isBuy) {
      // 依据关键词挑两到三样物资
      const picked = [];
      for (const key of Object.keys(SHOP_ITEMS)) {
        if (action.includes(key) || picked.length < 2) {
          if (action.includes(key)) picked.push(SHOP_ITEMS[key]);
        }
      }
      if (picked.length === 0) picked.push(SHOP_ITEMS['水'], SHOP_ITEMS['食物']);
      const cost = picked.reduce((s, x) => s + x.cost * x.qty, 0);
      if (c.money < cost) {
        result.verdict[slot].feasible = 'partial';
        result.verdict[slot].reason = '现金/余额不足，只买到一部分';
        lines.push(`${room.systemName}：${c.name}想买东西，但余额不太够，只挑了最紧要的一点…（无奈）`);
        const one = picked[0];
        result.players[slot].addItems.push({ name: one.name, qty: 1 });
        result.players[slot].moneyDelta = -Math.min(one.cost, c.money);
      } else {
        picked.forEach(x => result.players[slot].addItems.push({ name: x.name, qty: x.qty }));
        result.players[slot].moneyDelta = -cost;
        result.memory.push(`${c.name}采购了${picked.map(x => x.name + 'x' + x.qty).join('、')}，花费¥${cost}`);
        lines.push(`${room.systemName}：${c.name}下单/采购了 ${picked.map(x => x.name + 'x' + x.qty).join('、')}，花了 ¥${cost}。物流还得几天，末日之前一切照常。`);
      }
      return;
    }

    if (isGoOut) {
      const place = /药店/.test(action) ? '药店' : /超市/.test(action) ? '超市' : /商场/.test(action) ? '商场'
        : /图书馆/.test(action) ? '图书馆' : /医院/.test(action) ? '医院' : /学校/.test(action) ? '学校' : '街上';
      result.players[slot].location = { city: null, district: null, place };
      // 汇合判定
      const other = slot === '1' ? p2 : p1;
      if (other && /汇合|见面|找/.test(action)) {
        lines.push(`${room.systemName}：${c.name}出门想去找${other.name}。你们通了气，约在彼此都熟悉的地点碰头，距离不远，应该能成。`);
        result.memory.push(`${c.name}尝试与${other.name}汇合`);
      } else {
        lines.push(`${room.systemName}：${c.name}出门去了${place}。周末的街上一切如常，没人知道倒计时已经开始。`);
      }
      return;
    }

    if (isPhone) {
      lines.push(`${room.systemName}：${c.name}刷了会儿手机。热搜还是那些娱乐八卦，岁月静好——这是末日前最安静的时刻。`);
      result.players[slot].survival.battery = clamp(c.survival.battery - 5, 0, 100);
      return;
    }

    // 自由行动：结合最相关属性做一次掷点判定
    const statKeys = Object.keys(c.stats);
    const roll = 1 + Math.floor(Math.random() * 10);
    const statName = statKeys[Math.floor(Math.random() * statKeys.length)];
    const ok = roll <= (c.stats[statName] + 2);
    if (ok) {
      lines.push(`${room.systemName}：${c.name}尝试「${action}」。判定通过（掷点${roll}），事情顺利推进了。`);
      result.memory.push(`${c.name}做了：${action}（成功）`);
    } else {
      result.verdict[slot].feasible = 'partial';
      result.verdict[slot].reason = '条件/运气不足，只取得部分结果';
      lines.push(`${room.systemName}：${c.name}尝试「${action}」，但进展不太顺利（掷点${roll}）。也许换个思路、或先备好物资再来。`);
      result.memory.push(`${c.name}做：${action}（受挫）`);
    }
  }

  handle('1', a);
  handle('2', b);

  if (bothEnd) {
    result.world.day = room.world.day + 1;
    result.world.countdownDays = Math.max(0, room.world.countdownDays - 1);
    result.world.time = `第${room.world.day + 1}天 上午`;
    lines.push(`第${room.world.day}天结束。倒计时还剩 ${Math.max(0, room.world.countdownDays - 1)} 天。两人都休息了，第二天到来。`);
    result.newEvents.push(`第${room.world.day}天结束`);
  } else {
    result.world.time = advanceTime(room.world.time);
  }

  result.narration = lines.join('\n');
  return result;
}

function advanceTime(timeStr) {
  const m = timeStr.match(/第(\d+)天\s*(上午|下午|晚上|深夜)?\s*(\d{1,2}):(\d{2})?/);
  if (!m) return timeStr;
  let day = Number(m[1]);
  let h = Number(m[3]) + 1;
  let part = m[2] || '上午';
  if (h >= 12 && part === '上午') part = '下午';
  if (h >= 18) part = '晚上';
  if (h >= 24) { h = h - 24; part = '上午'; day += 1; }
  return `第${day}天 ${part} ${h}:00`;
}

// ============ 对外主流程 ============
async function settle(room) {
  const mode = require('./modes').MODES[room.mode] || MODE;
  let result = null;

  if (hasLLM(room)) {
    const cfg = getConfig(room);
    try {
      const content = await chatCompletion({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages: buildMessages(room),
        temperature: 0.95,
        maxTokens: 2000
      });
      result = extractJson(content);
      room.engine = 'llm';
    } catch (e) {
      console.error('[engine] 大模型调用失败，回退本地模拟：', e.message);
      require('./store').appendLog(room, { type: 'system', text: `⚠️ 大模型调用失败（${e.message.slice(0, 80)}），本轮临时使用本地模拟。` });
      result = mockSettle(room);
      room.engine = 'mock';
    }
  } else {
    result = mockSettle(room);
    room.engine = 'mock';
  }

  // 记录本轮双方行动
  for (const slot of ['1', '2']) {
    if (room.actions[slot]) {
      require('./store').appendLog(room, { type: 'action', slot, text: room.actions[slot] });
    }
  }

  applyResult(room, result);

  // 进入下一轮
  room.round += 1;
  room.actions = { 1: null, 2: null };
  room.activeSlot = '1';
  return room;
}

module.exports = { settle, hasLLM, getConfig };
