import './styles/main.css';
import { CAT, CATEGORIES, DATA_URL, HAZARD_COLOR, HIDDEN_POLL_MS, isMobile, LIVE_QUAKES_URL, POLL_MS, QUAKE_COLOR, STATUS_URL, SUB_ICON } from './config.js';
import { getLang, setLang, t, timeAgo } from './i18n.js';
import { allCountries, countryInfo, countryName, flag, isRealCc, placeName, store } from './data/store.js';
import { createGlobeView, hexToRgba } from './globe/globe.js';
import { createMarkerLayer } from './globe/markers.js';
import { createSatellites } from './globe/satellites.js';
import { $, $$, esc, toast } from './ui/dom.js';
import { normalizeUsgs } from '../scripts/lib/usgs.mjs';
import { eventStory, eventTitle, quakePlace } from './data/localize.js';
import { disableTranslation, enableTranslation, initTranslation, translateFirst, translateNow, translateStories } from './data/translate.js';
import { icon } from './ui/icons.js';
import { feedTab, hazardsTab, hotTab, settingsTab } from './ui/lists.js';
import { archivedEventDetail, clockHtml, clusterDetail, countryDetail, eventDetail, hazardDetail, placeDetail, quakeDetail, satDetail, satKv, sinceDetail, timelineNodes } from './ui/panels.js';
import { archivedSince, diffSince, hasNews, previousVisit, rememberVisit, touchVisit } from './data/visit.js';
import { pickWorldNow, worldNowHtml, worldNowStrip } from './ui/worldnow.js';

// ---------------------------------------------------------------- settings
const DEFAULT_LAYERS = { markers: true, arcs: true, pillars: true, rings: true, quakes: true, hazards: true, sats: true, labels: true, borders: true, clouds: true, terminator: true, heat: false };
function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('wp-settings') || '{}');
  } catch {
    /* private mode */
  }
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) < 4;
  return {
    lang: saved.lang || (/^zh/i.test(navigator.language || 'zh') ? 'zh' : 'en'),
    style: saved.style || 'real',
    quality: saved.quality || (lowEnd ? 'medium' : 'high'),
    autoRotate: saved.autoRotate ?? true,
    autoTranslate: saved.autoTranslate ?? true,
    layers: { ...DEFAULT_LAYERS, ...(saved.layers || {}) },
  };
}
const settings = loadSettings();
function saveSettings() {
  try {
    localStorage.setItem('wp-settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
setLang(settings.lang);

// ---------------------------------------------------------------- shell
const app = $('#app');
const ui = { tab: isMobile() ? 'map' : 'feed', sort: 'important', hotSort: 'imp', current: null, tour: null };
// live-update bookkeeping (see "live updates" below)
const live = { lastCheck: 0, lastFull: 0, pending: null, staleVersion: null, quakeTry: 0, quakesAt: 0, quakes: [], quakesPrimed: false, flashes: [], flashTimer: 0, unseen: 0 };

function applyStaticText() {
  for (const el of $$('[data-i18n]')) el.textContent = t()[el.dataset.i18n];
  updateTitle();
  $('#search-btn').innerHTML = icon('search', 19);
  $('#search-btn').title = t().searchPh;
  $('#tour-btn').innerHTML = icon(ui.tour ? 'pause' : 'play', 18);
  $('#tour-btn').title = ui.tour ? t().stopTour : t().tour;
  $('#legend-btn').innerHTML = icon('key', 19);
  $('#legend-btn').title = t().legend;
  $('#search-input').placeholder = t().searchPh;
  $('.search-ico').innerHTML = icon('search', 18);
  $('#search-close').innerHTML = icon('x', 18);
  $('#loader-text').textContent = t().loading;
  $('#sample-banner').textContent = t().sampleBanner;
}

const TABS = [
  ['map', 'globe'],
  ['feed', 'news'],
  ['hot', 'flame'],
  ['hazards', 'alert'],
  ['settings', 'sliders'],
];
function renderTabs() {
  $('#tabbar').innerHTML = TABS.map(([id, ic]) => `<button class="tab ${ui.tab === id ? 'on' : ''}" data-tab="${id}" role="tab">${icon(ic, 20)}<span>${esc(t().tabs[id])}</span></button>`).join('');
  const side = ui.tab === 'map' ? 'feed' : ui.tab;
  $('#side-tabs').innerHTML = TABS.map(([id, ic]) => `<button class="side-tab ${side === id ? 'on' : ''}" data-tab="${id}" role="tab">${icon(ic, 15)}${esc(t().tabs[id])}</button>`).join('');
}

function setTab(tab, fromHistory = false) {
  const was = ui.tab;
  if (isMobile() && !fromHistory) {
    if (was === 'map' && tab !== 'map') pushSheet();
    else if (was !== 'map' && tab === 'map') popSheet();
  }
  ui.tab = tab;
  app.dataset.tab = tab;
  renderTabs();
  renderSide();
  if (isMobile()) {
    $('#sidebar').style.removeProperty('--sheet-h');
    updateOffset();
  }
}

function renderChips() {
  const all = store.filters.cats.size === CATEGORIES.length;
  const counts = {};
  const minTime = Date.now() / 1000 - store.filters.windowHours * 3600;
  // events with a report in the time window, per category
  let total = 0;
  for (const e of store.events) {
    if (!e.reports.some((s) => s.time >= minTime)) continue;
    counts[e.cat] = (counts[e.cat] || 0) + 1;
    total++;
  }
  $('#cat-chips').innerHTML =
    `<button class="chip ${all ? 'on' : ''}" data-cat="all" style="--c:#5cc8ff">${esc(t().cats.all)} <b>${store.raw ? total : ''}</b></button>` +
    CATEGORIES.filter((c) => c.id !== 'other' || counts.other)
      .map((c) => {
        const on = store.filters.cats.has(c.id);
        return `<button class="chip ${on && !all ? 'on' : ''} ${!on ? 'off' : ''}" data-cat="${c.id}" style="--c:${c.color}"><span class="dot"></span>${esc(t().cats[c.id])} <b>${counts[c.id] || 0}</b></button>`;
      })
      .join('');
}

$('#cat-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const id = b.dataset.cat;
  const cats = store.filters.cats;
  const allIds = CATEGORIES.map((c) => c.id);
  let next;
  if (id === 'all') next = new Set(allIds);
  else if (cats.size === allIds.length) next = new Set([id]);
  else if (cats.has(id) && cats.size === 1) next = new Set(allIds);
  else {
    next = new Set(cats);
    next.has(id) ? next.delete(id) : next.add(id);
    if (!next.size) next = new Set(allIds);
  }
  store.setFilter({ cats: next });
});

// tab title, with the number of reports that arrived while the tab was in the background
function updateTitle() {
  const base = `${t().brand} · ${t().brandSub}`;
  document.title = live.unseen ? `(${live.unseen}) ${base}` : base;
}

// clock
function tickClock() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  $('#clock').innerHTML = `<div><span>${t().utc}</span>${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}</div><div><span>${esc(t().local)}</span>${pad(d.getHours())}:${pad(d.getMinutes())}</div>`;
  if (store.raw) {
    const gen = Date.parse(store.raw.generated) / 1000;
    $('#updated').textContent = t().updated(timeAgo(gen));
    $('#live-dot').className = `live-dot${ui.loadFailed ? ' down' : Date.now() / 1000 - gen > 60 * 60 ? ' stale' : ''}`;
  }
  // live local time in the open country/place panel
  for (const el of $$('#detail .d-clock')) {
    const { cc, lat, lng } = el.dataset;
    el.innerHTML = clockHtml({ cc, lat: lat != null ? Number(lat) : null, lng: lng != null ? Number(lng) : null });
  }
}
setInterval(tickClock, 1000);

// ---------------------------------------------------------------- globe
const container = $('#globe');
const view = createGlobeView(container, { quality: settings.quality });
const markers = createMarkerLayer(view, container, {
  onCluster: (c) => {
    hideTooltip();
    if (c.places.length > 1 && view.altitude > 0.35) selectCluster(c);
    else if (c.places[0].events.length === 1) selectEvent(c.places[0].events[0]);
    else selectPlace(c.places[0]);
  },
  onQuake: (q) => selectQuake(q),
  onHazard: (h) => selectHazard(h),
  onSat: (s) => selectSat(s.id),
  onHover: showMarkerTooltip,
});
let satellites = createSatellites([]);

fetch('geo/countries-110m.json')
  .then((r) => r.json())
  .then((fc) => view.setCountries(fc.features))
  .catch((err) => console.warn('countries', err));

function applyLayerSettings() {
  const L = settings.layers;
  markers.setLayers({ markers: L.markers, quakes: L.quakes, hazards: L.hazards, sats: L.sats, labels: L.labels });
  view.setClouds(L.clouds);
  view.setTerminator(L.terminator);
  view.setBorders(L.borders);
  view.setNightStyle(settings.style === 'night');
  renderLayers();
}

view.g.onPolygonHover((poly) => {
  if (isMobile()) return;
  const cc = poly?.properties?.code || null;
  view.setHoverCountry(cc);
  container.style.cursor = cc ? 'pointer' : '';
});
view.g.onGlobeClick((_, ev) => handleMapClick(ev, null));
view.g.onPolygonClick((poly, ev) => handleMapClick(ev, poly.properties.code));
view.g.onArcClick((arc, ev) => handleMapClick(ev, arc.from));
view.g.arcLabel((a) => `${flag(a.from)} ${esc(countryName(a.from))} → ${esc(placeName(store.view.placeById.get(a.to) || {}))} · ${esc(t().reports(a.count))}`);

function handleMapClick(ev, cc) {
  stopTour();
  if (wn.phoneOpen) {
    wn.phoneOpen = false;
    renderWorldNow();
  }
  const rect = container.getBoundingClientRect();
  const near = markers.nearest(ev.clientX - rect.left, ev.clientY - rect.top, isMobile() ? 34 : 20);
  if (near) {
    near.el.click();
    return;
  }
  if (cc && isRealCc(cc)) selectCountry(cc);
  else closeDetail();
}

// idle auto-rotate
let idleTimer;
function bumpIdle() {
  view.setAutoRotate(false);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (settings.autoRotate && !ui.current && !ui.tour) view.setAutoRotate(true);
  }, 25000);
}
view.onInteraction(() => {
  bumpIdle();
  stopTour();
  hideTooltip();
});

