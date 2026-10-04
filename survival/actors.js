(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SurvivalActors=api;
})(globalThis,function(){
  'use strict';
  const key=(id,action)=>`actor-${id}-${action}`;
  // One-shot poses own the sprite until completion; weapons never restart a pose.
  class Pose {
    constructor(sprite,id){
      this.sprite=sprite;this.id=id;this.motion='idle';this.locked=false;this.dead=false;
      this.complete=()=>{if(this.dead)return;this.locked=false;this.sprite.play(key(this.id,this.motion),true);};
      sprite.on('animationcomplete',this.complete);sprite.play(key(id,'idle'));
    }
    move(moving){this.motion=moving?'move':'idle';if(!this.locked&&!this.dead)this.sprite.play(key(this.id,this.motion),true);}
    act(action){
      if(this.dead||(this.locked&&action!=='hit'&&action!=='death'))return false;
      this.dead=action==='death';this.locked=true;this.sprite.play(key(this.id,action));return true;
    }
    rest(){this.dead=false;this.locked=false;this.motion='idle';this.sprite.anims.resume();this.sprite.play(key(this.id,'idle'));}
    pause(paused){this.sprite.anims[paused?'pause':'resume']();}
    destroy(){this.sprite.off('animationcomplete',this.complete);}
  }
  function register(scene,manifest,id){
    for(const [action,spec] of Object.entries(manifest.characters[id].actions)){
      const name=key(id,action);
      if(!scene.anims.exists(name))scene.anims.create({key:name,frames:scene.anims.generateFrameNumbers(name,{start:0,end:spec.count-1}),frameRate:spec.fps,repeat:spec.loop?-1:0});
    }
  }
  function load(scene,manifest,ids){
    const pending=[...new Set(ids)].filter(id=>!scene.textures.exists(key(id,'idle')));
    if(!pending.length)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const failed=[];
      const onError=file=>failed.push(file.key);
      scene.load.on('loaderror',onError);
      scene.load.once('complete',()=>{
        scene.load.off('loaderror',onError);
        if(failed.length){
          for(const id of pending)for(const action of Object.keys(manifest.characters[id].actions))if(scene.textures.exists(key(id,action)))scene.textures.remove(key(id,action));
          reject(new Error('动作素材加载失败：'+failed.join(', ')));return;
        }
        pending.forEach(id=>register(scene,manifest,id));resolve();
      });
      for(const id of pending)for(const [action,spec] of Object.entries(manifest.characters[id].actions))scene.load.spritesheet(key(id,action),spec.path,{frameWidth:manifest.frameSize[0],frameHeight:manifest.frameSize[1],endFrame:spec.count-1});
      scene.load.start();
    });
  }
  function retain(scene,manifest,ids){
    const keep=new Set(ids);
    for(const id of Object.keys(manifest.characters))if(!keep.has(id))for(const action of Object.keys(manifest.characters[id].actions)){
      const name=key(id,action);if(scene.anims.exists(name))scene.anims.remove(name);if(scene.textures.exists(name))scene.textures.remove(name);
    }
  }
  return {key,Pose,register,load,retain};
});
