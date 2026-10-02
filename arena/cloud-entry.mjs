import cloudbase from '@cloudbase/node-sdk';
import {PersistentArenaStore,createCloudArenaServer} from './cloud-service.mjs';
if(!process.env.CLOUDBASE_APIKEY||!process.env.TCB_ENV)throw new Error('Missing production credentials');
const store=new PersistentArenaStore(cloudbase.init({env:process.env.TCB_ENV,accessKey:process.env.CLOUDBASE_APIKEY,timeout:8000}).rdb());
createCloudArenaServer(store,{origins:(process.env.ALLOWED_ORIGINS||'https://autochess.hanari520.cn').split(',')}).listen(9000,'0.0.0.0');
