import { Pool, rand, TAU } from './utils.js';

const MAX_PARTICLES = 1500;

export class Particles {
  constructor() {
    this.pool = new Pool(() => ({}));
  }

  clear() {
    this.pool.clear();
  }

  add(type, x, y, vx, vy, life, size, color) {
    if (this.pool.list.length >= MAX_PARTICLES) return null;
    const p = this.pool.spawn();
    p.type = type;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = p.max = life;
    p.size = size;
    p.color = color;
    p.drag = 2.5;
    p.rot = rand(TAU);
    p.vr = rand(-8, 8);
    p.text = '';
    p.r1 = 0;
    p.g = 0;
    return p;
  }

  explosion(x, y, color, scale = 1) {
    const n = Math.round(14 * scale);
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = rand(60, 320) * Math.sqrt(scale);
      this.add('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.6), rand(1.5, 3), color);
    }
    for (let i = 0; i < n * 0.6; i++) {
      const a = rand(TAU), s = rand(30, 180) * Math.sqrt(scale);
      this.add('debris', x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 0.9), rand(2, 4.5) * Math.sqrt(scale), color);
    }
    this.add('glow', x, y, 0, 0, 0.25, 26 * scale, '#ffffff');
    this.ring(x, y, color, 4, 40 * scale, 0.35, 3);
  }

  ring(x, y, color, r0, r1, life, width) {
    const p = this.add('ring', x, y, 0, 0, life, width, color);
    if (p) {
      p.rot = r0;
      p.r1 = r1;
    }
  }

  /** Soft puff that expands and fades (dust, exhaust, contrails). */
  smoke(x, y, vx, vy, size, life, color) {
    const p = this.add('smoke', x, y, vx, vy, life, size, color);
    if (p) p.drag = 1.6;
    return p;
  }

  /** Glowing ember / shrapnel chunk that falls under gravity. */
  ember(x, y, vx, vy, life, size, color) {
    const p = this.add('debris', x, y, vx, vy, life, size, color);
    if (p) {
      p.g = 420;
      p.drag = 0.8;
    }
    return p;
  }

  hit(x, y, color) {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + rand(-1.1, 1.1), s = rand(80, 240);
      this.add('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.1, 0.22), 1.5, color);
    }
  }

  muzzle(x, y) {
    this.add('glow', x, y, 0, 0, 0.05, 9, '#9ff3ff');
  }

  trail(x, y, color) {
    this.add('glow', x + rand(-3, 3), y + rand(-3, 3), rand(-20, 20), rand(-20, 20), 0.25, 7, color);
  }

  text(x, y, str, color = '#ffffff', size = 14) {
    const p = this.add('text', x, y, 0, -45, 0.9, size, color);
    if (p) p.text = str;
  }

  update(dt) {
    for (const p of this.pool.list) {
      p.life -= dt;
      if (p.life <= 0) {
        p.dead = true;
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.pool.sweep();
  }

  render(ctx, sprites) {
    const list = this.pool.list;
    // Pass 1: solid particles.
    for (const p of list) {
      const t = p.life / p.max;
      if (p.type === 'smoke') {
        ctx.globalAlpha = 0.42 * t;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - t) * 1.6), 0, TAU);
        ctx.fill();
      } else if (p.type === 'debris') {
        ctx.globalAlpha = Math.min(1, t * 1.5);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.type === 'ring') {
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * t + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.rot + (p.r1 - p.rot) * (1 - t * t), 0, TAU);
        ctx.stroke();
      } else if (p.type === 'text') {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.font = `700 ${p.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      }
    }
    // Pass 2: additive glows.
    ctx.globalCompositeOperation = 'lighter';
    for (const p of list) {
      const t = p.life / p.max;
      if (p.type === 'spark') {
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else if (p.type === 'glow') {
        ctx.globalAlpha = t;
        const s = p.size * (1.4 - t * 0.4);
        ctx.drawImage(sprites.glow(p.color, s / 2), p.x - s, p.y - s, s * 2, s * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
