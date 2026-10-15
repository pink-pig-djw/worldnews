// HTML marker overlay: crisp, tappable markers positioned every frame from the 3D camera.
// Nearby places merge into clusters depending on zoom; clicking zooms in and opens details.
import { CAT, HAZARD_COLOR, QUAKE_COLOR, SUB_ICON } from '../config.js';
import { t } from '../i18n.js';
import { allCountries, countryInfo, countryName, placeName } from '../data/store.js';
import { hazardText, quakePlace } from '../data/localize.js';
import { esc } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const DEG = Math.PI / 180;
// Phones get smaller, calmer markers (the tap target stays large, see .mk::before in the CSS).
const phoneQuery = window.matchMedia('(max-width: 820px)');
const phone = () => phoneQuery.matches;

function angDist(a, b) {
  // fast great-circle distance in degrees (haversine)
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(s)))) / DEG;
}

const HAZARD_ICON = { quake: 'quake', storm: 'cyclone', flood: 'waves', volcano: 'volcano', fire: 'flame', drought: 'thermo', heat: 'thermo', landslide: 'mountain', dust: 'wind', snow: 'snow', tsunami: 'waves', manmade: 'alert', other: 'alert' };

export function createMarkerLayer(view, root, handlers) {
  const layer = document.createElement('div');
  layer.className = 'marker-layer';
  root.appendChild(layer);
  const labelLayer = document.createElement('div');
  labelLayer.className = 'label-layer';
  root.insertBefore(labelLayer, layer);

  const state = {
    places: [],
    clusters: [],
    clusterAlt: null,
    quakes: [],
    hazards: [],
    sats: [],
    layers: { markers: true, quakes: true, hazards: true, sats: true, labels: true },
    selectedKey: null,
    selectedPlace: null,
    maxScore: 1,
    labelsDirty: true,
    lastLabelRun: 0,
  };
  const els = new Map(); // key -> {el, item}
  const countryLabels = [];

  // ---------- clustering ----------
  function pxPerDegree() {
    const pov = view.pov();
    const a = view.project(pov.lat, pov.lng, 0);
    const b = view.project(pov.lat, pov.lng + 1 / Math.max(0.2, Math.cos(pov.lat * DEG)), 0);
    return Math.max(0.5, Math.hypot(a.x - b.x, a.y - b.y));
  }

  function recluster() {
    const ppd = pxPerDegree();
    const threshold = (phone() ? 32 : 38) / ppd; // degrees: merge markers closer than ~38px (32px on phones' smaller dots)
    const sorted = [...state.places].sort((a, b) => b.score - a.score);
    const clusters = [];
    for (const p of sorted) {
      let host = null;
      for (const c of clusters) {
        if (angDist(c, p) < threshold) {
          host = c;
          break;
        }
      }
      if (host) {
        host.places.push(p);
        host.score += p.score;
        host.count += p.count;
        host.latest = Math.max(host.latest, p.latest);
        host.maxSev = Math.max(host.maxSev, p.maxSev);
        host.fresh += p.fresh || 0;
        for (const [k, v] of Object.entries(p.cats)) host.cats[k] = (host.cats[k] || 0) + v;
      } else {
        clusters.push({ key: `p:${p.id}`, lat: p.lat, lng: p.lng, lead: p, places: [p], score: p.score, count: p.count, latest: p.latest, maxSev: p.maxSev, fresh: p.fresh || 0, cats: { ...p.cats } });
      }
    }
    for (const c of clusters) c.topCat = Object.entries(c.cats).sort((a, b) => b[1] - a[1])[0][0];
    state.clusters = clusters;
    state.maxScore = Math.max(1e-6, ...clusters.map((c) => c.score));
    state.clusterAlt = view.altitude;
    syncElements();
  }

  // ---------- element creation ----------
  function clusterEl(c) {
    const el = document.createElement('button');
    el.className = 'mk mk-news';
    el.type = 'button';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onCluster(el.__item);
    });
    el.addEventListener('pointerenter', () => handlers.onHover?.(el.__item, el));
    el.addEventListener('pointerleave', () => handlers.onHover?.(null, el));
    return el;
  }

  function renderCluster(el, c) {
    const now = Date.now() / 1000;
    const color = CAT[c.topCat]?.color || '#fff';
    const norm = Math.sqrt(c.score / state.maxScore);
    // minor places become small dots so the real hotspots stand out
    const minor = norm < 0.2 && c.count < 3;
    const size = phone() ? (minor ? 7 : Math.round(10 + 13 * norm)) : minor ? 9 : Math.round(14 + 20 * norm);
    el.classList.toggle('is-minor', minor);
    const lead = c.lead.stories[0];
    const iconName = SUB_ICON[lead?.sub] && lead.cat === c.topCat ? SUB_ICON[lead.sub] : CAT[c.topCat]?.icon;
    const fresh = now - c.latest < 3600;
    el.style.setProperty('--c', color);
    el.style.setProperty('--s', `${size}px`);
    el.classList.toggle('is-fresh', fresh);
    el.classList.toggle('is-severe', c.maxSev >= 0.7);
    el.classList.toggle('is-multi', c.places.length > 1);
    // reports that arrived in the last few minutes get a "new" tag and a brighter pulse
    const isNew = c.fresh > 0;
    el.classList.toggle('is-new', isNew);
    const name = esc(placeName(c.lead));
    const more = c.places.length > 1 ? ` +${c.places.length - 1}` : '';
    el.setAttribute('aria-label', `${placeName(c.lead)}${more} · ${t().reports(c.count)}`);
    const sig = `${size}|${c.count}|${iconName}|${color}|${name}${more}|${fresh}|${isNew}|${t().newBadge}`;
    if (el.__sig === sig) return;
    el.__sig = sig;
    el.__lw = null;
    const iconMin = phone() ? 15 : 19;
    const countMin = phone() ? 14 : 0;
    el.innerHTML = `<span class="mk-halo"></span><span class="mk-core">${size >= iconMin ? icon(iconName, Math.round(size * 0.56)) : ''}</span>${
      c.count > 1 && !minor && size >= countMin ? `<span class="mk-count">${c.count > 99 ? '99+' : c.count}</span>` : ''
    }${isNew ? `<span class="mk-new">${esc(t().newBadge)}</span>` : ''}<span class="mk-label"><b>${name}</b>${more ? `<i>${more}</i>` : ''}</span>`;
  }

  function quakeEl(q) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mk mk-quake';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onQuake(q);
    });
    const size = Math.round((phone() ? 8 : 10) + (q.mag - 4.5) * (phone() ? 5 : 7));
    el.style.setProperty('--s', `${size}px`);
    el.style.setProperty('--c', q.alert && q.alert !== 'green' ? HAZARD_COLOR[q.alert] : QUAKE_COLOR);
    el.classList.toggle('is-fresh', Date.now() / 1000 - q.time < 6 * 3600);
    el.innerHTML = `<span class="mk-halo"></span><span class="mk-core">${size >= (phone() ? 15 : 17) ? `<em>${q.mag.toFixed(1)}</em>` : ''}</span>`;
    el.setAttribute('aria-label', `M${q.mag} ${quakePlace(q)}`);
    return el;
  }

  function hazardEl(h) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `mk mk-hazard hz-${h.type}`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onHazard(h);
    });
    const big = h.alert === 'red' || h.alert === 'orange';
    el.style.setProperty('--c', HAZARD_COLOR[h.alert] || '#ffcc33');
    el.style.setProperty('--s', phone() ? (big ? '18px' : '13px') : big ? '26px' : '19px');
    el.innerHTML = `<span class="mk-core">${icon(HAZARD_ICON[h.type] || 'alert', phone() ? (big ? 11 : 8) : big ? 15 : 12)}</span>`;
    el.setAttribute('aria-label', hazardText(h, 'title'));
    return el;
  }

  function satEl(s) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `mk mk-sat sat-${s.id}`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onSat(s);
    });
    el.innerHTML = `<span class="mk-core">${icon('satellite', 16)}</span><span class="mk-tag">${esc(t().satellites === '空间站' ? s.zh : s.name)}</span>`;
    return el;
  }

  function syncElements() {
    const want = new Map();
    if (state.layers.markers) for (const c of state.clusters) want.set(c.key, { kind: 'news', item: c });
    if (state.layers.quakes) for (const q of state.quakes) want.set(`q:${q.id}`, { kind: 'quake', item: q });
    if (state.layers.hazards) for (const h of state.hazards) want.set(`h:${h.id}`, { kind: 'hazard', item: h });
    if (state.layers.sats) for (const s of state.sats) want.set(`s:${s.id}`, { kind: 'sat', item: s });

    for (const [key, rec] of els) {
      if (!want.has(key)) {
        rec.el.classList.add('is-leaving');
        setTimeout(() => rec.el.remove(), 260);
        els.delete(key);
      }
    }
    for (const [key, w] of want) {
      let rec = els.get(key);
      if (!rec) {
        const el = w.kind === 'news' ? clusterEl(w.item) : w.kind === 'quake' ? quakeEl(w.item) : w.kind === 'hazard' ? hazardEl(w.item) : satEl(w.item);
        el.dataset.key = key;
        layer.appendChild(el);
        rec = { el, kind: w.kind, item: w.item };
        els.set(key, rec);
      }
      rec.item = w.item;
      rec.el.__item = w.item;
      if (w.kind === 'news') renderCluster(rec.el, w.item);
      rec.el.classList.toggle('is-selected', isSelected(key, w.item));
    }
    state.labelsDirty = true;
  }

  function isSelected(key, item) {
    if (state.selectedPlace) return Boolean(item?.places?.some((p) => p.id === state.selectedPlace));
    return key === state.selectedKey;
  }

  // ---------- country name labels ----------
  function buildCountryLabels() {
    labelLayer.innerHTML = '';
    countryLabels.length = 0;
    for (const cc of allCountries()) {
      const info = countryInfo(cc);
      if (!info || COUNTRY_RANK[cc] == null) continue;
      const el = document.createElement('div');
      el.className = 'country-label';
      el.textContent = countryName(cc);
      labelLayer.appendChild(el);
      countryLabels.push({ cc, lat: info.lat, lng: info.lng, el, rank: 0, shown: false });
    }
  }

  // ---------- per-frame positioning ----------
  let lastAlt = null;
  let lastCam = '';
  function frame(cam) {
    const alt = view.altitude;
    if (state.clusterAlt == null || Math.abs(Math.log(alt / state.clusterAlt)) > 0.12) recluster();
    const camKey = `${cam.position.x.toFixed(2)},${cam.position.y.toFixed(2)},${cam.position.z.toFixed(2)},${cam.projectionMatrix.elements[8].toFixed(4)},${cam.projectionMatrix.elements[9].toFixed(4)}`;
    const moved = camKey !== lastCam;
    lastCam = camKey;
    if (moved || state.hasMovingItems || state.labelsDirty) {
      // Only touch the DOM when something visibly changed: style writes on hundreds of elements every
      // frame were the overlay's main cost. Markers behind the globe leave the layout entirely.
      for (const rec of els.values()) {
        const it = rec.item;
        const p = view.project(it.lat, it.lng, rec.kind === 'sat' ? it.alt ?? 0.066 : 0.012, cam);
        const vis = p.edge > 0;
        rec.screen = vis ? p : null;
        const st = rec.el.style;
        if (!vis) {
          if (rec.vis !== false) {
            st.display = 'none';
            rec.vis = false;
          }
          continue;
        }
        if (rec.vis !== true) {
          st.display = '';
          rec.vis = true;
        }
        const x = Math.round(p.x * 2) / 2;
        const y = Math.round(p.y * 2) / 2;
        if (x !== rec.x || y !== rec.y) {
          st.transform = `translate3d(${x}px, ${y}px, 0)`;
          rec.x = x;
          rec.y = y;
        }
        const op = Math.round(Math.min(1, p.edge / 0.12) * 20) / 20;
        if (op !== rec.op) {
          st.opacity = String(op);
          rec.op = op;
        }
        const z = Math.round(p.facing * 20) * 5 + (rec.kind === 'news' ? 200 : rec.kind === 'sat' ? 400 : 100);
        if (z !== rec.z) {
          st.zIndex = String(z);
          rec.z = z;
        }
      }
      for (const lb of countryLabels) {
        if (!lb.shown) continue;
        const p = view.project(lb.lat, lb.lng, 0.005, cam);
        const x = Math.round(p.x * 2) / 2;
        const y = Math.round(p.y * 2) / 2;
        if (x !== lb.x || y !== lb.y) {
          lb.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          lb.x = x;
          lb.y = y;
        }
        const op = Math.round(Math.min(1, Math.max(0, (p.edge - 0.12) / 0.2)) * 17) / 20;
        if (op !== lb.op) {
          lb.el.style.opacity = String(op);
          lb.op = op;
        }
      }
    }
    const nowMs = performance.now();
    if ((moved || state.labelsDirty) && nowMs - state.lastLabelRun > 140) {
      state.lastLabelRun = nowMs;
      state.labelsDirty = false;
      layoutLabels();
    }
    lastAlt = alt;
  }

  // Greedy collision avoidance: marker callouts for the hottest clusters, then country names.
  function layoutLabels() {
    const H = window.innerHeight;
    const topLimit = window.innerWidth < 820 ? 104 : 112;
    const inBand = (y) => y > topLimit && y < H - 64;
    const boxes = [];
    const hit = (b) => boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const news = [...els.values()].filter((r) => r.kind === 'news' && r.screen).sort((a, b) => b.item.score - a.item.score);
    for (const r of news) {
      const s = r.screen;
      const size = parseFloat(r.el.style.getPropertyValue('--s')) || 18;
      boxes.push({ x: s.x - size / 2, y: s.y - size / 2, w: size, h: size });
    }
    const maxLabels = window.innerWidth < 820 ? 5 : 14;
    let n = 0;
    for (const r of news) {
      const s = r.screen;
      const size = parseFloat(r.el.style.getPropertyValue('--s')) || 18;
      if (r.el.__lw == null) r.el.__lw = r.el.querySelector('.mk-label')?.offsetWidth || 80;
      const w = r.el.__lw;
      const box = { x: s.x + size / 2 + 4, y: s.y - 10, w, h: 20 };
      const show = n < maxLabels && inBand(s.y) && (r.item.score / state.maxScore > 0.08 || r.el.classList.contains('is-selected')) && !hit(box);
      r.el.classList.toggle('show-label', show);
      if (show) {
        boxes.push(box);
        n++;
      }
    }
    if (!state.layers.labels) {
      for (const lb of countryLabels) if (lb.shown) { lb.shown = false; lb.el.classList.remove('on'); }
      return;
    }
    const alt = view.altitude;
    const cam = view.camera;
    const maxCountryLabels = (alt > 2.2 ? 24 : alt > 1.2 ? 40 : 80) * (phone() ? 0.5 : 1);
    const maxRank = alt > 2.2 ? 110 : alt > 1.2 ? 150 : 999;
    let shown = 0;
    const ranked = countryLabels.filter((lb) => COUNTRY_RANK[lb.cc] < maxRank).map((lb) => ({ lb, p: view.project(lb.lat, lb.lng, 0.005, cam) }))
      .filter(({ p }) => p.edge > 0.2 && inBand(p.y))
      .sort((a, b) => COUNTRY_RANK[a.lb.cc] - COUNTRY_RANK[b.lb.cc]);
    const visible = new Set();
    for (const { lb, p } of ranked) {
      if (shown >= maxCountryLabels) break;
      if (!lb.w) lb.w = lb.el.offsetWidth || lb.el.textContent.length * 9;
      const w = lb.w;
      const box = { x: p.x - w / 2, y: p.y - 7, w, h: 14 };
      if (hit(box)) continue;
      boxes.push(box);
      visible.add(lb);
      lb.p = p;
      shown++;
    }
    for (const lb of countryLabels) {
      const on = visible.has(lb);
      if (on !== lb.shown) {
        lb.shown = on;
        lb.x = lb.y = lb.op = undefined; // positions weren't tracked while hidden
        if (on) lb.el.style.transform = `translate3d(${lb.p.x.toFixed(1)}px, ${lb.p.y.toFixed(1)}px, 0)`;
        lb.el.classList.toggle('on', on);
      }
    }
  }

  view.onFrame(frame);
  buildCountryLabels();

  return {
    setPlaces(places) {
      state.places = places;
      recluster();
    },
    setQuakes(q) {
      state.quakes = q;
      syncElements();
    },
    setHazards(h) {
      state.hazards = h;
      syncElements();
    },
    setSats(s) {
      state.sats = s;
      state.hasMovingItems = s.length > 0;
      syncElements();
    },
    setLayers(patch) {
      Object.assign(state.layers, patch);
      syncElements();
    },
    /** select a news place (by place id) or any other marker (by key, e.g. "q:<id>") */
    select({ place = null, key = null } = {}) {
      state.selectedPlace = place;
      state.selectedKey = key;
      for (const [k, rec] of els) rec.el.classList.toggle('is-selected', isSelected(k, rec.item));
      state.labelsDirty = true;
    },
    /** move the space-station markers without rebuilding anything else */
    moveSats(positions) {
      for (const p of positions) {
        const rec = els.get(`s:${p.id}`);
        if (rec) {
          Object.assign(rec.item, p);
        }
      }
    },
    refreshLanguage() {
      buildCountryLabels();
      for (const rec of els.values()) rec.el.__sig = null;
      syncElements();
    },
    keyForPlace(placeId) {
      return state.clusters.find((c) => c.places.some((p) => p.id === placeId))?.key ?? null;
    },
    /** nearest visible marker to a screen point (generous tap target on phones) */
    nearest(x, y, maxPx = 30) {
      let best = null;
      let bd = maxPx;
      for (const rec of els.values()) {
        if (!rec.screen) continue;
        const d = Math.hypot(rec.screen.x - x, rec.screen.y - y);
        if (d < bd) {
          bd = d;
          best = rec;
        }
      }
      return best;
    },
    clusters: () => state.clusters,
  };
}

// Rough label priority: big / populous countries first.
const COUNTRY_RANK = Object.fromEntries(
  ('RU CN US CA BR AU IN AR KZ DZ CD SA MX ID SD LY IR MN PE TD NE AO ML ZA CO ET BO MR EG TZ NG VE PK NA MZ TR CL ZM MM AF SS SO CF UA MG BW KE FR YE TH ES TM CM PG SE UZ MA IQ PY ZW JP DE CG FI VN MY NO CI PL OM IT PH EC BF NZ GA GN GB UG GH RO LA GY BY KG SN SY KH UY SR TN BD NP TJ GR NI KP MW ER BJ HN LR BG CU GT IS KR HU PT JO RS AZ AT AE CZ PA SL IE GE LK LT LV TG HR BA CR SK DO EE DK NL CH BT TW GW MD BE LS AM SB AL GQ BI HT RW MK DJ BZ SV IL SI FJ KW SZ TL BS ME VU QA GM JM XK LB CY PS BN TT')
    .split(' ')
    .map((cc, i) => [cc, i]),
);
