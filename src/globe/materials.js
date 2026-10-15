import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D auxMap;      // r: city lights, g: water mask, b: clouds
  uniform vec3 sunDir;
  uniform float cloudShift;
  uniform float cloudAmount;
  uniform float nightStyle;      // 0 realistic … 1 dark "ops" style
  uniform float terminator;      // 1 = real day/night, 0 = evenly lit
  uniform float reveal;          // fade-in once textures arrive
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(sunDir);
    // sine of the sun's elevation at this point (0 on the terminator); flat light when the
    // day/night layer is off
    float sunSin = mix(0.62, dot(N, L), terminator);

    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 aux = texture2D(auxMap, vUv).rgb;
    float lights = aux.r;
    float water = aux.g;
    float cloud = texture2D(auxMap, vec2(vUv.x + cloudShift, vUv.y)).b * cloudAmount;

    // Sunlight follows the sun's elevation and turns warm when the sun is low; past the terminator
    // only scattered twilight remains (civil twilight ends at -6 degrees, sin = -0.10).
    float direct = clamp(sunSin, 0.0, 1.0);
    vec3 warm = mix(vec3(1.0, 0.56, 0.32), vec3(1.0), smoothstep(0.0, 0.2, sunSin));
    float twilight = smoothstep(-0.105, 0.0, sunSin);
    vec3 lit = day * warm * (0.06 + 1.12 * pow(direct, 0.8)) + day * vec3(0.05, 0.065, 0.1) * twilight;
    lit *= 1.0 - 0.38 * cloud;                                   // cloud shadows

    vec3 H = normalize(L + V);                                   // sun glint on open water
    float spec = pow(max(dot(N, H), 0.0), 75.0) * water;
    lit += vec3(1.0, 0.86, 0.68) * warm * spec * 0.6 * smoothstep(0.0, 0.2, sunSin) * (1.0 - cloud);

    // Night: deep blue-black ground and city lights that come on through dusk
    float night = 1.0 - smoothstep(-0.1, 0.05, sunSin);
    vec3 dark = day * 0.022 + vec3(0.002, 0.004, 0.011);
    float city = pow(lights, 1.45) * night * (1.0 - 0.75 * cloud);
    vec3 col = mix(dark, lit, smoothstep(-0.12, 0.04, sunSin)) + vec3(1.0, 0.66, 0.3) * city * 1.7;

    // Clouds, drawn here rather than as a second sphere: one full-globe pass less per frame
    float ca = cloud * cloud * 0.85;
    vec3 cloudLit = warm * (0.08 + 0.95 * smoothstep(-0.06, 0.25, sunSin));
    float cloudDay = smoothstep(-0.12, 0.06, sunSin);
    vec3 cloudCol = mix(vec3(0.028, 0.04, 0.065), cloudLit, cloudDay);
    col = mix(col, cloudCol, ca * (0.25 + 0.75 * cloudDay));

    if (nightStyle > 0.001) {
      float lum = dot(day, vec3(0.299, 0.587, 0.114));
      vec3 ops = mix(vec3(0.010, 0.020, 0.042), vec3(0.055, 0.085, 0.125), (1.0 - water) * smoothstep(0.02, 0.45, lum));
      float coast = clamp(fwidth(water) * 2.2, 0.0, 1.0);
      ops += vec3(0.25, 0.62, 1.0) * coast * 0.5;
      ops *= mix(1.0, mix(0.5, 1.0, smoothstep(-0.12, 0.04, sunSin)), terminator); // keep day/night readable
      ops += vec3(1.0, 0.7, 0.38) * pow(lights, 1.45) * 1.25;
      col = mix(col, ops, nightStyle);
    }

    // atmosphere seen edge-on: blue on the day side, faint on the night side
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
    float dayRim = smoothstep(-0.3, 0.3, sunSin);
    vec3 rimCol = mix(vec3(0.03, 0.06, 0.18), vec3(0.36, 0.62, 1.0), dayRim);
    col += rimCol * fres * (0.18 + 0.66 * dayRim);

    gl_FragColor = vec4(col * reveal, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosDir;
  varying vec3 vNormalW;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPosDir = normalize(mv.xyz);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 sunDir;
  uniform float terminator;
  uniform float strength;
  varying vec3 vNormal;
  varying vec3 vPosDir;
  varying vec3 vNormalW;
  void main() {
    float i = pow(clamp(0.16 + dot(vPosDir, vNormal), 0.0, 1.0), 4.2);
    float ndl = mix(0.6, dot(normalize(vNormalW), normalize(sunDir)), terminator);
    float lit = smoothstep(-0.35, 0.3, ndl);
    vec3 col = mix(vec3(0.1, 0.16, 0.45), vec3(0.38, 0.68, 1.0), lit);
    col = mix(col, vec3(1.0, 0.52, 0.28), exp(-pow(ndl / 0.11, 2.0)) * 0.32 * terminator);
    gl_FragColor = vec4(col, i * strength * (0.2 + 0.8 * lit));
  }
`;

function placeholderTexture(rgb) {
  const t = new THREE.DataTexture(new Uint8Array([...rgb, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

export function createEarthMaterial() {
  const uniforms = {
    dayMap: { value: placeholderTexture([6, 14, 30]) },
    auxMap: { value: placeholderTexture([0, 255, 0]) },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    cloudShift: { value: 0 },
    cloudAmount: { value: 1 },
    nightStyle: { value: 0 },
    terminator: { value: 1 },
    reveal: { value: 1 },
  };
  return new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: EARTH_FRAG });
}

export function loadEarthTextures(material, renderer, size) {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (url, srgb) =>
    loader.loadAsync(url).then((tex) => {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = aniso;
      tex.wrapS = THREE.RepeatWrapping; // clouds drift across the antimeridian
      return tex;
    });
  return Promise.all([load(`textures/earth-day-${size}.jpg`, true), load(`textures/earth-aux-${size}.jpg`, false)]).then(([day, aux]) => {
    material.uniforms.dayMap.value = day;
    material.uniforms.auxMap.value = aux;
  });
}

export function createAtmosphere(radius, shared) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { sunDir: shared.sunDir, terminator: shared.terminator, strength: { value: 1.15 } },
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.16, 96, 64), mat);
  mesh.renderOrder = 2;
  return mesh;
}

const STAR_VERT = /* glsl */ `
  attribute float size;
  attribute float phase;
  attribute vec3 tint;
  uniform float time;
  uniform float pixelRatio;
  varying vec3 vTint;
  varying float vTw;
  void main() {
    vTint = tint;
    vTw = 0.78 + 0.22 * sin(time * (0.6 + phase * 1.7) + phase * 40.0);
    gl_PointSize = size * pixelRatio * (0.9 + 0.1 * vTw);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vTint;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vTint * vTw, a);
  }
