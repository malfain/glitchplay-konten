// GlitchPlay HQ: an isometric cut-away of a whole office floor in the style of "Kantor AI" (north = -z):
// open workspace with desk clusters (north), glass meeting rooms + Ruang Owner (west), dark lift core with waiting benches
// (centre), phone booths, Rapat 4 orang + Ruang server (east), Teras hijau, Pantry & lounge and Meja fleksibel (south).
// Furniture comes from furniture.js (PBR materials, procedural textures, merged into a few draw calls), people from
// agents.js. A walk grid keeps everyone in the aisles; each agent's status from data/status.json maps to choreography
// (sit & type at the own desk, relax on the sofas / benches, coffee at the pantry, phone in a booth …).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as F from './furniture.js';
import { Character, REDUCED_MOTION, createBlobShadows } from './agents.js';

// floor: x from the west facade (X0) to the open east edge, z from the north facade (Z0) to the open south edge
const X0 = -16;
const X1 = 16;
const Z0 = -13.5;
const Z1 = 12.5;
const H = 2.7;

const CAM_DIR = new THREE.Vector3(1, 1.05, 1).normalize();
const SUN_POS = new THREE.Vector3(-14, 24, 12);

// open-workspace clusters: two desks wide, back to back. Agents sit in the south row (monitor north, chair south).
const ROW_A = -10.2;
const ROW_B = -6.4;
const DESK_DX = [-0.8, 0.8];
const CLUSTERS = [
  { x: -9.3, ids: ['radar', 'detektif'] },
  { x: -3.1, ids: ['strategist', 'narator'] },
  { x: 3.1, ids: ['copywriter', 'qc'] },
  { x: 9.3, ids: ['studio', 'asisten'] },
];
// [x, z] of each desk centre (monitor at -z, chair/seat at +z); the Bos works in the Ruang Owner
const DESKS = { bos: [-12.4, 3.5] };
for (const c of CLUSTERS) c.ids.forEach((id, i) => { DESKS[id] = [c.x + DESK_DX[i], ROW_A + 0.4]; });

// wall lines of the rooms
const WX = -9; // east wall of the west rooms
const EX = 9; // west wall of the east rooms
const SZ = 6; // south band (terrace / pantry / flex) starts here
const CORE = { x0: -4.6, x1: 4.6, z0: -2.6, z1: 3.6 };

const ZONES = [
  { id: 'owner', name: 'Ruang Owner · Bos', rect: [X0, WX, 2.6, SZ], anchor: [-12.4, 2.7, 2.8] },
  { id: 'rapat14', name: 'Rapat besar', rect: [X0, WX, -4, -0.6], anchor: [-12.5, 2.5, -3.7] },
  { id: 'rapat8', name: 'Rapat 8 orang', rect: [X0, WX, -0.6, 2.6], anchor: [-12.5, 2.5, -0.4] },
  { id: 'lobby', name: 'Lobi lift', rect: [-1.6, 1.6, -2.6, 0.6], anchor: [0, 2.1, -1.2], count: true },
  { id: 'booth', name: 'Phone booth', rect: [EX, X1, -4, -0.8], anchor: [12.5, 2.6, -3.3], count: true },
  { id: 'rapat4', name: 'Rapat 4 orang', rect: [EX, 12.6, 0.4, SZ], anchor: [10.8, 2.5, 0.7], count: true },
  { id: 'server', name: 'Ruang server', rect: [12.6, X1, 0.4, SZ], anchor: [14.3, 2.5, 0.7] },
  { id: 'teras', name: 'Teras hijau', rect: [X0, -5, SZ, Z1], anchor: [-10.6, 2.3, 8.6], count: true },
  { id: 'pantry', name: 'Pantry & lounge', rect: [-5, EX, SZ, Z1], anchor: [1.6, 2.5, 7.6], count: true },
  { id: 'flex', name: 'Meja fleksibel', rect: [EX, X1, SZ, Z1], anchor: [12.5, 1.9, 7.4], count: true },
];
const LOUNGE = { minX: -3.5, maxX: 3.5, minZ: 7.6, maxZ: 8.4 }; // first-load idle area (placeInitial)

const STATUS_MAP = { kerja: 'working', selesai: 'idle', error: 'error', idle: 'idle' };
const PILL = { kerja: 'SIBUK', selesai: 'SELESAI', error: 'ERROR' };
const SNAP_KEY = 'gp-hq-snap-v1';
const SNAP_VER = 2; // floor-plan version: snapshots from an older plan are ignored

