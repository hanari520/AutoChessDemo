import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {RULESET,migrateRun,migrateResult,createRun,act,prepareTeam,battle,finishRound,addPreparationEvents} from './core.mjs';
import {presetsFor} from './presets.mjs';
import {replayActions} from './round-actions.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export class PersistentArenaStore {
 constructor(db){this.db=db;this.pools=new Map();this.healthUntil=0;}
 async query(q){const {data,error}=await q.abortSignal(AbortSignal.timeout(8000));if(error)throw Object.assign(new Error('云端存档暂时不可用，请重试'),{status:503});return data;}
 async health(){if(Date.now()<this.healthUntil)return;await this.query(this.db.from('idol_arena_runs').select('owner_hash').limit(1));this.healthUntil=Date.now()+60000;}
 async create(owner,run){await this.query(this.db.from('idol_arena_runs').insert({owner_hash:owner,run}));}
 async get(owner,{replay=false}={}){const rows=await this.query(this.db.from('idol_arena_runs').select(replay?'run,last_battle,last_opponent':'run,last_opponent').eq('owner_hash',owner).limit(1));return rows?.[0]||null;}
 async prior(owner,id){
  const rows=await this.query(this.db.from('idol_arena_requests').select('fingerprint,result').eq('owner_hash',owner).eq('request_id',id).limit(1)),prior=rows?.[0];
  if(prior?.result?.replayRevision!==undefined){
   const row=await this.get(owner,{replay:true});
   prior.result=row?.last_battle?.replayRevision===prior.result.replayRevision?{run:prior.result.run,battle:row.last_battle.battle,opponent:row.last_battle.opponent}:{status:409,error:'旧回合回放已更新，请同步当前对局'};
  }
  return prior||null;
 }
 async opponents(round,owner){
  let entry=this.pools.get(round);
  if(!entry||entry.until<Date.now()){
   // Share a bounded pool across players; exclude the requesting player after caching.
   const promise=this.query(this.db.from('idol_arena_snapshots').select('id,owner_hash,name,team,round').eq('ruleset',RULESET).eq('round',round).eq('source','player').order('created_at',{ascending:false}).limit(40));
   entry={until:Date.now()+60000,promise};this.pools.set(round,entry);
   if(this.pools.size>32)this.pools.delete(this.pools.keys().next().value);
   try{entry.rows=await promise||[];}catch(e){if(this.pools.get(round)===entry)this.pools.delete(round);throw e;}
  }
  return (entry.rows||await entry.promise||[]).filter(s=>s.owner_hash!==owner);
 }
 async commit(owner,input,fingerprint,run,result,snapshot){
  const data=await this.query(this.db.rpc('idol_arena_commit_v2',{p_owner:owner,p_revision:input.revision,p_request:input.requestId,p_fingerprint:fingerprint,p_run:run,p_result:result,p_snapshot:snapshot}));if(data?.error)fail(data.status,data.error);
  if(snapshot){const entry=this.pools.get(snapshot.round);if(entry?.rows&&!entry.rows.some(s=>s.id===snapshot.id)){entry.rows.unshift({...snapshot,owner_hash:owner});entry.rows=entry.rows.slice(0,40);}}
  return data;
 }
}
export function createCloudArenaServer(store,{origins=['https://autochess.hanari520.cn'],rateLimit=true}={}){
 const allowed=new Set(origins),rates=new Map();
 function limit(req,newRun){if(!rateLimit)return;const now=Date.now(),address=String(req.headers['x-real-ip']||req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0];const key=address+(newRun?':new':':all');let row=rates.get(key);if(!row||now-row.start>60000){row={start:now,count:0};rates.set(key,row);}if(++row.count>(newRun?12:240))fail(429,'操作过于频繁，请稍后再试');if(rates.size>10000){for(const [key,value]of rates)if(now-value.start>60000)rates.delete(key);if(rates.size>10000)fail(429,'服务繁忙，请稍后再试');}}
 async function read(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>32768)fail(413,'请求内容过大');}let input;try{input=JSON.parse(text||'{}');}catch{fail(400,'请求格式错误');}if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'请求必须是 JSON 对象');return input;}
 return http.createServer(async(req,res)=>{
  const reply=(status,data)=>{if(data.run||data.ok)data={...data,capabilities:{roundActions:true},snapshotStore:'cloudbase-pg'};res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   const origin=req.headers.origin;if(origin&&!allowed.has(origin))fail(403,'来源不允许');
   if(origin){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');}
   if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','access-control-max-age':'600'});res.end();return;}
   const path=new URL(req.url,'http://localhost').pathname;limit(req,false);
   if(path==='/api/arena/health'&&req.method==='GET'){await store.health();reply(200,{ok:true,ruleset:RULESET,scope:'production',snapshotStore:'cloudbase-pg',runStore:'cloudbase-pg',storageHealthy:true});return;}
   if(!['GET','POST'].includes(req.method))fail(405,'不支持此请求方法');
   if(req.method==='POST'&&!String(req.headers['content-type']).startsWith('application/json'))fail(415,'需要 JSON 请求');
   if(path==='/api/arena/runs'&&req.method==='POST'){
    limit(req,true);const input=await read(req);if(input.teamName!==undefined&&(typeof input.teamName!=='string'||!input.teamName.trim()||input.teamName.length>30))fail(400,'队名无效');
    const token=randomBytes(24).toString('hex'),run=createRun(randomBytes(16).toString('hex'));run.teamName=input.teamName?.trim()||'星域小队';await store.create(hash(token),run);reply(201,{token,run});return;
   }
   if(!['/api/arena/run','/api/arena/last-battle','/api/arena/action','/api/arena/battle'].includes(path))fail(404,'接口不存在');
   const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{48})$/)?.[1];if(!token)fail(401,'请重新建立对局连接');const owner=hash(token),row=await store.get(owner,{replay:path.endsWith('/last-battle')});if(!row)fail(401,'对局不存在，请重新组队');row.run=migrateRun(row.run);if(row.last_battle?.battle?.ruleset!==RULESET)row.last_battle=null;
   if(path==='/api/arena/run'&&req.method==='GET'){reply(200,{run:row.run});return;}
   if(path==='/api/arena/last-battle'&&req.method==='GET'){reply(200,{run:row.run,...(row.last_battle?{battle:row.last_battle.battle,opponent:row.last_battle.opponent}:{battle:null})});return;}
   if(req.method!=='POST'||!['/api/arena/action','/api/arena/battle'].includes(path))fail(405,'不支持此请求方法');
   const input=await read(req);if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))fail(400,'操作标识无效');if(!Number.isSafeInteger(input.revision)||input.revision<0)fail(400,'存档版本无效');
   const fingerprint=hash(JSON.stringify({path,revision:input.revision,action:input.action,...(input.actions!==undefined?{actions:input.actions}:{})}));const prior=await store.prior(owner,input.requestId);
   if(prior){if(prior.fingerprint!==fingerprint)fail(409,'同一操作标识不能用于不同请求');if(prior.result?.error)fail(prior.result.status,prior.result.error);reply(200,migrateResult(prior.result));return;}
   if(row.run.revision!==input.revision)fail(409,'对局已经更新，请同步后重试');
   let run=structuredClone(row.run),result,snapshot=null;
   if(path.endsWith('/action')){try{act(run,input.action);}catch(e){fail(400,e.message);}run.revision++;result={run};}
   else{
    try{run=replayActions(run,input.actions);}catch(e){fail(400,e.message);}
    if(run.status!=='prep')fail(400,'本局已结束，请重新组队');if(!run.team.some(Boolean))fail(400,'请先招募队员');
    const round=run.round,team=prepareTeam(run),pool=await store.opponents(round,owner),different=pool.filter(s=>s.owner_hash!==(row.last_opponent||row.last_battle?.opponent.owner)),available=different.length?different:pool;
    const picked=available.length?available[randomBytes(4).readUInt32LE()%available.length]:null;
    const presets=picked?[]:presetsFor(round);if(!picked&&!presets.length)fail(503,'训练阵容库尚未就绪');const preset=presets.length?presets[randomBytes(4).readUInt32LE()%presets.length]:null;
    const opponent=picked?{name:picked.name,source:'player',owner:picked.owner_hash,round}:{name:preset.name,source:'training',round};
    const replay=addPreparationEvents(battle(team,picked?.team||preset.team,randomBytes(12).toString('hex')),run);finishRound(run,replay);delete run.preparationEvents;run.revision++;result={run,battle:replay,opponent};
    snapshot={id:`${RULESET}-${owner}-r${round}`,name:run.teamName,round,ruleset:RULESET,team,wins:run.wins};
   }
   reply(200,migrateResult(await store.commit(owner,input,fingerprint,run,result,snapshot)));
  }catch(e){reply(e.status||503,{error:e.status?e.message:'云端服务暂时不可用，请稍后重试'});}
 });
}
