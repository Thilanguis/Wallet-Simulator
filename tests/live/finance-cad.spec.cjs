const { test, expect } = require('../firebase-fixture.cjs');
async function start(page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('https://api.frankfurter.dev/v2/rates?**', (r) => {
    const u = new URL(r.request().url());
    return r.fulfill({ json: [{ base: 'CAD', quote: 'BRL', date: u.searchParams.get('date') || '2025-12-30', rate: 4 }] });
  });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=financePanel]').click();
}
for (const width of [1440, 393])
  test('all entries convert with interpolated dates ' + width, async ({ page }) => {
    await start(page, width);
    await page.evaluate(() => {
      let s = Finance.empty();
      for (const [id, date, amount] of [
        ['a', '2025-05-10', 60000],
        ['b', '', 20000],
        ['c', '2025-05-20', 20000],
      ])
        s = Finance.update(s, { type: 'add', entry: { id, date, amount, currency: 'BRL', category: 'Lista de Compras', description: 'Compra ' + id, store: 'Teste', status: 'paid' } });
      FinanceUI.save(s);
    });
    await expect(page.locator('#financeShowCad')).not.toBeChecked();
    await expect(page.locator('.note-cad')).toHaveCount(0);
    await page.locator('#financeShowCad').check();
    await expect(page.locator('#financePrepareCad')).toBeEnabled();
    await expect(page.locator('#financeCadTotal')).toContainText('250,00');
    await expect(page.locator('#groupedFinanceList .note-cad')).toHaveCount(3);
    expect(await page.evaluate(() => WalletStore.finance().entries.every((e) => !e.cadReference))).toBe(true);
    await page.locator('#financePrepareCad').click();
    await expect(page.locator('.cad-review')).toContainText('2025-05-15');
    await expect(page.locator('.cad-review')).toContainText('data interpolada');
    await page.locator('[data-apply]').click();
    expect(await page.evaluate(() => WalletStore.finance().entries.map((e) => [e.amount, e.date, e.cadReference.amount, e.cadReference.referenceDate]))).toEqual([
      [60000, '2025-05-10', 15000, '2025-05-10'],
      [20000, '', 5000, '2025-05-15'],
      [20000, '2025-05-20', 5000, '2025-05-20'],
    ]);
    await page.locator('#financeShowCad').uncheck();
    await expect(page.locator('.note-cad')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
test('annual fallback and immutable original CAD', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    const mk = (id, date, category = 'Lista de Compras') => ({ id, date, category, description: id, currency: 'BRL', amount: 40000, status: 'paid' });
    const a = mk('a', '2025-05-10'),
      b = mk('b', ''),
      c = mk('c', ''),
      d = mk('d', '2025-05-19');
    const dates = [b, c].map((e) => FinanceCad.dateFor(e, [a, b, c, d]).date);
    const from = FinanceCad.fromWishes([{ currency: 'CAD', originalPrice: 50, quantity: 2, taxQuebec: true }], 45000);
    const annual = await FinanceCad.referenceFor(mk('x', '', 'Perfil'), [a, mk('x', '', 'Perfil')]);
    return { dates, from, annual };
  });
  expect(result.dates).toEqual(['2025-05-13', '2025-05-16']);
  expect(result.from.amount).toBe(11498);
  expect(result.annual.method).toBe('annual');
  expect(result.annual.amount).toBe(10000);
});
test('no incomplete aggregate and manual CAD entry', async ({ page }) => {
  await start(page, 393);
  await page.evaluate(() => {
    let s = Finance.empty();
    s = Finance.update(s, { type: 'add', entry: { id: 'missing', date: '', category: 'Lista de Compras', description: 'Sem data', amount: 4300000, currency: 'BRL', status: 'paid' } });
    FinanceUI.save(s);
  });
  await page.locator('#financeShowCad').check();
  await expect(page.locator('#financeCadTotal')).toContainText('indisponível');
  await expect(page.locator('#financeCadTotal')).not.toContainText('0,00');
  await page.locator('[data-note-edit=missing]').click();
  await page.locator('#entryCadOriginal').fill('10000');
  await page.locator('#saveEntry').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#financeCadTotal')).toContainText('10.000,00');
  expect(await page.evaluate(() => WalletStore.finance().entries[0].amount)).toBe(4300000);
});