// ---------------------------------------------------------------- layers from data
function visibleQuakes() {
  const now = Date.now() / 1000;
  return (store.raw?.quakes || []).filter((q) => now - q.time < 3 * 86400 && (q.mag >= 5 || now - q.time < 86400));
}
function visibleHazards() {
  // every red/orange alert; only the freshest green alerts and natural events, so the map stays legible
  const hz = (store.raw?.hazards || []).slice().sort((a, b) => b.time - a.time);
  const severe = hz.filter((h) => h.alert === 'red' || h.alert === 'orange');
  const rest = hz.filter((h) => !severe.includes(h) && h.type !== 'drought');
  const fires = rest.filter((h) => h.type === 'fire').slice(0, 15);
  const others = rest.filter((h) => h.type !== 'fire').slice(0, 30);
  return [...severe, ...others, ...fires];
}

function renderLayers() {
  if (!store.raw) return;
  const v = store.view;
  const L = settings.layers;
  markers.setPlaces(v.places);
  markers.setQuakes(visibleQuakes());
  markers.setHazards(visibleHazards());

  // arcs (focus on the current selection)
  const cur = ui.current;
  const focus = cur?.type === 'place' ? cur.id : cur?.type === 'country' ? cur.cc : null;
  view.setArcs(L.arcs ? v.arcs.slice(0, isMobile() ? 14 : 32) : [], focus);

  // light pillars: media attention (independent outlets), separate from the dots' severity
  const phone = isMobile();
  const covered = [];
  const seenPlace = new Set();
  for (const e of [...v.events].filter((x) => x.v >= 2 && x.place).sort((a, b) => b.att - a.att || b.w - a.w)) {
    if (seenPlace.has(e.place.id)) continue;
    seenPlace.add(e.place.id);
    covered.push(e);
    if (covered.length >= (phone ? 16 : 32)) break;
  }
  view.setPillars(
    L.pillars
      ? covered.map((e) => {
          const n = Math.max(0, (e.att - 0.3) / 0.7);
          return { lat: e.place.lat, lng: e.place.lng, color: CAT[e.cat]?.color || '#fff', height: (0.015 + 0.2 * n) * (phone ? 0.6 : 1), width: (0.7 + 1.4 * n) * (phone ? 0.55 : 1) };
        })
      : [],
  );

  renderRings();
  renderPaths();

  // country heat tint
  if (L.heat) {
    const maxC = v.countries[0]?.score || 1;
    view.setHeat(new Map(v.countries.map((c) => [c.cc, { color: CAT[c.topCat]?.color || '#ff4d5e', t: Math.sqrt(c.score / maxC) }])));
  } else view.setHeat(null);
}

// sizes given in degrees look huge when zoomed in: scale them with the camera altitude
const zoomScale = () => Math.min(1, Math.max(0.12, view.altitude / 1.8));
let lastZoomScale = 1;
view.onFrame(() => {
  const k = zoomScale();
  if (Math.abs(Math.log(k / lastZoomScale)) > 0.25) {
    lastZoomScale = k;
    // don't mutate the scene from inside the render call
    setTimeout(() => {
      view.setArcScale(k < 1 ? Math.max(0.3, k) : 1);
      renderRings();
    }, 0);
  }
});

function renderRings() {
  const v = store.view;
  const rings = [];
  const zs = zoomScale() * (isMobile() ? 0.7 : 1);
  if (settings.layers.rings) {
    // ripples where something severe is happening or reports just came in; stronger = more severe
    for (const p of v.places.slice(0, 40)) {
      if (!(p.breaking || p.maxSev >= 0.72)) continue;
      const n = Math.min(1, Math.max(0, (p.maxSev - 0.4) / 0.5));
      rings.push({ lat: p.lat, lng: p.lng, color: CAT[p.topCat]?.color || '#fff', maxR: (1.6 + 3.2 * n) * zs, speed: (1.2 + 1.4 * n) * zs, period: 2400 - 900 * n, alpha: 0.7 });
      if (rings.length >= 18) break;
    }
    const now = Date.now() / 1000;
    if (settings.layers.quakes) {
      for (const q of visibleQuakes()) if (q.mag >= 5.5 && now - q.time < 86400) rings.push({ lat: q.lat, lng: q.lng, color: QUAKE_COLOR, maxR: (q.mag - 4) * 1.6 * zs, speed: 2.2 * zs, period: 1700, alpha: 0.8 });
    }
  }
  // bursts of light where reports (or quakes) just came in
  const nowMs = Date.now();
  live.flashes = live.flashes.filter((f) => f.until > nowMs);
  for (const f of live.flashes) rings.push({ lat: f.lat, lng: f.lng, color: f.color, maxR: 6 * zs, speed: 7 * zs, period: 850, alpha: 1 });
  const cur = ui.current;
  if (cur?.lat != null) rings.push({ lat: cur.lat, lng: cur.lng, color: '#e6f6ff', maxR: 2.6 * zs, speed: 2.6 * zs, period: 1100, alpha: 0.95 });
  view.setRings(rings);
}

function renderPaths() {
  const paths = [];
  if (settings.layers.hazards) {
    for (const h of store.raw?.hazards || []) {
      if (!h.track || h.track.length < 2) continue;
      const c = HAZARD_COLOR[h.alert] || '#ffcc33';
      paths.push({ points: h.track.map(([lat, lng]) => [lat, lng, 0.006]), colors: [hexToRgba(c, 0.1), hexToRgba(c, 0.95)], stroke: 0.6 });
    }
  }
  if (settings.layers.sats && satellites.count) {
    for (const tr of satellites.tracks()) {
      const c = tr.id === 'css' ? '#ffd27a' : '#8fdcff';
      const selected = ui.current?.type === 'sat' && ui.current.id === tr.id;
      // a short comet-like trail normally; the full ground track while the station is selected
      const past = selected ? tr.past : tr.past.slice(-8);
      const future = selected ? tr.future : tr.future.slice(0, 6);
      if (past.length > 1) paths.push({ points: past, colors: [hexToRgba(c, 0), hexToRgba(c, selected ? 0.7 : 0.5)], stroke: selected ? 0.4 : 0.3 });
      if (future.length > 1) paths.push({ points: future, colors: [hexToRgba(c, selected ? 0.75 : 0.35), hexToRgba(c, 0.03)], stroke: 0.28, dash: 0.03, gap: 0.015, animate: selected ? 40000 : 0 });
    }
  }
  view.setPaths(paths);
}

