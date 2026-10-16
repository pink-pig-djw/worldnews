import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classify, extractDeaths, reportDeaths } from '../scripts/lib/classify.mjs';
import { concepts, numbers } from '../scripts/lib/concepts.mjs';
import { assignEvents, buildEvents, hazardSeverity } from '../scripts/lib/events.mjs';
import { Geoparser } from '../scripts/lib/geo.mjs';
import { NEWS_SOURCES, orgOf, regionOf } from '../scripts/lib/sources.mjs';
import { normalizeEonet, normalizeGdacs, normalizeUsgs, parseTle } from '../scripts/lib/hazards.mjs';
import { parseFeed } from '../scripts/lib/rss.mjs';
import { cleanText, normalizeUrl, parseDate } from '../scripts/lib/util.mjs';
import { createZh } from '../scripts/lib/zh.mjs';

const geo = Geoparser.load(new URL('../scripts/data/gazetteer.json', import.meta.url));
const loc = (title, lang = 'en') => geo.parse(title, '', lang)?.loc;

test('geoparser picks the most specific place and keeps actors as related', () => {
  assert.equal(loc('Israeli strikes kill 30 in Gaza').id, 'gaza');
  assert.equal(loc('Russia launches drone attack on Kyiv').cc, 'UA');
  assert.equal(loc('Houthis claim attack on ship in Red Sea').id, 'red-sea');
  assert.equal(loc('Georgia protesters rally in Tbilisi').cc, 'GE');
  assert.equal(loc('Tripoli clashes: Lebanon army deploys').cc, 'LB');
  const r = geo.parse('Trump says he will meet Putin in Budapest', '', 'en');
  assert.equal(r.loc.cc, 'HU');
  assert.deepEqual(r.related.sort(), ['RU', 'US']);
});

test('geoparser handles Chinese, pair abbreviations and quoted typhoon names', () => {
  assert.equal(loc('以军空袭黎巴嫩南部', 'zh').id, 'south-lebanon');
  assert.equal(loc('德州洪水造成至少50人死亡', 'zh').cc, 'US');
  const pair = geo.parse('俄乌冲突持续', '', 'zh');
  assert.equal(pair.loc.cc, 'UA'); // Russia is treated as the actor, the war is located in Ukraine
  assert.ok(pair.related.includes('RU'));
  assert.notEqual(loc('台风“桦加沙”逼近广东', 'zh')?.id, 'gaza');
  assert.equal(geo.parse('可以方便地使用以军事手段解决', '', 'zh'), null);
});

test('classifier separates conflict, trade "wars" and labour strikes', () => {
  assert.equal(classify('Israeli strikes kill 30 in Gaza, health officials say').cat, 'conflict');
  assert.equal(classify('US and China agree to extend tariff truce').cat, 'economy');
  assert.equal(classify('Trade war fears hit Asian stocks').cat, 'economy');
  assert.equal(classify('Teachers strike shuts schools across Kenya').sub, 'strike');
  assert.equal(classify('Clashes erupt in Sweida, Syria').cat, 'conflict');
  assert.equal(classify('Magnitude 6.2 earthquake strikes off coast of Japan').sub, 'quake');
  assert.equal(classify('台风逼近广东 数十万人撤离', '', 'zh').cat, 'disaster');
  // regressions seen in live feeds
  assert.equal(classify('Britain to supply Ukraine with more Storm Shadow missiles').cat, 'conflict');
  assert.equal(classify('Storm Amy brings heavy rain to Ireland').sub, 'storm');
  assert.notEqual(classify('Dublin hotel accused of revoking bookings for an event to combat antisemitism').cat, 'conflict');
  assert.equal(classify('Yemen claims over 700 Houthis killed after 1,250 strikes rained within 24 hours').cat, 'conflict');
  assert.equal(classify('Floods kill 120 people in Nigeria').cat, 'disaster');
});

test('death counts raise severity', () => {
  assert.equal(extractDeaths('Plane crash kills 67 in Kazakhstan'), 67);
  assert.equal(extractDeaths('death toll rises to 1,200'), 1200);
  assert.equal(extractDeaths('洪水造成至少50人死亡', true), 50);
  assert.ok(classify('Floods kill 120 people').sev > classify('Floods hit region').sev);
});

