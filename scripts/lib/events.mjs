// Reports → events. A map point is a real-world event; every outlet's report of it hangs underneath.
//
// Events persist across pipeline runs: a report keeps the event it was first assigned to, new
// reports join the event whose reports they match best (in any language), and two events merge
// when a new report shows they are the same (the old id is kept as an alias so links still work).
// Matching is deliberately conservative: two separate dots for one event are better than one dot
// that mixes up two events.
import { conceptKind, concepts, numbers } from './concepts.mjs';
import { hashId } from './util.mjs';

const H = 3600;
const DAY = 86400;
export const JOIN_GAP = 36 * H; // a report matches reports at most this far apart in time
export const ARCHIVE_DAYS = 15;

// ---------------------------------------------------------------- report features
const STOP_EN = new Set(`a an the of in on at to for from by with and or but as is are was were be been being has have had
it its this that these those after before over under into amid about against says said say new news live latest update
updates how why what who when where will would could can may might not no more than up down out off first last year years
day days week weeks month time people man woman men women report reports also just two three four five six seven eight nine
ten watch video audio pictures photos analysis opinion explainer here there their his her they them he she we you our your
what which while within without amid via per vs us one ahead behind among despite near back set plan plans make makes take
takes get gets give gives see sees look keep put still even already now again next big top key major call calls`.split(/\s+/));
const PUNCT_ZH = /[\s，。、；：？！“”‘’（）《》【】「」『』·…—\-,.;:?!'"()[\]{}|/\\0-9a-zA-Z]/;

function stem(w) {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 6 && w.endsWith('ing')) return w.slice(0, -3);
  return w;
}

