import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {games,selectGames} from './catalog.mjs';

test('all eight playable entries and their artwork exist and IDs are unique',()=>{
  assert.equal(games.length,8);
  assert.equal(new Set(games.map(g=>g.id)).size,games.length);
  for(const g of games){
    const entry=g.entry.endsWith('/')?g.entry+'index.html':g.entry;
    assert.ok(existsSync(new URL('../'+entry,import.meta.url)),entry);
    assert.ok(existsSync(new URL('../'+g.art,import.meta.url)),g.art);
    for(const id of g.cast)assert.ok(existsSync(new URL(`../assets/units_big/${id}.webp`,import.meta.url)),id);
  }
});
test('search combines character names and gameplay terms with categories',()=>{
  assert.deepEqual(selectGames(games,{query:'工作室 岁己'}).map(g=>g.id),['studio-manager']);
  assert.deepEqual(selectGames(games,{query:'  rPg ',category:'动作冒险'}).map(g=>g.id),['rpg']);
  assert.equal(selectGames(games,{query:'不存在的游戏'}).length,0);
  assert.equal(selectGames(games,{category:'策略对战'}).length,3);
});
test('favorites and recent lists filter by real games and preserve recent order',()=>{
  assert.deepEqual(selectGames(games,{tab:'favorites',favorites:['rpg','classic','unknown']}).map(g=>g.id),['classic','rpg']);
  assert.deepEqual(selectGames(games,{tab:'recent',recent:['online','studio-manager','classic']}).map(g=>g.id),['online','studio-manager','classic']);
  assert.equal(selectGames(games,{tab:'favorites'}).length,0);
});
test('root and library alias use the same hall and classic remains separate',()=>{
  for(const path of ['../index.html','../library/index.html']){
    const html=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.match(html,/hall\/app.mjs/);
    assert.match(html,/id="game-library"/);
    assert.doesNotMatch(html,/const UNITS/);
  }
  assert.match(readFileSync(new URL('../classic.html',import.meta.url),'utf8'),/const UNITS/);
});
