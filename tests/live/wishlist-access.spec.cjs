const { test, expect } = require('@playwright/test');
const { hub } = require('./firebase-primary-hub.cjs');
const root = 'usuarios/gabriel-local';

test('only the two allowlisted accounts can access the Wallet and their personal lists', async ({ browser }) => {
  const admin = { uid: 'owner', email: 'owner@example.invalid', emailVerified: true };
  const partner = { uid: 'partner', email: 'partner@example.invalid', emailVerified: true };
  const outsider = { uid: 'outsider', email: 'outsider@example.invalid', emailVerified: true };
  const access = { emails: [admin.email, partner.email], adminEmail: admin.email, securityVersion: 'google-private-v1' };
  const server = await hub({
    [root + '/config/acesso']: access,
    [root + '/wishlistAccounts/' + outsider.uid]: { email: outsider.email, status: 'approved', role: 'coadmin' },
  });
  for (const [user, name] of [[admin, 'Gabriel'], [partner, 'Luana'], [outsider, null]]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await server.attach(page, '0', { user });
      if (name) {
        await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
        await page.getByLabel('Sua conta').click();
        await expect(page.locator('#firebaseAccountActions select')).toHaveCount(0);
        await page.getByLabel('Sua conta').click();
        await page.locator('[data-panel=wishlistPanel]').click();
        await page.locator('#wishEditor > summary').click();
        await expect(page.locator('#wishForm').getByText('Quem pode ver?')).toHaveCount(0);
        await expect(page.locator('#wishUpload')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Pessoas e listas' })).toBeVisible();
      } else await expect(page.locator('#firebaseAuthMessage')).toContainText('não tem acesso');
      await page.goto('/wishlist-personal.html');
      if (name) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      else await expect(page.getByRole('heading', { name: 'Acesso indisponível' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Solicitar acesso' })).toHaveCount(0);
    } finally { await context.close(); }
  }
});
