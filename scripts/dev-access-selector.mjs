if (window.parent === window) {
  const key = 'wallet-access-dev-role';
  const bar = document.createElement('aside');
  bar.setAttribute('aria-label', 'Modo desenvolvedor');
  bar.style.cssText = 'padding:10px 14px;background:#302631;color:#ffe5ed;border-bottom:1px solid #9b6488;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;font:600 13px/1.4 system-ui';
  const title = document.createElement('strong');
  title.textContent = 'Modo desenvolvedor · Firebase Emulator';
  const role = document.createElement('select');
  role.setAttribute('aria-label', 'Conta de teste');
  role.style.cssText = 'width:auto;max-width:100%;margin:0;padding:5px;font:inherit;background:#211a22;color:#ffe5ed;border:1px solid #9b6488;border-radius:6px';
  role.add(new Option('Administrador de teste', 'admin'));
  role.add(new Option('Convidada · teste@teste.com.br', 'guest'));
  role.value = sessionStorage.getItem(key) === 'guest' ? 'guest' : 'admin';
  role.onchange = () => {
    sessionStorage.setItem(key, role.value);
    location.assign(role.value === 'guest' ? '/wishlist-guest.html' : '/');
  };
  bar.append(title, role);
  document.body.prepend(bar);
} else if (new URLSearchParams(location.search).get('preview') === 'guest') {
  const style = document.createElement('style');
  style.textContent = '.wishlist-guest-page #guestSignOut { display: none }';
  document.head.append(style);
}
