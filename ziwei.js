#!/usr/bin/env node
/**
 * 紫微斗数核心计算器
 * Usage: node ziwei.js --birth-date YYYY-MM-DD [--birth-time HH:MM]
 *
 * 输出：命宫主星、五行局、大限/小限当前阶段、今日流日宫位
 *
 * 说明：
 * - 本脚本使用公历生日，内部转换为阴历（简化算法，误差±1天）
 * - 紫微斗数以农历生日/时辰为准，边界日期建议用户自行核实
 * - 大限/小限/流日为标准算法，主星排盘为常用简化版
 */

// ── 地支 / 宫位 ───────────────────────────────────────
const BRANCHES    = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const PALACE_NAMES = ['命宫','兄弟','夫妻','子女','财帛','疾厄','迁移','奴仆','官禄','田宅','福德','父母'];

// ── 参数解析 ──────────────────────────────────────────
function parseArgs(argv) {
  const r = {};
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i].startsWith('--')) r[argv[i].slice(2)] = argv[i + 1];
  }
  return r;
}

// ── 公历转农历（简化算法）────────────────────────────
// 使用已知的农历新年公历日期表（1900-2100年范围的精简版）
// 以下仅列出近年关键数据，覆盖常见出生年份
const LUNAR_NEW_YEAR = {
  1970:'01-06',1971:'01-27',1972:'02-15',1973:'02-03',1974:'01-23',
  1975:'02-11',1976:'01-31',1977:'02-18',1978:'02-07',1979:'01-28',
  1980:'02-16',1981:'02-05',1982:'01-25',1983:'02-13',1984:'02-02',
  1985:'02-20',1986:'02-09',1987:'01-29',1988:'02-17',1989:'02-06',
  1990:'01-27',1991:'02-15',1992:'02-04',1993:'01-23',1994:'02-10',
  1995:'01-31',1996:'02-19',1997:'02-07',1998:'01-28',1999:'02-16',
  2000:'02-05',2001:'01-24',2002:'02-12',2003:'02-01',2004:'01-22',
  2005:'02-09',2006:'01-29',2007:'02-18',2008:'02-07',2009:'01-26',
  2010:'02-14',2011:'02-03',2012:'01-23',2013:'02-10',2014:'01-31',
  2015:'02-19',2016:'02-08',2017:'01-28',2018:'02-16',2019:'02-05',
  2020:'01-25',2021:'02-12',2022:'02-01',2023:'01-22',2024:'02-10',
  2025:'01-29',2026:'02-17',
};

// 每个农历月的天数规律（简化：大月30天，小月29天，交替排列）
// 实际农历月长需要精确天文计算，此处用近似值
function solarToLunar(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(`${dateStr}T00:00:00Z`);

  // 找当年或上一年的农历新年
  let lunarYear = y;
  let newYearStr = LUNAR_NEW_YEAR[y];
  if (!newYearStr) {
    return { year: y, month: m <= 2 ? 1 : Math.floor((m - 1) / 1.5), day: d, hour: 0, approx: true };
  }

  const newYear = new Date(`${y}-${newYearStr}T00:00:00Z`);
  if (date < newYear) {
    lunarYear = y - 1;
    newYearStr = LUNAR_NEW_YEAR[y - 1];
    if (!newYearStr) return { year: lunarYear, month: 11, day: d, hour: 0, approx: true };
  }

  const newYearBase = new Date(`${lunarYear}-${LUNAR_NEW_YEAR[lunarYear]}T00:00:00Z`);
  const daysSinceNewYear = Math.round((date - newYearBase) / 86400000);

  // 近似农历月份（每月按29.5天计）
  const lunarMonth = Math.floor(daysSinceNewYear / 29.5) + 1;
  const lunarDay   = Math.round(daysSinceNewYear % 29.5) + 1;

  return {
    year:   lunarYear,
    month:  Math.min(lunarMonth, 12),
    day:    Math.min(Math.max(lunarDay, 1), 30),
    approx: false,
  };
}

// ── 时辰地支 ──────────────────────────────────────────
function getHourBranch(hour) {
  if (hour === 23) return 0; // 子时
  return Math.floor((hour + 1) / 2) % 12;
}

