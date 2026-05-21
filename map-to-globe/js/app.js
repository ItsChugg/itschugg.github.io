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
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.6;
controls.maxDistance = 10;
controls.autoRotate = false;

// ── Background stars ─────────────────────────────────────────────────────────
// White circles at fixed pixel sizes (1–5 px) so they stay crisp at any zoom.

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
  starSizes[i] = 1.0 + Math.random() * 4.0; // 1–5 px
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

const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// ── Globe group hierarchy ────────────────────────────────────────────────────
//
//  tiltGroup    – rotates around Z to tilt the spin axis in world space
//    spinGroup  – rotates around local Y every frame (the actual spin)
//      equatorGroup – extra Z rotation so equator tilt can be set independently
//                     of axial tilt; when both sliders are locked this is 0.
//
// This three-level stack means spinGroup.rotation.y always advances along the
// tilted axis, giving a physically correct wobble/tilt behaviour.

const tiltGroup    = new THREE.Group();
const spinGroup    = new THREE.Group();
const equatorGroup = new THREE.Group();
tiltGroup.add(spinGroup);
spinGroup.add(equatorGroup);
scene.add(tiltGroup);

const R = 1.0;

// ── Globe shader material ────────────────────────────────────────────────────
//
// Handles all three texture states in one shader:
//   1. No textures   → base colour + Phong shading
//   2. Day only      → day texture wraps whole globe, Phong shading
//   3. Day + Night   → day texture on lit side, night texture on dark side,
//                      smooth terminator blend

const VERT = /* glsl */`
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

const FRAG = /* glsl */`
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform bool      hasDayTex;
  uniform bool      hasNightTex;
  uniform vec3      sunDir;         // world-space, toward sun (normalised)
  uniform vec3      sunColor;       // light source tint (default white)
  uniform float     sunIntensity;   // light source brightness multiplier
  uniform vec3      baseColor;
  uniform float     ambientStr;     // twilight scatter width/intensity 0..1
  uniform bool      flatLit;        // true when day/night cycle is off

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vViewDir;

  void main() {
    if (flatLit) {
      gl_FragColor = hasDayTex
        ? vec4(texture2D(dayTex, vUv).rgb, 1.0)
        : vec4(baseColor, 1.0);
      return;
    }

    vec3  N     = normalize(vWorldNormal);
    float NdotL = dot(N, sunDir);

    // Sharp terminator — ~2° twilight zone (like a planet orbiting a distant star)
    float dayMask = smoothstep(-0.02, 0.02, NdotL);

    // Diffuse: day side only, scaled by sun intensity
    float diffuse = clamp(NdotL * sunIntensity, 0.0, 1.0);

    // Lit factor: diffuse on day side + tiny atmospheric scatter in twilight zone only.
    // Night side stays pitch black — dayMask = 0 guarantees no ambient leakage.
    float lit = diffuse * (1.0 - ambientStr) + ambientStr * dayMask;

    if (hasDayTex && hasNightTex) {
      vec3 day   = texture2D(dayTex,   vUv).rgb;
      vec3 night = texture2D(nightTex, vUv).rgb;
      // City lights are self-luminous; they fade at the terminator so they don't
      // compete with the lit day side at dawn/dusk
      vec3 litDay   = day   * lit * sunColor;
      vec3 litNight = night * (1.0 - dayMask);
      gl_FragColor  = vec4(litDay + litNight, 1.0);

    } else if (hasDayTex) {
      vec3 day = texture2D(dayTex, vUv).rgb;
      // No night texture → night side is pitch black
      gl_FragColor = vec4(day * lit * sunColor, 1.0);

    } else {
      gl_FragColor = vec4(baseColor * lit * sunColor, 1.0);
    }
  }
