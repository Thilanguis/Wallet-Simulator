const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [1280, 390, 320]) {
  test('wallet mode and bonus presentation at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/firebaseConfiguration.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
    await page.goto('/');
    await expect(page.locator('body')).not.toHaveClass(/firebase-required/);
    const gain = page.locator('[data-jump=ganho]'),
      shop = page.locator('[data-jump=gasto]');
    await expect(page.locator('[data-panel=simulator] .nav-label-desktop')).toHaveText('Minha Carteira');
    await expect(page.locator('#walletBalanceCard h2')).toHaveText('Resumo da Carteira');
    await expect(shop).toHaveAttribute('aria-pressed', 'true');
    await expect(shop.locator('.operation-selected')).toBeVisible();
    await expect(gain.locator('.operation-selected')).toBeHidden();
    await expect(shop).toHaveCSS('border-top-color', 'rgb(206, 143, 137)');
    await expect(gain).toHaveCSS('background-color', 'rgb(36, 33, 30)');
    await gain.click();
    await expect(gain).toHaveAttribute('aria-pressed', 'true');
    await expect(shop).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#ganhoFields')).toBeVisible();
    await expect(page.locator('#timerVisualStatus')).toContainText('Parado');
    await shop.click();
    await expect(page.locator('#compraFields')).toBeVisible();
    await expect(page.locator('label[for=selectTarefa]')).toHaveText('Selecione um serviço');
    const toggle = page.locator('#privilegeSeal');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.focus();
    await toggle.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#saldoDominadora')).toHaveText('R$ 0,00');
    expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/wallet-hierarchy-' + width + '.png', animations: 'disabled' });
  });
}
