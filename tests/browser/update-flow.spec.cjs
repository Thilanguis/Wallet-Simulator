const { test, expect } = require('../firebase-fixture.cjs');
test('automatic update asks consent and shows progress before preserving data and reloading', async ({ page }) => {
  await page.route('**/firebaseConfiguration.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
  await page.addInitScript(() => {
    const worker = { postMessage: (message) => window.__updateMessages.push(message) };
    window.__updateMessages = [];
    const registration = new EventTarget();
    registration.waiting = sessionStorage.getItem('updateTestApplied') ? null : worker;
    registration.update = async () => {};
    const serviceWorker = new EventTarget();
    serviceWorker.controller = {};
    serviceWorker.register = async () => registration;
    Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true });
    window.__finishUpdate = () => {
      sessionStorage.setItem('updateTestApplied', 'true');
      serviceWorker.dispatchEvent(new Event('controllerchange'));
    };
    if (!localStorage.getItem('findom.wallet.v2')) localStorage.setItem('saldoDominadora', '123.45');
  });
  await page.goto('/');
  await expect(page.locator('body')).not.toHaveClass(/firebase-required/);
  await expect(page.locator('.app-dialog')).toContainText('nova versão');
  expect(await page.evaluate(() => window.__updateMessages)).toEqual([]);
  await page.locator('[data-dialog-cancel]').click();
  await expect(page.locator('#updateBanner')).toBeVisible();
  await page.locator('#updateLater').click();
  await expect(page.locator('#updateBanner')).toBeHidden();
  // A second pending version is not required: the ready banner remains actionable.
  await page.evaluate(() => (document.getElementById('updateBanner').hidden = false));
  // Updating must still activate when the browser suspends visual frames.
  await page.evaluate(() => (window.requestAnimationFrame = () => 0));
  await page.locator('#updateNow').click();
  await expect(page.locator('#updateProgress')).toBeVisible();
  await expect(page.locator('#updateProgress')).toHaveAttribute('value', '50');
  await expect(page.locator('#updateNow')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.__updateMessages)).toEqual([{ type: 'SKIP_WAITING' }]);
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => window.__finishUpdate())]);
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 123,45');
  await expect(page.locator('.app-dialog')).toHaveCount(0);
});