`;

/** Procedural star field with a denser Milky-Way band and gentle twinkle. */
export function createStars(count, pixelRatio) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const tint = new Float32Array(count * 3);
  const R = 9000;
  const tilt = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(62)).multiply(new THREE.Matrix4().makeRotationZ(0.4));
  const v = new THREE.Vector3();
  const palette = [[0.7, 0.8, 1.0], [0.85, 0.9, 1.0], [1, 1, 1], [1, 0.95, 0.85], [1, 0.85, 0.65], [1, 0.75, 0.55]];
  for (let i = 0; i < count; i++) {
    const band = i % 3 === 0;
    if (band) {
      const a = Math.random() * Math.PI * 2;
      const spread = (Math.random() + Math.random() + Math.random() - 1.5) * 0.22;
      v.set(Math.cos(a), spread, Math.sin(a)).normalize().applyMatrix4(tilt);
    } else {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      v.set(s * Math.cos(a), u, s * Math.sin(a));
    }
    pos.set([v.x * R, v.y * R, v.z * R], i * 3);
    const r = Math.random();
    size[i] = band ? 0.6 + r * 1.3 : r < 0.92 ? 0.7 + r * 1.4 : 2.1 + Math.random() * 1.8;
    phase[i] = Math.random();
    const c = palette[Math.floor(Math.pow(Math.random(), 1.6) * palette.length)];
    const dim = band ? 0.45 + Math.random() * 0.35 : 0.55 + Math.random() * 0.45;
    tint.set([c[0] * dim, c[1] * dim, c[2] * dim], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pixelRatio: { value: pixelRatio } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -1;
  return pts;
}

/** Soft glow sprite for the sun, placed far away along the sun direction. */
export function createSun() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,250,235,1)');
  g.addColorStop(0.08, 'rgba(255,236,190,0.9)');
  g.addColorStop(0.25, 'rgba(255,190,110,0.25)');
  g.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sprite.scale.setScalar(900);
  sprite.renderOrder = -1;
  return sprite;
}
