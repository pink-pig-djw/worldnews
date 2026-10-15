import './styles/main.css';
import { CAT, CATEGORIES, DATA_URL, HAZARD_COLOR, isMobile, LIVE_QUAKES_URL, QUAKE_COLOR, REFRESH_MS, SUB_ICON } from './config.js';
import { getLang, setLang, t, timeAgo } from './i18n.js';
import { allCountries, countryInfo, countryName, flag, isRealCc, placeName, store } from './data/store.js';
import { createGlobeView, hexToRgba } from './globe/globe.js';
import { createMarkerLayer } from './globe/markers.js';
import { createSatellites } from './globe/satellites.js';
import { $, $$, esc, toast } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { feedTab, hazardsTab, hotTab, settingsTab } from './ui/lists.js';
import { clusterDetail, countryDetail, hazardDetail, placeDetail, quakeDetail, satDetail, satKv, storyHtml } from './ui/panels.js';

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
const ui = { tab: isMobile() ? 'map' : 'feed', sort: 'important', current: null, tour: null };

function applyStaticText() {
  for (const el of $$('[data-i18n]')) el.textContent = t()[el.dataset.i18n];
  document.title = `${t().brand} · ${t().brandSub}`;
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

function setTab(tab) {
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
  const v = store.view;
  const all = store.filters.cats.size === CATEGORIES.length;
  const counts = {};
  const minTime = Date.now() / 1000 - store.filters.windowHours * 3600;
  for (const s of store.raw?.stories || []) if (s.time >= minTime) counts[s.cat] = (counts[s.cat] || 0) + 1;
  $('#cat-chips').innerHTML =
    `<button class="chip ${all ? 'on' : ''}" data-cat="all" style="--c:#5cc8ff">${esc(t().cats.all)} <b>${v ? (store.raw?.stories || []).filter((s) => s.time >= minTime).length : ''}</b></button>` +
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

// clock
function tickClock() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  $('#clock').innerHTML = `<div><span>${t().utc}</span>${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}</div><div><span>${esc(t().local)}</span>${pad(d.getHours())}:${pad(d.getMinutes())}</div>`;
  if (store.raw) {
    const gen = Date.parse(store.raw.generated) / 1000;
    $('#updated').textContent = t().updated(timeAgo(gen));
    $('#live-dot').className = `live-dot${ui.loadFailed ? ' down' : Date.now() / 1000 - gen > 75 * 60 ? ' stale' : ''}`;
  }
}
setInterval(tickClock, 1000);

// ---------------------------------------------------------------- globe
const container = $('#globe');
const view = createGlobeView(container, { quality: settings.quality });
const markers = createMarkerLayer(view, container, {
  onCluster: (c) => {
    hideTooltip();
    c.places.length > 1 && view.altitude > 0.35 ? selectCluster(c) : selectPlace(c.places[0]);
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
  view.setArcs(L.arcs ? v.arcs.slice(0, 32) : [], focus);

  // light pillars for the hottest places
  const top = v.places.slice(0, 32);
  const max = top[0]?.score || 1;
  view.setPillars(
    L.pillars
      ? top.map((p) => {
          const n = Math.sqrt(p.score / max);
          return { lat: p.lat, lng: p.lng, color: CAT[p.topCat]?.color || '#fff', height: 0.02 + 0.2 * n, width: 0.7 + 1.5 * n };
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
  const zs = zoomScale();
  if (settings.layers.rings) {
    const max = v.places[0]?.score || 1;
    for (const p of v.places.slice(0, 40)) {
      if (!(p.breaking || p.maxSev >= 0.72)) continue;
      const n = Math.sqrt(p.score / max);
      rings.push({ lat: p.lat, lng: p.lng, color: CAT[p.topCat]?.color || '#fff', maxR: (1.6 + 3.2 * n) * zs, speed: (1.2 + 1.4 * n) * zs, period: 2400 - 900 * n, alpha: 0.7 });
      if (rings.length >= 18) break;
    }
    const now = Date.now() / 1000;
    if (settings.layers.quakes) {
      for (const q of visibleQuakes()) if (q.mag >= 5.5 && now - q.time < 86400) rings.push({ lat: q.lat, lng: q.lng, color: QUAKE_COLOR, maxR: (q.mag - 4) * 1.6 * zs, speed: 2.2 * zs, period: 1700, alpha: 0.8 });
    }
  }
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
  const keep = body.scrollTop;
  if (!store.raw) {
    body.innerHTML = `<div class="empty">${esc(t().loading)}</div>`;
    return;
  }
  if (tab === 'feed') body.innerHTML = feedTab(store, ui);
  else if (tab === 'hot') body.innerHTML = hotTab(store);
  else if (tab === 'hazards') body.innerHTML = hazardsTab(store, satellites.positions());
  else if (tab === 'settings') body.innerHTML = settingsTab(store, settings);
  if (ui.lastSideTab === tab) body.scrollTop = keep;
  ui.lastSideTab = tab;
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
  else if (action === 'country') selectCountry(a.dataset.cc);
  else if (action === 'place') selectPlace(store.view.placeById.get(a.dataset.id));
  else if (action === 'quake') selectQuake((store.raw.quakes || []).find((q) => q.id === a.dataset.id));
  else if (action === 'hazard') selectHazard((store.raw.hazards || []).find((h) => h.id === a.dataset.id));
  else if (action === 'sat') selectSat(a.dataset.id);
  else if (action === 'set-lang') changeLanguage(a.dataset.v);
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
  markers.refreshLanguage();
  reopenCurrent();
}

// ---------------------------------------------------------------- detail panel & selection
const detail = $('#detail');
const detailBody = $('#detail-body');

function openDetail(html) {
  detail.hidden = false;
  detailBody.innerHTML = html;
  detailBody.scrollTop = 0;
  app.classList.add('has-detail');
  view.setAutoRotate(false);
  updateOffset();
}

function closeDetail() {
  if (!ui.current && detail.hidden) return;
  ui.current = null;
  detail.hidden = true;
  detail.style.removeProperty('--sheet-h');
  app.classList.remove('has-detail');
  markers.select({});
  view.setSelectedCountry(null);
  view.setArcs(settings.layers.arcs ? store.view.arcs.slice(0, 32) : [], null);
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

function selectPlace(place, { storyId = null, fromTour = false } = {}) {
  if (!place) return;
  if (!fromTour) stopTour();
  ui.current = { type: 'place', id: place.id, lat: place.lat, lng: place.lng };
  markers.select({ place: place.id });
  view.setSelectedCountry(place.kind === 'country' ? place.cc : null);
  fly(place.lat, place.lng, Math.min(view.altitude, altitudeFor(place.kind, place.cc)));
  openDetail(placeDetail(place, store));
  view.setArcs(settings.layers.arcs ? store.view.arcs.slice(0, 32) : [], place.id);
  renderRings();
  setHash(`p=${encodeURIComponent(place.id)}`);
  if (storyId) highlightStory(storyId);
}

function selectCluster(cluster) {
  stopTour();
  ui.current = { type: 'cluster', key: cluster.key, lat: cluster.lat, lng: cluster.lng };
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
  view.setArcs(settings.layers.arcs ? store.view.arcs.slice(0, 32) : [], cc);
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

function openStory(id) {
  const s = (store.raw?.stories || []).find((x) => x.id === id);
  if (!s) return;
  const place = s.loc && store.view.placeById.get(s.loc.id);
  if (place) return selectPlace(place, { storyId: s.id });
  ui.current = { type: 'story', id };
  markers.select({});
  openDetail(`<div class="d-head"><div class="d-top"><span class="badge">${esc(t().noLocation)}</span><button class="d-close" data-action="close">${icon('x', 16)}</button></div></div>${storyHtml(s, store)}`);
}

function highlightStory(id) {
  requestAnimationFrame(() => {
    const el = detailBody.querySelector(`[data-story="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
  });
}

function reopenCurrent() {
  const c = ui.current;
  if (!c) return;
  const v = store.view;
  if (c.type === 'place') {
    const p = v.placeById.get(c.id);
    p ? openDetail(placeDetail(p, store)) : closeDetail();
  } else if (c.type === 'country') openDetail(countryDetail(c.cc, store));
  else if (c.type === 'quake') {
    const q = (store.raw.quakes || []).find((x) => x.id === c.id);
    if (q) openDetail(quakeDetail(q, store));
  } else if (c.type === 'hazard') {
    const h = (store.raw.hazards || []).find((x) => x.id === c.id);
    if (h) openDetail(hazardDetail(h, store));
  } else if (c.type === 'cluster') {
    const cl = markers.clusters().find((x) => x.key === c.key);
    cl ? openDetail(clusterDetail(cl, store)) : closeDetail();
  } else if (c.type === 'sat') {
    const pos = satellites.positions().find((s) => s.id === c.id);
    if (pos) openDetail(satDetail(pos));
  }
}

detailBody.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const { action } = a.dataset;
  if (action === 'close') closeDetail();
  else if (action === 'country') selectCountry(a.dataset.cc);
  else if (action === 'place') selectPlace(store.view.placeById.get(a.dataset.id));
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
  } else if (action === 'translate') translateStory(a);
});

// Chrome's on-device Translator API (no data leaves the browser); hidden where unsupported.
let translator = null;
async function translateStory(btn) {
  const art = btn.closest('[data-story]');
  const s = (store.raw?.stories || []).find((x) => x.id === art?.dataset.story);
  if (!s) return;
  const title = art.querySelector('.story-title');
  const sum = art.querySelector('.story-sum');
  if (btn.dataset.done) {
    title.textContent = s.title;
    if (sum) sum.textContent = s.summary;
    btn.innerHTML = `${icon('translate', 13)}${esc(t().translate)}`;
    delete btn.dataset.done;
    return;
  }
  btn.textContent = t().translating;
  try {
    translator ||= await self.Translator.create({ sourceLanguage: 'en', targetLanguage: 'zh' });
    title.textContent = await translator.translate(s.title);
    if (sum && s.summary) sum.textContent = await translator.translate(s.summary);
    btn.innerHTML = `${icon('translate', 13)}${esc(t().showOriginal)}`;
    btn.dataset.done = '1';
  } catch (err) {
    console.warn(err);
    btn.remove();
  }
}

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
});

// bottom-sheet dragging (mobile)
for (const handle of $$('[data-sheet-handle]')) {
  const sheet = handle.parentElement;
  let startY = 0;
  let startH = 0;
  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    startH = sheet.getBoundingClientRect().height;
    sheet.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!sheet.classList.contains('dragging')) return;
    const h = Math.max(120, Math.min(window.innerHeight * 0.92, startH - (e.clientY - startY)));
    sheet.style.setProperty('--sheet-h', `${h}px`);
  });
  const end = (e) => {
    if (!sheet.classList.contains('dragging')) return;
    sheet.classList.remove('dragging');
    const H = window.innerHeight;
    const h = startH - (e.clientY - startY);
    if (h < H * 0.3) {
      sheet.style.removeProperty('--sheet-h');
      if (sheet === detail) closeDetail();
      else setTab('map');
      return;
    }
    sheet.style.setProperty('--sheet-h', h > H * 0.72 ? '90vh' : sheet === detail ? '58vh' : '64vh');
    setTimeout(updateOffset, 340);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------- tooltip (desktop hover)
const tooltip = $('#tooltip');
function showMarkerTooltip(item, el) {
  if (isMobile() || !item || !item.places) return hideTooltip();
  const lead = item.lead;
  const s = lead.stories[0];
  const c = CAT[item.topCat] || CAT.other;
  tooltip.innerHTML = `<div class="tt-head"><span class="badge" style="--c:${c.color}">${icon(SUB_ICON[s?.sub] || c.icon, 11)}${esc(t().cats[item.topCat])}</span><b>${esc(placeName(lead))}${item.places.length > 1 ? ` +${item.places.length - 1}` : ''}</b></div>
    <div class="tt-title">${esc(s?.title || '')}</div><div style="color:var(--muted);margin-top:4px">${esc(t().reports(item.count))} · ${esc(timeAgo(item.latest))}</div>`;
  const r = el.getBoundingClientRect();
  tooltip.style.left = `${r.left + 12}px`;
  tooltip.style.top = `${r.top}px`;
  tooltip.hidden = false;
}
function hideTooltip() {
  tooltip.hidden = true;
}

// ---------------------------------------------------------------- ticker
let tickerItems = [];
let tickerIdx = 0;
function renderTicker(force) {
  const now = Date.now() / 1000;
  const items = store.view.stories
    .filter((s) => s.sev >= 0.5 && now - s.time < 8 * 3600)
    .sort((a, b) => b.time - a.time)
    .slice(0, 8);
  const ids = items.map((s) => s.id).join();
  if (!force && ids === tickerItems.map((s) => s.id).join()) return;
  tickerItems = items;
  tickerIdx = 0;
  const el = $('#ticker');
  el.hidden = !items.length;
  el.innerHTML = `<span class="ticker-tag">${esc(t().breaking)}</span><div class="ticker-win">${items
    .map((s, i) => `<div class="ticker-item ${i === 0 ? 'in' : 'below'}" data-id="${esc(s.id)}"><span>${flag(s.loc?.cc)} ${esc(s.title)}</span><em>${esc(timeAgo(s.time, now))}</em></div>`)
    .join('')}</div>`;
}
setInterval(() => {
  const els = $$('#ticker .ticker-item');
  if (els.length < 2) return;
  const cur = els[tickerIdx];
  tickerIdx = (tickerIdx + 1) % els.length;
  const next = els[tickerIdx];
  cur.className = 'ticker-item above';
  next.className = 'ticker-item below';
  requestAnimationFrame(() => requestAnimationFrame(() => (next.className = 'ticker-item in')));
  setTimeout(() => cur.className !== 'ticker-item in' && (cur.className = 'ticker-item below'), 600);
}, 6000);
$('#ticker').addEventListener('click', () => {
  const s = tickerItems[tickerIdx];
  if (s) openStory(s.id);
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
  for (const p of places) searchHits.push({ kind: 'place', id: p.id, label: placeName(p), meta: t().reports(p.count) });
  const stories = v.stories.filter((s) => score(s.title) > 0 || score(s.summary) > 0).sort((a, b) => b.w - a.w).slice(0, 10);
  for (const s of stories) searchHits.push({ kind: 'story', id: s.id, label: s.title, meta: timeAgo(s.time) });
  paintSearch();
}
function paintSearch() {
  if (!searchInput.value.trim()) return (searchResults.innerHTML = '');
  if (!searchHits.length) return (searchResults.innerHTML = `<div class="empty">${esc(t().searchNone)}</div>`);
  let html = '';
  let lastKind = '';
  const groupName = { country: t().kinds.country, place: t().hotspots, story: t().tabs.feed };
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
  else openStory(h.id);
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
    <div class="lg-note">${esc(t().legendSize)}<br>${esc(t().legendPulse)}<br>${esc(t().legendArc)}<br>${esc(t().legendPillar)}</div>`;
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
    <div class="lg-row">${icon('news', 15)} ${esc(t().reports(raw.stories.length))} · ${esc(t().sources(ok))}/${raw.sources.length}</div>
    <div class="lg-row">${icon('quake', 15)} ${raw.quakes.length} · ${icon('alert', 15)} ${raw.hazards.length}</div>
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
  const stops = store.view.places.slice(0, 8);
  if (!stops.length) return;
  let i = 0;
  const step = () => {
    selectPlace(stops[i % stops.length], { fromTour: true });
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
    history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  } catch {
    /* sandboxed */
  }
}
function openFromHash() {
  const m = /^#([pcqhs])=(.+)$/.exec(location.hash);
  if (!m) return false;
  const id = decodeURIComponent(m[2]);
  if (m[1] === 'p') selectPlace(store.view.placeById.get(id));
  else if (m[1] === 'c') selectCountry(id);
  else if (m[1] === 'q') selectQuake((store.raw.quakes || []).find((q) => q.id === id));
  else if (m[1] === 'h') selectHazard((store.raw.hazards || []).find((h) => h.id === id));
  else if (m[1] === 's') selectSat(id);
  return Boolean(ui.current);
}

// ---------------------------------------------------------------- data loading
store.on((reason) => {
  renderChips();
  renderLayers();
  renderSide();
  renderTicker(reason === 'data');
  if (ui.current && reason === 'filter') reopenCurrent();
});

async function loadData(initial) {
  try {
    const res = await fetch(`${DATA_URL}?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    ui.loadFailed = false;
    if (store.raw && raw.generated === store.raw.generated) return;
    satellites = createSatellites(raw.satellites || []);
    const added = store.setData(raw);
    markers.setSats(satellites.positions());
    renderPaths();
    $('#sample-banner').hidden = !raw.sample;
    if (!initial && added.length) toast(t().newStories(added.length));
    if (!initial && ui.current) reopenCurrent();
  } catch (err) {
    console.error(err);
    ui.loadFailed = true;
    if (initial) $('#loader-text').textContent = t().loadFail;
    setTimeout(() => loadData(initial && !store.raw), 20000);
  } finally {
    tickClock();
  }
}

async function loadLiveQuakes() {
  try {
    const res = await fetch(LIVE_QUAKES_URL, { cache: 'no-cache' });
    const gj = await res.json();
    const known = new Set((store.raw?.quakes || []).map((q) => q.id));
    const fresh = [];
    for (const f of gj.features || []) {
      if (known.has(f.id) || f.properties?.type !== 'earthquake') continue;
      const [lng, lat, depth] = f.geometry.coordinates;
      const p = f.properties;
      fresh.push({ id: f.id, mag: Math.round(p.mag * 10) / 10, place: p.place || '', time: Math.round(p.time / 1000), lat, lng, depth: Math.round(depth * 10) / 10, url: p.url, tsunami: p.tsunami ? 1 : 0, alert: p.alert || null });
    }
    if (fresh.length && store.raw) {
      store.raw.quakes = [...fresh, ...store.raw.quakes].sort((a, b) => b.time - a.time);
      markers.setQuakes(visibleQuakes());
      renderRings();
    }
  } catch {
    /* USGS unreachable (e.g. network policy) – keep the pipeline's copy */
  }
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
window.__worldPulse = { view, store, markers, selectPlace, selectCountry };

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
  await Promise.race([Promise.all([loadData(true), view.texturesReady]), new Promise((r) => setTimeout(r, 9000))]);
  applyLayerSettings();
  $('#loader').classList.add('done');
  if (!openFromHash()) {
    const top = store.raw ? store.view.places[0] : null;
    view.flyTo({ lat: top ? Math.max(-30, Math.min(45, top.lat)) * 0.6 + 8 : 22, lng: top ? top.lng : tzLng, altitude: alt }, 2600);
  }
  bumpIdle();
  setInterval(() => loadData(false), REFRESH_MS);
  loadLiveQuakes();
  setInterval(loadLiveQuakes, REFRESH_MS);
}
boot();