/** Title words (English stems) or character pairs (Chinese). */
export function titleTokens(title, lang) {
  const out = new Set();
  if (lang.startsWith('zh')) {
    const chars = [...title].filter((c) => !PUNCT_ZH.test(c));
    for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1]);
  } else {
    const clean = title.toLowerCase().replace(/[’']s\b/g, '').replace(/^(?:watch|live|video|analysis|opinion|explainer|breaking|photos|exclusive|update)\s*[:|-]\s*/, '');
    for (const raw of clean.split(/[^a-z0-9À-ɏ]+/)) {
      if (raw.length < 3 || STOP_EN.has(raw) || /^\d+$/.test(raw)) continue;
      out.add(stem(raw));
    }
  }
  return out;
}

/**
 * What a report says, reduced to comparable pieces. `keys` mixes concepts, numbers and the places
 * the title names — all language-independent.
 */
export function features(s, geo) {
  const lang = s.lang || 'en';
  const keys = new Set();
  for (const c of concepts(s.title, lang)) keys.add(`k:${c}`);
  for (const n of numbers(s.title, lang)) keys.add(`n:${n}`);
  const g = geo ? geo.parse(s.title, '', lang) : null;
  // real places only: leaders' names and institutions are gazetteer "actors" too, but they are
  // already concepts and must not count twice
  for (const id of g?.titlePlaces || []) if (isPlaceKey(geo, id)) keys.add(`p:${id}`);
  if (s.loc?.id && isPlaceKey(geo, s.loc.id)) keys.add(`p:${s.loc.id}`);
  // a few summary concepts help short titles ("At the scene of a school roof collapse")
  const extra = new Set();
  if (s.summary) for (const c of concepts(s.summary, lang)) if (!keys.has(`k:${c}`)) extra.add(`k:${c}`);
  const ccs = new Set([s.loc?.cc, ...(s.rel || [])].filter(Boolean));
  return {
    s,
    id: s.id,
    lang,
    time: s.time,
    source: s.source,
    tok: titleTokens(s.title, lang),
    keys,
    extra,
    cc: s.loc?.cc || null,
    locId: s.loc?.id || null,
    city: s.loc && ['city', 'point'].includes(s.loc.kind) ? s.loc.id : null,
    ccs,
    cat: s.cat,
    sub: s.sub,
  };
}

const PLACE_KINDS = new Set(['city', 'region', 'admin1', 'sea', 'country', 'point']);
function isPlaceKey(geo, id) {
  if (id.startsWith('d-') || id.startsWith('pt-')) return false;
  if (!geo) return true;
  geo.kindById ||= new Map(geo.places.map((p) => [p.id, p.k]));
  return PLACE_KINDS.has(geo.kindById.get(id));
}

/** What kind of evidence a shared key is: who, what, a number, or where. */
function keyKind(k) {
  if (k.startsWith('n:')) return 'num';
  if (k.startsWith('p:')) return k.startsWith('p:c-') ? 'country' : 'where';
  return conceptKind(k.slice(2)) === 'actor' ? 'actor' : 'topic';
}

/** Inverse document frequencies over the current window: rare words and concepts say more. */
export function idfTables(feats) {
  const df = { en: new Map(), zh: new Map(), keys: new Map() };
  const count = { en: 0, zh: 0 };
  for (const f of feats) {
    const l = f.lang.startsWith('zh') ? 'zh' : 'en';
    count[l]++;
    for (const t of f.tok) df[l].set(t, (df[l].get(t) || 0) + 1);
    for (const k of new Set([...f.keys, ...f.extra])) df.keys.set(k, (df.keys.get(k) || 0) + 1);
  }
  const N = feats.length;
  // normalised to about 0 (in every report) … 1 (in one report), whatever the window's size
  const mk = (m, n) => (t) => Math.log((n + 1) / ((m.get(t) || 0) + 0.5)) / Math.log(n + 2);
  return { en: mk(df.en, count.en), zh: mk(df.zh, count.zh), keys: mk(df.keys, N) };
}

function weighted(a, b, w) {
  let inter = 0;
  let wa = 0;
  let wb = 0;
  let n = 0;
  for (const x of a) {
    const v = w(x);
    wa += v;
    if (b.has(x)) {
      inter += v;
      n++;
    }
  }
  for (const x of b) wb += w(x);
  const min = Math.min(wa, wb);
  return { inter, n, ovl: min > 0 ? inter / min : 0, jac: wa + wb - inter > 0 ? inter / (wa + wb - inter) : 0 };
}

/**
 * Do two reports describe the same event? Returns a score (0 = no). Same-language reports compare
 * their wording; any pair compares concepts, numbers and places.
 */
export function similarity(a, b, idf) {
  if (Math.abs(a.time - b.time) > JOIN_GAP) return 0;
  // different countries only when each names the other's (e.g. Japan protests Russia's arrest of…)
  if (a.cc && b.cc && a.cc !== b.cc && !a.ccs.has(b.cc) && !b.ccs.has(a.cc)) return 0;
  const k = weighted(a.keys, b.keys, idf.keys);
  // what the shared evidence is: "who + where" alone is not an event ("Trump", "Ukraine"); there
  // has to be something about what happened (a kind of incident, an object, a number)
  let kNonPlace = 0;
  let kWhat = 0;
  let kMore = 0;
  for (const x of a.keys) {
    if (!b.keys.has(x)) continue;
    const kind = keyKind(x);
    if (kind !== 'country' && kind !== 'where') kNonPlace++;
    if (kind === 'topic' || kind === 'num') kWhat++;
    if (kind !== 'country') kMore++;
  }
  const evidence = kWhat >= 1 && kMore >= 2;
  const diffCity = a.city && b.city && a.city !== b.city && !a.keys.has(`p:${b.city}`) && !b.keys.has(`p:${a.city}`);
  const sameSource = a.source === b.source;
  let score = 0;
  if (a.lang === b.lang) {
    const t = weighted(a.tok, b.tok, idf[a.lang.startsWith('zh') ? 'zh' : 'en']);
    const need = a.lang.startsWith('zh') ? 4 : 3;
    // wording: most of the shorter headline's distinctive words appear in the other
    if (t.n >= need && t.ovl >= (sameSource ? 0.62 : 0.5) && t.jac >= 0.24) score = Math.max(score, t.ovl + 0.25 * k.ovl);
    // or fewer shared words backed by shared concepts / numbers
    if (t.n >= 2 && evidence && kNonPlace >= 2 && t.ovl >= 0.4 && k.ovl >= 0.45 && k.inter >= 0.84 && !sameSource) score = Math.max(score, 0.5 * t.ovl + 0.5 * k.ovl);
  }
  // across languages (or as a fallback): concepts, numbers and places only; the shared evidence
  // must add up to more than one rare concept
  if (!sameSource && evidence && k.n >= 3 && kNonPlace >= 2 && k.ovl >= 0.55 && k.inter >= 1.12) score = Math.max(score, 0.9 * k.ovl);
  if (diffCity) score -= 0.25;
  return score >= 0.5 ? score : 0;
}

// ---------------------------------------------------------------- assignment
export const eventIdFor = (storyId) => `e${hashId(`ev:${storyId}`, 9)}`;

/**
 * Give every story an event id (`s.ev`). Stories that already have one keep it (when that event is
 * still known); the rest are matched in time order against the stories already placed. Returns
 * the merges performed: [[fromId, intoId], …].
 */
export function assignEvents(stories, { known = new Set(), geo = null, feats = null, trace = null } = {}) {
  const F = feats || new Map(stories.map((s) => [s.id, features(s, geo)]));
  const idf = idfTables([...F.values()]);
  const byCc = new Map(); // cc -> placed features (blocking: only compare plausible pairs)
  const members = new Map(); // event id -> stories
  const place = (f) => {
    for (const cc of f.ccs.size ? f.ccs : ['-']) {
      if (!byCc.has(cc)) byCc.set(cc, []);
      byCc.get(cc).push(f);
    }
    if (!members.has(f.s.ev)) members.set(f.s.ev, []);
    members.get(f.s.ev).push(f.s);
  };
  const fresh = [];
  for (const s of [...stories].sort((a, b) => a.time - b.time)) {
    if (s.ev && known.has(s.ev)) place(F.get(s.id));
    else fresh.push(s);
  }
  const merges = [];
  const alias = new Map();
  const resolve = (id) => {
    while (alias.has(id)) id = alias.get(id);
    return id;
  };
  for (const s of fresh) {
    const f = F.get(s.id);
    const scores = new Map(); // event -> best score with any of its reports
    const via = new Map();
    const seen = new Set();
    for (const cc of f.ccs.size ? [...f.ccs, '-'] : ['-', ...byCc.keys()]) {
      for (const g of byCc.get(cc) || []) {
        if (seen.has(g)) continue;
        seen.add(g);
        const sc = similarity(f, g, idf);
        if (!sc) continue;
        const ev = resolve(g.s.ev);
        if (sc > (scores.get(ev) || 0)) {
          scores.set(ev, sc);
          via.set(ev, g.s);
        }
      }
    }
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) {
      s.ev = eventIdFor(s.id);
    } else {
      // a report that clearly matches two events shows they are the same event
      let into = ranked[0][0];
      for (const [other, sc] of ranked.slice(1)) {
        if (sc < 0.62) break;
        const a = members.get(into) || [];
        const b = members.get(other) || [];
        // keep the id people may already have seen (links, "since your last visit"), else the bigger
        const keep = known.has(into) !== known.has(other) ? (known.has(into) ? into : other) : b.length > a.length ? other : into;
        const drop = keep === into ? other : into;
        merges.push([drop, keep]);
        alias.set(drop, keep);
        for (const x of members.get(drop) || []) x.ev = keep;
        members.set(keep, [...(members.get(keep) || []), ...(members.get(drop) || [])]);
        members.delete(drop);
        into = keep;
      }
      s.ev = into;
      if (trace) trace.push([s, via.get(ranked[0][0]), ranked[0][1]]);
    }
    place(f);
  }
  // stories placed before a merge may still point at the merged-away id
  for (const s of stories) s.ev = resolve(s.ev);
  return { merges, members, feats: F, idf };
}

