/* Tactile navigation and microinteractions; this module never writes wallet state. */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set(),
    ripples = new WeakMap(),
    values = new WeakMap();
  let pressed = null;
  function animate(element, frames, options, done = () => {}) {
    if (media.matches || !element?.animate) {
      done();
      return null;
    }
    const animation = element.animate(frames, { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', ...options });
    animations.add(animation);
    const cleanup = () => {
      animations.delete(animation);
      done();
    };
    animation.finished.then(cleanup, cleanup);
    return animation;
  }
  function release() {
    pressed?.classList.remove('motion-pressed');
    pressed = null;
  }
  function touch(target, x, y) {
    if (media.matches || !target || target.disabled || target.matches('[aria-disabled="true"],[draggable="true"],#btnRoletaFlutuante')) return;
    // Keep the disclosure hit areas stationary during a press, including their outer edges.
    if (target.matches('#financeTimeline > summary, #financePeopleToggle')) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    release();
    pressed = target;
    target.classList.add('motion-pressed', 'motion-surface');
    if (getComputedStyle(target).position === 'static') target.classList.add('motion-static');
    ripples.get(target)?.cancel();
    const ripple = document.createElement('span');
    ripple.className = 'motion-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    const size = Math.hypot(rect.width, rect.height) * 2;
    Object.assign(ripple.style, { width: size + 'px', height: size + 'px', left: (x ?? rect.width / 2) - size / 2 + 'px', top: (y ?? rect.height / 2) - size / 2 + 'px' });
    target.append(ripple);
    const animation = animate(
      ripple,
      [
        { transform: 'scale(0)', opacity: 0.18 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      { duration: 440, easing: 'ease-out' },
      () => ripple.remove(),
    );
    if (animation) ripples.set(target, animation);
  }
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const button = event.target.closest('button,summary');
      if (!button) return;
      const rect = button.getBoundingClientRect();
      touch(button, event.clientX - rect.left, event.clientY - rect.top);
    },
    true,
  );
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', release);
  document.addEventListener('keydown', (event) => {
    if (event.repeat || !['Enter', ' '].includes(event.key)) return;
    const target = event.target.closest('button,summary');
    if (target) touch(target);
  });
  document.addEventListener('keyup', release);
  // One decorative accent moves between existing tabs; native buttons keep ownership of navigation.
  const nav = document.querySelector('.app-nav'),
    indicator = document.createElement('span');
  indicator.className = 'motion-nav-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  nav.append(indicator);
  function positionIndicator() {
    const active = nav.querySelector('button[aria-pressed="true"]');
    if (!active || !nav.getClientRects().length) {
      indicator.hidden = true;
      return;
    }
    // Layout metrics stay correct while the pressed button is visually scaled.
    indicator.hidden = false;
    indicator.style.width = active.offsetWidth + 'px';
    indicator.style.height = active.offsetHeight + 'px';
    indicator.style.transform = 'translate(' + active.offsetLeft + 'px,' + active.offsetTop + 'px)';
  }
  new MutationObserver(positionIndicator).observe(nav, { attributes: true, subtree: true, attributeFilter: ['aria-pressed'] });
  new ResizeObserver(positionIndicator).observe(nav);
  positionIndicator();
  let shown = document.querySelector('.app-panel:not([hidden])');
  const panels = [...document.querySelectorAll('.app-panel')];
  const sceneObserver = new MutationObserver(() => {
    const next = panels.find((panel) => !panel.hidden);
    if (next === shown) return;
    shown = next;
    if (next) animate(next, [{ opacity: 0.5 }, { opacity: 1 }], { duration: 220 });
  });
  panels.forEach((panel) => sceneObserver.observe(panel, { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener(
    'toggle',
    (event) => {
      const target = event.target;
      if (!target.open) return;
      if (target.matches('dialog'))
        animate(
          target,
          [
            { opacity: 0.5, transform: 'translateY(10px) scale(.985)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
          { duration: 190 },
        );
      else if (target.matches('details'))
        [...target.children]
          .filter((child) => child.tagName !== 'SUMMARY' && !child.hidden)
          .slice(0, 4)
          .forEach((child, index) =>
            animate(
              child,
              [
                { opacity: 0.4, transform: 'translateY(4px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
              { duration: 180, delay: index * 15 },
            ),
          );
    },
    true,
  );
  for (const id of ['saldoDominadora', 'homeTotal', 'wishTotal']) {
    const node = document.getElementById(id);
    if (!node) continue;
    node.classList.add('motion-value');
    let previous = node.textContent;
    new MutationObserver(() => {
      const next = node.textContent;
      if (next === previous) return;
      previous = next;
      if (!node.getClientRects().length || document.hidden) return;
      values.get(node)?.cancel();
      const animation = animate(
        node,
        [
          { opacity: 0.5, transform: 'translateY(3px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 180 },
      );
      if (animation) values.set(node, animation);
    }).observe(node, { childList: true, subtree: true, characterData: true });
  }
  // Messages already belong to their feature; only animate visible text changes.
  for (const id of ['financeMessage', 'wishMessage', 'wishPhotoMessage', 'wishSaveError', 'entryFeedback', 'backupMessage', 'economyCodeMessage']) {
    const node = document.getElementById(id);
    if (!node) continue;
    let previous = node.textContent;
    new MutationObserver(() => {
      const next = node.textContent;
      if (next === previous) return;
      previous = next;
      if (!next.trim() || !node.getClientRects().length || document.hidden) return;
      animate(
        node,
        [
          { opacity: 0.5, transform: 'translateY(3px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 180 },
      );
    }).observe(node, { childList: true, subtree: true, characterData: true });
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-group-toggle],#financePeopleToggle');
    if (!button || button.getAttribute('aria-expanded') !== 'true') return;
    const content = button.id === 'financePeopleToggle' ? document.getElementById('financePeopleTotals') : button.closest('.notebook-group')?.querySelector(':scope > ul');
    if (content)
      animate(
        content,
        [
          { opacity: 0.5, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 180 },
      );
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    release();
    for (const animation of [...animations]) animation.cancel();
  });
  media.addEventListener('change', () => {
    release();
    if (media.matches) for (const animation of [...animations]) animation.cancel();
    positionIndicator();
  });
});
