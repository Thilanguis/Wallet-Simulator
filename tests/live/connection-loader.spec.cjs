const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [393, 1440]) test(`connection indicator ${width} follows actual authentication without a timer`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let pending;
  await page.route('**/js/firebase-google-auth.js', route => { pending = route; });
  await page.goto('/');
  await expect(page.locator('#walletConnectionLoader')).toBeVisible();
  await expect(page.locator('#firebaseAuthPanel')).toBeHidden();
  await expect(page.locator('#saldoDominadora')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/connection-loader-' + width + '.png' });
  await expect.poll(() => !!pending).toBe(true);
  await pending.fulfill({ contentType: 'text/javascript', body: 'export async function googleAuth(){return {watch(fn){fn(null)}}}' });
  await expect(page.locator('#firebaseAuthPanel')).toBeVisible();
  await expect(page.locator('#walletConnectionLoader')).toBeHidden();
});
