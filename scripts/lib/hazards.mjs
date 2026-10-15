import { parseFeed } from './rss.mjs';
import { cleanText, round, truncate } from './util.mjs';

const DAY = 86400;

/** USGS GeoJSON summary feed -> compact quake list (M4.5+, last 7 days). */
export function normalizeUsgs(geojson, now) {
  const out = [];
  for (const f of geojson.features || []) {
    const p = f.properties || {};
    const [lng, lat, depth] = f.geometry?.coordinates || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || p.type !== 'earthquake') continue;
    const time = Math.round((p.time || 0) / 1000);
    if (now - time > 7 * DAY) continue;
    out.push({
      id: f.id,
      mag: round(p.mag, 1),
      place: p.place || '',
      time,
      lat: round(lat),
      lng: round(lng),
      depth: round(depth || 0, 1),
      url: p.url,
      tsunami: p.tsunami ? 1 : 0,
      alert: p.alert || null,
      felt: p.felt || 0,
      sig: p.sig || 0,
    });
  }
  return out.sort((a, b) => b.time - a.time).slice(0, 250);
}

const GDACS_TYPE = { EQ: 'quake', TC: 'storm', FL: 'flood', VO: 'volcano', DR: 'drought', WF: 'fire', TS: 'tsunami' };

function attr(v, name) {
  if (v == null) return null;
  if (typeof v === 'object') return v[`@_${name}`] ?? v['#text'] ?? null;
  return v;
}

/** GDACS RSS -> hazard list. Keeps orange/red alerts and recent green ones (quakes come from USGS). */
export function normalizeGdacs(xml, now) {
  const { items } = parseFeed(xml);
  const out = [];
  for (const it of items) {
    const r = it.raw;
    const code = cleanText(r['gdacs:eventtype']);
    const type = GDACS_TYPE[code] || 'other';
    const alert = (cleanText(r['gdacs:alertlevel']) || '').toLowerCase() || null;
    const from = Date.parse(cleanText(r['gdacs:fromdate'])) / 1000 || it.date || now;
    const to = Date.parse(cleanText(r['gdacs:todate'])) / 1000 || from;
    const isCurrent = cleanText(r['gdacs:iscurrent']).toLowerCase() !== 'false';
    if (!it.geo || !Number.isFinite(it.geo.lat)) continue;
    if (type === 'quake' && alert === 'green') continue;
    if (alert === 'green' && now - to > 3 * DAY) continue;
    if (!isCurrent && now - to > 5 * DAY) continue;
    const severity = r['gdacs:severity'];
    const pop = r['gdacs:population'];
    out.push({
      id: `gdacs-${code}-${cleanText(r['gdacs:eventid'])}`,
      type,
      title: it.title,
      summary: truncate(it.summary, 260),
      lat: round(it.geo.lat),
      lng: round(it.geo.lng),
      time: Math.round(from),
      until: Math.round(to),
      alert,
      severity: cleanText(typeof severity === 'object' ? severity['#text'] ?? attr(severity, 'value') : severity) || null,
      population: cleanText(typeof pop === 'object' ? pop['#text'] ?? attr(pop, 'value') : pop) || null,
      country: cleanText(r['gdacs:country']) || null,
      url: it.link,
      source: 'gdacs',
    });
  }
  return out;
}

const EONET_TYPE = { wildfires: 'fire', severeStorms: 'storm', volcanoes: 'volcano', floods: 'flood', landslides: 'landslide', drought: 'drought', tempExtremes: 'heat', dustHaze: 'dust', manmade: 'manmade', snow: 'snow', earthquakes: 'quake' };

/** NASA EONET open events -> hazards; storms keep their recent track. */
export function normalizeEonet(json, now) {
  const out = [];
  for (const ev of json.events || []) {
    const cat = ev.categories?.[0]?.id;
    const type = EONET_TYPE[cat];
    if (!type || type === 'quake') continue;
    const pts = (ev.geometry || []).filter((g) => g.type === 'Point' && Array.isArray(g.coordinates));
    if (!pts.length) continue;
    const last = pts[pts.length - 1];
    const time = Math.round(Date.parse(last.date) / 1000) || now;
    if (now - time > (type === 'fire' ? 10 : 21) * DAY) continue;
    const item = {
      id: `eonet-${ev.id}`,
      type,
      title: ev.title,
      lat: round(last.coordinates[1]),
      lng: round(last.coordinates[0]),
      time,
      alert: null,
      severity: last.magnitudeValue != null ? `${last.magnitudeValue} ${last.magnitudeUnit || ''}`.trim() : null,
      url: ev.sources?.[0]?.url || `https://eonet.gsfc.nasa.gov/api/v3/events/${ev.id}`,
      source: 'eonet',
    };
    if (type === 'storm' && pts.length > 1) {
      item.track = pts.slice(-48).map((g) => [round(g.coordinates[1], 2), round(g.coordinates[0], 2), Math.round(Date.parse(g.date) / 1000), g.magnitudeValue ?? null]);
    }
    out.push(item);
  }
  // Wildfire detections can number in the hundreds; keep the freshest ones
  const fires = out.filter((h) => h.type === 'fire').sort((a, b) => b.time - a.time).slice(0, 120);
  return [...out.filter((h) => h.type !== 'fire'), ...fires];
}

function distKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Merge GDACS and EONET: the same storm/volcano from both feeds becomes one item (GDACS alert + EONET track). */
export function mergeHazards(gdacs, eonet) {
  const merged = [...gdacs];
  for (const e of eonet) {
    const twin = merged.find((g) => g.type === e.type && distKm(g, e) < 600 && Math.abs(g.time - e.time) < 5 * DAY);
    if (twin) {
      if (e.track && !twin.track) twin.track = e.track;
      continue;
    }
    merged.push(e);
  }
  return merged.sort((a, b) => b.time - a.time);
}

/** CelesTrak TLE text -> [line1, line2] */
export function parseTle(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const l1 = lines.find((l) => l.startsWith('1 '));
  const l2 = lines.find((l) => l.startsWith('2 '));
  return l1 && l2 ? [l1, l2] : null;
}
