// Stateful SDK mock: transactions read/write multiple documents atomically.
// Every Firebase request is intercepted; no real project is contacted.
async function hub(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)])),
    pages = new Set();
  let authRequests = 0;
  async function broadcast(path, value) {
    for (const page of pages)
      if (!page.isClosed()) {
        await page.evaluate(({ path, value }) => window.dispatchEvent(new CustomEvent('__cloudDoc', { detail: { path, value } })), { path, value }).catch(() => {});
      }
  }
  async function publish(path, value) {
    docs.set(path, structuredClone(value));
    await broadcast(path, value);
  }
  async function attach(page, balance = '1000', options = {}) {
    pages.add(page);
    await page.routeWebSocket(/\/ws$/, (socket) => socket.close());
    await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
      if (route.request().url().endsWith('firebase-app.js'))
        return route.fulfill({ contentType: 'text/javascript', body: 'export const getApps=()=>[]; export function initializeApp(options,name){window.__minimalFirebaseConfig=options;return {options,name}};' });
      if (!route.request().url().endsWith('firebase-firestore.js')) {
        authRequests++;
        return route.fulfill({ contentType: 'text/javascript', body: "throw new Error('No login should be requested by the existing Firebase flow');" });
      }
      return route.fulfill({
        contentType: 'text/javascript',
        body: `
        export const doc=(db,...parts)=>({path:parts.join('/')});
        export const getFirestore=app=>({app});
        export const serverTimestamp=()=> 'server-time';
        const snap=value=>({exists:()=>value!==null,data:()=>value,metadata:{fromCache:false,hasPendingWrites:false}});
        export function onSnapshot(ref,options,receive,fail){let active=true;const listener=event=>{if(active&&event.detail.path===ref.path)receive(snap(event.detail.value));};window.addEventListener('__cloudDoc',listener);window.__hubRead(ref.path).then(value=>{if(active)receive(snap(value));}).catch(fail);return ()=>{active=false;window.removeEventListener('__cloudDoc',listener);};}
        export async function runTransaction(db,change){for(let n=0;n<10;n++){const expected={},writes=[];const result=await change({get:async ref=>{const value=await window.__hubRead(ref.path);expected[ref.path]=value;return snap(value);},set:(ref,data,options)=>writes.push({path:ref.path,data,options})});if(await window.__hubWrite({expected,writes}))return result;}throw new Error('transaction conflict');}
      `,
      });
    });
    await page.route('**/firebaseConfiguration.js', (route) => route.fulfill(options.configurationMissing ? { status: 404, contentType: 'text/plain', body: '' } : { contentType: 'text/javascript', body: 'window._firestoreDb={app:{}}; export {};' }));
    await page.exposeBinding('__hubRead', (_, path) => structuredClone(docs.get(path) ?? null));
    await page.exposeBinding('__hubWrite', (_, { expected, writes }) => {
      for (const [path, before] of Object.entries(expected)) if (JSON.stringify(docs.get(path) ?? null) !== JSON.stringify(before)) return false;
      for (const { path, data, options } of writes) {
        const value = options?.mergeFields ? { ...(docs.get(path) || {}), ...structuredClone(data) } : structuredClone(data);
        docs.set(path, value);
        setTimeout(() => broadcast(path, value), 0);
      }
      return true;
    });
    await page.addInitScript((balance) => {
      if (!localStorage.getItem('findom.wallet.v2')) localStorage.setItem('saldoDominadora', balance);
    }, balance);
    await page.goto('/');
  }
  return { attach, docs, publish, authRequests: () => authRequests };
}
module.exports = { hub };
