// Chinese wording for disaster alerts and earthquake locations. These texts follow fixed templates
// (GDACS, NASA EONET, USGS), so they are rewritten from their parts instead of machine-translated:
// numbers, names and alert levels stay exact. Anything that doesn't match a template returns null
// and is left to machine translation (or shown in the original).

const KIND_RANK = { country: 0, admin1: 1, region: 2, sea: 2, city: 3 };

// Ocean features and island groups that show up in USGS/GDACS locations but not in the gazetteer.
const FEATURES = {
  'mid-atlantic ridge': '大西洋中脊', 'east pacific rise': '东太平洋海隆', 'pacific-antarctic ridge': '太平洋—南极海岭',
  'southwest indian ridge': '西南印度洋海岭', 'southeast indian ridge': '东南印度洋海岭', 'central indian ridge': '中印度洋海岭', 'mid-indian ridge': '中印度洋海岭',
  'carlsberg ridge': '卡尔斯伯格海岭', 'reykjanes ridge': '雷克雅内斯海岭', 'chile rise': '智利海隆',
  'kermadec islands': '克马德克群岛', 'fiji islands': '斐济群岛', 'south sandwich islands': '南桑威奇群岛',
  'kuril islands': '千岛群岛', 'andreanof islands': '安德烈亚诺夫群岛', 'fox islands': '福克斯群岛', 'rat islands': '拉特群岛',
  'aleutian islands': '阿留申群岛', 'loyalty islands': '洛亚尔提群岛', 'mariana islands': '马里亚纳群岛',
  'izu islands': '伊豆群岛', 'bonin islands': '小笠原群岛', 'ryukyu islands': '琉球群岛', 'solomon islands': '所罗门群岛',
  'santa cruz islands': '圣克鲁斯群岛', 'easter island': '复活节岛', 'macquarie island': '麦夸里岛', 'tonga islands': '汤加群岛',
  'banda sea': '班达海', 'molucca sea': '马鲁古海', 'celebes sea': '苏拉威西海', 'philippine sea': '菲律宾海', 'gulf of california': '加利福尼亚湾',
  'north atlantic ocean': '北大西洋', 'south atlantic ocean': '南大西洋', 'north pacific ocean': '北太平洋', 'south pacific ocean': '南太平洋',
  'indian ocean': '印度洋', 'atlantic ocean': '大西洋', 'pacific ocean': '太平洋', 'southern india': '印度南部',
};
const SIDE = { northern: '北部', southern: '南部', eastern: '东部', western: '西部', central: '中部' };
const OF = { north: '以北', south: '以南', east: '以东', west: '以西', northeast: '东北方', northwest: '西北方', southeast: '东南方', southwest: '西南方' };
const DIR = {
  N: '以北', S: '以南', E: '以东', W: '以西', NE: '东北', NW: '西北', SE: '东南', SW: '西南',
  NNE: '东北偏北', ENE: '东北偏东', ESE: '东南偏东', SSE: '东南偏南', SSW: '西南偏南', WSW: '西南偏西', WNW: '西北偏西', NNW: '西北偏北',
};
const BASIN = {
  Atlantic: '大西洋', NWPacific: '西北太平洋', EastPacific: '东太平洋', CentralPacific: '中太平洋', NIndian: '北印度洋',
  SIndian: '南印度洋', SWIndian: '西南印度洋', SPacific: '南太平洋', SouthPacific: '南太平洋', Australia: '澳大利亚附近海域',
};
const STORM_CLASS = [
  [/^Tropical Depression/i, '热带低压'], [/^Tropical Storm/i, '热带风暴'], [/^(Super )?Typhoon/i, '台风'], [/^Hurricane\/Typhoon/i, '飓风/台风'],
  [/^Hurricane/i, '飓风'], [/^(Tropical |Severe Tropical )?Cyclone/i, '气旋'], [/^Post-Tropical/i, '温带气旋'],
];
const HAZARD = { storm: '热带气旋', flood: '洪水', fire: '森林火灾', drought: '干旱', volcano: '火山', quake: '地震', tsunami: '海啸' };
const IMPACT = { Minor: '轻度', Medium: '中度', Major: '严重', Green: '轻度', Orange: '中度', Red: '严重' };

