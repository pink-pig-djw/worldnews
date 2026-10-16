// Side panel / bottom-sheet tab contents.
import { CAT, HAZARD_COLOR, QUAKE_COLOR, TIME_WINDOWS } from '../config.js';
import { getLang, t, timeAgo } from '../i18n.js';
import { countryName, flag } from '../data/store.js';
import { hazardText, quakePlace } from '../data/localize.js';
import { eventRow, eventRows, sevBars } from './panels.js';
import { downloadProgress, translationStatus } from '../data/translate.js';
import { esc } from './dom.js';
import { icon } from './icons.js';

const seg = (action, options, current) =>
  `<div class="seg">${options.map(([v, label]) => `<button data-action="${action}" data-v="${v}" class="${String(v) === String(current) ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;

export function feedTab(store, ui) {
  const v = store.view;
  const f = store.filters;
  const rows = [...v.events].sort((a, b) => (ui.sort === 'latest' ? b.l - a.l : b.w - a.w)).slice(0, 120);
  return `${translationBanner()}<div class="controls">
      ${seg('window', TIME_WINDOWS.map((h) => [h, t().hours(h)]), f.windowHours)}
      ${seg('sort', [['important', t().sortImportant], ['latest', t().sortLatest]], ui.sort)}
      ${seg('lang', [['all', t().langAll], ['zh', '中文'], ['en', 'EN']], f.lang)}
    </div>
    ${rows.length ? eventRows(rows, store, { limit: 120 }) : `<div class="empty">${esc(t().noStories)}</div>`}`;
}

/** In the Chinese interface: offer (or report progress of) on-device translation of English reports. */
function translationBanner() {
  if (getLang() !== 'zh') return '';
  const st = translationStatus();
  const tr = t().tr;
  if (st === 'needs-download')
    return `<div class="tr-banner">${icon('translate', 16)}<span>${esc(tr.offer)}</span><button class="btn" data-action="enable-translate">${esc(tr.enable)}</button></div>`;
  if (st === 'downloading') return `<div class="tr-banner">${icon('translate', 16)}<span>${esc(tr.downloading(Math.round(downloadProgress() * 100)))}</span></div>`;
  return '';
}

/** Official alerts that are severe but that our sources barely report. */
export function overlookedHazards(store, shownEvents = new Set()) {
  const now = Date.now() / 1000;
  const raw = store.raw || {};
  // alerts whose news event is already listed don't need a second row
  const listed = (h) => h.ev && shownEvents.has(store.aliasOf(h.ev));
  const hz = (raw.hazards || []).filter((h) => (h.alert === 'red' || h.alert === 'orange') && h.type !== 'drought' && now - (h.until || h.time) < 3 * 86400 && (h.v || 0) <= 1 && !listed(h));
  const qs = (raw.quakes || []).filter((q) => (q.mag >= 7 || q.alert === 'orange' || q.alert === 'red') && now - q.time < 72 * 3600 && (q.v || 0) <= 1 && !listed(q));
  return [...qs.map((q) => ({ kind: 'quake', item: q, sev: q.mag / 10 })), ...hz.map((h) => ({ kind: 'hazard', item: h, sev: h.alert === 'red' ? 0.85 : 0.68 }))].sort((a, b) => b.sev - a.sev);
}

function hazardRow({ kind, item }) {
  if (kind === 'quake') {
    const q = item;
    return `<button class="row" data-action="quake" data-id="${esc(q.id)}" style="--c:${q.alert && q.alert !== 'green' ? HAZARD_COLOR[q.alert] : QUAKE_COLOR}">
      <span class="mag">${q.mag.toFixed(1)}</span>
      <span class="row-main"><span class="row-title">${esc(quakePlace(q))}</span><span class="row-meta"><span>USGS</span><span class="sep">·</span><span>${esc(timeAgo(q.time))}</span><span class="gap-tag">${icon('flag', 10)}${esc(q.v ? t().gapQuakeFew(q.v) : t().gapQuake)}</span></span></span></button>`;
  }
  const h = item;
  return `<button class="row" data-action="hazard" data-id="${esc(h.id)}" style="--c:${HAZARD_COLOR[h.alert] || '#ffcc33'}">
    <span class="row-ico">${icon(HAZ_ICON[h.type] || 'alert', 15)}</span>
    <span class="row-main"><span class="row-title">${esc(hazardText(h, 'title'))}</span><span class="row-meta"><span class="badge">${esc(t().alertLevel[h.alert])}</span><span class="gap-tag">${icon('flag', 10)}${esc(h.v ? t().gapHazardFew(h.v) : t().gapHazard)}</span></span></span></button>`;
}

