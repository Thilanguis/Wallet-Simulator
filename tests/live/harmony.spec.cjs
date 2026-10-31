const { test, expect } = require('@playwright/test');
for (const width of [1280, 390, 320]) {
  test('mode changes stay in place with distinct income and expense accents at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/firebaseConfiguration.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
    await page.goto('/');
    await page.evaluate(() => window.scrollTo({ top: document.querySelector('.operation-tabs').getBoundingClientRect().top + scrollY - 100, behavior: 'instant' }));
    const top = await page.evaluate(() => scrollY);
    await page.locator('[data-jump=ganho]').click();
    await expect(page.locator('[data-jump=ganho]')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(Math.abs((await page.evaluate(() => scrollY)) - top)).toBeLessThanOrEqual(2);
    await expect(page.locator('[data-jump=ganho] svg')).toHaveCSS('color', 'rgb(139, 204, 165)');
    await page.locator('[data-jump=gasto]').click();
    expect(Math.abs((await page.evaluate(() => scrollY)) - top)).toBeLessThanOrEqual(2);
    await expect(page.locator('[data-jump=gasto] svg')).toHaveCSS('color', 'rgb(206, 143, 137)');
    await expect(page.locator('#selectTarefa')).toHaveCSS('border-top-color', 'rgb(111, 96, 71)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/harmony-' + width + '.png', animations: 'disabled' });
  });
}
test('seal and eligible calculations follow edited gain and discount percentages', async ({ page }) => {
  await page.route('**/firebaseConfiguration.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
  await page.goto('/');
  await page.locator('[data-panel=backupPanel]').click();
  await page.locator('#customEconomy > summary').click();
  const code = page.locator('#customEconomyJson'),
    data = JSON.parse(await code.inputValue());
  data.bonusPercent = 20;
  data.discountPercent = 10;
  await code.fill(JSON.stringify(data));
  await page.locator('#saveCustomEconomy').click();
  await expect(page.locator('#economyCodeMessage')).toContainText('Catálogo salvo');
  await page.locator('[data-panel=simulator]').click();
  await expect(page.locator('#privilegeBenefits')).toHaveText('+20% nos ganhos · −10% nos serviços elegíveis');
  await page.locator('#privilegeSeal').click();
  await page.locator('#selectTarefa').selectOption({ index: 1 });
  await expect(page.locator('#previewDescontoCompra')).toContainText('27,00');
  await page.reload();
  await expect(page.locator('#privilegeBenefits')).toContainText('+20%');
  await expect(page.locator('#privilegeBenefits')).toContainText('−10%');
  await page.locator('[data-jump=ganho]').click();
  await page.locator('#selectGanho').selectOption('Tapa de pé na cara');
  await page.locator('#adicionar').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 2,40');
});
