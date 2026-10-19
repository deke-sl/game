// 端到端冒烟测试：创建房间→双人创角→开始→轮流行动→结算
const B = 'http://localhost:3000';
const A = 'smokeA', Bp = 'smokeB';
const j = (r, o = {}) => fetch(B + r, { method: o.m || 'GET', headers: { 'Content-Type': 'application/json' }, body: o.b ? JSON.stringify(o.b) : undefined }).then(async x => {
  const t = await x.text();
  if (!x.ok) throw new Error(x.status + ' ' + t);
  return JSON.parse(t);
});

(async () => {
  const { code } = await j('/api/room/create', { m: 'POST', b: { mode: 'apocalypse', playerId: A } });
  console.log('ROOM', code);
  await j(`/api/room/${code}/join`, { m: 'POST', b: { playerId: Bp } });
  await j(`/api/room/${code}/char`, { m: 'POST', b: { playerId: A, form: { name: '阿野', species: 'human', identity: '便利店夜班店员，练过两年拳击，熟悉街道' } } });
  await j(`/api/room/${code}/char`, { m: 'POST', b: { playerId: Bp, form: { name: '小鹿', species: 'zombie', identity: '医学院研究生，擅长解剖，体力一般' } } });
  await j(`/api/room/${code}/start`, { m: 'POST', b: { playerId: A } });
  console.log('STARTED');
  await j(`/api/room/${code}/action`, { m: 'POST', b: { playerId: A, text: '去超市囤20瓶矿泉水和压缩饼干' } });
  await j(`/api/room/${code}/action`, { m: 'POST', b: { playerId: Bp, text: '打开淘宝下单药品和绷带' } });
  await new Promise(r => setTimeout(r, 800));
  const { room } = await j(`/api/room/${code}?playerId=${A}`);
  console.log('STATUS', room.status, 'ROUND', room.round, 'ACTIVE', room.activeSlot, 'ENGINE', room.engine);
  const c1 = room.players['1'].char, c2 = room.players['2'].char;
  console.log('A 物资', c1.inventory.map(i => i.name + 'x' + i.qty).join(','), '现金', c1.money);
  console.log('B 物种', c2.species, '力量(应≤5)', c2.stats.strength, '夜间属性(丧尸)', JSON.stringify(c2.zombie));
  const narr = room.log.filter(l => l.type === 'narration').pop();
  console.log('NARRATION:\n' + narr.text);
  console.log('MEMORY:', room.memory.facts.join(' | '));

  // 回合顺序校验：B 抢先行动应被拒绝
  const bad = await fetch(B + `/api/room/${code}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: Bp, text: '乱入' }) });
  console.log('越权行动状态码(应为400):', bad.status);
  console.log('SMOKE_TEST_OK');
})().catch(e => { console.error('TEST_FAIL', e.message); process.exit(1); });