// ---------------------------------------------------------------- event records
// What an event remembers across runs, also after its reports have left the 48-hour window:
//   f/l first and last report time, sn first seen by the pipeline, n reports,
//   os {org: first report time}, ss {source: reports}, dv {org: highest death toll it reported},
//   cv/sv/lv/rv votes for category, subtype, place [weight, best confidence, why] and countries,
//   fr the first report, tl timeline nodes, hza the linked alert's last level.

const QUALITY = { agency: 1, broadcaster: 1, newspaper: 0.95, un: 0.9, state: 0.5 };
const GAP_CATS = new Set(['conflict', 'disaster', 'unrest', 'society']);
const LC_WEIGHT = { 3: 3, 2: 1.5, 1: 0.5, 0: 0.3 };
const SPREAD_STEPS = [3, 5, 10, 20];
const MAX_NODES = 20;
const r2 = (x) => Math.round(x * 100) / 100;

const snap = (s) => ({ t: s.time, id: s.id, s: s.source, h: s.title, l: s.lang, u: s.url });

function newRecord(id, s) {
  return { id, f: s.time, l: s.time, sn: s.seen ?? s.time, n: 0, os: {}, ss: {}, dv: {}, cv: {}, sv: {}, lv: {}, rv: {}, fr: snap(s) };
}

const add = (o, k, v) => (o[k] = r2((o[k] || 0) + v));

