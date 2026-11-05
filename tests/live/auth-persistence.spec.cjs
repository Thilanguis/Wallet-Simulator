const {test,expect}=require('@playwright/test');
test('persistent auth waits for restoration and survives repeated reloads',async({page})=>{
  await page.route('**/js/firebase-primary-transport.js',route=>route.fulfill({contentType:'text/javascript',body:`export async function createPrimaryFirebaseTransport(){if(sessionStorage.getItem('test-wallet-unavailable'))throw new Error('Conexão interrompida');const value={...WalletCloud.pack(WalletStore.snapshot()),schema:3,revision:1,controller:'',leaseUntil:0};return{watch(fn){queueMicrotask(()=>fn(value));return()=>{}},async transact(change){return change(value)}}}`}));
  await page.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js',route=>route.fulfill({contentType:'text/javascript',body:`
    export const indexedDBLocalPersistence={type:'INDEXEDDB'},browserLocalPersistence={type:'LOCAL'},browserPopupRedirectResolver={};
    let callback;const auth={currentUser:null,async authStateReady(){auth.currentUser=JSON.parse(localStorage.getItem('test-persisted-user')||'null');window.__authRestored=true}};
    export function initializeAuth(app,options){window.__persistence=options.persistence.map(x=>x.type);return auth}
    export const onAuthStateChanged=(a,fn)=>{if(!window.__authRestored)throw new Error('Auth not restored');callback=fn;queueMicrotask(()=>fn(a.currentUser));return()=>{}};
    export class GoogleAuthProvider{setCustomParameters(){}}
    export async function signInWithPopup(){auth.currentUser={uid:'fixture',email:'fixture@example.invalid',emailVerified:true};localStorage.setItem('test-persisted-user',JSON.stringify(auth.currentUser));callback(auth.currentUser)}
    export async function signOut(){throw new Error('Unexpected sign out')}
  `}));
  await page.goto('/');await page.locator('#googleSignIn').click();await expect(page.locator('#firebaseAccount')).toHaveText('fixture@example.invalid');
  for(let i=0;i<3;i++){await page.reload();await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');await expect(page.locator('#firebaseAuthPanel')).toBeHidden();expect(await page.evaluate(()=>window.__persistence)).toEqual(['INDEXEDDB','LOCAL']);}

  await page.evaluate(() => sessionStorage.setItem('test-wallet-unavailable', '1'));
  await page.reload();
  await expect(page.locator('#firebaseAuthMessage')).toHaveText('Conexão interrompida');
  await expect(page.locator('#firebaseAuthTitle')).toHaveText('Conexão com a carteira');
  await expect(page.locator('#googleSignIn')).toBeHidden();
  await expect(page.locator('#retryFirebaseConnection')).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.removeItem('test-wallet-unavailable');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await expect(page.locator('#firebaseAuthPanel')).toBeHidden();
});
