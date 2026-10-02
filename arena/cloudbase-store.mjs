import { createRequire } from 'node:module';
import { RULESET } from './core.mjs';
import { PRESET_TEAMS } from './presets.mjs';

const TABLE='idol_arena_snapshots';
export class CloudBaseSnapshotStore {
 constructor(database){this.database=database;this.healthy=true;}
 async execute(query){try{const {data,error}=await query.abortSignal(AbortSignal.timeout(6000));if(error)throw new Error('snapshot query failed');this.healthy=true;return data;}catch{this.healthy=false;const error=new Error('CloudBase 阵容库暂时不可用，请稍后同步');error.status=503;throw error;}}
 async seed(){const rows=PRESET_TEAMS.map(s=>({id:s.id,ruleset:s.ruleset,round:s.round,owner_hash:'preset',source:'training',name:s.name,team:s.team,wins:0}));await this.execute(this.database.from(TABLE).upsert(rows,{onConflict:'id',ignoreDuplicates:true}));return rows.length;}
 async list(round,owner){const rows=await this.execute(this.database.from(TABLE).select('id,ruleset,round,owner_hash,source,name,team,wins').eq('ruleset',RULESET).eq('round',round).eq('source','player').neq('owner_hash',owner).order('created_at',{ascending:false}).limit(150));return (rows||[]).map(s=>({...s,owner:s.owner_hash}));}
 async training(round){const rows=await this.execute(this.database.from(TABLE).select('id,round,name,team').eq('ruleset',RULESET).eq('round',Math.min(30,round)).eq('source','training').limit(10));return rows||[];}
 async publish(snapshot){await this.execute(this.database.from(TABLE).upsert({id:snapshot.id,ruleset:snapshot.ruleset,round:snapshot.round,owner_hash:snapshot.owner,source:'player',name:snapshot.name||'旅人小队 '+snapshot.owner.slice(0,4),team:snapshot.team,wins:snapshot.wins},{onConflict:'id',ignoreDuplicates:true}));}
}
export function configuredSnapshotStore(){if(process.env.ARENA_SNAPSHOT_STORE!=='cloudbase-pg')return null;const env=process.env.TCB_ENV,accessKey=process.env.CLOUDBASE_APIKEY;if(!env||!accessKey)throw new Error('CloudBase 阵容存储需要服务端环境和 API Key');const require=createRequire(new URL('../server-online/package.json',import.meta.url));const cloudbase=require('@cloudbase/node-sdk');const app=cloudbase.init({env,accessKey,timeout:6000});return new CloudBaseSnapshotStore(app.rdb());}