/** Count a newly assigned report into its event (and note timeline-worthy changes). */
function addReport(rec, s, src) {
  const org = src?.org || s.source;
  const orgsBefore = Object.keys(rec.os).length;
  const tollBefore = Math.max(0, ...Object.values(rec.dv));
  rec.n++;
  if (s.time < rec.f) {
    rec.f = s.time;
    rec.fr = snap(s);
  }
  rec.l = Math.max(rec.l, s.time);
  rec.sn = Math.min(rec.sn, s.seen ?? s.time);
  if (!(org in rec.os) || s.time < rec.os[org]) rec.os[org] = s.time;
  rec.ss[s.source] = (rec.ss[s.source] || 0) + 1;
  if (s.deaths) rec.dv[org] = Math.max(rec.dv[org] || 0, s.deaths);
  const w = src?.kind === 'state' ? 0.5 : 1;
  add(rec.cv, s.cat, w);
  if (s.sub) add(rec.sv, `${s.cat}/${s.sub}`, w);
  if (s.loc?.id) {
    const lc = s.lc ?? 2;
    const cur = rec.lv[s.loc.id] || [0, 0, ''];
    rec.lv[s.loc.id] = [r2(cur[0] + LC_WEIGHT[lc] * w), Math.max(cur[1], lc), lc > cur[1] ? s.lw || '' : cur[2]];
  }
  for (const cc of s.rel || []) rec.rv[cc] = (rec.rv[cc] || 0) + 1;
  timelineOnAdd(rec, s, { orgsBefore, tollBefore });
}

// ---------------------------------------------------------------- timeline
// Nodes for events that more than one outlet reports: the first report, every rise in the death
// toll, the moments it spread (3, 5, 10, 20 independent outlets), and new developments at most every
// six hours. Alert-level changes of a linked hazard are added when hazards are linked.
function timelineOnAdd(rec, s, { orgsBefore, tollBefore }) {
  const orgs = Object.keys(rec.os).length;
  if (!rec.tl) {
    if (orgs < 2 && rec.n < 3) return;
    rec.tl = [{ ...rec.fr, k: 'first' }];
    if (rec.fr.id === s.id) return;
  }
  const tl = rec.tl;
  const last = tl[tl.length - 1];
  const node = { ...snap(s) };
  if (s.deaths && s.deaths >= tollBefore + 2 && s.deaths >= tollBefore * 1.15) {
    tl.push({ ...node, k: 'toll', d: s.deaths });
  } else if (SPREAD_STEPS.some((n) => orgsBefore < n && orgs >= n)) {
    tl.push({ ...node, k: 'spread', n: orgs });
  } else if (s.time - last.t >= 6 * H && novel(s, tl)) {
    tl.push({ ...node, k: 'update' });
  } else return;
  tl.sort((a, b) => a.t - b.t);
  trimTimeline(tl);
}

function novel(s, tl) {
  const mine = titleTokens(s.title, s.lang);
  for (const n of tl.slice(-3)) {
    if (n.l !== s.lang) continue;
    const theirs = titleTokens(n.h, n.l);
    let inter = 0;
    for (const t of mine) if (theirs.has(t)) inter++;
    if (inter / (mine.size + theirs.size - inter || 1) >= 0.45) return false;
  }
  return true;
}

function trimTimeline(tl) {
  while (tl.length > MAX_NODES) {
    // drop the oldest routine update that is not the first or the newest node
    const i = tl.findIndex((n, j) => n.k === 'update' && j > 0 && j < tl.length - 1);
    tl.splice(i >= 0 ? i : 1, 1);
  }
}

function mergeRecords(keep, drop) {
  keep.f = Math.min(keep.f, drop.f);
  if (drop.fr && drop.fr.t < keep.fr.t) keep.fr = drop.fr;
  keep.l = Math.max(keep.l, drop.l);
  keep.sn = Math.min(keep.sn, drop.sn);
  keep.n += drop.n;
  for (const [o, t] of Object.entries(drop.os)) if (!(o in keep.os) || t < keep.os[o]) keep.os[o] = t;
  for (const [k, v] of Object.entries(drop.ss)) keep.ss[k] = (keep.ss[k] || 0) + v;
  for (const [k, v] of Object.entries(drop.dv)) keep.dv[k] = Math.max(keep.dv[k] || 0, v);
  for (const key of ['cv', 'sv', 'rv']) for (const [k, v] of Object.entries(drop[key])) add(keep[key], k, v);
  for (const [k, v] of Object.entries(drop.lv)) {
    const cur = keep.lv[k] || [0, 0, ''];
    keep.lv[k] = [r2(cur[0] + v[0]), Math.max(cur[1], v[1]), v[1] > cur[1] ? v[2] : cur[2]];
  }
  if (drop.tl || keep.tl) {
    const tl = [...(keep.tl || [{ ...keep.fr, k: 'first' }]), ...(drop.tl || [{ ...drop.fr, k: 'first' }])].sort((a, b) => a.t - b.t);
    const seen = new Set();
    keep.tl = tl.filter((n, i) => {
      if (seen.has(n.id + n.k)) return false;
      seen.add(n.id + n.k);
      if (n.k === 'first' && i > 0) n.k = 'update';
      return true;
    });
    trimTimeline(keep.tl);
  }
}

