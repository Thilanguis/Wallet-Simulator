const { test, before, after } = require('node:test');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, runTransaction } = require('firebase/firestore');
let environment;
const root = 'usuarios/gabriel-local';
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-findom-rules', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, root), { saldoDominadora: 1000, bonusEspecialAtivo: false, notificationToken: 'synthetic-protected' });
    await setDoc(doc(db, root + '/config/acesso'), { emails: ['owner@example.invalid', 'partner@example.invalid'], securityVersion: 'google-private-v1' });
    await setDoc(doc(db, root + '/tarefas/existing'), { titulo: 'Tarefa sintética', status: 'pendente' });
  });
});
after(async () => environment?.cleanup());
const signed = (email, verified = true, provider = 'google.com') => environment.authenticatedContext(email, { email, email_verified: verified, firebase: { sign_in_provider: provider } }).firestore();
test('anonymous clients cannot read or change the existing wallet, notes, access list or collections', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, root)));
  await assertFails(updateDoc(doc(db, root), { saldoDominadora: 0 }));
  await assertFails(getDocs(collection(db, root + '/tarefas')));
  await assertFails(getDoc(doc(db, root + '/config/acesso')));
});
test('both authorized verified Google accounts can read the same existing wallet and update money atomically', async () => {
  for (const email of ['owner@example.invalid', 'partner@example.invalid']) {
    const db = signed(email);
    await assertSucceeds(getDoc(doc(db, root)));
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const current = await tx.get(doc(db, root));
        tx.update(doc(db, root), { saldoDominadora: current.data().saldoDominadora + 1 });
      }),
    );
    await assertSucceeds(getDocs(collection(db, root + '/tarefas')));
  }
});
test('a third Google account, an unverified email or another provider cannot access the wallet', async () => {
  for (const db of [signed('outsider@example.invalid'), signed('owner@example.invalid', false), signed('owner@example.invalid', true, 'password')]) {
    await assertFails(getDoc(doc(db, root)));
    await assertFails(updateDoc(doc(db, root), { saldoDominadora: 0 }));
  }
});
test('members cannot change the allowlist, delete the wallet or overwrite unrelated legacy fields', async () => {
  const db = signed('owner@example.invalid');
  await assertFails(updateDoc(doc(db, root + '/config/acesso'), { emails: ['outsider@example.invalid'] }));
  await assertFails(deleteDoc(doc(db, root)));
  await assertFails(updateDoc(doc(db, root), { notificationToken: 'replaced' }));
  await assertFails(updateDoc(doc(db, root), { saldoDominadora: '1000' }));
});
test('members can create the immutable pre-upgrade backup once but cannot change it later', async () => {
  const db = signed('owner@example.invalid'),
    ref = doc(db, root + '/config/antesFirebasePrincipalV4');
  await assertSucceeds(setDoc(ref, { usuarioAnterior: { saldoDominadora: 1000 } }));
  await assertFails(setDoc(ref, { usuarioAnterior: { saldoDominadora: 0 } }));
  await assertFails(deleteDoc(ref));
});
test('task completion and history archival can be saved without allowing destructive deletion', async () => {
  const db = signed('partner@example.invalid');
  await assertSucceeds(updateDoc(doc(db, root + '/tarefas/existing'), { status: 'concluida' }));
  await assertSucceeds(setDoc(doc(db, root + '/historico/example'), { valor: 30, tipo: 'gasto', arquivado: true }));
  await assertFails(deleteDoc(doc(db, root + '/tarefas/existing')));
  await assertFails(deleteDoc(doc(db, root + '/historico/example')));
});
