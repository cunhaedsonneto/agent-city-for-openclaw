// Moradores da maquete: alocação de vagas por estado real, caminhada entre vagas e poses.
// working → mesa no deck dos Escritórios; resting → cena ilustrativa de lazer/jogos;
// unknown → de pé na praça, parado, sem atividade atribuída.
import * as THREE from 'three';
import { createFigure, createLaptop, HIP } from './figure.js';
import { workSlots, restSlots, waitSlots, DECK, PAVE } from './city.js';

const SLOTS = { working: workSlots(), resting: restSlots(), unknown: waitSlots() };
const WALK_SPEED = 2.3;

// Altura do piso em (x, z): decks, pisos de pedra ou grama.
function groundAt(x, z) {
  if (x >= -9 && x <= 9 && z >= -10.2 && z <= -4.2) return DECK;
  if (x >= 3.2 && x <= 10.5 && z >= 0.2 && z <= 8.2) return DECK;
  if (x >= -10.6 && x <= 10.6 && z >= -4.2 && z <= -2.4) return PAVE;
  if (x >= -10.6 && x <= -6.8 && z >= -2.4 && z <= 1.6) return PAVE;
  if ((x + 2) ** 2 + (z - 2.6) ** 2 <= 5.05 ** 2) return PAVE;
  return 0;
}

const ringGeo = new THREE.RingGeometry(0.5, 0.64, 40);
ringGeo.rotateX(-Math.PI / 2);
const selectGeo = new THREE.RingGeometry(0.72, 0.86, 6);
selectGeo.rotateX(-Math.PI / 2);
const shadowGeo = new THREE.PlaneGeometry(1.25, 1.25);
shadowGeo.rotateX(-Math.PI / 2);

