import { existingFirestoreDb } from './firebase-connection.js';

const roleKey = 'wallet-access-dev-role';
const accounts = {
  admin: { email: 'admin@teste.com.br', sub: 'dev-wallet-admin' },
  guest: { email: 'teste@teste.com.br', sub: 'dev-wallet-guest' },
};

export async function googleAuth() {
  const db = await existingFirestoreDb();
  const sdk = await import('https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js');
  const auth = sdk.initializeAuth(db.app, { persistence: sdk.inMemoryPersistence });
  sdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const preview = window.parent !== window && new URLSearchParams(location.search).get('preview') === 'guest';
  const role = preview || sessionStorage.getItem(roleKey) === 'guest' ? 'guest' : 'admin';
  const signIn = () => sdk.signInWithCredential(auth,
    sdk.GoogleAuthProvider.credential(JSON.stringify({ ...accounts[role], email_verified: true })));
  await signIn();
  return { db, auth, watch: listener => sdk.onAuthStateChanged(auth, listener), signIn,
    signOut: () => sdk.signOut(auth) };
}