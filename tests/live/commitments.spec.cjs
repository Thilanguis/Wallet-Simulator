const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [1280, 393]) {
  test.describe('commitments ' + width, () => {
    test.use({ viewport: { width, height: 852 }, isMobile: width < 600, hasTouch: width < 600 });
    test('remaining bars use real deadlines; ordinary and prize tasks share feedback', async ({ page }) => {
      await page.route('**/firebaseConfiguration.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
      const tasks = [
        { id: 'ordinary', tarefa: 'Tarefa fictícia', descricao: 'Serviço comprado', valor: 30, timestamp: new Date().toISOString() },
        { id: 'prize', rouletteAwardId: 'prize', tarefa: 'Obrigação de servir (2 tarefas)', descricao: 'Prêmio fictício da roleta', valor: 0, timestamp: new Date().toISOString() },
      ];
      const deadline = Date.now() + 3.5 * 86400000;
      await page.addInitScript(
        ({ tasks, deadline }) => {
          if (localStorage.getItem('findom.wallet.v2')) return;
          localStorage.setItem('tarefasPendentes', JSON.stringify(tasks));
          localStorage.setItem('tarefasBloqueadas', JSON.stringify([{ nome: 'Vale sair sozinha com amiga', expiraEm: deadline }]));
          localStorage.setItem('bonusEspecialAtivo', 'true');
          localStorage.setItem('saldoDominadora', '100');
        },
        { tasks, deadline },
      );
      await page.clock.install();
      await page.goto('/');
      await expect(page.locator('body')).not.toHaveClass(/firebase-required/);
      await expect(page.locator('#walletActivities > #pendingTasksSection')).toBeVisible();
      await expect(page.locator('#walletActivities > #contractOccurrences')).toBeVisible();
      const bar = page.locator('.limit-progress');
      await expect(bar).toHaveCount(1);
      const original = await bar.evaluate((el) => el.value / el.max);
      expect(original).toBeCloseTo(0.5, 2);
      const blocks = await page.evaluate(() => JSON.parse(AppStorage.getItem('tarefasBloqueadas')));
      expect(blocks[0].expiraEm).toBe(deadline);
      await page.clock.fastForward(3600000);
      expect(await bar.evaluate((el) => el.value / el.max)).toBeLessThan(original);
      expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('tarefasBloqueadas'))[0].expiraEm)).toBe(deadline);
      if (width < 600) {
        await expect(page.locator('#fx-embers')).toBeHidden();
        expect(await page.evaluate(() => getComputedStyle(document.body, '::after').content)).not.toBe('none');
      }
      await page.locator('#walletActivities').screenshot({ path: '.local/commitments-' + width + '.png' });
      const ordinary = page.locator('[data-id=ordinary]');
      await ordinary.locator('input').check();
      await expect(ordinary).toHaveClass(/tarefa-concluida/);
      await page.clock.fastForward(900);
      await expect(ordinary).toHaveCount(0);
      const prize = page.locator('[data-id=prize]');
      await expect(prize).toContainText('Prêmio gratuito');
      await prize.locator('input').first().check();
      await expect(prize).toContainText('1 de 2 concluídas');
      await expect(prize).toHaveClass(/task-step-feedback/);
      await prize.locator('input').nth(1).check();
      await expect(prize).toHaveClass(/tarefa-concluida/);
      await page.clock.fastForward(900);
      await expect(prize).toHaveCount(0);
      await expect(page.locator('#saldoDominadora')).toHaveText('R$ 100,00');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
