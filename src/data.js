// Demo compilada: nenhum acesso à API ou a arquivos OpenClaw.
const DEMO=import.meta.env.VITE_AGENT_CITY_DEMO==='1';
const synthetic={connected:true,updatedAt:Date.now(),mode:'demo',agents:[
 {id:'main',name:'Max (demo)',emoji:'🧭',state:'working',task:'Delegando → 2',model:{configured:'exemplo/orquestrador',effective:'exemplo/orquestrador',source:'demo:sintético',availability:'confirmed'}},
 {id:'dev1',name:'Forge (demo)',emoji:'🔥',state:'working',task:'Criar uma visualização de tarefas com dados fictícios.',model:{configured:'exemplo/codigo',effective:'exemplo/codigo',source:'demo:sintético',availability:'confirmed'}},
 {id:'debugger',name:'Debugger (demo)',emoji:'🔬',state:'working',task:'Revisar a visualização e conferir os estados da demonstração.',model:{configured:'exemplo/revisao',effective:null,source:null,availability:'predicted'}}
],delegations:[
 {id:'demo-1',from:'main',to:'dev1',task:'Criar uma visualização de tarefas com dados fictícios.',startedAt:Date.now()-120000,status:'working',messages:[{speaker:'dev1',text:'Estrutura da demonstração criada; ajustando a leitura em telas pequenas.',at:Date.now()-90000},{speaker:'dev1',text:'Os cartões agora mostram o modelo e o resumo da tarefa.',at:Date.now()-60000}]},
 {id:'demo-2',from:'main',to:'debugger',task:'Revisar a visualização e conferir os estados da demonstração.',startedAt:Date.now()-80000,status:'working',messages:[{speaker:'debugger',text:'Conferindo os exemplos sintéticos e a consistência visual.',at:Date.now()-40000}]}
]};
export function subscribe(onData,onStatus){
 if(DEMO){queueMicrotask(()=>{onData(synthetic);onStatus('demo');});return;}
 let source=null,lastData=0,last=null;
 const deliver=data=>{if(!data||!Array.isArray(data.agents))return;lastData=Date.now();last=data;onData(data);onStatus(data.connected?'live':'off');};
 const offline=()=>{if(last?.connected){last={...last,connected:false,delegations:[],agents:last.agents.map(a=>({...a,state:'unknown',task:null,model:{...a.model,effective:null,source:null,availability:'unavailable'}}))};onData(last);}onStatus('retry');};
 const connect=()=>{source?.close();source=new EventSource('/api/events');source.onmessage=ev=>{try{deliver(JSON.parse(ev.data));}catch{}};source.onerror=()=>{offline();};};
 connect();
 setInterval(async()=>{if(Date.now()-lastData<30_000)return;try{const r=await fetch('/api/state',{cache:'no-store'});if(r.ok){deliver(await r.json());return;}}catch{}offline();if(source?.readyState===EventSource.CLOSED)connect();},5000);
}
