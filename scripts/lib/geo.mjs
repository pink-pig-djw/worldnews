import { readFileSync } from 'node:fs';

const TOKEN_RE = /[0-9A-Za-zÀ-ÖØ-öø-ÿĀ-ž]+(?:'[0-9A-Za-zÀ-ÖØ-öø-ÿĀ-ž]+)*/gu;
const REAL = (cc) => cc && !['XS', 'XR', 'XO'].includes(cc);
// Codes that usually appear as the *actor* of a story rather than where it happens
const ACTOR_PRONE = new Set(['US', 'GB', 'EU', 'RU', 'CN', 'FR', 'DE', 'XO']);
const SPECIFIC = new Set(['city', 'region', 'admin1', 'sea']);
const KIND_FACTOR = { city: 1.15, region: 1.15, admin1: 1.1, sea: 1.1, country: 1, actor: 1, org: 1, macro: 1 };
// Seats of government named as such: "the Kremlin said…" happened in Moscow, not in the middle of
// Russia. (Leaders' names map to the same entries but say nothing about where something happened.)
const SEATS = [
  ['kremlin', /\bKremlin\b|克里姆林宫/],
  ['white-house', /\bWhite House\b|白宫/],
  ['downing-street', /\bDowning Street\b|唐宁街/],
  ['elysee', /\b[EÉ]lys[ée]e\b|爱丽舍宫/],
  ['knesset', /\bKnesset\b|以色列议会/],
];
// Small towns only count with evidence that the name is a place: "in Kokopo", "Kokopo, Papua New Guinea".
const PLACE_PREP = new Set(['in', 'at', 'near', 'outside', 'from', 'into', 'across', 'around', 'of', 'to', 'towards', 'toward']);
const CAPITAL_EN = /\b(?:in|from|across|around|outside|near|on the streets of|streets of) (?:the|its|their|the country's) capital\b/i;
const CAPITAL_ZH = /首都/;

function normalizeEn(text) {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/\bU\.S\.(A\.)?/g, 'US')
    .replace(/\bU\.K\./g, 'UK')
    .replace(/\bU\.N\./g, 'UN')
    .replace(/\bE\.U\./g, 'EU')
    .replace(/\bD\.C\./g, 'DC')
    .replace(/\bSt\./g, 'St');
}

export class Geoparser {
  constructor(gaz) {
    this.places = gaz.places;
    this.en = new Map(Object.entries(gaz.en));
    this.zh = new Map(Object.entries(gaz.zh));
    this.zhPairs = new Map(Object.entries(gaz.zhPairs || {}));
    this.zhStop = new Set(gaz.zhStop || []);
    this.maxEnTokens = 1;
    for (const k of this.en.keys()) this.maxEnTokens = Math.max(this.maxEnTokens, k.split(' ').length);
    this.maxZh = 2;
    for (const k of [...this.zh.keys(), ...this.zhPairs.keys(), ...this.zhStop]) this.maxZh = Math.max(this.maxZh, k.length);
  }

  static load(path) {
    return new Geoparser(JSON.parse(readFileSync(path, 'utf8')));
  }

  homeResult(cc) {
    const p = this.places.find((x) => x.id === `c-${cc}`);
    return p ? { loc: { id: p.id, name: p.en, zh: p.zh, cc: p.cc, lat: p.lat, lng: p.lng, kind: p.k }, country: cc, related: [], mentions: [] } : null;
  }

  /** A small town's name is used as a place: after "in/near/…", or followed by its country or state. */
  townEvidence(m, p) {
    if (!m.next) return true; // Chinese: only longer town names are indexed at all
    if (PLACE_PREP.has(m.prev)) return true;
    for (let n = 1; n <= m.next.length; n++) {
      const after = this.en.get(m.next.slice(0, n).join(' '));
      if (after?.some((i) => this.places[i].cc === p.cc && (this.places[i].k === 'country' || this.places[i].k === 'admin1'))) return true;
    }
    return false;
  }

  /** "The Kremlin said…" → the Kremlin; "…protests in the capital" → the capital city. */
  seatOrCapital(placeScore, mentions, cc, text) {
    for (const [id, re] of SEATS) {
      if (!re.test(text)) continue;
      const p = this.places.find((x) => x.id === id);
      if (p?.cc === cc) return p;
    }
    if (CAPITAL_EN.test(text) || CAPITAL_ZH.test(text)) {
      this.capitals ||= new Map();
      if (!this.capitals.has(cc)) {
        const caps = this.places.filter((p) => p.cap && p.cc === cc).sort((a, b) => b.r - a.r);
        this.capitals.set(cc, caps[0] || null);
      }
      return this.capitals.get(cc);
    }
    return null;
  }

  /** Longest-match lookup of gazetteer names in English text. Returns [{cands, pos}] */
  matchEn(text) {
    const toks = [];
    for (const m of normalizeEn(text).matchAll(TOKEN_RE)) {
      let t = m[0];
      if (/'s$/i.test(t)) t = t.slice(0, -2);
      toks.push(t);
    }
    const out = [];
    for (let i = 0; i < toks.length; ) {
      let hit = 0;
      for (let n = Math.min(this.maxEnTokens, toks.length - i); n >= 1; n--) {
        const key = n === 1 ? toks[i] : toks.slice(i, i + n).join(' ');
        const cands = this.en.get(key);
        if (cands) {
          out.push({ cands, pos: i, key, prev: toks[i - 1]?.toLowerCase(), next: toks.slice(i + n, i + n + 3) });
          hit = n;
          break;
        }
      }
      i += hit || 1;
    }
    return out;
  }

  /** Longest-match scan over Chinese text. Two-country abbreviations (俄乌, 中美…) only when pairs=true. */
  matchZh(text, pairs) {
    const out = [];
    const s = text;
    // Quoted short names (typhoon names, book titles…) often contain place names: skip them.
    const masked = new Uint8Array(s.length);
    const mask = (re, group = 0) => {
      for (const m of s.matchAll(re)) {
        const start = m.index + (group ? m[0].indexOf(m[group]) : 0);
        masked.fill(1, start, start + m[group].length);
      }
    };
    mask(/《[^》]*》/g);
    mask(/“([^”]{1,6})”/g, 1);
    mask(/(?:超强台风|强台风|台风|飓风|热带风暴|气旋)[“"]?([\u4e00-\u9fff]{2,4})/g, 1);
    for (let i = 0; i < s.length; ) {
      if (masked[i]) { i++; continue; }
      let hit = 0;
      for (let n = Math.min(this.maxZh, s.length - i); n >= 2; n--) {
        const key = s.substr(i, n);
        if (this.zhStop.has(key)) { hit = n; break; }
        const cands = this.zh.get(key);
        if (cands) { out.push({ cands, pos: i, key }); hit = n; break; }
        if (pairs) {
          const pair = this.zhPairs.get(key);
          if (pair) {
            out.push({ cands: [pair[0]], pos: i, key });
            out.push({ cands: [pair[1]], pos: i + 1, key });
            hit = n;
            break;
          }
        }
      }
      i += hit || 1;
    }
    return out;
  }

  /**
   * Geolocate a story from its title and summary.
   * Returns { loc, country, related, mentions } or null when nothing is recognised.
   */
  /**
   * Where a story happened. `homeCc` (a local outlet's own country) helps pick between same-named
   * places and, with `homeFallback`, locates national news that names no place at all.
   */
  parse(title, summary = '', lang = 'en', { homeCc = null, homeFallback = false } = {}) {
    const zh = lang.startsWith('zh');
    const tMatches = zh ? this.matchZh(title, true) : this.matchEn(title);
    const sMatches = summary ? (zh ? this.matchZh(summary, false) : this.matchEn(summary)) : [];
    const mentions = [
      ...tMatches.map((m) => ({ ...m, w: 3, inTitle: true })),
      ...sMatches.map((m) => ({ ...m, w: 1, inTitle: false })),
    ];
    if (!mentions.length) return homeFallback && homeCc ? this.homeResult(homeCc) : null;

    // context: countries named unambiguously anywhere in the text (small towns don't count, they
    // need this context themselves)
    const ctx = new Set(homeCc ? [homeCc] : []);
    for (const m of mentions) {
      const firm = m.cands.filter((c) => !this.places[c].ctx);
      if (firm.length === 1) ctx.add(this.places[firm[0]].cc);
    }
    for (const m of mentions) m.cands = m.cands.filter((c) => !this.places[c].ctx || (ctx.has(this.places[c].cc) && this.townEvidence(m, this.places[c])));
    for (let i = mentions.length - 1; i >= 0; i--) if (!mentions[i].cands.length) mentions.splice(i, 1);
    if (!mentions.length) return homeFallback && homeCc ? this.homeResult(homeCc) : null;

    const placeScore = new Map();
    const titleCountries = new Set();
    for (const m of mentions) {
      let idx = m.cands[0];
      if (m.cands.length > 1) {
        const inCtx = m.cands.find((c) => ctx.has(this.places[c].cc));
        idx = inCtx ?? m.cands.reduce((a, b) => (this.places[b].r > this.places[a].r ? b : a));
      }
      const p = this.places[idx];
      const s = m.w * p.w * (KIND_FACTOR[p.k] || 1);
      placeScore.set(idx, (placeScore.get(idx) || 0) + s);
      if (m.inTitle && REAL(p.cc) && p.k !== 'org') titleCountries.add(p.cc);
    }

    // country scores; actors/orgs count for less when deciding *where* something happened
    const countryScore = new Map();
    for (const [idx, s] of placeScore) {
      const p = this.places[idx];
      if (!REAL(p.cc)) continue;
      const locWeight = p.k === 'actor' ? 0.55 : 1;
      countryScore.set(p.cc, (countryScore.get(p.cc) || 0) + s * locWeight);
    }
    const multi = titleCountries.size > 1;
    let bestCc = null;
    let bestScore = 0;
    for (const [cc, s0] of countryScore) {
      const s = multi && ACTOR_PRONE.has(cc) ? s0 * 0.6 : s0;
      if (s > bestScore) { bestScore = s; bestCc = cc; }
    }

    // the most specific place: a city/region/sea, preferably inside the winning country
    let loc = null;
    let locScore = -1;
    for (const [idx, s] of placeScore) {
      const p = this.places[idx];
      if (!SPECIFIC.has(p.k)) continue;
      const bonus = p.cc === bestCc ? 1.5 : p.cc === 'XS' || p.cc === 'XR' ? 0 : -1;
      const score = s + bonus;
      if (score > locScore) { locScore = score; loc = p; }
    }
    if (loc && loc.cc !== bestCc && REAL(loc.cc) && bestCc && locScore + 1 < bestScore * 0.6) loc = null;
    if (loc && (loc.cc === 'XS' || loc.cc === 'XR') && bestCc && locScore < bestScore * 0.9) loc = null;
    if (!loc && bestCc) {
      // fall back to the strongest country mention (prefer the real country entry over demonyms/actors)
      let best = null;
      let bs = -1;
      for (const [idx, s] of placeScore) {
        const p = this.places[idx];
        if (p.cc !== bestCc) continue;
        const sc = s + (p.k === 'country' ? 0.5 : 0);
        if (sc > bs) { bs = sc; best = p; }
      }
      loc = best;
      if (loc && loc.k !== 'country') {
        const country = this.places.find((p) => p.id === `c-${bestCc}`);
        if (country && loc.k !== 'city') loc = country;
      }
      // a country-level story that names where it happened in other words
      if (loc?.k === 'country') loc = this.seatOrCapital(placeScore, mentions, bestCc, `${title} ${summary}`) || loc;
    }
    if (!loc) {
      // nothing country-level: use the strongest sea/region/organisation/macro-region
      let bs = -1;
      for (const [idx, s] of placeScore) {
        const p = this.places[idx];
        if (s > bs) { bs = s; loc = p; }
      }
    }
    if (!loc) return null;
    // demonyms ("Ukrainian") are separate entries only so they can weigh less; locate them at the country
    if (loc.id.startsWith('d-')) loc = this.places.find((p) => p.id === `c-${loc.cc}`) || loc;

    const country = REAL(loc.cc) ? loc.cc : null;
    const related = [...countryScore.entries()]
      .filter(([cc, s]) => cc !== country && (s >= 1 || titleCountries.has(cc)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([cc]) => cc);
    return {
      loc: { id: loc.id, name: loc.en, zh: loc.zh, cc: loc.cc, lat: loc.lat, lng: loc.lng, kind: loc.k },
      country,
      related,
      mentions: [...new Set([...placeScore.keys()].map((i) => this.places[i].id))].slice(0, 12),
    };
  }
}
