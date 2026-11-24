// Office people for GlitchPlay HQ: realistic adult proportions (head ≈ 1/7.5 of height), jointed limbs (shoulder/elbow,
// hip/knee), per-agent hair, skin tone and office clothing that carries the agent's accent colour. Each character runs a
// small "plan" (walk → sit → pose …) handed out by hq.js. Animation: natural walk cycle with knee bend and arm swing,
// sitting on desk chairs / sofa, typing, phone, coffee, stretching, talking and an error "hands on head" pose.
// Perf: every body part is one vertex-coloured mesh sharing a single material; contact + sun shadows of all characters
// are one instanced draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCup, makeReel, makePaper, makePhone, makeHeadphones, makeTablet } from './furniture.js';

export const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

const BODY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0 });
const ERR_MAT = new THREE.MeshBasicMaterial({ color: '#ff3b47', toneMapped: false });
const WHITE_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
const RING_BG_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });

const GEO = {
  ringBg: new THREE.RingGeometry(0.15, 0.2, 32),
  bang: new THREE.CapsuleGeometry(0.045, 0.17, 3, 8),
  dot: new THREE.SphereGeometry(0.05, 10, 8),
  errDisc: new THREE.RingGeometry(0.28, 0.38, 24),
  bubble: new THREE.CircleGeometry(0.23, 18),
  bubbleRim: new THREE.RingGeometry(0.23, 0.27, 18),
};

// ---------------------------------------------------------------- body dimensions (metres, standing, feet at y=0)
const HIP_Y = 0.9; // hip joint height (thigh 0.44 + shin/foot 0.46)
const SEAT_HIP = 0.535; // hip joint height when seated on a ~0.46 m seat
const SIT_THIGH = 1.4; // thigh pitch when seated (slightly below horizontal so the feet reach the floor)

