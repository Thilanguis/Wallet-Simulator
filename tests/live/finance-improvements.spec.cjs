const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [1440, 768, 393])
  test('ledger tools, isolated wallet ' + width, async ({ page, context }) => {
    await context.route('https://firestore.googleapis.com/**', (r) => r.abort());
    await page.setViewportSize({ width, height: 950 });
    await page.route('https://api.frankfurter.dev/**', (r) => r.fulfill({ json: [{ base: 'CAD', quote: 'BRL', date: '2025-10-10', rate: 4 }] }));
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await page.evaluate(() => {
      let s = Finance.empty();
      for (const id of ['a', 'b', 'c'])
        s = Finance.update(s, {
          type: 'add',
          entry: {
            id,
            category: Finance.categories[7],
            description: 'Compra ' + id,
            store: id === 'c' ? 'Pandora' : 'Shein',
            date: '2025-10-10',
            currency: 'BRL',
            amount: 10000,
            status: 'paid',
            personAllocations: id === 'c' ? [{ person: 'Bruna', amount: 3000 }] : [],
            cadReference: { kind: 'original', source: 'manual', amount: 2500, basisAmount: 10000, methodVersion: 2 },
          },
        });
      FinanceUI.save(s);
    });
    await page.locator('[data-panel=financePanel]').click();
    const group = page.locator('[data-note-group="Lista de Compras"]'),
      toggle = group.locator('[data-group-toggle]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(group.locator('[data-note-ids=a]')).toBeHidden();
    await expect(toggle).toContainText('300,00');
    await page.locator('#financeShowCad').check();
    await expect(group.locator('[data-note-ids=a]')).toBeHidden();
    await toggle.click();
    await page.locator('#financeFilters > summary').click();
    await page.locator('#financePerson').selectOption('Bruna');
    await expect(page.locator('#financeSearchResults')).toContainText('Parte de Bruna: R$ 30,00');
    await expect(page.locator('#groupedFinanceList [data-note-ids]')).toHaveCount(1);
    await page.locator('#clearFinanceFilters').click();
    await page.locator('#financeFilters > summary').click();
    await page.locator('#financeAdd > summary').click();
    await page.locator('#entryStore').fill('Shein');
    await page.locator('#entryDate').fill('2025-10-10');
    await page.locator('#entryAmount').fill('100');
    await expect(page.locator('#entryDuplicateHint')).toBeVisible();
    await page.locator('#entryAmount').fill('99');
    await expect(page.locator('#entryDuplicateHint')).toBeHidden();
    await page.locator('#financeAdd > summary').click();
    await expect(page.locator('#financeDuplicates')).toBeVisible();
    await page.locator('#financeDuplicates > summary').click();
    await expect(page.locator('.finance-duplicate-group')).toHaveCount(1);
    await page.locator('[data-note-ids=c] [data-cad-entry]').click();
    await expect(page.locator('.finance-cad-dialog')).toBeVisible();
    await expect(page.locator('.finance-cad-explanation')).toContainText('Informado no cadastro');
    await expect(page.locator('.finance-cad-explanation')).toContainText('25,00');
    await page.locator('.finance-cad-dialog button').click();
    await page.locator('[data-note-ids=b] [data-note-delete]').click();
    await page.locator('[data-dialog-confirm]').click();
    await expect(page.locator('#homeTotal')).toContainText('200,00');
    await page.locator('#financeUndo').click();
    await expect(page.locator('#homeTotal')).toContainText('300,00');
    await expect(page.locator('[data-note-ids=b]')).toBeVisible();
    await page.evaluate(() => FinanceUI.save(Finance.update(FinanceUI.getState(), { type: 'edit', id: 'a', patch: { description: 'Corrigida' } })));
    await page.evaluate(() => {
      WalletStore.commitFinance(Finance.update(WalletStore.finance(), { type: 'edit', id: 'c', patch: { description: 'Alteração remota' } }));
      window.dispatchEvent(new Event('wallet:remote'));
    });
    await page.locator('#financeUndo').click();
    await expect(page.locator('#financeMessage')).toContainText('A lista mudou');
    expect(await page.evaluate(() => WalletStore.finance().entries.find((e) => e.id === 'c').description)).toBe('Alteração remota');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/finance-improvements-' + width + '.png' });
  });

test('estimated CAD shows historical source and reference date', async ({ page, context }) => {
  await context.route('https://firestore.googleapis.com/**', (r) => r.abort());
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.evaluate(() => {
    let s = Finance.empty();
    s = Finance.update(s, {
      type: 'add',
      entry: {
        id: 'estimated',
        category: Finance.categories[7],
        description: 'Compra antiga',
        amount: 40000,
        currency: 'BRL',
        date: '2025-05-10',
        status: 'paid',
        cadReference: { amount: 10000, kind: 'estimated', source: 'Frankfurter', rate: 4, rateDate: '2025-05-09', referenceDate: '2025-05-10', entryDate: '2025-05-10', method: 'date', basisAmount: 40000, methodVersion: 2 },
      },
    });
    FinanceUI.save(s);
  });
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#financeShowCad').check();
  await page.locator('[data-note-ids=estimated] [data-cad-entry]').click();
  await expect(page.locator('.finance-cad-explanation')).toContainText('Valor estimado');
  await expect(page.locator('.finance-cad-explanation')).toContainText('1 CAD = R$ 4');
  await expect(page.locator('.finance-cad-explanation')).toContainText('Frankfurter');
  await expect(page.locator('.finance-cad-explanation')).toContainText('09/05/2025');
  await page.keyboard.press('Escape');
  await expect(page.locator('.finance-cad-dialog')).not.toBeVisible();
});

test('an update during import confirmation preserves the latest notes and the draft', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#financeImport > summary').click();
  await page.locator('[data-finance-jump=import]').click();
  const draft = '1. Lista de Compras\n• Loja Aurora (1): R$ 10,00';
  await page.locator('#whatsappInput').fill(draft);
  await page.locator('#previewImport').click();
  await page.locator('#confirmImport').click();
  await expect(page.locator('[data-dialog-confirm]')).toBeVisible();
  await page.evaluate(() => {
    WalletStore.commitFinance(Finance.update(WalletStore.finance(), { type: 'add', entry: {
      id: 'from-other-device', category: 'Lista de Compras', description: 'Compra recebida', amount: 2500,
      currency: 'BRL', status: 'paid', date: '2026-11-10',
    } }));
    window.dispatchEvent(new Event('wallet:remote'));
  });
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#financeMessage')).toContainText('Os registros mudaram');
  await expect(page.locator('#whatsappInput')).toHaveValue(draft);
  expect(await page.evaluate(() => WalletStore.finance().entries.map(entry => entry.id))).toEqual(['from-other-device']);
  await page.locator('#previewImport').click();
  await page.locator('#confirmImport').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#groupedFinanceList [data-note-ids]')).toHaveCount(2);
});

