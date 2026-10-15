import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classify, extractDeaths } from '../scripts/lib/classify.mjs';
import { clusterStories } from '../scripts/lib/cluster.mjs';
import { Geoparser } from '../scripts/lib/geo.mjs';
import { normalizeEonet, normalizeGdacs, normalizeUsgs, parseTle } from '../scripts/lib/hazards.mjs';
import { parseFeed } from '../scripts/lib/rss.mjs';
import { cleanText, normalizeUrl, parseDate } from '../scripts/lib/util.mjs';

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

test('clustering groups the same event across outlets', () => {
  const base = { lang: 'en', loc: { cc: 'PS' } };
  const stories = [
    { ...base, id: 'a', source: 'bbc', time: 1000, title: 'Israeli strikes kill 30 in Gaza, officials say' },
    { ...base, id: 'b', source: 'aljazeera', time: 2000, title: 'Gaza: Israeli air strikes kill at least 30 Palestinians' },
    { ...base, id: 'c', source: 'guardian', time: 3000, title: 'Aid trucks enter northern Gaza' },
  ];
  clusterStories(stories);
  assert.equal(stories[1].cluster, 'a');
  assert.equal(stories[2].cluster, 'c');
  assert.equal(stories[0].coverage, 2);
});
