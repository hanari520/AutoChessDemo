/* 羁绊结构性体检（tools/syn_check.js）：解析 index.html 的 UNITS/FACTIONS/CLASSES，
   对 22 个羁绊（12 阵营 + 10 职业）检查——
   ✗ 真问题：① 无成员 ② 有1-2费入门子（第1回合商店刷得出） ③ 档位不可达（need > 成员数）
   ⑤ 阵营/职业拼写自洽
   ℹ 参考：无3-5费成长位、满编档、T1占比、无前排职业（刀塔小羁绊/后排 archetype 属正常）
   支持刀塔式双标签 fac2/job2。
   用法：node tools/syn_check.js */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ---- 解析棋子表（含双标签 fac2/job2，刀塔式兼职） ---- */
const unitRe = /\{id:'(\w+)',\s*name:'([^']*)',\s*cost:(\d),\s*fac:'([^']+)',\s*job:'([^']+)'(?:,\s*fac2:'([^']+)')?(?:,\s*job2:'([^']+)')?/g;
const units = [];
for (const m of src.matchAll(unitRe)) {
  units.push({ id: m[1], name: m[2], cost: +m[3], fac: m[4], job: m[5], fac2: m[6] || null, job2: m[7] || null });
}
const facsOf = u => u.fac2 ? [u.fac, u.fac2] : [u.fac];
const jobsOf = u => u.job2 ? [u.job, u.job2] : [u.job];

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

/* ---- 体检（判定规则对齐刀塔自走棋：T1 可以达 67%/75%、T2 可以满编，
   因为刀塔自身就有 龙2/3、地精3/4、兽人T3=6/6 这类设计；只把「不可达档位」与
   「无低费入门子」当问题，其余作参考信息） ---- */
const FRONT = new Set(['守护', '狂战', '刀客']);
const rows = [];
let problemCount = 0;
function audit(name, need, isJob) {
  const mem = units.filter(u => isJob ? jobsOf(u).includes(name) : facsOf(u).includes(name));
  if (!mem.length) { rows.push({ name, isJob, grade: '✗', members: '0人', tiers: '-', flags: '❌ 无成员棋子！' }); problemCount++; return; }
  const costs = mem.map(u => u.cost).sort((a, b) => a - b);
  const flags = [], notes = [];
  if (!costs.some(c => c <= 2)) flags.push('无1-2费入门子');            // 真问题：第 1 回合商店刷不出
  if (!costs.some(c => c >= 3)) notes.push('无3-5费成长位');
  need.forEach((n, i) => { if (n > mem.length) flags.push(`T${i + 1}需${n}人>成员${mem.length}(不可达)`); });
  need.forEach((n, i) => { if (n === mem.length) notes.push(`T${i + 1}=满编(${n}/${mem.length})`); });
  if (need[0] / mem.length > 0.67) notes.push(`T1需${need[0]}人=${Math.round(need[0] / mem.length * 100)}%`);
  if (!mem.some(u => jobsOf(u).some(j => FRONT.has(j)))) notes.push('无前排职业');
  // 拼写自洽：每个成员的每个标签都要在羁绊表里能找到
  mem.forEach(u => {
    facsOf(u).forEach(f => { if (!FACTIONS[f]) flags.push(`⚠ ${u.id}阵营'${f}'无羁绊定义`); });
    jobsOf(u).forEach(j => { if (!CLASSES[j]) flags.push(`⚠ ${u.id}职业'${j}'无羁绊定义`); });
  });
  const grade = flags.length ? '✗' : '✓';
  if (flags.length) problemCount++;
  const detail = [flags.join('；'), notes.length ? 'ℹ' + notes.join('；') : ''].filter(Boolean).join(' | ') || '—';
  rows.push({ name, isJob, grade, members: `${mem.length}人[${costs.join(',')}]`, tiers: need.join('/'), flags: detail });
}
Object.keys(FACTIONS).forEach(k => audit(k, FACTIONS[k], false));
Object.keys(CLASSES).forEach(k => audit(k, CLASSES[k], true));

/* ---- 输出 ---- */
console.log(`棋子总数=${units.length}（应为50） 阵营=${Object.keys(FACTIONS).length} 职业=${Object.keys(CLASSES).length}（应为 12+10）`);
const dual = units.filter(u=>u.fac2||u.job2);
console.log(`双标签棋子=${dual.length}：${dual.map(u=>u.name+(u.fac2?'/'+u.fac2:'')+(u.job2?'/'+u.job2:'')).join('、')||'无'}`);
for (const r of rows) {
  console.log(`${r.grade} ${r.name.padEnd(5)} [${r.isJob ? '职业' : '阵营'}] ${r.members.padEnd(14)} 档:${r.tiers.padEnd(6)} ${r.flags}`);
}
console.log(`\n结论：${problemCount} 个羁绊存在结构问题`);
