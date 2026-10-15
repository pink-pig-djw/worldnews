#!/usr/bin/env node
// Generates SYNTHETIC feed fixtures for offline tests and UI development.
// Every headline is prefixed "Sample" / "示例" — none of this is real news.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
mkdirSync(DIR, { recursive: true });
const now = Date.now();
const ago = (h) => new Date(now - h * 3600e3).toUTCString();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function rss(title, items) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${esc(title)}</title>
${items
  .map(
    ([t, d, h, slug], i) => `<item><title>${esc(t)}</title><description>${esc(d)}</description><link>https://example.org/${title.split(' ')[0]}/${slug || 'story'}-${i}</link><pubDate>${ago(h)}</pubDate></item>`,
  )
  .join('\n')}
</channel></rss>`;
}

const FEEDS = {
  bbc: [
    ['Sample: Heavy fighting reported near Pokrovsk as winter approaches', 'Ukrainian officials describe intense clashes in the Donetsk region.', 1.2],
    ['Sample: Drone attack on Kyiv damages power infrastructure', 'Air defences were active over the capital overnight, officials said.', 3],
    ['Sample: Israeli strikes reported in southern Gaza', 'Health officials in Gaza report casualties after strikes near Khan Younis.', 0.6],
    ['Sample: Ceasefire talks resume in Cairo', 'Mediators from Egypt and Qatar hosted a new round of talks on Gaza.', 5],
    ['Sample: Flooding forces evacuations in Bangladesh', 'Monsoon rains have displaced thousands of people.', 8],
    ['Sample: Election count under way in Bolivia', 'Results are expected later this week.', 14],
    ['Sample: Protesters rally in Tbilisi for third night', 'Demonstrators gathered outside parliament in Georgia.', 2.5],
    ['Sample: Typhoon brings heavy rain to the Philippines', 'Thousands moved to shelters in Luzon.', 6],
    ['Sample: Central bank in Japan holds interest rates', 'The yen moved after the announcement in Tokyo.', 11],
  ],
  aljazeera: [
    ['Sample: Aid convoys reach El Fasher amid famine warnings', 'UN agencies say hunger is spreading across Darfur in Sudan.', 2],
    ['Sample: Houthis claim attack on ship in the Red Sea', 'A merchant vessel reported an explosion near Yemen.', 4],
    ['Sample: Israeli strikes kill 12 in Gaza, officials say', 'Rescue teams searched rubble in Gaza City.', 0.8],
    ['Sample: Clashes erupt in Sweida, Syria', 'Local groups and government forces exchanged fire.', 9],
    ['Sample: Pakistan and India trade accusations over Kashmir', 'Tensions rose after an incident along the Line of Control.', 16],
    ['Sample: Protests continue in Nairobi over tax plans', 'Police used tear gas against demonstrators in Kenya.', 7],
    ['Sample: Fighting displaces thousands near Goma', 'M23 fighters advanced in North Kivu, DR Congo.', 10],
  ],
  guardian: [
    ['Sample: EU leaders agree new sanctions package on Russia', 'The measures were agreed in Brussels.', 3.5],
    ['Sample: Wildfires spread in southern Australia', 'Firefighters battled blazes across Victoria and New South Wales.', 12],
    ['Sample: Migrants rescued in the English Channel', 'Small boat crossings continued from France.', 6.5],
    ['Sample: Heatwave grips southern Europe', 'Temperatures topped 40C in Spain and Italy.', 20],
    ['Sample: Climate talks open with pledges on emissions', 'Delegates gathered for COP negotiations in Brazil.', 18],
  ],
  nyt: [
    ['Sample: US and China agree to extend tariff truce', 'Negotiators met in Geneva to discuss trade.', 4.5],
    ['Sample: Stocks fall on Wall Street as tech shares slide', 'Investors weighed new data on inflation.', 2.2],
    ['Sample: Venezuela tensions rise as US warships patrol Caribbean', 'Caracas condemned the deployment.', 13],
  ],
  un: [
    ['Sample: Cholera outbreak spreads in Yemen, WHO warns', 'Health partners are scaling up vaccination.', 9],
    ['Sample: Humanitarian chief warns of hunger in Haiti', 'Gang violence in Port-au-Prince has displaced thousands.', 15],
    ['Sample: Security Council meets on Myanmar crisis', 'Fighting in Rakhine continues to displace civilians.', 22],
  ],
  'bbc-zh': [
    ['示例：俄乌冲突 乌克兰称俄军对哈尔科夫发动导弹袭击', '乌克兰官员表示，袭击造成多处建筑受损。', 1.5],
    ['示例：中美贸易谈判在日内瓦举行', '双方就关税问题进行磋商。', 4.6],
    ['示例：台风逼近香港 天文台发出警告', '香港多地出现强风暴雨。', 3.2],
    ['示例：日本首相访问美国 讨论安全合作', '双方在华盛顿举行会谈。', 19],
  ],
  'dw-zh': [
    ['示例：德国议会辩论国防预算', '柏林方面计划增加军费开支。', 7.5],
    ['示例：苏丹达尔富尔饥荒蔓延 联合国呼吁援助', '人道组织称数百万人面临饥饿。', 12.5],
  ],
};

for (const [id, items] of Object.entries(FEEDS)) writeFileSync(join(DIR, `${id}.xml`), rss(`${id} sample feed`, items));

// --- hazards ---
const quake = (id, mag, place, lat, lng, h, extra = {}) => ({
  type: 'Feature',
  id,
  properties: { mag, place, time: now - h * 3600e3, url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`, tsunami: 0, alert: null, felt: 10, sig: Math.round(mag * 100), type: 'earthquake', ...extra },
  geometry: { type: 'Point', coordinates: [lng, lat, 10] },
});
writeFileSync(
  join(DIR, 'usgs.json'),
  JSON.stringify({
    type: 'FeatureCollection',
    features: [
      quake('sample1', 6.4, 'Sample: 120 km SE of Hachinohe, Japan', 40.1, 142.6, 5, { alert: 'green', tsunami: 1 }),
      quake('sample2', 5.1, 'Sample: Tonga region', -20.5, -174.3, 20),
      quake('sample3', 4.8, 'Sample: Southern Peru', -15.9, -73.2, 30),
      quake('sample4', 5.6, 'Sample: Banda Sea', -6.5, 129.8, 50),
      quake('sample5', 4.6, 'Sample: Central Turkey', 38.9, 35.5, 70),
    ],
  }),
);

