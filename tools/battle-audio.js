/* Shared classic Web Audio voices, buses, throttling and mute preference. */
(function(root){
function create(adapter){
const $=id=>document.getElementById(id);
const V3_ASSET={blade:'assets/fx/v3-blade.png',arc:'assets/fx/v3-arc.png',ward:'assets/fx/v3-ward.png',void:'assets/fx/v3-void.png'};
let _actx=null, _sfxOn=true;
try{ _sfxOn = localStorage.getItem('vc_sfx')!=='0'; }catch(e){}
const SFX_BUS={ui:.5, battle:.42, global:.6};   // 分类音量总线（默认克制）
const SFX_DEF={
  buy:{t:'ui',f:[880,1318],dur:.10,type:'sine',vol:.5},          // 购买：清脆金币叮
  sell:{t:'ui',f:[520,340],dur:.13,type:'sine',vol:.45},     // 出售：金币回笼（低沉）
  roll:{t:'ui',f:[320,230],dur:.07,type:'sine',vol:.12}, // 刷新：轻纸声
  lvlup:{t:'ui',f:[440,660,880],dur:.28,type:'sine',vol:.45},// 买经验：上扬短音
  pop:{t:'ui',f:[392,523,659,784],dur:.45,type:'sine',vol:.5},// 人口升级：更隆重
  equip:{t:'ui',f:[1250,940],dur:.06,type:'sine',vol:.18},     // 装备穿戴：金属轻扣
  deploy:{t:'ui',f:[500,720],dur:.11,type:'sine',vol:.2}, // 一键上阵：唰
  tidy:{t:'ui',f:[520,660],dur:.09,type:'sine',vol:.2},            // 整理备战席：轻刷
  drag:{t:'ui',f:[700],dur:.045,type:'sine',vol:.16},            // 拿起棋子
  sellhint:{t:'ui',f:[900,1250],dur:.08,type:'sine',vol:.28},    // 进入出售区
  merge2:{t:'ui',f:[523,659,784],dur:.3,type:'sine',vol:.5},     // 2★ 升星琶音
  merge3:{t:'ui',f:[523,659,784,1046,1318],dur:.65,type:'sine',vol:.55}, // 3★ 长琶音
  cast:{t:'battle',f:[480,720],dur:.16,type:'sine',vol:.16,priority:1}, // 蓄力环：低音量预兆
  impactBlade:{t:'battle',f:[860,260],dur:.19,type:'sine',vol:.34,priority:3},
  impactArc:{t:'battle',f:[760,390],dur:.23,type:'sine',vol:.30,priority:3},
  impactWater:{t:'battle',f:[540,260],dur:.26,type:'sine',vol:.26,priority:3},
  impactPoison:{t:'battle',f:[230,135],dur:.28,type:'sine',vol:.24,priority:3},
  battleStart:{t:'global',f:[196,294,392],dur:.38,type:'sine',vol:.36,priority:4},
  slash:{t:'battle',f:[900,320],dur:.13,type:'sine',vol:.3},   // 斩击 whoosh
  spellFire:{t:'battle',f:[210,90],dur:.24,type:'sine',vol:.32}, // 爆裂
  spellIce:{t:'battle',f:[1500,950,620],dur:.22,type:'sine',vol:.28},          // 冰晶
  spellZap:{t:'battle',f:[1800,420],dur:.09,type:'sine',vol:.22},            // 电弧
  spellDark:{t:'battle',f:[300,150,80],dur:.3,type:'sine',vol:.3},// 暗雾
  heal:{t:'battle',f:[620,930],dur:.18,type:'sine',vol:.28},       // 治疗：柔和上扬
  shield:{t:'battle',f:[220,330],dur:.2,type:'sine',vol:.3},       // 护盾：能量罩嗡
  stunHit:{t:'battle',f:[150,80],dur:.15,type:'sine',vol:.32}, // 控制命中：闷响
  crit:{t:'battle',f:[1000,1650],dur:.1,type:'sine',vol:.42},    // 暴击：更响更高
  die:{t:'battle',f:[220,110],dur:.2,type:'sine',vol:.28},     // 死亡：低沉（限流防齐响）
  win:{t:'global',f:[523,659,784,1046],dur:.5,type:'sine',vol:.5,priority:5},   // 胜利 jingle
  lose:{t:'global',f:[420,300,200],dur:.5,type:'sine',vol:.45,priority:5},      // 失败 jingle
  finalWin:{t:'global',f:[523,659,784,1046,1318],dur:1.0,type:'sine',vol:.55,priority:5}, // 通关
  horn:{t:'global',f:[262,262,330],dur:.55,type:'sine',vol:.32},     // 野怪号角预警
  settle:{t:'global',f:[740],dur:.06,type:'sine',vol:.16},       // 回合结算轻提示
  splash:{t:'battle',f:[620,300],dur:.12,type:'sine',vol:.2},
  zone:{t:'battle',f:[240,360],dur:.5,type:'sine',vol:.24},
  rockcrack:{t:'battle',f:[180,110],dur:.18,type:'sine',vol:.3},
  dodgeleaf:{t:'battle',f:[900,1250],dur:.13,type:'sine',vol:.2},
  vampbite:{t:'battle',f:[300,170],dur:.12,type:'sine',vol:.16},
  bounce:{t:'battle',f:[840,640],dur:.08,type:'sine',vol:.15},
  bleat:{t:'battle',f:[560,420,520],dur:.3,type:'sine',vol:.26},
  stShenhai:{t:'global',f:[300,210],dur:.4,type:'sine',vol:.28},
  stXingji:{t:'global',f:[700,1050,1400],dur:.4,type:'sine',vol:.26},
  stMaorong:{t:'global',f:[160,240],dur:.3,type:'sine',vol:.26},
  stYinlv:{t:'global',f:[880,1174],dur:.25,type:'sine',vol:.26},
  stSixi:{t:'global',f:[196,262,196],dur:.3,type:'sine',vol:.26},
  stXueyuan:{t:'global',f:[420,560],dur:.15,type:'sine',vol:.2},
  stYemu:{t:'global',f:[180,120],dur:.5,type:'sine',vol:.26},
  stHuayu:{t:'global',f:[1046,1318],dur:.3,type:'sine',vol:.24},
  stModao:{t:'global',f:[140,90],dur:.4,type:'sine',vol:.28},
  stSenzhi:{t:'global',f:[400,600],dur:.25,type:'sine',vol:.2},
  stGongzao:{t:'global',f:[500,660],dur:.2,type:'sine',vol:.2},
  stPSP:{t:'global',f:[900,600],dur:.2,type:'sine',vol:.2},
  stDaoke:{t:'global',f:[700,520],dur:.2,type:'sine',vol:.26},
  stShouhu:{t:'global',f:[330,440],dur:.35,type:'sine',vol:.28},
  stGeshi:{t:'global',f:[660,880],dur:.35,type:'sine',vol:.26},
  stYouxia:{t:'global',f:[520,700],dur:.12,type:'sine',vol:.18},
  stFashi:{t:'global',f:[240,360,480],dur:.4,type:'sine',vol:.26},
  stZhoushu:{t:'global',f:[200,100],dur:.4,type:'sine',vol:.26},
  stCike:{t:'global',f:[1200,800],dur:.15,type:'sine',vol:.24},
  stKuangzhan:{t:'global',f:[150,100],dur:.35,type:'sine',vol:.28},
  stYizhe:{t:'global',f:[740,988],dur:.3,type:'sine',vol:.24},
  stOuxiang:{t:'global',f:[659,784,988],dur:.35,type:'sine',vol:.28},
};
const SFX_SKILL={cleave:'slash',dash:'slash',shred:'slash',rapid:'slash',
  fireball:'spellFire',burn:'spellFire',volley:'spellFire',
  frost:'spellIce',massfreeze:'spellIce',chain:'spellZap',sunder:'spellZap',break:'spellZap',sonic:'spellZap',
  purebolt:'spellDark',curse:'spellDark',hex:'spellDark',silence:'spellDark',masssilence:'spellDark',
  heal:'heal',aheal:'heal',cleanse:'heal',manafeed:'heal',
  shell:'shield',teamshield:'shield',guard:'shield',bulwark:'shield',tauntshield:'shield',
  petrify:'stunHit',massstun:'stunHit',slam:'stunHit'};
const _sfxLast={}; let _sfxVoices=0, _sfxSeed=0x19a4e317;
const _sfxActive=[];
const _sfxBuffers=new Map(),_sfxLoading=new Map();
const SFX_WAV_BANK=false;   // 2026-09-29 用户反馈生成音效太吵：停用 wav 音频库；SFX_DEF 全部统一为纯 sine 普通提示音（无 square/sawtooth/噪声层）；改 true 恢复 wav 库
const SFX_ASSET_ROOT='assets/audio/v3/';
function sfxAssetPath(key,unitId){
  if(unitId&&/^[a-zA-Z0-9]+$/.test(unitId))return SFX_ASSET_ROOT+'skills/'+unitId+'.wav';
  return SFX_ASSET_ROOT+'events/'+key+'.wav';
}
function warmSfxAsset(path,ctx=sfxCtx()){
  if(!SFX_WAV_BANK)return;
  if(!ctx||typeof fetch!=='function'||typeof ctx.decodeAudioData!=='function'||_sfxBuffers.has(path)||_sfxLoading.has(path))return;
  const pending=fetch(path).then(res=>res.ok?res.arrayBuffer():null)
    .then(data=>data?ctx.decodeAudioData(data):null)
    .then(buffer=>{if(buffer)_sfxBuffers.set(path,buffer);})
    .catch(()=>{}).finally(()=>_sfxLoading.delete(path));
  _sfxLoading.set(path,pending);
}
function warmSoundBank(unitIds=[]){
  const ctx=sfxCtx();if(!ctx)return;
  Object.keys(SFX_DEF).forEach(key=>warmSfxAsset(sfxAssetPath(key),ctx));
  [...new Set(unitIds)].forEach(id=>warmSfxAsset(sfxAssetPath('',id),ctx));
}
function sfxNoise(){ _sfxSeed=(_sfxSeed*1664525+1013904223)>>>0; return _sfxSeed/4294967296; }
function skillImpact(arch){ return SFX_SKILL[arch]||'impactArc'; }
function v3Impact(k,u){
  if(['guard','guardLink','teamShield'].includes(k.mode))return 'shield';
  if(['heal','team','support'].includes(k.mode))return 'heal';
  if(u.id==='sanli')return 'spellDark'; // 梦境连锁是柔和回响，不是电弧
  if(u.id==='sishi')return 'impactArc'; // 四季弹以变调脉冲表现
  if(u.id==='nana7mi')return 'impactWater';
  if(k.freeze||k.mode==='zone'&&k.zone?.slow)return 'spellIce';
  if(k.petrify||k.stun)return 'stunHit';
  if(k.mode==='field')return k.asset===V3_ASSET.void?'spellDark':'impactArc';
  if(k.mode==='zone')return 'zone';
  if(k.attackStyle==='blade'||['dash','dashCleave','cleave','combo'].includes(k.mode))return 'impactBlade';
  if(k.color&&/^(#67d4e8|#79e6d5|#7ed7d9)$/i.test(k.color))return 'impactWater';
  if(k.bleed||k.healBlock)return 'impactPoison';
  if(k.asset===V3_ASSET.void)return 'spellDark';
  if(k.mode==='chain'||k.attackStyle==='shot')return 'spellZap';
  if(k.mode==='chaos')return 'spellDark';
  return 'impactArc';
}
function skillSound(key,u,impactAtArrival=false){
  // 技能数值命中和主体 VFX 同步创建；charge 环持续 260ms 只是前景动画，
  // 不能把伤害声推到它结束。刀锋/爆裂首帧，护盾/治疗取扩张环早期主峰。
  const delay=key==='heal'?.07:key==='shield'?.06:key==='zone'?.03:
    key==='spellIce'?.045:key==='spellDark'?.04:key==='impactArc'?.035:0;
  sfx('cast',{scale:true});
  if(!impactAtArrival)sfx(key,{delay,scale:true,finishOnResult:true,unitId:u?.id});
}
function skillHitSound(key,u){
  sfx(key,{scale:true,finishOnResult:true,unitId:u?.id});
}
function sfxCtx(){
  if(_actx!==null) return _actx;
  try{ const AC=(typeof window!=='undefined')&&(window.AudioContext||window.webkitAudioContext);
    if(!AC) return (_actx=false); _actx=new AC(); }catch(e){ return (_actx=false); }
  return _actx;
}
function sfx(key,opt={}){
  if(adapter.silent?.()||!_sfxOn) return;
  const ctx=sfxCtx();
  if(!ctx||ctx.state!=='running') return;   // 无音频环境/无手势：静默 no-op
  const d=SFX_DEF[key]; if(!d) return;
  const now=ctx.currentTime;
  const when=now+Math.max(0,Number(opt.delay)||0)/(opt.scale?Math.max(1,adapter.speed()):1);
  const path=sfxAssetPath(key,opt.unitId),limitKey=opt.unitId?key+':'+opt.unitId:key;
  if(_sfxLast[limitKey]!=null && when-_sfxLast[limitKey]<.11) return;
  if(_sfxVoices>=8){
    const victim=_sfxActive.filter(v=>v.priority<(d.priority||2)).sort((a,b)=>a.priority-b.priority)[0];
    if(!victim)return;
    victim.stop();
  }
  const speed=opt.scale?Math.max(1,adapter.speed()):1;
  const dur=(d.dur||.1)/speed, vol=(d.vol||.3)*(SFX_BUS[d.t]||.5);
  const step=dur/Math.max(1,(d.f||[]).length);
  const event={priority:d.priority||2,bus:d.t,finishOnResult:!!opt.finishOnResult,sources:[],tail:null,until:0,ended:false,registered:false,stop(){
    if(this.ended)return; this.ended=true;
    if(this.registered)_sfxVoices=Math.max(0,_sfxVoices-1);
    const i=_sfxActive.indexOf(this);if(i>=0)_sfxActive.splice(i,1);
    this.sources.forEach(src=>{try{src.stop();}catch(e){}});
  }};
  try{
    const clip=_sfxBuffers.get(path);
    if(clip){
      const src=ctx.createBufferSource(),g=ctx.createGain();
      src.buffer=clip;
      if(src.playbackRate)src.playbackRate.value=speed;
      g.gain.value=Math.min(.32,vol*1.45);
      src.connect(g);g.connect(ctx.destination);
      const end=when+clip.duration/speed;
      src.start(when);src.stop(end+.01);event.sources.push(src);event.until=end+.01;event.tail=src;
    }else if(d.noise){   // 音频素材加载前的低延迟合成回退
      const len=Math.max(1,Math.ceil(ctx.sampleRate*dur));
      const buf=ctx.createBuffer(1,len,ctx.sampleRate), ch=buf.getChannelData(0);
      for(let i=0;i<len;i++) ch[i]=(sfxNoise()*2-1)*Math.pow(1-i/len,1.6);
      const src=ctx.createBufferSource(); src.buffer=buf;
      const g=ctx.createGain(); g.gain.value=vol*Math.min(1,d.noise);
      src.connect(g); g.connect(ctx.destination);
      const end=when+dur+.02;
      src.start(when); src.stop(end);event.sources.push(src);
      if(end>event.until){event.until=end;event.tail=src;}
    }
    if(!clip&&d.type && d.type!=='noise' && (d.f||[]).length){
      (d.f).forEach((f0,i)=>{
        const o=ctx.createOscillator(), g=ctx.createGain();
        o.type=d.type; o.frequency.value=Math.max(30,f0);
        const st=when+i*step*.62;
        g.gain.setValueAtTime(.0001,st);
        g.gain.exponentialRampToValueAtTime(Math.max(.001,vol), st+Math.min(.012,.012/speed));
        g.gain.exponentialRampToValueAtTime(.0001, st+step+.04);
        o.connect(g); g.connect(ctx.destination);
        const end=st+step+.06;
        o.start(st); o.stop(end);
        event.sources.push(o);
        if(end>event.until){event.until=end;event.tail=o;}
      });
    }
    if(!event.sources.length)return;
    event.tail.onended=()=>event.stop();
    _sfxActive.push(event);event.registered=true;_sfxVoices++;_sfxLast[limitKey]=when;
    if(!clip)warmSfxAsset(path,ctx);
    if(typeof window!=='undefined'){
      if(window.__sfxCount)window.__sfxCount[key]=(window.__sfxCount[key]||0)+1;
      if(window.__sfxPlayed!=null)window.__sfxPlayed++;
    }
  }catch(e){event.stop();}
}
/* 自动播放策略：首次用户手势 resume（此前静默不报错） */
if(typeof document!=='undefined' && document.addEventListener){
  const _sfxUnlock=()=>{ const c=sfxCtx(); if(c&&c.state==='suspended'){ try{c.resume();}catch(e){} } warmSoundBank(); };
  document.addEventListener('pointerdown',_sfxUnlock,{passive:true});
  document.addEventListener('keydown',_sfxUnlock,{passive:true});
}
function paintSfxBtn(){ const b=$('sfxBtn'); if(!b) return; b.textContent='音效'; b.title=_sfxOn?'音效：开（点击静音，状态本地保存）':'音效：关（点击开启，状态本地保存）'; b.setAttribute('aria-label',b.title); b.classList.toggle('on',_sfxOn); }
function toggleSfx(){ _sfxOn=!_sfxOn; if(!_sfxOn)_sfxActive.slice().forEach(e=>e.stop()); try{ localStorage.setItem('vc_sfx', _sfxOn?'1':'0'); }catch(e){} paintSfxBtn(); }
function stopBattle(){_sfxActive.filter(e=>e.bus==='battle'&&!e.finishOnResult).forEach(e=>e.stop());}
return {sfx,sfxCtx,warmSoundBank,skillImpact,v3Impact,skillSound,skillHitSound,paintSfxBtn,toggleSfx,stopBattle,definitions:SFX_DEF,get enabled(){return _sfxOn;},get voices(){return _sfxVoices;}};
}
root.ClassicBattleAudio={create};
})(globalThis);