// ---------------------------------------------------------------- side panel
function renderSide() {
  const tab = ui.tab === 'map' ? 'feed' : ui.tab;
  const body = $('#side-body');
  if (!store.raw) {
    body.innerHTML = `<div class="empty">${esc(t().loading)}</div>`;
    return;
  }
  const html =
    tab === 'feed' ? feedTab(store, ui) : tab === 'hot' ? hotTab(store, ui) : tab === 'hazards' ? hazardsTab(store, satellites.positions()) : settingsTab(store, settings);
  if (ui.lastSideTab === tab) keepReadingPosition(body, () => (body.innerHTML = html));
  else {
    body.innerHTML = html;
    body.scrollTop = 0;
  }
  ui.lastSideTab = tab;
}

/**
 * Re-render a scrolling list without moving what the reader is looking at: the first visible row or
 * story stays put even when new items are inserted above it.
 */
function keepReadingPosition(box, render) {
  const keep = box.scrollTop;
  const top = box.getBoundingClientRect().top;
  const items = () => box.querySelectorAll('.row, .story, .place-row, .tl-node');
  const keyOf = (el) => el.dataset.story || el.dataset.id || el.dataset.cc || el.dataset.node;
  const anchor = keep > 0 ? [...items()].find((el) => el.getBoundingClientRect().bottom > top + 1 && keyOf(el)) : null;
  const key = anchor && keyOf(anchor);
  const offset = anchor ? anchor.getBoundingClientRect().top - top : 0;
  render();
  box.scrollTop = keep;
  if (!key) return;
  const again = [...items()].find((el) => keyOf(el) === key);
  if (again) box.scrollTop += again.getBoundingClientRect().top - top - offset;
}

$('#tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  const tab = b.dataset.tab;
  if (tab === ui.tab && tab !== 'map') return setTab('map');
  setTab(tab);
  if (tab === 'map') closeDetail();
});
$('#side-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});

$('#side-body').addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const { action } = a.dataset;
  if (action === 'window') store.setFilter({ windowHours: Number(a.dataset.v) });
  else if (action === 'sort') {
    ui.sort = a.dataset.v;
    renderSide();
  } else if (action === 'lang') store.setFilter({ lang: a.dataset.v });
  else if (action === 'story') openStory(a.dataset.id);
  else if (action === 'event') selectEvent(store.event(a.dataset.id));
  else if (action === 'hot-sort') {
    ui.hotSort = a.dataset.v;
    renderSide();
  } else if (action === 'country') selectCountry(a.dataset.cc);
  else if (action === 'place') selectPlace(store.view.placeById.get(a.dataset.id));
  else if (action === 'quake') selectQuake((store.raw.quakes || []).find((q) => q.id === a.dataset.id));
  else if (action === 'hazard') selectHazard((store.raw.hazards || []).find((h) => h.id === a.dataset.id));
  else if (action === 'sat') selectSat(a.dataset.id);
  else if (action === 'set-lang') changeLanguage(a.dataset.v);
  else if (action === 'enable-translate') enableTranslation();
  else if (action === 'set-style') {
    settings.style = a.dataset.v;
    saveSettings();
    view.setNightStyle(settings.style === 'night');
    renderSide();
  } else if (action === 'quality') {
    settings.quality = a.dataset.v;
    saveSettings();
    location.reload();
  }
});
$('#side-body').addEventListener('change', (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  if (a.dataset.action === 'layer') {
    settings.layers[a.dataset.layer] = a.checked;
    saveSettings();
    applyLayerSettings();
  } else if (a.dataset.action === 'autorotate') {
    settings.autoRotate = a.checked;
    saveSettings();
    bumpIdle();
  } else if (a.dataset.action === 'autotranslate') {
    settings.autoTranslate = a.checked;
    saveSettings();
    a.checked ? setupTranslation() : disableTranslation();
  }
});

function changeLanguage(lang) {
  settings.lang = lang;
  saveSettings();
  setLang(lang);
  applyStaticText();
  renderTabs();
  renderChips();
  renderSide();
  renderTicker(true);
  renderWorldNow();
  markers.refreshLanguage();
  reopenCurrent();
  setupTranslation();
}

// ---------------------------------------------------------------- translation (Chinese interface)
function setupTranslation() {
  if (getLang() !== 'zh') return;
  initTranslation({ enabled: settings.autoTranslate, onChange: onTranslation });
  queueTranslations();
}
function queueTranslations() {
  if (!store.raw) return;
  // the headline of every event first (most important first), then the other reports
  const events = store.view.events;
  const leads = events.map((e) => e.lead);
  const leadSet = new Set(leads);
  translateStories([...leads, ...events.flatMap((e) => e.vr.filter((s) => !leadSet.has(s)))]);
}
let translationPaint = 0;
function onTranslation(kind) {
  if (kind === 'status' && store.raw) queueTranslations();
  // repaint at most every 400 ms while a batch of translations streams in
  if (translationPaint) return;
  translationPaint = setTimeout(() => {
    translationPaint = 0;
    renderSide();
    if (kind !== 'progress') {
      refreshTickerText();
      renderWorldNow();
      if (ui.current) reopenCurrent();
    }
  }, 400);
}

// ---------------------------------------------------------------- detail panel & selection
const detail = $('#detail');
const detailHead = $('#detail-head');
const detailBody = $('#detail-body');

function openDetail(html, keep = false) {
  const refresh = keep && !detail.hidden;
  if (detail.hidden) pushSheet();
  detail.hidden = false;
  // the header lives outside the scroll area so it stays put while the stories scroll
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const head = tpl.content.querySelector('.d-head');
  const swap = () => {
    detailHead.replaceChildren(...(head ? [head] : []));
    detailBody.replaceChildren(tpl.content);
  };
  if (refresh) {
    // live refresh of the open panel: keep the reader's place and opened lists
    const state = storyState(detailBody);
    keepReadingPosition(detailBody, () => {
      swap();
      restoreStoryState(detailBody, state);
    });
  } else {
    swap();
    detailBody.scrollTop = 0;
  }
  app.classList.add('has-detail');
  view.setAutoRotate(false);
  updateOffset();
}

/** Which "also reported by" lists are open, so a live re-render can keep them open. */
function storyState(box) {
  return new Set([...box.querySelectorAll('[data-story]')].filter((a) => a.querySelector('.others-list:not([hidden])')).map((a) => a.dataset.story));
}

function restoreStoryState(box, open) {
  for (const a of box.querySelectorAll('[data-story]')) if (open.has(a.dataset.story)) a.querySelector('.others-list')?.removeAttribute('hidden');
}

function closeDetail(fromHistory = false) {
  if (!ui.current && detail.hidden) return;
  if (!fromHistory && !detail.hidden) popSheet();
  ui.current = null;
  detail.hidden = true;
  detail.style.removeProperty('--sheet-h');
  app.classList.remove('has-detail');
  markers.select({});
  view.setSelectedCountry(null);
  view.setArcs(settings.layers.arcs ? store.view.arcs.slice(0, isMobile() ? 14 : 32) : [], null);
  renderRings();
  renderPaths();
  setHash('');
  updateOffset();
  bumpIdle();
}

function altitudeFor(kind, cc) {
  const base = { city: 0.42, region: 0.62, admin1: 0.68, sea: 0.9, point: 0.5, actor: 0.6, org: 0.8, macro: 1.6 }[kind];
  if (base) return base;
  // countries: scale with size (very rough, from the label rank of big countries)
  const big = ['RU', 'CA', 'US', 'CN', 'BR', 'AU', 'IN', 'AR', 'KZ', 'DZ', 'CD', 'SA', 'MX', 'ID', 'GL'];
  return big.includes(cc) ? 1.5 : 0.85;
}

function fly(lat, lng, altitude, ms = 1500) {
  const alt = isMobile() ? altitude * 1.25 : altitude;
  view.flyTo({ lat, lng, altitude: alt }, ms);
}

function selectPlace(place, { fromTour = false } = {}) {
  if (!place) return;
  if (place.events?.length === 1) return selectEvent(place.events[0], { fromTour });
  if (!fromTour) stopTour();
  ui.current = { type: 'place', id: place.id, lat: place.lat, lng: place.lng };
  markers.select({ place: place.id });
  view.setSelectedCountry(place.kind === 'country' ? place.cc : null);
  fly(place.lat, place.lng, Math.min(view.altitude, altitudeFor(place.kind, place.cc)));
  openDetail(placeDetail(place, store));
  view.setArcs(settings.layers.arcs ? store.view.arcs.slice(0, isMobile() ? 14 : 32) : [], place.id);
  renderRings();
  setHash(`p=${encodeURIComponent(place.id)}`);
}

