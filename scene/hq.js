// GlitchPlay HQ: a small isometric clay office for the six content agents.
// Furniture + clay characters are copied from Kantor AI (furniture.js, agents.js); this file only lays out the room
// and maps each agent's status from data/status.json to simple choreography (sit & type, relax, wander the lounge).
import * as THREE from 'three';
import {
  box, mat, makeDesk, makePlant, makeWhiteboard, makeShelf, makeSofa, makeCounter, makeFridge,
  makeRoundTable, makeFloorLamp, makeDispenser, pastel, SWAY_U,
} from './furniture.js';
import { Character, REDUCED_MOTION, createBlobShadows } from './agents.js';

const W = 15;
const D = 11;
const X0 = -W / 2;
const Z0 = -D / 2;
const WALL_H = 2.4;

const CAM_DIR = new THREE.Vector3(1, 1.05, 1).normalize();

// [x, z] of each desk centre (desk faces -z, chair/seat at +z)
const DESKS = {
  bos: [-5.0, -3.4],
  radar: [-1.1, -3.4],
  detektif: [1.35, -3.4],
  narator: [3.8, -3.4],
  copywriter: [-1.1, 0.3],
  qc: [1.35, 0.3],
  studio: [3.8, 0.3],
};
const LOUNGE = { minX: -6.8, maxX: -2.6, minZ: 1.6, maxZ: 4.8 };
const LOUNGE_SPOTS = [[-5.6, 2.3], [-4.3, 3.9], [-6.2, 4.3], [-3.3, 2.6], [-2.9, 4.4], [5.4, 3.6], [4.2, 3.7], [6.2, 2.4], [0.2, 3.4], [2.6, 4.2], [-0.8, 4.6]];

const STATUS_MAP = { kerja: 'working', selesai: 'idle', error: 'error', idle: 'idle' };

