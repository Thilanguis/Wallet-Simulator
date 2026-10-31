const { test, expect } = require('@playwright/test');
for (const width of [393, 360, 320]) {
  test.describe('touch phone ' + width, () => {
    test.use({ viewport: { width, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
    test('active bonus has no edge overlay and compact usable balance', async ({ page }) => {
      await page.route('**/firebaseConfiguration.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
      await page.addInitScript(() => {
        localStorage.setItem('saldoDominadora', '115.67');
        localStorage.setItem('bonusEspecialAtivo', 'true');
      });
      await page.goto('/');
      await expect(page.locator('#privilegeSeal')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#fx-embers')).toBeHidden();
      expect((await page.locator('#walletBalanceCard').boundingBox()).height).toBeLessThan(width < 360 ? 450 : 410);
      const label = await page.locator('.saldo-label').boundingBox(),
        money = await page.locator('#saldoDominadora').boundingBox();
      expect(Math.abs(label.y - money.y)).toBeLessThan(35);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: '.local/mobile-fixed-' + width + '.png', animations: 'disabled' });
      await page.locator('#privilegeSeal').click();
      await expect(page.locator('#privilegeSeal')).toHaveAttribute('aria-pressed', 'false');
      await page.locator('[data-panel=financePanel]').click();
      await expect(page.locator('#groupedFinanceList .notebook-group')).toHaveCount(9);
      await expect(page.locator('#fx-embers')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
