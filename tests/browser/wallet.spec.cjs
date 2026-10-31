const { test, expect } = require('@playwright/test');
async function autoConfirm(page) {
  await page.addLocatorHandler(page.locator('.app-dialog[open]'), async () => {
    await page.locator('.app-dialog [data-dialog-confirm]').click();
  });
}
async function open(page, seed = {}) {
  // Preserve the user's Firebase module on disk, but never exercise an external
  // integration or the user's cloud project in these isolated browser tests.
  await page.route('**/firebaseConfiguration.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
  await page.addInitScript((seed) => {
    if (!localStorage.getItem('findom.wallet.v2')) for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, seed);
  await page.goto('/');

  await expect(page.locator('#selectTarefa option')).toHaveCount(18);
}
const finance = async (page) => {
  await page.locator('[data-panel="financePanel"]').click();
  await page.locator('#financeManager > summary').click();
  await page.locator('#financeIndicators > summary').click();
};
test('new default economy persists across reload without user settings changes', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => getEconomy().mode)).toBe('balanced');
  await page.reload();

  expect(await page.evaluate(() => getEconomy().mode)).toBe('balanced');
});
async function manual(page, { description = 'Compra teste', amount = '12,34', store = 'Loja Aurora', status = 'paid' } = {}) {
  await page.locator('#entryCategory').selectOption('Lista de Compras');
  await page.locator('#entryDescription').fill(description);
  await page.locator('#entryStore').fill(store);
  await page.locator('#entryAmount').fill(amount);
  await page.locator('#entryStatus').selectOption(status);
  await page.locator('#saveEntry').click();
}
test('desktop/mobile init, navigation and no horizontal overflow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await finance(page);
  await expect(page.locator('#financePanel')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-panel="simulator"]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('manual CRUD, budget, statuses, filters and persistence', async ({ page }) => {
  await autoConfirm(page);
  await open(page);
  await finance(page);
  await manual(page);
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(1);
  await page.getByText('Orçamento (opcional)', { exact: true }).click();
  await page.locator('#financeBudget').fill('10,00');
  await page.locator('#saveBudget').click();
  await expect(page.locator('#homeRemaining')).toContainText('-');
  await page.locator('#financeHistory [data-action=edit]').click();
  await page.locator('#entryAmount').fill('15,55');
  await page.locator('#entryStatus').selectOption('paid');
  await page.locator('#saveEntry').click();
  await expect(page.locator('#homeTotal')).toContainText('15,55');
  await page.reload();

  await finance(page);
  await expect(page.locator('#financeHistory')).toContainText('15,55');
  await page.locator('#financeStatus').selectOption('refunded');
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(0);
  await page.locator('#clearFinanceFilters').click();
  await page.locator('#financeHistory [data-action=edit]').click();
  await page.locator('#entryStatus').selectOption('paid');
  await page.locator('#saveEntry').click();
  await page.locator('#financeHistory [data-action=refund]').click();
  await expect(page.locator('#homeTotal')).toContainText('0,00');
  await page.locator('#financeHistory [data-action=delete]').click();
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(0);
  expect(await page.evaluate(() => FinanceUI.getState().audit.length)).toBe(4);
});
test('WhatsApp preview correctable, duplicate import and conflicting edits', async ({ page }) => {
  await autoConfirm(page);
  await open(page);
  await finance(page);
  await page.getByText('Colar lista do WhatsApp', { exact: true }).click();
  const text = '1. Jogo de Buraco\n✅ Jogos R$ 10,25 + R$ 5,00\n2. Lista de Compras\n✅ Shein (1) R$ 40,50\n❌ Shein (2) R$ 55,00\nSubtotal R$ 999,00';
  await page.locator('#whatsappInput').fill(text);
  await page.locator('#previewImport').click();
  await expect(page.locator('#importWarnings')).toContainText('4 novos');
  await page.locator('#importReview > summary').click();
  await page.locator('#importRows details').first().locator('summary').click();
  await page.locator('#importRows [data-field=amount]').first().fill('11,25');
  await page.locator('#confirmImport').click();
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(4);
  await page.locator('#whatsappInput').fill(text);
  await page.locator('#previewImport').click();
  await expect(page.locator('#importWarnings')).toContainText('0 novos');
  await expect(page.locator('#confirmImport')).toBeDisabled();
});
test('classic migration, balanced prices, exact single discount, gains and archive', async ({ page }) => {
  await autoConfirm(page);
  await open(page, { saldoDominadora: '100', historico: '[{"descricao":"Legado","valor":12.25,"saldoAtual":100,"tipo":"ganho","timestamp":"2026-01-01T12:00:00.000Z"}]' });
  await page.locator('#privilegeSeal').click();
  await page.locator('#selectTarefa').selectOption({ index: 1 });
  await expect(page.locator('#previewDescontoCompra')).toContainText('25,5');
  await page.locator('#adicionar').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 74,50');
  await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
  await page.locator('[data-jump=ganho]').click();
  await page.locator('#selectGanho').selectOption('Videogames Competitivos');
  await page.locator('#valorGanho').fill('10');
  await page.locator('#adicionar').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 86,00');
  expect(await page.evaluate(() => historico.find((h) => h.descricao === 'Legado').valor)).toBe(12.25);
  await page.locator('#historico .btn-del-hist').first().click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 86,00');
  await page.reload();

  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 86,00');
  await expect(page.locator('#bonusEspecialCheckbox')).toBeChecked();
});
test('timer resume after reload, elapsed integration and no duplicate settlement', async ({ page }) => {
  await open(page);
  await page.locator('[data-jump=ganho]').click();
  await page.clock.install();
  await page.locator('#btnPlayPauseTempo').click();
  await page.clock.fastForward(60000);
  await page.locator('#btnPlayPauseTempo').click();
  await expect(page.locator('#tempoDisplay')).toHaveText('01:00');
  await page.reload();

  await page.locator('[data-jump=ganho]').click();
  await expect(page.locator('#tempoDisplay')).toHaveText('01:00');
  await page.locator('#btnTerminarTempo').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 0,50');
  await page.locator('#btnTerminarTempo').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 0,50');
});
test('service cooldown and timed reducer survive reload', async ({ page }) => {
  await autoConfirm(page);
  await open(page, { saldoDominadora: '2000' });
  await page.locator('#selectTarefa').selectOption({ index: 11 });
  await page.locator('#adicionar').click();
  await expect(page.locator('#selectTarefa option').nth(11)).toBeDisabled();
  const before = await page.evaluate(() => JSON.parse(AppStorage.getItem('tarefasBloqueadas')).find((b) => b.nome === Economy.config.services[10].id).expiraEm);
  await page.locator('#selectTarefa').selectOption({ index: 13 });
  await page.locator('#adicionar').click();
  await expect(page.locator('#selectTarefa option').nth(13)).toBeDisabled();
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => JSON.parse(AppStorage.getItem('tarefasBloqueadas')).find((b) => b.nome === Economy.config.services[10].id).expiraEm);
  expect(after).toBeLessThan(before - 10000);
  await page.reload();

  await expect(page.locator('#selectTarefa option').nth(11)).toBeDisabled();
  await expect(page.locator('#selectTarefa option').nth(13)).toBeDisabled();
});
test('roulette blocks concurrent spins, reload awards exactly once, free claim once', async ({ page }) => {
  await autoConfirm(page);
  await open(page);
  await page.evaluate(() => (Math.random = () => 0.1));
  await page.locator('#btnRoletaFlutuante').click();
  await page.locator('#btnRoletaGirar').click();
  await expect(page.locator('#btnRoletaGirar')).toBeDisabled();
  await page.reload();

  await expect(page.locator('#btnRoletaFlutuante')).toBeDisabled();
  await expect(page.locator('#roulettePrizeList [data-claim]')).toHaveCount(0);
  await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
  await expect(page.locator('#roulettePrizeList [data-claim]')).toHaveCount(0);
  await page.reload();

  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('rouletteAwards')).length)).toBe(1);
  await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
});
test('receipt text suggestion editable, never auto-registers, file discarded', async ({ page }) => {
  await autoConfirm(page);
  await open(page);
  await finance(page);
  await page.getByText('Ler imagem ou PDF com OCR local', { exact: true }).click();
  await page.locator('#receiptText').fill('SHEIN\nData: 15/01/2026\nSubtotal R$ 200,00\nFrete R$ 10,00\nTotal pago R$ 180,00');
  await page.locator('#suggestReceipt').click();
  await expect(page.locator('#entryAmount')).toHaveValue('180,00');
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(0);
  await page.locator('#entryAmount').fill('175,00');
  await page.locator('#saveEntry').click();
  await expect(page.locator('#homeTotal')).toContainText('175,00');
  await page.locator('#processReceipt').click();
  await expect(page.locator('#ocrProgress')).toContainText('cadastro manual continua disponível');
});
test('real PNG OCR local execution and embedded-text PDF, no external request', async ({ page }) => {
  test.setTimeout(120000);
  const external = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== 'http://127.0.0.1:' + (process.env.FINDOM_TEST_PORT || 4174)) external.push(r.url());
  });
  await open(page);
  await finance(page);
  await page.getByText('Ler imagem ou PDF com OCR local', { exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1100;
    c.height = 700;
    const x = c.getContext('2d');
    x.fillStyle = 'white';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'black';
    x.font = '40px Arial';
    ['SHEIN', 'Data: 15/01/2026', 'Subtotal R$ 100,00', 'Frete R$ 10,00', 'Total pago R$ 90,00'].forEach((line, i) => x.fillText(line, 60, 90 + i * 100));
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#receiptFile').setInputFiles({ name: 'receipt-fiction.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('#processReceipt').click();
  await expect(page.locator('#ocrProgress')).toContainText('Leitura concluída', { timeout: 90000 });
  await expect(page.locator('#entryAmount')).toHaveValue('90,00');
  await expect(page.locator('#receiptFile')).toHaveValue('');
  const { makePDF } = require('../pdf-fixture.cjs');
  await page.locator('#receiptFile').setInputFiles({ name: 'fiction.pdf', mimeType: 'application/pdf', buffer: makePDF() });
  await page.locator('#processReceipt').click();
  await expect(page.locator('#ocrProgress')).toContainText('Leitura concluída', { timeout: 30000 });
  await expect(page.locator('#entryAmount')).toHaveValue('42,50');
  expect(external).toEqual([]);
  expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(0);
});
test('JSON backup preview and full restore including balance and finance', async ({ page }) => {
  await autoConfirm(page);
  await open(page, { saldoDominadora: '123.45' });
  await finance(page);
  await manual(page);
  await page.locator('[data-panel=backupPanel]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportBackup').click();
  const download = await downloadPromise;
  const path = await download.path();
  const bytes = require('node:fs').readFileSync(path);
  await page.locator('#backupFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: bytes });
  await page.locator('#previewBackup').click();
  await expect(page.locator('#backupPreview')).toContainText('Backup válido');
  await page.locator('#confirmBackup').click();

  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 123,45');
  await finance(page);
  await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(1);
});
test('scanned PDF is rasterized and recognized; invalid files fail with manual fallback', async ({ page }) => {
  test.setTimeout(120000);
  await open(page);
  await finance(page);
  await page.getByText('Ler imagem ou PDF com OCR local', { exact: true }).click();
  const jpeg = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1100;
    c.height = 700;
    const x = c.getContext('2d');
    x.fillStyle = 'white';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'black';
    x.font = '42px Arial';
    ['LOJA AURORA', 'Data: 15/01/2026', 'Subtotal R$ 70,00', 'Total pago R$ 62,50'].forEach((line, i) => x.fillText(line, 60, 100 + i * 130));
    return c.toDataURL('image/jpeg', 0.95).split(',')[1];
  });
  const { makeImagePDF } = require('../pdf-fixture.cjs');
  await page.locator('#receiptFile').setInputFiles({ name: 'scan-fiction.pdf', mimeType: 'application/pdf', buffer: makeImagePDF(Buffer.from(jpeg, 'base64'), 1100, 700) });
  await page.locator('#processReceipt').click();
  await expect(page.locator('#ocrProgress')).toContainText('Leitura concluída', { timeout: 90000 });
  await expect(page.locator('#entryAmount')).toHaveValue('62,50');
  await page.locator('#receiptFile').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid synthetic PDF') });
  await page.locator('#processReceipt').click();
  await expect(page.locator('#ocrProgress')).toContainText('cadastro manual continua disponível');
  await expect(page.locator('#receiptFile')).toHaveValue('');
});
test('PWA update waits for consent, Later preserves state, confirmed reload and offline launch', async ({ page, context }) => {
  test.setTimeout(35000);
  await open(page, { saldoDominadora: '321.45' });
  await finance(page);
  await manual(page);
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active)), { timeout: 15000 }).toBe(true);
  await page.reload();

  const fs = require('node:fs'),
    path = require('node:path'),
    file = path.resolve(__dirname, '../../dist/service-worker.js'),
    original = fs.readFileSync(file, 'utf8');
  try {
    const changed = original.replace(/const VERSION\s*=\s*'[^']+';/, "const VERSION='test-update-" + Date.now() + "';");
    expect(changed).not.toBe(original);
    fs.writeFileSync(file, changed);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
    });
    await expect(page.locator('.app-dialog')).toContainText('nova versão');
    await page.locator('[data-dialog-cancel]').click();
    await expect(page.locator('#updateBanner')).toBeVisible({ timeout: 30000 });
    await page.locator('#updateLater').click();
    await expect(page.locator('#updateBanner')).toBeHidden();
    await expect(page.locator('#saldoDominadora')).toHaveText('R$ 321,45');
    await page.evaluate(() => (document.getElementById('updateBanner').hidden = false));
    await page.locator('#updateNow').click();

    await expect(page.locator('#saldoDominadora')).toHaveText('R$ 321,45');
    await finance(page);
    await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(1);
    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('#saldoDominadora')).toHaveText('R$ 321,45');
    await finance(page);
    await expect(page.locator('#financeHistory .finance-entry')).toHaveCount(1);
  } finally {
    fs.writeFileSync(file, original);
    await context.setOffline(false);
  }
});
test('internal service purchases never create real expenses or redemption requests', async ({ page }) => {
  await autoConfirm(page);
  await open(page, { saldoDominadora: '1000' });
  await page.locator('#selectTarefa').selectOption({ index: 12 });
  await page.locator('#adicionar').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 550,00');
  await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
  expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(0);
  expect(await page.evaluate(() => FinanceUI.getState().redemptions.length)).toBe(0);
  await finance(page);
  await expect(page.locator('#requestRedemption')).toHaveCount(0);
  await expect(page.locator('#homeTotal')).toContainText('0,00');
});
test('real spending and editable notes never debit the Wallet balance', async ({ page }) => {
  await autoConfirm(page);
  await open(page, { saldoDominadora: '200' });
  await finance(page);
  await page.locator('[data-finance-jump=entry]').click();
  await page.locator('#entryForm details summary').click();
  await page.locator('#entryNote').fill('Observação fictícia do jogo.');
  await manual(page, { description: 'Nota de jogo', amount: '15,50', store: '' });
  expect(await page.evaluate(() => FinanceUI.getState().entries[0].note)).toBe('Observação fictícia do jogo.');
  await page.locator('[data-panel=simulator]').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 200,00');
  await expect(page.locator('#homeTotal')).toBeHidden();
});
test('import preview draft survives reload but never creates entries before confirmation', async ({ page }) => {
  await open(page);
  await finance(page);
  await page.locator('[data-finance-jump=import]').click();
  await page.locator('#whatsappInput').fill('1. Perfil\n• Nota fictícia: R$ 12,50');
  await page.locator('#previewImport').click();
  await expect(page.locator('#importWarnings')).toContainText('1 novos');
  await page.reload();

  await finance(page);
  await expect(page.locator('#importPreview')).toBeVisible();
  await expect(page.locator('#importWarnings')).toContainText('1 novos');
  expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(0);
});
