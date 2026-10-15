import { XMLParser } from 'fast-xml-parser';
import { cleanText, parseDate } from './util.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ['item', 'entry', 'link', 'category', 'media:content', 'media:thumbnail', 'enclosure'].includes(name),
});

const first = (v) => (Array.isArray(v) ? v[0] : v);
const text = (v) => cleanText(first(v));

function pickLink(item) {
  const links = item.link || [];
  for (const l of links) {
    if (typeof l === 'string' && l.startsWith('http')) return l;
    if (l && typeof l === 'object') {
      if (l['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate')) return l['@_href'];
      if (typeof l['#text'] === 'string' && l['#text'].startsWith('http')) return l['#text'];
    }
  }
  const guid = first(item.guid);
  const g = typeof guid === 'object' ? guid?.['#text'] : guid;
  if (typeof g === 'string' && g.startsWith('http')) return g;
  return item['feedburner:origLink'] || null;
}

function pickImage(item) {
  const cands = [];
  for (const key of ['media:thumbnail', 'media:content', 'enclosure']) {
    for (const m of item[key] || []) {
      if (!m || typeof m !== 'object') continue;
      const url = m['@_url'];
      const type = m['@_type'] || m['@_medium'] || '';
      const width = Number(m['@_width'] || 0);
      if (url && (!type || /image/.test(type))) cands.push({ url, width });
      for (const t of m['media:thumbnail'] || []) if (t?.['@_url']) cands.push({ url: t['@_url'], width: Number(t['@_width'] || 0) });
    }
  }
  if (!cands.length) {
    const html = String(first(item['content:encoded']) || first(item.description) || '');
    const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
    if (m) cands.push({ url: m[1], width: 0 });
  }
  if (!cands.length) return null;
  // Prefer a mid-sized image (thumbnails in lists are ~ 300–800px wide)
  cands.sort((a, b) => Math.abs((a.width || 600) - 640) - Math.abs((b.width || 600) - 640));
  const url = cands[0].url;
  return /^https?:\/\//.test(url) ? url.replace(/^http:/, 'https:') : null;
}

function pickGeo(item) {
  const lat = item['geo:lat'] ?? item['geo:Point']?.['geo:lat'];
  const lng = item['geo:long'] ?? item['geo:Point']?.['geo:long'];
  if (lat != null && lng != null) return { lat: Number(lat), lng: Number(lng) };
  const pt = item['georss:point'];
  if (pt) {
    const [a, b] = String(typeof pt === 'object' ? pt['#text'] : pt).trim().split(/\s+/).map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) return { lat: a, lng: b };
  }
  return null;
}

/** Parse RSS 2.0, RSS 1.0 (RDF) or Atom into a flat list of items. */
export function parseFeed(xml, { tz } = {}) {
  const doc = parser.parse(xml);
  const channel = doc.rss?.channel || doc['rdf:RDF']?.channel;
  const raw = doc.rss?.channel?.item || doc['rdf:RDF']?.item || doc.feed?.entry || doc.channel?.item || [];
  const items = [];
  for (const it of raw) {
    const title = text(it.title);
    const link = pickLink(it);
    if (!title || !link) continue;
    const summary = text(it.description) || text(it.summary) || text(it.content) || text(it['content:encoded']);
    const date = parseDate(first(it.pubDate) ?? first(it['dc:date']) ?? first(it.published) ?? first(it.updated) ?? first(it['a10:updated']), tz);
    const categories = (it.category || []).map((c) => cleanText(typeof c === 'object' ? c['#text'] ?? c['@_term'] : c)).filter(Boolean);
    items.push({ title, link, summary, date, categories, image: pickImage(it), geo: pickGeo(it), raw: it });
  }
  return { title: text(channel?.title || doc.feed?.title), items };
}
