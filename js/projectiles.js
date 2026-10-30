// Heavy enemy ordnance from ground vehicles: lobbed mortar airbursts, tank
// cannon shells with a big proximity blast, and wave-path homing missiles.
// All the look comes from particles, glow sprites and AOE effects.
import { PLAYER, VEHICLES as V, WINGMAN } from './config.js';
import { TAU, rand, clamp, angleDiff, segDist2 } from './utils.js';

export const HEAVY = new Set(['mortar', 'shell', 'wave']);

const SMOKE = '#4a3d4f';
const CONTRAIL = '#d9d2e6';

/**
 * Area-of-effect explosion. Harmful blasts kill the player / wingmen inside the
 * radius unless a purple or gold shield is up (a cyan shield doesn't stop blasts).
 */
export function blast(g, x, y, R, color, harmful) {
  const P = g.particles;
  P.add('glow', x, y, 0, 0, 0.16, R * 1.7, '#ffffff');
  P.add('glow', x, y, 0, 0, 0.5, R * 1.15, color);
  P.add('glow', x, y, 0, -20, 0.8, R * 0.7, '#ffd27a');
  P.ring(x, y, color, R * 0.25, R, 0.35, 5);
  P.ring(x, y, '#ffffff', R * 0.15, R * 1.3, 0.22, 2);
  const n = Math.round(R * 0.55);
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(R * 3, R * 8);
    P.add('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.2, 0.45), rand(1.5, 3), i % 3 ? color : '#ffe9b0');
  }
  for (let i = 0; i < Math.round(R / 7); i++) {
    const a = rand(TAU), s = rand(60, 200);
    P.ember(x, y, Math.cos(a) * s, Math.sin(a) * s - 80, rand(0.6, 1.1), rand(2, 3.5), i % 2 ? '#ffb347' : '#ff6a3c');
  }
  for (let i = 0; i < 6; i++) {
    const a = rand(TAU), d = rand(0, R * 0.45);
    P.smoke(x + Math.cos(a) * d, y + Math.sin(a) * d, rand(-20, 20), rand(-40, -10), R * rand(0.25, 0.4), rand(0.9, 1.5), SMOKE);
  }
  g.shake = Math.max(g.shake, R * 0.13);
  g.sfx.play(R > 45 ? 'bigExplode' : 'explode');
  if (!harmful) return;

  const p = g.player;
  if (p.shieldOn && p.shieldTier >= 1) return;
  for (const w of p.wings) {
    if (!w.level || w.invuln > 0) continue;
    if (Math.hypot(w.x - x, w.y - y) < R + WINGMAN.hitRadius) g.wingmanDown(w);
  }
  if (p.alive && p.invuln <= 0 && p.entry <= 0 && Math.hypot(p.x - x, p.y - y) < R + PLAYER.hitRadius) g.killPlayer();
}

/** Harmless pop used when the shield or the player's guns stop a heavy round. */
export function fizzle(g, b) {
  blast(g, b.x, b.y, b.kind === 'shell' ? 30 : 20, b.color, false);
}

function nearPlayer(g, b, r) {
  const p = g.player;
  return p.alive && p.invuln <= 0 && segDist2(p.x, p.y, b.px, b.py, b.x, b.y) < r * r;
}

export function updateHeavy(b, dt, g) {
  b.px = b.x;
  b.py = b.y;
  b.t += dt;
  const P = g.particles;

  if (b.kind === 'mortar') {
    b.vy += V.mortarGravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (Math.random() < 0.4) P.smoke(b.x, b.y, rand(-15, 15), rand(-15, 5), 2.8, 0.55, '#6d5f72');
    if (Math.random() < 0.2) P.add('spark', b.x, b.y, -b.vx * 0.2 + rand(-30, 30), -b.vy * 0.2 + rand(-30, 30), 0.2, 1.5, '#ffb347');
    // Airburst at the fuse time (when it reaches its target) or on proximity.
    if (b.t >= b.fuse || nearPlayer(g, b, 16)) {
      blast(g, b.x, b.y, V.truck.aoe, '#ff9a3c', true);
      b.dead = true;
    }
  } else if (b.kind === 'shell') {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    P.add('glow', b.x - b.vx * 0.012, b.y - b.vy * 0.012, 0, 0, 0.22, 7, '#ffd27a');
    if (Math.random() < 0.35) P.smoke(b.x, b.y, rand(-10, 10), rand(-10, 10), 3.8, 0.7, '#8a7a8e');
    if (b.t >= b.fuse || nearPlayer(g, b, 14)) {
      blast(g, b.x, b.y, V.tank.aoe, '#ff6a3c', true);
      b.dead = true;
    }
  } else if (b.kind === 'wave') {
    const p = g.player;
    if (b.phase === 'boost') {
      // Pop straight up out of the launch rack, slowing as the motor ignites.
      b.vy += (-30 - b.vy) * Math.min(1, dt * 2);
      b.vx += (20 - b.vx) * Math.min(1, dt * 1.5);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.t >= 0.9) {
        b.phase = 'cruise';
        b.bx = b.x;
        b.by = b.y;
        const tx = p.alive ? Math.max(p.x, g.W * V.zone) : b.x + 300, ty = p.alive ? p.y : b.y;
        b.ang = Math.atan2(ty - b.y, tx - b.x);
        b.wave = 0;
        g.sfx.play('missileLaunch');
      }
    } else {
      // Sine-wave path around a slowly homing base line: easy to read, easy to sidestep.
      if (p.alive) {
        const want = Math.atan2(p.y - b.by, Math.max(p.x, g.W * V.zone) - b.bx);
        b.ang += clamp(angleDiff(b.ang, want), -0.45 * dt, 0.45 * dt);
      }
      const dx = Math.cos(b.ang), dy = Math.sin(b.ang);
      b.bx += dx * b.speed * dt;
      b.by += dy * b.speed * dt;
      b.wave += (b.speed * dt * TAU) / b.lambda;
      const off = Math.sin(b.wave) * b.amp;
      b.x = b.bx - dy * off;
      b.y = b.by + dx * off;
      // Missiles never leave the attack zone: they self-destruct at its left edge.
      if (b.bx < g.W * V.zone - 20) {
        blast(g, b.x, b.y, 22, '#ffb03b', true);
        b.dead = true;
        return;
      }
    }
    P.add('glow', b.x - Math.cos(b.dir || -Math.PI / 2) * 6, b.y - Math.sin(b.dir || -Math.PI / 2) * 6, 0, 0, 0.12, 6, '#ffb03b');
    if (Math.random() < 0.4) P.smoke(b.x, b.y, rand(-6, 6), rand(-6, 6), 2.6, 1.1, CONTRAIL);
    const vx = b.x - b.px, vy = b.y - b.py;
    if (vx || vy) b.dir = Math.atan2(vy, vx);
  }

  const W = g.W, H = g.H;
  if ((b.life -= dt) <= 0 || b.x < -120 || b.x > W + 120 || b.y < -700 || b.y > H + 60) {
    if (b.kind === 'wave' && b.life <= 0) fizzle(g, b);
    b.dead = true;
  }
}

