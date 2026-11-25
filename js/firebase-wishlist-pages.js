// Large wishlists are published by updating the wallet's manifest after its pages exist.
const pageLength = 100000; // At most 300,000 UTF-8 bytes, even for non-ASCII text.
const pagesPerBatch = 16;
const pageIdPattern = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();
async function pageId(payload) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(payload)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createWishlistPages(sdk, db, root) {
  const pages = sdk.collection(db, root.path, 'wishlistPages');
  const ref = id => sdk.doc(pages, id);
  const cache = new Map();

  async function readPage(id) {
    if (!cache.has(id)) {
      const pending = sdk.getDocFromServer(ref(id)).then(async (snapshot) => {
        const payload = snapshot.data()?.payload;
        if (typeof payload !== 'string' || await pageId(payload) !== id)
          throw new Error('Uma parte da Lista de Desejos está indisponível. Tente reconectar.');
        return payload;
      });
      cache.set(id, pending);
      pending.catch(() => { if (cache.get(id) === pending) cache.delete(id); });
    }
    return cache.get(id);
  }

  return {
    async restore(wallet) {
      const { wishlistPages, ...envelope } = wallet;
      if (wishlistPages === undefined) return wallet;
      if (!Array.isArray(wishlistPages) || !wishlistPages.length || wishlistPages.some(id => !pageIdPattern.test(id)))
        throw new Error('A Lista de Desejos no Firebase tem formato incompatível.');
      const { wishlist, wishlistImages } = JSON.parse((await Promise.all(wishlistPages.map(readPage))).join(''));
      if (typeof wishlist !== 'string') throw new Error('A Lista de Desejos no Firebase tem formato incompatível.');
      return { ...envelope, wishlistImages, simulator: { ...envelope.simulator, wishlist } };
    },
    async write(wallet, previousPages = []) {
      const { wishlistImages, simulator: { wishlist = '[]', ...simulator }, ...envelope } = wallet;
      const serialized = JSON.stringify({ wishlist, wishlistImages });
      const chunks = [];
      for (let start = 0; start < serialized.length;) {
        let end = Math.min(start + pageLength, serialized.length);
        const last = serialized.charCodeAt(end - 1);
        if (end < serialized.length && last >= 0xd800 && last <= 0xdbff) end--;
        chunks.push(serialized.slice(start, end));
        start = end;
      }
      const wishlistPages = await Promise.all(chunks.map(pageId));
      const known = new Set(previousPages);
      const missing = [...new Map(wishlistPages.map((id, index) => [id, chunks[index]]))].filter(([id]) => !known.has(id));
      for (let start = 0; start < missing.length; start += pagesPerBatch) {
        const entries = missing.slice(start, start + pagesPerBatch);
        const batch = sdk.writeBatch(db);
        for (const [id, payload] of entries) batch.set(ref(id), { payload });
        await batch.commit();
        for (const [id, payload] of entries) cache.set(id, Promise.resolve(payload));
      }
      return { ...envelope, simulator, wishlistPages };
    },
    retain(ids = []) {
      const active = new Set(ids);
      for (const id of cache.keys()) if (!active.has(id)) cache.delete(id);
    },
  };
}
