/* 演出字幕条 · 主线巡演对白演出层（纯 DOM） */
(function (root) {
  'use strict';
  let el = null, portrait = null, nameEl = null, textEl = null;
  let queue = [], idx = 0, done = null, onKey = null;

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'narrativeBar';
    el.className = 'narrative-bar';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '演出对白');
    el.innerHTML = '<div class="narrative-bar-portrait" aria-hidden="true"></div>'
      + '<div class="narrative-bar-body"><p class="narrative-bar-name"></p><p class="narrative-bar-text"></p></div>'
      + '<button type="button" class="narrative-bar-next">继续 ›</button>'
      + '<button type="button" class="narrative-bar-skip">跳过</button>';
    (document.body || document.documentElement).appendChild(el);
    portrait = el.querySelector('.narrative-bar-portrait');
    nameEl = el.querySelector('.narrative-bar-name');
    textEl = el.querySelector('.narrative-bar-text');
    el.querySelector('.narrative-bar-next').addEventListener('click', next);
    el.querySelector('.narrative-bar-skip').addEventListener('click', finish);
    return el;
  }

  function render() {
    const line = queue[idx];
    if (!line) return finish();
    nameEl.textContent = line.name || '';
    textEl.textContent = line.text || '';
    if (line.who) {
      portrait.style.backgroundImage = 'url("assets/units/' + line.who + '.png")';
      portrait.hidden = false;
    } else {
      portrait.style.backgroundImage = '';
      portrait.hidden = true;
    }
    if (line.sfx && typeof root.sfx === 'function') root.sfx(line.sfx);
  }

  function next() { idx += 1; if (idx >= queue.length) return finish(); render(); }

  function finish() {
    if (el) el.hidden = true;
    document.body.classList.remove('narrative-on');
    queue = []; idx = 0;
    if (onKey) document.removeEventListener('keydown', onKey);
    onKey = null;
    const cb = done; done = null;
    if (typeof cb === 'function') cb();
  }

  function play(lines, onDone) {
    if (!Array.isArray(lines) || !lines.length) { if (typeof onDone === 'function') onDone(); return; }
    ensure();
    queue = lines.slice(); idx = 0; done = onDone || null;
    el.hidden = false;
    document.body.classList.add('narrative-on');
    onKey = e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); next(); } };
    document.addEventListener('keydown', onKey);
    render();
  }

  root.NarrativeBar = { play: play, next: next, finish: finish };
})(typeof window !== 'undefined' ? window : undefined);
