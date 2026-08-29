/**
 * Vista Cards — local editor server.
 *
 * Run: npm run edit   →  opens the admin UI at http://localhost:8790
 *
 * A local-only replacement for QR Code Chimp's editor: pick a teammate,
 * edit their fields, upload photos / card art / designed QR codes, and
 * every save rewrites people/*.json and rebuilds docs/. Nothing here is
 * deployed — publishing still happens via git push.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 8790;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.vcf': 'text/vcard', '.ico': 'image/x-icon'
};

function send(res, code, body, type = 'application/json') {
  const data = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
}

function safeSlug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function rebuild() {
  try {
    const out = execFileSync('node', ['build.js'], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    return { ok: true, output: out.trim().split('\n').pop() };
  } catch (e) {
    return { ok: false, output: String(e.stderr || e.message).slice(0, 2000) };
  }
}

function listPeople() {
  const dir = path.join(ROOT, 'people');
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    p._hasPhoto = ['.jpg', '.jpeg', '.png'].some(e => fs.existsSync(path.join(ROOT, 'assets', 'photos', p.slug + e)));
    p._hasFront = ['.jpg', '.jpeg', '.png'].some(e => fs.existsSync(path.join(ROOT, 'assets', 'cardart', `${p.slug}-front${e}`)));
    p._hasBack = ['.jpg', '.jpeg', '.png'].some(e => fs.existsSync(path.join(ROOT, 'assets', 'cardart', `${p.slug}-back${e}`)));
    p._hasQrOverride = fs.existsSync(path.join(ROOT, 'assets', 'qr-overrides', `${p.slug}.png`));
    return p;
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 40 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Save a data-URL image, clearing any same-basename siblings with other extensions.
function saveImage(destDir, baseName, dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('expected a png/jpeg/webp data URL');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  fs.mkdirSync(destDir, { recursive: true });
  for (const e of ['.jpg', '.jpeg', '.png', '.webp']) {
    const old = path.join(destDir, baseName + e);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  const dest = path.join(destDir, `${baseName}.${ext}`);
  fs.writeFileSync(dest, Buffer.from(m[2], 'base64'));
  return dest;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;

    // ---------- API ----------
    if (p === '/api/people' && req.method === 'GET') {
      return send(res, 200, listPeople());
    }

    if (p === '/api/site' && req.method === 'GET') {
      return send(res, 200, JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8')));
    }

    if (p === '/api/site' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const sitePath = path.join(ROOT, 'site.json');
      const site = { ...JSON.parse(fs.readFileSync(sitePath, 'utf8')), ...body };
      fs.writeFileSync(sitePath, JSON.stringify(site, null, 2) + '\n');
      return send(res, 200, { ok: true });
    }

    const personMatch = /^\/api\/person\/([a-z0-9-]+)$/.exec(p);
    if (personMatch && req.method === 'POST') {
      const slug = safeSlug(personMatch[1]);
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      body.slug = slug;
      for (const k of ['displayName', 'firstName', 'lastName', 'title']) {
        if (typeof body[k] !== 'string') return send(res, 400, { ok: false, error: `missing field: ${k}` });
      }
      fs.writeFileSync(path.join(ROOT, 'people', `${slug}.json`), JSON.stringify(body, null, 2) + '\n');
      return send(res, 200, { ok: true, build: rebuild() });
    }

    if (personMatch && req.method === 'DELETE') {
      const slug = safeSlug(personMatch[1]);
      const f = path.join(ROOT, 'people', `${slug}.json`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
      const outDir = path.join(ROOT, 'docs', slug);
      if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
      return send(res, 200, { ok: true, build: rebuild() });
    }

    if (p === '/api/upload' && req.method === 'POST') {
      const { slug: rawSlug, kind, dataUrl } = JSON.parse((await readBody(req)).toString('utf8'));
      const slug = safeSlug(rawSlug);
      if (!slug) return send(res, 400, { ok: false, error: 'bad slug' });
      if (kind === 'photo') saveImage(path.join(ROOT, 'assets', 'photos'), slug, dataUrl);
      else if (kind === 'cardart-front') saveImage(path.join(ROOT, 'assets', 'cardart'), `${slug}-front`, dataUrl);
      else if (kind === 'cardart-back') saveImage(path.join(ROOT, 'assets', 'cardart'), `${slug}-back`, dataUrl);
      else if (kind === 'qr-override') saveImage(path.join(ROOT, 'assets', 'qr-overrides'), slug, dataUrl);
      else if (kind === 'qr-clear') {
        const f = path.join(ROOT, 'assets', 'qr-overrides', `${slug}.png`);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      else return send(res, 400, { ok: false, error: 'unknown kind' });
      return send(res, 200, { ok: true, build: rebuild() });
    }

    if (p === '/api/build' && req.method === 'POST') {
      return send(res, 200, rebuild());
    }

    // ---------- static ----------
    let filePath = null;
    if (p === '/' || p === '/index.html') filePath = path.join(__dirname, 'editor.html');
    else if (p.startsWith('/docs/')) filePath = path.join(ROOT, p.replace(/^\/docs\//, 'docs/'));
    else if (p.startsWith('/assets/')) filePath = path.join(ROOT, p.slice(1));

    if (filePath) {
      filePath = path.normalize(filePath);
      if (!filePath.startsWith(path.normalize(ROOT))) return send(res, 403, { error: 'forbidden' });
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
      if (fs.existsSync(filePath)) {
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        return fs.createReadStream(filePath).pipe(res);
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { ok: false, error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Vista Cards editor →  http://localhost:${PORT}\n`);
  console.log('  Edits save to people/*.json + assets/ and rebuild docs/ automatically.');
  console.log('  Publish when happy:  git add -A && git commit -m "update cards" && git push\n');
});
