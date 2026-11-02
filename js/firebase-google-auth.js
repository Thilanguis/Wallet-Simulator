export async function googleAuth() {
  const { existingFirestoreDb } = await import('./firebase-connection.js');
  const db = await existingFirestoreDb();
  const sdk = await import('https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js');
  const auth = sdk.getAuth(db.app);
  await sdk.setPersistence(auth, sdk.browserLocalPersistence);
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
