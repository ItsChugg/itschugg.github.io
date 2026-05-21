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

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
camera.position.set(0, 2, 12);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance   = 1.0;
controls.maxDistance   = 200;
controls.autoRotate    = false;

// ── Background stars ─────────────────────────────────────────────────────────

function buildStarGeo(count) {
  const pos   = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 120 + Math.random() * 60;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);
    sizes[i] = 0.4 + Math.random() * 1.6; // relative size multiplier (0.4–2.0)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));
  return geo;
}

const starMat = new THREE.ShaderMaterial({
  uniforms: {
    baseSize:  { value: 3.5 },
    starColor: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: `
    attribute float size;
    uniform float baseSize;
    void main() {
      gl_PointSize = size * baseSize;
      gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 starColor;
    void main() {
      vec2  uv = gl_PointCoord - 0.5;
      float d  = length(uv) * 2.0;
      if (d > 1.0) discard;
      float core = pow(max(0.0, 1.0 - d * 2.5), 3.0);
      float halo = pow(1.0 - d, 2.0) * 0.35;
      float b    = clamp(core + halo, 0.0, 1.0);
      gl_FragColor = vec4(starColor * b + vec3(b * 0.25), b);
    }
  `,
  transparent: true,
  depthWrite:  false,
  blending:    THREE.AdditiveBlending,
});

let bgStars = new THREE.Points(buildStarGeo(3000), starMat);
scene.add(bgStars);

function rebuildStarField(count) {
  const wasVisible = bgStars.visible;
  scene.remove(bgStars);
  bgStars.geometry.dispose();
  bgStars = new THREE.Points(buildStarGeo(count), starMat);
  bgStars.visible = wasVisible;
  scene.add(bgStars);
}

// ── Sun visual ────────────────────────────────────────────────────────────────
// The sun is a constant at the origin — the system's central star.
// Its position drives physically correct day/night shading per body.

const sunGroup = new THREE.Group();

const sunCoreMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1.5, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false })
);
const sunGlow1 = new THREE.Mesh(
  new THREE.SphereGeometry(2.1, 32, 32),
  new THREE.MeshBasicMaterial({
    color: 0xffcc44, transparent: true, opacity: 0.45,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
  })
);
const sunGlow2 = new THREE.Mesh(
  new THREE.SphereGeometry(3.5, 32, 32),
  new THREE.MeshBasicMaterial({
    color: 0xff8800, transparent: true, opacity: 0.18,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
  })
);
sunGroup.add(sunCoreMesh, sunGlow1, sunGlow2);
scene.add(sunGroup);

function setSunSize(s) {
  sunCoreMesh.geometry.dispose(); sunCoreMesh.geometry = new THREE.SphereGeometry(s,       32, 32);
  sunGlow1.geometry.dispose();    sunGlow1.geometry    = new THREE.SphereGeometry(s * 1.4, 32, 32);
  sunGlow2.geometry.dispose();    sunGlow2.geometry    = new THREE.SphereGeometry(s * 2.3, 32, 32);
}

function setSunColor(hex) {
  const c = new THREE.Color(hex);
  sunCoreMesh.material.color.copy(new THREE.Color(1, 1, 1).lerp(c, 0.35));
  sunGlow1.material.color.copy(c);
  sunGlow2.material.color.copy(c.clone().multiplyScalar(0.65));
}

// ── Shader source strings ─────────────────────────────────────────────────────

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

// ── Graticule builders ────────────────────────────────────────────────────────