export class Population {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.list = [];
    this.byId = new Map();
    this.assigned = { working: new Map(), resting: new Map(), unknown: new Map() };
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#1f9d55', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    this.selectRing = new THREE.Mesh(selectGeo, new THREE.MeshBasicMaterial({ color: '#1679c4', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    this.selectRing.renderOrder = 3;
    this.selectRing.visible = false;
    scene.add(this.selectRing);
    this.selected = null;
  }

  ensure(agents) {
    agents.forEach((agent, index) => {
      if (this.byId.has(agent.id)) { this.byId.get(agent.id).agent = agent; return; }
      const fig = createFigure(agent, index);
      const shadow = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
      shadow.position.y = 0.012;
      shadow.renderOrder = 1;
      fig.root.add(shadow);
      const ring = new THREE.Mesh(ringGeo, this.ringMat);
      ring.position.y = 0.014;
      ring.renderOrder = 2;
      ring.visible = false;
      fig.root.add(ring);
      const laptop = createLaptop(fig.outfit.shirt);
      laptop.visible = false;
      this.scene.add(fig.root, laptop);
      const a = { agent, index, fig, ring, laptop, state: null, slot: null, path: [], walking: false, phase: index * 0.7, pos: new THREE.Vector3(), heading: 0 };
      this.list.push(a);
      this.byId.set(agent.id, a);
    });
  }

  // Aloca vagas mantendo quem já está na mesma categoria no mesmo lugar.
  update(agents, { instant = false } = {}) {
    this.ensure(agents);
    const want = new Map(agents.map(a => [a.id, a.state]));
    for (const [state, map] of Object.entries(this.assigned)) {
      for (const id of [...map.keys()]) if (want.get(id) !== state) map.delete(id);
    }
    agents.forEach(agent => {
      const map = this.assigned[agent.state];
      if (map.has(agent.id)) return;
      const used = new Set(map.values());
      const slots = SLOTS[agent.state];
      let idx = slots.findIndex((_, i) => !used.has(i));
      if (idx < 0) idx = map.size % slots.length;
      map.set(agent.id, idx);
    });
    for (const a of this.list) {
      const agent = agents.find(x => x.id === a.agent.id);
      if (!agent) { a.fig.root.visible = false; a.laptop.visible = false; continue; }
      const slot = SLOTS[agent.state][this.assigned[agent.state].get(agent.id)];
      const changed = a.slot !== slot;
      a.state = agent.state;
      if (!changed) continue;
      if (!a.slot || instant) {
        this.place(a, slot);
      } else {
        const exit = a.slot.approach.slice(0, -1).reverse();
        a.path = [...exit, ...slot.approach].map(([x, z]) => new THREE.Vector3(x, 0, z));
        a.walking = true;
        a.laptop.visible = false;
        a.ring.visible = false;
      }
      a.slot = slot;
    }
  }

  place(a, slot) {
    a.pos.set(slot.x, slot.y, slot.z);
    a.heading = slot.ry;
    a.walking = false;
    a.path = [];
    a.slot = slot;
    this.applyPose(a, 0, false);
  }

  applyPose(a, t, motion) {
    const { fig } = a;
    const pose = a.walking ? 'walk' : a.slot.pose;
    fig.root.position.copy(a.pos);
    fig.root.rotation.y = a.heading;
    const [legL, legR] = fig.legs, [armL, armR] = fig.arms;
    let hip = HIP, recline = 0, legX = 0, armX = 0, armZ = 0.08, sway = 0;
    const s = motion ? Math.sin(t * 9 + a.phase) : 0;
    let legSwing = 0, armSwing = 0, armL2 = null;
    switch (pose) {
      case 'walk': legSwing = Math.sin(t * 9 + a.phase) * 0.55; armSwing = -legSwing * 0.8; break;
      case 'desk': hip = 0.6; legX = -1.48; armX = -1.08; armZ = 0.12; armSwing = motion ? Math.sin(t * 14 + a.phase) * 0.05 : 0; break;
      case 'bench': hip = 0.6; legX = -1.45; armX = -0.38; sway = motion ? Math.sin(t * 0.9 + a.phase) * 0.18 : 0; break;
      case 'lounge': hip = 0.5; recline = -0.95; legX = -0.6; armX = -2.6; armZ = 0.4; break;
      case 'arcade': armX = -1.05; armZ = 0.1; armSwing = motion ? s * 0.06 : 0; break;
      case 'pingpong': armL2 = motion ? -0.9 + Math.sin(t * 3.2 + a.phase) * 0.55 : -0.9; sway = motion ? Math.sin(t * 3.2 + a.phase) * 0.12 : 0; break;
      default: break;
    }
    fig.body.position.y = hip;
    fig.body.rotation.set(recline, sway, 0);
    legL.rotation.x = legX + legSwing;
    legR.rotation.x = legX - legSwing;
    armL.rotation.set(armX + armSwing, 0, -armZ);
    armR.rotation.set(armL2 ?? (armX - armSwing), 0, armZ);
    const face = a.walking ? 'neutral' : a.state === 'working' ? 'focus' : a.state === 'resting' ? 'happy' : 'neutral';
    if (fig.faceKind !== face) { fig.setFace(face); fig.faceKind = face; }
    const atDesk = !a.walking && a.state === 'working' && a.slot.pose === 'desk';
    a.ring.visible = atDesk;
    a.laptop.visible = atDesk;
    if (atDesk) a.laptop.position.set(a.slot.desk.x, DECK + 0.745, a.slot.desk.z - 0.02);
  }

  // Avança caminhadas e animações; devolve true se algo se moveu.
  tick(dt, t, motion) {
    let moving = false;
    for (const a of this.list) {
      if (!a.slot) continue;
      if (a.walking) {
        moving = true;
        let budget = WALK_SPEED * dt;
        while (budget > 0 && a.path.length) {
          const next = a.path[0];
          const dx = next.x - a.pos.x, dz = next.z - a.pos.z, dist = Math.hypot(dx, dz);
          if (dist < 1e-4) { a.path.shift(); continue; }
          const target = Math.atan2(dx, dz);
          let delta = target - a.heading;
          delta = Math.atan2(Math.sin(delta), Math.cos(delta));
          a.heading += delta * Math.min(1, dt * 10);
          const step = Math.min(budget, dist);
          a.pos.x += dx / dist * step; a.pos.z += dz / dist * step;
          budget -= step;
          if (step >= dist) a.path.shift();
        }
        a.pos.y = groundAt(a.pos.x, a.pos.z);
        if (!a.path.length) { this.place(a, a.slot); continue; }
      }
      this.applyPose(a, t, motion);
    }
    if (motion) this.ringMat.opacity = 0.55 + Math.sin(t * 3) * 0.25;
    if (this.selected) {
      const a = this.byId.get(this.selected);
      this.selectRing.visible = Boolean(a && a.fig.root.visible);
      if (a) this.selectRing.position.set(a.pos.x, a.pos.y + 0.02, a.pos.z);
    } else this.selectRing.visible = false;
    return moving;
  }

  select(id) { this.selected = id; }
  hitTargets() { return this.list.filter(a => a.fig.root.visible).map(a => a.fig.hit); }

  // Ponto acima da cabeça, em coordenadas de mundo, para o rótulo.
  anchor(a, out) {
    a.fig.body.updateWorldMatrix(true, true);
    out.copy(a.fig.headTop);
    out.y -= HIP;
    return a.fig.body.localToWorld(out);
  }
}
