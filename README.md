# 末日双人行 · 双人 AI 文字大世界（手机网页）

两台手机、一个房间号、轮流行动，和朋友一起在**末日前 90 天**里做准备、求生、互相救赎。
行动能不能做到、要求合不合理，全部由**大模型 AI 判定**；拥有持续的**深度记忆**。
当前模式：**末日求生（🧟）**；框架预留“修仙”等更多模式。

- 双人异步回合：A 行动 → B 行动 → 系统统一结算 → 下一轮
- 高自由度：自由输入任何行动，AI 判断可行性与合理性（不是无脑满足）
- 深度记忆：世界状态、人物属性、物资、事件、关键事实长期保存
- 创角：人类 / 丧尸、七维属性、身份影响数值；丧尸夜间加成 + 专属三属性
- 手机模拟、物资清单、状态栏、快捷指令（手机 / 地图 / 物资 / 世界观 / 信息 / 系统 / 结束今天）
- 没有大模型 Key 时，自动使用**内置本地模拟引擎**，照样能完整开局；填入 Key 即切换 AI

---

## 一、本机先跑通（2 分钟）

需要 Node.js 18+（没有就去 https://nodejs.org 装 LTS 版）。

```bash
cd apocalypse-duo
npm install
npm start
```

看到 `末日双人行已启动：http://localhost:3000` 后：

- 电脑浏览器打开 http://localhost:3000 自测；
- 两台手机和电脑连**同一个 WiFi**，手机浏览器访问 `http://你电脑的局域网IP:3000`
  （电脑 IP 可用 `ipconfig` 查 IPv4 地址，如 192.168.1.8）；
- 一台手机**创建房间**，点“分享”把邀请信息/链接通过微信发给另一台；
- 两人都创角后，房主点“开始游戏”。

---

## 二、免费部署到云端，生成微信能打开的链接（推荐 Render）

### 1) 注册并新建服务
1. 打开 https://render.com ，用 GitHub 账号或邮箱注册（免费）。
2. 先把本项目传到你的 GitHub（免费私有仓库即可）：
   - 在 GitHub 新建仓库 `apocalypse-duo`；
   - 在项目目录执行：
     ```bash
     git init
     git add .
     git commit -m "末日双人行"
     git branch -M main
     git remote add origin https://github.com/你的用户名/apocalypse-duo.git
     git push -u origin main
     ```
3. Render 控制台 → **New + → Web Service** → 关联该仓库。
4. 配置：
   - **Runtime / Language**：Node
   - **Build Command**：`npm install`
   - **Start Command**：`npm start`
   - **Instance Type**：选 **Free**
5. 点 **Create Web Service**，等 1~2 分钟部署完成，会得到一个网址，例如：
   `https://apocalypse-duo.onrender.com`

把这个网址直接发微信，点开就能玩（微信内可直接在浏览器打开）。

> 免费版 15 分钟没人访问会休眠，首次打开约 30~50 秒冷启动，之后正常；房间数据在服务重启后会清空（Demo 阶段够用）。正式版可加 Redis/数据库，找我即可。

### 2) 微信分享说明
- 直接在微信里发送 `https://你的网址/?c=房间号` 这种链接，对方点开即自动进入房间。
- 微信内网页如需“自定义卡片标题/图标”，需接入**微信 JS-SDK + 已认证公众号**（进阶，Demo 不需要）；目前用系统自带的“分享/复制邀请文案”即可。

### 其他免费平台（同理）
- **Railway**、**Fly.io**、**Koyeb**：都是 Node 常驻，Build=`npm install`，Start=`npm start`。
- **Vercel / 云函数**：本项目用的是常驻 Node（轮询房间），不建议用无服务器函数，除非另改，不推荐新手。

---

## 三、接入大模型（获得真正的无限自由度与 AI 判定）

两种方式任选：

**方式 A（推荐，长期）：部署时配置环境变量**
在 Render 服务的 **Environment** 里添加：

| 变量 | 内容 |
|---|---|
| `LLM_BASE_URL` | 见下表 |
| `LLM_API_KEY` | 你的 Key |
| `LLM_MODEL` | 见下表 |
| `PORT` | Render 会自动给，不用填 |