// ---------------------------------------------------------------- vertex-coloured part geometry
const C = (c) => new THREE.Color(c);
function part(geo, color, m) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (m) g.applyMatrix4(m);
  const p = g.attributes.position;
  const n = p.count;
  const arr = new Float32Array(n * 3);
  const fixed = typeof color === 'function' ? null : C(color);
  for (let i = 0; i < n; i++) {
    const c = fixed || color(p.getX(i), p.getY(i), p.getZ(i));
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const partCache = new Map();
function cached(key, build) {
  if (!partCache.has(key)) partCache.set(key, build());
  return partCache.get(key);
}

/** accent → believable fabric dye (slightly less saturated / bright than a UI colour) */
const _hsl = { h: 0, s: 0, l: 0 };
function fabric(hex) {
  const c = C(hex);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  c.setHSL(_hsl.h, _hsl.s * 0.78, Math.min(0.6, _hsl.l * 0.9), THREE.SRGBColorSpace);
  return `#${c.getHexString(THREE.SRGBColorSpace)}`;
}

// ---------------------------------------------------------------- cast (Indonesian content team)
const SKIN = { light: '#eccba9', fair: '#dfb18a', tan: '#c99068', brown: '#a87250', deep: '#86583b' };
const SHORT_SLEEVE = new Set(['tee', 'polo']);
const CAST = {
  bos: { sex: 'm', skin: 'tan', hair: 'side', grey: true, glasses: true, top: 'blazer', topC: '#2b2f39', inner: 'accent', bottom: 'trousers', bottomC: '#26282d', shoes: '#2b1b12', scale: 1.02 },
  radar: { sex: 'm', skin: 'fair', hair: 'short', top: 'hoodie', topC: 'accent', bottom: 'jeans', bottomC: '#34465f', shoes: '#ecebe7', scale: 0.99 },
  detektif: { sex: 'f', skin: 'light', hair: 'hijab', hijabC: '#3a3346', glasses: true, top: 'tunic', topC: 'accent', bottom: 'trousers', bottomC: '#2c2e35', shoes: '#1d1d1f', scale: 0.94 },
  strategist: { sex: 'm', skin: 'brown', hair: 'short', cap: '#23262c', top: 'polo', topC: 'accent', bottom: 'chinos', bottomC: '#b7a27f', shoes: '#3b2a20', scale: 1.0 },
  narator: { sex: 'f', skin: 'fair', hair: 'long', top: 'blouse', topC: 'accent', bottom: 'skirt', bottomC: '#2b2d36', shoes: '#1a1a1a', scale: 0.95 },
  copywriter: { sex: 'f', skin: 'tan', hair: 'bun', hairC: '#2b1d15', top: 'shirt', topC: 'accent', bottom: 'trousers', bottomC: '#e3dccd', shoes: '#c9b9a3', scale: 0.93 },
  qc: { sex: 'm', skin: 'deep', hair: 'short', top: 'shirt', rolled: true, topC: 'accent', bottom: 'trousers', bottomC: '#30323a', shoes: '#1c1c1e', scale: 1.0 },
  studio: { sex: 'm', skin: 'tan', hair: 'curly', headphones: true, top: 'tee', topC: 'accent', bottom: 'cargo', bottomC: '#4b5141', shoes: '#f0efea', scale: 0.98 },
  asisten: { sex: 'f', skin: 'brown', hair: 'hijab', hijabC: '#cdb99d', top: 'cardigan', topC: 'accent', inner: '#f3f1ec', bottom: 'trousers', bottomC: '#2a2c33', shoes: '#3a2a22', scale: 0.94 },
};
const FALLBACK_TOPS = ['shirt', 'polo', 'tee', 'hoodie'];
const FALLBACK_HAIR = ['short', 'side', 'curly'];

function castFor(id, accent, seed) {
  const base = CAST[id] || {
    sex: 'm', skin: Object.keys(SKIN)[seed % 5], hair: FALLBACK_HAIR[seed % 3], top: FALLBACK_TOPS[(seed >> 2) % 4], topC: 'accent',
    bottom: 'trousers', bottomC: '#2e3038', shoes: '#1d1d1f', scale: 1,
  };
  const acc = fabric(accent);
  const sp = { ...base };
  sp.skinC = SKIN[sp.skin] || sp.skin;
  sp.hairC = sp.hairC || '#1b1512';
  sp.topC = sp.topC === 'accent' ? acc : sp.topC;
  sp.innerC = sp.inner === 'accent' ? acc : sp.inner || '#f2f0ea';
  sp.accent = acc;
  return sp;
}

// ---------------------------------------------------------------- body part geometry
// torso profile [radius, y] from the hip joint (y=0) up to the base of the neck
const M_PROF = [[0.001, -0.07], [0.11, -0.065], [0.158, -0.02], [0.165, 0.05], [0.152, 0.15], [0.148, 0.22], [0.163, 0.3], [0.178, 0.38], [0.18, 0.43], [0.16, 0.47], [0.11, 0.5], [0.055, 0.52], [0.001, 0.525]];
const F_PROF = [[0.001, -0.07], [0.11, -0.065], [0.165, -0.015], [0.17, 0.05], [0.148, 0.14], [0.128, 0.22], [0.145, 0.3], [0.158, 0.36], [0.158, 0.42], [0.142, 0.46], [0.1, 0.49], [0.05, 0.51], [0.001, 0.515]];

function torsoGeo(sp) {
  return cached(`t${sp.sex}${sp.top}${sp.topC}${sp.bottom}${sp.bottomC}${sp.innerC}`, () => {
    const f = sp.sex === 'f';
    const lathe = new THREE.LatheGeometry((f ? F_PROF : M_PROF).map(([r, y]) => new THREE.Vector2(r, y)), 20);
    const top = C(sp.topC);
    const bottom = C(sp.bottomC);
    const inner = C(sp.innerC);
    const belt = C('#2b2119');
    const shade = top.clone().multiplyScalar(0.72);
    const tunic = sp.top === 'tunic';
    const parts = [part(lathe, (x, y, z) => {
      if (!tunic && y < 0.045) return bottom;
      if (!tunic && sp.bottom !== 'skirt' && y < 0.068) return belt;
      if (sp.top === 'blazer' && z > 0 && y > 0.16 && Math.abs(x) < (y - 0.16) * 0.5) return inner;
      if (sp.top === 'cardigan' && z > 0 && Math.abs(x) < 0.05 && y > 0.07) return inner;
      if (sp.top === 'hoodie' && z > 0.04 && y > 0.09 && y < 0.24 && Math.abs(x) < 0.11) return shade;
      return top;
    }, M(0, 0, 0, 0, 0, 0, 1, 1, f ? 0.66 : 0.62))];
    if (sp.top === 'polo' || sp.top === 'shirt' || sp.top === 'blazer') {
      parts.push(part(new THREE.TorusGeometry(0.058, 0.014, 5, 16), sp.top === 'blazer' ? inner : top, M(0, 0.5, 0.004, Math.PI / 2 - 0.25)));
    }
    if (sp.top === 'blazer') {
      // lapels: two darker flaps along the opening
      for (const sx of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.035, 0.2, 0.012), shade, M(sx * 0.06, 0.36, 0.1, -0.12, 0, sx * 0.32)));
    }
    if (sp.top === 'hoodie') parts.push(part(new THREE.TorusGeometry(0.075, 0.034, 6, 16), shade, M(0, 0.49, -0.035, Math.PI / 2 + 0.45, 0, 0, 1, 1, 0.8)));
    if (tunic) parts.push(part(new THREE.CylinderGeometry(0.168, 0.195, 0.17, 20, 1, true), top, M(0, -0.05, 0, 0, 0, 0, 1, 1, 0.68)));
    return mergeGeometries(parts);
  });
}

