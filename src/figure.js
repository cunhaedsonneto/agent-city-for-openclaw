// Figuras estilizadas dos agentes. Identidade (cor de camisa, calça e acessório) segue o
// contrato da Agent City; a construção aqui é própria: 6 malhas por figura (tronco+cabeça+
// acessório fundidos, 2 pernas, 2 braços, rosto), com cor por vértice.
import * as THREE from 'three';
import { fuse, matrix } from './kit.js';

export const OUTFITS = {
  main: { shirt: '#2f6fed', pants: '#24324a', acc: 'captain' },
  dev1: { shirt: '#ff7a2f', pants: '#3a3f4b', acc: 'bandana' },
  dev2: { shirt: '#ffcf33', pants: '#2c3e70', acc: 'spiky' },
  financeiro: { shirt: '#f4f6fb', pants: '#2b3445', acc: 'tie' },
  'suporte-usuario': { shirt: '#22b5a5', pants: '#384252', acc: 'hardhat' },
  'redes-infra': { shirt: '#56688a', pants: '#28303d', acc: 'helmet' },
  licitacao: { shirt: '#7b4fd6', pants: '#2a2540', acc: 'glasses' },
  'designer-conteudo': { shirt: '#ff4f8b', pants: '#30304a', acc: 'cap' },
  'designer-grafico': { shirt: '#36c975', pants: '#2f3b4f', acc: 'beret' },
  oracle: { shirt: '#5a3fc0', pants: '#251f45', acc: 'wizard' },
  hunter: { shirt: '#3f8f3a', pants: '#4a3a2a', acc: 'hood' },
  beacon: { shirt: '#e8413c', pants: '#2d3340', acc: 'headset' },
  debugger: { shirt: '#8fd3ff', pants: '#2d3a4d', acc: 'goggles' }
};
const FALLBACK_SHIRTS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#9775fa', '#51cf66', '#f783ac', '#ff922b', '#20c997'];
const FALLBACK_ACC = ['cap', 'beret', 'spiky', 'bandana', 'headset', 'glasses'];
const SKINS = ['#ffd9b8', '#f1bf91', '#d9a06f', '#b67a4d', '#8a5a3a', '#ffe3cc', '#e8b48a'];
const HAIR = ['#3a2a1f', '#1f1b1a', '#7a4a26', '#c98a3b', '#2b2b3a'];

export function outfitFor(id, index) {
  return OUTFITS[id] || { shirt: FALLBACK_SHIRTS[index % FALLBACK_SHIRTS.length], pants: '#2d3748', acc: FALLBACK_ACC[index % FALLBACK_ACC.length] };
}

export const HIP = 0.92;
const SHOULDER = 1.43, HEAD = 1.74, HEAD_R = 0.25;

// Rostos: canvas pequeno, três expressões.
const faceCache = new Map();
function faceTexture(kind) {
  if (faceCache.has(kind)) return faceCache.get(kind);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#e8838f55';
  for (const x of [24, 104]) { g.beginPath(); g.ellipse(x, 60, 11, 7, 0, 0, 7); g.fill(); }
  g.fillStyle = '#26222b'; g.strokeStyle = '#26222b'; g.lineCap = 'round'; g.lineWidth = 6;
  for (const x of [44, 84]) {
    if (kind === 'happy') { g.beginPath(); g.arc(x, 44, 8, 1.1 * Math.PI, 1.9 * Math.PI); g.stroke(); continue; }
    g.beginPath(); g.ellipse(x, 42, 6.5, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + 2.5, 38, 2.6, 0, 7); g.fill(); g.fillStyle = '#26222b';
  }
  g.beginPath();
  if (kind === 'neutral') { g.moveTo(54, 70); g.lineTo(74, 70); }
  else if (kind === 'focus') { g.moveTo(53, 68); g.quadraticCurveTo(64, 75, 75, 68); }
  else { g.moveTo(50, 64); g.quadraticCurveTo(64, 82, 78, 64); }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  faceCache.set(kind, m);
  return m;
}

const capsule = (r, len, cap = 4, radial = 10) => new THREE.CapsuleGeometry(r, len, cap, radial);
const sphere = (r, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);

