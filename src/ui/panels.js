// Detail panel renderers. They return HTML strings; main.js wires events via data-action.
import { CAT, HAZARD_COLOR, QUAKE_COLOR, SUB_ICON } from '../config.js';
import { getLang, t, timeAgo } from '../i18n.js';
import { countryName, flag, isRealCc, placeName } from '../data/store.js';
import { esc, fmtTime, safeUrl, sevLevel } from './dom.js';
import { icon } from './icons.js';

const closeBtn = () => `<button class="d-close" data-action="close" aria-label="${t().close}">${icon('x', 16)}</button>`;

export function catTag(s) {
  const c = CAT[s.cat] || CAT.other;
  const sub = s.sub && t().subs[s.sub] ? ` · ${t().subs[s.sub]}` : '';
  return `<span class="badge" style="--c:${c.color}">${icon(SUB_ICON[s.sub] || c.icon, 11)}${esc(t().cats[s.cat] || s.cat)}${esc(sub)}</span>`;
}

function sevBars(s) {
  const lvl = sevLevel(s.sev);
  const c = CAT[s.cat]?.color || '#fff';
  return `<span class="sev" title="${esc(t().sev[lvl])}" style="--c:${c}">${[1, 2, 3, 4].map((i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</span>`;
}

function sourceName(store, id) {
  const src = store.source(id);
  return getLang() === 'zh' ? src.zh || src.name : src.name;
}

export function storyHtml(s, store, { others = [], showPlace = false } = {}) {
  const now = Date.now() / 1000;
  const place = showPlace && s.loc ? ` · ${esc(placeName(s.loc))}` : '';
  const othersHtml = others.length
    ? `<button class="others" data-action="others">${icon('news', 13)}${esc(t().alsoBy(others.length))}</button>
       <ul class="others-list" hidden>${others
         .map((o) => `<li><a href="${safeUrl(o.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(sourceName(store, o.source))}</b>${esc(o.title)}</a></li>`)
         .join('')}</ul>`
    : '';
  const canTranslate = getLang() === 'zh' && s.lang === 'en' && 'Translator' in self;
  const img = s.image ? `<img class="story-img" src="${safeUrl(s.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<article class="story" data-story="${esc(s.id)}">
    <div class="story-main">
      <div class="story-meta">${s.fresh ? `<span class="new-badge">${esc(t().newBadge)}</span>` : ''}${catTag(s)}${sevBars(s)}<span class="src">${esc(sourceName(store, s.source))}</span><span>${esc(timeAgo(s.time, now))}${place}</span></div>
      <a class="story-title" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer" lang="${s.lang === 'zh' ? 'zh-CN' : 'en'}">${esc(s.title)}</a>
      ${s.summary ? `<p class="story-sum" lang="${s.lang === 'zh' ? 'zh-CN' : 'en'}">${esc(s.summary)}</p>` : ''}
      <div class="story-foot">
        <a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 13)}${esc(t().readSource)}</a>
        ${canTranslate ? `<button data-action="translate">${icon('translate', 13)}${esc(t().translate)}</button>` : ''}
        ${othersHtml}
      </div>
    </div>${img}
  </article>`;
}

/** Group stories by event cluster: lead story + the same event from other outlets. */
export function groupedStories(stories, store, opts = {}) {
  const groups = new Map();
  for (const s of stories) {
    const k = s.cluster || s.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const list = [...groups.values()].map((items) => items.sort((a, b) => b.w - a.w)).sort((a, b) => b[0].w - a[0].w);
  const limit = opts.limit ?? 60;
  return list
    .slice(0, limit)
    .map((items) => storyHtml(items[0], store, { others: items.slice(1), showPlace: opts.showPlace }))
    .join('');
}

function catBar(stories) {
  const counts = {};
  for (const s of stories) counts[s.cat] = (counts[s.cat] || 0) + 1;
  const total = stories.length || 1;
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

function stats(stories) {
  const sources = new Set(stories.map((s) => s.source)).size;
  const latest = Math.max(0, ...stories.map((s) => s.time));
  return `<div class="stats">
    <div class="stat"><b>${stories.length}</b><span>${esc(t().reports(stories.length).replace(/^\d+\s*/, ''))}</span></div>
    <div class="stat"><b>${sources}</b><span>${esc(t().sources(sources).replace(/^\d+\s*/, ''))}</span></div>
    <div class="stat"><b style="font-size:15px">${latest ? esc(timeAgo(latest)) : '—'}</b><span>${esc(t().breaking)}</span></div>
  </div>`;
}

function relatedChips(stories) {
  const cnt = new Map();
  for (const s of stories) for (const cc of s.rel || []) if (isRealCc(cc)) cnt.set(cc, (cnt.get(cc) || 0) + 1);
  if (!cnt.size) return '';
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<div class="section-h">${esc(t().related)}</div><div class="chips-row">${top
    .map(([cc, n]) => `<button class="cchip" data-action="country" data-cc="${esc(cc)}">${flag(cc)} ${esc(countryName(cc))} <b style="color:var(--muted)">${n}</b></button>`)
    .join('')}</div>`;
}

