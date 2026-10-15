#!/usr/bin/env node
// Fetch news + hazard feeds, geolocate and classify every story, merge with the previous run
// (rolling window) and write <out>/latest.json for the site.
//
//   node scripts/fetch-data.mjs [--out dist/data] [--prev file.json] [--prev-url URL]
//                               [--window 48] [--fixtures test/fixtures]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from './lib/classify.mjs';
import { clusterStories } from './lib/cluster.mjs';
import { Geoparser } from './lib/geo.mjs';
import { createZh } from './lib/zh.mjs';
import { mergeHazards, normalizeEonet, normalizeGdacs, normalizeUsgs, parseTle } from './lib/hazards.mjs';
import { fetchJson, fetchText } from './lib/http.mjs';
import { parseFeed } from './lib/rss.mjs';
import { HAZARD_SOURCES, NEWS_SOURCES, SATELLITES } from './lib/sources.mjs';
import { hashId, HOUR, mapLimit, normalizeUrl, truncate } from './lib/util.mjs';

const SOURCE_BY_ID = new Map(NEWS_SOURCES.map((s) => [s.id, s]));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : d;
  };
  return {
    out: resolve(ROOT, get('out', 'dist/data')),
    prev: get('prev', null),
    prevUrl: get('prev-url', process.env.PREV_DATA_URL || null),
    windowHours: Number(get('window', 48)),
    fixtures: get('fixtures', null),
    maxPerSource: Number(get('max-per-source', 45)),
  };
}

const opts = args();
const now = Math.round(Date.now() / 1000);
const GAZETTEER = JSON.parse(readFileSync(join(ROOT, 'scripts/data/gazetteer.json'), 'utf8'));
const geo = new Geoparser(GAZETTEER);
const zh = createZh(GAZETTEER);
// Some Chinese feeds mix in traditional characters; match against a simplified copy of the text.
const T2S = JSON.parse(readFileSync(join(ROOT, 'scripts/data/t2s.json'), 'utf8'));
const simplify = (s) => (s ? s.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, (c) => T2S[c] || c) : s);

async function load(kind, id, url) {
  if (opts.fixtures) {
    const ext = kind === 'json' ? 'json' : kind === 'tle' ? 'txt' : 'xml';
    const file = resolve(ROOT, opts.fixtures, `${id}.${ext}`);
    if (!existsSync(file)) throw new Error('no fixture');
    const txt = readFileSync(file, 'utf8');
    return kind === 'json' ? JSON.parse(txt) : txt;
  }
  return kind === 'json' ? fetchJson(url) : fetchText(url);
}

async function loadPrevious() {
  try {
    if (opts.prev && existsSync(opts.prev)) return JSON.parse(readFileSync(opts.prev, 'utf8'));
    if (opts.prevUrl) return await fetchJson(opts.prevUrl, { timeoutMs: 15000 });
  } catch (err) {
    console.warn(`! previous data unavailable: ${err.message}`);
  }
  return null;
}

function toStory(item, src) {
  const title = truncate(item.title, 280);
  let summary = item.summary && item.summary !== item.title ? item.summary : '';
  if (summary.startsWith(title)) summary = summary.slice(title.length).replace(/^[\s:：-]+/, '');
  summary = truncate(summary, 300);
  const time = Math.min(item.date ?? now, now);
  const zh = src.lang === 'zh';
  const mt = zh ? simplify(title) : title;
  const ms = zh ? simplify(summary) : summary;
  const g = geo.parse(mt, ms, src.lang);
  const c = classify(mt, ms, src.lang);
  const story = {
    id: hashId(normalizeUrl(item.link)),
    title,
    summary,
    url: item.link,
    source: src.id,
    lang: src.lang,
    time,
    seen: now,
    cat: c.cat,
    sub: c.sub,
    sev: c.sev,
    loc: g?.loc ?? null,
    rel: g?.related ?? [],
  };
  if (c.deaths) story.deaths = c.deaths;
  if (item.image) story.image = item.image;
  if (item.geo && !story.loc) story.loc = { id: `pt-${item.geo.lat},${item.geo.lng}`, name: '', zh: '', cc: null, lat: item.geo.lat, lng: item.geo.lng, kind: 'point' };
  return story;
}

