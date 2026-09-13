/* 羁绊结构性体检（tools/syn_check.js）：解析 index.html 的 UNITS/FACTIONS/CLASSES，
   对 22 个羁绊（12 阵营 + 10 职业）检查——
   ① 低费入门子（1-2 费至少 1 名）② 中后期成长位（3-5 费至少 1 名）
   ③ 档位需求合理性（T1 需求 ≤ 总人数 60%；满编档 = need === 总人数，容错 0）
   ④ 前排覆盖（成员中是否有 守护/狂战/刀客）
   ⑤ 阵营/职业拼写自洽校验
   用法：node tools/syn_check.js */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ---- 解析棋子表 ---- */
const unitRe = /\{id:'(\w+)',\s*name:'([^']*)',\s*cost:(\d),\s*fac:'([^']+)',\s*job:'([^']+)'/g;
const units = [];
for (const m of src.matchAll(unitRe)) {
  units.push({ id: m[1], name: m[2], cost: +m[3], fac: m[4], job: m[5] });
}

/* ---- 解析羁绊表（按代码块切分，避免误抓其他对象） ---- */
const facBlk = (src.match(/const FACTIONS = \{([\s\S]*?)\n\};/) || [])[1] || '';
const clsBlk = (src.match(/const CLASSES = \{([\s\S]*?)\n\};/) || [])[1] || '';
const tierRe = /'([^']+)':\s*\{need:\[([\d,]+)\]/g;
function parseTiers(blk) {
  const out = {};
  for (const t of blk.matchAll(tierRe)) out[t[1]] = t[2].split(',').map(Number);
  return out;
}
const FACTIONS = parseTiers(facBlk);
const CLASSES = parseTiers(clsBlk);

/* ---- 体检 ---- */
const FRONT = new Set(['守护', '狂战', '刀客']);
const rows = [];
let problemCount = 0;
function audit(name, need, isJob) {
  const mem = units.filter(u => isJob ? u.job === name : u.fac === name);
  if (!mem.length) { rows.push({ name, isJob, grade: '✗', members: '0人', tiers: '-', flags: '❌ 无成员棋子！' }); problemCount++; return; }
  const costs = mem.map(u => u.cost).sort((a, b) => a - b);
  const flags = [];
  if (!costs.some(c => c <= 2)) flags.push('无1-2费入门子');
  if (!costs.some(c => c >= 3)) flags.push('无3-5费成长位');
  if (need[0] / mem.length > 0.6) flags.push(`T1需${need[0]}人=${Math.round(need[0]/mem.length*100)}%总人数`);
  need.forEach((n, i) => { if (n >= mem.length) flags.push(`T${i + 1}=满编(${n}/${mem.length})`); });
  if (!mem.some(u => FRONT.has(u.job))) flags.push('无前排职业');
  // 拼写自洽：每个成员的阵营/职业都要在羁绊表里能找到
  mem.forEach(u => {
    if (!FACTIONS[u.fac]) flags.push(`⚠ ${u.id}阵营'${u.fac}'无羁绊定义`);
    if (!CLASSES[u.job]) flags.push(`⚠ ${u.id}职业'${u.job}'无羁绊定义`);
  });
  const grade = flags.length ? '✗' : '✓';
  if (flags.length) problemCount++;
  rows.push({ name, isJob, grade, members: `${mem.length}人[${costs.join(',')}]`, tiers: need.join('/'), flags: flags.join('；') || '—' });
}
Object.keys(FACTIONS).forEach(k => audit(k, FACTIONS[k], false));
Object.keys(CLASSES).forEach(k => audit(k, CLASSES[k], true));

/* ---- 输出 ---- */
console.log(`棋子总数=${units.length}（应为46） 阵营=${Object.keys(FACTIONS).length} 职业=${Object.keys(CLASSES).length}（应为 12+10）`);
for (const r of rows) {
  console.log(`${r.grade} ${r.name.padEnd(5)} [${r.isJob ? '职业' : '阵营'}] ${r.members.padEnd(14)} 档:${r.tiers.padEnd(6)} ${r.flags}`);
}
console.log(`\n结论：${problemCount} 个羁绊存在结构问题`);
