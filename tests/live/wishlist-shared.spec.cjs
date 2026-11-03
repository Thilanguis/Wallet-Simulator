const {test,expect}=require('@playwright/test');
const {hub}=require('./firebase-primary-hub.cjs');
test('wishlist syncs between accounts without creating real expenses',async({browser})=>{
 const server=await hub(), aContext=await browser.newContext(), bContext=await browser.newContext();
 try {
 const a=await aContext.newPage(),b=await bContext.newPage();
 await server.attach(a); await server.attach(b,'0',{user:{uid:'partner',email:'partner@example.invalid',emailVerified:true}});
 for(const page of [a,b]) {await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');await page.locator('[data-panel=wishlistPanel]').click();}
 await a.locator('#wishEditor > summary').click();await a.locator('#wishUrl').fill('https://example.invalid/product');await a.locator('#wishTitle').fill('Desejo compartilhado');await a.locator('#wishStore').fill('Loja teste');await a.locator('#wishSave').click();
 await expect(b.locator('.wish-row a')).toHaveText('Desejo compartilhado');await b.locator('.wish-row input').check();await expect(a.locator('.wish-row input')).toBeChecked();
 expect(server.docs.get('usuarios/gabriel-local').saldoDominadora).toBe(1000);
 expect(JSON.parse(server.docs.get('usuarios/gabriel-local').walletAtualV4.financeJson).entries).toHaveLength(0);
 } finally {await aContext.close();await bContext.close();}
});