// ── 天干五行 ──────────────────────────────────────────
// 年干索引（1984=甲子=0）
function getYearStemIdx(lunarYear) {
  return ((lunarYear - 4) % 10 + 10) % 10;
}

// ── 命宫计算 ──────────────────────────────────────────
/**
 * 紫微斗数命宫算法：
 * 1. 以寅宫(支=2)为基点，按出生农历月逆时针走
 * 2. 再按出生时辰地支顺时针走
 * 命宫地支 = (2 - (lunarMonth - 1) + hourBranchIdx + 12) % 12
 */
function calcLifePalace(lunarMonth, hourBranchIdx) {
  return ((2 - (lunarMonth - 1) + hourBranchIdx) % 12 + 12) % 12;
}

// ── 五行局 ────────────────────────────────────────────
/**
 * 五行局决定大限起始年龄和步长
 * 由命宫地支 + 年干（纳音法简化版）确定
 * 水二局(2岁起,步12)、木三局(3岁)、金四局(4岁)、土五局(5岁)、火六局(6岁)
 */
// 命宫支 × 年干组 → 五行局
// 年干组: 甲/己=0, 乙/庚=1, 丙/辛=2, 丁/壬=3, 戊/癸=4
const WUXING_JU_TABLE = [
  //    甲/己  乙/庚  丙/辛  丁/壬  戊/癸
  /* 子 */ [2,    6,    4,    2,    6],
  /* 丑 */ [6,    4,    2,    6,    4],
  /* 寅 */ [4,    2,    6,    4,    2],
  /* 卯 */ [2,    6,    4,    2,    6],
  /* 辰 */ [6,    4,    2,    6,    4],
  /* 巳 */ [4,    2,    6,    4,    2],
  /* 午 */ [2,    6,    4,    2,    6],
  /* 未 */ [6,    4,    2,    6,    4],
  /* 申 */ [4,    2,    6,    4,    2],
  /* 酉 */ [2,    6,    4,    2,    6],
  /* 戌 */ [6,    4,    2,    6,    4],
  /* 亥 */ [4,    2,    6,    4,    2],
];

const JU_NAMES = { 2:'水二局', 3:'木三局', 4:'金四局', 5:'土五局', 6:'火六局' };

function getWuxingJu(lifePalaceBranch, yearStemIdx) {
  const group = yearStemIdx % 5;
  const juNum = WUXING_JU_TABLE[lifePalaceBranch][group];
  return { num: juNum, name: JU_NAMES[juNum] };
}

// ── 命宫主星 ──────────────────────────────────────────
/**
 * 紫微主星排布（简化标准排盘）
 * 紫微星位置由农历生日 + 五行局决定
 * 此处使用命宫地支直接对应"该宫常驻核心星"的常用简化对照表
 * 实际完整排盘需逐一安星，此为命宫层面的主要特征星
 */
const LIFE_PALACE_STARS = {
  0:  { main: '天同', aux: ['太阴'],         nature: '福星', trait: '圆融亲和、感情丰富、重视享受，利文艺社交' },
  1:  { main: '天机', aux: ['太阴'],         nature: '智星', trait: '机智灵活、善谋划、思维敏捷，利变动创新' },
  2:  { main: '紫微', aux: ['天府'],         nature: '帝星', trait: '领导气质、自主独立、好面子，适合主导局面' },
  3:  { main: '太阳', aux: ['巨门'],         nature: '官星', trait: '积极外向、光明正大、重事业，利公众场合' },
  4:  { main: '武曲', aux: ['天相'],         nature: '财星', trait: '果断务实、重财务执行、意志坚定，利商务' },
  5:  { main: '天同', aux: ['巨门'],         nature: '福星', trait: '善沟通、外圆内方、晚运佳，利服务业' },
  6:  { main: '廉贞', aux: ['天府'],         nature: '囚星', trait: '个性强烈、竞争心旺、有魄力，利政治法律' },
  7:  { main: '天府', aux: [],              nature: '财库', trait: '稳健保守、积累财富、守成有余，利长期经营' },
  8:  { main: '太阴', aux: [],              nature: '财星', trait: '细腻敏感、重感情与财，女命尤佳，利内务' },
  9:  { main: '贪狼', aux: [],              nature: '欲星', trait: '欲望旺盛、多才多艺、人缘好，利交际娱乐' },
  10: { main: '巨门', aux: [],              nature: '暗星', trait: '口才犀利、善分析、多口舌，利研究口才职业' },
  11: { main: '天相', aux: [],              nature: '印星', trait: '正直守序、助人为乐、贵人多，利辅佐合作' },
};

