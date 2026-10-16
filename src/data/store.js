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

const KIND_INDEX = { agency: 0, broadcaster: 1, newspaper: 2, un: 3, state: 4 };

/**
 * How much an event matters right now. Severity leads (what happened), attention modulates (how
 * many independent outlets report it), recency decays, unconfirmed single-source and state-only
 * events count less. The same formula as the pipeline's, re-evaluated as time passes.
 */
export function eventWeight(e, now) {
  const rec = Math.max(0.15, Math.pow(0.5, Math.max(0, now - e.l) / (18 * 3600)));
  const cred = e.so ? 0.55 : e.v === 1 ? 0.85 : 1;
  return e.sev * (0.4 + 0.6 * e.att) * rec * cred;
}

/** 1–4 for display: how many independent outlets report an event. */
export const attentionLevel = (e) => (e.v >= 8 ? 4 : e.v >= 4 ? 3 : e.v >= 2 ? 2 : 1);

export class Store {
  constructor() {
    this.raw = null;
    this.filters = { cats: new Set(Object.keys(CAT)), windowHours: 48, lang: 'all', disabledSources: new Set() };
    this.listeners = new Set();
    this.derived = null;
    this.arrived = new Map(); // story id -> when it showed up while this page was open (s)
    this.events = [];
    this.eventById = new Map();
    this.storyById = new Map();
    this.aliases = new Map();
    this.placeIndex = new Map();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason) {
    this.derived = null;
    for (const fn of this.listeners) fn(reason);
  }

  /** Replace the data set; returns what is new compared with the previous one. */
  setData(raw) {
    const prevIds = this.raw ? new Set(this.raw.stories.map((s) => s.id)) : null;
    const prevEvents = this.raw ? new Map(this.events.map((e) => [e.id, e.n])) : null;
    this.raw = raw;
    this.sourceById = new Map((raw.sources || []).map((s) => [s.id, s]));
    this.hydrate(raw);
    const added = prevIds ? raw.stories.filter((s) => !prevIds.has(s.id)) : [];
    const now = this.now;
    for (const s of added) this.arrived.set(s.id, now);
    for (const [id, at] of this.arrived) if (now - at > FRESH_S) this.arrived.delete(id);
    // the pipeline's first-seen times; a fresh rolling store (first run, lost cache) stamps every
    // story with the same time, which must not light up the whole map as "new"
    this.firstSeen = Math.min(now, ...raw.stories.map((s) => s.seen || now));
    const newEvents = prevEvents ? this.events.filter((e) => !prevEvents.has(e.id) && !prevEvents.has(this.aliasOf(e.id))) : [];
    const grown = prevEvents ? this.events.filter((e) => prevEvents.has(e.id) && e.n > prevEvents.get(e.id)) : [];
    this.emit('data');
    return { added, newEvents, grown };
  }

  /** Places, stories and events as linked objects. Older data files (no events) get one event per report. */
  hydrate(raw) {
    const dict = raw.places || {};
    const P = new Map();
    const place = (id) => {
      if (!id) return null;
      if (typeof id === 'object') return id;
      let p = P.get(id);
      if (!p && dict[id]) {
        const a = dict[id];
        p = { id, name: a[0], zh: a[1], cc: a[2], lat: a[3], lng: a[4], kind: a[5] };
        P.set(id, p);
      }
      return p || null;
    };
    this.placeIndex = P;
    this.storyById = new Map();
    for (const s of raw.stories) {
      s.loc = place(s.loc);
      if (this.source(s.source).kind === 'state') s.state = true;
      this.storyById.set(s.id, s);
    }
    if (!raw.events) {
      raw.events = raw.stories.map((s) => {
        s.ev = `e${s.id}`;
        return { id: s.ev, ld: s.id, sev: s.sev, att: 0.27, imp: s.sev * 0.5 };
      });
    }
    const byEv = new Map();
    for (const s of raw.stories) {
      if (!s.ev) continue;
      if (!byEv.has(s.ev)) byEv.set(s.ev, []);
      byEv.get(s.ev).push(s);
    }
    this.aliases = new Map(Object.entries(raw.aliases || {}));
    this.events = [];
    this.eventById = new Map();
    for (const e of raw.events) {
      const reports = (byEv.get(e.id) || []).sort((a, b) => b.time - a.time);
      const lead = this.storyById.get(e.ld) || reports[0];
      if (!lead) continue;
      if (e.cat == null) {
        // single-report events arrive slim: their one report says the rest
        const src = this.source(lead.source);
        e.cat = lead.cat;
        e.sub = lead.sub;
        e.loc = lead.loc?.id ?? null;
        e.lc = lead.lc ?? (lead.loc ? 2 : 0);
        e.lw = lead.lw || '';
        e.f = e.l = lead.time;
        e.sn = lead.seen ?? lead.time;
        e.n = e.nw = e.o = e.v = 1;
        e.kd = [0, 0, 0, 0, 0];
        e.kd[KIND_INDEX[src.kind] ?? 2] = 1;
        e.rg = 1;
        e.lo = lead.loc && (src.homeCc || [src.country]).includes(lead.loc.cc) ? 1 : 0;
        if (src.kind === 'state') e.so = 1;
        if (lead.rel?.length) e.rel = lead.rel;
        e.sw ||= [];
      }
      e.place = place(e.loc) || lead.loc || null;
      e.reports = reports.length ? reports : [lead];
      e.lead = lead;
      e.leadZh = this.storyById.get(e.lz) || (lead.lang === 'zh' ? lead : null);
      e.leadEn = this.storyById.get(e.le) || (lead.lang !== 'zh' ? lead : null);
      this.events.push(e);
      this.eventById.set(e.id, e);
    }
  }

