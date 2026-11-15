const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [1440, 393])
  test('edit purchased products atomically ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://api.frankfurter.dev/v2/rates?**', (r) => r.fulfill({ json: [{ base: 'CAD', quote: 'BRL', date: '2025-05-10', rate: 4 }] }));
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await page.evaluate(() => {
      let s = Finance.empty();
      s = Finance.update(s, {
        type: 'add',
        entry: {
          id: 'buy',
          date: '2025-05-10',
          category: 'Lista de Compras',
          description: 'Compra da Dominadora',
          amount: 40000,
          currency: 'BRL',
          status: 'paid',
          source: 'wishlist',
          note: 'Dominadora · R$ 200,00\n• Anel · Loja: Pandora · R$ 200,00\nBruna · R$ 200,00\n• Creme · Loja: Teste · R$ 200,00',
        },
      });
      AppStorage.setItem(
        'wishlist',
        JSON.stringify([
          { id: 'w1', title: 'Anel', store: 'Pandora', person: 'Dominadora', currency: 'CAD', originalPrice: 50, quantity: 1, bought: true, purchaseNoteId: 'buy' },
          { id: 'w2', title: 'Creme', store: 'Teste', person: 'Bruna', currency: 'CAD', originalPrice: 50, quantity: 1, bought: true, purchaseNoteId: 'buy' },
        ]),
      );
      AppStorage.flush();
      FinanceUI.save(s);
    });
    await page.locator('[data-panel=financePanel]').click();
    await page.locator('#financeShowCad').check();
    await expect(page.locator('#financePrepareCad')).toHaveCount(0);
    await expect(page.locator('[data-note-ids=buy] .note-purchase-breakdown')).toContainText('CAD');
    await page.getByRole('button', { name: 'Editar produto Anel', exact: true }).click();
    const dialog = page.locator('.purchase-items-editor'),
      first = dialog.locator('.purchase-edit-item').first();
    await first.locator('[data-key=cadAmount]').fill('25');
    await first.locator('[data-key=cadAmount]').blur();
    await expect(first.locator('[data-key=amount]')).toHaveValue('100,00');
    await dialog.locator('[data-save]').click();
    await expect(dialog).toHaveCount(0);
    const saved = await page.evaluate(() => ({ entry: WalletStore.finance().entries[0], wishes: JSON.parse(AppStorage.getItem('wishlist')) }));
    expect(saved.entry.amount).toBe(30000);
    expect(saved.entry.purchaseItems).toHaveLength(2);
    expect(saved.entry.purchaseItems[0].wishId).toBe('w1');
    expect(saved.entry.cadReference.amount).toBe(7500);
    expect(saved.wishes[0].purchasePaidBrl).toBe(10000);
    expect(saved.wishes[0].originalPrice).toBe(50);
    expect(saved.wishes[0].bought).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Editar produto Anel', exact: true }).click();
    await expect(page.locator('.purchase-edit-item').first().locator('[data-key=cadAmount]')).toHaveValue('25,00');
    await page.waitForTimeout(300);
    await page.screenshot({path:'.local/purchase-editor-'+width+'.png'});
    await page.locator('.purchase-items-editor [data-close]').click();
  });
