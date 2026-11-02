const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  dest = path.join(root, 'dist');
fs.mkdirSync(dest, { recursive: true });
const { copy, prepareAssets } = require('./local-assets.cjs');
for (const name of ['index.html', 'manifest.json', 'css', 'js', 'icon-192.png', 'icon-512.jpg', '💎 Contrato de Submissão e Resgate de Saldo.pdf']) copy(path.join(root, name), path.join(dest, name));
prepareAssets(root, dest);
const publicBuild = process.argv.includes('--public');
const localConfig = path.join(dest, 'firebaseConfiguration.js');
if (publicBuild) {
  // The existing-project bootstrap works without publishing the local config.
  if (fs.existsSync(localConfig)) fs.unlinkSync(localConfig);
} else if (fs.existsSync(path.join(root, 'firebaseConfiguration.js'))) copy(path.join(root, 'firebaseConfiguration.js'), localConfig);
const files = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else files.push(path.relative(dest, p).replaceAll('\\', '/'));
  }
}
walk(dest);
const assets = files.filter((n) => !['service-worker.js', 'version.json'].includes(n));
const digest = crypto.createHash('sha256');
for (const name of [...assets, 'service-worker.js']) {
  digest.update(name);
  digest.update(fs.readFileSync(name === 'service-worker.js' ? path.join(root, name) : path.join(dest, name)));
}
const version = '2.0.0-' + digest.digest('hex').slice(0, 10);
const workerTemplate = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
if (!workerTemplate.includes('__BUILD_VERSION__') || !/\/\*__PRECACHE__\*\/\s*\[\]/.test(workerTemplate)) throw new Error('Missing service worker build markers.');
const sw = workerTemplate.replace('__BUILD_VERSION__', version).replace(/\/\*__PRECACHE__\*\/\s*\[\]/, JSON.stringify(assets));
fs.writeFileSync(path.join(dest, 'service-worker.js'), sw);
fs.writeFileSync(path.join(dest, 'version.json'), JSON.stringify({ version }));
console.log('Build completo: dist/ · ' + version + ' · ' + assets.length + ' arquivos locais.');
