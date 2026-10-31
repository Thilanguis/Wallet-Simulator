const { test, expect } = require('@playwright/test');
const start = new Date('2026-10-31T16:00:00Z').getTime(),
  hour = 3600000,
  target = 'Vale sair sozinha com amiga';
async function open(page, extra = {}) {
  await page.clock.install();
  await page.clock.pauseAt(new Date(start));
  await page.route('**/firebaseConfiguration.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
  await page.addInitScript(
    ({ start, target, extra }) => {
      if (localStorage.getItem('findom.wallet.v2')) return;
      localStorage.setItem('saldoDominadora', '1000');
      localStorage.setItem(
        'tarefasBloqueadas',
        JSON.stringify([
          { nome: target, expiraEm: start + 7 * 86400000 },
          { nome: 'REDUZIR_BLOQUEIO_6H', expiraEm: start + 86400000 },
        ]),
      );
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    },
    { start, target, extra },
  );
  await page.goto('/');
}
for (const [label, options] of [
  ['desktop', { viewport: { width: 1440, height: 1000 } }],
  ['phone', { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
  ['tablet', { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  test.describe(label, () => {
    test.use(options);
    test('purchased reducer animates in place with bounded writes and catches up after hidden expiry', async ({ page }) => {
      await open(page);
      const select = page.locator('#selectTarefa');
      const value = await select.locator('option').evaluateAll((opts) => opts.find((o) => o.value.includes('|REDUZIR_BLOQUEIO_12H|')).value);
      await select.selectOption(value);
      await page.locator('#adicionar').click();
      await page.locator('[data-dialog-confirm]').click();
      await expect(page.locator('#saldoDominadora')).toHaveText('R$ 940,00');
      await page.locator('#tarefasLimitadasSection').scrollIntoViewIfNeeded();
      await page.clock.runFor(100);
      const row = page.locator(`.tempo-restante[data-nome="${target}"]`).locator('..');
      await expect(row).toHaveClass(/is-accelerated/);
      await expect(page.locator('#accelerationStatus')).toContainText('1 efeito ativo');
      const sourceNote = page.locator('.tempo-restante[data-nome="REDUZIR_BLOQUEIO_12H"]').locator('..').locator('.acceleration-source-note');
      await expect(sourceNote).toContainText('Efeito ativo: −12h');
      await expect(sourceNote).toContainText('termina em');
      await expect(page.locator('#accelerationStatus')).toContainText('1 prazo acelerado');
      const first = await row.locator('.relogio').textContent(),
        firstBar = await row.locator('progress').evaluate((el) => el.value);
      await page.evaluate((target) => {
        window.__rowRef = Array.from(document.querySelectorAll('.tempo-restante')).find((el) => el.dataset.nome === target).parentElement;
        window.__listRebuilds = 0;
        new MutationObserver(() => window.__listRebuilds++).observe(document.getElementById('tarefasLimitadasLista'), { childList: true });
        window.__checkpointWrites = 0;
        const write = AppStorage.setItem;
        AppStorage.setItem = (key, value) => {
          if (['accelBoosts', 'tarefasBloqueadas'].includes(key)) window.__checkpointWrites++;
          return write(key, value);
        };
      }, target);
      await page.clock.runFor(250);
      expect(await row.locator('.relogio').textContent()).not.toBe(first);
      expect(await row.locator('progress').evaluate((el) => el.value)).toBeLessThan(firstBar);
      await page.clock.runFor(2000);
      const result = await page.evaluate(
        (target) => ({
          same: window.__rowRef === Array.from(document.querySelectorAll('.tempo-restante')).find((el) => el.dataset.nome === target).parentElement,
          rebuilds: window.__listRebuilds,
          writes: window.__checkpointWrites,
          blocks: JSON.parse(AppStorage.getItem('tarefasBloqueadas')),
          boosts: JSON.parse(AppStorage.getItem('accelBoosts')),
        }),
        target,
      );
      expect(result.same).toBe(true);
      expect(result.rebuilds).toBe(0);
      expect(result.writes).toBeLessThanOrEqual(6);
      expect(result.blocks.find((t) => t.nome === 'REDUZIR_BLOQUEIO_6H').expiraEm).toBe(start + 86400000);
      await page.screenshot({ path: '.local/reducer-' + label + '.png', animations: 'disabled' });
      await page.evaluate(() => {
        window.__testHidden = true;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__testHidden });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__testHidden ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
        window.__checkpointWrites = 0;
      });
      await page.clock.fastForward(90000);
      expect(await page.evaluate(() => window.__checkpointWrites)).toBe(0);
      await page.evaluate(() => {
        window.__testHidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect(page.locator('#accelerationStatus')).toBeHidden();
      await expect(sourceNote).toHaveText('Bloqueio do redutor');
      const settled = await page.evaluate(() => ({ blocks: JSON.parse(AppStorage.getItem('tarefasBloqueadas')), boosts: JSON.parse(AppStorage.getItem('accelBoosts')), history: JSON.parse(AppStorage.getItem('historico')) }));
      expect(settled.boosts).toEqual([]);
      expect(settled.blocks.find((t) => t.nome === target).expiraEm).toBe(start + 7 * 86400000 - 12 * hour);
      expect(settled.history).toHaveLength(1);
      expect(settled.history[0].valor).toBe(60);
      await page.reload();
      expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('tarefasBloqueadas')).find((t) => t.nome === 'Vale sair sozinha com amiga').expiraEm)).toBe(start + 7 * 86400000 - 12 * hour);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
test('reload during effect preserves budget and release is real, including overlapping effects', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.startGlobalAcceleration(360000, 60000, 21600000, 'REDUZIR_BLOQUEIO_6H'));
  await page.clock.fastForward(20000);
  await page.reload();
  await expect(page.locator('#accelerationStatus')).toBeVisible();
  await page.evaluate(() => window.startGlobalAcceleration(720000, 60000, 43200000, 'REDUZIR_BLOQUEIO_12H'));
  await page.clock.fastForward(90000);
  await page.evaluate(() => window.updateClocksOnce());
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('tarefasBloqueadas')).find((t) => t.nome === 'Vale sair sozinha com amiga').expiraEm)).toBe(start + 7 * 86400000 - 18 * hour);
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('accelBoosts')))).toEqual([]);
  await page.evaluate(() => window.__AppCtl.setBlocks([{ nome: 'Vale sair sozinha com amiga', expiraEm: Date.now() + 3600000 }]));
  await page.evaluate(() => window.startGlobalAcceleration(360000, 60000, 21600000, 'REDUZIR_BLOQUEIO_6H'));
  await page.clock.fastForward(11000);
  await page.evaluate(() => window.updateClocksOnce());
  await expect(page.locator('.tempo-restante')).toHaveCount(0);
  const option = page.locator('#selectTarefa option').filter({ hasText: 'Vale sair sozinha com amiga' });
  await expect(option).toBeEnabled();
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 1.000,00');
});
test('old expired effect catches up remaining budget once without debiting or rewriting history', async ({ page }) => {
  const history = [{ descricao: 'Registro fictício preservado', valor: 12, tipo: 'ganho', saldoAtual: 1000, timestamp: '2026-10-30T12:00:00Z' }];
  await open(page, { historico: JSON.stringify(history), accelBoosts: JSON.stringify([{ id: 'legacy', perSecondMs: 360000, startedAt: start - 90000, endsAt: start - 30000, budgetLeftMs: 10800000, source: 'REDUZIR_BLOQUEIO_6H' }]) });
  const read = () => page.evaluate(() => ({ history: JSON.parse(AppStorage.getItem('historico')), blocks: JSON.parse(AppStorage.getItem('tarefasBloqueadas')), boosts: JSON.parse(AppStorage.getItem('accelBoosts')) }));
  const saved = await read();
  expect(saved.blocks.find((t) => t.nome === target).expiraEm).toBe(start + 7 * 86400000 - 3 * hour);
  expect(saved.history).toEqual(history);
  expect(saved.boosts).toEqual([]);
  await page.reload();
  expect(await read()).toEqual(saved);
});
test('a service unlocks between persistence checkpoints instead of staying disabled', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__AppCtl.setBlocks([{ nome: 'Vale sair sozinha com amiga', expiraEm: Date.now() + 3780000 }]);
    window.startGlobalAcceleration(360000, 60000, 21600000, 'REDUZIR_BLOQUEIO_6H');
  });
  await page.clock.runFor(10550);
  await page.evaluate(() => window.updateClocksOnce());
  await expect(page.locator('.tempo-restante')).toHaveCount(0);
  await expect(page.locator('#selectTarefa option').filter({ hasText: 'Vale sair sozinha com amiga' })).toBeEnabled();
});
