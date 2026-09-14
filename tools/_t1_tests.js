/* Phase 1 断言测试：近战前排优先 / 阵型轮换 / 整理备战席同名相邻 / 开战自动补位。
   由 sim.js 以 T1=1 调起（node 语法：T1=1 node tools/sim.js），复用其 DOM 桩与 API 导出。 */
module.exports.run = function (A) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ✓ ' + msg); };
  const mk = (id, star) => ({ uid: A.S.uid++, id, star: star || 1, sks: 1, hp: 100, maxhp: 100, atk: 10, items: [] });
  const freshBoard = () => Array(64).fill(null);
  const posOf = (board, uid) => { const i = board.indexOf(board.find(u => u && u.uid === uid)); return i < 0 ? null : [i % 8, Math.floor(i / 8)]; };
  const rowOf = (board, uid) => { const p = posOf(board, uid); return p ? p[1] : -1; };

  /* ---------- a. 近战前排优先（我方） ---------- */
  console.log('[a] placeFormation 近战前排优先（我方 rows=[4,5,6,7]）');
  globalThis.newGame();
  {
    const team = [mk('tiandou'), mk('sanli'), mk('shadow'), mk('ein'), mk('chiharu'), mk('aza')];
    // ein=守护 band0, chiharu=刀客 band1, aza=狂战 band1, tiandou=歌势 band2, sanli=法师 band3, shadow=刺客 band4
    const b = freshBoard();
    globalThis.placeFormation(b, [4, 5, 6, 7], team);
    ok(rowOf(b, team[3].uid) === 4 && rowOf(b, team[4].uid) === 4 && rowOf(b, team[5].uid) === 4,
      '守护(ein)/刀客(chiharu)/狂战(aza) 全部从第 4 行（我方最前排）起步: ' + [3, 4, 5].map(i => rowOf(b, team[i].uid)).join(','));
    ok(rowOf(b, team[0].uid) === 5 && rowOf(b, team[1].uid) === 5, '歌势/法师 从第 5 行起步（中排不空置）');
    ok(rowOf(b, team[2].uid) === 7, '刺客保持最后一排（第 7 行）');
    // 近战 >8 人时溢出到第 5 行
    const many = ['ein', 'chiharu', 'aza', 'goutan', 'kanban', 'sumi', 'haruka', 'lianshiye', 'miyue'].map(id => mk(id));
    const b2 = freshBoard();
    globalThis.placeFormation(b2, [4, 5, 6, 7], many);
    const rowsM = many.map(u => rowOf(b2, u.uid)).sort();
    ok(rowsM.filter(r => r === 4).length === 8 && rowsM[8] === 5, '9 名近战：8 人填满第 4 行、第 9 人溢出第 5 行');
  }

  /* 整队无近战：远程前移补位 */
  console.log('[a2] 整队无近战 → 远程从第 4 行铺起');
  {
    const team = [mk('tiandou'), mk('diansu'), mk('pako'), mk('sishi'), mk('sanli'), mk('huize'), mk('shengge'), mk('kroya'), mk('huali')];
    const b = freshBoard();
    globalThis.placeFormation(b, [4, 5, 6, 7], team);
    const rows = team.map(u => rowOf(b, u.uid)).sort();
    ok(rows[0] === 4 && rows.filter(r => r === 4).length >= 8, '无近战时远程铺满第 4 行（前排不空置）');
  }

  /* ---------- 双向验证：敌方 rows=[3,2,1,0] ---------- */
  console.log('[a3] 敌方布阵双向验证（genEnemy rows=[3,2,1,0]）');
  {
    // 确定性：直接用敌方行序布阵
    const team = [mk('sanli'), mk('shadow'), mk('ein'), mk('chiharu'), mk('aza'), mk('tiandou')];
    const b = freshBoard();
    globalThis.placeFormation(b, [3, 2, 1, 0], team);
    ok([2, 3, 4].map(i => rowOf(b, team[i].uid)).every(r => r === 3), '敌方守护/刀客/狂战顶到第 3 行（贴中线）');
    ok(rowOf(b, team[5].uid) === 2 && rowOf(b, team[0].uid) === 2, '敌方法系/辅助在第 2 行（不占第一排）');
    ok(rowOf(b, team[1].uid) === 0, '敌方刺客在 row0（其最后一排）');
    // 随机局扫描：非野怪回合，有近战则必在第 3 行；无近战则远程顶上第 3 行
    globalThis.newGame();
    let scanned = 0, bad = [];
    for (let r = 1; r <= 24; r++) {
      if (r % 5 === 0) continue;   // 野怪回合有 2×2 头目让位，单独跳过
      A.S.round = r; globalThis.prepEnemy();
      const eb = A.S.enemyBoard, foes = eb.filter(Boolean);
      const front = foes.filter(u => [0, 1].includes(globalThis.unitBand(u)));
      const atRow3 = foes.filter(u => Math.floor(eb.indexOf(u) / 8) === 3);
      if (front.length) {
        if (!front.every(u => Math.floor(eb.indexOf(u) / 8) === 3)) bad.push('r' + r + ' 近战未顶前排');
      } else {
        if (!atRow3.length) bad.push('r' + r + ' 无近战但第 3 排空置');
      }
      scanned++;
    }
    ok(!bad.length && scanned >= 19, scanned + ' 个回合扫描：敌方近战必在第 3 行/无近战远程顶上（' + (bad.join(';') || '无异常') + '）');
  }

  /* ---------- b. 阵型轮换 ---------- */
  console.log('[b] 一键上阵阵型轮换（连续 4 次列展开不同）');
  {
    globalThis.newGame();
    const roster = ['ein', 'chiharu', 'aza', 'tiandou', 'diansu', 'shadow'].map(id => mk(id));
    A.S.bench = Array(8).fill(null); roster.forEach((u, i) => A.S.bench[i] = u);
    A.S.board = freshBoard(); A.S.lvl = 6;
    const layouts = [];
    for (let k = 0; k < 4; k++) {
      globalThis.autoDeployBest();
      layouts.push(roster.map(u => posOf(A.S.board, u.uid).join(',')).join('|'));
    }
    const uniq = new Set(layouts);
    ok(uniq.size >= 3, '连续 4 次布阵出现 ≥3 种不同列阵型（实际 ' + uniq.size + ' 种）');
    // 梯队行分配不变：近战仍在第 4 行
    const melee = roster.filter(u => ['ein', 'chiharu', 'aza'].includes(u.id));
    ok(melee.every(u => rowOf(A.S.board, u.uid) === 4), '轮换后近战仍在第 4 行（行分配不变）');
    ok(A.S.board.filter(Boolean).length === 6, '布阵后场上 6 人（人口打满）');
    // autoDeploy（只补位不换人）同样轮换
    const l0 = roster.map(u => posOf(A.S.board, u.uid).join(',')).join('|');
    globalThis.autoDeploy(); const l1 = roster.map(u => posOf(A.S.board, u.uid).join(',')).join('|');
    ok(l0 !== l1, '一键上阵（autoDeploy）同样触发轮换');
  }

  /* ---------- c. 整理备战席同名相邻 ---------- */
  console.log('[c] tidyBench 同名组不被拆散');
  {
    globalThis.newGame();
    A.S.board = freshBoard();
    // 构造：艾因2★ + 小松绿2★ + 小松绿1★ + 高费散子（打乱摆放）
    const ein2 = mk('ein', 2), sv2 = mk('songlv', 2), sv1 = mk('songlv', 1),
      nox1 = mk('nox', 1), rinco1 = mk('rinco', 1), taodai1 = mk('taodai', 1);
    A.S.bench = [sv1, ein2, nox1, sv2, null, rinco1, taodai1, null];
    globalThis.tidyBench();
    const names = A.S.bench.filter(Boolean).map(u => u.id);
    const idxSong = names.map((n, i) => n === 'songlv' ? i : -1).filter(i => i >= 0);
    ok(idxSong.length === 2 && idxSong[1] - idxSong[0] === 1, '小松绿 2★ 与 1★ 相邻（索引 ' + idxSong.join(',') + '）');
    const allContig = {};
    names.forEach((n, i) => { (allContig[n] = allContig[n] || []).push(i); });
    ok(Object.values(allContig).every(ix => ix[ix.length - 1] - ix[0] === ix.length - 1), '所有同名组索引连续: ' + names.join(','));
    // 组间顺序（规格）：组内最高星 → 组大小（对子优先）→ 费用降序
    const order = A.S.bench.filter(Boolean).map(u => u.id + u.star);
    ok(order[0] === 'songlv2' && order[1] === 'songlv1', '最高星并列时对子组（小松绿×2）排最前: ' + order.join(' '));
    ok(order.indexOf('ein2') === 2, '单张 2★（艾因）排在对子组之后');
    ok(order.indexOf('rinco1') < order.indexOf('nox1'), '同为散子时高费在前（rinco5 > nox4）');
  }

  /* ---------- f. 开战自动补位（只上场、不动阵型、不合成） ---------- */
  console.log('[f] fillBoardBeforeBattle 只补位不动阵型');
  {
    globalThis.newGame();
    A.S.bench = Array(8).fill(null);
    A.S.board = freshBoard();
    A.S.lvl = 6; A.S.phase = 'prep'; A.S.selUid = 99; A.S.selItem = 0;
    const ein = mk('ein'), chiharu = mk('chiharu'), aza = mk('aza');
    A.S.board[4 * 8 + 3] = ein; A.S.board[5 * 8 + 3] = tiandou = mk('tiandou'); A.S.board[7 * 8 + 3] = aza;
    const before = [ein.uid, tiandou.uid, aza.uid].map(uid => A.S.board.indexOf(A.S.board.find(u => u && u.uid === uid)));
    A.S.bench[0] = mk('diansu'); A.S.bench[1] = mk('shadow'); A.S.bench[2] = mk('sishi');
    const n = globalThis.fillBoardBeforeBattle();
    ok(n === 3, '补位 3 名（6-3）');
    ok(A.S.board.filter(Boolean).length === 6, '场上 6/6');
    const after = [ein.uid, tiandou.uid, aza.uid].map(uid => A.S.board.indexOf(A.S.board.find(u => u && u.uid === uid)));
    ok(JSON.stringify(before) === JSON.stringify(after), '原有 3 名棋子坐标逐一不变: ' + after.join(','));
    const shadow = A.S.board.find(u => u && u.id === 'shadow');
    ok(Math.floor(A.S.board.indexOf(shadow) / 8) === 7, '补位刺客落在最后排（梯队偏好）');
    ok(A.S.selUid == null && A.S.selItem == null, 'selUid/selItem 已清理');
    ok(A.S.log.some(l => l.includes('人口未满：已自动上阵 3 名')), '补位日志存在');
    // 人口已满 → 空转
    const n2 = globalThis.fillBoardBeforeBattle();
    ok(n2 === 0, '人口已满时补位空转');
    // 备战席空 + 场上空 → 开战拦截仍生效
    A.S.board = freshBoard(); A.S.bench = Array(8).fill(null); A.S.phase = 'prep';
    globalThis.startBattle();
    ok(A.S.phase === 'prep' && A.S.log.some(l => l.includes('至少上场 1 名')), '全空开战仍被拦截');
    // 场上空 + 备战席有货 → 补位后正常开战
    A.S.bench[0] = mk('ein'); A.S.phase = 'prep';
    globalThis.startBattle();
    ok(A.S.phase === 'battle' && A.S.board.filter(Boolean).length >= 1, '空场+备战席有货：自动上阵后开战（phase=' + A.S.phase + '）');
  }

  console.log(fails.length ? '\nFAIL ' + fails.length + ' 项:\n' + fails.map(f => '  ✗ ' + f).join('\n') : '\nALL PASS ✅');
  process.exitCode = fails.length ? 1 : 0;
};