async function fetchNews() {
  const health = [];
  const stories = [];
  await mapLimit(NEWS_SOURCES, 6, async (src) => {
    const started = Date.now();
    const h = { id: src.id, name: src.name, zh: src.zh, lang: src.lang, kind: src.kind, country: src.country, home: new URL(src.url).origin, ok: false, items: 0 };
    if (src.weight) Object.assign(h, { weight: src.weight, homeCc: src.homeCc });
    try {
      const xml = await load('xml', src.id, src.url);
      const { items } = parseFeed(xml, { tz: src.tz });
      const fresh = items
        .filter((it) => !it.date || now - it.date <= opts.windowHours * HOUR)
        .slice(0, src.limit || opts.maxPerSource);
      for (const it of fresh) stories.push(toStory(it, src));
      h.ok = true;
      h.items = fresh.length;
    } catch (err) {
      h.error = String(err.message || err).slice(0, 120);
    }
    h.ms = Date.now() - started;
    health.push(h);
  });
  health.sort((a, b) => NEWS_SOURCES.findIndex((s) => s.id === a.id) - NEWS_SOURCES.findIndex((s) => s.id === b.id));
  return { stories, health };
}

async function fetchHazards(prev) {
  const health = [];
  const track = async (id, fn) => {
    try {
      const r = await fn();
      health.push({ id, ok: true, items: r.length });
      return r;
    } catch (err) {
      health.push({ id, ok: false, error: String(err.message || err).slice(0, 120) });
      return null;
    }
  };
  const [quakes, gdacs, eonet] = await Promise.all([
    track('usgs', async () => normalizeUsgs(await load('json', 'usgs', HAZARD_SOURCES.usgs.url), now)),
    track('gdacs', async () => normalizeGdacs(await load('xml', 'gdacs', HAZARD_SOURCES.gdacs.url), now)),
    track('eonet', async () => normalizeEonet(await load('json', 'eonet', HAZARD_SOURCES.eonet.url), now)),
  ]);
  const hazards = mergeHazards(gdacs ?? (prev?.hazards || []).filter((h) => h.source === 'gdacs'), eonet ?? (prev?.hazards || []).filter((h) => h.source === 'eonet'));
  // Chinese wording, rebuilt from each alert's parts (see lib/zh.mjs)
  for (const h of hazards) h.zh = zh.hazard(h);
  const qs = quakes ?? prev?.quakes ?? [];
  for (const q of qs) q.placeZh = zh.quakePlace(q.place) || undefined;
  return { quakes: qs, hazards, health };
}

async function fetchSatellites(prev) {
  const out = [];
  for (const s of SATELLITES) {
    try {
      const txt = await load('tle', `tle-${s.norad}`, `https://celestrak.org/NORAD/elements/gp.php?CATNR=${s.norad}&FORMAT=TLE`);
      const tle = parseTle(txt);
      if (tle) {
        out.push({ ...s, tle });
        continue;
      }
    } catch {
      /* fall through to the previous TLE */
    }
    const old = prev?.satellites?.find((p) => p.id === s.id);
    if (old) out.push(old);
  }
  return out;
}

