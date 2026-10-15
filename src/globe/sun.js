// Sub-solar point (where the sun is directly overhead), accurate to a fraction of a degree.
const RAD = Math.PI / 180;

export function subsolarPoint(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24;
  let lng = ra - gmst * 15;
  lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  return { lat: decl / RAD, lng };
}

/** three-globe's lat/lng -> cartesian convention (prime meridian on +Z, 90°E on +X). */
export function toVector(lat, lng, r = 1) {
  const phi = (90 - lat) * RAD;
  const theta = (90 - lng) * RAD;
  return [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}