/** An event: its place on the map, the event panel (reliability, severity, attention, reports). */
function selectEvent(e, { storyId = null, fromTour = false } = {}) {
  if (!e) return;
  if (!fromTour) stopTour();
  const p = e.place;
  ui.current = { type: 'event', id: e.id, lat: p?.lat, lng: p?.lng };
  markers.select(p ? { place: p.id } : {});
  view.setSelectedCountry(p?.kind === 'country' ? p.cc : null);
  if (p?.lat != null) fly(p.lat, p.lng, Math.min(view.altitude, altitudeFor(p.kind, p.cc)));
  openDetail(eventDetail(e, store));
  // the reports and timeline of the event being read are translated before anything else
  translateFirst([...e.reports, ...timelineNodes(e).filter((n) => n.k !== 'alert').map((n) => store.storyById.get(n.id) || { id: n.id, title: n.h, lang: n.l })]);
  wn.phoneOpen = false;
  renderWorldNow();
  view.setArcs(settings.layers.arcs ? store.view.arcs.slice(0, isMobile() ? 14 : 32) : [], p?.id ?? null);
  renderRings();
  setHash(`e=${encodeURIComponent(e.id)}`);
  if (storyId) highlightStory(storyId);
}

function selectCluster(cluster) {
  stopTour();
  ui.current = { type: 'cluster', key: cluster.key, lat: cluster.lat, lng: cluster.lng, placeIds: cluster.places.map((p) => p.id) };
  markers.select({ place: cluster.lead.id });
  // zoom in far enough for the cluster to split into its places
  fly(cluster.lat, cluster.lng, Math.max(0.3, view.altitude * 0.42));
  openDetail(clusterDetail(cluster, store));
  renderRings();
}

function selectCountry(cc) {
  if (!isRealCc(cc)) return;
  stopTour();
  const info = countryInfo(cc);
  ui.current = { type: 'country', cc, lat: info?.lat, lng: info?.lng };
  markers.select({});
  view.setSelectedCountry(cc);
  if (info) fly(info.lat, info.lng, Math.min(Math.max(view.altitude, 0.7), altitudeFor('country', cc) * 1.15));
  openDetail(countryDetail(cc, store));
  view.setArcs(settings.layers.arcs ? store.view.arcs.slice(0, isMobile() ? 14 : 32) : [], cc);
  renderRings();
  setHash(`c=${cc}`);
}

function selectQuake(q) {
  if (!q) return;
  stopTour();
  ui.current = { type: 'quake', id: q.id, lat: q.lat, lng: q.lng };
  markers.select({ key: `q:${q.id}` });
  view.setSelectedCountry(null);
  fly(q.lat, q.lng, 0.9);
  openDetail(quakeDetail(q, store));
  renderRings();
  setHash(`q=${encodeURIComponent(q.id)}`);
}

function selectHazard(h) {
  if (!h) return;
  stopTour();
  ui.current = { type: 'hazard', id: h.id, lat: h.lat, lng: h.lng };
  markers.select({ key: `h:${h.id}` });
  view.setSelectedCountry(null);
  fly(h.lat, h.lng, h.type === 'storm' ? 1.2 : 0.8);
  openDetail(hazardDetail(h, store));
  renderRings();
  setHash(`h=${encodeURIComponent(h.id)}`);
}

function selectSat(id) {
  const pos = satellites.positions().find((s) => s.id === id);
  if (!pos) return;
  stopTour();
  ui.current = { type: 'sat', id };
  markers.select({ key: `s:${id}` });
  view.setSelectedCountry(null);
  fly(pos.lat, pos.lng, 1.4);
  openDetail(satDetail(pos));
  renderRings();
  renderPaths();
  setHash(`s=${id}`);
}

/** A report opens the event it belongs to, scrolled to that report. */
function openStory(id) {
  const e = store.eventOfStory(id);
  if (e) selectEvent(e, { storyId: id });
}

