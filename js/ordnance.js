// Physics ordnance for the enemies introduced after each mothership battle:
// terrain-bouncing balls, fission cores that split with conserved momentum,
// gravity wells that pull the ship and bend bullets, and slung flail maces.
import { SCROLL_SPEED } from './config.js';
import { TAU, rand, clamp, hexToRgba } from './utils.js';

export const ORDNANCE = new Set(['ball', 'fission', 'well', 'mace']);
export const ORDNANCE_R = { ball: 7, fission: 9, well: 10, mace: 8 };

// Bouncer balls: gravity, restitution off the real terrain (using its slope)
// and off the top of the screen. Friction against the scrolling ground drags
// them toward the ground's own speed.
export const BALL = { gravity: 520, restitution: 0.82, friction: 0.88, hp: 2, color: '#b6ff3b' };

// Fission cores split in two (equal and opposite sideways kicks, so momentum
// is conserved), then each half splits once more: 1 -> 2 -> 4.
export const FISSION = { speed: 150, fuse: [1.0, 1.25], childFuse: 0.75, kick: 110, gens: 2,
  hp: [3, 1, 1], r: [9, 6.5, 4.5], color: '#e6ecff' };

// Gravity wells: launched toward the player, drag brings them to a slow drift,
// then they switch on. Bullets feel a softened inverse-square pull; the ship is
// carried by a capped "current" so it can always fly out (340 > 150).
export const WELL = { max: 3, launch: 430, drag: 1.8, drift: -35, life: 4.2, ramp: 0.5,
  range: 260, soft: 40, playerK: 1.3e6, playerMax: 150, bulletGM: 5e6, core: 12, color: '#6b7bff' };

// Released flail maces fly with the momentum they had on the chain.
export const MACE = { gravity: 180, restitution: 0.35, friction: 0.7, hp: 4, color: '#c9b8a6' };

/** Bounce a ball-like round off the terrain (moving at the scroll speed) and the screen top. */
function bounce(b, g, e, mu) {
  const r = b.r;
  if (b.y - r < 0 && b.vy < 0) {
    b.y = r;
    b.vy = -b.vy * e;
  }
  const gy = g.bg.groundY(b.x, g.scroll);
  if (b.y + r <= gy) return false;
  // Surface normal from the local slope (y grows downward).
  const s = (g.bg.groundY(b.x + 3, g.scroll) - g.bg.groundY(b.x - 3, g.scroll)) / 6;
  const inv = 1 / Math.hypot(s, 1), nx = s * inv, ny = -inv;
  // Work in the ground's frame: it slides left at the scroll speed.
  const rvx = b.vx + SCROLL_SPEED, rvy = b.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const tx = rvx - vn * nx, ty = rvy - vn * ny;
    b.vx = tx * mu - vn * e * nx - SCROLL_SPEED;
    b.vy = ty * mu - vn * e * ny;
  }
  b.y = gy - r;
  return vn < -40;
}

export function lobBall(g, e) {
  const p = g.player;
  const b = g.fireEnemy('ball', e.x - 8, e.y, 0, 0, BALL.color);
  if (!b) return;
  // Lobbed up and toward the player; gravity and bounces do the rest.
  b.vx = clamp((p.x - e.x) / 2.6, -240, -70) * g.difficulty.speed + rand(-20, 20);
  b.vy = -rand(150, 260);
  b.hp = BALL.hp;
  b.life = 9;
  g.sfx.play('enemyShot');
}

function setGen(b, gen) {
  b.gen = gen;
  b.r = FISSION.r[gen];
  b.hp = FISSION.hp[gen];
  b.t = 0;
  b.fuse = gen === 0 ? rand(FISSION.fuse[0], FISSION.fuse[1]) : FISSION.childFuse;
  b.life = 9;
}

export function fireFission(g, x, y, ang) {
  const b = g.fireEnemy('fission', x, y, ang, FISSION.speed * g.difficulty.speed, FISSION.color);
  if (b) setGen(b, 0);
  g.sfx.play('enemyShot');
}

/** Split a core in two. Returns false (and just removes it) once it's the last generation. */
export function splitFission(g, b) {
  b.dead = true;
  if (b.gen >= FISSION.gens) return false;
  const sp = Math.hypot(b.vx, b.vy) || 1;
  const nx = -b.vy / sp, ny = b.vx / sp, k = FISSION.kick * g.difficulty.speed;
  for (const s of [-1, 1]) {
    const c = g.fireEnemy('fission', b.x, b.y, 0, 0, b.color);
    if (!c) continue;
    c.vx = b.vx + nx * k * s;
    c.vy = b.vy + ny * k * s;
    setGen(c, b.gen + 1);
  }
  g.particles.add('glow', b.x, b.y, 0, 0, 0.15, b.r * 4, '#ffffff');
  g.particles.ring(b.x, b.y, b.color, 2, b.r * 3, 0.2, 2);
  g.sfx.play('split');
  return true;
}

export function launchWell(g, e) {
  const p = g.player;
  const b = g.fireEnemy('well', e.x - 10, e.y, Math.atan2(p.y - e.y, p.x - e.x), WELL.launch, WELL.color);
  if (!b) return;
  b.power = 0;
  b.active = false;
  b.life = 12;
  g.sfx.play('charge');
}

export function countWells(g) {
  let n = 0;
  for (const b of g.eBullets.list) if (!b.dead && b.kind === 'well') n++;
  return n;
}

export function slingMace(g, x, y, vx, vy) {
  const b = g.fireEnemy('mace', x, y, 0, 0, MACE.color);
  if (!b) return;
  b.vx = vx;
  b.vy = vy;
  b.hp = MACE.hp;
  b.life = 6;
  b.spin = 0;
}

