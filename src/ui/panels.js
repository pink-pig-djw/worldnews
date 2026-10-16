// Detail panel renderers. They return HTML strings; main.js wires events via data-action.
import { CAT, HAZARD_COLOR, QUAKE_COLOR, SUB_ICON } from '../config.js';
import { getLang, t, timeAgo } from '../i18n.js';
import { attentionLevel, countryName, flag, isRealCc, placeName } from '../data/store.js';
import { eventStory, eventTitle, hazardText, isTranslated, quakePlace, storySummary, storyTitle } from '../data/localize.js';
import { localClock } from '../data/localtime.js';
import { esc, fmtTime, safeUrl, sevLevel } from './dom.js';
import { icon } from './icons.js';

const closeBtn = () => `<button class="d-close" data-action="close" aria-label="${t().close}">${icon('x', 16)}</button>`;
const KINDS = ['agency', 'broadcaster', 'newspaper', 'un', 'state'];

export function catTag(x) {
  const c = CAT[x.cat] || CAT.other;
  const sub = x.sub && t().subs[x.sub] ? ` · ${t().subs[x.sub]}` : '';
  return `<span class="badge" style="--c:${c.color}">${icon(SUB_ICON[x.sub] || c.icon, 11)}${esc(t().cats[x.cat] || x.cat)}${esc(sub)}</span>`;
}

export function sevBars(sev, cat) {
  const lvl = sevLevel(sev);
  const c = CAT[cat]?.color || '#fff';
  return `<span class="sev" title="${esc(`${t().severity2}：${t().sev[lvl]}`)}" style="--c:${c}">${[1, 2, 3, 4].map((i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</span>`;
}

function sourceName(store, id) {
  const src = store.source(id);
  return getLang() === 'zh' ? src.zh || src.name : src.name;
}

/** A report: outlet, time, headline (translated, with the original underneath), summary, link. */
export function storyHtml(s, store, { showPlace = false } = {}) {
  const now = Date.now() / 1000;
  const place = showPlace && s.loc ? ` · ${esc(placeName(s.loc))}` : '';
  // machine-translated reports keep the original headline underneath, so mistakes are easy to spot
  const tr = isTranslated(s);
  const textLang = s.lang === 'zh' || tr ? 'zh-CN' : 'en';
  const src = store.source(s.source);
  const img = s.image ? `<img class="story-img" src="${safeUrl(s.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<article class="story" data-story="${esc(s.id)}">
    <div class="story-main">
      <div class="story-meta">${s.fresh ? `<span class="new-badge">${esc(t().newBadge)}</span>` : ''}<span class="src">${esc(sourceName(store, s.source))}</span><span class="kind-tag k-${esc(src.kind || '')}">${esc(t().kindShort[src.kind] || '')}</span><span>${esc(timeAgo(s.time, now))}${place}</span></div>
      <a class="story-title" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer" lang="${textLang}">${esc(storyTitle(s))}</a>
      ${tr ? `<div class="story-orig" lang="en"><span>${esc(t().original)}</span>${esc(s.title)}</div>` : ''}
      ${s.summary ? `<p class="story-sum" lang="${storySummary(s) !== s.summary ? 'zh-CN' : textLang}">${esc(storySummary(s))}</p>` : ''}
      <div class="story-foot"><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 13)}${esc(t().readSource)}</a></div>
    </div>${img}
  </article>`;
}

/** Who reports an event, in a few words: the outlet when it is the only one, else the count. */
function sourceLabel(e, store) {
  if (e.so && e.v === 1) return `${sourceName(store, e.lead.source)} · ${t().kindShort.state}`;
  return e.v === 1 ? sourceName(store, e.lead.source) : t().voicesShort(e.v);
}

