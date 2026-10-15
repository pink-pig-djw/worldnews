import COUNTRIES from './countries.json';
import { CAT, FRESH_S } from '../config.js';
import { getLang } from '../i18n.js';

const PSEUDO = new Set(['XS', 'XR', 'XO']);
export const isRealCc = (cc) => cc && !PSEUDO.has(cc);

export function countryName(cc) {
  const c = COUNTRIES[cc];
  if (!c) return cc || '';
  return getLang() === 'zh' ? c[1] : c[0];
}
export const countryInfo = (cc) => {
  const c = COUNTRIES[cc];
  return c ? { en: c[0], zh: c[1], lat: c[2], lng: c[3], sub: c[4] } : null;
};
export const allCountries = () => Object.keys(COUNTRIES).filter((cc) => isRealCc(cc) && cc !== 'EU');

export function flag(cc) {
  if (!cc || cc.length !== 2 || !/^[A-Z]{2}$/.test(cc) || cc === 'EU') return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function placeName(p) {
  if (!p) return '';
  const zh = getLang() === 'zh';
  if (p.kind === 'country' && isRealCc(p.cc)) return countryName(p.cc);
  return (zh ? p.zh || p.name : p.name || p.zh) || countryName(p.cc);
}

/** Some outlets count less (e.g. state media reporting on other countries); see scripts/lib/sources.mjs. */
export function sourceFactor(s, src) {
  const w = src?.weight;
  if (!w) return 1;
  return (src.homeCc || [src.country]).includes(s.loc?.cc) ? w.home : w.foreign;
}

/** Importance of a story right now: severity, breadth of coverage, recency and source weight. */
export function storyWeight(s, now, src) {
  const ageH = Math.max(0, (now - s.time) / 3600);
  const decay = Math.max(0.15, Math.pow(0.5, ageH / 18));
  return s.sev * (1 + 0.35 * ((s.coverage || 1) - 1)) * decay * sourceFactor(s, src);
}

export class Store {
  constructor() {
    this.raw = null;
    this.filters = { cats: new Set(Object.keys(CAT)), windowHours: 48, lang: 'all', disabledSources: new Set() };
    this.listeners = new Set();
    this.derived = null;
    this.arrived = new Map(); // story id -> when it showed up while this page was open (s)
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason) {
    this.derived = null;
    for (const fn of this.listeners) fn(reason);
  }

  /** Replace the data set; returns the stories that were not in the previous one. */
  setData(raw) {
    const prevIds = this.raw ? new Set(this.raw.stories.map((s) => s.id)) : null;
    this.raw = raw;
    this.sourceById = new Map((raw.sources || []).map((s) => [s.id, s]));
    const added = prevIds ? raw.stories.filter((s) => !prevIds.has(s.id)) : [];
    const now = this.now;
    for (const s of added) this.arrived.set(s.id, now);
    for (const [id, at] of this.arrived) if (now - at > FRESH_S) this.arrived.delete(id);
    // the pipeline's first-seen times; a fresh rolling store (first run, lost cache) stamps every
    // story with the same time, which must not light up the whole map as "new"
    this.firstSeen = Math.min(now, ...raw.stories.map((s) => s.seen || now));
    this.emit('data');
    return added;
  }

  /** Arrived in the last FRESH_S seconds: while the page was open, or per the pipeline's first-seen time. */
  isFresh(s, now = this.now) {
    const at = this.arrived.get(s.id);
    if (at && now - at < FRESH_S) return true;
    return Boolean(s.seen) && now - s.seen < FRESH_S && s.seen - this.firstSeen > 3600 && now - s.time < 6 * 3600;
  }

  /** Time moves on: drop "new" flags that have expired (re-renders only when something changed). */
  expireFresh() {
    const v = this.derived;
    if (v?.freshCount && v.stories.some((s) => s.fresh && !this.isFresh(s))) this.emit('time');
  }

  setFilter(patch) {
    Object.assign(this.filters, patch);
    this.emit('filter');
  }

  get now() {
    return Date.now() / 1000;
  }

  source(id) {
    return this.sourceById?.get(id) || { id, name: id, zh: id };
  }

  /** Everything the views need, recomputed lazily after data/filter changes. */
  get view() {
    if (this.derived) return this.derived;
    const now = this.now;
    const { cats, windowHours, lang, disabledSources } = this.filters;
    const minTime = now - windowHours * 3600;
    const stories = (this.raw?.stories || []).filter(
      (s) => s.time >= minTime && cats.has(s.cat) && (lang === 'all' || s.lang === lang) && !disabledSources.has(s.source),
    );
    for (const s of stories) {
      s.w = storyWeight(s, now, this.sourceById?.get(s.source));
      s.fresh = this.isFresh(s, now);
    }

    // places
    const places = new Map();
    for (const s of stories) {
      if (!s.loc) continue;
      let p = places.get(s.loc.id);
      if (!p) {
        p = { ...s.loc, stories: [], score: 0, count: 0, cats: {}, latest: 0, maxSev: 0, sources: new Set(), fresh: 0 };
        places.set(s.loc.id, p);
      }
      p.stories.push(s);
      p.score += s.w;
      p.count++;
      p.cats[s.cat] = (p.cats[s.cat] || 0) + s.w;
      p.latest = Math.max(p.latest, s.time);
      p.maxSev = Math.max(p.maxSev, s.sev);
      p.sources.add(s.source);
      if (s.fresh) p.fresh++;
    }
    for (const p of places.values()) {
      p.topCat = Object.entries(p.cats).sort((a, b) => b[1] - a[1])[0][0];
      p.breaking = now - p.latest < 3600;
      p.stories.sort((a, b) => b.w - a.w);
    }
    const placeList = [...places.values()].sort((a, b) => b.score - a.score);

    // countries (by location country) + trend over the last 12 h vs the 12 h before
    const countries = new Map();
    for (const s of stories) {
      const cc = s.loc?.cc;
      if (!isRealCc(cc)) continue;
      let c = countries.get(cc);
      if (!c) countries.set(cc, (c = { cc, score: 0, count: 0, cats: {}, recent: 0, before: 0, latest: 0 }));
      c.score += s.w;
      c.count++;
      c.cats[s.cat] = (c.cats[s.cat] || 0) + 1;
      c.latest = Math.max(c.latest, s.time);
      const age = now - s.time;
      if (age < 12 * 3600) c.recent++;
      else if (age < 24 * 3600) c.before++;
    }
    for (const c of countries.values()) c.topCat = Object.entries(c.cats).sort((a, b) => b[1] - a[1])[0][0];
    const countryList = [...countries.values()].sort((a, b) => b.score - a.score);
    // Feeds only list recent items, so a 12 h-vs-previous-12 h trend is meaningful only once the
    // rolling store has really been collecting for a day.
    const trendsReliable = now - (this.firstSeen ?? now) >= 24 * 3600;

    // arcs between countries mentioned together and the event location
    const arcMap = new Map();
    for (const s of stories) {
      if (!s.loc || !s.rel?.length) continue;
      for (const cc of s.rel) {
        const ci = countryInfo(cc);
        if (!ci || !isRealCc(cc) || cc === s.loc.cc) continue;
        const key = `${cc}>${s.loc.id}`;
        let a = arcMap.get(key);
        if (!a) arcMap.set(key, (a = { id: key, from: cc, to: s.loc.id, startLat: ci.lat, startLng: ci.lng, endLat: s.loc.lat, endLng: s.loc.lng, weight: 0, count: 0, cats: {} }));
        a.weight += s.w;
        a.count++;
        a.cats[s.cat] = (a.cats[s.cat] || 0) + s.w;
      }
    }
    const arcs = [...arcMap.values()].sort((a, b) => b.weight - a.weight).slice(0, 48);
    for (const a of arcs) a.cat = Object.entries(a.cats).sort((x, y) => y[1] - x[1])[0][0];

    // headline clusters: one row per event, best-covered first
    const clusters = new Map();
    for (const s of stories) {
      const key = s.cluster || s.id;
      let c = clusters.get(key);
      if (!c) clusters.set(key, (c = { id: key, lead: s, items: [], w: 0, time: 0 }));
      c.items.push(s);
      c.w = Math.max(c.w, s.w);
      c.time = Math.max(c.time, s.time);
      if (s.w > c.lead.w) c.lead = s;
    }
    const headlines = [...clusters.values()];

    const freshCount = stories.filter((s) => s.fresh).length;
    this.derived = { now, stories, places: placeList, placeById: places, countries: countryList, countryById: countries, arcs, headlines, trendsReliable, freshCount };
    return this.derived;
  }

  storiesForCountry(cc) {
    const v = this.view;
    const located = v.stories.filter((s) => s.loc?.cc === cc).sort((a, b) => b.w - a.w);
    const involving = v.stories.filter((s) => s.loc?.cc !== cc && s.rel?.includes(cc)).sort((a, b) => b.w - a.w);
    return { located, involving };
  }

  /** stories per 4-hour bucket over the window, for a mini histogram */
  histogram(stories, hours = 48, bucket = 4) {
    const n = Math.ceil(hours / bucket);
    const out = new Array(n).fill(0);
    const now = this.now;
    for (const s of stories) {
      const i = Math.floor((now - s.time) / 3600 / bucket);
      if (i >= 0 && i < n) out[n - 1 - i]++;
    }
    return out;
  }
}

export const store = new Store();
