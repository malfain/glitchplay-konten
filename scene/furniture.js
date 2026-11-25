// GlitchPlay HQ furniture: a realistic modern office built from simple primitives, PBR materials (MeshStandardMaterial
// lit by RoomEnvironment reflections + one sun) and procedural canvas textures (oak planks, fabric, rug, posters, sky).
// Nothing is downloaded. Static pieces are merged per material afterwards (mergeStatic) so the whole room costs only
// a few dozen draw calls on phones.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- utils
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw, { repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Tileable wood planks (rows run along u). Grain lines, per-plank tone, end seams, optional knots. */
function drawPlanks(x, w, h, { hue, sat, light, rows, seed, minLen = 0.3, maxLen = 0.75, seam = 0.55 }) {
  const R = rng(seed);
  const rowH = h / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    const start = R() * w * 0.6;
    let px = start;
    while (px < start + w - 1) {
      const len = Math.min(w * (minLen + R() * (maxLen - minLen)), start + w - px);
      const L = light + (R() - 0.5) * 9;
      const S = sat + (R() - 0.5) * 8;
      const Hh = hue + (R() - 0.5) * 5;
      const grains = Array.from({ length: 9 + Math.floor(R() * 8) }, () => [R(), 0.5 + R() * 1.3, 0.05 + R() * 0.16, R() * 6, 6 + R() * 13]);
      const knot = R() < 0.22 ? [0.15 + R() * 0.7, 0.3 + R() * 0.4] : null;
      for (const ox of [px, px - w]) {
        if (ox + len < 0 || ox > w) continue;
        const g = x.createLinearGradient(ox, 0, ox + len, 0);
        g.addColorStop(0, `hsl(${Hh},${S}%,${L - 2}%)`);
        g.addColorStop(0.5, `hsl(${Hh},${S}%,${L + 1.5}%)`);
        g.addColorStop(1, `hsl(${Hh},${S}%,${L - 1}%)`);
        x.fillStyle = g;
        x.fillRect(ox, y0, len, rowH);
        for (const [gy, lw, a, ph, dl] of grains) {
          x.strokeStyle = `hsla(${Hh - 3},${S + 6}%,${L - dl}%,${a})`;
          x.lineWidth = lw;
          x.beginPath();
          const yy = y0 + 2 + gy * (rowH - 4);
          x.moveTo(ox, yy);
          for (let s = 0; s <= len; s += 14) x.lineTo(ox + s, yy + Math.sin(s * 0.017 + ph) * rowH * 0.07);
          x.stroke();
        }
        if (knot) {
          x.fillStyle = `hsla(${Hh - 6},${S + 8}%,${L - 22}%,0.55)`;
          x.beginPath();
          x.ellipse(ox + knot[0] * len, y0 + knot[1] * rowH, rowH * 0.16, rowH * 0.08, 0, 0, Math.PI * 2);
          x.fill();
        }
        x.fillStyle = `rgba(40,24,12,${seam})`;
        x.fillRect(ox + len - 1, y0, 1.3, rowH);
      }
      px += len;
    }
    x.fillStyle = `rgba(40,24,12,${seam})`;
    x.fillRect(0, y0, w, 1.3);
  }
}

function noise(x, w, h, n, seed, alpha = 0.08, size = 1.5) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    x.fillStyle = R() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    x.fillRect(R() * w, R() * h, size, size);
  }
}

// ---------------------------------------------------------------- textures
const TEX = {
  floor: canvasTex(1024, 1024, (x, w, h) => drawPlanks(x, w, h, { hue: 31, sat: 40, light: 60, rows: 12, seed: 7 }), { repeat: [1, 1] }),
  oak: canvasTex(512, 256, (x, w, h) => drawPlanks(x, w, h, { hue: 33, sat: 38, light: 66, rows: 4, seed: 21, minLen: 1, maxLen: 1, seam: 0.12 })),
  walnut: canvasTex(512, 256, (x, w, h) => drawPlanks(x, w, h, { hue: 24, sat: 34, light: 30, rows: 4, seed: 5, minLen: 1, maxLen: 1, seam: 0.15 })),
  fabric: canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#ececec';
    x.fillRect(0, 0, w, h);
    noise(x, w, h, 3200, 3, 0.09, 2);
    for (let y = 0; y < h; y += 2) {
      x.fillStyle = 'rgba(0,0,0,0.05)';
      x.fillRect(0, y, w, 1);
    }
  }, { repeat: [3, 3] }),
  mesh: canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#1b1c1f';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#3b3d42';
    for (let i = 0; i < w; i += 4) {
      x.fillRect(i, 0, 1, h);
      x.fillRect(0, i, w, 1);
    }
  }, { repeat: [4, 4] }),
  tiles: canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = '#d9d4cb';
    x.fillRect(0, 0, w, h);
    const tw = 64;
    const th = 32;
    for (let r = 0; r < h / th; r++) {
      for (let c = -1; c < w / tw + 1; c++) {
        const ox = c * tw + (r % 2 ? tw / 2 : 0);
        const v = 242 + ((c * 7 + r * 3) % 5);
        x.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
        x.fillRect(ox + 1.5, r * th + 1.5, tw - 3, th - 3);
      }
    }
  }, { repeat: [4, 1] }),
  // light terrazzo (bright office floor): pale base, fine grey/beige chips, faint tile seams every 1.2 m
  terrazzo: canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#eeebe6';
    x.fillRect(0, 0, w, h);
    const R = rng(41);
    const chips = ['#d9d4cc', '#c9c3ba', '#f7f5f1', '#bdb6ab', '#e2d7c6'];
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = chips[Math.floor(R() * chips.length)];
      const s = 1 + R() * 3.2;
      x.beginPath();
      x.ellipse(R() * w, R() * h, s, s * (0.5 + R() * 0.5), R() * 3, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = 'rgba(120,110,98,0.16)';
    x.fillRect(0, 0, w, 1.5);
    x.fillRect(0, 0, 1.5, h);
  }, { repeat: [1, 1] }),
};

