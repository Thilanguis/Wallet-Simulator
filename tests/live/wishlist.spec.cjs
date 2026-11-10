const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [393, 1440])
  test(`wishlist ${width} keeps the selection total visible while scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await page.evaluate(() => {
      AppStorage.setItem('wishlist', JSON.stringify(Array.from({ length: 25 }, (_, index) => ({
        id: 'sticky-' + index, title: 'Produto ' + (index + 1), originalPrice: 25, currency: 'BRL',
      }))));
      AppStorage.flush();
      window.dispatchEvent(new Event('wallet:remote'));
    });
    await page.locator('[data-panel=wishlistPanel]').click();
    const totalBar = page.locator('#wishlistPanel .list-top-total');
    const heading = page.getByRole('heading', { name: 'Lista de Desejos', exact: true });
    const last = page.getByRole('checkbox', { name: 'Comprado: Produto 25', exact: true });
    expect((await totalBar.boundingBox()).y).toBeGreaterThan(8);
    await last.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(heading).not.toBeInViewport();
    expect((await totalBar.boundingBox()).y).toBeCloseTo(8, 0);
    await last.check();
    await expect(totalBar).toContainText('25,00');
    expect((await totalBar.boundingBox()).y).toBeCloseTo(8, 0);
    await page.locator('[data-panel=simulator]').evaluate((button) => button.click());
    await expect(totalBar).toBeHidden();
  });

for (const width of [393, 1440])
  test(`wishlist ${width} registers a confirmed purchase and preserves bought items`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 393) await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.clock.install();
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    const before = await page.evaluate(() => ({ finance: WalletStore.finance(), balance: AppStorage.getItem('saldoDominadora') }));
    await page.locator('[data-panel=wishlistPanel]').click();
    await page.locator('#wishEditor > summary').click();
    let metadata = width === 393
      ? '<meta property="og:image" content="/product-photo.svg">'
      : '<script type="application/ld+json">{"@type":"Product","image":[{"contentUrl":"/product-photo.svg"}]}</script>';
    await page.route('https://example.invalid/*photo.svg', (r) =>
      r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="orange"/></svg>' }),
    );
    await page.route('https://example.invalid/product', (r) =>
      r.fulfill({ contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<title>Produto de teste</title><meta property="product:price:amount" content="42.50"><meta property="product:price:currency" content="BRL">' + metadata }),
    );
    await page.locator('#wishUrl').fill('https://example.invalid/product');
    await page.locator('#wishRead').click();
    await expect(page.locator('#wishTitle')).toHaveValue('Produto de teste');
    await expect(page.locator('#wishPrice')).toHaveValue('42.5');
    await expect(page.locator('#wishImagePreview img')).toHaveAttribute('src', 'https://example.invalid/product-photo.svg');
    await page.getByLabel('Quantidade', { exact: true }).fill('2');
    await page.locator('#wishSave').click();
    await expect(page.locator('.wish-row')).toHaveCount(1);
    const total = page.locator('#wishTotal');
    const checkbox = page.locator('.wish-row input');
    await expect(total).toHaveText(/R\$\s*0,00/);
    if (width === 393) {
      expect(await checkbox.evaluate((element) => {
        element.click();
        return document.getElementById('wishTotal').textContent;
      })).toContain('85,00');
    } else {
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await checkbox.evaluate((element) => element.click());
      await page.clock.runFor(250);
      const readCounter = (text) => Number(text.replace(/[^\d,]/g, '').replace(',', '.'));
      const mid = readCounter(await total.textContent());
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(85);
      await page.clock.runFor(450);
      await page.clock.resume();
    }
    await expect(page.locator('#wishTotalLabel')).toHaveText('Seleção · estimativa');
    await expect(page.locator('#wishTotal')).toContainText('85,00');
    expect(await page.locator('#wishTotal').evaluate(el => el.getBoundingClientRect().top < document.querySelector('.wish-row').getBoundingClientRect().top)).toBe(true);
    expect(await page.evaluate(() => ({ finance: WalletStore.finance(), balance: AppStorage.getItem('saldoDominadora') }))).toEqual(before);
    await page.getByRole('button', { name: 'Registrar compra', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
    await expect(page.locator('#wishSummary')).toHaveText('0 a comprar · 2 comprado(s)');
    await expect(total).toHaveText(/R\$\s*0,00/);
    const after = await page.evaluate(() => ({ entries: WalletStore.finance().entries, balance: AppStorage.getItem('saldoDominadora') }));
    expect(after.balance).toBe(before.balance);
    expect(after.entries).toHaveLength(before.finance.entries.length + 1);
    expect(after.entries.at(-1)).toMatchObject({ category: 'Lista de Compras', amount: 8500, status: 'paid' });
    await page.reload();
    await page.locator('[data-panel=wishlistPanel]').click();
    await expect(page.locator('.wish-row input')).toBeChecked();
    await expect.poll(() => page.locator('.wish-row img').evaluate((image) => image.naturalWidth)).toBe(80);
    await page.getByRole('button', { name: 'Editar Produto de teste', exact: true }).click();
    await expect(page.getByLabel('Quantidade', { exact: true })).toHaveValue('2');
    await page.getByLabel('Quantidade', { exact: true }).fill('3');
    await page.locator('#wishTitle').fill('Alterado');
    await page.locator('#wishPrice').fill('39');
    metadata = '<meta property="og:image" content="/updated-photo.svg">';
    await page.locator('#wishRead').click();
    await expect(page.locator('#wishImagePreview img')).toHaveAttribute('src', 'https://example.invalid/updated-photo.svg');
    await expect(page.locator('#wishPrice')).toHaveValue('39');
    await page.locator('#wishSave').click();
    await expect(page.locator('.wish-row a')).toHaveText('Alterado ×3');
    await expect(page.locator('.wish-row img')).toHaveAttribute('src', 'https://example.invalid/updated-photo.svg');
    await page.screenshot({ path: '.local/wishlist-' + width + '.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Excluir Alterado', exact: true }).click();
    await page.locator('[data-dialog-cancel]').click();
    await expect(page.locator('.wish-row')).toHaveCount(1);
  });

test('groups wishes from multiple people in one dated expense with contributions', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 850 });
  await page.route('https://api.frankfurter.dev/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.evaluate(() => {
    AppStorage.setItem('wishlist', JSON.stringify([
      { id: 'one', title: 'Colar', store: 'Shein', originalPrice: 60, currency: 'BRL', quantity: 2 },
      { id: 'two', title: 'Bolsa', store: 'Loja <teste>', person: 'Ana', originalPrice: 15, currency: 'CAD', quantity: 3 },
      { id: 'three', title: 'Anel', store: 'SHEIN', person: 'Bruna', originalPrice: 30, currency: 'BRL' },
    ]));
    AppStorage.setItem('wishlistFx', JSON.stringify({ rates: { CAD: 4, USD: 5 }, dates: {} }));
    AppStorage.flush();
    window.dispatchEvent(new Event('wallet:remote'));
  });
  await page.locator('[data-panel=wishlistPanel]').click();
  const top = page.locator('#wishlistPanel .list-top-total');
  const total = page.locator('#wishTotal');
  const groupTotals = page.locator('.wish-group-total');
  const zeroGroups = [/2 a comprar · CAD 0,00 · ≈ R\$\s*0,00/, /3 a comprar · CAD 0,00 · ≈ R\$\s*0,00/, /1 a comprar · CAD 0,00 · ≈ R\$\s*0,00/];
  await expect(top).toContainText(/CAD 0,00\s*≈ R\$\s*0,00/);
  await expect(groupTotals).toHaveText(zeroGroups);
  const all = page.locator('#wishSelectAllPurchase');
  const ana = page.getByRole('checkbox', { name: 'Selecionar todos de Ana para compra' });
  const stores = page.getByRole('combobox', { name: 'Filtrar por loja' });
  const hideBought = page.getByRole('checkbox', { name: 'Ocultar comprados' });
  await expect(stores.locator('option')).toHaveText(['Todas as lojas', 'Shein', 'Loja <teste>']);
  await expect(page.locator('.wish-store-group').filter({ hasText: 'Shein' }).first()).toContainText('Colar');
  await ana.check();
  await stores.selectOption({ label: 'Shein' });
  await expect(page.locator('.wish-row')).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: 'Comprado: Bolsa' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Comprado: Colar' })).not.toBeChecked();
  await all.check();
  await expect(page.getByRole('checkbox', { name: 'Comprado: Colar' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Comprado: Anel' })).toBeChecked();
  await expect(total).toContainText('150,00');
  await page.getByRole('button', { name: 'Limpar seleção' }).click();
  await stores.selectOption('');
  await ana.check();
  await expect(all).toHaveJSProperty('indeterminate', true);
  await expect(page.getByRole('checkbox', { name: 'Comprado: Bolsa' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Comprado: Colar' })).not.toBeChecked();
  await expect(top).toContainText(/Seleção · estimativa\s*CAD 45,00\s*≈ R\$\s*180,00/);
  await expect(groupTotals).toHaveText([zeroGroups[0], /3 selecionados · CAD 45,00 · ≈ R\$\s*180,00/, zeroGroups[2]]);
  await page.getByRole('checkbox', { name: 'Comprado: Colar' }).check();
  await expect(total).toContainText('300,00');
  await all.check();
  await expect(page.locator('#wishPurchaseCount')).toHaveText('6 itens na compra');
  await expect(top).toContainText(/CAD 45,00\s*≈ R\$\s*330,00/);
  await expect(groupTotals.filter({ hasText: 'selecionado' })).toHaveCount(3);
  await ana.uncheck();
  await expect(all).toHaveJSProperty('indeterminate', true);
  await expect(page.getByRole('checkbox', { name: 'Comprado: Bolsa' })).not.toBeChecked();
  await expect(page.locator('#wishOriginalTotal')).toHaveText('CAD 0,00');
  await expect(total).toContainText('150,00');
  await page.getByRole('button', { name: 'Limpar seleção' }).click();
  await expect(top).toContainText(/CAD 0,00\s*≈ R\$\s*0,00/);
  await expect(groupTotals).toHaveText(zeroGroups);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await all.check();
  const dialog = page.locator('#wishPurchaseDialog');
  const bolsa = dialog.getByRole('textbox', { name: 'Valor pago em reais por Bolsa' });
  await page.getByRole('button', { name: 'Registrar compra', exact: true }).click();
  await expect(bolsa).toHaveValue('180,00');
  await expect(dialog.locator('#wishPurchaseTotal')).toContainText('330,00');
  await dialog.getByRole('button', { name: 'Fechar revisão da compra' }).click();
  expect(await page.evaluate(() => WalletStore.finance().entries)).toHaveLength(0);

  await page.evaluate(() => {
    const convert = WishFx.convert;
    try {
      WishFx.convert = (value, currency) => currency === 'CAD' ? null : convert(value, currency);
      document.getElementById('wishReviewPurchase').click();
    } finally {
      WishFx.convert = convert;
    }
  });
  await expect(bolsa).toHaveValue('');
  await expect(bolsa).toHaveAttribute('placeholder', 'Informe em R$');
  await expect(dialog.locator('#wishPurchaseTotal')).toHaveText('—');
  await dialog.getByRole('button', { name: 'Fechar revisão da compra' }).click();
  await page.getByRole('button', { name: 'Registrar compra', exact: true }).click();
  await expect(bolsa).toHaveValue('180,00');
  await bolsa.fill('45,00');
  await dialog.getByRole('textbox', { name: 'Contribuição de Ana' }).fill('20,00');
  await dialog.getByRole('textbox', { name: 'Contribuição de Bruna' }).fill('10,00');
  await dialog.locator('#wishPurchaseDate').fill('2026-01-18');
  await expect(dialog.locator('#wishPurchaseTotal')).toContainText('195,00');
  await expect(dialog.locator('#wishPurchaseNet')).toContainText('165,00');
  await dialog.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(page.locator('#wishSummary')).toHaveText('0 a comprar · 6 comprado(s)');
  const [entry] = await page.evaluate(() => WalletStore.finance().entries);
  expect(entry).toMatchObject({ date: '2026-01-18', amount: 19500, category: 'Lista de Compras' });
  expect(entry.note).toMatch(/Dominadora · R\$\s*120,00[\s\S]*Colar ×2[\s\S]*Ana · R\$\s*45,00 · contribuição R\$\s*20,00[\s\S]*Bolsa ×3[\s\S]*Bruna · R\$\s*30,00 · contribuição R\$\s*10,00/);
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')).map((item) => item.purchaseNoteId))).toEqual([entry.id, entry.id, entry.id]);
  await page.locator('[data-panel=financePanel]').click();
  const purchase = page.locator('#groupedFinanceList .notebook-line').filter({ hasText: 'Compra da Dominadora' });
  const heading = purchase.locator('.note-entry-featured');
  await expect(heading.locator('.note-entry-title')).toContainText('Compra da Dominadora');
  await expect(heading.locator('.note-entry-amount')).toHaveText(/R\$\s*195,00/);
  await expect(heading.locator('.note-dates time')).toHaveText('18/01/2026');
  await expect(purchase.locator('.note-purchase-person-heading')).toHaveText([/Dominadora\s*R\$\s*120,00/, /Ana\s*R\$\s*45,00/, /Bruna\s*R\$\s*30,00/]);
  const people = purchase.locator('.note-purchase-breakdown > .note-purchase-person');
  await expect(people).toHaveCount(3);
  await expect(people.nth(0).locator('.note-purchase-store > strong')).toHaveText('Shein');
  await expect(people.nth(0).locator('.note-purchase-store li')).toHaveText(/Colar ×2.*120,00/);
  await expect(people.nth(1).locator('.note-purchase-store > strong')).toHaveText('Loja <teste>');
  await expect(people.nth(1).locator('.note-purchase-store li')).toHaveText(/Bolsa ×3.*45,00/);
  await expect(people.nth(2).locator('.note-purchase-store > strong')).toHaveText('SHEIN');
  await expect(people.nth(2).locator('.note-purchase-store li')).toHaveText(/Anel.*30,00/);
  await expect(purchase.locator('.note-purchase-payment')).toContainText('165,00');
  expect(await purchase.evaluate((row) => row.querySelector('.note-dates').getBoundingClientRect().bottom < row.querySelector('.note-purchase-breakdown').getBoundingClientRect().top)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#homeTotal')).toContainText('195,00');
  await page.locator('[data-panel=wishlistPanel]').click();
  await stores.selectOption({ label: 'Shein' });
  await expect(page.locator('.wish-row')).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: 'Comprado: Colar' })).toBeChecked();
  await hideBought.check();
  await expect(page.locator('.wish-row')).toHaveCount(0);
  await expect(page.locator('#wishSummary')).toHaveText('Nenhum item com esses filtros.');
  await page.locator('[data-panel=financePanel]').click();

  const undo = purchase.getByRole('button', { name: 'Desfazer compra' });
  await undo.click();
  await page.locator('[data-dialog-cancel]').click();
  await expect(purchase).toBeVisible();
  expect(await page.evaluate(() => WalletStore.finance().entries.map((item) => item.id))).toEqual([entry.id]);
  await undo.click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#wishlistPanel')).toBeVisible();
  await expect(stores).toHaveValue('');
  await expect(hideBought).toBeChecked();
  await expect(page.locator('.wish-row')).toHaveCount(3);
  await expect(page.locator('#wishSummary')).toHaveText('6 a comprar · 0 comprado(s)');
  await expect(page.locator('.wish-row input:checked')).toHaveCount(0);
  await expect(top).toContainText(/CAD 0,00\s*≈ R\$\s*0,00/);
  const reverted = await page.evaluate(() => ({ finance: WalletStore.finance(), wishes: JSON.parse(AppStorage.getItem('wishlist')) }));
  expect(reverted.finance.entries).toHaveLength(0);
  expect(reverted.finance.audit.at(-1)).toMatchObject({ entryId: entry.id, type: 'delete' });
  expect(reverted.wishes).toMatchObject([
    { id: 'one', store: 'Shein', originalPrice: 60, quantity: 2, bought: false },
    { id: 'two', person: 'Ana', currency: 'CAD', quantity: 3, bought: false },
    { id: 'three', person: 'Bruna', bought: false },
  ]);
  expect(reverted.wishes.every((item) => item.purchaseNoteId === undefined)).toBe(true);

  await page.evaluate(() => {
    let state = WalletStore.finance();
    for (const [description, note] of [
      ['Compra antiga', 'Dominadora · R$ 50,00\n  • Produto antigo · R$ 50,00'],
      ['Compra da Dominadora', 'Dominadora · R$ 30,00\n  • Vestido · Loja: Shein · R$ 30,00\nAna · R$ 20,00\n  • Bolsa · Loja: SHEIN · R$ 20,00'],
      ['Compra em várias lojas', 'Dominadora · R$ 40,00\n  • Blusa · Loja: Shein · R$ 10,00\n  • Anel · Loja: Pandora · R$ 20,00\n  • Saia · Loja: SHEIN · R$ 10,00\nAna · R$ 10,00\n  • Colar · R$ 10,00'],
      ['Compra com observação livre', 'Observação revisada à mão.'],
    ]) {
      state = Finance.update(state, { type: 'add', entry: {
        id: crypto.randomUUID(), date: '2026-01-17', description, category: 'Lista de Compras',
        amount: 5000, currency: 'BRL', status: 'paid', source: 'wishlist', note,
      } });
    }
    WalletStore.commitFinance(state);
  });
  await page.locator('[data-panel=financePanel]').click();
  await expect(page.locator('.note-purchase-person li').filter({ hasText: 'Produto antigo' })).toContainText('50,00');
  const sheinPurchase = page.locator('#groupedFinanceList .notebook-line').filter({ hasText: /Shein ✅: R\$\s*50,00/ });
  await expect(sheinPurchase.locator('.note-purchase-person')).toHaveCount(2);
  await expect(sheinPurchase.locator('.note-purchase-store')).toHaveCount(0);
  const mixed = page.locator('#groupedFinanceList .notebook-line').filter({ hasText: 'Compra em várias lojas' });
  const mixedPeople = mixed.locator('.note-purchase-breakdown > .note-purchase-person');
  await expect(mixedPeople.nth(0).locator('.note-purchase-store > strong')).toHaveText(['Shein', 'Pandora']);
  await expect(mixedPeople.nth(0).locator('.note-purchase-store').first().locator('li')).toHaveText([/Blusa/, /Saia/]);
  await expect(mixedPeople.nth(1).locator('.note-purchase-store > strong')).toHaveText('Sem loja informada');
  await expect(mixedPeople.nth(1).locator('.note-purchase-store li')).toHaveText(/Colar.*10,00/);
  const freeNote = page.locator('#groupedFinanceList .notebook-line').filter({ hasText: 'Compra com observação livre' });
  await expect(freeNote.locator('.note-entry-heading .note-entry-title')).toContainText('Compra com observação livre');
  await expect(freeNote.locator('.note-entry-heading .note-entry-amount')).toHaveText(/R\$\s*50,00/);
  await expect(freeNote.locator('.note-entry-heading time')).toHaveText('17/01/2026');
  await expect(freeNote.locator('.note-entry-observation')).toHaveText('Observação revisada à mão.');
  await expect(freeNote.locator('.note-entry-featured')).toHaveCount(0);
  await expect(freeNote.locator('.note-purchase-breakdown')).toHaveCount(0);
  await expect(freeNote.getByRole('button', { name: 'Desfazer compra' })).toHaveCount(0);
});