export function createHQ(host, { agents, colors, onAgentClick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const labels = document.createElement('div');
  labels.className = 'hq-labels';
  host.appendChild(labels);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const target = new THREE.Vector3(0, 0, 0.4);
  camera.position.copy(target).addScaledVector(CAM_DIR, 60);
  camera.lookAt(target);

  // clay diorama light (same recipe as Kantor AI)
  scene.add(new THREE.HemisphereLight('#fffaf2', '#d2bea9', 1.85));
  const sun = new THREE.DirectionalLight('#fff1e0', 1.8);
  sun.position.set(-8, 20, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 50 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 6;
  sun.shadow.intensity = 0.8;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#e3eeff', 0.6);
  fill.position.set(10, 9, -5);
  scene.add(fill);

  // ---------------------------------------------------------------- shell
  const floor = box(W, 0.3, D, mat('#f3f1ee'), 0, -0.15, 0);
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(box(W + 0.3, 0.12, D + 0.3, mat('#2a2f3d'), 0, -0.36, 0, false)); // plinth
  // back (north) + left (west) walls, like a cut-away diorama
  scene.add(box(W, WALL_H, 0.22, mat('#fafafa'), 0, WALL_H / 2, Z0 + 0.11));
  scene.add(box(0.22, WALL_H, D, mat('#fafafa'), X0 + 0.11, WALL_H / 2, 0));
  // brand stripe on the back wall
  scene.add(box(4.2, 0.5, 0.04, mat('#1f2633'), 3.6, 1.65, Z0 + 0.24, false));
  scene.add(box(1.2, 0.08, 0.05, mat('#38d6ff'), 2.4, 1.5, Z0 + 0.27, false));

  // zone tiles: bos office, workspace, lounge
  scene.add(box(4.4, 0.02, 4.1, mat(pastel('#fbecd6', { lift: 0.1 })), -5.0, 0.011, -3.35, false));
  scene.add(box(7.6, 0.02, 7.2, mat('#dfe9f4'), 1.35, 0.011, -1.6, false));
  scene.add(box(4.6, 0.02, 3.8, mat('#d9ebdb'), -4.7, 0.011, 3.3, false));
  // glass partition between bos office and workspace
  const glassM = new THREE.MeshStandardMaterial({ color: '#cfe6fb', transparent: true, opacity: 0.28, roughness: 0.3, depthWrite: false });
  scene.add(box(0.06, 1.9, 3.6, glassM, -2.75, 0.95, -3.55, false));
  scene.add(box(0.12, 0.1, 3.6, mat('#404040'), -2.75, 1.92, -3.55, false));

  // ---------------------------------------------------------------- desks
  const desks = {};
  for (const [id, [x, z]] of Object.entries(DESKS)) {
    const d = makeDesk({ accent: colors[id], chairColor: id === 'bos' ? '#353a48' : '#404040' });
    d.group.position.set(x, 0, z);
    d.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.agentId = id; } });
    scene.add(d.group);
    desks[id] = { screen: d.screen, glow: d.glow, reel: d.reel, seatWorld: new THREE.Vector3(x, 0, z + 0.95), owner: null };
    // accent name plate on the floor in front of each desk
    scene.add(box(1.2, 0.025, 0.12, mat(colors[id]), x, 0.03, z + 1.75, false));
  }

  // ---------------------------------------------------------------- props
  const add = (obj, x, z, ry = 0) => {
    obj.position.set(x, 0, z);
    obj.rotation.y = ry;
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(obj);
    return obj;
  };
  const wb = makeWhiteboard(colors.bos);
  wb.position.set(-5.0, 0.2, Z0 + 0.3);
  scene.add(wb);
  add(makePlant(1.1, 0), -6.7, -4.8);
  add(makePlant(0.9, 1), -3.2, -4.8);
  add(makeShelf(colors.radar), 6.5, -4.9);
  add(makePlant(1.2, 1), 6.7, -1.6);
  add(makeFloorLamp(), -6.8, -1.9);
  // lounge / pantry
  const counter = makeCounter();
  counter.scale.set(0.62, 1, 1);
  add(counter, -5.0, D / 2 - 0.45);
  add(makeFridge(), -2.2, D / 2 - 0.45);
  add(makeSofa('#c9b8f0'), -6.75, 3.0, Math.PI / 2);
  add(makeRoundTable(0.55, 3), -4.6, 2.6);
  add(makeDispenser(), 6.6, 4.6);
  add(makePlant(1.0, 0), 6.6, 0.9);
  add(makePlant(0.8, 1), -2.3, 1.7);
  add(makeSofa('#bfe3cf'), 4.4, 4.7, Math.PI);

  // ---------------------------------------------------------------- characters
  const nav = {
    isFree: (x, z) => x > X0 + 0.5 && x < -X0 - 0.5 && z > Z0 + 0.5 && z < -Z0 - 0.5,
    path: (_from, to) => [new THREE.Vector3(to.x, 0, to.z)],
  };
  const blobs = createBlobShadows(scene);
  const chars = {};
  for (const id of Object.keys(DESKS)) {
    const room = { id, desks: [desks[id]], wander: LOUNGE };
    const ch = new Character({ agent: { id, name: agents[id].nama, role: agents[id].peran, status: 'idle' }, color: colors[id], room, slot: 0, nav });
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
  function goSit(ch, key, label, pose) {
    const seat = ch.desk.seatWorld;
    ch.setPlan(key, [{ type: 'walk', to: seat.clone(), speed: key === 'desk' ? 'hurry' : 'walk' }, { type: 'sit', heading: Math.PI }, { type: 'pose', name: pose }], label);
  }
  function wander(ch) {
    const [x, z] = rand(LOUNGE_SPOTS);
    const to = new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, 0, z + (Math.random() - 0.5) * 0.6);
    ch.setPlan('wander', [
      { type: 'walk', to, speed: 'stroll' },
      { type: 'pose', name: rand(['talk', 'listen', 'phone', 'drink', 'stretch']), dur: 5 + Math.random() * 8, face: Math.random() * Math.PI * 2 },
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

  // ---------------------------------------------------------------- sizing
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    // fit the whole floor diagonal in view
    const aspect = w / h;
    // fit the floor's projected width (≈ 16 units) with a little crop on narrow phones
    const viewH = Math.max(9.5, 15.5 / aspect);
    camera.left = (-viewH * aspect) / 2;
    camera.right = (viewH * aspect) / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // ---------------------------------------------------------------- loop
  const v = new THREE.Vector3();
  let last = performance.now();
  let raf = 0;
  let running = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (!REDUCED_MOTION.matches) SWAY_U.value = t;
    const list = Object.values(chars);
    for (const ch of list) {
      if (ch.status === 'working') ch.progress = ((t * 0.08 + ch.seed % 7 / 7) % 1);
      ch.update(dt, t, camera.quaternion);
      ch.desk.screen?.tick(now);
    }
    blobs.update(list);
    renderer.render(scene, camera);
    // labels follow heads
    const w = host.clientWidth;
    const h = host.clientHeight;
    for (const ch of list) {
      v.copy(ch.group.position);
      v.y += 2.35;
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
