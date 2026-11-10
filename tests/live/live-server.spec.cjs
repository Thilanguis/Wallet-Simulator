const { test, expect } = require('../firebase-fixture.cjs');
const fs = require('node:fs'),
  path = require('node:path');
async function autoConfirm(page) {
  await page.addLocatorHandler(page.locator('.app-dialog[open]'), async () => {
    await page.locator('.app-dialog [data-dialog-confirm]').click();
  });
}
async function open(page, seed = {}) {
  await page.route('**/firebaseConfiguration.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
  await page.addInitScript((seed) => {
    if (!localStorage.getItem('findom.wallet.v2')) for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  }, seed);
  await page.goto('/');
  await expect(page.locator('body')).not.toHaveClass(/firebase-required/);
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('.splash-skip')).toHaveCount(0);
  await expect(page.locator('#tipoTransacao')).toBeHidden();

  await expect(page.locator('#selectTarefa option')).toHaveCount(18);
}
test('real expenses never offer pending and imported crosses are treated as spent', async ({ page }) => {
  await open(page);
  await page.locator('[data-panel=financePanel]').click();
  await expect(page.locator('#entryStatus option[value=pending]')).toHaveCount(0);
  await expect(page.locator('#financeStatus option[value=pending]')).toHaveCount(0);
  await expect(page.locator('#homePending')).toHaveCount(0);
  await page.locator('[data-finance-jump=import]').click();
  await page.locator('#whatsappInput').fill('1. Lista de Compras\n• Item fictício ❌: R$ 10,00');
  await page.locator('#previewImport').click();
  await expect(page.locator('#importGroupedList')).toContainText('Item fictício ✅');
  await expect(page.locator('#importWarnings')).not.toContainText('pendente');
});
test('select all respects filters, supports partial selection, cancellation and confirmed bulk deletion', async ({ page }) => {
  await open(page, { saldoDominadora: '100' });
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#financeManager > summary').click();
  for (const [description, store, amount] of [
    ['Compra A', 'Aurora', '10,00'],
    ['Compra B', 'Aurora', '20,00'],
    ['Compra C', 'Lunar', '30,00'],
  ]) {
    await page.locator('#entryDescription').fill(description);
    await page.locator('#entryStore').fill(store);
    await page.locator('#entryAmount').fill(amount);
    await page.locator('#saveEntry').click();
  }
  await page.locator('#financeFilters > summary').click();
  await page.locator('#financeStore').fill('Aurora');
  await page.keyboard.press('Escape');
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(2);
  await page.locator('#selectAllFinance').check();
  await expect(page.locator('#financeSelectionCount')).toHaveText('2 selecionados');
  await page.locator('#financeHistory [data-select-entry]').first().uncheck();
  await expect(page.locator('#financeSelectionCount')).toHaveText('1 selecionados');
  expect(await page.locator('#selectAllFinance').evaluate((el) => el.indeterminate)).toBe(true);
  await page.locator('#selectAllFinance').check();
  await page.locator('#deleteSelectedFinance').click();
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(2);
  await expect(page.locator('.app-dialog')).toContainText('2 lançamentos');
  await page.locator('[data-dialog-cancel]').click();
  await page.locator('#deleteSelectedFinance').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(0);
  await expect(page.locator('#deleteSelectedFinance')).toBeDisabled();
  await page.locator('#financeFilters > summary').click();
  await page.locator('#clearFinanceFilters').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(1);
  await expect(page.locator('#financeHistory')).toContainText('Compra C');
  expect(await page.evaluate(() => FinanceUI.getState().audit.length)).toBe(2);
  expect(await page.evaluate(() => Number(AppStorage.getItem('saldoDominadora')))).toBe(100);
  await page.reload();

  await page.locator('[data-panel=financePanel]').click();
  expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(1);
});
test('actual VS Code Live Server uses the same verified Firebase configuration as production', async ({ page, request }) => {
  await open(page);
  const response = await request.get(page.url());
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('id="financePanel"');
  expect(html).toContain('src="js/firebase-connection.js"');
  const loader = await request.get(new URL('js/firebase-connection.js', page.url()).href);
  expect(loader.status()).toBe(200);
  expect(await loader.text()).toContain("import('./firebase-web-config.js')");
  expect(await loader.text()).not.toContain('import(local.href)');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await page.locator('[data-panel=financePanel]').click();
  await expect(page.locator('#financePanel')).toBeVisible();
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('real list opens as eight expanded numbered groups with compact items and final summary', async ({ page }) => {
  await open(page);
  await page.locator('[data-panel=financePanel]').click();
  await expect(page.locator('#groupedFinanceList .notebook-group')).toHaveCount(9);
  await expect(page.locator('#groupedFinanceList h3').first()).toContainText('1. Jogo de Buraco');
  await expect(page.locator('#groupedFinanceList h3').nth(7)).toContainText('8. Lista de Compras');
  await expect(page.locator('#groupedFinanceList h3').last()).toContainText('9. Resumo Final');
  await expect(page.locator('#financeHistory')).toBeHidden();
  await expect(page.locator('#financeFrom')).toBeHidden();
  await expect(page.locator('#groupedFinanceList button')).toHaveCount(0);
});
test('same origin migrates legacy data once and reload preserves originals and unrelated keys', async ({ page }) => {
  const history = JSON.stringify([{ descricao: 'Atividade fictícia local', tipo: 'ganho', valor: 12.34, saldoAtual: 246.8, timestamp: '2026-01-15T12:00:00Z' }]);
  await open(page, { saldoDominadora: '246.8', historico: history, 'other-app-test-key': 'preservar' });
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 246,80');
  expect(await page.evaluate(() => localStorage.getItem('historico'))).toBe(history);
  expect(await page.evaluate(() => localStorage.getItem('other-app-test-key'))).toBe('preservar');
  expect(await page.evaluate(() => WalletStore.snapshot().simulator.historico)).toBe(history);
  await page.reload();

  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 246,80');
  expect(await page.evaluate(() => historico.length)).toBe(1);
});
test('development service worker never serves stale edited assets on port 5501', async ({ page }) => {
  await open(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const name = 'probe-' + Date.now() + '.txt',
    file = path.join(__dirname, name);
  try {
    fs.writeFileSync(file, 'first-local-version');
    expect(await page.evaluate(async (name) => (await fetch(new URL('tests/live/' + name, location.href), { cache: 'no-store' })).text(), name)).toBe('first-local-version');
    fs.writeFileSync(file, 'second-local-version');
    expect(await page.evaluate(async (name) => (await fetch(new URL('tests/live/' + name, location.href), { cache: 'no-store' })).text(), name)).toBe('second-local-version');
    await page.locator('[data-panel=backupPanel]').click();
    await expect(page.locator('#checkUpdate')).toHaveCount(0);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});
test('real OCR runs from root vendor assets, creates only a suggestion and persists confirmed entry', async ({ page }) => {
  test.setTimeout(120000);
  await autoConfirm(page);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await open(page);
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#financeImport > summary').click();
  await page.locator('#receiptToggle').click();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 600;
    const x = c.getContext('2d');
    x.fillStyle = 'white';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'black';
    x.font = '42px Arial';
    ['LOJA AURORA', 'Data: 15/01/2026', 'Subtotal R$ 80,00', 'Total pago R$ 72,30'].forEach((line, i) => x.fillText(line, 50, 80 + i * 120));
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#receiptFile').setInputFiles({ name: 'comprovante-ficticio-local.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('#processReceipt').click();
  await expect(page.locator('#ocrProgress')).toContainText('Leitura concluída', { timeout: 90000 });
  await expect(page.locator('#entryAmount')).toHaveValue('72,30');
  expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(0);
  await page.locator('#saveEntry').click();
  await expect(page.locator('#homeTotal')).toContainText('72,30');
  await page.reload();

  await expect(page.locator('#homeTotal')).toContainText('72,30');
  expect(requests.some((url) => url.includes('/vendor/lang/por.traineddata.gz'))).toBe(true);
  expect(requests.some((url) => url === new URL('js/economy-ui.js', page.url()).href)).toBe(true);
});
test('Wallet shows internal money, real notes stay in their own panel, purple/gold title follows lingerie', async ({ page }) => {
  await open(page, { saldoDominadora: '123.45' });
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 123,45');
  await expect(page.locator('#homeCredits')).toHaveCount(0);
  await expect(page.locator('#homeTotal')).toBeHidden();
  await expect(page.locator('#financePanel')).toBeHidden();
  await expect(page.locator('#simulator')).not.toContainText('créditos');
  await expect(page.locator('#simulator')).not.toContainText('fictício');
  await expect(page.locator('#simuladorTitulo')).toHaveCSS('color', 'rgb(128, 0, 128)');
  await page.locator('#privilegeSeal').click();
  await expect(page.locator('#simuladorTitulo')).toHaveCSS('color', 'rgb(255, 215, 0)');
  await page.reload();

  await expect(page.locator('#simuladorTitulo')).toHaveCSS('color', 'rgb(255, 215, 0)');
  await page.locator('#privilegeSeal').click();
  await expect(page.locator('#simuladorTitulo')).toHaveCSS('color', 'rgb(128, 0, 128)');
  await page.locator('[data-panel=financePanel]').click();
  await expect(page.locator('#groupedFinanceList')).toBeVisible();
  await expect(page.locator('#redemptionsSection')).toHaveCount(0);
  await expect(page.locator('#requestRedemption')).toHaveCount(0);
  await page.locator('[data-finance-jump=receipt]').click();
  await expect(page.locator('#receiptFile')).toBeVisible();
});

test('catalog arrays add options without losing saved settings and timer markers are visible', async ({ page }) => {
  const E = require('../../js/economy.js');
  const custom = E.defaults('custom');
  custom.prices[E.config.services[0].id] = 31.25;
  await page.route('**/js/economy-config.js', async (route) => {
    const source = fs.readFileSync(path.resolve('js/economy-config.js'), 'utf8');
    await route.fulfill({ contentType: 'application/javascript', body: source + "\nEconomyConfig.gains.push({id:'Atividade teste',classic:50,balanced:7});" });
  });
  await open(page, { economy: JSON.stringify(custom) });
  await expect(page.locator('#economyFields')).toHaveCount(0);
  await expect(page.locator('#selectTarefa option').nth(1)).toContainText('31,25');
  await expect(page.locator('#selectGanho option[value="Atividade teste"]')).toContainText('7,00');
  await expect(page.locator('#selectGanho option[value="Videogames Competitivos"]')).toContainText('💲');
  await page.reload();
  await expect(page.locator('#selectTarefa option').nth(1)).toContainText('31,25');
});

test('adding and deleting items automatically updates group summary and grand total', async ({ page }) => {
  await autoConfirm(page);
  await open(page);
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('[data-finance-jump=import]').click();
  await page.locator('#whatsappInput').fill('1. Lista de Compras\n• Loja Aurora (1): R$ 10,00\n• Loja Aurora (2): R$ 20,00\nTotal: R$ 999,00\n2. Jogo de Buraco\n• Partida teste: R$ 5,00\nTotal Geral: R$ 999,00');
  await page.locator('#previewImport').click();
  await expect(page.locator('#importGroupedList .notebook-grand-total')).toContainText('35,00');
  await page.locator('#importReview > summary').click();
  await page.locator('#importRows details').first().locator('summary').click();
  await page.locator('#importRows [data-field=amount]').first().fill('40,00');
  await expect(page.locator('#importGroupedList .notebook-group').nth(7).locator('.notebook-subtotal')).toContainText('60,00');
  await expect(page.locator('#importGroupedList .notebook-final li').nth(7)).toContainText('60,00');
  await expect(page.locator('#importGroupedList .notebook-grand-total')).toContainText('65,00');
  await page.locator('#confirmImport').click();
  const group = page.locator('#groupedFinanceList .notebook-group').nth(7);
  await expect(group.locator('.notebook-subtotal')).toContainText('60,00');
  await expect(page.locator('#groupedFinanceList [data-note-edit]')).toHaveCount(3);
  await page.locator('[data-finance-jump=entry]').click();
  await page.locator('#entryCategory').selectOption('Lista de Compras');
  await page.locator('#entryDescription').fill('Nova compra teste');
  await page.locator('#entryAmount').fill('15,00');
  await page.locator('#saveEntry').click();
  await expect(group.locator('.notebook-subtotal')).toContainText('75,00');
  await expect(page.locator('#groupedFinanceList .notebook-final li').nth(7)).toContainText('75,00');
  await expect(page.locator('#groupedFinanceList .notebook-grand-total')).toContainText('80,00');
  await expect(page.locator('#shareText')).toHaveValue(/Total Geral Atualizado.*80,00/);
  await page.locator('#financeManager > summary').click();
  await page.locator('#financeHistory .finance-entry').filter({ hasText: 'Nova compra teste' }).locator('[data-action=delete]').click();
  await expect(group.locator('.notebook-subtotal')).toContainText('60,00');
  await expect(page.locator('#groupedFinanceList .notebook-final li').nth(7)).toContainText('60,00');
  await expect(page.locator('#groupedFinanceList .notebook-grand-total')).toContainText('65,00');
  await page.reload();
  await page.locator('[data-panel=financePanel]').click();
  await expect(page.locator('#groupedFinanceList .notebook-grand-total')).toContainText('65,00');
});

test('styled confirmations cancel safely, restore focus and execute only after approval', async ({ page }) => {
  const nativeDialogs = [];
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await open(page, { saldoDominadora: '100' });
  await page.locator('[data-panel=backupPanel]').click();
  await page.locator('#walletMaintenance > summary').click();
  await page.locator('#resetSaldo').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-dialog-cancel]')).toBeFocused();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 100,00');
  await page.locator('[data-dialog-cancel]').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#resetSaldo')).toBeFocused();
  await page.locator('#resetSaldo').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 100,00');
  await page.locator('#resetSaldo').click();
  await page.screenshot({ path: '.local/confirmacao-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/confirmacao-mobile.png' });
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 0,00');
  await page.locator('[data-panel=simulator]').click();
  await page.locator('#adicionar').click();
  await expect(page.getByRole('dialog')).toContainText('selecione uma tarefa');
  await expect(page.locator('[data-dialog-cancel]')).toBeHidden();
  await page.locator('[data-dialog-confirm]').click();
  expect(nativeDialogs).toEqual([]);
});

test('manual entry accepts decimal point, saves once and shows feedback next to form', async ({ page, request }) => {
  await open(page);
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('[data-finance-jump=entry]').click();
  await page.locator('#entryCategory').selectOption('Lista de Compras');
  await page.locator('#entryStore').fill('Aurora');
  await page.locator('#entryDescription').fill('Compra teste decimal');
  await page.locator('#entryAmount').fill('511.22');
  await page.locator('#saveEntry').click();
  await expect(page.locator('#entryFeedback')).toContainText('Lançamento salvo');
  expect(await page.evaluate(() => FinanceUI.getState().entries[0].amount)).toBe(51122);
  await expect(page.locator('#groupedFinanceList .notebook-grand-total')).toContainText('511,22');
  await page.locator('#entryDescription').fill('Valor inválido');
  await page.locator('#entryAmount').fill('abc');
  await page.locator('#saveEntry').click();
  await expect(page.locator('#entryFeedback')).toContainText('inválido');
  expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(1);
  const icon = await page.locator('link[rel=icon]').getAttribute('href');
  expect((await request.get(new URL(icon, page.url()).href)).status()).toBe(200);
  await page.reload();
  expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(1);
});

test('list controls edit in a modal, move between groups, persist order and delete with confirmation', async ({ page }) => {
  await open(page);
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#entryCategory').selectOption('Lista de Compras');
  for (const [description, amount] of [
    ['Compra A', '10,00'],
    ['Compra B', '20,00'],
  ]) {
    await page.locator('#entryCategory').selectOption('Lista de Compras');
    await page.locator('#entryDescription').fill(description);
    await page.locator('#entryAmount').fill(amount);
    await page.locator('#saveEntry').click();
  }
  const list = page.locator('#groupedFinanceList');
  const rowA = () => list.locator('[data-note-ids]').filter({ hasText: 'Compra A' });
  const rowB = () => list.locator('[data-note-ids]').filter({ hasText: 'Compra B' });
  await rowA().locator('[data-note-edit]').click();
  await expect(page.locator('.note-edit-dialog')).toBeVisible();
  await page.locator('#entryAmount').fill('15,00');
  await page.locator('#saveEntry').click();
  await page.locator('.app-dialog [data-dialog-confirm]').click();
  await expect(page.locator('.note-edit-dialog')).toHaveCount(0);
  await expect(list.locator('[data-grand-total]')).toContainText('35,00');
  await rowB().locator('[data-note-drag]').dragTo(rowA());
  await expect(list.locator('[data-note-ids]').first()).toContainText('Compra B');
  const firstGroup = list.locator('[data-note-group]').first();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await rowA().locator('[data-note-drag]').dispatchEvent('dragstart', { dataTransfer: transfer });
  await firstGroup.locator('h3').dispatchEvent('dragover', { dataTransfer: transfer });
  await firstGroup.locator('h3').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(firstGroup.locator('[data-group-total]')).toContainText('15,00');
  await expect(list.locator('[data-note-group]').nth(7).locator('[data-group-total]')).toContainText('20,00');
  await expect(list.locator('[data-summary-total]').first()).toContainText('15,00');
  await expect(list.locator('[data-grand-total]')).toContainText('35,00');
  await rowA().locator('[data-note-delete]').click();
  await page.locator('[data-dialog-cancel]').click();
  await expect(rowA()).toHaveCount(1);
  await rowA().locator('[data-note-delete]').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(rowA()).toHaveCount(0);
  await expect(list.locator('[data-grand-total]')).toContainText('20,00');
  await page.reload();
  await page.locator('[data-panel=financePanel]').click();
  await expect(list.locator('[data-grand-total]')).toContainText('20,00');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await rowB().locator('[data-note-edit]').click();
  await page.screenshot({ path: '.local/lista-edicao-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.note-edit-dialog')).toHaveCount(0);
});

test('eligible game increases session rate and enables automatic timer progression', async ({ page }) => {
  await open(page);
  await page.locator('[data-jump=ganho]').click();
  await page.clock.install();
  await page.locator('#btnPlayPauseTempo').click();
  const base = await page.locator('#valorPorMinuto').inputValue();
  await page.locator('#selectGanho').selectOption('Videogames Competitivos');
  await page.locator('#adicionar').click();
  const rate = Number(await page.locator('#valorPorMinuto').inputValue());
  expect(rate).toBeGreaterThan(Number(base));
  const settings = await page.evaluate(() => getEconomy().timer);
  await page.clock.fastForward(settings.autoEvery * 1000);
  expect(Number(await page.locator('#valorPorMinuto').inputValue())).toBeGreaterThan(rate);
});

test('code editor creates catalog items, updates prices and persists safely', async ({ page }) => {
  await open(page, { saldoDominadora: '100' });
  await page.locator('[data-panel=backupPanel]').click();
  await page.locator('#customEconomy > summary').click();
  const code = page.locator('#customEconomyJson');
  const data = JSON.parse(await code.inputValue());
  expect(await code.inputValue()).not.toMatch(/"classic"|"balanced"/);
  data.services[0].price = 31.25;
  data.services.push({ id: 'Serviço teste', label: 'Serviço teste', description: 'Descrição teste', price: 9.5, reduceHours: 0 });
  data.gains.unshift({ id: 'Ganho teste', amount: 7.5, timerEligible: true });
  await code.fill(JSON.stringify(data, null, 2));
  await page.locator('#saveCustomEconomy').click();
  await expect(page.locator('#economyCodeMessage')).toContainText('Catálogo salvo');
  await expect(page.locator('#selectTarefa option').nth(1)).toContainText('31,25');
  await expect(page.locator('#selectTarefa option').last()).toContainText('Serviço teste');
  await expect(page.locator('#selectGanho option[value="Ganho teste"]')).toContainText('💲');
  await code.fill('{broken');
  await page.locator('#saveCustomEconomy').click();
  await expect(page.locator('#economyCodeMessage')).toContainText('JSON inválido');
  await expect(code).toHaveValue('{broken');
  await page.locator('[data-panel=simulator]').click();
  await page.locator('[data-jump=ganho]').click();
  await page.locator('#selectGanho').selectOption('Tapa de pé na cara');
  await expect(page.locator('#quantidadeMultiplicador')).toBeVisible();
  await page.locator('#selectGanho').selectOption('Ganho teste');
  await expect(page.locator('#quantidadeMultiplicador')).toBeHidden();
  await expect(page.locator('#valorGanho')).toHaveValue('7.5');
  await page.reload();
  await expect(page.locator('#selectTarefa option').last()).toContainText('Serviço teste');
  await expect(page.locator('#selectTarefa option').nth(1)).toContainText('31,25');
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 100,00');
});

test('economy lives in settings and purchase bonus shows original final and savings', async ({ page }) => {
  await open(page);
  await expect(page.locator('#economySettingsPanel')).toBeHidden();
  await page.locator('#privilegeSeal').click();
  await page.locator('#selectTarefa').selectOption({ index: 3 });
  const preview = page.locator('#previewDescontoCompra');
  await expect(preview.locator('s')).toContainText('60,00');
  await expect(preview.locator('strong')).toContainText('51,00');
  await expect(preview.locator('.purchase-bonus-chip')).toContainText('15%');
  await expect(preview.locator('.purchase-bonus-saved')).toContainText('9,00');
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/bonus-compra.png' });
  await page.locator('#privilegeSeal').click();
  await expect(preview.locator('s')).toHaveCount(0);
  await expect(preview.locator('strong')).toContainText('60,00');
  await page.locator('[data-panel=backupPanel]').click();
  await expect(page.locator('#economySettingsPanel')).toBeVisible();
});

test('contract score calculator fills gain without registering it automatically', async ({ page }) => {
  await open(page);
  await page.locator('[data-jump=ganho]').click();
  await page.locator('#selectGanho').selectOption('Videogames Competitivos');
  await expect(page.locator('#gameScoreCalculator')).toBeVisible();
  await page.locator('#gameScoreCalculator summary').click();
  await page.locator('#scoreWinner').fill('3500');
  await page.locator('#scoreOther').fill('500');
  await page.locator('#scoreCoefficient').fill('0,01');
  await expect(page.locator('#scorePreview')).toContainText('30,00');
  await page.locator('#useScoreGain').click();
  await expect(page.locator('#valorGanho')).toHaveValue('30');
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 0,00');
  await page.locator('#adicionar').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 30,00');
  await page.locator('#scoreOther').fill('4000');
  await expect(page.locator('#useScoreGain')).toBeDisabled();
});
test('two-part service tracks separate progress and preserves legacy purchase after reload', async ({ page }) => {
  await open(page, { tarefasPendentes: JSON.stringify([{ id: 123, tarefa: 'Obrigação de servir (2 tarefas)', descricao: 'Descrição teste', valor: 130, timestamp: '2026-10-30T12:00:00Z' }]) });
  const row = page.locator('#tarefasPendentes .tarefa-item');
  await expect(row.locator('input')).toHaveCount(2);
  await row.locator('input').first().check();
  await page.reload();
  await expect(row.locator('input').first()).toBeChecked();
  await expect(row.locator('input').nth(1)).not.toBeChecked();
  await expect(row).toHaveCount(1);
  await row.locator('input').nth(1).check();
  await expect(row).toHaveCount(0);
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 0,00');
});

test('contract penalties require confirmation, use calibrated values and never affect real expenses', async ({ page }) => {
  await open(page, { saldoDominadora: '200' });
  await page.locator('#privilegeSeal').click();
  await page.locator('#contractOccurrences summary').click();
  await page.locator('#registerContractOccurrence').click();
  await page.locator('[data-dialog-cancel]').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 200,00');
  await page.locator('#registerContractOccurrence').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 360,00');
  await page.locator('[data-contract-rule=creamPenalty]').click();
  await page.locator('#registerContractOccurrence').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 320,00');
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico')).filter((e) => e.contractRule).length)).toBe(2);
  expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(0);
  await page.reload();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 320,00');
});
test('dinner guest count changes preview and charge with exactly one lingerie discount', async ({ page }) => {
  await open(page, { saldoDominadora: '200' });
  await page.locator('#privilegeSeal').click();
  const value = await page.locator('#selectTarefa option').evaluateAll((opts) => opts.find((o) => o.value.includes('|Cozinhar jantar|')).value);
  await page.locator('#selectTarefa').selectOption(value);
  await page.locator('#dinnerGuestCount').fill('2');
  await expect(page.locator('#previewDescontoCompra strong')).toContainText('110,50');
  await page.locator('#adicionar').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 89,50');
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('tarefasPendentes'))[0].guestCount)).toBe(2);
  expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(0);
});