// ---------------------------------------------------------------- scores
// Severity is about the event itself (what happened, how many died, official alert levels) and
// does not grow with coverage. Attention is about coverage (independent outlets, how widely, how
// fast). Ranking uses both, led by severity, so a severe event few outlets cover still ranks.
export const BASE_SEVERITY = { conflict: 0.55, disaster: 0.5, unrest: 0.45, society: 0.36, diplomacy: 0.34, politics: 0.3, economy: 0.28, science: 0.2, other: 0.2 };

export function deathsBonus(d) {
  return d >= 1000 ? 0.38 : d >= 100 ? 0.3 : d >= 50 ? 0.25 : d >= 10 ? 0.18 : d >= 1 ? 0.1 : 0;
}

/** Severity implied by an official alert: USGS magnitude/PAGER, GDACS level, EONET storm strength. */
export function hazardSeverity(h) {
  if (!h) return 0;
  if (h.mag != null) {
    let s = h.mag >= 7.5 ? 0.9 : h.mag >= 7 ? 0.82 : h.mag >= 6.5 ? 0.72 : h.mag >= 6 ? 0.62 : h.mag >= 5.5 ? 0.5 : 0.4;
    s = Math.max(s, { red: 0.95, orange: 0.85, yellow: 0.7 }[h.alert] || 0);
    return Math.min(1, s + (h.tsunami ? 0.05 : 0));
  }
  if (h.alert) return { red: 0.85, orange: 0.68, green: 0.42 }[h.alert] || 0.4;
  const kts = /(\d+)\s*kts/.exec(h.severity || '');
  if (h.type === 'storm' && kts) return Number(kts[1]) >= 100 ? 0.7 : Number(kts[1]) >= 64 ? 0.6 : 0.45;
  return { volcano: 0.5, storm: 0.45, flood: 0.45 }[h.type] || 0.35;
}

const argmax = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

function pickPlace(lv, placeById) {
  const byCc = new Map();
  let total = 0;
  for (const [id, [w]] of Object.entries(lv)) {
    const p = placeById(id);
    const cc = p?.cc && !['XS', 'XR', 'XO'].includes(p.cc) ? p.cc : id;
    byCc.set(cc, (byCc.get(cc) || 0) + w);
    total += w;
  }
  if (!byCc.size) return null;
  const [cc, cw] = [...byCc.entries()].sort((a, b) => b[1] - a[1])[0];
  let best = null;
  let bw = -1;
  let country = null;
  for (const [id, v] of Object.entries(lv)) {
    const p = placeById(id);
    const pcc = p?.cc && !['XS', 'XR', 'XO'].includes(p.cc) ? p.cc : id;
    if (pcc !== cc) continue;
    if (p?.kind === 'country') country = id;
    else if (v[0] > bw) {
      bw = v[0];
      best = id;
    }
  }
  // a specific place wins when a fair share of the reports name it (Peshawar over "Pakistan")
  const id = best && (bw >= 0.25 * cw || !country) ? best : country || best;
  const [, lc, why] = lv[id];
  return { id, lc, why, mixed: cw < 0.6 * total };
}

/**
 * Everything the interface shows about an event, from its record and the reports still in the
 * window. `src(id)` gives source metadata, `placeById(id)` the gazetteer place.
 */
