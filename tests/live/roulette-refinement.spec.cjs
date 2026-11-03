const { test, expect } = require('../firebase-fixture.cjs');
const path = require('node:path');

for (const width of [1280, 393, 320]) {
  test.describe(`roulette casing ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('custom catalog references, original spin motion and one-time delivery', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-11-03T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-11-03T12:00:01Z'));
      await page.goto('/');
      await expect(page.locator('body')).not.toHaveClass(/firebase-required/);
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      const before = await page.evaluate(() => {
        const settings = getEconomy();
        const catalog = EconomyCatalog.document(settings);
        // A valid custom catalog can remove or rename shop IDs while prize IDs stay stable.
        catalog.services = catalog.services.filter((item) => item.id === 'Tirar cravos');
        const result = EconomyCatalog.prepare(catalog, settings);
        EconomyCatalog.apply(result.catalog);
        Economy.drawRoulette = () => 8; // Original free social privilege, absent from edited shop.
        return { balance: AppStorage.getItem('saldoDominadora'), sectors: Economy.config.roulette, cooldown: Economy.config.rouletteCooldownMs };
      });
      await page.locator('#btnRoletaFlutuante').click();
      await page.clock.runFor(300);
      await expect(page.locator('#roletaBox')).toBeVisible();
      await page.locator('#roletaBox').screenshot({ path: path.resolve('.local', `roulette-refined-${width}.png`), animations: 'disabled' });
      const geometry = await page.evaluate(() => {
        const wheel = document.querySelector('#roletaWheel').getBoundingClientRect();
        const box = document.querySelector('#roletaBox').getBoundingClientRect();
        return { left: wheel.left, right: wheel.right, boxLeft: box.left, boxRight: box.right, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.boxLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.boxRight).toBeLessThanOrEqual(width);
      expect(geometry.overflow).toBe(false);
      await page.keyboard.press('Escape');
      await expect(page.locator('#roletaBox')).toHaveCount(0);
      expect(await page.evaluate(() => AppStorage.getItem('roletaUltimoUso'))).toBeNull();
      await page.locator('#btnRoletaFlutuante').click();
      await page.clock.runFor(300);
      await page.locator('#btnRoletaGirar').click();
      await expect(page.locator('#roletaPointer')).toHaveCSS('animation-name', 'ponteiro-wiggle-forte');
      expect(await page.locator('#roletaWheel').evaluate((el) => el.style.transition)).toContain('5.5s');
      await expect(page.getByRole('button', { name: 'Fechar roleta', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(page.locator('#roletaBox')).toHaveCount(1);
      await page.clock.fastForward(3600);
      await expect(page.locator('#roletaPointer')).toHaveCSS('animation-name', 'ponteiro-wiggle-suave');
      await page.clock.fastForward(2000);
      await expect(page.locator('#roletaPointer')).toHaveCSS('animation-name', 'none');
      await expect(page.locator('#roletaVisor')).toContainText('Vale sair sozinha com amiga');
      await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
      await page.evaluate(() => window.dispatchEvent(new Event('roulette:awards')));
      await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
      const after = await page.evaluate(() => ({ balance: AppStorage.getItem('saldoDominadora'), sectors: Economy.config.roulette, cooldown: Economy.config.rouletteCooldownMs, awards: JSON.parse(AppStorage.getItem('rouletteAwards')) }));
      expect(Number(after.balance)).toBe(Number(before.balance));
      expect(after.sectors).toEqual(before.sectors);
      expect(after.cooldown).toBe(3 * 86400000);
      expect(after.awards).toHaveLength(1);
      expect(after.awards[0]).toMatchObject({ claimed: true, serviceId: 'Vale sair sozinha com amiga' });
      expect(errors).toEqual([]);
    });
  });
}
