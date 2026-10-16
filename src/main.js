import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeMaterials, makeEnvironment, makeSignAtlas } from './materials.js';
import { buildCity, signCorners } from './city.js';
import { Population } from './population.js';
import { Labels } from './labels.js';
import { Panel } from './ui.js';
import { subscribe } from './data.js';
import { fuse, matrix } from './kit.js';

const host = document.getElementById('scene');
const labelsRoot = document.getElementById('labels');
const narrow = matchMedia('(max-width: 820px)');
const coarse = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const lowTier = narrow.matches || coarse;

let data = { connected: false, agents: [], activityEvents: [], activityTitles: {} };
let selected = null;
const panel = new Panel({ onSelect: (id, fromList) => select(id, fromList) });
subscribe(next => { data = next; apply(); }, kind => panel.connection(kind));
panel.connection('wait');

// ---------- 3D ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: lowTier ? 'default' : 'high-performance' });
} catch {
  document.getElementById('nogl').hidden = false;
  renderer = null;
}

const api = window.__agentCity = { frames: 0, calls: 0, triangles: 0 };
let scene, camera, controls, population, labels, materials, cars = [];
const DEFAULT = { target: new THREE.Vector3(0, 0.5, -0.6), polar: 1.0, azimuth: -0.1 };
let baseDistance = 50;

function init() {
  let dpr = Math.min(devicePixelRatio || 1, lowTier ? 1.75 : 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Cidade estática: a sombra é calculada uma vez e reaproveitada em todos os quadros.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setClearColor(0x000000, 0);
  host.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  scene = new THREE.Scene();
  scene.environment = makeEnvironment(renderer);
  scene.environmentIntensity = 0.55;
  materials = makeMaterials(renderer, { lowTier });

  scene.add(new THREE.HemisphereLight('#e2ebf6', '#7a6a52', 0.55));
  // Sol de fim de tarde, frontal-esquerdo: rostos iluminados, sombras caem para trás.
  const sun = new THREE.DirectionalLight('#ffdcb2', 3.0);
  sun.position.set(-12, 21, 17);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 21, bottom: -21, near: 5, far: 70 });
  sun.shadow.normalBias = 0.03;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  scene.add(buildCity(materials, makeSignAtlas()));
  cars = makeCars();
  population = new Population(scene, materials);
  labels = new Labels(labelsRoot, id => select(id === selected ? null : id, false));

  camera = new THREE.PerspectiveCamera(30, 1, 1, 220);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minPolarAngle = 0.42;
  controls.maxPolarAngle = 1.2;
  controls.minAzimuthAngle = -0.95;
  controls.maxAzimuthAngle = 0.95;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.screenSpacePanning = false;
  // Toque: um dedo rola a página; dois dedos giram/aproximam. Mouse: arrastar gira.
  controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
  renderer.domElement.style.touchAction = 'pan-y';
  controls.addEventListener('change', () => { clampTarget(); wake(); });
  controls.addEventListener('start', () => { tween = null; host.classList.add('is-dragging'); hideHint(); });
  controls.addEventListener('end', () => host.classList.remove('is-dragging'));

  resize();
  new ResizeObserver(() => { resize(); wake(); }).observe(host);
  narrow.addEventListener?.('change', () => { resize(); resetCamera(true); });
  reduced.addEventListener?.('change', wake);
  window.addEventListener('volt:texture', wake);
  document.fonts?.ready.then(() => { labels.remeasure(); wake(); });

  // Seleção por toque/clique (com tolerância para não confundir com arraste).
  let down = null;
  renderer.domElement.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
  renderer.domElement.addEventListener('pointerup', ev => {
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    if (moved < 7 && performance.now() - down.t < 600) pick(ev);
    down = null;
  });

  document.querySelector('.scene-tools').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-cam]');
    if (!b) return;
    const cmd = b.dataset.cam;
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (cmd === 'reset') { select(null, false); resetCamera(false); return; }
    if (cmd === 'in') animateTo(controls.target, THREE.MathUtils.clamp(sph.radius * 0.78, controls.minDistance, controls.maxDistance));
    if (cmd === 'out') animateTo(controls.target, THREE.MathUtils.clamp(sph.radius * 1.28, controls.minDistance, controls.maxDistance));
    if (cmd === 'left' || cmd === 'right') animateTo(controls.target, sph.radius, THREE.MathUtils.clamp(sph.theta + (cmd === 'left' ? -0.35 : 0.35), -0.95, 0.95));
  });
  document.getElementById('hint').textContent = coarse
    ? 'Dois dedos giram e aproximam · toque em um agente'
    : 'Arraste para girar · role para aproximar · clique em um agente';
  setTimeout(hideHint, 9000);

  resetCamera(true);
  document.addEventListener('visibilitychange', wake);
  new IntersectionObserver(entries => { onscreen = entries[0].isIntersecting; wake(); }, { threshold: 0.02 }).observe(host);

  // Qualidade adaptativa: se os primeiros segundos ficarem lentos, reduz a resolução.
  setTimeout(() => {
    if (frameTimes.length > 20) {
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      if (avg > 30 && dpr > 1.25) { dpr = 1.25; renderer.setPixelRatio(dpr); resize(); }
    }
  }, 4500);
}

