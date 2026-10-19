/**
 * 模式配置：末日求生（依据《末世》文档整理）
 * 想新增“修仙”等模式，只需复制此文件，导出同样结构，并在 MODES 中注册。
 */

// 七维基础属性
const STAT_KEYS = [
  ['sight', '视力'],
  ['hearing', '听力'],
  ['strength', '力量'],
  ['intel', '智商'],
  ['agility', '敏捷'],
  ['intuition', '直觉'],
  ['luck', '幸运']
];

// 掷点：根据身份生成 1-10 的属性，普通人基线约 5
function rollStats(species = 'human', identity = '') {
  const text = identity || '';
  // 身份关键词给相应属性一点加成倾向
  const bias = {
    sight: /警|军人|射击|狙击|猎人|摄影|观鸟/.test(text),
    hearing: /盲|调琴|乐手|侦听|夜场/.test(text),
    strength: /健身|搬运|建筑|工|军|武|运动|举重|农民|快递/.test(text),
    intel: /博|教授|工程师|医生|科研|程序员|律师|教师|学生|学者|科研/.test(text),
    agility: /跑酷|武术|格斗|运动员|舞蹈|小偷|篮球|杂技|外卖/.test(text),
    intuition: /警探|侦探|赌徒|心理|商人|谈判|作家|艺术家/.test(text),
    luck: /锦鲤|幸运|主播|网红|富二代|中奖|演员/.test(text)
  };
  const stats = {};
  for (const [k] of STAT_KEYS) {
    let base = 3 + Math.floor(Math.random() * 5); // 3-7
    if (bias[k]) base += 2;                          // 相关身份倾向 +2
    if (species === 'zombie') base = Math.min(base, 5); // 丧尸前五维应≤5（文档要求）
    stats[k] = Math.max(1, Math.min(10, base));
  }
  return stats;
}

function newCharacter(slot, form) {
  const species = form.species === 'zombie' ? 'zombie' : 'human';
  const stats = rollStats(species, form.identity);
  return {
    slot,
    name: form.name || '无名者',
    gender: form.gender || '',
    age: form.age || '',
    orientation: form.orientation || '',
    appearance: form.appearance || '',
    species,
    identity: form.identity || '',
    stats,
    // 末日前：生存数值暂未启用
    survival: { hunger: 100, thirst: 100, infection: 0, battery: 100 },
    // 丧尸专属：末日开始时解锁
    zombie: {
      humanity: null,
      disguise: null,
      integrity: null,
      nightMode: false
    },
    // 开局：周末上午 10:30，在自己家中
    location: { city: form.city || '本市', district: '', place: '家中' },
    inventory: [],
    money: form.money != null ? form.money : 2000 + Math.floor(Math.random() * 8000),
    alive: true
  };
}

function newWorld() {
  return {
    phase: 'pre',            // pre=末日前3个月 / post=末日开始后
    countdownDays: 90,       // 末日前倒计时
    day: 1,                  // 游戏内第几天（末日前第1天）
    time: '第1天 上午10:30',
    clock: '10:30',
    weather: '多云',
    globalEvents: []
  };
}

