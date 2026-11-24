// GlitchPlay HQ: an isometric cut-away of a realistic modern office for the nine content agents.
// Room + furniture come from furniture.js (PBR materials, procedural textures, merged into a few draw calls), people from
// agents.js. This file lays out the room, lights it (RoomEnvironment reflections + one sun through the west windows),
// builds a small walk grid so people use the aisles, and maps each agent's status from data/status.json to choreography
// (sit & type at the own desk, relax on the sofa, get coffee, chat at the bar table …).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as F from './furniture.js';
import { Character, REDUCED_MOTION, createBlobShadows } from './agents.js';

// room interior: x from the window wall (X0) to the open east edge, z from the north wall (Z0) to the open south edge
const X0 = -6.75;
const X1 = 6.75;
const Z0 = -5.4;
const Z1 = 5.1;
const H = 2.7;

const CAM_DIR = new THREE.Vector3(1, 1.05, 1).normalize();
const SUN_POS = new THREE.Vector3(-11, 9.5, 5.5);

// [x, z] of each desk centre (monitor at -z, chair/seat at +z)
const DESKS = {
  bos: [-4.9, -3.25],
  radar: [-1.3, -3.25],
  detektif: [0.8, -3.25],
  narator: [2.9, -3.25],
  strategist: [5.0, -3.25],
  copywriter: [-1.3, -0.05],
  qc: [0.8, -0.05],
  studio: [2.9, -0.05],
  asisten: [5.0, -0.05],
};
const LOUNGE = { minX: -5.2, maxX: -2.3, minZ: 1.3, maxZ: 4.8 };
// places to sit while idle (sofa + poufs), heading = direction the person faces
const SEATS = [
  { x: -6.13, z: 2.57, h: Math.PI / 2 },
  { x: -6.13, z: 3.2, h: Math.PI / 2 },
  { x: -6.13, z: 3.83, h: Math.PI / 2 },
  { x: -3.85, z: 2.72, h: -Math.PI / 2 },
  { x: -3.85, z: 3.68, h: -Math.PI / 2 },
];
// places to stand while idle
const SPOTS = [
  { x: -6.05, z: -0.7, face: -Math.PI / 2, poses: ['phone', 'drink', 'stand'] },
  { x: -4.3, z: 1.45, poses: ['talk', 'listen', 'phone'] },
  { x: -2.45, z: 3.6, poses: ['talk', 'listen', 'stretch'] },
  { x: -4.9, z: 4.75, face: Math.PI, poses: ['phone', 'stretch'] },
  { x: 2.5, z: -4.4, face: Math.PI, poses: ['drink'] },
  { x: 5.0, z: -4.4, face: Math.PI, poses: ['drink'] },
  { x: 1.3, z: -4.45, face: Math.PI, poses: ['drink'] },
  { x: 2.45, z: 3.0, to: [3.2, 3.0], poses: ['talk', 'listen', 'drink'] },
  { x: 3.95, z: 3.0, to: [3.2, 3.0], poses: ['talk', 'listen', 'drink'] },
  { x: 3.2, z: 3.75, to: [3.2, 3.0], poses: ['talk', 'listen', 'phone'] },
  { x: 3.2, z: 2.25, to: [3.2, 3.0], poses: ['talk', 'listen'] },
  { x: 0.8, z: 2.3, poses: ['stretch', 'phone'] },
  { x: 5.3, z: 2.7, poses: ['phone', 'stretch', 'drink'] },
  { x: -1.3, z: 3.1, poses: ['talk', 'listen'] },
];

const STATUS_MAP = { kerja: 'working', selesai: 'idle', error: 'error', idle: 'idle' };

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
  return {
    isFree: (x, z) => free(ci(x), ck(z)) && x > X0 && x < X1 && z > Z0 && z < Z1,
    snap(x, z) {
      const [i, k] = nearest(ci(x), ck(z));
      return free(ci(x), ck(z)) ? new THREE.Vector3(x, 0, z) : center(i, k);
    },
    path(from, to) {
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
    },
  };
}

