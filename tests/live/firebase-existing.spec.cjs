const { test, expect } = require('@playwright/test');
const { hub } = require('./firebase-primary-hub.cjs');
const Finance = require('../../js/finance.js');
const { randomBytes } = require('node:crypto');
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

test('a wishlist above the old photo budget saves and reloads through the Firebase transport', async ({ page }) => {
  const Primary = require('../../js/firebase-primary-model.js');
  const Cloud = require('../../js/cloud-sync.js');
  const raw = { saldoDominadora: 1000, bonusEspecialAtivo: false, tarefasBloqueadas: [], accelBoosts: [] };
  const canonical = Primary.bootstrap(raw, {}, { simulator: {}, emptyFinance: Finance.empty() });
  const photo = 'data:image/jpeg;base64,/' + 'a'.repeat(13000);
  const catalog = Array.from({ length: 52 }, (_, index) => ({
    id: 'legacy-item-' + index, title: 'Produto antigo ' + index, store: 'Loja', person: 'Dominadora',
    quantity: 1, originalPrice: 1, currency: 'CAD', imageUrl: photo, bought: false,
  }));
  canonical.simulator.wishlist = JSON.stringify(catalog);
  expect(() => Cloud.assertFits({ simulator: canonical.simulator, financeJson: canonical.financeJson })).toThrow(/excedeu o tamanho/);
  const server = await hub({
    [root]: { ...raw, walletAtualV4: canonical },
    [root + '/config/acesso']: { emails: ['owner@example.invalid', 'partner@example.invalid'], adminEmail: 'owner@example.invalid', securityVersion: 'google-private-v1' },
  });
  await server.attach(page);
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  const editor = page.locator('#wishEditor');
  await editor.locator('summary').click();
  await editor.locator('#wishTitle').fill('Desejo após o limite antigo');
  await editor.locator('#wishStore').fill('Loja');
  await editor.locator('#wishPrice').fill('12,50');
  await editor.locator('#wishSave').click();
  await expect(editor).not.toHaveAttribute('open', '');
  const saved = server.docs.get(root).walletAtualV4;
  expect(saved.wishlistImages).toEqual([photo]);
  expect(JSON.parse(saved.simulator.wishlist)).toHaveLength(53);
  expect(JSON.parse(saved.simulator.wishlist)[0].imageUrl).toBeUndefined();
  await page.reload();
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await expect(page.getByRole('button', { name: 'Editar Desejo após o limite antigo' })).toBeVisible();
  const restored = await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')));
  expect(restored.map(item => item.id).slice(0, 52)).toEqual(catalog.map(item => item.id));
  expect(restored.slice(0, 52).every(item => item.imageUrl === photo)).toBe(true);
});

