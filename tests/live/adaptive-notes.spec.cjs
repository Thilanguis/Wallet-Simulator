const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [1280, 390, 320]) {
  test('original inline notes preserve data, totals and export at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/firebaseConfiguration.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
    await page.goto('/');
    await expect(page.locator('body')).not.toHaveClass(/firebase-required/);
    const before = await page.evaluate(() => {
      const text = '1. Perfil\n• Jogo em partes: R$ 12,00 + R$ 3,00\n2. Match Masters\n• R$ 10,00 + R$ 2,00 + R$ 3,00\n3. Comida para Luana e Mel\n• $5 dólares = R$ 20,00\n4. Lista de Compras\n• Compra fictícia ✅: R$ 40,00';
      const state = Finance.commitPreview(Finance.empty(), Finance.preview(text, [], ''));
      const profile = state.entries.filter((entry) => entry.category === 'Perfil');
      profile[0].date = '2026-09-10';
      profile[1].date = '2026-09-12';
      WalletStore.commitFinance(state);
      return { state, text: FinanceList.text(state.entries) };
    });
    await page.reload();
    await page.locator('[data-panel=financePanel]').click();
    const notes = page.locator('#groupedFinanceList');
    await expect(notes.locator('.notebook-group')).toHaveCount(9);
    await expect(notes.locator('details, .note-amount, .note-values')).toHaveCount(0);
    await expect(notes.locator('[data-note-group="Perfil"] .note-content')).toContainText(/12,00.*3,00/);
    await expect(notes.locator('[data-note-group="Perfil"] .note-dates')).toHaveText('1. 10/09/2026 · 2. 12/09/2026');
    await expect(notes.locator('[data-note-group="Lista de Compras"] .note-dates')).toHaveText('Sem data');
    await expect(notes.locator('[data-note-group="Comida para Luana e Mel"] .note-content')).toContainText(/5,00 = R\$/);
    await expect(page.locator('#financeTopTotal [data-grand-total]')).toContainText('90,00');
    expect(await page.locator('#financeTopTotal').evaluate(el => el.getBoundingClientRect().top < document.getElementById('groupedFinanceList').getBoundingClientRect().top)).toBe(true);
    expect(await page.evaluate(() => FinanceUI.getState())).toEqual(before.state);
    expect(await page.evaluate(() => FinanceList.text(FinanceUI.getState().entries))).toBe(before.text);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await notes.screenshot({ path: '.local/notes-restored-' + width + '.png' });
    const purchase = notes.locator('[data-note-group="Lista de Compras"] .notebook-line');
    await purchase.locator('[data-note-edit]').click();
    await page.locator('.note-edit-dialog #entryAmount').fill('41,00');
    await page.locator('#saveEntry').click();
    await page.locator('[data-dialog-confirm]').click();
    await expect(page.locator('#financeTopTotal [data-grand-total]')).toContainText('91,00');
    await expect(purchase.locator('.note-content')).toContainText('41,00');
  });
}