function mergeWithPrevious(stories, prev) {
  const byId = new Map();
  const prevById = new Map((prev?.stories || []).map((s) => [s.id, s]));
  for (const s of stories) {
    const old = prevById.get(s.id);
    if (old) s.seen = old.seen ?? s.seen;
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  // Feeds only list their newest items; keep earlier stories until they age out of the window.
  for (const s of prev?.stories || []) {
    if (!byId.has(s.id) && now - s.time <= opts.windowHours * HOUR) byId.set(s.id, s);
  }
  const merged = [...byId.values()].sort((a, b) => b.time - a.time);
  // sources with a foreign-story cap keep only their newest stories about other countries
  const foreignSeen = new Map();
  return merged.filter((s) => {
    const src = SOURCE_BY_ID.get(s.source);
    if (!src?.foreignCap || src.homeCc.includes(s.loc?.cc)) return true;
    const n = (foreignSeen.get(s.source) || 0) + 1;
    foreignSeen.set(s.source, n);
    return n <= src.foreignCap;
  });
}

function stats(stories) {
  const byCat = {};
  const byCountry = {};
  let located = 0;
  for (const s of stories) {
    byCat[s.cat] = (byCat[s.cat] || 0) + 1;
    if (s.loc) located++;
    const cc = s.loc?.cc;
    if (cc && !['XS', 'XR', 'XO'].includes(cc)) byCountry[cc] = (byCountry[cc] || 0) + 1;
  }
  return {
    total: stories.length,
    located,
    byCat,
    topCountries: Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 15),
  };
}

async function main() {
  const t0 = Date.now();
  const prev = await loadPrevious();
  const [{ stories: fresh, health }, hz, satellites] = await Promise.all([fetchNews(), fetchHazards(prev), fetchSatellites(prev)]);
  const stories = mergeWithPrevious(fresh, prev);
  const clusters = clusterStories(stories);
  const data = {
    version: 1,
    generated: new Date(now * 1000).toISOString(),
    windowHours: opts.windowHours,
    sample: Boolean(opts.fixtures),
    sources: health,
    hazardSources: hz.health,
    stats: { ...stats(stories), clusters },
    stories,
    quakes: hz.quakes,
    hazards: hz.hazards,
    satellites,
  };
  mkdirSync(opts.out, { recursive: true });
  const json = JSON.stringify(data);
  writeFileSync(join(opts.out, 'latest.json'), json);
  writeFileSync(join(opts.out, 'status.json'), JSON.stringify({ generated: data.generated, stats: data.stats, sources: health, hazardSources: hz.health }, null, 1));

  // Run report (shows up in the Actions log)
  const okSources = health.filter((h) => h.ok).length;
  console.log(`\n== World Pulse data ${data.generated} (${((Date.now() - t0) / 1000).toFixed(1)}s) ==`);
  console.log(`news sources ok: ${okSources}/${health.length}; stories: ${stories.length} (fresh ${fresh.length}), located ${data.stats.located}, clusters ${clusters}`);
  for (const h of health) console.log(`  ${h.ok ? '✓' : '✗'} ${h.id.padEnd(11)} ${String(h.items).padStart(3)} items ${String(h.ms).padStart(5)}ms ${h.error ? '— ' + h.error : ''}`);
  for (const h of hz.health) console.log(`  ${h.ok ? '✓' : '✗'} ${h.id.padEnd(11)} ${String(h.items ?? 0).padStart(3)} items ${h.error ? '— ' + h.error : ''}`);
  console.log(`satellites: ${satellites.map((s) => s.id).join(', ') || 'none'}`);
  console.log('categories:', JSON.stringify(data.stats.byCat));
  console.log('top countries:', data.stats.topCountries.map(([c, n]) => `${c}:${n}`).join(' '));
  console.log('sample of geolocated headlines:');
  for (const s of stories.filter((x) => x.loc).slice(0, 25)) {
    console.log(`  [${s.cat}/${s.sub ?? '-'} ${s.sev}] ${s.loc.name || s.loc.id} (${s.loc.cc}) ← ${s.source}: ${s.title.slice(0, 90)}`);
  }
  console.log(`wrote ${join(opts.out, 'latest.json')} (${(json.length / 1024).toFixed(0)} KB)`);
  if (!okSources && !opts.fixtures) {
    console.error('No news source could be fetched.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
