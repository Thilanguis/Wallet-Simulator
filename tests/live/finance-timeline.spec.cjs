const { test, expect } = require('../firebase-fixture.cjs');

test('timeline shows amount and frequency per month without changing the ledger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  const before = await page.evaluate(() => {
    const items = [
      { date: '2026-10-05', amount: 1200 },
      { date: '2026-10-05', amount: 3000 },
      { date: '2026-10-18', amount: 1500, currency: 'USD' },
      { date: '2026-08-01', amount: 1000 },
      { date: '', amount: 2200 },
      { date: '2026-09-01', amount: 8000, status: 'refunded' },
    ];
    const finance = items.reduce((state, item, index) => Finance.update(state, {
      type: 'add',
      entry: { description: `Gasto ${index + 1}`, category: Finance.categories[0], status: 'paid', currency: 'BRL', ...item },
    }), Finance.empty());
    WalletStore.commitFinance(finance);
    return finance;
  });
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#financeTimeline > summary').click();
  const timeline = page.locator('#financeTimelineContent');
  const details = timeline.locator('#financeTimelineMonthDetails');
  await expect(details).toContainText('3 lançamentos · 2 dias');
  await expect(details.locator('.timeline-month-summary')).toContainText(/42,00.*15,00/);
  await expect(timeline.locator('polyline')).toHaveAttribute('points', /50,100/);
  await expect(timeline).toContainText('1 lançamento(s) sem data');
  await expect(timeline.locator('[data-month="2026-09"]')).toHaveCount(0);
  await expect(details.locator('li').first()).toContainText('Gasto 3');
  await timeline.locator('[data-month="2026-08"]').click();
  await expect(details).toContainText('Gasto 4');
  const frequency = await timeline.locator('polyline').getAttribute('points');
  await timeline.getByRole('button', { name: 'Gastos em R$' }).click();
  await expect(timeline.locator('polyline')).not.toHaveAttribute('points', frequency);
  await expect(timeline.locator('#financeTimelineMonth')).toHaveValue('2026-08');
  await expect(timeline.locator('.timeline-cursor')).toHaveAttribute('x1', '0');
  await timeline.locator('#financeTimelineMonth').selectOption('2026-10');
  await expect(details.locator('li')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => WalletStore.finance())).toEqual(before);
});
