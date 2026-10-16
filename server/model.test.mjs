import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText, buildSnapshot, offlineSnapshot } from './model.mjs';
import { modelPresentation } from '../src/ui.js';
const config = { agents: { defaults: { model: { primary: 'vendor/default' } }, entries: { main: { identity: { name: 'Max', emoji: '🧭' }, model: { primary: 'vendor/planner' } }, dev1: { identity: { name: 'Forge', emoji: '🔥' } } } } };
const now = 1_800_000_000_000;

test('redação de conteúdo hostil antes de API, SSE e DOM', () => {
  const input = 'Revisar conta cliente@exemplo.com senha=SUPERSECRET https://private.test/?token=SUPERSECRET /Users/alguem/segredo 5500000000000 AKIA1234567890123456';
  const result = sanitizeText(input);
  for (const sensitive of ['cliente@', 'SUPERSECRET', 'private.test', '/Users/', '5500000000000', 'AKIA']) assert.ok(!result.includes(sensitive));
});

test('execução confirmada, modelo efetivo com fonte, delegação e fala real', () => {
  const sessions = [
    { key:'parent', agentId:'main', hasActiveRun:true, status:'running', activeModelProvider:'vendor', activeModel:'planner-active', modelProvider:'vendor', model:'session-model', startedAt:now-2000 },
    { key:'child', agentId:'dev1', parentSessionKey:'parent', hasActiveRun:true, status:'running', modelProvider:'vendor', model:'old', startedAt:now-1000 }
  ];
  const histories = new Map([['child', { messages: [
    { role:'user', content:'[Subagent Context] O marcador [Subagent Task] aqui é explicativo.\n[Subagent Task]\nConstruir painel de delegação.', timestamp:now-1100 },
    { role:'assistant', content:[{type:'text',text:'Implementei o painel de delegação.'}], timestamp:now-100, __openclaw:{runId:'run-1'} },
    { role:'toolResult', content:'senha=SUPERSECRET', timestamp:now-50 }
  ] }]]);
  sessions[1].activeRunIds=undefined;
  const state=buildSnapshot(config,sessions,histories,now);
  assert.equal(state.agents.find(a=>a.id==='main').model.effective,'vendor/planner-active');
  assert.equal(state.agents.find(a=>a.id==='main').model.source,'gateway:activeModel');
  assert.equal(state.agents.find(a=>a.id==='dev1').model.effective,null);
  assert.equal(state.delegations.length,1);
  assert.equal(state.delegations[0].task,'Construir painel de delegação.');
  assert.equal(state.delegations[0].messages[0].speaker,'dev1');
  assert.ok(!JSON.stringify(state).includes('SUPERSECRET'));
  assert.ok(!JSON.stringify(state).includes('parent'));
});

test('E1/E2: briefing pertence apenas ao run ativo da mesma sessão filha', () => {
  const sessions=[
    {key:'parent',agentId:'main',hasActiveRun:false},
    {key:'child',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:true,startedAt:now-1_000,status:'running'},
    {key:'ended',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:false,startedAt:now-30_000,updatedAt:now,status:'done'}
  ];
  const histories=new Map([
    ['child',{messages:[
      {role:'user',content:'[Subagent Task]\nBriefing encerrado.',timestamp:now-29_900},
      {role:'user',content:'[Subagent Task]\nBriefing do run ativo.',timestamp:now-1_100},
      {role:'assistant',content:'Executando o briefing atual.',timestamp:now-500}
    ]}],
    ['ended',{messages:[{role:'user',content:'[Subagent Task]\nOutra sessão encerrada.',timestamp:now-30_100}]}]
  ]);
  const state=buildSnapshot(config,sessions,histories,now);
  assert.equal(state.delegations.find(d=>d.status==='working')?.task,'Briefing do run ativo.');
  assert.equal(state.agents.find(a=>a.id==='dev1').task,'Briefing do run ativo.');
  assert.equal(state.agents.find(a=>a.id==='main').state,'working');
  assert.equal(state.agents.find(a=>a.id==='main').task,'Delegando → 1');
  assert.ok(!JSON.stringify(state).includes('Briefing encerrado.'));
  assert.ok(!JSON.stringify(state).includes('Outra sessão encerrada.'));
});

