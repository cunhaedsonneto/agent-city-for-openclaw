import { createApp } from '../server/index.mjs';
const config={agents:{entries:{main:{identity:{name:'Max',emoji:'🧭'}},dev1:{identity:{name:'Forge',emoji:'🔥'}}}}};
const sessions=[{key:'parent',agentId:'main',hasActiveRun:true,activeModelProvider:'vendor',activeModel:'orchestrator',startedAt:Date.now()-10000},{key:'child',parentSessionKey:'parent',agentId:'dev1',hasActiveRun:true,activeModelProvider:'vendor',activeModel:'worker',startedAt:Date.now()-8000}];
const histories=new Map([['child',{messages:[{role:'user',content:'[Subagent Task]\nCriar painel senha=SUPERSECRET https://private.test/?token=SUPERSECRET /Users/alguem/segredo cliente@exemplo.com',timestamp:Date.now()-7000},{role:'assistant',content:'Estrutura pronta. senha=SUPERSECRET',timestamp:Date.now()-1000},{role:'toolResult',content:'SUPERSECRET',timestamp:Date.now()-900}]}]]);
const app=createApp({read:async()=>({config,sessions,histories})});
app.server.listen(4178,'127.0.0.1',async()=>{await app.refresh();console.log('fixture ready');});
