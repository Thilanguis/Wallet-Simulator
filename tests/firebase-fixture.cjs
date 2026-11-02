// UI/economy tests run against an authenticated in-memory transport. The actual
// Firestore transport and auth boundaries are tested separately with SDK mocks
// and the rules emulator; no fixture data can reach the production database.
const base = require('@playwright/test');
const test = base.test.extend({
  firebaseUiFixture: [
    async ({ page, context }, use) => {
      await page.routeWebSocket(/\/ws$/, (socket) => socket.close());
      await context.route('**/js/firebase-google-auth.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `
      export async function googleAuth(){let receive;const user={uid:'ui-fixture',email:'ui@example.invalid',emailVerified:true};return {db:{app:{}},auth:{currentUser:user},watch(fn){receive=fn;queueMicrotask(()=>fn(user));return()=>{}},signIn:async()=>{receive(user)},signOut:async()=>{receive(null)}}}
    `,
        }),
      );
      await context.route('**/js/firebase-primary-transport.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `
      export async function createPrimaryFirebaseTransport({user}){
        if(!navigator.onLine)throw new Error('Sem conexão com o Firebase. Entre novamente quando estiver online.');
        let current={...WalletCloud.pack(WalletStore.snapshot()),schema:3,revision:1,controller:user.uid+'.'+sessionStorage.getItem('findom.firebase.tab.v4'),leaseUntil:Date.now()+1e9,financeImportOpen:false},receive;
        return {uid:user.uid,watch(fn){receive=fn;queueMicrotask(()=>receive(structuredClone(current)));return()=>{receive=null}},async transact(change){current=change(structuredClone(current));if(current.controller)current.leaseUntil=Date.now()+1e9;queueMicrotask(()=>receive?.(structuredClone(current)));return structuredClone(current)}};
      }
    `,
        }),
      );
      await use();
    },
    { auto: true },
  ],
});
module.exports = { test, expect: base.expect };