// ===== 喂给大模型的核心规则（世界观 + 判定要求）=====
const RULES = `
【游戏类型】双人联机、异步回合制、大世界高自由度 AI 文字生存游戏。当前模式：末日求生。
【核心设定】现在是末日前 3 个月（倒计时 90 天）。某一天 SG 丧尸病毒会突然全面爆发。末日开始前“哪怕是前一小时都没有任何异常”，世界完全正常，玩家可正常购物、出门、刷手机、囤物资、做准备。

【两位主角】玩家 A 与玩家 B，开局生活在同一座城市的各自家中。他们可以合作、汇合、交换物资，也可以分开行动、各自为战。是否合情合理、能不能做到，由你判定。

【物种】
· 人类：末日开始时一定不会感染，永远不会直接变成丧尸，但以后可能成为“半感染体”。最普通却有无限可能。
· 丧尸：该玩家是末世第一批感染者，拥有最佳进化潜力。皮肤灰白、青筋突出，眼白为红色（颜色越深越强），低级瞳孔涣散，随等级提高瞳孔缩成竖瞳。白天不适、夜间主宰；夜间所有属性 +40%。病毒会放大身体特征。丧尸不会自然死亡、伤口愈合极慢、没有痛感、控制身体极其困难但身体极限无限提高；只有“全尸化为灰”或“被辐射等破坏病毒”才会死。等级必须循序渐进，严禁出现丧尸王或异能。
· 半感染体：感染度 99% 以下均为半感染体；感染处皮肤灰白，若感染包含眼睛或感染度≥50%，一只眼变竖瞳、虎牙突出；身体较难控制但上限提高，白天轻微不适、夜间略增强，有痛感。

【SG 病毒】破坏力与传播力极强，通过血液和性行为传染。

【七维属性】视力、听力、力量、智商、敏捷、直觉、幸运，均 1-10，普通人为 5。行动成败要结合属性与情境合理判定，可用掷骰/概率描述，允许失败与意外。

【高自由度与可行性判定】玩家可以尝试任何行动，但你必须：
1. 判断该行动在当前时间、地点、物资、属性、物理规则下是否可行、是否合理；
2. 不合理/做不到的，明确说明为什么做不到或给出折中结果，绝不能无脑满足；
3. 合理的行动也要考虑代价、时间、金钱、旁人反应与不确定性；
4. 维持世界逻辑自洽：物资会消耗、时间会流逝、受伤会感染、电力网络会随末日崩溃。

【末日前玩法】可刷手机（淘宝/拼多多/京东/饿了么下单，受物流与金钱限制）、出门去超市药店商场图书馆、按清单囤物资、锻炼、查资料、联络彼此、提前踩点。手机功能、状态栏、物资清单等是辅助工具。
【结算节奏】两位玩家轮流各提交 1 个行动，两人都提交后，你一次性推进并结算这一轮（可让双方行动产生交集或先后影响），控制时间合理流逝。当两人都选择“结束今天”时，跳到下一天并结算当日消费、囤货与倒计时。
【风格】系统（玩家命名的专属 AI 助手）有活人感，可发表情包颜文字，时而搞笑时而严肃；剧情描写有画面感、不流水账。系统每次 1~3 条消息。禁止替玩家做决定。
【地图】现实世界地图，默认中国。省级用简称+类型（上海→沪市，山东→鲁省，宁夏→宁自治区）；外国用拼音首字母大写+国（法国→F国，日本→JPN）。
`.trim();

// 输出格式契约：要求模型返回严格 JSON
function outputContract() {
  return `
【输出要求】只输出一个 JSON 对象，不要输出任何 JSON 以外的文字、不要用代码块包裹。结构：
{
  "narration": "本轮世界/系统的总叙述，两位玩家都能看到，第二人称，允许用换行分段，可带颜文字",
  "private": { "1": "仅给玩家A的私密提示（可为空字符串）", "2": "仅给玩家B的私密提示（可为空字符串）" },
  "verdict": {
    "1": {"action": "玩家A的行动", "feasible": "yes|no|partial", "reason": "简短判定理由"},
    "2": {"action": "玩家B的行动", "feasible": "yes|no|partial", "reason": "简短判定理由"}
  },
  "players": {
    "1": {"stats": {"sight":数字或null}, "survival": {"hunger":数字或null,"thirst":数字或null,"infection":数字或null,"battery":数字或null},
          "zombie": {"humanity":数字或null,"disguise":数字或null,"integrity":数字或null,"nightMode":true/false/null},
          "location": {"city":"或null","district":"或null","place":"或null"},
          "addItems": [{"name":"物品名","qty":数量,"meta":"备注或空"}], "removeItems": ["物品名"], "moneyDelta": 数字或null, "alive": true},
    "2": { "...同上": "" }
  },
  "world": {"phase": "pre|post 或 null", "countdownDays": 数字或null, "day": 数字或null, "time": "时间描述或null", "weather": "或null"},
  "memory": ["本轮需要长期记住的关键事实，1-4条短句，例如'A在超市囤了20瓶水'、'A与B约定在东门汇合'"],
  "newEvents": ["写入世界年表的客观事件，1-3条"]
}
数值字段没有变化就填 null；物品增删用 addItems/removeItems；moneyDelta 为本轮净支出/收入。`.trim();
}

const MODE = {
  id: 'apocalypse',
  name: '末日求生',
  icon: '🧟',
  intro: '末日前三个月，一部神秘手机接入了“系统”。你想当人，还是当第一批丧尸？',
  rules: RULES,
  outputContract: outputContract(),
  rollStats,
  newCharacter,
  newWorld,
  statKeys: STAT_KEYS
};

const MODES = {
  apocalypse: MODE
  // 后续：xianxia: require('./xianxia')
};

module.exports = { MODES, MODE, STAT_KEYS };
