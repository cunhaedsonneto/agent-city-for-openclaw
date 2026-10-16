// Painel em texto: resumo, agentes agrupados por estado, ficha do selecionado e registro.
import { outfitFor } from './figure.js';

const $ = id => document.getElementById(id);
const STATE_TEXT = { working: 'Trabalhando', resting: 'Em pausa', unknown: 'Sem informação' };
const GROUPS = [
  ['working', 'Trabalhando agora', 'Ninguém em execução confirmada neste momento.'],
  ['resting', 'Em pausa', 'Nenhuma execução encerrada nos últimos minutos.'],
  ['unknown', 'Sem informação', '']
];
const hhmm = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const hhmmss = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function modelPresentation(agent) {
  const full=agent.model?.effective || agent.model?.configured || null;
  const status=agent.model?.effective?'efetivo':agent.model?.availability==='predicted'&&full?'previsto':full?'configurado':'indisponível';
  return {name:full?full.split('/').at(-1):'LLM indisponível',full,status};
}
const modelSummary = agent => {
  const model=modelPresentation(agent);
  return model.full?`LLM ${model.status}${model.status==='previsto'?' (não confirmado)':''}: ${model.full}`:'LLM indisponível';
};
export function truncateWords(value, limit = 170) {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit + 1).lastIndexOf(' ');
  return (cut > 0 ? value.slice(0, cut) : value.split(' ')[0]).trimEnd() + '…';
}

function tint(hex, amount = 0.6) {
  const n = parseInt(hex.slice(1), 16);
  const mix = c => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

export function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : '');
  const h = Math.floor(m / 60);
  return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}

function plural(n, one, many) { return n === 1 ? one : many; }

export function describe(agent, titles = {}) {
  if (agent.state === 'working') return [agent.task || 'Execução confirmada; briefing indisponível', modelSummary(agent)];
  if (agent.state === 'resting') return ['Encerrou uma execução há pouco', 'A cena de lazer é ilustrativa'];
  return ['O OpenClaw não confirmou execução nem término recente'];
}

