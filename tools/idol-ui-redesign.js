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
    const card = $('ovCard'), title = $('ovTitle'), guide = $('ovText');
    if (!card || !title || !guide || $('idolMenuArt')) return;
    const art = document.createElement('div');
    art.id = 'idolMenuArt';
    art.setAttribute('aria-label', '虚拟偶像角色展示');
    const featured = UNITS.filter((u) => u.cost >= 3).filter((u, i, all) => all.findIndex((v) => v.fac === u.fac) === i).slice(0, 3);
    featured.forEach((unit) => {
      const img = document.createElement('img');
      img.src = `assets/units_big/${unit.id}.png`;
      img.alt = unit.name;
      img.draggable = false;
      art.appendChild(img);
    });
    card.insertBefore(art, title);
    if (title.textContent.includes('虚拟棋战')) title.textContent = '星域棋战';

    const lead = document.createElement('p');
    lead.id = 'ovLead';
    lead.textContent = '收集虚拟偶像，组合专属羁绊，在自动战斗中挑战不断升级的关卡。';
    title.insertAdjacentElement('afterend', lead);

    const details = document.createElement('details');
    details.id = 'idolQuickGuide';
    const summary = document.createElement('summary');
    summary.textContent = '✦ 新手指南 · 经济、羁绊与挑战规则';
    details.append(summary, guide);
    lead.insertAdjacentElement('afterend', details);

    document.querySelectorAll('#topbar .btn.ic').forEach((button) => {
      const label = button.textContent.trim();
      if (!button.title && label) button.title = label;
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', button.title || label || '游戏操作');
    });
  }

  function buildSkillCue() {
    const host = $('boardwrap');
    if (!host || $('idolSkillCue')) return $('idolSkillCue');
    const cue = document.createElement('div');
    cue.id = 'idolSkillCue';
    cue.setAttribute('role', 'status');
    cue.setAttribute('aria-live', 'polite');
    host.appendChild(cue);
    return cue;
  }

  const glyphs = {
    cleave: '✦', dash: '➤', shred: '⌁', rapid: '»', massstun: '✧', massfreeze: '❄', masssilence: '♫',
    chain: 'ϟ', frost: '❄', fireball: '☼', slam: '✹', hex: '◇', heal: '♡', aheal: '♫',
    teamshield: '✧', bulwark: '⬡', guard: '♡', poison: '❋', starfall: '✦', time: '◷',
  };
  let cueRevision = 0;

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

    const cue = buildSkillCue();
    if (!cue) return;
    cue.style.setProperty('--hero-color', `hsl(${hue} 78% 66%)`);
    cue.className = `idol-cast-cue ${unit.side === 1 ? 'enemy' : 'ally'} arch-${arch}`;
    cue.innerHTML = `<img src="assets/units_big/${unit.id}.png" alt="${esc(def.name)}">
      <div class="cue-copy"><small>${unit.side === 1 ? 'RIVAL STAGE' : 'STAR STAGE'} · SKILL</small>
      <strong>${esc(def.sk[0])}</strong><span>${esc(def.name)} · ${unit.side === 1 ? '对手发动技能' : '专属技能发动'}</span></div>
      <b class="cue-star" aria-hidden="true">${glyphs[arch] || '✦'}</b>`;
    cue.classList.remove('show');
    void cue.offsetWidth;
    cue.classList.add('show');
    const revision = ++cueRevision;
    window.setTimeout(() => { if (revision === cueRevision) cue.classList.remove('show'); }, 900 / Math.max(1, window.SPEED || 1));
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
  buildSkillCue();
  hookSkillCues();
})();
