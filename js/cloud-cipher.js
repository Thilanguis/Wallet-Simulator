/* A private pairing code stays on the devices; Firestore receives ciphertext only. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.WalletCipher = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const valid = (code) => typeof code === 'string' && /^[a-f0-9]{128}$/.test(code);
  function create() {
    return Array.from(crypto.getRandomValues(new Uint8Array(64)), (v) => v.toString(16).padStart(2, '0')).join('');
  }
  function bytes(hex) {
    return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
  }
  function base64(data) {
    return btoa(Array.from(new Uint8Array(data), (v) => String.fromCharCode(v)).join(''));
  }
  function unbase64(data) {
    return Uint8Array.from(atob(data), (v) => v.charCodeAt(0));
  }
  function metadata(doc) {
    return { schema: doc.schema, revision: doc.revision, controller: doc.controller, leaseUntil: doc.leaseUntil };
  }
  async function forCode(code) {
    if (!valid(code)) throw new Error('Código de vínculo inválido.');
    const key = await crypto.subtle.importKey('raw', bytes(code.slice(64)), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const encoder = new TextEncoder();
    return {
      room: code.slice(0, 64),
      async seal(doc) {
        const meta = metadata(doc),
          iv = crypto.getRandomValues(new Uint8Array(12));
        const payload = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(JSON.stringify(meta)) }, key, encoder.encode(JSON.stringify(doc)));
        return { ...meta, iv: base64(iv), payload: base64(payload) };
      },
      async open(encrypted) {
        const meta = metadata(encrypted);
        try {
          const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(encrypted.iv), additionalData: encoder.encode(JSON.stringify(meta)) }, key, unbase64(encrypted.payload));
          const doc = JSON.parse(new TextDecoder().decode(clear));
          if (JSON.stringify(metadata(doc)) !== JSON.stringify(meta)) throw new Error();
          return doc;
        } catch {
          throw new Error('Não foi possível ler esta carteira com o código informado. Os dados locais foram preservados.');
        }
      },
    };
  }
  return { valid, create, forCode };
});
