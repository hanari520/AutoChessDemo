/* UI-only presentation layer. Gameplay state and calculations remain in index.html. */
(() => {
  const $ = (id) => document.getElementById(id);
  const appendMarkup = (parent, position, markup) => {
    if (!parent) return null;
    const holder = document.createElement('div');
    holder.innerHTML = markup.trim();
    const node = holder.firstElementChild;
    parent.insertBefore(node, position || null);
    return node;
  };

  function buildStageHud() {
    const top = $('topbar');
    const round = $('roundBox');
    if (!top || !round || $('idolBrand')) return;
    appendMarkup(top, round, `
      <div id="idolBrand" aria-label="星域棋战">
        <span class="brand-mark" aria-hidden="true">✦</span>
        <span><b class="brand-name">星域棋战</b><small class="brand-sub">VIRTUAL IDOL ARENA</small></span>
      </div>`);
    appendMarkup(top, round.nextSibling, `
      <div id="idolPhase" role="status" aria-live="polite">
        <i class="live-dot" aria-hidden="true"></i>
        <b>备战中</b><small>STAGE READY</small>
      </div>`);

    const board = $('board');
    const boardwrap = $('boardwrap');
    if (board && boardwrap) {
      board.setAttribute('aria-label', '八乘八自走棋战场');
      boardwrap.setAttribute('data-arena', 'star-stage');
    }
  }

  function syncStageHud() {
    if (typeof S === 'undefined' || !S) return;
    const phase = S.phase || 'prep';
    const phaseNames = {
      prep: ['备战中', 'STAGE READY'],
      battle: ['演出进行中', 'LIVE BATTLE'],
      chapter: ['章节结算', 'ENCORE'],
      over: ['本局结束', 'SHOW COMPLETE'],
    };
    const label = phaseNames[phase] || phaseNames.prep;
    document.body.dataset.phase = phase;
    document.body.dataset.round = String(S.round || 1);
    document.body.dataset.chapter = String(Math.ceil((S.round || 1) / (typeof chLen === 'function' ? chLen() : 25)));
    const chip = $('idolPhase');
    if (chip) {
      const title = chip.querySelector('b');
      const sub = chip.querySelector('small');
      if (title) title.textContent = label[0];
      if (sub) sub.textContent = label[1];
      chip.title = `第 ${S.round || 1} 回合 · 第 ${document.body.dataset.chapter} 幕`;
    }
  }

  function wrap(name, after) {
    const original = window[name];
    if (typeof original !== 'function' || original.__idolWrapped) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      try { after(result, args); } catch (_) { /* keep presentation isolated from game logic */ }
      return result;
    };
    wrapped.__idolWrapped = true;
    window[name] = wrapped;
  }

  function bindPresentationHooks() {
    wrap('renderAll', syncStageHud);
    wrap('renderTop', syncStageHud);
    wrap('startBattle', syncStageHud);
    wrap('endBattle', syncStageHud);
    wrap('chapterSettle', syncStageHud);
    wrap('chapterContinue', syncStageHud);
    wrap('gameOver', syncStageHud);

    document.addEventListener('click', (event) => {
      const card = event.target.closest && event.target.closest('#shop .card:not(.sold)');
      if (card) {
        card.classList.remove('idol-buy-pop');
        void card.offsetWidth;
        card.classList.add('idol-buy-pop');
        window.setTimeout(() => card.classList.remove('idol-buy-pop'), 480);
      }
    }, true);

    const overlay = $('overlay');
    if (overlay && typeof MutationObserver === 'function') {
      new MutationObserver(syncStageHud).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }
  }

  buildStageHud();
  bindPresentationHooks();
  syncStageHud();
})();
