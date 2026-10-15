// Live local time for countries and places: IANA zone from the tz database (see tools/build_tz.py),
// formatted by the browser's Intl API, plus whether the sun is up there right now.
import TZ from './timezones.json';
import { getLang } from '../i18n.js';
import { subsolarPoint } from '../globe/sun.js';

const RAD = Math.PI / 180;
// de facto zone of an occupied area, not one of the country's own time zones
const NOT_NATIONAL = new Set(['Europe/Simferopol']);

function angle(lat1, lng1, lat2, lng2) {
  const c = Math.sin(lat1 * RAD) * Math.sin(lat2 * RAD) + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos((lng1 - lng2) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** Nautical time zone for open sea: whole hours by longitude (Etc/GMT signs are inverted). */
function seaZone(lng) {
  const h = Math.round(lng / 15);
  return h === 0 ? 'Etc/GMT' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`;
}

/** Time zone at a place: the country's zone nearest to it, or the capital's for the whole country. */
export function zoneFor(cc, lat, lng) {
  const e = TZ[cc];
  if (!e) return lat != null ? seaZone(lng) : null;
  if (lat == null || !e[5]) return e[0];
  let best = e[0];
  let bd = Infinity;
  for (const [tz, la, lo] of e[5]) {
    const d = angle(lat, lng, la, lo);
    if (d < bd) {
      bd = d;
      best = tz;
    }
  }
  return best;
}

const fmts = new Map();
function fmt(tz, opts) {
  const key = `${getLang()}|${tz}|${JSON.stringify(opts)}`;
  if (!fmts.has(key)) fmts.set(key, new Intl.DateTimeFormat(getLang() === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: tz, ...opts }));
  return fmts.get(key);
}

/** Minutes east of UTC for a zone at a moment. */
export function offsetMinutes(tz, date = new Date()) {
  const p = Object.fromEntries(fmt(tz, { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

export function offsetLabel(mins) {
  const sign = mins < 0 ? '−' : '+';
  const a = Math.abs(mins);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
}

/** Sun elevation in degrees at a place. */
export function sunElevation(lat, lng, date = new Date()) {
  const s = subsolarPoint(date);
  return 90 - angle(lat, lng, s.lat, s.lng) / RAD;
}

/** 'day' | 'night' | 'dawn' | 'dusk' (twilight = sun less than 6° below the horizon). */
export function sunPhase(lat, lng, date = new Date()) {
  const e = sunElevation(lat, lng, date);
  if (e > 0) return 'day';
  if (e < -6) return 'night';
  return sunElevation(lat, lng, new Date(date.getTime() + 600000)) > e ? 'dawn' : 'dusk';
}

/** Everything the clock widget shows, for a country (whole-country view) or a specific place. */
export function localClock({ cc, lat = null, lng = null }, date = new Date()) {
  const e = TZ[cc];
  const tz = zoneFor(cc, lat, lng);
  if (!tz) return null;
  const at = lat != null ? [lat, lng] : e ? [e[1], e[2]] : null;
  const out = {
    tz,
    time: fmt(tz, { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date),
    date: fmt(tz, { month: 'short', day: 'numeric', weekday: 'short' }).format(date),
    offset: offsetLabel(offsetMinutes(tz, date)),
    phase: at ? sunPhase(at[0], at[1], date) : null,
  };
  // whole country spanning several offsets: say whose time this is and the range
  if (lat == null && e?.[5]) {
    const offs = [...new Set(e[5].filter(([z]) => !NOT_NATIONAL.has(z)).map(([z]) => offsetMinutes(z, date)))].sort((a, b) => a - b);
    if (offs.length > 1) {
      out.capital = getLang() === 'zh' ? e[4] || e[3] : e[3];
      out.span = { n: offs.length, from: offsetLabel(offs[0]), to: offsetLabel(offs[offs.length - 1]) };
    }
  }
  return out;
}
