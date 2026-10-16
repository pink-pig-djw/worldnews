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
import { buildEvents } from './lib/events.mjs';
import { Geoparser } from './lib/geo.mjs';
import { createZh } from './lib/zh.mjs';
import { mergeHazards, normalizeEonet, normalizeGdacs, normalizeUsgs, parseTle } from './lib/hazards.mjs';
import { fetchJson, fetchText } from './lib/http.mjs';
import { parseFeed } from './lib/rss.mjs';
import { DEFAULT_KEEP, HAZARD_SOURCES, NEWS_SOURCES, orgOf, regionOf, SATELLITES, STATE_PER_COUNTRY } from './lib/sources.mjs';
import { hashId, HOUR, mapLimit, normalizeUrl, truncate } from './lib/util.mjs';

const SOURCE_BY_ID = new Map(NEWS_SOURCES.map((s) => [s.id, { ...s, org: orgOf(s), region: regionOf(s) }]));
// Round-ups and photo galleries are not news events: "Latest news bulletin | …", "Pix of the Day".
const DIGEST = /^(?:latest news bulletin|news bulletin|pix of the day|pictures? of the day|photos? of the day|the day in pictures|week in pictures|morning update|evening update|morning briefing|evening briefing|news in brief|world news in brief)\b|\bnews bulletin \|| – podcast$|\bpodcast$/i;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : d;
  };
  const prev = get('prev', null);
  const prevUrl = get('prev-url', process.env.PREV_DATA_URL || null);
  return {
    out: resolve(ROOT, get('out', 'dist/data')),
    prev,
    prevUrl,
    // event state lives next to the previous data file (and is published next to it too)
    prevState: get('prev-state', prev ? join(dirname(prev), 'state.json') : null),
    prevStateUrl: prevUrl ? prevUrl.replace(/latest\.json$/, 'state.json') : null,
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

async function loadJson(file, url, what) {
  try {
    if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    if (url) return await fetchJson(url, { timeoutMs: 15000 });
  } catch (err) {
    console.warn(`! previous ${what} unavailable: ${err.message}`);
  }
  return null;
}
const loadPrevious = () => loadJson(opts.prev, opts.prevUrl, 'data');
// the published state only matches the published data; never mix a cached file with a fetched one
const loadPrevState = () => loadJson(opts.prevState, opts.prev && existsSync(opts.prev) ? null : opts.prevStateUrl, 'event state');

function toStory(item, src) {
  const title = truncate(item.title, 280);
  let summary = item.summary && item.summary !== item.title ? item.summary : '';
  if (summary.startsWith(title)) summary = summary.slice(title.length).replace(/^[\s:：-]+/, '');
  summary = truncate(summary, 300);
  const time = Math.min(item.date ?? now, now);
  const zh = src.lang === 'zh';
  const mt = zh ? simplify(title) : title;
  const ms = zh ? simplify(summary) : summary;
  // local outlets: their country disambiguates place names; national feeds default to it
  const g = geo.parse(mt, ms, src.lang, src.local ? { homeCc: src.country, homeFallback: Boolean(src.national) } : {});
  const c = classify(mt, ms, src.lang);
  const story = {
    id: hashId(normalizeUrl(item.link)),
    // Chinese feeds that publish in traditional characters are shown in simplified, like the interface
    title: zh ? mt : title,
    summary: zh ? ms : summary,
    url: item.link,
    source: src.id,
    lang: src.lang,
    time,
    seen: now,
    cat: c.cat,
    sub: c.sub,
    sev: c.sev,
    loc: g?.loc ?? null,
    lc: g?.conf ?? 0, // how sure the location is: 3 named in the title … 1 guessed (see geo.mjs)
    lw: g?.why ?? '',
    rel: g?.related ?? [],
  };
  if (c.deaths) story.deaths = c.deaths;
  if (item.image) story.image = item.image;
  if (item.geo && !story.loc) {
    story.loc = { id: `pt-${item.geo.lat},${item.geo.lng}`, name: '', zh: '', cc: null, lat: item.geo.lat, lng: item.geo.lng, kind: 'point' };
    story.lc = 3;
    story.lw = 'p';
  }
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
      for (const it of fresh) {
        if (DIGEST.test(it.title || '')) continue;
        const story = toStory(it, src);
        if (src.skipOther && story.cat === 'other') continue; // local sport, entertainment, horoscopes…
        stories.push(story);
      }
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

/** Previous stories in the current shape: places as objects, location confidence filled in. */
function upgradePrevious(prev) {
  const places = prev?.places || {};
  const out = [];
  for (const s of prev?.stories || []) {
    if (typeof s.loc === 'string') {
      const p = places[s.loc];
      s.loc = p ? { id: s.loc, name: p[0], zh: p[1], cc: p[2], lat: p[3], lng: p[4], kind: p[5] } : null;
    }
    if (s.lc == null) {
      // data from before events existed: classify again with today's rules and work out how sure
      // the location is, once
      const c = classify(s.title, s.summary, s.lang);
      Object.assign(s, { cat: c.cat, sub: c.sub, sev: c.sev });
      if (c.deaths) s.deaths = c.deaths;
      else delete s.deaths;
      const src = SOURCE_BY_ID.get(s.source);
      const g = s.loc ? geo.parse(s.title, s.summary, s.lang, src?.local ? { homeCc: src.country, homeFallback: Boolean(src.national) } : {}) : null;
      s.lc = g && g.loc.id === s.loc.id ? g.conf : s.loc ? 2 : 0;
      s.lw = g && g.loc.id === s.loc.id ? g.why : '';
    }
    delete s.cluster;
    delete s.coverage;
    if (DIGEST.test(s.title)) continue;
    out.push(s);
  }
  return out;
}

const titleKey = (s) => `${s.source}|${s.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}`;

function mergeWithPrevious(stories, prev) {
  const byId = new Map();
  const prevStories = upgradePrevious(prev);
  const prevById = new Map(prevStories.map((s) => [s.id, s]));
  for (const s of stories) {
    const old = prevById.get(s.id);
    if (old) {
      s.seen = old.seen ?? s.seen;
      if (old.ev) s.ev = old.ev; // a report stays with its event
    }
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  // Feeds only list their newest items; keep earlier stories until they age out of the window.
  for (const s of prevStories) {
    if (!byId.has(s.id) && now - s.time <= opts.windowHours * HOUR) byId.set(s.id, s);
  }
  // the same headline republished by one outlet under a new link: keep the copy seen first
  const firstByTitle = new Map();
  for (const s of [...byId.values()].sort((a, b) => (a.seen ?? a.time) - (b.seen ?? b.time) || a.time - b.time)) {
    const k = titleKey(s);
    if (firstByTitle.has(k)) byId.delete(s.id);
    else firstByTitle.set(k, s);
  }
  const merged = [...byId.values()].sort((a, b) => b.time - a.time);
  // State media keep only their newest stories about other countries: per outlet, and across all
  // state outlets per country, so they can't dominate coverage of any one place.
  const foreignSeen = new Map();
  const countrySeen = new Map();
  const perSource = new Map();
  return merged.filter((s) => {
    const src = SOURCE_BY_ID.get(s.source);
    // prolific feeds would otherwise pile up: the newest items are picked up every 5 minutes
    const k = (perSource.get(s.source) || 0) + 1;
    perSource.set(s.source, k);
    if (k > (src?.keep ?? DEFAULT_KEEP)) return false;
    if (!src?.foreignCap || src.homeCc.includes(s.loc?.cc)) return true;
    const n = (foreignSeen.get(s.source) || 0) + 1;
    const cc = s.loc?.cc || 'none';
    const m = (countrySeen.get(cc) || 0) + 1;
    if (n > src.foreignCap || m > STATE_PER_COUNTRY) return false;
    foreignSeen.set(s.source, n);
    countrySeen.set(cc, m);
    return true;
  });
}

function stats(stories, events) {
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
    events: events.length,
    multiSource: events.filter((e) => e.v >= 2).length,
    byCat,
    topCountries: Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 15),
  };
}

// Gazetteer places by id (event locations are chosen among their reports' places).
const PLACE_BY_ID = new Map(GAZETTEER.places.map((p) => [p.id, { id: p.id, name: p.en, zh: p.zh, cc: p.cc, lat: p.lat, lng: p.lng, kind: p.k }]));

/** Site payload: places once in a dictionary, stories pointing at them; single-report events
 *  carry only what their one report doesn't already say. */
function publish(stories, events) {
  const places = {};
  const put = (p) => {
    if (p && !places[p.id]) places[p.id] = [p.name || '', p.zh || '', p.cc || null, p.lat, p.lng, p.kind];
  };
  const outStories = stories.map((s) => {
    put(s.loc);
    return { ...s, loc: s.loc?.id ?? null };
  });
  const outEvents = events.map((e) => {
    if (e.loc) put(PLACE_BY_ID.get(e.loc) || stories.find((s) => s.loc?.id === e.loc)?.loc);
    const { ti, ...rest } = e;
    if (e.n === 1 && e.nw === 1) {
      const slim = { id: e.id, ld: e.ld, sev: e.sev, att: e.att, imp: e.imp };
      for (const k of ['sw', 'gap', 'hz', 'd', 'dc']) if (e[k] != null && !(Array.isArray(e[k]) && !e[k].length)) slim[k] = e[k];
      return slim;
    }
    return rest;
  });
  return { places, stories: outStories, events: outEvents };
}

async function main() {
  const t0 = Date.now();
  const [prev, prevState] = await Promise.all([loadPrevious(), loadPrevState()]);
  const [{ stories: fresh, health }, hz, satellites] = await Promise.all([fetchNews(), fetchHazards(prev), fetchSatellites(prev)]);
  const stories = mergeWithPrevious(fresh, prev);
  for (const s of stories) if (s.loc && !PLACE_BY_ID.has(s.loc.id)) PLACE_BY_ID.set(s.loc.id, s.loc);
  const ev = buildEvents({
    stories,
    state: prevState?.version === 1 ? prevState : null,
    now,
    geo,
    src: (id) => SOURCE_BY_ID.get(id),
    placeById: (id) => PLACE_BY_ID.get(id),
    quakes: hz.quakes,
    hazards: hz.hazards,
  });
  const site = publish(stories, ev.events);
  const generated = new Date(now * 1000).toISOString();
  const data = {
    version: 2,
    generated,
    windowHours: opts.windowHours,
    sample: Boolean(opts.fixtures),
    sources: health,
    hazardSources: hz.health,
    stats: stats(stories, ev.events),
    places: site.places,
    events: site.events,
    aliases: ev.aliases,
    stories: site.stories,
    quakes: hz.quakes,
    hazards: hz.hazards,
    satellites,
  };
  mkdirSync(opts.out, { recursive: true });
  const json = JSON.stringify(data);
  writeFileSync(join(opts.out, 'latest.json'), json);
  // events of the past 15 days that have left the 48-hour window ("since your last visit")
  const archivePlaces = {};
  for (const e of ev.archive) {
    const p = e.loc && PLACE_BY_ID.get(e.loc);
    if (p) archivePlaces[p.id] = [p.name || '', p.zh || '', p.cc || null, p.lat, p.lng, p.kind];
  }
  const archive = { version: 1, generated, places: archivePlaces, events: ev.archive.map(({ nw, r6, ...e }) => e), aliases: ev.aliases };
  writeFileSync(join(opts.out, 'events.json'), JSON.stringify(archive));
  // the pipeline's memory for the next run
  writeFileSync(join(opts.out, 'state.json'), JSON.stringify({ ...ev.state, generated }));
  writeFileSync(join(opts.out, 'status.json'), JSON.stringify({ generated: data.generated, stats: data.stats, sources: health, hazardSources: hz.health }, null, 1));

  // Run report (shows up in the Actions log)
  const okSources = health.filter((h) => h.ok).length;
  console.log(`\n== World Pulse data ${data.generated} (${((Date.now() - t0) / 1000).toFixed(1)}s) ==`);
  console.log(`news sources ok: ${okSources}/${health.length}; stories: ${stories.length} (fresh ${fresh.length}), located ${data.stats.located}`);
  console.log(`events: ${ev.events.length} (${data.stats.multiSource} with 2+ independent sources), archive ${ev.archive.length}, aliases ${Object.keys(ev.aliases).length}, previous state ${prevState ? 'loaded' : 'missing'}`);
  for (const h of health) console.log(`  ${h.ok ? '✓' : '✗'} ${h.id.padEnd(11)} ${String(h.items).padStart(3)} items ${String(h.ms).padStart(5)}ms ${h.error ? '— ' + h.error : ''}`);
  for (const h of hz.health) console.log(`  ${h.ok ? '✓' : '✗'} ${h.id.padEnd(11)} ${String(h.items ?? 0).padStart(3)} items ${h.error ? '— ' + h.error : ''}`);
  console.log(`satellites: ${satellites.map((s) => s.id).join(', ') || 'none'}`);
  console.log('categories:', JSON.stringify(data.stats.byCat));
  console.log('top countries:', data.stats.topCountries.map(([c, n]) => `${c}:${n}`).join(' '));
  const title = new Map(stories.map((s) => [s.id, s.title]));
  console.log('top events (severity / attention / independent sources):');
  for (const e of ev.events.slice(0, 15)) console.log(`  ${e.sev.toFixed(2)} ${e.att.toFixed(2)} ${String(e.v).padStart(2)} ${e.cat}/${e.sub ?? '-'} ${e.loc ?? '-'} ← ${(title.get(e.ld) || '').slice(0, 80)}`);
  const gaps = ev.events.filter((e) => e.gap).slice(0, 8);
  if (gaps.length) console.log('severe but little covered:');
  for (const e of gaps) console.log(`  ${e.sev.toFixed(2)} ${e.loc ?? '-'} ← ${(title.get(e.ld) || '').slice(0, 90)}`);
  console.log(`wrote ${join(opts.out, 'latest.json')} (${(json.length / 1024).toFixed(0)} KB), events.json (${(JSON.stringify(archive).length / 1024).toFixed(0)} KB)`);
  if (!okSources && !opts.fixtures) {
    console.error('No news source could be fetched.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
