const { test, expect } = require('@playwright/test');
const { hub } = require('./firebase-hub.cjs');
async function settings(page) {
  await page.locator('[data-panel=backupPanel]').click();
  if (!(await page.locator('#cloudSettings').evaluate((el) => el.open))) await page.locator('#cloudSettings > summary').click();
}
async function create(page) {
  await settings(page);
  await page.locator('#connectExistingFirebase').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#cloudStatusText')).toContainText('controle neste aparelho');
  return page.evaluate(() => localStorage.getItem('findom.cloud.pair.v3'));
}
async function join(page, code) {
  await settings(page);
  await page.locator('#cloudPairCode').fill(code);
  await page.locator('#joinSharedWallet').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#cloudStatusText')).toContainText('Acompanhando');
}
for (const [name, options] of [
  ['desktop', { viewport: { width: 1440, height: 1000 } }],
  ['phone', { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true }],
  ['tablet', { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true }],
])
  test(name + ': two isolated devices share balance, bonus, purchases, tasks and a paused handoff', async ({ browser }) => {
    const server = await hub(),
      ca = await browser.newContext(),
      cb = await browser.newContext(options);
    const a = await ca.newPage(),
      b = await cb.newPage(),
      errors = [];
    a.on('pageerror', (e) => errors.push(e.message));
    b.on('pageerror', (e) => errors.push(e.message));
    try {
      await server.attach(a, '1000');
      await server.attach(b, '777');
      const code = await create(a);
      await join(b, code);
      expect(await b.evaluate(() => JSON.parse(localStorage.getItem('findom.cloud.before.v3')).simulator.saldoDominadora)).toBe('777');
      await a.locator('[data-panel=simulator]').click();
      await a.locator('#privilegeSeal').click();
      await a.locator('[data-jump=ganho]').click();
      await a.locator('#selectGanho').selectOption('Outro');
      await a.locator('#valorGanho').fill('10');
      await a.locator('#valorGanho').dispatchEvent('input');
      await a.locator('#adicionar').click();
      await b.locator('[data-panel=simulator]').click();
      await expect(b.locator('#saldoDominadora')).toHaveText('R$ 1.011,50');
      await expect(b.locator('#privilegeSeal')).toHaveAttribute('aria-pressed', 'true');
      await expect(b.locator('#simuladorTitulo')).toHaveClass(/bonus-title-active/);
      const firstSeconds = await b.evaluate(() => {
        window.__financeRebuilds = 0;
        new MutationObserver(() => window.__financeRebuilds++).observe(document.getElementById('financeHistory'), { childList: true });
        return JSON.parse(AppStorage.getItem('timerSession')).seconds;
      });
      await expect.poll(() => b.evaluate(() => JSON.parse(AppStorage.getItem('timerSession')).seconds)).toBeGreaterThan(firstSeconds + 1);
      expect(await b.evaluate(() => window.__financeRebuilds)).toBe(0);
      await a.locator('#btnPlayPauseTempo').click();
      await expect.poll(() => b.evaluate(() => JSON.parse(AppStorage.getItem('timerSession')).running)).toBe(false);
      await a.locator('#btnPlayPauseTempo').click();
      await expect.poll(() => b.evaluate(() => JSON.parse(AppStorage.getItem('timerSession')).running)).toBe(true);
      await a.locator('[data-jump=gasto]').click();
      await a.locator('#selectTarefa').selectOption({ index: 1 });
      await a.locator('#adicionar').click();
      await a.locator('[data-dialog-confirm]').click();
      await expect(b.locator('#saldoDominadora')).toHaveText('R$ 986,00');
      await expect(b.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
      expect(await b.evaluate(() => JSON.parse(AppStorage.getItem('historico')).length)).toBe(2);
      await b.reload();
      await expect(b.locator('#cloudStatusText')).toContainText('Acompanhando');
      // The companion cannot change the bonus or produce a second transaction.
      await b.locator('#privilegeSeal').click();
      await expect(b.locator('#privilegeSeal')).toHaveAttribute('aria-pressed', 'true');
      await expect(a.locator('#saldoDominadora')).toHaveText('R$ 986,00');
      await a.locator('#cloudControl').click();
      await expect(a.locator('#cloudStatusText')).toContainText('Acompanhando');
      await b.locator('#cloudControl').click();
      await expect(b.locator('#cloudStatusText')).toContainText('controle neste aparelho');
      expect(await b.evaluate(() => timerInterval)).toBe(null);
      expect(await b.evaluate(() => JSON.parse(AppStorage.getItem('timerSession')).running)).toBe(false);
      await b.locator('#tarefasPendentes input[type=checkbox]').check();
      await expect(a.locator('#tarefasPendentes .tarefa-item')).toHaveCount(0);
      await expect(b.locator('#tarefasPendentes .tarefa-item')).toHaveCount(0);
      await a.reload();
      await expect(a.locator('#cloudStatusText')).toContainText('Acompanhando');
      await expect(a.locator('#saldoDominadora')).toHaveText('R$ 986,00');
      expect(await b.evaluate(() => JSON.parse(AppStorage.getItem('historico')).length)).toBe(2);
      await b.reload();
      await expect(b.locator('#cloudStatusText')).toContainText('controle neste aparelho');
      const encrypted = server.docs.get('usuarios/gabriel-local').walletAtualV3;
      expect(encrypted.simulator).toBeUndefined();
      expect(JSON.stringify(encrypted)).not.toContain('saldoDominadora');
      expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await b.screenshot({ path: '.local/cloud-' + name + '.png', fullPage: true });
      expect(errors).toEqual([]);
    } finally {
      await ca.close();
      await cb.close();
    }
  });

test('catalog, finance records and free roulette awards replicate once; reconnection never uploads a stale mirror', async ({ browser }) => {
  const server = await hub(),
    ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await server.attach(a, '100');
    await server.attach(b, '0');
    const code = await create(a);
    await join(b, code);
    await a.evaluate(() => {
      const document = EconomyCatalog.document(getEconomy());
      document.services.push({ id: 'Exemplo sintético', label: 'Exemplo sintético', price: 25, description: 'Apenas teste isolado', reduceHours: 0 });
      window.document.getElementById('customEconomyJson').value = JSON.stringify(document);
    });
    await a.locator('#customEconomy > summary').click();
    await a.locator('#saveCustomEconomy').click();
    await expect(b.locator('#selectTarefa option').filter({ hasText: 'Exemplo sintético' })).toHaveCount(1);
    await a.evaluate(() => {
      const finance = Finance.update(Finance.empty(), {
        type: 'add',
        entry: { id: 'isolated-note', category: Finance.categories[7], description: 'Descrição sintética longa para conferência nos dois aparelhos', store: 'Exemplo', date: '2026-10-31', amount: 1234, currency: 'BRL', status: 'paid' },
      });
      finance.budget = 20000;
      WalletStore.commitFinance(finance);
      AppStorage.setItem('rouletteAwards', JSON.stringify([{ id: 'isolated-prize', kind: 'freeService', serviceId: Economy.config.services[0].id, label: 'Prêmio sintético', claimed: false, createdAt: new Date().toISOString() }]));
      window.dispatchEvent(new Event('roulette:awards'));
    });
    await expect.poll(() => b.evaluate(() => WalletStore.finance().budget)).toBe(20000);
    expect(await b.evaluate(() => WalletStore.finance().entries[0].id)).toBe('isolated-note');
    await expect.poll(() => b.evaluate(() => JSON.parse(AppStorage.getItem('tarefasPendentes')).length)).toBe(1);
    await b.reload();
    await expect(b.locator('#cloudStatusText')).toContainText('Acompanhando');
    expect(await b.evaluate(() => JSON.parse(AppStorage.getItem('historico')).filter((h) => h.id === 'prize:isolated-prize').length)).toBe(1);
    await a.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await a.evaluate(() => WalletStore.isWritable())).toBe(false);
    await expect(a.locator('#cloudStatusText')).toContainText('Sem conexão');
    await settings(a);
    await a.locator('#reconnectCloud').click();
    await expect(a.locator('#cloudStatusText')).toContainText('controle neste aparelho');
    expect(await a.evaluate(() => JSON.parse(AppStorage.getItem('tarefasPendentes')).length)).toBe(1);
  } finally {
    await ca.close();
    await cb.close();
  }
});