export function createHQ(host, { agents, colors, onAgentClick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
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
  scene.environmentIntensity = 0.48;
  pmrem.dispose();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const target = new THREE.Vector3((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  camera.position.copy(target).addScaledVector(CAM_DIR, 60);
  camera.lookAt(target);
  camera.updateMatrixWorld();

  // daylight: warm afternoon sun through the west glazing + soft sky/bounce fill (env map does the reflections)
  scene.add(new THREE.HemisphereLight('#eaf1ff', '#8f7c66', 0.42));
  const sun = new THREE.DirectionalLight('#ffe2bd', 3.1);
  sun.position.copy(SUN_POS);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 10, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  sun.shadow.intensity = 0.85;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(-SUN_POS.x, 0, -SUN_POS.z).normalize();

  // ---------------------------------------------------------------- static room (merged afterwards)
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
  const block = (x0, z0, x1, z1) => obstacles.push([x0, z0, x1, z1]);
  room.add(F.makeShell({ X0, X1, Z0, Z1, H, view: CAM_DIR }));

  // CEO office behind a glass partition
  put(F.makeGlassPartition(3.4, H), -3.0, Z0 + 1.7);
  block(-3.05, Z0, -2.95, Z0 + 3.4);
  put(F.makeRug(2.8, 2.3, { base: '#8f9196', border: '#5c5f64', seed: 2 }), -4.85, -3.55);
  put(F.makeWhiteboard(colors.bos), -4.9, Z0, 0, null, 1.5);
  put(F.makeSideChair(), -5.35, -4.45, 0.15, [0.46, 0.46]);
  put(F.makeSideChair(), -4.45, -4.45, -0.15, [0.46, 0.46]);
  put(F.makePlant('fiddle', 1, 2), -6.2, -4.95, 0, [0.5, 0.5]);
  put(F.makePlant('snake', 1.05, 3), -3.42, -4.95, 0, [0.4, 0.4]);
  const clock = put(F.makeClock(), -3.55, Z0, 0, null, 2.12);

  // north wall of the open-plan area: bookshelf, prints + sign, water dispenser, kitchenette, fridge
  put(F.makeBookshelf(1.6, 1.95, 0.34), -2.05, Z0);
  block(-2.85, Z0, -1.25, Z0 + 0.34);
  put(F.makeSign('#38d6ff'), -0.3, Z0, 0, null, 2.3);
  put(F.makeFrame(0.62, 0.84, 'abstract'), -0.85, Z0, 0, null, 1.5);
  put(F.makeFrame(0.62, 0.84, 'game'), -0.05, Z0, 0, null, 1.5);
  put(F.makeFrame(0.5, 0.66, 'landscape', F.MAT.oak), 0.72, Z0, 0, null, 1.6);
  put(F.makeDispenser(), 1.3, Z0);
  block(1.14, Z0, 1.46, Z0 + 0.34);
  put(F.makeKitchenette(4.2), 3.75, Z0);
  block(1.65, Z0, 5.85, Z0 + 0.62);
  put(F.makeFridge(), 6.27, Z0);
  block(5.92, Z0, 6.62, Z0 + 0.7);

  // lounge by the windows
  put(F.makeRug(3.3, 2.6, { base: '#d8d0c1', border: '#7b6a58', seed: 9 }), -4.85, 3.2);
  put(F.makeSofa(), -6.15, 3.2, Math.PI / 2, [2.2, 0.92]);
  put(F.makeCoffeeTable(), -4.95, 3.2, Math.PI / 2, [1.05, 0.56]);
  put(F.makePouf(), -3.85, 2.72, 0, [0.46, 0.46]);
  put(F.makePouf(), -3.85, 3.68, 0, [0.46, 0.46]);
  put(F.makeFloorLamp(), -6.3, 1.8, 0, [0.3, 0.3]);
  put(F.makePlant('monstera', 1.1, 4), -6.1, 0.75, 0, [0.8, 0.8]);
  put(F.makePlant('fiddle', 1.05, 5), -6.2, 4.6, 0, [0.5, 0.5]);
  put(F.makePendant(0.75), -4.95, 3.2, 0, null, 1.95);

  // break corner: stand-up bar table + plants
  put(F.makeHighTable(), 3.2, 3.0, 0, [0.84, 0.84]);
  put(F.makePendant(0.75), 3.2, 3.0, 0, null, 1.95);
  put(F.makePlant('monstera', 1.05, 6), 6.1, 4.5, 0, [0.8, 0.8]);
  put(F.makePlant('snake', 1, 7), 0.6, 4.6, 0, [0.4, 0.4]);
  put(F.makePlant('fiddle', 1, 8), 6.25, 1.65, 0, [0.5, 0.5]);

  // desks + linear lights above them
  const desks = {};
  Object.entries(DESKS).forEach(([id, [x, z]], i) => {
    const bos = id === 'bos';
    const d = F.makeDesk({ accent: colors[id], bos, deco: i });
    put(d.group, x, z);
    const [w, dd] = d.size;
    block(x - w / 2, z - dd / 2, x + w / 2, z + dd / 2);
    block(x - 0.28, z + d.seat.z - 0.28, x + 0.28, z + d.seat.z + 0.28);
    put(F.makeLinearLight(bos ? 1.4 : 1.2, 0.6, 2.2 - 0.735), x, z + 0.05, 0, null, 2.2);
    desks[id] = { screen: d.screen, glow: d.glow, seatWorld: new THREE.Vector3(x, 0, z + d.seat.z), owner: null, w, d: dd };
  });

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

  // ---------------------------------------------------------------- characters
  const nav = createNav(obstacles);
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
    el.className = 'hq-label';
    el.innerHTML = `<i></i><b>${agents[id].emoji} ${agents[id].nama}</b><span></span>`;
    el.onclick = () => onAgentClick?.(id);
    labels.appendChild(el);
    ch.labelEl = el;
  }
  renderer.shadowMap.needsUpdate = true;

  // ---------------------------------------------------------------- choreography
  const want = {}; // id -> {status, aktivitas}
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const release = (ch) => {
    for (const s of SEATS) if (s.by === ch.id) s.by = null;
    for (const s of SPOTS) if (s.by === ch.id) s.by = null;
  };
  const propFor = (pose) => (pose === 'drink' ? 'cup' : pose === 'phone' ? 'phone' : null);
  function goSit(ch, key, label, pose) {
    release(ch);
    const seat = ch.desk.seatWorld;
    ch.setPlan(key, [
      { type: 'do', fn: (c) => c.setProp(null) },
      { type: 'walk', to: seat.clone(), speed: key === 'desk' ? 'hurry' : 'walk' },
      { type: 'sit', heading: Math.PI },
      { type: 'pose', name: pose },
    ], label);
  }
  function wander(ch) {
    release(ch);
    const freeSeats = SEATS.filter((s) => !s.by);
    if (freeSeats.length && Math.random() < 0.4) {
      const s = rand(freeSeats);
      s.by = ch.id;
      const pose = rand(['idleSeat', 'phone', 'drink', 'talk']);
      ch.setPlan('wander', [
        { type: 'do', fn: (c) => c.setProp(null) },
        { type: 'walk', to: new THREE.Vector3(s.x, 0, s.z), speed: 'stroll' },
        { type: 'sit', heading: s.h },
        { type: 'do', fn: (c) => c.setProp(propFor(pose)) },
        { type: 'pose', name: pose === 'drink' ? 'idleSeat' : pose, dur: 8 + Math.random() * 10 },
      ], 'Santai di sofa');
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
      { type: 'pose', name: pose, dur: 6 + Math.random() * 8, face },
    ], 'Santai di lounge');
  }
  function apply(id) {
    const ch = chars[id];
    const w = want[id] || { status: 'idle' };
    const st = w.status;
    ch.applyAgent({ id, name: agents[id].nama, role: agents[id].peran, status: STATUS_MAP[st] || 'idle', currentTask: w.aktivitas });
    ch.deskMode = st === 'kerja' ? 'working' : 'idle';
    const key = st === 'kerja' || st === 'error' ? 'desk' : st === 'selesai' ? 'desk-done' : 'wander';
    if (ch.planKey === key && ch.plan) return;
    if (key === 'wander') {
      ch.onPlanDone = (c) => { if ((want[id]?.status || 'idle') === 'idle') wander(c); };
      wander(ch);
    } else {
      ch.onPlanDone = null;
      goSit(ch, key, w.aktivitas || '', st === 'kerja' ? 'type' : st === 'error' ? 'frustrated' : 'idleSeat');
      if (st === 'selesai') ch.say('Selesai ✓', 4);
    }
  }

  function setAgents(map) {
    for (const id of Object.keys(chars)) {
      const prev = want[id]?.status;
      want[id] = map[id] || { status: 'idle' };
      if (prev !== want[id].status || !chars[id].plan) apply(id);
      const lbl = chars[id].labelEl;
      lbl.dataset.st = want[id].status;
      lbl.querySelector('span').textContent = { kerja: 'kerja', selesai: 'selesai', error: 'error' }[want[id].status] || 'siaga';
    }
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

  // ---------------------------------------------------------------- sizing: fit the whole diorama at any aspect
  const fit = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  {
    const p = new THREE.Vector3();
    const pts = [];
    for (const x of [X0 - 0.15, X1]) {
      for (const z of [Z0 - 0.15, Z1]) {
        pts.push([x, -0.32, z]);
        pts.push([x, x < X1 || z < Z1 ? H : 1.2, z]);
      }
    }
    for (const [x, z] of Object.values(DESKS)) pts.push([x, 2.75, z]); // labels above seated people
    for (const [x, y, z] of pts) {
      p.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      fit.minX = Math.min(fit.minX, p.x);
      fit.maxX = Math.max(fit.maxX, p.x);
      fit.minY = Math.min(fit.minY, p.y);
      fit.maxY = Math.max(fit.maxY, p.y);
    }
  }
  // centre of the desk area in view space: the "zoom in" view looks at the team
  const deskC = new THREE.Vector3();
  {
    const p = new THREE.Vector3();
    const ds = Object.values(DESKS);
    for (const [x, z] of ds) deskC.add(p.set(x, 1, z));
    deskC.divideScalar(ds.length).applyMatrix4(camera.matrixWorldInverse);
  }
  let zoomed = false;
  const zoomBtn = document.createElement('button');
  zoomBtn.type = 'button';
  zoomBtn.className = 'hq-zoom';
  zoomBtn.setAttribute('aria-label', 'Perbesar / perkecil kantor');
  zoomBtn.textContent = '🔍＋';
  zoomBtn.onclick = (e) => {
    e.stopPropagation();
    zoomed = !zoomed;
    zoomBtn.textContent = zoomed ? '🔍－' : '🔍＋';
    resize();
  };
  host.appendChild(zoomBtn);

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
    const bw = (fit.maxX - fit.minX) * 1.03;
    const bh = (fit.maxY - fit.minY) * 1.03;
    let vw = bw;
    let vh = bw / aspect;
    if (vh < bh) {
      vh = bh;
      vw = bh * aspect;
    }
    let cx = (fit.minX + fit.maxX) / 2;
    let cy = (fit.minY + fit.maxY) / 2;
    if (zoomed) { // close-up on the team: ~1.8x, centred on the desks
      vw /= 1.8;
      vh /= 1.8;
      cx = deskC.x;
      cy = deskC.y;
    }
    labels.classList.toggle('compact', w < 480 && !zoomed);
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
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (!REDUCED_MOTION.matches) F.SWAY_U.value = t;
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
    // labels follow heads
    const w = host.clientWidth;
    const h = host.clientHeight;
    for (const ch of list) {
      v.copy(ch.group.position);
      v.y += 2.3 - 0.37 * ch.sit;
      v.project(camera);
      ch.labelEl.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      const bubbleOn = ch.bubble.until > performance.now();
      ch.labelEl.classList.toggle('say', bubbleOn);
      if (bubbleOn) ch.labelEl.querySelector('span').textContent = ch.bubble.text;
    }
  }
  return {
    setAgents,
    start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}
