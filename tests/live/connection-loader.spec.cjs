const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [393, 768, 1440])
  test(`connection indicator ${width} follows actual authentication without a timer`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let pending;
    await page.route('**/js/firebase-google-auth.js', (route) => {
      pending = route;
    });
    await page.goto('/');
    await expect(page.locator('#walletConnectionLoader')).toBeVisible();
    await expect(page.locator('.connection-mark img')).toHaveAttribute('src', 'icons/wallet.svg');
    expect(await page.locator('.connection-mark img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('#walletConnectionStage')).toHaveText('Conectando com segurança…');
    await expect(page.locator('#firebaseAuthPanel')).toBeHidden();
    await expect(page.locator('#saldoDominadora')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/connection-loader-' + width + '.png' });
    await expect.poll(() => !!pending).toBe(true);
    await pending.fulfill({ contentType: 'text/javascript', body: 'export async function googleAuth(){return {watch(fn){fn(null)}}}' });
    await expect(page.locator('#firebaseAuthPanel')).toBeVisible();
    await expect(page.locator('#walletConnectionLoader')).toBeHidden();
  });

test('loading advances with authentication and closes only after the wallet arrives', async ({ page, context }) => {
  await context.route('https://firestore.googleapis.com/**', (r) => r.abort());
  let transport;
  await page.route('**/js/firebase-primary-transport.js', (route) => {
    transport = route;
  });
  await page.goto('/');
  await expect(page.locator('#walletConnectionStage')).toHaveText('Conferindo acesso à carteira…');
  await expect(page.locator('#walletConnectionLoader')).toBeVisible();
  await expect(page.locator('#saldoDominadora')).toBeHidden();
  await expect.poll(() => !!transport).toBe(true);
  await transport.fallback();
  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
  await expect(page.locator('#walletConnectionLoader')).toBeHidden();
  await expect(page.locator('#saldoDominadora')).toBeVisible();
});
test('a connection error leaves the loading state and exposes recovery', async ({ page }) => {
  await page.route('**/js/firebase-google-auth.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export async function googleAuth(){throw new Error("Conexão indisponível")}' }));
  await page.goto('/');
  await expect(page.locator('#walletConnectionLoader')).toBeHidden();
  await expect(page.locator('#firebaseAuthMessage')).toContainText('Conexão indisponível');
  await expect(page.locator('#retryFirebaseConnection')).toBeVisible();
});
test('reduced motion keeps a static loading indicator', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let auth;
  await page.route('**/js/firebase-google-auth.js', (route) => {
    auth = route;
  });
  await page.goto('/');
  await expect(page.locator('#walletConnectionLoader')).toBeVisible();
  expect(await page.locator('.connection-spinner').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await expect.poll(() => !!auth).toBe(true);
  await auth.fulfill({ contentType: 'text/javascript', body: 'export async function googleAuth(){return {watch(fn){fn(null)}}}' });
  await expect(page.locator('#walletConnectionLoader')).toBeHidden();
});
