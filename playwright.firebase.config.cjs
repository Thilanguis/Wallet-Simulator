const { defineConfig } = require('@playwright/test');
const port = 4175;
module.exports = defineConfig({
  testDir: 'tests/live',
  testMatch: ['firebase-existing.spec.cjs', 'cloud-sync.spec.cjs'],
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, serviceWorkers: 'block', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run start', url: `http://127.0.0.1:${port}`, env: { PORT: String(port) }, reuseExistingServer: false, timeout: 30000 },
});
