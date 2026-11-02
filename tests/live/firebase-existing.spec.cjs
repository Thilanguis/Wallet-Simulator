const { test, expect } = require('@playwright/test');
const { hub } = require('./firebase-hub.cjs');
const path = 'usuarios/gabriel-local',
  backup = path + '/config/antesWalletAtualV3';
async function settings(page) {
  await page.locator('[data-panel=backupPanel]').click();
  if (!(await page.locator('#cloudSettings').evaluate((el) => el.open))) await page.locator('#cloudSettings > summary').click();
}
async function connect(page) {
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
for (const width of [1440, 393, 820])
  test(`existing Firebase ${width}: current notes survive migration, old records remain and console changes arrive live`, async ({ browser }) => {
    const oldUser = {
      saldoDominadora: 9999,
      bonusEspecialAtivo: true,
      roletaUltimoUso: '2025-11-01T00:00:00Z',
      timerAtivo: true,
      timerTempoSegundos: 300,
      timerValorAtual: 80,
      timerValorPorMinuto: 4,
      notificationToken: 'synthetic-preserved',
      tarefasBloqueadas: [{ nome: 'Old service', expiraEm: 1000 }],
    };
    const oldRecords = {
      [path + '/tarefas/old-task']: { tarefa: 'Old service', valor: 50 },
      [path + '/historico/old-operation']: { valor: 50, tipo: 'gasto' },
      [path + '/debugRoleta/old-spin']: { resultadoTexto: 'Old spin', consumidoEm: '2025-11-01' },
    };
    const server = await hub({ [path]: oldUser, ...oldRecords });
    const ca = await browser.newContext(),
      cb = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 1000, isMobile: width < 1000 });
    const a = await ca.newPage(),
      b = await cb.newPage();
    try {
      await server.attach(a, '200');
      await server.attach(b, '0');
      expect(server.docs.get(path)).toEqual(oldUser); // Visiting the site does not migrate or write.
      const before = await a.evaluate(() => {
        let f = Finance.empty();
        const common = { store: 'Loja sintética', date: '2026-10-31', currency: 'BRL', status: 'paid' };
        f = Finance.update(f, {
          type: 'add',
          entry: {
            ...common,
            id: 'current-note-1',
            category: Finance.categories[7],
            description: 'Descrição longa de um lançamento atual que deve permanecer intacto depois da conexão ao Firebase',
            amount: 62579,
            sourceLine: 'Descrição sintética ✅: R$ 625,79',
          },
        });
        f = Finance.update(f, { type: 'add', entry: { ...common, id: 'current-note-2', category: Finance.categories[4], description: 'Outro lançamento atual', amount: 5010 } });
        f = Finance.update(f, {
          type: 'add',
          entry: {
            ...common,
            id: 'current-note-usd',
            category: Finance.categories[2],
            description: 'Conversão preservada',
            amount: 20000,
            originalMoney: [
              { currency: 'USD', amount: 5000 },
              { currency: 'BRL', amount: 20000 },
            ],
            sourceLine: '$50,00 = R$ 200,00',
          },
        });
        WalletStore.commitFinance(f);
        window.dispatchEvent(new Event('redemptions:changed'));
        return { finance: WalletStore.finance(), text: FinanceList.text(f.entries) };
      });
      const code = await connect(a);
      expect(server.docs.get(backup).usuarioAnterior).toEqual(oldUser);
      for (const [key, value] of Object.entries(oldRecords)) expect(server.docs.get(key)).toEqual(value);
      expect(server.docs.get(path).saldoDominadora).toBe(200);
      expect(server.docs.get(path).notificationToken).toBe('synthetic-preserved');
      expect(server.docs.get(path).walletAtualV3.format).toBe('encrypted-wallet-v3');
      expect(JSON.stringify(server.docs.get(path))).not.toContain('current-note-1');
      expect(await a.evaluate(() => WalletStore.finance())).toEqual(before.finance);
      await join(b, code);
      expect(await b.evaluate(() => WalletStore.finance())).toEqual(before.finance);
      expect(await b.evaluate(() => FinanceList.text(WalletStore.finance().entries))).toBe(before.text);
      expect(await b.evaluate(() => JSON.parse(AppStorage.getItem('tarefasPendentes') || '[]'))).toEqual([]);
      expect(await b.evaluate(() => JSON.parse(AppStorage.getItem('historico') || '[]'))).toEqual([]);
      await server.publish(path, { ...server.docs.get(path), saldoDominadora: 333.75, bonusEspecialAtivo: true });
      await expect(b.locator('#saldoDominadora')).toHaveText('R$ 333,75');
      await expect(a.locator('#saldoDominadora')).toHaveText('R$ 333,75');
      expect(await b.evaluate(() => WalletStore.finance())).toEqual(before.finance);
      await b.reload();
      await expect(b.locator('#cloudStatusText')).toContainText('Acompanhando');
      expect(await b.evaluate(() => FinanceList.text(WalletStore.finance().entries))).toBe(before.text);
      expect(server.docs.get(backup).usuarioAnterior).toEqual(oldUser); // Backup is created once.
      expect(server.authRequests()).toBe(0);
      expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await ca.close();
      await cb.close();
    }
  });

