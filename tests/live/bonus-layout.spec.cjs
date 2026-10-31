const { test, expect } = require('@playwright/test');
for (const width of [1280, 393]) {
  test('gain focus leaves bonus note in flow and contract follows roulette at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/firebaseConfiguration.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
    await page.goto('/');
    await page.locator('#privilegeSeal').click();
    await page.locator('[data-jump=ganho]').click();
    const select = page.locator('#selectGanho'),
      badge = page.locator('#bonusEspecialInline');
    await select.focus();
    await select.press('Alt+ArrowDown');
    await select.press('Escape');
    await expect(select).toHaveCSS('background-color', 'rgb(26, 26, 26)');
    await expect(badge).toContainText('+15%');
    const gap = () => select.evaluate((el) => document.getElementById('bonusEspecialInline').getBoundingClientRect().top - el.getBoundingClientRect().bottom);
    expect(await gap()).toBeGreaterThanOrEqual(7);
    expect(await badge.evaluate((el) => getComputedStyle(el).position)).toBe('static');
    expect(await page.evaluate(() => document.getElementById('valorGanho').getBoundingClientRect().top > document.getElementById('bonusEspecialInline').getBoundingClientRect().bottom)).toBe(true);
    await select.selectOption('Tapa de pé na cara');
    await page.locator('#valorGanho').focus();
    await select.focus();
    expect(await gap()).toBeGreaterThanOrEqual(7);
    expect(await page.locator('#rouletteSection').evaluate((el) => el.nextElementSibling.id)).toBe('contractOccurrences');
    await page.locator('#contractOccurrences > summary').click();
    await expect(page.locator('[data-contract-rule=creamPenalty] small')).toContainText('creme nos pés');
    await page.locator('[data-contract-rule=creamPenalty]').click();
    await expect(page.locator('#contractPenaltyPreview')).toContainText('40,00');
    await page.locator('#registerContractOccurrence').click();
    await page.locator('[data-dialog-cancel]').click();
    await expect(page.locator('#saldoDominadora')).toHaveText('R$ 0,00');
    await page.locator('[data-jump=ganho]').click();
    await select.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.local/bonus-layout-' + width + '.png', animations: 'disabled' });
    await page.locator('#privilegeSeal').click();
    await expect(badge).toContainText('desligado');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
