// "World now": the handful of events that matter most at this moment, on the first screen.
// Desktop: a small card at the top right (hidden while an event panel is open). Phones: a thin
// strip above the tab bar that cycles through them and opens into the full list.
import { CAT, SUB_ICON } from '../config.js';
import { t, timeAgo } from '../i18n.js';
import { flag, placeName } from '../data/store.js';
import { eventStory, eventTitle } from '../data/localize.js';
import { esc } from './dom.js';
import { icon } from './icons.js';

/**
 * Most important events, corroborated by at least two independent outlets (or very severe), not
 * state media alone; one per country and at most two of a kind, so the list is a world overview.
 */
export function pickWorldNow(store, n = 5) {
  const out = [];
  const places = new Set();
  const cats = {};
  for (const e of store.view.events) {
    if (e.so || (e.v < 2 && e.sev < 0.8)) continue;
    const where = e.place?.cc || e.place?.id || e.id;
    if (places.has(where) || (cats[e.cat] || 0) >= 2) continue;
    out.push(e);
    places.add(where);
    cats[e.cat] = (cats[e.cat] || 0) + 1;
    if (out.length >= n) break;
  }
  return out;
}

function item(e, i, store) {
  const c = CAT[e.cat] || CAT.other;
  const s = eventStory(e);
  const title = eventTitle(e);
  const srcs = e.v === 1 ? t().voicesShort(1) : t().voicesShort(e.v);
  return `<button class="wn-item" data-action="event" data-id="${esc(e.id)}" style="--c:${c.color}">
    <span class="wn-rank">${i + 1}</span>
    <span class="wn-main"><span class="wn-title" lang="${s.lang === 'zh' || title !== s.title ? 'zh-CN' : 'en'}">${esc(title)}</span>
    <span class="wn-meta"><span class="wn-cat">${icon(SUB_ICON[e.sub] || c.icon, 11)}${esc(t().cats[e.cat])}</span>${e.place ? `<span>${flag(e.place.cc)} ${esc(placeName(e.place))}</span>` : ''}<span>${esc(srcs)}</span><span>${esc(timeAgo(e.l))}</span>${e.tr === 'up' ? `<span class="trend up">${icon('up', 10)}</span>` : ''}</span></span>
  </button>`;
}

/** The last 24 hours in one line: events, how many several outlets confirm, severe-but-overlooked. */
function dayLine(store) {
  const v = store.view;
  const now = Date.now() / 1000;
  const day = v.events.filter((e) => now - e.l < 86400);
  const multi = day.filter((e) => e.v >= 2).length;
  const gaps = v.gaps.length;
  return `<div class="wn-day"><span>${esc(t().last24)} <b>${day.length}</b> ${esc(t().eventsUnit)}</span><span><b>${multi}</b> ${esc(t().multiUnit)}</span>${
    gaps ? `<button class="gap" data-action="wn-gaps"><b>${gaps}</b> ${esc(t().gapUnit)}</button>` : ''
  }</div>`;
}

export function worldNowHtml(items, store, { collapsed = false, since = '' } = {}) {
  if (!items.length) return '';
  return `<div class="wn-head" data-action="wn-toggle" role="button" aria-expanded="${!collapsed}">
      <span class="wn-pulse"></span><b>${esc(t().worldNow)}</b><small>${esc(t().worldNowSub)}</small>
      <span class="wn-count">${items.length}</span>
      <span class="wn-toggle" title="${esc(collapsed ? t().expand : t().collapse)}">${icon('chevron', 15)}</span>
    </div>
    ${dayLine(store)}
    ${since}
    <div class="wn-list">${items.map((e, i) => item(e, i, store)).join('')}</div>
    <div class="wn-hint">${esc(t().worldNowHint)}</div>`;
}

/** Phone strip: one event at a time. */
export function worldNowStrip(items, idx) {
  const e = items[idx % items.length];
  if (!e) return '';
  return `<span class="wn-tag"><span class="wn-pulse"></span>${esc(t().worldNow)}</span>
    <span class="wn-strip-title" data-id="${esc(e.id)}"><b>${(idx % items.length) + 1}</b>${flag(e.place?.cc)} ${esc(eventTitle(e))}</span>
    <span class="wn-strip-n">${(idx % items.length) + 1}/${items.length}</span>`;
}
