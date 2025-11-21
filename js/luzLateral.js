// embersFX.js — EdgeFire v2.1 com controle on/off (enable/disable)
(function (global) {
  const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const DPR_MAX = 2;

  // Aparência (igual à versão que você gostou)
  const EDGE_WIDTH_PX = IS_MOBILE ? 28 : 42;
  const COLUMNS_PER_EDGE = IS_MOBILE ? 5 : 8;
  const OPACITY = 0.55;
  const WIND = 10;
  const SPEED = 0.6;
  const SPARKS_MAX = IS_MOBILE ? 2 : 4;

  // Hotspots desativados (mantém o look anterior)
  const HOTSPOTS_ENABLED = false;

  // Estado interno
  let cvs = null,
    ctx = null;
  let dpr = 1,
    W = 0,
    H = 0;
  let last = 0,
    t = 0;
  let running = false; // loop ativo?
  let rafId = null; // id do RAF
  const sparks = [];

  // utils
  const rand = (a, b) => Math.random() * (b - a) + a;
  const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
  function sNoise(x, seed = 0) {
    return Math.sin(x * 1.27 + seed) * 0.6 + Math.sin(x * 0.73 + seed * 1.9) * 0.4;
  }
  function fireColor(p, aMul = 1) {
    const r = Math.floor(clamp(255 * (0.93 + 0.07 * (1 - p)), 0, 255));
    const g = Math.floor(clamp(170 * (0.55 + 0.8 * (1 - p)), 0, 255));
    const b = Math.floor(clamp(30 * (0.25 + 0.2 * (1 - p)), 0, 255));
    const a = clamp(OPACITY * (0.95 - p * 0.75) * aMul, 0, 1);
    return `rgba(${r},${g},${b},${a})`;
  }

  // Canvas
  function ensureCanvas() {
    if (cvs && ctx) return;
    cvs = document.getElementById('fx-embers');
    if (!cvs) {
      cvs = document.createElement('canvas');
      cvs.id = 'fx-embers';
      cvs.style.position = 'fixed';
      cvs.style.inset = '0';
      cvs.style.pointerEvents = 'none';
      cvs.style.zIndex = '0';
      cvs.style.mixBlendMode = 'screen'; // deixa bonito no tema escuro
      document.body.appendChild(cvs);
    }
    ctx = cvs.getContext('2d', { alpha: true });
    resize();
    window.addEventListener('resize', resize, { passive: true });
  }

  function dropCanvas() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    running = false;
    if (ctx && cvs) {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
    }
    if (cvs && cvs.parentNode) {
      cvs.parentNode.removeChild(cvs);
    }
    cvs = null;
    ctx = null;
    window.removeEventListener('resize', resize);
  }

  function resize() {
    if (!cvs) return;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    W = Math.floor(innerWidth * dpr);
    H = Math.floor(innerHeight * dpr);
    cvs.width = W;
    cvs.height = H;
    cvs.style.width = W / dpr + 'px';
    cvs.style.height = H / dpr + 'px';
  }

  // desenho
  function drawEdgeGlow(side) {
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(side < 0 ? 0 : W, 0, side < 0 ? EDGE_WIDTH_PX * dpr * 1.8 : W - EDGE_WIDTH_PX * dpr * 1.8, 0);
    grad.addColorStop(0.0, 'rgba(255,160,30,0.14)');
    grad.addColorStop(0.55, 'rgba(255,130,10,0.10)');
    grad.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    if (side < 0) ctx.fillRect(0, 0, EDGE_WIDTH_PX * dpr * 1.9, H);
    else ctx.fillRect(W - EDGE_WIDTH_PX * dpr * 1.9, 0, EDGE_WIDTH_PX * dpr * 1.9, H);
  }
  function drawEdgeFlames(side) {
    const baseX = side < 0 ? EDGE_WIDTH_PX * 0.35 * dpr : W - EDGE_WIDTH_PX * 0.35 * dpr;
    const inward = side < 0 ? +1 : -1;
    const colW = (EDGE_WIDTH_PX * dpr * 0.75) / COLUMNS_PER_EDGE;
    const steps = 10;
    for (let i = 0; i < COLUMNS_PER_EDGE; i++) {
      const seed = (i + 1) * 3.19 + (side < 0 ? 7.1 : 4.6);
      const width = colW * (1 + Math.sin((i + 1) * 1.5) * 0.15);
      const wobbleAmp = (4 + i * 0.4) * dpr;

      const leftPts = [],
        rightPts = [];
      for (let s = 0; s <= steps; s++) {
        const p = s / steps,
          y = p * H;
        const n = sNoise(p * 4 + t * SPEED, seed);
        const wind = 10 * dpr * Math.sin(t * 0.6 + seed * 0.4);
        const cx = baseX + inward * (2 * dpr + i * width * 0.35) + n * wobbleAmp + wind * 0.06 * (1 - Math.abs(0.5 - p));
        const h = width * (1.15 - Math.abs(p - 0.5));
        leftPts.push({ x: cx - h * 0.6, y });
        rightPts.push({ x: cx + h * 0.6, y });
      }

      const g = ctx.createLinearGradient(leftPts[0].x, 0, rightPts[steps].x, H);
      g.addColorStop(0.0, fireColor(0.0, 0.9));
      g.addColorStop(0.35, fireColor(0.35, 0.9));
      g.addColorStop(0.7, fireColor(0.7, 0.75));
      g.addColorStop(1.0, fireColor(1.0, 0.55));

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(leftPts[0].x, leftPts[0].y);
      for (let s = 1; s <= steps; s++) {
        const a = leftPts[s - 1],
          b = leftPts[s];
        const cx = (a.x + b.x) / 2,
          cy = (a.y + b.y) / 2;
        ctx.quadraticCurveTo(a.x, a.y, cx, cy);
      }
      for (let s = steps; s >= 1; s--) {
        const a = rightPts[s],
          b = rightPts[s - 1];
        const cx = (a.x + b.x) / 2,
          cy = (a.y + b.y) / 2;
        ctx.quadraticCurveTo(a.x, a.y, cx, cy);
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,230,170,0.15)';
      ctx.lineWidth = 1.1 * dpr;
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const mx = (leftPts[s].x + rightPts[s].x) / 2,
          my = leftPts[s].y;
        if (!s) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      }
      ctx.stroke();
    }
  }

  // faíscas
  function spawnSpark() {
    if (sparks.length >= SPARKS_MAX) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side < 0 ? rand(4 * dpr, EDGE_WIDTH_PX * dpr) : rand(W - EDGE_WIDTH_PX * dpr, W - 4 * dpr);
    const y = rand(0, H);
    const spd = rand(60, 110) * dpr;
    const ang = side < 0 ? rand(-5, 25) : rand(155, 185);
    const rad = (ang * Math.PI) / 180;
    sparks.push({ x, y, vx: Math.cos(rad) * spd, vy: Math.sin(rad) * spd, life: rand(0.18, 0.3), age: 0, size: rand(1.1, 1.8) * dpr });
  }
  function update(dt) {
    t += dt;
    if (Math.random() < (IS_MOBILE ? 0.015 : 0.03)) spawnSpark();
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy -= 24 * dpr * dt;
      if (s.age >= s.life) sparks.splice(i, 1);
    }
  }
  function render() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    drawEdgeGlow(-1);
    drawEdgeGlow(+1);
    drawEdgeFlames(-1);
    drawEdgeFlames(+1);

    ctx.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      const k = 1 - s.age / s.life;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,230,140,${0.85 * k})`;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.012, s.y - s.vy * 0.012);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,250,220,${0.9 * k})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(ts) {
    if (!running) return;
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    update(dt);
    render();
    rafId = requestAnimationFrame(loop);
  }

  // API pública
  const EdgeFire = {
    enable() {
      if (running) return;
      ensureCanvas();
      running = true;
      last = 0;
      rafId = requestAnimationFrame(loop);
      document.addEventListener('visibilitychange', onVis, false);
    },
    disable() {
      if (!running && !cvs) return;
      document.removeEventListener('visibilitychange', onVis, false);
      dropCanvas();
    },
  };
  function onVis() {
    if (document.hidden) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    } else if (running) {
      last = 0;
      rafId = requestAnimationFrame(loop);
    }
  }

  // expõe
  global.EdgeFire = EdgeFire;
})(window);
