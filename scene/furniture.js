// Procedural clay furniture ("plasticine diorama"). Everything is built from soft primitives with shared materials:
// rounded boxes / lathe cylinders, matte pastel versions of the Arunika palette and one shared clay shader patch
// (fingerprint bump from a tiny tiling canvas texture, soft contact darkening near the floor, warm rim light).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- clay look
/** Tileable "fingerprint" height field → rg = slope (bump), b = height (mottling). Linear data, 128 px. */
function makeClayTexture() {
  const N = 128;
  const h = new Float32Array(N * N);
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // periodic value noise, a few octaves
  for (const [freq, amp] of [[4, 0.55], [8, 0.3], [16, 0.15]]) {
    const g = Array.from({ length: freq * freq }, rnd);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * freq;
        const fy = (y / N) * freq;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const v = (i, j) => g[((j % freq) * freq) + (i % freq)];
        const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
        const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
        h[y * N + x] += (a + (b - a) * sy) * amp;
      }
    }
  }
  // thumb prints: faint concentric ridges around a few centres (wrap-around distance keeps it tileable)
  for (let k = 0; k < 5; k++) {
    const cx = rnd() * N;
    const cy = rnd() * N;
    const R = 18 + rnd() * 16;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let dx = Math.abs(x - cx);
        let dy = Math.abs(y - cy);
        dx = Math.min(dx, N - dx);
        dy = Math.min(dy, N - dy * 1.15);
        const d = Math.hypot(dx, dy);
        if (d < R) h[y * N + x] += Math.sin(d * 1.25) * 0.09 * (1 - d / R);
      }
    }
  }
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      const i = (y * N + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, 128 + dx * 127));
      img.data[i + 1] = Math.max(0, Math.min(255, 128 + dy * 127));
      img.data[i + 2] = Math.max(0, Math.min(255, at(x, y) * 255));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

const CLAY_U = {
  uClayTex: { value: null },
  uClayRim: { value: new THREE.Color('#ffd2a6').multiplyScalar(0.4) },
  uClayBump: { value: 0.32 },
};
/** shared warm rim colour (office.js tints it for day/night) */
export const CLAY_RIM = CLAY_U.uClayRim.value;

/**
 * Turn a MeshStandardMaterial into clay. `extra(shader)` runs first (e.g. leaf sway). All clay materials share the
 * same program per feature set thanks to a constant cache key.
 */
export function clayify(m, { extra = null, key = 'clay', bump = true } = {}) {
  if (!CLAY_U.uClayTex.value) CLAY_U.uClayTex.value = makeClayTexture();
  m.onBeforeCompile = (sh) => {
    extra?.(sh);
    Object.assign(sh.uniforms, CLAY_U);
    sh.vertexShader = `varying vec3 vClayW;\n${sh.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 clayW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        clayW = instanceMatrix * clayW;
      #endif
      vClayW = (modelMatrix * clayW).xyz;`,
    );
    sh.fragmentShader = `uniform sampler2D uClayTex;\nuniform vec3 uClayRim;\nuniform float uClayBump;\nvarying vec3 vClayW;\n${sh.fragmentShader}`
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 cnW = inverseTransformDirection(normal, viewMatrix);
          vec3 an = abs(cnW);
          bool upF = an.y > max(an.x, an.z);
          bool xF = !upF && an.x > an.z;
          vec2 cuv = upF ? vClayW.xz : (xF ? vClayW.zy : vClayW.xy);
          vec4 cn = texture2D(uClayTex, cuv * 1.1);
          vec2 cd = (cn.rg - 0.5) * 2.0 * ${bump ? 'uClayBump' : '0.0'};
          vec3 ct1 = upF ? vec3(1.0, 0.0, 0.0) : (xF ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0));
          vec3 ct2 = upF ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
          cnW = normalize(cnW + ct1 * cd.x + ct2 * cd.y);
          normal = normalize((viewMatrix * vec4(cnW, 0.0)).xyz);
          // contact darkening: vertical faces near the floor + undersides (cheap baked-AO feel)
          float cSide = 1.0 - smoothstep(0.5, 0.9, cnW.y);
          float cAO = mix(1.0, mix(0.7, 1.0, smoothstep(0.02, 0.55, vClayW.y)), cSide);
          cAO *= mix(1.0, 0.8, smoothstep(0.3, 0.95, -cnW.y));
          diffuseColor.rgb *= cAO * (0.965 + cn.b * 0.07);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 cvd = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
          float cRim = pow(1.0 - saturate(dot(normal, cvd)), 2.6);
          // soft fake subsurface: warm rim + a whisper of warm self-light
          outgoingLight += diffuseColor.rgb * uClayRim * (cRim * 1.4 + 0.12);
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
  return m;
}

/** Arunika colour → clay pigment: a touch desaturated, lifted, blacks softened to warm charcoal. */
const _hsl = { h: 0, s: 0, l: 0 };
const WARM = new THREE.Color('#5a4a3e');
export function pastel(color, { lift = 0.06, desat = 0.82 } = {}) {
  const c = new THREE.Color(color);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  let l = _hsl.l;
  if (l < 0.3) l = 0.2 + l * 0.72; // black steel → dark charcoal clay
  else l += (1 - l) * lift;
  c.setHSL(_hsl.h, _hsl.s * desat, Math.min(0.97, l), THREE.SRGBColorSpace);
  if (_hsl.s < 0.12) c.lerp(WARM, l < 0.4 ? 0.12 : 0.03); // greys get a hint of warmth
  return c;
}

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    const { metalness, roughness, flatShading, ...rest } = opts;
    const m = new THREE.MeshStandardMaterial({ color: pastel(color), roughness: 0.9, metalness: 0, ...rest });
    if (!rest.transparent) clayify(m);
    else clayify(m, { key: 'clay-t' });
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// ---------------------------------------------------------------- soft geometry
const geoCache = new Map();
/**
 * Rounded (pillowy) box when big enough to read; long thin bars become soft round rods (cheap toy legs/rails);
 * paper-thin details stay plain boxes. Triangle budget matters on the Intel GPU, so rounding stays at 1–2 segments.
 */
function boxGeo(w, h, d) {
  const key = `b${w}|${h}|${d}`;
  if (!geoCache.has(key)) {
    const dims = [w, h, d];
    const sorted = [...dims].sort((p, q) => p - q);
    const [a, b, c] = sorted;
    let geo;
    if (b <= 0.24 && c >= b * 3 && a >= b * 0.45) {
      // rod along the longest axis
      const r = (a + b) / 4;
      geo = new THREE.CylinderGeometry(r, r, c, 6, 1);
      const axis = dims.indexOf(c);
      if (axis === 0) geo.rotateZ(Math.PI / 2);
      else if (axis === 2) geo.rotateX(Math.PI / 2);
    } else if (a < 0.06) geo = new THREE.BoxGeometry(w, h, d);
    else {
      const r = Math.min(a * 0.42, 0.14);
      geo = new RoundedBoxGeometry(w, h, d, r >= 0.07 ? 2 : 1, r);
    }
    geoCache.set(key, geo);
  }
  return geoCache.get(key);
}
/** Cylinders with a soft rounded rim (lathe) when they are chunky; thin rods / discs stay simple. */
function cylGeo(rt, rb, h, seg = 16) {
  const key = `c${rt}|${rb}|${h}|${seg}`;
  if (!geoCache.has(key)) {
    const R = Math.max(rt, rb);
    let geo;
    if (R >= 0.15 && h >= 0.05) {
      const b = Math.min(h * 0.45, R * 0.35, 0.09);
      const pts = [
        [0.0001, 0], [Math.max(0.001, rb - b * 1.6), 0], [rb - b * 0.3, b * 0.3], [rb, b],
        [rt, h - b], [rt - b * 0.3, h - b * 0.3], [Math.max(0.001, rt - b * 1.6), h], [0.0001, h],
      ].map(([x, y]) => new THREE.Vector2(x, y - h / 2));
      geo = new THREE.LatheGeometry(pts, Math.max(10, Math.min(seg, 12)));
    } else geo = new THREE.CylinderGeometry(rt, rb, h, Math.min(seg, 12));
    geoCache.set(key, geo);
  }
  return geoCache.get(key);
}

