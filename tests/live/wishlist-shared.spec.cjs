const {test,expect}=require('@playwright/test');
const {hub}=require('./firebase-primary-hub.cjs');
test('wishlist syncs between accounts without creating real expenses',async({browser})=>{
 const server=await hub(), aContext=await browser.newContext(), bContext=await browser.newContext();
 try {
 const a=await aContext.newPage(),b=await bContext.newPage();
 await server.attach(a); await server.attach(b,'0',{user:{uid:'partner',email:'partner@example.invalid',emailVerified:true}});
 for(const page of [a,b]) {await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');await page.locator('[data-panel=wishlistPanel]').click();}
 await expect(a.locator('#wishFriendCount')).toHaveText('0');
 await a.getByRole('button', { name: 'Gerenciar amigas' }).click();
 const manager = a.locator('#wishPeopleDialog');
 await manager.getByLabel('Nome da amiga').fill('Bruna');
 await manager.getByRole('button', { name: 'Adicionar', exact: true }).click();
 await expect(manager.locator('#wishPeopleList')).toContainText('0 desejos');
 await expect(b.locator('#wishPerson option[value=Bruna]')).toHaveCount(1);
 await expect(b.locator('#wishFriendCount')).toHaveText('1');
 await expect(b.locator('.wish-row')).toHaveCount(0);
 await manager.getByRole('button', { name: 'Remover Bruna' }).click();
 await a.locator('[data-dialog-confirm]').click();
 await expect(b.locator('#wishPerson option[value=Bruna]')).toHaveCount(0);
 await expect(b.locator('#wishFriendCount')).toHaveText('0');
 await manager.getByRole('button', { name: 'Fechar lista de amigas' }).click();
 await a.locator('#wishEditor > summary').click();await a.locator('#wishUrl').fill('https://example.invalid/product');await a.locator('#wishTitle').fill('Desejo compartilhado');await a.locator('#wishStore').fill('Loja teste');await a.locator('#wishSave').click();
 await expect(b.locator('.wish-row a')).toHaveText('Desejo compartilhado');await b.locator('.wish-row input').check();await expect(a.locator('.wish-row input')).toBeChecked();
 for (const page of [a,b]) await page.getByRole('button', { name: 'Editar Desejo compartilhado' }).click();
 await a.locator('#wishPrice').fill('45');
 await a.locator('#wishSave').click();
 await expect(b.locator('.wish-row-price')).toContainText('45,00');
 await b.locator('#wishPerson').selectOption('');
 await b.locator('#wishPersonName').fill('Ana');
 await b.locator('#wishSave').click();
 for (const page of [a,b]) {
   await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toBeVisible();
   await expect(page.locator('.wish-row-price')).toContainText('45,00');
   await expect(page.locator('.wish-row input')).toBeChecked();
 }
 await a.getByRole('button', { name: 'Gerenciar amigas' }).click();
 await manager.getByRole('button', { name: 'Remover Ana' }).click();
 await expect(manager.locator('#wishPeopleStatus')).toContainText('Mova os desejos');
 await manager.getByRole('button', { name: 'Editar nome de Ana' }).click();
 await manager.getByRole('textbox', { name: 'Editar nome', exact: true }).fill('Ana Clara');
 await manager.getByRole('button', { name: 'Salvar nome' }).click();
 await expect(b.getByRole('heading', { name: 'Ana Clara', exact: true })).toBeVisible();
 await expect(b.locator('.wish-row input')).toBeChecked();
 await expect(b.locator('.wish-row-price')).toContainText('45,00');
 expect(server.docs.get('usuarios/gabriel-local').saldoDominadora).toBe(1000);
 expect(JSON.parse(server.docs.get('usuarios/gabriel-local').walletAtualV4.financeJson).entries).toHaveLength(0);
 } finally {await aContext.close();await bContext.close();}
});