test('RSS, Atom and GDACS parsing', () => {
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>t</title>
    <entry><title>Hello &amp; world</title><link rel="alternate" href="https://ex.org/a?utm_source=x"/><updated>2026-10-15T10:00:00Z</updated><summary>&lt;p&gt;Body&lt;/p&gt;</summary></entry></feed>`;
  const { items } = parseFeed(atom);
  assert.equal(items[0].title, 'Hello & world');
  assert.equal(items[0].summary, 'Body');
  assert.equal(normalizeUrl(items[0].link), 'https://ex.org/a');
  const now = Date.parse('2026-10-15T12:00:00Z') / 1000;
  assert.equal(parseDate('2026-10-15 20:00:00', '+08:00'), now);
  assert.equal(cleanText('<b>a</b>&nbsp; b'), 'a b');
  const gd = normalizeGdacs(readFileSync(new URL('./fixtures/gdacs.xml', import.meta.url), 'utf8'), Date.now() / 1000);
  assert.ok(gd.some((h) => h.type === 'storm' && h.alert === 'orange'));
});

test('hazard normalisation', () => {
  const now = Date.now() / 1000;
  const q = normalizeUsgs(JSON.parse(readFileSync(new URL('./fixtures/usgs.json', import.meta.url))), now);
  assert.ok(q.length >= 3 && q.every((x) => x.mag >= 4.5));
  const e = normalizeEonet(JSON.parse(readFileSync(new URL('./fixtures/eonet.json', import.meta.url))), now);
  assert.ok(e.find((h) => h.type === 'storm').track.length > 3);
  assert.equal(parseTle(readFileSync(new URL('./fixtures/tle-25544.txt', import.meta.url), 'utf8')).length, 2);
});

// ---------------------------------------------------------------- events
const SRC = new Map(NEWS_SOURCES.map((x) => [x.id, { ...x, org: orgOf(x), region: regionOf(x) }]));
const PLACES = {
  aden: { id: 'p-YE-aden', name: 'Aden', zh: '亚丁', cc: 'YE', lat: 12.8, lng: 45.03, kind: 'city' },
  yemen: { id: 'c-YE', name: 'Yemen', zh: '也门', cc: 'YE', lat: 15.6, lng: 48, kind: 'country' },
  gaza: { id: 'gaza', name: 'Gaza', zh: '加沙', cc: 'PS', lat: 31.4, lng: 34.4, kind: 'region' },
  pk: { id: 'c-PK', name: 'Pakistan', zh: '巴基斯坦', cc: 'PK', lat: 30, lng: 70, kind: 'country' },
  peshawar: { id: 'p-PK-peshawar', name: 'Peshawar', zh: '白沙瓦', cc: 'PK', lat: 34, lng: 71.5, kind: 'city' },
};
const placeById = (id) => Object.values(PLACES).find((p) => p.id === id);
const report = (id, source, lang, title, loc, time, extra = {}) => ({
  id, source, lang, title, summary: '', url: `https://example.org/${id}`, time, seen: time, loc, rel: [], cat: 'conflict', sub: 'attack', sev: 0.6, lc: 3, lw: 't', ...extra,
});
const H = 3600;
function sampleWindow(t0) {
  return [
    report('a1', 'aljazeera', 'en', 'At least 5 killed in Houthi attack on Yemen’s presidential palace in Aden', PLACES.aden, t0, { deaths: 5 }),
    report('a2', 'guardian', 'en', 'Houthi missiles strike Yemen presidential palace, killing five', PLACES.aden, t0 + H, { deaths: 5, sub: 'missile' }),
    report('a3', 'chinanews', 'zh', '也门官员：胡塞武装袭击亚丁总统府 致5死16伤', PLACES.aden, t0 + 2 * H, { deaths: 5 }),
    report('a4', 'bbc', 'en', 'Houthi missile attack on Yemeni presidential palace kills five, minister says', PLACES.yemen, t0 + 3 * H, { deaths: 5, lc: 2, lw: 'c' }),
    report('b1', 'cgtn', 'en', '17 students, one teacher killed in school roof collapse in Pakistan', PLACES.pk, t0, { cat: 'disaster', sub: 'accident', deaths: 18, lc: 2, lw: 'c' }),
    report('b2', 'dawn', 'en', 'Teacher, 30 students killed in Peshawar school roof collapse', PLACES.peshawar, t0 + 2 * H, { cat: 'disaster', sub: 'accident', deaths: 31 }),
    report('b3', 'pts', 'zh', '巴基斯坦学校屋顶突坍塌 已知28死、30多人伤', PLACES.pk, t0 + 3 * H, { cat: 'disaster', sub: 'accident', deaths: 28, lc: 2, lw: 'c' }),
    report('c1', 'bbc', 'en', 'Aid trucks enter northern Gaza', PLACES.gaza, t0 + H, { cat: 'society', sub: 'humanitarian', sev: 0.4 }),
    report('d1', 'tass', 'en', 'Trump says Ukraine needs to hold elections', null, t0 + H, { cat: 'politics', sub: 'election', sev: 0.3, lc: 0, lw: '' }),
    report('d2', 'aljazeera', 'en', 'Ahead of US midterms, voters are frustrated with Trump, want change: Poll', null, t0 + 2 * H, { cat: 'politics', sub: 'election', sev: 0.3, lc: 0, lw: '' }),
  ];
}

