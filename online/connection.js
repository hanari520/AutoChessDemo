export const HTTP_TIMEOUT_MS = 10_000;

export async function postJson(url, data, {fetchImpl = fetch, timeoutMs = HTTP_TIMEOUT_MS} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data), signal: controller.signal,
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error(`联机服务返回了无法读取的响应（HTTP ${response.status}）。`); }
    if (!response.ok) {
      const error = new Error(result.message || result.error?.message || `请求失败（HTTP ${response.status}）。`);
      error.status = response.status;
      throw error;
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('请求超时，请检查网络后重试。');
    if (error instanceof TypeError) throw new Error('无法连接联机服务。请检查服务地址、网络及服务器是否启动。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function reconnectDelay(attempt, random = Math.random) {
  const base = Math.min(15_000, 800 * 2 ** Math.min(attempt, 5));
  return Math.round(base * (0.7 + random() * 0.6));
}

// A fresh authoritative snapshot is required before deciding whether an unacknowledged
// action executed. Only the exact same envelope may be replayed in the original prep.
export function reconcileAction(pending, snapshot) {
  if (!pending) return 'none';
  if (!Number.isSafeInteger(snapshot.nextSeq) || typeof snapshot.lastActionId !== 'string' && snapshot.lastActionId !== null) return 'unknown';
  if (snapshot.nextSeq === pending.envelope.seq + 1 && snapshot.lastActionId === pending.envelope.id) return 'confirmed';
  if (snapshot.nextSeq !== pending.envelope.seq) return 'conflict';
  if (snapshot.lobby?.status !== 'playing' || snapshot.view?.phase !== 'prep' || snapshot.view?.round !== pending.round) return 'stale';
  return 'retry';
}
