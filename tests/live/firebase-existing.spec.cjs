const { test, expect } = require('@playwright/test');
const { hub } = require('./firebase-primary-hub.cjs');
const Finance = require('../../js/finance.js');
const root = 'usuarios/gabriel-local';
test('an authenticated client opens the wallet with the privilege price migration marker', async ({ page }) => {
  const raw = { saldoDominadora: 1000, bonusEspecialAtivo: false, tarefasBloqueadas: [], accelBoosts: [] };
  const Primary = require('../../js/firebase-primary-model.js');
  const canonical = Primary.bootstrap(raw, {}, { simulator: {}, emptyFinance: Finance.empty() });
  canonical.simulator.privilegePrices20261105 = '1';
  const server = await hub({ [root]: { ...raw, walletAtualV4: canonical } });

  await page.setViewportSize({ width: 393, height: 852 });
  await server.attach(page);
  await expect(page.locator('#firebaseAuthPanel')).toBeHidden();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 1.000,00');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  expect(await page.evaluate(() => AppStorage.getItem('privilegePrices20261105'))).toBe('1');
  expect(server.docs.get(root).walletAtualV4.simulator.privilegePrices20261105).toBe('1');
});

for (const width of [1440, 393, 820])
  test(`Firebase principal ${width}: server money and bonus load automatically before any operation`, async ({ browser }) => {
    const server = await hub({
      [root]: { saldoDominadora: 1000, bonusEspecialAtivo: false, timerTempoSegundos: 6, timerValorAtual: 0.19, timerValorPorMinuto: 1.93, timerAtivo: true, tarefasBloqueadas: [], accelBoosts: [], notificationToken: 'synthetic-preserved' },
    });
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 1000, hasTouch: width < 1000 });
    const page = await context.newPage();
    try {
      await page.addInitScript(() => localStorage.setItem('bonusEspecialAtivo', 'true'));
      await server.attach(page, '0');
      await expect(page.locator('#saldoDominadora')).toHaveText('R$ 1.000,00');
      await expect(page.locator('#privilegeSeal')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
      expect(server.docs.get(root).saldoDominadora).toBe(1000);
      expect(server.docs.get(root + '/config/antesFirebasePrincipalV4').usuarioAnterior.saldoDominadora).toBe(1000);
      expect(server.docs.get(root).notificationToken).toBe('synthetic-preserved');
      expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('timerSession')).running)).toBe(false);
      await server.publish(root, { ...server.docs.get(root), saldoDominadora: 1234.5, bonusEspecialAtivo: true });
      await expect(page.locator('#saldoDominadora')).toHaveText('R$ 1.234,50');
      await expect(page.locator('#privilegeSeal')).toHaveAttribute('aria-pressed', 'true');
      expect(await page.locator('#connectExistingFirebase,#cloudPairCode')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await context.close();
    }
  });
test('signed-out and unauthorized Google accounts cannot see cached notes or modify the server', async ({ browser }) => {
  for (const user of [null, { uid: 'outsider', email: 'outsider@example.invalid', emailVerified: true }]) {
    const server = await hub(),
      context = await browser.newContext(),
      page = await context.newPage();
    try {
      await server.attach(page, '777', { user });
      await expect(page.locator('#firebaseAuthPanel')).toBeVisible();
      await expect(page.locator('#saldoDominadora')).toBeHidden();
      expect(server.writes()).toBe(0);
      expect(server.docs.get(root).saldoDominadora).toBe(1000);
    } finally {
      await context.close();
    }
  }
});
test('first sign-in imports existing local notes only into an empty Firebase ledger, retaining IDs, currencies and order', async ({ page }) => {
  const local = Finance.update(Finance.empty(), {
    type: 'add',
    entry: {
      id: 'current-note',
      category: Finance.categories[2],
      description: 'Conversão sintética preservada',
      store: 'Exemplo',
      date: '2026-11-02',
      currency: 'BRL',
      amount: 20000,
      status: 'paid',
      originalMoney: [
        { currency: 'USD', amount: 5000 },
        { currency: 'BRL', amount: 20000 },
      ],
      sourceLine: '$50,00 = R$ 200,00',
    },
  });
  const wallet = { version: 2, revision: 0, simulator: { saldoDominadora: '0', bonusEspecialAtivo: 'true' }, finance: local };
  const server = await hub();
  await server.attach(page, '0', { wallet });
  await expect.poll(() => JSON.parse(server.docs.get(root).walletAtualV4?.financeJson || '{"entries":[]}').entries.length).toBe(1);
  expect(JSON.parse(server.docs.get(root).walletAtualV4.financeJson)).toEqual(local);
  expect(server.docs.get(root).saldoDominadora).toBe(1000);
  expect(server.docs.get(root).walletAtualV4.financeImportOpen).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('findom.firebase.before-primary.v4')).finance)).toEqual(local);
  await page.reload();
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  expect(JSON.parse(server.docs.get(root).walletAtualV4.financeJson).entries.map((x) => x.id)).toEqual(['current-note']);
});
test('a missing existing Firebase document is an error, never a zero browser upload', async ({ page }) => {
  const server = await hub({ [root]: null });
  await server.attach(page, '0');
  await expect(page.locator('#firebaseAuthMessage')).toContainText('não foi encontrado');
  expect(server.writes()).toBe(0);
});

