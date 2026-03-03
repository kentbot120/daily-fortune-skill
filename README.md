# daily-fortune

每日运势 OpenClaw Skill。结合八字/四柱、西方星座、紫微斗数三种方式推演运势，融合 OpenClaw 的定时任务、聊天记录、活跃时间、记忆等数据，生成个性化每日运势报告。

## 功能

- **三法合参**：八字/四柱 + 星座 + 紫微斗数，取三法共识，过滤冲突建议
- **本地精确计算**：八字四柱、紫微命盘均通过本地脚本算法得出，不依赖 LLM 猜测
- **星座行星数据**：从 Astro.com（Swiss Ephemeris）获取真实行星位置，agent 自行解读
- **OpenClaw 个性化**：结合今日定时任务安排、近期聊天主题、活跃时间、昨日完成率、长期记忆
- **双模式输出**：
  - **晨报模式**（Cron 自动推送）：≤350字速览，每天指定时间推送到指定频道
  - **深度模式**（手动召唤）：完整五节分析，含逐时辰建议和行动清单

## 文件结构

```
daily-fortune/
├── README.md            # 本文件
├── daily-fortune.md     # OpenClaw Skill 主文件（安装时重命名为 SKILL.md）
├── bazi.js              # 八字四柱本地计算脚本
└── ziwei.js             # 紫微斗数本地计算脚本
```

## 安装

### 前置要求

- [OpenClaw](https://openclaw.ai) 已安装并运行
- Node.js ≥ 18

### 步骤

**1. 安装 Skill**

```bash
# 创建 skill 目录
mkdir -p ~/.openclaw/skills/daily-fortune

# 复制 skill 文件（重命名为 SKILL.md）
cp daily-fortune.md ~/.openclaw/skills/daily-fortune/SKILL.md
```

**2. 安装本地计算脚本**

```bash
# 创建脚本目录
mkdir -p ~/.openclaw/fortune-scripts

# 复制脚本
cp bazi.js ziwei.js ~/.openclaw/fortune-scripts/

# 添加执行权限
chmod +x ~/.openclaw/fortune-scripts/bazi.js
chmod +x ~/.openclaw/fortune-scripts/ziwei.js
```

**3. 验证安装**

```bash
# 验证 skill 已被识别
openclaw skills list | grep daily-fortune

# 验证脚本可运行（替换为你的生日）
node ~/.openclaw/fortune-scripts/bazi.js \
  --birth-date 1990-05-15 \
  --birth-time 08:30 \
  --today $(date +%Y-%m-%d)

node ~/.openclaw/fortune-scripts/ziwei.js \
  --birth-date 1990-05-15 \
  --birth-time 08:30
```

**4. 首次启动**

在 OpenClaw 中发送任意一条消息触发初始化引导：

```
今日运势
```

Skill 会引导你填写个人档案（生辰、星座偏好、推送配置），完成后自动创建每日定时任务。

档案保存在 `~/.openclaw/fortune-profile.json`，可随时手动编辑。

### 一键安装脚本

```bash
# 在项目目录下运行
SKILL_DIR=~/.openclaw/skills/daily-fortune
SCRIPT_DIR=~/.openclaw/fortune-scripts

mkdir -p "$SKILL_DIR" "$SCRIPT_DIR"
cp daily-fortune.md "$SKILL_DIR/SKILL.md"
cp bazi.js ziwei.js "$SCRIPT_DIR/"
chmod +x "$SCRIPT_DIR/bazi.js" "$SCRIPT_DIR/ziwei.js"

echo "✅ 安装完成。在 OpenClaw 中发送「今日运势」开始使用。"
```

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

查看/管理定时任务：

```bash
openclaw cron list
```

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

### 星座数据

从 Astro.com（Astrodienst，瑞士）获取当日真实星历数据，包含行星位置、逆行状态、月亮星座，由 agent 基于数据解读，不使用编辑内容。

## 注意事项

- 运势为概率倾向参考，不构成决策依据
- 三法有冲突的维度，skill 会静默过滤，只呈现共识建议
- 农历转换为近似算法，精确排盘建议用专业命理软件核实