function highlightStory(id) {
  requestAnimationFrame(() => {
    const el = detailBody.querySelector(`[data-story="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
  });
}

/** Re-render the open panel for new data, filters or language, keeping the reader's place. */
function reopenCurrent() {
  const c = ui.current;
  if (!c) return;
  const v = store.view;
  if (c.type === 'event') {
    const e = store.event(c.id);
    if (e && e.id !== c.id) c.id = e.id; // merged into another event meanwhile
    e ? openDetail(eventDetail(e, store), true) : closeDetail();
  } else if (c.type === 'place') {
    const p = v.placeById.get(c.id);
    p ? openDetail(placeDetail(p, store), true) : closeDetail();
  } else if (c.type === 'country') openDetail(countryDetail(c.cc, store), true);
  else if (c.type === 'quake') {
    const q = (store.raw.quakes || []).find((x) => x.id === c.id);
    if (q) openDetail(quakeDetail(q, store), true);
  } else if (c.type === 'hazard') {
    const h = (store.raw.hazards || []).find((x) => x.id === c.id);
    if (h) openDetail(hazardDetail(h, store), true);
  } else if (c.type === 'cluster') {
    const places = (c.placeIds || []).map((id) => v.placeById.get(id)).filter(Boolean).sort((a, b) => b.score - a.score);
    const cl = markers.clusters().find((x) => x.key === c.key) || (places.length > 1 ? { key: c.key, lat: c.lat, lng: c.lng, lead: places[0], places } : null);
    if (cl) openDetail(clusterDetail(cl, store), true);
    else if (places.length) {
      ui.current = { type: 'place', id: places[0].id, lat: places[0].lat, lng: places[0].lng };
      openDetail(placeDetail(places[0], store), true);
    } else closeDetail();
  } else if (c.type === 'sat') {
    const pos = satellites.positions().find((s) => s.id === c.id);
    if (pos) openDetail(satDetail(pos), true);
  } else if (c.type === 'since' && visit.diff) openDetail(sinceDetail(visit.diff, store), true);
  else if (c.type === 'archived') {
    const e = visit.archiveById.get(c.id);
    if (e) openDetail(archivedEventDetail(e, store), true);
  }
}

detail.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const { action } = a.dataset;
  if (action === 'close') closeDetail();
  else if (action === 'country') selectCountry(a.dataset.cc);
  else if (action === 'event') selectEvent(store.event(a.dataset.id));
  else if (action === 'archived') openArchived(a.dataset.id);
  else if (action === 'quake') selectQuake((store.raw.quakes || []).find((q) => q.id === a.dataset.id));
  else if (action === 'hazard') selectHazard((store.raw.hazards || []).find((h) => h.id === a.dataset.id));
  else if (action === 'place') {
    const p = store.view.placeById.get(a.dataset.id);
    // from an event panel, "all events here" lists them even when there is only one
    if (p) {
      stopTour();
      ui.current = { type: 'place', id: p.id, lat: p.lat, lng: p.lng };
      markers.select({ place: p.id });
      openDetail(placeDetail(p, store));
      setHash(`p=${encodeURIComponent(p.id)}`);
    }
  }
  else if (action === 'zoom' && ui.current?.lat != null) fly(ui.current.lat, ui.current.lng, Math.max(0.15, view.altitude * 0.5));
  else if (action === 'others') {
    const list = a.parentElement.querySelector('.others-list');
    if (list) list.hidden = !list.hidden;
  } else if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(location.href);
      toast(t().copied);
    } catch {
      toast(location.href, 4000);
    }
  }
});

// keep the globe centred in the area not covered by panels
function updateOffset() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (isMobile()) {
    const sheet = !detail.hidden ? detail : ui.tab !== 'map' ? $('#sidebar') : null;
    if (!sheet) return view.setOffset([0, 0]);
    // offsetHeight ignores the slide-in transform, so this is the sheet's resting position
    const sheetTop = H - (sheet.offsetHeight || H * 0.58);
    const topUi = 96;
    const centre = (topUi + sheetTop) / 2;
    view.setOffset([0, Math.round(centre - H / 2)]);
  } else {
    const left = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--side-w')) + 14;
    const right = detail.hidden ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--detail-w')) + 14;
    view.setOffset([Math.round((left - right) / 2), 18]);
  }
}
window.addEventListener('resize', () => {
  renderTabs();
  updateOffset();
  renderWorldNow();
});

// bottom-sheet dragging (mobile)
// Bottom sheets (phones): drag by the handle or the header, pull down from the top of the list,
// fling to snap open/shut. Short taps still reach the buttons underneath.
const SHEET_H = { detail: '54vh', list: '62vh', full: '90vh' };
function closeSheet(sheet) {
  sheet.style.removeProperty('--sheet-h');
  if (sheet === detail) closeDetail();
  else setTab('map');
}
function attachSheetGestures(sheet, zones, scroller) {
  let startY = 0;
  let startH = 0;
  let lastY = 0;
  let lastT = 0;
  let vel = 0;
  let dragging = false;
  const begin = (y) => {
    startY = lastY = y;
    lastT = performance.now();
    vel = 0;
    startH = sheet.getBoundingClientRect().height;
    dragging = true;
    sheet.classList.add('dragging');
  };
  const move = (y) => {
    const now = performance.now();
    vel = 0.7 * vel + 0.3 * ((y - lastY) / Math.max(1, now - lastT)); // px/ms, smoothed
    lastY = y;
    lastT = now;
    sheet.style.setProperty('--sheet-h', `${Math.max(80, Math.min(window.innerHeight * 0.92, startH - (y - startY)))}px`);
  };
  const finish = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    const H = window.innerHeight;
    const h = startH - (lastY - startY);
    if (vel > 0.55 || h < H * 0.3) return closeSheet(sheet);
    const full = vel < -0.55 || h > H * 0.72;
    sheet.style.setProperty('--sheet-h', full ? SHEET_H.full : sheet === detail ? SHEET_H.detail : SHEET_H.list);
    setTimeout(updateOffset, 340);
  };
  for (const zone of zones) {
    let downY = null;
    let id = null;
    zone.addEventListener('pointerdown', (e) => {
      if (!isMobile()) return;
      downY = e.clientY;
      id = e.pointerId;
    });
    zone.addEventListener('pointermove', (e) => {
      if (downY == null || e.pointerId !== id) return;
      if (!dragging) {
        if (Math.abs(e.clientY - downY) < 6) return; // still a tap
        zone.setPointerCapture(id);
        begin(downY);
      }
      move(e.clientY);
    });
    const up = () => {
      downY = null;
      finish();
    };
    zone.addEventListener('pointerup', up);
    zone.addEventListener('pointercancel', up);
  }
  // pulling down while the list is already at its top moves the sheet instead
  if (!scroller) return;
  let touchY = null;
  scroller.addEventListener('touchstart', (e) => (touchY = scroller.scrollTop <= 0 ? e.touches[0].clientY : null), { passive: true });
  scroller.addEventListener(
    'touchmove',
    (e) => {
      if (touchY == null) return;
      const y = e.touches[0].clientY;
      if (!dragging) {
        if (y - touchY < 8 || scroller.scrollTop > 0) {
          if (touchY - y > 8) touchY = null; // scrolling up: leave it to the list
          return;
        }
        begin(touchY);
      }
      e.preventDefault();
      move(y);
    },
    { passive: false },
  );
  scroller.addEventListener('touchend', () => {
    touchY = null;
    finish();
  });
  scroller.addEventListener('touchcancel', () => {
    touchY = null;
    finish();
  });
}
attachSheetGestures(detail, [detail.querySelector('[data-sheet-handle]'), detailHead], detailBody);
attachSheetGestures($('#sidebar'), [$('#sidebar [data-sheet-handle]')], $('#side-body'));

// Phones: the back button/gesture closes the open sheet instead of leaving the site.
const sheetHistory = { depth: 0, silent: 0 };
function pushSheet() {
  if (!isMobile()) return;
  try {
    history.pushState({ wpSheet: sheetHistory.depth + 1 }, '', location.href);
    sheetHistory.depth++;
  } catch {
    /* sandboxed */
  }
}
function popSheet() {
  if (!sheetHistory.depth) return;
  sheetHistory.depth--;
  sheetHistory.silent++;
  history.back();
}
window.addEventListener('popstate', () => {
  if (sheetHistory.silent) return void sheetHistory.silent--;
  if (!sheetHistory.depth) return;
  sheetHistory.depth--;
  if (!detail.hidden) closeDetail(true);
  else if (ui.tab !== 'map') setTab('map', true);
});

// ---------------------------------------------------------------- tooltip (desktop hover)
const tooltip = $('#tooltip');
function showMarkerTooltip(item, el) {
  if (isMobile() || !item || !item.places) return hideTooltip();
  const lead = item.lead;
  const e = lead.events[0];
  const c = CAT[e?.cat || item.topCat] || CAT.other;
  const who = e ? (e.v === 1 ? t().voicesShort(1) : t().voices(e.v)) : '';
  tooltip.innerHTML = `<div class="tt-head"><span class="badge" style="--c:${c.color}">${icon(SUB_ICON[e?.sub] || c.icon, 11)}${esc(t().cats[e?.cat || item.topCat])}</span><b>${esc(placeName(lead))}${item.places.length > 1 ? ` +${item.places.length - 1}` : ''}</b></div>
    <div class="tt-title">${esc(e ? eventTitle(e) : '')}</div><div style="color:var(--muted);margin-top:4px">${item.count > 1 ? `${esc(t().events(item.count))} · ` : ''}${esc(who)} · ${esc(timeAgo(item.latest))}</div>`;
  const r = el.getBoundingClientRect();
  tooltip.style.left = `${r.left + 12}px`;
  tooltip.style.top = `${r.top}px`;
  tooltip.hidden = false;
}
function hideTooltip() {
  tooltip.hidden = true;
}

// ---------------------------------------------------------------- world now
// The few events that matter most right now. Desktop: a card at the top right; phones: a strip
// above the tab bar that cycles through them and opens into the list.
const wn = { items: [], idx: 0, phoneOpen: false, collapsed: false };
try {
  wn.collapsed = localStorage.getItem('wp-wn-collapsed') === '1';
} catch {
  /* private mode */
}
function renderWorldNow() {
  wn.items = store.raw ? pickWorldNow(store, 5) : [];
  const card = $('#worldnow');
  const strip = $('#wn-strip');
  if (!wn.items.length) {
    card.hidden = strip.hidden = true;
    return;
  }
  if (isMobile()) {
    strip.hidden = wn.phoneOpen;
    if (!wn.phoneOpen) strip.innerHTML = worldNowStrip(wn.items, wn.idx);
    card.hidden = !wn.phoneOpen;
    card.classList.remove('collapsed');
    if (wn.phoneOpen) card.innerHTML = worldNowHtml(wn.items, store, { since: sinceBlock() });
  } else {
    strip.hidden = true;
    card.hidden = false;
    card.classList.toggle('collapsed', wn.collapsed);
    card.innerHTML = worldNowHtml(wn.items, store, { collapsed: wn.collapsed, since: sinceBlock() });
  }
}
$('#worldnow').addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  if (a.dataset.action === 'event') {
    wn.phoneOpen = false;
    selectEvent(store.event(a.dataset.id));
  } else if (a.dataset.action === 'since-dismiss') {
    e.stopPropagation();
    visit.dismissed = true;
    renderWorldNow();
  } else if (a.dataset.action === 'since-open') {
    wn.phoneOpen = false;
    openSince();
  } else if (a.dataset.action === 'wn-gaps') {
    wn.phoneOpen = false;
    setTab('hot');
    renderWorldNow();
  } else if (a.dataset.action === 'wn-toggle') {
    if (isMobile()) wn.phoneOpen = false;
    else {
      wn.collapsed = !wn.collapsed;
      try {
        localStorage.setItem('wp-wn-collapsed', wn.collapsed ? '1' : '0');
      } catch {
        /* ignore */
      }
    }
    renderWorldNow();
  }
});
$('#wn-strip').addEventListener('click', () => {
  wn.phoneOpen = true;
  renderWorldNow();
});
setInterval(() => {
  if (!isMobile() || wn.phoneOpen || wn.items.length < 2 || document.hidden) return;
  wn.idx = (wn.idx + 1) % wn.items.length;
  $('#wn-strip').innerHTML = worldNowStrip(wn.items, wn.idx);
}, 6000);

// ---------------------------------------------------------------- since your last visit
// Compared once, right after the first data load; the snapshot is refreshed on every update and
// when the page is hidden, so the next visit compares with what was last on screen.
const visit = { prev: previousVisit(), diff: null, dismissed: false, archive: null, archiveById: new Map() };

function sinceBlock() {
  const d = visit.diff;
  if (!hasNews(d) || visit.dismissed) return '';
  const summary = t().since.summary(d.newEvents.length, d.changes.length, d.heating.length) || t().since.away;
  return `<div class="wn-since" data-action="since-open" role="button">${icon('sparkle', 16)}
    <span class="wn-since-main"><b>${esc(t().since.card(timeAgo(d.left)))}</b>${esc(summary)}</span>
    <button class="wn-since-x" data-action="since-dismiss" title="${esc(t().since.dismiss)}">${icon('x', 13)}</button></div>`;
}

async function loadArchive() {
  if (visit.archive) return visit.archive;
  try {
    const a = await getJson(`data/events.json?t=${Math.floor(Date.now() / 300000)}`, 'default');
    const dict = a.places || {};
    for (const e of a.events || []) {
      const p = dict[e.loc];
      e.place = p ? { id: e.loc, name: p[0], zh: p[1], cc: p[2], lat: p[3], lng: p[4], kind: p[5] } : null;
      visit.archiveById.set(e.id, e);
    }
    for (const [from, to] of Object.entries(a.aliases || {})) if (!visit.archiveById.has(from) && visit.archiveById.has(to)) visit.archiveById.set(from, visit.archiveById.get(to));
    visit.archive = a;
  } catch {
    visit.archive = { events: [] };
  }
  return visit.archive;
}

function compareWithLastVisit() {
  if (!visit.prev || !store.raw) return;
  visit.diff = diffSince(visit.prev, store);
  const away = Date.now() / 1000 - visit.prev.left;
  const show = () => {
    renderWorldNow();
    if (!hasNews(visit.diff)) return;
    const d = visit.diff;
    const summary = t().since.summary(d.newEvents.length, d.changes.length, d.heating.length) || t().since.away;
    // phones have no card on screen: say it once, after the loading screen has gone
    if (isMobile()) setTimeout(() => toast(t().since.toast(summary), 9000, { onClick: openSince, live: true }), 3200);
  };
  if (away > 47 * 3600) {
    // events can only have come and gone entirely while the reader was away for two days or more
    loadArchive().then((a) => {
      visit.diff.archived = archivedSince(visit.prev, a, store);
      show();
    });
  } else show();
}

function openSince() {
  if (!visit.diff) return;
  stopTour();
  ui.current = { type: 'since' };
  markers.select({});
  view.setSelectedCountry(null);
  openDetail(sinceDetail(visit.diff, store));
  setHash('');
}

function openArchived(id) {
  const e = visit.archiveById.get(id);
  if (!e) return;
  stopTour();
  ui.current = { type: 'archived', id: e.id, lat: e.place?.lat, lng: e.place?.lng };
  markers.select({});
  view.setSelectedCountry(null);
  if (e.place?.lat != null) fly(e.place.lat, e.place.lng, Math.min(view.altitude, altitudeFor(e.place.kind, e.place.cc)));
  openDetail(archivedEventDetail(e, store));
  translateFirst(timelineNodes(e).filter((n) => n.k !== 'alert').map((n) => ({ id: n.id, title: n.h, lang: n.l })));
  renderRings();
  setHash(`e=${encodeURIComponent(e.id)}`);
}

setInterval(() => {
  if (!document.hidden && store.raw) touchVisit();
}, 60000);
addEventListener('pagehide', () => rememberVisit(store));

// ---------------------------------------------------------------- ticker
let tickerItems = [];
let tickerIdx = 0;
function renderTicker(force) {
  const now = Date.now() / 1000;
  // the latest serious events (single-source state media claims stay out of the headline strip)
  const items = store.view.events
    .filter((e) => !e.so && now - e.l < 8 * 3600 && (e.sev >= 0.62 || (e.sev >= 0.45 && e.v >= 3)))
    .sort((a, b) => b.l - a.l)
    .slice(0, 8);
  const ids = items.map((e) => e.id).join();
  if (!force && ids === tickerItems.map((e) => e.id).join()) return;
  tickerItems = items;
  tickerIdx = 0;
  const el = $('#ticker');
  el.hidden = !items.length;
  el.innerHTML = `<span class="ticker-tag">${esc(t().breaking)}</span><div class="ticker-win">${items
    .map((e, i) => `<div class="ticker-item ${i === 0 ? 'in' : 'below'}" data-id="${esc(e.id)}"><span>${flag(e.place?.cc)} ${esc(eventTitle(e))}</span><em>${esc(timeAgo(e.l, now))}</em></div>`)
    .join('')}</div>`;
}
setInterval(() => {
  const els = $$('#ticker .ticker-item');
  if (els.length < 2) return;
  const cur = els[tickerIdx];
  tickerIdx = (tickerIdx + 1) % els.length;
  const next = els[tickerIdx];
  // park the next item below without animating, force a style flush, then slide both
  next.style.transition = 'none';
  next.className = 'ticker-item below';
  void next.offsetWidth;
  next.style.transition = '';
  next.className = 'ticker-item in';
  cur.className = 'ticker-item above';
}, 6000);
/** Swap in translated titles without restarting the rotation. */
function refreshTickerText() {
  for (const el of $$('#ticker .ticker-item')) {
    const e = tickerItems.find((x) => x.id === el.dataset.id);
    const span = el.querySelector('span');
    if (e && span) span.textContent = `${flag(e.place?.cc)} ${eventTitle(e)}`;
  }
}
$('#ticker').addEventListener('click', () => {
  const e = tickerItems[tickerIdx];
  if (e) selectEvent(e);
});

// ---------------------------------------------------------------- search
const searchEl = $('#search');
const searchInput = $('#search-input');
const searchResults = $('#search-results');
let searchHits = [];
let searchActive = 0;
function openSearch() {
  searchEl.hidden = false;
  searchInput.value = '';
  searchResults.innerHTML = '';
  setTimeout(() => searchInput.focus(), 30);
}
function closeSearch() {
  searchEl.hidden = true;
}
$('#search-btn').addEventListener('click', openSearch);
$('#search-close').addEventListener('click', closeSearch);
searchEl.addEventListener('click', (e) => e.target === searchEl && closeSearch());
searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    searchActive = (searchActive + (e.key === 'ArrowDown' ? 1 : -1) + searchHits.length) % Math.max(1, searchHits.length);
    paintSearch();
  } else if (e.key === 'Enter' && searchHits[searchActive]) pickSearch(searchHits[searchActive]);
  else if (e.key === 'Escape') closeSearch();
});
function runSearch() {
  const q = searchInput.value.trim().toLowerCase();
  searchHits = [];
  searchActive = 0;
  if (!q) return paintSearch();
  const v = store.view;
  const score = (txt) => {
    const s = (txt || '').toLowerCase();
    const i = s.indexOf(q);
    return i < 0 ? -1 : i === 0 ? 2 : 1;
  };
  const countries = allCountries()
    .map((cc) => ({ cc, info: countryInfo(cc) }))
    .map((c) => ({ ...c, s: Math.max(score(c.info.en), score(c.info.zh), c.cc.toLowerCase() === q ? 3 : -1) }))
    .filter((c) => c.s > 0)
    .sort((a, b) => b.s - a.s || (v.countryById.get(b.cc)?.count || 0) - (v.countryById.get(a.cc)?.count || 0))
    .slice(0, 5);
  for (const c of countries) searchHits.push({ kind: 'country', cc: c.cc, label: `${flag(c.cc)} ${countryName(c.cc)}`, meta: t().reports(v.countryById.get(c.cc)?.count || 0) });
  const places = v.places.filter((p) => p.kind !== 'country' && Math.max(score(p.name), score(p.zh)) > 0).slice(0, 6);
  for (const p of places) searchHits.push({ kind: 'place', id: p.id, label: placeName(p), meta: t().events(p.count) });
  // events: any of their reports' headlines or summaries (and the translated headline)
  const events = v.events.filter((e) => score(eventTitle(e)) > 0 || e.vr.some((s) => score(s.title) > 0 || score(s.summary) > 0)).slice(0, 10);
  for (const e of events) searchHits.push({ kind: 'event', id: e.id, label: eventTitle(e), meta: `${e.v === 1 ? t().voicesShort(1) : t().voicesShort(e.v)} · ${timeAgo(e.l)}` });
  paintSearch();
}
function paintSearch() {
  if (!searchInput.value.trim()) return (searchResults.innerHTML = '');
  if (!searchHits.length) return (searchResults.innerHTML = `<div class="empty">${esc(t().searchNone)}</div>`);
  let html = '';
  let lastKind = '';
  const groupName = { country: t().kinds.country, place: t().hotspots, event: t().tabs.feed };
  searchHits.forEach((h, i) => {
    if (h.kind !== lastKind) html += `<div class="sr-group">${esc(groupName[h.kind])}</div>`;
    lastKind = h.kind;
    html += `<div class="sr-item ${i === searchActive ? 'active' : ''}" data-i="${i}"><span class="t">${esc(h.label)}</span><small>${esc(h.meta)}</small></div>`;
  });
  searchResults.innerHTML = html;
}
searchResults.addEventListener('click', (e) => {
  const it = e.target.closest('[data-i]');
  if (it) pickSearch(searchHits[Number(it.dataset.i)]);
});
function pickSearch(h) {
  closeSearch();
  if (h.kind === 'country') selectCountry(h.cc);
  else if (h.kind === 'place') selectPlace(store.view.placeById.get(h.id));
  else selectEvent(store.event(h.id));
}

// ---------------------------------------------------------------- legend & status popovers
function toggleLegend() {
  const pop = $('#legend');
  if (!pop.hidden) return (pop.hidden = true);
  $('#status-pop').hidden = true;
  pop.innerHTML = `<h4>${esc(t().legend)}</h4>
    ${CATEGORIES.filter((c) => c.id !== 'other')
      .map((c) => `<div class="lg-row"><span class="lg-sym" style="--c:${c.color}">${icon(c.icon, 12)}</span>${esc(t().cats[c.id])}</div>`)
      .join('')}
    <div class="lg-row"><span class="lg-sym ring" style="--c:${QUAKE_COLOR}">${icon('quake', 12)}</span>${esc(t().quakes)}</div>
    <div class="lg-row"><span class="lg-sym diamond" style="--c:${HAZARD_COLOR.orange}">${icon('cyclone', 11)}</span>${esc(t().weather)}</div>
    <div class="lg-row"><span class="lg-sym" style="--c:#2b6b8f">${icon('satellite', 12)}</span>${esc(t().satellites)}</div>
    <div class="lg-row"><span class="lg-sym" style="--c:#ff4d5e"></span>${esc(t().legendSolid)}</div>
    <div class="lg-row"><span class="lg-sym hollow" style="--c:#ff4d5e"></span>${esc(t().legendHollow)}</div>
    <div class="lg-row"><span class="lg-sym dashed" style="--c:#ff4d5e"></span>${esc(t().legendDashed)}</div>
    <div class="lg-note">${esc(t().legendSize)}<br>${esc(t().legendPillar)}<br>${esc(t().legendPulse)}<br>${esc(t().legendArc)}</div>`;
  pop.hidden = false;
}
$('#legend-btn').addEventListener('click', toggleLegend);

$('#status-btn').addEventListener('click', () => {
  const pop = $('#status-pop');
  if (!pop.hidden) return (pop.hidden = true);
  $('#legend').hidden = true;
  const raw = store.raw;
  if (!raw) return;
  const ok = raw.sources.filter((s) => s.ok).length;
  pop.innerHTML = `<h4>${esc(t().dataStatus)}</h4>
    <div class="lg-row">${icon('clock', 15)} ${esc(new Date(raw.generated).toLocaleString())}</div>
    <div class="lg-row">${icon('news', 15)} ${esc(t().events(store.events.length))} · ${esc(t().reports(raw.stories.length))} · ${esc(t().sources(ok))}/${raw.sources.length}</div>
    <div class="lg-row">${icon('quake', 15)} ${raw.quakes.length} · ${icon('alert', 15)} ${raw.hazards.length}</div>
    <div class="lg-live">
      <div class="lg-row"><b>${esc(t().liveTitle)}</b></div>
      <div class="lg-row">${icon('refresh', 14)}<span>${esc(t().liveServer)}</span></div>
      <div class="lg-row">${icon('wifi', 14)}<span>${esc(t().liveClient(timeAgo(live.lastCheck / 1000)))}</span></div>
      <div class="lg-row">${icon('quake', 14)}<span>${esc(t().liveQuakes(live.quakesAt ? timeAgo(live.quakesAt / 1000) : '—'))}</span></div>
      <div class="lg-row">${icon('satellite', 14)}<span>${esc(t().liveSky)}</span></div>
    </div>
    <div class="lg-note">${raw.sources
      .map((s) => `<span style="color:${s.ok ? 'var(--live)' : 'var(--danger)'}">${s.ok ? '●' : '○'}</span> ${esc(getLang() === 'zh' ? s.zh || s.name : s.name)}`)
      .join('<br>')}</div>`;
  pop.hidden = false;
});
document.addEventListener('pointerdown', (e) => {
  for (const id of ['legend', 'status-pop']) {
    const pop = $(`#${id}`);
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('#legend-btn, #status-btn')) pop.hidden = true;
  }
});

