import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(new URL('./battle-presentation.js',import.meta.url),'utf8'),context);
const shared=context.ClassicBattlePresentation;
test('both modes load the same presentation module and all 50 classic gestures',()=>{
  assert.equal(Object.keys(shared.actions).length,50);
  const classic=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const online=fs.readFileSync(new URL('../online/battle-effects.js',import.meta.url),'utf8');
  assert.ok(classic.includes('ClassicBattlePresentation.create('));
  assert.ok(online.includes('ClassicBattlePresentation.create('));
  for(const id of Object.keys(shared.actions))assert.match(shared.actions[id][0],/^(brace|skate|cast|aim|stomp|bloom|wave|leap|sweep|strike|veil|spin)$/);
});
test('projectile and slash assets retain classic special cases',()=>{
  const renderer=shared.create({speed:()=>1,scale:()=>1});
  assert.equal(renderer.skillArt('yua','flight'),null);
  assert.equal(renderer.skillArt('yua','impact'),'assets/skill_projectiles/yua-impact.webp');
  assert.equal(renderer.skillArt('mahiru','slash'),'assets/skill_slashes/mahiru-slash.svg');
  assert.equal(renderer.skillArt('chiharu','slash'),'assets/skill_slashes/chiharu-slash.webp');
});
test('signature rotation and timing are the classic stable ID formula',()=>{
  const id='rinco';let hash=0;for(const char of id)hash=(hash*31+char.charCodeAt(0))>>>0;
  const actual=shared.signature(id,{glyph:'✦',color:'#abcdef'});
  assert.equal(actual.rot,(hash%37)-18);
  assert.equal(actual.dur,(.66+(hash%5)*.07).toFixed(2));
  assert.equal(actual.color,'#abcdef');
});