test('wrong key cannot overwrite a protected wallet; the companion can reconnect with the correct key', async ({ browser }) => {
  const server = await hub(),
    ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await server.attach(a, '100');
    await server.attach(b, '777');
    const code = await connect(a),
      saved = structuredClone(server.docs.get(path));
    await settings(b);
    await b.locator('#connectExistingFirebase').click();
    await b.locator('[data-dialog-confirm]').click();
    await expect(b.locator('#cloudSettingsStatus')).toContainText('Cole o código privado');
    expect(server.docs.get(path)).toEqual(saved);
    expect(await b.evaluate(() => AppStorage.getItem('saldoDominadora'))).toBe('777');
    await join(b, code);
    expect(await b.evaluate(() => AppStorage.getItem('saldoDominadora'))).toBe('100');
    expect(await b.evaluate(() => JSON.parse(localStorage.getItem('findom.cloud.before.v3')).simulator.saldoDominadora)).toBe('777');
  } finally {
    await ca.close();
    await cb.close();
  }
});
test('static publication connects with the public project ID when the private local configuration is absent', async ({ page }) => {
  const server = await hub();
  await server.attach(page, '432', { configurationMissing: true });
  await connect(page);
  expect(await page.evaluate(() => window.__minimalFirebaseConfig)).toEqual({ projectId: 'walletsumilator' });
  expect(server.docs.get(path).saldoDominadora).toBe(432);
  expect(server.docs.get(path).walletAtualV3.format).toBe('encrypted-wallet-v3');
  expect(server.authRequests()).toBe(0);
});

test('an already saved alternative pairing reconnects to its original collection without migrating it silently', async ({ page }) => {
  const server = await hub();
  await server.attach(page, '456');
  const prior = await page.evaluate(async () => {
    const code = WalletCipher.create(),
      cipher = await WalletCipher.forCode(code);
    const envelope = await cipher.seal({ ...WalletCloud.pack(WalletStore.snapshot()), schema: 3, revision: 1, controller: '', leaseUntil: 0 });
    localStorage.setItem('findom.cloud.pair.v3', code);
    localStorage.removeItem('findom.cloud.backend.v3');
    return { room: cipher.room, envelope };
  });
  const priorPath = 'walletsCompartilhadas/' + prior.room;
  server.docs.set(priorPath, prior.envelope);
  await page.route(/firebase-auth\.js$/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: "export const getAuth=()=>({currentUser:{uid:'synthetic-compatibility'},authStateReady:async()=>{}}); export const signInAnonymously=async()=>{};" }),
  );
  await page.reload();
  await expect(page.locator('#cloudStatusText')).toContainText('Acompanhando');
  expect(await page.evaluate(() => localStorage.getItem('findom.cloud.backend.v3'))).toBe('paired');
  await page.locator('#cloudControl').click();
  await expect(page.locator('#cloudStatusText')).toContainText('controle neste aparelho');
  expect(await page.evaluate(() => AppStorage.getItem('saldoDominadora'))).toBe('456');
  expect(server.docs.get(priorPath)).not.toEqual(prior.envelope);
  expect(server.docs.has(path)).toBe(false);
});
