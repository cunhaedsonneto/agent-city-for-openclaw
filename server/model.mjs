// Contrato público do processo local. Campos não declarados nunca atravessam a API.
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const SAFE_MODEL = /^[a-z0-9._-]{1,40}\/[a-z0-9._:-]{1,90}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/g;
const ms = value => {const n=typeof value==='string' && /[-T:]/.test(value)?Date.parse(value):Number(value);return Number.isFinite(n)&&n>0?Math.round(n):null;};
const clip = (value, max) => Array.from(String(value ?? '')).slice(0,max).join('').replace(CONTROL,'');
const safeName=(value,id)=>{const name=clip(value||id,32);return name===sanitizeText(name,32)&&/^[\p{L}\p{M}\p{N} ._-]{1,32}$/u.test(name)&&!/(?:\d[ -]?){7,}/.test(name)?name:id;};
const safeEmoji=value=>{const emoji=clip(value||'✦',4);return emoji&&!/[a-z0-9@/:\\]/i.test(emoji)?emoji:'✦';};
const modelId = (provider, name) => {
  if(typeof name !== 'string') return null;
  const full = name.includes('/') ? name : provider && typeof provider==='string' ? `${provider}/${name}` : '';
  return SAFE_MODEL.test(full) ? full : null;
};
const primary = (entry, defaults) => {
  const raw = entry?.model ?? defaults?.model;
  if(typeof raw==='string') return modelId(null,raw);
  return modelId(null,raw?.primary);
};

