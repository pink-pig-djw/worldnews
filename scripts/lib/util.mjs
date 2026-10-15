import { createHash } from 'node:crypto';

export const HOUR = 3600;

export function hashId(input, len = 12) {
  return createHash('sha1').update(input).digest('hex').slice(0, len);
}

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', bull: '•' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITY[e.toLowerCase()] ?? m;
  });
}

/** Strip markup and collapse whitespace; returns '' for nullish input. */
export function cleanText(input) {
  if (input == null) return '';
  let s = typeof input === 'object' ? (input['#text'] ?? '') : String(input);
  s = s.replace(/<!\[CDATA\[|\]\]>/g, '');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<br\s*\/?>|<\/p>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(decodeEntities(s));
  return s.replace(/[\s 　]+/g, ' ').trim();
}

export function truncate(s, max) {
  if (!s || s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.7 ? cut.slice(0, sp) : cut).replace(/[\s,;:.，。；：]+$/, '') + '…';
}

const TRACKING = /^(utm_|at_|ns_|fbclid|gclid|ocid|cmpid|ito|xtor|rss|feed|src|ref)$/i;

export function normalizeUrl(u) {
  try {
    const url = new URL(u.trim());
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k) || k.startsWith('utm_')) url.searchParams.delete(k);
    url.hostname = url.hostname.replace(/^www\./, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return (u || '').trim();
  }
}

/** Parse a feed date; naive timestamps are interpreted in the source's UTC offset (e.g. "+08:00"). */
export function parseDate(value, tzOffset) {
  if (!value) return null;
  let s = String(typeof value === 'object' ? value['#text'] ?? '' : value).trim();
  if (!s) return null;
  if (tzOffset && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T') + tzOffset;
  // RFC822 with non-standard zone names Date.parse does not know
  s = s.replace(/\b(CST)\b$/, '-0600').replace(/\b(HKT|SGT)\b$/, '+0800').replace(/\b(CET)\b$/, '+0100').replace(/\b(CEST)\b$/, '+0200');
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.round(t / 1000) : null;
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
