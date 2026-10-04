(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./content.js'):root.SurvivalContent);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SurvivalSkills=api;
})(globalThis,function(Content){
  'use strict';
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  class Skills {
    constructor(scene,getRun,core,roster){this.scene=scene;this.getRun=getRun;this.core=core;this.roster=roster;this.ink=scene.add.graphics().setDepth(3);this.reset();}
    reset(){this.shield=0;this.shieldUntil=0;this.counter=0;this.wardColor=0x9ee5ff;this.buffUntil=0;this.buffHaste=0;this.zones=[];this.casters=[];this.hits=0;this.casts=0;this.rainCharges=0;this.ink.clear();}
    begin(){this.reset();const s=this.getRun();this.stats={...s.stats,...Object.fromEntries(Object.entries(Content.bonuses(s,this.roster).stats).map(([k,v])=>[k,(s.stats[k]||0)+v]))};
      this.casters=[this.scene.player,...this.scene.partnerSprites].map((sprite,i)=>({sprite,signature:Content.signature(i?s.companions[i-1]:s.hero),next:2+i*.8,hits:0,rank:i?1:s.skillRank,power:i?.45:1}));}
    haste(){return this.stats.haste+(this.scene.sim<this.buffUntil?this.buffHaste:0);}
    power(c){return (1+this.stats.skillPower/100)*(1+(c.rank-1)*.2)*c.power;}
    heal(amount){const s=this.getRun(),n=Math.max(0,Math.min(s.stats.maxHp-s.hp,amount*(1+this.stats.healBoost/100)));s.hp+=n;if(n>.05)this.scene.feedback.number(this.scene.player.x,this.scene.player.y-45,n,0xc5f6ad,15,'+'+n.toFixed(1));return n;}
    grantShield(amount,color=0x9ee5ff){const s=this.getRun(),old=this.shield;this.shield=Math.min(s.stats.maxHp*.65,this.shield+amount*(1+this.stats.shieldBoost/100));this.shieldUntil=this.scene.sim+5;this.wardColor=color;
      if(this.shield>old+.05){this.scene.feedback.ring(this.scene.player.x,this.scene.player.y,color,47,.3);this.scene.feedback.number(this.scene.player.x,this.scene.player.y-55,0,color,15,'护盾 +'+(this.shield-old).toFixed(1));}}
    incoming(raw){const sc=this.scene,s=this.getRun();
      if(this.rainCharges>0||(this.stats.dodge>0&&this.core.random(s)<Math.min(.45,this.stats.dodge/100))){if(this.rainCharges)this.rainCharges--;sc.feedback.number(sc.player.x,sc.player.y-45,0,0xaff0ff,18,'闪避');return 0;}
      const absorbed=Math.min(raw,this.shield);this.shield-=absorbed;
      if(absorbed>0){sc.feedback.number(sc.player.x,sc.player.y-45,0,this.wardColor,16,'格挡 '+absorbed.toFixed(1));sc.feedback.ring(sc.player.x,sc.player.y,this.wardColor,42,.18);
        if(this.counter>0)for(const e of this.targets(sc.player,150))this.damage(e,absorbed*this.counter,this.wardColor);}
      return raw-absorbed;
    }
    targets(origin,range=520){return this.scene.enemies.getChildren().filter(e=>e.active&&distance(origin,e)<range);}
    target(c){const list=this.targets(c.sprite,560),pick=c.signature.kit.target;
      list.sort((a,b)=>pick==='far'?distance(c.sprite,b)-distance(c.sprite,a):pick==='low'?a.hp-b.hp:pick==='hi'?b.hp-a.hp:distance(c.sprite,a)-distance(c.sprite,b));return list[0];}
    damage(e,amount,color,life=0){const n=this.scene.damageEnemy(e,amount,{weapon:'skill',color,proc:false});if(life>0&&n>0)this.heal(n*Math.min(.15,life));return n;}
    status(e,kit){if(!e.active)return;const t=this.scene.sim,scale=(1+this.stats.statusPower/100)*(e.boss?.25:1);
      const freeze=kit.freeze||kit.petrify||kit.stun||0;if(freeze)e.freezeUntil=Math.max(e.freezeUntil||0,t+Math.min(2.4,freeze)*scale);
      if(kit.slow){e.slowUntil=Math.max(e.slowUntil||0,t+(kit.slowDur||2)*scale);e.slowFactor=Math.min(e.slowFactor||1,1-Math.min(.65,kit.slow));}
      if(kit.silence||kit.manaBurn)e.silenceUntil=Math.max(e.silenceUntil||0,t+(kit.silence||1.5)*scale);
      const vulnerable=kit.wound||kit.sunder||kit.brittle||(kit.shred?kit.shred/100:0);if(vulnerable){e.vulnerable=Math.max(e.vulnerable||0,Math.min(.4,vulnerable));e.vulnerableUntil=Math.max(e.vulnerableUntil||0,t+2*scale);}
      if(kit.bleed){e.dot=Math.max(e.dot||0,Math.min(12,e.maxHp*kit.bleed));e.dotUntil=Math.max(e.dotUntil||0,t+(kit.bleedDur||2)*scale);e.dotNext=e.dotNext||t+.5;}
    }
    weaponHit(e,id,actual){const sc=this.scene,s=this.getRun(),effect=Content.WEAPONS[id]?.effect;
      if(effect==='wound')this.status(e,{wound:.15});if(effect==='slow')this.status(e,{slow:.4,slowDur:1.2});if(effect==='silence')this.status(e,{silence:1.2});if(effect==='stun')this.status(e,{stun:.28});
      if(effect==='bleed'){this.status(e,{bleed:.02,bleedDur:2});this.heal(actual*.04);}
      if(effect==='chain'){let last=e;const seen=new Set([e.serial]);for(let i=0;i<2;i++){const next=this.targets(last,130).filter(n=>!seen.has(n.serial)).sort((a,b)=>distance(last,a)-distance(last,b))[0];if(!next)break;seen.add(next.serial);this.beam(last,next,0xb3ed98);this.damage(next,actual*(.65**(i+1)),0xb3ed98);last=next;}}
      if(this.stats.lifesteal>0)this.heal(actual*Math.min(.2,this.stats.lifesteal/100));
      this.hits++;for(const c of this.casters){if(c.signature?.mode!=='passive')continue;c.hits++;const pid=c.signature.id,power=this.power(c),threshold=Math.max(2,Math.ceil((pid==='zhouyi'?5:pid==='yuji'?8:6)/power));if(c.hits<threshold)continue;c.hits=0;
        if(pid==='zhouyi')this.status(e,{sunder:Math.min(.4,.35*power)});
        else if(pid==='yuji')this.rainCharges=Math.min(2,this.rainCharges+1);
        else {this.heal(2.5*power);if(s.hp<s.stats.maxHp*.5)this.grantShield(3*power,c.signature.color);}
        c.sprite.pose.act('attack');sc.feedback.number(c.sprite.x,c.sprite.y-55,0,c.signature.color,14,c.signature.name);}}
    weaponRelease(id,tier){const effect=Content.WEAPONS[id]?.effect;if(effect==='shield')this.grantShield(2*(1+(tier-1)*.3));if(effect==='heal')this.heal(1+(tier-1)*.35);}
    beam(a,b,color){const sc=this.scene,count=sc.feedback.reduced?4:9;for(let i=0;i<=count;i++){const t=i/count;sc.feedback.burst(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,color,1,8);}}
    zone(c,target,damage){if(this.zones.length>=12)return;const k=c.signature.kit,radius=k.zone?90+(k.zone.r||1)*16:105;
      this.zones.push({x:target.x,y:target.y,radius,color:c.signature.color,damage,kit:k,next:this.scene.sim,until:this.scene.sim+Math.min(3.5,(k.zone?.dur||2700)/1000)});}
    cast(c,target){const sc=this.scene,s=this.getRun(),sig=c.signature,k=sig.kit,power=this.power(c),base=(11+s.level*1.2)*power,color=sig.color;
      this.casts++;c.sprite.pose.act(['slash','burst'].includes(sig.mode)?'attack':'cast');sc.feedback.number(c.sprite.x,c.sprite.y-58,0,color,c.power===1?16:13,sig.name);
      sc.feedback.image('fx-'+k.asset,c.sprite.x,c.sprite.y,90,0,.24,{color,alpha:.65});
      if(sig.mode==='guard'){this.grantShield(s.stats.maxHp*(k.shield||k.selfShield||.22)*power,color);this.counter=Math.max(this.counter,k.counter||k.thorns||.12);
        if(k.cleanse)sc.invulnerableUntil=Math.max(sc.invulnerableUntil,sc.sim+.3);return;}
      if(sig.mode==='heal'||sig.mode==='support'){const amount=(k.heal||.7)*4*power,healed=this.heal(amount);if(sig.mode==='heal')this.grantShield(Math.max(0,amount*(1+this.stats.healBoost/100)-healed)*.5+(k.shield||0)*s.stats.maxHp*power,color);
        else{this.buffHaste=Math.max(this.buffHaste,(k.haste||.12)*100*power);this.buffUntil=sc.sim+3;sc.feedback.pulse(c.sprite.x,c.sprite.y,95,color);if(k.zone)this.zone(c,c.sprite,base*(k.zone.dps||.18));}return;}
      if(!target)return;const angle=Math.atan2(target.y-c.sprite.y,target.x-c.sprite.x);
      const strike=(enemy,mult=1)=>{const execute=k.execute&&enemy.hp/enemy.maxHp<k.execute?1.65:1,low=k.lowHPBoost&&s.hp<s.stats.maxHp*.4?1+k.lowHPBoost:1;this.damage(enemy,base*mult*execute*low,color,k.lifesteal);this.status(enemy,k);};
      if(sig.mode==='single'){this.beam(c.sprite,target,color);strike(target,k.mult||1.8);if(k.bounce){const next=this.targets(target,150).find(e=>e!==target);if(next){this.beam(target,next,color);strike(next,.65);}}if(k.echo&&target.active)strike(target,k.echo);}
      else if(sig.mode==='chain'){const list=this.targets(c.sprite,560).sort((a,b)=>distance(c.sprite,a)-distance(c.sprite,b)).slice(0,k.targets||3);let from=c.sprite;
        list.forEach((e,i)=>{this.beam(from,e,color);strike(e,k.mults?.[i]||1/(1+i*.2));if(k.season)this.status(e,i%2?{slow:.35}:{wound:.15});from=e;});}
      else if(sig.mode==='zone'){strike(target,k.mult||1.5);this.zone(c,target,base*(k.zone?.dps||.3));sc.feedback.pulse(target.x,target.y,100,color);}
      else if(sig.mode==='chaos'){const list=this.targets(target,140);sc.feedback.pulse(target.x,target.y,140,color);const kit=[{freeze:.6},{wound:.3},{silence:2}][this.casts%3];list.forEach(e=>{strike(e,k.mult||2);this.status(e,kit);});}
      else {const range=sig.mode==='field'?280:sig.mode==='burst'?175:190,center=sig.mode==='slash'&&['dash','dashCleave'].includes(k.mode)?target:c.sprite;
        sc.feedback.slash(center.x,center.y,angle,range,color);if(sig.mode==='field'||sig.mode==='burst')sc.feedback.pulse(center.x,center.y,range,color);
        const list=this.targets(center,range);list.forEach(e=>{const a=Math.atan2(e.y-center.y,e.x-center.x);if(sig.mode==='slash'&&center===c.sprite&&Math.abs(Math.atan2(Math.sin(a-angle),Math.cos(a-angle)))>1.35)return;
          if(k.mults)k.mults.forEach(m=>strike(e,m));else for(let i=0;i<(k.hits||1);i++)strike(e,k.mult||1.5);if(k.pull&&e.active){e.knockX=Math.cos(a+Math.PI)*70;e.knockY=Math.sin(a+Math.PI)*70;}});}
    }
    update(dt){const sc=this.scene,t=sc.sim;this.ink.clear();if(t>=this.shieldUntil)this.shield=0;
      if(this.shield>0)this.ink.lineStyle(2,this.wardColor,.8).strokeCircle(sc.player.x,sc.player.y+3,34);
      for(const c of this.casters){if(!c.signature||c.signature.mode==='passive'||t<c.next)continue;const target=this.target(c),support=['guard','heal','support'].includes(c.signature.mode);if(!target&&!support)continue;c.next=t+c.signature.cooldown/(1+this.stats.skillHaste/100);this.cast(c,target);}
      this.zones=this.zones.filter(z=>t<z.until);for(const z of this.zones){this.ink.fillStyle(z.color,.09).fillCircle(z.x,z.y,z.radius).lineStyle(2,z.color,.45).strokeCircle(z.x,z.y,z.radius);
        if(t>=z.next){z.next=t+.5;for(const e of this.targets(z,z.radius)){this.damage(e,z.damage*.5,z.color);this.status(e,{slow:z.kit.slow||.25});}}}
      for(const e of sc.enemies.getChildren()){if(!e.active)continue;if(t<(e.freezeUntil||0))this.ink.lineStyle(2,0xa3eaff,.9).strokeCircle(e.x,e.y,e.displayWidth*.6);
        if(t<(e.silenceUntil||0))this.ink.lineStyle(2,0xccb7ff,.8).lineBetween(e.x-7,e.y-30,e.x+7,e.y-30);
        if(t<(e.dotUntil||0)&&t>=e.dotNext){e.dotNext=t+.5;this.damage(e,e.dot*.5,0xff9fb6);}if(t>=(e.slowUntil||0))e.slowFactor=1;if(t>=(e.vulnerableUntil||0))e.vulnerable=0;}
    }
  }
  return {Skills};
});