export function placeDetail(place, store) {
  const stories = place.stories;
  const k = t().kinds[place.kind] || '';
  const cc = isRealCc(place.cc) ? place.cc : null;
  const parent = cc && place.kind !== 'country' ? `${flag(cc)} ${esc(countryName(cc))}` : '';
  return `<div class="d-head">
      <div class="d-top"><span class="badge">${esc(k)}</span>${parent ? `<span>${parent}</span>` : ''}${closeBtn()}</div>
      <h2 class="d-title">${place.kind === 'country' && cc ? `<span class="flag">${flag(cc)}</span>` : ''}${esc(placeName(place))}</h2>
      <div class="d-sub">${esc(getLang() === 'zh' ? place.name || '' : place.zh || '')}</div>
    </div>
    ${stats(stories)}${catBar(stories)}${histogram(stories, store)}${relatedChips(stories)}
    <div class="section-h">${esc(t().reports(stories.length))}</div>
    ${groupedStories(stories, store)}
    <div class="actions">
      ${cc && place.kind !== 'country' ? `<button class="btn secondary" data-action="country" data-cc="${esc(cc)}">${icon('globe', 15)}${esc(t().seeCountry)}</button>` : ''}
      <button class="btn secondary" data-action="copy">${icon('link', 15)}${esc(t().copyLink)}</button>
    </div>`;
}

export function clusterDetail(cluster, store) {
  const stories = cluster.places.flatMap((p) => p.stories);
  return `<div class="d-head">
      <div class="d-top"><span class="badge">${esc(t().clusterPlaces(cluster.places.length))}</span>${closeBtn()}</div>
      <h2 class="d-title">${esc(placeName(cluster.lead))} <span style="color:var(--muted);font-size:16px">+${cluster.places.length - 1}</span></h2>
    </div>
    ${stats(stories)}${catBar(stories)}
    <div class="section-h">${esc(t().hotspots)}</div>
    ${cluster.places
      .map(
        (p) => `<div class="place-row" data-action="place" data-id="${esc(p.id)}" style="--c:${CAT[p.topCat]?.color}">
          <span class="dot"></span><span class="nm">${esc(placeName(p))}</span><span class="count">${p.count}</span>${icon('chevron', 14)}</div>`,
      )
      .join('')}
    <div class="actions"><button class="btn" data-action="zoom">${icon('search', 15)}${esc(t().zoomIn)}</button></div>
    <div class="section-h">${esc(t().reports(stories.length))}</div>
    ${groupedStories(stories, store, { showPlace: true, limit: 30 })}`;
}