export function sanitizeText(value, max=360) {
  if(typeof value !== 'string') return null;
  if(/<\s*scr/i.test(value)) return null;
  let s=value.replace(/```[\s\S]*?```/g,'[código omitido]')
    .replace(/\[Subagent Task\]/g,'')
    .replace(/\[(?:Inter-session message|Subagent Context)[^\]]*\]/gi,'[metadado omitido]')
    .replace(/\b(?:https?:\/\/|wss?:\/\/)[^\s<>"']+/gi,'[URL omitida]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,'[e-mail omitido]')
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|ai|br|local|ts\.net)\b/gi,'[domínio omitido]')
    .replace(/(?:\/Users\/|\/home\/|~\/|[A-Z]:\\)[^\s<>"']+/g,'[caminho omitido]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,'[credencial omitida]')
    .replace(/\b(?:sk-|ghp_|gho_|github_pat_|xox[baprs]-)[A-Za-z0-9_\-]{8,}\b/g,'[credencial omitida]')
    .replace(/\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g,'[credencial omitida]')
    .replace(/\b(?:senha\s+do\s+wi-?fi|senha|password|token|secret|api[_ -]?key|credential|authorization)\s*(?::|=|\s)\s*(?:(?:é|eh|is)\s+)?(?:(?:Bearer|Basic)\s+)?[^\s,;]+/gi,'[credencial omitida]')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,'[documento omitido]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,'[documento omitido]')
    .replace(/\b(?:\+?\d[\d ()-]{9,}\d)\b/g,'[número omitido]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'[identificador omitido]')
    .replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g,'[identificador omitido]')
    .replace(/<[^>]+>/g,'')
    .replace(CONTROL,' ')
    .replace(/\s+/g,' ').trim();
  if(!s || /(?:BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|data:[^ ]+;base64|<script|\b(?:CPF|CNPJ)\b)/i.test(s)) return null;
  return Array.from(s).slice(0,max).join('');
}

function textOf(message) {
  const c=message?.content;
  if(typeof c==='string') return c;
  if(Array.isArray(c) && c.every(p=>p?.type==='text')) return c.map(p=>p.text||'').join(' ');
  return null;
}
function active(row) { return row?.hasActiveRun===true; }
const runStart=row=>ms(row?.startAt ?? row?.startedAt);
const isClaudeCli=row=>row?.agentRuntime?.id==='claude-cli';
const matchesRun=(message,row)=>{
  const start=runStart(row), at=ms(message?.timestamp);
  if(!start || !at || at<start || !active(row)) return false;
  const ids=Array.isArray(row.activeRunIds)?row.activeRunIds:[];
  return !ids.length || ids.includes(message.__openclaw?.runId);
};
function briefingFor(row,history) {
  const start=runStart(row);
  if(!active(row)||!start)return null;
  // O prompt precede o início do run por milissegundos; uma janela curta evita
  // reaproveitar o briefing de outra execução na mesma sessão.
  const message=(history?.messages||[]).filter(m=>m.role==='user'&&typeof textOf(m)==='string'
    &&textOf(m).includes('[Subagent Task]')&&ms(m.timestamp)>=start-1_000&&ms(m.timestamp)<=start+2_000).at(-1);
  if(!message)return null;
  if((history?.messages||[]).some(m=>(m.role==='assistant'||m.role==='user')&&ms(m.timestamp)>ms(message.timestamp)&&ms(m.timestamp)<start))return null;
  const raw=textOf(message);
  const clean=sanitizeText(raw.slice(raw.lastIndexOf('[Subagent Task]')+'[Subagent Task]'.length),360);
  if(!clean||Array.from(clean).length<=280)return clean;
  const head=Array.from(clean).slice(0,280).join('');
  const boundary=head.lastIndexOf(' ');
  if(boundary<0)return null;
  const whole=head.slice(0,boundary).replace(/\[[^\]]*$/,'').trimEnd();
  return whole?whole+'…':null;
}
function speechFor(row,history) {
  if(!active(row)||!runStart(row))return [];
  const inFlight=history?.inFlightRun||row.inFlightRun;
  const ids=Array.isArray(row.activeRunIds)?row.activeRunIds:[];
  const flightId=inFlight?.runId;
  const flightAt=ms(inFlight?.startedAt ?? inFlight?.startAt);
  const sameFlight=(!flightId || !ids.length || ids.includes(flightId)) && (!flightAt || flightAt>=runStart(row));
  const liveText=sameFlight?sanitizeText(inFlight?.text,220):null;
  if(liveText)return [{speaker:row.agentId,text:liveText,at:flightAt||runStart(row)}];
  if(isClaudeCli(row))return [];
  return (history?.messages||[]).filter(m=>m.role==='assistant'&&textOf(m)&&matchesRun(m,row))
    .slice(-4).map(m=>({speaker:row.agentId,text:sanitizeText(textOf(m),220),at:ms(m.timestamp)})).filter(m=>m.text);
}
function effective(row, history) {
  if(!active(row)||!runStart(row)) return { effective:null, source:null };
  if(isClaudeCli(row)) return { effective:null, source:null };
  const direct=modelId(row.activeModelProvider,row.activeModel);
  if(direct) return { effective:direct, source:'gateway:activeModel' };
  const runIds=Array.isArray(row.activeRunIds)?row.activeRunIds:[];
  for(const msg of (history?.messages||[]).slice().reverse()) {
    if(msg.role!=='assistant' || !matchesRun(msg,row)) continue;
    const id=modelId(msg.provider,msg.model);
    if(id) return {effective:id,source:runIds.length?'chat:activeRun':'chat:após-início'};
  }
  return {effective:null,source:null};
}

export function buildSnapshot(config, rows, histories=new Map(), now=Date.now()) {
  const entries=config?.agents?.entries||{};
  const known=new Map(Object.entries(entries).filter(([id])=>ID.test(id)));
  const valid=(Array.isArray(rows)?rows:[]).filter(r=>known.has(r?.agentId));
  const running=new Map();
  for(const r of valid) if(active(r) && (!running.has(r.agentId)||(runStart(r)||0)>(runStart(running.get(r.agentId))||0))) running.set(r.agentId,r);
  const agents=[...known].map(([id,entry])=>{
    const row=running.get(id);
    const configured=primary(entry,config?.agents?.defaults);
    const found=row?effective(row,histories.get(row.key)): {effective:null,source:null};
    return {id,name:safeName(entry?.identity?.name||entry?.name,id),emoji:safeEmoji(entry?.identity?.emoji),state:row?'working':'unknown',task:null,model:{configured,effective:found.effective,source:found.source,availability:found.effective?'confirmed':row&&isClaudeCli(row)&&configured?'predicted':'unavailable'}};
  });
  const delegations=[];
  const rowByKey=new Map(valid.map(r=>[r.key,r]));
  for(const row of valid) {
    if(!active(row)) continue;
    if(!row.parentSessionKey || !rowByKey.has(row.parentSessionKey) || !ID.test(row.agentId)) continue;
    const parent=rowByKey.get(row.parentSessionKey);
    if(parent.agentId!=='main'||row.agentId==='main') continue;
    const history=histories.get(row.key);
    const task=briefingFor(row,history);
    const messages=speechFor(row,history);
    const status=active(row)?'working': ['done','failed','timeout','killed'].includes(row.status)?row.status:'unknown';
    delegations.push({id:`d${delegations.length+1}`,from:'main',to:row.agentId,task,startedAt:runStart(row),status,messages});
    if(delegations.length>=20) break;
  }
  for(const d of delegations){const agent=agents.find(a=>a.id===d.to), selected=running.get(d.to);if(agent?.state==='working'&&d.status==='working'&&selected?.parentSessionKey&&runStart(selected)===d.startedAt)agent.task=d.task;}
  const workingDelegations=delegations.filter(d=>d.status==='working').length;
  const max=agents.find(a=>a.id==='main');
  if(max&&workingDelegations){max.state='working';max.task=`Delegando → ${workingDelegations}`;}
  return {connected:true,updatedAt:now,mode:'live',agents,delegations};
}
export function offlineSnapshot(previous, now=Date.now()) {
  return {connected:false,updatedAt:now,mode:previous.mode||'live',agents:(previous.agents||[]).map(a=>({...a,state:'unknown',task:null,model:{...a.model,effective:null,source:null,availability:'unavailable'}})),delegations:[]};
}
