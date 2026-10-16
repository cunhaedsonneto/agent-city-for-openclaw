// Maquete estática: pedestal de madeira, quatro ambientes, ruas e vegetação.
// Coordenadas: +z aponta para a câmera; o topo do pedestal está em y = 0.
import * as THREE from 'three';
import { Kit, matrix } from './kit.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C = {
  birch: '#ead8b9', walnut: '#7a5a40', grass: '#ffffff', paving: '#efe9df', curb: '#cfc7b8', stone: '#bdb3a2',
  deck: '#e8cfa8', line: '#e9e2cf', metal: '#2e3238', concrete: '#d9d3c8', base: '#a39d91',
  office: { wall: '#e6cfa4', trim: '#f4efe5', roof: '#b9b1a3' },
  games: { wall: '#5d8fb5', trim: '#e8eef3', roof: '#a9adb0' },
  dorms: { wall: '#a497c9', trim: '#f2eff8', roof: '#b2adb8' },
  leisure: { wall: '#dca27a', trim: '#f7efe6', roof: '#b9845a' }
};
const FOLIAGE = ['#e2ead2', '#d3dfc0', '#eef2e2', '#c9d8b4'];

export const DECK = 0.12; // topo dos decks de madeira
export const PAVE = 0.065; // topo da praça e da alameda

// Vagas por estado. Nenhuma fica sobre pista (pista: 10,9 ≤ z ≤ 13,9).
const FRONT_DESKS = [0, -2.25, 2.25, -4.5, 4.5, -6.75, 6.75];
const BACK_DESKS = [-1.125, 1.125, -3.375, 3.375, -5.625, 5.625];
export const DESKS = [
  ...FRONT_DESKS.map(x => ({ x, z: -5.6, row: 'front' })),
  ...BACK_DESKS.map(x => ({ x, z: -7.9, row: 'back' }))
];

export function workSlots() {
  // Ordem de ocupação: do centro para as bordas, fileira da frente primeiro.
  return DESKS.map(d => {
    const seatZ = d.z - 0.62;
    const path = d.row === 'front'
      ? [[d.x + 1.125, -3.6], [d.x + 1.125, seatZ], [d.x, seatZ]]
      : [[d.x, -3.6], [d.x, -6.75], [d.x + 1.125, -6.75], [d.x + 1.125, seatZ], [d.x, seatZ]];
    return { x: d.x, z: seatZ, y: DECK, ry: 0, pose: 'desk', approach: path, desk: d };
  });
}

export function restSlots() {
  const s = [];
  // Lazer: banco ao norte da piscina e espreguiçadeiras ao sul, de frente para o sol.
  for (const x of [5.2, 6.8, 8.4, 10.0]) s.push({ x, z: 0.7, y: DECK, ry: 0, pose: 'bench', approach: [[x, -1.6], [x, 0.7]] });
  for (const x of [4.6, 6.3, 8.0, 9.7]) s.push({ x, z: 7.0, y: DECK, ry: 0, pose: 'lounge', approach: [[2.6, -1.6], [2.6, 8.7], [x + 0.85, 8.7], [x + 0.85, 7.0], [x, 7.0]] });
  // Jogos: fliperamas no terraço e mesa de pingue-pongue.
  for (const z of [-1.9, -0.5, 0.9]) s.push({ x: -9.05, z, y: PAVE, ry: -Math.PI / 2, pose: 'arcade', approach: [[-7.6, -1.6], [-7.6, z], [-9.05, z]] });
  s.push({ x: -10.75, z: 4.25, y: 0, ry: Math.PI / 2, pose: 'pingpong', approach: [[-7.6, -1.6], [-7.6, 2.0], [-11.6, 2.0], [-11.6, 4.25], [-10.75, 4.25]] });
  s.push({ x: -7.25, z: 4.25, y: 0, ry: -Math.PI / 2, pose: 'pingpong', approach: [[-7.6, -1.6], [-7.25, 4.25]] });
  return s;
}

