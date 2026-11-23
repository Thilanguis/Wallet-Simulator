'use strict';
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.app-nav [data-panel]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!matchMedia('(max-width: 600px)').matches) return;
      document.getElementById(button.dataset.panel).scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  });
});

document.addEventListener('click', ({ target }) => {
  const account = document.querySelector('.account-menu[open]');
  if (account && !account.contains(target) && !target.closest?.('dialog')) account.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.target.closest?.('dialog') || document.querySelector('dialog[open]')) return;
  const account = document.querySelector('.account-menu[open]');
  if (!account) return;
  account.open = false;
  account.querySelector('summary')?.focus();
});