/** One line per event in lists. */
export function eventRow(e, store, { showPlace = true, rank = null } = {}) {
  const now = Date.now() / 1000;
  const c = CAT[e.cat] || CAT.other;
  const s = eventStory(e);
  const title = eventTitle(e);
  const place = showPlace && e.place ? `<span>${flag(e.place.cc)} ${esc(placeName(e.place))}</span><span class="sep">·</span>` : '';
  const trend = e.tr === 'up' ? `<span class="trend up" title="${esc(t().trendUpLong)}">${icon('up', 11)}</span>` : '';
  return `<button class="row ev-row${e.fresh ? ' is-new' : ''}${e.v === 1 || e.so ? ' single' : ''}" data-action="event" data-id="${esc(e.id)}" style="--c:${c.color}">
    ${rank != null ? `<span class="rank">${rank}</span>` : ''}
    <span class="row-ico">${icon(SUB_ICON[e.sub] || c.icon, 15)}</span>
    <span class="row-main"><span class="row-title" lang="${s.lang === 'zh' || title !== s.title ? 'zh-CN' : 'en'}">${e.fresh ? `<span class="new-badge">${esc(t().newBadge)}</span>` : ''}${esc(title)}</span>
    <span class="row-meta">${place}<span class="srcs">${esc(sourceLabel(e, store))}</span><span class="sep">·</span><span>${esc(timeAgo(e.l, now))}</span>${trend}${e.gap ? `<span class="gap-tag">${icon('flag', 10)}${esc(t().gap)}</span>` : ''}</span></span>
    <span class="row-side">${sevBars(e.sev, e.cat)}</span>
  </button>`;
}

/** Event rows; state-media-only events about other countries are folded away after a couple. */
export function eventRows(events, store, opts = {}) {
  const limit = opts.limit ?? 60;
  const budget = opts.stateBudget || { left: 2 };
  const shown = [];
  const folded = [];
  for (const e of events.slice(0, limit)) {
    if (stateAbroad(e, store, opts.cc) && budget.left-- <= 0) folded.push(e);
    else shown.push(e);
  }
  const html = (list) => list.map((e) => eventRow(e, store, opts)).join('');
  return html(shown) + (folded.length ? `<details class="state-more"><summary>${icon('chevron', 14)}${esc(t().stateMore(folded.length))}</summary>${html(folded)}</details>` : '');
}

function stateAbroad(e, store, contextCc) {
  if (!e.so) return false;
  const src = store.source(e.lead.source);
  const cc = contextCc || e.place?.cc;
  return !(src.homeCc || [src.country]).includes(cc);
}

function catBar(events) {
  const counts = {};
  for (const e of events) counts[e.cat] = (counts[e.cat] || 0) + 1;
  const total = events.length || 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return `<div class="catbar">${entries.map(([c, n]) => `<i style="--c:${CAT[c]?.color};flex:${n / total}"></i>`).join('')}</div>
    <div class="catlegend">${entries.map(([c, n]) => `<span style="--c:${CAT[c]?.color}">${esc(t().cats[c])} ${n}</span>`).join('')}</div>`;
}

function histogram(stories, store) {
  const h = store.histogram(stories);
  const max = Math.max(1, ...h);
  return `<div class="section-h">${esc(t().timeline)}</div>
    <div class="hist">${h.map((v) => `<i style="height:${Math.max(4, (v / max) * 100)}%" title="${v}"></i>`).join('')}</div>
    <div class="hist-axis"><span>-48h</span><span>-24h</span><span>${esc(t().ago.now)}</span></div>`;
}

function stats(events) {
  const sources = new Set(events.flatMap((e) => e.vr.map((s) => s.source))).size;
  const reports = events.reduce((n, e) => n + e.vr.length, 0);
  const latest = Math.max(0, ...events.map((e) => e.l));
  return `<div class="stats">
    <div class="stat"><b>${events.length}</b><span>${esc(t().events(events.length).replace(/^\d+\s*/, ''))}</span></div>
    <div class="stat"><b>${reports}</b><span>${esc(t().reportsShort(reports).replace(/^\d+\s*/, ''))} · ${esc(t().sources(sources))}</span></div>
    <div class="stat"><b style="font-size:15px">${latest ? esc(timeAgo(latest)) : '—'}</b><span>${esc(t().lastUpdate)}</span></div>
  </div>`;
}