// ---------------------------------------------------------------- tour
$('#tour-btn').addEventListener('click', () => (ui.tour ? stopTour() : startTour()));
function startTour() {
  // the most important events, one per place
  const stops = [];
  const seen = new Set();
  for (const e of store.view.events) {
    if (!e.place || seen.has(e.place.id)) continue;
    seen.add(e.place.id);
    stops.push(e);
    if (stops.length >= 8) break;
  }
  if (!stops.length) return;
  let i = 0;
  const step = () => {
    selectEvent(stops[i % stops.length], { fromTour: true });
    i++;
  };
  ui.tour = setInterval(step, 8000);
  step();
  $('#tour-btn').classList.add('active');
  applyStaticText();
  toast(t().tour);
}
function stopTour() {
  if (!ui.tour) return;
  clearInterval(ui.tour);
  ui.tour = null;
  $('#tour-btn').classList.remove('active');
  applyStaticText();
}

// ---------------------------------------------------------------- keyboard & hash
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'Escape') {
    if (!searchEl.hidden) closeSearch();
    else closeDetail();
  } else if (e.key === '/') {
    e.preventDefault();
    openSearch();
  }
});

function setHash(h) {
  try {
    history.replaceState(history.state, '', h ? `#${h}` : location.pathname + location.search); // keep sheet entries
  } catch {
    /* sandboxed */
  }
}
function openFromHash() {
  const m = /^#([epcqhs])=(.+)$/.exec(location.hash);
  if (!m) return false;
  const id = decodeURIComponent(m[2]);
  if (m[1] === 'e') {
    const e = store.event(id);
    if (e) selectEvent(e);
    else {
      // a shared link to an event whose reports have aged out: its archive entry
      loadArchive().then(() => openArchived(id));
      return true;
    }
  }
  else if (m[1] === 'p') selectPlace(store.view.placeById.get(id));
  else if (m[1] === 'c') selectCountry(id);
  else if (m[1] === 'q') selectQuake((store.raw.quakes || []).find((q) => q.id === id));
  else if (m[1] === 'h') selectHazard((store.raw.hazards || []).find((h) => h.id === id));
  else if (m[1] === 's') selectSat(id);
  return Boolean(ui.current);
}

