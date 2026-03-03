# daily-fortune

每日运势 OpenClaw Skill。结合八字/四柱、西方星座、紫微斗数三种方式推演运势，融合 OpenClaw 的定时任务、聊天记录、活跃时间、记忆等数据，生成个性化每日运势报告。

## 功能

- **三法合参**：八字/四柱 + 星座 + 紫微斗数，取三法共识，过滤冲突建议
- **本地精确计算**：八字四柱、紫微命盘、行星位置均通过本地脚本算法得出，不依赖 LLM 猜测
- **Swiss Ephemeris 行星数据**：与 Astro.com 同精度的本地行星位置计算（无需网络）
- **OpenClaw 个性化**：结合今日定时任务安排、近期聊天主题、活跃时间、昨日完成率、长期记忆
- **双模式输出**：
  - **晨报模式**（Cron 自动推送）：≤400字速览，每天指定时间推送到指定频道
  - **深度模式**（手动召唤）：完整五节分析，含逐时辰建议和行动清单

## 文件结构

```
daily-fortune/
├── README.md            # 本文件
├── SKILL.md             # OpenClaw Skill 主文件
├── package.json         # Node.js 依赖（sweph）
└── scripts/
    ├── bazi.js          # 八字四柱本地计算脚本
    ├── ziwei.js         # 紫微斗数本地计算脚本
    └── planets.js       # 行星位置计算脚本（Swiss Ephemeris）
```

## 安装

### 前置要求

- [OpenClaw](https://openclaw.ai) 已安装并运行
- Node.js ≥ 18

### 步骤

**1. 安装 Skill**

```bash
# 将整个目录复制到 OpenClaw skills 路径
cp -r . ~/.openclaw/skills/daily-fortune
```

**2. 安装依赖**

```bash
cd ~/.openclaw/skills/daily-fortune
npm install
```

> 这会安装 `sweph`（Swiss Ephemeris Node.js 绑定，GPL 许可），用于本地行星位置精确计算。

**3. 验证安装**

```bash
# 验证脚本可运行（替换为你的生日）
node ~/.openclaw/skills/daily-fortune/scripts/bazi.js \
  --birth-date 1990-05-15 \
  --birth-time 08:30 \
  --today $(date +%Y-%m-%d)

node ~/.openclaw/skills/daily-fortune/scripts/ziwei.js \
  --birth-date 1990-05-15 \
  --birth-time 08:30

node ~/.openclaw/skills/daily-fortune/scripts/planets.js \
  --today $(date +%Y-%m-%d) \
  --sun-sign 金牛
```

**4. 首次启动**

在 OpenClaw 中发送：

```
今日运势
```

Skill 会引导你填写个人档案（生辰、星座偏好、推送配置），完成后自动创建每日定时任务。

档案保存在 `~/.openclaw/fortune-profile.json`，可随时手动编辑。

## 使用

### 手动召唤（深度模式）

```
今日运势
每日运势
帮我看看今天
```

可附加今日意图作为占卜锚点：

```
今日运势，今天要做一个重要决定
```

### 定时推送（晨报模式）

首次初始化后 Skill 自动配置，每天指定时间通过你选择的频道推送晨报。

## 个人档案

档案文件 `~/.openclaw/fortune-profile.json` 结构：

```json
{
  "identity": {
    "name": "你的名字",
    "birth": {
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "location": "城市"
    }
  },
  "astrology": {
    "sun_sign": "金牛座",
    "rising_sign": "双子座",
    "moon_sign": "天蝎座"
  },
  "preferences": {
    "push_time": "07:30",
    "timezone": "Asia/Shanghai",
    "channel": "telegram",
    "to": null
  },
  "context": {
    "current_goals": "2026年重点目标",
    "notes": ""
  },
  "cron_job_id": null
}
```

## 算法说明

### 八字计算（bazi.js）

- 年柱以**立春**（约2月4日）为界
- 月柱以各**节**（非气）为界，使用近似节气日期（误差 ±1-2 天，边界日期建议核实）
- 日柱参考 2000-01-01=戊午，误差为零
- 时柱以子时(23:00)为第一时辰

### 紫微计算（ziwei.js）

- 公历转农历使用内置新年日期表（1970-2026），误差 ±1 天
- 命宫算法：寅宫基点 + 出生农历月逆行 + 出生时辰顺行
- 大限步长由五行局决定（水二/木三/金四/土五/火六局）
- 流日宫位 = 命宫 + 流月偏移 + 农历日数

### 行星位置（planets.js）

- 基于 `sweph@2.10.0-10`（Swiss Ephemeris GPL 版本）
- 无星历文件时自动降级为内置 Moshier 算法（精度约 ±1 角分，星座判断完全够用）
- 有 `sepl_18.se1` + `semo_18.se1` 星历文件时精度达角秒级，与 Astro.com 完全一致
- 计算 10 颗行星位置、逆行状态、与用户太阳星座相位

## 注意事项

- 运势为概率倾向参考，不构成决策依据
- 三法有冲突的维度，skill 会静默过滤，只呈现共识建议
- 农历转换为近似算法，精确排盘建议用专业命理软件核实