test('concepts and numbers line up across languages', () => {
  assert.deepEqual([...numbers('也门官员：胡塞武装袭击亚丁总统府 致5死16伤', 'zh')].sort(), ['16', '5']);
  assert.ok(numbers('Houthi attack on palace kills five', 'en').has('5'));
  assert.ok(numbers('巴基斯坦校园屋顶坍塌 学生及教师共三十五人死亡', 'zh').has('35'));
  assert.equal(numbers('五角大楼与三星在四川', 'zh').size, 0); // Pentagon, Samsung, Sichuan are not numbers
  assert.equal(numbers('10月15日至2026年', 'zh').size, 0); // dates and years are left out
  assert.ok(concepts('胡塞武装袭击亚丁总统府', 'zh').has('houthi'));
  assert.ok(concepts('Houthi missiles strike presidential palace', 'en').has('palace'));
  assert.ok(concepts('WHO urges vigilance after Kenya confirms Ebola case', 'en').has('who'));
  assert.ok(!concepts('Who will win the vote?', 'en').has('who'));
});

test('events: one per real-world event, across outlets and languages', () => {
  const stories = sampleWindow(1_000_000);
  assignEvents(stories, { geo });
  const ev = Object.fromEntries(stories.map((s) => [s.id, s.ev]));
  assert.equal(ev.a2, ev.a1);
  assert.equal(ev.a3, ev.a1, 'the Chinese report of the Aden attack joins the English ones');
  assert.equal(ev.a4, ev.a1);
  assert.equal(ev.b2, ev.b1);
  assert.equal(ev.b3, ev.b1);
  assert.notEqual(ev.b1, ev.a1);
  assert.notEqual(ev.c1, ev.a1);
  assert.notEqual(ev.d1, ev.d2, '"Trump" + "election" alone is not the same event');
});

test('events persist across runs and score severity apart from attention', () => {
  const t0 = 1_000_000;
  const now1 = t0 + 2.5 * H;
  const first = sampleWindow(t0).filter((s) => s.time <= now1);
  const ctx = { geo, src: (id) => SRC.get(id), placeById, quakes: [], hazards: [] };
  const r1 = buildEvents({ stories: first, state: null, now: now1, ...ctx });
  const idOf = new Map(first.map((s) => [s.id, s.ev]));
  // next run: the same stories (keeping their events) plus the later ones
  const now2 = t0 + 4 * H;
  const second = sampleWindow(t0).map((s) => ({ ...s, ev: idOf.get(s.id) }));
  const r2 = buildEvents({ stories: second, state: JSON.parse(JSON.stringify(r1.state)), now: now2, ...ctx });
  for (const s of second) if (idOf.has(s.id)) assert.equal(s.ev, idOf.get(s.id), 'reports keep their event');
  const aden = r2.events.find((e) => e.id === idOf.get('a1'));
  assert.equal(aden.n, 4, 'each report counted once');
  assert.equal(aden.o, 4);
  assert.equal(aden.loc, 'p-YE-aden', 'the city most reports name, not the country');
  assert.equal(aden.lc, 3);
  assert.equal(aden.d, 5);
  assert.ok(aden.sev >= 0.6 && aden.sev < 0.8);
  const roof = r2.events.find((e) => e.id === idOf.get('b1'));
  assert.equal(roof.loc, 'p-PK-peshawar');
  assert.equal(roof.d, 31);
  assert.ok(roof.tl?.some((n) => n.k === 'toll' && n.d === 31), 'the rising toll is on the timeline');
  // severity does not grow with coverage; attention does
  const gaza = r2.events.find((e) => e.id === second.find((s) => s.id === 'c1').ev);
  assert.ok(aden.att > gaza.att);
  assert.ok(gaza.v === 1 && aden.v === 4);
  // a fresh state (lost cache) gives the same events their same ids
  const again = sampleWindow(t0);
  buildEvents({ stories: again, state: null, now: now2, ...ctx });
  assert.equal(again.find((s) => s.id === 'a3').ev, idOf.get('a1'));
});

