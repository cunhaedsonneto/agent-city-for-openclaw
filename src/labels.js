// Rótulos DOM projetados sobre a cena. Cada rótulo procura a posição livre mais próxima da
// cabeça do agente (lado ou acima), com linha-guia até o ponto real: nunca há sobreposição.
import * as THREE from 'three';
import { modelPresentation } from './ui.js';

const _v = new THREE.Vector3();

export class Labels {
  constructor(root, onPick) {
    this.root = root;
    this.onPick = onPick;
    this.items = new Map();
  }

  sync(agents, selected) {
    for (const agent of agents) {
      let it = this.items.get(agent.id);
      if (!it) {
        const el = document.createElement('div');
        el.className = 'tag';
        const e = document.createElement('span');
        e.className = 'e';
        const n = document.createElement('span');
        n.className = 'n';
        const m = document.createElement('span');
        m.className = 'm';
        const modelName = document.createElement('strong');
        modelName.className = 'model-id';
        const modelStatus = document.createElement('span');
        modelStatus.className = 'model-status';
        m.append(modelName, modelStatus);
        el.append(e, n, m);
        el.addEventListener('click', ev => { ev.stopPropagation(); this.onPick(agent.id); });
        this.root.append(el);
        it = { el, e, n, m, modelName, modelStatus, w: 0, h: 0, key: '' };
        this.items.set(agent.id, it);
      }
      const key = agent.name + '|' + agent.emoji + '|' + agent.state + '|' + JSON.stringify(agent.model) + '|' + (selected === agent.id);
      if (it.key !== key) {
        it.e.textContent = agent.emoji;
        it.n.textContent = agent.name;
        const model=modelPresentation(agent);
        it.modelName.textContent=model.name;
        it.modelStatus.textContent=model.status;
        it.modelStatus.className='model-status '+model.status;
        it.el.title=`${agent.name} · LLM ${model.status}: ${model.full || 'indisponível'}`;
        it.el.className = 'tag ' + agent.state + (selected === agent.id ? ' selected' : '');
        it.key = key;
        it.w = 0;
      }
    }
    for (const [id, it] of this.items) if (!agents.some(a => a.id === id)) { it.el.remove(); this.items.delete(id); }
  }

  remeasure() { for (const it of this.items.values()) it.w = 0; }

  // `points`: [{ id, world: Vector3 }]; `blocked`: retângulos em px da cena que nenhum rótulo deve cobrir
  // (placas dos ambientes, barra de câmera), no formato { x0, y0, x1, y1 }.
  layout(points, camera, width, height, blocked = []) {
    const list = [];
    for (const p of points) {
      const it = this.items.get(p.id);
      if (!it) continue;
      _v.copy(p.world).project(camera);
      const inside = _v.z < 1 && _v.x > -1.1 && _v.x < 1.1 && _v.y > -1.05 && _v.y < 1.25;
      if (!inside) { if (!it.el.hidden) it.el.hidden = true; continue; }
      if (it.el.hidden) it.el.hidden = false;
      if (!it.w) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
      list.push({ it, x: (_v.x + 1) / 2 * width, y: (1 - _v.y) / 2 * height, selected: it.el.classList.contains('selected'), working:it.el.classList.contains('working') });
    }
    // Selecionado primeiro; depois do mais próximo da câmera (base da tela) para o fundo.
    list.sort((a, b) => (b.working - a.working) || (b.selected - a.selected) || (b.y - a.y));
    // As áreas bloqueadas cedem: se com elas algum rótulo ficar sem vaga livre, refaz sem elas
    // (cena apertada); evitar sobreposição entre rótulos vale mais que evitar a placa.
    let spots = place(list, blocked, width);
    if (spots.crowded && blocked.length) spots = place(list, [], width);
    list.forEach((l, i) => {
      const { w } = l.it;
      const best = spots[i];
      if(!best){l.it.el.hidden=true;return;}
      const lead = Math.max(0, Math.round(l.y - best.by));
      const lx = Math.round(Math.min(Math.max(l.x - best.cx, -w / 2 + 6), w / 2 - 6));
      // Linha-guia interrompida onde cruza uma área bloqueada: passa "por trás" da placa.
      let g0 = 0, g1 = 0;
      const lineX = best.cx + lx;
      for (const r of blocked) {
        if (lineX < r.x0 || lineX > r.x1 || r.y1 <= best.by || r.y0 >= l.y) continue;
        g0 = Math.max(0, Math.round(r.y0 - best.by) - 2);
        g1 = Math.min(lead, Math.round(r.y1 - best.by) + 2);
        break;
      }
      const s = l.it.el.style;
      s.setProperty('--g0', g0 + 'px');
      s.setProperty('--g1', g1 + 'px');
      s.setProperty('--x', best.cx.toFixed(1) + 'px');
      s.setProperty('--y', best.by.toFixed(1) + 'px');
      s.setProperty('--lead', lead + 'px');
      s.setProperty('--lx', lx + 'px');
    });
  }
}

// Posição de cada rótulo: acima da cabeça, deslocado para os lados, e subindo em degraus.
// `crowded` indica que algum rótulo não achou vaga livre e ficou na posição de reserva.
function place(list, blocked, width) {
  const placed = blocked.slice();
  const free = (x0, y0, x1, y1) => x0 >= 2 && x1 <= width - 2 && y0 >= 2 && !placed.some(r => x0 < r.x1 + 3 && x1 > r.x0 - 3 && y0 < r.y1 + 2 && y1 > r.y0 - 2);
  const spots = [];
  spots.crowded = false;
  for (const l of list) {
    const { w, h } = l.it;
    let best = null;
    for (let step = 0; step < 9 && !best; step++) {
      const dy = -step * (h + 3);
      for (const k of [0, -0.6, 0.6, -1.15, 1.15]) {
        const cx = Math.min(Math.max(l.x + k * w, w / 2 + 2), width - w / 2 - 2);
        const by = l.y + dy;
        if (free(cx - w / 2, by - h, cx + w / 2, by)) { best = { cx, by }; break; }
      }
    }
    if (!best && l.it.el.classList.contains('unknown')) {
      spots.push(null);
      continue;
    }
    if (!best) {
      best = { cx: Math.min(Math.max(l.x, w / 2 + 2), width - w / 2 - 2), by: Math.max(l.y, h + 2) };
      spots.crowded = true;
    }
    placed.push({ x0: best.cx - w / 2, x1: best.cx + w / 2, y0: best.by - h, y1: best.by });
    spots.push(best);
  }
  return spots;
}
