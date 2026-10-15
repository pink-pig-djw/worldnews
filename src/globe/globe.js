import Globe from 'globe.gl';
import * as THREE from 'three';
import { CAT } from '../config.js';
import { createAtmosphere, createClouds, createEarthMaterial, createStars, createSun, loadEarthTextures } from './materials.js';
import { subsolarPoint, toVector } from './sun.js';

const R = 100; // three-globe radius

export function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Builds the 3D scene and exposes a small controller API used by the rest of the app.
 */
export function createGlobeView(container, { quality = 'high' } = {}) {
  const mobile = window.matchMedia('(max-width: 820px)').matches;
  const g = new Globe(container, {
    rendererConfig: { antialias: quality !== 'low', powerPreference: 'high-performance', alpha: false },
    animateIn: false,
    waitForGlobeReady: false,
  });
  const renderer = g.renderer();
  const scene = g.scene();
  const camera = g.camera();
  const controls = g.controls();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1);
  renderer.setPixelRatio(pixelRatio);

  g.backgroundColor('#020409')
    .showAtmosphere(false)
    .showGraticules(false)
    .globeCurvatureResolution(mobile ? 3 : 2)
    .width(container.clientWidth)
    .height(container.clientHeight);

  // --- earth, clouds, atmosphere, stars, sun ---
  const earthMat = createEarthMaterial();
  g.globeMaterial(earthMat);
  const shared = earthMat.uniforms;
  const clouds = createClouds(R, shared);
  const atmosphere = createAtmosphere(R, shared);
  const stars = createStars(quality === 'low' ? 2500 : mobile ? 4500 : 7000, pixelRatio);
  const sun = createSun();
  scene.add(clouds, atmosphere, stars, sun);

  const maxTex = renderer.capabilities.maxTextureSize;
  const texSize = quality === 'high' && maxTex >= 4096 ? '4k' : '2k';
  const texturesReady = loadEarthTextures(earthMat, null, renderer, texSize).catch((err) => console.warn('texture load failed', err));

  function updateSun() {
    const s = subsolarPoint(new Date());
    const [x, y, z] = toVector(s.lat, s.lng);
    shared.sunDir.value.set(x, y, z).normalize();
    sun.position.set(x * 8000, y * 8000, z * 8000);
    return s;
  }
  updateSun();
  setInterval(updateSun, 30000);

  // --- per-frame hooks (run inside renderer.render with the final camera) ---
  const frameHooks = new Set();
  const clock = new THREE.Clock();
  scene.onBeforeRender = (_r, _s, cam) => {
    const t = clock.getElapsedTime();
    stars.material.uniforms.time.value = t;
    shared.cloudShift.value = (t * 0.00004) % 1;
    for (const fn of frameHooks) fn(cam, t);
  };

  // --- country polygons ---
  const capMats = new Map();
  const capMaterial = (color, opacity) => {
    const key = `${color}|${opacity.toFixed(3)}`;
    if (!capMats.has(key)) capMats.set(key, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    return capMats.get(key);
  };
  const polyState = { hover: null, selected: null, heat: null, borders: true };
  g.polygonsData([])
    .polygonGeoJsonGeometry((d) => d.geometry)
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonCapCurvatureResolution(mobile ? 6 : 4)
    .polygonsTransitionDuration(250)
    .polygonLabel(() => '');
  function refreshPolygons() {
    const { hover, selected, heat, borders } = polyState;
    g.polygonAltitude((d) => (d.properties.code === selected ? 0.011 : 0.0032))
      .polygonCapMaterial((d) => {
        const cc = d.properties.code;
        if (cc === selected) return capMaterial('#5cc8ff', 0.16);
        if (cc === hover) return capMaterial('#a8d8ff', 0.09);
        const h = heat?.get(cc);
        if (h) return capMaterial(h.color, 0.05 + 0.2 * h.t);
        return capMaterial('#ffffff', 0);
      })
      .polygonStrokeColor((d) => {
        const cc = d.properties.code;
        if (cc === selected) return 'rgba(120,210,255,0.95)';
        if (cc === hover) return 'rgba(170,220,255,0.7)';
        return borders ? 'rgba(170,200,255,0.17)' : false;
      });
  }
  refreshPolygons();

  // --- arcs ---
  const arcState = { focus: null, strokeScale: 1, arcs: [] };
  g.arcsData([])
    .arcStartLat('startLat')
    .arcStartLng('startLng')
    .arcEndLat('endLat')
    .arcEndLng('endLng')
    .arcAltitudeAutoScale(0.42)
    .arcDashLength(0.38)
    .arcDashGap(0.62)
    .arcDashInitialGap(() => Math.random())
    .arcsTransitionDuration(500);
  function refreshArcs(arcs) {
    const max = Math.max(1e-6, ...arcs.map((a) => a.weight));
    const focus = arcState.focus;
    const ks = arcState.strokeScale;
    g.arcColor((a) => {
      const c = CAT[a.cat]?.color || '#ffffff';
      const dim = focus && !(a.to === focus || a.from === focus) ? 0.12 : 1;
      return [hexToRgba(c, 0.06 * dim), hexToRgba(c, 0.95 * dim)];
    })
      .arcStroke((a) => (0.22 + 0.55 * Math.sqrt(a.weight / max)) * ks)
      .arcDashAnimateTime((a) => 3200 - 1600 * Math.sqrt(a.weight / max))
      .arcsData(arcs);
  }

  // --- rings, paths ---
  g.ringsData([])
    .ringColor((d) => (t) => hexToRgba(d.color, Math.pow(1 - t, 1.7) * (d.alpha ?? 0.85)))
    .ringMaxRadius((d) => d.maxR)
    .ringPropagationSpeed((d) => d.speed)
    .ringRepeatPeriod((d) => d.period)
    .ringAltitude(0.004)
    .ringResolution(mobile ? 48 : 72);
  g.pathsData([])
    .pathPoints('points')
    .pathPointLat((p) => p[0])
    .pathPointLng((p) => p[1])
    .pathPointAlt((p) => p[2] ?? 0.004)
    .pathColor((d) => d.colors)
    .pathStroke((d) => d.stroke ?? null)
    .pathDashLength((d) => d.dash ?? 1)
    .pathDashGap((d) => d.gap ?? 0)
    .pathDashAnimateTime((d) => d.animate ?? 0)
    .pathTransitionDuration(0)
    .pathLabel(() => '');

  // --- light pillars (custom layer) ---
  const pillarGeo = new THREE.CylinderGeometry(0.16, 0.42, 1, 10, 1, true).translate(0, 0.5, 0);
  const pillarMats = new Map();
  const pillarMat = (color) => {
    if (!pillarMats.has(color)) {
      pillarMats.set(
        color,
        new THREE.ShaderMaterial({
          uniforms: { color: { value: new THREE.Color(color) } },
          vertexShader: 'varying float vH; void main(){ vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform vec3 color; varying float vH; void main(){ float a = pow(1.0 - vH, 1.6) * 0.75; gl_FragColor = vec4(color * 1.25, a); }',
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
    }
    return pillarMats.get(color);
  };
  const Y = new THREE.Vector3(0, 1, 0);
  const pillars = new Set();
  g.customLayerData([])
    .customThreeObject((d) => {
      const m = new THREE.Mesh(pillarGeo, pillarMat(d.color));
      pillars.add(m);
      return m;
    })
    .customThreeObjectUpdate((obj, d) => {
      const c = g.getCoords(d.lat, d.lng, 0.002);
      obj.position.set(c.x, c.y, c.z);
      obj.quaternion.setFromUnitVectors(Y, obj.position.clone().normalize());
      obj.material = pillarMat(d.color);
      obj.__d = d;
      obj.__k = null;
    });
  // Pillars are a far-away overview cue; shrink them as the camera closes in so they never turn into laser beams.
  frameHooks.add((cam) => {
    const alt = cam.position.length() / R - 1;
    const k = Math.min(1, Math.max(0.06, (alt - 0.15) / 1.6));
    for (const m of pillars) {
      if (!m.parent) {
        pillars.delete(m);
        continue;
      }
      if (m.__k === k || !m.__d) continue;
      m.__k = k;
      m.scale.set(m.__d.width * (0.5 + 0.5 * k), m.__d.height * R * k, m.__d.width * (0.5 + 0.5 * k));
    }
  });

  // only countries, the globe itself and arcs take pointer events
  g.pointerEventsFilter((obj) => {
    let o = obj;
    while (o && !o.__globeObjType) o = o.parent;
    return o && ['polygon', 'globe', 'arc'].includes(o.__globeObjType);
  });

  // --- camera & controls ---
  controls.enableDamping = true;
  controls.autoRotateSpeed = 0.32;
  controls.minDistance = R * 1.1; // closer than this the 4k imagery turns to mush
  controls.maxDistance = R * 9;
  const interaction = new Set();
  controls.addEventListener('start', () => interaction.forEach((fn) => fn()));
  container.addEventListener('wheel', () => interaction.forEach((fn) => fn()), { passive: true });

  let offsetAnim = null;
  let currentOffset = [0, 0];
  function setOffset(target, ms = 450) {
    const from = [...currentOffset];
    const start = performance.now();
    cancelAnimationFrame(offsetAnim);
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      currentOffset = [from[0] + (target[0] - from[0]) * e, from[1] + (target[1] - from[1]) * e];
      g.globeOffset(currentOffset);
      if (k < 1) offsetAnim = requestAnimationFrame(step);
    };
    offsetAnim = requestAnimationFrame(step);
  }

  const v3 = new THREE.Vector3();
  /**
   * Screen position of a lat/lng. `facing` is 1 at the view centre; `edge` is how far the point is
   * inside the visible horizon (<= 0 means hidden behind the globe).
   */
  function project(lat, lng, alt = 0.01, cam = camera) {
    const c = g.getCoords(lat, lng, alt);
    const r = Math.hypot(c.x, c.y, c.z);
    const cp = cam.position;
    const d = Math.hypot(cp.x, cp.y, cp.z);
    const facing = (c.x * cp.x + c.y * cp.y + c.z * cp.z) / (r * d);
    const horizon = Math.cos(Math.acos(Math.min(1, R / d)) + Math.acos(Math.min(1, R / r)));
    v3.set(c.x, c.y, c.z).project(cam);
    return { x: ((v3.x + 1) / 2) * g.width(), y: ((1 - v3.y) / 2) * g.height(), facing, edge: facing - horizon };
  }

  function resize() {
    g.width(container.clientWidth).height(container.clientHeight);
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? g.pauseAnimation() : g.resumeAnimation()));

  return {
    g,
    THREE,
    camera,
    controls,
    renderer,
    texturesReady,
    get altitude() {
      return g.pointOfView().altitude;
    },
    pov: () => g.pointOfView(),
    flyTo(pov, ms = 1600) {
      g.pointOfView(pov, ms);
    },
    project,
    setOffset,
    onFrame: (fn) => frameHooks.add(fn),
    onInteraction: (fn) => interaction.add(fn),
    setCountries(features) {
      g.polygonsData(features);
    },
    setHoverCountry(cc) {
      if (polyState.hover === cc) return;
      polyState.hover = cc;
      refreshPolygons();
    },
    setSelectedCountry(cc) {
      polyState.selected = cc;
      refreshPolygons();
    },
    setHeat(map) {
      polyState.heat = map;
      refreshPolygons();
    },
    setBorders(on) {
      polyState.borders = on;
      refreshPolygons();
    },
    setArcs(arcs, focus = arcState.focus) {
      arcState.focus = focus;
      arcState.arcs = arcs;
      refreshArcs(arcs);
    },
    /** thinner arcs when zoomed in (stroke widths are in degrees, so they grow on screen) */
    setArcScale(k) {
      if (Math.abs(k - arcState.strokeScale) < 0.05) return;
      arcState.strokeScale = k;
      refreshArcs(arcState.arcs);
    },
    setRings: (rings) => g.ringsData(rings),
    setPaths: (paths) => g.pathsData(paths),
    setPillars: (pillars) => g.customLayerData(pillars),
    setClouds(on) {
      clouds.visible = on;
      shared.cloudAmount.value = on ? 1 : 0;
    },
    setNightStyle(on) {
      const target = on ? 1 : 0;
      const from = shared.nightStyle.value;
      const start = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - start) / 600);
        shared.nightStyle.value = from + (target - from) * k;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    setTerminator(on) {
      shared.terminator.value = on ? 1 : 0;
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
    subsolar: () => subsolarPoint(new Date()),
  };
}
