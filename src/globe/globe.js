import Globe from 'globe.gl';
import * as THREE from 'three';
import { CAT } from '../config.js';
import { createAtmosphere, createEarthMaterial, createStars, createSun, loadEarthTextures } from './materials.js';
import { subsolarPoint, toVector } from './sun.js';

const R = 100; // three-globe radius

/** Soft round glow for sprites. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,236,200,0.9)');
  grd.addColorStop(0.45, 'rgba(255,190,110,0.28)');
  grd.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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
    // multisampling is wasted on high-density screens, where pixels are already tiny
    rendererConfig: { antialias: quality !== 'low' && (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance', alpha: false },
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
  const atmosphere = createAtmosphere(R, shared);
  const stars = createStars(quality === 'low' ? 2500 : mobile ? 4500 : 7000, pixelRatio);
  const sun = createSun();
  scene.add(atmosphere, stars, sun);

  const maxTex = renderer.capabilities.maxTextureSize;
  const texSize = quality === 'high' && maxTex >= 4096 ? '4k' : '2k';
  const texturesReady = loadEarthTextures(earthMat, renderer, texSize).catch((err) => console.warn('texture load failed', err));

  // The day/night line: a great circle 90° from the point where the sun is overhead, plus a small
  // glowing marker on that point. Both follow the real sun (it moves 0.25° per minute).
  const termGeo = new THREE.BufferGeometry();
  termGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(361 * 3), 3));
  const termLine = new THREE.Line(termGeo, new THREE.LineDashedMaterial({ color: '#ffc27a', transparent: true, opacity: 0.32, dashSize: 1.6, gapSize: 1.1, depthWrite: false }));
  termLine.renderOrder = 3;
  const sunDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunDot.scale.set(7, 7, 1);
  sunDot.renderOrder = 3;
  scene.add(termLine, sunDot);
  const sv = new THREE.Vector3();
  const su = new THREE.Vector3();
  const sw = new THREE.Vector3();
  function updateSun() {
    const s = subsolarPoint(new Date());
    const [x, y, z] = toVector(s.lat, s.lng);
    shared.sunDir.value.set(x, y, z).normalize();
    sun.position.set(x * 8000, y * 8000, z * 8000);
    sv.set(x, y, z).normalize();
    su.set(0, 1, 0).cross(sv).normalize();
    sw.copy(sv).cross(su).normalize();
    const pos = termGeo.attributes.position;
    const r = R * 1.0045;
    for (let i = 0; i <= 360; i++) {
      const a = (i / 180) * Math.PI;
      pos.setXYZ(i, (su.x * Math.cos(a) + sw.x * Math.sin(a)) * r, (su.y * Math.cos(a) + sw.y * Math.sin(a)) * r, (su.z * Math.cos(a) + sw.z * Math.sin(a)) * r);
    }
    pos.needsUpdate = true;
    termGeo.computeBoundingSphere();
    termLine.computeLineDistances();
    sunDot.position.copy(sv).multiplyScalar(R * 1.01);
    return s;
  }
  updateSun();
  setInterval(updateSun, 10000);

  // Adaptive resolution: if frames take too long (weaker GPUs, big high-density screens), render at
  // a lower pixel ratio; go back up when there is headroom.
  const maxRatio = pixelRatio;
  const minRatio = Math.min(0.8, maxRatio);
  let ratio = maxRatio;
  let lastFrame = performance.now();
  let lastChange = 0;
  const frameTimes = [];
  function adaptResolution() {
    const now = performance.now();
    const dt = now - lastFrame;
    lastFrame = now;
    if (dt > 250) return (frameTimes.length = 0); // tab switch, stall
    frameTimes.push(dt);
    if (frameTimes.length < 90) return;
    const median = frameTimes.sort((a, b) => a - b)[45];
    frameTimes.length = 0;
    if (now - lastChange < 2500) return;
    let next = ratio;
    if (median > 21 && ratio > minRatio) next = Math.max(minRatio, ratio - 0.25);
    else if (median < 12.5 && ratio < maxRatio) next = Math.min(maxRatio, ratio + 0.25);
    if (next === ratio) return;
    ratio = next;
    lastChange = now;
    renderer.setPixelRatio(ratio);
    stars.material.uniforms.pixelRatio.value = ratio;
  }

  // --- per-frame hooks (run inside renderer.render with the final camera) ---
  const frameHooks = new Set();
  const clock = new THREE.Clock();
  scene.onBeforeRender = (_r, _s, cam) => {
    const t = clock.getElapsedTime();
    stars.material.uniforms.time.value = t;
    shared.cloudShift.value = (t * 0.00004) % 1;
    for (const fn of frameHooks) fn(cam, t);
    adaptResolution();
  };

  // --- country polygons ---
  // three-globe's polygon layer is kept only for hit-testing (invisible caps, no sides or strokes):
  // drawing it costs two draw calls per country part (~600) and re-digests every country on each
  // hover. Borders are one merged line mesh; hover/selection/heat get small dedicated meshes.
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  g.polygonsData([])
    .polygonGeoJsonGeometry((d) => d.geometry)
    .polygonCapMaterial(() => hitMaterial)
    .polygonSideColor(() => null)
    .polygonStrokeColor(() => false)
    .polygonAltitude(0.0032)
    .polygonCapCurvatureResolution(6)
    .polygonsTransitionDuration(0)
    .polygonLabel(() => '');

  const polyState = { hover: null, selected: null, heat: null, borders: true, features: [] };
  const lineMats = new Map();
  const lineMaterial = (color, opacity) => {
    const key = `${color}|${opacity}`;
    if (!lineMats.has(key)) lineMats.set(key, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    return lineMats.get(key);
  };
  const fillMats = new Map();
  const fillMaterial = (color, opacity) => {
    const key = `${color}|${opacity.toFixed(3)}`;
    if (!fillMats.has(key)) fillMats.set(key, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    return fillMats.get(key);
  };

  /** Line segments along every ring of the given features, slightly above the surface. */
  function outlineGeometry(features, alt) {
    const pts = [];
    const push = (lat, lng) => {
      const c = g.getCoords(lat, lng, alt);
      pts.push(c.x, c.y, c.z);
    };
    for (const f of features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys)
        for (const ring of poly)
          for (let i = 1; i < ring.length; i++) {
            const [lng0, lat0] = ring[i - 1];
            const [lng1, lat1] = ring[i];
            // split long edges so the chord doesn't dip below the surface
            const steps = Math.max(1, Math.ceil(Math.hypot(lng1 - lng0, lat1 - lat0) / 2));
            for (let k = 0; k < steps; k++) {
              const a = k / steps;
              const b = (k + 1) / steps;
              push(lat0 + (lat1 - lat0) * a, lng0 + (lng1 - lng0) * a);
              push(lat0 + (lat1 - lat0) * b, lng0 + (lng1 - lng0) * b);
            }
          }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geo;
  }

  const borderLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial('#aac8ff', 0.17));
  borderLines.renderOrder = 3;
  const highlights = new THREE.Group();
  highlights.renderOrder = 3;
  scene.add(borderLines, highlights);
  const outlineCache = new Map();

  // cap meshes three-globe built for each country (one per part of a multi-polygon)
  let capsByCc = null;
  function capsFor(cc) {
    if (!capsByCc) {
      capsByCc = new Map();
      scene.traverse((o) => {
        const code = o.__globeObjType === 'polygon' && o.__data?.data?.properties?.code;
        if (!code || !o.children[0]?.geometry?.attributes?.position) return;
        if (!capsByCc.has(code)) capsByCc.set(code, []);
        capsByCc.get(code).push(o.children[0]);
      });
      if (!capsByCc.size) capsByCc = null; // not built yet: try again next time
    }
    return capsByCc?.get(cc) || [];
  }

  function addFill(cc, color, opacity, lift) {
    for (const cap of capsFor(cc)) {
      const m = new THREE.Mesh(cap.geometry, fillMaterial(color, opacity));
      m.scale.setScalar(1 + lift);
      m.renderOrder = 3;
      highlights.add(m);
    }
  }
  function addOutline(cc, color, opacity, lift) {
    const key = `${cc}|${lift}`;
    if (!outlineCache.has(key)) {
      const f = polyState.features.find((x) => x.properties.code === cc);
      if (!f) return;
      outlineCache.set(key, outlineGeometry([f], lift));
    }
    const line = new THREE.LineSegments(outlineCache.get(key), lineMaterial(color, opacity));
    line.renderOrder = 4;
    highlights.add(line);
  }

  function refreshPolygons() {
    const { hover, selected, heat, borders } = polyState;
    borderLines.visible = borders;
    highlights.clear();
    if (heat) for (const [cc, h] of heat) if (cc !== selected) addFill(cc, h.color, 0.05 + 0.2 * h.t, 0.0036);
    if (hover && hover !== selected) {
      addFill(hover, '#a8d8ff', 0.09, 0.004);
      addOutline(hover, '#aadcff', 0.7, 0.0042);
    }
    if (selected) {
      addFill(selected, '#5cc8ff', 0.16, 0.006);
      addOutline(selected, '#78d2ff', 0.95, 0.0062);
    }
  }

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
      .arcStroke((a) => (0.22 + 0.55 * Math.sqrt(a.weight / max)) * ks * (mobile ? 0.6 : 1))
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
    .ringResolution(mobile ? 40 : 56);
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
    // on phones pillars fade out entirely when zoomed in, where they read as stray lines
    const k = mobile ? Math.min(1, Math.max(0, (alt - 0.75) / 1.5)) : Math.min(1, Math.max(0.06, (alt - 0.15) / 1.6));
    for (const m of pillars) {
      if (!m.parent) {
        pillars.delete(m);
        continue;
      }
      if (m.__k === k || !m.__d) continue;
      m.__k = k;
      m.visible = k > 0.01;
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
      polyState.features = features;
      capsByCc = null;
      outlineCache.clear();
      g.polygonsData(features);
      borderLines.geometry.dispose();
      borderLines.geometry = outlineGeometry(features, 0.0035);
      refreshPolygons();
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
      termLine.visible = sunDot.visible = on;
    },
    get pixelRatio() {
      return ratio;
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
    subsolar: () => subsolarPoint(new Date()),
  };
}