export function createZh(gaz) {
  const byName = new Map();
  for (const [name, idx] of Object.entries(gaz.en)) {
    const best = idx.map((i) => gaz.places[i]).filter((p) => p.zh && KIND_RANK[p.k] != null).sort((a, b) => KIND_RANK[a.k] - KIND_RANK[b.k]);
    if (best.length) byName.set(name.toLowerCase(), best);
  }
  const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** Chinese name of a place; `prefer` picks cities first (towns near quakes) or countries first. */
  function name(en, prefer = 'country') {
    if (!en) return null;
    const key = en.trim().replace(/^the /i, '').replace(/ & /g, ' and ').toLowerCase();
    if (FEATURES[key]) return FEATURES[key];
    const cands = byName.get(key) || byName.get(strip(key));
    if (!cands) return null;
    const pick = prefer === 'city' ? cands.find((p) => p.k === 'city') || cands[0] : cands[0];
    return pick.zh;
  }
  const nameOr = (en, prefer) => name(en, prefer) || en.trim();

  /** "Brazil, Australia" -> "巴西、澳大利亚"; long lists are shortened. */
  function countries(list, max = 5) {
    if (!list) return null;
    const parts = list.split(/,\s*/).map((s) => s.trim()).filter((s) => s && !/^\[?unknown\]?$/i.test(s));
    if (!parts.length) return null;
    const zh = parts.map((p) => nameOr(p));
    return zh.length > max ? `${zh.slice(0, max).join('、')} 等 ${zh.length} 国` : zh.join('、');
  }

  /** USGS "52 km SSW of Kokopo, Papua New Guinea" and Flinn–Engdahl region names. */
  function quakePlace(place) {
    if (!place) return null;
    let m = /^(\d+(?:\.\d+)?) km ([NSEW]{1,3}) of (.+?), (.+)$/.exec(place);
    if (m && DIR[m[2]]) {
      const [, km, dir, town, region] = m;
      const where = name(region);
      if (!where) return null;
      return `${where} ${nameOr(town, 'city')} ${DIR[dir]} ${km} 公里`;
    }
    return region(place);
  }

  function region(text) {
    const t = text.trim();
    const direct = name(t);
    if (direct) return direct;
    let m = /^(northern|southern|eastern|western|central) (.+)$/i.exec(t);
    if (m) {
      const base = region(m[2]);
      return base && `${base}${SIDE[m[1].toLowerCase()]}`;
    }
    m = /^(north|south|east|west|northeast|northwest|southeast|southwest) of (?:the )?(.+)$/i.exec(t);
    if (m) {
      const base = region(m[2]);
      return base && `${base}${OF[m[1].toLowerCase()]}`;
    }
    m = /^(?:off|near) the (?:east |west |north |south )?coast of (.+)$/i.exec(t);
    if (m) {
      const base = region(m[1]);
      return base && `${base}近海`;
    }
    m = /^(.+?) region$/i.exec(t);
    if (m) {
      const base = region(m[1]);
      return base && `${base}地区`;
    }
    m = /^(.+?), (.+)$/.exec(t); // "Mindanao, Philippines"
    if (m) {
      const a = name(m[1], 'city');
      const b = name(m[2]);
      return b ? `${b}${a || ` ${m[1]}`}` : null;
    }
    return null;
  }

  const millions = (x) => {
    const n = Number(x);
    if (!Number.isFinite(n)) return x;
    return n >= 1 ? `${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 百万` : `${(n * 100).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 万`;
  };
  const date = (dmy) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy || '');
    return m ? `${m[3]}年${Number(m[2])}月${Number(m[1])}日` : dmy;
  };
  const stormClass = (s) => STORM_CLASS.find(([re]) => re.test(s))?.[1] || null;

  function severity(h) {
    const s = h.severity;
    if (!s) return null;
    let m = /^(.+?) \(maximum wind speed of (\d+) km\/h\)$/.exec(s);
    if (m && stormClass(m[1])) return `${stormClass(m[1])}（最大风速 ${m[2]} km/h）`;
    m = /^\w+ impact for forestfire in ([\d.,]+) ha$/i.exec(s);
    if (m) return `过火面积 ${m[1]} 公顷`;
    m = /^(Minor|Medium|Major) impact for agricultural drought/i.exec(s);
    if (m) return `农业干旱 · ${IMPACT[m[1]]}影响`;
    m = /^Magnitude ([\d.]+)$/i.exec(s);
    if (m) return `等级 ${m[1]}`;
    m = /^([\d.]+) kts$/.exec(s);
    if (m) return `风速 ${m[1]} 节（约 ${Math.round(Number(m[1]) * 1.852)} km/h）`;
    m = /^([\d.]+) acres$/.exec(s);
    if (m) return `${m[1]} 英亩（约 ${Math.round(Number(m[1]) * 0.4047)} 公顷）`;
    return null;
  }

  function population(h) {
    const p = h.population;
    if (!p) return null;
    let m = /^Population affected by Category (\d) \((\d+) km\/h\) wind speeds or higher is ([\d.]+)( million)?/i.exec(p);
    if (m) return `${m[4] ? `${millions(m[3])}人` : `${Number(m[3]).toLocaleString('zh-CN')} 人`}受 ${m[1]} 级（${m[2]} km/h）以上风力影响`;
    m = /^([\d,]+) people affected/i.exec(p);
    if (m) return `受影响 ${m[1]} 人`;
    m = /^(\d+) deaths?(?: and (\d+) displaced)?/i.exec(p);
    if (m) return `${m[1]} 人死亡${m[2] ? `，${m[2]} 人流离失所` : ''}`;
    m = /^(\d+) displaced/i.exec(p);
    if (m) return `${m[1]} 人流离失所`;
    if (/^[\d.]+$/.test(p)) return Number(p) > 0 ? `约 ${Number(p).toLocaleString('zh-CN')} 人` : ''; // '' = nothing worth showing
    return null;
  }

  function summary(h) {
    const s = h.summary || '';
    let m = /^From (\S+) to (\S+), an? (.+?) \(maximum wind speed of (\d+) km\/h\) (\S+) was active in (\w+)\.(?: The cyclone affects these countries: (.+?) \(vulnerability)?/.exec(s);
    if (m) {
      const [, from, to, cls, wind, nm, basin, list] = m;
      return `${date(from)}至${date(to)}，${stormClass(cls) || '热带气旋'} ${nm}（最大风速 ${wind} km/h）在${BASIN[basin] || basin}活动${list ? `，影响：${countries(list)}` : ''}。`;
    }
    m = /^On (\S+), a forest fire started in (.+?), until (\S+?)\.?$/.exec(s);
    if (m) return `${date(m[1])}起，${nameOr(m[2])}发生森林火灾，持续至${date(m[3])}。`;
    m = /^On (\S+), a flood started in (.+?), lasting until (\S+) \(last update\)\.(?: The flood caused (.+?) ?\.)?$/.exec(s);
    if (m) {
      const loss = m[4] && population({ population: m[4] });
      return `${date(m[1])}起，${nameOr(m[2])}发生洪水，持续至${date(m[3])}（最近更新）${loss ? `，已造成 ${loss}` : ''}。`;
    }
    m = /^The Drought notification level is (\w+)\.?$/.exec(s);
    if (m) return `干旱预警级别：${{ Green: '绿色', Orange: '橙色', Red: '红色' }[m[1]] || m[1]}。`;
    return null;
  }

  function title(h) {
    const t = h.title || '';
    if (h.source === 'gdacs') {
      // the alert level is shown next to the title as a coloured badge, so it isn't repeated here
      const parts = [HAZARD[h.type]].filter(Boolean);
      const nm = /tropical cyclone ([A-Z0-9-]+)/i.exec(t)?.[1];
      if (nm) parts.push(nm);
      const where = countries(h.country, 3);
      return `${parts.join(' · ')}${where ? `：${where}` : ''}`;
    }
    // NASA EONET: "Hurricane Simon", "Wildfire CYRUS, Kern, California", "Ibu Volcano, Indonesia"
    let m = /^(Super Typhoon|Typhoon|Hurricane|Tropical Storm|Tropical Depression|Tropical Cyclone|Severe Tropical Cyclone|Cyclone|Post-Tropical Cyclone) (.+)$/i.exec(t);
    if (m) return `${stormClass(m[1]) || '热带气旋'} ${m[2]}`;
    m = /^(Wildfire|Prescribed Fire|Fire) (.+?), (.+?), (.+)$/i.exec(t);
    if (m) return `${/prescribed/i.test(m[1]) ? '计划烧除' : '山火'} ${m[2]}（${nameOr(m[4])} ${m[3]}）`;
    m = /^(Wildfire|Prescribed Fire|Fire) (.+?), (.+)$/i.exec(t);
    if (m) return `${/prescribed/i.test(m[1]) ? '计划烧除' : '山火'} ${m[2]}（${nameOr(m[3])}）`;
    m = /^(.+?) Volcano(?:, (.+))?$/i.exec(t);
    if (m) return `${m[1]} 火山${m[2] ? `（${nameOr(m[2])}）` : ''}`;
    return null;
  }

  /** Chinese fields for one hazard; null fields fall back to machine translation or the original. */
  function hazard(h) {
    return { title: title(h), summary: summary(h), severity: severity(h), population: population(h), country: countries(h.country, 8) };
  }

  return { name, countries, quakePlace, hazard };
}
