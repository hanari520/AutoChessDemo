const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const A=require('./actors.js');

function sprite(){
  const s=new EventEmitter();s.plays=[];s.anims={paused:false,pause(){this.paused=true;},resume(){this.paused=false;}};
  s.play=(key,ignore)=>{if(!ignore||s.current!==key)s.plays.push(key);s.current=key;return s;};return s;
}
test('all 50 characters have six real sheets and exactly 44 frames',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'animations.json')));
  const roster=JSON.parse(fs.readFileSync(path.join(__dirname,'roster.json')));
  assert.equal(Object.keys(manifest.characters).length,50);
  assert.deepEqual(manifest.frameSize,[256,256]);
  for(const hero of roster){
    const actions=manifest.characters[hero.id].actions;
    assert.deepEqual(Object.keys(actions),['idle','move','attack','cast','hit','death']);
    assert.equal(Object.values(actions).reduce((n,a)=>n+a.count,0),44);
    for(const [action,spec] of Object.entries(actions)){
      assert.equal(spec.loop,['idle','move'].includes(action));assert.ok(spec.fps>0);
      assert.ok(fs.statSync(path.join(__dirname,'..',spec.path)).size>0);
      assert.match(spec.sourceSha256,/^[a-f0-9]{64}$/);
    }
  }
});
test('movement loops do not restart; attack returns to current movement',()=>{
  const s=sprite(),pose=new A.Pose(s,'ein');pose.move(true);pose.move(true);
  assert.deepEqual(s.plays,['actor-ein-idle','actor-ein-move']);
  assert.equal(pose.act('attack'),true);assert.equal(pose.act('cast'),false);
  pose.move(false);assert.equal(s.current,'actor-ein-attack');
  s.emit('animationcomplete');assert.equal(s.current,'actor-ein-idle');
});
test('hit interrupts an attack; death freezes the last pose until a new run',()=>{
  const s=sprite(),pose=new A.Pose(s,'yua');pose.act('cast');pose.act('hit');assert.equal(s.current,'actor-yua-hit');
  pose.move(true);s.emit('animationcomplete');assert.equal(s.current,'actor-yua-move');
  pose.act('death');s.emit('animationcomplete');pose.move(true);assert.equal(pose.act('hit'),false);assert.equal(s.current,'actor-yua-death');
  pose.rest();assert.equal(s.current,'actor-yua-idle');assert.equal(pose.dead,false);
});
test('pause freezes sprite animation; listeners detach on character replacement',()=>{
  const s=sprite(),pose=new A.Pose(s,'ein');pose.pause(true);assert.equal(s.anims.paused,true);
  pose.pause(false);assert.equal(s.anims.paused,false);pose.destroy();assert.equal(s.listenerCount('animationcomplete'),0);
});
