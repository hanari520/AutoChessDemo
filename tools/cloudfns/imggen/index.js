const tcb = require('@cloudbase/node-sdk');
const app = tcb.init({ env: 'hanari-d6gjqwx683f6c455d' });

/* 临时生图函数：hunyuan-image，返回 24h 有效的图片 URL */
exports.main = async (event) => {
  const { prompt, negative_prompt, size, seed, revise } = event || {};
  if (!prompt) return { ok: false, error: 'prompt required' };
  try {
    const ai = app.ai();
    const model = ai.createImageModel('hunyuan-image');
    const params = {
      model: 'hunyuan-image',
      prompt,
      size: size || '1024x1024',
      version: 'v1.9',
      revise: revise === undefined ? false : !!revise,
    };
    if (negative_prompt) params.negative_prompt = negative_prompt;
    if (seed) params.seed = seed;
    const res = await model.generateImage(params);
    const first = res && res.data && res.data[0];
    if (!first || !first.url) return { ok: false, error: 'no url in response', raw: JSON.stringify(res).slice(0, 500) };
    return { ok: true, url: first.url, revised_prompt: first.revised_prompt || '' };
  } catch (e) {
    const body = e && e.response && e.response.data;
    return {
      ok: false,
      error: String((e && e.message) || e).slice(0, 300),
      status: e && e.response && e.response.status,
      body: typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body || {}).slice(0, 500),
    };
  }
};