const HAZ_ICON = { storm: 'cyclone', flood: 'waves', volcano: 'volcano', fire: 'flame', drought: 'thermo', heat: 'thermo', landslide: 'mountain', quake: 'quake' };

export function hotTab(store, ui) {
  const v = store.view;
  const sort = ui.hotSort || 'imp';
  const key = { imp: (e) => e.w, sev: (e) => e.sev + e.w * 0.01, att: (e) => e.v + e.att * 0.1 + e.w * 0.001 }[sort];
  const ranked = [...v.events].sort((a, b) => key(b) - key(a)).slice(0, 15);
  const gaps = v.gaps.slice(0, 6);
  const alerts = overlookedHazards(store, new Set(gaps.map((e) => e.id))).slice(0, 4);
  const countries = v.countries.slice(0, 25);
  const max = countries[0]?.score || 1;
  return `${
    gaps.length || alerts.length
      ? `<div class="section-h gap-h">${icon('flag', 13)} ${esc(t().gap)}</div><p class="hint">${esc(t().gapWhy)}</p>${eventRows(gaps, store)}${alerts.map(hazardRow).join('')}`
      : ''
  }
    <div class="section-h">${icon('flame', 13)} ${esc(t().hotspots)}</div>
    <div class="controls">${seg('hot-sort', [['imp', t().sortBy.imp], ['sev', t().sortBy.sev], ['att', t().sortBy.att]], sort)}</div>
    <p class="hint">${esc(t().rankHint)}</p>
    ${ranked.length ? ranked.map((e, i) => eventRow(e, store, { rank: i + 1 })).join('') : `<div class="empty">${esc(t().noStories)}</div>`}
    <div class="section-h">${icon('globe', 13)} ${esc(t().countriesH)}</div>
    ${
      countries
        .map((c, i) => {
          const col = CAT[c.topCat]?.color || '#fff';
          const diff = c.recent - c.before;
          const trend = v.trendsReliable && c.before + c.recent >= 3 && Math.abs(diff) >= 2 ? `<span class="trend ${diff > 0 ? 'up' : 'down'}">${icon(diff > 0 ? 'up' : 'down', 11)}${esc(diff > 0 ? t().trendUp : t().trendDown)}</span>` : '';
          return `<button class="row" data-action="country" data-cc="${esc(c.cc)}" style="--c:${col}">
            <span class="rank">${i + 1}</span>
            <span class="row-main"><span class="row-title">${flag(c.cc)} ${esc(countryName(c.cc))}</span>
            <span class="row-meta"><span class="badge">${esc(t().cats[c.topCat])}</span><span>${esc(t().events(c.count))}</span>${trend}</span>
            <span class="bar"><i style="width:${Math.max(4, (c.score / max) * 100).toFixed(1)}%"></i></span></span>
            <span class="row-side">${sevBars(c.maxSev, c.topCat)}</span>
          </button>`;
        })
        .join('') || `<div class="empty">${esc(t().noStories)}</div>`
    }`;
}

export function hazardsTab(store, sats) {
  const raw = store.raw || {};
  const hz = (raw.hazards || []).slice().sort((a, b) => (rankAlert(b.alert) - rankAlert(a.alert)) || b.time - a.time).slice(0, 60);
  const qs = (raw.quakes || []).slice().sort((a, b) => b.time - a.time).slice(0, 60);
  const satRows = sats
    .map(
      (s) => `<button class="row" data-action="sat" data-id="${esc(s.id)}" style="--c:#8fdcff"><span class="row-ico">${icon('satellite', 15)}</span>
      <span class="row-main"><span class="row-title">${esc(getLang() === 'zh' ? s.zh : s.name)}</span><span class="row-meta">${s.heightKm.toFixed(0)} km · ${s.lat.toFixed(1)}°, ${s.lng.toFixed(1)}°</span></span></button>`,
    )
    .join('');
  return `<div class="section-h">${icon('alert', 13)} ${esc(t().weather)}</div>
    ${
      hz
        .map((h) => {
          const c = HAZARD_COLOR[h.alert] || '#ffcc33';
          return `<button class="row" data-action="hazard" data-id="${esc(h.id)}" style="--c:${c}">
            <span class="row-ico">${icon(HAZ_ICON[h.type] || 'alert', 15)}</span>
            <span class="row-main"><span class="row-title">${esc(hazardText(h, 'title'))}</span>
            <span class="row-meta">${h.alert ? `<span class="badge">${esc(t().alertLevel[h.alert])}</span>` : ''}<span>${esc(t().subs[h.type] || h.type)}</span><span class="sep">·</span><span>${esc(timeAgo(h.time))}</span></span></span>
          </button>`;
        })
        .join('') || `<div class="empty">—</div>`
    }
    <div class="section-h">${icon('quake', 13)} ${esc(t().quakes)}</div>
    ${
      qs
        .map(
          (q) => `<button class="row" data-action="quake" data-id="${esc(q.id)}" style="--c:${q.alert && q.alert !== 'green' ? HAZARD_COLOR[q.alert] : QUAKE_COLOR}">
          <span class="mag">${q.mag.toFixed(1)}</span>
          <span class="row-main"><span class="row-title">${esc(quakePlace(q))}</span><span class="row-meta"><span>${esc(timeAgo(q.time))}</span><span class="sep">·</span><span>${q.depth} km</span>${q.tsunami ? `<span class="badge" style="--c:#ff9a3c">${esc(t().tsunami)}</span>` : ''}</span></span>
        </button>`,
        )
        .join('') || `<div class="empty">—</div>`
    }
    ${satRows ? `<div class="section-h">${icon('satellite', 13)} ${esc(t().satellites)}</div>${satRows}` : ''}`;
}