test('E2: sem briefing ligado ao início do run, exibir indisponível', () => {
  const sessions=[{key:'parent',agentId:'main'},{key:'child',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:true,startedAt:now,status:'running'}];
  const histories=new Map([['child',{messages:[{role:'user',content:'[Subagent Task]\nTarefa anterior.',timestamp:now-15_000}]}]]);
  const state=buildSnapshot(config,sessions,histories,now);
  assert.equal(state.delegations[0].task,null);
  assert.equal(state.agents.find(a=>a.id==='dev1').task,null);
});

test('E2: briefing antigo sem resposta ou com outra mensagem não contamina run novo', () => {
  const sessions=[{key:'parent',agentId:'main'},{key:'child',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:true,startedAt:now,status:'running'}];
  for(const messages of [
    [{role:'user',content:'[Subagent Task]\nBriefing antigo.',timestamp:now-2_000}],
    [{role:'user',content:'[Subagent Task]\nBriefing antigo.',timestamp:now-800},{role:'user',content:'Continuação sem marcador.',timestamp:now-3}]
  ]) {
    const state=buildSnapshot(config,sessions,new Map([['child',{messages}]]),now);
    assert.equal(state.delegations[0].task,null);
  }
  const history=new Map([['child',{messages:[{role:'user',content:'[Subagent Task]\nBriefing novo.',timestamp:now-1_000}]}]]);
  assert.equal(buildSnapshot(config,sessions,history,now).delegations[0].task,'Briefing novo.');
});

test('startAt é aceito; sem início, activeModel direto também não é atribuído', () => {
  const sessions=[{key:'parent',agentId:'main'},{key:'child',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:true,startAt:now-1_000,activeModelProvider:'vendor',activeModel:'novo'}];
  const histories=new Map([['child',{messages:[{role:'user',content:'[Subagent Task]\nTarefa atual.',timestamp:now-1_100}]}]]);
  let state=buildSnapshot(config,sessions,histories,now);
  assert.equal(state.delegations[0].task,'Tarefa atual.');
  assert.equal(state.agents.find(a=>a.id==='dev1').model.effective,'vendor/novo');
  delete sessions[1].startAt;
  state=buildSnapshot(config,sessions,histories,now);
  assert.equal(state.agents.find(a=>a.id==='dev1').model.effective,null);
});

test('E3: sem horário de início não inferir modelo ou fala por mensagem', () => {
  const sessions=[{key:'parent',agentId:'main'},{key:'child',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:true,activeRunIds:['run-1'],status:'running'}];
  const histories=new Map([['child',{messages:[
    {role:'user',content:'[Subagent Task]\nTarefa antiga.',timestamp:now-100},
    {role:'assistant',content:'Fala antiga.',provider:'vendor',model:'old',timestamp:now,__openclaw:{runId:'run-1'}}
  ]}]]);
  const state=buildSnapshot(config,sessions,histories,now);
  assert.equal(state.agents.find(a=>a.id==='dev1').model.effective,null);
  assert.equal(state.delegations[0].task,null);
  assert.deepEqual(state.delegations[0].messages,[]);
});

test('claude-cli: configurado é previsto, nunca efetivo; fala inFlight saneada', () => {
  const sessions=[{key:'parent',agentId:'main'},{key:'child',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:true,startedAt:now-1_000,activeModel:'real',activeModelProvider:'vendor',agentRuntime:{id:'claude-cli'},status:'running'}];
  const histories=new Map([['child',{messages:[{role:'user',content:'[Subagent Task]\nRevisar interface.',timestamp:now-1_100}],inFlightRun:{text:'Revisando interface. senha=SUPERSECRET'}}]]);
  const state=buildSnapshot(config,sessions,histories,now);
  const agent=state.agents.find(a=>a.id==='dev1');
  assert.equal(agent.model.effective,null);
  assert.equal(agent.model.availability,'predicted');
  assert.equal(state.delegations[0].messages[0].text,'Revisando interface. [credencial omitida]');
  assert.ok(!JSON.stringify(state).includes('SUPERSECRET'));
});