export function deriveEvent(rec, reports, { now, src, placeById, hazard = null }) {
  const cat = argmax(rec.cv) || 'other';
  const subKey = argmax(Object.fromEntries(Object.entries(rec.sv).filter(([k]) => k.startsWith(`${cat}/`))));
  const sub = subKey ? subKey.split('/')[1] : null;
  const where = pickPlace(rec.lv, placeById);
  const orgs = Object.keys(rec.os);
  const orgMeta = new Map();
  for (const sid of Object.keys(rec.ss)) {
    const m = src(sid);
    const o = m?.org || sid;
    if (!orgMeta.has(o)) orgMeta.set(o, m);
  }
  // wire copy: different outlets running the same agency headline are one voice
  const parent = new Map(orgs.map((o) => [o, o]));
  const find = (o) => (parent.get(o) === o ? o : find(parent.get(o)));
  const byTitle = new Map();
  for (const r of reports) {
    const key = r.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const o = src(r.source)?.org || r.source;
    if (byTitle.has(key)) parent.set(find(o), find(byTitle.get(key)));
    else byTitle.set(key, o);
  }
  const voices = new Set(orgs.map(find)).size;
  const kinds = [0, 0, 0, 0, 0]; // agency, broadcaster, newspaper, un, state
  const KIDX = { agency: 0, broadcaster: 1, newspaper: 2, un: 3, state: 4 };
  const regions = new Set();
  const loc = where ? placeById(where.id) : null;
  const evCc = loc?.cc;
  let local = 0;
  let state = 0;
  for (const o of orgs) {
    const m = orgMeta.get(o);
    if (!m) continue;
    kinds[KIDX[m.kind] ?? 2]++;
    regions.add(m.region);
    if (m.kind === 'state') state++;
    if (evCc && (m.homeCc || [m.country]).includes(evCc)) local++;
  }
  // death toll: the highest any outlet reported, and how many outlets reported a similar number
  const tolls = Object.values(rec.dv);
  const dmax = Math.max(0, ...tolls);
  const dc = tolls.filter((d) => d >= dmax * 0.6).length;

  // severity
  const why = [];
  let sevD = (BASE_SEVERITY[cat] ?? 0.2) + deathsBonus(dmax);
  if (cat === 'conflict' && (sub === 'ceasefire' || sub === 'military')) sevD -= 0.1;
  if (cat === 'disaster' && sub === 'quake') sevD += 0.05;
  const sevs = reports.map((r) => r.sev).sort((a, b) => a - b);
  const p75 = sevs.length ? sevs[Math.min(sevs.length - 1, Math.floor(sevs.length * 0.75))] : sevD;
  const hz = hazardSeverity(hazard);
  let sev = Math.max(p75, sevD, hz);
  if (dmax) why.push(`d:${dmax}`);
  if (sub) why.push(`t:${sub}`);
  if (hazard?.mag != null) why.push(`q:${hazard.mag.toFixed(1)}`);
  else if (hazard?.alert) why.push(`a:${hazard.alert}`);
  if (p75 > sevD + 0.04 && p75 >= hz) why.push('k');
  sev = r2(Math.min(1, Math.max(0.1, sev)));

  // attention
  const attBase = Math.log(1 + voices) / Math.log(13);
  const att = r2(Math.min(1, Math.max(0.05, attBase + Math.min(0.15, 0.05 * (regions.size - 1)) - (local === orgs.length && voices <= 2 ? 0.08 : 0))));
  const r6 = reports.filter((r) => now - r.time <= 6 * H).length;
  const p6 = reports.filter((r) => now - r.time > 6 * H && now - r.time <= 12 * H).length;
  const o6 = Object.values(rec.os).filter((t) => now - t <= 6 * H).length;
  const tr = (r6 >= 3 && r6 >= 2 * p6 + 1) || (o6 >= 3 && orgs.length > o6) ? 'up' : p6 >= 3 && r6 === 0 ? 'down' : null;

  const stateOnly = state > 0 && state === orgs.length;
  const rec18 = Math.max(0.15, Math.pow(0.5, Math.max(0, now - rec.l) / (18 * H)));
  const cred = stateOnly ? 0.55 : voices === 1 ? 0.85 : 1;
  const imp = Math.round(sev * (0.4 + 0.6 * att) * rec18 * cred * 1000) / 1000;
  // "severe but overlooked" needs hard evidence of severity, not just alarming words
  const strong = dmax >= 10 || hazard?.alert === 'red' || hazard?.alert === 'orange' || hazard?.mag >= 6 || sev >= 0.8;
  const gap = strong && sev >= 0.62 && voices <= 2 && !stateOnly && now - rec.l <= 48 * H;

  // the headline to show: a recent report from a strong source, per language
  const leadScore = (r) => {
    const m = src(r.source);
    let q = QUALITY[m?.kind] ?? 0.9;
    if (/^(?:watch|live|video|podcast|listen|photos?)\b/i.test(r.title) || /podcast$|as it happened$/i.test(r.title)) q *= 0.6;
    if (r.title.length < 22) q *= 0.8;
    if (/\d/.test(r.title)) q *= 1.12;
    return q * Math.pow(0.5, Math.max(0, rec.l - r.time) / (8 * H));
  };
  const best = (list) => list.reduce((a, b) => (!a || leadScore(b) > leadScore(a) ? b : a), null);
  const lead = best(reports);
  const lz = best(reports.filter((r) => r.lang === 'zh'));
  const le = best(reports.filter((r) => r.lang !== 'zh'));
  const relCc = Object.entries(rec.rv).filter(([cc]) => cc !== evCc).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cc]) => cc);

  const out = {
    id: rec.id,
    cat,
    sub,
    loc: where?.id ?? null,
    lc: where ? (where.mixed ? Math.max(1, where.lc - 1) : where.lc) : 0,
    lw: where ? (where.mixed ? 'x' : where.why) : '',
    f: rec.f,
    l: rec.l,
    sn: rec.sn,
    n: rec.n,
    nw: reports.length,
    o: orgs.length,
    v: voices,
    kd: kinds,
    rg: regions.size,
    lo: local,
    sev,
    sw: why,
    att,
    imp,
    r6,
  };
  if (dmax) Object.assign(out, { d: dmax, dc });
  if (gap) out.gap = 1;
  if (tr) out.tr = tr;
  if (stateOnly) out.so = 1;
  if (lead) out.ld = lead.id;
  if (lz && lz !== lead) out.lz = lz.id;
  if (le && le !== lead) out.le = le.id;
  if (relCc.length) out.rel = relCc;
  if (hazard) out.hz = hazard.id;
  if (rec.tl?.length > 1) out.tl = rec.tl;
  // titles kept for the archive, after the reports themselves have expired
  out.ti = {};
  if (le || (lead && lead.lang !== 'zh')) out.ti.en = (le || lead).title;
  if (lz || (lead && lead.lang === 'zh')) out.ti.zh = (lz || lead).title;
  return out;
}

