import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot, offlineSnapshot } from './model.mjs';

const here=resolve(fileURLToPath(new URL('..',import.meta.url)));
const home=process.env.OPENCLAW_HOME||join(process.env.HOME||'','.openclaw');
const port=Number(process.env.PORT||4175);
const allowedHosts=(process.env.ALLOWED_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
const secure={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};
function isAllowedHost(host) {
 if(typeof host!=='string'||/[\s/@]/.test(host))return false;
 try {const u=new URL('http://'+host);return ['localhost','127.0.0.1','[::1]',...allowedHosts].includes(u.hostname.toLowerCase())&&u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}
}
function cli(method,params) {
 return new Promise((ok,no)=>{
  const child=spawn('openclaw',['gateway','call',method,'--params',JSON.stringify(params),'--json'],{stdio:['ignore','pipe','ignore']});
  let output='';const timer=setTimeout(()=>child.kill('SIGKILL'),10_000);
  child.stdout.on('data',part=>{output+=part;if(output.length>8_000_000)child.kill('SIGKILL');});
  child.on('error',no);
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return no(Error('Gateway indisponível'));try {ok(JSON.parse(output.slice(output.indexOf('{'))));}catch {no(Error('Resposta inválida'));}});
 });
}
async function readOpenClaw() {
 const [config,sessions]=await Promise.all([readFile(join(home,'openclaw.json'),'utf8').then(JSON.parse),cli('sessions.list',{activeMinutes:60,limit:200})]);
 if(!Array.isArray(sessions.sessions)||sessions.hasMore===true)throw Error('Lista incompleta');
 const rows=sessions.sessions;
 const candidates=rows.filter(r=>r.parentSessionKey && (r.hasActiveRun===true || Number(r.updatedAt)>Date.now()-600_000)).slice(0,20);
 const histories=new Map();
 await Promise.all(candidates.map(async r=>{try {const h=await cli('chat.history',{sessionKey:r.key,limit:1000});if(Array.isArray(h.messages))histories.set(r.key,{messages:h.messages,inFlightRun:h.inFlightRun||h.sessionInfo?.inFlightRun});}catch {/* ausência de fala é explícita */}}));
 return {config,sessions:rows,histories};
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};
export function createApp({read=readOpenClaw,root=here}={}) {
 let latest={connected:false,updatedAt:Date.now(),mode:'live',agents:[],delegations:[]};
 let busy=false,lastSuccess=0;
 const clients=new Set();
 function broadcast() {const line='data: '+JSON.stringify(latest)+'\n\n';for(const client of clients)client.write(line);}
 async function refresh() {
  if(busy)return;
  busy=true;
  try {const raw=await read();latest=buildSnapshot(raw.config,raw.sessions,raw.histories,Date.now());lastSuccess=Date.now();}
  catch {latest=offlineSnapshot(latest);}
  finally {busy=false;broadcast();}
 }
 const server=createServer(async(req,res)=>{
  if(!isAllowedHost(req.headers.host)){res.writeHead(421,secure);return res.end();}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD',...secure});return res.end();}
  const path=new URL(req.url||'/','http://localhost').pathname;
  if(path==='/api/state'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...secure});return res.end(req.method==='HEAD'?undefined:JSON.stringify(latest));}
  if(path==='/api/events'){
   if(clients.size>=30){res.writeHead(503,secure);return res.end();}
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform',Connection:'keep-alive',...secure});
   if(req.method==='HEAD')return res.end();
   res.write('retry: 4000\n\ndata: '+JSON.stringify(latest)+'\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;
  }
  if(path.startsWith('/api/')){res.writeHead(404,secure);return res.end();}
  const dist=join(root,'dist');const target=resolve(dist,'.'+(path==='/'?'/index.html':path));
  if(!target.startsWith(dist+'/')){res.writeHead(403,secure);return res.end();}
  try {if(!(await stat(target)).isFile())throw Error('not file');const content=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-store',...secure});res.end(req.method==='HEAD'?undefined:content);}catch{res.writeHead(404,secure);res.end();}
 });
 function start(){
  server.listen(port,'127.0.0.1');refresh();
  const poll=setInterval(refresh,8000);poll.unref();
  const watchdog=setInterval(()=>{if(latest.connected&&Date.now()-lastSuccess>30_000){latest=offlineSnapshot(latest);broadcast();}for(const client of clients)client.write(': heartbeat\n\n');},5000);watchdog.unref();
 }
 return {server,refresh,start,getState:()=>latest};
}
if(process.env.NODE_ENV!=='test' && process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))createApp().start();
