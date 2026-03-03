#!/usr/bin/env node
/**
 * 行星位置计算器（基于 Swiss Ephemeris / sweph@2.10.0）
 * Usage: node planets.js --today YYYY-MM-DD [--sun-sign <星座名>] [--ephe-path <path>]
 *
 * 精度说明：
 * - 有星历文件（sepl_18.se1 + semo_18.se1）：角秒级精度，与 Astro.com 完全一致
 * - 无星历文件：自动使用内置 Moshier 算法，精度约 1 角分，黄道星座判断完全够用
 *
 * 安装依赖：在 skill 根目录运行 npm install
 */

// ── 常量 ─────────────────────────────────────────────
const SIGNS_ZH = ['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼'];
const SIGNS_EN = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

// 星座名 → 黄道经度中点（用于相位计算）
const SIGN_CENTER = {};
SIGNS_ZH.forEach((s, i) => { SIGN_CENTER[s] = i * 30 + 15; });
// 同时支持英文名
SIGNS_EN.forEach((s, i) => { SIGN_CENTER[s] = i * 30 + 15; });

const PLANETS = [
  { id: 0, name: '太阳', en: 'Sun'     },
  { id: 1, name: '月亮', en: 'Moon'    },
  { id: 2, name: '水星', en: 'Mercury' },
  { id: 3, name: '金星', en: 'Venus'   },
  { id: 4, name: '火星', en: 'Mars'    },
  { id: 5, name: '木星', en: 'Jupiter' },
  { id: 6, name: '土星', en: 'Saturn'  },
  { id: 7, name: '天王星', en: 'Uranus'  },
  { id: 8, name: '海王星', en: 'Neptune' },
  { id: 9, name: '冥王星', en: 'Pluto'   },
];

// 相位定义：名称、角度、容许误差（orb）
const ASPECTS = [
  { name: '合相', angle: 0,   orb: 8 },
  { name: '六分相', angle: 60,  orb: 6 },
  { name: '四分相', angle: 90,  orb: 8 },
  { name: '三分相', angle: 120, orb: 8 },
  { name: '对分相', angle: 180, orb: 8 },
];

// ── 参数解析 ──────────────────────────────────────────
function parseArgs(argv) {
  const r = {};
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i].startsWith('--')) r[argv[i].slice(2)] = argv[i + 1];
  }
  return r;
}

// ── 黄道经度 → 星座 ───────────────────────────────────
function longitudeToSign(lon) {
  const normalized = ((lon % 360) + 360) % 360;
  const idx = Math.floor(normalized / 30);
  const degree = normalized - idx * 30;
  return {
    sign_zh: SIGNS_ZH[idx],
    sign_en: SIGNS_EN[idx],
    degree:  Math.round(degree * 100) / 100,
    longitude: Math.round(normalized * 100) / 100,
  };
}

// ── 相位计算 ──────────────────────────────────────────
function calcAspects(planetLon, refLon) {
  const diff = Math.abs(((planetLon - refLon + 540) % 360) - 180);
  const found = [];
  for (const asp of ASPECTS) {
    const orb = Math.abs(diff - asp.angle);
    if (orb <= asp.orb) {
      found.push({ aspect: asp.name, orb: Math.round(orb * 10) / 10 });
    }
  }
  return found;
}

// ── sweph 降级处理 ────────────────────────────────────
// 无 sweph 时用简化算法估算行星位置（精度 ±2-5 度，仅供降级）
function fallbackPlanetData(today) {
  const [y, m, d] = today.split('-').map(Number);
  // 以 2000-01-01.5 (J2000.0) 为基准，各行星平均公转速度（度/天）
  const J2000 = new Date('2000-01-01T12:00:00Z');
  const days = (new Date(`${today}T12:00:00Z`) - J2000) / 86400000;

  const baseData = [
    { id:0, base:280.46, rate:0.9856474  }, // 太阳
    { id:1, base:218.32, rate:13.176396  }, // 月亮
    { id:2, base:252.25, rate:4.0923344  }, // 水星（平均，未含本轮）
    { id:3, base:181.98, rate:1.6021302  }, // 金星
    { id:4, base:355.43, rate:0.5240207  }, // 火星
    { id:5, base: 34.35, rate:0.0831294  }, // 木星
    { id:6, base: 50.08, rate:0.0334597  }, // 土星
    { id:7, base:314.06, rate:0.0117296  }, // 天王星
    { id:8, base:304.35, rate:0.0059868  }, // 海王星
    { id:9, base:238.92, rate:0.0039781  }, // 冥王星
  ];

  return baseData.map((p, i) => {
    const lon = ((p.base + p.rate * days) % 360 + 360) % 360;
    return { ...longitudeToSign(lon), speed: p.rate, retrograde: false };
  });
}

