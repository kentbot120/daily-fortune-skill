#!/usr/bin/env node
/**
 * 八字四柱计算器
 * Usage: node bazi.js --birth-date YYYY-MM-DD [--birth-time HH:MM] --today YYYY-MM-DD
 *
 * 算法说明：
 * - 年柱：以立春为界，参考年 1984=甲子
 * - 月柱：以节（非气）为界，使用近似节气日期（误差±1-2天）
 * - 日柱：参考 2000-01-01=戊午（循环序号54），误差为0
 * - 时柱：以子时(23:00)为第一时辰
 */

const STEMS   = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

const STEM_ELEM   = ['木','木','火','火','土','土','金','金','水','水'];
const BRANCH_ELEM = ['水','土','木','木','土','火','火','土','金','金','土','水'];

// 五行索引: 木=0 火=1 土=2 金=3 水=4
const E = { 木:0, 火:1, 土:2, 金:3, 水:4 };
// elem[i] 生 elem[PROD[i]]，elem[i] 克 elem[CTRL[i]]
const PROD = [1, 2, 3, 4, 0];
const CTRL = [2, 3, 4, 0, 1];

// ── 参数解析 ──────────────────────────────────────────
function parseArgs(argv) {
  const r = {};
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i].startsWith('--')) r[argv[i].slice(2)] = argv[i + 1];
  }
  return r;
}

// ── 日期工具 ──────────────────────────────────────────
function toUTCDate(str) {
  return new Date(str + 'T00:00:00Z');
}

function daysSince(base, target) {
  return Math.round((toUTCDate(target) - toUTCDate(base)) / 86400000);
}

// ── 年柱 ──────────────────────────────────────────────
// 年柱以立春(约2月4日)为分界，立春前算上一年
function getYearPillar(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // 简化立春判断：2月4日为界（实际误差±1天，对年柱影响可忽略）
  const baziYear = (m < 2 || (m === 2 && d < 4)) ? y - 1 : y;
  const si = ((baziYear - 4) % 10 + 10) % 10;
  const bi = ((baziYear - 4) % 12 + 12) % 12;
  return { stem: STEMS[si], branch: BRANCHES[bi], si, bi, element: STEM_ELEM[si] };
}

// ── 月柱 ──────────────────────────────────────────────
// 八字月令以"节"（非"气"）为界，下表为各节近似公历日期
// 返回月支索引（寅=2, 卯=3, ..., 丑=1）
const JIEQI = [
  // [公历月, 公历日, 对应月支索引]  按时间顺序排列（小寒→大雪）
  [1,  6,  1],  // 小寒  → 丑月(支=1)
  [2,  4,  2],  // 立春  → 寅月(支=2)  ← 八字年分界
  [3,  6,  3],  // 惊蛰  → 卯月(支=3)
  [4,  5,  4],  // 清明  → 辰月(支=4)
  [5,  6,  5],  // 立夏  → 巳月(支=5)
  [6,  6,  6],  // 芒种  → 午月(支=6)
  [7,  7,  7],  // 小暑  → 未月(支=7)
  [8,  7,  8],  // 立秋  → 申月(支=8)
  [9,  8,  9],  // 白露  → 酉月(支=9)
  [10, 8, 10],  // 寒露  → 戌月(支=10)
  [11, 7, 11],  // 立冬  → 亥月(支=11)
  [12, 7,  0],  // 大雪  → 子月(支=0)
];

function getMonthBranchIdx(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let branchIdx = 1; // 默认丑月（1月初立春前）
  for (let i = JIEQI.length - 1; i >= 0; i--) {
    const [jm, jd, bi] = JIEQI[i];
    if (m > jm || (m === jm && d >= jd)) {
      branchIdx = bi;
      break;
    }
  }
  return branchIdx;
}

function getMonthPillar(yearStemIdx, monthBranchIdx) {
  // 月干起点规则（五虎遁年起月法）：
  // 甲/己年 → 寅月干=丙(2)；乙/庚→戊(4)；丙/辛→庚(6)；丁/壬→壬(8)；戊/癸→甲(0)
  const bases = [2, 4, 6, 8, 0];
  const stemBase = bases[yearStemIdx % 5];
  // 寅月(支=2)为起点，月支每+1则月干+1
  const offset = (monthBranchIdx - 2 + 12) % 12;
  const si = (stemBase + offset) % 10;
  return { stem: STEMS[si], branch: BRANCHES[monthBranchIdx], si, bi: monthBranchIdx, element: STEM_ELEM[si] };
}

// ── 日柱 ──────────────────────────────────────────────
// 参考：2000-01-01 = 戊午日（甲子循环序号54）
// 验证：戊=干4，午=支6，循环序号 k 满足 k%10=4,k%12=6 → k=54 ✓
function getDayPillar(dateStr) {
  const days = daysSince('2000-01-01', dateStr);
  const idx = ((days + 54) % 60 + 60) % 60;
  const si = idx % 10;
  const bi = idx % 12;
  return { stem: STEMS[si], branch: BRANCHES[bi], si, bi, element: STEM_ELEM[si] };
}

