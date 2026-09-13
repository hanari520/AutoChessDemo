# 将技能变体接入 castSkill 的各技能 case
import io
p = 'index.html'
s = io.open(p, encoding='utf8').read()

def rep(old, new):
    global s
    assert old in s, 'NOT FOUND: ' + old[:60]
    s = s.replace(old, new, 1)

# dash：变体索敌 + 独有效果
rep("""    case 'dash': {
      if(!foes.length)break;
      const ox=u.x, oy=u.y;
      const far=foes.reduce((a,b)=>Math.abs(b.x-u.x)+Math.abs(b.y-u.y)>Math.abs(a.x-u.x)+Math.abs(a.y-u.y)?b:a);""",
"""    case 'dash': {
      if(!foes.length)break;
      const ox=u.x, oy=u.y;
      const far=pickFoe(foes,u,{...sv,tgt:sv.tgt||'far'});""")
rep("""      beam(u,far,'#ffffff');
      vfxAt(u,'flash',600);
      vfxAt(far,'ring',900);
      dealDamage(u,far,Math.round(power*2),units);
      shakeCell(far.x,far.y); break; }""",
"""      beam(u,far,'#ffffff');
      vfxAt(u,'flash',600);
      vfxAt(far,'ring',900);
      const dd=dealDamage(u,far,Math.round(power*2),units);
      applyFx(u,far,sv,units,allies,foes,power,dd);
      shakeCell(far.x,far.y); break; }""")
# cleave：命中者附加独有效果
rep("""      hits.forEach(f=>{
        vfxAt(f,'ring',900);
        dealDamage(u,f,Math.round(power*1.5),units);
        if(f.hp>0){""",
"""      hits.forEach(f=>{
        vfxAt(f,'ring',900);
        const dd=dealDamage(u,f,Math.round(power*1.5),units);
        applyFx(u,f,sv,units,allies,foes,power,dd);
        if(f.hp>0){""")
# rapid：次数变体 + 独有词条
rep("""    case 'rapid': u.rapid=3; vfxAt(u,'ring',800); vfxAt(u,'flash',600); break;""",
"""    case 'rapid': u.rapid=sv.rapidN||3; vfxAt(u,'ring',800); vfxAt(u,'flash',600);
      applyFx(u,null,sv,units,allies,foes,power,0); break;""")
rep("""    case 'fireball': { if(!foes.length)break;
      const f=near(foes);
      beam(u,f,'#ff9a3d');
      vfxAt(f,'boom',750);
      dealDamage(u,f,Math.round(power*2.5),units);
      shakeCell(f.x,f.y); break; }""",
"""    case 'fireball': { if(!foes.length)break;
      const f=pickFoe(foes,u,sv);
      beam(u,f,'#ff9a3d');
      vfxAt(f,'boom',750);
      const dd=dealDamage(u,f,Math.round(power*2.5),units);
      applyFx(u,f,sv,units,allies,foes,power,dd);
      shakeCell(f.x,f.y); break; }""")
rep("""    case 'frost': { if(!foes.length)break;
      const f=near(foes);
      beam(u,f,'#9fe8ff');
      vfxAt(f,'ring frost',1050);
      dealDamage(u,f,Math.round(power*1.5),units);
      if(f.hp>0)f.frozen=1500; break; }""",
"""    case 'frost': { if(!foes.length)break;
      const f=pickFoe(foes,u,sv);
      beam(u,f,'#9fe8ff');
      vfxAt(f,'ring frost',1050);
      const dd=dealDamage(u,f,Math.round(power*1.5),units);
      applyFx(u,f,sv,units,allies,foes,power,dd);
      if(f.hp>0)f.frozen=Math.max(f.frozen,1500); break; }""")
