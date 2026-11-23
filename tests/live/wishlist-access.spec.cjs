const { test, expect } = require('../firebase-fixture.cjs');

test('existing wallet shows the guest-access setup before roles are activated', async ({ page }) => {
  await page.route('**/js/wishlist-access-admin.js', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=backupPanel]').click();
  const settings = page.locator('#wishAccessSettings');
  await expect(settings.locator('summary')).toContainText('Ativação pendente');
  await settings.locator('summary').click();
  await expect(settings.locator('#wishAccessStatus')).toContainText('adminEmail');
  await expect(settings.locator('button:visible, select:visible')).toHaveCount(0);
});

for (const role of ['admin', 'coadmin']) {
  test(role + ' approves a Google account with an explicit wishlist profile', async ({ page }) => {
    await page.route('**/js/firebase-primary-transport.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: `
        export async function createPrimaryFirebaseTransport({ user }) {
          const simulator = { ...WalletStore.snapshot().simulator,
            wishlistPeople: JSON.stringify([{ id: 'person-tayane', name: 'Tayane' }, { id: 'person-bruna', name: 'Bruna' }]) };
          let current = { ...WalletCloud.pack(WalletStore.snapshot()), simulator, schema: 3, revision: 1, financeImportOpen: false,
            controller: user.uid + '.' + sessionStorage.getItem('findom.firebase.tab.v4'), leaseUntil: Date.now() + 1e9 };
          let receive;
          return { uid: user.uid, accessRole: ${JSON.stringify(role)}, existingAccounts: [
              { email: 'owner@example.invalid', role: 'admin' }, { email: 'partner@example.invalid', role: 'coadmin', ownsPrimaryList: true },
            ],
            watch(fn) { receive = fn; queueMicrotask(() => fn(structuredClone(current))); return () => { receive = null; }; },
            async transact(change) { current = change(structuredClone(current)); return current; },
          };
        }
      `,
    }));
    await page.route('**/js/wishlist-access.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: `
        export async function openWishlistDirectoryEditor() { return async () => {}; }
      export async function wishlistAccessAdmin() {
          return {
            watchAccounts(receive) {
              window.clearWishlistRequests = () => receive([]);
              queueMicrotask(() => receive([
                { uid: 'visitor-uid', email: 'visitante@example.invalid', role: 'guest', status: 'pending', personId: '', canManagePurchased: false },
                { uid: 'existing-uid', email: 'existente@example.invalid', role: 'guest', status: 'approved', personId: 'person-bruna', canManagePurchased: false },
              ]));
              return () => {};
            },
            async saveAccount(before, updates) { window.savedAccess = { uid: before.uid, ...updates }; },
          };
        }
      `,
    }));

    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await page.locator('[data-panel=wishlistPanel]').click();
    await page.getByRole('button', { name: '1 solicitação pendente' }).click();
    await expect(page.locator('#wishAccessPending')).toBeHidden();
    await expect(page.locator('#wishAccessSettings')).toHaveAttribute('open', '');
    const owner = page.locator('#wishAccessAccounts li').filter({ hasText: 'owner@example.invalid' });
    const partner = page.locator('#wishAccessAccounts li').filter({ hasText: 'partner@example.invalid' });
    await expect(owner.locator('.wish-access-badge')).toHaveText(['Ativa', 'Administrador']);
    await expect(owner).toContainText('Acesso à carteira inteira');
    await expect(partner.locator('.wish-access-badge')).toHaveText(['Ativa', 'Subadministrador']);
    await expect(owner.locator('button, select')).toHaveCount(0);
    if (role === 'admin') {
      await expect(partner.getByLabel('Cargo')).toBeHidden();
      await expect(partner.getByRole('button', { name: 'Editar acesso' })).toBeVisible();
      await expect(partner.getByRole('button', { name: 'Revogar acesso' })).toBeVisible();
    }
    else await expect(partner.locator('button, select')).toHaveCount(0);
    const pending = page.locator('#wishAccessAccounts li').filter({ hasText: 'visitante@example.invalid' });
    const existing = page.locator('#wishAccessAccounts li').filter({ hasText: 'existente@example.invalid' });
    await expect(pending).toContainText('Pendente');
    await expect(existing).toContainText('Bruna');
    if (role === 'admin') {
      await expect(existing.getByLabel('Cargo')).toBeHidden();
      await expect(pending.getByLabel('Cargo')).toBeHidden();
      await expect(pending.getByLabel('Permitir editar e excluir desejos comprados')).toBeHidden();
      await expect(existing.getByRole('button', { name: 'Revogar acesso' })).toBeVisible();
    } else {
      await expect(pending.getByLabel('Cargo')).toBeHidden();
      await expect(pending.getByLabel('Permitir editar e excluir desejos comprados')).toBeHidden();
      await expect(existing.getByRole('button', { name: 'Revogar acesso' })).toHaveCount(0);
      await expect(existing.getByRole('button', { name: 'Salvar acesso' })).toHaveCount(0);
    }
    await pending.getByRole('button', { name: 'Revisar solicitação' }).click();
    await expect(pending.locator('option[value="primary-luana"]')).toHaveCount(0);
    await pending.getByLabel('Perfil na Lista de Desejos').selectOption('person-tayane');
    await pending.getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.locator('#appDialogMessage')).toContainText('Tayane');
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(page.locator('#wishAccessStatus')).toHaveText('Acesso atualizado.');
    expect(await page.evaluate(() => window.savedAccess)).toEqual({
      uid: 'visitor-uid', role: 'guest', status: 'approved', personId: 'person-tayane', canManagePurchased: false,
    });
    await page.evaluate(() => window.clearWishlistRequests());
    await expect(page.getByText('Nenhuma solicitação recebida.')).toBeVisible();
    await expect(owner).toBeVisible();
    await expect(partner).toBeVisible();
    if (role === 'admin') {
      await partner.getByRole('button', { name: 'Revogar acesso' }).click();
      await expect(page.locator('#appDialogMessage')).toContainText('Revogar o acesso');
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      expect((await page.evaluate(() => window.savedAccess)).uid).toBe('visitor-uid');
      await partner.getByRole('button', { name: 'Revogar acesso' }).click();
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect(page.locator('#wishAccessStatus')).toHaveText('Acesso revogado.');
      expect(await page.evaluate(() => window.savedAccess)).toEqual({ uid: 'email:partner@example.invalid', status: 'blocked' });

      await expect(partner.locator('.wish-access-badge')).toHaveText(['Revogada', 'Subadministrador']);
      await partner.getByRole('button', { name: 'Reativar acesso' }).click();
      await partner.getByRole('button', { name: 'Reativar', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await partner.getByRole('button', { name: 'Editar acesso' }).click();
      await expect(partner.getByLabel('Cargo')).toHaveValue('coadmin');
      await partner.getByLabel('Cargo').selectOption('guest');
      await expect(partner.getByLabel('Perfil na Lista de Desejos')).toHaveValue('primary-luana');
      await partner.getByRole('button', { name: 'Salvar acesso' }).click();
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.savedAccess)).toEqual({
        uid: 'email:partner@example.invalid', role: 'guest', status: 'approved', personId: 'primary-luana', canManagePurchased: false,
      });
    }
  });
}
test('a connected subadmin moved to guest leaves the wallet and sees only the assigned list', async ({ page }) => {
  await page.route('**/js/firebase-primary-transport.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export async function createPrimaryFirebaseTransport({ user }) {
        if (sessionStorage.getItem('mockDemoted')) throw Object.assign(new Error('Acesso alterado'), { code: 'permission-denied' });
        const current = { ...WalletCloud.pack(WalletStore.snapshot()), schema: 3, revision: 1,
          controller: user.uid + '.' + sessionStorage.getItem('findom.firebase.tab.v4'), leaseUntil: Date.now() + 1e9 };
        return { accessRole: 'coadmin', trackAccess: true,
          watch(fn) { queueMicrotask(() => fn(current)); return () => {}; },
          async transact(change) { return change(current); },
        };
      }
    `,
  }));
  await page.route('**/js/wishlist-access.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export async function openWishlistAccess() {
        const guest = { role: 'guest', personId: 'person-tayane', canManagePurchased: false };
        const record = sessionStorage.getItem('mockDemoted') ? guest : { role: 'coadmin' };
        return { ...record, enabled: true,
          watchAccount(fn) {
            window.demoteAccount = () => { sessionStorage.setItem('mockDemoted', '1'); fn(guest); };
            return () => {};
          },
          watchList(id, fn) { if (id === 'person-tayane') queueMicrotask(() => fn({ name: 'Tayane', items: [] })); return () => {}; },
        };
      }
      export async function openWishlistDirectoryEditor() { return async () => {}; }
      export async function wishlistAccessAdmin() { return { watchAccounts() { return () => {}; } }; }
    `,
  }));
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await expect.poll(() => page.evaluate(() => typeof window.demoteAccount)).toBe('function');
  await page.evaluate(() => window.demoteAccount());
  await expect(page).toHaveURL(/wishlist-guest\.html$/);
  await expect(page.getByRole('heading', { name: 'Tayane' })).toBeVisible();
  await expect(page.locator('#financePanel, #backupPanel, #simulator')).toHaveCount(0);
});