// ---------------------------------------------------------------- materials
const std = (color, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** Leaf sway clock shared by every plant (hq.js advances it). */
export const SWAY_U = { value: 0 };
function leafMat(color, roughness = 0.5) {
  const m = std(color, roughness, 0, { side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSway = SWAY_U;
    sh.vertexShader = `uniform float uSway;\n${sh.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float swK = clamp((position.y - 0.45) / 1.4, 0.0, 1.0);
      transformed.x += sin(uSway * 1.3 + position.x * 2.1 + position.z * 0.7) * 0.012 * swK;
      transformed.z += cos(uSway * 1.05 + position.z * 1.9 + position.x * 0.5) * 0.010 * swK;`,
    );
  };
  m.customProgramCacheKey = () => 'leaf-sway';
  return m;
}

export const MAT = {
  floor: std('#ffffff', 0.46, 0, { map: TEX.floor }),
  oak: std('#ffffff', 0.5, 0, { map: TEX.oak }),
  walnut: std('#ffffff', 0.42, 0, { map: TEX.walnut }),
  white: std('#f1f0ec', 0.45),
  metal: std('#1d1e21', 0.42, 0.6),
  alu: std('#c4c7cb', 0.32, 0.85),
  steel: std('#b5b9bd', 0.26, 0.9),
  bezel: std('#101114', 0.35, 0.2),
  plasticDark: std('#2a2b2f', 0.5),
  plasticWhite: std('#e6e6e2', 0.42),
  keys: std('#3a3c41', 0.6),
  ceramic: std('#f3f1ec', 0.22),
  paper: std('#f6f4ee', 0.92),
  wall: std('#ebe7e0', 0.94),
  skirting: std('#f6f5f1', 0.55),
  cap: std('#37393e', 0.85),
  slab: std('#2a2c31', 0.9),
  concrete: std('#a7a39d', 0.88),
  terracotta: std('#b4684a', 0.8),
  soil: std('#3a2a1f', 1),
  sofa: std('#a29c92', 0.95, 0, { map: TEX.fabric }),
  pouf: std('#c7b59a', 0.98, 0, { map: TEX.fabric }),
  chairFabric: std('#2b2d31', 0.9, 0, { map: TEX.fabric }),
  chairMesh: std('#ffffff', 0.85, 0, { map: TEX.mesh, side: THREE.DoubleSide }),
  leather: std('#1c1c1e', 0.42),
  glass: std('#d6eaf3', 0.04, 0, { transparent: true, opacity: 0.14, depthWrite: false }),
  frost: std('#ffffff', 0.5, 0, { transparent: true, opacity: 0.5, depthWrite: false }),
  water: std('#8cc8f0', 0.08, 0, { transparent: true, opacity: 0.55, depthWrite: false }),
  cabinet: std('#8a9886', 0.62),
  quartz: std('#efede8', 0.18),
  tiles: std('#ffffff', 0.3, 0, { map: TEX.tiles }),
  dark: std('#18191c', 0.55),
  sinkIn: std('#4a4d52', 0.3, 0.8),
  light: new THREE.MeshBasicMaterial({ color: '#fff4e2', toneMapped: false }),
  shade: std('#efe6d6', 0.9, 0, { emissive: '#ffd9a0', emissiveIntensity: 0.35, side: THREE.DoubleSide }),
  orange: std('#f08a24', 0.55),
  leafMonstera: leafMat('#2c5e33', 0.42),
  leafMonstera2: leafMat('#37703c', 0.45),
  leafFiddle: leafMat('#3b6e2d', 0.38),
  leafSnake: leafMat('#4c7339', 0.5),
  leafSnake2: leafMat('#2f5229', 0.5),
  stem: std('#5d4a33', 0.8),
  pendant: std('#1d1e21', 0.45, 0.6, { side: THREE.DoubleSide }),
  terrazzo: std('#ffffff', 0.62, 0, { map: TEX.terrazzo }),
  leafTree: leafMat('#6a9a4c', 0.62),
  leafTree2: leafMat('#4f8240', 0.62),
  screenOff: std('#1b2230', 0.18, 0.2),
  ledGreen: new THREE.MeshBasicMaterial({ color: '#3dff8a', toneMapped: false }),
  ledAmber: new THREE.MeshBasicMaterial({ color: '#ffb020', toneMapped: false }),
  ledBlue: new THREE.MeshBasicMaterial({ color: '#7dd3fc', toneMapped: false }),
  tvScreen: new THREE.MeshBasicMaterial({ color: '#2b3a52', toneMapped: false }),
};
const BOOKS = ['#1f3a5f', '#e9e1cf', '#9c3d2e', '#2f5d4a', '#c9a227', '#3d3d3f', '#7a8a99', '#b9663f', '#5b4a6b'];
// small coloured props share these two vertex-coloured materials (see paint) so they merge into one draw each
const TINT = { satin: std('#ffffff', 0.32, 0, { vertexColors: true }), matte: std('#ffffff', 0.78, 0, { vertexColors: true }) };

const accentCache = new Map();
/** satin material in an agent's accent colour (mugs, notebook, chair piping …) */
export function accentMat(color, roughness = 0.35) {
  const k = `${color}|${roughness}`;
  if (!accentCache.has(k)) accentCache.set(k, std(color, roughness));
  return accentCache.get(k);
}

// ---------------------------------------------------------------- geometry helpers
const geoCache = new Map();
const cg = (key, make) => {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
};
function mk(geo, m, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}
export const box = (w, h, d, m, x, y, z, shadow = true) => mk(cg(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z, shadow);
export const rbox = (w, h, d, r, m, x, y, z, shadow = true) => mk(cg(`r${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r)), m, x, y, z, shadow);
export const cyl = (rt, rb, h, m, x, y, z, seg = 16, shadow = true) => mk(cg(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y, z, shadow);
const sphere = (r, m, x, y, z, seg = 10) => mk(cg(`s${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2))), m, x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
/** thin cylinder from a to b */
function rod(a, b, r, m, seg = 6, shadow = true) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const o = mk(cg(`c${r}|${r}|${len.toFixed(3)}|${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), m, 0, 0, 0, shadow);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(UP, d.normalize());
  return o;
}
const plane = (w, h, m, shadow = false) => mk(new THREE.PlaneGeometry(w, h), m, 0, 0, 0, shadow);
/** recolour a mesh through vertex colours onto a shared TINT material */
function paint(mesh, color, kind = 'matte') {
  const g = mesh.geometry.clone();
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  mesh.geometry = g;
  mesh.material = TINT[kind];
  return mesh;
}
const pbox = (w, h, d, color, x, y, z, shadow = true, kind = 'matte') => paint(box(w, h, d, TINT[kind], x, y, z, shadow), color, kind);
const pcyl = (rt, rb, h, color, x, y, z, seg = 16, shadow = true, kind = 'satin') => paint(cyl(rt, rb, h, TINT[kind], x, y, z, seg, shadow), color, kind);

/**
 * Bake a group of static meshes into one mesh per material (world space). Meshes flagged userData.keep (live screens,
 * clock hands …) are moved over untouched. Returns a new Group with an identity transform.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.keep) {
      keep.push(o);
      return;
    }
    const key = o.material.uuid;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: o.material, cast: false, geos: [] }));
    b.cast ||= o.castShadow;
    const g = o.geometry.clone();
    const keepColor = o.material.vertexColors;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(keepColor && name === 'color')) g.deleteAttribute(name);
    g.morphAttributes = {};
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    g.clearGroups();
    g.applyMatrix4(o.matrixWorld);
    b.geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.geos, false), b.material);
    m.castShadow = b.cast;
    m.receiveShadow = true;
    out.add(m);
    for (const g of b.geos) g.dispose();
  }
  for (const o of keep) out.attach(o);
  return out;
}

// ---------------------------------------------------------------- monitor screen (live canvas)
const SCREEN_W = 160;
const SCREEN_H = 96;

export class MonitorScreen {
  constructor(accent) {
    this.accent = accent;
    this.canvas = document.createElement('canvas');
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.mode = null;
    this.lines = Array.from({ length: 9 }, () => this.randomLine());
    this.offset = 0;
    this.lastDraw = 0;
    this.pct = 0;
    this.label = '';
    this.seed = Math.random() * 10;
    this.draw('off');
  }

  randomLine() {
    return {
      indent: Math.floor(Math.random() * 4) * 10,
      segs: Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
        w: 14 + Math.random() * 46,
        c: Math.random(),
      })),
    };
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.draw(mode);
  }

  /** progress 0..1 + short label, used by the 'render' mode */
  setProgress(p, label = '') {
    const q = Math.round(p * 100);
    if (q === this.pct && label === this.label) return;
    this.pct = q;
    this.label = label;
    if (this.mode === 'render') this.draw('render');
  }

  tick(now) {
    const m = this.mode;
    const every = m === 'working' || m === 'reviewing' ? 180 : m === 'prompt' ? 150 : m === 'transcript' ? 220 : m === 'render' ? 400 : m === 'idle' ? 1600 : 0;
    if (!every || now - this.lastDraw < every) return;
    this.lastDraw = now;
    this.offset += 1;
    if (this.offset % 3 === 0) {
      this.lines.shift();
      this.lines.push(this.randomLine());
    }
    this.draw(m);
  }

  draw(mode) {
    const { ctx } = this;
    const w = SCREEN_W;
    const h = SCREEN_H;
    if (mode === 'idle') {
      // screensaver: slow drifting accent blob + brand
      ctx.fillStyle = '#161b27';
      ctx.fillRect(0, 0, w, h);
      const k = this.offset * 0.37 + this.seed;
      const bx = w * (0.5 + Math.sin(k) * 0.3);
      const by = h * (0.5 + Math.cos(k * 1.3) * 0.25);
      const g = ctx.createRadialGradient(bx, by, 2, bx, by, 46);
      g.addColorStop(0, this.accent);
      g.addColorStop(1, 'rgba(22,27,39,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '700 15px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GlitchPlay', w - bx * 0.4 - 30, h - by * 0.5 - 6);
    } else if (mode === 'render') {
      ctx.fillStyle = '#121620';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3a4a6b';
      ctx.fillRect(w / 2 - 17, 8, 34, 52);
      ctx.fillStyle = '#c6f432';
      ctx.fillRect(w / 2 - 12, 48, 24, 4);
      const p = (this.pct || 0) / 100;
      ctx.fillStyle = '#2a3142';
      ctx.fillRect(10, 70, w - 20, 9);
      ctx.fillStyle = this.accent;
      ctx.fillRect(10, 70, (w - 20) * p, 9);
      ctx.fillStyle = '#fff';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`RENDER ${Math.round(p * 100)}%`, 10, 82);
    } else if (mode === 'off' || !mode) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#2a3040');
      g.addColorStop(1, '#151923');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(w * 0.55, 0);
      ctx.lineTo(w * 0.75, 0);
      ctx.lineTo(w * 0.35, h);
      ctx.lineTo(w * 0.15, h);
      ctx.fill();
    } else if (mode === 'error') {
      ctx.fillStyle = '#3a1219';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff5c6c';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', w / 2, h / 2 + 2);
    } else {
      const reviewing = mode === 'reviewing';
      ctx.fillStyle = reviewing ? '#fff8e8' : '#f3f7ff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = reviewing ? '#f5c451' : this.accent;
      ctx.fillRect(0, 0, w, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(7 + i * 8, 5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = reviewing ? '#f7ebcf' : '#e2e9f7';
      ctx.fillRect(0, 10, 26, h - 10);
      const palette = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', this.accent, '#64748b'];
      this.lines.forEach((line, i) => {
        let x = 34 + line.indent;
        const y = 17 + i * 9;
        for (const s of line.segs) {
          ctx.fillStyle = palette[Math.floor(s.c * palette.length)];
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x, y, s.w, 4);
          x += s.w + 5;
        }
      });
      ctx.globalAlpha = 1;
      if (this.offset % 2 === 0) {
        ctx.fillStyle = '#111827';
        ctx.fillRect(34 + (this.offset * 7) % 90, 17 + 8 * 9, 2, 6);
      }
    }
    this.texture.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- room shell
/**
 * Floor (oak planks on a section slab), solid north wall with skirting, full-height glazed west wall with mullions and a
 * painted city skyline behind it. `view` = camera direction so the backdrop lines up with the glass in the iso view.
 */
export function makeShell({ X0, X1, Z0, Z1, H, view }) {
  const g = new THREE.Group();
  const W = X1 - X0;
  const D = Z1 - Z0;
  const cx = (X0 + X1) / 2;
  const cz = (Z0 + Z1) / 2;
  TEX.floor.repeat.set(W / 2.4, D / 2.4);
  const floor = plane(W, D, MAT.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  g.add(floor);
  g.add(box(W + 0.15, 0.32, D + 0.15, MAT.slab, cx - 0.075, -0.175, cz - 0.075, false));
  // north wall + skirting + section cap
  g.add(box(W + 0.15, H, 0.15, MAT.wall, cx - 0.075, H / 2, Z0 - 0.075));
  g.add(box(W + 0.15, 0.012, 0.15, MAT.cap, cx - 0.075, H + 0.006, Z0 - 0.075, false));
  g.add(box(W, 0.08, 0.016, MAT.skirting, cx, 0.04, Z0 + 0.008, false));
  // west curtain wall
  const gx = X0 - 0.03;
  g.add(box(0.012, H - 0.06, D, MAT.glass, gx, H / 2, cz, false));
  g.add(box(0.09, 0.05, D, MAT.metal, gx, 0.025, cz, false));
  g.add(box(0.1, 0.1, D + 0.15, MAT.metal, gx, H - 0.05, cz - 0.075));
  g.add(box(0.07, 0.045, D, MAT.metal, gx, 2.2, cz));
  const bays = Math.round(D / 1.5);
  for (let i = 0; i <= bays; i++) g.add(box(0.07, H, 0.06, MAT.metal, gx, H / 2, Z0 + (i * D) / bays));
  g.add(box(0.3, H, 0.3, MAT.wall, X0 - 0.075, H / 2, Z0 - 0.075));
  g.add(box(0.3, 0.012, 0.3, MAT.cap, X0 - 0.075, H + 0.006, Z0 - 0.075, false));
  // skyline backdrop, offset so its outline matches the glass on screen
  const off = 0.6;
  const v = view.clone().normalize();
  const sky = plane(D, H, new THREE.MeshBasicMaterial({ map: canvasTex(1024, 264, drawSkyline), toneMapped: false }));
  sky.rotation.y = Math.PI / 2;
  sky.position.set(X0 - off, H / 2 - (off * v.y) / v.x, cz - (off * v.z) / v.x);
  g.add(sky);
  return g;
}

function drawSkyline(x, w, h) {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#7fb0dc');
  g.addColorStop(0.55, '#c4dcec');
  g.addColorStop(1, '#f3e7d3');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // soft clouds
  const R = rng(19);
  for (let i = 0; i < 9; i++) {
    const cx = R() * w;
    const cy = h * (0.08 + R() * 0.25);
    const cg2 = x.createRadialGradient(cx, cy, 2, cx, cy, 60 + R() * 60);
    cg2.addColorStop(0, 'rgba(255,255,255,0.55)');
    cg2.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = cg2;
    x.fillRect(cx - 130, cy - 60, 260, 120);
  }
  const layer = (base, color, minH, maxH, wmin, wmax, win) => {
    let px = -20;
    while (px < w) {
      const bw = wmin + R() * (wmax - wmin);
      const bh = minH + R() * (maxH - minH);
      x.fillStyle = color;
      x.fillRect(px, base - bh, bw, h);
      if (R() < 0.25) x.fillRect(px + bw / 2 - 1, base - bh - 14, 2, 14);
      if (win) {
        x.fillStyle = win;
        for (let yy = base - bh + 6; yy < base - 4; yy += 7) for (let xx = px + 4; xx < px + bw - 5; xx += 6) if (R() < 0.7) x.fillRect(xx, yy, 3, 3);
      }
      px += bw + 2 + R() * 10;
    }
  };
  layer(h * 0.8, '#a9bfd1', h * 0.12, h * 0.48, 28, 70, null);
  layer(h * 0.86, '#8ea4b8', h * 0.08, h * 0.4, 26, 62, 'rgba(225,236,245,0.35)');
  layer(h * 0.93, '#6d8297', h * 0.05, h * 0.28, 40, 95, 'rgba(240,226,190,0.35)');
  // tree line
  x.fillStyle = '#4e6a4d';
  for (let px = 0; px < w; px += 9) {
    x.beginPath();
    x.arc(px, h * 0.95, 8 + R() * 8, 0, Math.PI * 2);
    x.fill();
  }
  x.fillRect(0, h * 0.95, w, h);
}

/** frameless-look glass partition running along local z, with black aluminium frame and a frosted safety band */
export function makeGlassPartition(len, h) {
  const g = new THREE.Group();
  g.add(box(0.012, h - 0.08, len, MAT.glass, 0, h / 2, 0, false));
  g.add(box(0.05, 0.05, len, MAT.metal, 0, 0.025, 0));
  g.add(box(0.05, 0.06, len, MAT.metal, 0, h - 0.03, 0));
  for (const z of [-len / 2, 0, len / 2]) g.add(box(0.05, h, 0.05, MAT.metal, 0, h / 2, z));
  g.add(box(0.016, 0.09, len, MAT.frost, 0, 1.1, 0, false));
  return g;
}

export function makeRug(w, d, { base = '#d8d0c2', border = '#6d7a72', seed = 4 } = {}) {
  const tex = canvasTex(512, Math.round((512 * d) / w), (x, cw, ch) => {
    x.fillStyle = base;
    x.fillRect(0, 0, cw, ch);
    noise(x, cw, ch, 14000, seed, 0.06, 2);
    x.strokeStyle = border;
    x.lineWidth = 10;
    x.strokeRect(22, 22, cw - 44, ch - 44);
    x.lineWidth = 2;
    x.strokeRect(40, 40, cw - 80, ch - 80);
  });
  const m = plane(w, d, std('#ffffff', 1, 0, { map: tex }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// ---------------------------------------------------------------- desk + chair
let _screenGeo = null;
let _glowGeo = null;

/**
 * Work desk: wooden top on a black steel sled frame, drawer pedestal, slim monitor on an aluminium stand (live canvas),
 * keyboard, mouse, mug, notebooks, desk lamp … and an ergonomic chair. Front (person side) is +z.
 */
export function makeDesk({ accent, bos = false, deco = 0, live = true }) {
  const g = new THREE.Group();
  const W = bos ? 1.8 : 1.5;
  const D = bos ? 0.85 : 0.75;
  const H = 0.73;
  g.add(box(W, 0.03, D, bos ? MAT.walnut : MAT.oak, 0, H - 0.015, 0));
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.08);
    g.add(box(0.04, H - 0.03, 0.04, MAT.metal, x, (H - 0.03) / 2, -D / 2 + 0.07));
    g.add(box(0.04, H - 0.03, 0.04, MAT.metal, x, (H - 0.03) / 2, D / 2 - 0.07));
    g.add(box(0.04, 0.03, D - 0.1, MAT.metal, x, H - 0.045, 0));
    g.add(box(0.05, 0.02, D - 0.06, MAT.metal, x, 0.01, 0));
  }
  g.add(box(W - 0.2, 0.04, 0.03, MAT.metal, 0, H - 0.05, -D / 2 + 0.07));
  // drawer pedestal
  const px = W / 2 - 0.33;
  g.add(box(0.4, 0.56, 0.5, bos ? MAT.walnut : MAT.white, px, 0.3, -0.08));
  for (const y of [0.22, 0.42]) g.add(box(0.38, 0.004, 0.004, MAT.dark, px, y, 0.172, false));
  for (const y of [0.33, 0.5]) g.add(box(0.12, 0.012, 0.015, MAT.alu, px, y, 0.18, false));

  // monitor (screen faces +z toward the chair)
  const mon = new THREE.Group();
  mon.position.set(bos ? -0.1 : 0, H, -0.17);
  mon.add(box(0.22, 0.012, 0.17, MAT.alu, 0, 0.006, 0));
  const neck = box(0.05, 0.32, 0.014, MAT.alu, 0, 0.17, -0.05);
  neck.rotation.x = -0.1;
  mon.add(neck);
  mon.add(box(0.64, 0.385, 0.02, MAT.bezel, 0, 0.36, -0.018));
  mon.add(box(0.32, 0.2, 0.03, MAT.bezel, 0, 0.34, -0.04));
  // live desks get a canvas screen + glow; spare (hot) desks a dark static panel that merges with the room
  const screen = live ? new MonitorScreen(accent) : null;
  const screenMesh = new THREE.Mesh((_screenGeo ||= new THREE.PlaneGeometry(0.61, 0.355)), live ? screen.material : MAT.screenOff);
  screenMesh.position.set(0, 0.367, -0.0075);
  screenMesh.userData.keep = live;
  mon.add(screenMesh);
  let glow = null;
  if (live) {
    // soft screen-light spill on the desk top (shown while working)
    glow = new THREE.Mesh((_glowGeo ||= new THREE.PlaneGeometry(1.1, 0.55)), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.002, 0.3);
    glow.userData.keep = true;
    mon.add(glow);
  }
  g.add(mon);

  // keyboard, mouse + pad
  g.add(box(0.42, 0.014, 0.13, MAT.plasticWhite, 0, H + 0.007, 0.17, false));
  g.add(box(0.39, 0.006, 0.1, MAT.keys, 0, H + 0.016, 0.17, false));
  g.add(box(0.26, 0.003, 0.21, MAT.dark, 0.36, H + 0.0015, 0.15, false));
  g.add(rbox(0.06, 0.028, 0.1, 0.012, MAT.plasticWhite, 0.36, H + 0.016, 0.17, false));
  // mug
  const mx = bos ? 0.62 : -0.56;
  g.add(pcyl(0.04, 0.038, 0.095, accent, mx, H + 0.048, 0.08, 14));
  g.add(cyl(0.035, 0.035, 0.004, MAT.dark, mx, H + 0.094, 0.08, 12, false));
  const handle = paint(mk(cg('mugH', () => new THREE.TorusGeometry(0.025, 0.007, 5, 10)), TINT.satin, mx + 0.045, H + 0.05, 0.08), accent, 'satin');
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  // notebooks
  const nb1 = pbox(0.21, 0.014, 0.29, BOOKS[(deco + 2) % BOOKS.length], 0.48, H + 0.007, -0.1, false);
  nb1.rotation.y = 0.12;
  g.add(nb1);
  const nb2 = pbox(0.18, 0.01, 0.25, accent, 0.5, H + 0.019, -0.08, false);
  nb2.rotation.y = -0.08;
  g.add(nb2);
  g.add(box(0.21, 0.002, 0.29, MAT.paper, -0.3, H + 0.001, 0.0, false));
  // desk lamp (architect style) or a little plant
  if (deco % 2 === 0) {
    const lx = -W / 2 + 0.18;
    const lz = -0.22;
    g.add(cyl(0.065, 0.07, 0.015, MAT.metal, lx, H + 0.008, lz, 14));
    const a = new THREE.Vector3(lx, H + 0.015, lz);
    const b = new THREE.Vector3(lx + 0.05, H + 0.36, lz - 0.06);
    const c = new THREE.Vector3(lx + 0.24, H + 0.42, lz + 0.05);
    g.add(rod(a, b, 0.008, MAT.metal), rod(b, c, 0.008, MAT.metal));
    const head = cyl(0.025, 0.06, 0.09, MAT.metal, c.x + 0.03, c.y - 0.04, c.z, 14);
    head.rotation.z = 0.5;
    g.add(head);
  } else {
    const sx = -W / 2 + 0.2;
    g.add(cyl(0.055, 0.045, 0.1, MAT.ceramic, sx, H + 0.05, -0.22, 12));
    for (let i = 0; i < 5; i++) {
      const blade = mk(leafGeo('blade'), MAT.leafSnake, sx, H + 0.09, -0.22);
      blade.quaternion.copy(orient(new THREE.Vector3(Math.cos(i * 1.3) * 0.25, 1, Math.sin(i * 1.3) * 0.25), i * 1.3));
      blade.scale.setScalar(0.32);
      g.add(blade);
    }
  }
  if (deco % 3 === 1) {
    // pen cup
    g.add(cyl(0.035, 0.035, 0.1, MAT.metal, -0.36, H + 0.05, -0.25, 12));
    for (const [dx, c] of [[-0.01, '#18191c'], [0.012, BOOKS[2]], [0, BOOKS[0]]]) g.add(pcyl(0.004, 0.004, 0.14, c, -0.36 + dx, H + 0.11, -0.25 + dx, 5, false));
  }
  if (bos) {
    // closed laptop + phone on the CEO desk
    g.add(rbox(0.32, 0.016, 0.22, 0.006, MAT.alu, 0.5, H + 0.008, -0.2, false));
    g.add(rbox(0.075, 0.008, 0.15, 0.004, MAT.dark, -0.62, H + 0.004, 0.12, false));
  }

  const chairZ = D / 2 + 0.345;
  const chair = makeChair({ bos, accent });
  chair.position.set(0, 0, chairZ);
  g.add(chair);
  return { group: g, screen, glow, chair, seat: new THREE.Vector3(0, 0, chairZ), size: [W, D] };
}

/** ergonomic office chair: 5-star base on casters, gas lift, padded seat, curved mesh back (back at +z) */
export function makeChair({ bos = false } = {}) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const spoke = box(0.045, 0.03, 0.3, MAT.plasticDark, Math.sin(a) * 0.15, 0.075, Math.cos(a) * 0.15);
    spoke.rotation.y = a;
    g.add(spoke);
    g.add(cyl(0.022, 0.022, 0.03, MAT.dark, Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29, 8, false));
  }
  g.add(cyl(0.045, 0.05, 0.06, MAT.plasticDark, 0, 0.08, 0, 10));
  g.add(cyl(0.022, 0.022, 0.26, MAT.alu, 0, 0.24, 0, 8));
  g.add(box(0.2, 0.05, 0.2, MAT.plasticDark, 0, 0.385, 0.02));
  g.add(rbox(0.5, 0.07, 0.48, 0.03, bos ? MAT.leather : MAT.chairFabric, 0, 0.43, 0));
  // back: spine + curved panel
  const backH = bos ? 0.72 : 0.52;
  g.add(box(0.06, 0.32, 0.03, MAT.plasticDark, 0, 0.5, 0.27));
  const back = new THREE.Mesh(cg(`chairBack${backH}`, () => new THREE.CylinderGeometry(0.55, 0.55, backH, 10, 1, true, -0.42, 0.84)), bos ? MAT.leather : MAT.chairMesh);
  back.position.set(0, 0.56 + backH / 2, 0.255 - 0.55);
  back.castShadow = true;
  back.receiveShadow = true;
  g.add(back);
  // armrests
  for (const sx of [-1, 1]) {
    g.add(box(0.03, 0.2, 0.03, MAT.plasticDark, sx * 0.26, 0.55, 0.06));
    g.add(rbox(0.06, 0.025, 0.24, 0.01, MAT.plasticDark, sx * 0.26, 0.66, 0.03));
  }
  return g;
}

/** simple visitor / meeting chair: oak seat & back on black steel legs (person faces +z, back at -z) */
export function makeSideChair() {
  const g = new THREE.Group();
  g.add(rbox(0.44, 0.04, 0.42, 0.015, MAT.oak, 0, 0.45, 0));
  for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) g.add(box(0.025, 0.44, 0.025, MAT.metal, x, 0.22, z));
  for (const x of [-0.18, 0.18]) g.add(box(0.022, 0.38, 0.022, MAT.metal, x, 0.66, -0.19));
  g.add(rbox(0.42, 0.16, 0.025, 0.01, MAT.oak, 0, 0.78, -0.2));
  return g;
}

// ---------------------------------------------------------------- plants (flattened leaf geometry)
function leafGeo(kind) {
  return cg(`leaf-${kind}`, () => {
    const s = new THREE.Shape();
    const half = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let w;
      if (kind === 'monstera') {
        w = 0.46 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.06)), 0.75);
        // deep side slits (pinnae) characteristic of monstera
        if (i > 1 && i < n - 1 && i % 2 === 0) w *= 0.42;
      } else if (kind === 'fiddle') {
        w = 0.36 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8) * (1 - 0.18 * Math.exp(-(((t - 0.42) / 0.12) ** 2)));
      } else w = 0.075 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.02)), 0.5);
      half.push([w, t]);
    }
    s.moveTo(0, 0);
    for (const [w, t] of half) s.lineTo(w, t);
    for (let i = half.length - 1; i >= 0; i--) s.lineTo(-half[i][0], half[i][1]);
    const geo = new THREE.ShapeGeometry(s);
    const p = geo.attributes.position;
    const bend = kind === 'blade' ? 0.05 : 0.22;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, -bend * y * y - 0.16 * Math.abs(x) * (kind === 'blade' ? 0.5 : 1));
    }
    geo.computeVertexNormals();
    return geo;
  });
}
const _bx = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
/** quaternion that points a leaf's midrib (+y) along `dir`, blade facing up-ish, rolled by `roll` */
function orient(dir, roll = 0) {
  const y = dir.clone().normalize();
  const ref = Math.abs(y.y) > 0.92 ? new THREE.Vector3(Math.cos(roll), 0, Math.sin(roll)) : UP;
  _bx.crossVectors(y, ref).normalize();
  _bz.crossVectors(_bx, y).normalize();
  _m4.makeBasis(_bx, y, _bz);
  const q = new THREE.Quaternion().setFromRotationMatrix(_m4);
  if (Math.abs(y.y) <= 0.92) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll * 0.25));
  return q;
}

function makePot(kind) {
  const g = new THREE.Group();
  const spec = kind === 'monstera' ? [0.25, 0.2, 0.42, MAT.concrete] : kind === 'fiddle' ? [0.21, 0.17, 0.46, MAT.ceramic] : [0.17, 0.14, 0.34, MAT.terracotta];
  const [rt, rb, h, m] = spec;
  g.add(cyl(rt, rb, h, m, 0, h / 2, 0, 18));
  g.add(cyl(rt - 0.02, rt - 0.02, 0.02, MAT.soil, 0, h - 0.025, 0, 14, false));
  g.userData.top = h - 0.03;
  return g;
}

/** big indoor plant in a pot: 'monstera' (split leaves on long stalks), 'fiddle' (fiddle-leaf fig tree), 'snake' */
export function makePlant(kind = 'monstera', scale = 1, seed = 1) {
  const g = new THREE.Group();
  const R = rng(seed * 97 + 13);
  const pot = makePot(kind);
  g.add(pot);
  const top = pot.userData.top;
  const base = new THREE.Vector3(0, top, 0);
  if (kind === 'monstera') {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + R() * 0.4;
      const reach = 0.12 + R() * 0.32;
      const hgt = 0.35 + R() * 0.7;
      const tip = new THREE.Vector3(Math.cos(a) * reach, top + hgt, Math.sin(a) * reach);
      g.add(rod(base.clone().add(new THREE.Vector3(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04)), tip, 0.008, MAT.leafMonstera2, 5));
      const dir = new THREE.Vector3(Math.cos(a), -0.15 + R() * 0.55, Math.sin(a));
      const leaf = mk(leafGeo('monstera'), i % 2 ? MAT.leafMonstera : MAT.leafMonstera2, tip.x, tip.y, tip.z);
      leaf.quaternion.copy(orient(dir, R() * 2 - 1));
      leaf.scale.setScalar(0.42 + R() * 0.2);
      g.add(leaf);
    }
  } else if (kind === 'fiddle') {
    const trunkTop = top + 1.35;
    g.add(rod(base, new THREE.Vector3(0.02, trunkTop, -0.01), 0.02, MAT.stem, 6));
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996;
      const y = top + 0.65 + (i / n) * 0.75 + R() * 0.05;
      const dir = new THREE.Vector3(Math.cos(a), 0.35 + R() * 0.8, Math.sin(a));
      const leaf = mk(leafGeo('fiddle'), MAT.leafFiddle, Math.cos(a) * 0.03, y, Math.sin(a) * 0.03);
      leaf.quaternion.copy(orient(dir, R() * 2 - 1));
      leaf.scale.setScalar(0.3 + R() * 0.08 - (i / n) * 0.05);
      g.add(leaf);
    }
  } else {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996;
      const r = R() * 0.07;
      const dir = new THREE.Vector3(Math.cos(a) * (0.08 + R() * 0.25), 1, Math.sin(a) * (0.08 + R() * 0.25));
      const leaf = mk(leafGeo('blade'), i % 2 ? MAT.leafSnake : MAT.leafSnake2, Math.cos(a) * r, top, Math.sin(a) * r);
      leaf.quaternion.copy(orient(dir, a + Math.PI / 2));
      leaf.scale.setScalar(0.55 + R() * 0.35);
      g.add(leaf);
    }
  }
  g.scale.setScalar(scale);
  return g;
}

// ---------------------------------------------------------------- wall pieces (origin at the wall, facing +z)
const HAND = '"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS",cursive';

export function makeWhiteboard(accent) {
  const g = new THREE.Group();
  const W = 1.8;
  const H = 1.0;
  g.add(box(W + 0.04, H + 0.04, 0.025, MAT.alu, 0, 0, 0.0125));
  const tex = canvasTex(720, 400, (x, w, h) => {
    x.fillStyle = '#fbfbf9';
    x.fillRect(0, 0, w, h);
    x.textBaseline = 'top';
    x.fillStyle = accent;
    x.font = `700 38px ${HAND}`;
    x.fillText('Catatan untuk Bos', 26, 18);
    x.fillRect(26, 66, 320, 4);
    x.font = `600 25px ${HAND}`;
    x.fillStyle = '#1f3f9a';
    ['✓ Shift jalan 06:00 WIB', '• 3 reel IG + 1 video YT', '• Cek tren & jam posting', '• Fakta wajib 2 sumber!'].forEach((t, i) => x.fillText(t, 30, 92 + i * 42));
    x.fillStyle = '#c62828';
    x.fillText('QC dulu baru terbit', 30, 268);
    x.strokeStyle = '#c62828';
    x.lineWidth = 3;
    x.beginPath();
    x.ellipse(150, 284, 140, 26, -0.03, 0, Math.PI * 2);
    x.stroke();
    // little chart: views going up
    x.strokeStyle = '#222';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(440, 120);
    x.lineTo(440, 300);
    x.lineTo(680, 300);
    x.stroke();
    const bars = [40, 70, 60, 105, 150];
    bars.forEach((b, i) => {
      x.fillStyle = i === bars.length - 1 ? accent : '#5b7bd5';
      x.fillRect(460 + i * 44, 298 - b, 28, b);
    });
    x.fillStyle = '#222';
    x.font = `600 22px ${HAND}`;
    x.fillText('views ↑', 560, 104);
    // sticky notes
    [['#ffe066', 'Rapat\nSenin 9:00', 470, 318], ['#ffa8c5', 'Ide: seri\nesports', 590, 322]].forEach(([c, t, sx, sy]) => {
      x.fillStyle = c;
      x.fillRect(sx, sy, 108, 72);
      x.fillStyle = '#333';
      x.font = `600 17px ${HAND}`;
      t.split('\n').forEach((ln, i) => x.fillText(ln, sx + 8, sy + 10 + i * 22));
    });
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), std('#ffffff', 0.22, 0, { map: tex }));
  face.position.z = 0.0255;
  face.receiveShadow = true;
  g.add(face);
  g.add(box(W * 0.6, 0.02, 0.06, MAT.alu, 0, -H / 2 - 0.03, 0.04));
  [accent, '#1f3f9a', '#c62828'].forEach((c, i) => {
    const m = pcyl(0.009, 0.009, 0.13, c, -0.2 + i * 0.1, -H / 2 - 0.01, 0.05, 6, false);
    m.rotation.z = Math.PI / 2;
    g.add(m);
  });
  return g;
}

const ART = {
  abstract(x, w, h) {
    x.fillStyle = '#efe6d6';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#c4643f';
    x.beginPath();
    x.arc(w * 0.38, h * 0.36, w * 0.24, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#23395b';
    x.fillRect(w * 0.45, h * 0.5, w * 0.36, h * 0.34);
    x.fillStyle = '#e0a93b';
    x.beginPath();
    x.arc(w * 0.63, h * 0.5, w * 0.18, Math.PI, 0);
    x.fill();
    x.strokeStyle = '#1d1d1d';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(w * 0.15, h * 0.78);
    x.lineTo(w * 0.85, h * 0.78);
    x.stroke();
  },
  game(x, w, h) {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#141826');
    g.addColorStop(1, '#2a1838');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#38d6ff';
    x.lineWidth = 6;
    x.beginPath();
    x.roundRect(w * 0.2, h * 0.3, w * 0.6, h * 0.24, 40);
    x.stroke();
    x.fillStyle = '#ff4fa3';
    x.beginPath();
    x.arc(w * 0.66, h * 0.4, 9, 0, Math.PI * 2);
    x.arc(w * 0.72, h * 0.45, 9, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#c6f02c';
    x.fillRect(w * 0.3, h * 0.41, 34, 9);
    x.fillRect(w * 0.3 + 12, h * 0.41 - 12, 9, 34);
    x.fillStyle = '#ffffff';
    x.font = '800 34px "Inter", sans-serif';
    x.textAlign = 'center';
    x.fillText('GLITCHPLAY', w / 2, h * 0.72);
    x.font = '600 15px "Inter", sans-serif';
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.fillText('PLAY • CREATE • REPEAT', w / 2, h * 0.8);
  },
  landscape(x, w, h) {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f6c98a');
    g.addColorStop(0.55, '#f0a77c');
    g.addColorStop(1, '#6d6a8c');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff3d6';
    x.beginPath();
    x.arc(w * 0.62, h * 0.42, w * 0.08, 0, Math.PI * 2);
    x.fill();
    const ridge = (y0, amp, c) => {
      x.fillStyle = c;
      x.beginPath();
      x.moveTo(0, h);
      for (let i = 0; i <= 20; i++) x.lineTo((i / 20) * w, y0 - Math.abs(Math.sin(i * 0.9 + y0)) * amp);
      x.lineTo(w, h);
      x.fill();
    };
    ridge(h * 0.62, h * 0.16, '#8a6f8f');
    ridge(h * 0.74, h * 0.12, '#5c4d6e');
    ridge(h * 0.86, h * 0.08, '#3b3450');
  },
};

/** framed print with white passe-partout (origin at the wall, facing +z) */
export function makeFrame(w, h, art, frameMat = MAT.metal) {
  const g = new THREE.Group();
  g.add(box(w, h, 0.03, frameMat, 0, 0, 0.015));
  const tex = canvasTex(256, Math.round((256 * h) / w), (x, cw, ch) => {
    x.fillStyle = '#fbfaf7';
    x.fillRect(0, 0, cw, ch);
    x.save();
    x.translate(22, 22);
    ART[art](x, cw - 44, ch - 44);
    x.restore();
  });
  const pic = plane(w - 0.05, h - 0.05, std('#ffffff', 0.55, 0, { map: tex }));
  pic.position.z = 0.031;
  pic.receiveShadow = true;
  g.add(pic);
  return g;
}

/** wall clock showing the real time (hands are kept separate; hq.js turns them) */
export function makeClock() {
  const g = new THREE.Group();
  const rim = cyl(0.17, 0.17, 0.04, MAT.metal, 0, 0, 0.02, 28);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const tex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#fbfaf6';
    x.beginPath();
    x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#1d1d1d';
    for (let i = 0; i < 60; i++) {
      x.save();
      x.translate(w / 2, h / 2);
      x.rotate((i / 60) * Math.PI * 2);
      x.fillRect(-1.5, -118, i % 5 ? 3 : 7, i % 5 ? 10 : 22);
      x.restore();
    }
  });
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.155, 28), std('#ffffff', 0.3, 0, { map: tex }));
  face.position.z = 0.041;
  g.add(face);
  const hand = (len, wid, z) => {
    const geo = new THREE.BoxGeometry(wid, len, 0.004);
    geo.translate(0, len / 2 - 0.015, 0);
    const m = new THREE.Mesh(geo, MAT.dark);
    m.position.z = z;
    m.userData.keep = true;
    g.add(m);
    return m;
  };
  g.userData.hands = { h: hand(0.085, 0.012, 0.045), m: hand(0.125, 0.008, 0.05) };
  return g;
}

/** "GlitchPlay HQ" lettering on the wall */
export function makeSign(accent = '#38d6ff') {
  const tex = canvasTex(1024, 180, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.textBaseline = 'middle';
    x.font = '800 118px "Inter", "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = accent;
    x.fillText('GlitchPlay', 33, h / 2 + 3);
    x.fillStyle = '#23252a';
    x.fillText('GlitchPlay', 28, h / 2);
    const gw = x.measureText('GlitchPlay ').width;
    x.font = '300 118px "Inter", "Helvetica Neue", Arial, sans-serif';
    x.fillText('HQ', 28 + gw, h / 2);
  });
  const m = plane(1.9, 0.334, std('#ffffff', 0.6, 0, { map: tex, alphaTest: 0.5 }));
  m.position.z = 0.012;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// ---------------------------------------------------------------- storage / kitchen (origin at the wall, front +z)
export function makeBookshelf(w = 1.6, h = 1.95, d = 0.34, seed = 3) {
  const g = new THREE.Group();
  const R = rng(seed);
  g.add(box(w, h, 0.02, MAT.walnut, 0, h / 2, 0.01));
  for (const sx of [-1, 1]) g.add(box(0.03, h, d, MAT.oak, sx * (w / 2 - 0.015), h / 2, d / 2));
  const shelves = 5;
  for (let i = 0; i < shelves; i++) g.add(box(w - 0.06, 0.025, d - 0.02, MAT.oak, 0, 0.06 + (i * (h - 0.08)) / (shelves - 1), d / 2));
  g.add(box(w - 0.06, 0.06, 0.02, MAT.oak, 0, 0.03, d - 0.01));
  for (let s = 0; s < shelves - 1; s++) {
    const y0 = 0.06 + (s * (h - 0.08)) / (shelves - 1) + 0.0125;
    let x = -w / 2 + 0.05;
    while (x < w / 2 - 0.1) {
      const r = R();
      if (r < 0.12) {
        // decor: ceramic vase or storage box
        if (R() < 0.5) g.add(cyl(0.05, 0.04, 0.18, MAT.ceramic, x + 0.07, y0 + 0.09, d / 2, 12));
        else g.add(box(0.2, 0.16, d - 0.08, MAT.pouf, x + 0.1, y0 + 0.08, d / 2));
        x += 0.26;
      } else if (r < 0.2) {
        // a flat stack
        for (let k = 0; k < 3; k++) g.add(pbox(0.2, 0.03, 0.24, BOOKS[Math.floor(R() * BOOKS.length)], x + 0.11, y0 + 0.015 + k * 0.03, d / 2));
        x += 0.25;
      } else {
        const n = 4 + Math.floor(R() * 7);
        for (let k = 0; k < n && x < w / 2 - 0.06; k++) {
          const bw = 0.022 + R() * 0.03;
          const bh = 0.18 + R() * 0.1;
          g.add(pbox(bw, bh, 0.2 + R() * 0.04, BOOKS[Math.floor(R() * BOOKS.length)], x + bw / 2, y0 + bh / 2, d / 2 + 0.02));
          x += bw + 0.002;
        }
        x += 0.04 + R() * 0.08;
      }
    }
  }
  return g;
}

export function makeKitchenette(len) {
  const g = new THREE.Group();
  const D = 0.6;
  const top = 0.915;
  g.add(box(len, 0.1, D - 0.08, MAT.dark, 0, 0.05, (D - 0.08) / 2, false));
  g.add(box(len, 0.78, D - 0.02, MAT.cabinet, 0, 0.49, (D - 0.02) / 2));
  const n = Math.max(2, Math.round(len / 0.6));
  for (let i = 1; i < n; i++) g.add(box(0.006, 0.76, 0.004, MAT.dark, -len / 2 + (i * len) / n, 0.49, D - 0.018, false));
  for (let i = 0; i < n; i++) g.add(box(0.16, 0.012, 0.02, MAT.alu, -len / 2 + ((i + 0.5) * len) / n, 0.82, D - 0.008, false));
  g.add(box(len + 0.02, 0.035, D + 0.02, MAT.quartz, 0, top - 0.0175, D / 2));
  const splash = plane(len, 0.55, MAT.tiles);
  splash.position.set(0, top + 0.275, 0.004);
  splash.receiveShadow = true;
  g.add(splash);
  // sink + tap
  const sx = -len / 2 + 0.85;
  g.add(box(0.5, 0.006, 0.38, MAT.steel, sx, top + 0.003, D / 2, false));
  g.add(box(0.44, 0.004, 0.32, MAT.sinkIn, sx, top + 0.007, D / 2, false));
  g.add(cyl(0.013, 0.016, 0.3, MAT.steel, sx, top + 0.15, 0.08, 10));
  const spout = cyl(0.011, 0.011, 0.17, MAT.steel, sx, top + 0.29, 0.155, 8);
  spout.rotation.x = Math.PI / 2;
  g.add(spout);
  // espresso machine + grinder + kettle
  const cx = len / 2 - 0.85;
  g.add(rbox(0.36, 0.38, 0.38, 0.02, MAT.steel, cx, top + 0.19, 0.25));
  g.add(box(0.36, 0.02, 0.38, MAT.dark, cx, top + 0.39, 0.25));
  g.add(box(0.28, 0.1, 0.02, MAT.dark, cx, top + 0.3, 0.445, false));
  g.add(cyl(0.035, 0.035, 0.07, MAT.dark, cx, top + 0.2, 0.47, 10));
  g.add(box(0.28, 0.02, 0.1, MAT.dark, cx, top + 0.02, 0.48, false));
  for (const dx of [-0.08, 0.08]) g.add(cyl(0.028, 0.025, 0.06, MAT.ceramic, cx + dx, top + 0.43, 0.25, 10, false));
  g.add(cyl(0.065, 0.075, 0.22, MAT.dark, cx + 0.34, top + 0.11, 0.22, 12));
  g.add(cyl(0.06, 0.035, 0.12, MAT.water, cx + 0.34, top + 0.28, 0.22, 12, false));
  g.add(cyl(0.07, 0.085, 0.2, MAT.steel, cx - 0.42, top + 0.1, 0.24, 14));
  // fruit bowl
  g.add(cyl(0.13, 0.07, 0.06, MAT.ceramic, -0.05, top + 0.03, 0.3, 16));
  for (const [dx, dz] of [[-0.04, 0], [0.04, 0.02], [0, -0.04]]) g.add(sphere(0.036, MAT.orange, -0.05 + dx, top + 0.075, 0.3 + dz, 10));
  // upper cabinets over the sink half, open oak shelf over the coffee half
  g.add(box(len * 0.5, 0.62, 0.34, MAT.cabinet, -len / 4, 1.86, 0.17));
  for (let i = 1; i < 3; i++) g.add(box(0.006, 0.6, 0.004, MAT.dark, -len / 2 + (i * len) / 6, 1.86, 0.342, false));
  for (let i = 0; i < 3; i++) g.add(box(0.012, 0.12, 0.02, MAT.alu, -len / 2 + ((i + 0.5) * len) / 6 + 0.14, 1.62, 0.35, false));
  g.add(box(len * 0.42, 0.035, 0.26, MAT.oak, len / 4, 1.62, 0.13));
  for (let i = 0; i < 5; i++) {
    g.add(pcyl(0.04, 0.036, 0.095, i % 2 ? '#f3f1ec' : BOOKS[(i * 3) % BOOKS.length], len / 4 - 0.6 + i * 0.16, 1.685, 0.12, 12));
  }
  for (let i = 0; i < 3; i++) g.add(cyl(0.05, 0.05, 0.18, MAT.water, len / 4 + 0.35 + i * 0.13, 1.73, 0.12, 12, false));
  return g;
}

export function makeFridge() {
  const g = new THREE.Group();
  g.add(rbox(0.7, 1.9, 0.66, 0.02, MAT.steel, 0, 0.95, 0.33));
  g.add(box(0.7, 0.006, 0.004, MAT.dark, 0, 1.22, 0.661, false));
  g.add(box(0.025, 0.55, 0.035, MAT.alu, -0.3, 1.55, 0.68));
  g.add(box(0.025, 0.4, 0.035, MAT.alu, -0.3, 0.9, 0.68));
  return g;
}

export function makeDispenser() {
  const g = new THREE.Group();
  g.add(rbox(0.32, 0.95, 0.32, 0.02, MAT.plasticWhite, 0, 0.475, 0.17));
  g.add(box(0.22, 0.2, 0.02, MAT.dark, 0, 0.75, 0.33, false));
  g.add(pbox(0.03, 0.04, 0.03, '#3b82f6', -0.05, 0.8, 0.345, false, 'satin'));
  g.add(pbox(0.03, 0.04, 0.03, '#ef4444', 0.05, 0.8, 0.345, false, 'satin'));
  g.add(box(0.2, 0.02, 0.08, MAT.dark, 0, 0.66, 0.36, false));
  g.add(cyl(0.13, 0.13, 0.36, MAT.water, 0, 1.16, 0.17, 16, false));
  g.add(cyl(0.05, 0.12, 0.08, MAT.water, 0, 0.99, 0.17, 14, false));
  return g;
}

// ---------------------------------------------------------------- lounge
/** modern 3-seater: fabric base, seat + back cushions, slim arms, throw pillows, black steel legs. Front +z. */
export function makeSofa() {
  const g = new THREE.Group();
  const L = 2.2;
  const D = 0.92;
  g.add(rbox(L, 0.22, D, 0.04, MAT.sofa, 0, 0.2, 0));
  g.add(rbox(L, 0.52, 0.18, 0.05, MAT.sofa, 0, 0.55, -D / 2 + 0.09));
  for (const sx of [-1, 1]) g.add(rbox(0.16, 0.34, D, 0.06, MAT.sofa, sx * (L / 2 - 0.08), 0.43, 0));
  for (let i = -1; i <= 1; i++) {
    g.add(rbox(0.62, 0.14, 0.68, 0.05, MAT.sofa, i * 0.63, 0.38, 0.08));
    const back = rbox(0.62, 0.4, 0.17, 0.07, MAT.sofa, i * 0.63, 0.63, -0.26);
    back.rotation.x = -0.14;
    g.add(back);
  }
  for (const [x, c] of [[-0.72, '#c58b3e'], [0.75, '#7d4b3a']]) {
    const p = rbox(0.4, 0.38, 0.12, 0.06, std(c, 0.95, 0, { map: TEX.fabric }), x, 0.64, -0.13);
    p.rotation.set(-0.3, x > 0 ? -0.2 : 0.2, x > 0 ? -0.1 : 0.1);
    g.add(p);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.016, 0.012, 0.09, MAT.metal, sx * (L / 2 - 0.1), 0.045, sz * (D / 2 - 0.1), 6));
  return g;
}

/** oak coffee table (long side along x) with books, a vase and a tray */
export function makeCoffeeTable() {
  const g = new THREE.Group();
  g.add(rbox(1.05, 0.035, 0.56, 0.012, MAT.oak, 0, 0.4, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.03, 0.385, 0.03, MAT.metal, sx * 0.47, 0.19, sz * 0.23));
  g.add(box(0.94, 0.02, 0.45, MAT.metal, 0, 0.12, 0));
  g.add(pbox(0.26, 0.035, 0.2, BOOKS[0], -0.28, 0.435, 0.05, false));
  g.add(pbox(0.22, 0.03, 0.17, BOOKS[1], -0.27, 0.467, 0.04, false));
  g.add(cyl(0.05, 0.035, 0.18, MAT.ceramic, 0.25, 0.508, -0.06, 14));
  for (let i = 0; i < 3; i++) g.add(rod(new THREE.Vector3(0.25, 0.55, -0.06), new THREE.Vector3(0.25 + (i - 1) * 0.06, 0.78 + i * 0.03, -0.06 + (i - 1) * 0.03), 0.004, MAT.stem, 4, false));
  g.add(rbox(0.3, 0.02, 0.2, 0.008, MAT.dark, 0.2, 0.428, 0.1, false));
  return g;
}

export function makePouf() {
  const g = new THREE.Group();
  g.add(rbox(0.46, 0.4, 0.46, 0.12, MAT.pouf, 0, 0.2, 0));
  return g;
}

export function makeFloorLamp() {
  const g = new THREE.Group();
  g.add(cyl(0.14, 0.15, 0.02, MAT.metal, 0, 0.01, 0, 18));
  g.add(cyl(0.012, 0.012, 1.45, MAT.metal, 0, 0.735, 0, 6));
  const shade = mk(cg('lampShade', () => new THREE.CylinderGeometry(0.17, 0.21, 0.28, 20, 1, true)), MAT.shade, 0, 1.52, 0);
  g.add(shade);
  return g;
}

/** stand-up bar table */
export function makeHighTable() {
  const g = new THREE.Group();
  g.add(cyl(0.42, 0.42, 0.035, MAT.oak, 0, 1.04, 0, 28));
  g.add(cyl(0.035, 0.035, 1.02, MAT.metal, 0, 0.52, 0, 10));
  g.add(cyl(0.28, 0.3, 0.025, MAT.metal, 0, 0.0125, 0, 22));
  g.add(cyl(0.04, 0.036, 0.1, MAT.ceramic, 0.12, 1.11, 0.08, 12, false));
  return g;
}

// ---------------------------------------------------------------- lighting fixtures (emissive only, no real lights)
/** soft warm light pool texture (radial falloff), drawn additively under suspended lights */
const POOL_MAT = new THREE.MeshBasicMaterial({
  map: canvasTex(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,236,200,1)');
    g.addColorStop(0.5, 'rgba(255,230,190,0.45)');
    g.addColorStop(1, 'rgba(255,230,190,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  }),
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

/** suspended linear LED bar; origin at the bar, wires go up `drop`, optional light pool `pool` metres below */
export function makeLinearLight(len, drop = 0.7, pool = 0) {
  const g = new THREE.Group();
  g.add(box(len, 0.035, 0.06, MAT.alu, 0, 0, 0, false));
  g.add(box(len - 0.02, 0.006, 0.05, MAT.light, 0, -0.02, 0, false));
  for (const sx of [-1, 1]) g.add(cyl(0.003, 0.003, drop, MAT.metal, sx * (len / 2 - 0.15), drop / 2, 0, 4, false));
  if (pool) {
    const p = plane(len + 0.5, 0.9, POOL_MAT);
    p.rotation.x = -Math.PI / 2;
    p.position.y = -pool;
    p.renderOrder = 2;
    g.add(p);
  }
  return g;
}

/** dome pendant lamp; origin at the bottom of the shade */
export function makePendant(drop = 0.8) {
  const g = new THREE.Group();
  const pts = [[0.02, 0.2], [0.05, 0.19], [0.12, 0.13], [0.2, 0.03], [0.22, 0]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(mk(cg('pendantShade', () => new THREE.LatheGeometry(pts, 20)), MAT.pendant, 0, 0, 0, false));
  g.add(sphere(0.05, MAT.light, 0, 0.04, 0, 12));
  g.add(cyl(0.004, 0.004, drop, MAT.metal, 0, 0.2 + drop / 2, 0, 4, false));
  return g;
}

// ---------------------------------------------------------------- hand props (realistic sizes)
export function makeCup(color = '#f3f1ec') {
  const g = new THREE.Group();
  g.add(cyl(0.038, 0.034, 0.09, accentMat(color, 0.25), 0, 0.045, 0, 12, false));
  g.add(cyl(0.033, 0.033, 0.004, MAT.dark, 0, 0.088, 0, 10, false));
  return g;
}

export function makeReel() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.05, 0.3, MAT.dark, 0, 0.025, 0, false));
  g.add(cyl(0.12, 0.12, 0.012, accentMat('#c6f432'), 0, 0.056, 0, 18, false));
  return g;
}

export function makePaper() {
  const g = new THREE.Group();
  g.add(box(0.21, 0.01, 0.297, MAT.paper, 0, 0, 0, false));
  g.add(box(0.15, 0.012, 0.012, MAT.keys, 0, 0.002, -0.08, false));
  g.add(box(0.15, 0.012, 0.012, MAT.keys, 0, 0.002, -0.03, false));
  return g;
}

export function makePhone() {
  const g = new THREE.Group();
  g.add(rbox(0.072, 0.15, 0.009, 0.004, MAT.dark, 0, 0, 0, false));
  g.add(box(0.064, 0.136, 0.002, new THREE.MeshBasicMaterial({ color: '#8fd3ff', toneMapped: false }), 0, 0, 0.0052, false));
  return g;
}

export function makeTablet() {
  const g = new THREE.Group();
  g.add(rbox(0.25, 0.008, 0.18, 0.006, MAT.dark, 0, 0, 0, false));
  g.add(box(0.23, 0.002, 0.16, new THREE.MeshBasicMaterial({ color: '#bfdbfe', toneMapped: false }), 0, 0.005, 0, false));
  return g;
}

/** over-ear headphones sized for a real head (band radius ≈ 0.1 m) */
export function makeHeadphones(accent = '#1d1e21') {
  const g = new THREE.Group();
  g.add(mk(cg('hpBand', () => new THREE.TorusGeometry(0.098, 0.008, 5, 16, Math.PI)), MAT.dark, 0, 0, 0, false));
  for (const x of [-0.095, 0.095]) {
    const cup = cyl(0.034, 0.034, 0.028, accentMat(accent, 0.4), x, -0.005, 0, 12, false);
    cup.rotation.z = Math.PI / 2;
    g.add(cup);
  }
  return g;
}

// ---------------------------------------------------------------- floor-plan pieces (meeting rooms, core, booths, server, terrace)
/** meeting table: oak top on a black steel frame with side chairs around (perSide per long side, optional end chairs) */
export function makeMeetingTable(len, depth, perSide, { ends = true } = {}) {
  const g = new THREE.Group();
  g.add(rbox(len, 0.04, depth, 0.012, MAT.oak, 0, 0.74, 0));
  for (const sx of [-1, 1]) {
    g.add(box(0.06, 0.72, depth - 0.2, MAT.metal, sx * (len / 2 - 0.25), 0.36, 0));
    g.add(box(0.12, 0.02, depth - 0.1, MAT.metal, sx * (len / 2 - 0.25), 0.01, 0));
  }
  g.add(box(len - 0.5, 0.05, 0.05, MAT.metal, 0, 0.68, 0));
  // cable box + a few notebooks / laptop
  g.add(box(0.3, 0.012, 0.12, MAT.alu, 0, 0.766, 0, false));
  g.add(rbox(0.32, 0.016, 0.22, 0.006, MAT.alu, -len / 4, 0.768, 0.1, false));
  g.add(pbox(0.21, 0.012, 0.29, BOOKS[0], len / 4, 0.766, -0.1, false));
  const add = (x, z, ry) => {
    const c = makeSideChair();
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    g.add(c);
  };
  const step = len / perSide;
  for (let i = 0; i < perSide; i++) {
    const x = -len / 2 + step * (i + 0.5);
    add(x, -depth / 2 - 0.36, 0);
    add(x, depth / 2 + 0.36, Math.PI);
  }
  if (ends) {
    add(-len / 2 - 0.4, 0, Math.PI / 2);
    add(len / 2 + 0.4, 0, -Math.PI / 2);
  }
  return g;
}

/** round café table (white top, steel pedestal) with `chairs` oak stools at radius r + 0.42 */
export function makeRoundTable(r = 0.6, chairs = 4) {
  const g = new THREE.Group();
  g.add(cyl(r, r, 0.035, MAT.quartz, 0, 0.74, 0, 28));
  g.add(cyl(0.04, 0.04, 0.72, MAT.metal, 0, 0.37, 0, 10));
  g.add(cyl(0.26, 0.28, 0.025, MAT.metal, 0, 0.0125, 0, 20));
  g.add(cyl(0.04, 0.036, 0.1, MAT.ceramic, 0.18, 0.81, -0.1, 12, false));
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * Math.PI * 2 + Math.PI / 4;
    const d = r + 0.42;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    g.add(cyl(0.19, 0.19, 0.045, MAT.oak, x, 0.46, z, 18));
    g.add(cyl(0.022, 0.022, 0.44, MAT.metal, x, 0.22, z, 6));
    g.add(cyl(0.16, 0.17, 0.015, MAT.metal, x, 0.008, z, 14, false));
  }
  return g;
}

/** backless terrace bench: oak slats on two concrete blocks (long side along x) */
export function makeBench(len = 2.2) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) g.add(box(len, 0.045, 0.12, MAT.oak, 0, 0.45, -0.21 + i * 0.14));
  for (const x of [-len / 2 + 0.25, len / 2 - 0.25]) g.add(box(0.16, 0.43, 0.5, MAT.concrete, x, 0.215, 0));
  return g;
}

/** dark upholstered waiting bench by the lift core (long side along x, seat both sides) */
export function makeLoungeBench(len = 2.4) {
  const g = new THREE.Group();
  g.add(rbox(len, 0.16, 0.62, 0.05, MAT.leather, 0, 0.38, 0));
  g.add(box(len - 0.2, 0.3, 0.5, MAT.dark, 0, 0.15, 0));
  return g;
}

/** glass phone booth (1.5 × 1.5 m) open on +z: frosted panes in thin black frames, oak shelf at the back + stool */
export function makeBooth() {
  const g = new THREE.Group();
  const w = 1.5;
  const h = 2.15;
  g.add(box(w, 0.03, w, MAT.quartz, 0, 0.015, 0, false));
  for (const [x, z, ry] of [[0, -w / 2, 0], [-w / 2, 0, Math.PI / 2], [w / 2, 0, Math.PI / 2]]) {
    const p = box(w, h - 0.06, 0.012, MAT.glass, x, h / 2, z, false);
    p.rotation.y = ry;
    g.add(p);
    const band = box(w, 0.09, 0.016, MAT.frost, x, 1.1, z, false);
    band.rotation.y = ry;
    g.add(band);
  }
  for (const [x, z] of [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2]]) g.add(box(0.05, h, 0.05, MAT.metal, x, h / 2, z));
  // open top (cut-away): just a slim frame so the person inside stays visible
  for (const s of [-1, 1]) {
    g.add(box(w + 0.05, 0.05, 0.05, MAT.metal, 0, h, s * w / 2));
    g.add(box(0.05, 0.05, w + 0.05, MAT.metal, s * w / 2, h, 0));
  }
  g.add(box(0.95, 0.04, 0.34, MAT.oak, 0, 1.0, -w / 2 + 0.19));
  g.add(cyl(0.19, 0.19, 0.05, MAT.chairFabric, 0, 0.5, -0.05, 16));
  g.add(cyl(0.025, 0.025, 0.48, MAT.alu, 0, 0.25, -0.05, 6));
  g.add(cyl(0.17, 0.18, 0.015, MAT.metal, 0, 0.008, -0.05, 14, false));
  return g;
}

/** teak slat screen (long side along x) */
export function makeSlatScreen(len, h = 2.0) {
  const g = new THREE.Group();
  g.add(box(len, 0.05, 0.12, MAT.walnut, 0, h, 0, false));
  g.add(box(len, 0.05, 0.12, MAT.walnut, 0, 0.025, 0, false));
  const n = Math.floor(len / 0.16);
  for (let i = 0; i <= n; i++) g.add(box(0.05, h, 0.09, i % 2 ? MAT.oak : MAT.walnut, -len / 2 + (i * len) / n, h / 2, 0));
  return g;
}

/** wall TV (origin at the wall, screen faces +z) */
export function makeTV() {
  const g = new THREE.Group();
  g.add(box(1.6, 0.92, 0.05, MAT.bezel, 0, 1.45, 0.025, false));
  const s = box(1.54, 0.86, 0.004, MAT.tvScreen, 0, 1.45, 0.052, false);
  g.add(s);
  return g;
}

/** brushed steel lift doors along local x (facing +z) with a little call-button light */
export function makeLiftDoors(n, len) {
  const g = new THREE.Group();
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + step * (i + 0.5);
    g.add(box(step * 0.72, 2.1, 0.05, MAT.dark, x, 1.05, 0, false));
    g.add(box(step * 0.62, 2.0, 0.02, MAT.steel, x, 1.0, 0.03, false));
    g.add(box(0.006, 2.0, 0.025, MAT.dark, x, 1.0, 0.032, false));
    g.add(box(0.05, 0.08, 0.02, MAT.ledBlue, x + step * 0.42, 1.1, 0.03, false));
  }
  return g;
}

/** 42U server rack: dark cabinet, perforated front, rows of blinking-look LEDs (front +z) */
export function makeRack() {
  const g = new THREE.Group();
  g.add(box(0.6, 2.0, 1.0, MAT.dark, 0, 1.0, 0));
  const front = plane(0.52, 1.85, MAT.chairMesh);
  front.position.set(0, 1.0, 0.502);
  g.add(front);
  for (let r = 0; r < 9; r++) {
    const y = 0.25 + r * 0.19;
    g.add(box(0.5, 0.012, 0.01, MAT.alu, 0, y + 0.07, 0.51, false));
    g.add(box(0.03, 0.02, 0.01, r % 3 === 2 ? MAT.ledAmber : MAT.ledGreen, -0.2, y, 0.512, false));
    g.add(box(0.03, 0.02, 0.01, MAT.ledGreen, -0.15, y, 0.512, false));
  }
  return g;
}

/** round tree in a concrete planter (terrace / open plan) */
export function makeTree(scale = 1, seed = 1) {
  const g = new THREE.Group();
  const R = rng(seed * 31 + 7);
  g.add(cyl(0.5, 0.44, 0.42, MAT.concrete, 0, 0.21, 0, 22));
  g.add(cyl(0.46, 0.46, 0.02, MAT.soil, 0, 0.415, 0, 18, false));
  const top = 1.5 + R() * 0.4;
  g.add(rod(new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(0.03, top, 0.02), 0.045, MAT.stem, 7));
  const blob = cg('treeBlob', () => new THREE.IcosahedronGeometry(1, 2));
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + R();
    const rr = i === 0 ? 0 : 0.28 + R() * 0.12;
    const m = mk(blob, i % 2 ? MAT.leafTree : MAT.leafTree2, Math.cos(a) * rr, top + 0.15 + (i === 0 ? 0.35 : R() * 0.35), Math.sin(a) * rr);
    m.scale.setScalar(i === 0 ? 0.62 : 0.4 + R() * 0.12);
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

/** bean bag */
export function makeBeanbag(color = '#e0892e') {
  const g = new THREE.Group();
  const m = mk(cg('bean', () => new THREE.SphereGeometry(0.5, 18, 12)), std(color, 0.95, 0, { map: TEX.fabric }), 0, 0.27, 0);
  m.scale.set(1, 0.58, 1);
  g.add(m);
  return g;
}

/** standing whiteboard on a steel frame (board faces +z) */
export function makeBoardStand(accent) {
  const g = new THREE.Group();
  const wb = makeWhiteboard(accent);
  wb.position.y = 1.35;
  g.add(wb);
  for (const x of [-0.95, 0.95]) {
    g.add(box(0.04, 1.9, 0.04, MAT.metal, x, 0.95, 0));
    g.add(box(0.06, 0.03, 0.5, MAT.metal, x, 0.015, 0));
  }
  return g;
}

/** tinted flat floor (zone) material, cached per colour */
const zoneCache = new Map();
export function zoneMat(color, roughness = 0.8) {
  if (!zoneCache.has(color)) zoneCache.set(color, std(color, roughness, 0, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  return zoneCache.get(color);
}
