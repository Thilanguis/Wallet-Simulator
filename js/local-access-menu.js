(() => {
  const isLocal = location.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(location.hostname) && location.port !== '5516';
  if (!isLocal) return;

  const previewKey = 'wallet-local-guest-preview';
  let guestOpen = sessionStorage.getItem(previewKey) === 'guest';

  // Live Server injects its socket while parsing the page. Intercept that one
  // connection so a log file cannot reload the outer window during a guest test.
  if (location.port === '5501' && window.WebSocket) {
    const NativeWebSocket = window.WebSocket;
    class LocalRefreshSocket extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        const url = new URL(this.url);
        const refreshPath = location.pathname.replace(/\/$/, '') + '/ws';
        // Live Server concatenates "/ws" to the current path, including its slash.
        if (url.host === location.host && [refreshPath, location.pathname + '/ws'].includes(url.pathname)) {
          this.addEventListener('message', event => {
            if (guestOpen && ['reload', 'refreshcss'].includes(event.data)) event.stopImmediatePropagation();
          });
        }
      }
    }
    window.WebSocket = LocalRefreshSocket;
    document.addEventListener('DOMContentLoaded', () => {
      if (window.WebSocket === LocalRefreshSocket) window.WebSocket = NativeWebSocket;
    }, { once: true });
  }

  function createAccountPreview(menu) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Alternar conta de teste');
    const testControl = document.createElement('label');
    testControl.className = 'account-menu-test';
    testControl.textContent = 'Modo de teste';
    select.add(new Option('Conta atual', 'current'));
    select.add(new Option('Convidada de teste', 'guest'));
    testControl.append(select);
    menu.append(testControl);

    const preview = document.createElement('dialog');
    preview.setAttribute('aria-label', 'Sessão da convidada de teste');
    preview.style.cssText = 'width:100%;max-width:100%;height:100dvh;max-height:100%;margin:auto;padding:0;background:#171416;color:#ffe5ed;border:0;overflow:hidden';
    const style = document.createElement('style');
    style.textContent = 'dialog[data-wallet-test-preview]::backdrop { background: rgba(12, 7, 11, .8) }';
    preview.dataset.walletTestPreview = '';
    const header = document.createElement('header');
    header.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;padding:.3rem 1rem;background:#241b22;border-bottom:1px solid #513240;font:600 12px/1.5 system-ui';
    const title = document.createElement('strong');
    title.textContent = 'Convidada de teste';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Voltar à minha conta';
    back.style.cssText = 'min-height:2.5rem;margin:0;padding:.4rem .75rem;font:inherit;text-transform:none';
    const layout = document.createElement('div');
    layout.style.cssText = 'display:grid;grid-template-rows:auto minmax(0,1fr);height:100%';
    const frame = document.createElement('iframe');
    frame.title = 'Lista de Desejos da convidada de teste';
    frame.allow = 'clipboard-write';
    frame.style.cssText = 'width:100%;height:100%;border:0';
    header.append(title, back);
    layout.append(header, frame);
    preview.append(layout);
    document.head.append(style);
    document.body.append(preview);

    function openPreview() {
      if (preview.open) return;
      guestOpen = true;
      sessionStorage.setItem(previewKey, 'guest');
      select.value = 'guest';
      if (!frame.hasAttribute('src')) frame.src = 'http://127.0.0.1:5516/wishlist-guest.html?preview=guest';
      preview.showModal();
      back.focus();
    }
    select.addEventListener('change', () => { if (select.value === 'guest') openPreview(); });
    back.addEventListener('click', () => preview.close());
    preview.addEventListener('close', () => {
      guestOpen = false;
      sessionStorage.removeItem(previewKey);
      select.value = 'current';
      select.focus();
    });
    if (guestOpen) openPreview();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const menu = document.querySelector('#firebaseAccountActions .account-menu-content');
    if (menu) createAccountPreview(menu);
  }, { once: true });
})();