  /** An event id from a link or saved state, following merges. */
  aliasOf(id) {
    for (let i = 0; i < 10 && this.aliases.has(id); i++) id = this.aliases.get(id);
    return id;
  }
  event(id) {
    return this.eventById.get(id) || this.eventById.get(this.aliasOf(id)) || null;
  }
  eventOfStory(id) {
    const s = this.storyById.get(id);
    return s?.ev ? this.event(s.ev) : null;
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
    const okStory = (s) => s.time >= minTime && (lang === 'all' || s.lang === lang) && !disabledSources.has(s.source);
    const stories = (this.raw?.stories || []).filter((s) => okStory(s) && cats.has(this.event(s.ev)?.cat ?? s.cat));
    for (const s of stories) s.fresh = this.isFresh(s, now);

    // events with at least one report passing the filters
    const events = [];
    for (const e of this.events) {
      if (!cats.has(e.cat)) continue;
      const vr = e.reports.filter(okStory);
      if (!vr.length) continue;
      e.vr = vr;
      e.w = eventWeight(e, now);
      e.fresh = vr.some((s) => s.fresh);
      events.push(e);
    }
    events.sort((a, b) => b.w - a.w);

    // places: the events located there
    const places = new Map();
    for (const e of events) {
      const loc = e.place;
      if (!loc || loc.lat == null) continue;
      let p = places.get(loc.id);
      if (!p) {
        p = { ...loc, events: [], score: 0, count: 0, reports: 0, cats: {}, latest: 0, maxSev: 0, maxAtt: 0, fresh: 0, confirmed: false, approx: true };
        places.set(loc.id, p);
      }
      p.events.push(e);
      p.score += e.w;
      p.count++;
      p.reports += e.vr.length;
      p.cats[e.cat] = (p.cats[e.cat] || 0) + e.w;
      p.latest = Math.max(p.latest, e.l);
      p.maxSev = Math.max(p.maxSev, e.sev);
      p.maxAtt = Math.max(p.maxAtt, e.att);
      if (e.fresh) p.fresh++;
      if (e.v >= 2 && !e.so) p.confirmed = true;
      if (e.lc > 1) p.approx = false;
    }
    for (const p of places.values()) {
      p.topCat = Object.entries(p.cats).sort((a, b) => b[1] - a[1])[0][0];
      p.breaking = now - p.latest < 3600;
      p.lead = p.events[0];
    }
    const placeList = [...places.values()].sort((a, b) => b.score - a.score);

    // countries (by event location) + trend over the last 12 h vs the 12 h before
    const countries = new Map();
    for (const e of events) {
      const cc = e.place?.cc;
      if (!isRealCc(cc)) continue;
      let c = countries.get(cc);
      if (!c) countries.set(cc, (c = { cc, score: 0, count: 0, cats: {}, recent: 0, before: 0, latest: 0, maxSev: 0, voices: 0 }));
      c.score += e.w;
      c.count++;
      c.cats[e.cat] = (c.cats[e.cat] || 0) + e.w;
      c.latest = Math.max(c.latest, e.l);
      c.maxSev = Math.max(c.maxSev, e.sev);
      c.voices = Math.max(c.voices, e.v);
      for (const s of e.vr) {
        const age = now - s.time;
        if (age < 12 * 3600) c.recent++;
        else if (age < 24 * 3600) c.before++;
      }
    }
    for (const c of countries.values()) c.topCat = Object.entries(c.cats).sort((a, b) => b[1] - a[1])[0][0];
    const countryList = [...countries.values()].sort((a, b) => b.score - a.score);
    // Feeds only list recent items, so a 12 h-vs-previous-12 h trend is meaningful only once the
    // rolling store has really been collecting for a day.
    const trendsReliable = now - (this.firstSeen ?? now) >= 24 * 3600;

    // arcs between countries an event involves and where it happens
    const arcMap = new Map();
    for (const e of events) {
      const to = e.place;
      if (!to || !e.rel?.length) continue;
      for (const cc of e.rel) {
        const ci = countryInfo(cc);
        if (!ci || !isRealCc(cc) || cc === to.cc) continue;
        const key = `${cc}>${to.id}`;
        let a = arcMap.get(key);
        if (!a) arcMap.set(key, (a = { id: key, from: cc, to: to.id, startLat: ci.lat, startLng: ci.lng, endLat: to.lat, endLng: to.lng, weight: 0, count: 0, cats: {} }));
        a.weight += e.w;
        a.count++;
        a.cats[e.cat] = (a.cats[e.cat] || 0) + e.w;
      }
    }
    const arcs = [...arcMap.values()].sort((a, b) => b.weight - a.weight).slice(0, 48);
    for (const a of arcs) a.cat = Object.entries(a.cats).sort((x, y) => y[1] - x[1])[0][0];

    // severe events that few independent outlets report
    const gaps = events.filter((e) => e.gap).sort((a, b) => b.sev - a.sev);

    const freshCount = stories.filter((s) => s.fresh).length;
    this.derived = { now, stories, events, places: placeList, placeById: places, countries: countryList, countryById: countries, arcs, gaps, trendsReliable, freshCount };
    return this.derived;
  }

  eventsForCountry(cc) {
    const v = this.view;
    const located = v.events.filter((e) => e.place?.cc === cc);
    const involving = v.events.filter((e) => e.place?.cc !== cc && e.rel?.includes(cc));
    return { located, involving };
  }

  /** reports per 4-hour bucket over the window, for a mini histogram */
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