// ---------------------------------------------------------------- hazards ↔ events
const RAD = Math.PI / 180;
export function km(aLat, aLng, bLat, bLng) {
  const s = Math.sin(((bLat - aLat) * RAD) / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(((bLng - aLng) * RAD) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(s)));
}
const HAZ_SUB = { quake: 'quake', storm: 'storm', flood: 'flood', volcano: 'volcano', fire: 'fire', landslide: 'landslide', tsunami: 'quake' };

/** The official alert an event is about: same kind of hazard, nearby, at the right time (storms by name). */
export function findHazard(ev, reports, { quakes, hazards, placeById }) {
  if (ev.cat !== 'disaster' || !ev.loc) return null;
  const p = placeById(ev.loc);
  if (!p) return null;
  const titles = reports.map((r) => r.title).join(' \n ');
  let best = null;
  let bs = 0;
  if (ev.sub === 'quake') {
    for (const q of quakes || []) {
      if (q.time > ev.l + H || q.time < ev.f - 3 * DAY) continue;
      const d = km(p.lat, p.lng, q.lat, q.lng);
      const reach = p.kind === 'country' ? 1500 : 700;
      if (d > reach) continue;
      const magNamed = titles.includes(q.mag.toFixed(1));
      if (q.mag < 5.5 && !magNamed) continue; // small quakes are rarely what a story is about
      const sc = q.mag + (magNamed ? 3 : 0) - d / reach;
      if (sc > bs) {
        bs = sc;
        best = q;
      }
    }
    return best;
  }
  for (const h of hazards || []) {
    if (HAZ_SUB[h.type] !== ev.sub || h.time > ev.l + DAY || (h.until || h.time) < ev.f - 5 * DAY) continue;
    const name = /\b(?:cyclone|typhoon|hurricane|storm)\s+([A-Z][A-Za-z]+)|\b([A-Z]{3,})-\d\d\b/.exec(h.title);
    const nm = name && (name[1] || name[2]);
    const named = nm && new RegExp(`\\b${nm}\\b`, 'i').test(titles);
    const d = km(p.lat, p.lng, h.lat, h.lng);
    const reach = h.type === 'storm' ? 1500 : h.type === 'drought' ? 2500 : 600;
    if (!named && d > reach) continue;
    const sc = (named ? 5 : 0) + ({ red: 3, orange: 2, green: 1 }[h.alert] || 0.5) - d / reach;
    if (sc > bs) {
      bs = sc;
      best = h;
    }
  }
  return best;
}