rep("""    case 'volley': { if(!tgt)break;
      [tgt,...foes.filter(f=>f!==tgt&&Math.abs(f.x-tgt.x)<=1&&Math.abs(f.y-tgt.y)<=1)]
        .forEach(f=>{ vfxAt(f,'ring',900); dealDamage(u,f,Math.round(power*1.2),units); shakeCell(f.x,f.y); });
      break; }""",
"""    case 'volley': { if(!tgt)break;
      [tgt,...foes.filter(f=>f!==tgt&&Math.abs(f.x-tgt.x)<=1&&Math.abs(f.y-tgt.y)<=1)]
        .forEach(f=>{ vfxAt(f,'ring',900); const dd=dealDamage(u,f,Math.round(power*1.2),units);
          applyFx(u,f,sv,units,allies,foes,power,dd); shakeCell(f.x,f.y); });
      break; }""")
rep("""    case 'break': { if(!foes.length)break;
      const f=near(foes);""",
"""    case 'break': { if(!foes.length)break;
      const f=pickFoe(foes,u,sv);""")
rep("""      dealDamage(u,f,Math.round(power*1.3),units);
      shakeCell(f.x,f.y);
      if(stripped>0) dmgPopup(u,f,'🛡-'+stripped,'cast');
      dmgPopup(u,f,'🚫禁盾','cast'); break; }""",
"""      const dd=dealDamage(u,f,Math.round(power*1.3),units);
      applyFx(u,f,sv,units,allies,foes,power,dd);
      shakeCell(f.x,f.y);
      if(stripped>0) dmgPopup(u,f,'🛡-'+stripped,'cast');
      dmgPopup(u,f,'🚫禁盾','cast'); break; }""")
rep("""    case 'shock': { if(!foes.length)break;
      const f=near(foes);
      beam(u,f,'#ffe14a');
      vfxAt(f,'ring frost',950);
      dealDamage(u,f,Math.round(power*1.5),units);
      if(f.hp>0){ f.stun=Math.max(f.stun,1200); dmgPopup(u,f,'💫眩晕','cast'); }
      shakeCell(f.x,f.y); break; }""",
"""    case 'shock': { if(!foes.length)break;
      const f=pickFoe(foes,u,sv);
      beam(u,f,'#ffe14a');
      vfxAt(f,'ring frost',950);
      const dd=dealDamage(u,f,Math.round(power*1.5),units);
      applyFx(u,f,sv,units,allies,foes,power,dd);
      if(f.hp>0){ f.stun=Math.max(f.stun,1200); dmgPopup(u,f,'💫眩晕','cast'); }
      shakeCell(f.x,f.y); break; }""")
rep("""      hits.forEach(f=>{ vfxAt(f,'ring',900); dealDamage(u,f,Math.round(power*1.2),units);
        if(f.hp>0){ f.stun=Math.max(f.stun,800); dmgPopup(u,f,'⬆击飞','cast'); } });
      break; }""",
"""      hits.forEach(f=>{ vfxAt(f,'ring',900); const dd=dealDamage(u,f,Math.round(power*1.2),units);
        applyFx(u,f,sv,units,allies,foes,power,dd);
        if(f.hp>0){ f.stun=Math.max(f.stun,800); dmgPopup(u,f,'⬆击飞','cast'); } });
      break; }""")
rep("""    case 'curse': { if(!foes.length)break;
      const f=near(foes);
      beam(u,f,'#b0ff6b');
      vfxAt(f,'ring drain',950);
      dealDamage(u,f,Math.round(power*1.0),units);
      if(f.hp>0){ f.atkDownA=0.3; f.atkDownT=4000; dmgPopup(u,f,'🔻攻降','cast'); }
      break; }""",
"""    case 'curse': { if(!foes.length)break;
      const f=pickFoe(foes,u,sv);
      beam(u,f,'#b0ff6b');
      vfxAt(f,'ring drain',950);
      const dd=dealDamage(u,f,Math.round(power*1.0),units);
      applyFx(u,f,sv,units,allies,foes,power,dd);
      if(f.hp>0){ f.atkDownA=0.3; f.atkDownT=4000; dmgPopup(u,f,'🔻攻降','cast'); }
      break; }""")
