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
    await page.locator('[data-note-ids=buy] [data-cad-item]').first().click();
    await expect(page.locator('.finance-cad-explanation')).toContainText('Anel');
    await expect(page.locator('.finance-cad-explanation')).toContainText('25,00');
    await page.locator('.finance-cad-dialog button').click();
    await page.locator('#financeUndo').click();
    const restored = await page.evaluate(() => ({ entry: WalletStore.finance().entries[0], wishes: JSON.parse(AppStorage.getItem('wishlist')) }));
    expect(restored.entry.amount).toBe(40000);
    expect(restored.entry.purchaseItems).toBeUndefined();
    expect(restored.wishes[0].purchasePaidBrl).toBeUndefined();
    expect(restored.wishes[0].originalPrice).toBe(50);
    expect(restored.wishes[0].purchaseNoteId).toBe('buy');
    expect(restored.wishes[0].bought).toBe(true);
  });

for (const hasPaidItem of [true, false]) {
  test('a wishlist purchase accepts explicit zero ' + (hasPaidItem ? 'alongside a paid item' : 'for the entire order'), async ({ page }) => {
    await page.route('https://api.frankfurter.dev/**', route => route.abort());
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await page.evaluate(() => {
      AppStorage.setItem('wishlist', JSON.stringify([
        { id: 'paid', title: 'Creme pago', store: 'Loja', currency: 'BRL', originalPrice: 100 },
        { id: 'sample', title: 'Amostra grátis', store: 'Loja', person: 'Bruna', currency: 'CAD', originalPrice: 0 },
        { id: 'missing', title: 'Preço não informado', store: 'Loja', currency: 'CAD', originalPrice: null },
      ]));
      AppStorage.flush();
      window.dispatchEvent(new Event('wallet:remote'));
    });

    await page.locator('[data-panel=wishlistPanel]').click();
    const checkbox = name => page.getByRole('checkbox', { name: 'Selecionar para compra: ' + name, exact: true });
    const review = page.locator('#wishPurchaseDialog');
    const register = page.getByRole('button', { name: 'Registrar compra', exact: true });
    const confirm = review.getByRole('button', { name: 'Confirmar compra', exact: true });
    const amount = name => review.getByRole('textbox', { name: 'Valor pago em reais por ' + name, exact: true });
    await checkbox('Amostra grátis').check();
    await checkbox('Preço não informado').check();
    await register.click();
    await expect(amount('Amostra grátis')).toHaveValue('0,00');
    await expect(amount('Preço não informado')).toHaveValue('');
    await confirm.click();
    await expect(review).toBeVisible();
    expect(await page.evaluate(() => WalletStore.finance().entries)).toHaveLength(0);
    await review.getByRole('button', { name: 'Fechar revisão da compra' }).click();

    await checkbox('Preço não informado').uncheck();
    if (hasPaidItem) await checkbox('Creme pago').check();
    await register.click();
    await confirm.click();
    await expect(review).toBeHidden();
    const total = hasPaidItem ? 10000 : 0;
    const original = await page.evaluate(() => WalletStore.finance().entries[0]);
    expect(original.amount).toBe(total);
    expect(original.purchaseItems.find(item => item.wishId === 'sample')).toMatchObject({ amount: 0, cadAmount: 0 });
    expect(original.purchaseItems.find(item => item.wishId === 'missing')).toBeUndefined();
    await expect(checkbox('Amostra grátis')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Mostrar comprados' }).check();
    await expect(page.getByRole('checkbox', { name: 'Comprado: Amostra grátis', exact: true })).toBeChecked();

    await page.locator('[data-panel=financePanel]').click();
    await page.getByRole('button', { name: 'Editar produto Amostra grátis', exact: true }).click();
    const editor = page.locator('.purchase-items-editor');
    const sampleTitle = editor.locator('[data-key=title]').nth(hasPaidItem ? 1 : 0);
    await expect(sampleTitle).toHaveValue('Amostra grátis');
    await sampleTitle.fill('Amostra sem custo');
    await editor.locator('[data-save]').click();
    await expect(editor).toHaveCount(0);
    const edited = await page.evaluate(() => ({
      entry: WalletStore.finance().entries[0],
      wish: JSON.parse(AppStorage.getItem('wishlist')).find(item => item.id === 'sample'),
    }));
    expect(edited.entry.amount).toBe(total);
    expect(edited.entry.personAllocations.every(person => person.amount > 0)).toBe(true);
    expect(edited.wish).toMatchObject({ title: 'Amostra sem custo', bought: true, purchasePaidBrl: 0, purchasePaidCad: 0 });
  });
}
