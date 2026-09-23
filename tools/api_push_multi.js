/* 多文件 GitHub API 推送（github.com 直连断开时的兜底，走 api.github.com）
   以远端 main HEAD 为父提交，叠加本地最新提交相对其父提交的全部变更文件 */
const { execFileSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO = 'hanari520/AutoChessDemo';
const ROOT = path.resolve(__dirname, '..');

function cred() {
  const out = execFileSync('git', ['credential', 'fill'],
    { input: 'protocol=https\nhost=github.com\n', encoding: 'utf8' });
  return (out.match(/password=(\S+)/) || [])[1];
}

function api(method, apiPath, body, token, retries = 2) {
  const once = () => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com', path: `/repos/${REPO}${apiPath}`, method,
      headers: {
        'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
        'User-Agent': 'autochess-deploy', 'Content-Length': Buffer.byteLength(data || ''),
      },
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('bad json: ' + buf.slice(0, 160))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(300000, () => req.destroy(new Error('timeout')));
    if (data) req.write(data);
    req.end();
  });
  const attempt = (left) => once().catch(e => {
    if ((e.message === 'timeout' || /ECONNRESET|socket hang up/.test(e.message)) && left > 0) return attempt(left - 1);
    throw e;
  });
  return attempt(retries);
}

(async () => {
  const token = cred();
  if (!token) throw new Error('no github credential');
  const name = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim();
  const email = execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim();
  const date = new Date().toISOString().replace(/\.\d+Z$/, '+08:00');
  const msg = execFileSync('git', ['log', '-1', '--pretty=%B'], { encoding: 'utf8' }).trim();

  // 本地最新提交相对其父提交的变更文件列表
  const filesRaw = execFileSync('git',
    ['-c', 'core.quotepath=off', 'diff-tree', '-r', '--no-commit-id', '--name-only', 'HEAD'],
    { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  console.log('files to push:', filesRaw.length);

  const ref = await api('GET', `/git/ref/heads/main`, null, token);
  const baseSha = ref.object.sha;
  const baseCommit = await api('GET', `/git/commits/${baseSha}`, null, token);
  const baseTree = baseCommit.tree.sha;
  console.log('remote base:', baseSha.slice(0, 8), 'tree:', baseTree.slice(0, 8));

  const entries = [];
  for (const rel of filesRaw) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const isBin = buf.includes(0);
    const blob = await api('POST', `/git/blobs`,
      isBin ? { content: buf.toString('base64'), encoding: 'base64' }
            : { content: buf.toString('utf8'), encoding: 'utf-8' }, token);
    if (!blob.sha) throw new Error(`blob failed for ${rel}: ${JSON.stringify(blob).slice(0, 160)}`);
    entries.push({ path: rel.replace(/\\/g, '/'), mode: '100644', type: 'blob', sha: blob.sha });
    console.log('  blob', rel, isBin ? `(bin ${buf.length}B)` : `(${buf.length}B)`, blob.sha.slice(0, 8));
  }

  const tree = await api('POST', `/git/trees`, { base_tree: baseTree, tree: entries }, token);
  console.log('tree:', tree.sha.slice(0, 8));
  const commit = await api('POST', `/git/commits`, { message: msg, tree: tree.sha, parents: [baseSha],
    author: { name, email, date }, committer: { name, email, date } }, token);
  console.log('commit:', commit.sha.slice(0, 8));
  const upd = await api('PATCH', `/git/refs/heads/main`, { sha: commit.sha, force: false }, token);
  console.log('ref updated:', upd.object && upd.object.sha === commit.sha ? 'OK' : 'MISMATCH');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
