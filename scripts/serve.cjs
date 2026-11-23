const http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const devAccess = process.argv.includes('--dev-access');
const port = devAccess ? 5516 : Number(process.env.PORT || 4173);
const developmentFiles = new Map([
  ['/__dev/access.js', 'dev-access-selector.mjs'],
  ['/js/firebase-google-auth.js', 'dev-access-auth.mjs'],
  ['/js/firebase-connection.js', 'dev-access-connection.mjs'],
]);
const root = path.resolve(__dirname, '../dist'),
  types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.gz': 'application/gzip',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.pdf': 'application/pdf',
  };
const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (devAccess && developmentFiles.has(rel)) {
      res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-store' });
      fs.createReadStream(path.join(__dirname, developmentFiles.get(rel))).pipe(res);
      return;
    }
    if (devAccess && ['/js/serviceWorker.js', '/service-worker.js'].includes(rel)) {
      res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    const file = path.resolve(root, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      if (devAccess && path.extname(file) === '.html') {
        const html = fs.readFileSync(file, 'utf8');
        res.end(html.replace('</body>', '<script type="module" src="/__dev/access.js"></script></body>'));
        return;
      }
      fs.createReadStream(file).pipe(res);
    });
  });

async function start() {
  if (devAccess) await require('./dev-access-seed.cjs').seed();
  server.listen(port, '127.0.0.1', () => console.log('Findom Wallet em http://127.0.0.1:' + port));
}
start().catch(error => { console.error(error.message); process.exitCode = 1; });
