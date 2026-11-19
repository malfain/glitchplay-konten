// Clay-doll agent characters (plasticine figurines). Each one runs a small "plan" (walk → sit → pose …) handed out by
// the director (director.js), which maps real backend state to visible choreography. Animation adds squash & stretch
// on top: bouncy walk, a hop when a job starts, a squish on sitting down, a wobble on errors, idle breathing, blinks.
// Perf: every body part is one vertex-coloured mesh sharing a single clay material across all characters; the blob
// shadows of all characters are one instanced draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCup, makeReel, makePaper, makePhone, makeHeadphones, makeTablet, clayify, pastel } from './furniture.js';

const SKIN = ['#f6d3b3', '#ecc29b', '#d9a47c', '#c48d66', '#f2cdae'];
const HAIR = ['#3a302b', '#57402f', '#2e3240', '#76563c', '#47364d'];

export const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

const CHAR_MAT = clayify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), { key: 'clay-char' });
const ERR_MAT = new THREE.MeshBasicMaterial({ color: '#ff3b47', toneMapped: false });
const WHITE_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
const RING_BG_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });

const GEO = {
  particle: new THREE.IcosahedronGeometry(0.06, 0),
  ringBg: new THREE.RingGeometry(0.17, 0.225, 32),
  bang: new THREE.CapsuleGeometry(0.05, 0.2, 3, 8),
  dot: new THREE.SphereGeometry(0.055, 10, 8),
  errDisc: new THREE.RingGeometry(0.3, 0.42, 24),
  bubble: new THREE.CircleGeometry(0.26, 18),
  bubbleRim: new THREE.RingGeometry(0.26, 0.3, 18),
};

// ---------------------------------------------------------------- vertex-coloured part geometry
function part(geo, color, m) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
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

