// Render the same vector mark at the sizes used by browsers and installed apps.
const fs = require('node:fs'),
  path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'icons/wallet.svg'), 'utf8');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const [size, name, type] of [
      [192, 'icons/wallet-192.png', 'png'],
      [512, 'icons/wallet-512.png', 'png'],
      [512, 'icons/wallet-maskable-512.png', 'png'],
      [180, 'icons/apple-touch-icon.png', 'png'],
      [192, 'icon-192.png', 'png'],
      [512, 'icon-512.jpg', 'jpeg'],
    ]) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent('<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>' + svg);
      await page.screenshot({ path: path.join(root, name), type, ...(type === 'jpeg' ? { quality: 95 } : {}) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