export function drawHeavy(ctx, b, x, y, t, sprites) {
  if (b.kind === 'mortar') {
    ctx.drawImage(sprites.glow('#ff9a3c', 6), x - 12, y - 12, 24, 24);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = '#2b2230';
    ctx.fillRect(-5, -2.5, 9, 5);
    ctx.fillStyle = '#ffe2b0';
    ctx.fillRect(3, -1.5, 3, 3);
    ctx.restore();
  } else if (b.kind === 'shell') {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sprites.glow('#ff6a3c', 8), -40, -9, 52, 18);
    ctx.drawImage(sprites.glow('#ffd27a', 5), -26, -5, 34, 10);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-6, -2, 14, 4);
    ctx.restore();
  } else if (b.kind === 'wave') {
    const a = b.dir ?? -Math.PI / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.globalCompositeOperation = 'lighter';
    const fl = 8 + Math.random() * 6;
    ctx.drawImage(sprites.glow('#ffb03b', 4), -8 - fl, -4, fl + 4, 8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#e9e4f2';
    ctx.fillRect(-7, -2, 12, 4);
    ctx.fillStyle = Math.floor(t * 8) % 2 ? '#ff3b5c' : '#ffd0d8';
    ctx.beginPath();
    ctx.moveTo(5, -2);
    ctx.lineTo(9, 0);
    ctx.lineTo(5, 2);
    ctx.fill();
    ctx.fillStyle = '#8d8fa8';
    ctx.fillRect(-7, -4, 3, 8);
    ctx.restore();
  }
}

/** Ground-truth warnings drawn over the action: impact reticles and missile path previews. */
export function drawHeavyWarnings(ctx, b, t) {
  if (b.kind === 'mortar') {
    const k = clamp(b.t / b.fuse, 0, 1), R = V.truck.aoe;
    ctx.save();
    ctx.strokeStyle = `rgba(255,154,60,${0.25 + k * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = t * 30;
    ctx.beginPath();
    ctx.arc(b.tx, b.ty, R, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // Inner disc grows to the full radius as the shell arrives.
    ctx.fillStyle = `rgba(255,154,60,${0.08 + k * 0.14})`;
    ctx.beginPath();
    ctx.arc(b.tx, b.ty, R * k, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (b.kind === 'shell') {
    drawCrosshair(ctx, b.tx, b.ty, V.tank.aoe, t, true);
  } else if (b.kind === 'wave' && b.phase === 'cruise') {
    // Dotted preview of the path ahead.
    const dx = Math.cos(b.ang), dy = Math.sin(b.ang);
    ctx.fillStyle = '#ffb03b';
    for (let k = 1; k <= 16; k++) {
      const s = k * 16;
      const off = Math.sin(b.wave + (s * TAU) / b.lambda) * b.amp;
      ctx.globalAlpha = 0.45 * (1 - k / 17);
      ctx.beginPath();
      ctx.arc(b.bx + dx * s - dy * off, b.by + dy * s + dx * off, 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** Red bracket crosshair + blast radius, used for tank aim and its shell in flight. */
export function drawCrosshair(ctx, x, y, R, t, locked) {
  ctx.save();
  ctx.translate(x, y);
  const flash = locked && Math.floor(t * 20) % 2;
  ctx.strokeStyle = flash ? '#ffffff' : '#ff3b5c';
  ctx.lineWidth = 2;
  ctx.globalAlpha = locked ? 0.95 : 0.6;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.stroke();
  ctx.rotate(t * (locked ? 0 : 1.5));
  const s = 12, g = 6;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(g, -s);
    ctx.lineTo(s, -s);
    ctx.lineTo(s, -g);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,59,92,0.12)';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  ctx.restore();
}