// ── 时柱 ──────────────────────────────────────────────
// 子时=23:00-01:00(支0)，丑时=01:00-03:00(支1)，...
function getHourBranchIdx(hour) {
  if (hour === 23) return 0;
  return Math.floor((hour + 1) / 2) % 12;
}

function getHourPillar(dayStemIdx, hour) {
  const bi = getHourBranchIdx(hour);
  // 五鼠遁日起时法：甲/己→子时干=甲(0)；乙/庚→丙(2)；丙/辛→戊(4)；丁/壬→庚(6)；戊/癸→壬(8)
  const bases = [0, 2, 4, 6, 8];
  const si = (bases[dayStemIdx % 5] + bi) % 10;
  return { stem: STEMS[si], branch: BRANCHES[bi], si, bi, element: STEM_ELEM[si] };
}

// ── 十神 ──────────────────────────────────────────────
const TEN_GOD_NAME = [
  ['比肩', '劫财'],   // 同元素：同阴阳/异阴阳
  ['食神', '伤官'],   // 日主生：同/异
  ['偏财', '正财'],   // 日主克：同/异
  ['七杀', '正官'],   // 克日主：同/异
  ['偏印', '正印'],   // 生日主：同/异
];

const TEN_GOD_MEANING = {
  比肩: { energy: '自主独立', suited: '独立决策、坚持立场、单独推进', avoid: '过度依赖他人' },
  劫财: { energy: '竞争争取', suited: '竞争博弈、谈判争取、开拓资源', avoid: '冲动消费、合伙纠纷' },
  食神: { energy: '创意表达', suited: '创作输出、规划布局、享受当下', avoid: '强行推进、硬碰硬' },
  伤官: { energy: '突破革新', suited: '创新突破、技艺展示、打破常规', avoid: '与权威正面冲突' },
  偏财: { energy: '意外机遇', suited: '社交扩展、把握偶发机会、灵活变通', avoid: '守旧不动' },
  正财: { energy: '稳健积累', suited: '执行计划、细节落地、稳健投入', avoid: '激进冒险' },
  七杀: { energy: '压力驱动', suited: '克服挑战、强力执行、面对困难', avoid: '逃避退缩、无谓争斗' },
  正官: { energy: '规范责任', suited: '规范行事、正式场合、承担责任', avoid: '打破规则、逾越边界' },
  偏印: { energy: '内省学习', suited: '学习研究、独立思考、冥想沉淀', avoid: '社交扩张、分散注意力' },
  正印: { energy: '贵人庇护', suited: '求助贵人、接受指导、签约合作', avoid: '单打独斗、排斥帮助' },
};

function getTenGod(dmStemIdx, otherStemIdx) {
  const dmE  = E[STEM_ELEM[dmStemIdx]];
  const otE  = E[STEM_ELEM[otherStemIdx]];
  const sameYY = (dmStemIdx % 2) === (otherStemIdx % 2);
  let rel;
  if      (dmE === otE)           rel = 0; // 同元素
  else if (PROD[dmE] === otE)     rel = 1; // 日主生
  else if (CTRL[dmE] === otE)     rel = 2; // 日主克
  else if (CTRL[otE] === dmE)     rel = 3; // 克日主
  else if (PROD[otE] === dmE)     rel = 4; // 生日主
  return TEN_GOD_NAME[rel][sameYY ? 0 : 1];
}

// ── 地支关系 ──────────────────────────────────────────
// [b1, b2] 成对，b1 <= b2
const CLASH_PAIRS  = [[0,6],[1,7],[2,8],[3,9],[4,10],[5,11]]; // 六冲
const COMBO_PAIRS  = [[0,1],[2,11],[3,10],[4,9],[5,8],[6,7]]; // 六合
const HARM_PAIRS   = [[0,7],[1,6],[2,5],[3,4],[8,11],[9,10]]; // 六害
// 三刑
const XING_MAP = {
  2: [5, 8], 5: [2, 8], 8: [2, 5], // 寅巳申 无恩之刑
  1: [10, 7], 10: [1, 7], 7: [1, 10], // 丑戌未 恃势之刑
  0: [3], 3: [0],                      // 子卯相刑
};
const SELF_XING = new Set([4, 6, 9, 11]); // 辰午酉亥 自刑

function getBranchRelations(b1, b2) {
  const results = [];
  const lo = Math.min(b1, b2), hi = Math.max(b1, b2);
  if (CLASH_PAIRS.some(p => p[0]===lo && p[1]===hi))  results.push('冲');
  if (COMBO_PAIRS.some(p => p[0]===lo && p[1]===hi))  results.push('合');
  if (HARM_PAIRS.some(p => p[0]===lo && p[1]===hi))   results.push('害');
  if (XING_MAP[b1] && XING_MAP[b1].includes(b2))       results.push('刑');
  if (b1 === b2 && SELF_XING.has(b1))                  results.push('自刑');
  return results.length ? results : ['无'];
}

