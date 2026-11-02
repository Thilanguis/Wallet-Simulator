const { test, expect } = require('../firebase-fixture.cjs');
const path = require('node:path');
async function open(page, seed = {}) {
  await page.route('**/firebaseConfiguration.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
  await page.addInitScript((seed) => {
    if (!localStorage.getItem('findom.wallet.v2')) for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  }, seed);
  await page.goto('/');
  await expect(page.locator('body')).not.toHaveClass(/firebase-required/);
}
for (const width of [1280, 390]) {
  test.describe(`compact roulette ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('free services become real tasks exactly once; history retained; only effects need activation', async ({ page }) => {
      const oldHistory = { id: 'old-record', descricao: 'Registro anterior fictício', valor: 10, tipo: 'ganho', saldoAtual: 123, timestamp: '2026-10-01T12:00:00Z' };
      const awards = [
        { id: 'old-claimed', kind: 'freeService', serviceId: 'Massagem nos pés', label: 'Prêmio anterior', claimed: true, createdAt: '2026-10-01T12:00:00Z' },
        { id: 'new-service', kind: 'freeService', serviceId: 'Obrigação de servir (2 tarefas)', label: 'Serviço gratuito fictício', claimed: false, createdAt: '2026-10-30T12:00:00Z' },
        { id: 'new-bonus', kind: 'bonus', label: 'Bônus fictício', claimed: false, createdAt: '2026-10-30T12:00:00Z' },
      ];
      const last = String(Date.now() - 3600000);
      await open(page, { saldoDominadora: '123', historico: JSON.stringify([oldHistory]), rouletteAwards: JSON.stringify(awards), roletaUltimoUso: last });
      await expect(page.locator('#rouletteLastPrize,#roulettePendingCount,#resultadoRoletaDia')).toHaveCount(0);
      await expect(page.locator('#roulettePrizeList .finance-entry')).toHaveCount(0);
      await expect(page.locator('#rouletteNextSpin')).toContainText('2d');
      await expect(page.locator('#openRouletteCard')).toBeDisabled();
      const task = page.locator('#tarefasPendentes [data-id="new-service"]');
      await expect(task).toHaveCount(1);
      await expect(task.locator('input[type=checkbox]')).toHaveCount(2);
      await expect(page.locator('#roulettePrizeList [data-claim]')).toHaveCount(1);
      await expect(page.locator('[data-claim="new-bonus"]')).toHaveText('Ativar bônus lingerie');
      await expect(page.locator('#saldoDominadora')).toHaveText('R$ 123,00');
      expect(await page.evaluate(() => AppStorage.getItem('roletaUltimoUso'))).toBe(last);
      expect(await page.evaluate(() => FinanceUI.getState().entries)).toEqual([]);
      const after = await page.evaluate(() => ({ awards: JSON.parse(AppStorage.getItem('rouletteAwards')), history: JSON.parse(AppStorage.getItem('historico')) }));
      expect(after.awards[0]).toEqual(awards[0]);
      expect(after.awards[1]).toEqual({ ...awards[1], claimed: true });
      expect(after.history).toContainEqual(oldHistory);
      expect(after.history.filter((e) => e.id === 'prize:new-service')).toHaveLength(1);
      await page.evaluate(() => {
        window.dispatchEvent(new Event('roulette:awards'));
        window.dispatchEvent(new Event('roulette:awards'));
      });
      await page.reload();
      await expect(task).toHaveCount(1);
      await page.locator('[data-claim="new-bonus"]').click();
      await page.locator('[data-dialog-cancel]').click();
      await expect(page.locator('[data-claim="new-bonus"]')).toHaveCount(1);
      await page.locator('[data-claim="new-bonus"]').click();
      await page.locator('[data-dialog-confirm]').click();
      await expect(page.locator('#roulettePrizeList')).toBeHidden();
      await expect(page.locator('#bonusEspecialCheckbox')).toBeChecked();
      await task.locator('input').nth(0).check();
      await task.locator('input').nth(1).check();
      await expect(task).toHaveCount(0);
      await page.reload();
      await expect(task).toHaveCount(0);
      await expect(page.locator('#roulettePrizeList')).toBeHidden();
      expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico')).filter((e) => e.id === 'prize:new-service').length)).toBe(1);
      await expect(page.locator('#saldoDominadora')).toHaveText('R$ 123,00');
      await page.locator('#rouletteSection').screenshot({ path: path.resolve('.local', `roulette-compact-${width}.png`) });
    });
    test('completing a spin creates the service immediately without reload or redeem', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-10-31T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-31T12:00:01Z'));
      await open(page, { saldoDominadora: '75' });
      // Smooth scrolling cannot finish while the simulated animation clock is paused.
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      await page.evaluate(() => (Math.random = () => 0.1));
      await page.locator('#openRouletteCard').click();
      await page.clock.runFor(300);
      await expect(page.locator('#roletaBox')).toHaveCSS('opacity', '1');
      await page.locator('#btnRoletaGirar').click();
      await page.clock.fastForward(6000);
      await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
      const spin = await page.evaluate(() => JSON.parse(AppStorage.getItem('rouletteSpin')));
      expect(spin.settled).toBe(true);
      expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('rouletteAwards')).filter((a) => a.claimed).length)).toBe(1);
      await expect(page.locator('#roulettePrizeList [data-claim]')).toHaveCount(0);
      await expect(page.locator('#saldoDominadora')).toHaveText('R$ 75,00');
      await page.reload();
      await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  });
}
test('legacy task or completed prize history prevents duplicate service delivery', async ({ page }) => {
  const award = { id: 'existing-prize', kind: 'freeService', serviceId: 'Massagem nos pés', label: 'Serviço fictício', claimed: false, createdAt: '2026-10-30T12:00:00Z' };
  const task = { id: 'existing-prize', tarefa: 'Massagem nos pés', descricao: 'Prêmio anterior', valor: 0, timestamp: '2026-10-30T12:00:00Z' };
  const history = { id: 'prize:completed-prize', tipo: 'premio', descricao: 'Prêmio concluído anteriormente', valor: 0, saldoAtual: 90, timestamp: '2026-10-30T12:00:00Z' };
  await open(page, { saldoDominadora: '90', tarefasPendentes: JSON.stringify([task]), historico: JSON.stringify([history]), rouletteAwards: JSON.stringify([award, { ...award, id: 'completed-prize' }]) });
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('tarefasPendentes')))).toEqual([task]);
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico')))).toEqual([history]);
  await expect(page.locator('#roulettePrizeList')).toBeHidden();
  await page.reload();
  await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
});
test('reducer remains an explicit activation; archived prize markers prevent repeated delivery', async ({ page }) => {
  await open(page, { saldoDominadora: '90' });
  const archived = await page.evaluate(() => {
    const history = { id: 'prize:archived-prize', tipo: 'premio', descricao: 'Prêmio arquivado fictício', valor: 0, saldoAtual: 90, timestamp: '2026-10-01T12:00:00Z' };
    const reducer = Economy.config.roulette.find((sector) => sector.kind === 'reducer');
    AppStorage.setItem('archivedHistory', JSON.stringify([history]));
    AppStorage.setItem(
      'rouletteAwards',
      JSON.stringify([
        { id: 'archived-prize', kind: 'freeService', serviceId: 'Massagem nos pés', label: 'Prêmio antigo fictício', claimed: false },
        { id: 'effect-prize', kind: 'reducer', serviceId: reducer.serviceId, label: 'Redutor fictício', claimed: false },
      ]),
    );
    window.dispatchEvent(new Event('roulette:awards'));
    return history;
  });
  await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(0);
  await expect(page.locator('[data-claim="effect-prize"]')).toContainText('Ativar redutor:');
  await page.locator('[data-claim="effect-prize"]').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#roulettePrizeList')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('archivedHistory')))).toEqual([archived]);
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico')).filter((e) => e.id === 'prize:effect-prize').length)).toBe(1);
  await expect(page.locator('#saldoDominadora')).toHaveText('R$ 90,00');
  await page.reload();
  await expect(page.locator('#roulettePrizeList')).toBeHidden();
});