// ---------------------------------------------------------------- one pipeline run
/**
 * Update the event state with this run's stories.
 *   stories     the 48-hour window (each gets `ev`)
 *   state       previous state: { events: [record], aliases: {from: [to, time]} }
 * Returns { events (derived, with reports in the window), archive (derived, recent past),
 *           state (to keep for the next run), aliases (for the site: old id -> current id) }.
 */
export function buildEvents({ stories, state, now, geo, src, placeById, quakes = [], hazards = [] }) {
  const records = new Map((state?.events || []).map((r) => [r.id, r]));
  const aliases = new Map(Object.entries(state?.aliases || {}).filter(([, [, t]]) => now - t <= ARCHIVE_DAYS * DAY));
  const resolve = (id) => {
    for (let i = 0; i < 10 && aliases.has(id); i++) id = aliases.get(id)[0];
    return id;
  };
  for (const s of stories) if (s.ev) s.ev = resolve(s.ev);
  const known = new Set(records.keys());
  const before = new Map(stories.map((s) => [s.id, s.ev && known.has(s.ev) ? s.ev : null]));
  const { merges, members } = assignEvents(stories, { known, geo });

  for (const [drop, keep] of merges) {
    const a = records.get(keep);
    const b = records.get(drop);
    if (b && a) mergeRecords(a, b);
    else if (b) records.set(keep, Object.assign(b, { id: keep }));
    records.delete(drop);
    if (known.has(drop)) aliases.set(drop, [keep, now]);
  }
  for (const [from, [to]] of aliases) if (aliases.has(to)) aliases.set(from, [resolve(to), aliases.get(from)[1]]);

  // count reports that are new to their event, oldest first (merged ones were counted already)
  const fresh = stories.filter((s) => !before.get(s.id)).sort((a, b) => a.time - b.time);
  for (const s of fresh) {
    if (!records.has(s.ev)) records.set(s.ev, newRecord(s.ev, s));
    addReport(records.get(s.ev), s, src(s.source));
  }

  const events = [];
  const archive = [];
  const linked = new Map();
  for (const rec of records.values()) {
    const reports = members.get(rec.id) || [];
    if (!reports.length) {
      // gone from the window: keep notable events for timelines and "since your last visit"
      if (now - rec.l > ARCHIVE_DAYS * DAY || !rec.d || !(rec.d.v >= 2 || rec.d.sev >= 0.6 || rec.n >= 3)) {
        records.delete(rec.id);
        continue;
      }
      archive.push(rec.d);
      continue;
    }
    let ev = deriveEvent(rec, reports, { now, src, placeById });
    const hz = findHazard(ev, reports, { quakes, hazards, placeById });
    if (hz) {
      ev = deriveEvent(rec, reports, { now, src, placeById, hazard: hz });
      linked.set(hz.id, ev);
      const level = hz.alert || null;
      if (rec.hza !== undefined && level && level !== rec.hza && rec.tl) {
        rec.tl.push({ t: now, k: 'alert', a: level, s: hz.source || 'usgs', h: hz.title || hz.place || '', u: hz.url, id: hz.id });
        trimTimeline(rec.tl);
        ev.tl = rec.tl;
      }
      rec.hza = level;
    }
    rec.d = ev;
    events.push(ev);
  }
  // "Severe but overlooked" is about places as well as events: a single feature story from Gaza is
  // not overlooked, a massacre in South Sudan that one outlet reports is.
  const coverage = new Map();
  for (const ev of events) {
    const cc = placeById(ev.loc)?.cc || ev.loc;
    if (!coverage.has(cc)) coverage.set(cc, new Set());
    for (const o of Object.keys(records.get(ev.id)?.os || {})) coverage.get(cc).add(o);
  }
  for (const ev of events) {
    if (!ev.gap) continue;
    const cc = placeById(ev.loc)?.cc || ev.loc;
    const wellCovered = (coverage.get(cc)?.size || 0) >= 7 && ev.sev < 0.8;
    if (wellCovered || !GAP_CATS.has(ev.cat)) delete ev.gap;
  }
  // hazards learn how much coverage they get (for "severe but overlooked")
  for (const h of [...quakes, ...hazards]) {
    const ev = linked.get(h.id);
    if (ev) {
      h.ev = ev.id;
      h.v = ev.v;
    }
  }
  events.sort((a, b) => b.imp - a.imp);
  archive.sort((a, b) => b.l - a.l);
  const aliasOut = Object.fromEntries([...aliases].map(([k, [v]]) => [k, v]));
  return {
    events,
    archive,
    aliases: aliasOut,
    state: { version: 1, events: [...records.values()], aliases: Object.fromEntries(aliases) },
  };
}
