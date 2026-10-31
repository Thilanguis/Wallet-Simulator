const { test, expect } = require('@playwright/test');
// Exercise the real encrypted Firebase adapter with a deterministic in-memory SDK.
// No request reaches Google, Authentication or the real Firestore project.
async function hub() {
  const docs = new Map(),
    pages = new Set();
  async function attach(page, uid, balance) {
    pages.add(page);
    await page.routeWebSocket(/\/ws$/, (socket) => socket.close());
    await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
      const auth = route.request().url().endsWith('firebase-auth.js');
      route.fulfill({
        contentType: 'text/javascript',
        body: auth
          ? `export function getAuth(){return {authStateReady:async()=>{},currentUser:{uid:${JSON.stringify(uid)}}}};export async function signInAnonymously(){}`
          : `export function doc(db,col,room){return {path:col+'/'+room,room}};
           export function serverTimestamp(){return 'server-time'};
           const snap=v=>({exists:()=>v!==null,data:()=>v,metadata:{fromCache:false,hasPendingWrites:false}});
           export function onSnapshot(ref,opts,receive,fail){let active=true;const fn=e=>{if(e.detail.room===ref.room&&active)receive(snap(e.detail.value))};window.addEventListener('__cloudDoc',fn);window.__hubRead(ref.room).then(v=>{if(active)receive(snap(v))}).catch(fail);return ()=>{active=false;window.removeEventListener('__cloudDoc',fn)}};
           export async function runTransaction(db,fn){for(let i=0;i<10;i++){let old=null,ref=null,next=null;const result=await fn({get:async r=>{ref=r;old=await window.__hubRead(r.room);return snap(old)},set:(r,v)=>{ref=r;next=v}});if(await window.__hubWrite({room:ref.room,expected:old?.revision??null,next}))return result;}throw new Error('conflict')}`,
      });
    });
    await page.route('**/firebaseConfiguration.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window._firestoreDb={app:{}}; export {};' }));
    await page.exposeBinding('__hubRead', (_, room) => structuredClone(docs.get(room) || null));
    await page.exposeBinding('__hubWrite', (_, { room, expected, next }) => {
      if ((docs.get(room)?.revision ?? null) !== expected) return false;
      docs.set(room, structuredClone(next));
      for (const p of pages) if (!p.isClosed()) setTimeout(() => p.evaluate(({ room, value }) => window.dispatchEvent(new CustomEvent('__cloudDoc', { detail: { room, value } })), { room, value: next }).catch(() => {}), 0);
      return true;
    });
    await page.addInitScript((balance) => {
      if (!localStorage.getItem('findom.wallet.v2')) localStorage.setItem('saldoDominadora', balance);
    }, balance);
    await page.goto('/');
  }
  return { attach, docs };
}
async function settings(page) {
  await page.locator('[data-panel=backupPanel]').click();
  if (!(await page.locator('#cloudSettings').evaluate((el) => el.open))) await page.locator('#cloudSettings > summary').click();
}
async function create(page) {
  await settings(page);
  await page.locator('#createSharedWallet').click();
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
      await server.attach(a, 'first', '1000');
      await server.attach(b, 'second', '777');
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
      const encrypted = [...server.docs.values()][0];
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
    await server.attach(a, 'first', '100');
    await server.attach(b, 'second', '0');
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

test('an unavailable anonymous provider leaves local balance and records usable and gives setup instructions', async ({ page }) => {
  const server = await hub();
  await server.attach(page, 'first', '321');
  await page.route('https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js', (r) =>
    r.fulfill({
      contentType: 'text/javascript',
      body: "export const getAuth=()=>({authStateReady:async()=>{},currentUser:null});export async function signInAnonymously(){throw Object.assign(new Error('disabled'),{code:'auth/operation-not-allowed'})}",
    }),
  );
  await settings(page);
  await page.locator('#createSharedWallet').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#cloudSettingsStatus')).toContainText('Ative o provedor Anônimo');
  expect(await page.evaluate(() => WalletStore.isWritable())).toBe(true);
  expect(await page.evaluate(() => AppStorage.getItem('saldoDominadora'))).toBe('321');
  expect(server.docs.size).toBe(0);
});

test('restoring a reviewed backup waits for Firebase acknowledgment before reload and reaches the companion', async ({ browser }) => {
  const server = await hub(),
    ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await server.attach(a, 'first', '100');
    await server.attach(b, 'second', '777');
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