function accessoryParts(acc, shirt, hair) {
  const P = [];
  const add = (geo, color, m) => P.push([geo, color, m]);
  switch (acc) {
    case 'captain':
      add(new THREE.CylinderGeometry(0.27, 0.25, 0.14, 20), '#f4f3ee', matrix(0, HEAD + 0.21, -0.01));
      add(new THREE.CylinderGeometry(0.255, 0.255, 0.05, 20), '#1f2a44', matrix(0, HEAD + 0.15, -0.01));
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16, 1, false, -Math.PI / 2, Math.PI), '#15181d', matrix(0, HEAD + 0.13, 0.13, 0.12));
      add(new THREE.BoxGeometry(0.07, 0.05, 0.02), '#d8b04a', matrix(0, HEAD + 0.2, 0.26));
      break;
    case 'bandana':
      add(new THREE.CylinderGeometry(0.262, 0.262, 0.1, 20), '#b8322a', matrix(0, HEAD + 0.1, 0));
      add(sphere(0.06, 8, 6), '#b8322a', matrix(0, HEAD + 0.1, -0.27));
      add(new THREE.BoxGeometry(0.05, 0.16, 0.03), '#b8322a', matrix(0.05, HEAD + 0.0, -0.29, 0.3, 0, 0.3));
      break;
    case 'spiky':
      for (let i = 0; i < 7; i++) {
        const a = -1.1 + i * 0.37;
        add(new THREE.ConeGeometry(0.075, 0.24, 6), hair, matrix(Math.sin(a) * 0.15, HEAD + 0.25 - Math.abs(a) * 0.04, -0.03 + Math.cos(a) * 0.02 - 0.04, -0.35, 0, -a * 0.9));
      }
      break;
    case 'tie':
      add(new THREE.BoxGeometry(0.07, 0.3, 0.03), '#8f2238', matrix(0, 1.3, 0.2));
      add(new THREE.BoxGeometry(0.1, 0.07, 0.035), '#8f2238', matrix(0, 1.46, 0.2));
      break;
    case 'hardhat':
      add(new THREE.SphereGeometry(0.29, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#f2c230', matrix(0, HEAD + 0.03, 0));
      add(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 20), '#f2c230', matrix(0, HEAD + 0.04, 0.03));
      break;
    case 'helmet':
      add(new THREE.SphereGeometry(0.295, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), '#5d6773', matrix(0, HEAD - 0.01, -0.01));
      add(new THREE.BoxGeometry(0.34, 0.09, 0.05), '#1e252d', matrix(0, HEAD + 0.06, 0.25));
      break;
    case 'glasses':
      for (const x of [-0.09, 0.09]) add(new THREE.TorusGeometry(0.065, 0.014, 6, 16), '#1d1f24', matrix(x, HEAD + 0.03, HEAD_R - 0.005));
      add(new THREE.BoxGeometry(0.05, 0.015, 0.015), '#1d1f24', matrix(0, HEAD + 0.04, HEAD_R));
      break;
    case 'cap':
      add(new THREE.SphereGeometry(0.265, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#2b2d42', matrix(0, HEAD + 0.04, 0));
      add(new THREE.BoxGeometry(0.26, 0.025, 0.2), '#2b2d42', matrix(0, HEAD + 0.06, 0.3, -0.08));
      break;
    case 'beret':
      add(sphere(0.28, 18, 10), '#b7332c', matrix(0.04, HEAD + 0.17, -0.02, 0, 0, -0.18, 1, 0.34, 1));
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 6), '#b7332c', matrix(0.06, HEAD + 0.27, -0.02));
      break;
    case 'wizard':
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 22), '#3b2a86', matrix(0, HEAD + 0.13, 0));
      add(new THREE.ConeGeometry(0.25, 0.62, 18), '#3b2a86', matrix(0.02, HEAD + 0.44, -0.03, -0.12, 0, -0.1));
      add(new THREE.OctahedronGeometry(0.05), '#f2cd4a', matrix(0.06, HEAD + 0.45, 0.17));
      break;
    case 'hood':
      add(new THREE.SphereGeometry(0.3, 18, 12, Math.PI * 0.85, Math.PI * 1.3), '#2f6b2b', matrix(0, HEAD + 0.02, -0.02));
      add(new THREE.TorusGeometry(0.27, 0.035, 6, 20, Math.PI * 1.2), '#2f6b2b', matrix(0, HEAD + 0.0, 0.06, 0, 0, Math.PI * -0.1));
      break;
    case 'headset':
      add(new THREE.TorusGeometry(0.27, 0.025, 6, 20, Math.PI), '#202329', matrix(0, HEAD + 0.02, 0));
      for (const x of [-0.27, 0.27]) add(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), '#202329', matrix(x, HEAD + 0.0, 0, 0, 0, Math.PI / 2));
      add(new THREE.BoxGeometry(0.025, 0.025, 0.2), '#202329', matrix(0.22, HEAD - 0.08, 0.1, 0, -0.5));
      add(sphere(0.03, 8, 6), '#e8413c', matrix(0.16, HEAD - 0.1, 0.19));
      break;
    case 'goggles':
      add(new THREE.TorusGeometry(0.258, 0.03, 6, 24), '#2a3340', matrix(0, HEAD + 0.12, 0, Math.PI / 2));
      for (const x of [-0.09, 0.09]) {
        add(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), '#2a3340', matrix(x, HEAD + 0.13, 0.23, Math.PI / 2));
        add(new THREE.CylinderGeometry(0.058, 0.058, 0.02, 14), '#9fe0ff', matrix(x, HEAD + 0.13, 0.265, Math.PI / 2));
      }
      break;
  }
  return P;
}

