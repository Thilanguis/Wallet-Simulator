'use strict';
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.app-nav [data-panel]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!matchMedia('(max-width: 600px)').matches) return;
      document.getElementById(button.dataset.panel).scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  });
});
