// USGS GeoJSON -> compact quake records. Dependency-free: the browser uses it too, for the
// minute-by-minute feed it reads straight from USGS.
const DAY = 86400;
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

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
