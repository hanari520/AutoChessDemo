# 文案清理：变体覆盖基础数值时替换原文，去重被动描述
import io
p = 'index.html'
s = io.open(p, encoding='utf8').read()

def rep(old, new):
    global s
    assert old in s, 'NOT FOUND: ' + old[:60]
    s = s.replace(old, new, 1)

# 1) 主动描述：变体效果若覆盖基础词条（眩晕/击飞/冻结/攻降/烧蓝/夺盾），替换数值并省略附加文本
rep("""  const info=SKILL_INFO[d.sk[1]];
  let s=typeof info==='function'?info(k):info;
  if(sv.tgt==='low'||sv.tgt==='hi') s+=`，${tgtTxt}`;
  return s + (sv.txt?`，${sv.txt}`:'');
}""",
"""  const info=SKILL_INFO[d.sk[1]];
  let s=typeof info==='function'?info(k):info;
  if(sv.tgt==='low'||sv.tgt==='hi') s+=`，${tgtTxt}`;
  // 变体覆盖基础词条时直接替换数值，避免"眩晕1.2秒，眩晕延长至1.8秒"式重复
  const fxOf=t=>(sv.fx||[]).find(f=>f[0]===t);
  let substituted=false;
  const fStun=fxOf('stun');
  if(fStun && /眩晕 [0-9.]+ 秒/.test(s)){ s=s.replace(/眩晕 [0-9.]+ 秒/,`眩晕 ${fStun[1]} 秒`); substituted=true; }
  if(fStun && /击飞 [0-9.]+ 秒/.test(s)){ s=s.replace(/击飞 [0-9.]+ 秒/,`击飞 ${fStun[1]} 秒`); substituted=true; }
  const fFr=fxOf('freeze');
  if(fFr && /冻结 [0-9.]+ 秒/.test(s)){ s=s.replace(/冻结 [0-9.]+ 秒/,`冻结 ${fFr[1]} 秒`); substituted=true; }
  const fWk=fxOf('weaken');
  if(fWk && /攻击力降低 30%，持续 4 秒/.test(s)){ s=s.replace(/攻击力降低 30%，持续 4 秒/,`攻击力降低 ${Math.round(fWk[1]*100)}%，持续 ${fWk[2]} 秒`); substituted=true; }
  const fBu=fxOf('burn');
  if(fBu && /烧毁其 30 点法力/.test(s)){ s=s.replace(/烧毁其 30 点法力/,`烧毁其 ${Math.round(fBu[1]*100)}% 法力`); substituted=true; }
  if(sv.stealPct){ s=s.replace(/夺取其 60% 的护盾/,`夺取其 ${Math.round(sv.stealPct*100)}% 的护盾`); substituted=true; }
  return s + (!substituted && sv.txt?`，${sv.txt}`:'');
}""")

# 2) 被动描述已含变体数值的棋子：去掉重复的附加文本
for dead in [
    "chiyu:  {p:{vampPct:.30}, txt:'吸血提升至 30%'},",
    "boushoku:{p:{vampPct:.35}, txt:'吸血提升至 35%'},",
    "suiji:  {p:{healPct:1.25,healIv:5000}, txt:'治疗量 125% 攻击，每 5 秒触发'},",
    "jiji:   {p:{shieldPct:.30}, txt:'护盾提升至 30% 最大生命'},",
    "taodai: {p:{shieldPct:.38}, txt:'护盾提升至 38% 最大生命'},",
    "zhouyi: {p:{sb:.80}, txt:'破盾特攻提升至 80% 伤害'},",
    "yuji:   {p:{blockCt:.25,blockDmg:.5}, txt:'格挡概率提升至 25%'},",
]:
    key = dead.split(':')[0].strip()
    val = dead.split(':',1)[1].strip()
    rep(dead, f"{key}:{val[:-1]}," if False else f"{key}:{val}")
# 上面写法太绕，直接精确替换
s = io.open(p, encoding='utf8').read()
for old, new in [
    ("chiyu:  {p:{vampPct:.30}, txt:'吸血提升至 30%'},", "chiyu:  {p:{vampPct:.30}},"),
    ("boushoku:{p:{vampPct:.35}, txt:'吸血提升至 35%'},", "boushoku:{p:{vampPct:.35}},"),
    ("suiji:  {p:{healPct:1.25,healIv:5000}, txt:'治疗量 125% 攻击，每 5 秒触发'},", "suiji:  {p:{healPct:1.25,healIv:5000}},"),
    ("jiji:   {p:{shieldPct:.30}, txt:'护盾提升至 30% 最大生命'},", "jiji:   {p:{shieldPct:.30}},"),
    ("taodai: {p:{shieldPct:.38}, txt:'护盾提升至 38% 最大生命'},", "taodai: {p:{shieldPct:.38}},"),
    ("zhouyi: {p:{sb:.80}, txt:'破盾特攻提升至 80% 伤害'},", "zhouyi: {p:{sb:.80}},"),
    ("yuji:   {p:{blockCt:.25,blockDmg:.5}, txt:'格挡概率提升至 25%'},", "yuji:   {p:{blockCt:.25,blockDmg:.5}},"),
]:
    assert old in s, old[:40]
    s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf8').write(s)
print('desc cleanup ok')
