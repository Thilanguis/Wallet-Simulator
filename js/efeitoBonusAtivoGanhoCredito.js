// === efeitoBonusAtivoGanhoCredito.js ===
// Ativa partículas douradas no fundo (fora do site) e dentro de cada .section
// SOMENTE quando #bonusEspecialCheckbox estiver marcado.
// Também controla o estado global de bônus de GANHO (+15%) e chama updateBonusEspecialUI.

(function () {
  var DEFAULT_MULT = 1.15; // +15%

  // Se já existir uma constante global, respeita; senão assume 1.15
  if (typeof window.BONUS_ESPECIAL_MULTIPLIER !== 'number') {
    window.BONUS_ESPECIAL_MULTIPLIER = DEFAULT_MULT;
  }

  var BONUS_KEY = 'bonusEspecialAtivo';

  // Estado inicial do checkbox:
  // se ainda não existir, começa como false.
  // O valor real pode ser ajustado depois pelo Firestore (onUserStateChange em appMain.js).
  if (typeof window.bonusEspecialAtivo === 'undefined') {
    window.bonusEspecialAtivo = false;
  }

  var sections = [];
  var intervalBlocks = null;
  var intervalGlobal = null;

  function spawnGlobalGlow() {
    var el = document.createElement('div');
    el.className = 'money-glow global';
    if (Math.random() < 0.18) el.classList.add('purple');
    el.style.setProperty('--x', Math.random() * 100);
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 6000);
  }

  function spawnBlockGlow() {
    sections.forEach(function (sec) {
      if (!sec.classList.contains('bonus-inner-glow')) return;
      if (Math.random() > 0.5) return;
      var el = document.createElement('div');
      el.className = 'money-glow block';
      if (Math.random() < 0.18) el.classList.add('purple');
      el.style.setProperty('--x', Math.random() * 100);
      sec.appendChild(el);
      setTimeout(function () {
        el.remove();
      }, 6000);
    });
  }

  function startGlowEffect() {
    if (intervalGlobal || intervalBlocks) return;
    document.body.classList.add('bonus-bg-glow');
    sections.forEach(function (sec) {
      sec.classList.add('bonus-inner-glow');
    });

    // Se quiser, ativa também partículas no fundo global:
    // intervalGlobal = setInterval(spawnGlobalGlow, 420);

    intervalBlocks = setInterval(spawnBlockGlow, 520);
  }

  function stopGlowEffect() {
    if (intervalGlobal) {
      clearInterval(intervalGlobal);
      intervalGlobal = null;
    }
    if (intervalBlocks) {
      clearInterval(intervalBlocks);
      intervalBlocks = null;
    }
    document.body.classList.remove('bonus-bg-glow');
    sections.forEach(function (sec) {
      sec.classList.remove('bonus-inner-glow');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.money-glow'), function (el) {
      el.remove();
    });
  }

  function syncFire(chk) {
    try {
      if (!window.EdgeFire) return;
      if (chk && chk.checked) window.EdgeFire.enable();
      else window.EdgeFire.disable();
    } catch (e) {}
  }

  function applyBonusStateToUI(checkbox) {
    window.bonusEspecialAtivo = !!(checkbox && checkbox.checked);

    if (typeof window.updateBonusEspecialUI === 'function') {
      window.updateBonusEspecialUI();
    }
  }

  function init() {
    var checkbox = document.getElementById('bonusEspecialCheckbox');
    sections = Array.prototype.slice.call(document.querySelectorAll('.section'));

    if (!checkbox) return;

    // reflete estado salvo
    checkbox.checked = !!window.bonusEspecialAtivo;

    syncFire(checkbox);

    function handleToggle() {
      applyBonusStateToUI(checkbox);
      if (checkbox.checked) startGlowEffect();
      else stopGlowEffect();
    }

    // Inicial
    handleToggle();

    // Mudanças
    checkbox.addEventListener('change', function () {
      syncFire(checkbox);
      handleToggle();
    });

    // Limpa quando sai da página
    window.addEventListener('pagehide', stopGlowEffect, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