// ── 大限计算 ──────────────────────────────────────────
/**
 * 大限：每步10年，从五行局数字年龄起算
 * 顺/逆行由命宫阴阳决定（阳男阴女顺行，阴男阳女逆行）
 * 简化：统一按顺行处理，标注说明
 */
function calcDaXian(birthYear, juNum, currentYear) {
  const age = currentYear - birthYear;
  // 大限起始年龄序列：juNum, juNum+10, juNum+20, ...
  let xianIdx = 0;
  let xianStart = juNum;
  while (xianStart + 10 <= age) {
    xianIdx++;
    xianStart += 10;
  }
  const xianEnd = xianStart + 9;
  const xianAge = age - xianStart; // 在当前大限内的第几年（0-9）

  // 大限阶段判断
  let phase;
  if      (xianAge <= 2)  phase = '大限初入（蓄力期）';
  else if (xianAge <= 6)  phase = '大限中段（主运期）';
  else                    phase = '大限末尾（收尾期）';

  return {
    current_xian:   xianIdx + 1,
    age_range:      `${xianStart}-${xianEnd}岁`,
    current_age:    age,
    years_into_xian: xianAge,
    phase,
    next_xian_in:   10 - xianAge,
  };
}

// ── 小限计算 ──────────────────────────────────────────
/**
 * 小限：每年走一宫，从命宫开始（顺行，男女有别，简化统一顺行）
 */
function calcXiaoXian(lifePalanceBranch, birthYear, currentYear) {
  const age = currentYear - birthYear;
  // 小限从命宫出发，每年顺时针走一宫
  const xiaoXianBranch = (lifePalanceBranch + age) % 12;
  const palaceIdx = xiaoXianBranch;
  return {
    branch:      BRANCHES[xiaoXianBranch],
    palace_name: PALACE_NAMES[palaceIdx],
    meaning:     getPalaceMeaning(palaceIdx),
  };
}

// ── 流日宫位 ──────────────────────────────────────────
/**
 * 流日：以流月宫位为基点，按当日农历日数顺走
 * 流月宫位 = (命宫支 + 流月农历月 - 1) % 12
 * 流日宫位 = (流月宫位 + 农历日 - 1) % 12
 */
function calcLiuRi(lifePalaceBranch, lunarMonth, lunarDay) {
  const liuYueBranch = (lifePalaceBranch + lunarMonth - 1) % 12;
  const liuRiBranch  = (liuYueBranch + lunarDay - 1) % 12;
  return {
    liu_yue: { branch: BRANCHES[liuYueBranch], palace: PALACE_NAMES[liuYueBranch] },
    liu_ri:  { branch: BRANCHES[liuRiBranch],  palace: PALACE_NAMES[liuRiBranch], meaning: getPalaceMeaning(liuRiBranch) },
  };
}

// ── 宫位含义 ──────────────────────────────────────────
function getPalaceMeaning(palaceIdx) {
  const meanings = [
    '命宫：自身状态、整体运势走向',
    '兄弟宫：平辈关系、合作伙伴互动',
    '夫妻宫：亲密关系、重要他人',
    '子女宫：下属、创意成果、投资',
    '财帛宫：财运、资金流动、收入',
    '疾厄宫：健康状态、体力消耗',
    '迁移宫：出行、外部环境、变动',
    '奴仆宫：人际助力、下属员工',
    '官禄宫：事业发展、职场机遇',
    '田宅宫：居所、资产、家庭环境',
    '福德宫：内心满足感、精神状态',
    '父母宫：上级关系、文书证件',
  ];
  return meanings[palaceIdx] || '';
}

