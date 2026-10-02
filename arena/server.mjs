import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, rename, open, rm, realpath } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RULESET, migrateRun, migrateResult, createRun, act, prepareTeam, battle, finishRound, trainingTeam, addPreparationEvents } from './core.mjs';
import { presetsFor } from './presets.mjs';
import { replayActions } from './round-actions.mjs';
import { configuredSnapshotStore } from './cloudbase-store.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=(res,status,value)=>{if(value.run||value.ok)value={...value,capabilities:{roundActions:true},snapshotStore:res.arenaSnapshotStore||'local-file'};res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.ico':'image/x-icon','.json':'application/json; charset=utf-8'};
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>32768)fail(413,'请求过大');}try{return JSON.parse(data||'{}');}catch{fail(400,'JSON 无效');}}

export async function startServer({port=8082,dataDir=resolve(ROOT,'../workspace/sap-arena-data'),snapshotStore=configuredSnapshotStore()}={}){
 await mkdir(dataDir,{recursive:true});
 const lockPath=resolve(dataDir,'.owner.lock');let lock;
 try{lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));}catch{throw new Error(`试玩数据正在使用：${dataDir}`);}
 const file=resolve(dataDir,'arena.json');let db={ruleset:RULESET,runs:{},snapshots:[]},queue=Promise.resolve();
 try{const parsed=JSON.parse(await readFile(file,'utf8'));if(![RULESET,'idol-queue-v1'].includes(parsed.ruleset)||!parsed.runs||!Array.isArray(parsed.snapshots))throw new Error('试玩存档版本不兼容');for(const row of Object.values(parsed.runs)){row.run=migrateRun(row.run);if(row.lastBattle?.battle?.ruleset!==RULESET)row.lastBattle=null;for(const receipt of Object.values(row.requests||{}))receipt.result=migrateResult(receipt.result);}parsed.ruleset=RULESET;db=parsed;}catch(e){if(e.code!=='ENOENT'){await lock.close();await rm(lockPath,{force:true});throw e;}}
 async function persist(next){const temp=resolve(dataDir,`arena.${randomBytes(6).toString('hex')}.tmp`);let f;try{f=await open(temp,'wx',0o600);await f.writeFile(JSON.stringify(next));await f.sync();await f.close();f=null;await rename(temp,file);}finally{if(f)await f.close();await rm(temp,{force:true});}}
 const transact=fn=>{const result=queue.then(async()=>{const next=structuredClone(db),value=await fn(next);try{await persist(next);}catch{fail(503,'对局保存暂时失败，请使用原操作重试');}db=next;return value;});queue=result.catch(()=>{});return result;};
 async function flushSnapshots(){if(!snapshotStore)return;await transact(async next=>{for(const s of next.snapshots){if(s.published||s.ruleset!==RULESET)continue;s.id=s.id||`${s.owner}-r${s.round}`;await snapshotStore.publish(s);s.published=true;}return null;});}
 try{if(snapshotStore){await flushSnapshots();}}catch(e){await lock.close();await rm(lockPath,{force:true});throw e;}
 const view=row=>structuredClone(row.run);
 function authenticate(req,state=db){const raw=req.headers.authorization?.match(/^Bearer ([a-f0-9]{48})$/)?.[1];if(!raw)fail(401,'请重新建立对局连接');const key=hash(raw),row=state.runs[key];if(!row)fail(401,'这局不存在，请开始新一局');return {key,row};}
 const server=http.createServer(async(req,res)=>{res.arenaSnapshotStore=snapshotStore?'cloudbase-pg':'local-file';try{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  if(path.startsWith('/api/arena/')){
   const origin=req.headers.origin,allowed=new Set([`http://127.0.0.1:${server.address().port}`,`http://localhost:${server.address().port}`,'http://127.0.0.1:8081','http://localhost:8081']);
   if(origin&&!allowed.has(origin))fail(403,'来源不允许');
   if(origin){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');}
   if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'});res.end();return;}
   if(path==='/api/arena/health'&&req.method==='GET'){json(res,200,{ok:true,ruleset:RULESET,scope:'local-preview',snapshotStore:snapshotStore?'cloudbase-pg':'local-file',storageHealthy:snapshotStore?.healthy??true});return;}
   if(req.method==='POST'&&!(req.headers['content-type']||'').startsWith('application/json'))fail(415,'需要 JSON 请求');
   if(path==='/api/arena/runs'&&req.method==='POST'){
    const input=await body(req);if(input.teamName!==undefined&&(typeof input.teamName!=='string'||input.teamName.length>30||!input.teamName.trim()))fail(400,'队名无效');const token=randomBytes(24).toString('hex'),key=hash(token);
    const result=await transact(next=>{if(Object.keys(next.runs).length>=500)fail(429,'试玩对局数量已满');const run=createRun(randomBytes(16).toString('hex'));run.teamName=input.teamName?.trim()||'星域小队';next.runs[key]={run,lastBattle:null,requests:{},created:Date.now()};return {token,run:view(next.runs[key])};});json(res,201,result);return;
   }
   if(path==='/api/arena/run'&&req.method==='GET'){await queue;json(res,200,{run:view(authenticate(req).row)});return;}
   if(path==='/api/arena/last-battle'&&req.method==='GET'){await queue;const row=authenticate(req).row;json(res,200,row.lastBattle?{run:view(row),...row.lastBattle}:{run:view(row),battle:null});return;}
   if(['/api/arena/action','/api/arena/battle'].includes(path)&&req.method==='POST'){
    const input=await body(req);if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))fail(400,'操作标识无效');if(!Number.isSafeInteger(input.revision)||input.revision<0)fail(400,'存档版本无效');
    const fingerprint=hash(JSON.stringify({path,revision:input.revision,action:input.action,...(input.actions!==undefined?{actions:input.actions}:{})}));
    const result=await transact(async next=>{const {key,row}=authenticate(req,next);const prior=row.requests[input.requestId];if(prior){if(prior.fingerprint!==fingerprint)fail(409,'同一操作标识不能用于不同请求');return structuredClone(prior.result);}
     if(row.run.revision!==input.revision)fail(409,'对局已经更新，请同步后重试');
     let result;
     if(path.endsWith('/action')){act(row.run,input.action);row.run.revision++;result={run:view(row)};}
     else{
      try{row.run=replayActions(row.run,input.actions);}catch(e){fail(400,e.message);}
      const team=prepareTeam(row.run),round=row.run.round;
      const local=next.snapshots.filter(s=>s.owner!==key&&s.round===round&&s.ruleset===RULESET);
      const remote=snapshotStore?await snapshotStore.list(round,key):[];
      const pool=[...new Map([...local,...remote].map(s=>[s.id||`${s.owner}-r${s.round}`,s])).values()];
      const candidates=pool.filter(s=>!row.lastBattle||s.owner!==row.lastBattle.opponent.owner);const available=candidates.length?candidates:pool;
      const seed=randomBytes(12).toString('hex');const picked=available.length?available[randomBytes(4).readUInt32LE()%available.length]:null;
      const presets=presetsFor(round);if(!presets.length)fail(503,'训练阵容库尚未就绪');const preset=presets[randomBytes(4).readUInt32LE()%presets.length];
      const opponent=picked?{name:picked.name||`旅人小队 ${picked.owner.slice(0,4)}`,source:'player',round,owner:picked.owner}:{name:preset.name,source:'training',round};
      const enemy=picked?picked.team:preset.team;const replay=addPreparationEvents(battle(team,enemy,seed),row.run);finishRound(row.run,replay);delete row.run.preparationEvents;row.run.revision++;
      // Only publish after this run's result is determined. Never mutate the matched run.
      next.snapshots.push({id:`${RULESET}-${key}-r${round}`,owner:key,name:row.run.teamName||'星域小队',round,ruleset:RULESET,team,wins:row.run.wins,created:Date.now(),published:false});if(next.snapshots.length>2500){const removable=next.snapshots.findIndex(s=>s.published||!snapshotStore);if(removable>=0)next.snapshots.splice(removable,1);}
      row.lastBattle={battle:replay,opponent};result={run:view(row),...row.lastBattle};
     }
     row.requests[input.requestId]={fingerprint,result:structuredClone(result)};const ids=Object.keys(row.requests);for(const id of ids.slice(0,Math.max(0,ids.length-30)))delete row.requests[id];return result;
    });if(path.endsWith('/battle'))await flushSnapshots();json(res,200,result);return;
   }
   fail(404,'接口不存在');
  }
  if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'只允许读取页面');
  let relative;try{relative=decodeURIComponent(path).replace(/^\/+/, '')||'arena.html';}catch{fail(400,'路径无效');}
  if(relative.includes('..')||relative.includes('\\')||relative.includes('\0'))fail(403,'路径不允许');
  const permitted=['arena.html','index.html','online.html','sw.js','icon-192.png','icon-512.png','manifest.json'].includes(relative)||['arena/client.mjs','arena/core.mjs','arena/replay.mjs','arena/round-actions.mjs','arena/style.css'].includes(relative)||/^(assets|tools|online)\//.test(relative);
  if(!permitted||/(^|\/)\.|\.test\.|server|\.py$/.test(relative))fail(403,'文件不允许');
  const mime=MIME[extname(relative)];if(!mime)fail(403,'文件类型不允许');const target=resolve(ROOT,relative);const actual=await realpath(target);if(!actual.startsWith(ROOT+sep))fail(403,'路径不允许');const content=await readFile(actual);
  res.writeHead(200,{'content-type':mime,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
 }catch(e){if(!res.headersSent)json(res,e.status|| (e.code==='ENOENT'?404:400),{error:e.status?e.message:e.code==='ENOENT'?'文件不存在':e.message||'操作失败'});else res.destroy();}});
 try{await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});}catch(e){await lock.close();await rm(lockPath,{force:true});throw e;}
 return {server,url:`http://127.0.0.1:${server.address().port}`,async close(){await new Promise(ok=>server.close(ok));await queue;await lock.close();await rm(lockPath,{force:true});}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const service=await startServer({port:Number(process.env.PORT)||8082,dataDir:process.env.ARENA_DATA_DIR||undefined});console.log(`Arena preview: ${service.url}/arena.html`);let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await service.close();process.exit(0);});}
