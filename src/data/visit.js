// "Since your last visit". This browser keeps a small snapshot of the events it showed (nothing is
// sent anywhere); when you come back after a while, the current events are compared with it: new
// events, big changes (death toll, confirmation by more outlets, severity, alert level) and events
// heating up. After a long absence, notable events that came and went meanwhile come from the
// 15-day archive (data/events.json).
import { sevLevel } from '../ui/dom.js';

const SNAP_KEY = 'wp-visit-v1';
const LEFT_KEY = 'wp-visit-left';
const MIN_AWAY = 30 * 60; // a reload is not a visit
const MAX_EVENTS = 600;
const ALERT_RANK = { green: 1, yellow: 2, orange: 3, red: 4 };

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage: no "since your last visit" */
  }
}

/** The previous visit: when the page was last open and what it showed then. */
export function previousVisit(now = Date.now() / 1000) {
  const snap = read(SNAP_KEY);
  if (!snap?.ev) return null;
  const left = Math.max(read(LEFT_KEY) || 0, snap.t || 0);
  if (!left || now - left < MIN_AWAY) return null;
  return { left, ev: snap.ev };
}

function alertOf(e, store) {
  if (!e.hz) return '';
  const h = (store.raw?.hazards || []).find((x) => x.id === e.hz) || (store.raw?.quakes || []).find((x) => x.id === e.hz);
  return h?.alert || '';
}

/** Remember what is on screen now (the most important events). */
export function rememberVisit(store) {
  if (!store.raw) return;
  const ev = {};
  for (const e of [...store.events].sort((a, b) => b.imp - a.imp).slice(0, MAX_EVENTS)) {
    ev[e.id] = [e.v, Math.round(e.sev * 100), e.d || 0, alertOf(e, store)];
  }
  const now = Math.round(Date.now() / 1000);
  write(SNAP_KEY, { t: now, ev });
  write(LEFT_KEY, now);
}

/** Still here: only the time moves on. */
export function touchVisit() {
  write(LEFT_KEY, Math.round(Date.now() / 1000));
}

/**
 * What changed since `prev`. Only notable events count as new (several outlets or severe), so a
 * returning reader sees a short list rather than hundreds of minor reports.
 */
export function diffSince(prev, store) {
  const now = Date.now() / 1000;
  const seen = (id) => prev.ev[id] || prev.ev[store.aliasOf(id)];
  const newEvents = [];
  const changes = [];
  const heating = [];
  for (const e of store.events) {
    const old = seen(e.id) || [...store.aliases].filter(([, to]) => to === e.id).map(([from]) => prev.ev[from]).find(Boolean);
    if (!old) {
      if (e.sn >= prev.left - 600 && (e.v >= 2 || e.sev >= 0.6) && !e.so) newEvents.push(e);
      continue;
    }
    const [v0, sev0, d0, a0] = old;
    const what = [];
    const d = e.d || 0;
    if (d > d0 && (d >= d0 * 1.2 || d - d0 >= 5)) what.push({ k: 'toll', from: d0, to: d });
    if (v0 === 1 && e.v >= 3) what.push({ k: 'confirmed', to: e.v });
    else if (e.v - v0 >= 4) what.push({ k: 'spread', from: v0, to: e.v });
    if (sevLevel(e.sev) > sevLevel(sev0 / 100)) what.push({ k: 'sev', from: sevLevel(sev0 / 100), to: sevLevel(e.sev) });
    const a = alertOf(e, store);
    if ((ALERT_RANK[a] || 0) > (ALERT_RANK[a0] || 0) && a0) what.push({ k: 'alert', from: a0, to: a });
    if (what.length) changes.push({ e, what });
    else if (e.tr === 'up' && e.v > v0) heating.push(e);
  }
  const w = (e) => e.imp ?? 0;
  newEvents.sort((a, b) => w(b) - w(a));
  changes.sort((a, b) => b.what.length - a.what.length || w(b.e) - w(a.e));
  heating.sort((a, b) => w(b) - w(a));
  return { left: prev.left, away: now - prev.left, newEvents, changes, heating, archived: [] };
}

/** After a long absence: notable events that started and ended while the reader was away. */
export function archivedSince(prev, archive, store) {
  const current = new Set(store.events.map((e) => e.id));
  return (archive?.events || [])
    .filter((e) => e.l >= prev.left && !current.has(e.id) && (e.v >= 3 || e.sev >= 0.7) && !e.so)
    .sort((a, b) => b.sev * (0.4 + 0.6 * b.att) - a.sev * (0.4 + 0.6 * a.att))
    .slice(0, 10);
}

export const hasNews = (d) => d && (d.newEvents.length || d.changes.length || d.heating.length || d.archived.length);