export function countryDetail(cc, store) {
  const { located, involving } = store.storiesForCountry(cc);
  const all = [...located, ...involving];
  return `<div class="d-head">
      <div class="d-top"><span class="badge">${esc(t().kinds.country)}</span>${closeBtn()}</div>
      <h2 class="d-title"><span class="flag">${flag(cc)}</span>${esc(countryName(cc))}</h2>
    </div>
    ${located.length ? stats(located) + catBar(located) + histogram(located, store) : ''}
    ${relatedChips(all)}
    ${located.length ? `<div class="section-h">${esc(t().reports(located.length))}</div>${groupedStories(located, store, { showPlace: true })}` : `<div class="empty">${esc(t().noStories)}</div>`}
    ${involving.length ? `<div class="section-h">${esc(t().involving)} · ${involving.length}</div>${groupedStories(involving, store, { showPlace: true, limit: 25 })}` : ''}
    <div class="actions"><button class="btn secondary" data-action="copy">${icon('link', 15)}${esc(t().copyLink)}</button></div>`;
}

function nearbyNews(lat, lng, store, filterFn) {
  const v = store.view;
  return v.stories.filter((s) => s.loc && Math.abs(s.loc.lat - lat) < 6 && Math.abs(s.loc.lng - lng) < 8 && filterFn(s));
}

export function quakeDetail(q, store) {
  const c = q.alert && q.alert !== 'green' ? HAZARD_COLOR[q.alert] : QUAKE_COLOR;
  const news = nearbyNews(q.lat, q.lng, store, (s) => s.sub === 'quake' || s.sub === 'tsunami');
  return `<div class="d-head">
      <div class="d-top"><span class="badge" style="--c:${c}">${icon('quake', 12)}${esc(t().subs.quake)}</span><span>USGS</span>${closeBtn()}</div>
      <div style="display:flex;align-items:baseline;gap:12px;margin-top:10px"><span class="bignum" style="--c:${c}">M${q.mag.toFixed(1)}</span></div>
      <h2 class="d-title" style="font-size:18px">${esc(q.place)}</h2>
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
    ${news.length ? `<div class="section-h">${esc(t().reports(news.length))}</div>${groupedStories(news, store, { showPlace: true, limit: 10 })}` : ''}`;
}

export function hazardDetail(h, store) {
  const c = HAZARD_COLOR[h.alert] || '#ffcc33';
  const name = t().subs[h.type] || h.type;
  const news = nearbyNews(h.lat, h.lng, store, (s) => s.cat === 'disaster');
  return `<div class="d-head">
      <div class="d-top"><span class="badge" style="--c:${c}">${esc(name)}</span><span>${esc(t().alertLevel[h.alert] || '')}</span><span>${h.source === 'gdacs' ? 'GDACS' : 'NASA EONET'}</span>${closeBtn()}</div>
      <h2 class="d-title" style="font-size:19px">${esc(h.title)}</h2>
    </div>
    ${h.summary ? `<p class="about" style="margin-top:4px">${esc(h.summary)}</p>` : ''}
    <dl class="kv">
      <dt>${esc(t().breaking)}</dt><dd>${esc(fmtTime(h.time))} · ${esc(timeAgo(h.time))}</dd>
      ${h.severity ? `<dt>${esc(t().severity)}</dt><dd>${esc(h.severity)}</dd>` : ''}
      ${h.population ? `<dt>${esc(t().population)}</dt><dd>${esc(h.population)}</dd>` : ''}
      ${h.country ? `<dt>${esc(t().kinds.country)}</dt><dd>${esc(h.country)}</dd>` : ''}
      <dt>${esc(t().position)}</dt><dd>${h.lat.toFixed(2)}°, ${h.lng.toFixed(2)}°</dd>
    </dl>
    <div class="actions"><a class="btn" href="${safeUrl(h.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 15)}${h.source === 'gdacs' ? 'GDACS' : 'NASA'}</a>
    <button class="btn secondary" data-action="copy">${icon('link', 15)}${esc(t().copyLink)}</button></div>
    ${news.length ? `<div class="section-h">${esc(t().reports(news.length))}</div>${groupedStories(news, store, { showPlace: true, limit: 10 })}` : ''}`;
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