test('inFlightRun antigo não vira fala do run atual', () => {
  const sessions=[{key:'parent',agentId:'main'},{key:'child',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:true,startedAt:now-1_000,agentRuntime:{id:'claude-cli'},status:'running'}];
  const histories=new Map([['child',{messages:[],inFlightRun:{text:'Fala de outra execução.',startedAt:now-20_000}}]]);
  const state=buildSnapshot(config,sessions,histories,now);
  assert.deepEqual(state.delegations[0].messages,[]);
});

test('inFlightRun com ID de outro run não vira fala do run atual', () => {
  const sessions=[{key:'parent',agentId:'main'},{key:'child',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:true,startedAt:now-1_000,activeRunIds:['novo'],agentRuntime:{id:'claude-cli'}}];
  const histories=new Map([['child',{messages:[],inFlightRun:{text:'Fala anterior.',runId:'antigo',startedAt:now-500}}]]);
  assert.deepEqual(buildSnapshot(config,sessions,histories,now).delegations[0].messages,[]);
});

test('saneamento omite documentos e credenciais com conectivo', () => {
  const cases=[
    ['CPF 123.456.789-09','123.456.789-09'],
    ['CNPJ 99.999.999/9999-99','99.999.999/9999-99'],
    ['senha do Wi-Fi é TesteRede123','TesteRede123'],
    ['a senha é TesteRede456','TesteRede456'],
    ['Authorization: Basic dGVzdGU6c2VuaGE=','dGVzdGU6c2VuaGE='],
    ['token abc123secretvalue','abc123secretvalue'],
    ['<scr<script>ipt>alert(1)</script>','alert(1)']
  ];
  for(const [input,sensitive] of cases) assert.ok(!String(sanitizeText(input)).includes(sensitive),input);
});

test('briefing longo termina em palavra inteira sem placeholder aberto', () => {
  const sessions=[{key:'parent',agentId:'main'},{key:'child',agentId:'dev1',parentSessionKey:'parent',hasActiveRun:true,startedAt:now,status:'running'}];
  const content='[Subagent Task]\n'+'palavra '.repeat(33)+'/Users/alguem/caminho mais conteúdo';
  const histories=new Map([['child',{messages:[{role:'user',content,timestamp:now-100}]}]]);
  const task=buildSnapshot(config,sessions,histories,now).delegations[0].task;
  assert.ok(task.endsWith('…'));
  assert.ok(!/\[[^\]]*$/.test(task));
  assert.ok(task.length<=281);
});

test('sessão recente sem run ativo não vira trabalho, e offline limpa indicadores', () => {
  const state=buildSnapshot(config,[{key:'child',agentId:'dev1',status:'running',hasActiveRun:false,updatedAt:now}],new Map(),now);
  assert.equal(state.agents.find(a=>a.id==='dev1').state,'unknown');
  const off=offlineSnapshot(state,now+31_000);
  assert.equal(off.connected,false);
  assert.ok(off.agents.every(a=>a.state==='unknown'&&a.model.effective===null));
  assert.equal(off.delegations.length,0);
});

test('nome e emoji de configuração não levam contatos ao navegador',()=>{
 const hostile={agents:{entries:{dev1:{identity:{name:'contato@exemplo.com',emoji:'1234'}}}}};
 const state=buildSnapshot(hostile,[],new Map(),now);
 assert.equal(state.agents[0].name,'dev1');
 assert.equal(state.agents[0].emoji,'✦');
});

test('nome curto e selo do modelo distinguem efetivo, previsto e configurado', () => {
  assert.deepEqual(modelPresentation({model:{configured:'anthropic/claude-opus-5-5',effective:null,availability:'predicted'}}),{name:'claude-opus-5-5',full:'anthropic/claude-opus-5-5',status:'previsto'});
  assert.deepEqual(modelPresentation({model:{configured:'openai/gpt-6-sol',effective:'openai/gpt-6-luna',availability:'confirmed'}}),{name:'gpt-6-luna',full:'openai/gpt-6-luna',status:'efetivo'});
  assert.deepEqual(modelPresentation({model:{configured:'openai/gpt-6-sol',effective:null,availability:'unavailable'}}),{name:'gpt-6-sol',full:'openai/gpt-6-sol',status:'configurado'});
});