export function waitSlots() {
  // Ponto de encontro na praça: de pé, parados, sem atividade atribuída.
  const pts = [
    [-5.7, 0.4], [-3.85, -0.15], [-2.0, -0.35], [-0.15, -0.15], [1.7, 0.4],
    [-6.4, 2.75], [2.4, 2.75],
    [-5.4, 5.1], [-3.5, 5.6], [-0.5, 5.6], [1.4, 5.1],
    [-4.7, 2.75], [0.7, 2.75]
  ];
  return pts.map(([x, z]) => ({ x, z, y: PAVE, ry: Math.atan2(-x, 40), pose: 'stand', approach: [[x, Math.min(z, -1.6)], [x, z]] }));
}

export function buildCity(materials, signAtlas) {
  const k = new Kit({ grass: 6, paving: 3.2, asphalt: 5, wood: 1.6, plaster: 2.2, foliage: 1.6 });
  const group = new THREE.Group();

  // Pedestal: moldura de bétula sobre base de nogueira — a “mesa” da maquete.
  k.box('wood', 32.6, 1.25, 32.6, 0, -0.66, 0, C.birch);
  k.box('wood', 33.3, 0.32, 33.3, 0, -1.42, 0, C.walnut);
  k.slab('grass', -16, 16, -16, 16, 0, 0.12, C.grass);

  // Rua da frente, meio-fio e calçadas.
  k.slab('asphalt', -16, 16, 10.9, 13.9, 0.02, 0.06, '#ffffff');
  for (let x = -15; x < 16; x += 2.4) k.box('paint', 1.1, 0.012, 0.12, x, 0.026, 12.4, C.line);
  k.slab('paving', -16, 16, 10.1, 10.9, 0.11, 0.14, C.curb);
  k.slab('paving', -16, 16, 13.9, 14.6, 0.11, 0.14, C.curb);

  // Alameda entre o deck dos Escritórios e a praça; caminhos até a calçada.
  k.slab('paving', -10.6, 10.6, -4.2, -2.4, PAVE, 0.1, C.paving);
  k.slab('paving', -3.1, -0.9, 7.2, 10.1, PAVE, 0.1, C.paving);
  k.slab('paving', -10.6, -6.8, -2.4, 1.6, PAVE, 0.1, C.paving);

  // Praça circular com anel de pedra e canteiro central baixo.
  k.add('paving', new THREE.CylinderGeometry(5.05, 5.05, 0.09, 56), C.stone, matrix(-2, 0.012, 2.6));
  k.add('paving', new THREE.CylinderGeometry(4.75, 4.75, 0.1, 56), C.paving, matrix(-2, 0.02, 2.6));
  k.cyl('paint', 1.05, 1.1, 0.42, -2, 0.27, 2.6, C.concrete, 28);
  k.cyl('foliage', 0.92, 0.92, 0.04, -2, 0.49, 2.6, '#9a8a6c', 28);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    shrub(k, -2 + Math.cos(a) * 0.55, 0.5, 2.6 + Math.sin(a) * 0.55, 0.32, i);
  }
  shrub(k, -2, 0.55, 2.6, 0.42, 3, true);

  // Escritórios (fundo) + deck de trabalho.
  building(k, { x0: -9, x1: 9, z0: -14.4, z1: -10.2, floors: 2, palette: C.office, face: '+z', glass: 'officeGlass', door: [0], doubleDoor: true, roofGear: true });
  k.slab('wood', -9, 9, -10.2, -4.2, DECK, 0.12, C.deck);
  for (const d of DESKS) desk(k, d.x, d.z);
  for (const [x, z] of [[-8.4, -4.75], [8.4, -4.75], [-8.4, -9.6], [8.4, -9.6]]) planter(k, x, z);

  // Jogos (esquerda): vitrine no térreo, fliperamas no terraço e pingue-pongue.
  building(k, { x0: -15.2, x1: -10.6, z0: -7.2, z1: 1.6, floors: 2, palette: C.games, face: '+x', glass: 'glass', vitrine: true, door: [-2.95] });
  for (const [i, z] of [-1.9, -0.5, 0.9].entries()) arcade(k, -9.95, z, ['#27364f', '#6e2b2b', '#2b5a4b'][i], ['#6fa8c9', '#d98f6a', '#8fd0a8'][i]);
  pingPong(k, -9, 4.25);

  // Dormitórios (direita): sacadas, cortinas e caixa-d'água.
  building(k, { x0: 10.6, x1: 15.2, z0: -7.2, z1: 1.2, floors: 2, palette: C.dorms, face: '-x', glass: 'glass', balconies: true, curtains: true, door: [-3] });
  k.cyl('paint', 0.62, 0.62, 0.9, 13.9, 4.95, -5.6, '#d7d3cc', 20);
  k.cyl('paint', 0.66, 0.66, 0.08, 13.9, 5.43, -5.6, '#9aa0a6', 20);
  for (const z of [-2.6, -0.6]) k.box('glass', 0.9, 0.1, 1.2, 12.4, 4.6, z, '#9fb2c2');

  // Lazer (frente-direita): deck, piscina, pavilhão e guarda-sóis.
  // Deck em quatro partes, deixando o vão da piscina.
  k.slab('wood', 3.2, 10.5, 0.2, 1.35, DECK, 0.12, C.deck);
  k.slab('wood', 3.2, 10.5, 6.45, 8.2, DECK, 0.12, C.deck);
  k.slab('wood', 3.2, 3.95, 1.35, 6.45, DECK, 0.12, C.deck);
  k.slab('wood', 10.45, 10.5, 1.35, 6.45, DECK, 0.12, C.deck);
  k.slab('paint', 4.2, 10.2, 1.6, 6.2, 0.03, 0.06, '#8fcfe0');
  for (const [x0, x1, z0, z1] of [[3.95, 10.45, 1.35, 1.6], [3.95, 10.45, 6.2, 6.45], [3.95, 4.2, 1.6, 6.2], [10.2, 10.45, 1.6, 6.2]]) k.slab('paint', x0, x1, z0, z1, 0.16, 0.2, '#e3ddd1');
  bench(k, 4.4, 10.45, 0.62, 0, 'wood');
  for (const x of [4.6, 6.3, 8.0, 9.7]) lounger(k, x, 7.3);
  for (const [x, color] of [[5.45, '#efe7d6'], [8.85, '#c9714d']]) umbrella(k, x, 6.75, color);
  building(k, { x0: 11.6, x1: 15.4, z0: 2.4, z1: 8.0, floors: 1, palette: C.leisure, face: '-x', glass: 'glass', door: [5.2], pergola: true });

  // Vegetação só na periferia (nunca entre a câmera e as vagas dos agentes).
  const trees = [[-12.6, -12.4, 1.15], [-14.4, -9.6, 1.0], [12.6, -12.6, 1.1], [14.5, -9.4, 0.95], [-14.4, 7.4, 1.1], [-12.6, 9.1, 0.95],
    [14.6, 9.3, 1.0], [-14.6, -14.6, 0.85], [14.6, -14.8, 0.9], [-10.4, -14.9, 0.8], [10.6, -15.0, 0.8]];
  trees.forEach(([x, z, s], i) => (i % 3 === 2 ? pine(k, x, z, s) : tree(k, x, z, s, i)));
  for (let x = -15.2; x <= 15.2; x += 1.25) if (Math.abs(x + 2) > 1.4) shrub(k, x, 0.18, 9.55, 0.34, Math.round(x * 7));
  for (const x of [-12, -5, 2.6, 9]) lamp(k, x, 10.4);
  bench(k, -8.2, -6.2, 8.45, Math.PI, 'wood');
  bench(k, 0.4, 2.4, 8.45, Math.PI, 'wood');
  signBackings(k);

  group.add(...k.build(materials, { noCast: ['screens'] }));

  // Água: malha própria, sem projetar sombra.
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.6), materials.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(7.2, 0.105, 3.9);
  water.receiveShadow = true;
  group.add(water);

  // Placas: um único material com a folha de placas.
  group.add(signs(signAtlas));

  // Sombras de contato estáticas (árvores, bancos, mesas) e sombra do pedestal sobre o “papel”.
  const blobs = [];
  for (const [x, z, s] of trees) blobs.push([x, 0.012, z, 2.6 * s, 2.6 * s]);
  for (const d of DESKS) blobs.push([d.x, DECK + 0.01, d.z - 0.2, 1.8, 1.4]);
  group.add(contactPlanes(blobs, materials.contactShadow));
  const plinthShadow = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), materials.plinthShadow);
  plinthShadow.rotation.x = -Math.PI / 2;
  plinthShadow.position.y = -1.6;
  plinthShadow.renderOrder = -1;
  group.add(plinthShadow);

  group.traverse(o => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  return group;
}

