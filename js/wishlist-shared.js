import { wishlistLinkStore } from './wishlist-share-link.js';

const title = document.getElementById('sharedTitle');
const status = document.getElementById('sharedStatus');
const list = document.getElementById('sharedItems');
const token = location.hash.slice(1);
function clear() {
  title.textContent = 'Lista compartilhada';
  list.replaceChildren();
  status.textContent = 'Este link está indisponível.';
}

function itemRow(item, personId, store) {
  const row = document.createElement('li');
  row.className = 'personal-item';
  const text = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = item.title;
  const info = document.createElement('p');
  info.className = 'personal-item-meta';
  const price = item.originalPrice == null ? '' :
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: item.currency, currencyDisplay: 'code' }).format(item.originalPrice);
  info.textContent = [item.store, price, item.quantity > 1 ? item.quantity + ' unidades' : '',
    item.taxQuebec ? 'Taxas do Québec à parte' : ''].filter(Boolean).join(' · ');
  text.append(name, info);
  row.append(text);
  if (item.bought) {
    const complete = document.createElement('span');
    complete.className = 'personal-hint';
    complete.textContent = 'Comprado';
    row.append(complete);
  } else {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'personal-button';
    button.textContent = 'Marcar como comprado';
    button.setAttribute('aria-label', 'Marcar como comprado: ' + item.title);
    button.onclick = async () => {
      button.disabled = true;
      try {
        await store.markBought(token, personId, item.id);
      } catch {
        status.textContent = 'O desejo mudou ou o link foi revogado. Confira a lista atual.';
        button.disabled = false;
      }
    };
    row.append(button);
  }
  return row;
}

try {
  const store = await wishlistLinkStore();
  store.watch(token, data => {
    if (!data) return clear();
    title.textContent = 'Desejos de ' + data.name;
    const items = Object.values(data.items);
    status.textContent = items.length ? '' : 'Esta lista está vazia.';
    list.replaceChildren(...items.map(item => itemRow(item, data.personId, store)));
  }, clear);
} catch {
  clear();
}