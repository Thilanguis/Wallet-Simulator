// Reuse the existing Firebase Web app. Public SDK identifiers support Google
// sign-in; permissions are enforced by Authentication and Firestore rules.
const walletAppName = 'findom-wallet-existing';
const connections = new Map();
export async function existingFirestoreDb(name = walletAppName) {
  if (!connections.has(name)) {
    const ready = (async () => {
      // Use one verified configuration in development and production. An old
      // ignored firebaseConfiguration.js may contain an abbreviated/invalid key.
      const [{ initializeApp, getApps }, { getFirestore }, { firebaseWebConfig }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js'),
        import('./firebase-web-config.js'),
      ]);
      const app = getApps().find((item) => item.name === name) || initializeApp(firebaseWebConfig, name);
      const db = getFirestore(app);
      if (name === walletAppName) window._firestoreDb = db;
      return db;
    })().catch((error) => {
      connections.delete(name);
      throw error;
    });
    connections.set(name, ready);
  }
  return connections.get(name);
}