test('existing Firebase connects without loading an anonymous authentication provider', async ({ page }) => {
  const server = await hub();
  await server.attach(page, '321');
  await create(page);
  expect(server.authRequests()).toBe(0);
  expect(await page.evaluate(() => AppStorage.getItem('saldoDominadora'))).toBe('321');
  expect(server.docs.get('usuarios/gabriel-local').saldoDominadora).toBe(321);
});

test('restoring a reviewed backup waits for Firebase acknowledgment before reload and reaches the companion', async ({ browser }) => {
  const server = await hub(),
    ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await server.attach(a, '100');
    await server.attach(b, '777');
    const code = await create(a);
    await join(b, code);
    const backup = await a.evaluate(() => {
      const wallet = WalletStore.snapshot();
      wallet.simulator.saldoDominadora = '222.5';
      return JSON.stringify({ format: 'findom-wallet-backup', version: 2, wallet });
    });
    await a.locator('#backupFile').setInputFiles({ name: 'isolated-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await a.locator('#previewBackup').click();
    await a.locator('#confirmBackup').click();
    await a.locator('[data-dialog-confirm]').click();
    await expect(b.locator('#saldoDominadora')).toHaveText('R$ 222,50');
    await expect(a.locator('#saldoDominadora')).toHaveText('R$ 222,50');
    await expect(a.locator('#cloudStatusText')).toContainText('controle neste aparelho');
    expect(await b.evaluate(() => JSON.parse(localStorage.getItem('findom.cloud.before.v3')).simulator.saldoDominadora)).toBe('777');
  } finally {
    await ca.close();
    await cb.close();
  }
});