function hideHint() { document.getElementById('hint').classList.add('gone'); }

function makeCars() {
  const list = [];
  const specs = [['#a8322d', 11.65, 1, 2.3, -8], ['#e9e6df', 11.65, 1, 2.3, 6], ['#3f6f96', 13.15, -1, 1.9, 2]];
  for (const [color, z, dir, speed, x] of specs) {
    const parts = [
      [new RoundedBoxGeometry(1.12, 0.5, 2.55, 3, 0.12), color, matrix(0, 0.52, 0)],
      [new RoundedBoxGeometry(0.98, 0.42, 1.3, 3, 0.12), '#2f3d4a', matrix(0, 0.93, -0.12)],
      [new THREE.BoxGeometry(0.9, 0.06, 1.16), color, matrix(0, 1.15, -0.12)],
      [new THREE.BoxGeometry(0.22, 0.09, 0.04), '#fff4d6', matrix(-0.36, 0.6, 1.28)],
      [new THREE.BoxGeometry(0.22, 0.09, 0.04), '#fff4d6', matrix(0.36, 0.6, 1.28)],
      [new THREE.BoxGeometry(0.22, 0.08, 0.04), '#9e231c', matrix(-0.36, 0.62, -1.28)],
      [new THREE.BoxGeometry(0.22, 0.08, 0.04), '#9e231c', matrix(0.36, 0.62, -1.28)]
    ];
    for (const wx of [-0.52, 0.52]) for (const wz of [-0.82, 0.82]) {
      parts.push([new THREE.CylinderGeometry(0.25, 0.25, 0.18, 16), '#1c1e21', matrix(wx, 0.27, wz, 0, 0, Math.PI / 2)]);
      parts.push([new THREE.CylinderGeometry(0.13, 0.13, 0.19, 12), '#a9aeb4', matrix(wx, 0.27, wz, 0, 0, Math.PI / 2)]);
    }
    const mesh = new THREE.Mesh(fuse(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.3 }));
    mesh.receiveShadow = true;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.1), materials.contactShadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.035;
    shadow.renderOrder = 1;
    const car = new THREE.Group();
    car.add(mesh, shadow);
    car.position.set(x, 0.035, z);
    car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(car);
    list.push({ car, dir, speed });
  }
  return list;
}

// ---------- Câmera ----------
let tween = null;
function cameraFrom(target, radius, theta = DEFAULT.azimuth, phi = DEFAULT.polar) {
  const s = new THREE.Spherical(radius, phi, theta);
  return new THREE.Vector3().setFromSpherical(s).add(target);
}

function fitDistance() {
  // Distância mínima para a maquete inteira caber no quadro (no celular, corta só bordas de grama).
  const xr = narrow.matches ? 10.8 : 15.4;
  const pts = [];
  for (const x of [-xr, xr]) for (const z of [-14.4, narrow.matches ? 10.4 : 14.6]) for (const y of [0, 4.6]) pts.push(new THREE.Vector3(x, y, z));
  const v = new THREE.Vector3();
  for (let d = 24; d < 140; d += 0.5) {
    camera.position.copy(cameraFrom(DEFAULT.target, d));
    camera.lookAt(DEFAULT.target);
    camera.updateMatrixWorld();
    if (pts.every(p => { v.copy(p).project(camera); return Math.abs(v.x) < 0.99 && v.y > -0.99 && v.y < 0.93; })) return d;
  }
  return 140;
}

