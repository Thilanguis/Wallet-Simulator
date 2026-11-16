const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
test('production build precaches the offline shell and ships OCR assets on demand', () => {
  const root = path.resolve(__dirname, '..');
  execFileSync(process.execPath, ['scripts/build.cjs'], { cwd: root, stdio: 'pipe' });
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'),
    worker = fs.readFileSync(path.join(root, 'dist/service-worker.js'), 'utf8');
  assert.ok(!worker.includes('__BUILD_VERSION__'));
  assert.ok(!worker.includes('__PRECACHE__'));
  const assets = JSON.parse(worker.match(/const ASSETS\s*=\s*(\[[\s\S]*?\]);/)[1]);
  assert.ok(assets.includes('index.html'));
  for (const match of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) assert.ok(assets.includes(match[1]), match[1] + ' missing from offline cache');
  assert.ok(
    assets.every((asset) => !asset.startsWith('vendor/')),
    'optional vendor assets must stay out of the initial cache',
  );
  for (const asset of ['vendor/lang/por.traineddata.gz', 'vendor/lang/eng.traineddata.gz', 'vendor/pdf/pdf.mjs', 'vendor/pdf/pdf.worker.mjs', 'vendor/tesseract/worker.min.js']) {
    assert.ok(fs.existsSync(path.join(root, 'dist', asset)), 'missing on-demand asset ' + asset);
  }
  for (const asset of assets) assert.ok(fs.existsSync(path.join(root, 'dist', asset)), 'missing asset ' + asset);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.json'), 'utf8'));
  assert.equal(manifest.name, 'Findom Wallet');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.ok(assets.includes(icon.src), 'installed icon missing from offline cache');
    const png = fs.readFileSync(path.join(root, 'dist', icon.src));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16) + 'x' + png.readUInt32BE(20), icon.sizes, 'declared and actual icon sizes differ');
  }
  assert.ok(html.includes('icons/apple-touch-icon.png'));
  assert.ok(assets.includes('icons/apple-touch-icon.png'));
  assert.ok(assets.includes('icons/wallet.svg'));
  const legacy = fs.readFileSync(path.join(root, 'dist/icon-192.png'));
  assert.equal(legacy.readUInt32BE(16), 192);
  assert.equal(legacy.readUInt32BE(20), 192);
});

test('public Pages build excludes the local Firebase config and includes the existing-project bootstrap', () => {
  const root = path.resolve(__dirname, '..');
  execFileSync(process.execPath, ['scripts/build.cjs', '--public'], { cwd: root, stdio: 'pipe' });
  assert.ok(!fs.existsSync(path.join(root, 'dist/firebaseConfiguration.js')));
  const worker = fs.readFileSync(path.join(root, 'dist/service-worker.js'), 'utf8');
  const assets = JSON.parse(worker.match(/const ASSETS\s*=\s*(\[[\s\S]*?\]);/)[1]);
  assert.ok(!assets.includes('firebaseConfiguration.js'));
  for (const name of ['js/firebase-connection.js', 'js/firebase-existing-model.js', 'js/firebase-existing-transport.js']) assert.ok(assets.includes(name));
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  assert.ok(workflow.includes("github.repository == 'Thilanguis/Wallet-Simulator'"));
  assert.ok(workflow.includes('npm run build -- --public'));
});