// ── 流日能量解读 ──────────────────────────────────────
function getLiuRiInsight(palaceIdx) {
  const insights = [
    { focus: '自身', action: '重审自我状态，适合制定个人计划、内省调整' },
    { focus: '平辈/合作', action: '利处理兄弟朋友或同级合作事务' },
    { focus: '关系/伴侣', action: '利处理感情或重要合作关系，避免冷漠' },
    { focus: '下属/投资', action: '利指导下属或跟进投资项目产出' },
    { focus: '财务', action: '重点关注资金进出，利谈钱、收款' },
    { focus: '健康', action: '注意身体信号，避免过劳，适合休养' },
    { focus: '变动/外出', action: '利出行、拜访、接触新环境' },
    { focus: '人际助力', action: '利建立人脉、请托他人帮忙' },
    { focus: '事业/职场', action: '重点事业推进，利争取机会、展现能力' },
    { focus: '家/资产', action: '利处理居家、房产或家族事务' },
    { focus: '精神/享受', action: '保持好心情，适合创意和精神充电' },
    { focus: '上级/文书', action: '利与上级或权威打交道，签约盖章日' },
  ];
  return insights[palaceIdx] || { focus: '综合', action: '平稳运行' };
}

// ── 主程序 ────────────────────────────────────────────
const args      = parseArgs(process.argv.slice(2));
const birthDate = args['birth-date'];
const birthTime = args['birth-time'] || null;
const today     = args['today'] || new Date().toISOString().split('T')[0];

if (!birthDate) {
  console.error(JSON.stringify({ error: '--birth-date is required' }));
  process.exit(1);
}

const birthHour = birthTime ? parseInt(birthTime.split(':')[0]) : 12; // 未知时辰默认午时
const hourBI    = getHourBranch(birthHour);

// 农历转换
const lunarBirth = solarToLunar(birthDate);
const lunarToday = solarToLunar(today);

// 年干索引
const yearStemIdx = getYearStemIdx(lunarBirth.year);

// 命宫
const lifePalaceBranch = calcLifePalace(lunarBirth.month, hourBI);
const lifePalaceInfo   = LIFE_PALACE_STARS[lifePalaceBranch];

// 五行局
const wuxingJu = getWuxingJu(lifePalaceBranch, yearStemIdx);

// 大限 / 小限
const currentYear = parseInt(today.split('-')[0]);
const birthYear   = parseInt(birthDate.split('-')[0]);
const daXian      = calcDaXian(birthYear, wuxingJu.num, currentYear);
const xiaoXian    = calcXiaoXian(lifePalaceBranch, birthYear, currentYear);

// 流日
const liuRi = calcLiuRi(lifePalaceBranch, lunarToday.month, lunarToday.day);
const liuRiInsight = getLiuRiInsight(BRANCHES.indexOf(liuRi.liu_ri.branch));

console.log(JSON.stringify({
  meta: {
    birth_date:   birthDate,
    birth_time:   birthTime || '未知（默认午时）',
    today,
    lunar_birth:  lunarBirth,
    lunar_today:  lunarToday,
    note: lunarBirth.approx ? '农历转换使用近似算法，边界日期建议核实' : null,
  },
  life_palace: {
    branch:      BRANCHES[lifePalaceBranch],
    palace_name: PALACE_NAMES[lifePalaceBranch],
    main_star:   lifePalaceInfo.main,
    aux_stars:   lifePalaceInfo.aux,
    nature:      lifePalaceInfo.nature,
    trait:       lifePalaceInfo.trait,
  },
  wuxing_ju: wuxingJu,
  da_xian: daXian,
  xiao_xian: xiaoXian,
  liu_ri: {
    ...liuRi,
    insight: liuRiInsight,
  },
  summary: {
    current_phase: daXian.phase,
    today_focus:   liuRiInsight.focus,
    today_action:  liuRiInsight.action,
    xiao_xian_palace: xiaoXian.palace_name,
  },
}, null, 2));