test('screen contract follows catalog edits, preserves original link and prints as a document', async ({ page }) => {
  await open(page);
  await page.locator('#abrirContrato').click();
  await expect(page.locator('#contractPanel')).toBeVisible();
  await expect(page.locator('#contractDocument table').first()).toContainText('30,00');
  await expect(page.locator('#checkUpdate')).toHaveCount(0);
  await expect(page.locator('#contractPanel a')).toHaveAttribute('href', /Contrato/);
  await page.locator('#editContractValues').click();
  const data = JSON.parse(await page.locator('#customEconomyJson').inputValue());
  data.services[0].price = 32.15;
  data.contractRules.failurePenalty = 165;
  await page.locator('#customEconomyJson').fill(JSON.stringify(data));
  await page.locator('#saveCustomEconomy').click();
  await expect(page.locator('#economyCodeMessage')).toContainText('Catálogo salvo');
  await page.locator('[data-panel=contractPanel]').click();
  await expect(page.locator('#contractDocument table').first()).toContainText('32,15');
  await expect(page.locator('#contractDocument')).toContainText('165,00');
  await page.screenshot({ path: '.local/contrato-tela.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.contract-toolbar')).toBeHidden();
  await expect(page.locator('#contractDocument')).toBeVisible();
  await expect(page.locator('#simuladorTitulo')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('external game migration preserves history and adds variable conversation and cup gain', async ({ page }) => {
  const E = require('../../js/economy.js'),
    C = require('../../js/economy-catalog.js');
  const settings = E.defaults('custom');
  const catalog = C.document(settings);
  catalog.games = catalog.games.filter((item) => item.scoreBased !== false);
  catalog.gains = catalog.gains.filter((item) => item.id !== 'Cuspir no copo');
  for (const id of ['Buraco', 'Perfil', 'Match Masters']) {
    catalog.games.push({ id, amount: 10, timerEligible: true });
    settings.games[id] = 10;
  }
  const old = [{ descricao: 'Ganho antigo preservado', valor: 10, saldoAtual: 10, tipo: 'ganho', timestamp: '2026-10-30T12:00:00Z' }];
  await open(page, { economy: JSON.stringify(settings), economyCatalog: JSON.stringify(catalog), historico: JSON.stringify(old), saldoDominadora: '10' });
  await page.locator('[data-jump=ganho]').click();
  for (const id of ['Buraco', 'Perfil', 'Match Masters']) await expect(page.locator('#selectGanho option').filter({ hasText: new RegExp('^' + id + ' ') })).toHaveCount(0);
  await page.locator('#selectGanho').selectOption('Conversar no grupo do WhatsApp sobre compras');
  await expect(page.locator('#valorGanho')).toHaveValue('15');
  await expect(page.locator('#valorGanho')).not.toHaveAttribute('readonly');
  await expect(page.locator('#gameScoreCalculator')).toBeHidden();
  await page.locator('#selectGanho').selectOption('Cuspir no copo');
  await expect(page.locator('#valorGanho')).toHaveValue('5');
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico'))[0].descricao)).toBe('Ganho antigo preservado');
  await page.reload();
  await expect(page.locator('#selectGanho option[value="Cuspir no copo"]')).toHaveCount(1);
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 10,00');
});

test('dynamic combo stacks unique activities, survives reload paused and resets on settlement', async ({ page }) => {
  await open(page);
  await page.locator('[data-jump=ganho]').click();
  await page.clock.install();
  await page.locator('#btnPlayPauseTempo').click();
  for (const id of ['Conversar no grupo do WhatsApp sobre compras', 'Videogames Competitivos', 'Videogames Competitivos']) {
    await page.locator('#selectGanho').selectOption(id);
    await page.locator('#adicionar').click();
  }
  await expect(page.locator('#timerDynamicCombo .dynamic-combo-chip')).toHaveCount(2);
  const before = Number(await page.locator('#valorPorMinuto').inputValue());
  await page.clock.fastForward(60000);
  expect(Number(await page.locator('#valorPorMinuto').inputValue())).toBeCloseTo(before + 0.02, 2);
  await page.reload();
  await page.locator('[data-jump=ganho]').click();
  await expect(page.locator('#timerDynamicCombo .dynamic-combo-chip')).toHaveCount(2);
  await expect(page.locator('#btnPlayPauseTempo')).toContainText('Continuar');
  await page.locator('#timerDynamicCombo .dynamic-combo-chip').first().click();
  await expect(page.locator('#timerDynamicCombo .dynamic-combo-chip')).toHaveCount(1);
  await page.clock.install();
  await page.locator('#btnPlayPauseTempo').click();
  const remaining = Number(await page.locator('#valorPorMinuto').inputValue());
  await page.clock.fastForward(60000);
  expect(Number(await page.locator('#valorPorMinuto').inputValue())).toBeCloseTo(remaining + 0.01, 2);
  await page.locator('#btnTerminarTempo').click();
  await expect(page.locator('#timerDynamicCombo .dynamic-combo-chip')).toHaveCount(0);
  for (const id of ['Cuspir no copo', 'Pés na cara']) await expect(page.locator('#selectGanho option').filter({ hasText: new RegExp('^' + id) })).toContainText('💲');
});

test('choosing a gain automatically starts time without crediting and preserves manual pause', async ({ page }) => {
  await open(page);
  await page.locator('[data-jump=ganho]').click();
  await page.clock.install();
  await expect(page.locator('#timerVisualStatus')).toContainText('Parado');
  await page.locator('#selectGanho').selectOption('Conversar no grupo do WhatsApp sobre compras');
  await expect(page.locator('#timerVisualStatus')).toContainText('Em andamento');
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 0,00');
  await page.clock.fastForward(10000);
  await expect(page.locator('#tempoDisplay')).toHaveText('00:10');
  await page.locator('#selectGanho').selectOption('Videogames Competitivos');
  await expect(page.locator('#tempoDisplay')).toHaveText('00:10');
  await page.locator('#adicionar').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 10,00');
  await page.locator('#btnPlayPauseTempo').click();
  const pausedTime = await page.locator('#tempoDisplay').textContent();
  await page.locator('#selectGanho').selectOption('Pés na cara');
  await expect(page.locator('#timerVisualStatus')).toContainText('Pausado');
  await page.clock.fastForward(10000);
  await expect(page.locator('#tempoDisplay')).toHaveText(pausedTime);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#contadorBloco').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/transacao-compacta-auto.png', animations: 'disabled' });
  await page.locator('#btnTerminarTempo').click();
  await expect(page.locator('#timerVisualStatus')).toContainText('Finalizado');
  await page.locator('#selectGanho').selectOption('Cuspir no copo');
  await expect(page.locator('#timerVisualStatus')).toContainText('Em andamento');
});

test('ordinary activity explains immediate rate increase and roulette hides provisional copy', async ({ page }) => {
  await open(page);
  await expect(page.locator('#roulettePrizeList')).toBeHidden();
  await expect(page.locator('#rouletteSection')).not.toContainText('aparecerão aqui');
  await page.locator('[data-jump=ganho]').click();
  await page.locator('#selectGanho').selectOption('Tapa de pé na cara');
  await expect(page.locator('#activityRateHint')).toContainText('mesmo sem 💲');
  const text = await page.locator('#activityRateHint').textContent();
  const expected = Number(text.match(/R\$\s*([\d,]+)/)[1].replace(',', '.'));
  const before = Number(await page.locator('#valorPorMinuto').inputValue());
  await page.locator('#adicionar').click();
  expect(Number(await page.locator('#valorPorMinuto').inputValue())).toBeCloseTo(before + expected, 2);
  await expect(page.locator('#timerDynamicCombo .dynamic-combo-chip')).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.__devNukeAll)).toBe('undefined');
});

test('wallet priorities, fixed mobile tabs and return to edited note', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(
    await page.locator('#simulator').evaluate((el) => {
      const tx = el.querySelector('#transactionSection'),
        balance = el.querySelector('#walletBalanceCard'),
        tasks = el.querySelector('#tarefasPendentes');
      return !!(balance.compareDocumentPosition(tx) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(tx.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
  await expect(page.locator('#simulator #resetSaldo')).toHaveCount(0);
  expect(await page.locator('.app-nav').evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#entryDescription').fill('Nota para conferir');
  await page.locator('#entryAmount').fill('10,00');
  await page.locator('#saveEntry').click();
  const row = page.locator('#groupedFinanceList [data-note-ids]').filter({ hasText: 'Nota para conferir' });
  await row.locator('[data-note-edit]').click();
  await page.locator('#entryAmount').fill('12,00');
  await page.locator('#saveEntry').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(row).toHaveClass(/note-just-edited/);
  await expect(row).toBeInViewport();
  await expect(row).toContainText('12,00');
  await page.screenshot({ path: '.local/prioridades-nota-mobile.png', animations: 'disabled' });
  await page.locator('[data-panel=backupPanel]').click();
  await page.locator('#walletMaintenance > summary').click();
  await expect(page.locator('#resetSaldo')).toBeVisible();
  await expect(page.locator('#limparHistorico')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-panel=simulator]').click();
  await page.screenshot({ path: '.local/prioridades-wallet-mobile.png', animations: 'disabled' });
});