test('a failed or cancelled save releases its button and protects a concurrent edit', async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', route => route.fulfill({ json: [{ base: 'CAD', quote: 'BRL', date: '2026-11-10', rate: 4 }] }));
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
  await page.evaluate(() => FinanceUI.save(Finance.update(Finance.empty(), { type: 'add', entry: {
    id: 'edited-note', category: 'Lista de Compras', description: 'Compra anterior', amount: 2500,
    currency: 'BRL', status: 'paid', date: '2026-11-10',
  } })));
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('[data-note-edit=edited-note]').click();
  const save = page.locator('#saveEntry');
  await page.locator('#entryDescription').fill('Minha correção');
  await save.click();
  await expect(page.locator('[data-dialog-cancel]')).toBeVisible();
  await page.evaluate(() => WalletStore.setWritable(false));
  await page.locator('[data-dialog-cancel]').click();
  await expect(save).not.toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => WalletStore.setWritable(true));
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('[data-dialog-confirm]')).toBeVisible();
  await page.evaluate(() => {
    WalletStore.commitFinance(Finance.update(WalletStore.finance(), { type: 'edit', id: 'edited-note', patch: { description: 'Correção recebida' } }));
    window.dispatchEvent(new Event('wallet:remote'));
  });
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#entryFeedback')).toContainText('O lançamento mudou');
  await expect(save).toBeEnabled();
  expect(await page.evaluate(() => WalletStore.finance().entries[0].description)).toBe('Correção recebida');
});

test('a late currency conversion cannot overwrite another note editor', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
  await page.evaluate(() => {
    FinanceUI.save(Finance.update(Finance.empty(), { type: 'add', entry: {
      id: 'stable-amount', category: 'Lista de Compras', description: 'Valor registrado', amount: 2500,
      currency: 'BRL', status: 'paid', date: '2026-11-10',
    } }));
    FinanceCad.convertPair = () => new Promise(resolve => { window.finishDraftConversion = resolve; });
  });
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#financeAdd > summary').click();
  await page.locator('#entryCadOriginal').fill('10,00');
  await expect.poll(() => page.evaluate(() => Boolean(window.finishDraftConversion))).toBe(true);
  await page.locator('[data-note-edit=stable-amount]').click();
  const dialog = page.getByRole('dialog', { name: 'Editar lançamento' });
  await expect(dialog.locator('#entryAmount')).toHaveValue('25,00');
  await page.evaluate(async () => {
    window.finishDraftConversion({ amount: 4000, rate: 4, rateDate: '2026-11-10' });
    await Promise.resolve();
  });
  await expect(dialog.locator('#entryAmount')).toHaveValue('25,00');
});