rep("""    case 'hex': { if(!foes.length)break;
      const f=near(foes);
      beam(u,f,'#8affd4');
      vfxAt(f,'ring frost',950);
      dealDamage(u,f,Math.round(power*1.2),units);
      if(f.hp>0){ f.slowA=0.4; f.slowT=4000; dmgPopup(u,f,'🐌迟缓','cast'); }
      break; }""",
"""    case 'hex': { if(!foes.length)break;
      const f=pickFoe(foes,u,sv);
      beam(u,f,'#8affd4');
      vfxAt(f,'ring frost',950);
      const dd=dealDamage(u,f,Math.round(power*1.2),units);
      applyFx(u,f,sv,units,allies,foes,power,dd);
      if(f.hp>0){ f.slowA=0.4; f.slowT=4000; dmgPopup(u,f,'🐌迟缓','cast'); }
      break; }""")
rep("""    case 'burn': { if(!foes.length)break;
      const f=near(foes);
      beam(u,f,'#4aa8ff');
      vfxAt(f,'boom',750);
      dealDamage(u,f,Math.round(power*1.5),units);
      if(f.hp>0){ const burn=Math.min(f.mana,30); f.mana-=burn;
        if(burn>0) dmgPopup(u,f,'-'+burn+'蓝','cast'); }
      shakeCell(f.x,f.y); break; }""",
"""    case 'burn': { if(!foes.length)break;
      const f=pickFoe(foes,u,sv);
      beam(u,f,'#4aa8ff');
      vfxAt(f,'boom',750);
      const dd=dealDamage(u,f,Math.round(power*1.5),units);
      applyFx(u,f,sv,units,allies,foes,power,dd);
      if(f.hp>0){ const burn=Math.round(Math.min(f.mana,f.maxmana*0.3)); f.mana-=burn;
        if(burn>0) dmgPopup(u,f,'-'+burn+'蓝','cast'); }
      shakeCell(f.x,f.y); break; }""")
rep("""    case 'steal': { if(!foes.length)break;
      const f=near(foes);
      beam(f,u,'#9fe8ff');
      const taken=Math.round(f.shield*0.6); f.shield-=taken;
      dealDamage(u,f,Math.round(power*1.2),units);""",
"""    case 'steal': { if(!foes.length)break;
      const f=pickFoe(foes,u,sv);
      beam(f,u,'#9fe8ff');
      const taken=Math.round(f.shield*(sv.stealPct||0.6)); f.shield-=taken;
      const dd=dealDamage(u,f,Math.round(power*1.2),units);
      applyFx(u,f,sv,units,allies,foes,power,dd);""")
rep("""      foes.forEach(f=>{ vfxAt(f,'ring',900); dealDamage(u,f,Math.round(power*1.0),units);
        if(f.hp>0){ f.stun=Math.max(f.stun,1000); dmgPopup(u,f,'💫眩晕','cast'); } });
      break; }""",
"""      foes.forEach(f=>{ vfxAt(f,'ring',900); const dd=dealDamage(u,f,Math.round(power*1.0),units);
        applyFx(u,f,sv,units,allies,foes,power,dd);
        if(f.hp>0){ f.stun=Math.max(f.stun,1000); dmgPopup(u,f,'💫眩晕','cast'); } });
      break; }""")
rep("""      foes.forEach(f=>{ vfxAt(f,'ring frost',1050); dealDamage(u,f,Math.round(power*0.8),units);
        if(f.hp>0){ f.frozen=Math.max(f.frozen,1000); } });
      break; }""",
"""      foes.forEach(f=>{ vfxAt(f,'ring frost',1050); const dd=dealDamage(u,f,Math.round(power*0.8),units);
        applyFx(u,f,sv,units,allies,foes,power,dd);
        if(f.hp>0){ f.frozen=Math.max(f.frozen,1000); } });
      break; }""")
rep("""      foes.forEach(f=>{ vfxAt(f,'ring frost',950); dealDamage(u,f,Math.round(power*0.6),units);
        if(f.hp>0){ f.slowA=0.3; f.slowT=3000; } });
      break; }""",
"""      foes.forEach(f=>{ vfxAt(f,'ring frost',950); const dd=dealDamage(u,f,Math.round(power*0.6),units);
        applyFx(u,f,sv,units,allies,foes,power,dd);
        if(f.hp>0){ f.slowA=0.3; f.slowT=3000; } });
      break; }""")

io.open(p, 'w', encoding='utf8').write(s)
print('castSkill variants ok')