export function contactPlanes(list, material) {
  const geos = list.map(([x, y, z, w, d]) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
  geos.forEach(g => g.dispose());
  mesh.renderOrder = 1;
  return mesh;
}

// --- Peças ---

function building(k, o) {
  const { x0, x1, z0, z1, floors, palette, face } = o;
  const floorH = 2.05, baseH = 0.32, height = baseH + floors * floorH;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  k.box('paint', w + 0.12, baseH, d + 0.12, cx, baseH / 2, cz, C.base);
  k.box('plaster', w, height - baseH, d, cx, baseH + (height - baseH) / 2, cz, palette.wall);
  // Cobertura, platibanda e frisos entre pavimentos.
  k.box('paint', w - 0.3, 0.06, d - 0.3, cx, height + 0.03, cz, palette.roof);
  for (const [px, pz, pw, pd] of [[cx, z0 + 0.09, w, 0.18], [cx, z1 - 0.09, w, 0.18], [x0 + 0.09, cz, 0.18, d], [x1 - 0.09, cz, 0.18, d]]) {
    k.box('paint', pw + 0.08, 0.4, pd + 0.08, px, height + 0.2, pz, palette.trim);
  }
  for (let f = 1; f < floors; f++) k.box('paint', w + 0.14, 0.1, d + 0.14, cx, baseH + f * floorH, cz, palette.trim);

  // Fachada principal: direção, eixo ao longo da fachada e posição do plano.
  const axis = face === '+z' ? { along: 'x', a0: x0, a1: x1, plane: z1, n: 1 } : face === '+x' ? { along: 'z', a0: z0, a1: z1, plane: x1, n: 1 } : { along: 'z', a0: z0, a1: z1, plane: x0, n: -1 };
  const put = (bucket, len, h, depth, a, y, off, color) => {
    if (axis.along === 'x') k.box(bucket, len, h, depth, a, y, axis.plane + axis.n * off, color);
    else k.box(bucket, depth, h, len, axis.plane + axis.n * off, y, a, color);
  };
  const doors = (o.door || []).map(a => a);
  const winW = 0.72, winH = 1.08, step = 1.42;
  const count = Math.floor((axis.a1 - axis.a0 - 0.8) / step);
  const start = (axis.a0 + axis.a1) / 2 - (count - 1) * step / 2;
  for (let f = 0; f < floors; f++) {
    const sill = baseH + f * floorH + 0.62;
    for (let i = 0; i < count; i++) {
      const a = start + i * step;
      const nearDoor = doors.some(da => Math.abs(a - da) < (o.doubleDoor ? 1.5 : 0.9));
      if (f === 0 && nearDoor) continue;
      if (f === 0 && o.vitrine) continue;
      win(put, a, sill, winW, winH, o.glass, palette.trim, o.curtains ? ['#f3d9e3', '#dfe8f3', '#f4ead2'][i % 3] : null);
      if (f > 0 && o.balconies && i % 2 === 0) balcony(put, a, baseH + f * floorH, palette.trim);
    }
  }
  if (o.vitrine) {
    for (const [a0, a1] of [[axis.a0 + 0.5, doors[0] - 0.75], [doors[0] + 0.75, axis.a1 - 0.5]]) {
      const len = a1 - a0, a = (a0 + a1) / 2;
      put('glass', len, 1.55, 0.04, a, baseH + 1.0, 0.02, '#29404f');
      for (const [y, h] of [[baseH + 0.2, 0.08], [baseH + 1.8, 0.08]]) put('paint', len + 0.1, h, 0.1, a, y, 0.05, palette.trim);
      for (let m = 0; m <= Math.round(len / 1.4); m++) put('paint', 0.07, 1.6, 0.1, a0 + m * len / Math.round(len / 1.4), baseH + 1.0, 0.05, palette.trim);
    }
    // Toldo sobre a vitrine.
    put('paint', axis.a1 - axis.a0 - 0.6, 0.06, 0.9, (axis.a0 + axis.a1) / 2, baseH + 2.0, 0.45, '#2f5574');
  }
  for (const a of doors) {
    const dw = o.doubleDoor ? 1.92 : 0.96;
    put('paint', dw + 0.18, 2.0, 0.08, a, baseH + 0.97, 0.03, palette.trim);
    put('wood', dw, 1.86, 0.06, a, baseH + 0.93, 0.06, '#9c6b43');
    if (o.doubleDoor) put('paint', 0.04, 1.86, 0.08, a, baseH + 0.93, 0.08, '#6b4a30');
    put('metal', 0.05, 0.05, 0.12, a + dw / 2 - 0.14, baseH + 0.98, 0.12, '#c9a24a');
    put('paint', dw + 0.6, 0.06, 0.7, a, baseH + 2.12, 0.35, palette.trim);
  }
  if (o.roofGear) {
    for (const x of [-6, -3.6]) k.box('metal', 1.1, 0.6, 0.8, x, height + 0.36, (z0 + z1) / 2 - 0.6, '#9aa1a8');
    for (let i = 0; i < 5; i++) k.add('glass', new THREE.BoxGeometry(1.0, 0.04, 1.6), '#33475a', matrix(2.2 + i * 1.15, height + 0.35, (z0 + z1) / 2, -0.35));
  }
  if (o.pergola) {
    // Pérgola de madeira à frente do pavilhão.
    const px = x0 - 1.3, ph = height - 0.05;
    for (const z of [z0 + 0.3, cz, z1 - 0.3]) k.box('wood', 0.12, ph, 0.12, px, ph / 2, z, '#8a5c38');
    k.box('wood', 0.12, 0.14, d - 0.4, px, ph + 0.07, cz, '#8a5c38');
    for (let i = 0; i < 10; i++) k.box('wood', 1.45, 0.07, 0.07, px + 0.66, ph + 0.17, z0 + 0.35 + i * (d - 0.7) / 9, '#9c6b43');
  }
}

function win(put, a, sill, w, h, glass, trim, curtain) {
  const y = sill + h / 2;
  put(glass, w, h, 0.03, a, y, 0.015, glass === 'officeGlass' ? '#2a3d50' : '#2b3f52');
  if (curtain) put('paint', w * 0.32, h * 0.92, 0.01, a - w * 0.3, y, 0.037, curtain);
  // Moldura em quatro réguas salientes e peitoril de concreto.
  put('paint', w + 0.16, 0.08, 0.1, a, sill + h + 0.04, 0.05, trim);
  put('paint', 0.08, h, 0.1, a - w / 2 - 0.04, y, 0.05, trim);
  put('paint', 0.08, h, 0.1, a + w / 2 + 0.04, y, 0.05, trim);
  put('paint', w + 0.28, 0.07, 0.18, a, sill - 0.035, 0.09, C.concrete);
}

function balcony(put, a, floorY, trim) {
  put('paint', 1.25, 0.08, 0.6, a, floorY + 0.04, 0.3, C.concrete);
  put('metal', 1.25, 0.04, 0.04, a, floorY + 0.95, 0.58, C.metal);
  for (let i = 0; i <= 6; i++) put('metal', 0.025, 0.9, 0.025, a - 0.6 + i * 0.2, floorY + 0.5, 0.58, C.metal);
}

function desk(k, x, z) {
  const top = DECK + 0.74;
  k.box('wood', 1.3, 0.05, 0.64, x, top - 0.025, z, '#d9b88d');
  for (const [dx, dz] of [[-0.6, -0.27], [0.6, -0.27], [-0.6, 0.27], [0.6, 0.27]]) k.box('metal', 0.04, 0.72, 0.04, x + dx, DECK + 0.36, z + dz, C.metal);
  // Cadeira atrás da mesa (o agente fica voltado para a câmera).
  const cz = z - 0.62;
  k.box('paint', 0.46, 0.06, 0.44, x, DECK + 0.47, cz, '#3b4048');
  k.box('paint', 0.46, 0.5, 0.06, x, DECK + 0.78, cz - 0.24, '#3b4048');
  k.cyl('metal', 0.03, 0.03, 0.44, x, DECK + 0.22, cz, C.metal, 8);
  k.cyl('metal', 0.22, 0.22, 0.03, x, DECK + 0.015, cz, C.metal, 12);
}

function arcade(k, x, z, body, screen) {
  k.box('paint', 0.62, 1.72, 0.7, x, PAVE + 0.86, z, body);
  k.add('screens', new THREE.PlaneGeometry(0.46, 0.38), screen, matrix(x + 0.36, PAVE + 1.34, z, 0, Math.PI / 2, 0).multiply(matrix(0, 0, 0, -0.2)));
  k.box('paint', 0.3, 0.08, 0.62, x + 0.42, PAVE + 0.98, z, '#1f2328');
  k.box('paint', 0.64, 0.18, 0.72, x, PAVE + 1.8, z, '#1f2328');
}

function pingPong(k, x, z) {
  k.box('paint', 2.0, 0.04, 1.1, x, 0.76, z, '#2c5f4a');
  k.box('paint', 2.0, 0.005, 0.03, x, 0.783, z, '#f4f4f0');
  k.box('paint', 0.02, 0.14, 1.16, x, 0.85, z, '#f4f4f0');
  for (const [dx, dz] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) k.box('metal', 0.05, 0.74, 0.05, x + dx, 0.37, z + dz, C.metal);
}

function bench(k, x0, x1, z, ry, bucket) {
  const len = x1 - x0, cx = (x0 + x1) / 2, back = ry === 0 ? -1 : 1;
  for (let i = 0; i < 3; i++) k.box(bucket, len, 0.04, 0.12, cx, DECK * (ry === 0 ? 1 : 0) + 0.48, z + (i - 1) * 0.14, '#c49a6c');
  k.box(bucket, len, 0.32, 0.05, cx, DECK * (ry === 0 ? 1 : 0) + 0.72, z + back * 0.24, '#c49a6c');
  const legs = Math.max(2, Math.round(len / 1.6) + 1);
  for (let i = 0; i < legs; i++) k.box('metal', 0.05, 0.48, 0.42, x0 + 0.1 + i * (len - 0.2) / (legs - 1), DECK * (ry === 0 ? 1 : 0) + 0.24, z, C.metal);
}

function lounger(k, x, z) {
  const y = DECK + 0.32;
  k.box('wood', 0.62, 0.06, 1.2, x, y, z + 0.1, '#c49a6c');
  k.add('wood', new THREE.BoxGeometry(0.62, 0.06, 0.6), '#c49a6c', matrix(x, y + 0.25, z - 0.62, 0.75));
  for (const dz of [-0.4, 0.6]) k.box('wood', 0.56, y - DECK, 0.06, x, DECK + (y - DECK) / 2, z + dz, '#a87f55');
}

function umbrella(k, x, z, color) {
  k.cyl('metal', 0.03, 0.03, 2.45, x, DECK + 1.22, z, C.metal, 8);
  k.add('paint', new THREE.ConeGeometry(1.05, 0.42, 16, 1, true), color, matrix(x, DECK + 2.4, z));
  k.add('paint', new THREE.ConeGeometry(1.05, 0.42, 16, 1, true), color, matrix(x, DECK + 2.4, z, Math.PI));
  k.cyl('metal', 0.18, 0.2, 0.06, x, DECK + 0.03, z, C.metal, 10);
}

function planter(k, x, z) {
  k.box('paint', 0.9, 0.5, 0.9, x, DECK + 0.25, z, C.concrete);
  shrub(k, x, DECK + 0.5, z, 0.42, Math.round(x * 3 + z), true);
}

function tree(k, x, z, s, seed) {
  const h = 2.0 * s;
  k.add('wood', new THREE.CylinderGeometry(0.07 * s, 0.13 * s, h, 8), '#7a5a40', matrix(x, h / 2, z));
  const blobs = [[0, 0, 0, 1.15], [0.55, -0.2, 0.25, 0.85], [-0.5, -0.15, -0.2, 0.9], [0.05, 0.55, -0.1, 0.8]];
  blobs.forEach(([dx, dy, dz, r], i) => {
    k.add('foliage', new THREE.IcosahedronGeometry(r * s, 3), FOLIAGE[(seed + i) % FOLIAGE.length], matrix(x + dx * s, h + 0.6 * s + dy * s, z + dz * s, 0, 0, 0, 1, 0.88, 1));
  });
}

function pine(k, x, z, s) {
  k.add('wood', new THREE.CylinderGeometry(0.07 * s, 0.11 * s, 1.0 * s, 8), '#6b4f38', matrix(x, 0.5 * s, z));
  k.add('foliage', new THREE.ConeGeometry(1.0 * s, 2.4 * s, 18), '#93b08a', matrix(x, 1.9 * s, z));
  k.add('foliage', new THREE.ConeGeometry(0.72 * s, 1.8 * s, 18), '#a2bd97', matrix(x, 3.0 * s, z));
}

function shrub(k, x, y, z, r, seed, flowers = false) {
  k.add('foliage', new THREE.IcosahedronGeometry(r, 2), FOLIAGE[Math.abs(seed) % FOLIAGE.length], matrix(x, y + r * 0.55, z, 0, 0, 0, 1, 0.78, 1));
  if (flowers || Math.abs(seed) % 2 === 0) {
    const fc = ['#d9637f', '#e3c45a', '#f2efe8'][Math.abs(seed) % 3];
    for (let i = 0; i < 3; i++) {
      const a = (seed + i * 2.1);
      k.add('paint', new THREE.IcosahedronGeometry(0.06, 0), fc, matrix(x + Math.cos(a) * r * 0.6, y + r * 0.95, z + Math.sin(a) * r * 0.6));
    }
  }
}

function lamp(k, x, z) {
  k.cyl('metal', 0.035, 0.05, 3.3, x, 1.65 + 0.11, z, C.metal, 8);
  k.box('metal', 0.08, 0.06, 0.5, x, 3.38, z - 0.22, C.metal);
  k.box('paint', 0.2, 0.08, 0.3, x, 3.32, z - 0.4, '#e9e4d6');
}

// [linha da folha, largura, altura, x, y, z, inclinação]. As 4 primeiras são as placas de cobertura,
// inclinadas para trás e voltadas para a câmera; a última é a placa de latão do pedestal.
// Os rótulos dos agentes evitam cobri-las (ver signCorners).
export const SIGNS = [
  [0, 7.6, 0.95, 0, 5.75, -10.42, -0.42],
  [1, 4.4, 0.55, -12.9, 5.3, 1.4, -0.42],
  [2, 4.4, 0.55, 12.9, 5.4, 1.0, -0.42],
  [3, 3.4, 0.43, 13.5, 3.2, 7.8, -0.3],
  [4, 6.4, 0.8, 0, -0.62, 16.31, 0]
];

// Cantos de cada placa em coordenadas de mundo.
export function signCorners() {
  return SIGNS.map(([, w, h, x, y, z, rx]) => {
    const m = matrix(x, y, z, rx);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => new THREE.Vector3(sx * w / 2, sy * h / 2, 0).applyMatrix4(m));
  });
}