function headGeo(sp) {
  return cached(`h${sp.skinC}${sp.hair}${sp.hairC}${sp.hijabC}${sp.cap}${sp.glasses}${sp.grey}${sp.headphones}${sp.accent}`, () => {
    const skin = C(sp.skinC);
    const hair = C(sp.hairC);
    const dark = C('#17120f');
    const lip = skin.clone().lerp(C('#7d3a35'), 0.4);
    const hij = sp.hair === 'hijab';
    const hijab = hij ? C(sp.hijabC) : null;
    const parts = [
      part(new THREE.CylinderGeometry(0.05, 0.056, 0.12, 10), hij ? hijab : skin, M(0, 0.05, -0.006)),
      part(new THREE.SphereGeometry(1, 18, 14), skin, M(0, 0.2, 0, 0, 0, 0, 0.079, 0.112, 0.098)),
      part(new THREE.SphereGeometry(1, 14, 10), skin, M(0, 0.15, 0.018, 0, 0, 0, 0.062, 0.07, 0.074)),
      part(new THREE.ConeGeometry(0.013, 0.038, 6), skin, M(0, 0.186, 0.099, Math.PI / 2 + 0.25)),
      part(new THREE.BoxGeometry(0.026, 0.006, 0.008), lip, M(0, 0.142, 0.089)),
    ];
    for (const sx of [-1, 1]) {
      parts.push(part(new THREE.SphereGeometry(0.011, 8, 6), dark, M(sx * 0.031, 0.212, 0.089, 0, 0, 0, 1, 0.8, 0.5)));
      parts.push(part(new THREE.BoxGeometry(0.03, 0.007, 0.01), hair, M(sx * 0.032, 0.232, 0.086, 0, 0, sx * -0.12)));
      if (!hij) parts.push(part(new THREE.SphereGeometry(0.02, 8, 6), skin, M(sx * 0.078, 0.195, -0.006, 0, 0, 0, 0.45, 1, 0.75)));
    }
    const cap = (s = 1) => part(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hair, M(0, 0.206, -0.006, -0.32, 0, 0, 0.085 * s, 0.12 * s, 0.104 * s));
    if (hij) {
      parts.push(part(new THREE.SphereGeometry(1, 18, 12), hijab, M(0, 0.205, -0.024, 0, 0, 0, 0.094, 0.13, 0.11)));
      parts.push(part(new THREE.CylinderGeometry(0.078, 0.2, 0.21, 20), hijab, M(0, 0.03, -0.012, 0, 0, 0, 1, 1, 0.72)));
    } else {
      parts.push(cap(sp.hair === 'curly' ? 1.08 : 1));
      parts.push(part(new THREE.SphereGeometry(1, 14, 10), hair, M(0, 0.168, -0.036, 0, 0, 0, 0.081, 0.08, 0.088)));
      if (sp.hair === 'side') parts.push(part(new THREE.SphereGeometry(1, 12, 8), hair, M(0.012, 0.295, 0.012, 0, 0, 0.1, 0.074, 0.032, 0.088)));
      if (sp.grey) for (const sx of [-1, 1]) parts.push(part(new THREE.SphereGeometry(1, 8, 6), C('#8e8780'), M(sx * 0.074, 0.205, -0.012, 0, 0, 0, 0.016, 0.04, 0.05)));
      if (sp.hair === 'long') {
        parts.push(part(new THREE.SphereGeometry(1, 14, 12), hair, M(0, 0.11, -0.062, 0.08, 0, 0, 0.09, 0.18, 0.055)));
        for (const sx of [-1, 1]) parts.push(part(new THREE.SphereGeometry(1, 10, 8), hair, M(sx * 0.074, 0.14, 0.012, 0, 0, 0, 0.022, 0.115, 0.04)));
      }
      if (sp.hair === 'bun') parts.push(part(new THREE.SphereGeometry(0.046, 12, 9), hair, M(0, 0.29, -0.078)));
      if (sp.hair === 'curly') {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          parts.push(part(new THREE.IcosahedronGeometry(0.034, 0), hair, M(Math.cos(a) * 0.055, 0.285 + Math.sin(i * 2.1) * 0.012, Math.sin(a) * 0.06 - 0.01)));
        }
      }
    }
    if (sp.cap) {
      const capC = C(sp.cap);
      parts.push(part(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capC, M(0, 0.232, -0.004, 0, 0, 0, 0.089, 0.075, 0.106)));
      parts.push(part(new THREE.CylinderGeometry(0.074, 0.074, 0.008, 16), capC, M(0, 0.238, 0.088, 0.14, 0, 0, 1, 1, 1.1)));
      parts.push(part(new THREE.SphereGeometry(0.008, 6, 4), C(sp.accent), M(0, 0.307, -0.004)));
    }
    if (sp.glasses) {
      const fr = C('#141414');
      for (const sx of [-1, 1]) {
        parts.push(part(new THREE.TorusGeometry(0.017, 0.0032, 4, 12), fr, M(sx * 0.031, 0.213, 0.096, 0, sx * 0.12, 0)));
        parts.push(part(new THREE.BoxGeometry(0.003, 0.003, 0.09), fr, M(sx * 0.075, 0.215, 0.05)));
      }
      parts.push(part(new THREE.BoxGeometry(0.026, 0.003, 0.003), fr, M(0, 0.215, 0.099)));
    }
    if (sp.headphones) {
      const hp = C('#1d1e21');
      parts.push(part(new THREE.TorusGeometry(0.1, 0.009, 5, 18, Math.PI), hp, M(0, 0.2, -0.008)));
      for (const sx of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12), sx > 0 ? C(sp.accent) : hp, M(sx * 0.094, 0.198, -0.008, 0, 0, Math.PI / 2)));
    }
    return mergeGeometries(parts);
  });
}

function upperArmGeo(sp) {
  return cached(`ua${sp.top}${sp.topC}${sp.skinC}${sp.sex}`, () => {
    const sleeve = C(sp.topC);
    const skin = C(sp.skinC);
    const short = SHORT_SLEEVE.has(sp.top);
    const r = sp.sex === 'f' ? 0.041 : 0.046;
    return mergeGeometries([
      part(new THREE.CapsuleGeometry(r, 0.2, 4, 10), (x, y) => (short && y < -0.12 ? skin : sleeve), M(0, -0.13, 0)),
      part(new THREE.SphereGeometry(r + 0.012, 10, 8), sleeve, M(0, -0.01, 0)),
    ]);
  });
}

