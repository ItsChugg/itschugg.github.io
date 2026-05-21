import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

// ── Renderer ─────────────────────────────────────────────────────────────────

const canvas = document.getElementById('globe-canvas');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

// ── Scene & Camera ───────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
camera.position.set(0, 0.4, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping  = true;
controls.dampingFactor  = 0.06;
controls.minDistance    = 1.6;
controls.maxDistance    = 10;
controls.autoRotate     = false;

// ── Background stars ─────────────────────────────────────────────────────────

const STAR_COUNT    = 5000;
const starPositions = new Float32Array(STAR_COUNT * 3);
const starSizes     = new Float32Array(STAR_COUNT);

for (let i = 0; i < STAR_COUNT; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  const r     = 60 + Math.random() * 30;
  starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = r * Math.cos(phi);
  starSizes[i] = 1.0 + Math.random() * 4.0;
}

const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeo.setAttribute('size',     new THREE.BufferAttribute(starSizes, 1));

const starMat = new THREE.ShaderMaterial({
  uniforms: { opacity: { value: 1.0 } },
  vertexShader: `
    attribute float size;
    void main() {
      gl_PointSize = size;
      gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float opacity;
    void main() {
      float d     = length(gl_PointCoord - 0.5) * 2.0;
      if (d > 1.0) discard;
      float alpha = (1.0 - smoothstep(0.5, 1.0, d)) * opacity;
      gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
    }
  `,
  transparent: true,
  depthWrite:  false,
});

const bgStars = new THREE.Points(starGeo, starMat);
scene.add(bgStars);

// ── Shader source strings ─────────────────────────────────────────────────────
// Defined as constants so each Body instance can create its own ShaderMaterial
// without duplicating source text. Three.js caches compiled programs by source
// hash, so all bodies that share the same strings share one GPU program.

const GLOBE_VERT = /* glsl */`
  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vViewDir;

  void main() {
    vUv          = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vViewDir     = normalize(cameraPosition - worldPos.xyz);
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOBE_FRAG = /* glsl */`
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform bool      hasDayTex;
  uniform bool      hasNightTex;
  uniform vec3      sunDir;
  uniform vec3      sunColor;
  uniform float     sunIntensity;
  uniform vec3      baseColor;
  uniform float     ambientStr;
  uniform bool      flatLit;
  uniform float     nightThreshold;

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vViewDir;

  void main() {
    vec3 color;

    if (flatLit) {
      color = hasDayTex ? texture2D(dayTex, vUv).rgb : baseColor;

    } else {
      vec3  N     = normalize(vWorldNormal);
      float NdotL = dot(N, sunDir);

      float dayMask = smoothstep(-0.02, 0.02, NdotL);
      float diffuse = clamp(NdotL * sunIntensity, 0.0, 1.0);
      float lit     = diffuse * (1.0 - ambientStr) + ambientStr * dayMask;
      float litDisp = pow(max(lit, 0.0), 1.0 / 2.2);

      if (hasDayTex && hasNightTex) {
        vec3 day      = texture2D(dayTex,   vUv).rgb;
        vec3 nightRaw = texture2D(nightTex, vUv).rgb;
        float lum       = dot(nightRaw, vec3(0.2126, 0.7152, 0.0722));
        vec3 cityLights = nightRaw * smoothstep(nightThreshold, nightThreshold + 0.08, lum);
        color = day * litDisp * sunColor + cityLights * (1.0 - dayMask);

      } else if (hasDayTex) {
        color = texture2D(dayTex, vUv).rgb * litDisp * sunColor;

      } else {
        color = baseColor * litDisp * sunColor;
      }
    }

    float dither = (fract(dot(gl_FragCoord.xy, vec2(0.75487766, 0.56984029))) - 0.5) / 255.0;
    gl_FragColor = vec4(clamp(color + dither, 0.0, 1.0), 1.0);
  }
`;

const GRAT_VERT = /* glsl */`
  uniform vec3 sunDir;
  varying float vFacing;
  varying float vNdotL;
  void main() {
    vec3 worldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    vFacing = dot(worldNormal, normalize(cameraPosition - worldPos));
    vNdotL  = dot(worldNormal, sunDir);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GRAT_FRAG = /* glsl */`
  uniform vec3  lineColor;
  uniform float opacity;
  uniform bool  flatLit;
  varying float vFacing;
  varying float vNdotL;
  void main() {
    float t          = clamp(vFacing * 0.5 + 0.5, 0.0, 1.0);
    float brightness = mix(0.40, 1.0, t);
    float backFade   = flatLit ? 1.0 : max(sign(vFacing), 0.0);
    float nightFade  = flatLit ? 1.0 : smoothstep(-0.05, 0.05, vNdotL);
    gl_FragColor = vec4(lineColor * brightness, opacity * backFade * nightFade);
  }
`;

const RIM_VERT = /* glsl */`
  uniform vec3 viewVector;
  varying float rim;
  void main() {
    vec3 vn = normalize(normalMatrix * normal);
    vec3 vv = normalize(normalMatrix * viewVector);
    rim = pow(1.0 - abs(dot(vn, vv)), 3.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIM_FRAG = /* glsl */`
  uniform vec3 glowColor;
  varying float rim;
  void main() { gl_FragColor = vec4(glowColor, rim * 0.18); }
`;

// ── Graticule builder functions ───────────────────────────────────────────────
// All builders take an explicit `radius` — no global constant dependency.

function buildGraticule(radius, latDiv, lonDiv, seg = 128) {
  const pts = [];
  for (let i = 1; i < latDiv; i++) {
    const phi = (i / latDiv) * Math.PI;
    const y = radius * Math.cos(phi);
    const r = radius * Math.sin(phi);
    for (let j = 0; j < seg; j++) {
      const a1 = (j       / seg) * Math.PI * 2;
      const a2 = ((j + 1) / seg) * Math.PI * 2;
      pts.push(r * Math.cos(a1), y, r * Math.sin(a1));
      pts.push(r * Math.cos(a2), y, r * Math.sin(a2));
    }
  }
  for (let i = 0; i < lonDiv; i++) {
    const theta = (i / lonDiv) * Math.PI * 2;
    const ct = Math.cos(theta), st = Math.sin(theta);
    for (let j = 0; j < seg; j++) {
      const p1 = (j       / seg) * Math.PI;
      const p2 = ((j + 1) / seg) * Math.PI;
      pts.push(radius * Math.sin(p1) * ct, radius * Math.cos(p1), radius * Math.sin(p1) * st);
      pts.push(radius * Math.sin(p2) * ct, radius * Math.cos(p2), radius * Math.sin(p2) * st);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildTriangleGraticule(radius, detail = 4) {
  return new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(radius, detail));
}

function buildHexGraticule(radius, detail = 2) {
  const icoGeo = new THREE.IcosahedronGeometry(1, detail);
  const pos    = icoGeo.attributes.position;
  const nFaces = pos.count / 3;
  const PREC   = 1e6;
  const vKey   = vi =>
    `${Math.round(pos.getX(vi) * PREC)},${Math.round(pos.getY(vi) * PREC)},${Math.round(pos.getZ(vi) * PREC)}`;

  const centroids = [];
  for (let i = 0; i < nFaces; i++) {
    const a = i * 3, b = a + 1, c = a + 2;
    centroids.push(
      new THREE.Vector3(
        (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3,
        (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3,
        (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3,
      ).normalize().multiplyScalar(radius)
    );
  }

  const edgeMap = new Map();
  for (let i = 0; i < nFaces; i++) {
    const vk = [vKey(i * 3), vKey(i * 3 + 1), vKey(i * 3 + 2)];
    for (let e = 0; e < 3; e++) {
      const k1 = vk[e], k2 = vk[(e + 1) % 3];
      const edgeKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      if (!edgeMap.has(edgeKey)) edgeMap.set(edgeKey, []);
      edgeMap.get(edgeKey).push(i);
    }
  }

  const pts = [];
  for (const faces of edgeMap.values()) {
    if (faces.length === 2)
      pts.push(...centroids[faces[0]].toArray(), ...centroids[faces[1]].toArray());
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildBrickGraticule(radius, latDiv, lonDiv, seg = 64) {
  const pts = [];
  for (let i = 1; i < latDiv; i++) {
    const phi = (i / latDiv) * Math.PI;
    const y = radius * Math.cos(phi), r = radius * Math.sin(phi);
    for (let j = 0; j < seg; j++) {
      const a1 = (j       / seg) * Math.PI * 2;
      const a2 = ((j + 1) / seg) * Math.PI * 2;
      pts.push(r * Math.cos(a1), y, r * Math.sin(a1),
               r * Math.cos(a2), y, r * Math.sin(a2));
    }
  }
  const vSeg = 8;
  for (let row = 0; row < latDiv; row++) {
    const offset = (row % 2) * 0.5;
    const phi1 = (row       / latDiv) * Math.PI;
    const phi2 = ((row + 1) / latDiv) * Math.PI;
    for (let j = 0; j < lonDiv; j++) {
      const theta = ((j + offset) / lonDiv) * Math.PI * 2;
      const ct = Math.cos(theta), st = Math.sin(theta);
      for (let k = 0; k < vSeg; k++) {
        const p1 = phi1 + (k       / vSeg) * (phi2 - phi1);
        const p2 = phi1 + ((k + 1) / vSeg) * (phi2 - phi1);
        pts.push(radius * Math.sin(p1) * ct, radius * Math.cos(p1), radius * Math.sin(p1) * st,
                 radius * Math.sin(p2) * ct, radius * Math.cos(p2), radius * Math.sin(p2) * st);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildDiamondGraticule(radius, latDiv, lonDiv, seg = 8) {
  const pts = [];
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
  const spt = (phi, theta) => new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)
  ).multiplyScalar(radius);

  for (let i = 0; i < latDiv; i++) {
    const phi1 = (i       / latDiv) * Math.PI;
    const phi2 = ((i + 1) / latDiv) * Math.PI;
    for (let j = 0; j < lonDiv; j++) {
      const theta1 = (j       / lonDiv) * Math.PI * 2;
      const theta2 = ((j + 1) / lonDiv) * Math.PI * 2;
      const NW = spt(phi1, theta1), NE = spt(phi1, theta2);
      const SW = spt(phi2, theta1), SE = spt(phi2, theta2);
      for (const [a, b] of [[NW, SE], [NE, SW]]) {
        for (let k = 0; k < seg; k++) {
          v0.lerpVectors(a, b, k       / seg).normalize().multiplyScalar(radius);
          v1.lerpVectors(a, b, (k + 1) / seg).normalize().multiplyScalar(radius);
          pts.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildLoxodromeGraticule(radius, count, angleDeg = 60, seg = 200) {
  const pts  = [];
  const tanA = Math.tan(THREE.MathUtils.degToRad(angleDeg));
  const lo   = THREE.MathUtils.degToRad(-80);
  const hi   = THREE.MathUtils.degToRad( 80);

  for (let i = 0; i < count; i++) {
    const lon0 = (i / count) * Math.PI * 2;
    for (const sign of [1, -1]) {
      for (let k = 0; k < seg - 1; k++) {
        const lat1 = lo + (k       / (seg - 1)) * (hi - lo);
        const lat2 = lo + ((k + 1) / (seg - 1)) * (hi - lo);
        const M1   = Math.log(Math.tan(Math.PI / 4 + lat1 / 2));
        const M2   = Math.log(Math.tan(Math.PI / 4 + lat2 / 2));
        const lon1 = lon0 + sign * tanA * M1;
        const lon2 = lon0 + sign * tanA * M2;
        const co1 = Math.PI / 2 - lat1, co2 = Math.PI / 2 - lat2;
        pts.push(
          radius * Math.sin(co1) * Math.cos(lon1), radius * Math.cos(co1), radius * Math.sin(co1) * Math.sin(lon1),
          radius * Math.sin(co2) * Math.cos(lon2), radius * Math.cos(co2), radius * Math.sin(co2) * Math.sin(lon2),
        );
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildVoronoiGraticule(radius, N, arcSeg = 6) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const seeds = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * i + 1) / N;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    seeds.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
  }

  const hullGeo = new ConvexGeometry(seeds);
  const pos     = hullGeo.attributes.position;
  const nFaces  = pos.count / 3;
  const PREC    = 1e6;
  const vKey    = vi =>
    `${Math.round(pos.getX(vi) * PREC)},${Math.round(pos.getY(vi) * PREC)},${Math.round(pos.getZ(vi) * PREC)}`;

  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const ab = new THREE.Vector3(), bc = new THREE.Vector3(), ca = new THREE.Vector3();
  const circumcenters = [];
  for (let i = 0; i < nFaces; i++) {
    const ai = i * 3, bi = ai + 1, ci = ai + 2;
    A.fromBufferAttribute(pos, ai); B.fromBufferAttribute(pos, bi); C.fromBufferAttribute(pos, ci);
    ab.crossVectors(A, B); bc.crossVectors(B, C); ca.crossVectors(C, A);
    const cc = new THREE.Vector3().addVectors(ab, bc).add(ca).normalize().multiplyScalar(radius);
    if (cc.dot(A) < 0) cc.negate();
    circumcenters.push(cc);
  }

  const edgeMap = new Map();
  for (let i = 0; i < nFaces; i++) {
    const vk = [vKey(i * 3), vKey(i * 3 + 1), vKey(i * 3 + 2)];
    for (let e = 0; e < 3; e++) {
      const k1 = vk[e], k2 = vk[(e + 1) % 3];
      const edgeKey = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      if (!edgeMap.has(edgeKey)) edgeMap.set(edgeKey, []);
      edgeMap.get(edgeKey).push(i);
    }
  }

  const pts = [];
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
  for (const faces of edgeMap.values()) {
    if (faces.length === 2) {
      const c1 = circumcenters[faces[0]], c2 = circumcenters[faces[1]];
      for (let k = 0; k < arcSeg; k++) {
        v0.lerpVectors(c1, c2, k       / arcSeg).normalize().multiplyScalar(radius);
        v1.lerpVectors(c1, c2, (k + 1) / arcSeg).normalize().multiplyScalar(radius);
        pts.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
      }
    }
  }
  hullGeo.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildGreatCircleFan(radius, count, seg = 128) {
  const pts         = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const pole = new THREE.Vector3(), fallback = new THREE.Vector3();
  const u = new THREE.Vector3(), v = new THREE.Vector3();
  const p1 = new THREE.Vector3(), p2 = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const y = (i + 0.5) / count;
    const r = Math.sqrt(1 - y * y);
    pole.set(r * Math.cos(goldenAngle * i), y, r * Math.sin(goldenAngle * i));
    fallback.set(0, 1, 0);
    if (Math.abs(pole.dot(fallback)) > 0.9) fallback.set(1, 0, 0);
    u.crossVectors(pole, fallback).normalize();
    v.crossVectors(pole, u);
    for (let j = 0; j < seg; j++) {
      const a1 = (j       / seg) * Math.PI * 2;
      const a2 = ((j + 1) / seg) * Math.PI * 2;
      p1.copy(u).multiplyScalar(Math.cos(a1) * radius).addScaledVector(v, Math.sin(a1) * radius);
      p2.copy(u).multiplyScalar(Math.cos(a2) * radius).addScaledVector(v, Math.sin(a2) * radius);
      pts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function addSphereNormals(geo) {
  const pos   = geo.attributes.position;
  const norms = new Float32Array(pos.count * 3);
  const v     = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    norms[i * 3] = v.x; norms[i * 3 + 1] = v.y; norms[i * 3 + 2] = v.z;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  return geo;
}

function buildWireGeometry(size, style, density) {
  const idx = density - 1; // 0…9
  const t   = idx / 9;    // 0…1
  const wn  = g => addSphereNormals(g);

  switch (style) {
    case 'triangle': {
      const LEVELS = [0, 1, 2, 2, 3, 4, 4, 5, 5, 6];
      return wn(buildTriangleGraticule(size, LEVELS[idx]));
    }
    case 'hexagon': {
      const LEVELS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5];
      return wn(buildHexGraticule(size, LEVELS[idx]));
    }
    case 'brick': {
      const latDiv = Math.round(6 + t * 30);
      return wn(buildBrickGraticule(size, latDiv, latDiv));
    }
    case 'diamond': {
      const latDiv = Math.round(4 + t * 18);
      return wn(buildDiamondGraticule(size, latDiv, latDiv * 2));
    }
    case 'loxodrome': {
      const count = Math.round(2 + idx * 10 / 9);
      return wn(buildLoxodromeGraticule(size, count));
    }
    case 'voronoi': {
      const N = Math.round(20 + idx * 31);
      return wn(buildVoronoiGraticule(size, N));
    }
    case 'greatcircle': {
      const count = Math.round(3 + idx * 7 / 3);
      return wn(buildGreatCircleFan(size, count));
    }
    default: { // 'grid'
      const latDiv = Math.round(6 + t * 30);
      return wn(buildGraticule(size, latDiv, latDiv * 2));
    }
  }
}

// ── Sun light ─────────────────────────────────────────────────────────────────
// Fixed directional light at world (5,0,0). In a future step this becomes a
// PointLight at the star body's world position. For now sunDir is constant.

const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
sunLight.position.set(5, 0, 0);
scene.add(sunLight);

const SUN_DIR = new THREE.Vector3(1, 0, 0); // normalised position of sunLight

// ── UI helpers ────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const MAX_ANISOTROPY = renderer.capabilities.getMaxAnisotropy();

function setUploadLoaded(btnId, clearId, filename) {
  const btn = $(btnId);
  btn.textContent = filename;
  const len = filename.length;
  btn.style.fontSize = len > 18 ? Math.max(0.42, 0.58 - (len - 18) * 0.007) + 'rem' : '';
  $(clearId).style.display = 'inline-block';
}

function resetUpload(btnId, clearId, defaultLabel = 'Upload') {
  const btn = $(btnId);
  btn.textContent    = defaultLabel;
  btn.style.fontSize = '';
  $(clearId).style.display = 'none';
}

function loadTex(url, onLoad) {
  new THREE.TextureLoader().load(url, tex => {
    tex.colorSpace  = THREE.LinearSRGBColorSpace;
    tex.anisotropy  = MAX_ANISOTROPY;
    tex.minFilter   = THREE.LinearMipmapLinearFilter;
    tex.magFilter   = THREE.LinearFilter;
    tex.needsUpdate = true;
    onLoad(tex);
    URL.revokeObjectURL(url);
  });
}

// ── Body class ────────────────────────────────────────────────────────────────
//
// Each Body owns its complete Three.js subtree and per-body panel state.
//
// Scene graph per body (parent.bodyGroup or scene for root bodies):
//
//   [parent]
//     └─ orbitGroup      ← rotates around parent's Y axis each frame
//          └─ bodyGroup  ← translated by orbitRadius along X
//               ├─ tiltGroup → spinGroup → equatorGroup → mesh + wireframe
//               ├─ atmosphere  (no spin)
//               └─ rimGlow    (no spin)

class Body {
  constructor({
    name             = 'Planet 1',
    type             = 'planet',   // 'star' | 'planet' | 'moon'
    parent           = null,       // Body instance, or null for scene root
    size             = 1.0,
    orbitRadius      = 0,
    orbitSpeed       = 0,          // rad per frame at 60fps baseline
    orbitInclination = 0,          // degrees — tilt of orbital plane
  } = {}) {
    this.name             = name;
    this.type             = type;
    this.parent           = parent;
    this.size             = size;
    this.orbitRadius      = orbitRadius;
    this.orbitSpeed       = orbitSpeed;

    // ── Per-body panel state ─────────────────────────────────────────────────
    this.autoRotate    = true;
    this.rotateSpeed   = (2 * Math.PI) / (60 * 60); // 60 s per rotation
    this.axialTilt     = 0;
    this.equatorTilt   = 0;
    this.tiltLocked    = true;
    this.fullTiltRange = false;
    this.dayNightCycle = false;
    this.wireStyle     = 'triangle';
    this.wireDensity   = 5;
    this.dayTexName    = null;
    this.nightTexName  = null;

    // ── Scene graph ──────────────────────────────────────────────────────────
    this.orbitGroup = new THREE.Group();
    if (orbitInclination !== 0)
      this.orbitGroup.rotation.z = THREE.MathUtils.degToRad(orbitInclination);

    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.x = orbitRadius;
    this.orbitGroup.add(this.bodyGroup);

    this.tiltGroup    = new THREE.Group();
    this.spinGroup    = new THREE.Group();
    this.equatorGroup = new THREE.Group();
    this.tiltGroup.add(this.spinGroup);
    this.spinGroup.add(this.equatorGroup);
    this.bodyGroup.add(this.tiltGroup);

    // ── Globe material & mesh ────────────────────────────────────────────────
    this.globeMat = new THREE.ShaderMaterial({
      vertexShader:   GLOBE_VERT,
      fragmentShader: GLOBE_FRAG,
      uniforms: {
        dayTex:         { value: null },
        nightTex:       { value: null },
        hasDayTex:      { value: false },
        hasNightTex:    { value: false },
        sunDir:         { value: SUN_DIR.clone() },
        sunColor:       { value: new THREE.Vector3(1, 1, 1) },
        sunIntensity:   { value: 1.5 },
        baseColor:      { value: new THREE.Color(0x060618) },
        ambientStr:     { value: 0.18 },
        flatLit:        { value: true },
        nightThreshold: { value: 0.05 },
      },
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 256, 256), this.globeMat);
    this.mesh.visible = false;
    this.equatorGroup.add(this.mesh);

    // ── Graticule / wireframe ────────────────────────────────────────────────
    this.graticuleMat = new THREE.ShaderMaterial({
      uniforms: {
        lineColor: { value: new THREE.Color(0x2266cc) },
        opacity:   { value: 0.55 },
        sunDir:    { value: SUN_DIR.clone() },
        flatLit:   { value: true },
      },
      vertexShader:   GRAT_VERT,
      fragmentShader: GRAT_FRAG,
      transparent: true,
      depthWrite:  false,
      depthTest:   false,
    });

    this.wireframe = new THREE.LineSegments(
      buildWireGeometry(size * 1.001, this.wireStyle, this.wireDensity),
      this.graticuleMat
    );
    this.wireframe.renderOrder = 2;
    this.wireframe.visible     = true;
    this.equatorGroup.add(this.wireframe);

    // ── Atmosphere ───────────────────────────────────────────────────────────
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(size * 1.055, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.05,
        side: THREE.FrontSide, depthWrite: false,
      })
    );
    this.atmosphere.visible = false;
    this.bodyGroup.add(this.atmosphere);

    // ── Rim glow ─────────────────────────────────────────────────────────────
    this.rimMat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor:  { value: new THREE.Color(0xffffff) },
        viewVector: { value: new THREE.Vector3() },
      },
      vertexShader:   RIM_VERT,
      fragmentShader: RIM_FRAG,
      side:       THREE.BackSide,
      blending:   THREE.AdditiveBlending,
      transparent: true,
      depthWrite:  false,
    });

    this.rimGlow = new THREE.Mesh(
      new THREE.SphereGeometry(size * 1.12, 64, 64),
      this.rimMat
    );
    this.rimGlow.visible = false;
    this.bodyGroup.add(this.rimGlow);

    this._wp = new THREE.Vector3(); // reusable — avoids GC in animate loop

    // ── Attach to scene graph ────────────────────────────────────────────────
    const parentGroup = parent ? parent.bodyGroup : scene;
    parentGroup.add(this.orbitGroup);
  }

  // Apply axial + equator tilt to the group hierarchy.
  applyTilts() {
    this.tiltGroup.rotation.z    = THREE.MathUtils.degToRad(this.axialTilt);
    this.equatorGroup.rotation.z = THREE.MathUtils.degToRad(this.equatorTilt - this.axialTilt);
  }

  // Replace wireframe geometry with current style + density.
  rebuildWireframe() {
    this.wireframe.geometry.dispose();
    this.wireframe.geometry = buildWireGeometry(this.size * 1.001, this.wireStyle, this.wireDensity);
  }

  // Called every frame from the animate loop.
  update(dt) {
    this.orbitGroup.rotation.y += this.orbitSpeed * dt * 60;

    if (this.autoRotate)
      this.spinGroup.rotation.y += this.rotateSpeed * dt * 60;

    if (this.rimGlow.visible) {
      this.bodyGroup.getWorldPosition(this._wp);
      this.rimMat.uniforms.viewVector.value.subVectors(camera.position, this._wp);
    }
  }

  // Release GPU resources and detach from parent.
  dispose() {
    this.globeMat.uniforms.dayTex.value?.dispose();
    this.globeMat.uniforms.nightTex.value?.dispose();
    this.globeMat.dispose();
    this.graticuleMat.dispose();
    this.rimMat.dispose();
    this.atmosphere.material.dispose();
    this.mesh.geometry.dispose();
    this.wireframe.geometry.dispose();
    this.atmosphere.geometry.dispose();
    this.rimGlow.geometry.dispose();
    const pg = this.parent ? this.parent.bodyGroup : scene;
    pg.remove(this.orbitGroup);
  }
}

// ── Bodies list & selection ───────────────────────────────────────────────────

const bodies = [];
let selectedBody   = null;
let isCapturingGif = false;
let hasBgTex       = false;

function createBody(options) {
  const b = new Body(options);
  bodies.push(b);
  renderBodyTree();
  return b;
}

function removeBody(b) {
  const idx = bodies.indexOf(b);
  if (idx === -1) return;
  b.dispose();
  bodies.splice(idx, 1);
  selectBody(bodies[0] ?? null);
}

// ── Body tree UI ──────────────────────────────────────────────────────────────

const TYPE_LABEL = { star: 'STAR', planet: 'PLANET', moon: 'MOON' };

function renderBodyTree() {
  const tree = $('body-tree');
  tree.innerHTML = '';
  bodies.forEach((b, i) => {
    const item = document.createElement('div');
    item.className      = 'body-item' + (b === selectedBody ? ' active' : '');
    item.dataset.bodyIdx = i;
    if (b.parent) item.style.paddingLeft = '28px';

    const badge = document.createElement('span');
    badge.className   = 'body-type-badge';
    badge.textContent = TYPE_LABEL[b.type] ?? b.type.toUpperCase();

    const nameEl = document.createElement('span');
    nameEl.className   = 'body-item-name';
    nameEl.textContent = b.name;

    item.append(badge, nameEl);
    item.addEventListener('click', () => selectBody(b));
    tree.appendChild(item);
  });
}

// Switch the active body and repopulate every panel widget from its state.
function selectBody(b) {
  selectedBody = b;
  renderBodyTree();
  if (b) populatePanel(b);
}

function populatePanel(body) {
  // ── Textures ───────────────────────────────────────────────────────────────
  if (body.dayTexName)   setUploadLoaded('upload-day-btn',   'clear-day-btn',   body.dayTexName);
  else                   resetUpload('upload-day-btn',   'clear-day-btn',   'Map Texture');
  if (body.nightTexName) setUploadLoaded('upload-night-btn', 'clear-night-btn', body.nightTexName);
  else                   resetUpload('upload-night-btn', 'clear-night-btn', 'Night Texture');
  $('night-threshold-row').style.display = body.nightTexName ? 'flex' : 'none';
  const nightThresh = Math.round(body.globeMat.uniforms.nightThreshold.value * 100);
  $('night-threshold-slider').value = nightThresh;
  $('night-threshold-num').value    = nightThresh;

  // ── Rotation ───────────────────────────────────────────────────────────────
  const speedSec = Math.round((2 * Math.PI) / (body.rotateSpeed * 60));
  $('speed-slider').value    = speedSec;
  $('speed-num').value       = speedSec;
  $('rotate-toggle').checked = body.autoRotate;

  const tiltMax = body.fullTiltRange ? 360 : 45;
  $('axial-tilt-slider').max     = tiltMax;
  $('equator-tilt-slider').max   = tiltMax;
  $('axial-tilt-slider').value   = body.axialTilt;
  $('axial-tilt-num').value      = body.axialTilt;
  $('equator-tilt-slider').value = body.equatorTilt;
  $('equator-tilt-num').value    = body.equatorTilt;
  $('tilt-lock').checked         = body.tiltLocked;
  $('tilt-fullrange').checked    = body.fullTiltRange;

  // ── Lighting ───────────────────────────────────────────────────────────────
  $('daynight-toggle').checked   = body.dayNightCycle;
  $('sun-options').style.display = body.dayNightCycle ? 'block' : 'none';
  const sunIntSlider = Math.round(body.globeMat.uniforms.sunIntensity.value * 50);
  $('sun-intensity-slider').value = sunIntSlider;
  $('sun-intensity-num').value    = sunIntSlider;
  const sc = body.globeMat.uniforms.sunColor.value;
  $('sun-color').value = '#' + new THREE.Color(sc.x, sc.y, sc.z).getHexString();

  // ── Wireframe ─────────────────────────────────────────────────────────────
  $('wireframe-toggle').checked = body.wireframe.visible;
  $('wire-style').value         = body.wireStyle;
  $('wire-density').value       = body.wireDensity;
  $('wire-density-num').value   = body.wireDensity;

  // ── Experimental ──────────────────────────────────────────────────────────
  const ambSlider = Math.round(body.globeMat.uniforms.ambientStr.value / 0.6 * 100);
  $('ambient-slider').value      = ambSlider;
  $('ambient-num').value         = ambSlider;
  $('atmosphere-toggle').checked = body.atmosphere.visible;
}

// ── Theme sync ────────────────────────────────────────────────────────────────

const GLOBE_THEME_COLORS = {
  dark:  { line: new THREE.Color(0x888888), base: new THREE.Color(0x1a1a1a) },
  light: { line: new THREE.Color(0xcccccc), base: new THREE.Color(0x1a1a1a) },
  amber: { line: new THREE.Color(0xcc8800), base: new THREE.Color(0x0a0600) },
  red:   { line: new THREE.Color(0xcc2244), base: new THREE.Color(0x0a0002) },
  green: { line: new THREE.Color(0x22cc66), base: new THREE.Color(0x000a03) },
  blue:  { line: new THREE.Color(0x2266cc), base: new THREE.Color(0x060618) },
};

function applyGlobeTheme(name) {
  const c = GLOBE_THEME_COLORS[name] || GLOBE_THEME_COLORS.dark;
  for (const b of bodies) {
    b.graticuleMat.uniforms.lineColor.value.copy(c.line);
    b.globeMat.uniforms.baseColor.value.copy(c.base);
  }
}

applyGlobeTheme(localStorage.getItem('itschu-theme') || 'dark');

new MutationObserver(() => {
  applyGlobeTheme(localStorage.getItem('itschu-theme') || 'amber');
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── Initialise default body ───────────────────────────────────────────────────

selectBody(createBody({ name: 'Planet 1', type: 'planet' }));

// ── Panel event listeners ─────────────────────────────────────────────────────
// All listeners read/write `selectedBody`. When selectBody() is called,
// populatePanel() updates every widget, so these handlers always target the
// active body with no rebinding needed.

// ── Textures ──────────────────────────────────────────────────────────────────

$('upload-day-btn').addEventListener('click', () => $('day-tex-input').click());
$('day-tex-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const b = selectedBody;
  loadTex(URL.createObjectURL(file), tex => {
    b.globeMat.uniforms.dayTex.value?.dispose();
    b.globeMat.uniforms.dayTex.value    = tex;
    b.globeMat.uniforms.hasDayTex.value = true;
    b.mesh.visible = true;
    b.dayTexName   = file.name;
    setUploadLoaded('upload-day-btn', 'clear-day-btn', file.name);
    b.wireframe.visible = false;
    $('wireframe-toggle').checked = false;
  });
  e.target.value = '';
});
$('clear-day-btn').addEventListener('click', () => {
  const b = selectedBody;
  b.globeMat.uniforms.dayTex.value?.dispose();
  b.globeMat.uniforms.dayTex.value    = null;
  b.globeMat.uniforms.hasDayTex.value = false;
  b.mesh.visible = false;
  b.dayTexName   = null;
  resetUpload('upload-day-btn', 'clear-day-btn', 'Map Texture');
});

$('upload-night-btn').addEventListener('click', () => $('night-tex-input').click());
$('night-tex-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const b = selectedBody;
  loadTex(URL.createObjectURL(file), tex => {
    b.globeMat.uniforms.nightTex.value?.dispose();
    b.globeMat.uniforms.nightTex.value    = tex;
    b.globeMat.uniforms.hasNightTex.value = true;
    b.nightTexName = file.name;
    setUploadLoaded('upload-night-btn', 'clear-night-btn', file.name);
    $('night-threshold-row').style.display = 'flex';
  });
  e.target.value = '';
});
$('clear-night-btn').addEventListener('click', () => {
  const b = selectedBody;
  b.globeMat.uniforms.nightTex.value?.dispose();
  b.globeMat.uniforms.nightTex.value    = null;
  b.globeMat.uniforms.hasNightTex.value = false;
  b.nightTexName = null;
  resetUpload('upload-night-btn', 'clear-night-btn', 'Night Texture');
  $('night-threshold-row').style.display = 'none';
});

$('night-threshold-slider').addEventListener('input', e => {
  selectedBody.globeMat.uniforms.nightThreshold.value = e.target.value / 100;
  $('night-threshold-num').value = e.target.value;
});

// Background texture — scene-level, not per body
$('upload-bg-btn').addEventListener('click', () => $('bg-tex-input').click());
$('bg-tex-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  loadTex(URL.createObjectURL(file), tex => {
    tex.mapping      = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
    bgStars.visible  = false;
    hasBgTex         = true;
    setUploadLoaded('upload-bg-btn', 'clear-bg-btn', file.name);
  });
  e.target.value = '';
});
$('clear-bg-btn').addEventListener('click', () => {
  if (scene.background?.isTexture) scene.background.dispose();
  scene.background = new THREE.Color(0x000000);
  bgStars.visible  = $('stars-toggle').checked;
  hasBgTex         = false;
  resetUpload('upload-bg-btn', 'clear-bg-btn', 'Background');
});

// ── Rotation ──────────────────────────────────────────────────────────────────

$('rotate-toggle').addEventListener('change', e => {
  selectedBody.autoRotate = e.target.checked;
});

$('speed-slider').addEventListener('input', e => {
  selectedBody.rotateSpeed = (2 * Math.PI) / (e.target.value * 60);
  $('speed-num').value = e.target.value;
});

$('axial-tilt-slider').addEventListener('input', e => {
  const b = selectedBody, deg = parseFloat(e.target.value);
  b.axialTilt = deg;
  $('axial-tilt-num').value = deg;
  if (b.tiltLocked) {
    b.equatorTilt = deg;
    $('equator-tilt-slider').value = deg;
    $('equator-tilt-num').value    = deg;
  }
  b.applyTilts();
});

$('equator-tilt-slider').addEventListener('input', e => {
  const b = selectedBody, deg = parseFloat(e.target.value);
  b.equatorTilt = deg;
  $('equator-tilt-num').value = deg;
  if (b.tiltLocked) {
    b.axialTilt = deg;
    $('axial-tilt-slider').value = deg;
    $('axial-tilt-num').value    = deg;
  }
  b.applyTilts();
});

$('tilt-lock').addEventListener('change', e => {
  const b = selectedBody;
  b.tiltLocked = e.target.checked;
  if (b.tiltLocked) {
    b.equatorTilt              = b.axialTilt;
    $('equator-tilt-slider').value = b.axialTilt;
    $('equator-tilt-num').value    = b.axialTilt;
    b.applyTilts();
  }
});

$('tilt-fullrange').addEventListener('change', e => {
  const b = selectedBody;
  b.fullTiltRange = e.target.checked;
  const max = b.fullTiltRange ? 360 : 45;
  $('axial-tilt-slider').max   = max;
  $('equator-tilt-slider').max = max;
  if (!b.fullTiltRange) {
    if (b.axialTilt > 45) {
      b.axialTilt = 45;
      $('axial-tilt-slider').value = 45;
      $('axial-tilt-num').value    = 45;
    }
    if (b.equatorTilt > 45) {
      b.equatorTilt = 45;
      $('equator-tilt-slider').value = 45;
      $('equator-tilt-num').value    = 45;
    }
    b.applyTilts();
  }
});

// ── Lighting ──────────────────────────────────────────────────────────────────

$('daynight-toggle').addEventListener('change', e => {
  const b = selectedBody;
  b.dayNightCycle = e.target.checked;
  b.globeMat.uniforms.flatLit.value     = !e.target.checked;
  b.graticuleMat.uniforms.flatLit.value = !e.target.checked;
  $('sun-options').style.display        = e.target.checked ? 'block' : 'none';
});

$('sun-intensity-slider').addEventListener('input', e => {
  selectedBody.globeMat.uniforms.sunIntensity.value = e.target.value / 50;
  $('sun-intensity-num').value = e.target.value;
});

$('sun-color').addEventListener('input', e => {
  const c = new THREE.Color(e.target.value);
  selectedBody.globeMat.uniforms.sunColor.value.set(c.r, c.g, c.b);
  sunLight.color.set(e.target.value);
});

// ── Wireframe ─────────────────────────────────────────────────────────────────

$('wireframe-toggle').addEventListener('change', e => {
  selectedBody.wireframe.visible = e.target.checked;
});

$('wire-style').addEventListener('change', e => {
  selectedBody.wireStyle = e.target.value;
  selectedBody.rebuildWireframe();
});

$('wire-density').addEventListener('input', e => {
  selectedBody.wireDensity = parseInt(e.target.value);
  $('wire-density-num').value = e.target.value;
  selectedBody.rebuildWireframe();
});

// ── Experimental ──────────────────────────────────────────────────────────────

$('stars-toggle').addEventListener('change', e => {
  bgStars.visible = e.target.checked && !hasBgTex;
});

$('atmosphere-toggle').addEventListener('change', e => {
  selectedBody.atmosphere.visible = e.target.checked;
  selectedBody.rimGlow.visible    = e.target.checked;
});

$('ambient-slider').addEventListener('input', e => {
  selectedBody.globeMat.uniforms.ambientStr.value = (e.target.value / 100) * 0.6;
  $('ambient-num').value = e.target.value;
});

// ── Export ────────────────────────────────────────────────────────────────────

$('screenshot-btn').addEventListener('click', () => {
  renderer.render(scene, camera);
  Object.assign(document.createElement('a'), {
    href:     canvas.toDataURL('image/png'),
    download: 'system.png',
  }).click();
});

$('gif-duration-slider').addEventListener('input', e => { $('gif-duration-num').value = e.target.value; });
$('gif-fps-slider').addEventListener('input',      e => { $('gif-fps-num').value      = e.target.value; });
$('gif-size-slider').addEventListener('input',     e => { $('gif-size-num').value     = e.target.value; });
$('gif-btn').addEventListener('click', captureGif);

async function captureGif() {
  if (isCapturingGif) return;
  if (typeof GIF === 'undefined') { alert('gif.js not found.'); return; }

  const loopDuration = parseInt($('gif-duration-slider').value);
  const fps          = parseInt($('gif-fps-slider').value);
  const frameCount   = Math.ceil(loopDuration * fps);
  const delay        = Math.round(1000 / fps);
  const gifSize      = parseInt($('gif-size-slider').value);

  isCapturingGif = true;
  $('gif-btn').disabled           = true;
  $('gif-progress').style.display = 'block';

  // Save each body's rotation state
  const savedRotY     = bodies.map(b => b.spinGroup.rotation.y);
  const savedAutoRot  = bodies.map(b => b.autoRotate);
  const savedDayNight = bodies.map(b => b.dayNightCycle);
  bodies.forEach(b => { b.autoRotate = false; b.dayNightCycle = false; });

  const offCanvas = Object.assign(document.createElement('canvas'), { width: gifSize, height: gifSize });
  const offCtx    = offCanvas.getContext('2d');
  const imageDataArr = [];

  // Phase 1: render frames
  for (let i = 0; i < frameCount; i++) {
    bodies.forEach((b, bi) => {
      b.spinGroup.rotation.y = savedRotY[bi] + (i / frameCount) * Math.PI * 2;
    });
    renderer.render(scene, camera);
    const side = Math.min(canvas.width, canvas.height);
    const sx   = (canvas.width  - side) / 2;
    const sy   = (canvas.height - side) / 2;
    offCtx.drawImage(canvas, sx, sy, side, side, 0, 0, gifSize, gifSize);
    imageDataArr.push(offCtx.getImageData(0, 0, gifSize, gifSize));
    $('gif-progress-bar').style.width  = ((i + 1) / frameCount * 40) + '%';
    $('gif-progress-text').textContent = `Capturing ${i + 1} / ${frameCount}…`;
    await new Promise(r => setTimeout(r, 0));
  }

  // Phase 2: composite for palette extraction
  $('gif-progress-text').textContent = 'Building palette…';
  await new Promise(r => setTimeout(r, 0));

  const totalPx   = gifSize * gifSize;
  const composite = new Uint8ClampedArray(totalPx * 4);
  for (let p = 0; p < totalPx; p++) {
    const src  = imageDataArr[p % imageDataArr.length].data;
    const base = p * 4;
    composite[base]     = src[base];
    composite[base + 1] = src[base + 1];
    composite[base + 2] = src[base + 2];
    composite[base + 3] = src[base + 3];
  }
  offCtx.putImageData(new ImageData(composite, gifSize, gifSize), 0, 0);

  $('gif-progress-bar').style.width  = '42%';
  $('gif-progress-text').textContent = 'Quantising palette…';
  await new Promise(r => setTimeout(r, 0));

  const globalPalette = await new Promise(resolve => {
    const palGif = new GIF({
      workers: 1, quality: 1, width: gifSize, height: gifSize,
      workerScript: 'vendor/gif.worker.js', globalPalette: true,
    });
    palGif.addFrame(offCanvas, { delay: 1, copy: true });
    palGif.on('finished', () => resolve(palGif.options.globalPalette));
    palGif.render();
  });

  $('gif-progress-bar').style.width = '50%';

  // Phase 3: encode
  const gif = new GIF({
    workers: 4, quality: 1, width: gifSize, height: gifSize,
    workerScript: 'vendor/gif.worker.js', globalPalette,
  });

  for (let i = 0; i < imageDataArr.length; i++) {
    offCtx.putImageData(imageDataArr[i], 0, 0);
    gif.addFrame(offCanvas, { delay, copy: true });
    $('gif-progress-bar').style.width  = (50 + (i + 1) / frameCount * 5) + '%';
    $('gif-progress-text').textContent = `Queuing ${i + 1} / ${frameCount}…`;
    await new Promise(r => setTimeout(r, 0));
  }

  gif.on('progress', p => {
    $('gif-progress-bar').style.width  = (50 + p * 50) + '%';
    $('gif-progress-text').textContent = 'Encoding…';
  });

  gif.on('finished', blob => {
    Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: 'system.gif',
    }).click();

    bodies.forEach((b, bi) => {
      b.spinGroup.rotation.y = savedRotY[bi];
      b.autoRotate    = savedAutoRot[bi];
      b.dayNightCycle = savedDayNight[bi];
    });
    isCapturingGif = false;
    $('gif-btn').disabled             = false;
    $('gif-progress').style.display   = 'none';
    $('gif-progress-bar').style.width = '0%';
  });

  gif.render();
}

// ── Section collapse toggles ──────────────────────────────────────────────────

document.querySelectorAll('.collapsible-header').forEach(h => {
  h.addEventListener('click', () => {
    h.classList.toggle('open');
    h.nextElementSibling.classList.toggle('open');
  });
});

// ── Panel toggle ──────────────────────────────────────────────────────────────

$('panel-toggle').addEventListener('click', () => {
  $('panel').classList.toggle('collapsed');
  setTimeout(onResize, 300);
});

// ── Resize ────────────────────────────────────────────────────────────────────

function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(canvas);
onResize();

// ── Slider ↔ number-input bidirectional wiring ────────────────────────────────

function wireSliderNum(sliderId, numId) {
  const s = $(sliderId), n = $(numId);
  n.addEventListener('change', () => {
    const clamped = Math.min(Math.max(+n.value || 0, +s.min), +s.max);
    n.value = clamped;
    s.value = clamped;
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const obs = new MutationObserver(() => { n.disabled = s.disabled; });
  obs.observe(s, { attributes: true, attributeFilter: ['disabled'] });
}

wireSliderNum('speed-slider',           'speed-num');
wireSliderNum('axial-tilt-slider',      'axial-tilt-num');
wireSliderNum('equator-tilt-slider',    'equator-tilt-num');
wireSliderNum('sun-intensity-slider',   'sun-intensity-num');
wireSliderNum('ambient-slider',         'ambient-num');
wireSliderNum('gif-duration-slider',    'gif-duration-num');
wireSliderNum('gif-fps-slider',         'gif-fps-num');
wireSliderNum('gif-size-slider',        'gif-size-num');
wireSliderNum('wire-density',           'wire-density-num');
wireSliderNum('night-threshold-slider', 'night-threshold-num');

// ── Render loop ───────────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  if (isCapturingGif) return;

  const dt = clock.getDelta();
  for (const b of bodies) b.update(dt);

  controls.update();
  renderer.render(scene, camera);
}

animate();
