/* Star Stage presentation hooks. This layer decorates the existing game API and never mutates run rules. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

  function hueOf(id) {
    let h = 0x811c9dc5;
    for (const ch of String(id || 'idol')) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
    return (h >>> 0) % 360;
  }

  function buildTitleCard() {
    const art = $('homeArt'), title = $('flowHomeTitle');
    if (!art || !title || art.childElementCount) return;
    art.setAttribute('aria-label', '虚拟偶像角色展示');
    const featured = UNITS.filter((u) => u.cost >= 3).filter((u, i, all) => all.findIndex((v) => v.fac === u.fac) === i).slice(0, 3);
    featured.forEach((unit) => {
      const img = document.createElement('img');
      img.src = `assets/units_big/${unit.id}.png`;
      img.alt = unit.name;
      img.draggable = false;
      art.appendChild(img);
    });
    title.textContent = '星域棋战';

    document.querySelectorAll('#topbar .btn.ic').forEach((button) => {
      const label = button.textContent.trim();
      if (!button.title && label) button.title = label;
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', button.title || label || '游戏操作');
    });
  }

  /* ===== 施法播报（双槽迷你堆叠）：棋盘外顶沿固定条——我方居左、对手居右，
     每槽保留最近 2 条，新条插入顶部、约 1.7s 转旧、2.1s 退场，超出即逐出最旧。
     不再悬浮棋盘遮挡棋子；「谁在哪施法」由棋子本体的 idol-sigil / idol-casting 负责。 ===== */
  function buildCastFeed() {
    const host = $('boardwrap');
    if (!host) return null;
    if ($('castFeed')) return $('castFeed');
    const feed = document.createElement('div');
    feed.id = 'castFeed';
    feed.setAttribute('role', 'status');
    feed.setAttribute('aria-live', 'polite');
    const ally = document.createElement('div');
    ally.className = 'cf-slot ally';
    const foe = document.createElement('div');
    foe.className = 'cf-slot foe';
    feed.append(ally, foe);
    host.insertBefore(feed, host.firstChild);
    return feed;
  }

  const glyphs = {
    cleave: '✦', dash: '➤', shred: '⌁', rapid: '»', massstun: '✧', massfreeze: '❄', masssilence: '♫',
    chain: 'ϟ', frost: '❄', fireball: '☼', slam: '✹', hex: '◇', heal: '♡', aheal: '♫',
    teamshield: '✧', bulwark: '⬡', guard: '♡', poison: '❋', starfall: '✦', time: '◷',
  };
  function castFeedPush(unit) {
    const feed = buildCastFeed();
    if (!feed) return;
    const slot = feed.querySelector(unit.side === 1 ? '.cf-slot.foe' : '.cf-slot.ally');
    if (!slot) return;
    const hue = hueOf(unit.id);
    const def = UNITS.find((candidate) => candidate.id === unit.id);
    if (!def) return;
    const arch = String(def.sk[1] || 'magic').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    const item = document.createElement('div');
    item.className = `cf-item arch-${arch}`;
    item.style.setProperty('--hero-color', `hsl(${hue} 78% 66%)`);
    item.innerHTML = `<img src="assets/units_big/${unit.id}.png" alt="${esc(def.name)}" draggable="false">`
      + `<b>${esc(def.name)}</b><span>${glyphs[arch] || '✦'} ${esc(def.sk[0])}</span>`;
    slot.prepend(item);
    const speed = Math.max(1, window.SPEED || 1);
    window.setTimeout(() => item.classList.add('old'), 1150 / speed);
    window.setTimeout(() => item.classList.add('bye'), 1750 / speed);
    window.setTimeout(() => item.remove(), 2100 / speed);
    slot.querySelectorAll('.cf-item:not(.bye)').forEach((stale, idx) => {
      if (idx >= 2) { stale.classList.add('bye'); window.setTimeout(() => stale.remove(), 300 / speed); }
    });
  }

  function cueSkill(unit) {
    if (!unit || unit.uid == null) return;
    const def = UNITS.find((candidate) => candidate.id === unit.id);
    if (!def) return;
    const hue = hueOf(unit.id);
    const arch = String(def.sk[1] || 'magic').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    const node = document.querySelector(`#unitLayer [data-uid="${unit.uid}"]`);
    if (node) {
      node.style.setProperty('--hero-hue', hue);
      node.classList.add('idol-casting');
      const sigil = document.createElement('span');
      sigil.className = `idol-sigil arch-${arch}`;
      sigil.setAttribute('aria-hidden', 'true');
      sigil.innerHTML = `<b>${glyphs[arch] || '✦'}</b>`;
      node.appendChild(sigil);
      window.setTimeout(() => { sigil.remove(); node.classList.remove('idol-casting'); }, 680 / Math.max(1, window.SPEED || 1));
    }
    castFeedPush(unit);
  }

  function hookSkillCues() {
    const original = window.castSkill;
    if (typeof original !== 'function' || original.__idolRefactored) return;
    const wrapped = function (unit, ...args) {
      cueSkill(unit);
      return original.call(this, unit, ...args);
    };
    wrapped.__idolRefactored = true;
    window.castSkill = wrapped;
  }

  buildTitleCard();
  buildCastFeed();
  hookSkillCues();
})();
