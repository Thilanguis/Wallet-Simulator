const { test, expect } = require('../firebase-fixture.cjs');
async function start(page, context, width = 1440, reduced = false) {
  await context.route('https://firestore.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width, height: 1000 });
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://api.frankfurter.dev/**', (r) => {
    const u = new URL(r.request().url());
    return r.fulfill({ json: [{ base: 'CAD', quote: 'BRL', rate: 4, date: u.searchParams.get('date') || new Date().toISOString().slice(0, 10) }] });
  });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
}
for (const width of [1440, 768, 393])
  test('wallet service, stages, gain and timer feedback ' + width, async ({ page, context }) => {
    await start(page, context, width);
    await page.evaluate(() => {
      AppStorage.setItem('saldoDominadora', '10000');
      AppStorage.flush();
      window.dispatchEvent(new Event('wallet:credits'));
    });
    await page.locator('#privilegeSeal').click();
    await expect(page.locator('#privilegeSeal')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-jump=gasto]').click();
    const service = await page.evaluate(() => {
      const item = Economy.config.services.find((s) => s.taskCount === 2);
      return { id: item.id, label: item.label, cost: Economy.serviceCost(getEconomy(), item, 0, true).final, option: [...document.getElementById('selectTarefa').options].find((o) => o.value.split('|')[1] === item.id).value };
    });
    await page.locator('#selectTarefa').selectOption(service.option);
    await page.locator('#adicionar').click();
    await expect(page.locator('#adicionar')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#adicionar')).toBeDisabled();
    await page.locator('[data-dialog-cancel]').click();
    await expect(page.locator('#adicionar')).toBeEnabled();
    expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico') || '[]').length)).toBe(0);
    await expect(page.locator('#operationFeedback')).toHaveCount(0);
    await page.locator('#adicionar').click();
    await page.locator('[data-dialog-confirm]').click();
    await expect(page.locator('#operationFeedback')).toContainText('Privilégio adquirido');
    await expect(page.locator('#operationFeedback')).toContainText(service.label);
    const after = await page.evaluate(() => ({ history: JSON.parse(AppStorage.getItem('historico')), balance: Number(AppStorage.getItem('saldoDominadora')) }));
    expect(after.history.length).toBe(1);
    expect(after.balance).toBeCloseTo(10000 - service.cost, 2);
    const steps = page.locator('#tarefasPendentes .task-steps input');
    await expect(steps).toHaveCount(2);
    await steps.first().check();
    await expect(page.locator('#operationFeedback')).toContainText('Etapa concluída');
    expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('tarefasPendentes'))[0].completedParts)).toEqual([true, false]);
    const remaining = await steps.nth(1).evaluate((el) => {
      el.click();
      return JSON.parse(AppStorage.getItem('tarefasPendentes')).length;
    });
    expect(remaining).toBe(0);
    await expect(page.locator('#operationFeedback')).toContainText('Tarefa concluída');
    expect(await page.evaluate(() => Number(AppStorage.getItem('saldoDominadora')))).toBe(after.balance);
    await page.locator('[data-jump=ganho]').click();
    await page.locator('#selectGanho').selectOption('Pés na cara');
    await expect(page.locator('#timerMotionStatus')).toContainText('iniciado');
    await page.locator('#adicionar').click();
    await expect(page.locator('#operationFeedback')).toContainText('Crédito registrado');
    await expect(page.locator('#timerMotionStatus')).toContainText('Nova atividade no combo');
    expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico')).length)).toBe(2);
    await page.locator('#btnPlayPauseTempo').click();
    await expect(page.locator('#timerMotionStatus')).toContainText('pausado');
    await page.locator('#btnPlayPauseTempo').click();
    await expect(page.locator('#timerMotionStatus')).toContainText(/iniciado|retomado/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/interaction-wallet-' + width + '.png' });
  });
