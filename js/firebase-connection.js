// The current legacy connection needs only the public project ID. Prefer the
// existing local configuration when present; never publish private config files.
let ready;
export async function existingFirestoreDb() {
  if (window._firestoreDb) return window._firestoreDb;
  if (!ready)
    ready = (async () => {
      const local = new URL('../firebaseConfiguration.js', import.meta.url);
      let configured = false;
      try {
        configured = (await fetch(local, { method: 'HEAD', cache: 'no-store' })).ok;
      } catch {
        /* A static publication can use the public project ID below. */
      }
      if (configured) {
        await import(local.href);
        if (!window._firestoreDb) throw new Error('A configuração Firebase local não expôs o banco esperado.');
        return window._firestoreDb;
      }
      const [{ initializeApp, getApps }, { getFirestore }] = await Promise.all([import('https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js'), import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js')]);
      const name = 'findom-wallet-existing';
      const app = getApps().find((item) => item.name === name) || initializeApp({ projectId: 'walletsumilator' }, name);
      window._firestoreDb = getFirestore(app);
      return window._firestoreDb;
    })().catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}
