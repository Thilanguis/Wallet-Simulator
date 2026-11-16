const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [1440, 768, 393])
  test('tactile tabs and buttons preserve wallet at ' + width, async ({ page, context }) => {
    await context.route('https://firestore.googleapis.com/**', (r) => r.abort());
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
    const before = await page.evaluate(() => ({ entries: WalletStore.finance().entries, balance: AppStorage.getItem('saldoDominadora'), history: AppStorage.getItem('historico') }));
    const gain = page.locator('[data-jump=ganho]');
    await gain.scrollIntoViewIfNeeded();
    const rect = await gain.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await expect(gain).toHaveClass(/motion-pressed/);
    await expect(gain.locator('.motion-ripple')).toHaveCount(1);
    await page.mouse.up();
    await expect(gain).not.toHaveClass(/motion-pressed/);
    await expect(gain).toHaveAttribute('aria-pressed', 'true');
    const notesTab = page.locator('[data-panel=financePanel]');
    await notesTab.scrollIntoViewIfNeeded();
    const notesRect = await notesTab.boundingBox();
    await page.mouse.move(notesRect.x + notesRect.width / 2, notesRect.y + notesRect.height / 2);
    await page.mouse.down();
    await expect(notesTab).toHaveClass(/motion-pressed/);
    await page.waitForTimeout(160); // Hold through the physical press transition.
    await page.mouse.up();
    await expect(page.locator('#financePanel')).toBeVisible();
    const indicator = page.locator('.motion-nav-indicator'),
      tab = page.locator('[data-panel=financePanel]');
    await expect
      .poll(async () => {
        const a = await indicator.boundingBox(),
          b = await tab.boundingBox();
        return Math.abs(a.x - b.x) < 1 && Math.abs(a.width - b.width) < 1;
      })
      .toBe(true);
    await page.locator('#financeFilters > summary').click();
    await expect(page.locator('#financePerson')).toBeVisible();
    await page.locator('#financeFilters > summary').click();
    await page.locator('[data-panel=wishlistPanel]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#wishlistPanel')).toBeVisible();
    await expect(page.locator('.motion-pressed')).toHaveCount(0);
    await expect(page.locator('.motion-ripple')).toHaveCount(0);
    const after = await page.evaluate(() => ({ entries: WalletStore.finance().entries, balance: AppStorage.getItem('saldoDominadora'), history: AppStorage.getItem('historico') }));
    expect(after).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/motion-nav-' + width + '.png', animations: 'disabled' });
  });
test('reduced motion removes touch waves and transition animations', async ({ page, context }) => {
  await context.route('https://firestore.googleapis.com/**', (r) => r.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 393, height: 900 });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
  await page.locator('[data-panel=financePanel]').click();
  await expect(page.locator('#financePanel')).toBeVisible();
  await expect(page.locator('.motion-ripple')).toHaveCount(0);
  await expect(page.locator('.motion-pressed')).toHaveCount(0);
  expect(await page.locator('.motion-nav-indicator').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(await page.locator('#financePanel').evaluate((el) => el.getAnimations().length)).toBe(0);
});
