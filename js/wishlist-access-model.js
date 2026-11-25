/* Guest lists contain only fields editable or visible on the shared wish. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.WishlistAccessModel = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const field = 'wishlistMirrorVersions';
  const normalizedName = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').normalize('NFC') : '';
  const nameKey = (value) => normalizedName(value).toLocaleLowerCase('pt-BR');
  const primaryProfile = Object.freeze({ id: 'primary-luana', name: 'Luana' });
  const primaryId = primaryProfile.id;
  const primaryNames = new Set(['luana', 'dominadora']);
  const safeKey = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value) && !/^__.*__$/.test(value);
  const wishId = (value) => typeof value === 'string' ? value : Number.isSafeInteger(value) ? String(value) : '';
  const sharedFields = ['title', 'store', 'originalPrice', 'currency', 'quantity', 'taxQuebec'];

  function list(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function people(simulator) {
    const roster = list(simulator?.wishlistPeople);
    const ids = new Map();
    for (const person of roster) {
      if (!safeKey(person?.id) || person.id === primaryId) continue;
      ids.set(person.id, (ids.get(person.id) || 0) + 1);
    }
    return roster.flatMap((person) => {
      const name = normalizedName(person?.name);
      return ids.get(person?.id) === 1 && name && name.length <= 80 && !primaryNames.has(nameKey(name))
        ? [{ id: person.id, name }] : [];
    });
  }

  function publicItem(item) {
    const id = wishId(item?.id);
    const title = typeof item?.title === 'string' ? item.title.trim().slice(0, 300) : '';
    if (!safeKey(id) || !title) return null;
    const store = typeof item.store === 'string' ? item.store.trim().slice(0, 150) : '';
    const originalPrice = item.originalPrice ?? item.price;
    const quantity = Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    // Keep original screenshots, URLs and finance backlinks inside the wallet.
    return {
      id, title, store,
      originalPrice: Number.isFinite(originalPrice) && originalPrice >= 0 && Number.isSafeInteger(Math.round(originalPrice * 100) * quantity)
        ? originalPrice : null,
      currency: typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency) ? item.currency : 'BRL',
      quantity,
      taxQuebec: item.taxQuebec === true,
      bought: item.bought === true,
    };
  }

  function projections(simulator) {
    const lists = new Map();
    const legacy = new Map();
    for (const person of projectionPeople(simulator)) {
      lists.set(person.id, { name: person.name, items: new Map() });
      const key = nameKey(person.name);
      legacy.set(key, legacy.has(key) ? null : person.id);
    }
    const wishes = list(simulator?.wishlist);
    // An explicit stale ID never falls back to a similarly named person.
    const owner = (item) => item?.personId == null || item.personId === ''
      ? (!nameKey(item?.person) || primaryNames.has(nameKey(item?.person)) ? primaryId : legacy.get(nameKey(item?.person))) : item.personId;
    for (const item of wishes) {
      const matched = lists.get(owner(item));
      if (!matched) continue;
      const filtered = publicItem(item);
      if (filtered) matched.items.set(filtered.id, matched.items.has(filtered.id) ? null : filtered);
    }
    return { lists, owner, wishes };
  }

  function projection(entry, walletRevision = 0) {
    if (!entry) return null;
    const items = Object.fromEntries([...entry.items]
      .filter(([, value]) => value !== null)
      .sort(([a], [b]) => a.localeCompare(b)));
    return { name: entry.name, items, walletRevision, editedId: '' };
  }

  function project(simulator, id, walletRevision = 0) {
    return safeKey(id) ? projection(projections(simulator).lists.get(id), walletRevision) : null;
  }

  function changes(before, after) {
    if (before?.wishlist === after?.wishlist && before?.wishlistPeople === after?.wishlistPeople) return [];
    const prior = projections(before).lists;
    const next = projections(after).lists;
    return [...new Set([...prior.keys(), ...next.keys()])].flatMap(id => {
      const data = projection(next.get(id));
      return JSON.stringify(data) === JSON.stringify(projection(prior.get(id))) ? [] : [{ id, data }];
    });
  }

  function version(versions, id) {
    return versions && Object.hasOwn(versions, id) ? versions[id] : 0;
  }

  function ready(simulator, mirrors, versions) {
    return projectionPeople(simulator).every(({ id }) => {
      const shared = mirrors.get(id);
      const expected = version(versions, id);
      return shared ? shared.walletRevision === expected : expected === 0;
    });
  }

  function overlay(simulator, mirrors, versions) {
    const { lists, owner, wishes } = projections(simulator);
    const occupied = new Set(wishes.map(item => wishId(item?.id)));
    const shared = new Map();
    for (const [id, row] of mirrors) {
      if (!row.walletPaged && lists.has(id) && row.walletRevision === version(versions, id) &&
          row.items && typeof row.items === 'object' && !Array.isArray(row.items)) shared.set(id, row.items);
    }
    if (!shared.size) return simulator;

    const combined = wishes.flatMap(item => {
      const id = owner(item), key = wishId(item?.id);
      const remote = shared.get(id);
      const previous = lists.get(id)?.items.get(key);
      if (!remote || !previous) return [item];
      if (!Object.hasOwn(remote, key)) return [];
      const update = publicItem(remote[key]);
      if (!update || update.id !== key) return [item];
      const patch = Object.fromEntries(sharedFields.filter(name => update[name] !== previous[name]).map(name => [name, update[name]]));
      if (update.bought && !item.bought) patch.bought = true;
      if (Object.hasOwn(patch, 'currency') || Object.hasOwn(patch, 'originalPrice')) {
        patch.price = update.currency === 'BRL' ? update.originalPrice : null;
      }
      return Object.keys(patch).length ? [{ ...item, ...patch }] : [item];
    });
    for (const [id, items] of shared) {
      for (const [key, item] of Object.entries(items)) {
        const addition = publicItem(item);
        if (occupied.has(key) || !addition || addition.id !== key) continue;
        occupied.add(key);
        const person = id === primaryId ? { person: 'Dominadora' } : { personId: id, person: lists.get(id).name };
        combined.push({ ...addition, ...person, price: addition.currency === 'BRL' ? addition.originalPrice : null });
      }
    }
    const json = JSON.stringify(combined);
    return json === JSON.stringify(wishes) ? simulator : { ...simulator, wishlist: json };
  }

  function projectionPeople(simulator) {
    return [primaryProfile, ...people(simulator)];
  }

  function sharePerson(simulator, name) {
    const key = nameKey(name);
    if (primaryNames.has(key)) return primaryId;
    const matches = people(simulator).filter(person => nameKey(person.name) === key);
    return matches.length === 1 ? matches[0].id : null;
  }

  function active(config) {
    return typeof config?.adminEmail === 'string' && config.adminEmail.length > 0 &&
      Array.isArray(config.emails) && config.emails.length <= 2 && config.emails.includes(config.adminEmail);
  }

  return { people, primaryProfile, projectionPeople, sharePerson, project, changes, active, overlay, ready, field, version };
});
