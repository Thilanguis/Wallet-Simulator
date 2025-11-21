/* =================================================================== */
/* SPLASH SCREEN                             */
/* =================================================================== */

(function () {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const skipBtn = splash.querySelector('.splash-skip');
  const hide = () => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 650);
  };
  window.addEventListener('load', () => setTimeout(hide, 5200));
  skipBtn && skipBtn.addEventListener('click', hide);
  splash.addEventListener('click', (e) => {
    if (e.target === splash) hide();
  });
})();

(function enhanceSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const card = splash.querySelector('.splash-card');
  const particles = splash.querySelector('.splash-particles');
  const symbols = ['$', '€', '¥', '£', '₿', '¢', '₩', '₹', '%'];
  const count = 28;

  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'p';
    s.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    const delay = (Math.random() * 3).toFixed(2) + 's';
    const dur = (4 + Math.random() * 3).toFixed(2) + 's';
    const x = (Math.random() * 240 - 120).toFixed(0) + 'px';
    const rot = (Math.random() * 120 - 60).toFixed(0) + 'deg';
    s.style.setProperty('--delay', delay);
    s.style.setProperty('--dur', dur);
    s.style.setProperty('--x', x);
    s.style.setProperty('--rot', rot);
    s.style.left = 40 + Math.random() * 20 + '%';
    s.style.bottom = '-10%';
    s.style.fontSize = (14 + Math.random() * 12).toFixed(0) + 'px';
    particles.appendChild(s);
  }

  function createParticle(x, y, hue) {
    const p = document.createElement('div');
    p.className = 'fire-particle';
    const sat = 89; // Saturação
    const light = 40; // Brilho
    p.style.background = `hsl(${hue} ${sat}% ${light}%)`;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    document.body.appendChild(p);
    return p;
  }

  function handleMove(e) {
    const r = card.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) / (r.width / 2);
    const dy = (e.clientY - cy) / (r.height / 2);
    const maxTilt = 6;
    const rx = (dy * -maxTilt).toFixed(2);
    const ry = (dx * maxTilt).toFixed(2);
    card.classList.add('tilt');
    card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }
  function resetTilt() {
    card.classList.remove('tilt');
    card.style.transform = '';
  }
  splash.addEventListener('mousemove', handleMove);
  splash.addEventListener('mouseleave', resetTilt);
})();

const titulo = document.querySelector('#simuladorTitulo');
const letras = titulo.textContent.split('');

// Envolvendo cada letra em um span
titulo.innerHTML = letras.map((l) => `<span>${l}</span>`).join('');

function flickerAndSpark() {
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
      setTimeout(() => {
        span.style.opacity = 1;
      }, 100 + Math.random() * 300);
    }
  });

  setTimeout(flickerAndSpark, 400 + Math.random() * 600);
}

const bonusCheckbox = document.getElementById('bonusEspecialCheckbox');

function updateTituloColor() {
  const spans = titulo.querySelectorAll('span');
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

// Inicia efeito
flickerAndSpark();