function buildGraticule(radius, latDiv, lonDiv, seg = 128) {
  const pts = [];
  for (let i = 1; i < latDiv; i++) {
    const phi = (i / latDiv) * Math.PI;
    const y = radius * Math.cos(phi), r = radius * Math.sin(phi);
    for (let j = 0; j < seg; j++) {
      const a1 = (j / seg) * Math.PI * 2, a2 = ((j + 1) / seg) * Math.PI * 2;
      pts.push(r * Math.cos(a1), y, r * Math.sin(a1), r * Math.cos(a2), y, r * Math.sin(a2));
    }
  }
  for (let i = 0; i < lonDiv; i++) {
    const theta = (i / lonDiv) * Math.PI * 2, ct = Math.cos(theta), st = Math.sin(theta);
    for (let j = 0; j < seg; j++) {
      const p1 = (j / seg) * Math.PI, p2 = ((j + 1) / seg) * Math.PI;
      pts.push(radius * Math.sin(p1) * ct, radius * Math.cos(p1), radius * Math.sin(p1) * st,
               radius * Math.sin(p2) * ct, radius * Math.cos(p2), radius * Math.sin(p2) * st);
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
  const pos = icoGeo.attributes.position, nFaces = pos.count / 3;
  const PREC = 1e6;
  const vKey = vi => `${Math.round(pos.getX(vi)*PREC)},${Math.round(pos.getY(vi)*PREC)},${Math.round(pos.getZ(vi)*PREC)}`;
  const centroids = [];
  for (let i = 0; i < nFaces; i++) {
    const a = i*3, b = a+1, c = a+2;
    centroids.push(new THREE.Vector3(
      (pos.getX(a)+pos.getX(b)+pos.getX(c))/3,
      (pos.getY(a)+pos.getY(b)+pos.getY(c))/3,
      (pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3).normalize().multiplyScalar(radius));
  }
  const edgeMap = new Map();
  for (let i = 0; i < nFaces; i++) {
    const vk = [vKey(i*3), vKey(i*3+1), vKey(i*3+2)];
    for (let e = 0; e < 3; e++) {
      const k1 = vk[e], k2 = vk[(e+1)%3];
      const ek = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      if (!edgeMap.has(ek)) edgeMap.set(ek, []);
      edgeMap.get(ek).push(i);
    }
  }
  const pts = [];
  for (const f of edgeMap.values()) if (f.length === 2) pts.push(...centroids[f[0]].toArray(), ...centroids[f[1]].toArray());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildBrickGraticule(radius, latDiv, lonDiv, seg = 64) {
  const pts = [];
  for (let i = 1; i < latDiv; i++) {
    const phi = (i/latDiv)*Math.PI, y = radius*Math.cos(phi), r = radius*Math.sin(phi);
    for (let j = 0; j < seg; j++) {
      const a1=(j/seg)*Math.PI*2, a2=((j+1)/seg)*Math.PI*2;
      pts.push(r*Math.cos(a1),y,r*Math.sin(a1),r*Math.cos(a2),y,r*Math.sin(a2));
    }
  }
  for (let row = 0; row < latDiv; row++) {
    const off=(row%2)*0.5, phi1=(row/latDiv)*Math.PI, phi2=((row+1)/latDiv)*Math.PI;
    for (let j = 0; j < lonDiv; j++) {
      const theta=((j+off)/lonDiv)*Math.PI*2, ct=Math.cos(theta), st=Math.sin(theta);
      for (let k = 0; k < 8; k++) {
        const p1=phi1+(k/8)*(phi2-phi1), p2=phi1+((k+1)/8)*(phi2-phi1);
        pts.push(radius*Math.sin(p1)*ct,radius*Math.cos(p1),radius*Math.sin(p1)*st,
                 radius*Math.sin(p2)*ct,radius*Math.cos(p2),radius*Math.sin(p2)*st);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildDiamondGraticule(radius, latDiv, lonDiv, seg = 8) {
  const pts=[], v0=new THREE.Vector3(), v1=new THREE.Vector3();
  const spt=(phi,theta)=>new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)).multiplyScalar(radius);
  for (let i=0;i<latDiv;i++) {
    const phi1=(i/latDiv)*Math.PI, phi2=((i+1)/latDiv)*Math.PI;
    for (let j=0;j<lonDiv;j++) {
      const t1=(j/lonDiv)*Math.PI*2, t2=((j+1)/lonDiv)*Math.PI*2;
      const NW=spt(phi1,t1),NE=spt(phi1,t2),SW=spt(phi2,t1),SE=spt(phi2,t2);
      for (const [a,b] of [[NW,SE],[NE,SW]])
        for (let k=0;k<seg;k++) {
          v0.lerpVectors(a,b,k/seg).normalize().multiplyScalar(radius);
          v1.lerpVectors(a,b,(k+1)/seg).normalize().multiplyScalar(radius);
          pts.push(v0.x,v0.y,v0.z,v1.x,v1.y,v1.z);
        }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  return geo;
}

function buildLoxodromeGraticule(radius, count, angleDeg=60, seg=200) {
  const pts=[], tanA=Math.tan(THREE.MathUtils.degToRad(angleDeg));
  const lo=THREE.MathUtils.degToRad(-80), hi=THREE.MathUtils.degToRad(80);
  for (let i=0;i<count;i++) {
    const lon0=(i/count)*Math.PI*2;
    for (const sign of [1,-1]) for (let k=0;k<seg-1;k++) {
      const lat1=lo+(k/(seg-1))*(hi-lo), lat2=lo+((k+1)/(seg-1))*(hi-lo);
      const M1=Math.log(Math.tan(Math.PI/4+lat1/2)), M2=Math.log(Math.tan(Math.PI/4+lat2/2));
      const lon1=lon0+sign*tanA*M1, lon2=lon0+sign*tanA*M2;
      const co1=Math.PI/2-lat1, co2=Math.PI/2-lat2;
      pts.push(radius*Math.sin(co1)*Math.cos(lon1),radius*Math.cos(co1),radius*Math.sin(co1)*Math.sin(lon1),
               radius*Math.sin(co2)*Math.cos(lon2),radius*Math.cos(co2),radius*Math.sin(co2)*Math.sin(lon2));
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  return geo;
}

function buildVoronoiGraticule(radius, N, arcSeg=6) {
  const goldenAngle=Math.PI*(3-Math.sqrt(5)), seeds=[];
  for (let i=0;i<N;i++) { const y=1-(2*i+1)/N,r=Math.sqrt(Math.max(0,1-y*y)),theta=goldenAngle*i; seeds.push(new THREE.Vector3(r*Math.cos(theta),y,r*Math.sin(theta))); }
  const hullGeo=new ConvexGeometry(seeds), pos=hullGeo.attributes.position, nFaces=pos.count/3;
  const PREC=1e6, vKey=vi=>`${Math.round(pos.getX(vi)*PREC)},${Math.round(pos.getY(vi)*PREC)},${Math.round(pos.getZ(vi)*PREC)}`;
  const A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3();
  const ab=new THREE.Vector3(),bc=new THREE.Vector3(),ca=new THREE.Vector3();
  const circumcenters=[];
  for (let i=0;i<nFaces;i++) {
    const ai=i*3,bi=ai+1,ci=ai+2;
    A.fromBufferAttribute(pos,ai);B.fromBufferAttribute(pos,bi);C.fromBufferAttribute(pos,ci);
    ab.crossVectors(A,B);bc.crossVectors(B,C);ca.crossVectors(C,A);
    const cc=new THREE.Vector3().addVectors(ab,bc).add(ca).normalize().multiplyScalar(radius);
    if(cc.dot(A)<0)cc.negate(); circumcenters.push(cc);
  }
  const edgeMap=new Map();
  for (let i=0;i<nFaces;i++) {
    const vk=[vKey(i*3),vKey(i*3+1),vKey(i*3+2)];
    for (let e=0;e<3;e++) { const k1=vk[e],k2=vk[(e+1)%3],ek=k1<k2?`${k1}|${k2}`:`${k2}|${k1}`; if(!edgeMap.has(ek))edgeMap.set(ek,[]); edgeMap.get(ek).push(i); }
  }
  const pts=[],v0=new THREE.Vector3(),v1=new THREE.Vector3();
  for (const f of edgeMap.values()) if(f.length===2) { const c1=circumcenters[f[0]],c2=circumcenters[f[1]]; for(let k=0;k<arcSeg;k++){v0.lerpVectors(c1,c2,k/arcSeg).normalize().multiplyScalar(radius);v1.lerpVectors(c1,c2,(k+1)/arcSeg).normalize().multiplyScalar(radius);pts.push(v0.x,v0.y,v0.z,v1.x,v1.y,v1.z);} }
  hullGeo.dispose();
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  return geo;
}

function buildGreatCircleFan(radius, count, seg=128) {
  const pts=[],goldenAngle=Math.PI*(3-Math.sqrt(5));
  const pole=new THREE.Vector3(),fallback=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3(),p1=new THREE.Vector3(),p2=new THREE.Vector3();
  for (let i=0;i<count;i++) {
    const y=(i+0.5)/count,r=Math.sqrt(1-y*y);
    pole.set(r*Math.cos(goldenAngle*i),y,r*Math.sin(goldenAngle*i));
    fallback.set(0,1,0); if(Math.abs(pole.dot(fallback))>0.9)fallback.set(1,0,0);
    u.crossVectors(pole,fallback).normalize(); v.crossVectors(pole,u);
    for (let j=0;j<seg;j++) {
      const a1=(j/seg)*Math.PI*2,a2=((j+1)/seg)*Math.PI*2;
      p1.copy(u).multiplyScalar(Math.cos(a1)*radius).addScaledVector(v,Math.sin(a1)*radius);
      p2.copy(u).multiplyScalar(Math.cos(a2)*radius).addScaledVector(v,Math.sin(a2)*radius);
      pts.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  return geo;
}

function addSphereNormals(geo) {
  const pos=geo.attributes.position, norms=new Float32Array(pos.count*3), v=new THREE.Vector3();
  for (let i=0;i<pos.count;i++) { v.fromBufferAttribute(pos,i).normalize(); norms[i*3]=v.x;norms[i*3+1]=v.y;norms[i*3+2]=v.z; }
  geo.setAttribute('normal',new THREE.BufferAttribute(norms,3));
  return geo;
}

function buildWireGeometry(size, style, density) {
  const idx=density-1, t=idx/9, wn=g=>addSphereNormals(g);
  switch (style) {
    case 'triangle': { const L=[0,1,2,2,3,4,4,5,5,6]; return wn(buildTriangleGraticule(size,L[idx])); }
    case 'hexagon':  { const L=[0,0,1,1,2,3,3,4,4,5]; return wn(buildHexGraticule(size,L[idx])); }
    case 'brick':    { const d=Math.round(6+t*30); return wn(buildBrickGraticule(size,d,d)); }
    case 'diamond':  { const d=Math.round(4+t*18); return wn(buildDiamondGraticule(size,d,d*2)); }
    case 'loxodrome':{ return wn(buildLoxodromeGraticule(size,Math.round(2+idx*10/9))); }
    case 'voronoi':  { return wn(buildVoronoiGraticule(size,Math.round(20+idx*31))); }
    case 'greatcircle':{ return wn(buildGreatCircleFan(size,Math.round(3+idx*7/3))); }
    default:         { const d=Math.round(6+t*30); return wn(buildGraticule(size,d,d*2)); }
  }
}

// ── Per-body sun direction temp vector ────────────────────────────────────────
// Sun sits at origin. Each body's sunDir is computed per-frame from its
// world position so day/night shading is correct at every orbital angle.

const _sunDirTmp = new THREE.Vector3();

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
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.anisotropy = MAX_ANISOTROPY;
    tex.minFilter  = THREE.LinearMipmapLinearFilter;
    tex.magFilter  = THREE.LinearFilter;
    tex.needsUpdate = true;
    onLoad(tex);
    URL.revokeObjectURL(url);
  });
}

// ── Body class ────────────────────────────────────────────────────────────────
//
// Orbit types:
//   centered   — body sits at parent's origin (no orbit)
//   circular   — constant-radius circular orbit
//   elliptical — Keplerian ellipse; eccentricity stretches the shape
//   binary     — two bodies share a common barycenter
//
// Scene graph:
//   [parent.bodyGroup or scene]
//     └─ orbitGroup          ← outer-orbit rotation (circular) or ellipse advance
//          └─ bodyGroup      ← offset by orbitRadius along X
//               ├─ tiltGroup → spinGroup → equatorGroup → mesh + wireframe
//               ├─ atmosphere
//               └─ rimGlow
//
// Binary restructures bodyGroup as:
//   bodyGroup (host, position = barycenter offset from parent)
//     └─ binarySpinGroup ← mutual orbit rotation
//          ├─ binaryOffsetA (position.x = +sep/2) → host tiltGroup etc.
//          └─ binaryOffsetB (position.x = −sep/2) → guest tiltGroup etc.

class Body {
  constructor({
    name             = 'Body',
    type             = 'planet',
    parent           = null,
    size             = 1.0,
    orbitType        = 'centered',
    orbitRadius      = 0,
    orbitPeriod      = 120,
    orbitInclination = 0,
    orbitEccentricity = 0,
  } = {}) {
    this.name             = name;
    this.type             = type;
    this.parent           = parent;
    this.size             = size;

    // ── Orbit state ──────────────────────────────────────────────────────────
    this.orbitType        = orbitType;
    this.orbitRadius      = orbitRadius;
    this.orbitPeriod      = orbitPeriod;   // seconds per full orbit
    this.orbitInclination = orbitInclination;
    this.orbitEccentricity = orbitEccentricity;
    this._orbitAngle      = 0;             // radians, advances each frame
    this._orbitSpeed      = 0;             // rad per frame at 60fps — computed below

    // ── Binary state ──────────────────────────────────────────────────────────
    this.binaryPartner     = null;
    this.binaryIsHost      = false;
    this._binarySpinGroup  = null;
    this._binaryOffset     = null;  // this body's offset group within binarySpinGroup
    this.binarySeparation  = 4;
    this.binaryPeriod      = 60;    // seconds per mutual orbit

    // ── Per-body panel state ─────────────────────────────────────────────────
    this.autoRotate    = true;
    this.rotateSpeed   = (2 * Math.PI) / (60 * 60);
    this.axialTilt     = 0;
    this.equatorTilt   = 0;
    this.tiltLocked    = true;
    this.fullTiltRange = false;
    this.dayNightCycle = false;
    this.wireStyle     = 'triangle';
    this.wireDensity   = 5;
    this.dayTexName    = null;
    this.nightTexName  = null;

    this._syncOrbitSpeed();

    // ── Scene graph ───────────────────────────────────────────────────────────
    this.orbitGroup = new THREE.Group();
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

    // ── Globe ─────────────────────────────────────────────────────────────────
    this.globeMat = new THREE.ShaderMaterial({
      vertexShader: GLOBE_VERT, fragmentShader: GLOBE_FRAG,
      uniforms: {
        dayTex:         { value: null },
        nightTex:       { value: null },
        hasDayTex:      { value: false },
        hasNightTex:    { value: false },
        sunDir:         { value: new THREE.Vector3(1, 0, 0) },
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

    // ── Wireframe ─────────────────────────────────────────────────────────────
    this.graticuleMat = new THREE.ShaderMaterial({
      uniforms: {
        lineColor: { value: new THREE.Color(0x2266cc) },
        opacity:   { value: 0.55 },
        sunDir:    { value: new THREE.Vector3(1, 0, 0) },
        flatLit:   { value: true },
      },
      vertexShader: GRAT_VERT, fragmentShader: GRAT_FRAG,
      transparent: true, depthWrite: false, depthTest: false,
    });

    this.wireframe = new THREE.LineSegments(
      buildWireGeometry(size * 1.001, this.wireStyle, this.wireDensity),
      this.graticuleMat
    );
    this.wireframe.renderOrder = 2;
    this.wireframe.visible     = true;
    this.equatorGroup.add(this.wireframe);

    // ── Atmosphere ────────────────────────────────────────────────────────────
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(size * 1.055, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, side: THREE.FrontSide, depthWrite: false })
    );
    this.atmosphere.visible = false;
    this.bodyGroup.add(this.atmosphere);

    // ── Rim glow ──────────────────────────────────────────────────────────────
    this.rimMat = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(0xffffff) }, viewVector: { value: new THREE.Vector3() } },
      vertexShader: RIM_VERT, fragmentShader: RIM_FRAG,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    this.rimGlow = new THREE.Mesh(new THREE.SphereGeometry(size * 1.12, 64, 64), this.rimMat);
    this.rimGlow.visible = false;
    this.bodyGroup.add(this.rimGlow);

    this._wp = new THREE.Vector3();

    // ── Attach ────────────────────────────────────────────────────────────────
    const pg = parent ? parent.bodyGroup : scene;
    pg.add(this.orbitGroup);
  }

  _syncOrbitSpeed() {
    this._orbitSpeed = this.orbitPeriod > 0
      ? (2 * Math.PI) / (this.orbitPeriod * 60)
      : 0;
  }

  applyTilts() {
    this.tiltGroup.rotation.z    = THREE.MathUtils.degToRad(this.axialTilt);
    this.equatorGroup.rotation.z = THREE.MathUtils.degToRad(this.equatorTilt - this.axialTilt);
  }

  rebuildWireframe() {
    this.wireframe.geometry.dispose();
    this.wireframe.geometry = buildWireGeometry(this.size * 1.001, this.wireStyle, this.wireDensity);
  }

  setSize(s) {
    this.size = s;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.SphereGeometry(s, 256, 256);
    this.wireframe.geometry.dispose();
    this.wireframe.geometry = buildWireGeometry(s * 1.001, this.wireStyle, this.wireDensity);
    this.atmosphere.geometry.dispose();
    this.atmosphere.geometry = new THREE.SphereGeometry(s * 1.055, 64, 64);
    this.rimGlow.geometry.dispose();
    this.rimGlow.geometry = new THREE.SphereGeometry(s * 1.12, 64, 64);
  }

  update(dt) {
    switch (this.orbitType) {
      case 'circular':
        this.orbitGroup.rotation.y += this._orbitSpeed * dt * 60;
        break;

      case 'elliptical': {
        this._orbitAngle += this._orbitSpeed * dt * 60;
        const a = this.orbitRadius;
        const e = this.orbitEccentricity;
        const b = a * Math.sqrt(Math.max(0, 1 - e * e));
        // Place body on ellipse with one focus at parent origin
        this.bodyGroup.position.x = a * Math.cos(this._orbitAngle) - a * e;
        this.bodyGroup.position.z = b * Math.sin(this._orbitAngle);
        break;
      }

      case 'binary':
        if (this.binaryIsHost) {
          // Outer orbit of the barycenter around the parent star
          this.orbitGroup.rotation.y += this._orbitSpeed * dt * 60;
          // Mutual binary orbit
          const binSpeed = (2 * Math.PI) / (this.binaryPeriod * 60);
          this._binarySpinGroup.rotation.y += binSpeed * dt * 60;
        }
        // Guest body: no independent orbit; the host drives everything
        break;

      // 'centered': body sits at parent origin, no orbit advancement
    }

    if (this.autoRotate)
      this.spinGroup.rotation.y += this.rotateSpeed * dt * 60;

    if (this.rimGlow.visible) {
      this.rimGlow.getWorldPosition(this._wp);
      this.rimMat.uniforms.viewVector.value.subVectors(camera.position, this._wp);
    }
  }

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

    if (this.orbitType === 'binary' && !this.binaryIsHost) return; // host removal handles scene detach
    const pg = this.parent ? this.parent.bodyGroup : scene;
    pg.remove(this.orbitGroup);
  }
}

// ── Binary linking ────────────────────────────────────────────────────────────
//
// Makes `host` and `guest` orbit a common barycenter.
// Host keeps its orbitGroup position (outer orbit); guest's orbitGroup is
// detached and its internals folded into the host's binarySpinGroup.

function linkBinary(host, guest, separation = 4, period = 60) {
  const sep = separation;

  // Create spin group inside host's bodyGroup
  const bsg  = new THREE.Group();
  const offA = new THREE.Group(); // host side (+x)
  const offB = new THREE.Group(); // guest side (−x)
  offA.position.x = +sep / 2;
  offB.position.x = -sep / 2;
  bsg.add(offA, offB);
  host.bodyGroup.add(bsg);

  // Reparent host's internals from bodyGroup → offA
  // THREE.Object3D.add() auto-detaches from previous parent
  offA.add(host.tiltGroup, host.atmosphere, host.rimGlow);

  // Detach guest's orbitGroup from scene/parent, reparent guest's internals → offB
  const guestPG = guest.parent ? guest.parent.bodyGroup : scene;
  guestPG.remove(guest.orbitGroup);
  offB.add(guest.tiltGroup, guest.atmosphere, guest.rimGlow);

  // Host bodyGroup now only has bsg; position it at barycenter (center = 0)
  host.bodyGroup.position.x = host.orbitRadius; // barycenter offset from parent star

  // Record linkage
  host.orbitType       = 'binary';
  host.binaryPartner   = guest;
  host.binaryIsHost    = true;
  host._binarySpinGroup = bsg;
  host._binaryOffset   = offA;
  host.binarySeparation = sep;
  host.binaryPeriod    = period;

  guest.orbitType       = 'binary';
  guest.binaryPartner   = host;
  guest.binaryIsHost    = false;
  guest._binarySpinGroup = bsg;
  guest._binaryOffset   = offB;
  guest.binarySeparation = sep;
  guest.binaryPeriod    = period;
}

// ── Bodies list & selection ───────────────────────────────────────────────────

const bodies = [];
let selectedBody   = null;
let editingBody    = null;
let isCapturingGif = false;
let hasBgTex       = false;

function createBody(opts) {
  const b = new Body(opts);
  bodies.push(b);
  renderBodyTree();
  return b;
}

function removeBody(target) {
  // Collect target + binary partner (if any) + all descendants
  const toRemove = new Set([target]);
  if (target.orbitType === 'binary' && target.binaryPartner)
    toRemove.add(target.binaryPartner);

  function collectDescendants(b) {
    for (const other of bodies)
      if (other.parent === b && !toRemove.has(other)) {
        toRemove.add(other);
        collectDescendants(other);
      }
  }
  toRemove.forEach(collectDescendants);

  // Dispose host first so scene graph cleanup is correct, then guests
  const sorted = [...toRemove].sort((a, b) => (a.binaryIsHost ? -1 : 1));
  sorted.forEach(b => {
    b.dispose();
    bodies.splice(bodies.indexOf(b), 1);
  });

  selectBody(bodies[0] ?? null);
}

// ── Body tree UI ──────────────────────────────────────────────────────────────

const TYPE_LABEL = { planet: 'PLANET', moon: 'MOON' };

function renderBodyTree() {
  const tree = $('body-tree');
  tree.innerHTML = '';

  bodies.forEach(b => {
    const slot = document.createElement('div');
    slot.className = 'upload-slot body-slot';
    const isChild = b.parent || (b.orbitType === 'binary' && !b.binaryIsHost);
    if (isChild) slot.style.paddingLeft = '14px';

    const btn = document.createElement('button');
    btn.className = 'body-select-btn' + (b === selectedBody ? ' active' : '');
    btn.innerHTML = '<span class="body-btn-type">' + (TYPE_LABEL[b.type] ?? b.type.toUpperCase()) + '</span> ' + escHtml(b.name);
    btn.addEventListener('click', () => selectBody(b));

    const editBtn = document.createElement('button');
    editBtn.className   = 'clear-btn';
    editBtn.textContent = '✎';
    editBtn.title       = 'Edit body';
    editBtn.addEventListener('click', e => { e.stopPropagation(); openEditForm(b); });

    const removeBtn = document.createElement('button');
    removeBtn.className   = 'clear-btn';
    removeBtn.textContent = '✕';
    removeBtn.title       = 'Remove body';
    removeBtn.addEventListener('click', e => { e.stopPropagation(); removeBody(b); });

    slot.append(btn, editBtn, removeBtn);
    tree.appendChild(slot);
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Add-body form ─────────────────────────────────────────────────────────────

function openAddForm() {
  closeEditForm(); // mutually exclusive with edit form
  // Populate parent select
  const parentSel = $('new-body-parent');
  parentSel.innerHTML = '<option value="none">None (root)</option>';
  bodies.forEach((b, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = b.name;
    parentSel.appendChild(opt);
  });
  if (bodies.length) parentSel.value = '0';

  // Default name
  $('new-body-name').value = suggestName($('new-body-type').value);

  // Show/hide binary partner row
  updateAddFormOrbitVisibility();

  $('add-body-form').style.display = '';
  $('add-body-btn').style.display  = 'none';
}

function closeAddForm() {
  $('add-body-form').style.display = 'none';
  $('add-body-btn').style.display  = '';
}

// ── Edit-body form ────────────────────────────────────────────────────────────

// Returns true if `node` is a descendant of `ancestor` in the bodies hierarchy
function isDescendantOf(node, ancestor) {
  let cur = node.parent;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent;
  }
  return false;
}

function reparentBody(b, newParent) {
  const oldPG = b.parent ? b.parent.bodyGroup : scene;
  oldPG.remove(b.orbitGroup);
  b.parent = newParent;
  const newPG = newParent ? newParent.bodyGroup : scene;
  newPG.add(b.orbitGroup);
}

function openEditForm(b) {
  editingBody = b;
  closeAddForm(); // mutually exclusive with add form

  $('edit-body-label').textContent = 'Editing: ' + b.name;
  $('edit-body-name').value = b.name;
  $('edit-body-type').value = b.type;

  // Orbit type (binary bodies can't change type from this form)
  const isBinary = b.orbitType === 'binary';
  $('edit-body-orbit').value    = isBinary ? 'binary' : b.orbitType;
  $('edit-body-orbit').disabled = isBinary;
  // Ensure binary option exists only while a binary body is selected
  let binOpt = $('edit-body-orbit').querySelector('option[value="binary"]');
  if (isBinary && !binOpt) {
    binOpt = document.createElement('option');
    binOpt.value = 'binary'; binOpt.textContent = 'Binary';
    $('edit-body-orbit').appendChild(binOpt);
  } else if (!isBinary && binOpt) {
    binOpt.remove();
  }

  // Parent select — can't set to self, own descendants, or change while binary
  const parentSel = $('edit-body-parent');
  parentSel.innerHTML = '<option value="none">None (root)</option>';
  parentSel.disabled  = isBinary;
  if (!isBinary) {
    bodies.forEach((other, i) => {
      if (other === b || isDescendantOf(other, b)) return; // skip invalid parents
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = other.name;
      parentSel.appendChild(opt);
    });
    parentSel.value = b.parent ? String(bodies.indexOf(b.parent)) : 'none';
  }

  $('edit-body-form').style.display = '';
}

function closeEditForm() {
  editingBody = null;
  $('edit-body-form').style.display = 'none';
}

$('confirm-edit-body').addEventListener('click', () => {
  const b = editingBody; if (!b) return;

  const newName = $('edit-body-name').value.trim();
  if (newName) b.name = newName;

  b.type = $('edit-body-type').value;

  // Apply orbit type change (non-binary only)
  if (b.orbitType !== 'binary') {
    const newOrbit = $('edit-body-orbit').value;
    if (newOrbit !== b.orbitType) {
      b.orbitType = newOrbit;
      if (newOrbit === 'centered') {
        b.bodyGroup.position.set(0, 0, 0);
      } else if (newOrbit === 'circular') {
        b.bodyGroup.position.x = b.orbitRadius;
        b.bodyGroup.position.z = 0;
        b.orbitGroup.rotation.y = 0;
      } else if (newOrbit === 'elliptical') {
        b._orbitAngle = 0;
        b.orbitGroup.rotation.y = 0;
      }
    }
  }

  // Apply parent change
  const parentVal  = $('edit-body-parent').value;
  const newParent  = parentVal === 'none' ? null : bodies[parseInt(parentVal)];
  if (newParent !== b.parent) reparentBody(b, newParent);

  closeEditForm();
  selectBody(b); // re-renders tree + refreshes panel
});

$('cancel-edit-body').addEventListener('click', closeEditForm);

function suggestName(type) {
  const count = bodies.filter(b => b.type === type).length + 1;
  return { planet: 'Planet', moon: 'Moon' }[type] + ' ' + count;
}

function updateAddFormOrbitVisibility() {
  const orbitType = $('new-body-orbit').value;
  const isBinary  = orbitType === 'binary';
  $('new-body-partner-row').style.display = isBinary ? '' : 'none';

  if (isBinary) {
    const partnerSel = $('new-body-partner');
    partnerSel.innerHTML = '';
    bodies.forEach((b, i) => {
      if (b.orbitType !== 'binary') { // can't link to already-binary body
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = b.name;
        partnerSel.appendChild(opt);
      }
    });
  }
}

function autoOrbitRadius(parent) {
  const siblings = bodies.filter(b => b.parent === parent && b.orbitType !== 'centered');
  if (!siblings.length) return parent ? 3 : 8;
  return Math.max(...siblings.map(b => b.orbitRadius)) + 5;
}

$('new-body-type').addEventListener('change', () => {
  $('new-body-name').value = suggestName($('new-body-type').value);
  // Stars default to centered
  const isStar = $('new-body-type').value === 'star';
  if (isStar) $('new-body-orbit').value = 'centered';
  else if ($('new-body-orbit').value === 'centered') $('new-body-orbit').value = 'circular';
  updateAddFormOrbitVisibility();
});

$('new-body-orbit').addEventListener('change', updateAddFormOrbitVisibility);

$('add-body-btn').addEventListener('click', openAddForm);
$('cancel-add-body').addEventListener('click', closeAddForm);

$('confirm-add-body').addEventListener('click', () => {
  const name      = $('new-body-name').value.trim() || 'New Body';
  const type      = $('new-body-type').value;
  const orbitType = $('new-body-orbit').value;
  const parentVal = $('new-body-parent').value;
  const parent    = parentVal === 'none' ? null : bodies[parseInt(parentVal)];

  if (orbitType === 'binary') {
    const partnerEl = $('new-body-partner');
    if (!partnerEl.options.length) { alert('No valid binary partner available.'); return; }
    const host = bodies[parseInt(partnerEl.value)];

    // Create the guest body as centered first (linkBinary will detach it)
    const guest = createBody({ name, type, parent: host.parent, orbitType: 'centered' });
    linkBinary(host, guest, 4, 60);
    applyGlobeTheme(localStorage.getItem('itschu-theme') || 'dark');
    closeAddForm();
    selectBody(guest);
    return;
  }

  const orbitRadius = orbitType === 'centered' ? 0 : autoOrbitRadius(parent);
  const newBody = createBody({ name, type, parent, orbitType, orbitRadius, orbitPeriod: 120 });
  applyGlobeTheme(localStorage.getItem('itschu-theme') || 'dark');
  closeAddForm();
  selectBody(newBody);
});

// ── Panel population ──────────────────────────────────────────────────────────

function selectBody(b) {
  // Close edit form if switching to a different body
  if (editingBody && editingBody !== b) closeEditForm();
  selectedBody = b;
  renderBodyTree();
  if (b) populatePanel(b);
}

const ORBIT_HINTS = {
  centered:   'Body sits at parent center — no orbit.',
  circular:   'Constant-radius circular path.',
  elliptical: 'Stretched elliptical path around parent.',
  binary:     'Binary pair — sharing a common barycenter.',
};

function populatePanel(body) {
  // ── Size ──────────────────────────────────────────────────────────────────
  $('body-size-slider').value = body.size;
  $('body-size-num').value    = body.size;

  // ── Textures ───────────────────────────────────────────────────────────────
  if (body.dayTexName)   setUploadLoaded('upload-day-btn',   'clear-day-btn',   body.dayTexName);
  else                   resetUpload('upload-day-btn',   'clear-day-btn',   'Map Texture');
  if (body.nightTexName) setUploadLoaded('upload-night-btn', 'clear-night-btn', body.nightTexName);
  else                   resetUpload('upload-night-btn', 'clear-night-btn', 'Night Texture');
  $('night-threshold-row').style.display = body.nightTexName ? 'flex' : 'none';
  const nt = Math.round(body.globeMat.uniforms.nightThreshold.value * 100);
  $('night-threshold-slider').value = nt; $('night-threshold-num').value = nt;

  // ── Orbit ─────────────────────────────────────────────────────────────────
  const ot = body.orbitType;
  const orbitTypeEl = $('orbit-type');
  // Ensure 'binary' option exists in select
  if (!orbitTypeEl.querySelector('option[value="binary"]')) {
    const opt = document.createElement('option');
    opt.value = 'binary'; opt.textContent = 'Binary';
    orbitTypeEl.appendChild(opt);
  }
  orbitTypeEl.value    = ot;
  orbitTypeEl.disabled = (ot === 'binary');
  $('orbit-type-hint').textContent = ORBIT_HINTS[ot] ?? '';

  const showParams = (ot !== 'centered');
  $('orbit-params').style.display          = showParams ? '' : 'none';
  $('orbit-eccentricity-row').style.display = (ot === 'elliptical') ? '' : 'none';
  $('orbit-binary-params').style.display    = (ot === 'binary') ? '' : 'none';

  const refBody = (ot === 'binary' && !body.binaryIsHost) ? body.binaryPartner : body;
  if (showParams) {
    $('orbit-radius-slider').value      = refBody.orbitRadius;
    $('orbit-radius-num').value         = refBody.orbitRadius;
    $('orbit-period-slider').value      = refBody.orbitPeriod;
    $('orbit-period-num').value         = refBody.orbitPeriod;
    $('orbit-inclination-slider').value = refBody.orbitInclination;
    $('orbit-inclination-num').value    = refBody.orbitInclination;
  }
  if (ot === 'elliptical') {
    const ecc = Math.round(body.orbitEccentricity * 99);
    $('orbit-eccentricity-slider').value = ecc; $('orbit-eccentricity-num').value = ecc;
  }
  if (ot === 'binary') {
    $('orbit-binary-partner-name').textContent = body.binaryPartner?.name ?? '—';
    const h = body.binaryIsHost ? body : body.binaryPartner;
    $('orbit-binary-sep-slider').value    = h.binarySeparation;
    $('orbit-binary-sep-num').value       = h.binarySeparation;
    $('orbit-binary-period-slider').value = h.binaryPeriod;
    $('orbit-binary-period-num').value    = h.binaryPeriod;
    // Binary hosts can still have outer orbit params visible
    $('orbit-params').style.display = body.binaryIsHost ? '' : 'none';
  }

  // ── Rotation ───────────────────────────────────────────────────────────────
  const speedSec = Math.round((2 * Math.PI) / (body.rotateSpeed * 60));
  $('speed-slider').value    = speedSec; $('speed-num').value = speedSec;
  $('rotate-toggle').checked = body.autoRotate;
  const tiltMax = body.fullTiltRange ? 360 : 45;
  $('axial-tilt-slider').max     = tiltMax; $('axial-tilt-slider').value   = body.axialTilt;
  $('axial-tilt-num').value      = body.axialTilt;
  $('equator-tilt-slider').max   = tiltMax; $('equator-tilt-slider').value = body.equatorTilt;
  $('equator-tilt-num').value    = body.equatorTilt;
  $('tilt-lock').checked         = body.tiltLocked;
  $('tilt-fullrange').checked    = body.fullTiltRange;

  // ── Lighting ───────────────────────────────────────────────────────────────
  $('daynight-toggle').checked   = body.dayNightCycle;
  $('sun-options').style.display = body.dayNightCycle ? 'block' : 'none';
  const si = Math.round(body.globeMat.uniforms.sunIntensity.value * 50);
  $('sun-intensity-slider').value = si; $('sun-intensity-num').value = si;
  const sc = body.globeMat.uniforms.sunColor.value;
  $('sun-color').value = '#' + new THREE.Color(sc.x, sc.y, sc.z).getHexString();

  // ── Wireframe ─────────────────────────────────────────────────────────────
  $('wireframe-toggle').checked = body.wireframe.visible;
  $('wire-style').value         = body.wireStyle;
  $('wire-density').value       = body.wireDensity;
  $('wire-density-num').value   = body.wireDensity;

  // ── Experimental ──────────────────────────────────────────────────────────
  const amb = Math.round(body.globeMat.uniforms.ambientStr.value / 0.6 * 100);
  $('ambient-slider').value      = amb; $('ambient-num').value = amb;
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

new MutationObserver(() => applyGlobeTheme(localStorage.getItem('itschu-theme') || 'dark'))
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── Default body ──────────────────────────────────────────────────────────────

selectBody(createBody({ name: 'Planet 1', type: 'planet', orbitType: 'circular', orbitRadius: 5, orbitPeriod: 120 }));
applyGlobeTheme(localStorage.getItem('itschu-theme') || 'dark');

// ── Panel listeners ───────────────────────────────────────────────────────────

// ── Textures ──────────────────────────────────────────────────────────────────

$('upload-day-btn').addEventListener('click', () => $('day-tex-input').click());
$('day-tex-input').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const b = selectedBody;
  loadTex(URL.createObjectURL(file), tex => {
    b.globeMat.uniforms.dayTex.value?.dispose();
    b.globeMat.uniforms.dayTex.value    = tex;
    b.globeMat.uniforms.hasDayTex.value = true;
    b.mesh.visible = true; b.dayTexName = file.name;
    setUploadLoaded('upload-day-btn', 'clear-day-btn', file.name);
    b.wireframe.visible = false; $('wireframe-toggle').checked = false;
  });
  e.target.value = '';
});
$('clear-day-btn').addEventListener('click', () => {
  const b = selectedBody;
  b.globeMat.uniforms.dayTex.value?.dispose();
  b.globeMat.uniforms.dayTex.value    = null;
  b.globeMat.uniforms.hasDayTex.value = false;
  b.mesh.visible = false; b.dayTexName = null;
  resetUpload('upload-day-btn', 'clear-day-btn', 'Map Texture');
});

$('upload-night-btn').addEventListener('click', () => $('night-tex-input').click());
$('night-tex-input').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
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

$('upload-bg-btn').addEventListener('click', () => $('bg-tex-input').click());
$('bg-tex-input').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  loadTex(URL.createObjectURL(file), tex => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex; bgStars.visible = false; hasBgTex = true;
    setUploadLoaded('upload-bg-btn', 'clear-bg-btn', file.name);
  });
  e.target.value = '';
});
$('clear-bg-btn').addEventListener('click', () => {
  if (scene.background?.isTexture) scene.background.dispose();
  scene.background = new THREE.Color(0x000000);
  bgStars.visible = $('stars-toggle').checked; hasBgTex = false;
  resetUpload('upload-bg-btn', 'clear-bg-btn', 'Background');
});

// ── Body size ─────────────────────────────────────────────────────────────────

$('body-size-slider').addEventListener('input', e => {
  selectedBody.setSize(parseFloat(e.target.value));
  $('body-size-num').value = e.target.value;
});

// ── Orbit ─────────────────────────────────────────────────────────────────────

$('orbit-type').addEventListener('change', e => {
  const b = selectedBody, newType = e.target.value;
  b.orbitType = newType;
  $('orbit-type-hint').textContent = ORBIT_HINTS[newType] ?? '';

  if (newType === 'centered') {
    b.bodyGroup.position.set(0, 0, 0);
  } else if (newType === 'circular') {
    b.bodyGroup.position.x = b.orbitRadius;
    b.bodyGroup.position.z = 0;
    b.orbitGroup.rotation.y = 0;
  } else if (newType === 'elliptical') {
    b._orbitAngle = 0;
    b.orbitGroup.rotation.y = 0;
  }

  $('orbit-params').style.display           = (newType !== 'centered') ? '' : 'none';
  $('orbit-eccentricity-row').style.display  = (newType === 'elliptical') ? '' : 'none';
  $('orbit-binary-params').style.display     = 'none';
});

$('orbit-radius-slider').addEventListener('input', e => {
  const b = selectedBody;
  b.orbitRadius = parseFloat(e.target.value);
  $('orbit-radius-num').value = e.target.value;
  if (b.orbitType === 'circular') {
    b.bodyGroup.position.x = b.orbitRadius;
    b.bodyGroup.position.z = 0;
  }
  if (b.orbitType === 'binary' && b.binaryIsHost)
    b.bodyGroup.position.x = b.orbitRadius;
});

$('orbit-period-slider').addEventListener('input', e => {
  const b = selectedBody;
  b.orbitPeriod = parseFloat(e.target.value);
  b._syncOrbitSpeed();
  $('orbit-period-num').value = e.target.value;
});

$('orbit-inclination-slider').addEventListener('input', e => {
  const b = selectedBody;
  b.orbitInclination = parseFloat(e.target.value);
  b.orbitGroup.rotation.z = THREE.MathUtils.degToRad(b.orbitInclination);
  $('orbit-inclination-num').value = e.target.value;
});

$('orbit-eccentricity-slider').addEventListener('input', e => {
  selectedBody.orbitEccentricity = e.target.value / 99;
  $('orbit-eccentricity-num').value = e.target.value;
});

$('orbit-binary-sep-slider').addEventListener('input', e => {
  const b   = selectedBody;
  const sep = parseFloat(e.target.value);
  $('orbit-binary-sep-num').value = e.target.value;
  const host = b.binaryIsHost ? b : b.binaryPartner;
  host.binarySeparation = sep; host.binaryPartner.binarySeparation = sep;
  host._binaryOffset.position.x         = +sep / 2;
  host.binaryPartner._binaryOffset.position.x = -sep / 2;
});

$('orbit-binary-period-slider').addEventListener('input', e => {
  const b   = selectedBody;
  const per = parseFloat(e.target.value);
  $('orbit-binary-period-num').value = e.target.value;
  b.binaryPeriod = per; b.binaryPartner.binaryPeriod = per;
});

// ── Rotation ──────────────────────────────────────────────────────────────────

$('rotate-toggle').addEventListener('change', e => { selectedBody.autoRotate = e.target.checked; });

$('speed-slider').addEventListener('input', e => {
  selectedBody.rotateSpeed = (2 * Math.PI) / (e.target.value * 60);
  $('speed-num').value = e.target.value;
});

$('axial-tilt-slider').addEventListener('input', e => {
  const b = selectedBody, deg = parseFloat(e.target.value);
  b.axialTilt = deg; $('axial-tilt-num').value = deg;
  if (b.tiltLocked) { b.equatorTilt = deg; $('equator-tilt-slider').value = deg; $('equator-tilt-num').value = deg; }
  b.applyTilts();
});

$('equator-tilt-slider').addEventListener('input', e => {
  const b = selectedBody, deg = parseFloat(e.target.value);
  b.equatorTilt = deg; $('equator-tilt-num').value = deg;
  if (b.tiltLocked) { b.axialTilt = deg; $('axial-tilt-slider').value = deg; $('axial-tilt-num').value = deg; }
  b.applyTilts();
});

$('tilt-lock').addEventListener('change', e => {
  const b = selectedBody; b.tiltLocked = e.target.checked;
  if (b.tiltLocked) {
    b.equatorTilt = b.axialTilt;
    $('equator-tilt-slider').value = b.axialTilt; $('equator-tilt-num').value = b.axialTilt;
    b.applyTilts();
  }
});

$('tilt-fullrange').addEventListener('change', e => {
  const b = selectedBody; b.fullTiltRange = e.target.checked;
  const max = b.fullTiltRange ? 360 : 45;
  $('axial-tilt-slider').max = $('equator-tilt-slider').max = max;
  if (!b.fullTiltRange) {
    if (b.axialTilt   > 45) { b.axialTilt   = 45; $('axial-tilt-slider').value   = 45; $('axial-tilt-num').value   = 45; }
    if (b.equatorTilt > 45) { b.equatorTilt = 45; $('equator-tilt-slider').value = 45; $('equator-tilt-num').value = 45; }
    b.applyTilts();
  }
});

// ── Lighting ──────────────────────────────────────────────────────────────────

$('daynight-toggle').addEventListener('change', e => {
  const b = selectedBody; b.dayNightCycle = e.target.checked;
  b.globeMat.uniforms.flatLit.value = b.graticuleMat.uniforms.flatLit.value = !e.target.checked;
  $('sun-options').style.display = e.target.checked ? 'block' : 'none';
});

$('sun-intensity-slider').addEventListener('input', e => {
  selectedBody.globeMat.uniforms.sunIntensity.value = e.target.value / 50;
  $('sun-intensity-num').value = e.target.value;
});

$('sun-color').addEventListener('input', e => {
  const c = new THREE.Color(e.target.value);
  selectedBody.globeMat.uniforms.sunColor.value.set(c.r, c.g, c.b);
});

// ── Sun visual controls ────────────────────────────────────────────────────────

$('sun-visible-toggle').addEventListener('change', e => { sunGroup.visible = e.target.checked; });

$('sun-size-slider').addEventListener('input', e => {
  setSunSize(parseFloat(e.target.value));
  $('sun-size-num').value = e.target.value;
});

$('sun-vis-color').addEventListener('input', e => setSunColor(e.target.value));

// ── Wireframe ─────────────────────────────────────────────────────────────────

$('wireframe-toggle').addEventListener('change', e => { selectedBody.wireframe.visible = e.target.checked; });
$('wire-style').addEventListener('change', e => { selectedBody.wireStyle = e.target.value; selectedBody.rebuildWireframe(); });
$('wire-density').addEventListener('input', e => {
  selectedBody.wireDensity = parseInt(e.target.value);
  $('wire-density-num').value = e.target.value;
  selectedBody.rebuildWireframe();
});

// ── Experimental ──────────────────────────────────────────────────────────────

$('stars-toggle').addEventListener('change', e => { bgStars.visible = e.target.checked && !hasBgTex; });

$('star-count-slider').addEventListener('input', e => {
  $('star-count-num').value = e.target.value;
  rebuildStarField(parseInt(e.target.value));
});

$('star-size-slider').addEventListener('input', e => {
  starMat.uniforms.baseSize.value = parseFloat(e.target.value);
  $('star-size-num').value = e.target.value;
});

$('star-color').addEventListener('input', e => {
  starMat.uniforms.starColor.value.set(new THREE.Color(e.target.value));
});
$('atmosphere-toggle').addEventListener('change', e => {
  selectedBody.atmosphere.visible = selectedBody.rimGlow.visible = e.target.checked;
});
$('ambient-slider').addEventListener('input', e => {
  selectedBody.globeMat.uniforms.ambientStr.value = (e.target.value / 100) * 0.6;
  $('ambient-num').value = e.target.value;
});

// ── Export ────────────────────────────────────────────────────────────────────

$('screenshot-btn').addEventListener('click', () => {
  renderer.render(scene, camera);
  Object.assign(document.createElement('a'), { href: canvas.toDataURL('image/png'), download: 'system.png' }).click();
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
  $('gif-btn').disabled = true;
  $('gif-progress').style.display = 'block';

  const savedRotY    = bodies.map(b => b.spinGroup.rotation.y);
  const savedAutoRot = bodies.map(b => b.autoRotate);
  const savedDayNight= bodies.map(b => b.dayNightCycle);
  bodies.forEach(b => { b.autoRotate = false; b.dayNightCycle = false; });

  const offCanvas = Object.assign(document.createElement('canvas'), { width: gifSize, height: gifSize });
  const offCtx    = offCanvas.getContext('2d');
  const imageDataArr = [];

  for (let i = 0; i < frameCount; i++) {
    bodies.forEach((b, bi) => { b.spinGroup.rotation.y = savedRotY[bi] + (i / frameCount) * Math.PI * 2; });
    renderer.render(scene, camera);
    const side = Math.min(canvas.width, canvas.height);
    const sx = (canvas.width - side) / 2, sy = (canvas.height - side) / 2;
    offCtx.drawImage(canvas, sx, sy, side, side, 0, 0, gifSize, gifSize);
    imageDataArr.push(offCtx.getImageData(0, 0, gifSize, gifSize));
    $('gif-progress-bar').style.width  = ((i + 1) / frameCount * 40) + '%';
    $('gif-progress-text').textContent = `Capturing ${i + 1} / ${frameCount}…`;
    await new Promise(r => setTimeout(r, 0));
  }

  $('gif-progress-text').textContent = 'Building palette…';
  await new Promise(r => setTimeout(r, 0));

  const totalPx = gifSize * gifSize, composite = new Uint8ClampedArray(totalPx * 4);
  for (let p = 0; p < totalPx; p++) {
    const src = imageDataArr[p % imageDataArr.length].data, base = p * 4;
    composite[base] = src[base]; composite[base+1] = src[base+1];
    composite[base+2] = src[base+2]; composite[base+3] = src[base+3];
  }
  offCtx.putImageData(new ImageData(composite, gifSize, gifSize), 0, 0);

  $('gif-progress-bar').style.width  = '42%';
  $('gif-progress-text').textContent = 'Quantising palette…';
  await new Promise(r => setTimeout(r, 0));

  const globalPalette = await new Promise(resolve => {
    const pg = new GIF({ workers:1, quality:1, width:gifSize, height:gifSize, workerScript:'vendor/gif.worker.js', globalPalette:true });
    pg.addFrame(offCanvas, { delay:1, copy:true });
    pg.on('finished', () => resolve(pg.options.globalPalette));
    pg.render();
  });

  $('gif-progress-bar').style.width = '50%';

  const gif = new GIF({ workers:4, quality:1, width:gifSize, height:gifSize, workerScript:'vendor/gif.worker.js', globalPalette });
  for (let i = 0; i < imageDataArr.length; i++) {
    offCtx.putImageData(imageDataArr[i], 0, 0);
    gif.addFrame(offCanvas, { delay, copy:true });
    $('gif-progress-bar').style.width  = (50 + (i+1) / frameCount * 5) + '%';
    $('gif-progress-text').textContent = `Queuing ${i+1} / ${frameCount}…`;
    await new Promise(r => setTimeout(r, 0));
  }

  gif.on('progress', p => { $('gif-progress-bar').style.width = (50 + p*50) + '%'; $('gif-progress-text').textContent = 'Encoding…'; });
  gif.on('finished', blob => {
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'system.gif' }).click();
    bodies.forEach((b, bi) => { b.spinGroup.rotation.y = savedRotY[bi]; b.autoRotate = savedAutoRot[bi]; b.dayNightCycle = savedDayNight[bi]; });
    isCapturingGif = false; $('gif-btn').disabled = false;
    $('gif-progress').style.display = 'none'; $('gif-progress-bar').style.width = '0%';
  });
  gif.render();
}

// ── Section collapse ──────────────────────────────────────────────────────────

document.querySelectorAll('.collapsible-header').forEach(h => {
  h.addEventListener('click', () => { h.classList.toggle('open'); h.nextElementSibling.classList.toggle('open'); });
});

// ── Panel toggle ──────────────────────────────────────────────────────────────

$('panel-toggle').addEventListener('click', () => { $('panel').classList.toggle('collapsed'); setTimeout(onResize, 300); });

// ── Resize ────────────────────────────────────────────────────────────────────

function onResize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', onResize);
new ResizeObserver(onResize).observe(canvas);
onResize();

// ── Slider ↔ number-input wiring ──────────────────────────────────────────────

function wireSliderNum(sliderId, numId) {
  const s = $(sliderId), n = $(numId);
  n.addEventListener('change', () => {
    const c = Math.min(Math.max(+n.value || 0, +s.min), +s.max);
    n.value = c; s.value = c; s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  new MutationObserver(() => { n.disabled = s.disabled; }).observe(s, { attributes: true, attributeFilter: ['disabled'] });
}

wireSliderNum('body-size-slider',          'body-size-num');
wireSliderNum('speed-slider',              'speed-num');
wireSliderNum('axial-tilt-slider',         'axial-tilt-num');
wireSliderNum('equator-tilt-slider',       'equator-tilt-num');
wireSliderNum('sun-intensity-slider',      'sun-intensity-num');
wireSliderNum('ambient-slider',            'ambient-num');
wireSliderNum('gif-duration-slider',       'gif-duration-num');
wireSliderNum('gif-fps-slider',            'gif-fps-num');
wireSliderNum('gif-size-slider',           'gif-size-num');
wireSliderNum('wire-density',              'wire-density-num');
wireSliderNum('night-threshold-slider',    'night-threshold-num');
wireSliderNum('orbit-radius-slider',       'orbit-radius-num');
wireSliderNum('orbit-period-slider',       'orbit-period-num');
wireSliderNum('orbit-inclination-slider',  'orbit-inclination-num');
wireSliderNum('orbit-eccentricity-slider', 'orbit-eccentricity-num');
wireSliderNum('orbit-binary-sep-slider',   'orbit-binary-sep-num');
wireSliderNum('orbit-binary-period-slider','orbit-binary-period-num');
wireSliderNum('sun-size-slider',           'sun-size-num');
wireSliderNum('star-count-slider',         'star-count-num');
wireSliderNum('star-size-slider',          'star-size-num');

// ── Render loop ───────────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  if (isCapturingGif) return;
  const dt = clock.getDelta();
  for (const b of bodies) {
    // Compute physically correct sun direction from this body's world position
    // toward the sun at origin (0,0,0). Only needed when day/night is active.
    if (!b.globeMat.uniforms.flatLit.value) {
      b.bodyGroup.getWorldPosition(_sunDirTmp);
      _sunDirTmp.negate().normalize(); // direction: body → sun at origin
      b.globeMat.uniforms.sunDir.value.copy(_sunDirTmp);
      b.graticuleMat.uniforms.sunDir.value.copy(_sunDirTmp);
    }
    b.update(dt);
  }
  controls.update();
  renderer.render(scene, camera);
}

animate();