// ---------------------------------------------------------------- walk grid (A* on 0.2 m cells + string pulling)
function createNav(obstacles) {
  const CELL = 0.2;
  const R = 0.2; // body radius
  const nx = Math.ceil((X1 - X0) / CELL);
  const nz = Math.ceil((Z1 - Z0) / CELL);
  const block = new Uint8Array(nx * nz);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const x = X0 + (i + 0.5) * CELL;
      const z = Z0 + (k + 0.5) * CELL;
      let b = x < X0 + 0.3 || x > X1 - 0.3 || z < Z0 + 0.3 || z > Z1 - 0.3;
      if (!b) for (const [x0, z0, x1, z1] of obstacles) if (x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R) { b = true; break; }
      block[k * nx + i] = b ? 1 : 0;
    }
  }
  const ci = (x) => Math.min(nx - 1, Math.max(0, Math.floor((x - X0) / CELL)));
  const ck = (z) => Math.min(nz - 1, Math.max(0, Math.floor((z - Z0) / CELL)));
  const free = (i, k) => i >= 0 && k >= 0 && i < nx && k < nz && !block[k * nx + i];
  const center = (i, k) => new THREE.Vector3(X0 + (i + 0.5) * CELL, 0, Z0 + (k + 0.5) * CELL);
  // seats inside furniture (chairs, sofas, stools) are entered / left through their own approach point, never through
  // whatever free cell happens to be nearest (that could be behind a sofa back or on the other side of a glass wall)
  const exits = [];
  const exitAt = (p) => exits.find((e) => (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 0.35 * 0.35) || null;
  function nearest(i, k) {
    if (free(i, k)) return [i, k];
    for (let r = 1; r < 40; r++) {
      let best = null;
      let bd = Infinity;
      for (let dk = -r; dk <= r; dk++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dk)) !== r || !free(i + di, k + dk)) continue;
          const d = di * di + dk * dk;
          if (d < bd) { bd = d; best = [i + di, k + dk]; }
        }
      }
      if (best) return best;
    }
    return [i, k];
  }
  function los(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (CELL * 0.4)));
    for (let s = 0; s <= n; s++) if (!free(ci(a.x + (dx * s) / n), ck(a.z + (dz * s) / n))) return false;
    return true;
  }
  function astar(si, sk, gi, gk) {
    const N = nx * nz;
    const gs = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (f, idx) => {
      heap.push([f, idx]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = 2 * c + 1;
          const r = l + 1;
          let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    const hcost = (i, k) => {
      const dx = Math.abs(i - gi);
      const dz = Math.abs(k - gk);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    const s0 = sk * nx + si;
    const goal = gk * nx + gi;
    gs[s0] = 0;
    push(hcost(si, sk), s0);
    while (heap.length) {
      const [, cur] = pop();
      if (cur === goal) {
        const out = [];
        for (let c = cur; c !== -1; c = came[c]) out.push([c % nx, Math.floor(c / nx)]);
        return out.reverse();
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const i = cur % nx;
      const k = Math.floor(cur / nx);
      for (let dk = -1; dk <= 1; dk++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dk) continue;
          const ni = i + di;
          const nk = k + dk;
          if (!free(ni, nk)) continue;
          if (di && dk && (!free(i + di, k) || !free(i, k + dk))) continue; // no corner cutting
          const nIdx = nk * nx + ni;
          const g = gs[cur] + (di && dk ? 1.414 : 1);
          if (g < gs[nIdx]) {
            gs[nIdx] = g;
            came[nIdx] = cur;
            push(g + hcost(ni, nk), nIdx);
          }
        }
      }
    }
    return null;
  }
  function gridPath(from, to) {
    const goal = new THREE.Vector3(to.x, 0, to.z);
    const fi = ci(from.x);
    const fk = ck(from.z);
    const fromFree = free(fi, fk);
    const goalFree = free(ci(to.x), ck(to.z));
    const [si, sk] = nearest(fi, fk);
    const [gi, gk] = nearest(ci(to.x), ck(to.z));
    const cells = astar(si, sk, gi, gk);
    if (!cells || cells.length < 2) return [goal];
    const pts = cells.map(([i, k]) => center(i, k));
    if (fromFree) pts[0] = new THREE.Vector3(from.x, 0, from.z);
    if (goalFree) pts[pts.length - 1] = goal;
    const out = fromFree ? [] : [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !los(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    if (!goalFree) out.push(goal); // final step into the chair / sofa
    return out;
  }
  return {
    isFree: (x, z) => free(ci(x), ck(z)) && x > X0 && x < X1 && z > Z0 && z < Z1,
    /** register a seat inside furniture with the free point in front of / behind it */
    addSeat(x, z, ax, az) { exits.push({ x, z, a: new THREE.Vector3(ax, 0, az) }); },
    snap(x, z) {
      const [i, k] = nearest(ci(x), ck(z));
      return free(ci(x), ck(z)) ? new THREE.Vector3(x, 0, z) : center(i, k);
    },
    path(from, to) {
      const goal = new THREE.Vector3(to.x, 0, to.z);
      const out = [];
      let start = from;
      const ex = !free(ci(from.x), ck(from.z)) && exitAt(from);
      if (ex) { out.push(ex.a.clone()); start = ex.a; }
      const en = !free(ci(to.x), ck(to.z)) && exitAt(to);
      const mid = en ? en.a : goal;
      if ((start.x - mid.x) ** 2 + (start.z - mid.z) ** 2 > 0.0004) out.push(...gridPath(start, mid));
      if (en) out.push(goal);
      return out.length ? out : [goal];
    },
  };
}

export function createHQ(host, { agents, colors, onAgentClick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const labels = document.createElement('div');
  labels.className = 'hq-labels';
  host.appendChild(labels);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose?.();
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  const target = new THREE.Vector3((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  camera.position.copy(target).addScaledVector(CAM_DIR, 80);
  camera.lookAt(target);
  camera.updateMatrixWorld();

  // bright daylight: white sky fill + one soft sun from the north-west (the only shadow-casting light)
  scene.add(new THREE.HemisphereLight('#ffffff', '#d6c8b6', 1.15));
  const sun = new THREE.DirectionalLight('#fff3e3', 2.2);
  sun.position.copy(target).add(SUN_POS);
  sun.target.position.copy(target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 22, bottom: -22, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  sun.shadow.intensity = 0.7;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(-SUN_POS.x, 0, -SUN_POS.z).normalize();

  // ---------------------------------------------------------------- static floor (merged afterwards)
  const room = new THREE.Group();
  const obstacles = [];
  const put = (obj, x, z, ry = 0, fp = null, y = 0) => {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    room.add(obj);
    if (fp) {
      const [w, d] = Math.abs(Math.sin(ry)) > 0.5 ? [fp[1], fp[0]] : fp;
      obstacles.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
    }
    return obj;
  };
  const block = (x0, z0, x1, z1) => obstacles.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  const mat = (c, r = 0.85) => F.accentMat(c, r);
  /** flat tinted floor zone with a thin outline */
  function zone(x0, x1, z0, z1, color, edge = null, y = 0.004) {
    if (edge) {
      const e = F.box(x1 - x0, 0.004, z1 - z0, F.zoneMat(edge), (x0 + x1) / 2, y, (z0 + z1) / 2, false);
      e.castShadow = false;
      room.add(e);
    }
    const inset = edge ? 0.06 : 0;
    const f = F.box(x1 - x0 - inset * 2, 0.004, z1 - z0 - inset * 2, F.zoneMat(color), (x0 + x1) / 2, y + 0.002, (z0 + z1) / 2, false);
    f.castShadow = false;
    room.add(f);
  }
  /** glass partition (thin black frame, frosted band) between two points on an axis; registers a nav wall */
  function wall(x1, z1, x2, z2, h = 2.3) {
    const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const len = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    if (len < 0.05) return;
    put(F.makeGlassPartition(len, h), (x1 + x2) / 2, (z1 + z2) / 2, alongX ? Math.PI / 2 : 0);
    if (alongX) block(x1, z1 - 0.05, x2, z2 + 0.05);
    else block(x1 - 0.05, z1, x2 + 0.05, z2);
  }
  /** wall along one axis with door gaps [[a, b], …] (coordinates along that axis) */
  function wallWithDoors(fixed, from, to, doors, alongX) {
    let a = from;
    for (const [d0, d1] of [...doors, [to, to]]) {
      if (d0 - a > 0.05) alongX ? wall(a, fixed, d0, fixed) : wall(fixed, a, fixed, d0);
      a = d1;
    }
  }

  // slab, terrazzo floor, facades
  F.MAT.terrazzo.map.repeat.set((X1 - X0) / 1.2, (Z1 - Z0) / 1.2);
  const W = X1 - X0;
  const D = Z1 - Z0;
  const CX = (X0 + X1) / 2;
  const CZ = (Z0 + Z1) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), F.MAT.terrazzo);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ);
  floor.receiveShadow = true;
  room.add(floor);
  room.add(F.box(W + 0.5, 0.36, D + 0.5, mat('#d3cdc4', 0.9), CX - 0.05, -0.181, CZ - 0.05, false));
  {
    const sill = mat('#f4f3f0', 0.6);
    const glassH = H - 0.55;
    // north + west: white sill, floor-to-ceiling glass with slim black mullions and a top beam
    room.add(F.box(W + 0.3, 0.55, 0.2, sill, CX - 0.15, 0.275, Z0 - 0.1));
    room.add(F.box(0.2, 0.55, D, sill, X0 - 0.1, 0.275, CZ));
    room.add(F.box(W, glassH, 0.012, F.MAT.glass, CX, 0.55 + glassH / 2, Z0 - 0.1, false));
    room.add(F.box(0.012, glassH, D, F.MAT.glass, X0 - 0.1, 0.55 + glassH / 2, CZ, false));
    room.add(F.box(W + 0.3, 0.12, 0.22, F.MAT.metal, CX - 0.15, H, Z0 - 0.1, false));
    room.add(F.box(0.22, 0.12, D, F.MAT.metal, X0 - 0.1, H, CZ, false));
    for (let x = X0; x <= X1 + 0.01; x += 1.6) room.add(F.box(0.05, H, 0.07, F.MAT.metal, x, H / 2, Z0 - 0.1));
    for (let z = Z0 + 1.6; z <= Z1 + 0.01; z += 1.6) room.add(F.box(0.07, H, 0.05, F.MAT.metal, X0 - 0.1, H / 2, z));
    // solid feature wall behind the middle clusters: sign, prints, clock, bookshelf, water dispenser
    room.add(F.box(6.6, H, 0.2, F.MAT.wall, 0, H / 2, Z0 - 0.1));
    room.add(F.box(6.6, 0.012, 0.2, F.MAT.cap, 0, H + 0.006, Z0 - 0.1, false));
    // low dark curb on the open south + east edges
    room.add(F.box(W + 0.3, 0.12, 0.12, F.MAT.cap, CX - 0.15, 0.06, Z1 + 0.06, false));
    room.add(F.box(0.12, 0.12, D + 0.2, F.MAT.cap, X1 + 0.06, 0.06, CZ - 0.1, false));
  }
  put(F.makeBookshelf(1.6, 1.95, 0.34), -2.15, Z0);
  block(-2.95, Z0, -1.35, Z0 + 0.34);
  put(F.makeSign('#38d6ff'), -0.3, Z0, 0, null, 2.25);
  put(F.makeFrame(0.62, 0.84, 'abstract'), -0.85, Z0, 0, null, 1.45);
  put(F.makeFrame(0.62, 0.84, 'game'), -0.05, Z0, 0, null, 1.45);
  put(F.makeFrame(0.5, 0.66, 'landscape', F.MAT.oak), 0.72, Z0, 0, null, 1.55);
  put(F.makeDispenser(), 1.4, Z0);
  block(1.24, Z0, 1.56, Z0 + 0.34);
  const clock = put(F.makeClock(), 2.45, Z0, 0, null, 2.1);
  put(F.makePlant('fiddle', 1, 2), 2.85, Z0 + 0.4, 0, [0.5, 0.5]);

  // ---------------------------------------------------------------- open workspace (north)
  zone(X0, X1, Z0, -4, '#e3ecf5', '#c3d8ec');
  const tint = (c) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.8).getHexString();
  /** two-wide back-to-back cluster; returns the south-row desks */
  function cluster(cx, cz, accents, live) {
    const out = [];
    DESK_DX.forEach((dx, i) => {
      if (accents[i]) zone(cx + dx - 0.8, cx + dx + 0.8, cz - 1.55, cz + 1.55, tint(accents[i]), null, 0.012);
      const n = F.makeDesk({ accent: accents[i] || '#8a94a6', deco: i + 3, live: false });
      put(n.group, cx + dx, cz - 0.4, Math.PI);
      const s = F.makeDesk({ accent: accents[i] || '#8a94a6', deco: i, live });
      put(s.group, cx + dx, cz + 0.4);
      out.push(s);
      // chairs (desk tops are blocked as one rect below)
      block(cx + dx - 0.28, cz - 0.4 - s.seat.z - 0.28, cx + dx + 0.28, cz - 0.4 - s.seat.z + 0.28);
      block(cx + dx - 0.28, cz + 0.4 + s.seat.z - 0.28, cx + dx + 0.28, cz + 0.4 + s.seat.z + 0.28);
    });
    block(cx - 1.55, cz - 0.78, cx + 1.55, cz + 0.78);
    return out;
  }
  const desks = {};
  const deskObj = (d, x, z) => ({ screen: d.screen, glow: d.glow, seatWorld: new THREE.Vector3(x, 0, z + d.seat.z), heading: Math.PI, owner: null, w: d.size[0], d: d.size[1] });
  for (const c of CLUSTERS) {
    const made = cluster(c.x, ROW_A, c.ids.map((id) => colors[id]), true);
    c.ids.forEach((id, i) => { desks[id] = deskObj(made[i], ...DESKS[id]); });
  }
  // spare desks (row B) + huddle corner between them
  const flexSeats = [];
  for (const x of [-9.3, 9.3]) cluster(x, ROW_B, [null, null], false);
  put(F.makeBoardStand('#38d6ff'), -2.4, -6.7, 0, [2.0, 0.5]);
  put(F.makeHighTable(), 1.6, -6.1, 0, [0.84, 0.84]);
  put(F.makePlant('monstera', 1.0, 4), -5.4, -6.6, 0, [0.8, 0.8]);
  put(F.makePlant('monstera', 1.0, 6), 5.4, -6.6, 0, [0.8, 0.8]);
  put(F.makePlant('snake', 1, 3), -15.2, -12.8, 0, [0.4, 0.4]);
  put(F.makePlant('fiddle', 1.05, 5), 15.3, -12.8, 0, [0.5, 0.5]);
  put(F.makePlant('snake', 1, 7), -7.0, -13.05, 0, [0.4, 0.4]);
  put(F.makePlant('snake', 1, 8), 7.0, -13.05, 0, [0.4, 0.4]);

  // ---------------------------------------------------------------- west: Rapat besar, Rapat 8 orang, Ruang Owner
  zone(X0, WX, -4, SZ, '#f6f6f5', '#d8d8d6');
  wall(X0, -4, WX, -4);
  wall(X0, -0.6, WX, -0.6);
  wall(X0, 2.6, WX, 2.6);
  wall(X0, SZ, WX, SZ);
  wallWithDoors(WX, -4, SZ, [[-2.1, -0.95], [1.3, 2.45], [4.55, 5.75]], false);
  put(F.makeMeetingTable(3.2, 1.05, 4), -12.6, -2.3);
  block(-12.6 - 2.25, -2.3 - 1.2, -12.6 + 2.25, -2.3 + 1.2);
  put(F.makeTV(), X0 + 0.02, -2.3, Math.PI / 2);
  put(F.makeMeetingTable(2.3, 1.0, 3), -12.6, 1.0);
  block(-12.6 - 1.8, 1.0 - 1.15, -12.6 + 1.8, 1.0 + 1.15);
  put(F.makeTV(), X0 + 0.02, 1.0, Math.PI / 2);
  put(F.makePlant('snake', 0.95, 11), -9.5, -3.55, 0, [0.4, 0.4]);
  put(F.makePlant('snake', 0.95, 12), -9.5, 0.0, 0, [0.4, 0.4]);
  // Ruang Owner: walnut CEO desk facing the whiteboard, small sofa + coffee table, rug, plants
  put(F.makeRug(4.4, 2.6, { base: '#8f9196', border: '#5c5f64', seed: 2 }), -12.3, 4.2, 0, null, 0.012);
  put(F.makeWhiteboard(colors.bos), -12.4, 2.66, 0, null, 1.5);
  put(F.makeSofa(), -15.35, 4.3, Math.PI / 2, [2.2, 0.92]);
  put(F.makeCoffeeTable(), -14.3, 4.3, Math.PI / 2, [1.05, 0.56]);
  put(F.makePlant('fiddle', 1, 9), -9.55, 3.1, 0, [0.5, 0.5]);
  put(F.makePlant('monstera', 0.9, 10), -15.4, 2.95, 0, [0.7, 0.7]);
  {
    const d = F.makeDesk({ accent: colors.bos, bos: true, deco: 0 });
    const [x, z] = DESKS.bos;
    put(d.group, x, z);
    block(x - d.size[0] / 2, z - d.size[1] / 2, x + d.size[0] / 2, z + d.size[1] / 2);
    block(x - 0.28, z + d.seat.z - 0.28, x + 0.28, z + d.seat.z + 0.28);
    desks.bos = deskObj(d, x, z);
  }

  // ---------------------------------------------------------------- core: lifts, lobby, stairs, toilets (dark)
  {
    const { x0, x1, z0, z1 } = CORE;
    zone(x0, x1, z0, z1, '#454545', null, 0.004);
    const cw = (x1 - x0) / 3;
    const ch = (z1 - z0) / 2;
    const cellMat = mat('#2a2a2b', 0.85);
    const cells = [['lift', 0, 0, 1.6], ['lobby', 1, 0, 0], ['lift', 2, 0, 1.6], ['stairs', 0, 1, 1.25], ['wc', 1, 1, 1.45], ['stairs', 2, 1, 1.25]];
    for (const [kind, col, row, h] of cells) {
      const cx = x0 + cw * (col + 0.5);
      const cz = z0 + ch * (row + 0.5);
      if (!h) {
        zone(cx - cw / 2 + 0.15, cx + cw / 2 - 0.15, cz - ch / 2 + 0.1, cz + ch / 2 - 0.1, '#5a5a5a', null, 0.009);
        continue;
      }
      room.add(F.box(cw - 0.15, h, ch - 0.15, cellMat, cx, h / 2, cz));
      block(cx - (cw - 0.15) / 2, cz - (ch - 0.15) / 2, cx + (cw - 0.15) / 2, cz + (ch - 0.15) / 2);
      if (kind === 'stairs') for (let s = 0; s < 6; s++) room.add(F.box(cw - 0.7, 0.03, 0.14, mat('#58585a'), cx, h + 0.015, cz - ch / 2 + 0.6 + s * 0.38, false));
      if (kind === 'wc') room.add(F.box(cw - 0.6, 0.02, ch - 0.6, mat('#3a3a3c'), cx, h + 0.01, cz, false));
    }
    // lift doors facing the lobby (cut-away height)
    const d1 = put(F.makeLiftDoors(3, ch - 0.5), x0 + cw - 0.075, z0 + ch / 2, Math.PI / 2);
    d1.scale.y = 0.72;
    const d2 = put(F.makeLiftDoors(3, ch - 0.5), x0 + cw * 2 + 0.075, z0 + ch / 2, -Math.PI / 2);
    d2.scale.y = 0.72;
    for (const [x, z] of [[x0 - 0.3, z0 - 0.3], [x1 + 0.3, z0 - 0.3], [x0 - 0.3, z1 + 0.3], [x1 + 0.3, z1 + 0.3]]) {
      room.add(F.box(0.45, H, 0.45, F.MAT.concrete, x, H / 2, z));
      block(x - 0.225, z - 0.225, x + 0.225, z + 0.225);
    }
    // dark waiting benches either side of the core
    put(F.makeLoungeBench(2.4), x0 - 0.8, 0.5, Math.PI / 2, [2.4, 0.62]);
    put(F.makeLoungeBench(2.4), x1 + 0.8, 0.5, Math.PI / 2, [2.4, 0.62]);
    put(F.makePlant('monstera', 0.95, 13), x0 - 0.85, 2.6, 0, [0.75, 0.75]);
    put(F.makePlant('monstera', 0.95, 14), x1 + 0.85, 2.6, 0, [0.75, 0.75]);
  }

  // ---------------------------------------------------------------- east: phone booths, Rapat 4 orang, Ruang server
  zone(EX, X1, -4, -0.8, '#f7f7f6', '#dcdcda');
  const BOOTH_X = [9.95, 11.65, 13.35, 15.05];
  const BOOTH_Z = -2.4;
  for (const x of BOOTH_X) {
    put(F.makeBooth(), x, BOOTH_Z);
    block(x - 0.78, BOOTH_Z - 0.8, x + 0.78, BOOTH_Z - 0.7); // back
    block(x - 0.8, BOOTH_Z - 0.8, x - 0.7, BOOTH_Z + 0.78); // sides
    block(x + 0.7, BOOTH_Z - 0.8, x + 0.8, BOOTH_Z + 0.78);
  }
  zone(EX, 12.6, 0.4, SZ, '#f6f6f5', '#d8d8d6');
  zone(12.6, X1, 0.4, SZ, '#ececed', '#d0d0d2');
  wall(EX, 0.4, X1, 0.4);
  wall(12.6, 0.4, 12.6, SZ);
  wallWithDoors(EX, 0.4, SZ, [[2.5, 3.7]], false);
  wallWithDoors(SZ, EX, X1, [[13.0, 14.2]], true);
  put(F.makeRoundTable(0.6, 4), 10.8, 3.3);
  block(10.8 - 0.62, 3.3 - 0.62, 10.8 + 0.62, 3.3 + 0.62);
  put(F.makeTV(), 10.8, 0.47);
  put(F.makePlant('snake', 0.95, 15), 12.15, 5.55, 0, [0.4, 0.4]);
  const RACK_X = [13.25, 13.9, 14.55, 15.2];
  for (const x of RACK_X) put(F.makeRack(), x, 1.05);
  block(12.95, 0.55, 15.5, 1.55);
  room.add(F.box(0.7, 1.9, 0.8, F.MAT.white, 15.5, 0.95, 4.9));
  block(15.15, 4.5, 15.85, 5.3);

  // ---------------------------------------------------------------- south-west: Teras hijau
  zone(X0, -5, SZ, Z1, '#d9ebdb', '#a9d3ae');
  const TREES = [[-14.9, 7.3, 1.0], [-11.0, 7.2, 0.85], [-6.2, 7.3, 0.9], [-15.0, 11.5, 0.95], [-10.7, 11.7, 1.0], [-6.3, 11.6, 0.85], [-8.4, 7.2, 0.7]];
  TREES.forEach(([x, z, s], i) => put(F.makeTree(s, i + 1), x, z, 0, [s, s]));
  const BENCHES = [[-12.8, 9.6], [-8.4, 9.9]];
  for (const [x, z] of BENCHES) put(F.makeBench(2.2), x, z, 0, [2.2, 0.5]);
  put(F.makePlant('snake', 1, 16), -5.5, 12.1, 0, [0.4, 0.4]);

  // ---------------------------------------------------------------- south: Pantry & lounge
  zone(-5, EX, SZ, Z1, '#fbecd6', '#f2cf98');
  put(F.makeSlatScreen(7.2, 2.0), -0.4, SZ + 0.15);
  put(F.makeKitchenette(4.2), -0.4, SZ + 0.3);
  put(F.makeDispenser(), -3.0, SZ + 0.3);
  put(F.makeFridge(), 2.25, SZ + 0.3);
  block(-4.0, SZ + 0.05, 3.2, SZ + 0.25);
  block(-2.5, SZ + 0.25, 1.7, SZ + 0.95);
  block(-3.16, SZ + 0.25, -2.84, SZ + 0.6);
  block(1.9, SZ + 0.25, 2.6, SZ + 0.98);
  const TABLES = [[-2.6, 9.4], [1.0, 9.8]];
  for (const [x, z] of TABLES) {
    put(F.makeRoundTable(0.6, 4), x, z);
    block(x - 0.62, z - 0.62, x + 0.62, z + 0.62);
  }
  put(F.makeHighTable(), -4.1, 11.5, 0, [0.84, 0.84]);
  put(F.makeRug(3.4, 4.4, { base: '#d8d0c1', border: '#7b6a58', seed: 9 }), 5.7, 9.75, 0, null, 0.012);
  put(F.makeSofa(), 5.7, 8.1, 0, [2.2, 0.92]);
  put(F.makeSofa(), 5.7, 11.4, Math.PI, [2.2, 0.92]);
  put(F.makeCoffeeTable(), 5.7, 9.75, 0, [1.05, 0.56]);
  put(F.makeBeanbag(), 8.15, 9.8, 0, [0.9, 0.9]);
  put(F.makeFloorLamp(), 3.95, 8.0, 0, [0.3, 0.3]);
  put(F.makePlant('monstera', 1.05, 17), 8.35, 7.0, 0, [0.8, 0.8]);
  put(F.makePlant('fiddle', 1.0, 18), -1.0, 12.0, 0, [0.5, 0.5]);
  put(F.makePlant('snake', 1, 19), 3.4, 12.05, 0, [0.4, 0.4]);

  // ---------------------------------------------------------------- south-east: Meja fleksibel (hot desks)
  zone(EX, X1, SZ, Z1, '#e3ecf5', '#c3d8ec');
  for (const [i, x] of [10.3, 12.5, 14.7].entries()) {
    const d = F.makeDesk({ accent: '#8a94a6', deco: i + 5, live: false });
    put(d.group, x, 8.3);
    block(x - d.size[0] / 2, 8.3 - d.size[1] / 2, x + d.size[0] / 2, 8.3 + d.size[1] / 2);
    block(x - 0.28, 8.3 + d.seat.z - 0.28, x + 0.28, 8.3 + d.seat.z + 0.28);
    flexSeats.push([x, 8.3 + d.seat.z]);
  }
  put(F.makePlant('monstera', 1.0, 20), 15.35, 11.9, 0, [0.8, 0.8]);
  put(F.makePlant('fiddle', 1.0, 21), 9.6, 12.0, 0, [0.5, 0.5]);
  put(F.makePlant('snake', 1, 22), 15.5, 6.6, 0, [0.4, 0.4]);

  const traffic = []; // cars driving on the road (animated in frame(), not merged)
  const walkers = []; // people strolling in the garden / around the building (animated in frame())
  function placeWalker(w) {
    const sg = w.segs.find((q) => w.d >= q.at && w.d < q.at + q.l) || w.segs[0];
    const k = (w.d - sg.at) / sg.l;
    w.g.position.set(sg.a[0] + (sg.b[0] - sg.a[0]) * k, -0.03, sg.a[1] + (sg.b[1] - sg.a[1]) * k);
    w.g.rotation.y = Math.atan2(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]);
  }
  // ---------------------------------------------------------------- outside: garden (taman) + parking lot (parkiran)
  // Pure scenery around the building (merged with the room, no nav/obstacles: nobody walks outside).
  {
    const ext = new THREE.Group();
    const m = (c, r = 0.9) => F.accentMat(c, r);
    const flat = (w, d, mt, x, z, y = -0.03) => { const b = F.box(w, 0.02, d, mt, x, y, z, false); b.receiveShadow = true; ext.add(b); return b; };
    const GZ = Z0 - 9; // garden path behind the building
    const R = (() => { let t = 1234567; return () => ((t = (t * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
    const GRASS = m('#9ccc65', 1), GRASS2 = m('#8bc34a', 1), PATH = m('#e7dfd0', 0.95), CURB = m('#c9c4ba', 0.9);
    const ASPH = m('#4b5058', 0.95), LINE = m('#f5f5f0', 0.7), YEL = m('#f2c14e', 0.7);
    // big lawn + sidewalk ring around the building
    flat(150, 150, GRASS, 0, 0, -0.06);
    flat(X1 - X0 + 5, Z1 - Z0 + 5, PATH, (X0 + X1) / 2, (Z0 + Z1) / 2, -0.045);
    // ---- parking lot in front (south, +z) and the road along the east (+x)
    const PZ0 = Z1 + 4.5, PZ1 = Z1 + 22, PX0 = X0 - 2, PX1 = X1 + 4;
    flat(PX1 - PX0 + 0.6, PZ1 - PZ0 + 0.6, CURB, (PX0 + PX1) / 2, (PZ0 + PZ1) / 2, -0.04);
    flat(PX1 - PX0, PZ1 - PZ0, ASPH, (PX0 + PX1) / 2, (PZ0 + PZ1) / 2, -0.035);
    flat(5, 4.6, PATH, 0, Z1 + 2.3, -0.04); // walkway from the entrance to the lot
    const RX = X1 + 9; // road
    flat(8, 150, ASPH, RX, 0, -0.035);
    for (let z = -70; z < 70; z += 5) flat(0.18, 2.4, LINE, RX, z, -0.024);
    flat(PX1 - RX + 4, 6, ASPH, (PX1 + RX) / 2, (PZ0 + PZ1) / 2, -0.034); // driveway lot → road
    flat(2.2, 150, PATH, RX - 5.2, 0, -0.04); // pavement beside the road
    const CAR_COLS = ['#e53935', '#1e88e5', '#fafafa', '#212121', '#9e9e9e', '#fbc02d', '#43a047', '#5e35b1', '#ff7043', '#90a4ae'];
    const glass = m('#1c2733', 0.15), tyre = m('#141414', 0.9), lamp = m('#fff3c4', 0.4), tail = m('#c62828', 0.5);
    function car(x, z, ry, col, parent = ext) {
      const g = new THREE.Group();
      const body = m(col, 0.35);
      g.add(F.rbox(1.8, 0.62, 4.2, 0.18, body, 0, 0.55, 0));
      g.add(F.rbox(1.6, 0.55, 2.3, 0.2, body, 0, 1.08, -0.2));
      g.add(F.box(1.62, 0.42, 2.0, glass, 0, 1.1, -0.2, false));
      for (const [wx, wz] of [[-0.86, 1.3], [0.86, 1.3], [-0.86, -1.3], [0.86, -1.3]]) {
        const w = F.cyl(0.36, 0.36, 0.26, tyre, wx, 0.36, wz, 14);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
      g.add(F.box(1.5, 0.12, 0.04, lamp, 0, 0.66, 2.1, false));
      g.add(F.box(1.5, 0.12, 0.04, tail, 0, 0.66, -2.1, false));
      g.position.set(x, -0.03, z);
      g.rotation.y = ry;
      parent.add(g);
      return g;
    }
    // moving traffic: two lanes, opposite directions, spaced out, different speeds
    const lanes = [{ x: RX + 1.9, dir: 1 }, { x: RX - 1.9, dir: -1 }];
    let n = 0;
    for (const ln of lanes) {
      for (let i = 0; i < 3; i++) {
        const g = car(ln.x, -60 + i * 40 + R() * 12, ln.dir > 0 ? 0 : Math.PI, CAR_COLS[(n * 3 + 1) % CAR_COLS.length], scene);
        g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        traffic.push({ g, dir: ln.dir, speed: 7 + R() * 5 });
        n++;
      }
    }
    // ---- pedestrians: light, human-proportioned figures that walk closed routes (legs/arms swing)
    const SKINS = ['#f1c9a5', '#e0ac85', '#c68863', '#a0694a', '#7b4b32'];
    const TOPS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#ffffff', '#263238', '#00897b', '#f06292'];
    const BOTTOMS = ['#263238', '#37474f', '#5d4037', '#1a237e', '#795548', '#9e9e9e'];
    const HAIRS = ['#1b1b1b', '#3e2723', '#5d4037', '#8d6e63', '#212121'];
    const limb = (w, h, d, mt) => { const g = new THREE.Group(); const b = F.box(w, h, d, mt, 0, -h / 2, 0); b.castShadow = false; g.add(b); return g; };
    function person(seed) {
      const g = new THREE.Group();
      const skin = m(SKINS[seed % SKINS.length], 0.8), top = m(TOPS[(seed * 3) % TOPS.length], 0.85);
      const bottom = m(BOTTOMS[(seed * 5) % BOTTOMS.length], 0.9), hair = m(HAIRS[(seed * 7) % HAIRS.length], 0.9), shoe = m('#222', 0.8);
      const hijab = seed % 4 === 1;
      const legL = limb(0.15, 0.82, 0.17, bottom), legR = limb(0.15, 0.82, 0.17, bottom);
      legL.position.set(-0.1, 0.86, 0); legR.position.set(0.1, 0.86, 0);
      for (const l of [legL, legR]) { const sh = F.box(0.16, 0.08, 0.26, shoe, 0, -0.84, 0.04); sh.castShadow = false; l.add(sh); }
      const torso = F.rbox(0.44, 0.62, 0.26, 0.08, top, 0, 1.17, 0); torso.castShadow = false;
      const armL = limb(0.11, 0.62, 0.12, top), armR = limb(0.11, 0.62, 0.12, top);
      armL.position.set(-0.28, 1.45, 0); armR.position.set(0.28, 1.45, 0);
      for (const a of [armL, armR]) { const hnd = F.box(0.1, 0.1, 0.1, skin, 0, -0.66, 0); hnd.castShadow = false; a.add(hnd); }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), hijab ? m(TOPS[(seed + 4) % TOPS.length], 0.9) : skin);
      head.position.y = 1.64;
      g.add(legL, legR, torso, armL, armR, head);
      if (hijab) { const veil = F.rbox(0.34, 0.24, 0.3, 0.1, head.material, 0, 1.5, -0.01); veil.castShadow = false; g.add(veil); const face = F.box(0.16, 0.14, 0.02, skin, 0, 1.63, 0.12, false); g.add(face); }
      else { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair); cap.position.y = 1.65; g.add(cap); }
      scene.add(g);
      return { g, legL, legR, armL, armR };
    }
    // routes: closed polylines on paths (world x,z)
    const ring = (cx, cz, r, n = 24) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r]);
    const SW = 1.25; // sidewalk ring around the building
    const routes = [
      [[-22, GZ], [18, GZ]], // along the garden path (there and back)
      [[18, GZ + 0.5], [-22, GZ + 0.5]],
      ring(-12, GZ - 6, 5.6), // around the pond
      [[X0 - SW, Z0 - SW], [X1 + SW, Z0 - SW], [X1 + SW, Z1 + SW], [X0 - SW, Z1 + SW]], // around the building
      [[-2, GZ], [-2, Z0 - SW], [X1 + SW, Z0 - SW], [X1 + SW, GZ + 3], [-2, GZ + 0.6]],
      ring(-12, GZ - 6, 6.2).reverse(),
    ];
    routes.forEach((pts, i) => {
      const segs = [];
      let len = 0;
      for (let j = 0; j < pts.length; j++) {
        const a = pts[j], b = pts[(j + 1) % pts.length];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        segs.push({ a, b, l, at: len });
        len += l;
      }
      const jog = i === 3;
      walkers.push({ ...person(i * 2 + 3), segs, len, d: R() * len, speed: jog ? 2.6 : 1.0 + R() * 0.35, jog, phase: R() * 6 });
      if (i < 3) walkers.push({ ...person(i * 2 + 4), segs, len, d: R() * len, speed: 1.05 + R() * 0.3, jog: false, phase: R() * 6 });
    });
    for (const w of walkers) placeWalker(w);
    // two rows of stalls facing a central aisle, white lines, some parked cars
    const STALL = 2.7;
    const rows = [{ z0: PZ0 + 0.4, face: 0 }, { z0: PZ1 - 5.6, face: Math.PI }];
    let k = 0;
    for (const row of rows) {
      for (let x = PX0 + 1.2; x + STALL <= PX1 - 0.4; x += STALL) {
        flat(0.12, 5.2, LINE, x, row.z0 + 2.6, -0.024);
        const cx = x + STALL / 2;
        if (R() < 0.68) car(cx + (R() - 0.5) * 0.2, row.z0 + 2.6, row.face + (R() - 0.5) * 0.06, CAR_COLS[k++ % CAR_COLS.length]);
      }
    }
    for (let x = PX0 + 1; x < PX1 - 1; x += 3) flat(1.2, 0.16, YEL, x, (PZ0 + PZ1) / 2, -0.024); // aisle arrows/markings
    // hedges + lamp posts around the lot
    const hedge = m('#558b2f', 1);
    for (let x = PX0; x <= PX1; x += 2.4) { const h = F.rbox(2.2, 0.7, 0.8, 0.3, hedge, x, 0.32, PZ1 + 0.9); ext.add(h); }
    const post = m('#3a3d42', 0.5), bulb = m('#fff7d6', 0.3);
    function lampPost(x, z) { ext.add(F.cyl(0.07, 0.09, 3.6, post, x, 1.8, z, 8)); ext.add(F.box(0.9, 0.08, 0.22, post, x + 0.35, 3.6, z)); ext.add(F.box(0.5, 0.05, 0.16, bulb, x + 0.55, 3.55, z, false)); }
    for (let x = PX0 + 2; x < PX1; x += 9) lampPost(x, (PZ0 + PZ1) / 2);
    // ---- garden (taman): behind (north) and beside (west) the building
    const trunk = m('#6d4c41', 0.9), leafA = m('#4caf50', 1), leafB = m('#66bb6a', 1), leafC = m('#2e7d32', 1);
    const blob = new THREE.IcosahedronGeometry(1, 1);
    function tree(x, z, s = 1) {
      const g = new THREE.Group();
      g.add(F.cyl(0.14 * s, 0.2 * s, 1.6 * s, trunk, 0, 0.8 * s, 0, 8));
      const n = 3 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const mm = new THREE.Mesh(blob, [leafA, leafB, leafC][i % 3]);
        mm.position.set((R() - 0.5) * 0.9 * s, (1.9 + R() * 0.8) * s, (R() - 0.5) * 0.9 * s);
        mm.scale.setScalar((0.7 + R() * 0.45) * s);
        mm.castShadow = true;
        g.add(mm);
      }
      g.position.set(x, -0.03, z);
      ext.add(g);
    }
    const inFree = (x, z) => !(x > X0 - 3.5 && x < X1 + 3.5 && z > Z0 - 3.5 && z < Z1 + 3.5) && !(x > PX0 - 2 && x < PX1 + 2 && z > PZ0 - 2 && z < PZ1 + 2.5) && Math.abs(x - RX) > 6.5;
    // lush garden north + west, scattered trees elsewhere
    for (let i = 0; i < 240; i++) {
      const x = -60 + R() * 120, z = -60 + R() * 120;
      if (!inFree(x, z)) continue;
      const garden = z < Z0 || x < X0;
      if (!garden && R() < 0.6) continue;
      tree(x, z, 0.8 + R() * 0.7);
    }
    // winding garden path with a pond, benches and flower beds behind the building
    flat(40, 2.2, PATH, -2, GZ, -0.04);
    flat(2.2, 9, PATH, -2, Z0 - 4.5, -0.04);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), m('#4fc3f7', 0.1));
    pond.rotation.x = -Math.PI / 2; pond.position.set(-12, -0.02, GZ - 6); ext.add(pond);
    const rim = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.8, 40), CURB);
    rim.rotation.x = -Math.PI / 2; rim.position.set(-12, -0.025, GZ - 6); ext.add(rim);
    for (const bx of [-16, 6, 12]) { const b = F.makeBench(2.2); b.position.set(bx, -0.03, GZ - 1.6); ext.add(b); }
    const flowers = ['#e91e63', '#ffca28', '#ab47bc', '#ff7043', '#ffffff'];
    for (let f = 0; f < 6; f++) {
      const fx = -18 + f * 7, fz = GZ + 2.6;
      flat(4.4, 1.6, m('#795548', 1), fx, fz, -0.035);
      for (let j = 0; j < 14; j++) {
        const fl = F.box(0.22, 0.22, 0.22, m(flowers[(f + j) % flowers.length], 0.8), fx - 2 + R() * 4, 0.12, fz - 0.6 + R() * 1.2, false);
        ext.add(fl);
      }
    }
    for (let x = -18; x <= 14; x += 8) lampPost(x, GZ + 1.6);
    flat(18, 14, GRASS2, -40, 0, -0.05); // a lighter lawn patch west
    room.add(ext);
  }

  const baked = F.mergeStatic(room);
  scene.add(baked);

  // invisible pick boxes so a tap on a desk opens its agent
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const [id, [x, z]] of Object.entries(DESKS)) {
    const pick = new THREE.Mesh(new THREE.BoxGeometry(desks[id].w, 1.4, desks[id].d + 0.9), pickMat);
    pick.position.set(x, 0.7, z + 0.35);
    pick.userData.agentId = id;
    scene.add(pick);
  }

  // ---------------------------------------------------------------- idle places (seats inside furniture + standing spots)
  const nav = createNav(obstacles);
  const SEATS = [];
  const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  /** front = the person faces away from the furniture (sofa, bench): approach from the front; else from behind */
  function seat(x, z, h, label, poses, front = true, dist = 0.7) {
    const s = front ? dist : -dist;
    const ax = x + Math.sin(h) * s;
    const az = z + Math.cos(h) * s;
    nav.addSeat(x, z, ax, az);
    SEATS.push({ x, z, h, label, poses });
  }
  for (const id of Object.keys(desks)) {
    const p = desks[id].seatWorld;
    nav.addSeat(p.x, p.z, p.x, p.z + 0.7);
  }
  for (const dx of [-0.63, 0, 0.63]) {
    seat(5.7 + dx, 8.22, 0, 'Santai di lounge', ['idleSeat', 'phone', 'drink', 'talk']);
    seat(5.7 + dx, 11.28, Math.PI, 'Santai di lounge', ['idleSeat', 'phone', 'drink', 'talk']);
  }
  for (const [tx, tz] of TABLES) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = tx + Math.cos(a) * 1.02;
      const z = tz + Math.sin(a) * 1.02;
      seat(x, z, faceTo(x, z, tx, tz), 'Ngopi di pantry', ['drink', 'talk', 'listen', 'phone'], false, 0.6);
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = 10.8 + Math.cos(a) * 1.02;
    const z = 3.3 + Math.sin(a) * 1.02;
    seat(x, z, faceTo(x, z, 10.8, 3.3), 'Rapat 4 orang', ['talk', 'listen'], false, 0.6);
  }
  for (const [x, z] of BENCHES) for (const dx of [-0.5, 0.5]) seat(x + dx, z + 0.05, 0, 'Santai di teras hijau', ['idleSeat', 'phone', 'drink']);
  for (const dz of [-0.1, 1.1]) {
    seat(CORE.x0 - 0.85, 0.5 + dz - 0.5, -Math.PI / 2, 'Duduk di lobi', ['phone', 'idleSeat']);
    seat(CORE.x1 + 0.85, 0.5 + dz - 0.5, Math.PI / 2, 'Duduk di lobi', ['phone', 'idleSeat']);
  }
  for (const x of BOOTH_X) seat(x, BOOTH_Z - 0.05, Math.PI, 'Telepon di phone booth', ['phone'], false, 0.85);
  for (const [x, z] of flexSeats) seat(x, z, Math.PI, 'Di meja fleksibel', ['idleSeat', 'phone', 'drink'], false, 0.7);

  // places to stand while idle; heading = direction the person faces
  const SPOTS = [
    { x: 0.85, z: 7.55, face: Math.PI, poses: ['drink'], label: 'Ngopi di pantry' },
    { x: -1.6, z: 7.55, face: Math.PI, poses: ['drink', 'talk'], label: 'Ngopi di pantry' },
    { x: -3.0, z: 7.3, face: Math.PI, poses: ['drink'], label: 'Ambil minum' },
    { x: 2.25, z: 7.65, face: Math.PI, poses: ['drink', 'phone'], label: 'Ambil camilan' },
    { x: -4.85, z: 11.5, to: [-4.1, 11.5], poses: ['talk', 'listen', 'drink'], label: 'Ngobrol di pantry' },
    { x: -3.35, z: 11.5, to: [-4.1, 11.5], poses: ['talk', 'listen', 'drink'], label: 'Ngobrol di pantry' },
    { x: -4.1, z: 10.75, to: [-4.1, 11.5], poses: ['talk', 'listen'], label: 'Ngobrol di pantry' },
    { x: 0.85, z: -6.1, to: [1.6, -6.1], poses: ['talk', 'listen', 'drink'], label: 'Diskusi santai' },
    { x: 2.35, z: -6.1, to: [1.6, -6.1], poses: ['talk', 'listen'], label: 'Diskusi santai' },
    { x: -2.4, z: -5.85, face: Math.PI, poses: ['talk', 'listen'], label: 'Corat-coret ide' },
    { x: -6.2, z: -12.6, face: Math.PI, poses: ['stretch', 'phone'], label: 'Lihat pemandangan' },
    { x: 6.2, z: -12.5, face: Math.PI, poses: ['stretch', 'phone'], label: 'Lihat pemandangan' },
    { x: 1.4, z: -12.75, face: Math.PI, poses: ['drink'], label: 'Ambil minum' },
    { x: -0.55, z: -1.2, face: -Math.PI / 2, poses: ['phone', 'stand'], label: 'Nunggu lift' },
    { x: 0.55, z: -0.4, face: Math.PI / 2, poses: ['phone', 'stand'], label: 'Nunggu lift' },
    { x: 14.2, z: 2.4, face: Math.PI, poses: ['phone', 'stand'], label: 'Cek ruang server' },
    { x: -10.3, z: 8.8, to: [-9.5, 8.8], poses: ['talk', 'listen', 'drink'], label: 'Ngobrol di teras' },
    { x: -9.5, z: 8.8, to: [-10.3, 8.8], poses: ['talk', 'listen', 'drink'], label: 'Ngobrol di teras' },
    { x: -14.6, z: 9.6, face: -Math.PI / 2, poses: ['stretch', 'phone'], label: 'Peregangan di teras' },
    { x: -13.2, z: 11.9, face: 0, poses: ['stretch', 'phone', 'drink'], label: 'Santai di teras hijau' },
    { x: 8.0, z: 11.9, face: 0, poses: ['phone', 'stretch'], label: 'Santai di lounge' },
  ].filter((s) => nav.isFree(s.x, s.z));

  // ---------------------------------------------------------------- characters, labels, bubbles
  const blobs = createBlobShadows(scene, sunDir);
  const chars = {};
  for (const id of Object.keys(DESKS)) {
    const roomInfo = { id, desks: [desks[id]], wander: LOUNGE };
    const ch = new Character({ agent: { id, name: agents[id].nama, role: agents[id].peran, status: 'idle' }, color: colors[id], room: roomInfo, slot: 0, nav });
    ch.group.traverse((o) => { if (o.isMesh) o.userData.agentId = id; });
    ch.placeInitial();
    scene.add(ch.group);
    chars[id] = ch;

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hq-label';
    el.style.setProperty('--c', colors[id]);
    el.innerHTML = '<i></i><em></em><b></b><span>IDLE</span>';
    el.querySelector('em').textContent = agents[id].emoji;
    el.querySelector('b').textContent = agents[id].nama;
    el.setAttribute('aria-label', `${agents[id].nama}, ${agents[id].peran}`);
    el.onclick = (e) => { e.stopPropagation(); onAgentClick?.(id); };
    labels.appendChild(el);
    ch.labelEl = el;
    const bub = document.createElement('div');
    bub.className = 'hq-bubble';
    bub.setAttribute('aria-hidden', 'true');
    labels.appendChild(bub);
    ch.bubbleEl = bub;
    ch.bubbleVer = -1;
  }
  renderer.shadowMap.needsUpdate = true;

  // zone labels (grey dot + name, live head-count pill); a tap zooms to the zone
  const zoneLabels = ZONES.map((z) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hq-zone';
    el.innerHTML = '<b></b><span hidden></span>';
    el.querySelector('b').textContent = z.name;
    const [x0, x1, z0, z1] = z.rect;
    el.onclick = (e) => { e.stopPropagation(); focusOn(new THREE.Vector3((x0 + x1) / 2, 0.5, (z0 + z1) / 2), 2.6); };
    labels.appendChild(el);
    return { ...z, el, anchor: new THREE.Vector3(...z.anchor), n: -1 };
  });

  // "Staf 9" pill (top-left) + vertical zoom buttons (bottom-right)
  const staff = document.createElement('div');
  staff.className = 'hq-staf';
  staff.innerHTML = `<i></i>Staf <b>${Object.keys(DESKS).length}</b>`;
  host.appendChild(staff);
  const zoomCtl = document.createElement('div');
  zoomCtl.className = 'hq-zoomctl';
  zoomCtl.innerHTML = '<button type="button" data-z="in" aria-label="Perbesar">+</button><button type="button" data-z="out" aria-label="Perkecil">−</button><button type="button" data-z="home" aria-label="Lihat seluruh lantai">⌂</button>';
  host.appendChild(zoomCtl);

  // ---------------------------------------------------------------- choreography
  const want = {}; // id -> {status, aktivitas}
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const release = (ch) => {
    for (const s of SEATS) if (s.by === ch.id) s.by = null;
    for (const s of SPOTS) if (s.by === ch.id) s.by = null;
  };
  const propFor = (pose) => (pose === 'drink' ? 'cup' : pose === 'phone' ? 'phone' : null);
  const CHAT = { stretch: ['Hmmh... peregangan dulu'], drink: ['Ngopi dulu ☕', 'Segeer…'], talk: ['Ide konten baru nih!', 'Trending apa hari ini?', 'Mantap, lanjut!'], phone: ['Bentar, telepon dulu'] };
  const chatter = (pose) => {
    const p = { stretch: 1, drink: 0.3, talk: 0.3, phone: 0.15 }[pose] || 0;
    return Math.random() < p ? [{ type: 'say', text: rand(CHAT[pose]), dur: 4 }] : [];
  };
  function goSit(ch, key, label, pose) {
    release(ch);
    const seatW = ch.desk.seatWorld;
    ch.setPlan(key, [
      { type: 'do', fn: (c) => c.setProp(null) },
      { type: 'walk', to: seatW.clone(), speed: key === 'desk' ? 'hurry' : 'walk' },
      { type: 'sit', heading: ch.desk.heading },
      { type: 'pose', name: pose },
    ], label);
  }
  function wander(ch) {
    release(ch);
    const freeSeats = SEATS.filter((s) => !s.by);
    if (freeSeats.length && Math.random() < 0.45) {
      const s = rand(freeSeats);
      s.by = ch.id;
      const pose = rand(s.poses);
      ch.setPlan('wander', [
        { type: 'do', fn: (c) => c.setProp(null) },
        { type: 'walk', to: new THREE.Vector3(s.x, 0, s.z), speed: 'stroll' },
        { type: 'sit', heading: s.h },
        { type: 'do', fn: (c) => c.setProp(propFor(pose)) },
        ...chatter(pose),
        { type: 'pose', name: pose === 'drink' ? 'idleSeat' : pose, dur: 8 + Math.random() * 10 },
      ], s.label);
      return;
    }
    const spots = SPOTS.filter((s) => !s.by);
    const s = rand(spots.length ? spots : SPOTS);
    s.by = ch.id;
    const to = nav.snap(s.x + (Math.random() - 0.5) * 0.2, s.z + (Math.random() - 0.5) * 0.2);
    const face = s.to ? Math.atan2(s.to[0] - to.x, s.to[1] - to.z) : s.face ?? Math.random() * Math.PI * 2;
    const pose = rand(s.poses);
    ch.setPlan('wander', [
      { type: 'do', fn: (c) => c.setProp(null) },
      { type: 'walk', to, speed: 'stroll' },
      { type: 'do', fn: (c) => c.setProp(propFor(pose)) },
      ...chatter(pose),
      { type: 'pose', name: pose, dur: 6 + Math.random() * 8, face },
    ], s.label);
  }

  // ---------------------------------------------------------------- keep everyone where they were across page reloads
  let snap = null;
  try {
    const raw = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
    if (raw && raw.v === SNAP_VER && Date.now() - raw.t < 30 * 60 * 1000) snap = raw.c; // older than 30 min: start fresh
  } catch { snap = null; }
  function saveSnap() {
    try {
      const c = {};
      for (const [id, ch] of Object.entries(chars)) {
        const p = ch.group.position;
        c[id] = { x: p.x, z: p.z, h: ch.heading, sit: ch.sit, pose: ch.pose, key: ch.planKey || '', prop: ch.propNow || null,
                  label: ch.activity || '', st: want[id]?.status || 'idle' };
      }
      localStorage.setItem(SNAP_KEY, JSON.stringify({ t: Date.now(), v: SNAP_VER, c }));
    } catch { /* storage blocked: nothing to keep */ }
  }
  window.addEventListener('pagehide', saveSnap);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSnap(); });
  setInterval(saveSnap, 2000);

  /** first apply after a reload: put the person back exactly where they were and carry on from there (no walk-in) */
  function resume(id) {
    const s0 = snap?.[id];
    if (!s0) return false;
    delete snap[id];
    const ch = chars[id];
    const st = want[id]?.status || 'idle';
    if (s0.st !== st) return false; // status changed while away: let the normal plan move them
    const key = st === 'kerja' || st === 'error' ? 'desk' : st === 'selesai' ? 'desk-done' : 'wander';
    if (key !== 'wander') {
      ch.onPlanDone = null;
      if ((s0.x - ch.desk.seatWorld.x) ** 2 + (s0.z - ch.desk.seatWorld.z) ** 2 > 0.05) return false; // not at the desk: walk there
    }
    ch.group.position.set(s0.x, 0, s0.z);
    ch.heading = s0.h;
    ch.group.rotation.y = s0.h;
    ch.sit = s0.sit;
    if (key !== 'wander') {
      ch.setPlan(key, [{ type: 'pose', name: st === 'kerja' ? 'type' : st === 'error' ? 'frustrated' : 'idleSeat' }], want[id]?.aktivitas || '');
      return true;
    }
    // idle: re-claim the seat / spot they were using, hold the pose a little longer, then wander as usual
    for (const s of [...SEATS, ...SPOTS]) if (!s.by && Math.hypot(s.x - s0.x, s.z - s0.z) < 0.45) { s.by = id; break; }
    ch.onPlanDone = (c) => { if ((want[id]?.status || 'idle') === 'idle') wander(c); };
    ch.setPlan('wander', [
      { type: 'do', fn: (c) => c.setProp(s0.prop) },
      { type: 'pose', name: s0.pose && s0.pose !== 'walk' ? s0.pose : (s0.sit > 0.5 ? 'idleSeat' : 'stand'), dur: 4 + Math.random() * 6 },
    ], s0.label || (s0.sit > 0.5 ? 'Santai di lounge' : 'Santai'));
    return true;
  }

  function apply(id) {
    const ch = chars[id];
    const w = want[id] || { status: 'idle' };
    const st = w.status;
    ch.applyAgent({ id, name: agents[id].nama, role: agents[id].peran, status: STATUS_MAP[st] || 'idle', currentTask: w.aktivitas });
    ch.deskMode = st === 'kerja' ? 'working' : 'idle';
    const key = st === 'kerja' || st === 'error' ? 'desk' : st === 'selesai' ? 'desk-done' : 'wander';
    if (ch.planKey === key && ch.plan) return;
    if (resume(id)) return;
    if (key === 'wander') {
      ch.onPlanDone = (c) => { if ((want[id]?.status || 'idle') === 'idle') wander(c); };
      wander(ch);
    } else {
      ch.onPlanDone = null;
      goSit(ch, key, w.aktivitas || '', st === 'kerja' ? 'type' : st === 'error' ? 'frustrated' : 'idleSeat');
      if (st === 'selesai') ch.say('Selesai ✓', 4);
      if (st === 'error') ch.say('Aduh, error…', 4);
    }
  }

  function setAgents(map) {
    let busy = 0;
    for (const id of Object.keys(chars)) {
      const prev = want[id]?.status;
      want[id] = map[id] || { status: 'idle' };
      if (prev !== want[id].status || !chars[id].plan) apply(id);
      const st = want[id].status;
      if (st === 'kerja') busy += 1;
      const lbl = chars[id].labelEl;
      lbl.dataset.st = st;
      lbl.querySelector('span').textContent = PILL[st] || 'IDLE';
    }
    staff.classList.toggle('busy', busy > 0);
    staff.title = busy ? `${busy} sedang kerja` : 'Semua siaga';
  }

  // ---------------------------------------------------------------- picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('click', (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.userData.agentId);
    if (hit) onAgentClick?.(hit.object.userData.agentId);
  });

  // ---------------------------------------------------------------- sizing: home view frames the whole floor
  const fit = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  {
    const p = new THREE.Vector3();
    for (const x of [X0 - 0.3, X1 + 0.15]) {
      for (const z of [Z0 - 0.3, Z1 + 0.15]) {
        for (const y of [-0.36, x < X1 || z < Z1 ? H + 0.1 : 0.2]) {
          p.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          fit.minX = Math.min(fit.minX, p.x);
          fit.maxX = Math.max(fit.maxX, p.x);
          fit.minY = Math.min(fit.minY, p.y);
          fit.maxY = Math.max(fit.maxY, p.y);
        }
      }
    }
  }
  // zoom 1 = whole floor; pinch / wheel / buttons zoom up to ZMAX, drag pans while zoomed (view-space offset)
  let zoom = 1;
  const pan = { x: 0, y: 0 };
  const ZMAX = 7;
  const view = { w: 1, h: 1 }; // current world-units per canvas (set in resize)
  let anim = null;
  function animateTo(z, px, py, dur = 0.55) {
    if (REDUCED_MOTION.matches) dur = 0.01;
    anim = { z0: zoom, x0: pan.x, y0: pan.y, z1: Math.min(ZMAX, Math.max(1, z)), x1: px, y1: py, t0: performance.now(), dur: dur * 1000 };
  }
  /** fly so `world` is centred at zoom z */
  function focusOn(world, z) {
    const v = world.clone().applyMatrix4(camera.matrixWorldInverse);
    animateTo(z, v.x - (fit.minX + fit.maxX) / 2, v.y - (fit.minY + fit.maxY) / 2);
  }
  function setZoom(z, ax = 0.5, ay = 0.5) { // keep the point under the fingers/cursor still while zooming
    anim = null;
    const nz = Math.min(ZMAX, Math.max(1, z));
    const fx = (ax - 0.5) * view.w;
    const fy = (0.5 - ay) * view.h;
    pan.x += fx - fx * (zoom / nz);
    pan.y += fy - fy * (zoom / nz);
    zoom = nz;
    if (zoom <= 1.001) { pan.x = pan.y = 0; }
    resize();
  }
  zoomCtl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    const k = b.dataset.z;
    if (k === 'home') animateTo(1, 0, 0);
    else {
      const base = anim ? anim.z1 : zoom; // quick repeated taps keep stepping
      const nz = Math.min(ZMAX, Math.max(1, base * (k === 'in' ? 1.5 : 1 / 1.5)));
      animateTo(nz, nz <= 1.001 ? 0 : anim ? anim.x1 : pan.x, nz <= 1.001 ? 0 : anim ? anim.y1 : pan.y, 0.3);
    }
  });
  const cv = renderer.domElement;
  const ptrs = new Map();
  let pinch = 0;
  let dragged = 0;
  cv.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    setZoom(zoom * Math.exp(-e.deltaY * 0.0022), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  cv.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = 0;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const prev = ptrs.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    ptrs.set(e.pointerId, cur);
    const r = cv.getBoundingClientRect();
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) setZoom(zoom * (d / pinch), ((a.x + b.x) / 2 - r.left) / r.width, ((a.y + b.y) / 2 - r.top) / r.height);
      pinch = d;
      dragged = 99;
    } else if (zoom > 1.001) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      dragged += Math.abs(dx) + Math.abs(dy);
      anim = null;
      pan.x -= (dx / r.width) * view.w;
      pan.y += (dy / r.height) * view.h;
      resize();
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('click', (e) => { if (dragged > 6) e.stopImmediatePropagation(); }, true); // a drag is not a tap

  let fitted = false;
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    fitted = true;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    const aspect = w / h;
    const bw = (fit.maxX - fit.minX) * 1.02;
    const bh = (fit.maxY - fit.minY) * 1.02 + (36 / h) * (fit.maxY - fit.minY); // room for the top pills
    let vw = bw;
    let vh = bw / aspect;
    if (vh < bh) {
      vh = bh;
      vw = bh * aspect;
    }
    const bx = (fit.minX + fit.maxX) / 2;
    const by = (fit.minY + fit.maxY) / 2 + (18 / h) * vh;
    const fullW = vw;
    const fullH = vh;
    vw /= zoom;
    vh /= zoom;
    // keep the zoomed window inside the whole-floor view
    pan.x = Math.max(-(fullW - vw) / 2, Math.min((fullW - vw) / 2, pan.x));
    pan.y = Math.max(-(fullH - vh) / 2, Math.min((fullH - vh) / 2, pan.y));
    const cx = bx + pan.x;
    const cy = by + pan.y;
    view.w = vw;
    view.h = vh;
    // phones: let a one-finger swipe scroll the page until zoomed in; then it pans the office
    cv.style.touchAction = zoom > 1.001 || host.classList.contains('full') ? 'none' : 'pan-y';
    labels.classList.toggle('compact', w < 480 && zoom < 2.3);
    labels.classList.toggle('tiny', w < 480 && zoom < 1.35);
    camera.left = cx - vw / 2;
    camera.right = cx + vw / 2;
    camera.top = cy + vh / 2;
    camera.bottom = cy - vh / 2;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // ---------------------------------------------------------------- loop
  const v = new THREE.Vector3();
  const hands = clock.userData.hands;
  let last = performance.now();
  let raf = 0;
  let running = false;
  let clockAt = 0;
  let countAt = 0;
  let declutterAt = 0;
  const inRect = (p, [x0, x1, z0, z1]) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1;
  function place(el, world, w, h, dy = 0) {
    v.copy(world).project(camera);
    const x = ((v.x + 1) / 2) * w;
    const y = ((1 - v.y) / 2) * h + dy;
    const off = x < -80 || x > w + 80 || y < -40 || y > h + 80;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    el.style.visibility = off ? 'hidden' : '';
  }
  /** zone labels never cover agent labels (or each other) */
  function declutter() {
    const placed = [];
    for (const ch of Object.values(chars)) {
      ch.lw = ch.labelEl.offsetWidth;
      ch.lh = ch.labelEl.offsetHeight;
      const r = ch.labelEl.getBoundingClientRect();
      if (r.width) placed.push(r);
    }
    const hit = (r) => placed.some((b) => r.left < b.right + 2 && r.right > b.left - 2 && r.top < b.bottom + 2 && r.bottom > b.top - 2);
    for (const z of zoneLabels) {
      z.el.classList.remove('covered');
      const r = z.el.getBoundingClientRect();
      if (!r.width) continue;
      if (hit(r)) z.el.classList.add('covered');
      else placed.push(r);
    }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (!REDUCED_MOTION.matches) {
      F.SWAY_U.value = t;
      for (const w of walkers) { // people stroll their routes; legs and arms swing with the step
        w.d = (w.d + w.speed * dt) % w.len;
        placeWalker(w);
        const sw = Math.sin(t * (w.jog ? 9 : 6) + w.phase) * (w.jog ? 0.7 : 0.45);
        w.legL.rotation.x = sw; w.legR.rotation.x = -sw;
        w.armL.rotation.x = -sw * 0.8; w.armR.rotation.x = sw * 0.8;
        w.g.position.y = -0.03 + Math.abs(Math.cos(t * (w.jog ? 9 : 6) + w.phase)) * (w.jog ? 0.06 : 0.025);
      }
      for (const c of traffic) { // cars loop along the road
        let z = c.g.position.z + c.dir * c.speed * dt;
        if (z > 75) z -= 150;
        if (z < -75) z += 150;
        c.g.position.z = z;
      }
    }
    if (anim) {
      const k0 = Math.min(1, (now - anim.t0) / anim.dur);
      const k = k0 < 0.5 ? 4 * k0 ** 3 : 1 - (-2 * k0 + 2) ** 3 / 2;
      zoom = anim.z0 + (anim.z1 - anim.z0) * k;
      pan.x = anim.x0 + (anim.x1 - anim.x0) * k;
      pan.y = anim.y0 + (anim.y1 - anim.y0) * k;
      if (k0 >= 1) anim = null;
      resize();
    }
    if (now - clockAt > 1000) {
      clockAt = now;
      const d = new Date();
      const mins = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
      hands.m.rotation.z = -((mins % 60) / 60) * Math.PI * 2;
      hands.h.rotation.z = -((mins % 720) / 720) * Math.PI * 2;
    }
    const list = Object.values(chars);
    for (const ch of list) {
      if (ch.status === 'working') ch.progress = ((t * 0.08 + ch.seed % 7 / 7) % 1);
      ch.update(dt, t, camera.quaternion);
      ch.desk.screen?.tick(now);
    }
    blobs.update(list);
    if (!fitted) resize();
    if (!fitted) return; // host still hidden: don't render with an unfitted camera
    renderer.render(scene, camera);
    const w = host.clientWidth;
    const h = host.clientHeight;
    // labels follow heads (neighbours that would overlap are stacked upwards); bubbles sit just above them
    const placed = [];
    const lab = list.map((ch) => {
      v.copy(ch.group.position);
      v.y += 2.15 - 0.37 * ch.sit;
      v.project(camera);
      return { ch, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, w: ch.lw || 40, h: ch.lh || 20 };
    }).sort((a, b) => b.y - a.y);
    for (const L of lab) {
      for (let k = 0; k < 4; k++) {
        const o = placed.find((p) => Math.abs(p.x - L.x) < (p.w + L.w) / 2 + 2 && Math.abs(p.y - L.y) < (p.h + L.h) / 2 + 1);
        if (!o) break;
        L.y = o.y - o.h - 2;
      }
      placed.push(L);
      const { ch } = L;
      const off = L.x < -80 || L.x > w + 80 || L.y < -40 || L.y > h + 80;
      ch.labelEl.style.transform = `translate(${L.x.toFixed(1)}px, ${L.y.toFixed(1)}px) translate(-50%, -100%)`;
      ch.labelEl.style.visibility = off ? 'hidden' : '';
      const b = ch.bubble;
      const on = b.until > now && b.text;
      if (on && ch.bubbleVer !== b.ver) {
        ch.bubbleVer = b.ver;
        ch.bubbleEl.textContent = b.text;
      }
      ch.bubbleEl.classList.toggle('show', Boolean(on));
      if (on) ch.bubbleEl.style.transform = `translate(${L.x.toFixed(1)}px, ${(L.y - L.h - 3).toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const z of zoneLabels) place(z.el, z.anchor, w, h);
    if (now - countAt > 1000) {
      countAt = now;
      for (const z of zoneLabels) {
        if (!z.count) continue;
        const n = list.filter((ch) => inRect(ch.group.position, z.rect)).length;
        if (n === z.n) continue;
        z.n = n;
        const pill = z.el.querySelector('span');
        pill.textContent = `${n} orang`;
        pill.hidden = !n;
        z.el.classList.toggle('busy', n > 0);
      }
    }
    if (now - declutterAt > 300) {
      declutterAt = now;
      declutter();
    }
  }
  return {
    setAgents,
    start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}
