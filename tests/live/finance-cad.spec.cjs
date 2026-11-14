const {test,expect}=require('../firebase-fixture.cjs');
for(const width of [1440,393])test('CAD optional historical preview '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('https://api.frankfurter.dev/v2/rates?**',r=>r.fulfill({json:[{base:'CAD',quote:'BRL',date:'2025-05-30',rate:4}]}));
 await page.goto('/');await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
 await page.evaluate(()=>{let s=Finance.empty();for(const [id,date,amount] of [['a','2025-05-31',60000],['b','',20000]])s=Finance.update(s,{type:'add',entry:{id,date,amount,currency:'BRL',category:'Lista de Compras',description:'Compra '+id,store:'Teste',status:'paid'}});FinanceUI.save(s);});
 await page.locator('[data-panel=financePanel]').click();await expect(page.locator('#financeShowCad')).not.toBeChecked();await expect(page.locator('.note-cad')).toHaveCount(0);
 await page.locator('#financeShowCad').check();await expect(page.locator('#groupedFinanceList .note-cad').first()).toHaveText('CAD —');await page.locator('#financePrepareCad').click();await expect(page.locator('.cad-review')).toBeVisible();
 expect(await page.evaluate(()=>WalletStore.finance().entries.every(e=>!e.cadReference))).toBe(true);
 await expect(page.locator('.cad-review')).toContainText('data aproximada');await page.locator('[data-apply]').click();await expect(page.locator('.cad-review')).toHaveCount(0);await expect(page.locator('#groupedFinanceList .note-cad').first()).toContainText('150,00');
 expect(await page.evaluate(()=>WalletStore.finance().entries.map(e=>[e.id,e.amount,e.date,e.cadReference.amount]))).toEqual([['a',60000,'2025-05-31',15000],['b',20000,'',5000]]);
 expect(await page.evaluate(()=>Finance.totals(WalletStore.finance().entries).total)).toBe(80000);
 await page.locator('#financeShowCad').uncheck();await expect(page.locator('.note-cad')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