function relatedChips(events) {
  const cnt = new Map();
  for (const e of events) for (const cc of e.rel || []) if (isRealCc(cc)) cnt.set(cc, (cnt.get(cc) || 0) + 1);
  if (!cnt.size) return '';
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<div class="section-h">${esc(t().related)}</div><div class="chips-row">${top
    .map(([cc, n]) => `<button class="cchip" data-action="country" data-cc="${esc(cc)}">${flag(cc)} ${esc(countryName(cc))} <b style="color:var(--muted)">${n}</b></button>`)
    .join('')}</div>`;
}

/** Live local clock; main.js repaints every `.d-clock` once a second. */
function clockSlot({ cc, lat = null, lng = null }) {
  const attrs = `data-cc="${esc(cc || '')}"${lat != null ? ` data-lat="${lat}" data-lng="${lng}"` : ''}`;
  return `<div class="d-clock" ${attrs}>${clockHtml({ cc, lat, lng })}</div>`;
}

export function clockHtml(spec) {
  const c = localClock(spec);
  if (!c) return '';
  const [hm, sec] = [c.time.slice(0, 5), c.time.slice(5)];
  const ph = c.phase;
  const ico = ph === 'night' ? icon('moon', 15) : icon('sun', 15);
  return `<span class="clk-ico ph-${ph || 'day'}" title="${esc(ph ? t().phase[ph] : '')}">${ico}</span>
    <span class="clk-time">${esc(hm)}<small>${esc(sec)}</small></span>
    <span class="clk-meta"><b>${esc(c.capital ? t().capitalTime(c.capital) : t().localTime)}</b><span>${esc(c.date)} · ${esc(c.offset)}${ph ? ` · ${esc(t().phase[ph])}` : ''}</span>${
      c.span ? `<span>${esc(t().tzSpan(c.span.n, c.span.from, c.span.to))}</span>` : ''
    }</span>`;
}

// ---------------------------------------------------------------- event detail
/** Short status of who reports it. */
export function credLabel(e) {
  const zh = getLang() === 'zh';
  if (e.so) return { cls: 'c-state', text: zh ? '仅官方媒体' : 'State media only' };
  if (e.v === 1) return { cls: 'c-single', text: zh ? '单一来源' : 'Single source' };
  if (e.v === 2) return { cls: 'c-two', text: zh ? '两个独立来源' : 'Two sources' };
  return { cls: 'c-multi', text: zh ? '多家独立来源' : 'Several sources' };
}

function credibility(e) {
  const now = Date.now() / 1000;
  const L = credLabel(e);
  const kinds = (e.kd || []).map((n, i) => (n ? `<span class="kchip k-${KINDS[i]}">${esc(t().kindShort[KINDS[i]])} ${n}</span>` : '')).join('');
  const warn = [];
  if (e.so) warn.push(t().warn.stateOnly);
  else if (e.v === 1) warn.push(t().warn.single);
  if (!e.so && e.o >= 2 && e.lo === e.o) warn.push(t().warn.localOnly);
  if (e.d && e.dc === 1 && e.o > 1) warn.push(t().warn.tollSingle);
  if (e.lw === 'x') warn.push(t().warn.mixed);
  const lcWhy = t().lcWhy[e.lw] || '';
  return `<div class="cred">
    <div class="cred-h">${icon('shield', 14)}<span>${esc(t().reliability)}</span><span class="cred-badge ${L.cls}">${esc(L.text)}</span></div>
    <div class="cred-row">${icon('news', 14)}<span><b>${esc(t().voices(e.v))}</b><small>${esc(t().outlets(e.o, e.n))}${e.v < e.o ? ` · ${esc(t().wireNote)}` : ''}</small></span></div>
    ${kinds ? `<div class="cred-kinds">${kinds}</div>` : ''}
    <div class="cred-row">${icon('pin', 14)}<span><b>${esc(t().location)}：${esc(t().lcLevel[e.lc] || '')}</b>${lcWhy ? `<small>${esc(lcWhy)}</small>` : ''}</span></div>
    <div class="cred-row">${icon('clock', 14)}<span><b>${esc(t().lastUpdate)} ${esc(timeAgo(e.l, now))}</b><small>${esc(t().firstReport)} ${esc(timeAgo(e.f, now))} · ${esc(fmtTime(e.f))}</small></span></div>
    ${warn.length ? `<ul class="cred-warn">${warn.map((w) => `<li>${icon('alert', 12)}${esc(w)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function sevReasons(e) {
  const W = t().sevWhy;
  const out = [];
  for (const code of e.sw || []) {
    const [k, v] = code.split(':');
    if (k === 'd') out.push(W.d(v));
    else if (k === 't' && t().subs[v]) out.push(t().subs[v]);
    else if (k === 'q') out.push(W.q(v));
    else if (k === 'a') out.push(W.a(v));
    else if (k === 'k') out.push(W.k);
  }
  return out.length ? out : [t().cats[e.cat] ? `${t().cats[e.cat]} · ${W.base}` : W.base];
}

function meters(e) {
  const sl = sevLevel(e.sev);
  const al = attentionLevel(e);
  const seg = (n) => [1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('');
  const trend = e.tr === 'up' ? `<span class="trend up">${icon('up', 11)}${esc(t().trendUp)}</span>` : e.tr === 'down' ? `<span class="trend down">${icon('down', 11)}${esc(t().trendDown)}</span>` : '';
  return `<div class="meters">
    <div class="meter m-sev lv${sl}"><div class="m-h"><span>${esc(t().severity2)}</span><b>${esc(t().sev[sl])}</b></div><div class="m-bar">${seg(sl)}</div><div class="m-why">${esc(sevReasons(e).join(' · '))}</div></div>
    <div class="meter m-att lv${al}"><div class="m-h"><span>${esc(t().attention)}</span><b>${esc(t().att[al])}</b>${trend}</div><div class="m-bar">${seg(al)}</div><div class="m-why">${esc(t().attWhy(e.v, e.rg || 1))}</div></div>
  </div>
  ${e.gap ? `<div class="gap-note">${icon('flag', 14)}<span><b>${esc(t().gap)}</b>${esc(t().gapWhy)}</span></div>` : ''}`;
}

function hazardLink(e, store) {
  if (!e.hz) return '';
  const q = (store.raw.quakes || []).find((x) => x.id === e.hz);
  const h = q ? null : (store.raw.hazards || []).find((x) => x.id === e.hz);
  if (!q && !h) return '';
  const color = q ? (q.alert && q.alert !== 'green' ? HAZARD_COLOR[q.alert] : QUAKE_COLOR) : HAZARD_COLOR[h.alert] || '#ffcc33';
  const label = q ? `M${q.mag.toFixed(1)} · ${quakePlace(q)}` : hazardText(h, 'title');
  return `<div class="section-h">${icon('alert', 13)} ${esc(t().linkedHazard)}</div>
    <button class="row" data-action="${q ? 'quake' : 'hazard'}" data-id="${esc(e.hz)}" style="--c:${color}"><span class="row-ico">${icon(q ? 'quake' : 'alert', 15)}</span>
    <span class="row-main"><span class="row-title">${esc(label)}</span><span class="row-meta">${q ? 'USGS' : h.source === 'gdacs' ? `GDACS · ${esc(t().alertLevel[h.alert] || '')}` : 'NASA EONET'}</span></span></button>`;
}

export function eventDetail(e, store) {
  const s = eventStory(e);
  const title = eventTitle(e);
  const tr = title !== s.title;
  const p = e.place;
  const cc = isRealCc(p?.cc) ? p.cc : null;
  const where = p ? `${cc ? `${flag(cc)} ` : ''}${esc(placeName(p))}${cc && p.kind !== 'country' ? ` · ${esc(countryName(cc))}` : ''}` : esc(t().noLocation);
  // independent outlets first, newest first; state media after them
  const reports = [...e.reports].sort((a, b) => Number(Boolean(a.state)) - Number(Boolean(b.state)) || b.time - a.time);
  const budget = { left: 3 };
  const shown = [];
  const folded = [];
  for (const r of reports) {
    const src = store.source(r.source);
    if (src.kind === 'state' && !(src.homeCc || [src.country]).includes(cc) && budget.left-- <= 0) folded.push(r);
    else shown.push(r);
  }
  return `<div class="d-head">
      <div class="d-top">${catTag(e)}<span>${esc(t().event)}</span>${closeBtn()}</div>
      <h2 class="d-title ev-title" lang="${s.lang === 'zh' || tr ? 'zh-CN' : 'en'}">${esc(title)}</h2>
      ${tr ? `<div class="story-orig" lang="en"><span>${esc(t().original)}</span>${esc(s.title)}</div>` : ''}
      <div class="ev-where">${icon('pin', 13)}<span>${where}</span></div>
      ${p ? clockSlot(p.kind === 'country' ? { cc: p.cc } : { cc: p.cc, lat: p.lat, lng: p.lng }) : ''}
    </div>
    ${meters(e)}
    ${credibility(e)}
    <div class="section-h">${icon('news', 13)} ${esc(t().allReports)} · ${reports.length}</div>
    ${shown.map((r) => storyHtml(r, store)).join('')}
    ${folded.length ? `<details class="state-more"><summary>${icon('chevron', 14)}${esc(t().stateMore(folded.length))}</summary>${folded.map((r) => storyHtml(r, store)).join('')}</details>` : ''}
    ${hazardLink(e, store)}
    <div class="actions">
      ${p && p.kind !== 'country' && store.view.placeById.get(p.id)?.events.length > 1 ? `<button class="btn secondary" data-action="place" data-id="${esc(p.id)}">${icon('pin', 15)}${esc(t().seePlace)} · ${store.view.placeById.get(p.id).events.length}</button>` : ''}
      ${cc ? `<button class="btn secondary" data-action="country" data-cc="${esc(cc)}">${icon('globe', 15)}${esc(t().seeCountry)}</button>` : ''}
      <button class="btn secondary" data-action="copy">${icon('link', 15)}${esc(t().copyLink)}</button>
    </div>`;
}

// ---------------------------------------------------------------- places, clusters, countries
export function placeDetail(place, store) {
  const events = place.events;
  const k = t().kinds[place.kind] || '';
  const cc = isRealCc(place.cc) ? place.cc : null;
  const parent = cc && place.kind !== 'country' ? `${flag(cc)} ${esc(countryName(cc))}` : '';
  const stories = events.flatMap((e) => e.vr);
  return `<div class="d-head">
      <div class="d-top"><span class="badge">${esc(k)}</span>${parent ? `<span>${parent}</span>` : ''}${closeBtn()}</div>
      <h2 class="d-title">${place.kind === 'country' && cc ? `<span class="flag">${flag(cc)}</span>` : ''}${esc(placeName(place))}</h2>
      <div class="d-sub">${esc(getLang() === 'zh' ? place.name || '' : place.zh || '')}</div>
      ${place.kind === 'country' ? clockSlot({ cc: place.cc }) : clockSlot({ cc: place.cc, lat: place.lat, lng: place.lng })}
    </div>
    ${stats(events)}${catBar(events)}${histogram(stories, store)}${relatedChips(events)}
    <div class="section-h">${esc(t().eventsHere)} · ${events.length}</div>
    ${eventRows(events, store, { cc, showPlace: false })}
    <div class="actions">
      ${cc && place.kind !== 'country' ? `<button class="btn secondary" data-action="country" data-cc="${esc(cc)}">${icon('globe', 15)}${esc(t().seeCountry)}</button>` : ''}
      <button class="btn secondary" data-action="copy">${icon('link', 15)}${esc(t().copyLink)}</button>
    </div>`;
}

export function clusterDetail(cluster, store) {
  const events = cluster.places.flatMap((p) => p.events).sort((a, b) => b.w - a.w);
  return `<div class="d-head">
      <div class="d-top"><span class="badge">${esc(t().clusterPlaces(cluster.places.length))}</span>${closeBtn()}</div>
      <h2 class="d-title">${esc(placeName(cluster.lead))} <span style="color:var(--muted);font-size:16px">+${cluster.places.length - 1}</span></h2>
    </div>
    ${stats(events)}${catBar(events)}
    <div class="section-h">${esc(t().hotspots)}</div>
    ${cluster.places
      .map(
        (p) => `<div class="place-row" data-action="place" data-id="${esc(p.id)}" style="--c:${CAT[p.topCat]?.color}">
          <span class="dot"></span><span class="nm">${esc(placeName(p))}</span><span class="count">${p.count}</span>${icon('chevron', 14)}</div>`,
      )
      .join('')}
    <div class="actions"><button class="btn" data-action="zoom">${icon('search', 15)}${esc(t().zoomIn)}</button></div>
    <div class="section-h">${esc(t().events(events.length))}</div>
    ${eventRows(events, store, { limit: 30 })}`;
}

export function countryDetail(cc, store) {
  const { located, involving } = store.eventsForCountry(cc);
  const all = [...located, ...involving];
  const budget = { left: 2 };
  const stories = located.flatMap((e) => e.vr);
  return `<div class="d-head">
      <div class="d-top"><span class="badge">${esc(t().kinds.country)}</span>${closeBtn()}</div>
      <h2 class="d-title"><span class="flag">${flag(cc)}</span>${esc(countryName(cc))}</h2>
      ${clockSlot({ cc })}
    </div>
    ${located.length ? stats(located) + catBar(located) + histogram(stories, store) : ''}
    ${relatedChips(all)}
    ${located.length ? `<div class="section-h">${esc(t().events(located.length))}</div>${eventRows(located, store, { cc, stateBudget: budget })}` : `<div class="empty">${esc(t().noStories)}</div>`}
    ${involving.length ? `<div class="section-h">${esc(t().involving)} · ${involving.length}</div>${eventRows(involving, store, { limit: 25, cc, stateBudget: budget })}` : ''}
    <div class="actions"><button class="btn secondary" data-action="copy">${icon('link', 15)}${esc(t().copyLink)}</button></div>`;
}

// ---------------------------------------------------------------- hazards
/** The news event linked to an alert, then other disaster events nearby. */
function relatedEvents(h, store, sub) {
  const v = store.view;
  const linked = h.ev ? store.event(h.ev) : null;
  const near = v.events.filter((e) => e !== linked && e.cat === 'disaster' && (!sub || e.sub === sub) && e.place && Math.abs(e.place.lat - h.lat) < 6 && Math.abs(e.place.lng - h.lng) < 8);
  const list = [...(linked ? [linked] : []), ...near].slice(0, 10);
  return list.length ? `<div class="section-h">${esc(t().linkedEvent)} · ${list.length}</div>${eventRows(list, store)}` : '';
}

export function quakeDetail(q, store) {
  const c = q.alert && q.alert !== 'green' ? HAZARD_COLOR[q.alert] : QUAKE_COLOR;
  return `<div class="d-head">
      <div class="d-top"><span class="badge" style="--c:${c}">${icon('quake', 12)}${esc(t().subs.quake)}</span><span>USGS</span>${closeBtn()}</div>
      <div style="display:flex;align-items:baseline;gap:12px;margin-top:10px"><span class="bignum" style="--c:${c}">M${q.mag.toFixed(1)}</span></div>
      <h2 class="d-title" style="font-size:18px">${esc(quakePlace(q))}</h2>
    </div>
    <dl class="kv">
      <dt>${esc(t().breaking)}</dt><dd>${esc(fmtTime(q.time))} · ${esc(timeAgo(q.time))}</dd>
      <dt>${esc(t().depth)}</dt><dd>${q.depth} km</dd>
      <dt>${esc(t().position)}</dt><dd>${q.lat.toFixed(2)}°, ${q.lng.toFixed(2)}°</dd>
      ${q.alert ? `<dt>PAGER</dt><dd style="color:${HAZARD_COLOR[q.alert]}">${esc(q.alert)}</dd>` : ''}
      ${q.tsunami ? `<dt>⚠</dt><dd style="color:#ff9a3c">${esc(t().tsunami)}</dd>` : ''}
    </dl>
    <div class="actions"><a class="btn" href="${safeUrl(q.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 15)}USGS</a>
    <button class="btn secondary" data-action="copy">${icon('link', 15)}${esc(t().copyLink)}</button></div>
    ${relatedEvents(q, store, 'quake')}`;
}

export function hazardDetail(h, store) {
  const c = HAZARD_COLOR[h.alert] || '#ffcc33';
  const name = t().subs[h.type] || h.type;
  const L = (field) => hazardText(h, field);
  return `<div class="d-head">
      <div class="d-top"><span class="badge" style="--c:${c}">${esc(name)}</span><span>${esc(t().alertLevel[h.alert] || '')}</span><span>${h.source === 'gdacs' ? 'GDACS' : 'NASA EONET'}</span>${closeBtn()}</div>
      <h2 class="d-title" style="font-size:19px">${esc(L('title'))}</h2>
      ${L('title') !== h.title ? `<div class="story-orig" lang="en"><span>${esc(t().original)}</span>${esc(h.title)}</div>` : ''}
    </div>
    ${L('summary') ? `<p class="about" style="margin-top:4px">${esc(L('summary'))}</p>` : ''}
    <dl class="kv">
      <dt>${esc(t().breaking)}</dt><dd>${esc(fmtTime(h.time))} · ${esc(timeAgo(h.time))}</dd>
      ${L('severity') ? `<dt>${esc(t().severity)}</dt><dd>${esc(L('severity'))}</dd>` : ''}
      ${L('population') ? `<dt>${esc(t().population)}</dt><dd>${esc(L('population'))}</dd>` : ''}
      ${L('country') ? `<dt>${esc(t().kinds.country)}</dt><dd>${esc(L('country'))}</dd>` : ''}
      <dt>${esc(t().position)}</dt><dd>${h.lat.toFixed(2)}°, ${h.lng.toFixed(2)}°</dd>
    </dl>
    <div class="actions"><a class="btn" href="${safeUrl(h.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 15)}${h.source === 'gdacs' ? 'GDACS' : 'NASA'}</a>
    <button class="btn secondary" data-action="copy">${icon('link', 15)}${esc(t().copyLink)}</button></div>
    ${relatedEvents(h, store, { storm: 'storm', flood: 'flood', volcano: 'volcano', fire: 'fire', landslide: 'landslide' }[h.type])}`;
}

export function satDetail(sat) {
  const zh = getLang() === 'zh';
  return `<div class="d-head">
      <div class="d-top"><span class="badge">${icon('satellite', 12)}${esc(t().satellites)}</span><span>NORAD ${sat.norad}</span>${closeBtn()}</div>
      <h2 class="d-title">${esc(zh ? sat.zh : sat.name)}</h2>
      <div class="d-sub">${esc(zh ? sat.name : sat.zh)}</div>
    </div>
    <dl class="kv" id="sat-live">${satKv(sat)}</dl>
    <p class="about">${zh ? '位置由 CelesTrak 发布的两行轨道根数（TLE）通过 SGP4 模型实时推算，虚线为未来 90 分钟的星下点轨迹。' : 'Position propagated live with SGP4 from CelesTrak two-line elements; the dashed line is the ground track for the next 90 minutes.'}</p>`;
}

export function satKv(p) {
  return `<dt>${esc(t().altitude)}</dt><dd>${p.heightKm?.toFixed(0) ?? '—'} km</dd>
    <dt>${esc(t().speed)}</dt><dd>${p.speed ? (p.speed * 3600).toFixed(0) : '—'} km/h</dd>
    <dt>${esc(t().position)}</dt><dd>${p.lat.toFixed(2)}°, ${p.lng.toFixed(2)}°</dd>`;
}
