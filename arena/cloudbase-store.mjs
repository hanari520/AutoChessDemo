import { createRequire } from 'node:module';
import { RULESET } from './core.mjs';
import { presetsFor } from './presets.mjs';

const TABLE='idol_arena_snapshots';
export class CloudBaseSnapshotStore {
 constructor(database){this.database=database;this.healthy=true;this.pools=new Map();}
 async execute(query){try{const {data,error}=await query.abortSignal(AbortSignal.timeout(6000));if(error)throw new Error('snapshot query failed');this.healthy=true;return data;}catch{this.healthy=false;const error=new Error('CloudBase 阵容库暂时不可用，请稍后同步');error.status=503;throw error;}}
 async list(round,owner){
  let entry=this.pools.get(round);
  if(!entry||entry.until<Date.now()){
   entry={until:Date.now()+60000,promise:this.execute(this.database.from(TABLE).select('id,ruleset,round,owner_hash,source,name,team,wins').eq('ruleset',RULESET).eq('round',round).eq('source','player').order('created_at',{ascending:false}).limit(40))};this.pools.set(round,entry);
   if(this.pools.size>32)this.pools.delete(this.pools.keys().next().value);
   try{entry.rows=(await entry.promise||[]).map(s=>({...s,owner:s.owner_hash}));}catch(e){if(this.pools.get(round)===entry)this.pools.delete(round);throw e;}
  }
  const rows=entry.rows||(await entry.promise||[]).map(s=>({...s,owner:s.owner_hash}));return rows.filter(s=>s.owner!==owner);
 }
 async training(round){return presetsFor(round);}
 async publish(snapshot){await this.execute(this.database.from(TABLE).upsert({id:snapshot.id,ruleset:snapshot.ruleset,round:snapshot.round,owner_hash:snapshot.owner,source:'player',name:snapshot.name||'旅人小队 '+snapshot.owner.slice(0,4),team:snapshot.team,wins:snapshot.wins},{onConflict:'id',ignoreDuplicates:true}));const entry=this.pools.get(snapshot.round);if(entry?.rows&&!entry.rows.some(s=>s.id===snapshot.id)){entry.rows.unshift(structuredClone(snapshot));entry.rows=entry.rows.slice(0,40);}}
}
export function configuredSnapshotStore(){if(process.env.ARENA_SNAPSHOT_STORE!=='cloudbase-pg')return null;const env=process.env.TCB_ENV,accessKey=process.env.CLOUDBASE_APIKEY;if(!env||!accessKey)throw new Error('CloudBase 阵容存储需要服务端环境和 API Key');const require=createRequire(new URL('../server-online/package.json',import.meta.url));const cloudbase=require('@cloudbase/node-sdk');const app=cloudbase.init({env,accessKey,timeout:6000});return new CloudBaseSnapshotStore(app.rdb());}
