// rainMoneySmoothSmoke.js — Chuva de dinheiro com fumaça suave realista
class RainMoney {
  constructor(emoji = '💵', intensity = 'med') {
    this.emoji = emoji;
    this.intensityLevels = { low: 10, med: 25, high: 45 };
    this.num = this.intensityLevels[intensity] || 45;
    this.fallingEmojis = [];
    this.smokeParticles = [];
    this.container = document.createElement('div');

    this.stopped = false;
    this.animationFrameId = null;
    this.isBurning = false;

    // container principal
    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    this.container.style.overflow = 'hidden';
    this.container.style.zIndex = '999';
    document.body.appendChild(this.container);

    this.createEmojis();
    this.animate();
    window.addEventListener('resize', () => this.onResize());
  }

  createEmojis() {
    for (let i = 0; i < this.num; i++) {
      const span = document.createElement('span');
      span.innerText = this.emoji;
      span.style.position = 'absolute';
      span.style.top = `${Math.random() * window.innerHeight}px`;
      span.style.left = `${Math.random() * window.innerWidth}px`;
      span.style.fontSize = `${Math.random() * 16 + 12}px`;
      span.style.opacity = Math.random() * 0.5 + 0.3;
      span.style.pointerEvents = 'none';
      span.style.userSelect = 'none';
      span.style.transform = `rotate(${Math.random() * 360}deg)`;
      span.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out, font-size 0.5s ease-out';
      this.container.appendChild(span);

      this.fallingEmojis.push({
        el: span,
        x: parseFloat(span.style.left),
        y: parseFloat(span.style.top),
        speed: Math.random() * 1 + 0.5,
        rotation: Math.random() * 0.6 - 0.3,
        burnSpeedX: (Math.random() - 0.5) * 2, // menos explosivo
        burnSpeedY: -(Math.random() * 1 + 0.2), // sobe pouco
        burnOpacity: parseFloat(span.style.opacity),
      });
    }
  }

  spawnSmoke(x, y) {
    const s = document.createElement('div');
    s.style.position = 'absolute';
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    const size = Math.random() * 12 + 8;
    s.style.width = `${size}px`;
    s.style.height = `${size}px`;
    s.style.borderRadius = '50%';
    s.style.background = 'radial-gradient(circle, rgba(180,180,180,0.4) 0%, rgba(180,180,180,0) 70%)';
    s.style.pointerEvents = 'none';
    s.style.userSelect = 'none';
    s.style.opacity = '0.5';
    s.style.transform = 'scale(1)';
    this.container.appendChild(s);

    this.smokeParticles.push({
      el: s,
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5, // dispersão horizontal suave
      vy: -(Math.random() * 0.3 + 0.1), // sobe pouco
      scale: 1,
      opacity: 0.5,
      lifetime: 1,
    });
  }

  animate() {
    if (this.stopped) return;

    // anima moedas
    this.fallingEmojis.forEach((obj) => {
      if (!this.isBurning) {
        obj.y += obj.speed;
        obj.x += obj.rotation * 2;
        if (obj.y > window.innerHeight) obj.y = -20;
        if (obj.x > window.innerWidth) obj.x = -20;
        if (obj.x < -20) obj.x = window.innerWidth;
        obj.el.style.top = obj.y + 'px';
        obj.el.style.left = obj.x + 'px';
        obj.el.style.transform = `rotate(${obj.y * 2 + Math.sin(obj.x) * 5}deg)`;
      } else {
        obj.x += obj.burnSpeedX;
        obj.y += obj.burnSpeedY;
        obj.burnOpacity -= 0.015;
        obj.el.style.top = obj.y + 'px';
        obj.el.style.left = obj.x + 'px';
        obj.el.style.opacity = Math.max(0, obj.burnOpacity);
        const currentSize = parseFloat(obj.el.style.fontSize) || 14;
        obj.el.style.fontSize = `${currentSize * 0.985}px`;
        obj.el.style.transform = `rotate(${obj.y * 2 + Math.sin(obj.x * 2) * 10}deg)`;

        if (Math.random() < 0.25) {
          this.spawnSmoke(obj.x + (Math.random() - 0.5) * 10, obj.y + (Math.random() - 0.5) * 10);
        }
      }
    });

    // anima fumaça suave
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];

      p.x += p.vx + Math.sin(p.y * 0.02) * 0.2; // leve ondulação horizontal
      p.y += p.vy + Math.cos(p.x * 0.02) * 0.1; // leve ondulação vertical
      p.scale += 0.002; // crescimento suave
      p.opacity -= 0.003; // desaparecimento lento
      p.lifetime -= 0.005;

      p.el.style.left = p.x + 'px';
      p.el.style.top = p.y + 'px';
      p.el.style.opacity = Math.max(0, p.opacity);
      p.el.style.transform = `scale(${p.scale})`;

      if (p.opacity <= 0.03 || p.lifetime <= 0) {
        p.el.remove();
        this.smokeParticles.splice(i, 1);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
  }

  setIntensity(level = 'low') {
    let num = this.intensityLevels[level] || 10;
    this.fallingEmojis.forEach((obj) => obj.el.remove());
    this.fallingEmojis = [];
    this.num = num;
    this.createEmojis();
  }

  onResize() {
    this.fallingEmojis.forEach((obj) => {
      obj.x = Math.random() * window.innerWidth;
      obj.y = Math.random() * window.innerHeight;
    });
  }

  startBurningEffect(delayBeforeBurn = 3000, burnEmoji = '🔥', burnDuration = 3000) {
    setTimeout(() => {
      this.isBurning = true;

      this.fallingEmojis.forEach((obj) => {
        obj.el.innerText = burnEmoji;
        obj.burnOpacity = Math.random() * 0.7 + 0.3;
        obj.el.style.opacity = obj.burnOpacity;
      });

      setTimeout(() => {
        this.stopped = true;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

        this.fallingEmojis.forEach((obj) => {
          obj.el.style.transition = 'opacity 1s ease-out, transform 1s ease-out';
          obj.el.style.opacity = '0';
          obj.el.style.transform = `scale(0.6) translateY(-10px)`;
          setTimeout(() => {
            if (obj.el && obj.el.parentElement) obj.el.remove();
          }, 1000);
        });

        this.smokeParticles.forEach((p) => {
          p.el.style.transition = 'opacity 1s linear, transform 1s linear';
          p.el.style.opacity = '0';
          setTimeout(() => {
            if (p.el && p.el.parentElement) p.el.remove();
          }, 1000);
        });
        this.smokeParticles = [];

        setTimeout(() => {
          if (this.container && this.container.parentElement) this.container.remove();
        }, 1200);
      }, burnDuration);
    }, delayBeforeBurn);
  }
}