export class Panel {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.groupsKey = '';
    this.logKey = '';
    $('groups').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-id]');
      if (btn) this.onSelect(btn.dataset.id, true);
    });
    $('detail').addEventListener('click', ev => { if (ev.target.closest('.close')) this.onSelect(null, true); });
    const tickClock = () => { $('clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
    tickClock();
    setInterval(tickClock, 15000);
  }

  connection(kind) {
    const el = $('conn');
    const map = { demo: ['is-live', 'Demo sintética'], live: ['is-live', 'Ao vivo'], wait: ['is-wait', 'Conectando'], retry: ['is-wait', 'Reconectando…'], off: ['is-off', 'OpenClaw sem resposta'] };
    const [cls, text] = map[kind] || map.wait;
    el.className = 'conn ' + cls;
    el.lastElementChild.textContent = text;
  }

  render(data, selected) {
    const agents = data.agents || [];
    this.index = new Map(agents.map((a, i) => [a.id, i]));
    this.agentsById = new Map(agents.map(a => [a.id,a]));
    const count = s => agents.filter(a => a.state === s).length;
    const w = count('working'), r = count('resting'), u = count('unknown');
    const summary = $('summary');
    if (!agents.length) summary.textContent = 'Aguardando a primeira leitura…';
    else if (!data.connected) summary.textContent = 'Sem leitura do OpenClaw agora. Todos aparecem como sem informação.';
    else {
      summary.replaceChildren(
        span('w', `${w} ${plural(w, 'trabalhando', 'trabalhando')}`), ', ',
        span('r', `${r} em pausa`), ' e ',
        span('', `${u} sem informação`), '.'
      );
    }
    if (summary.textContent !== this.lastSummary) { this.lastSummary = summary.textContent; $('live').textContent = summary.textContent; }
    $('fresh').textContent = data.mode === 'demo' ? 'Dados fictícios · sem conexão com OpenClaw' : data.updatedAt ? `${agents.length} agentes · leitura das ${hhmmss(data.updatedAt)} · atualiza a cada ~8 s` : '';
    document.querySelector('p.note').textContent = data.mode === 'demo' ? 'Demonstração: agentes, modelos, tarefas e falas são fictícios. Carros e lazer são ilustrativos.' : 'Carros, jogos e lazer são cenas ilustrativas. Só o estado de trabalho vem do OpenClaw. As janelas dos Escritórios acendem apenas quando há alguém trabalhando.';

    this.activeDelegations = (data.delegations || []).filter(d => d.status === 'working');
    const key = JSON.stringify([agents.map(a => [a.id, a.name, a.emoji, a.state, a.task, a.model]), this.activeDelegations.map(d=>d.to), selected]);
    if (key !== this.groupsKey) {
      this.groupsKey = key;
      const focusedId = document.activeElement?.closest?.('#groups button[data-id]')?.dataset.id;
      const frag = document.createDocumentFragment();
      for (const [state, title, empty] of GROUPS) {
        const members = agents.filter(a => a.state === state);
        if (!members.length && state === 'unknown') continue;
        const sec = document.createElement('section');
        sec.className = 'group ' + state;
        const h = document.createElement('h3');
        h.append(dot(state), title + ' ', Object.assign(document.createElement('span'), { className: 'n', textContent: '· ' + members.length }));
        sec.append(h);
        if (!members.length) {
          sec.append(Object.assign(document.createElement('p'), { className: 'group-empty', textContent: empty }));
        } else {
          const ul = document.createElement('ul');
          for (const agent of members) ul.append(this.card(agent, data.activityTitles, selected));
          sec.append(ul);
        }
        frag.append(sec);
      }
      $('groups').replaceChildren(frag);
      if (focusedId) $('groups').querySelector(`button[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
    }
    this.detail(agents.find(a => a.id === selected), data.activityTitles);
    this.flow(data);
    this.log(data);
  }

  card(agent, titles, selected) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'agent ' + agent.state;
    b.dataset.id = agent.id;
    b.setAttribute('aria-pressed', String(selected === agent.id));
    const idx = this.index.get(agent.id) || 0;
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.setAttribute('aria-hidden', 'true');
    sw.textContent = agent.emoji;
    sw.style.background = tint(outfitFor(agent.id, idx).shirt, agent.state === 'unknown' ? 0.75 : 0.55);
    const nm = Object.assign(document.createElement('span'), { className: 'nm', textContent: agent.name });
    const lines = describe(agent, titles);
    const modelInfo=modelPresentation(agent);
    const model=document.createElement('span'); model.className='model';
    const modelName=Object.assign(document.createElement('strong'),{className:'model-name',textContent:modelInfo.name});
    const modelStatus=Object.assign(document.createElement('span'),{className:'model-status '+modelInfo.status,textContent:modelInfo.status});
    model.append(modelName,modelStatus);
    model.title=modelSummary(agent);
    const ds = Object.assign(document.createElement('span'), { className: 'ds', textContent: lines[0] });
    b.setAttribute('aria-label', `${agent.name}: ${STATE_TEXT[agent.state]}. ${lines.join('. ')}. Mostrar na maquete.`);
    b.append(sw, model, nm, ds);
    li.append(b);
    if (this.activeDelegations?.some(d => d.to === agent.id && d.task)) {
      const link=Object.assign(document.createElement('a'),{className:'brief-link',href:'#flow',textContent:'ver briefing'});
      li.append(link);
    }
    return li;
  }

  detail(agent, titles) {
    const box = $('detail');
    if (!agent) { box.hidden = true; box.replaceChildren(); return; }
    const key = JSON.stringify([agent, titles?.[agent.id]]);
    if (box.dataset.key === key && !box.hidden) return;
    box.dataset.key = key;
    const av = Object.assign(document.createElement('span'), { className: 'avatar', textContent: agent.emoji });
    av.setAttribute('aria-hidden', 'true');
    av.style.background = tint(outfitFor(agent.id, this.index.get(agent.id) || 0).shirt, 0.55);
    const name = Object.assign(document.createElement('strong'), { textContent: agent.name });
    const close = Object.assign(document.createElement('button'), { type: 'button', className: 'close', textContent: '×' });
    close.setAttribute('aria-label', 'Fechar ficha');
    const st = Object.assign(document.createElement('span'), { className: 'st', textContent: STATE_TEXT[agent.state] });
    st.style.color = `var(--${agent.state}-ink)`;
    const lines = [...describe(agent, titles), `Modelo configurado: ${agent.model?.configured || 'indisponível'}`, `Fonte do efetivo: ${agent.model?.source || 'não comprovada'}`].map(t => Object.assign(document.createElement('span'), { className: 'meta', textContent: t }));
    box.replaceChildren(av, name, close, st, ...lines);
    box.hidden = false;
  }

  flow(data) {
    const rows = data.connected ? (data.delegations || []) : [];
    const root = $('flow');
    const scene = $('scene-flow');
    root.replaceChildren();
    const active = rows.find(r => r.status === 'working');
    scene.hidden = !active;
    scene.textContent = active ? `Max → ${this.nameFor(active.to)} · ${active.task ? truncateWords(active.task, 110) : 'briefing indisponível'}` : '';
    if (!rows.length) { root.append(Object.assign(document.createElement('p'), {className:'empty',textContent:'Nenhuma delegação confirmada na janela observada.'})); return; }
    for (const row of rows) {
      const card = document.createElement('article'); card.className='flow-card';
      const title = document.createElement('strong'); title.textContent=`${this.nameFor(row.from)} → ${this.nameFor(row.to)}`;
      const status = document.createElement('span'); status.className='flow-status';
      status.textContent={working:'Em execução',done:'Encerrada',failed:'Falhou',timeout:'Tempo esgotado',killed:'Interrompida'}[row.status] || 'Sem confirmação';
      const task = document.createElement('p'); task.textContent=row.task || 'Briefing não disponível nesta leitura.';
      card.append(title,status,task);
      for (const message of row.messages || []) {
        const bubble=document.createElement('blockquote');
        bubble.append(Object.assign(document.createElement('b'),{textContent:`${this.nameFor(message.speaker)} · fala observada`}), document.createTextNode(' '+truncateWords(message.text)));
        bubble.title=message.text;
        card.append(bubble);
      }
      if (!(row.messages||[]).length) card.append(Object.assign(document.createElement('small'),{textContent:'Nenhuma fala textual confirmada.'}));
      root.append(card);
    }
  }

  nameFor(id) { return [...(this.index || new Map()).keys()].includes(id) ? this.agentsById?.get(id)?.name || id : id; }

  log(data) {
    const events = (data.activityEvents || []).slice().sort((a, b) => b.at - a.at);
    const key = JSON.stringify([events.map(e => [e.at, e.name]), data.historySince]);
    if (key === this.logKey) return;
    this.logKey = key;
    $('since').textContent = data.historySince ? 'desde ' + hhmm(data.historySince) : '';
    const list = $('log');
    if (!events.length) {
      list.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'Nenhuma execução encerrada até agora.' }));
      return;
    }
    list.replaceChildren(...events.slice(0, 30).map(e => {
      const li = document.createElement('li');
      const em = Object.assign(document.createElement('span'), { textContent: e.emoji });
      em.setAttribute('aria-hidden', 'true');
      const body = document.createElement('span');
      const verb = e.outcome === 'failed' ? 'Execução com falha' : e.outcome === 'cancelled' ? 'Execução cancelada' : 'Execução encerrada';
      const d = duration(e.durationMs);
      body.append(Object.assign(document.createElement('b'), { textContent: e.name }));
      body.append(Object.assign(document.createElement('span'), { className: 'o' + (e.outcome === 'failed' ? ' failed' : ''), textContent: verb + (d ? ' · ' + d : '') }));
      body.append(Object.assign(document.createElement('span'), { className: 'o', textContent: e.title || 'Tarefa sem título público' }));
      const t = Object.assign(document.createElement('time'), { className: 't', textContent: hhmm(e.at) });
      t.dateTime = new Date(e.at).toISOString();
      li.append(em, body, t);
      return li;
    }));
  }
}

function span(cls, text) { return Object.assign(document.createElement('b'), { className: cls, textContent: text }); }
function dot(state) { const i = document.createElement('i'); i.className = 'dot ' + state; i.setAttribute('aria-hidden', 'true'); return i; }
