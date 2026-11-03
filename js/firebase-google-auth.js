export async function googleAuth() {
  const { existingFirestoreDb } = await import('./firebase-connection.js');
  const db = await existingFirestoreDb();
  const sdk = await import('https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js');
  let auth;
  if (sdk.initializeAuth) {
    try {
      auth = sdk.initializeAuth(db.app, {
        persistence: [sdk.indexedDBLocalPersistence, sdk.browserLocalPersistence],
        popupRedirectResolver: sdk.browserPopupRedirectResolver,
      });
    } catch (error) {
      if (error.code !== 'auth/already-initialized') throw error;
      auth = sdk.getAuth(db.app);
    }
  } else {
    auth = sdk.getAuth(db.app);
    await sdk.setPersistence(auth, sdk.browserLocalPersistence);
  }
  // Restore the persisted user before deciding that the login screen is needed.
  if (auth.authStateReady) await auth.authStateReady();
  return {
    auth,
    db,
    watch: (listener) => sdk.onAuthStateChanged(auth, listener),
    async signIn() {
      const provider = new sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return sdk.signInWithPopup(auth, provider);
    },
    signOut: () => sdk.signOut(auth),
  };
}