function resetCamera(instant) {
  baseDistance = fitDistance();
  controls.minDistance = baseDistance * 0.28;
  controls.maxDistance = baseDistance * 1.2;
  if (instant) {
    controls.target.copy(DEFAULT.target);
    camera.position.copy(cameraFrom(DEFAULT.target, baseDistance));
    controls.update();
    wake();
  } else animateTo(DEFAULT.target, baseDistance, DEFAULT.azimuth, DEFAULT.polar);
}

function animateTo(target, radius, theta, phi) {
  const cur = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  tween = {
    t0: performance.now(), dur: reduced.matches ? 1 : 650,
    fromT: controls.target.clone(), toT: target.clone(),
    fromR: cur.radius, toR: radius,
    fromTheta: cur.theta, toTheta: theta ?? cur.theta,
    fromPhi: cur.phi, toPhi: phi ?? cur.phi
  };
  wake();
}

function stepTween(now) {
  if (!tween) return false;
  const k = Math.min(1, (now - tween.t0) / tween.dur);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const t = tween.fromT.clone().lerp(tween.toT, e);
  const s = new THREE.Spherical(
    THREE.MathUtils.lerp(tween.fromR, tween.toR, e),
    THREE.MathUtils.lerp(tween.fromPhi, tween.toPhi, e),
    THREE.MathUtils.lerp(tween.fromTheta, tween.toTheta, e)
  );
  controls.target.copy(t);
  camera.position.setFromSpherical(s).add(t);
  if (k >= 1) tween = null;
  return true;
}

function clampTarget() {
  const t = controls.target;
  t.x = THREE.MathUtils.clamp(t.x, -14, 14);
  t.z = THREE.MathUtils.clamp(t.z, -14, 14);
  // Abaixo do chão só o suficiente para o enquadramento da seleção (focusTarget).
  t.y = THREE.MathUtils.clamp(t.y, -2, 3);
}

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (!tween && controls) {
    const prev = baseDistance;
    const cur = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    baseDistance = fitDistance();
    camera.position.setFromSpherical(new THREE.Spherical(cur.radius * baseDistance / prev, cur.phi, cur.theta)).add(controls.target);
    controls.minDistance = baseDistance * 0.28;
    controls.maxDistance = baseDistance * 1.2;
  }
  const tools = host.querySelector('.scene-tools');
  toolsRect = { x0: tools.offsetLeft, y0: tools.offsetTop, x1: tools.offsetLeft + tools.offsetWidth, y1: tools.offsetTop + tools.offsetHeight };
  labels?.remeasure();
}

// Áreas que os rótulos não cobrem: barra de câmera e placas dos ambientes. Placa grande na tela
// (câmera muito próxima) deixa de ser obstáculo: continua legível e não empurra rótulos para longe.
let toolsRect = null;
const signs = signCorners();
function labelObstacles(w, h) {
  const out = toolsRect ? [toolsRect] : [];
  for (const corners of signs) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
    for (const c of corners) {
      tmp.copy(c).project(camera);
      if (tmp.z > 1) behind = true;
      const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (!behind && y1 - y0 < 60 && x1 > 0 && x0 < w && y1 > 0 && y0 < h) out.push({ x0, y0, x1, y1 });
  }
  api.signRects = out.slice(toolsRect ? 1 : 0);
  return out;
}

// ---------- Seleção ----------
const raycaster = new THREE.Raycaster();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  const p = new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  const hit = raycaster.intersectObjects(population.hitTargets(), false)[0];
  select(hit ? (hit.object.userData.agentId === selected ? null : hit.object.userData.agentId) : null, false);
}

function select(id, fromList) {
  if (fromList && id === selected) id = null;
  const had = selected;
  selected = id;
  if (id) hideHint();
  population?.select(id);
  // A ficha é desenhada antes do enquadramento: a posição da câmera depende da altura dela.
  apply();
  if (renderer && controls) {
    const a = selected && population.byId.get(selected);
    if (a) {
      const radius = baseDistance * (narrow.matches ? 0.42 : 0.5);
      animateTo(focusTarget(a, radius), radius);
      if (fromList && narrow.matches) host.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
    } else if (id === null && had) {
      animateTo(DEFAULT.target, baseDistance, DEFAULT.azimuth, DEFAULT.polar);
    }
  }
}

