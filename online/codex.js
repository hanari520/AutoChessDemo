// Online codex: 👥 units / 🔗 bonds / 📦 gear reference modal, mirroring the classic book panel.
// Read-only data views over the shared combat roster; no server round-trips.
import { ROSTER_LIST, BOND_TIERS, previewUnit } from './combat.js';
import { UNIT_NAMES } from './core.js';
import { CLASSIC_SKILLS } from './skill-catalog.js';
import { EQUIPMENT } from './equipment.js';

const COST_CLASS = { 1: 'c1', 2: 'c2', 3: 'c3', 4: 'c4', 5: 'c5' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const unitImage = id => `assets/units_big/${String(id).replace(/[^\w-]/g, '')}.webp`;
const tagsOf = u => [u.fac, u.fac2, u.job, u.job2].filter(Boolean);

let modal = null;
let activeTab = 'units';
const filters = { cost: new Set(), fac: new Set(), job: new Set() };

function unitCard(unit) {
  const stats = previewUnit({ id: unit.id, star: 1, items: [] }) || {};
  const kit = CLASSIC_SKILLS[unit.id] || {};
  const tags = tagsOf(unit);
  return `<article class="codex-unit">
    <img class="codex-portrait" src="${unitImage(unit.id)}" alt="${esc(UNIT_NAMES[unit.id] || unit.id)}" loading="lazy">
    <div class="codex-unit-body">
      <header><b>${esc(UNIT_NAMES[unit.id] || unit.id)}</b><i class="codex-cost ${COST_CLASS[unit.cost] || 'c1'}">${unit.cost} 金</i></header>
      <p class="codex-tags">${tags.map(esc).join(' · ')}</p>
      <p class="codex-stats"><span title="生命">❤ ${stats.hp ?? unit.hp}</span><span title="攻击">⚔ ${stats.atk ?? unit.atk}</span><span title="射程">🎯 ${stats.range ?? unit.range}</span><span title="攻速">💨 ${unit.speed}</span><span title="护甲/魔抗">🛡 ${stats.armor ?? '-'} / ${Math.round((stats.resist || 0) * 100)}%</span></p>
      <div class="codex-skill" style="border-inline-start-color:${esc(kit.color || 'var(--gold)')}">
        <b>${esc(kit.name || '——')}</b><p>${esc(kit.desc || '')}</p>
      </div>
    </div>
  </article>`;
}

function renderUnits() {
  const uniqueBonds = values => [...new Set(values.filter(t => BOND_TIERS[t]))].sort();
  const dims = {
    cost: [...new Set(ROSTER_LIST.map(u => u.cost))].sort((a, b) => a - b),
    fac: uniqueBonds(ROSTER_LIST.flatMap(u => [u.fac, u.fac2].filter(Boolean))),
    job: uniqueBonds(ROSTER_LIST.flatMap(u => [u.job, u.job2].filter(Boolean))),
  };
  const chip = (dim, key) => `<button type="button" class="codex-chip ${filters[dim].has(key) ? 'on' : ''}" data-dim="${dim}" data-key="${esc(key)}">${esc(key)}${dim === 'cost' ? ' 金' : ''}</button>`;
  const match = u => (!filters.cost.size || filters.cost.has(u.cost))
    && (!filters.fac.size || tagsOf(u).some(t => filters.fac.has(t)))
    && (!filters.job.size || [u.job, u.job2].some(t => filters.job.has(t)));
  const list = ROSTER_LIST.filter(match);
  return `<div class="codex-filters">
      <div class="codex-filter-row"><span>费用</span><div>${dims.cost.map(k => chip('cost', k)).join('')}</div></div>
      <div class="codex-filter-row"><span>阵营</span><div>${dims.fac.map(k => chip('fac', k)).join('')}</div></div>
      <div class="codex-filter-row"><span>职业</span><div>${dims.job.map(k => chip('job', k)).join('')}</div></div>
    </div>
    <p class="codex-count">${list.length} / ${ROSTER_LIST.length} 名成员</p>
    <div class="codex-grid">${list.map(unitCard).join('') || '<p class="empty-message">没有符合条件的棋子，试试清空筛选。</p>'}</div>`;
}

function renderBonds() {
  const presentation = globalThis.ClassicPreparationPresentation;
  const descriptions = globalThis.ClassicBondRules?.descriptions || {};
  return `<div class="codex-bonds">${Object.entries(BOND_TIERS).map(([name, tiers]) => {
    const descs = descriptions[name] || [];
    return `<article class="codex-bond">
      <header>${presentation ? presentation.icon(name) : '🔗'}<b>${esc(name)}</b><span>${tiers.map(n => `${n} 人`).join(' / ')}</span></header>
      <ul>${tiers.map((need, i) => `<li><b>T${i + 1}（${need} 人）</b>${esc(descs[i] || '')}</li>`).join('')}</ul>
    </article>`;
  }).join('')}</div>`;
}

function renderItems() {
  const entry = ([id, item]) => `<article class="codex-item ${item.crafted ? 'crafted' : 'base'}">
    <header><span class="codex-item-emoji">${esc(item.e)}</span><b>${esc(item.n)}</b><i>${item.crafted ? '合成成品' : '基础装备'}</i></header>
    <p class="codex-item-desc">${esc(item.desc)}</p>
    <p class="codex-item-trait">${esc(item.trait)}</p>
    ${item.crafted ? `<p class="codex-item-from">合成：${item.from.map(part => `${esc(EQUIPMENT[part].e)} ${esc(EQUIPMENT[part].n)}`).join(' + ')}</p>` : ''}
  </article>`;
  const entries = Object.entries(EQUIPMENT);
  return `<p class="codex-count">基础 ${entries.filter(([, i]) => !i.crafted).length} 件 · 成品 ${entries.filter(([, i]) => i.crafted).length} 件</p>
    <div class="codex-items">${entries.sort((a, b) => (a[1].crafted ? 1 : 0) - (b[1].crafted ? 1 : 0)).map(entry).join('')}</div>`;
}

function renderBody() {
  if (activeTab === 'units') return renderUnits();
  if (activeTab === 'syn') return renderBonds();
  return renderItems();
}

function render() {
  if (!modal) return;
  modal.querySelector('.codex-body').innerHTML = renderBody();
  modal.querySelectorAll('.btab').forEach(btn => btn.classList.toggle('on', btn.dataset.tab === activeTab));
}

function buildModal() {
  modal = document.createElement('div');
  modal.className = 'codex-modal';
  modal.innerHTML = `<div class="codex-panel" role="dialog" aria-modal="true" aria-label="棋子图鉴">
    <div class="codex-head">
      <h2>📖 棋子图鉴</h2>
      <div class="codex-tabs">
        <button type="button" class="btab on" data-tab="units">👥 棋子</button>
        <button type="button" class="btab" data-tab="syn">🔗 羁绊</button>
        <button type="button" class="btab" data-tab="items">📦 装备</button>
      </div>
      <button type="button" class="button quiet codex-close">✕ 关闭</button>
    </div>
    <div class="codex-body"></div>
  </div>`;
  modal.addEventListener('click', event => {
    const tab = event.target.closest('.btab');
    if (tab) { activeTab = tab.dataset.tab; render(); return; }
    const chip = event.target.closest('.codex-chip');
    if (chip) {
      const set = filters[chip.dataset.dim];
      const key = chip.dataset.dim === 'cost' ? +chip.dataset.key : chip.dataset.key;
      set.has(key) ? set.delete(key) : set.add(key);
      render(); return;
    }
    if (event.target.closest('.codex-close') || event.target === modal) close();
  });
  document.body.appendChild(modal);
}

export function openCodex() {
  if (!modal) buildModal();
  modal.hidden = false;
  render();
}
export function closeCodex() { if (modal) modal.hidden = true; }

export function mountCodex() {
  const button = document.getElementById('codexBtn');
  if (!button) return;
  button.addEventListener('click', openCodex);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCodex(); });
}
