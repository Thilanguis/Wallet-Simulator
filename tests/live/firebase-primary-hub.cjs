// Stateful Auth/Firestore mocks. Fixture data never reaches the real project.
async function hub(seed = {}) {
  const root = 'usuarios/gabriel-local';
  const initial = {
    [root]: { saldoDominadora: 1000, bonusEspecialAtivo: false, tarefasBloqueadas: [], accelBoosts: [] },
    [root + '/config/acesso']: { emails: ['owner@example.invalid', 'partner@example.invalid'], securityVersion: 'google-private-v1' },
    ...seed,
  };
  const docs = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)])),
    pages = new Set();
  let writes = 0;
  async function broadcast(path, value) {
    for (const page of pages) if (!page.isClosed()) await page.evaluate(({ path, value }) => window.dispatchEvent(new CustomEvent('__cloudDoc', { detail: { path, value } })), { path, value }).catch(() => {});
  }
  async function publish(path, value) {
    docs.set(path, structuredClone(value));
    await broadcast(path, value);
  }
  async function attach(page, balance = '0', options = {}) {
    pages.add(page);
    await page.routeWebSocket(/\/ws$/, (socket) => socket.close());
    await page.addInitScript(
      ({ balance, options }) => {
        window.__firebaseUser = Object.hasOwn(options, 'user') ? options.user : { uid: 'owner', email: 'owner@example.invalid', emailVerified: true };
        if (!localStorage.getItem('findom.wallet.v2')) {
          if (options.wallet) localStorage.setItem('findom.wallet.v2', JSON.stringify(options.wallet));
          else localStorage.setItem('saldoDominadora', balance);
        }
      },
      { balance, options },
    );
    await page.route('**/firebaseConfiguration.js', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: '' }));
    await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
      const url = route.request().url();
      if (url.endsWith('firebase-app.js')) return route.fulfill({ contentType: 'text/javascript', body: 'export const getApps=()=>[];export const initializeApp=(options,name)=>({options,name});' });
      if (url.endsWith('firebase-auth.js'))
        return route.fulfill({
          contentType: 'text/javascript',
          body: `
        let listener; const auth={get currentUser(){return window.__firebaseUser}};
        export const browserLocalPersistence={}; export const setPersistence=async()=>{};export const getAuth=()=>auth;
        export const onAuthStateChanged=(a,fn)=>{listener=fn;queueMicrotask(()=>fn(a.currentUser));return()=>{listener=null}};
        export class GoogleAuthProvider{setCustomParameters(value){window.__googleParameters=value}}
        export const signInWithPopup=async()=>{window.__firebaseUser={uid:'owner',email:'owner@example.invalid',emailVerified:true};listener?.(window.__firebaseUser);return {user:window.__firebaseUser}};
        export const signOut=async()=>{window.__firebaseUser=null;listener?.(null)};
      `,
        });
      if (!url.endsWith('firebase-firestore.js')) return route.abort();
      return route.fulfill({
        contentType: 'text/javascript',
        body: `
        export const getFirestore=app=>({app});export const serverTimestamp=()=> '2026-11-02T00:00:00Z';
        export const doc=(db,...parts)=>({path:parts.join('/'),kind:'doc'});export const collection=(db,...parts)=>({path:parts.join('/'),kind:'collection'});
        const snap=value=>({exists:()=>value!==null,data:()=>value,metadata:{fromCache:false,hasPendingWrites:false}});
        const querySnap=items=>({docs:items.map(({id,value})=>({id,data:()=>value})),metadata:{fromCache:false,hasPendingWrites:false}});
        export const getDocFromServer=async ref=>snap(await window.__hubRead(ref.path));
        export function onSnapshot(ref,options,receive,fail){let active=true;const deliver=async()=>{try{const value=ref.kind==='collection'?querySnap(await window.__hubList(ref.path)):snap(await window.__hubRead(ref.path));if(active)receive(value)}catch(e){fail(e)}};const listener=event=>{if(event.detail.path===ref.path||(ref.kind==='collection'&&event.detail.path.startsWith(ref.path+'/')&&event.detail.path.split('/').length===ref.path.split('/').length+1))void deliver()};window.addEventListener('__cloudDoc',listener);void deliver();return()=>{active=false;window.removeEventListener('__cloudDoc',listener)}}
        export async function runTransaction(db,change){for(let n=0;n<10;n++){const expected={},writes=[];const result=await change({get:async ref=>{const value=await window.__hubRead(ref.path);expected[ref.path]=value;return snap(value)},set:(ref,data,options)=>writes.push({path:ref.path,data,options})});if(await window.__hubWrite({expected,writes}))return result;}throw new Error('transaction conflict')}
      `,
      });
    });
    await page.exposeBinding('__hubRead', (_, path) => structuredClone(docs.get(path) ?? null));
    await page.exposeBinding('__hubList', (_, path) =>
      [...docs].filter(([key, value]) => value && key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1).map(([key, value]) => ({ id: key.split('/').at(-1), value: structuredClone(value) })),
    );
    await page.exposeBinding('__hubWrite', (_, { expected, writes: changes }) => {
      for (const [key, value] of Object.entries(expected)) if (JSON.stringify(docs.get(key) ?? null) !== JSON.stringify(value)) return false;
      for (const { path, data, options } of changes) {
        const value = options?.merge || options?.mergeFields ? { ...(docs.get(path) || {}), ...structuredClone(data) } : structuredClone(data);
        docs.set(path, value);
        setTimeout(() => broadcast(path, value), 0);
      }
      writes++;
      return true;
    });
    await page.goto('/');
  }
  return { attach, docs, publish, writes: () => writes };
}
module.exports = { hub };