test('a stale local note cannot repopulate an intentionally cleared Firebase ledger', async ({ page }) => {
  const Primary = require('../../js/firebase-primary-model.js');
  const raw = { saldoDominadora: 1000, bonusEspecialAtivo: false, tarefasBloqueadas: [], accelBoosts: [] };
  const canonical = Primary.bootstrap(raw, {}, { simulator: {}, emptyFinance: Finance.empty() });
  canonical.financeImportOpen = false;
  const stale = Finance.update(Finance.empty(), { type: 'add', entry: { id: 'stale', category: Finance.categories[7], description: 'Nota antiga sintética', store: '', date: '2026-11-02', currency: 'BRL', amount: 1000, status: 'paid' } });
  const server = await hub({ [root]: { ...raw, walletAtualV4: canonical } });
  await server.attach(page, '0', { wallet: { version: 2, revision: 0, simulator: { saldoDominadora: '0' }, finance: stale } });
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.evaluate(() => SharedWallet.flush());
  expect(JSON.parse(server.docs.get(root).walletAtualV4.financeJson).entries).toEqual([]);
  expect(await page.evaluate(() => WalletStore.finance().entries)).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('findom.firebase.before-primary.v4')).finance.entries[0].id)).toBe('stale');
});

test('Google sign-out hides the wallet and a fresh sign-in reloads the existing server balance', async ({ page }) => {
  const server = await hub();
  await server.attach(page, '0');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('.account-menu > summary').click();
  await page.locator('#firebaseSignOut').click();
  await page.locator('[data-dialog-cancel]').click();
  await expect(page.locator('#saldoDominadora')).toBeVisible();
  await page.locator('#firebaseSignOut').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#firebaseAuthPanel')).toBeVisible();
  await expect(page.locator('#saldoDominadora')).toBeHidden();
  expect(server.docs.get(root).saldoDominadora).toBe(1000);
  await page.locator('#googleSignIn').click();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 1.000,00');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
});

test('revoked Firebase permission hides the cached wallet without deleting recovery data', async ({ page }) => {
  const server = await hub();
  await server.attach(page, '0');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.evaluate(() => SharedWallet.suspend(Object.assign(new Error('Acesso revogado'), { code: 'permission-denied' })));
  await expect(page.locator('#firebaseAuthPanel')).toBeVisible();
  await expect(page.locator('#saldoDominadora')).toBeHidden();
  await expect(page.locator('#financePanel')).toBeHidden();
  expect(await page.evaluate(() => WalletStore.isWritable())).toBe(false);
  expect(await page.evaluate(() => WalletStore.snapshot().simulator.saldoDominadora)).toBe('1000');
  expect(server.docs.get(root).saldoDominadora).toBe(1000);
});

test('a blocked task name from Firebase is rendered as text, never as executable HTML', async ({ page }) => {
  const payload = '\"><img src=x onerror="window.__securityInjected=1">';
  const server = await hub({ [root]: { saldoDominadora: 1000, bonusEspecialAtivo: false, tarefasBloqueadas: [{ nome: payload, expiraEm: Date.now() + 86400000 }], accelBoosts: [] } });
  await server.attach(page, '0');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await expect(page.locator('#tarefasLimitadasLista')).toContainText(payload);
  await expect(page.locator('#tarefasLimitadasLista img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__securityInjected)).toBeUndefined();
  expect(await page.locator('#tarefasLimitadasLista .tempo-restante').getAttribute('data-nome')).toBe(payload);
});