function forearmGeo(sp) {
  return cached(`fa${sp.top}${sp.topC}${sp.skinC}${sp.rolled}${sp.innerC}${sp.sex}`, () => {
    const sleeve = C(sp.topC);
    const skin = C(sp.skinC);
    const cuff = C(sp.innerC);
    const short = SHORT_SLEEVE.has(sp.top);
    const r = sp.sex === 'f' ? 0.035 : 0.04;
    const col = (x, y) => {
      if (y < -0.238 || short) return skin;
      if (sp.rolled && y < -0.075) return skin;
      if (sp.top === 'blazer' && y < -0.205) return cuff;
      return sleeve;
    };
    return mergeGeometries([
      part(new THREE.SphereGeometry(r, 10, 8), col, M(0, 0, 0)),
      part(new THREE.CylinderGeometry(r, r * 0.8, 0.24, 10), col, M(0, -0.12, 0)),
      part(new THREE.SphereGeometry(1, 10, 8), skin, M(0, -0.29, 0.006, 0, 0, 0, 0.018, 0.052, 0.038)),
    ]);
  });
}

function thighGeo(sp) {
  return cached(`th${sp.bottom}${sp.bottomC}${sp.top}${sp.topC}${sp.sex}`, () => {
    const skirt = sp.bottom === 'skirt';
    const r = skirt ? 0.086 : sp.sex === 'f' ? 0.07 : 0.073;
    const bottom = C(sp.bottomC);
    const top = C(sp.topC);
    return part(new THREE.CapsuleGeometry(r, 0.3, 4, 10), (x, y) => (sp.top === 'tunic' && y > -0.24 ? top : bottom), M(0, -0.21, 0));
  });
}

function shinGeo(sp) {
  return cached(`sh${sp.bottom}${sp.bottomC}${sp.skinC}${sp.shoes}`, () => {
    const skirt = sp.bottom === 'skirt';
    const bottom = C(sp.bottomC);
    const skin = C(sp.skinC);
    const sock = C('#232326');
    return mergeGeometries([
      part(new THREE.CapsuleGeometry(skirt ? 0.047 : 0.053, 0.3, 4, 10), (x, y) => {
        if (skirt) return y > -0.14 ? bottom : skin;
        return y < -0.37 ? sock : bottom;
      }, M(0, -0.19, 0)),
      part(new RoundedBoxGeometry(skirt ? 0.08 : 0.095, 0.072, skirt ? 0.235 : 0.26, 2, 0.028), C(sp.shoes), M(0, -0.426, 0.045)),
    ]);
  });
}

