const {test,expect}=require('../firebase-fixture.cjs');
for(const width of [1440,393]) test(`list menus ${width} preserve totals and open editors on demand`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.goto('/');await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
 await page.locator('[data-panel=wishlistPanel]').click();await expect(page.locator('#wishForm')).toBeHidden();await page.locator('#wishEditor > summary').click();
 await page.locator('#wishUrl').fill('https://example.invalid/product');await page.locator('#wishTitle').fill('Desejo teste');await page.locator('#wishStore').fill('Loja teste');await page.locator('#wishPrice').fill('25');await page.locator('#wishSave').click();
 await expect(page.locator('#wishForm')).toBeHidden();await page.locator('#wishSelectAllPurchase').check();await expect(page.locator('#wishTotal')).toContainText('25,00');await expect(page.locator('.wish-group-total')).toContainText('25,00');
 await page.getByRole('button',{name:'Editar Desejo teste',exact:true}).click();await expect(page.locator('#wishForm')).toBeVisible();await page.locator('#wishCancel').click();await page.locator('#wishEditor > summary').click();
 await page.screenshot({path:'.local/wishlist-menus-'+width+'.png'});
 await page.locator('[data-panel=financePanel]').click();await expect(page.locator('#entryForm')).toBeHidden();await expect(page.locator('#financeImportTitle')).toBeHidden();await expect(page.locator('#financePanel')).not.toContainText('Sua lista de jogos');
 await expect(page.locator('#groupedFinanceList .notebook-group')).toHaveCount(9);
 await page.locator('[data-finance-jump=entry]').click();await expect(page.locator('#entryForm')).toBeVisible();await page.locator('#entryDescription').fill('Rascunho');await page.locator('[data-finance-jump=entry]').click();await expect(page.locator('#entryForm')).toBeHidden();await page.locator('[data-finance-jump=entry]').click();await expect(page.locator('#entryDescription')).toHaveValue('Rascunho');await page.locator('[data-finance-jump=entry]').click();
 await page.locator('#financeImport > summary').click();await page.locator('[data-finance-jump=receipt]').click();await expect(page.locator('#receiptFile')).toBeVisible();await page.locator('#financeImport > summary').click();
 await page.screenshot({path:'.local/notes-menus-'+width+'.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for (const width of [1440, 393]) {
  test(`finance ${width} searches the notebook and keeps the full total visible`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await page.evaluate(() => {
      let state = WalletStore.finance();
      for (let index = 1; index <= 25; index++) {
        const store = index % 2 ? 'Aurora' : 'Lunar';
        state = Finance.update(state, { type: 'add', entry: {
          description: 'Compra ' + index, note: 'Acessórios', store, date: '2026-10-01',
          category: 'Lista de Compras', currency: 'BRL', status: 'paid', amount: 1000,
        } });
      }
      WalletStore.commitFinance(state);
    });
    await page.locator('[data-panel=financePanel]').click();
    const notebook = page.locator('#groupedFinanceList');
    const total = page.locator('#financeTopTotal');
    const search = page.getByRole('searchbox', { name: 'Pesquisar notas e gastos' });
    await expect(total).toContainText('250,00');
    await expect(notebook.locator('[data-note-ids]')).toHaveCount(25);
    await expect(page.getByText('Indicadores e orçamento')).toHaveCount(0);

    await search.fill('acessorios aurora');
    await expect(notebook.locator('[data-note-ids]')).toHaveCount(13);
    await expect(notebook.locator('[data-note-ids]').first()).toContainText(/Compra 1\b/);
    await expect(total).toContainText('250,00');
    await page.locator('#financeFilters > summary').click();
    await page.locator('#financeStore').fill('Lunar');
    await expect(page.locator('#financeSearchResults')).toHaveText('Nenhum lançamento encontrado.');
    await expect(notebook.locator('[data-note-ids]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await expect(search).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(notebook.locator('[data-note-ids]')).toHaveCount(25);
    await notebook.locator('[data-note-ids]').last().evaluate((row) => row.scrollIntoView({ block: 'center', behavior: 'instant' }));
    expect((await total.boundingBox()).y).toBeCloseTo(8, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