export function box(w, h, d, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** soft blob (smooth low-poly sphere) shared geometry, used for leaves, beanbags … */
const blobGeoCache = new Map();
export function blobGeo(r) {
  const k = r.toFixed(3);
  if (!blobGeoCache.has(k)) blobGeoCache.set(k, new THREE.IcosahedronGeometry(r, 1));
  return blobGeoCache.get(k);
}

// Menara Arunika palette: teraso terang, baja hitam doff, kayu jati, beton ekspos, tanaman tropis.
export const PALETTE = {
  white: '#fafafa',
  desk: '#f3f1ee',
  deskLeg: '#404040',
  dark: '#262626',
  darker: '#171717',
  metal: '#8a8a8a',
  steel: '#404040',
  pot: '#e1ddd7',
  potDark: '#cecac3',
  leaf: '#3a9742',
  leafDark: '#286f2f',
  chairGreen: '#404040',
  chairPink: '#5a5a5a',
  wood: '#c69b78',
  woodDark: '#926749',
  terrazzo: '#f3f1ee',
  concrete: '#e1ddd7',
  glass: '#bddcf7',
};
const STATIC_SCREEN = new THREE.MeshBasicMaterial({ color: '#1f2633', toneMapped: false });

// ---------------------------------------------------------------- monitor screen
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
      // screensaver: slow drifting accent blob + clock-ish bar
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
      ctx.fillText('Kantor AI', w - bx * 0.4 - 30, h - by * 0.5 - 6);
    } else if (mode === 'prompt') {
      // Prompt Engineer: teks prompt bergulir (monospace), kata kunci berwarna, kursor berkedip
      ctx.fillStyle = '#0f1b1a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = this.accent;
      ctx.fillRect(0, 0, w, 11);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('PROMPT.txt', 5, 2);
      ctx.font = '600 8px "JetBrains Mono", monospace';
      const n = PROMPT_WORDS.length;
      const start = this.offset;
      for (let i = 0; i < 8; i++) {
        let x = 6;
        const y = 15 + i * 10;
        const row = start + i;
        for (let k = 0; k < 4 && x < w - 10; k++) {
          const word = PROMPT_WORDS[(row * 5 + k * 3) % n];
          const hot = (row + k) % 5 === 0;
          ctx.fillStyle = hot ? '#5eead4' : word.startsWith('--') ? '#facc15' : 'rgba(230,245,242,0.78)';
          ctx.fillText(word, x, y);
          x += ctx.measureText(word).width + 5;
        }
      }
      if (this.offset % 2 === 0) {
        ctx.fillStyle = '#5eead4';
        ctx.fillRect(6 + ((this.offset * 11) % 120), 15 + 7 * 10, 5, 8);
      }
    } else if (mode === 'transcript') {
      ctx.fillStyle = '#10141d';
      ctx.fillRect(0, 0, w, h);
      // waveform
      ctx.fillStyle = this.accent;
      for (let i = 0; i < 38; i++) {
        const a = Math.abs(Math.sin(i * 0.9 + this.offset * 0.8) * Math.cos(i * 0.31 + this.offset * 0.3));
        const bh = 3 + a * 18;
        ctx.fillRect(6 + i * 4, 18 - bh / 2, 2.5, bh);
      }
      // scrolling subtitle lines
      ctx.font = '600 9px "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      this.lines.slice(-5).forEach((line, i) => {
        ctx.fillStyle = i === 4 ? '#c6f432' : 'rgba(255,255,255,0.55)';
        let x = 8;
        for (const sg of line.segs) {
          ctx.fillRect(x, 36 + i * 11, sg.w * 0.8, 5);
          x += sg.w * 0.8 + 4;
        }
      });
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(`00:${String(this.offset % 60).padStart(2, '0')}`, w - 34, 4);
    } else if (mode === 'render') {
      ctx.fillStyle = '#121620';
      ctx.fillRect(0, 0, w, h);
      // 9:16 frame preview
      ctx.fillStyle = '#3a4a6b';
      ctx.fillRect(w / 2 - 17, 8, 34, 52);
      ctx.fillStyle = '#c6f432';
      ctx.fillRect(w / 2 - 12, 48, 24, 4);
      const p = (this.pct || 0) / 100;
      ctx.fillStyle = '#2a3142';
      ctx.fillRect(10, 70, w - 20, 9);
      ctx.fillStyle = this.accent;
      ctx.fillRect(10, 70, (w - 20) * p, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(10 + ((this.offset * 9) % Math.max(1, (w - 20) * p)), 70, 6, 9);
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
      // window chrome
      ctx.fillStyle = reviewing ? '#f5c451' : this.accent;
      ctx.fillRect(0, 0, w, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(7 + i * 8, 5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // sidebar
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
      // caret
      if (this.offset % 2 === 0) {
        ctx.fillStyle = '#111827';
        ctx.fillRect(34 + (this.offset * 7) % 90, 17 + 8 * 9, 2, 6);
      }
    }
    this.texture.needsUpdate = true;
  }
}

const PROMPT_WORDS = ['cinematic', 'soft light,', 'Subject:', 'close-up', '--ar 9:16', 'warm tones,', 'Peran:', 'Tugas:', 'detailed', '--v 7', 'Camera:', 'dolly-in', 'Style:', 'shallow DOF', '[Chorus]', 'upbeat,', 'Format:', 'Batasan:', '--stylize', 'golden hour'];

// ---------------------------------------------------------------- pieces
let _screenGeo = null;
let _glowGeo = null;
const screenGeo = () => (_screenGeo ||= new THREE.PlaneGeometry(0.86, 0.5));
const glowGeo = () => (_glowGeo ||= new THREE.PlaneGeometry(1.5, 1.0));

export function makeDesk({ accent, chairColor, live = true }) {
  const g = new THREE.Group();
  const top = box(1.92, 0.12, 0.97, mat(PALETTE.desk), 0, 0.745, 0);
  g.add(top);
  const legM = mat(PALETTE.deskLeg);
  for (const [x, z] of [[-0.85, -0.38], [0.85, -0.38], [-0.85, 0.38], [0.85, 0.38]]) g.add(box(0.085, 0.72, 0.085, legM, x, 0.36, z));
  // modesty panel
  g.add(box(1.62, 0.36, 0.05, mat('#e5e5e5'), 0, 0.5, -0.4, false));

  // monitor (screen faces +z toward the chair)
  const monitor = new THREE.Group();
  monitor.position.set(0, 0.8, -0.22);
  // chunky toy monitor: fat rounded bezel on a stubby neck
  monitor.add(box(0.34, 0.05, 0.22, mat(PALETTE.metal), 0, 0.02, -0.01));
  monitor.add(box(0.09, 0.3, 0.07, mat(PALETTE.metal), 0, 0.17, -0.04));
  monitor.add(box(1.0, 0.64, 0.13, mat(PALETTE.darker), 0, 0.5, -0.04));
  const screen = live ? new MonitorScreen(accent) : null;
  const screenMesh = new THREE.Mesh(screenGeo(), live ? screen.material : STATIC_SCREEN);
  screenMesh.position.set(0, 0.5, 0.0265);
  monitor.add(screenMesh);
  // soft glow card behind/below screen (visible when working)
  let glow = null;
  if (live) {
    const glowMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    glow = new THREE.Mesh(glowGeo(), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.012, 0.4);
    glow.userData.keep = true;
    monitor.add(glow);
  }
  g.add(monitor);

  // keyboard + mouse + mug
  g.add(box(0.52, 0.025, 0.17, mat('#e5e5e5'), 0, 0.805, 0.15, false));
  g.add(box(0.07, 0.025, 0.1, mat('#e5e5e5'), 0.42, 0.805, 0.16, false));
  g.add(cyl(0.05, 0.045, 0.1, mat(accent), -0.68, 0.85, 0.05, 10));
  // paper stack
  g.add(box(0.26, 0.03, 0.34, mat('#ffffff'), 0.68, 0.81, -0.05));

  // chair at +z
  const chair = makeChair(chairColor);
  chair.position.set(0, 0, 0.95);
  g.add(chair);

  // film reel box placed on the desk when a clipper brings one back (hidden until then)
  let reel = null;
  if (live) {
    reel = makeReel();
    reel.position.set(0.66, 0.84, 0.18);
    reel.visible = false;
    reel.userData.keep = true;
    g.add(reel);
    screenMesh.userData.keep = true;
  }
  return { group: g, screen, glow, chair, reel, seat: new THREE.Vector3(0, 0, 0.95) };
}

export function makeChair(color) {
  const g = new THREE.Group();
  const c = mat(color);
  g.add(box(0.54, 0.15, 0.54, c, 0, 0.46, 0));
  g.add(box(0.5, 0.48, 0.14, c, 0, 0.77, 0.23));
  g.add(cyl(0.045, 0.045, 0.36, mat(PALETTE.steel), 0, 0.26, 0, 6));
  // toy swivel base: one soft charcoal puck instead of five spokes
  g.add(cyl(0.23, 0.25, 0.045, mat(PALETTE.steel), 0, 0.03, 0, 12));
  return g;
}

/** Leaf sway clock shared by every plant (office.js advances it). */
export const SWAY_U = { value: 0 };
const leafCache = new Map();
function leafMat(color) {
  if (!leafCache.has(color)) {
    const m = new THREE.MeshStandardMaterial({ color: pastel(color, { lift: 0.04, desat: 0.86 }), roughness: 0.92, metalness: 0 });
    clayify(m, {
      key: 'clay-sway',
      extra: (sh) => {
        sh.uniforms.uSway = SWAY_U;
        sh.vertexShader = `uniform float uSway;\n${sh.vertexShader}`.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float swK = clamp((position.y - 0.55) / 1.6, 0.0, 1.0);
          transformed.x += sin(uSway * 1.3 + position.x * 0.9 + position.z * 0.4) * 0.035 * swK;
          transformed.z += cos(uSway * 1.05 + position.z * 0.8 + position.x * 0.3) * 0.025 * swK;`,
        );
      },
    });
    leafCache.set(color, m);
  }
  return leafCache.get(color);
}

export function makePlant(scale = 1, variant = 0) {
  const g = new THREE.Group();
  const potM = mat(variant % 2 ? PALETTE.white : PALETTE.pot);
  g.add(cyl(0.26, 0.2, 0.42, potM, 0, 0.21, 0, 14));
  g.add(cyl(0.23, 0.23, 0.04, mat('#6b5440'), 0, 0.41, 0, 12));
  const leafA = leafMat(PALETTE.leaf);
  const leafB = leafMat(PALETTE.leafDark);
  // blobby clay foliage: soft squashed balls stacked like a sculpted shrub
  const blobs = variant === 2
    ? [[0, 0.95, 0, 0.33], [0.03, 1.42, 0.02, 0.27], [0, 1.82, 0, 0.19]]
    : [[0, 0.82, 0, 0.37], [0.2, 1.08, 0.07, 0.27], [-0.17, 1.14, -0.06, 0.25], [0.02, 1.38, 0, 0.21]];
  blobs.forEach(([x, y, z, r], i) => {
    const m = new THREE.Mesh(blobGeo(r), i % 2 ? leafB : leafA);
    m.position.set(x, y, z);
    m.scale.set(1.05, 0.86, 1.05);
    m.rotation.y = i * 1.3;
    m.castShadow = true;
    g.add(m);
  });
  if (variant === 2) g.add(cyl(0.035, 0.035, 1.3, mat('#7a5a3c'), 0, 1.0, 0, 6));
  g.scale.setScalar(scale);
  return g;
}

export function makeWhiteboard(accent, { stand = false } = {}) {
  const g = new THREE.Group();
  if (stand) {
    const steel = mat(PALETTE.steel);
    for (const x of [-1.45, 1.45]) {
      g.add(box(0.05, 2.2, 0.05, steel, x, 1.1, -0.03));
      g.add(box(0.06, 0.04, 0.6, steel, x, 0.02, -0.03, false));
    }
  }
  g.add(box(3.0, 1.45, 0.05, mat('#ffffff', { roughness: 0.35 }), 0, 1.45, 0));
  const frame = mat('#c4cad3');
  g.add(box(3.08, 0.05, 0.07, frame, 0, 2.2, 0));
  g.add(box(3.08, 0.05, 0.07, frame, 0, 0.7, 0));
  g.add(box(0.05, 1.55, 0.07, frame, -1.53, 1.45, 0));
  g.add(box(0.05, 1.55, 0.07, frame, 1.53, 1.45, 0));
  g.add(box(2.6, 0.04, 0.14, frame, 0, 0.68, 0.06));
  // marker lines
  const colors = [accent, '#3b82f6', '#ef4444', '#10b981', '#111827'];
  for (let i = 0; i < 6; i++) {
    const w = 0.5 + Math.random() * 1.6;
    const line = box(w, 0.035, 0.01, mat(colors[i % colors.length]), -1.3 + w / 2 + Math.random() * 0.3, 2.0 - i * 0.2, 0.03, false);
    g.add(line);
  }
  // sticky notes
  const notes = ['#ffe066', '#ffa8a8', '#a5d8ff', '#b2f2bb'];
  notes.forEach((c, i) => g.add(box(0.2, 0.2, 0.01, mat(c), 0.85 + (i % 2) * 0.26, 1.85 - Math.floor(i / 2) * 0.26, 0.035, false)));
  // moment cards (hidden) that a clipper sticks on the board one by one
  const cardColors = ['#c6f432', '#ffd43b', '#ff8787', '#74c0fc', '#b197fc', '#63e6be', '#ffa94d', '#f783ac'];
  const cards = cardColors.map((c, i) => {
    const m = box(0.24, 0.34, 0.012, mat(c), -1.2 + (i % 4) * 0.36, 1.62 - Math.floor(i / 4) * 0.44, 0.04, false);
    m.rotation.z = ((i * 37) % 9 - 4) * 0.03;
    m.visible = false;
    m.userData.keep = true;
    g.add(m);
    return m;
  });
  g.userData.cards = cards;
  // markers on tray
  [accent, '#3b82f6', '#ef4444'].forEach((c, i) => {
    const m = cyl(0.02, 0.02, 0.16, mat(c), -0.3 + i * 0.14, 0.72, 0.08, 6);
    m.rotation.z = Math.PI / 2;
    g.add(m);
  });
  return g;
}

export function makeShelf(accent) {
  const g = new THREE.Group();
  const body = mat('#eef1f4');
  g.add(box(1.6, 0.05, 0.42, body, 0, 0.02, 0));
  for (let i = 1; i <= 3; i++) g.add(box(1.6, 0.04, 0.42, body, 0, i * 0.5, 0));
  g.add(box(0.04, 1.52, 0.42, body, -0.78, 0.76, 0));
  g.add(box(0.04, 1.52, 0.42, body, 0.78, 0.76, 0));
  const bookColors = [accent, '#ffd43b', '#74c0fc', '#ff8787', '#63e6be', '#adb5bd', '#4c6ef5'];
  for (let s = 0; s < 3; s++) {
    let x = -0.7;
    while (x < 0.62) {
      const w = 0.06 + Math.random() * 0.07;
      const h = 0.28 + Math.random() * 0.14;
      if (Math.random() > 0.15) {
        g.add(box(w, h, 0.28, mat(bookColors[Math.floor(Math.random() * bookColors.length)]), x + w / 2, s * 0.5 + 0.04 + h / 2, 0, false));
      }
      x += w + 0.015;
    }
  }
  return g;
}

export function makeDispenser() {
  const g = new THREE.Group();
  g.add(box(0.42, 0.95, 0.42, mat('#f4f6f8'), 0, 0.475, 0));
  g.add(box(0.3, 0.12, 0.05, mat('#d0d5dd'), 0, 0.72, 0.22));
  g.add(box(0.06, 0.06, 0.05, mat('#4dabf7'), -0.07, 0.62, 0.23));
  g.add(box(0.06, 0.06, 0.05, mat('#ff6b6b'), 0.07, 0.62, 0.23));
  const bottle = cyl(0.17, 0.17, 0.5, mat('#9fd3ff', { transparent: true, opacity: 0.75, roughness: 0.1 }), 0, 1.22, 0, 16);
  g.add(bottle);
  g.add(cyl(0.06, 0.12, 0.08, mat('#9fd3ff', { transparent: true, opacity: 0.75 }), 0, 0.99, 0, 12));
  return g;
}

/** Division-specific hero prop for a bit of storytelling per room. */
export function makeSignature(division, accent) {
  const g = new THREE.Group();
  switch (division) {
    case 'riset': {
      // globe on stand
      g.add(cyl(0.18, 0.24, 0.06, mat(PALETTE.dark), 0, 0.03, 0));
      g.add(cyl(0.025, 0.025, 0.6, mat(PALETTE.metal), 0, 0.33, 0, 8));
      const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 2), mat('#74c0fc'));
      globe.position.y = 0.95;
      globe.userData.keep = true;
      g.add(globe);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 32), mat(accent));
      ring.position.y = 0.95;
      ring.rotation.x = Math.PI / 2.4;
      g.add(ring);
      g.userData.spin = globe;
      break;
    }
    case 'redaksi': {
      g.add(makeShelf(accent));
      break;
    }
    case 'medsos': {
      // ring light + phone
      g.add(cyl(0.2, 0.26, 0.04, mat(PALETTE.dark), 0, 0.02, 0));
      g.add(cyl(0.02, 0.02, 1.3, mat(PALETTE.metal), 0, 0.67, 0, 8));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: '#fff7e0', toneMapped: false }));
      ring.position.y = 1.5;
      g.add(ring);
      g.add(box(0.18, 0.34, 0.02, mat(PALETTE.darker), 0, 1.5, 0.02));
      break;
    }
    case 'desain': {
      // easel with canvas
      const wood = mat(PALETTE.wood);
      const l1 = box(0.05, 1.7, 0.05, wood, -0.35, 0.82, 0);
      l1.rotation.z = 0.12;
      const l2 = box(0.05, 1.7, 0.05, wood, 0.35, 0.82, 0);
      l2.rotation.z = -0.12;
      const l3 = box(0.05, 1.6, 0.05, wood, 0, 0.78, -0.35);
      l3.rotation.x = -0.25;
      g.add(l1, l2, l3);
      g.add(box(0.95, 0.05, 0.12, wood, 0, 0.62, 0.06));
      g.add(box(0.9, 0.75, 0.04, mat('#ffffff'), 0, 1.05, 0.06));
      g.add(box(0.36, 0.36, 0.01, mat(accent), -0.15, 1.12, 0.085, false));
      const sun = cyl(0.13, 0.13, 0.01, mat('#ffd43b'), 0.2, 1.22, 0.085, 16);
      sun.rotation.x = Math.PI / 2;
      sun.castShadow = false;
      g.add(sun);
      g.add(box(0.8, 0.12, 0.01, mat('#69db7c'), 0, 0.76, 0.085, false));
      break;
    }
    case 'video': {
      // tripod camera
      const legM = mat(PALETTE.dark);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = box(0.04, 1.25, 0.04, legM, Math.cos(a) * 0.22, 0.6, Math.sin(a) * 0.22);
        leg.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32);
        g.add(leg);
      }
      const cam = new THREE.Group();
      cam.position.y = 1.32;
      cam.add(box(0.44, 0.28, 0.26, mat(PALETTE.darker)));
      const lens = cyl(0.1, 0.12, 0.2, mat('#3d4352'), 0, 0, 0.2, 16);
      lens.rotation.x = Math.PI / 2;
      cam.add(lens);
      const rec = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff3b47', toneMapped: false }));
      rec.position.set(0.15, 0.1, 0.13);
      cam.add(rec);
      rec.userData.keep = true;
      g.add(cam);
      g.userData.blink = rec;
      break;
    }
    case 'cs': {
      // round meeting table with stools + headset
      g.add(cyl(0.6, 0.6, 0.05, mat(PALETTE.white), 0, 0.72, 0, 24));
      g.add(cyl(0.05, 0.05, 0.7, mat(PALETTE.metal), 0, 0.36, 0, 8));
      g.add(cyl(0.28, 0.3, 0.03, mat(PALETTE.metal), 0, 0.015, 0, 16));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        g.add(cyl(0.2, 0.2, 0.06, mat(i % 2 ? PALETTE.chairPink : PALETTE.chairGreen), Math.cos(a) * 0.95, 0.46, Math.sin(a) * 0.95, 14));
        g.add(cyl(0.03, 0.03, 0.44, mat(PALETTE.metal), Math.cos(a) * 0.95, 0.22, Math.sin(a) * 0.95, 6));
      }
      const hs = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 16, Math.PI), mat(accent));
      hs.position.set(0.1, 0.76, 0.05);
      g.add(hs);
      break;
    }
    case 'analitik': {
      // bar chart sculpture
      g.add(box(1.2, 0.08, 0.5, mat(PALETTE.white), 0, 0.04, 0));
      const hs = [0.5, 0.85, 0.65, 1.25];
      const cs = ['#ced4da', '#a5b4fc', accent, '#34d399'];
      hs.forEach((h, i) => g.add(box(0.2, h, 0.3, mat(cs[i]), -0.42 + i * 0.28, 0.08 + h / 2, 0)));
      break;
    }
    case 'clipper': {
      // big editing monitor on a stand: timeline + a vertical 9:16 video frame with lime subtitles
      g.add(box(0.72, 0.07, 0.42, mat(PALETTE.dark), 0, 0.035, 0));
      g.add(box(0.12, 1.2, 0.12, mat(PALETTE.metal), 0, 0.62, -0.02));
      g.add(box(1.8, 1.1, 0.12, mat(PALETTE.darker), 0, 1.65, 0));
      const editor = new EditorScreen(accent);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.95), editor.material);
      screen.position.set(0, 1.65, 0.062);
      screen.userData.keep = true;
      g.add(screen);
      g.userData.editor = editor;
      const rec = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: '#c6f432', toneMapped: false }));
      rec.position.set(0.78, 2.12, 0.07);
      rec.userData.keep = true;
      g.add(rec);
      g.userData.blink = rec;
      break;
    }
    case 'iklan': {
      // monitor motion graphics: pratinjau iklan 9:16 mini yang bergerak + progres render, lampu REC merah
      g.add(box(0.72, 0.07, 0.42, mat(PALETTE.dark), 0, 0.035, 0));
      g.add(box(0.12, 1.2, 0.12, mat(PALETTE.metal), 0, 0.62, -0.02));
      g.add(box(1.8, 1.1, 0.12, mat(PALETTE.darker), 0, 1.65, 0));
      const editor = new AdScreen(accent);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.95), editor.material);
      screen.position.set(0, 1.65, 0.062);
      screen.userData.keep = true;
      g.add(screen);
      g.userData.editor = editor;
      const rec = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff3b47', toneMapped: false }));
      rec.position.set(0.78, 2.12, 0.07);
      rec.userData.keep = true;
      g.add(rec);
      g.userData.blink = rec;
      break;
    }
    case 'carousel': {
      // monitor desain carousel: tumpukan slide 4:5 yang bergeser saat render + penghitung slide, lampu biru
      g.add(box(0.72, 0.07, 0.42, mat(PALETTE.dark), 0, 0.035, 0));
      g.add(box(0.12, 1.2, 0.12, mat(PALETTE.metal), 0, 0.62, -0.02));
      g.add(box(1.8, 1.1, 0.12, mat(PALETTE.darker), 0, 1.65, 0));
      const editor = new SlideScreen(accent);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.95), editor.material);
      screen.position.set(0, 1.65, 0.062);
      screen.userData.keep = true;
      g.add(screen);
      g.userData.editor = editor;
      const rec = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: '#60a5fa', toneMapped: false }));
      rec.position.set(0.78, 2.12, 0.07);
      rec.userData.keep = true;
      g.add(rec);
      g.userData.blink = rec;
      break;
    }
    default:
      break;
  }
  return g;
}

const SLIDE_COLS = [['#1e3a8a', '#2563eb'], ['#0f766e', '#14b8a6'], ['#7c2d12', '#f97316'], ['#4c1d95', '#a855f7'], ['#831843', '#ec4899']];

function drawMiniSlide(x, px, py, w, h, cols, n, accent) {
  const g = x.createLinearGradient(0, py, 0, py + h);
  g.addColorStop(0, cols[0]);
  g.addColorStop(1, cols[1]);
  x.fillStyle = g;
  x.beginPath();
  x.roundRect(px, py, w, h, 6);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.fillRect(px + 8, py + 12, w * 0.32, 5);
  x.fillStyle = accent;
  x.font = `800 ${Math.round(w * 0.22)}px "Inter", sans-serif`;
  x.textBaseline = 'top';
  x.fillText(String(n).padStart(2, '0'), px + 8, py + h * 0.28);
  x.fillStyle = '#ffffff';
  x.fillRect(px + 8, py + h * 0.55, w * 0.7, 7);
  x.fillRect(px + 8, py + h * 0.55 + 12, w * 0.5, 7);
  x.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 4; i++) x.fillRect(px + w / 2 - 14 + i * 8, py + h - 12, i === n % 4 ? 8 : 4, 3);
}

/**
 * Monitor Divisi Desainer Carousel: saat render, slide 4:5 bergeser satu per satu (seperti di-swipe) + "SLIDE 3/7"
 * dan bar progres. Digambar ulang ±12 fps hanya saat aktif.
 */
export class SlideScreen {
  constructor(accent) {
    this.accent = accent;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 296;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.active = false;
    this.progress = 0;
    this.label = '';
    this.t = 0;
    this.acc = 0;
    this.draw();
  }

  set(active, progress, label) {
    const changed = active !== this.active || label !== this.label;
    this.active = active;
    this.progress = progress;
    this.label = label;
    if (changed && !active) this.draw();
  }

  tick(dt) {
    if (!this.active) return;
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / 12) return;
    this.acc = 0;
    this.draw();
  }

  draw() {
    const x = this.ctx;
    x.fillStyle = '#121725';
    x.fillRect(0, 0, 512, 296);
    // area kanvas (kiri): slide 4:5
    const fw = 152;
    const fh = 190;
    const fx = 30;
    const fy = 24;
    x.fillStyle = '#1b2236';
    x.fillRect(fx - 14, fy - 12, fw + 28, fh + 40);
    x.save();
    x.beginPath();
    x.rect(fx - 14, fy - 12, fw + 28, fh + 40);
    x.clip();
    if (this.active) {
      const per = 1.1;
      const k = (this.t % per) / per;
      const e = k < 0.65 ? 0 : (k - 0.65) / 0.35;
      const slide = Math.floor(this.t / per);
      const off = -e * e * (3 - 2 * e) * (fw + 18);
      for (let i = 0; i < 3; i++) {
        const n = slide + i;
        drawMiniSlide(x, fx + off + i * (fw + 18), fy, fw, fh, SLIDE_COLS[n % SLIDE_COLS.length], (n % 9) + 1, '#ffe14d');
      }
    } else {
      drawMiniSlide(x, fx, fy, fw, fh, ['#1e293b', '#334155'], 1, this.accent);
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.fillRect(fx, fy, fw, fh);
    }
    x.restore();
    // panel kanan
    x.textBaseline = 'top';
    if (this.active) {
      const m = /(\d+)\/(\d+)/.exec(this.label || '');
      x.fillStyle = '#ffffff';
      x.font = '800 24px "Inter", sans-serif';
      x.fillText('RENDER SLIDE', 222, 30);
      x.font = '700 50px "JetBrains Mono", monospace';
      x.fillText(m ? `${m[1]}/${m[2]}` : '…', 222, 66);
      x.font = '600 16px "Inter", sans-serif';
      x.fillStyle = 'rgba(255,255,255,0.7)';
      x.fillText('SVG → PNG', 222, 128);
      x.fillStyle = '#2a3142';
      x.fillRect(222, 160, 260, 16);
      x.fillStyle = this.accent;
      x.fillRect(222, 160, 260 * Math.max(0.03, this.progress), 16);
    } else {
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.font = '700 18px "Inter", sans-serif';
      x.fillText('Desainer Carousel', 222, 34);
      x.fillStyle = 'rgba(255,255,255,0.3)';
      x.font = '600 14px "Inter", sans-serif';
      x.fillText('Menunggu topik…', 222, 62);
    }
    // strip thumbnail di bawah (seperti panel slide)
    x.fillStyle = '#0d1017';
    x.fillRect(8, 240, 496, 48);
    for (let i = 0; i < 9; i++) {
      const on = this.active && i === Math.floor(this.t / 1.1) % 9;
      x.fillStyle = SLIDE_COLS[i % SLIDE_COLS.length][1];
      x.globalAlpha = on ? 1 : 0.45;
      x.fillRect(18 + i * 54, 248, 30, 34);
      if (on) {
        x.strokeStyle = '#ffffff';
        x.lineWidth = 2;
        x.strokeRect(17 + i * 54, 247, 32, 36);
      }
    }
    x.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }
}

/** Kipas slide melayang di atas meja Kirana saat render (5 kartu 4:5 yang membuka seperti kipas). */
export function makeSlideFan() {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.3, 0.375);
  geo.translate(0, 0.19, 0);
  const cards = SLIDE_COLS.map(([a, b], i) => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 80;
    drawMiniSlide(c.getContext('2d'), 2, 2, 60, 76, [a, b], i + 1, '#ffe14d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, side: THREE.DoubleSide }));
    m.position.z = i * 0.004;
    g.add(m);
    return m;
  });
  g.visible = false;
  g.userData.keep = true;
  let open = 0;
  let t = 0;
  g.userData.tick = (dt, active) => {
    t += dt;
    open += ((active ? 1 : 0) - open) * Math.min(1, dt * 4);
    g.visible = open > 0.02;
    if (!g.visible) return;
    g.scale.setScalar(0.4 + open * 0.6);
    g.position.y = g.userData.baseY + Math.sin(t * 2) * 0.05 * open;
    cards.forEach((m, i) => {
      m.rotation.z = (i - 2) * 0.32 * open + Math.sin(t * 3 + i) * 0.03 * open;
    });
  };
  return g;
}

/**
 * Papan kalender besar Divisi Perencana Konten (berdiri, menghadap selatan): grid 7×5 hari + kartu tempel berwarna.
 * Saat Gilang menyusun kalender kartu baru ditempel; sesekali kartu berpindah ke hari lain (animasi).
 */
export function makePlanBoard(accent) {
  const g = new THREE.Group();
  const steel = mat(PALETTE.steel);
  for (const x of [-1.78, 1.78]) {
    g.add(box(0.06, 2.3, 0.06, steel, x, 1.15, -0.03));
    g.add(box(0.07, 0.04, 0.7, steel, x, 0.02, -0.03, false));
  }
  g.add(box(3.6, 1.86, 0.06, mat('#fbfaf7', { roughness: 0.5 }), 0, 1.3, -0.02));
  const W = 3.4;
  const H = 1.7;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 512, 256);
  x.fillStyle = accent;
  x.fillRect(0, 0, 512, 44);
  x.fillStyle = '#ffffff';
  x.font = '800 22px "Inter", sans-serif';
  x.textBaseline = 'middle';
  x.fillText('KALENDER KONTEN', 14, 23);
  const month = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();
  x.font = '700 15px "Inter", sans-serif';
  x.textAlign = 'right';
  x.fillText(month, 498, 23);
  x.textAlign = 'left';
  const gx0 = 12;
  const gy0 = 50;
  const cw = (512 - 24) / 7;
  const chh = (256 - gy0 - 8) / 5;
  x.strokeStyle = '#e2e5ea';
  x.lineWidth = 2;
  x.font = '700 11px "Inter", sans-serif';
  x.textBaseline = 'top';
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < 7; k++) {
      x.strokeRect(gx0 + k * cw, gy0 + r * chh, cw, chh);
      x.fillStyle = k >= 5 ? '#d9480f' : '#8a94a6';
      x.fillText(String(r * 7 + k + 1), gx0 + k * cw + 4, gy0 + r * chh + 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, 1.3, 0.015);
  face.userData.keep = true;
  g.add(face);
  // posisi tengah tiap sel (koordinat lokal papan)
  const cell = (r, k) => [-W / 2 + ((gx0 + (k + 0.5) * cw) / 512) * W, 1.3 + H / 2 - ((gy0 + (r + 0.55) * chh) / 256) * H];
  const colors = ['#ffe066', '#ffa8a8', '#a5d8ff', '#b2f2bb', '#d0bfff', '#ffc078'];
  const used = new Set();
  const cards = [];
  for (let i = 0; i < 18; i++) {
    let r;
    let k;
    do {
      r = (i * 3 + Math.floor(i / 5)) % 5;
      k = (i * 5 + 2 * Math.floor(i / 7)) % 7;
      if (used.has(`${r}${k}`)) {
        r = Math.floor(Math.random() * 5);
        k = Math.floor(Math.random() * 7);
      }
    } while (used.has(`${r}${k}`) && used.size < 35);
    used.add(`${r}${k}`);
    const [cx, cy] = cell(r, k);
    const m = box(0.3, 0.17, 0.012, mat(colors[i % colors.length]), cx, cy, 0.03, false);
    m.rotation.z = ((i * 37) % 9 - 4) * 0.025;
    m.userData.keep = true;
    m.userData.cell = `${r}${k}`;
    m.visible = i < 6;
    g.add(m);
    cards.push(m);
  }
  // tepi & baki spidol
  const frame = mat('#c4cad3');
  g.add(box(3.66, 0.05, 0.08, frame, 0, 2.24, 0));
  g.add(box(3.66, 0.05, 0.08, frame, 0, 0.36, 0));
  g.add(box(2.4, 0.04, 0.14, frame, 0, 0.34, 0.06));
  const moving = [];
  let tm = 0;
  g.userData.board = {
    cards,
    reset() {
      cards.forEach((m, i) => (m.visible = i < 6));
    },
    tick(dt, active) {
      for (const mv of [...moving]) {
        mv.t += dt / 0.7;
        const e = Math.min(1, mv.t);
        const s2 = e * e * (3 - 2 * e);
        mv.m.position.x = mv.from[0] + (mv.to[0] - mv.from[0]) * s2;
        mv.m.position.y = mv.from[1] + (mv.to[1] - mv.from[1]) * s2;
        mv.m.position.z = 0.03 + Math.sin(e * Math.PI) * 0.12;
        if (e >= 1) moving.splice(moving.indexOf(mv), 1);
      }
      if (!active) return;
      tm += dt;
      if (tm < 2.4) return;
      tm = 0;
      const vis = cards.filter((m) => m.visible && !moving.some((mv) => mv.m === m));
      if (!vis.length) return;
      const m = vis[Math.floor(Math.random() * vis.length)];
      const taken = new Set(cards.filter((x) => x.visible).map((x) => x.userData.cell));
      const free = [];
      for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) if (!taken.has(`${r}${k}`)) free.push([r, k]);
      if (!free.length) return;
      const [r, k] = free[Math.floor(Math.random() * free.length)];
      m.userData.cell = `${r}${k}`;
      moving.push({ m, t: 0, from: [m.position.x, m.position.y], to: cell(r, k) });
    },
  };
  return g;
}

export function makeTablet() {
  const g = new THREE.Group();
  g.add(box(0.34, 0.018, 0.25, mat('#1f2430'), 0, 0, 0, false));
  g.add(box(0.3, 0.004, 0.21, new THREE.MeshBasicMaterial({ color: '#bfdbfe', toneMapped: false }), 0, 0.011, 0, false));
  g.add(box(0.012, 0.012, 0.16, mat('#f8fafc'), 0.1, 0.02, 0.02, false));
  return g;
}

/**
 * Monitor Divisi Iklan: saat render, bingkai 9:16 memutar animasi iklan mini (kata muncul, produk memantul,
 * lencana promo, tombol CTA berdenyut) + persen & sisa waktu. Digambar ulang ±12 fps hanya saat aktif.
 */
export class AdScreen {
  constructor(accent) {
    this.accent = accent;
    this.base = drawAdBase(accent);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 296;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.active = false;
    this.progress = 0;
    this.label = '';
    this.t = 0;
    this.acc = 0;
    this.draw();
  }

  set(active, progress, label) {
    const changed = active !== this.active || Math.round(progress * 100) !== Math.round(this.progress * 100) || label !== this.label;
    this.active = active;
    this.progress = progress;
    this.label = label;
    if (changed && !active) this.draw();
  }

  tick(dt) {
    if (!this.active) return;
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / 12) return;
    this.acc = 0;
    this.draw();
  }

  draw() {
    const x = this.ctx;
    x.drawImage(this.base, 0, 0);
    const fx = 36;
    const fy = 14;
    const fw = 112;
    const fh = 199;
    if (this.active) {
      const t = this.t;
      const scene = Math.floor(t / 1.4) % 4;
      const lt = (t % 1.4) / 1.4;
      const pop = Math.min(1, lt * 3);
      x.save();
      x.beginPath();
      x.rect(fx, fy, fw, fh);
      x.clip();
      const g = x.createLinearGradient(0, fy, 0, fy + fh);
      g.addColorStop(0, '#2a140b');
      g.addColorStop(1, this.accent);
      x.fillStyle = g;
      x.fillRect(fx, fy, fw, fh);
      const cx = fx + fw / 2;
      if (scene === 0) {
        x.fillStyle = '#ffffff';
        [0, 1, 2].forEach((i) => {
          const p = Math.max(0, Math.min(1, lt * 3 - i * 0.6));
          const w = [70, 86, 56][i] * p;
          x.fillRect(cx - w / 2, fy + 64 + i * 26, w, 14);
        });
        x.fillStyle = '#ffe14d';
        x.fillRect(cx - 24 * pop, fy + 146, 48 * pop, 6);
      } else if (scene === 1) {
        const bounce = Math.abs(Math.sin(lt * Math.PI * 2)) * 10;
        x.fillStyle = '#fff4e6';
        x.beginPath();
        x.roundRect(cx - 30, fy + 60 - bounce, 60, 64, 10);
        x.fill();
        x.fillStyle = this.accent;
        x.beginPath();
        x.roundRect(cx - 14, fy + 74 - bounce, 28, 38, 6);
        x.fill();
        x.fillStyle = '#ffffff';
        x.fillRect(cx - 38 * pop, fy + 140, 76 * pop, 12);
      } else if (scene === 2) {
        x.save();
        x.translate(cx, fy + 84);
        x.rotate(t * 1.5);
        x.fillStyle = '#ffe14d';
        x.beginPath();
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const r = (i % 2 ? 30 : 38) * pop;
          x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        x.closePath();
        x.fill();
        x.restore();
        x.fillStyle = 'rgba(255,255,255,0.6)';
        x.fillRect(cx - 26, fy + 140, 52, 8);
        x.fillStyle = '#ffffff';
        x.fillRect(cx - 34 * pop, fy + 156, 68 * pop, 14);
      } else {
        const pulse = 1 + Math.max(0, Math.sin(t * 7)) * 0.08;
        x.fillStyle = '#ffffff';
        x.fillRect(cx - 36, fy + 70, 72, 16);
        x.save();
        x.translate(cx, fy + 128);
        x.scale(pulse, pulse);
        x.fillStyle = '#ffe14d';
        x.beginPath();
        x.roundRect(-40, -13, 80, 26, 13);
        x.fill();
        x.restore();
      }
      x.restore();
      // panel progres
      x.fillStyle = '#ffffff';
      x.font = '800 26px "Inter", sans-serif';
      x.textBaseline = 'top';
      x.fillText('RENDER IKLAN', 176, 26);
      x.font = '700 44px "JetBrains Mono", monospace';
      x.fillText(`${Math.round(this.progress * 100)}%`, 176, 66);
      x.font = '600 17px "Inter", sans-serif';
      x.fillStyle = 'rgba(255,255,255,0.72)';
      x.fillText((this.label || 'Menyusun frame').slice(0, 30), 176, 122);
      x.fillStyle = '#2a3142';
      x.fillRect(176, 156, 300, 18);
      x.fillStyle = this.accent;
      x.fillRect(176, 156, 300 * Math.max(0.02, this.progress), 18);
      x.fillStyle = '#ff4d4f';
      x.fillRect(16 + 470 * this.progress, 222, 4, 64);
    } else {
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.font = '700 18px "Inter", sans-serif';
      x.textBaseline = 'top';
      x.fillText('Digital Marketing', 176, 30);
      x.fillStyle = 'rgba(255,255,255,0.3)';
      x.font = '600 14px "Inter", sans-serif';
      x.fillText('Menunggu brief…', 176, 58);
    }
    x.strokeStyle = this.accent;
    x.lineWidth = 3;
    x.strokeRect(fx - 1.5, fy - 1.5, fw + 3, fh + 3);
    this.texture.needsUpdate = true;
  }
}

function drawAdBase(accent) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 296;
  const x = c.getContext('2d');
  x.fillStyle = '#14161f';
  x.fillRect(0, 0, 512, 296);
  // pratinjau diam (poster) di bingkai 9:16
  const g = x.createLinearGradient(0, 14, 0, 213);
  g.addColorStop(0, '#3a2030');
  g.addColorStop(1, '#5a2238');
  x.fillStyle = g;
  x.fillRect(36, 14, 112, 199);
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.fillRect(56, 70, 72, 12);
  x.fillRect(64, 92, 56, 10);
  x.fillStyle = accent;
  x.beginPath();
  x.roundRect(62, 160, 60, 20, 10);
  x.fill();
  // panel kanan (inspector)
  x.fillStyle = '#1e2232';
  x.fillRect(164, 14, 330, 186);
  // timeline dengan klip adegan berwarna
  x.fillStyle = '#0d1017';
  x.fillRect(8, 216, 496, 72);
  const cols = [accent, '#ffd43b', '#74c0fc', '#9b6cf5', accent];
  let px = 16;
  cols.forEach((col, i) => {
    const w = [70, 110, 90, 80, 120][i];
    x.fillStyle = col;
    x.globalAlpha = 0.85;
    x.fillRect(px, 230, w - 6, 22);
    x.globalAlpha = 0.35;
    x.fillRect(px, 260, w - 6, 10);
    px += w;
  });
  x.globalAlpha = 1;
  return c;
}

/** Big clipper editing monitor; shows a live render progress bar while a clip renders. */
export class EditorScreen {
  constructor(accent) {
    this.accent = accent;
    this.base = drawEditorBase(accent);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 296;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.state = '';
    this.set(false, 0, '');
  }

  set(active, progress, label, title = 'RENDER') {
    const key = `${active}|${Math.round(progress * 100)}|${label}|${title}`;
    if (key === this.state) return;
    this.state = key;
    const x = this.ctx;
    x.drawImage(this.base, 0, 0);
    if (active) {
      x.fillStyle = 'rgba(10, 13, 20, 0.72)';
      x.fillRect(0, 0, 512, 296);
      x.fillStyle = '#ffffff';
      x.font = '800 30px "Inter", sans-serif';
      x.textBaseline = 'top';
      if (title === 'LIVE') {
        // sesi live: titik REC merah + "LIVE"
        x.fillStyle = '#ff2d2d';
        x.beginPath();
        x.arc(50, 68, 13, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = '#ffffff';
        x.fillText('LIVE', 74, 52);
      } else x.fillText(title, 36, 52);
      x.font = '600 18px "Inter", sans-serif';
      x.fillStyle = 'rgba(255,255,255,0.7)';
      x.fillText((label || 'Menyusun clip vertikal').slice(0, 38), 36, 94);
      x.fillStyle = '#2a3142';
      x.fillRect(36, 150, 440, 30);
      x.fillStyle = '#c6f432';
      x.fillRect(36, 150, 440 * Math.max(0.02, progress), 30);
      x.font = '700 40px "JetBrains Mono", monospace';
      x.fillStyle = '#ffffff';
      x.fillText(`${Math.round(progress * 100)}%`, 36, 196);
      // playhead on the timeline follows progress
      x.fillStyle = '#ff4d4f';
      x.fillRect(16 + 470 * progress, 218, 4, 68);
    }
    this.texture.needsUpdate = true;
  }
}

function drawEditorBase(accent) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 296;
  const x = c.getContext('2d');
  x.fillStyle = '#151922';
  x.fillRect(0, 0, c.width, c.height);
  // side panels (bins / inspector)
  x.fillStyle = '#20263a';
  x.fillRect(8, 8, 120, 200);
  x.fillRect(384, 8, 120, 200);
  x.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 6; i++) x.fillRect(16, 20 + i * 30, 100, 18);
  for (let i = 0; i < 5; i++) x.fillRect(392, 20 + i * 36, 70 + (i % 2) * 30, 10);
  // vertical 9:16 preview frame
  const fw = 108;
  const fh = 192;
  const fx = (c.width - fw) / 2;
  const fy = 10;
  const grad = x.createLinearGradient(0, fy, 0, fy + fh);
  grad.addColorStop(0, '#3a4a6b');
  grad.addColorStop(1, '#6b5a8a');
  x.fillStyle = grad;
  x.fillRect(fx, fy, fw, fh);
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.beginPath();
  x.arc(fx + fw / 2, fy + 78, 22, 0, Math.PI * 2);
  x.fill();
  x.fillRect(fx + fw / 2 - 30, fy + 104, 60, 52);
  x.fillStyle = '#ffffff';
  x.fillRect(fx + 12, fy + 14, fw - 24, 12);
  x.fillStyle = '#c6f432';
  x.fillRect(fx + 18, fy + 150, fw - 36, 12);
  x.strokeStyle = accent;
  x.lineWidth = 3;
  x.strokeRect(fx - 1.5, fy - 1.5, fw + 3, fh + 3);
  // timeline
  x.fillStyle = '#0d1017';
  x.fillRect(8, 216, c.width - 16, 72);
  const tracks = [[accent, 230], ['#5b8def', 250], ['#c6f432', 270]];
  for (const [col, y] of tracks) {
    let px = 16;
    while (px < c.width - 30) {
      const w = 30 + ((px * 7) % 70);
      x.fillStyle = col;
      x.globalAlpha = 0.85;
      x.fillRect(px, y, Math.min(w, c.width - 24 - px), 12);
      px += w + 6;
    }
  }
  x.globalAlpha = 1;
  return c;
}

export function makeSofa(color) {
  const g = new THREE.Group();
  const c = mat(color);
  g.add(box(2.2, 0.35, 0.85, c, 0, 0.3, 0));
  g.add(box(2.2, 0.55, 0.22, c, 0, 0.6, -0.33));
  g.add(box(0.2, 0.45, 0.85, c, -1.0, 0.45, 0));
  g.add(box(0.2, 0.45, 0.85, c, 1.0, 0.45, 0));
  g.add(box(0.5, 0.3, 0.12, mat('#ffffff'), -0.5, 0.62, -0.18));
  for (const x of [-0.95, 0.95]) for (const z of [-0.35, 0.35]) g.add(cyl(0.04, 0.04, 0.12, mat(PALETTE.dark), x, 0.06, z, 6));
  return g;
}

// ---------------------------------------------------------------- hand props (shared geometry)
export function makeCup(color = '#ffffff') {
  const g = new THREE.Group();
  g.add(cyl(0.065, 0.05, 0.14, mat(color), 0, 0.07, 0, 10));
  g.add(cyl(0.058, 0.058, 0.012, mat('#6b4423'), 0, 0.142, 0, 10));
  g.traverse((o) => { o.castShadow = false; });
  return g;
}

export function makeReel() {
  const g = new THREE.Group();
  g.add(box(0.34, 0.08, 0.34, mat('#1f2430'), 0, 0.04, 0, false));
  const disc = cyl(0.15, 0.15, 0.02, mat('#c6f432'), 0, 0.09, 0, 14);
  disc.castShadow = false;
  g.add(disc);
  g.add(cyl(0.04, 0.04, 0.03, mat('#1f2430'), 0, 0.1, 0, 8));
  return g;
}

export function makePaper() {
  const g = new THREE.Group();
  g.add(box(0.26, 0.012, 0.34, mat('#ffffff'), 0, 0, 0, false));
  g.add(box(0.18, 0.014, 0.025, mat('#9aa3b2'), 0, 0.002, -0.08, false));
  g.add(box(0.18, 0.014, 0.025, mat('#9aa3b2'), 0, 0.002, 0.0, false));
  return g;
}

export function makePhone() {
  const g = new THREE.Group();
  g.add(box(0.09, 0.16, 0.015, mat('#1f2430'), 0, 0, 0, false));
  g.add(box(0.075, 0.13, 0.004, new THREE.MeshBasicMaterial({ color: '#8fd3ff', toneMapped: false }), 0, 0, 0.009, false));
  return g;
}

export function makeHeadphones() {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 6, 16, Math.PI), mat('#1f2430'));
  g.add(band);
  for (const x of [-0.29, 0.29]) {
    const cup = cyl(0.08, 0.08, 0.07, mat('#65c018'), x, 0, 0, 10);
    cup.rotation.z = Math.PI / 2;
    cup.castShadow = false;
    g.add(cup);
  }
  return g;
}

// ---------------------------------------------------------------- pantry & server room
export function makeCounter() {
  const g = new THREE.Group();
  g.add(box(5.2, 0.9, 0.75, mat('#eef0f3'), 0, 0.45, 0));
  g.add(box(5.3, 0.06, 0.82, mat('#d9b48a'), 0, 0.93, 0));
  // coffee machine
  g.add(box(0.6, 0.62, 0.45, mat('#232836'), -1.2, 1.27, -0.05));
  g.add(box(0.4, 0.12, 0.1, mat('#aab2bf'), -1.2, 1.36, 0.2));
  g.add(box(0.12, 0.06, 0.04, new THREE.MeshBasicMaterial({ color: '#ff8a3d', toneMapped: false }), -1.08, 1.5, 0.19, false));
  // kettle, jar, cups
  g.add(cyl(0.12, 0.14, 0.26, mat('#ff8787'), 0.2, 1.09, 0, 12));
  g.add(cyl(0.11, 0.11, 0.22, mat('#ffe8cc', { transparent: true, opacity: 0.85 }), 0.7, 1.07, -0.05, 12));
  [1.4, 1.6, 1.8].forEach((x, i) => g.add(cyl(0.06, 0.05, 0.12, mat(['#74c0fc', '#ffd43b', '#ffffff'][i]), x, 1.02, 0.08, 10)));
  // wall shelf
  g.add(box(2.4, 0.05, 0.3, mat('#d9b48a'), 0.6, 1.95, -0.25));
  [[-0.2, '#ffd43b'], [0.3, '#63e6be'], [0.8, '#ff8787'], [1.3, '#74c0fc']].forEach(([x, c]) => g.add(box(0.22, 0.28, 0.2, mat(c), x, 2.12, -0.25, false)));
  return g;
}

export function makeFridge() {
  const g = new THREE.Group();
  g.add(box(0.9, 2.0, 0.8, mat('#f4f6f8'), 0, 1.0, 0));
  g.add(box(0.04, 0.5, 0.05, mat('#aab2bf'), 0.32, 1.35, 0.42, false));
  g.add(box(0.04, 0.3, 0.05, mat('#aab2bf'), 0.32, 0.55, 0.42, false));
  g.add(box(0.88, 0.02, 0.01, mat('#d0d5dd'), 0, 0.85, 0.405, false));
  return g;
}

export function makeHighTable() {
  const g = new THREE.Group();
  g.add(cyl(0.55, 0.55, 0.05, mat('#ffffff'), 0, 1.02, 0, 20));
  g.add(cyl(0.05, 0.05, 1.0, mat('#aab2bf'), 0, 0.5, 0, 8));
  g.add(cyl(0.3, 0.3, 0.03, mat('#aab2bf'), 0, 0.015, 0, 14));
  return g;
}

export function makeRack() {
  const g = new THREE.Group();
  g.add(box(1.1, 2.1, 0.8, mat('#2b3140'), 0, 1.05, 0));
  for (let i = 0; i < 6; i++) g.add(box(0.96, 0.22, 0.02, mat('#3a4255'), 0, 0.35 + i * 0.3, 0.41, false));
  return g;
}

export function makeReelShelf() {
  const g = makeShelf('#65c018');
  // film reel boxes on the top
  for (let i = 0; i < 4; i++) {
    const r = makeReel();
    r.scale.setScalar(0.8);
    r.position.set(-0.55 + i * 0.36, 1.52, 0);
    g.add(r);
  }
  return g;
}

export const LAMP_SHADE = clayify(new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0, roughness: 0.9 }));
export function makeFloorLamp() {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.22, 0.04, mat('#232836'), 0, 0.02, 0, 12));
  g.add(cyl(0.025, 0.025, 1.7, mat('#aab2bf'), 0, 0.87, 0, 6));
  const shade = cyl(0.26, 0.34, 0.36, LAMP_SHADE, 0, 1.8, 0, 14);
  shade.castShadow = false;
  g.add(shade);
  return g;
}

// ---------------------------------------------------------------- Menara Arunika pieces
/** meeting table with chairs around (n per long side) */
export function makeMeetingTable(len, depth, perSide, { ends = true } = {}) {
  const g = new THREE.Group();
  g.add(box(len, 0.06, depth, mat(PALETTE.wood), 0, 0.74, 0));
  g.add(box(len - 0.6, 0.7, 0.08, mat(PALETTE.steel), 0, 0.37, 0, false));
  const seat = mat('#404040');
  const addChair = (x, z, ry) => {
    const c = new THREE.Group();
    c.add(box(0.46, 0.07, 0.46, seat, 0, 0.46, 0, false));
    c.add(box(0.46, 0.42, 0.06, seat, 0, 0.7, 0.2, false));
    c.add(box(0.05, 0.44, 0.05, mat(PALETTE.steel), 0, 0.22, 0, false));
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    g.add(c);
  };
  const step = len / perSide;
  for (let i = 0; i < perSide; i++) {
    const x = -len / 2 + step * (i + 0.5);
    addChair(x, -depth / 2 - 0.42, Math.PI);
    addChair(x, depth / 2 + 0.42, 0);
  }
  if (ends) {
    addChair(-len / 2 - 0.45, 0, -Math.PI / 2);
    addChair(len / 2 + 0.45, 0, Math.PI / 2);
  }
  return g;
}

export function makeRoundTable(r = 0.6, chairs = 4, h = 0.74) {
  const g = new THREE.Group();
  g.add(cyl(r, r, 0.05, mat(PALETTE.white), 0, h, 0, 18));
  g.add(cyl(0.05, 0.05, h, mat(PALETTE.steel), 0, h / 2, 0, 6));
  g.add(cyl(0.28, 0.3, 0.03, mat(PALETTE.steel), 0, 0.015, 0, 12));
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * Math.PI * 2 + Math.PI / 4;
    const d = r + 0.42;
    g.add(cyl(0.2, 0.2, 0.06, mat(PALETTE.wood), Math.cos(a) * d, 0.46, Math.sin(a) * d, 12));
    g.add(cyl(0.03, 0.03, 0.44, mat(PALETTE.steel), Math.cos(a) * d, 0.22, Math.sin(a) * d, 5));
  }
  return g;
}

export function makeBench(len = 2.2) {
  const g = new THREE.Group();
  g.add(box(len, 0.08, 0.6, mat(PALETTE.wood), 0, 0.45, 0));
  for (const x of [-len / 2 + 0.15, len / 2 - 0.15]) g.add(box(0.08, 0.42, 0.5, mat(PALETTE.steel), x, 0.21, 0, false));
  return g;
}

// clear pale-blue clay glass (opacity 0.2) so booths & meeting rooms stay visible inside
export const FROST = clayify(new THREE.MeshStandardMaterial({ color: pastel('#d6ecfb', { lift: 0.12, desat: 0.75 }), transparent: true, opacity: 0.2, roughness: 0.35, metalness: 0, depthWrite: false }), { bump: false });
const BOOTH_GLASS = FROST;
/** glass phone booth, open on the +z side */
export function makeBooth() {
  const g = new THREE.Group();
  const glass = BOOTH_GLASS;
  const w = 1.5;
  const h = 2.1;
  const steel = mat(PALETTE.steel);
  g.add(box(w, 0.04, w, mat(PALETTE.terrazzo), 0, 0.02, 0, false));
  const panes = [[0, -w / 2, 0], [-w / 2, 0, Math.PI / 2], [w / 2, 0, Math.PI / 2]];
  for (const [x, z, ry] of panes) {
    const p = box(w, h, 0.06, glass, x, h / 2, z, false);
    p.rotation.y = ry;
    p.renderOrder = 2;
    g.add(p);
  }
  for (const [x, z] of [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2]]) g.add(box(0.09, h, 0.09, steel, x, h / 2, z, false));
  g.add(box(w + 0.1, 0.1, w + 0.1, steel, 0, h, 0, false));
  g.add(box(0.9, 0.06, 0.32, mat(PALETTE.wood), 0, 1.0, -w / 2 + 0.22, false));
  g.add(cyl(0.2, 0.2, 0.08, mat('#525252'), 0, 0.55, -0.05, 10));
  g.add(cyl(0.03, 0.03, 0.52, steel, 0, 0.27, -0.05, 5));
  return g;
}

/** teak slat screen (kisi kayu jati) */
export function makeSlatScreen(len, h = 2.0) {
  const g = new THREE.Group();
  g.add(box(len, 0.06, 0.12, mat(PALETTE.woodDark), 0, h, 0, false));
  g.add(box(len, 0.06, 0.12, mat(PALETTE.woodDark), 0, 0.03, 0, false));
  const n = Math.floor(len / 0.18);
  for (let i = 0; i <= n; i++) g.add(box(0.07, h, 0.1, mat(i % 2 ? PALETTE.wood : PALETTE.woodDark), -len / 2 + (i * len) / n, h / 2, 0, false));
  return g;
}

export function makeTV() {
  const g = new THREE.Group();
  g.add(box(1.84, 1.04, 0.1, mat(PALETTE.darker), 0, 1.45, -0.02, false));
  g.add(box(1.7, 0.92, 0.01, new THREE.MeshBasicMaterial({ color: '#2b3a52', toneMapped: false }), 0, 1.45, 0.035, false));
  return g;
}

export function makeLiftDoors(n, len) {
  const g = new THREE.Group();
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + step * (i + 0.5);
    g.add(box(step * 0.7, 1.35, 0.03, mat('#a1a1a1', { metalness: 0.4, roughness: 0.35 }), x, 0.7, 0, false));
    g.add(box(0.01, 1.35, 0.035, mat('#525252'), x, 0.7, 0.002, false));
    g.add(box(0.08, 0.08, 0.04, new THREE.MeshBasicMaterial({ color: '#7dd3fc', toneMapped: false }), x + step * 0.42, 0.9, 0, false));
  }
  return g;
}