/** egg: sphere stretched up and narrowed toward the top (clay body) */
function eggGeo(r, h, segW = 16, segH = 12) {
  const g = new THREE.SphereGeometry(r, segW, segH);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / r; // -1..1
    const k = 1 - 0.13 * y; // fuller at the bottom
    p.setXYZ(i, p.getX(i) * k, y * h, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

const HEAD_R = 0.34;
/** head = skin ball + hair cap + cheeks + little smile, with the division accessory baked in (one draw) */
function headGeo(skin, hair, acc = '', accent = '#888') {
  return cached(`h${skin}${hair}${acc}${accent}`, () => {
    const cheek = new THREE.Color(skin).lerp(new THREE.Color('#ff8fa3'), 0.5);
    const parts = [
      part(new THREE.SphereGeometry(HEAD_R, 14, 11), skin, M(0, 0, 0, 0, 0, 0, 1, 0.94, 1)),
      part(new THREE.SphereGeometry(HEAD_R + 0.018, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, M(0, 0.035, -0.025, -0.38, 0, 0, 1, 0.92, 1)),
      // a soft fringe lump so the hairline reads as sculpted clay
      part(new THREE.SphereGeometry(0.12, 10, 6), hair, M(-0.1, 0.2, 0.2, 0, 0, 0.4, 1.4, 0.6, 0.8)),
      // smile: a tiny half torus pressed into the clay
      part(new THREE.TorusGeometry(0.045, 0.011, 4, 10, Math.PI), '#7a3b38', M(0, -0.115, HEAD_R * 0.9, 0, 0, Math.PI)),
    ];
    for (const x of [-0.13, 0.13]) {
      parts.push(part(new THREE.SphereGeometry(0.05, 8, 5), `#${cheek.getHexString()}`, M(x * 1.25, -0.085, HEAD_R * 0.86, 0, x > 0 ? 0.5 : -0.5, 0, 1, 0.75, 0.35)));
    }
    if (acc === 'beret') {
      parts.push(part(new THREE.SphereGeometry(0.37, 16, 8), '#2c2e38', M(0.05, 0.25, -0.025, 0, 0, -0.32, 1.1, 0.34, 1.1)));
      parts.push(part(new THREE.CylinderGeometry(0.025, 0.035, 0.07, 6), '#2c2e38', M(0.13, 0.39, -0.025, 0, 0, -0.32)));
    } else if (acc === 'bun') {
      parts.push(part(new THREE.SphereGeometry(0.15, 12, 9), hair, M(0, 0.25, -0.25)));
      parts.push(part(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 6), '#facc15', M(0, 0.31, -0.25, 0, 0, 1.15)));
      parts.push(part(new THREE.ConeGeometry(0.018, 0.05, 6), '#3a302b', M(0.235, 0.41, -0.25, 0, 0, 1.15 - Math.PI / 2)));
    } else if (acc === 'glasses') {
      // Owner: kacamata bulat gelap + rambut sedikit beruban di pelipis
      for (const x of [-0.115, 0.115]) parts.push(part(new THREE.TorusGeometry(0.078, 0.016, 5, 14), '#1b1d26', M(x, 0, HEAD_R * 0.93, 0, x > 0 ? 0.18 : -0.18, 0)));
      parts.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 5), '#1b1d26', M(0, 0.01, HEAD_R * 0.97, 0, 0, Math.PI / 2)));
      for (const x of [-1, 1]) parts.push(part(new THREE.SphereGeometry(0.07, 8, 6), '#9a948c', M(x * 0.3, 0.08, 0.02, 0, 0, 0, 0.6, 1, 1)));
    } else if (acc === 'pen') {
      // Prompt Engineer: headset tipis dengan mikrofon kecil + jepit rambut berbintang
      parts.push(part(new THREE.TorusGeometry(HEAD_R + 0.03, 0.02, 5, 18, Math.PI), '#e8f3f1', M(0, 0.02, 0, 0, Math.PI / 2, 0)));
      parts.push(part(new THREE.SphereGeometry(0.06, 8, 6), accent, M(HEAD_R + 0.02, -0.02, 0, 0, 0, 0, 0.6, 1, 1)));
      parts.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), '#e8f3f1', M(HEAD_R - 0.02, -0.12, 0.12, 1.1, 0, 0.3)));
      parts.push(part(new THREE.SphereGeometry(0.025, 6, 4), '#1b1d26', M(HEAD_R - 0.08, -0.17, 0.2)));
      parts.push(part(new THREE.OctahedronGeometry(0.06, 0), '#facc15', M(-0.2, 0.24, 0.16, 0, 0.4, 0.3)));
    } else if (acc === 'cap') {
      parts.push(part(new THREE.SphereGeometry(HEAD_R + 0.03, 16, 7, 0, Math.PI * 2, 0, Math.PI * 0.5), accent, M(0, 0.05, -0.01, -0.12)));
      parts.push(part(new THREE.CylinderGeometry(0.25, 0.25, 0.035, 14, 1, false, -Math.PI / 2, Math.PI), accent, M(0, 0.085, 0.25, 0.12, 0, 0, 1, 1, 0.9)));
      parts.push(part(new THREE.SphereGeometry(0.04, 8, 5), '#ffffff', M(0, 0.4, -0.04)));
    }
    return mergeGeometries(parts);
  });
}
/** dot eyes with a tiny highlight — separate mesh so they can blink (scale.y) */
const eyesGeo = () => cached('eyes', () => {
  const parts = [];
  for (const x of [-0.115, 0.115]) {
    parts.push(part(new THREE.SphereGeometry(0.048, 8, 6), '#1b1d26', M(x, 0, 0, 0, 0, 0, 0.85, 1.15, 0.55)));
    parts.push(part(new THREE.SphereGeometry(0.014, 6, 4), '#ffffff', M(x + 0.016, 0.022, 0.024)));
  }
  return mergeGeometries(parts);
});
const bodyGeo = (color) => cached(`b${color}`, () => mergeGeometries([
  part(eggGeo(0.3, 0.4, 14, 10), color),
  // soft collar roll + a button: pressed-on clay details
  part(new THREE.TorusGeometry(0.15, 0.04, 6, 14), '#fbf7f0', M(0, 0.33, 0, Math.PI / 2, 0, 0, 1, 1, 0.8)),
  part(new THREE.SphereGeometry(0.03, 6, 4), '#fbf7f0', M(0, 0.06, 0.285, 0, 0, 0, 1, 1, 0.5)),
]));
const armGeo = (color, skin) => cached(`a${color}${skin}`, () => mergeGeometries([
  part(new THREE.CapsuleGeometry(0.08, 0.16, 3, 8), color, M(0, -0.13, 0)),
  part(new THREE.SphereGeometry(0.078, 8, 6), skin, M(0, -0.29, 0.005)),
]));
const legGeo = () => cached('leg', () => mergeGeometries([
  part(new THREE.CapsuleGeometry(0.095, 0.1, 3, 8), '#343a4f', M(0, -0.15, 0)),
  // chunky clay shoe
  part(new THREE.SphereGeometry(0.11, 10, 6), '#4a3c34', M(0, -0.27, 0.04, 0, 0, 0, 1, 0.55, 1.35)),
]));
// Divisi Digital Marketing: headphone melingkar di leher (copywriter).
const neckphonesGeo = (accent) => cached(`neck${accent}`, () => mergeGeometries([
  part(new THREE.TorusGeometry(0.22, 0.035, 6, 20), '#2c2e38', M(0, 1.06, 0.01, Math.PI / 2)),
  part(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 12), accent, M(-0.22, 1.03, 0.07, 0, 0, Math.PI / 2)),
  part(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 12), accent, M(0.22, 1.03, 0.07, 0, 0, Math.PI / 2)),
]));