test('events leave the window into a 15-day archive, then expire', () => {
  const t0 = 1_000_000;
  const ctx = { geo, src: (id) => SRC.get(id), placeById, quakes: [], hazards: [] };
  const r1 = buildEvents({ stories: sampleWindow(t0), state: null, now: t0 + 4 * H, ...ctx });
  const r2 = buildEvents({ stories: [], state: r1.state, now: t0 + 60 * H, ...ctx });
  assert.equal(r2.events.length, 0);
  assert.ok(r2.archive.some((e) => e.v >= 3), 'multi-source events are archived');
  assert.ok(!r2.archive.some((e) => e.v === 1 && e.n === 1 && e.sev < 0.6), 'minor single reports are not');
  assert.ok(r2.archive.every((e) => e.ti?.en || e.ti?.zh), 'archived events keep a headline');
  const r3 = buildEvents({ stories: [], state: r2.state, now: t0 + 16 * 24 * H, ...ctx });
  assert.equal(r3.archive.length, 0);
});

test('official alerts set severity and link to news events', () => {
  assert.ok(hazardSeverity({ mag: 7.2, alert: 'yellow' }) >= 0.82);
  assert.ok(hazardSeverity({ alert: 'red' }) > hazardSeverity({ alert: 'orange' }));
  const t0 = 1_000_000;
  const quake = { id: 'us7', mag: 6.9, place: '76 km NE of Ozernovskiy, Russia', time: t0, lat: 51.98, lng: 157.27, alert: 'green', url: 'https://x' };
  const kam = { id: 'a-RU-kamchatka', name: 'Kamchatka', zh: '堪察加', cc: 'RU', lat: 56, lng: 159, kind: 'admin1' };
  const stories = [report('q1', 'chinanews', 'zh', '俄罗斯堪察加半岛发生6.9级地震', kam, t0 + 600, { cat: 'disaster', sub: 'quake', sev: 0.55 })];
  const r = buildEvents({ stories, state: null, now: t0 + H, geo, src: (id) => SRC.get(id), placeById: (id) => (id === kam.id ? kam : null), quakes: [quake], hazards: [] });
  assert.equal(r.events[0].hz, 'us7');
  assert.ok(r.events[0].sev >= 0.72);
  assert.equal(quake.ev, r.events[0].id);
});

test('death tolls: titles first, no years, no background figures', () => {
  assert.equal(reportDeaths('From Allies to Enemies: Ethiopia and Eritrea Edge Toward War', 'The conflict left hundreds of thousands of people dead.', false), 0);
  assert.equal(reportDeaths('Family welcomes review into death of woman left in hospital corridor', 'left unattended in October 2025 before she died', false), 0);
  assert.equal(reportDeaths('Floods kill dozens in Nigeria', 'At least 45 people were killed.', false), 45);
  assert.equal(classify('Four killed fighting wildfires in Indonesian national park').cat, 'disaster');
  assert.notEqual(classify('Man killed by tiger at zoo had bouts of psychosis, inquest hears').cat, 'conflict');
  assert.notEqual(classify('美核动力航母停靠横须贺基地', '', 'zh').sev, 0.65);
});

test('location confidence', () => {
  const g = (title, summary = '', o = {}) => geo.parse(title, summary, 'en', o);
  assert.equal(g('Teacher, 30 students killed in Peshawar school roof collapse').conf, 3);
  assert.equal(g('Pakistan school roof collapse kills 28').conf, 2);
  assert.equal(g('School roof collapse kills 28', 'It happened in Peshawar, Pakistan.').why, 's');
  assert.equal(g('Government announces new budget', '', { homeCc: 'JP', homeFallback: true }).conf, 1);
  assert.equal(g('Kremlin says sanctions will not change course').why, 'g');
});

