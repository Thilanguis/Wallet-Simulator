const {test,expect}=require('../firebase-fixture.cjs');
test('pasted Canadian product uses its name and currency; rates are cached across reload',async({page})=>{
 let calls=0;
 await page.route('https://api.frankfurter.dev/**',route=>{calls++;return route.fulfill({contentType:'application/json',body:JSON.stringify([{base:'BRL',quote:'CAD',rate:.25,date:'2026-11-02'},{base:'BRL',quote:'USD',rate:.2,date:'2026-11-02'}])})});
 await page.route('https://ca.pandora.net/product',route=>route.fulfill({contentType:'text/html',headers:{'access-control-allow-origin':'*'},body:'<script type="application/ld+json">{"@type":"Product","name":"Anel teste","offers":{"price":"100","priceCurrency":"CAD"}}</script>'}));
 await page.goto('/');await page.locator('[data-panel=wishlistPanel]').click();await page.locator('#wishEditor > summary').click();await page.locator('#wishUrl').fill('https://ca.pandora.net/product');
 await expect(page.locator('#wishStore')).toHaveValue('Pandora');await expect(page.locator('#wishTitle')).toHaveValue('Anel teste');await expect(page.locator('#wishPrice')).toHaveValue('100');await expect(page.locator('#wishCurrency')).toHaveValue('CAD');await expect(page.locator('#wishConversion')).toContainText('400,00');
 await page.locator('#wishSave').click();await expect(page.locator('.wish-row')).toContainText('CAD 100');await expect(page.locator('.wish-row')).toContainText('400,00');
 await page.reload();await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');expect(calls).toBe(1);
});