// ── 吉凶时辰 ──────────────────────────────────────────
// 对日主有利的时辰：同五行或生日主五行的地支当令
function getAuspiciousHours(dmStemIdx) {
  const dmE = E[STEM_ELEM[dmStemIdx]];
  const good = [], bad = [];
  BRANCHES.forEach((br, bi) => {
    const bE = E[BRANCH_ELEM[bi]];
    const start = bi === 0 ? 23 : (bi * 2 - 1 + 24) % 24;
    const end   = (start + 2) % 24;
    const time  = `${String(start).padStart(2,'0')}:00-${String(end).padStart(2,'0')}:00`;
    if (bE === dmE || PROD[bE] === dmE) {
      good.push({ branch: br, time, reason: bE === dmE ? '同类比助' : '印生日主' });
    } else if (CTRL[bE] === dmE) {
      bad.push({ branch: br, time, reason: '官杀克身' });
    }
  });
  return { auspicious: good, inauspicious: bad };
}

// ── 今日日主关系总结 ──────────────────────────────────
function getDayMasterRelation(dmStemIdx, todayDayStemIdx) {
  const dmE  = E[STEM_ELEM[dmStemIdx]];
  const tdE  = E[STEM_ELEM[todayDayStemIdx]];
  if (tdE === dmE)          return { label: '比助', desc: '同类旺身，意志坚定，适合主动推进' };
  if (PROD[tdE] === dmE)    return { label: '印助', desc: '得印生身，贵人运佳，适合求助合作' };
  if (CTRL[tdE] === dmE)    return { label: '官杀', desc: '受克压力，需谨慎行事，避免冲突' };
  if (PROD[dmE] === tdE)    return { label: '食伤', desc: '日主泄气，创意充沛，适合输出表达' };
  if (CTRL[dmE] === tdE)    return { label: '财星', desc: '日主克财，主动掌控，利执行落地' };
  return { label: '中性', desc: '五行平和，运势平稳' };
}

// ── 主程序 ────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const birthDate = args['birth-date'];
const birthTime = args['birth-time'] || null;
const today     = args['today'] || new Date().toISOString().split('T')[0];

if (!birthDate) {
  console.error(JSON.stringify({ error: '--birth-date is required' }));
  process.exit(1);
}

// 出生四柱
const byp = getYearPillar(birthDate);
const bmp = getMonthPillar(byp.si, getMonthBranchIdx(birthDate));
const bdp = getDayPillar(birthDate);
const bhp = birthTime ? getHourPillar(bdp.si, parseInt(birthTime)) : null;

// 今日柱
const typ = getYearPillar(today);
const tmp = getMonthPillar(typ.si, getMonthBranchIdx(today));
const tdp = getDayPillar(today);

// 日主
const dm = bdp.si;

// 十神
const tenGods = {
  birth_year:  getTenGod(dm, byp.si),
  birth_month: getTenGod(dm, bmp.si),
  birth_hour:  bhp ? getTenGod(dm, bhp.si) : null,
  today_year:  getTenGod(dm, typ.si),
  today_month: getTenGod(dm, tmp.si),
  today_day:   getTenGod(dm, tdp.si),
};

// 今日日支与命盘各支的关系
const branchRelations = {
  vs_birth_year:  getBranchRelations(byp.bi, tdp.bi),
  vs_birth_month: getBranchRelations(bmp.bi, tdp.bi),
  vs_birth_day:   getBranchRelations(bdp.bi, tdp.bi),
  vs_birth_hour:  bhp ? getBranchRelations(bhp.bi, tdp.bi) : null,
};

const dmRelation    = getDayMasterRelation(dm, tdp.si);
const todayTenGod   = tenGods.today_day;
const hourInfo      = getAuspiciousHours(dm);

console.log(JSON.stringify({
  date: { birth: birthDate, today },
  birth_pillars: {
    year:  { ganzhi: byp.stem + byp.branch,  stem: byp.stem,  branch: byp.branch,  element: byp.element },
    month: { ganzhi: bmp.stem + bmp.branch,  stem: bmp.stem,  branch: bmp.branch,  element: bmp.element },
    day:   { ganzhi: bdp.stem + bdp.branch,  stem: bdp.stem,  branch: bdp.branch,  element: bdp.element },
    hour:  bhp ? { ganzhi: bhp.stem + bhp.branch, stem: bhp.stem, branch: bhp.branch, element: bhp.element } : null,
  },
  today_pillars: {
    year:  { ganzhi: typ.stem + typ.branch,  element: typ.element },
    month: { ganzhi: tmp.stem + tmp.branch,  element: tmp.element },
    day:   { ganzhi: tdp.stem + tdp.branch,  element: tdp.element },
  },
  day_master: {
    ganzhi:   bdp.stem,
    element:  bdp.element,
    yin_yang: dm % 2 === 0 ? '阳' : '阴',
  },
  ten_gods: tenGods,
  today_analysis: {
    day_master_relation: dmRelation,
    today_ten_god:       todayTenGod,
    ten_god_meaning:     TEN_GOD_MEANING[todayTenGod] || null,
    branch_relations:    branchRelations,
  },
  hours: hourInfo,
}, null, 2));
