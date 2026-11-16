/* Animação do título do Wallet. A tela de carregamento foi removida. */
const titulo = document.querySelector('#simuladorTitulo');
const letras = titulo.textContent.split('');

// Envolvendo cada letra em um span
titulo.innerHTML = letras.map((l) => `<span>${l}</span>`).join('');

const titleMotion = matchMedia('(prefers-reduced-motion: reduce)');
let titleFlickerTimeout = null;
function pauseTitleMotion() {
  clearTimeout(titleFlickerTimeout); titleFlickerTimeout = null;
  titulo.querySelectorAll('.spark').forEach(spark => spark.remove());
  titulo.querySelectorAll('span').forEach(span => { span.style.opacity = '1'; });
}
function flickerAndSpark() {
  clearTimeout(titleFlickerTimeout); titleFlickerTimeout = null;
  if (document.hidden || titleMotion.matches) return;
  const spans = titulo.querySelectorAll('span');
  const chance = 0.07; // 7% de chance por ciclo de falha
  spans.forEach((span) => {
    if (Math.random() < chance) {
      // Falha da letra
      span.style.opacity = 0.2 + Math.random() * 0.3;

      // Cria faíscas da letra que falhou
      for (let i = 0; i < 2; i++) {
        // 1 ou 2 faíscas por letra
        const sparkEl = document.createElement('div');
        sparkEl.classList.add('spark');

        const rect = span.getBoundingClientRect();
        const parentRect = titulo.getBoundingClientRect();
        const x = rect.left - parentRect.left + Math.random() * rect.width;
        const y = rect.top - parentRect.top + Math.random() * rect.height;
        const moveX = (Math.random() - 0.5) * 10 + 'px';
        const moveY = (Math.random() - 0.5) * 10 + 'px';

        sparkEl.style.left = x + 'px';
        sparkEl.style.top = y + 'px';
        sparkEl.style.setProperty('--x', moveX);
        sparkEl.style.setProperty('--y', moveY);

        titulo.appendChild(sparkEl);
        setTimeout(() => sparkEl.remove(), 500);
      }

      // Volta letra ao normal
      setTimeout(
        () => {
          span.style.opacity = 1;
        },
        100 + Math.random() * 300,
      );
    }
  });

  titleFlickerTimeout = setTimeout(flickerAndSpark, 400 + Math.random() * 600);
}

const bonusCheckbox = document.getElementById('bonusEspecialCheckbox');

function updateTituloColor() {
  const spans = titulo.querySelectorAll('span');
  titulo.classList.toggle('bonus-title-active', bonusCheckbox.checked);
  if (bonusCheckbox.checked) {
    spans.forEach((span) => {
      // Aplica gradiente como cor
      span.style.background = 'linear-gradient(160deg, #ffc000 0%, #ffdd33 50%, #ffd700 100%)';
      span.style.webkitBackgroundClip = 'text';
      span.style.webkitTextFillColor = 'transparent';
      span.style.backgroundClip = 'text';
      span.style.textFillColor = 'transparent';
    });
  } else {
    spans.forEach((span) => {
      // Volta ao padrão
      span.style.background = '';
      span.style.webkitBackgroundClip = '';
      span.style.webkitTextFillColor = '';
      span.style.backgroundClip = '';
      span.style.textFillColor = '';
    });
  }
}

// Monitora mudança do checkbox
bonusCheckbox.addEventListener('change', updateTituloColor);

// Inicializa no estado atual do checkbox
updateTituloColor();

function resumeTitleMotion() { pauseTitleMotion(); flickerAndSpark(); }
titleMotion.addEventListener('change', resumeTitleMotion);
document.addEventListener('visibilitychange', resumeTitleMotion);
window.addEventListener('pagehide', pauseTitleMotion);
window.addEventListener('pageshow', resumeTitleMotion);
// Inicia efeito
flickerAndSpark();