export function updateOrdnance(b, dt, g) {
  b.px = b.x;
  b.py = b.y;
  b.t += dt;
  switch (b.kind) {
    case 'ball':
      b.vy += BALL.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (bounce(b, g, BALL.restitution, BALL.friction)) g.sfx.play('bounce');
      break;
    case 'fission':
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.t >= b.fuse && b.gen < FISSION.gens) {
        splitFission(g, b);
        return;
      }
      break;
    case 'well': {
      // Linear drag settles it into a slow drift, then the field switches on.
      const k = 1 - Math.exp(-WELL.drag * dt);
      b.vx += (WELL.drift - b.vx) * k;
      b.vy -= b.vy * k;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (!b.active && Math.hypot(b.vx - WELL.drift, b.vy) < 60) {
        b.active = true;
        b.t = 0;
        g.sfx.play('well');
      }
      if (b.active) {
        const left = WELL.life - b.t;
        b.power = clamp(Math.min(b.t, left) / WELL.ramp, 0, 1);
        if (left <= 0) {
          b.dead = true;
          g.particles.ring(b.x, b.y, WELL.color, WELL.range * 0.4, 4, 0.3, 3);
          return;
        }
      }
      break;
    }
    case 'mace':
      b.vy += MACE.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.spin += Math.hypot(b.vx, b.vy) * dt * 0.05;
      if (bounce(b, g, MACE.restitution, MACE.friction)) {
        g.sfx.play('bounce');
        g.shake = Math.max(g.shake, 3);
      }
      break;
  }
  if ((b.life -= dt) <= 0 || b.x < -60 || b.x > g.W + 80 || b.y > g.H + 60 || b.y < -400) b.dead = true;
}

/**
 * Active wells pull every free-flying round with a softened inverse-square
 * acceleration (the player's bullets too) and swallow anything reaching the core.
 */
export function applyWells(g, dt) {
  const wells = [];
  for (const b of g.eBullets.list) if (!b.dead && b.kind === 'well' && b.power > 0) wells.push(b);
  if (!wells.length) return;
  const R2 = WELL.range * WELL.range * 4, s2 = WELL.soft * WELL.soft, core2 = WELL.core * WELL.core;
  const pull = (o) => {
    for (const w of wells) {
      const dx = w.x - o.x, dy = w.y - o.y, d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      if (d2 < core2) {
        o.dead = true;
        g.particles.add('glow', w.x, w.y, 0, 0, 0.12, 10, WELL.color);
        return;
      }
      const a = (WELL.bulletGM * w.power) / (d2 + s2), d = Math.sqrt(d2);
      o.vx += (dx / d) * a * dt;
      o.vy += (dy / d) * a * dt;
    }
  };
  for (const b of g.eBullets.list) {
    if (b.dead || b.kind === 'well' || b.kind === 'mortar' || b.kind === 'shell' || b.kind === 'wave') continue;
    pull(b);
  }
  for (const b of g.pBullets.list) if (!b.dead) pull(b);
}

/** The "current" an active well drags the ship with (units/s), capped so it can always escape. */
export function wellPull(g, x, y) {
  let vx = 0, vy = 0;
  for (const w of g.eBullets.list) {
    if (w.dead || w.kind !== 'well' || !(w.power > 0)) continue;
    const dx = w.x - x, dy = w.y - y, d2 = dx * dx + dy * dy;
    if (d2 > WELL.range * WELL.range) continue;
    const d = Math.sqrt(d2) || 1;
    const v = Math.min((WELL.playerK * w.power) / (d2 + WELL.soft * WELL.soft), WELL.playerMax);
    vx += (dx / d) * v;
    vy += (dy / d) * v;
  }
  const v = Math.hypot(vx, vy);
  if (v > WELL.playerMax) {
    vx *= WELL.playerMax / v;
    vy *= WELL.playerMax / v;
  }
  return [vx, vy];
}

export function drawOrdnance(ctx, b, x, y, t, sprites) {
  switch (b.kind) {
    case 'ball':
    case 'mace': {
      ctx.drawImage(sprites.glow(b.color, b.r), x - b.r * 2, y - b.r * 2, b.r * 4, b.r * 4);
      ctx.fillStyle = b.kind === 'ball' ? b.color : '#6e625a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (b.kind === 'mace') drawSpikes(ctx, x, y, b.r, b.spin);
      break;
    }
    case 'fission': {
      // Swells and flickers as the split approaches.
      const k = b.gen < FISSION.gens ? clamp(b.t / b.fuse, 0, 1) : 0;
      const r = b.r * (1 + k * 0.35 * (0.5 + 0.5 * Math.sin(t * 40)));
      ctx.drawImage(sprites.glow(b.color, r), x - r * 2, y - r * 2, r * 4, r * 4);
      ctx.fillStyle = k > 0.75 && Math.floor(t * 30) % 2 ? '#ff5c8a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.6, 0, TAU);
      ctx.fill();
      break;
    }
    case 'well': {
      const pw = b.power || 0;
      if (pw > 0) {
        // Field boundary plus rings sliding inward to show the pull.
        ctx.strokeStyle = hexToRgba(WELL.color, 0.18 * pw);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, WELL.range, 0, TAU);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const f = 1 - ((t * 0.7 + i / 3) % 1);
          ctx.strokeStyle = hexToRgba(WELL.color, 0.35 * pw * (1 - f));
          ctx.beginPath();
          ctx.arc(x, y, WELL.core + f * (WELL.range - WELL.core), 0, TAU);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#05040c';
      ctx.strokeStyle = pw > 0 ? '#c9d0ff' : WELL.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
}

export function drawSpikes(ctx, x, y, r, rot) {
  ctx.strokeStyle = '#e8e0d8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rot + (i * TAU) / 6;
    ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
  }
  ctx.stroke();
}
