import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec } from 'satellite.js';

const EARTH_R = 6371;

/** SGP4 propagation of the space stations from their two-line elements. */
export function createSatellites(list) {
  const recs = [];
  for (const s of list || []) {
    try {
      recs.push({ ...s, satrec: twoline2satrec(s.tle[0], s.tle[1]) });
    } catch {
      /* skip malformed TLE */
    }
  }

  function at(rec, date) {
    const pv = propagate(rec.satrec, date);
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
    const gd = eciToGeodetic(pv.position, gstime(date));
    const v = pv.velocity;
    return {
      lat: degreesLat(gd.latitude),
      lng: degreesLong(gd.longitude),
      heightKm: gd.height,
      alt: gd.height / EARTH_R,
      speed: v ? Math.hypot(v.x, v.y, v.z) : null,
    };
  }

  return {
    get count() {
      return recs.length;
    },
    positions(date = new Date()) {
      const out = [];
      for (const r of recs) {
        const p = at(r, date);
        if (p) out.push({ id: r.id, name: r.name, zh: r.zh, norad: r.norad, ...p });
      }
      return out;
    },
    /** past 40 min (faint) and next 90 min (dashed) of the ground track at orbital altitude */
    tracks(date = new Date()) {
      const out = [];
      for (const r of recs) {
        const past = [];
        const future = [];
        for (let m = -40; m <= 90; m += 1.5) {
          const p = at(r, new Date(date.getTime() + m * 60000));
          if (!p) continue;
          const pt = [p.lat, p.lng, p.alt];
          if (m <= 0) past.push(pt);
          if (m >= 0) future.push(pt);
        }
        out.push({ id: r.id, past, future });
      }
      return out;
    },
  };
}