function signs(atlas) {
  const rows = 5;
  const parts = [];
  for (const [row, w, h, x, y, z, rx] of SIGNS) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    const v0 = 1 - (row + 1) / rows, v1 = 1 - row / rows;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
    g.applyMatrix4(matrix(x, y, z, rx));
    parts.push(g);
  }
  const material = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.55, metalness: 0.05 });
  const mesh = new THREE.Mesh(mergeGeometries(parts, false), material);
  parts.forEach(g => g.dispose());
  mesh.receiveShadow = true;
  return mesh;
}

// Fundo das placas (volume real de 6 cm) e postes de apoio sobre a cobertura.
function signBackings(k) {
  const boards = [[0, 5.75, -10.42, 7.8, 1.15, 4.42, [-3.0, 0, 3.0]], [-12.9, 5.3, 1.4, 4.6, 0.75, 4.42, [-1.6, 1.6]],
    [12.9, 5.4, 1.0, 4.6, 0.75, 4.42, [-1.6, 1.6]], [13.5, 3.2, 7.8, 3.6, 0.63, 2.37, [-1.2, 1.2]]];
  for (const [x, y, z, w, h, roof, posts] of boards) {
    const tilt = z > 7 ? -0.3 : -0.42;
    k.add('paint', new THREE.BoxGeometry(w, h, 0.06), '#3a3f45', matrix(x, y - 0.045 * Math.sin(-tilt), z - 0.045 * Math.cos(tilt), tilt));
    for (const dx of posts) k.box('metal', 0.06, y - roof, 0.06, x + dx, (y + roof) / 2, z - 0.08, C.metal);
  }
}
