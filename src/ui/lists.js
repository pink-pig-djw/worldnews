// Side panel / bottom-sheet tab contents.
import { CAT, HAZARD_COLOR, QUAKE_COLOR, SUB_ICON, TIME_WINDOWS } from '../config.js';
import { getLang, t, timeAgo } from '../i18n.js';
import { countryName, flag, placeName } from '../data/store.js';
import { esc } from './dom.js';
import { icon } from './icons.js';

const seg = (action, options, current) =>
  `<div class="seg">${options.map(([v, label]) => `<button data-action="${action}" data-v="${v}" class="${String(v) === String(current) ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;

function srcName(store, id) {
  const s = store.source(id);
  return getLang() === 'zh' ? s.zh || s.name : s.name;
}

export function feedTab(store, ui) {
  const v = store.view;
  const f = store.filters;
  const rows = [...v.headlines].sort((a, b) => (ui.sort === 'latest' ? b.time - a.time : b.w - a.w)).slice(0, 120);
  const now = Date.now() / 1000;
  return `<div class="controls">
      ${seg('window', TIME_WINDOWS.map((h) => [h, t().hours(h)]), f.windowHours)}
      ${seg('sort', [['important', t().sortImportant], ['latest', t().sortLatest]], ui.sort)}
      ${seg('lang', [['all', t().langAll], ['zh', '中文'], ['en', 'EN']], f.lang)}
    </div>
    ${
      rows.length
        ? rows
            .map(({ lead: s, items }) => {
              const c = CAT[s.cat] || CAT.other;
              const others = new Set(items.map((i) => i.source)).size - 1;
              const isNew = items.some((i) => i.fresh);
              return `<button class="row${isNew ? ' is-new' : ''}" data-action="story" data-id="${esc(s.id)}" style="--c:${c.color}">
                <span class="row-ico">${icon(SUB_ICON[s.sub] || c.icon, 15)}</span>
                <span class="row-main"><span class="row-title" lang="${s.lang === 'zh' ? 'zh-CN' : 'en'}">${isNew ? `<span class="new-badge">${esc(t().newBadge)}</span>` : ''}${esc(s.title)}</span>
                <span class="row-meta">${s.loc ? `<span>${flag(s.loc.cc)} ${esc(placeName(s.loc))}</span><span class="sep">·</span>` : ''}<span>${esc(srcName(store, s.source))}${others > 0 ? ` +${others}` : ''}</span><span class="sep">·</span><span>${esc(timeAgo(s.time, now))}</span></span></span>
              </button>`;
            })
            .join('')
        : `<div class="empty">${esc(t().noStories)}</div>`
    }`;
}

export function hotTab(store) {
  const v = store.view;
  const countries = v.countries.slice(0, 30);
  const max = countries[0]?.score || 1;
  const conflict = v.places.filter((p) => p.topCat === 'conflict').slice(0, 12);
  return `<div class="section-h">${icon('flame', 13)} ${esc(t().hotspots)}</div>
    ${
      countries
        .map((c, i) => {
          const col = CAT[c.topCat]?.color || '#fff';
          const diff = c.recent - c.before;
          const trend = v.trendsReliable && c.before + c.recent >= 3 && Math.abs(diff) >= 2 ? `<span class="trend ${diff > 0 ? 'up' : 'down'}">${icon(diff > 0 ? 'up' : 'down', 11)}${esc(diff > 0 ? t().trendUp : t().trendDown)}</span>` : '';
          return `<button class="row" data-action="country" data-cc="${esc(c.cc)}" style="--c:${col}">
            <span class="rank">${i + 1}</span>
            <span class="row-main"><span class="row-title">${flag(c.cc)} ${esc(countryName(c.cc))}</span>
            <span class="row-meta"><span class="badge">${esc(t().cats[c.topCat])}</span>${trend}</span>
            <span class="bar"><i style="width:${Math.max(4, (c.score / max) * 100).toFixed(1)}%"></i></span></span>
            <span class="count">${c.count}</span>
          </button>`;
        })
        .join('') || `<div class="empty">${esc(t().noStories)}</div>`
    }
    ${
      conflict.length
        ? `<div class="section-h">${icon('crosshair', 13)} ${esc(t().conflictZones)}</div>${conflict
            .map(
              (p) => `<button class="row" data-action="place" data-id="${esc(p.id)}" style="--c:${CAT.conflict.color}">
            <span class="row-ico">${icon(SUB_ICON[p.stories[0]?.sub] || 'crosshair', 15)}</span>
            <span class="row-main"><span class="row-title">${esc(placeName(p))}</span>
            <span class="row-meta"><span>${esc(p.stories[0]?.title || '')}</span></span></span>
            <span class="count">${p.count}</span></button>`,
            )
            .join('')}`
        : ''
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
            <span class="row-ico">${icon({ storm: 'cyclone', flood: 'waves', volcano: 'volcano', fire: 'flame', drought: 'thermo', heat: 'thermo', landslide: 'mountain', quake: 'quake' }[h.type] || 'alert', 15)}</span>
            <span class="row-main"><span class="row-title">${esc(h.title)}</span>
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
          <span class="row-main"><span class="row-title">${esc(q.place)}</span><span class="row-meta"><span>${esc(timeAgo(q.time))}</span><span class="sep">·</span><span>${q.depth} km</span>${q.tsunami ? `<span class="badge" style="--c:#ff9a3c">${esc(t().tsunami)}</span>` : ''}</span></span>
        </button>`,
        )
        .join('') || `<div class="empty">—</div>`
    }
    ${satRows ? `<div class="section-h">${icon('satellite', 13)} ${esc(t().satellites)}</div>${satRows}` : ''}`;
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
    <div class="set-row"><label for="sw-rotate">${esc(s.autoRotate)}</label><span class="switch"><input type="checkbox" id="sw-rotate" data-action="autorotate" ${settings.autoRotate ? 'checked' : ''}></span></div></div>
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