for (const reduced of [false, true])
  test('wishlist purchase and return keep data correct, reduced motion ' + reduced, async ({ page, context }) => {
    await start(page, context, 393, reduced);
    await page.evaluate(() => {
      AppStorage.setItem(
        'wishlist',
        JSON.stringify([
          { id: 'w1', title: 'Produto A', store: 'Shein', person: 'Dominadora', originalPrice: 40, price: 40, currency: 'BRL', quantity: 2, bought: false },
          { id: 'w2', title: 'Produto B', store: 'Shein', person: 'Bruna', originalPrice: 20, price: 20, currency: 'BRL', quantity: 1, bought: false },
        ]),
      );
      AppStorage.flush();
      window.dispatchEvent(new Event('wallet:remote'));
    });
    await page.locator('[data-panel=wishlistPanel]').click();
    await page.locator('#wishHideBought').check();
    await page.locator('[data-purchase-wish=w1]').check();
    await page.locator('[data-purchase-wish=w2]').check();
    await page.locator('#wishReviewPurchase').click();
    await page.locator('#wishPurchaseForm button[type=submit]').click();
    await expect(page.locator('#wishPurchaseDialog')).not.toBeVisible();
    await expect(page.locator('#operationFeedback')).toContainText('Compra registrada');
    await expect(page.locator('#operationFeedback')).toContainText('Shein');
    await expect(page.locator('#operationFeedback')).toContainText('3 itens');
    await expect(page.locator('#operationFeedback')).toContainText('100,00');
    await expect(page.locator('#wishList [data-wish-id]')).toHaveCount(0);
    const bought = await page.evaluate(() => ({ wishes: JSON.parse(AppStorage.getItem('wishlist')), entries: WalletStore.finance().entries }));
    expect(bought.entries.length).toBe(1);
    expect(bought.entries[0].amount).toBe(10000);
    expect(bought.wishes.every((w) => w.bought)).toBe(true);
    if (reduced) {
      await expect(page.locator('.fx-departure')).toHaveCount(0);
      expect(await page.locator('#operationFeedback').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    }
    await page.locator('[data-panel=financePanel]').click();
    await page.locator('[data-note-wishlist]').click();
    await page.locator('[data-dialog-confirm]').click();
    await expect(page.locator('#operationFeedback')).toContainText('Compra desfeita');
    await expect(page.locator('#wishList [data-wish-id]')).toHaveCount(2);
    expect(await page.evaluate(() => WalletStore.finance().entries.length)).toBe(0);
    expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')).every((w) => !w.bought))).toBe(true);
    await page.screenshot({ path: '.local/interaction-wishes-' + reduced + '.png' });
  });

test('note saving shows a real busy state, prevents duplicate submits and restores the button', async ({ page, context }) => {
  await start(page, context, 393);
  let rateRequest;
  await page.route('https://api.frankfurter.dev/**', (route) => {
    rateRequest = route;
  });
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#financeAdd > summary').click();
  await page.locator('#entryDescription').fill('Compra de exemplo');
  await page.locator('#entryStore').fill('Loja de exemplo');
  await page.locator('#entryDate').fill('2025-05-10');
  await page.locator('#entryAmount').fill('25');
  await expect.poll(() => !!rateRequest).toBe(true);
  await page.locator('#saveEntry').click();
  await expect(page.locator('#saveEntry')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#saveEntry')).toBeDisabled();
  await expect(page.locator('#saveEntry')).toContainText('Registrando');
  await page.evaluate(() => document.getElementById('entryForm').requestSubmit());
  await rateRequest.fulfill({ json: [{ base: 'CAD', quote: 'BRL', date: '2025-05-10', rate: 4 }] });
  await expect(page.locator('#operationFeedback')).toContainText('Gasto registrado');
  await expect(page.locator('#saveEntry')).toBeEnabled();
  await expect(page.locator('#saveEntry')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#saveEntry')).toHaveText('Registrar lançamento');
  expect(await page.evaluate(() => WalletStore.finance().entries.length)).toBe(1);
  expect(await page.evaluate(() => WalletStore.finance().entries[0].amount)).toBe(2500);
});
test('reduced motion keeps gain confirmation without floating credits or bonus particles', async ({ page, context }) => {
  await start(page, context, 393, true);
  await page.locator('#privilegeSeal').click();
  await page.locator('[data-jump=ganho]').click();
  await page.locator('#selectGanho').selectOption('Pés na cara');
  await page.locator('#adicionar').click();
  await expect(page.locator('#operationFeedback')).toContainText('Crédito registrado');
  await expect(page.locator('.fx-credit-delta')).toHaveCount(0);
  await expect(page.locator('.money-glow')).toHaveCount(0);
  expect(await page.locator('#operationFeedback').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico')).length)).toBe(1);
});
