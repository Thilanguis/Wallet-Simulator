// Reuse the existing Firebase Web app. Public SDK identifiers support Google
// sign-in; permissions are enforced by Authentication and Firestore rules.
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
        /* A static publication uses the public Web SDK configuration below. */
      }
      if (configured) {
        await import(local.href);
        if (!window._firestoreDb) throw new Error('A configuração Firebase local não expôs o banco esperado.');
        return window._firestoreDb;
      }
      const [{ initializeApp, getApps }, { getFirestore }, { firebaseWebConfig }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js'),
        import('./firebase-web-config.js'),
      ]);
      const name = 'findom-wallet-existing';
      const app = getApps().find((item) => item.name === name) || initializeApp(firebaseWebConfig, name);
      window._firestoreDb = getFirestore(app);
      return window._firestoreDb;
    })().catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}