test('Chinese wording for alerts and quake locations', () => {
  const zh = createZh(JSON.parse(readFileSync(new URL('../scripts/data/gazetteer.json', import.meta.url), 'utf8')));
  assert.equal(zh.quakePlace('121 km SSW of Kokopo, Papua New Guinea'), '巴布亚新几内亚 Kokopo 西南偏南 121 公里');
  assert.equal(zh.quakePlace('22 km W of Tamarindo, Costa Rica'), '哥斯达黎加 Tamarindo 以西 22 公里');
  assert.equal(zh.quakePlace('central Mid-Atlantic Ridge'), '大西洋中脊中部');
  assert.equal(zh.quakePlace('southeast of Easter Island'), '复活节岛东南方');
  assert.equal(zh.quakePlace('Fiji region'), '斐济地区');
  const storm = zh.hazard({
    source: 'gdacs', type: 'storm', alert: 'orange', country: 'United States',
    title: 'Orange notification for tropical cyclone ISAIAS-26. Population affected by Category 1 (120 km/h) wind speeds or higher is 0.567 million .',
    summary: 'From 06/10/2026 to 11/10/2026, a Tropical Depression (maximum wind speed of 194 km/h) ISAIAS-26 was active in Atlantic. The cyclone affects these countries: United States (vulnerability Low).',
    severity: 'Tropical Depression (maximum wind speed of 37 km/h)',
    population: 'Population affected by Category 1 (120 km/h) wind speeds or higher is 0.567 million',
  });
  assert.equal(storm.title, '热带气旋 · ISAIAS-26：美国');
  assert.equal(storm.severity, '热带低压（最大风速 37 km/h）');
  assert.equal(storm.population, '56.7 万人受 1 级（120 km/h）以上风力影响');
  assert.match(storm.summary, /^2026年10月6日至2026年10月11日，热带低压 ISAIAS-26（最大风速 194 km\/h）在大西洋活动，影响：美国。$/);
  const drought = zh.hazard({ source: 'gdacs', type: 'drought', alert: 'orange', title: 'Drought is on going in X', country: 'The Bahamas, Bosnia & Herzegovina, México, Türkiye', population: '0' });
  assert.equal(drought.title, '干旱：巴哈马、波黑、墨西哥 等 4 国');
  assert.equal(drought.country, '巴哈马、波黑、墨西哥、土耳其');
  assert.equal(drought.population, '');
  assert.equal(zh.hazard({ source: 'eonet', type: 'fire', title: 'Wildfire CYRUS, Kern, California' }).title, '山火 CYRUS（加利福尼亚 Kern）');
  assert.equal(zh.hazard({ source: 'eonet', type: 'storm', title: 'Typhoon Koguma', severity: '50 kts' }).severity, '风速 50 节（约 93 km/h）');
});

test('precise locations: seats of government, capitals, small towns', () => {
  assert.equal(loc('Kremlin says new sanctions will not change Russia’s course')?.id, 'kremlin');
  assert.equal(loc('Trump ramps up third-country deportations from the US')?.kind, 'country');
  assert.equal(geo.parse('Albania’s PM dismisses calls to resign', 'Protests continue for a third day in the capital.', 'en')?.loc.name, 'Tirana');
  assert.equal(loc('Clashes erupt in Rumbek as South Sudan tensions rise')?.name, 'Rumbek');
  assert.notEqual(loc('Joni Mitchell becomes US citizen')?.name, 'Mitchell');
});

test('reports about the same official alert are one event', () => {
  const t0 = 1_000_000;
  const guam = { id: 'c-GU', name: 'Guam', zh: '关岛', cc: 'GU', lat: 13.4, lng: 144.8, kind: 'country' };
  const storm = { id: 'gdacs-TC-1', type: 'storm', title: 'Red notification for tropical cyclone CHAMPI-26.', lat: 11.3, lng: 154, time: t0 - 3600, until: t0 + 86400, alert: 'red', source: 'gdacs', url: 'https://x' };
  const stories = [
    report('g1', 'rnz-pacific', 'en', 'Tropical Storm Champi: Another typhoon threatens Marianas', guam, t0, { cat: 'disaster', sub: 'storm', sev: 0.5, lc: 2, lw: 'c' }),
    report('g2', 'abc-au', 'en', "Guam declares 'Condition of Readiness 3' as tropical depression approaches", guam, t0 + 3600, { cat: 'disaster', sub: 'storm', sev: 0.5, lc: 2, lw: 'c' }),
  ];
  const r = buildEvents({ stories, state: null, now: t0 + 2 * 3600, geo, src: (id) => SRC.get(id), placeById: (id) => (id === guam.id ? guam : null), quakes: [], hazards: [storm] });
  assert.equal(r.events.length, 1);
  assert.equal(stories[0].ev, stories[1].ev);
  assert.equal(r.events[0].hz, 'gdacs-TC-1');
  assert.equal(r.events[0].n, 2);
});