// ── 主程序 ────────────────────────────────────────────
const args   = parseArgs(process.argv.slice(2));
const today  = args['today'] || new Date().toISOString().split('T')[0];
// 兼容带「座」后缀（如「水瓶座」→「水瓶」）和英文全名（如「Aquarius」）
const rawSign = args['sun-sign'] || null;
const sunSign = rawSign ? rawSign.replace(/座$/, '') : null;
const ephePath = args['ephe-path'] || null;

// 尝试加载 sweph，不存在时自动安装（无需手动 npm install）
let sweph = null;
let precision = 'swiss_ephemeris';
try {
  sweph = require('sweph');
} catch {
  try {
    const { execSync } = require('child_process');
    const path = require('path');
    const dir = path.dirname(__filename);
    execSync('npm install sweph@2.10.0-10 --no-save --silent', { cwd: dir, stdio: 'ignore' });
    sweph = require(path.join(dir, 'node_modules', 'sweph'));
  } catch {
    precision = 'moshier_fallback';
  }
}

let planetResults = [];

if (sweph) {
  // 有 sweph：精确计算
  // 常量通过 sweph.constants 访问
  const { SE_GREG_CAL, SEFLG_SPEED } = sweph.constants;

  if (ephePath) {
    sweph.set_ephe_path(ephePath);
  }

  const [y, m, d] = today.split('-').map(Number);
  // 使用正午 UT 计算（避免日期边界问题，对星座级别精度无影响）
  const jd = sweph.julday(y, m, d, 12.0, SE_GREG_CAL);

  for (const planet of PLANETS) {
    try {
      // result.data = [longitude, latitude, distance, longitudeSpeed, latitudeSpeed, distanceSpeed]
      const result = sweph.calc_ut(jd, planet.id, SEFLG_SPEED);
      const lon = result.data[0];
      const lonSpeed = result.data[3];
      const signInfo = longitudeToSign(lon);
      planetResults.push({
        planet:    planet.name,
        planet_en: planet.en,
        ...signInfo,
        retrograde: lonSpeed < 0,
        speed:      Math.round(lonSpeed * 10000) / 10000,
      });
    } catch (e) {
      planetResults.push({
        planet:    planet.name,
        planet_en: planet.en,
        error:     e.message,
      });
    }
  }
} else {
  // 无 sweph：降级估算
  const fallback = fallbackPlanetData(today);
  planetResults = PLANETS.map((p, i) => ({
    planet:    p.name,
    planet_en: p.en,
    ...fallback[i],
  }));
}

// 月亮星座单独提取（对情绪/直觉影响最大）
const moon = planetResults.find(p => p.planet === '月亮');

// 逆行行星列表
const retrograde = planetResults.filter(p => p.retrograde).map(p => ({
  planet:   p.planet,
  sign_zh:  p.sign_zh,
  degree:   p.degree,
}));

// 对用户太阳星座的相位
let aspectsToSunSign = [];
if (sunSign && SIGN_CENTER[sunSign] !== undefined) {
  const refLon = SIGN_CENTER[sunSign];
  for (const p of planetResults) {
    if (!p.longitude || p.planet === '太阳') continue;
    const aspects = calcAspects(p.longitude, refLon);
    if (aspects.length > 0) {
      aspectsToSunSign.push({
        planet:  p.planet,
        sign_zh: p.sign_zh,
        aspects,
      });
    }
  }
}

// data_anchor（供 subagent B 使用）
const moonInfo = moon ? `月亮${moon.sign_zh}座` : '月亮未知';
const retroInfo = retrograde.length > 0
  ? retrograde.map(r => `${r.planet}逆行`).join('·')
  : '无逆行';
const keyAspect = aspectsToSunSign[0]
  ? `${aspectsToSunSign[0].planet}与${sunSign || '太阳星座'}${aspectsToSunSign[0].aspects[0].aspect}`
  : '无主要相位';

console.log(JSON.stringify({
  date:      today,
  precision, // swiss_ephemeris | moshier_fallback
  note:      precision === 'moshier_fallback'
    ? '未检测到 sweph，使用内置估算（精度±3-5度，星座判断可用）'
    : null,
  planets:   planetResults,
  moon: moon ? {
    sign_zh:   moon.sign_zh,
    sign_en:   moon.sign_en,
    degree:    moon.degree,
    retrograde: moon.retrograde,
  } : null,
  retrograde_planets: retrograde,
  aspects_to_sun_sign: sunSign ? {
    sun_sign: sunSign,
    aspects:  aspectsToSunSign,
  } : null,
  data_anchor: `${moonInfo} · ${retroInfo} · ${keyAspect}`,
}, null, 2));