`;

const globeMat = new THREE.ShaderMaterial({
  vertexShader:   VERT,
  fragmentShader: FRAG,
  uniforms: {
    dayTex:      { value: null },
    nightTex:    { value: null },
    hasDayTex:   { value: false },
    hasNightTex: { value: false },
    sunDir:       { value: new THREE.Vector3(1, 0, 0) }, // sun directly to the right on equator
    sunColor:     { value: new THREE.Vector3(1, 1, 1) },
    sunIntensity: { value: 1.5 },
    baseColor:    { value: new THREE.Color(0x060618) },
    ambientStr:   { value: 0.18 },
    flatLit:      { value: true },  // off by default until day/night cycle is enabled
  },
});

const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 128), globeMat);
globe.visible = false; // hidden until a day texture is loaded
equatorGroup.add(globe);

// Graticule — explicit lat/lon LineSegments (no triangle diagonals)
function buildGraticule(radius, latDiv, lonDiv, seg = 128) {
  const pts = [];
  // Parallels (latitude rings)
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
  // Meridians (longitude great-circles)
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

// ── Triangle graticule — edges of a geodesic icosphere ─────────────────────
function buildTriangleGraticule(radius, detail = 4) {
  return new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(radius, detail));
}

// ── Hexagon graticule — dual graph of a geodesic icosphere ──────────────────
// IcosahedronGeometry in Three.js r169 is NON-INDEXED (index === null), so we
// find adjacent faces by hashing vertex positions instead of using index arrays.
function buildHexGraticule(radius, detail = 2) {
  const icoGeo = new THREE.IcosahedronGeometry(1, detail);
  const pos    = icoGeo.attributes.position;
  const nFaces = pos.count / 3; // 3 verts per face, non-indexed

  const PREC = 1e6;
  const vKey = vi =>
    `${Math.round(pos.getX(vi) * PREC)},${Math.round(pos.getY(vi) * PREC)},${Math.round(pos.getZ(vi) * PREC)}`;

  // Centroid of each face, projected back onto the sphere surface
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

  // Build edge → [faceA, faceB] map using sorted vertex-position keys
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

  // One dual edge per shared original edge → hexagon/pentagon outlines
  const pts = [];
  for (const faces of edgeMap.values()) {
    if (faces.length === 2) {
      pts.push(...centroids[faces[0]].toArray(), ...centroids[faces[1]].toArray());
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

// ── Brick graticule — lat/lon grid with vertical lines offset every other row ─
// Looks like a brick-wall pattern wrapped around the sphere.
// lonDiv ≈ latDiv gives ~2:1 brick aspect ratio (360°/latDiv wide, 180°/latDiv tall).
function buildBrickGraticule(radius, latDiv, lonDiv, seg = 64) {
  const pts = [];

  // Horizontal mortar lines — identical to plain-grid parallels
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

  // Vertical mortar lines — shifted by half a brick width on odd rows
  const vSeg = 8;
  for (let row = 0; row < latDiv; row++) {
    const offset = (row % 2) * 0.5;          // 0.0 on even rows, 0.5 on odd
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

// ── Diamond graticule — both diagonals of every lat/lon cell ─────────────────
// With lonDiv = latDiv*2 the cells are square in degree-space, so the diagonals
// cross at 45° and the resulting shapes are true rhombuses / diamonds.
// Diagonals are geodesic arcs (great-circle segments) via lerp+normalise.
function buildDiamondGraticule(radius, latDiv, lonDiv, seg = 8) {
  const pts = [];
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3();

  const spt = (phi, theta) => new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ).multiplyScalar(radius);

  for (let i = 0; i < latDiv; i++) {
    const phi1 = (i       / latDiv) * Math.PI;
    const phi2 = ((i + 1) / latDiv) * Math.PI;
    for (let j = 0; j < lonDiv; j++) {
      const theta1 = (j       / lonDiv) * Math.PI * 2;
      const theta2 = ((j + 1) / lonDiv) * Math.PI * 2;
      const NW = spt(phi1, theta1), NE = spt(phi1, theta2);
      const SW = spt(phi2, theta1), SE = spt(phi2, theta2);
      // Each cell gets two crossing great-circle diagonals: NW↔SE and NE↔SW
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

// ── Loxodrome (rhumb-line spiral) graticule ───────────────────────────────────
// A loxodrome crosses every meridian at the same angle α, spiralling from pole
// to pole without ever arriving. Drawing `count` NE (+) and NW (−) spirals
// together creates a crossing web. At 60° the spiral makes ~1.2 full revolutions
// pole-to-pole — tight enough to weave but loose enough to read clearly.
function buildLoxodromeGraticule(radius, count, angleDeg = 60, seg = 200) {
  const pts  = [];
  const tanA = Math.tan(THREE.MathUtils.degToRad(angleDeg));
  const lo   = THREE.MathUtils.degToRad(-80); // stay clear of polar singularities
  const hi   = THREE.MathUtils.degToRad( 80);

  for (let i = 0; i < count; i++) {
    const lon0 = (i / count) * Math.PI * 2;
    for (const sign of [1, -1]) {             // NE spiral (+1) and NW spiral (−1)
      for (let k = 0; k < seg - 1; k++) {
        const lat1 = lo + (k       / (seg - 1)) * (hi - lo);
        const lat2 = lo + ((k + 1) / (seg - 1)) * (hi - lo);
        // Mercator northing: M = ln( tan(π/4 + lat/2) )
        const M1   = Math.log(Math.tan(Math.PI / 4 + lat1 / 2));
        const M2   = Math.log(Math.tan(Math.PI / 4 + lat2 / 2));
        const lon1 = lon0 + sign * tanA * M1;
        const lon2 = lon0 + sign * tanA * M2;
        // Convert (lat, lon) → Cartesian (Y-up convention, colatitude = π/2 − lat)
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

// ── Voronoi cell graticule — spherical Voronoi of a Fibonacci lattice ─────────
// Algorithm:
//   1. Distribute N seeds evenly via the Fibonacci (golden-angle) spiral.
//   2. ConvexGeometry(seeds) computes the 3-D convex hull of sphere-surface
//      points, which IS the spherical Delaunay triangulation (one face per
//      Delaunay triangle). The result is non-indexed: 3 consecutive positions
//      per triangle, just like IcosahedronGeometry.
//   3. Each triangle's spherical circumcenter becomes a Voronoi vertex.
//      Exact formula for unit-sphere points: normalize( A×B + B×C + C×A ).
//   4. Adjacent Delaunay triangles share an edge → their circumcenters are
//      neighbours in the Voronoi diagram. Connect them with geodesic arcs
//      (lerp + normalize) to draw the Voronoi cell boundaries.
function buildVoronoiGraticule(radius, N, arcSeg = 6) {
  // ── 1. Fibonacci seeds on the unit sphere ──────────────────────────────────
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const seeds = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * i + 1) / N;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    seeds.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
  }

  // ── 2. Convex hull = spherical Delaunay triangulation ─────────────────────
  // ConvexGeometry returns a non-indexed BufferGeometry (3 verts per face).
  const hullGeo = new ConvexGeometry(seeds);
  const pos     = hullGeo.attributes.position;
  const nFaces  = pos.count / 3;

  const PREC = 1e6;
  const vKey = vi =>
    `${Math.round(pos.getX(vi) * PREC)},${Math.round(pos.getY(vi) * PREC)},${Math.round(pos.getZ(vi) * PREC)}`;

  // ── 3. Spherical circumcenter for each Delaunay face ──────────────────────
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const ab = new THREE.Vector3(), bc = new THREE.Vector3(), ca = new THREE.Vector3();
  const circumcenters = [];

  for (let i = 0; i < nFaces; i++) {
    const ai = i * 3, bi = ai + 1, ci = ai + 2;
    A.fromBufferAttribute(pos, ai);
    B.fromBufferAttribute(pos, bi);
    C.fromBufferAttribute(pos, ci);
    ab.crossVectors(A, B);
    bc.crossVectors(B, C);
    ca.crossVectors(C, A);
    const cc = new THREE.Vector3().addVectors(ab, bc).add(ca).normalize().multiplyScalar(radius);
    if (cc.dot(A) < 0) cc.negate();  // pick the hemisphere-consistent solution
    circumcenters.push(cc);
  }

  // ── 4. Build edge → [faceA, faceB] map using sorted vertex-position keys ──
  // Same pattern as buildHexGraticule — works for any non-indexed geometry.
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

  // ── 5. One geodesic arc per shared Delaunay edge → Voronoi cell boundaries ─
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

// ── Great circle fan graticule ────────────────────────────────────────────────
// Draws `count` full great circles whose poles are Fibonacci-distributed across
// the hemisphere (antipodal poles give the same circle, so hemisphere = unique).
// The evenly-spread orientations produce a crystal-ball / gyroscope web.
function buildGreatCircleFan(radius, count, seg = 128) {
  const pts         = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const pole = new THREE.Vector3(), fallback = new THREE.Vector3();
  const u = new THREE.Vector3(), v = new THREE.Vector3();
  const p1 = new THREE.Vector3(), p2 = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // Fibonacci hemisphere — y from just above 0 to just below 1
    const y = (i + 0.5) / count;
    const r = Math.sqrt(1 - y * y);
    pole.set(r * Math.cos(goldenAngle * i), y, r * Math.sin(goldenAngle * i));

    // Build an orthonormal frame {u, v} spanning the great-circle plane
    fallback.set(0, 1, 0);
    if (Math.abs(pole.dot(fallback)) > 0.9) fallback.set(1, 0, 0);
    u.crossVectors(pole, fallback).normalize();
    v.crossVectors(pole, u);                   // u and pole are unit → v is unit

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

// ── Wireframe normal helper ──────────────────────────────────────────────────
// Every wireframe vertex lies on the sphere surface, so its outward normal is
// just the normalised position. We need this attribute so the shader can tell
// front-facing lines from back-facing ones.
function addSphereNormals(geo) {
  const pos = geo.attributes.position;
  const norms = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    norms[i * 3]     = v.x;
    norms[i * 3 + 1] = v.y;
    norms[i * 3 + 2] = v.z;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  return geo;
}

// ── Active wireframe ─────────────────────────────────────────────────────────
// ShaderMaterial that dims back-facing lines to a darker variant of the front
// colour. vFacing = dot(worldNormal, viewDir): +1 = directly facing camera,
// -1 = directly away. We map that to a brightness range [0.15, 1.0].
const graticuleMat = new THREE.ShaderMaterial({
  uniforms: {
    lineColor: { value: new THREE.Color(0x2266cc) },
    opacity:   { value: 0.55 },
  },
  vertexShader: /* glsl */`
    varying float vFacing;
    void main() {
      vec3 worldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
      vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
      vFacing = dot(worldNormal, normalize(cameraPosition - worldPos));
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3  lineColor;
    uniform float opacity;
    varying float vFacing;
    void main() {
      // Front hemisphere: full brightness. Back hemisphere: ~40% — clearly
      // visible but distinctly darker. Transition is gentle around the silhouette.
      float t = clamp(vFacing * 0.5 + 0.5, 0.0, 1.0); // [-1,1] → [0,1]
      float brightness = mix(0.40, 1.0, t);
      gl_FragColor = vec4(lineColor * brightness, opacity);
    }
  `,
  transparent: true,
  depthWrite:  false,
  depthTest:   false, // let renderOrder + brightness shader handle visual depth
});

function withNormals(geo) { return addSphereNormals(geo); }

// ── Wireframe density / style state ─────────────────────────────────────────
let currentWireStyle   = 'triangle';
let currentWireDensity = 5; // 1 (coarse) … 10 (fine)

function buildWireGeometry() {
  // idx is a direct 0–9 index corresponding to density 1–10.
  // Using it directly avoids Math.round flat-spots where adjacent slider
  // positions map to the same detail level and produce no visible change.
  const idx = currentWireDensity - 1; // 0 … 9
  const t   = idx / 9;                // 0 … 1  (for continuous styles)

  switch (currentWireStyle) {

    case 'triangle': {
      // 7 distinct icosphere detail levels (0–6) spread across 10 positions.
      // Flat spots placed away from centre so both slider directions change.
      //           density:  1  2  3  4  5  6  7  8  9  10
      const LEVELS        = [0, 1, 2, 2, 3, 4, 4, 5, 5, 6];
      return withNormals(buildTriangleGraticule(R * 1.001, LEVELS[idx]));
    }

    case 'hexagon': {
      // 6 distinct detail levels (0–5). Centre (density 5 → 2) changes both ways.
      //           density:  1  2  3  4  5  6  7  8  9  10
      const LEVELS        = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5];
      return withNormals(buildHexGraticule(R * 1.001, LEVELS[idx]));
    }

    case 'brick': {
      // Continuous like grid; lonDiv = latDiv gives ~2:1 brick aspect ratio.
      const latDiv = Math.round(6 + t * 30);
      return withNormals(buildBrickGraticule(R * 1.001, latDiv, latDiv));
    }

    case 'diamond': {
      // lonDiv = latDiv*2 → square cells in degree-space → true 45° diagonals.
      // Slightly narrower range than grid so max density stays performant.
      const latDiv = Math.round(4 + t * 18);
      return withNormals(buildDiamondGraticule(R * 1.001, latDiv, latDiv * 2));
    }

    case 'loxodrome': {
      // 2–12 spiral pairs (NE + NW) → 4–24 total spirals.
      const count = Math.round(2 + idx * 10 / 9);
      return withNormals(buildLoxodromeGraticule(R * 1.001, count));
    }

    case 'voronoi': {
      // 20–299 Fibonacci seed points → matching number of Voronoi cells.
      const N = Math.round(20 + idx * 31);
      return withNormals(buildVoronoiGraticule(R * 1.001, N));
    }

    case 'greatcircle': {
      // 3–24 great circles with Fibonacci-distributed orientations.
      const count = Math.round(3 + idx * 7 / 3);
      return withNormals(buildGreatCircleFan(R * 1.001, count));
    }

    default: {                                // 'grid' — continuous parameter
      const latDiv = Math.round(6 + t * 30); // 6–36 divisions
      return withNormals(buildGraticule(R * 1.001, latDiv, latDiv * 2));
    }
  }
}

const wireframe = new THREE.LineSegments(buildWireGeometry(), graticuleMat);
wireframe.renderOrder = 2; // always on top of the globe surface
equatorGroup.add(wireframe);

function rebuildWireframe() {
  wireframe.geometry.dispose();
  wireframe.geometry = buildWireGeometry();
}

function setWireframeStyle(style) {
  currentWireStyle = style;
  rebuildWireframe();
}

// ── Atmosphere ───────────────────────────────────────────────────────────────

// MeshBasicMaterial — no directional lighting so it won't show a day/night
// gradient when the day/night cycle is disabled.
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(R * 1.055, 64, 64),
  new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.05,
    side: THREE.FrontSide, depthWrite: false,
  })
);
atmosphere.visible = false;
scene.add(atmosphere);

const rimMat = new THREE.ShaderMaterial({
  uniforms: {
    glowColor:  { value: new THREE.Color(0xffffff) },
    viewVector: { value: new THREE.Vector3() },
  },
  vertexShader: `
    uniform vec3 viewVector;
    varying float rim;
    void main() {
      vec3 vn = normalize(normalMatrix * normal);
      vec3 vv = normalize(normalMatrix * viewVector);
      rim = pow(1.0 - abs(dot(vn, vv)), 3.5);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 glowColor;
    varying float rim;
    void main() { gl_FragColor = vec4(glowColor, rim * 0.18); }
  `,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
});

const rimGlow = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 64, 64), rimMat);
rimGlow.visible = false; // hidden by default; atmosphere toggle enables it
scene.add(rimGlow);

// ── Sun light (direction only — all meshes use ShaderMaterial, no Three.js lighting) ──
// Position is only used to derive sunDir for the globe shader and to drive
// the atmosphere glow mesh if lights: true is ever added.

const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
sunLight.position.set(5, 0, 0); // Y=0 keeps sun on equatorial plane → vertical terminator
scene.add(sunLight);

// Keep the globe shader's sunDir in sync with the Three.js light
function syncSunDir() {
  globeMat.uniforms.sunDir.value.copy(sunLight.position).normalize();
}
syncSunDir();

// ── Theme sync ───────────────────────────────────────────────────────────────
// Maps site theme names → globe material colors

// Atmosphere & rim glow are always white — only wireframe + globe base change.
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
  graticuleMat.uniforms.lineColor.value.copy(c.line);
  globeMat.uniforms.baseColor.value.copy(c.base);
}

// Apply saved theme on load
applyGlobeTheme(localStorage.getItem('itschu-theme') || 'dark');

// React instantly when user clicks a swatch on any page
new MutationObserver(() => {
  applyGlobeTheme(localStorage.getItem('itschu-theme') || 'amber');
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  autoRotate:     true,
  rotateSpeed:    0.002,   // ≈ 1 full rotation per minute at 60 fps
  dayNightCycle:  false,
  sunSpeed:       0.002,   // starts locked to rotateSpeed
  sunSpeedLocked: true,
  sunAngle:       0, // starts at (5, 0, 0) — sun directly to the right
  isCapturingGif: false,
  axialTilt:      0,       // degrees — tilts the spin axis
  equatorTilt:    0,       // degrees — tilts the visible equator independently
  tiltLocked:     true,    // when true the two sliders move together
};

// ── UI helpers ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function showFileRow(rowId, nameId, filename) {
  const row = $(rowId);
  row.style.display = 'flex';
  $(nameId).textContent = filename.length > 22
    ? filename.slice(0, 10) + '…' + filename.slice(-9)
    : filename;
}

function hideFileRow(rowId) {
  $(rowId).style.display = 'none';
}

// Maximum anisotropy supported by the GPU — reduces blurring at oblique angles
// (most noticeable near the poles where UV coordinates are compressed).
const MAX_ANISOTROPY = renderer.capabilities.getMaxAnisotropy();

function loadTex(url, onLoad) {
  new THREE.TextureLoader().load(url, tex => {
    tex.colorSpace  = THREE.LinearSRGBColorSpace;
    tex.anisotropy  = MAX_ANISOTROPY;
    tex.minFilter   = THREE.LinearMipmapLinearFilter; // trilinear — best quality
    tex.magFilter   = THREE.LinearFilter;
    tex.needsUpdate = true;
    onLoad(tex);
    URL.revokeObjectURL(url);
  });
}

// ── Appearance ───────────────────────────────────────────────────────────────

$('wireframe-toggle').addEventListener('change', e => {
  wireframe.visible = e.target.checked;
});

$('wire-style').addEventListener('change', e => {
  setWireframeStyle(e.target.value);
});

$('wire-density').addEventListener('input', e => {
  currentWireDensity = parseInt(e.target.value);
  $('wire-density-num').value = e.target.value;
  rebuildWireframe();
});

$('atmosphere-toggle').addEventListener('change', e => {
  atmosphere.visible = e.target.checked;
  rimGlow.visible    = e.target.checked;
});

$('stars-toggle').addEventListener('change', e => {
  // Only affect procedural stars; background tex star sphere is separate
  stars.visible = e.target.checked && !state.hasBgTex;
});

// ── Textures ─────────────────────────────────────────────────────────────────

state.hasBgTex = false;

// Day texture
$('upload-day-btn').addEventListener('click', () => $('day-tex-input').click());
$('day-tex-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  loadTex(URL.createObjectURL(file), tex => {
    if (globeMat.uniforms.dayTex.value) globeMat.uniforms.dayTex.value.dispose();
    globeMat.uniforms.dayTex.value    = tex;
    globeMat.uniforms.hasDayTex.value = true;
    globe.visible = true;
    showFileRow('day-file-row', 'day-file-name', file.name);
    // Auto-disable wireframe
    wireframe.visible = false;
    $('wireframe-toggle').checked = false;
  });
  e.target.value = '';
});
$('clear-day-btn').addEventListener('click', () => {
  if (globeMat.uniforms.dayTex.value) globeMat.uniforms.dayTex.value.dispose();
  globeMat.uniforms.dayTex.value    = null;
  globeMat.uniforms.hasDayTex.value = false;
  globe.visible = false;
  hideFileRow('day-file-row');
});

// Night texture
$('upload-night-btn').addEventListener('click', () => $('night-tex-input').click());
$('night-tex-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  loadTex(URL.createObjectURL(file), tex => {
    if (globeMat.uniforms.nightTex.value) globeMat.uniforms.nightTex.value.dispose();
    globeMat.uniforms.nightTex.value    = tex;
    globeMat.uniforms.hasNightTex.value = true;
    showFileRow('night-file-row', 'night-file-name', file.name);
  });
  e.target.value = '';
});
$('clear-night-btn').addEventListener('click', () => {
  if (globeMat.uniforms.nightTex.value) globeMat.uniforms.nightTex.value.dispose();
  globeMat.uniforms.nightTex.value    = null;
  globeMat.uniforms.hasNightTex.value = false;
  hideFileRow('night-file-row');
});

// Background texture (equirectangular → scene.background)
$('upload-bg-btn').addEventListener('click', () => $('bg-tex-input').click());
$('bg-tex-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  loadTex(URL.createObjectURL(file), tex => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
    stars.visible    = false; // hide procedural stars
    state.hasBgTex   = true;
    showFileRow('bg-file-row', 'bg-file-name', file.name);
  });
  e.target.value = '';
});
$('clear-bg-btn').addEventListener('click', () => {
  if (scene.background && scene.background.isTexture) scene.background.dispose();
  scene.background = new THREE.Color(0x000000);
  stars.visible    = $('stars-toggle').checked;
  state.hasBgTex   = false;
  hideFileRow('bg-file-row');
});

// ── Rotation ─────────────────────────────────────────────────────────────────

$('rotate-toggle').addEventListener('change', e => {
  state.autoRotate = e.target.checked;
});

$('speed-slider').addEventListener('input', e => {
  state.rotateSpeed = e.target.value / 1000;
  $('speed-num').value = e.target.value;
  if (state.sunSpeedLocked) {
    state.sunSpeed              = state.rotateSpeed;
    $('sun-speed-slider').value = e.target.value;
    $('sun-speed-num').value    = e.target.value;
  }
});

// Applies both tilt values to the group hierarchy.
// tiltGroup.rotation.z  = axialTilt         → tilts the spin axis in world space
// equatorGroup.rotation.z = equatorTilt − axialTilt
//   → net visual equator tilt in world space equals equatorTilt regardless of
//     how much axialTilt is set, because equatorGroup inherits axialTilt from
//     its parent chain.
function applyTilts() {
  tiltGroup.rotation.z    = THREE.MathUtils.degToRad(state.axialTilt);
  equatorGroup.rotation.z = THREE.MathUtils.degToRad(state.equatorTilt - state.axialTilt);
}

$('axial-tilt-slider').addEventListener('input', e => {
  const deg = parseFloat(e.target.value);
  state.axialTilt = deg;
  $('axial-tilt-num').value = deg;
  if (state.tiltLocked) {
    state.equatorTilt = deg;
    $('equator-tilt-slider').value = deg;
    $('equator-tilt-num').value    = deg;
  }
  applyTilts();
});

$('equator-tilt-slider').addEventListener('input', e => {
  const deg = parseFloat(e.target.value);
  state.equatorTilt = deg;
  $('equator-tilt-num').value = deg;
  if (state.tiltLocked) {
    state.axialTilt = deg;
    $('axial-tilt-slider').value = deg;
    $('axial-tilt-num').value    = deg;
  }
  applyTilts();
});

$('tilt-lock').addEventListener('change', e => {
  state.tiltLocked = e.target.checked;
  if (state.tiltLocked) {
    // Snap equator tilt to match axial tilt when re-locking
    state.equatorTilt              = state.axialTilt;
    $('equator-tilt-slider').value = state.axialTilt;
    $('equator-tilt-num').value    = state.axialTilt;
    applyTilts();
  }
});

$('sun-speed-lock').addEventListener('change', e => {
  const unlocked = e.target.checked;
  state.sunSpeedLocked               = !unlocked;
  $('sun-speed-slider').disabled     = !unlocked;
  if (!unlocked) {
    // Re-locking: snap sun speed back to current rotation speed
    state.sunSpeed              = state.rotateSpeed;
    $('sun-speed-slider').value = Math.round(state.rotateSpeed * 1000);
  }
});

$('tilt-fullrange').addEventListener('change', e => {
  const max = e.target.checked ? 360 : 45;
  $('axial-tilt-slider').max   = max;
  $('equator-tilt-slider').max = max;

  // When narrowing back to 45°, clamp any out-of-range values
  if (!e.target.checked) {
    if (state.axialTilt > 45) {
      state.axialTilt = 45;
      $('axial-tilt-slider').value = 45;
      $('axial-tilt-num').value    = 45;
    }
    if (state.equatorTilt > 45) {
      state.equatorTilt = 45;
      $('equator-tilt-slider').value = 45;
      $('equator-tilt-num').value    = 45;
    }
    applyTilts();
  }
});

// ── Lighting ─────────────────────────────────────────────────────────────────

$('daynight-toggle').addEventListener('change', e => {
  state.dayNightCycle             = e.target.checked;
  globeMat.uniforms.flatLit.value = !e.target.checked;
  $('sun-options').style.display  = e.target.checked ? 'block' : 'none';
});

$('sun-speed-slider').addEventListener('input', e => {
  if (!state.sunSpeedLocked) state.sunSpeed = e.target.value / 1000;
  $('sun-speed-num').value = e.target.value;
});

$('sun-intensity-slider').addEventListener('input', e => {
  // Map 0–100 → 0–3.0 sun intensity in the globe shader
  globeMat.uniforms.sunIntensity.value = e.target.value / 50;
  $('sun-intensity-num').value = e.target.value;
});

$('sun-color').addEventListener('input', e => {
  const c = new THREE.Color(e.target.value);
  globeMat.uniforms.sunColor.value.set(c.r, c.g, c.b);
  sunLight.color.set(e.target.value);
});

$('ambient-slider').addEventListener('input', e => {
  const v = e.target.value / 100;
  globeMat.uniforms.ambientStr.value = v * 0.6;
  $('ambient-num').value = e.target.value;
});

// ── Export ───────────────────────────────────────────────────────────────────

$('screenshot-btn').addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = Object.assign(document.createElement('a'), {
    href: canvas.toDataURL('image/png'),
    download: 'globe.png',
  });
  a.click();
});

$('gif-duration-slider').addEventListener('input', e => { $('gif-duration-num').value = e.target.value; });
$('gif-fps-slider').addEventListener('input',     e => { $('gif-fps-num').value     = e.target.value; });
$('gif-size-slider').addEventListener('input',    e => { $('gif-size-num').value    = e.target.value; });

$('gif-btn').addEventListener('click', captureGif);

async function captureGif() {
  if (state.isCapturingGif) return;
  if (typeof GIF === 'undefined') {
    alert('gif.js not found — make sure vendor/gif.js exists.');
    return;
  }

  const loopDuration = parseInt($('gif-duration-slider').value); // seconds
  const fps          = parseInt($('gif-fps-slider').value);
  const frameCount   = Math.ceil(loopDuration * fps);
  const delay        = Math.round(1000 / fps);
  const gifSize      = parseInt($('gif-size-slider').value);

  state.isCapturingGif = true;
  $('gif-btn').disabled = true;
  $('gif-progress').style.display = 'block';

  const savedRotY       = spinGroup.rotation.y;
  const savedAutoRotate = state.autoRotate;
  const savedDayNight   = state.dayNightCycle;
  state.autoRotate    = false;
  state.dayNightCycle = false;

  const offCanvas = Object.assign(document.createElement('canvas'), { width: gifSize, height: gifSize });
  const offCtx    = offCanvas.getContext('2d');

  // ── Phase 1: render all frames, store pixel data ──────────────────────────
  // Storing ImageData (not canvases) keeps memory lower; copy:true later
  // means gif.js snapshots the pixel data immediately on addFrame.
  const imageDataArr = [];

  for (let i = 0; i < frameCount; i++) {
    spinGroup.rotation.y = savedRotY + (i / frameCount) * Math.PI * 2;
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

  // ── Phase 2: build round-robin composite ─────────────────────────────────
  // Each pixel is taken raw from a different frame (no blending), so NeuQuant
  // sees real, unblended colours from every frame without desaturation.
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

  // ── Phase 2b: pre-render composite to extract the global palette array ────
  // gif.js sets options.globalPalette to the NeuQuant colour table after the
  // first frame finishes. We run a throwaway 1-frame GIF, capture that array,
  // then pass it directly to the real GIF — no extra display frame, no loop
  // flicker.
  $('gif-progress-bar').style.width  = '42%';
  $('gif-progress-text').textContent = 'Quantising palette…';
  await new Promise(r => setTimeout(r, 0));

  const globalPalette = await new Promise(resolve => {
    const palGif = new GIF({
      workers: 1,
      quality: 1,
      width: gifSize, height: gifSize,
      workerScript: 'vendor/gif.worker.js',
      globalPalette: true,
    });
    palGif.addFrame(offCanvas, { delay: 1, copy: true });
    palGif.on('finished', () => resolve(palGif.options.globalPalette));
    palGif.render();
  });

  $('gif-progress-bar').style.width  = '50%';

  // ── Phase 3: encode — all frames share the pre-built palette ─────────────
  const gif = new GIF({
    workers: 4,
    quality: 1,
    width: gifSize, height: gifSize,
    workerScript: 'vendor/gif.worker.js',
    globalPalette, // array → used directly, no palette-building frame added
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
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'globe.gif',
    });
    a.click();

    spinGroup.rotation.y = savedRotY;
    state.autoRotate    = savedAutoRotate;
    state.dayNightCycle = savedDayNight;
    state.isCapturingGif   = false;
    $('gif-btn').disabled  = false;
    $('gif-progress').style.display   = 'none';
    $('gif-progress-bar').style.width = '0%';
  });

  gif.render();
}

// ── Experimental section toggle ──────────────────────────────────────────────

$('experimental-toggle').addEventListener('click', () => {
  $('experimental-toggle').classList.toggle('open');
  $('experimental-body').classList.toggle('open');
});

// ── Panel toggle ─────────────────────────────────────────────────────────────

$('panel-toggle').addEventListener('click', () => {
  $('panel').classList.toggle('collapsed');
  setTimeout(onResize, 300);
});

// ── Resize ───────────────────────────────────────────────────────────────────

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
// Typing in the number box clamps to [min,max] then fires the slider's input
// event so all existing slider logic runs without duplication.
function wireSliderNum(sliderId, numId) {
  const s = $(sliderId), n = $(numId);
  n.addEventListener('change', () => {
    const clamped = Math.min(Math.max(+n.value || 0, +s.min), +s.max);
    n.value = clamped;
    s.value = clamped;
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Also sync on unlock: when slider becomes enabled, re-enable num too
  const obs = new MutationObserver(() => { n.disabled = s.disabled; });
  obs.observe(s, { attributes: true, attributeFilter: ['disabled'] });
}

wireSliderNum('speed-slider',         'speed-num');
wireSliderNum('axial-tilt-slider',    'axial-tilt-num');
wireSliderNum('equator-tilt-slider',  'equator-tilt-num');
wireSliderNum('sun-intensity-slider', 'sun-intensity-num');
wireSliderNum('sun-speed-slider',     'sun-speed-num');
wireSliderNum('ambient-slider',       'ambient-num');
wireSliderNum('gif-duration-slider',  'gif-duration-num');
wireSliderNum('gif-fps-slider',       'gif-fps-num');
wireSliderNum('gif-size-slider',      'gif-size-num');
wireSliderNum('wire-density',         'wire-density-num');

// ── Render loop ──────────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  if (state.isCapturingGif) return;

  const dt = clock.getDelta();

  if (state.autoRotate) {
    spinGroup.rotation.y += state.rotateSpeed * dt * 60;
  }

  if (state.dayNightCycle) {
    state.sunAngle += state.sunSpeed * dt * 60;
    sunLight.position.set(
      Math.cos(state.sunAngle) * 5,
      0, // Y=0 keeps sun on equatorial plane → terminator stays vertical
      Math.sin(state.sunAngle) * 5,
    );
    syncSunDir();
  }

  rimMat.uniforms.viewVector.value.copy(camera.position);
  controls.update();
  renderer.render(scene, camera);
}

animate();
