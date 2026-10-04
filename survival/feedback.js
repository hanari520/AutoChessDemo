(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SurvivalFeedback=api;
})(globalThis,function(){
  'use strict';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const LIMITS={particles:120,images:40,texts:28,rings:20};
  const FLASH=.075;
  function weaponMotion(kind,age){
    if(age<0||age>.34)return {reach:0,turn:0,scale:1};
    if(kind==='melee'){
      if(age<.09){const t=age/.09;return {reach:-9*t,turn:-.8*t,scale:1};}
      const t=clamp((age-.09)/.25,0,1),p=Math.sin(Math.PI*t);
      return {reach:46*p,turn:-.8*(1-t)+1.4*p,scale:1+.16*p};
    }
    if(age<.12)return {reach:-4*age/.12,turn:0,scale:1-.08*age/.12};
    const p=1-clamp((age-.12)/.18,0,1);
    return {reach:kind==='pulse'?0:-11*p,turn:0,scale:kind==='pulse'?1+.22*p:1};
  }
  function impact(weapon,boss=false){
    const force={blade:120,bow:90,wand:65,fan:55,mic:95,satellite:65,partner:55}[weapon]||65;
    return {speed:force*(boss?.22:1),duration:boss?.045:.095,hold:weapon==='blade'?.032:.02};
  }
  class Feedback {
    constructor(scene,audio,reduced=false){
      this.scene=scene;this.audio=audio;this.reduced=reduced;this.clock=0;
      this.ink=scene.add.graphics().setDepth(12);this.bars=scene.add.graphics().setDepth(9);
      this.particles=[];this.images=[];this.texts=[];this.rings=[];this.imagePool=[];this.textPool=[];this.holds=new Map();
      this.counts={shots:0,hits:0,kills:0,pickups:0,levels:0};this.nextShake=0;this.nextHold=0;this.pickupAmount=0;this.nextPickup=0;
    }
    burst(x,y,color,count=6,power=70){
      count=this.reduced?Math.ceil(count*.4):count;
      for(let i=0;i<count&&this.particles.length<LIMITS.particles;i++){
        const a=i/count*Math.PI*2+Math.random()*.45,speed=power*(.45+Math.random()*.55);
        this.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,color,life:.18+Math.random()*.12,age:0,size:1.5+Math.random()*1.5});
      }
    }
    ring(x,y,color,radius,life=.24){
      if(this.rings.length<LIMITS.rings)this.rings.push({x,y,color,radius,life,age:0});
    }
    image(key,x,y,size,rotation=0,life=.18,options={}){
      if(this.images.length>=LIMITS.images)return;
      let sprite=this.imagePool.find(p=>!p.visible);
      if(!sprite){if(this.imagePool.length>=LIMITS.images)return;sprite=this.scene.add.image(0,0,key).setDepth(11);this.imagePool.push(sprite);}
      sprite.setTexture(key).setPosition(x,y).setRotation(rotation).clearTint().setAlpha(options.alpha||.85).setVisible(true);
      if(options.color)sprite.setTint(options.color);
      const frame=sprite.frame,w=size,h=size*frame.realHeight/frame.realWidth;
      sprite.setDisplaySize(w,h);this.images.push({sprite,w,h,life,age:0,alpha:options.alpha||.85,vx:options.vx||0,vy:options.vy||0,grow:options.grow??.15});
    }
    number(x,y,value,color=0xfff4d2,size=16,label='',mergeId=null){
      let entry=this.texts.find(t=>t.merge===label&&t.mergeId===mergeId&&Math.abs(t.x-x)<28&&Math.abs(t.y-y)<35&&t.age<.08);
      if(entry&&label==='damage'){entry.value+=value;entry.sprite.setText(Math.ceil(entry.value));return;}
      if(this.texts.length>=LIMITS.texts)return;
      let sprite=this.textPool.find(p=>!p.visible);
      if(!sprite){if(this.textPool.length>=LIMITS.texts)return;sprite=this.scene.add.text(0,0,'',{fontFamily:'system-ui, Microsoft YaHei',fontStyle:'bold',stroke:'#18332c',strokeThickness:4}).setOrigin(.5).setDepth(15);this.textPool.push(sprite);}
      const text=label==='damage'?String(Math.ceil(value)):label||String(value);
      sprite.setText(text).setFontSize(size).setColor('#'+color.toString(16).padStart(6,'0')).setPosition(x,y).setAlpha(1).setScale(1.12).setVisible(true);
      this.texts.push({sprite,x,y,value,merge:label,mergeId,age:0,life:.55,dx:this.reduced?0:(Math.random()-.5)*22});
    }
    hold(sprite,duration){
      if(this.reduced||!sprite.anims||this.clock<this.nextHold)return;
      this.nextHold=this.clock+.14;sprite.anims.timeScale=0;this.holds.set(sprite,this.clock+duration);
    }
    shake(strength=.0015,duration=55){
      if(this.reduced||this.clock<this.nextShake)return;
      this.nextShake=this.clock+.35;this.scene.cameras.main.shake(duration,strength);
    }
    muzzle(x,y,angle,color,kind){
      this.counts.shots++;this.burst(x,y,color,kind==='bow'?3:5,48);
      this.image('fx-impact',x,y,kind==='mic'?42:28,angle,.095,{color,alpha:.65});
    }
    slash(x,y,angle,range,color){
      this.image('fx-slash',x+Math.cos(angle)*28,y+Math.sin(angle)*28,range*1.7,angle-Math.PI/4,.19,{alpha:this.reduced?.45:.78,grow:.08});
      this.burst(x+Math.cos(angle)*range*.8,y+Math.sin(angle)*range*.8,color,5,85);
    }
    pulse(x,y,range,color){this.ring(x,y,color,range,.24);this.ring(x,y,0xf0ffed,range*.75,.2);}
    hit(enemy,damage,angle,color,weapon,player){
      this.counts.hits++;enemy.hitUntil=this.clock+FLASH;enemy.barUntil=this.clock+.9;enemy.hitAngle=Math.sin(angle)*.12;
      enemy.setTintFill(0xfff6db);this.burst(enemy.x,enemy.y,color,damage>=25?7:4,90);
      this.image('fx-impact',enemy.x,enemy.y,damage>=25?43:29,angle,.13,{color,alpha:.85});
      this.number(enemy.x,enemy.y-enemy.displayHeight*.5,damage,damage>=25?0xffd580:0xfff4d2,damage>=25?20:16,'damage',enemy.serial);
      if(player&&weapon!=='partner')this.hold(player,impact(weapon,enemy.boss).hold);
      this.audio.sfx(weapon==='blade'?'impactBlade':weapon==='bow'?'bounce':'impactArc');
    }
    kill(enemy,angle,color){
      this.counts.kills++;this.burst(enemy.x,enemy.y,color,enemy.boss?18:8,enemy.boss?160:105);
      this.image(enemy.texture.key,enemy.x,enemy.y,enemy.displayWidth,angle*.12,.22,{grow:-.55,alpha:.7,vx:Math.cos(angle)*60,vy:Math.sin(angle)*60});
      this.ring(enemy.x,enemy.y,color,enemy.boss?85:27,.2);if(enemy.boss)this.shake(.003,130);
      this.audio.sfx('die');
    }
    pickup(x,y,amount){
      this.counts.pickups++;this.pickupAmount+=amount;this.pickupX=x;this.pickupY=y;
      this.burst(x,y,0xc5f898,3,35);this.audio.sfx('equip');
    }
    level(x,y,level){this.counts.levels++;this.ring(x,y,0xc4f99d,95,.38);this.number(x,y-55,level,0xc4f99d,21,'等级 '+level);this.burst(x,y,0xd8efac,14,130);}
    hurt(x,y,damage){this.number(x,y-40,damage,0xff9aa6,22,'-'+Math.ceil(damage));this.ring(x,y,0xff9aa6,40,.16);this.shake(.003,95);}
    trail(shot){
      if(this.clock<(shot.nextTrail||0)||this.particles.length>=LIMITS.particles)return;
      shot.nextTrail=this.clock+(this.reduced?.08:.04);
      this.particles.push({x:shot.x,y:shot.y,vx:-Math.cos(shot.rotation)*18,vy:-Math.sin(shot.rotation)*18,color:shot.color||0xc3ecdf,life:.13,age:0,size:shot.style==='bow'?2:1.5});
    }
    update(dt,clock,enemies,player){
      this.clock=clock;this.ink.clear();this.bars.clear();
      for(const [sprite,until] of this.holds)if(clock>=until||!sprite.active){if(sprite.anims)sprite.anims.timeScale=1;this.holds.delete(sprite);}
      if(this.pickupAmount&&clock>=this.nextPickup){this.number(this.pickupX,this.pickupY-27,this.pickupAmount,0xc9f99e,14,'+'+this.pickupAmount);this.pickupAmount=0;this.nextPickup=clock+.18;}
      this.particles=this.particles.filter(p=>{p.age+=dt;if(p.age>=p.life)return false;p.x+=p.vx*dt;p.y+=p.vy*dt;
        this.ink.lineStyle(p.size,p.color,(1-p.age/p.life)*.9).lineBetween(p.x,p.y,p.x-p.vx*.035,p.y-p.vy*.035);return true;});
      this.rings=this.rings.filter(p=>{p.age+=dt;const t=p.age/p.life;if(t>=1)return false;this.ink.lineStyle(t<.2?3:2,p.color,(1-t)*.75).strokeCircle(p.x,p.y,p.radius*(.18+.82*Math.sin(t*Math.PI/2)));return true;});
      this.images=this.images.filter(p=>{p.age+=dt;const t=p.age/p.life;if(t>=1){p.sprite.setVisible(false);return false;}
        const growth=1+p.grow*t;p.sprite.setPosition(p.sprite.x+p.vx*dt,p.sprite.y+p.vy*dt).setDisplaySize(p.w*growth,p.h*growth).setAlpha(p.alpha*(1-t));return true;});
      this.texts=this.texts.filter(p=>{p.age+=dt;const t=p.age/p.life;if(t>=1){p.sprite.setVisible(false);return false;}
        p.sprite.setPosition(p.x+p.dx*t,p.y-(this.reduced?12:32)*t).setScale(1+Math.max(0,.15*(1-t*5))).setAlpha(t<.6?1:(1-t)/.4);return true;});
      for(const e of enemies){if(!e.active)continue;
        if(clock>=(e.hitUntil||0)){e.clearTint();e.setRotation(0);}else if(!this.reduced)e.setRotation(e.hitAngle*Math.sin((e.hitUntil-clock)/FLASH*Math.PI));
        if(e.boss||clock<(e.barUntil||0)){const w=e.boss?85:36,y=e.y-e.displayHeight*.5-8,x=e.x-w/2;
          this.bars.fillStyle(0x18332c,.9).fillRoundedRect(x-1,y-1,w+2,5,2).fillStyle(e.boss?0xffcc8a:0xd7efae,1).fillRect(x,y,w*clamp(e.hp/e.maxHp,0,1),3);}
      }
    }
    releaseHolds(){
      this.holds.forEach((_,sprite)=>{if(sprite.anims)sprite.anims.timeScale=1;});this.holds.clear();
    }
    clear(){
      this.releaseHolds();
      this.imagePool.forEach(p=>p.setVisible(false));this.textPool.forEach(p=>p.setVisible(false));
      this.particles=[];this.images=[];this.texts=[];this.rings=[];this.pickupAmount=0;this.nextPickup=0;this.clock=0;this.nextShake=0;this.nextHold=0;
      this.ink.clear();this.bars.clear();
    }
    setReduced(value){this.reduced=Boolean(value);this.clear();}
    get active(){return {particles:this.particles.length,images:this.images.length,texts:this.texts.length,rings:this.rings.length};}
  }
  return {Feedback,weaponMotion,impact,LIMITS};
});
