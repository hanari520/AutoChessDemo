'use strict';

function deathHistogram(results, roundLimit = 100) {
  const limit = Math.max(1, Math.floor(Number(roundLimit) || 100));
  const deaths = Array(limit).fill(0);
  for (const result of results || []) {
    if (!result || result.win || result.truncated) continue;
    const round = Math.floor(Number(result.round));
    if (round >= 1 && round <= limit) deaths[round - 1]++;
  }
  const total = deaths.reduce((sum, count) => sum + count, 0);
  const mean = total / limit;
  const rows = deaths.map((count, i) => ({
    round: i + 1,
    deaths: count,
    ratio: mean ? count / mean : 0,
    highlighted: mean > 0 && count >= mean * 2,
  }));
  const top5 = rows.slice().sort((a, b) => b.deaths - a.deaths || a.round - b.round).slice(0, 5);
  return { rows, top5, mean, total };
}

function mergeTelemetryTotals(target, telemetry) {
  const out = target || {};
  if (!telemetry || typeof telemetry !== 'object') return out;
  Object.entries(telemetry).forEach(([key, value]) => {
    if (key.startsWith('_') || typeof value !== 'number' || !Number.isFinite(value)) return;
    out[key] = (out[key] || 0) + value;
  });
  return out;
}

function deathReport(results, roundLimit = 100) {
  const stats = deathHistogram(results, roundLimit);
  const rows = stats.rows.map(row =>
    `r${String(row.round).padStart(2, '0')} 死亡=${row.deaths} 均值比=${row.ratio.toFixed(2)}×${row.highlighted ? ' 🔴' : ''}`
  );
  const top = stats.top5.map((row, i) =>
    `${i + 1}. r${row.round}：${row.deaths} 局（${row.ratio.toFixed(2)}×${row.highlighted ? ' 🔴' : ''}）`
  );
  return [
    `每回合死亡计数（${stats.total} 局终局 / ${stats.rows.length} 回合；全局均值 ${stats.mean.toFixed(2)} 局/回合）`,
    ...rows,
    '卡关点 Top5（按死亡局数降序）',
    ...top,
  ].join('\n');
}

module.exports = { deathHistogram, deathReport, mergeTelemetryTotals };