// ---------------------------------------------------------------- contact + sun shadows (one instanced draw)
const BLOB_MAX = 96;
/** soft blob under each character + a faint elongated "sun shadow" cast along `sunDir` (horizontal, normalized) */
export function createBlobShadows(scene, sunDir = null) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const strength = new THREE.InstancedBufferAttribute(new Float32Array(BLOB_MAX), 1);
  strength.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aStrength', strength);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color('#231a14') } },
    vertexShader: `attribute float aStrength; varying vec2 vUv; varying float vS;
      void main() { vUv = uv; vS = aStrength; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; varying vec2 vUv; varying float vS;
      void main() { float d = length(vUv - 0.5) * 2.0; float a = 1.0 - smoothstep(0.1, 1.0, d); gl_FragColor = vec4(uColor, a * a * vS); }`,
  });
  const mesh = new THREE.InstancedMesh(geo, material, BLOB_MAX);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const qs = new THREE.Quaternion();
  if (sunDir) qs.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(sunDir.x, sunDir.z));
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  return {
    update(chars) {
      let i = 0;
      for (const ch of chars) {
        if (i >= BLOB_MAX - 1) break;
        const f = Math.max(0, ch.fade);
        const s = ch.sit;
        const px = ch.group.position.x;
        const pz = ch.group.position.z;
        pos.set(px, 0.014, pz);
        const r = (0.62 + s * 0.12) * (0.6 + 0.4 * f);
        sc.set(r, 1, r);
        m4.compose(pos, q0, sc);
        mesh.setMatrixAt(i, m4);
        strength.array[i] = 0.42 * f * (1 - s * 0.3);
        i += 1;
        if (sunDir) {
          const len = (2.1 - s * 0.9) * f;
          pos.set(px + sunDir.x * len * 0.46, 0.012, pz + sunDir.z * len * 0.46);
          sc.set(0.42, 1, Math.max(0.001, len));
          m4.compose(pos, qs, sc);
          mesh.setMatrixAt(i, m4);
          strength.array[i] = 0.2 * f * (1 - s * 0.4);
          i += 1;
        }
      }
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
      strength.needsUpdate = true;
    },
  };
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** small seeded PRNG so every character behaves differently but deterministically per session */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const angleDiff = (a, b) => Math.abs(((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

const SPEED = { stroll: 0.8, walk: 1.2, hurry: 2.4 };
const SEATED_POSES = new Set(['type', 'idleSeat', 'frustrated', 'phone', 'talk', 'listen', 'drink']);

export class Character {
  /**
   * @param {object} opts
   * @param {object} opts.agent normalised agent {id, name, role, status}
   * @param {string} opts.color accent colour
   * @param {object} opts.room {id, desks: [desk], wander: {minX,maxX,minZ,maxZ}}
   * @param {number} opts.slot desk index
   * @param {object} opts.nav {isFree(x,z), path(from,to)}
   */
  constructor({ agent, color, room, slot, nav }) {
    this.id = agent.id;
    this.name = agent.name;
    this.role = agent.role || '';
    this.division = room.id;
    this.room = room;
    this.slot = slot;
    this.desk = room.desks[slot % room.desks.length];
    this.color = color;
    this.nav = nav;
    this.status = 'idle';
    this.task = '';
    this.progress = 0;
    this.seed = hash(agent.id + agent.name);
    this.rand = rng(this.seed ^ (Date.now() & 0xffff));

    // physical state
    this.sit = 0;
    this.walking = false;
    this.speedKind = 'walk';
    this.walkPhase = this.rand() * 10;
    this.walkAmp = 0;
    this.heading = this.rand() * Math.PI * 2;
    this.pose = 'stand';
    this.deskMode = 'idle';
    this.fade = 1;
    this.fadeTarget = 1;
    this.lift = 0;

    // plan
    this.plan = null;
    this.planKey = '';
    this.planLabel = '';
    this.stepIdx = 0;
    this.step = null;
    this.onPlanDone = null;
    this.activity = 'Santai';

    // speech bubble (DOM handled by hq.js)
    this.bubble = { text: '', tone: '', until: 0, ver: 0 };

    const g = new THREE.Group();
    this.group = g;
    g.userData.agentId = agent.id;
    const sp = castFor(room.id, color, this.seed);
    this.spec = sp;
    this.bodyScale = sp.scale || 1;

    const pivot = new THREE.Group();
    pivot.scale.setScalar(this.bodyScale);
    g.add(pivot);
    this.pivot = pivot;
    const mesh = (geo) => {
      const m = new THREE.Mesh(geo, BODY_MAT);
      m.receiveShadow = true;
      return m;
    };

    const hipX = sp.sex === 'f' ? 0.088 : 0.092;
    this.legs = [-hipX, hipX].map((x) => {
      const hip = new THREE.Group();
      hip.position.set(x, HIP_Y, 0);
      hip.add(mesh(thighGeo(sp)));
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      knee.add(mesh(shinGeo(sp)));
      hip.add(knee);
      pivot.add(hip);
      return { hip, knee };
    });
    const torso = new THREE.Group();
    torso.position.y = HIP_Y;
    this.torsoMesh = mesh(torsoGeo(sp));
    torso.add(this.torsoMesh);
    pivot.add(torso);
    this.torso = torso;

    const head = new THREE.Group();
    head.position.y = sp.sex === 'f' ? 0.512 : 0.522;
    head.add(mesh(headGeo(sp)));
    torso.add(head);
    this.head = head;

    const shX = sp.sex === 'f' ? 0.178 : 0.198;
    const shY = sp.sex === 'f' ? 0.445 : 0.455;
    this.arms = [-shX, shX].map((x) => {
      const sh = new THREE.Group();
      sh.position.set(x, shY, 0);
      sh.add(mesh(upperArmGeo(sp)));
      const el = new THREE.Group();
      el.position.y = -0.285;
      el.add(mesh(forearmGeo(sp)));
      sh.add(el);
      torso.add(sh);
      return { sh, el };
    });
    // joint state for smooth pose blending
    this.j = { aLx: 0, aRx: 0, aLz: -0.07, aRz: 0.07, eL: -0.15, eR: -0.15, hx: 0, hy: 0, lean: 0 };
    this.T = { ...this.j };

    // props: right-hand slot, two-hand carry slot
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.3, 0.02);
    this.arms[1].el.add(this.hand);
    this.carrySlot = new THREE.Group();
    this.carrySlot.position.set(0, 0.28, 0.22);
    torso.add(this.carrySlot);
    this.props = {};
    this.propNow = null;
    this.headphones = null;

    // ---- overlays: progress ring, error marker
    const hud = new THREE.Group();
    hud.position.y = 2.0;
    g.add(hud);
    this.hud = hud;
    hud.add(new THREE.Mesh(GEO.ringBg, RING_BG_MAT));
    this.ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 32, 1, Math.PI / 2, -0.001), this.ringMat);
    this.ring.position.z = 0.002;
    hud.add(this.ring);
    this.ringShown = 0;
    this.ringProgress = -1;
    hud.scale.setScalar(0.001);
    hud.visible = false;

    const err = new THREE.Group();
    const bang = new THREE.Mesh(GEO.bang, ERR_MAT);
    bang.position.y = 0.1;
    const dot = new THREE.Mesh(GEO.dot, ERR_MAT);
    dot.position.y = -0.11;
    const bubble = new THREE.Mesh(GEO.bubble, WHITE_MAT);
    bubble.position.z = -0.06;
    const rim = new THREE.Mesh(GEO.bubbleRim, ERR_MAT);
    rim.position.z = -0.055;
    err.add(bubble, rim, bang, dot);
    err.visible = false;
    g.add(err);
    this.err = err;
    const errDisc = new THREE.Mesh(GEO.errDisc, new THREE.MeshBasicMaterial({ color: '#ff3b47', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
    errDisc.rotation.x = -Math.PI / 2;
    errDisc.position.y = 0.02;
    errDisc.visible = false;
    g.add(errDisc);
    this.errDisc = errDisc;

    this.applyAgent(agent);
  }

  get busy() {
    return this.status === 'working' || this.status === 'reviewing';
  }

  get seatedAtDesk() {
    return this.sit > 0.85 && this.group.position.distanceToSquared(this.desk.seatWorld) < 0.05;
  }

  applyAgent(agent) {
    this.name = agent.name || this.name;
    this.role = agent.role || this.role;
    this.status = agent.status || 'idle';
    this.task = agent.currentTask || '';
    this.progress = agent.progress ?? 0;
  }

  /** start somewhere sensible: at the desk when busy, otherwise somewhere in the lounge */
  placeInitial() {
    if (this.busy) {
      this.group.position.copy(this.desk.seatWorld);
      this.heading = Math.PI;
      this.sit = 1;
    } else {
      this.group.position.copy(this.randomSpot());
    }
    this.group.rotation.y = this.heading;
  }

  randomSpot() {
    const b = this.room.wander;
    for (let i = 0; i < 12; i++) {
      const p = new THREE.Vector3(b.minX + this.rand() * (b.maxX - b.minX), 0, b.minZ + this.rand() * (b.maxZ - b.minZ));
      if (this.nav.isFree(p.x, p.z)) return p;
    }
    return new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  }

  say(text, dur = 5, tone = '') {
    this.bubble.text = text;
    this.bubble.tone = tone;
    this.bubble.until = performance.now() + dur * 1000;
    this.bubble.ver += 1;
  }

  // ------------------------------------------------------------- props
  setProp(name) {
    if (this.propNow === name) return;
    if (this.propNow) this.props[this.propNow].visible = false;
    this.propNow = name || null;
    if (!name) return;
    if (!this.props[name]) {
      const make = { cup: () => makeCup(this.rand() < 0.5 ? '#f3f1ec' : this.spec.accent), reel: () => makeReel(), paper: () => makePaper(), phone: () => makePhone(), tablet: () => makeTablet() }[name];
      const obj = make();
      if (name === 'reel' || name === 'paper' || name === 'tablet') {
        obj.rotation.x = name === 'tablet' ? -0.75 : 0.2;
        this.carrySlot.add(obj);
      } else {
        // hand frame: forearm points along -y, +z is "up" when the forearm is raised
        obj.rotation.x = name === 'phone' ? -0.5 : Math.PI / 2;
        if (name === 'cup') obj.position.set(0, -0.01, -0.04);
        this.hand.add(obj);
      }
      this.props[name] = obj;
    }
    this.props[name].visible = true;
  }

  setHeadphones(on) {
    if (on && !this.headphones) {
      this.headphones = makeHeadphones(this.spec.accent);
      this.headphones.position.y = 0.2;
      this.head.add(this.headphones);
    }
    if (this.headphones) this.headphones.visible = on;
  }

  // ------------------------------------------------------------- plan execution
  /** replace the current plan. steps: [{type:'walk'|'sit'|'face'|'pose'|'do'|'say', ...}] */
  setPlan(key, steps, label = '') {
    this.plan = steps;
    this.planKey = key;
    this.planLabel = label;
    if (label) this.activity = label;
    this.stepIdx = -1;
    this.nextStep();
  }

  nextStep() {
    this.stepIdx += 1;
    const st = this.plan?.[this.stepIdx];
    if (!st) {
      this.step = null;
      this.plan = null;
      this.onPlanDone?.(this);
      return;
    }
    this.step = { ...st, t: 0, stage: 0 };
    if (st.type === 'do') {
      st.fn(this);
      this.nextStep();
    } else if (st.type === 'say') {
      this.say(st.text, st.dur, st.tone);
      this.nextStep();
    } else if (st.type === 'pose') {
      this.pose = st.name;
    } else if (st.type === 'walk') {
      this.speedKind = st.speed || 'walk';
      this.step.path = null;
    }
  }

  runStep(dt) {
    const st = this.step;
    if (!st) return;
    st.t += dt;
    const g = this.group;
    switch (st.type) {
      case 'walk': {
        // stand up first if seated
        if (this.sit > 0.001) {
          this.sit = Math.max(0, this.sit - dt * 2.6);
          this.pose = 'stand';
          break;
        }
        if (!st.path) {
          st.path = this.nav.path(g.position, st.to);
          st.i = 0;
          if (REDUCED_MOTION.matches) {
            st.teleport = true;
            this.fadeTarget = 0;
          }
        }
        if (st.teleport) {
          // reduced motion: fade out, jump, fade in
          if (this.fade <= 0.02 && st.stage === 0) {
            g.position.set(st.to.x, 0, st.to.z);
            if (st.path.length > 1) {
              const a = st.path[st.path.length - 2];
              this.heading = Math.atan2(st.to.x - a.x, st.to.z - a.z);
            }
            st.stage = 1;
            this.fadeTarget = 1;
          }
          if (st.stage === 1 && this.fade > 0.98) this.nextStep();
          break;
        }
        const wp = st.path[st.i];
        tmpV.subVectors(wp, g.position);
        tmpV.y = 0;
        const dist = tmpV.length();
        const speed = SPEED[this.speedKind] || SPEED.walk;
        if (dist < 0.03) {
          g.position.x = wp.x;
          g.position.z = wp.z;
          st.i += 1;
          if (st.i >= st.path.length) {
            this.walking = false;
            this.nextStep();
          }
          break;
        }
        const stepLen = Math.min(dist, speed * dt);
        tmpV.multiplyScalar(1 / dist);
        g.position.addScaledVector(tmpV, stepLen);
        this.heading = lerpAngle(this.heading, Math.atan2(tmpV.x, tmpV.z), Math.min(1, dt * 8));
        this.walking = true;
        break;
      }
      case 'sit': {
        this.heading = lerpAngle(this.heading, st.heading ?? Math.PI, Math.min(1, dt * 7));
        if (angleDiff(this.heading, st.heading ?? Math.PI) < 0.25 || st.t > 0.8) this.sit = Math.min(1, this.sit + dt * 2.4);
        if (this.sit >= 1) this.nextStep();
        break;
      }
      case 'face': {
        this.heading = lerpAngle(this.heading, st.heading, Math.min(1, dt * 6));
        if (angleDiff(this.heading, st.heading) < 0.06 || st.t > 1.2) this.nextStep();
        break;
      }
      case 'pose': {
        if (st.face !== undefined) this.heading = lerpAngle(this.heading, st.face, Math.min(1, dt * 5));
        if (st.t >= (st.dur ?? Infinity)) this.nextStep();
        break;
      }
      default:
        this.nextStep();
    }
  }

  /** joint targets for the current pose (angles in radians; arms: x<0 = forward, elbows: x<0 = flex) */
  poseTargets(p, t, s, A, sp, hurry) {
    const T = this.T;
    const sd = this.seed;
    const cup = this.propNow === 'cup';
    T.aLx = 0.03; T.aRx = 0.03; T.aLz = -0.07; T.aRz = 0.07; T.eL = -0.15; T.eR = -0.15; T.hx = 0; T.hy = 0; T.lean = 0;
    if (s > 0.5 && !SEATED_POSES.has(p) && p !== 'walk') p = 'idleSeat';
    switch (p) {
      case 'walk':
        T.aLx = A * 0.85 * sp;
        T.aRx = -A * 0.85 * sp;
        T.eL = T.eR = hurry ? -1.25 : -0.25;
        T.lean = hurry ? 0.14 : 0.03;
        if (cup || this.propNow === 'phone') {
          T.aRx = -0.25;
          T.eR = -1.4;
        }
        break;
      case 'carry':
        T.aLx = T.aRx = -0.45;
        T.eL = T.eR = -1.25;
        T.aLz = 0.2;
        T.aRz = -0.2;
        break;
      case 'type':
        T.aLx = T.aRx = -0.62;
        T.eL = T.eR = -0.92;
        T.aLz = 0.2;
        T.aRz = -0.2;
        T.hx = 0.1;
        T.lean = 0.1;
        break;
      case 'idleSeat':
        T.aLx = T.aRx = -0.35;
        T.eL = T.eR = -0.8;
        T.aLz = 0.12;
        T.aRz = -0.12;
        T.lean = -0.1;
        T.hy = Math.sin(t * 0.4 + sd) * 0.35;
        if (cup) {
          const sip = Math.sin(t * 0.9 + sd) > 0.85;
          T.aRx = sip ? -0.55 : -0.3;
          T.eR = sip ? -2.3 : -1.45;
          T.aRz = sip ? -0.2 : -0.1;
          if (sip) T.hx = -0.15;
        }
        break;
      case 'phone':
        T.aRx = -0.3;
        T.eR = -1.55;
        T.aRz = -0.18;
        T.aLx = -0.25;
        T.eL = -1.3;
        T.aLz = 0.28;
        T.hx = 0.45;
        T.hy = Math.sin(t * 0.7 + sd) * 0.08;
        break;
      case 'drink': {
        const sip = Math.sin(t * 1.1 + sd) > 0.7;
        T.aRx = sip ? -0.5 : -0.22;
        T.eR = sip ? -2.35 : -1.5;
        T.aRz = sip ? -0.25 : -0.1;
        T.hx = sip ? -0.2 : 0.05;
        break;
      }
      case 'stretch':
        T.aLz = -2.85;
        T.aRz = 2.85;
        T.aLx = T.aRx = -0.1;
        T.eL = T.eR = -0.25;
        T.hx = -0.25;
        T.lean = -0.05;
        break;
      case 'talk':
        T.aRx = -0.35 + Math.sin(t * 4 + sd) * 0.18;
        T.eR = -1.2 + Math.sin(t * 5.3 + sd) * 0.35;
        T.aRz = -0.05;
        T.aLx = -0.2 + Math.sin(t * 3 + sd) * 0.1;
        T.eL = -0.9 + Math.sin(t * 3.7 + sd) * 0.25;
        T.hy = Math.sin(t * 1.7 + sd) * 0.2;
        T.hx = Math.sin(t * 5 + sd) * 0.04;
        break;
      case 'listen':
        T.aLx = T.aRx = -0.4;
        T.eL = T.eR = -1.95;
        T.aLz = 0.5;
        T.aRz = -0.5;
        T.hx = Math.max(0, Math.sin(t * 2.2 + sd)) * 0.15;
        break;
      case 'frustrated':
        // hands on the head, head shaking
        T.aLx = T.aRx = -2.5;
        T.eL = T.eR = -2.1;
        T.aLz = -0.5;
        T.aRz = 0.5;
        T.hy = Math.sin(t * 7) * 0.3;
        T.hx = 0.15;
        break;
      case 'stand':
      default:
        if (cup) {
          T.aRx = -0.22;
          T.eR = -1.45;
        }
        T.hy = Math.sin(t * 0.9 + sd) * 0.35;
        break;
    }
    if (this.status === 'error' && p !== 'frustrated') T.hx = Math.max(T.hx, 0.25);
    if (REDUCED_MOTION.matches && p === 'frustrated') T.hy = 0;
    return T;
  }

  // ------------------------------------------------------------- frame update
  update(dt, t, camQuat) {
    const g = this.group;
    this.walking = false;
    this.runStep(dt);
    g.rotation.y = this.heading;

    // reduced-motion teleport fade
    if (this.fade !== this.fadeTarget) {
      this.fade += Math.sign(this.fadeTarget - this.fade) * Math.min(Math.abs(this.fadeTarget - this.fade), dt * 4);
      g.scale.setScalar(Math.max(0.001, this.fade));
    }

    const s = this.sit;
    const reduced = REDUCED_MOTION.matches;
    const hurry = this.speedKind === 'hurry' && this.walking;
    const speed = SPEED[this.speedKind] || SPEED.walk;
    if (this.walking) this.walkPhase += dt * speed * (hurry ? 3.4 : 4.8);
    const ampT = this.walking ? (hurry ? 0.62 : this.speedKind === 'stroll' ? 0.32 : 0.42) : 0;
    this.walkAmp += (ampT - this.walkAmp) * Math.min(1, dt * 10);
    const A = this.walkAmp;
    const sp = Math.sin(this.walkPhase);
    const cp = Math.cos(this.walkPhase);
    const carrying = this.propNow === 'reel' || this.propNow === 'paper' || this.propNow === 'tablet';
    const p = this.walking ? (carrying ? 'carry' : 'walk') : this.pose;
    const T = this.poseTargets(p, t, s, A, sp, hurry);
    const k = Math.min(1, dt * (this.walking ? 20 : 8));
    const j = this.j;
    for (const key in T) j[key] += (T[key] - j[key]) * k;

    const typing = p === 'type' && s > 0.9 && !reduced;
    const bob = this.walking && !reduced ? A * 0.05 * (Math.abs(cp) - 0.5) : 0;
    this.pivot.position.y = (SEAT_HIP - HIP_Y * this.bodyScale) * s + bob;

    // legs: walk cycle (knee flexes during the forward swing) blended with the seated pose
    const [L0, L1] = this.legs;
    L0.hip.rotation.x = -A * sp - SIT_THIGH * s;
    L1.hip.rotation.x = A * sp - SIT_THIGH * s;
    L0.hip.rotation.z = -0.05 * s;
    L1.hip.rotation.z = 0.05 * s;
    L0.knee.rotation.x = A * 1.3 * Math.max(0, cp) + SIT_THIGH * s + 0.03;
    L1.knee.rotation.x = A * 1.3 * Math.max(0, -cp) + SIT_THIGH * s + 0.03;

    this.torso.rotation.x = j.lean;
    this.torso.rotation.y = A * 0.1 * sp;
    if (!reduced) {
      const br = 1 + Math.sin(t * 1.7 + this.seed) * 0.008;
      this.torsoMesh.scale.set(br, 1, br);
    }
    const [a0, a1] = this.arms;
    a0.sh.rotation.set(j.aLx, 0, j.aLz);
    a1.sh.rotation.set(j.aRx, 0, j.aRz);
    a0.el.rotation.x = j.eL + (typing ? Math.sin(t * 18 + this.seed) * 0.06 : 0);
    a1.el.rotation.x = j.eR + (typing ? Math.sin(t * 18 + this.seed + 2) * 0.06 : 0);
    this.head.rotation.x = j.hx + (typing ? Math.sin(t * 2.5 + this.seed) * 0.03 : 0);
    this.head.rotation.y = j.hy - this.torso.rotation.y;

    // ---- desk monitor: on while seated at own desk, screensaver while away
    const atDesk = this.seatedAtDesk;
    const screen = this.desk.screen;
    if (atDesk) {
      this.desk.owner = this;
      screen.setMode(this.status === 'error' ? 'error' : this.deskMode);
    } else if (this.desk.owner === this || !this.desk.owner) {
      this.desk.owner = this;
      screen.setMode(this.status === 'error' ? 'error' : 'idle');
    }
    const glowOn = atDesk && (this.deskMode === 'working' || this.deskMode === 'reviewing' || this.deskMode === 'transcript' || this.deskMode === 'render' || this.deskMode === 'prompt');
    const gm = this.desk.glow.material;
    gm.opacity += ((glowOn ? 0.16 : 0) - gm.opacity) * Math.min(1, dt * 4);
    this.desk.glow.visible = gm.opacity > 0.005;

    // ---- progress ring (billboard), only while really working
    // billboards live inside the rotated character group: undo its heading so they really face the camera
    tmpQ.copy(g.quaternion).invert().multiply(camQuat);
    const showRing = this.busy ? 1 : 0;
    this.ringShown += (showRing - this.ringShown) * Math.min(1, dt * 6);
    this.hud.visible = this.ringShown > 0.01;
    if (this.hud.visible) {
      this.hud.scale.setScalar(Math.max(0.001, this.ringShown));
      this.hud.position.y = 2.02 - 0.37 * s;
      this.hud.quaternion.copy(tmpQ);
      const pr = Math.round(Math.max(0.02, this.progress) * 50) / 50;
      if (this.busy && pr !== this.ringProgress) {
        this.ringProgress = pr;
        this.ring.geometry.dispose();
        this.ring.geometry = new THREE.RingGeometry(0.15, 0.2, 32, 1, Math.PI / 2, -pr * Math.PI * 2);
        this.ringMat.color.set(this.status === 'reviewing' ? '#f5a524' : this.color);
      }
    }

    // ---- error marker
    const isErr = this.status === 'error';
    this.err.visible = isErr;
    this.errDisc.visible = isErr;
    if (isErr) {
      this.err.position.y = 2.15 - 0.37 * s + (reduced ? 0 : Math.abs(Math.sin(t * 4)) * 0.12);
      this.err.quaternion.copy(tmpQ);
      const pulse = reduced ? 0.4 : (t * 1.2) % 1;
      this.errDisc.scale.setScalar(0.8 + pulse * 0.8);
      this.errDisc.material.opacity = 0.55 * (1 - pulse);
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.ring.geometry.dispose();
    if (this.desk.owner === this) {
      this.desk.owner = null;
      this.desk.screen.setMode('off');
      this.desk.glow.material.opacity = 0;
    }
  }
}
