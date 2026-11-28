const { test, expect } = require('../firebase-fixture.cjs');

test('timeline shows six-day periods, including across months, and their amounts without changing the ledger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.route('https://api.frankfurter.dev/v2/rates?**', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  const before = await page.evaluate(() => {
    const items = [
      { date: '2026-10-30', amount: 1200 },
      { date: '2026-10-30', amount: 3000 },
      { date: '2026-11-04', amount: 1500, currency: 'USD' },
      { date: '2026-08-01', amount: 1000 },
      { date: '', amount: 2200, currency: 'USD' },
      { date: '2026-09-01', amount: 8000, status: 'refunded' },
      { date: '2026-10-24', amount: 500 },
    ];
    const finance = items.reduce((state, item, index) => Finance.update(state, {
      type: 'add',
      entry: { description: `Gasto ${index + 1}`, category: Finance.categories[0], status: 'paid', currency: 'BRL', ...item },
    }), Finance.empty());
    WalletStore.commitFinance(finance);
    return finance;
  });
  await page.locator('[data-panel=financePanel]').click();
  const timelineDisclosure = page.locator('#financeTimeline');
  const summary = timelineDisclosure.locator('summary');
  await summary.locator('.finance-timeline-chevron').click({ delay: 180 });
  await expect(timelineDisclosure).toHaveJSProperty('open', true);
  await summary.press('Enter');
  await expect(timelineDisclosure).toHaveJSProperty('open', false);
  const summaryBounds = await summary.boundingBox();
  await summary.click({ position: { x: summaryBounds.width - 3, y: 18 }, delay: 180 });
  await expect(timelineDisclosure).toHaveJSProperty('open', true);
  const timeline = page.locator('#financeTimelineContent');
  const details = timeline.locator('#financeTimelinePeriodDetails');
  await expect(details).toContainText('3 lançamentos · 2 datas · 30/10/2026 a 04/11/2026');
  await expect(details.locator('.timeline-period-summary')).toContainText(/42,00.*15,00/);
  await expect(timeline.locator('polyline')).toHaveAttribute('points', /,100 /);
  await expect(timeline).toContainText('1 lançamento(s) sem data');
  await expect(timeline.locator('[data-period="2026-09-01"]')).toHaveCount(0);
  await expect(details.locator('li').first()).toContainText('Gasto 3');
  await expect(timeline.locator('#financeTimelinePeriod option')).toHaveCount(3);
  await timeline.locator('#financeTimelinePeriod').selectOption('2026-10-24');
  await expect(details).toContainText('1 lançamento · 1 data · 24/10/2026');
  await expect(details.locator('li')).toHaveCount(1);
  await timeline.locator('[data-period="2026-08-01"]').click();
  await expect(details).toContainText('1 lançamento · 1 data · 01/08/2026');
  await expect(details).toContainText('Gasto 4');
  const frequency = await timeline.locator('polyline').getAttribute('points');
  await timeline.getByRole('button', { name: 'Gastos em R$' }).click();
  await expect(timeline.locator('polyline')).not.toHaveAttribute('points', frequency);
  await expect(timeline.locator('#financeTimelinePeriod')).toHaveValue('2026-08-01');
  await expect(timeline.locator('.timeline-cursor')).toHaveAttribute('x1', '0');
  await timeline.locator('#financeTimelinePeriod').selectOption('2026-10-30');
  await expect(details.locator('li')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => WalletStore.finance())).toEqual(before);
});