test('imports wishes beyond one document and reloads with the second Google account', async ({ page, browser }) => {
  const Primary = require('../../js/firebase-primary-model.js');
  const Cloud = require('../../js/cloud-sync.js');
  const raw = { saldoDominadora: 1000, bonusEspecialAtivo: false, tarefasBloqueadas: [], accelBoosts: [] };
  const canonical = Primary.bootstrap(raw, {}, { simulator: {}, emptyFinance: Finance.empty() });
  const catalog = Array.from({ length: 48 }, (_, index) => ({
    id: 'original-' + index, title: 'Produto ' + index + ' 🚀', store: 'Loja', person: 'Dominadora',
    quantity: 1, originalPrice: index + 1, currency: 'CAD', bought: false,
    imageUrl: 'data:image/jpeg;base64,' + randomBytes(9600).toString('base64'),
  }));
  canonical.simulator.wishlist = JSON.stringify(catalog);
  expect(Cloud.fits(Cloud.pack(Cloud.unpack(canonical)))).toBe(true);
  const server = await hub({ [root]: { ...raw, walletAtualV4: canonical } });
  await server.attach(page);
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'findom.wallet.v2' && value.includes('Novo produto')) {
        throw new DOMException('Cache cheio', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
  });

  await page.locator('[data-panel=wishlistPanel]').click();
  const editor = page.locator('#wishEditor');
  await editor.locator('summary').click();
  await editor.locator('#wishTitle').fill('Novo produto 0');
  await editor.locator('#wishStore').fill('Loja');
  await editor.locator('#wishPrice').fill('12,50');
  const addRow = editor.locator('#wishAddManualProduct');
  await addRow.click();
  const batch = editor.locator('#wishBatchRows');
  const url = 'https://example.invalid/p/' + 'a'.repeat(3900);
  for (let index = 0; index < 9; index++) {
    if (index >= await batch.locator('[data-field=url]').count()) await addRow.click();
    await batch.locator('[data-field=title]').nth(index).fill('Novo produto ' + index);
    await batch.locator('[data-field=store]').nth(index).fill('Loja');
    await batch.locator('[data-field=price]').nth(index).fill('12,50');
    await batch.locator('[data-field=url]').nth(index).fill(url + index);
  }
  await editor.getByRole('button', { name: 'Adicionar selecionados' }).click();
  await expect(editor).not.toHaveAttribute('open', '');
  const first = server.docs.get(root).walletAtualV4;
  expect(first.simulator.wishlist).toBeUndefined();
  expect(first.wishlistPages.length).toBeGreaterThan(1);

  const extra = Array.from({ length: 45 }, (_, index) => ({
    ...catalog[index], id: 'extra-' + index, title: 'Imagem adicional ' + index,
    imageUrl: 'data:image/jpeg;base64,' + randomBytes(9600).toString('base64'),
  }));
  await page.evaluate(async items => {
    const wallet = WalletStore.snapshot();
    wallet.simulator.wishlist = JSON.stringify([...JSON.parse(wallet.simulator.wishlist), ...items]);
    WalletStore.commitBoth(wallet.finance, wallet.simulator);
    await SharedWallet.flush();
  }, extra);
  const saved = server.docs.get(root).walletAtualV4;
  expect(saved.wishlistPages.length).toBeGreaterThan(10);
  expect(JSON.stringify(saved).length).toBeLessThan(20000);

  const context = await browser.newContext();
  try {
    const partner = await context.newPage();
    await server.attach(partner, '0', { user: { uid: 'partner', email: 'partner@example.invalid', emailVerified: true } });
    await expect(partner.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
    const restore = () => partner.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')));
    const wishes = await restore();
    expect(wishes).toHaveLength(102);
    expect(wishes.slice(0, 48)).toEqual(catalog);
    expect(wishes.slice(-45)).toEqual(extra);
    expect(wishes.find(item => item.title === 'Novo produto 8')).toMatchObject({ originalPrice: 12.50, url: url + '8' });
    await partner.reload();
    await expect(partner.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
    expect(await restore()).toEqual(wishes);
  } finally {
    await context.close();
  }
});

for (const count of [55, 75]) {
  const fitsLegacy = count === 55;
  test('old rules ' + (fitsLegacy ? 'allow a compatible wishlist edit' : 'keep the draft open until paging is enabled'), async ({ page }) => {
    const Primary = require('../../js/firebase-primary-model.js');
    const raw = { saldoDominadora: 1000, bonusEspecialAtivo: false, tarefasBloqueadas: [], accelBoosts: [] };
    const canonical = Primary.bootstrap(raw, {}, { simulator: {}, emptyFinance: Finance.empty() });
    const wishes = Array.from({ length: count }, (_, index) => ({
      id: 'old-' + index, title: 'Produto ' + index, store: 'Loja', person: 'Dominadora',
      quantity: 1, originalPrice: 12.50, currency: 'CAD', bought: false,
      imageUrl: 'data:image/jpeg;base64,' + randomBytes(9600).toString('base64'),
    }));
    canonical.simulator.wishlist = JSON.stringify(wishes);
    const server = await hub({ [root]: { ...raw, walletAtualV4: canonical } });
    let blocked = 0;
    server.rejectWrites(changes => {
      if (!changes.some(({ path }) => path.startsWith(root + '/wishlistPages/'))) return false;
      blocked++;
      return true;
    });
    await server.attach(page);
    await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
    expect(blocked).toBe(0);
    await page.locator('[data-panel=wishlistPanel]').click();
    await page.getByRole('button', { name: 'Editar Produto 0', exact: true }).click();
    const editor = page.locator('#wishEditor');
    await editor.locator('#wishTitle').fill('Produto revisado');
    await editor.locator('#wishSave').click();

    if (fitsLegacy) {
      await expect(editor).not.toHaveAttribute('open', '');
      const saved = server.docs.get(root).walletAtualV4;
      expect(saved.wishlistPages).toBeUndefined();
      const savedWishes = JSON.parse(saved.simulator.wishlist);
      expect(savedWishes[0]).toMatchObject({ title: 'Produto revisado', imageUrl: wishes[0].imageUrl });
      expect(savedWishes.slice(1)).toEqual(wishes.slice(1));
    } else {
      await expect(editor.locator('#wishSaveError')).toContainText('O acesso à carteira está ativo.');
      await expect(page.locator('#firebaseAuthPanel')).toBeHidden();
      await expect(editor.locator('#wishTitle')).toHaveValue('Produto revisado');
      expect(server.docs.get(root).walletAtualV4.simulator.wishlist).toBe(canonical.simulator.wishlist);

      server.rejectWrites(() => false);
      await editor.getByRole('button', { name: 'Reconectar ao Firebase' }).click();
      await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
      await expect(editor.locator('#wishTitle')).toHaveValue('Produto revisado');
      await expect(editor.locator('#wishSave')).toBeEnabled();
      await editor.locator('#wishSave').click();
      await expect(editor).not.toHaveAttribute('open', '');
      expect(server.docs.get(root).walletAtualV4.wishlistPages.length).toBeGreaterThan(1);
    }
    expect(blocked).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
    const restored = await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')));
    expect(restored).toHaveLength(count);
    expect(restored[0]).toMatchObject({ title: 'Produto revisado', imageUrl: wishes[0].imageUrl });
  });
}

test('returns reassigned items after a refused write and preserves a concurrent link edit', async ({ page }) => {
  const Primary = require('../../js/firebase-primary-model.js');
  const legacy = { saldoDominadora: 1000 };
  const wallet = Primary.bootstrap(legacy, {}, { simulator: {}, emptyFinance: Finance.empty() });
  const id = 'purchase-to-return';
  const product = { id: 'product', title: 'Bolsa', store: 'Loja', person: 'Bruna', personId: 'bruna', quantity: 1, originalPrice: 15, currency: 'CAD', bought: true, purchaseNoteId: id };
  wallet.simulator.wishlist = JSON.stringify([product]);
  wallet.simulator.wishlistPeople = JSON.stringify([{ id: 'bruna', name: 'Bruna' }, { id: 'cecilia', name: 'Cecília' }]);
  wallet.financeJson = JSON.stringify(Finance.update(Finance.empty(), { type: 'add', entry: {
    id, description: 'Loja', store: 'Loja', category: 'Lista de Compras',
    currency: 'BRL', status: 'paid', date: '2025-05-10', amount: 6000, source: 'wishlist',
    purchaseItems: [{ id: 'row', wishId: product.id, title: product.title, store: product.store, person: product.person, quantity: 1, amount: 6000, cadAmount: 1500 }],
  } }));
  const server = await hub({ [root]: { ...legacy, walletAtualV4: wallet } });
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.route('https://api.frankfurter.dev/v2/rates?**', route => route.fulfill({ json: [] }));
  await server.attach(page);
  const state = () => server.docs.get(root).walletAtualV4;
  const savedWishes = () => JSON.parse(state().simulator.wishlist);
  const undoWrite = changes => changes.some(({ path, data }) => path === root && data.walletAtualV4 &&
    !JSON.parse(data.walletAtualV4.financeJson).entries.some(entry => entry.id === id));

  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
  await page.locator('[data-panel=financePanel]').click();
  const purchase = page.locator('[data-note-ids=' + id + ']');
  await purchase.getByRole('button', { name: 'Editar compra Loja' }).click();
  const editor = page.locator('.purchase-items-editor');
  await editor.getByLabel('Pessoa', { exact: true }).fill('Cecília');
  await editor.getByRole('button', { name: 'Salvar compra' }).click();
  await expect(editor).toHaveCount(0);
  expect(savedWishes()[0]).toMatchObject({ personId: 'cecilia', bought: true, purchaseNoteId: id });

  const undo = async () => {
    await purchase.getByRole('button', { name: 'Desfazer compra' }).click();
    await page.locator('[data-dialog-confirm]').click();
  };
  await purchase.getByRole('button', { name: 'Desfazer compra' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('#cloudStatusText')).toContainText('Sem conexão');
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#appDialogMessage')).toContainText('Reconecte ao Firebase');
  expect(savedWishes()[0]).toMatchObject({ bought: true, purchaseNoteId: id });
  await page.locator('[data-dialog-confirm]').click();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');

  server.rejectWrites(undoWrite);
  await undo();
  await expect(page.locator('#appDialogMessage')).toContainText(/Firebase.*confirmou/);
  expect(savedWishes()[0]).toMatchObject({ personId: 'cecilia', bought: true, purchaseNoteId: id });
  expect(JSON.parse(state().financeJson).entries).toHaveLength(1);
  await page.locator('[data-dialog-confirm]').click();

  server.rejectWrites(() => false);
  await page.locator('[data-panel=backupPanel]').click();
  await page.locator('#cloudSettings > summary').click();
  await page.locator('#reconnectCloud').click();
  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
  await page.locator('[data-panel=financePanel]').click();

  const url = 'https://example.invalid/produto';
  let concurrentEdit = false;
  server.rejectWrites(changes => {
    if (concurrentEdit || !undoWrite(changes)) return false;
    concurrentEdit = true;
    const previous = server.docs.get(root);
    const current = state();
    const wishes = savedWishes();
    wishes[0].url = url;
    server.docs.set(root, { ...previous, walletAtualV4: {
      ...current,
      revision: current.revision + 1,
      simulator: { ...current.simulator, wishlist: JSON.stringify(wishes) },
    } });
    return false;
  });
  await undo();
  await expect(page.locator('#wishlistPanel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cecília', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Selecionar para compra: Bolsa' })).toBeEnabled();
  expect(concurrentEdit).toBe(true);
  expect(savedWishes()[0]).toMatchObject({ personId: 'cecilia', bought: false, url });
  expect(savedWishes()[0].purchaseNoteId).toBeUndefined();
  expect(JSON.parse(state().financeJson).entries).toHaveLength(0);

  await page.reload();
  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await expect(page.getByRole('heading', { name: 'Cecília', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Selecionar para compra: Bolsa' })).toBeEnabled();
});