function translationSetting(settings) {
  const st = translationStatus();
  const tr = t().tr;
  const note = { 'needs-download': tr.offer, downloading: tr.downloading(Math.round(downloadProgress() * 100)), ready: tr.ready, unsupported: tr.unsupported, error: tr.error, off: tr.off }[st] || '';
  const toggle = st === 'unsupported' ? '' : `<span class="switch"><input type="checkbox" id="sw-tr" data-action="autotranslate" ${settings.autoTranslate ? 'checked' : ''}></span>`;
  return `<div class="set-row"><label for="sw-tr">${esc(tr.label)}<small class="set-note">${esc(note)}</small></label>${toggle}</div>
    ${st === 'needs-download' && settings.autoTranslate ? `<div class="set-row"><button class="btn" data-action="enable-translate">${icon('translate', 15)}${esc(tr.enable)}</button></div>` : ''}`;
}

const rankAlert = (a) => ({ red: 3, orange: 2, green: 1 })[a] || 0;

const LAYER_KEYS = ['markers', 'arcs', 'pillars', 'rings', 'quakes', 'hazards', 'sats', 'labels', 'borders', 'clouds', 'terminator', 'heat'];

export function settingsTab(store, settings) {
  const s = t().settings;
  const sources = store.raw?.sources || [];
  const toggle = (key, label, checked) =>
    `<div class="set-row"><label for="sw-${key}">${esc(label)}</label><span class="switch"><input type="checkbox" id="sw-${key}" data-action="layer" data-layer="${key}" ${checked ? 'checked' : ''}></span></div>`;
  return `<div class="section-h">${esc(s.language)}</div>
    <div class="set-group"><div class="set-row">${seg('set-lang', [['zh', '中文'], ['en', 'English']], getLang())}</div></div>
    <div class="section-h">${esc(s.style)}</div>
    <div class="set-group"><div class="set-row">${seg('set-style', [['real', s.styleReal], ['night', s.styleNight]], settings.style)}</div>
    <div class="set-row"><label for="sw-rotate">${esc(s.autoRotate)}</label><span class="switch"><input type="checkbox" id="sw-rotate" data-action="autorotate" ${settings.autoRotate ? 'checked' : ''}></span></div>
    ${getLang() === 'zh' ? translationSetting(settings) : ''}</div>
    <div class="section-h">${esc(s.layers)}</div>
    <div class="set-group">${LAYER_KEYS.map((k) => toggle(k, t().layers[k], settings.layers[k])).join('')}</div>
    <div class="section-h">${esc(s.quality)}</div>
    <div class="set-group"><div class="set-row">${seg('quality', [['high', s.high], ['medium', s.medium], ['low', s.low]], settings.quality)}</div></div>
    <div class="section-h">${esc(s.sources)}</div>
    <div class="set-group">${sources
      .map(
        (src) => `<div class="src-row"><span class="${src.ok ? 'ok' : 'bad'}">${src.ok ? '●' : '○'}</span><span class="nm">${esc(getLang() === 'zh' ? src.zh || src.name : src.name)}</span>
        <span class="badge" style="--c:${src.kind === 'state' ? '#ffb02e' : src.kind === 'un' ? '#5cc8ff' : '#9aa5b1'}">${esc(t().kindsOfSource[src.kind] || src.kind)}</span>
        <span class="count" style="font-size:11px">${src.ok ? esc(t().items(src.items)) : esc(t().failed)}</span></div>`,
      )
      .join('')}</div>
    <div class="section-h">${esc(s.about)}</div>
    <p class="about">${esc(t().aboutText)}</p>`;
}
