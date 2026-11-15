const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [1440, 393])
  test('persistent CAD and display-only toggle ' + width, async ({ page }) => {
    let requests = 0;
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://api.frankfurter.dev/v2/rates?**', (r) => {
      requests++;
      return r.fulfill({ json: [{ base: 'CAD', quote: 'BRL', date: '2025-05-10', rate: 4 }] });
    });
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await page.evaluate(() => {
      let s = Finance.empty();
      s = Finance.update(s, { type: 'add', entry: { id: 'old', date: '2025-05-10', category: 'Lista de Compras', description: 'Compra antiga', amount: 40000, currency: 'BRL', status: 'paid' } });
      FinanceUI.save(s);
    });
    await page.locator('[data-panel=financePanel]').click();
    await expect.poll(() => page.evaluate(() => WalletStore.finance().entries[0].cadReference?.amount)).toBe(10000);
    const saved = await page.evaluate(() => JSON.stringify(WalletStore.finance()));
    const calls = requests;
    await page.locator('#financeShowCad').check();
    await expect(page.locator('#financeCadTotal')).toContainText('100,00');
    await page.locator('#financeShowCad').uncheck();
    await page.locator('#financeShowCad').check();
    expect(requests).toBe(calls);
    expect(await page.evaluate(() => JSON.stringify(WalletStore.finance()))).toBe(saved);
    const heights = await page.evaluate(() => ['.finance-cad-toggle'].map((s) => document.querySelector(s).getBoundingClientRect().height));
    await expect(page.locator('#financePrepareCad')).toHaveCount(0);
    expect(heights[0]).toBe(28);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('[data-note-edit=old]').click();
    await page.locator('#entryCadOriginal').fill('50');
    await expect(page.locator('#entryAmount')).toHaveValue('200,00');
    await page.locator('#entryAmount').fill('600');
    await expect(page.locator('#entryCadOriginal')).toHaveValue('150,00');
    await page.locator('#saveEntry').click();
    await page.locator('[data-dialog-confirm]').click();
    await expect.poll(() => page.evaluate(() => WalletStore.finance().entries[0].amount)).toBe(60000);
    expect(await page.evaluate(() => WalletStore.finance().entries[0].cadReference.kind)).toBe('estimated');
  });
