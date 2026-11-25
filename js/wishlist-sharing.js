const base = ['usuarios', 'gabriel-local'];

export async function openWishlistSharing(db, owner) {
  const sdk = await import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js');
  const config = (await sdk.getDocFromServer(sdk.doc(db, ...base, 'config', 'acesso'))).data();
  const people = [{ id: 'wallet-admin', name: 'Gabriel' }];
  if (config?.emails?.length === 2) people.push({ id: 'primary-luana', name: 'Luana' });
  const allowed = new Set(people.map(({ id }) => id));
  const grants = sdk.collection(db, ...base, 'wishlistGrants');
  const lists = sdk.collection(db, ...base, 'wishlistPersonal');

  function watch(ref, receive, fail) {
    return sdk.onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) receive(snapshot);
    }, fail);
  }

  return {
    watchPeople: receive => { receive(people); return () => {}; },
    watchGrants: (side, receive, fail) => watch(sdk.query(grants, sdk.where(side, '==', owner)), snapshot =>
      receive(snapshot.docs.map(row => row.data()).filter(grant => allowed.has(grant.owner) && allowed.has(grant.recipient))), fail),
    watchPersonal: (profile, receive, fail) => watch(sdk.doc(lists, profile), snapshot =>
      receive(Object.values(snapshot.data()?.items || {})), fail),
    grant: recipient => sdk.setDoc(sdk.doc(grants, owner + '~' + recipient), { owner, recipient }),
    revoke: recipient => sdk.deleteDoc(sdk.doc(grants, owner + '~' + recipient)),
  };
}