// ---------------------------------------------------------------- blob shadows (one instanced draw for everyone)
const BLOB_MAX = 96;
export function createBlobShadows(scene) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const strength = new THREE.InstancedBufferAttribute(new Float32Array(BLOB_MAX), 1);
  strength.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aStrength', strength);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color('#2a1f1a') } },
    vertexShader: `attribute float aStrength; varying vec2 vUv; varying float vS;
      void main() { vUv = uv; vS = aStrength; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; varying vec2 vUv; varying float vS;
      void main() { float d = length(vUv - 0.5) * 2.0; float a = 1.0 - smoothstep(0.15, 1.0, d); gl_FragColor = vec4(uColor, a * a * vS); }`,
  });
  const mesh = new THREE.InstancedMesh(geo, material, BLOB_MAX);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  return {
    update(chars) {
      let i = 0;
      for (const ch of chars) {
        if (i >= BLOB_MAX) break;
        const lift = ch.lift || 0;
        const f = Math.max(0, ch.fade);
        const s = (0.78 - lift * 0.5) * (0.6 + 0.4 * f) * (1 + ch.sit * 0.12);
        pos.set(ch.group.position.x, 0.082, ch.group.position.z + ch.sit * 0.1);
        sc.set(s, 1, s);
        m4.compose(pos, q, sc);
        mesh.setMatrixAt(i, m4);
        strength.array[i] = 0.34 * f * (1 - ch.sit * 0.35) * (1 - Math.min(0.6, lift * 1.6));
        i += 1;
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

const SPEED = { stroll: 0.85, walk: 1.15, hurry: 2.6 };

export class Character {
  /**
   * @param {object} opts
   * @param {object} opts.agent normalised agent
   * @param {string} opts.color division colour
   * @param {object} opts.room room descriptor from office.js
   * @param {number} opts.slot desk index
   * @param {object} opts.nav navigation grid (nav.js)
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
    this.heading = this.rand() * Math.PI * 2;
    this.pose = 'stand';
    this.deskMode = 'idle';
    this.fade = 1;
    this.fadeTarget = 1;

    // plan
    this.plan = null;
    this.planKey = '';
    this.planLabel = '';
    this.stepIdx = 0;
    this.step = null;
    this.onPlanDone = null;
    this.activity = 'Santai';

    // speech bubble (DOM handled by office.js)
    this.bubble = { text: '', tone: '', until: 0, ver: 0 };

    const g = new THREE.Group();
    this.group = g;
    g.userData.agentId = agent.id;

    const pivot = new THREE.Group();
    g.add(pivot);
    this.pivot = pivot;
    // squash & stretch happens on this inner node so it scales around the feet
    const skin = SKIN[this.seed % SKIN.length];
    const hair = HAIR[(this.seed >> 3) % HAIR.length];
    const isOwner = room.id === 'owner';
    // Owner: blazer gelap (bukan warna divisi), badan sedikit lebih besar
    const outfit = isOwner ? '#353a48' : `#${pastel(color, { lift: 0.08, desat: 0.85 }).getHexString()}`;
    this.bodyScale = isOwner ? 1.1 : 1;

    this.legs = [-0.12, 0.12].map((x) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.34, 0);
      hip.add(new THREE.Mesh(legGeo(), CHAR_MAT));
      pivot.add(hip);
      return hip;
    });
    const body = new THREE.Mesh(bodyGeo(outfit), CHAR_MAT);
    body.position.y = 0.68;
    pivot.add(body);

    let acc = '';
    if (room.id === 'iklan') {
      if (/motion|desain|design/i.test(this.role)) acc = 'beret';
      else pivot.add(new THREE.Mesh(neckphonesGeo(color), CHAR_MAT));
    }
    if (room.id === 'carousel') acc = 'bun';
    if (room.id === 'perencana') acc = 'cap';
    if (room.id === 'prompt') acc = 'pen';
    if (isOwner) acc = 'glasses';
    const head = new THREE.Group();
    head.position.y = 1.36;
    head.add(new THREE.Mesh(headGeo(skin, hair, acc, color), CHAR_MAT));
    this.eyes = new THREE.Mesh(eyesGeo(), CHAR_MAT);
    this.eyes.position.set(0, 0.0, HEAD_R * 0.9);
    head.add(this.eyes);
    pivot.add(head);
    this.head = head;

    const aGeo = armGeo(outfit, skin);
    this.arms = [-0.29, 0.29].map((x) => {
      const sh = new THREE.Group();
      sh.position.set(x, 0.9, 0);
      sh.add(new THREE.Mesh(aGeo, CHAR_MAT));
      pivot.add(sh);
      return sh;
    });
    // squash/stretch + one-shot clay reactions (seconds since start, -1 = idle)
    this.fx = { hop: -1, squish: -1, wobble: -1, blinkAt: 1 + this.rand() * 3, blink: 0 };
    this.lift = 0;
    this.wasSeated = false;
    // joint state for smooth pose blending
    this.j = { aLx: 0, aRx: 0, aLz: -0.12, aRz: 0.12, hx: 0, hy: 0, lean: 0 };

    // props: right-hand slot, two-hand carry slot, head slot
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.33, 0.05);
    this.arms[1].add(this.hand);
    this.carrySlot = new THREE.Group();
    this.carrySlot.position.set(0, 0.86, 0.36);
    pivot.add(this.carrySlot);
    this.props = {};
    this.propNow = null;
    this.headphones = null;

    // ---- overlays: progress ring, particles, error marker
    const hud = new THREE.Group();
    hud.position.y = 2.05;
    g.add(hud);
    this.hud = hud;
    hud.add(new THREE.Mesh(GEO.ringBg, RING_BG_MAT));
    this.ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.225, 32, 1, Math.PI / 2, -0.001), this.ringMat);
    this.ring.position.z = 0.002;
    hud.add(this.ring);
    this.ringShown = 0;
    this.ringProgress = -1;
    hud.scale.setScalar(0.001);
    hud.visible = false;

    this.particles = Array.from({ length: 4 }, (_, i) => {
      const m = new THREE.Mesh(GEO.particle, new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffffff' : color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      m.userData.life = -this.rand() * 2;
      m.visible = false;
      g.add(m);
      return m;
    });

    const err = new THREE.Group();
    const bang = new THREE.Mesh(GEO.bang, ERR_MAT);
    bang.position.y = 0.12;
    const dot = new THREE.Mesh(GEO.dot, ERR_MAT);
    dot.position.y = -0.12;
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
    errDisc.position.y = 0.08;
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
    const wasBusy = this.busy;
    const wasErr = this.status === 'error';
    this.name = agent.name || this.name;
    this.role = agent.role || this.role;
    this.status = agent.status || 'idle';
    if (this.fx) {
      // clay reactions: little hop when a job starts, wobble when something goes wrong
      if (!wasBusy && this.busy) {
        if (this.sit < 0.3) this.fx.hop = 0;
        else this.fx.squish = 0;
      }
      if (!wasErr && this.status === 'error') this.fx.wobble = 0;
    }
    this.task = agent.currentTask || '';
    this.progress = agent.progress ?? 0;
  }

  /** start somewhere sensible: at the desk when busy, otherwise somewhere in the home room */
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
    for (let i = 0; i < 8; i++) {
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
      const make = { cup: () => makeCup(), reel: () => makeReel(), paper: () => makePaper(), phone: () => makePhone(), tablet: () => makeTablet() }[name];
      const obj = make();
      if (name === 'reel' || name === 'paper' || name === 'tablet') {
        obj.rotation.x = name === 'paper' ? 0.2 : name === 'tablet' ? -0.75 : 0;
        if (name === 'tablet') obj.position.set(0, 0.06, 0.02);
        this.carrySlot.add(obj);
      } else {
        if (name === 'phone') obj.rotation.x = -1.2;
        this.hand.add(obj);
      }
      this.props[name] = obj;
    }
    this.props[name].visible = true;
  }

  setHeadphones(on) {
    if (on && !this.headphones) {
      this.headphones = makeHeadphones();
      this.headphones.position.y = 0.04;
      this.headphones.scale.setScalar(1.24);
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
          this.sit = Math.max(0, this.sit - dt * 3.2);
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
        this.heading = lerpAngle(this.heading, Math.atan2(tmpV.x, tmpV.z), Math.min(1, dt * 9));
        this.walking = true;
        break;
      }
      case 'sit': {
        this.heading = lerpAngle(this.heading, st.heading ?? Math.PI, Math.min(1, dt * 8));
        if (angleDiff(this.heading, st.heading ?? Math.PI) < 0.25 || st.t > 0.8) this.sit = Math.min(1, this.sit + dt * 3.2);
        if (this.sit >= 1) this.nextStep();
        break;
      }
      case 'face': {
        this.heading = lerpAngle(this.heading, st.heading, Math.min(1, dt * 7));
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

    // ---- pose targets
    const s = this.sit;
    const reduced = REDUCED_MOTION.matches;
    const hurry = this.speedKind === 'hurry' && this.walking;
    if (this.walking) this.walkPhase += dt * (hurry ? 15 : 8.5) * (this.speedKind === 'stroll' ? 0.85 : 1);
    const swing = this.walking ? Math.sin(this.walkPhase) * (hurry ? 1.25 : 1) : 0;
    const p = this.walking ? (this.propNow === 'reel' || this.propNow === 'paper' ? 'carry' : 'walk') : this.pose;
    const T = { aLx: -0.25 * s, aRx: -0.25 * s, aLz: -0.12, aRz: 0.12, hx: 0, hy: 0, lean: hurry ? 0.18 : 0 };
    let bob = 0;
    const sd = this.seed;
    switch (p) {
      case 'walk':
        T.aLx = -swing * 0.55;
        T.aRx = this.propNow === 'cup' || this.propNow === 'phone' ? -0.9 : swing * 0.55;
        break;
      case 'carry':
        T.aLx = -1.05;
        T.aRx = -1.05;
        T.aLz = 0.18;
        T.aRz = -0.18;
        break;
      case 'type':
        T.aLx = -1.15;
        T.aRx = -1.15;
        T.hx = 0.12;
        break;
      case 'sketch':
        // tablet di kedua tangan, tangan kanan "menggambar"
        T.aLx = -1.1;
        T.aLz = 0.2;
        T.aRx = -1.15 + Math.sin(t * 6 + sd) * 0.12;
        T.aRz = -0.15 + Math.sin(t * 4.3 + sd) * 0.12;
        T.hx = 0.3;
        break;
      case 'idleSeat':
        T.aLx = -0.55;
        T.aRx = this.propNow === 'cup' ? -0.9 - (Math.sin(t * 0.9 + sd) > 0.85 ? 1.2 : 0) : -0.55;
        T.hx = -0.05;
        T.hy = Math.sin(t * 0.4 + sd) * 0.3;
        T.lean = -0.12;
        break;
      case 'phone':
        T.aRx = -1.35;
        T.aRz = -0.25;
        T.aLx = -0.35;
        T.hx = 0.38;
        T.hy = Math.sin(t * 0.7 + sd) * 0.08;
        break;
      case 'drink': {
        const sip = Math.sin(t * 1.1 + sd) > 0.7;
        T.aRx = sip ? -2.2 : -0.9;
        T.aRz = sip ? -0.35 : 0.1;
        T.hx = sip ? -0.25 : 0.05;
        break;
      }
      case 'stretch':
        T.aLz = -2.7;
        T.aRz = 2.7;
        T.aLx = -0.15;
        T.aRx = -0.15;
        T.hx = -0.3;
        T.lean = -0.08;
        break;
      case 'grab':
        T.aLx = -1.7 + Math.sin(t * 6) * 0.2;
        T.aRx = -1.7 + Math.sin(t * 6 + 1) * 0.2;
        T.hx = -0.15;
        break;
      case 'handoff':
        T.aLx = -1.35;
        T.aRx = -1.35;
        T.hx = 0.1;
        break;
      case 'talk':
        T.aRx = -0.7 + Math.sin(t * 5 + sd) * 0.35;
        T.aRz = -0.1 + Math.sin(t * 3.3 + sd) * 0.2;
        T.aLx = -0.3 + Math.sin(t * 4 + sd) * 0.15;
        T.hy = Math.sin(t * 1.7 + sd) * 0.15;
        T.hx = Math.sin(t * 6 + sd) * 0.05;
        break;
      case 'listen':
        T.aLx = -0.65;
        T.aRx = -0.65;
        T.aLz = 0.55;
        T.aRz = -0.55;
        T.hx = Math.max(0, Math.sin(t * 2.2 + sd)) * 0.18;
        break;
      case 'stick':
        T.aRx = -2.35 + Math.sin(t * 4) * 0.25;
        T.aRz = 0.2;
        T.aLx = -0.2;
        T.hx = -0.2;
        break;
      case 'watch':
        T.aLx = -0.75;
        T.aLz = 0.6;
        T.aRx = -1.55 + Math.sin(t * 0.8) * 0.05;
        T.aRz = -0.55;
        T.hx = -0.22;
        break;
      case 'frustrated':
        T.aLz = -2.3;
        T.aRz = 2.3;
        T.aLx = -0.8;
        T.aRx = -0.8;
        T.hy = Math.sin(t * 9) * 0.45;
        T.hx = 0.1;
        bob = Math.abs(Math.sin(t * 7)) * 0.05;
        break;
      case 'slump':
        T.aLx = -0.15;
        T.aRx = -0.15;
        T.hx = 0.45;
        T.lean = 0.1;
        break;
      case 'wait':
        T.aLx = -1.0;
        T.aRx = -1.0 + (Math.sin(t * 7) > 0.6 ? 0.15 : 0);
        T.hx = 0.05;
        T.hy = Math.sin(t * 0.6 + sd) * 0.25;
        break;
      case 'think':
        // Prompt Engineer: tangan di dagu, kepala miring, mata ke atas
        T.aRx = -2.1;
        T.aRz = 0.55;
        T.aLx = -0.9;
        T.aLz = 0.45;
        T.hx = -0.28;
        T.hy = Math.sin(t * 0.8 + sd) * 0.25;
        break;
      case 'stamp': {
        // Owner: angkat stempel lalu hentakkan ke kertas
        const k2 = (t * 2.2) % 1;
        T.aRx = k2 < 0.6 ? -1.3 - k2 * 1.6 : -2.26 + (k2 - 0.6) * 3.2;
        T.aRz = -0.15;
        T.aLx = -1.1;
        T.hx = 0.18;
        break;
      }
      case 'shake':
        T.aLx = -0.9;
        T.aRx = -0.9;
        T.aLz = 0.5;
        T.aRz = -0.5;
        T.hy = Math.sin(t * 11) * 0.42;
        T.hx = 0.08;
        break;
      case 'stand':
      default:
        if (this.propNow === 'cup') T.aRx = -0.9;
        T.hy = Math.sin(t * 0.9 + sd) * 0.35;
        break;
    }
    if (this.status === 'error' && p !== 'frustrated') T.hx = Math.max(T.hx, 0.25);
    const k = Math.min(1, dt * 10);
    const j = this.j;
    for (const key in T) j[key] += (T[key] - j[key]) * k;

    const typing = p === 'type' && s > 0.9;
    const typeOsc = typing && !reduced;

    // ---- clay squash & stretch (volume-preserving scale on the pivot, feet stay planted)
    const fx = this.fx;
    let sy = 1;
    let lift = 0;
    let rz = 0;
    const walkBob = Math.abs(Math.sin(this.walkPhase)); // 0 = footfall, 1 = mid-stride
    if (s >= 0.97 && !this.wasSeated) {
      this.wasSeated = true;
      fx.squish = 0;
    } else if (s < 0.5) this.wasSeated = false;
    if (!reduced) {
      if (this.walking) {
        const foot = 1 - Math.min(1, walkBob / 0.35);
        sy *= 1 - foot * foot * (hurry ? 0.13 : 0.09) + Math.max(0, walkBob - 0.75) * (hurry ? 0.24 : 0.16);
        lift += walkBob * walkBob * (hurry ? 0.11 : 0.075);
      } else {
        sy *= 1 + Math.sin(t * 2.1 + sd) * (s > 0.5 ? 0.012 : 0.02); // breathing
      }
      if (fx.hop >= 0) {
        fx.hop += dt;
        const h = fx.hop;
        if (h < 0.13) sy *= 1 - 0.16 * Math.sin((h / 0.13) * Math.PI * 0.5); // wind-up squash
        else if (h < 0.52) {
          const u = (h - 0.13) / 0.39;
          lift += Math.sin(u * Math.PI) * 0.34;
          sy *= 1 + 0.14 * Math.sin(Math.min(1, u * 1.6) * Math.PI) * (1 - u * 0.5); // stretch in the air
        } else if (h < 0.85) sy *= 1 - 0.15 * Math.sin(((h - 0.52) / 0.33) * Math.PI); // landing squish
        else fx.hop = -1;
      }
      if (fx.squish >= 0) {
        fx.squish += dt;
        sy *= 1 - 0.14 * Math.exp(-fx.squish * 5) * Math.cos(fx.squish * 17);
        if (fx.squish > 1.2) fx.squish = -1;
      }
      if (fx.wobble >= 0) {
        fx.wobble += dt;
        const w = fx.wobble;
        rz += Math.sin(w * 15) * 0.24 * Math.exp(-w * 2);
        sy *= 1 + Math.sin(w * 22) * 0.06 * Math.exp(-w * 3);
        if (w < 0.25) lift += Math.sin((w / 0.25) * Math.PI) * 0.12; // startled jump
        if (w > 2.5) fx.wobble = -1;
      }
      if (p === 'frustrated') rz += Math.sin(t * 9) * 0.05;
    } else {
      fx.hop = -1;
      fx.squish = -1;
      fx.wobble = -1;
    }
    this.lift = lift;
    const sxz = 1 / Math.sqrt(sy);
    this.pivot.scale.set(sxz * this.bodyScale, sy * this.bodyScale, sxz * this.bodyScale);
    this.pivot.rotation.z = rz;

    // ---- blink (dot eyes squeeze shut for a moment; sometimes twice)
    if (t > fx.blinkAt) {
      fx.blink = 0.13;
      fx.blinkAt = t + (this.rand() < 0.2 ? 0.28 : 1.8 + this.rand() * 3.8);
    }
    if (fx.blink > 0) fx.blink -= dt;
    this.eyes.scale.y = fx.blink > 0 ? 0.12 : this.status === 'error' ? 0.7 : 1;

    this.pivot.position.y = 0.17 * s + lift + (typeOsc ? Math.sin(t * 15 + sd) * 0.012 : 0) + bob;
    this.pivot.position.z = 0.12 * s;
    this.pivot.rotation.x = j.lean;
    this.legs[0].rotation.x = swing * 0.6 - (Math.PI / 2) * s * 0.95;
    this.legs[1].rotation.x = -swing * 0.6 - (Math.PI / 2) * s * 0.95;
    this.arms[0].rotation.x = j.aLx + (typeOsc ? Math.sin(t * 22 + sd) * 0.12 : 0);
    this.arms[1].rotation.x = j.aRx + (typeOsc ? Math.sin(t * 22 + sd + 2) * 0.12 : 0);
    this.arms[0].rotation.z = j.aLz;
    this.arms[1].rotation.z = j.aRz;
    this.head.rotation.x = j.hx + (typing ? Math.sin(t * 3 + sd) * 0.04 : 0);
    this.head.rotation.y = j.hy;

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
    gm.opacity += ((glowOn ? 0.22 : 0) - gm.opacity) * Math.min(1, dt * 4);
    this.desk.glow.visible = gm.opacity > 0.005;

    // ---- progress ring (billboard), only while really working
    const showRing = this.busy ? 1 : 0;
    this.ringShown += (showRing - this.ringShown) * Math.min(1, dt * 6);
    this.hud.visible = this.ringShown > 0.01;
    if (this.hud.visible) {
      this.hud.scale.setScalar(Math.max(0.001, this.ringShown));
      this.hud.position.y = 2.05 + 0.15 * s;
      this.hud.quaternion.copy(camQuat);
      const pr = Math.round(Math.max(0.02, this.progress) * 50) / 50;
      if (this.busy && pr !== this.ringProgress) {
        this.ringProgress = pr;
        this.ring.geometry.dispose();
        this.ring.geometry = new THREE.RingGeometry(0.17, 0.225, 32, 1, Math.PI / 2, -pr * Math.PI * 2);
        this.ringMat.color.set(this.status === 'reviewing' ? '#f5a524' : this.color);
      }
    }

    // ---- particles while typing on a real job
    const sparkle = typing && this.busy && !reduced;
    for (const m of this.particles) {
      const u = m.userData;
      if (sparkle) {
        u.life += dt;
        if (u.life >= 0 && !m.visible) {
          m.visible = true;
          u.ox = (this.rand() - 0.5) * 0.8;
          u.oz = -0.5 - this.rand() * 0.5;
          u.spin = (this.rand() - 0.5) * 6;
        }
        if (m.visible) {
          const kk = u.life / 1.6;
          m.position.set(u.ox + Math.sin(u.life * 3 + u.ox * 10) * 0.08, 1.2 + kk * 1.1, u.oz);
          m.rotation.y += u.spin * dt;
          m.material.opacity = Math.sin(Math.min(1, kk) * Math.PI) * 0.9;
          if (kk >= 1) {
            u.life = -this.rand() * 1.2;
            m.visible = false;
          }
        }
      } else if (m.visible) {
        m.material.opacity -= dt * 2;
        if (m.material.opacity <= 0) m.visible = false;
      }
    }

    // ---- error marker
    const isErr = this.status === 'error';
    this.err.visible = isErr;
    this.errDisc.visible = isErr;
    if (isErr) {
      this.err.position.y = 2.2 + 0.15 * s + (reduced ? 0 : Math.abs(Math.sin(t * 4)) * 0.15);
      this.err.quaternion.copy(camQuat);
      const pulse = (t * 1.2) % 1;
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