**方式 B（临时）：** 在“房间大厅 → 房主设置”里填地址 / 模型 / Key，仅对该房间生效。

### 支持的模型（均为 OpenAI 兼容接口）

| 服务商 | 申请地址 | LLM_BASE_URL | LLM_MODEL 示例 |
|---|---|---|---|
| **DeepSeek**（便宜、中文好） | https://platform.deepseek.com/ → API Keys 创建 | `https://api.deepseek.com` | `deepseek-chat` |
| **豆包 / 火山方舟** | https://www.volcengine.com/product/ark ，开通后创建「推理接入点」 | `https://ark.cn-beijing.volces.com/api/v3` | `ep-xxxxxxxx`（你的接入点 ID） |
| **智谱 GLM** | https://open.bigmodel.cn/ | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Kimi（Moonshot） | https://platform.moonshot.cn/ | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |

申请步骤（以 DeepSeek 为例）：注册 → 实名 → 充值少量余额（几块钱就能玩很久）→ 「API Keys」新建并复制 → 按上表填入。
> 不填 Key 时由“本地模拟引擎”兜底：能跑通购物、出门、汇合、掷点判定、结束今天等基础流程，但不会有真正的自由发挥与脑洞判定。

---

## 四、怎么玩（玩家视角）

1. 创建房间 → 分享给好友 → 双方创角（姓名、性别、年龄、形象、**人类/丧尸**、**身份**），可 🎲 重掷七维属性。
2. 房主可命名你们的“系统”（深渊/老鬼/小破站……）。
3. 开始后：**轮流各走一步**。可点快捷指令，也可直接输入任意行动，例如：
   - “去楼下药店把所有绷带和消毒酒精买了”
   - “给阿野打电话，约在东门的便利店汇合，一起搬空货架”
   - “用我的医学知识判断网上这波发热是不是有问题”
   - （末日后）“屏住呼吸绕开那只丧尸，从消防通道上三楼”
4. AI 会判定这些行动**能不能做到、合不合理、要付出什么代价**，并更新属性/物资/时间/感染度/记忆。
5. 两人都点“结束今天”即跳到下一天，倒计时 -1。

---

## 五、新增“修仙”等模式（给开发者）

模式是即插即用的配置，不需要改核心：

1. 新建 `lib/xianxia.js`，参考 `lib/modes.js` 中 `apocalypse` 的结构，导出：
   `id / name / icon / intro / rules（喂给AI的世界观与判定规则）/ outputContract / rollStats / newCharacter / newWorld / statKeys`。
2. 在 `lib/modes.js` 里注册：
   ```js
   const xianxia = require('./xianxia');
   const MODES = { apocalypse: MODE, xianxia };
   ```
3. 首页/创建房间接口即可选择该模式。

---

## 六、接口与文件说明

```
apocalypse-duo/
├─ server.js           # Express 服务 + 房间/回合 REST 接口
├─ lib/
│  ├─ modes.js         # 末日模式规则（世界观、创角、属性、AI输出契约）
│  ├─ store.js         # JSON 文件存档（房间/日志/记忆）
│  ├─ engine.js        # 结算引擎：AI判定 + 本地模拟 + 状态变更
│  └─ llm.js           # OpenAI 兼容客户端（DeepSeek/豆包/智谱…）
├─ public/             # 手机网页（index.html / styles.css / app.js）
├─ data/rooms.json     # 运行后自动生成的存档
├─ smoke-test.js       # 端到端冒烟测试：node smoke-test.js
└─ .env.example        # 复制为 .env 可配置模型与端口
```

常用接口：`POST /api/room/create`、`/join`、`/char`、`/start`、`/action`、`/settings`、`GET /api/room/:code`、`GET /api/modes`、`POST /api/roll`。

---

## 七、后续可升级（需要时找我）

- 接入 WebSocket 实时推送（替代 1.5 秒轮询）；
- 存档升级为 Redis / SQLite / Postgres，免费版重启不丢档；
- 微信小程序原生版本（需 AppID、备案、JS-SDK 分享卡片）；
- 更多模式（修仙、克苏鲁、校园、赛博）与“世界年表/地图”可视化；
- 单局 3~4 人、观战、AI 主持旁白语音。

祝你们活到第 90 天之后。