// ---------------------------------------------------------------- data loading & live updates
// The pipeline republishes data/latest.json every ~5 minutes. Every minute the page fetches the tiny
// status.json under a new URL (so neither the browser nor the Pages CDN can answer from cache) and
// downloads the full file only when its timestamp changed, under a versioned URL that caches well.
store.on((reason) => {
  renderChips();
  renderLayers();
  renderSide();
  renderTicker(reason === 'data');
  renderWorldNow();
  if (ui.current) reopenCurrent();
  if (reason !== 'time') queueTranslations();
});

async function getJson(url, cache = 'no-store') {
  const res = await fetch(url, { cache });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
const fetchStatus = () => getJson(`${STATUS_URL}?t=${Math.floor(Date.now() / 15000)}`).catch(() => null);
const versioned = (version) => `${DATA_URL}?v=${encodeURIComponent(version)}`;

/** First load: the preloaded file (see index.html) and status.json in parallel; if the preloaded copy
 *  came from a cache and is older than status.json says, fetch the current version right away. */
async function loadInitial() {
  try {
    const [status, cached] = await Promise.all([fetchStatus(), getJson(DATA_URL, 'default').catch(() => null)]);
    let raw = cached;
    if (status?.generated && raw?.generated !== status.generated) raw = (await getJson(versioned(status.generated), 'default').catch(() => null)) || raw;
    if (!raw) throw new Error('no data');
    live.lastFull = Date.now();
    ui.loadFailed = false;
    applyData(raw, true);
  } catch (err) {
    console.error(err);
    ui.loadFailed = true;
    $('#loader-text').textContent = t().loadFail;
  } finally {
    live.lastCheck = Date.now();
    tickClock();
  }
}

/** Minute check: download only when the server has a newer version. */
function checkForUpdates() {
  live.pending ||= (async () => {
    try {
      const status = await fetchStatus();
      const version = status?.generated;
      if (store.raw && version && (version === store.raw.generated || version === live.staleVersion)) {
        ui.loadFailed = false;
        return;
      }
      // without status.json (an older deploy) fall back to the full file, but at most every 5 minutes
      if (!version && store.raw && Date.now() - live.lastFull < 5 * 60 * 1000) return;
      const raw = await getJson(version ? versioned(version) : `${DATA_URL}?t=${Math.floor(Date.now() / 60000)}`, version ? 'default' : 'no-store');
      live.lastFull = Date.now();
      ui.loadFailed = false;
      if (store.raw && raw.generated === store.raw.generated) {
        live.staleVersion = version; // a cache answered with old data: don't re-download it every minute
        return;
      }
      applyData(raw, !store.raw);
    } catch (err) {
      console.warn(err);
      ui.loadFailed = true;
    } finally {
      live.lastCheck = Date.now();
      live.pending = null;
      tickClock();
    }
  })();
  return live.pending;
}

function applyData(raw, initial) {
  satellites = createSatellites(raw.satellites || []);
  mergeQuakes(raw, live.quakes); // keep quakes read straight from USGS that this copy predates
  const diff = store.setData(raw); // re-renders map, lists and the open panel
  markers.setSats(satellites.positions());
  renderPaths();
  $('#sample-banner').hidden = !raw.sample;
  if (!initial) announce(diff);
  else compareWithLastVisit();
  rememberVisit(store);
}

/** New reports: a burst of light where their events are, a toast linking to the top event, a tab badge. */
async function announce({ added, newEvents, grown }) {
  const v = store.view;
  const shown = new Set(v.stories.map((s) => s.id));
  const fresh = added.filter((s) => shown.has(s.id));
  if (!fresh.length) return;
  const evs = [...new Set(fresh.map((s) => store.event(s.ev)).filter(Boolean))];
  flash(evs.filter((e) => e.place).map((e) => ({ lat: e.place.lat, lng: e.place.lng, color: CAT[e.cat]?.color || '#fff' })));
  // headline: the most important new event, else the most important one with new reports
  const visible = new Set(v.events);
  const byWeight = (list) => list.filter((e) => visible.has(e)).sort((a, b) => b.w - a.w)[0];
  const top = byWeight(newEvents) || byWeight(grown) || byWeight(evs);
  const nNew = newEvents.filter((e) => visible.has(e)).length;
  if (top) {
    await translateNow(eventStory(top));
    toast(`${t().newSummary(fresh.length, nNew)} · ${eventTitle(top)}`, 7000, { onClick: () => selectEvent(top), live: true });
  }
  if (document.hidden) {
    live.unseen += fresh.length;
    updateTitle();
  }
}

const FLASH_MS = 20000;
function flash(points) {
  if (!points.length) return;
  const until = Date.now() + FLASH_MS;
  live.flashes = [...live.flashes, ...points.map((p) => ({ ...p, until }))].slice(-30);
  renderRings();
  clearTimeout(live.flashTimer);
  live.flashTimer = setTimeout(renderRings, FLASH_MS + 200);
}

/** Merge quakes into a data set (newer copies win: USGS revises magnitudes); returns the ones it lacked. */
function mergeQuakes(raw, list) {
  if (!list.length) return [];
  const byId = new Map((raw.quakes || []).map((q) => [q.id, q]));
  const added = list.filter((q) => !byId.has(q.id));
  for (const q of list) byId.set(q.id, byId.get(q.id)?.placeZh && !q.placeZh ? { ...q, placeZh: byId.get(q.id).placeZh } : q);
  raw.quakes = [...byId.values()].sort((a, b) => b.time - a.time);
  return added;
}

async function loadLiveQuakes() {
  live.quakeTry = Date.now();
  try {
    const now = Date.now() / 1000;
    live.quakes = normalizeUsgs(await getJson(LIVE_QUAKES_URL, 'no-cache'), now);
    live.quakesAt = Date.now();
    if (!store.raw) return;
    const added = mergeQuakes(store.raw, live.quakes);
    markers.setQuakes(visibleQuakes());
    renderRings();
    if (ui.current?.type === 'quake') reopenCurrent();
    // the first answer only catches up with the pipeline's copy; announce what arrives after that
    if (live.quakesPrimed && added.length) {
      flash(added.map((q) => ({ lat: q.lat, lng: q.lng, color: QUAKE_COLOR })));
      const big = added.reduce((a, b) => (b.mag > a.mag ? b : a));
      if (big.mag >= 6) toast(t().newQuake(big.mag.toFixed(1), quakePlace(big)), 8000, { onClick: () => selectQuake(big), live: true });
    }
    live.quakesPrimed = true;
  } catch {
    /* USGS unreachable (e.g. network policy) – keep the pipeline's copy */
  }
}

/** One scheduler for everything live; background tabs check less often. */
function startLiveUpdates() {
  setInterval(() => {
    const now = Date.now();
    const every = !store.raw ? 20000 : document.hidden ? HIDDEN_POLL_MS : POLL_MS;
    if (now - live.lastCheck >= every) checkForUpdates();
    if (!document.hidden && now - live.quakeTry >= POLL_MS) loadLiveQuakes();
    store.expireFresh();
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return rememberVisit(store);
    live.unseen = 0;
    updateTitle();
    if (Date.now() - live.lastCheck > 20000) checkForUpdates();
    if (Date.now() - live.quakeTry > 20000) loadLiveQuakes();
  });
  addEventListener('online', () => checkForUpdates());
  loadLiveQuakes();
}

// space stations move every second
setInterval(() => {
  if (!satellites.count || !settings.layers.sats) return;
  const pos = satellites.positions();
  markers.moveSats(pos);
  if (ui.current?.type === 'sat') {
    const p = pos.find((s) => s.id === ui.current.id);
    const kv = $('#sat-live');
    if (p && kv) kv.innerHTML = satKv(p);
  }
}, 1000);
setInterval(renderPaths, 60000);

// ---------------------------------------------------------------- boot
function initialAltitude() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  const vHalf = Math.tan((50 / 2) * (Math.PI / 180));
  if (isMobile()) {
    // let the globe slightly overflow the screen width, like looking out of a window
    const hHalf = vHalf * (w / h);
    return Math.min(4.2, Math.max(1.6, (1.12 / hHalf - 1) * 0.86));
  }
  // desktop: radius = half of the height left between the top bar and the ticker
  const radiusPx = (h - 210) / 2;
  const sideRoom = (w - 400) / 2;
  const r = Math.min(radiusPx, sideRoom);
  return Math.min(3.2, Math.max(1.4, (h / 2) / (r * vHalf) - 1));
}

// handle for debugging from the console / automated checks
window.__worldPulse = { view, store, markers, selectPlace, selectEvent, selectCountry, checkForUpdates };

async function boot() {
  applyStaticText();
  app.dataset.tab = ui.tab;
  renderTabs();
  renderChips();
  renderSide();
  updateOffset();
  const alt = initialAltitude();
  const tzLng = -new Date().getTimezoneOffset() / 4;
  view.flyTo({ lat: 18, lng: tzLng - 60, altitude: alt * 2.8 }, 0);
  await Promise.race([Promise.all([loadInitial(), view.texturesReady]), new Promise((r) => setTimeout(r, 9000))]);
  applyLayerSettings();
  $('#loader').classList.add('done');
  if (!openFromHash()) {
    const top = store.raw ? store.view.places[0] : null;
    view.flyTo({ lat: top ? Math.max(-30, Math.min(45, top.lat)) * 0.6 + 8 : 22, lng: top ? top.lng : tzLng, altitude: alt }, 2600);
  }
  bumpIdle();
  startLiveUpdates();
  setupTranslation();
}
boot();