writeFileSync(
  join(DIR, 'gdacs.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:gdacs="http://www.gdacs.org" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#"><channel><title>GDACS sample</title>
<item><title>Sample: Orange alert for tropical cyclone near the Philippines</title><description>Sample cyclone event.</description><link>https://www.gdacs.org/report.aspx?eventid=1&amp;eventtype=TC</link><pubDate>${ago(6)}</pubDate>
<gdacs:eventtype>TC</gdacs:eventtype><gdacs:alertlevel>Orange</gdacs:alertlevel><gdacs:eventid>1</gdacs:eventid><gdacs:fromdate>${ago(40)}</gdacs:fromdate><gdacs:todate>${ago(1)}</gdacs:todate><gdacs:iscurrent>true</gdacs:iscurrent><gdacs:country>Philippines</gdacs:country><gdacs:severity>Category 2, 160 km/h</gdacs:severity>
<geo:Point><geo:lat>16.2</geo:lat><geo:long>124.1</geo:long></geo:Point></item>
<item><title>Sample: Green alert for flood in Nigeria</title><description>Sample flood event.</description><link>https://www.gdacs.org/report.aspx?eventid=2&amp;eventtype=FL</link><pubDate>${ago(30)}</pubDate>
<gdacs:eventtype>FL</gdacs:eventtype><gdacs:alertlevel>Green</gdacs:alertlevel><gdacs:eventid>2</gdacs:eventid><gdacs:fromdate>${ago(60)}</gdacs:fromdate><gdacs:todate>${ago(10)}</gdacs:todate><gdacs:iscurrent>true</gdacs:iscurrent><gdacs:country>Nigeria</gdacs:country>
<geo:Point><geo:lat>9.1</geo:lat><geo:long>7.4</geo:long></geo:Point></item>
<item><title>Sample: Volcanic activity at Etna, Italy</title><description>Sample volcano event.</description><link>https://www.gdacs.org/report.aspx?eventid=3&amp;eventtype=VO</link><pubDate>${ago(12)}</pubDate>
<gdacs:eventtype>VO</gdacs:eventtype><gdacs:alertlevel>Green</gdacs:alertlevel><gdacs:eventid>3</gdacs:eventid><gdacs:fromdate>${ago(24)}</gdacs:fromdate><gdacs:todate>${ago(2)}</gdacs:todate><gdacs:iscurrent>true</gdacs:iscurrent><gdacs:country>Italy</gdacs:country>
<geo:Point><geo:lat>37.75</geo:lat><geo:long>14.99</geo:long></geo:Point></item>
</channel></rss>`,
);

const iso = (h) => new Date(now - h * 3600e3).toISOString();
writeFileSync(
  join(DIR, 'eonet.json'),
  JSON.stringify({
    events: [
      { id: 'S1', title: 'Sample Wildfire, California', categories: [{ id: 'wildfires' }], sources: [{ url: 'https://example.org/fire' }], geometry: [{ date: iso(20), type: 'Point', coordinates: [-120.5, 38.4] }] },
      { id: 'S2', title: 'Sample Wildfire, Bolivia', categories: [{ id: 'wildfires' }], sources: [{ url: 'https://example.org/fire2' }], geometry: [{ date: iso(30), type: 'Point', coordinates: [-62.1, -16.3] }] },
      {
        id: 'S3',
        title: 'Sample Hurricane, Atlantic',
        categories: [{ id: 'severeStorms' }],
        sources: [{ url: 'https://example.org/storm' }],
        geometry: Array.from({ length: 10 }, (_, i) => ({ date: iso(60 - i * 6), type: 'Point', coordinates: [-55 - i * 1.6, 17 + i * 1.1], magnitudeValue: 70 + i * 5, magnitudeUnit: 'kts' })),
      },
      { id: 'S4', title: 'Sample Volcano, Iceland', categories: [{ id: 'volcanoes' }], sources: [{ url: 'https://example.org/volcano' }], geometry: [{ date: iso(48), type: 'Point', coordinates: [-22.4, 63.9] }] },
    ],
  }),
);

// --- satellites: synthetic but well-formed TLEs with an epoch of "now" ---
function checksum(line) {
  let sum = 0;
  for (const ch of line.slice(0, 68)) sum += ch === '-' ? 1 : /\d/.test(ch) ? Number(ch) : 0;
  return sum % 10;
}
function tle(norad, intl, inc, raan, ecc, argp, ma, mm) {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = (now - start) / 86400e3 + 1;
  const epoch = `${String(d.getUTCFullYear()).slice(2)}${doy.toFixed(8).padStart(12, '0')}`;
  let l1 = `1 ${norad}U ${intl.padEnd(8)} ${epoch}  .00016717  00000-0  30016-3 0  999`;
  l1 = l1.padEnd(68).slice(0, 68);
  l1 += checksum(l1);
  const f = (x, w, p) => x.toFixed(p).padStart(w);
  let l2 = `2 ${norad} ${f(inc, 8, 4)} ${f(raan, 8, 4)} ${String(Math.round(ecc * 1e7)).padStart(7, '0')} ${f(argp, 8, 4)} ${f(ma, 8, 4)} ${f(mm, 11, 8)}12345`;
  l2 = l2.padEnd(68).slice(0, 68);
  l2 += checksum(l2);
  return `SAMPLE\n${l1}\n${l2}\n`;
}
writeFileSync(join(DIR, 'tle-25544.txt'), tle(25544, '98067A', 51.64, 247.46, 0.00067, 130.5, 325.0, 15.50377579));
writeFileSync(join(DIR, 'tle-48274.txt'), tle(48274, '21035A', 41.47, 120.3, 0.0004, 90.1, 270.0, 15.6123));
console.log('fixtures written to', DIR);