// Alvo da câmera para o agente selecionado: o tronco no centro, salvo quando a ficha cobriria a
// figura (celular); aí o alvo desce no eixo vertical da tela até os pés ficarem acima da ficha.
const focusCam = new THREE.PerspectiveCamera();
function focusTarget(a, radius) {
  const t = new THREE.Vector3(a.pos.x, a.pos.y + 0.9, a.pos.z);
  const box = document.getElementById('detail');
  const h = host.clientHeight;
  if (box.hidden || !h) return t;
  // Pés 16 px acima da ficha, sem subir a figura além de 32% da altura (a cabeça e o rótulo precisam caber).
  const limit = Math.max(box.offsetTop - 16, h * 0.32);
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  focusCam.copy(camera);
  const up = new THREE.Vector3(), feet = new THREE.Vector3();
  const perNdc = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * radius;
  for (let i = 0; i < 4; i++) {
    focusCam.position.setFromSpherical(new THREE.Spherical(radius, sph.phi, sph.theta)).add(t);
    focusCam.lookAt(t);
    focusCam.updateMatrixWorld();
    feet.copy(a.pos).project(focusCam);
    const want = 1 - 2 * limit / h;
    if (feet.y >= want - 0.01) break;
    up.set(0, 1, 0).applyQuaternion(focusCam.quaternion);
    t.addScaledVector(up, -(want - feet.y) * perNdc);
  }
  return t;
}
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && selected) select(null, false); });

// ---------- Dados → cena ----------
let firstData = true;
function apply() {
  const agents = data.agents || [];
  if (selected && !agents.some(a => a.id === selected)) selected = null;
  panel.render(data, selected);
  if (!renderer) return;
  population.update(agents, { instant: firstData || reduced.matches });
  if (agents.length) firstData = false;
  labels.sync(agents, selected);
  // Única ligação nova com o dado real: janelas dos Escritórios acesas ⇔ alguém trabalhando.
  materials.officeGlass.emissiveIntensity = agents.some(a => a.state === 'working') ? 0.55 : 0;
  api.officeLit = materials.officeGlass.emissiveIntensity > 0;
  wake();
}

// ---------- Laço de render (pausa fora da tela e com a aba oculta) ----------
let running = false, onscreen = true, last = 0, lastRender = 0, dirtyUntil = 0;
const frameTimes = [];
const clock = { t: 0 };
function wake() {
  dirtyUntil = performance.now() + 400;
  if (!renderer || running || document.hidden || !onscreen) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

const tmp = new THREE.Vector3();
function frame(now) {
  if (document.hidden || !onscreen) { running = false; return; }
  const minGap = lowTier ? 31 : 0;
  if (now - lastRender < minGap) { requestAnimationFrame(frame); return; }
  const dt = Math.min(0.1, (now - last) / 1000);
  if (lastRender) frameTimes.push(now - lastRender);
  if (frameTimes.length > 120) frameTimes.shift();
  last = now; lastRender = now;
  const motion = !reduced.matches;
  if (motion) clock.t += dt;

  if (motion) for (const c of cars) {
    c.car.position.x += c.dir * c.speed * dt;
    if (c.dir > 0 && c.car.position.x > 15.2) c.car.position.x = -15.2;
    if (c.dir < 0 && c.car.position.x < -15.2) c.car.position.x = 15.2;
  }
  const walking = population.tick(dt, clock.t, motion);
  const tweening = stepTween(now);
  controls.update();
  renderer.render(scene, camera);
  api.frames++;
  api.calls = renderer.info.render.calls;
  api.triangles = renderer.info.render.triangles;

  const w = host.clientWidth, h = host.clientHeight;
  labels.layout(population.list.filter(a => a.fig.root.visible).map(a => ({ id: a.agent.id, world: population.anchor(a, tmp).clone(), visible: true })), camera, w, h, labelObstacles(w, h));
  // Para os testes: topo da cabeça e pés do selecionado, em px da cena.
  const sel = selected && population.byId.get(selected);
  if (sel) {
    const head = population.anchor(sel, tmp).project(camera);
    const hx = (head.x + 1) / 2 * w, hy = (1 - head.y) / 2 * h;
    const feet = tmp.copy(sel.pos).project(camera);
    api.selectedFrame = { id: selected, x: hx, head: hy, feet: (1 - feet.y) / 2 * h };
  } else api.selectedFrame = null;

  if (motion || walking || tweening || now < dirtyUntil) requestAnimationFrame(frame);
  else running = false;
}

if (renderer) init();
