import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createApp } from './index.mjs';
const cfg={agents:{entries:{main:{identity:{name:'Max',emoji:'🧭'}},dev1:{identity:{name:'Forge',emoji:'🔥'}}}}};
const raw={config:cfg,sessions:[{key:'p',agentId:'main',hasActiveRun:true,activeModel:'real',activeModelProvider:'vendor',startedAt:100},{key:'c',parentSessionKey:'p',agentId:'dev1',hasActiveRun:true,startedAt:200,activeRunIds:['r']}],histories:new Map([['c',{messages:[{role:'user',content:'[Subagent Task]\nCriar painel senha=SUPERSECRET',timestamp:150},{role:'assistant',content:'Trabalhando no painel.',timestamp:300,__openclaw:{runId:'r'}}]}]])};

test('API e SSE publicam somente contrato sanitizado; Host rejeitado e offline limpa',async()=>{
 let fail=false;
 const app=createApp({read:async()=>{if(fail)throw Error('offline');return raw;}, root:process.cwd()});
 await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
 const origin=`http://127.0.0.1:${app.server.address().port}`;
 try {
  await app.refresh();
  const body=await (await fetch(origin+'/api/state')).text();
  const sse=await fetch(origin+'/api/events');
  const reader=sse.body.getReader();const chunk=new TextDecoder().decode((await reader.read()).value);await reader.cancel();
  for(const text of [body,chunk]) { assert.ok(text.includes('Trabalhando no painel.'));assert.ok(!text.includes('SUPERSECRET'));assert.ok(!text.includes('"key"')); }
  const hostStatus=await new Promise(ok=>{const q=request(origin+'/api/state',{headers:{Host:'evil.example'}},r=>{r.resume();ok(r.statusCode)});q.end();});
  assert.equal(hostStatus,421);
  fail=true;await app.refresh();const off=await (await fetch(origin+'/api/state')).json();
  assert.equal(off.connected,false);assert.equal(off.delegations.length,0);assert.ok(off.agents.every(a=>a.state==='unknown'));
  fail=false;await app.refresh();assert.equal((await (await fetch(origin+'/api/state')).json()).connected,true);
 } finally {await new Promise(ok=>app.server.close(ok));}
});