const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });

export function createFigure(agent, index) {
  const outfit = outfitFor(agent.id, index);
  const skin = SKINS[index % SKINS.length], hair = HAIR[index % HAIR.length];
  const root = new THREE.Group();
  // `body` é o pivô do quadril (sentar, reclinar); `frame` devolve as peças ao chão.
  const body = new THREE.Group();
  body.position.y = HIP;
  const frame = new THREE.Group();
  frame.position.y = -HIP;
  body.add(frame);
  root.add(body);

  const hasHat = ['captain', 'hardhat', 'helmet', 'cap', 'wizard', 'hood', 'beret'].includes(outfit.acc);
  const torsoParts = [
    [capsule(0.22, 0.3, 4, 12), outfit.shirt, matrix(0, 1.2, 0, 0, 0, 0, 1, 1, 0.72)],
    [new THREE.CylinderGeometry(0.2, 0.17, 0.16, 12), outfit.pants, matrix(0, 0.95, 0, 0, 0, 0, 1, 1, 0.78)],
    [new THREE.CylinderGeometry(0.075, 0.085, 0.12, 10), skin, matrix(0, 1.5, 0)],
    [sphere(HEAD_R, 22, 16), skin, matrix(0, HEAD, 0)],
    [new THREE.SphereGeometry(HEAD_R + 0.012, 22, 10, 0, Math.PI * 2, 0, hasHat ? Math.PI * 0.42 : Math.PI * 0.52), hair, matrix(0, HEAD + 0.005, -0.025, -0.22)],
    ...accessoryParts(outfit.acc, outfit.shirt, hair)
  ];
  const torso = new THREE.Mesh(fuse(torsoParts), cloth);
  frame.add(torso);

  // Rosto: calota frontal da cabeça com a textura de expressão.
  const faceGeo = new THREE.SphereGeometry(HEAD_R + 0.004, 16, 10, Math.PI / 2 - 0.62, 1.24, Math.PI / 2 - 0.5, 0.95);
  const face = new THREE.Mesh(faceGeo, faceTexture('neutral'));
  face.position.y = HEAD;
  frame.add(face);

  const limb = (x, y, parts) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(new THREE.Mesh(fuse(parts), cloth));
    frame.add(pivot);
    return pivot;
  };
  const leg = x => limb(x, HIP, [
    [capsule(0.1, 0.62, 3, 10), outfit.pants, matrix(0, -0.42, 0)],
    [new THREE.BoxGeometry(0.17, 0.09, 0.28), '#2a2622', matrix(0, -0.88, 0.05)]
  ]);
  const arm = x => limb(x, SHOULDER, [
    [capsule(0.07, 0.4, 3, 8), outfit.shirt, matrix(0, -0.24, 0)],
    [sphere(0.075, 10, 8), skin, matrix(0, -0.52, 0)]
  ]);
  const legs = [leg(-0.11), leg(0.11)];
  const arms = [arm(-0.29), arm(0.29)];
  arms[0].rotation.z = -0.08; arms[1].rotation.z = 0.08;

  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });

  // Alvo de toque invisível, maior que a figura (dedo no celular).
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.3, 8), new THREE.MeshBasicMaterial());
  hit.position.y = 1.1;
  hit.visible = false;
  hit.userData.agentId = agent.id;
  root.add(hit);

  const headTop = new THREE.Vector3(0, HEAD + (outfit.acc === 'wizard' ? 0.72 : 0.36), 0);
  return { root, body, frame, legs, arms, face, hit, outfit, headTop, setFace: kind => { face.material = faceTexture(kind); } };
}

// Notebook da mesa: tampa na cor da camisa (vista pela câmera) e tela acesa voltada ao agente.
export function createLaptop(shirt) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(fuse([[new THREE.BoxGeometry(0.4, 0.022, 0.28), '#3a3f46', matrix(0, 0.011, 0)]]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 }));
  const lid = new THREE.Group();
  lid.position.set(0, 0.022, 0.14);
  lid.rotation.x = 0.32;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.27, 0.014), new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.35, metalness: 0.3, emissive: shirt, emissiveIntensity: 0.18 }));
  shell.position.set(0, 0.135, 0);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.23), new THREE.MeshBasicMaterial({ color: new THREE.Color(shirt).lerp(new THREE.Color('#ffffff'), 0.55), toneMapped: false }));
  screen.position.set(0, 0.135, -0.008);
  screen.rotation.y = Math.PI;
  lid.add(shell, screen);
  g.add(base, lid);
  return g;
}
