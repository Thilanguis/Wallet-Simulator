// Reuse the existing Firebase Web app. Public SDK identifiers support Google
// sign-in; permissions are enforced by Authentication and Firestore rules.
let ready;
export async function existingFirestoreDb() {
  if (!ready)
    ready = (async () => {
      // Use one verified configuration in development and production. An old
      // ignored firebaseConfiguration.js may contain an abbreviated/invalid key.
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
