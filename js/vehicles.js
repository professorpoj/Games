// High-speed ground vehicles. They race in from the left faster than the
// scroll, settle to match it, then fight for position relative to the
// player's X. Every body rides spring/damper suspension over the actual
// terrain profile: bounce, pitch, squat under throttle and recoil kicks.
import { SCROLL_SPEED, VEHICLES as V } from './config.js';
import { TAU, rand, clamp, damp, angleDiff } from './utils.js';
import { drawCrosshair } from './projectiles.js';

const GRAVITY = V.gravity;

/** Rigid body on spring-damper wheels. `y` is the strut-top line; pitch > 0 = nose down. */
class Chassis {
  constructor({ wheels, rest, k, c, inertia, squat }) {
    this.wheels = wheels.map(([lx, r]) => ({ lx, r, y: 0, py: 0, comp: 0, spin: 0, contact: true }));
    this.rest = rest;
    this.k = k;
    this.c = c;
    this.inertia = inertia;
    this.squat = squat;
    this.x = this.px = 0;
    this.y = this.py = 0;
    this.vy = 0;
    this.pitch = this.ppitch = 0;
    this.pv = 0;
  }

  /** Place at static equilibrium so it doesn't drop in bouncing. */
  settle(x, groundY) {
    this.x = this.px = x;
    const n = this.wheels.length, c0 = GRAVITY / (n * this.k);
    let sum = 0;
    for (const w of this.wheels) sum += groundY(x + w.lx) - w.r;
    this.y = this.py = sum / n - this.rest + c0;
    for (const w of this.wheels) {
      w.y = w.py = groundY(x + w.lx) - w.r;
      w.comp = c0;
    }
    this.vy = 0;
    this.pitch = this.ppitch = this.pv = 0;
  }

  /** Move horizontally, remembering the previous x for render interpolation. */
  moveTo(x) {
    this.px = this.x;
    this.x = x;
  }

  /** accel: horizontal acceleration (drives squat/dive); groundSpeed spins the wheels. */
  step(dt, groundY, accel, groundSpeed) {
    this.py = this.y;
    this.ppitch = this.pitch;
    const s = Math.sin(this.pitch), co = Math.cos(this.pitch);
    let F = 0, T = 0;
    for (const w of this.wheels) {
      w.py = w.y;
      const free = this.y + w.lx * s + this.rest;
      const contact = groundY(this.x + w.lx * co) - w.r;
      const comp = free - contact;
      if (comp > 0) {
        const rate = clamp((comp - w.comp) / dt, -400, 400);
        const f = Math.max(0, this.k * comp + this.c * rate);
        F += f;
        T += f * w.lx;
        w.y = contact;
        w.contact = true;
      } else {
        w.y = free;
        w.contact = false;
      }
      w.comp = comp;
      w.spin += (groundSpeed * dt) / w.r;
    }
    this.vy += (GRAVITY - F) * dt;
    this.y += this.vy * dt;
    this.pv += (-T / this.inertia - accel * this.squat) * dt;
    this.pitch = clamp(this.pitch + this.pv * dt, -0.45, 0.45);
  }

  /** World position of a body-local point (interpolated for rendering). */
  point(lx, ly, alpha = 1) {
    const x = this.px + (this.x - this.px) * alpha, y = this.py + (this.y - this.py) * alpha;
    const a = this.ppitch + (this.pitch - this.ppitch) * alpha;
    const c = Math.cos(a), s = Math.sin(a);
    return { x: x + lx * c - ly * s, y: y + lx * s + ly * c };
  }
}

function spring(ctx, x0, y0, x1, y1, coils) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < coils * 2; i++) {
    const t = i / (coils * 2);
    ctx.lineTo(x0 + (x1 - x0) * t + (i % 2 ? 3 : -3), y0 + (y1 - y0) * t);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function wheel(ctx, x, y, r, spin, rim) {
  ctx.fillStyle = '#1a1420';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, TAU);
  ctx.stroke();
  // Spokes show the wheels actually turning with ground speed.
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * TAU) / 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
    ctx.stroke();
  }
}

/** Fill a polygon given in body-local coordinates. */
function bodyPoly(ctx, ch, pts, alpha, fill, stroke) {
  ctx.beginPath();
  pts.forEach(([lx, ly], i) => {
    const p = ch.point(lx, ly, alpha);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawWheelsAndStruts(ctx, ch, alpha, rim, strutColor) {
  for (const w of ch.wheels) {
    const top = ch.point(w.lx, 0, alpha);
    const wy = w.py + (w.y - w.py) * alpha;
    ctx.strokeStyle = strutColor;
    ctx.lineWidth = 2;
    spring(ctx, top.x, top.y, top.x, wy, 3);
    wheel(ctx, top.x, wy, w.r, w.spin, rim);
  }
}

// ---------------------------------------------------------------- base

class Vehicle {
  constructor(game, cfg, entryBoost) {
    this.game = game;
    this.cfg = cfg;
    this.dead = false;
    this.age = 0;
    this.retreating = false;
    this.u = SCROLL_SPEED + entryBoost; // ground speed (relative to terrain)
    this.accel = 0;
    this.parts = [];
  }

  groundFn() {
    const g = this.game;
    return (x) => g.bg.groundY(x, g.scroll);
  }

  get left() {
    return this.x - this.backLen;
  }

  get right() {
    return this.x + this.frontLen;
  }

  /** Throttle/brake toward a screen x, limited by engine, brakes and top speed. */
  drive(dt, targetX, d) {
    const desiredVx = clamp((targetX - this.x) * d.kp, -d.maxBack, d.maxFwd);
    const desiredU = clamp(desiredVx + SCROLL_SPEED, 0, SCROLL_SPEED + d.maxFwd);
    this.accel = clamp((desiredU - this.u) * d.ka, -d.brake, d.accel);
    this.u += this.accel * dt;
    this.x += (this.u - SCROLL_SPEED) * dt;
  }

  /**
   * Station in the right 40% of the screen, independent of the player: each
   * vehicle picks its own spot there and drifts around it, without overlapping
   * other vehicles.
   */
  target(wanderAmp, wanderFreq, range = null) {
    const g = this.game;
    if (this.age > this.cfg.life || this.retreating) {
      this.retreating = true;
      return -3000;
    }
    if (this.station === undefined) this.station = rand(0.6, 0.82);
    if (this.wanderPhase === undefined) this.wanderPhase = rand(TAU);
    // `range` (fractions of screen width for the vehicle's centre) overrides the attack zone.
    const lo = range ? g.W * range[0] : g.W * V.zone + this.backLen;
    const hi = range ? g.W * range[1] : g.W - this.frontLen - 12;
    let tx = g.W * this.station + Math.sin(this.age * wanderFreq + this.wanderPhase) * g.W * wanderAmp;
    tx = lo < hi ? clamp(tx, lo, hi) : (lo + hi) / 2;
    for (const o of g.vehicles) {
      if (o === this || o.dead) continue;
      const myL = tx - this.backLen - 30, myR = tx + this.frontLen + 30;
      if (myR > o.left && myL < o.right) {
        tx = this.x < o.x ? o.left - this.frontLen - 30 : o.right + this.backLen + 30;
      }
    }
    return clamp(tx, this.backLen - 40, g.W - this.frontLen - 12);
  }

  /** Only fires once it has reached its attack zone on the right of the screen. */
  canFire(x) {
    const g = this.game;
    return !this.retreating && g.player.alive && x > g.W * V.zone - 40 && x < g.W - 24;
  }

  dust(ch, chance) {
    const g = this.game;
    for (const w of ch.wheels) {
      if (w.contact && Math.random() < chance) {
        g.particles.smoke(ch.x + w.lx - w.r, w.y + w.r - 2, -rand(40, 120), -rand(10, 40), rand(2.5, 4.5), rand(0.5, 0.9), '#5c4058');
      }
    }
  }

  /** Axis-aligned box for a part (pitch is small, so AABB is a fair hitbox). */
  box(part) {
    const ch = part.ch;
    return { x0: ch.x - part.back, x1: ch.x + part.front, y0: ch.y - part.top, y1: ch.y + part.bottom };
  }

  /** Part hit by a circle at (x, y, r); `all` includes wrecked parts (for ramming). */
  hitTest(x, y, r, all = false) {
    if (this.dying) return null;
    for (const part of this.parts) {
      if (!all && !part.alive) continue;
      const b = this.box(part);
      if (x + r > b.x0 && x - r < b.x1 && y + r > b.y0 && y - r < b.y1) return part;
    }
    return null;
  }

  damage(part, d, hx, hy, quiet = false) {
    if (!part.alive || this.dying) return;
    part.hp -= d;
    part.flash = quiet ? Math.max(part.flash, 0.03) : 0.06;
    if (!quiet) {
      this.game.particles.hit(hx, hy, '#ffd27a');
      this.game.sfx.play('hit');
    }
    if (part.hp <= 0) this.partDestroyed(part);
  }

  partDestroyed(part) {
    part.alive = false;
    this.destroyAll();
  }

  destroyAll() {
    const g = this.game;
    for (const part of this.parts) this.explodePart(part, part.big ? 2.2 : 1.6);
    g.onVehicleDestroyed(this, this.cfg.score, this.x, this.parts[0].ch.y - 20);
    this.dead = true;
  }

  explodePart(part, size) {
    const g = this.game, ch = part.ch;
    const cx = ch.x + (part.front - part.back) / 2, cy = ch.y - part.top / 2;
    g.particles.explosion(cx, cy, '#ff9a3c', size);
    for (let i = 0; i < 8; i++) g.particles.ember(cx, cy, rand(-160, 160), rand(-320, -120), rand(0.8, 1.4), rand(3, 6), '#3a2f3f');
    for (let i = 0; i < 4; i++) g.particles.smoke(cx + rand(-20, 20), cy, rand(-60, 0), rand(-50, -20), rand(8, 14), rand(1, 1.6), '#2e2533');
  }

  tickParts(dt) {
    for (const part of this.parts) part.flash = Math.max(0, part.flash - dt);
  }

  updateCommon(dt) {
    this.age += dt;
    this.tickParts(dt);
    if (this.retreating && this.right < -60) this.dead = true;
  }

  /** Blinking chevron at the left edge while a vehicle is still racing in off-screen. */
  drawIncoming(ctx, t) {
    if (this.right >= 0 || this.retreating) return;
    const g = this.game, y = this.parts[0].ch.y - 14, x = g.insets.l + 14;
    if (Math.floor(t * 6) % 2) return;
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath();
    ctx.moveTo(x + 14, y);
    ctx.lineTo(x, y - 9);
    ctx.lineTo(x, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.font = '800 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', x + 18, y);
  }

  drawHpBar(ctx, part, alpha) {
    if (part.hp >= part.maxHp || !part.alive) return;
    const p = part.ch.point(0, -part.top - 8, alpha), w = (part.front + part.back) * 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(p.x - w / 2, p.y, w, 4);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(p.x - w / 2, p.y, (w * part.hp) / part.maxHp, 4);
  }
}

function makePart(ch, hp, front, back, top, bottom, big = false) {
  return { ch, hp, maxHp: hp, front, back, top, bottom, flash: 0, alive: true, big };
}

// ---------------------------------------------------------------- 1. mortar truck

export class Truck extends Vehicle {
  constructor(game) {
    super(game, V.truck, 330);
    this.kind = 'truck';
    // Soft, long-travel suspension tuned for rough ground at speed.
    this.ch = new Chassis({ wheels: [[-24, 10], [24, 10]], rest: 16, k: 110, c: 3.2, inertia: 560, squat: 0.006 });
    this.frontLen = 36;
    this.backLen = 36;
    this.x = -90;
    this.ch.settle(this.x, this.groundFn());
    const hp = Math.round(V.truck.hp * game.difficulty.hp);
    this.parts = [makePart(this.ch, hp, 36, 36, 32, 20)];
    this.drive_ = { kp: 3.2, ka: 4, accel: 520, brake: 720, maxFwd: 380, maxBack: 280 };
    this.turret = -2.4;
    this.fireCd = 2;
    this.salvoLeft = 0;
    this.salvoCd = 0;
    this.weave = rand(TAU);
  }

  muzzle() {
    const pivot = this.ch.point(-14, -24);
    return { x: pivot.x + Math.cos(this.turret) * 22, y: pivot.y + Math.sin(this.turret) * 22, pivot };
  }

  /** Ballistic solution to (tx, ty) with flight time T under mortar gravity. */
  solve(mx, my, tx, ty, T) {
    return { vx: (tx - mx) / T, vy: (ty - my) / T - 0.5 * V.mortarGravity * T };
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.updateCommon(dt);
    // Lively weaving around its station in the right half.
    const tx = this.target(0.1, 0.55) + Math.sin(this.age * 1.3 + this.weave) * 30;
    this.drive(dt, tx, this.drive_);
    this.ch.moveTo(this.x);
    this.ch.step(dt, this.groundFn(), this.accel, this.u);
    this.dust(this.ch, this.u > 120 ? 0.18 : 0.05);

    // Turret tracks the ballistic launch angle toward the player.
    const m = this.muzzle();
    if (p.alive) {
      const v = this.solve(m.x, m.y, Math.max(p.x, g.W * V.zone), p.y, 2.6);
      const want = clamp(Math.atan2(v.vy, v.vx), -Math.PI + 0.15, -0.15);
      this.turret += angleDiff(this.turret, want) * damp(6, dt);
    }

    this.fireCd -= dt * g.difficulty.fire;
    if (this.salvoLeft > 0) {
      this.salvoCd -= dt;
      if (this.salvoCd <= 0) this.fireMortar();
    } else if (this.fireCd <= 0 && this.canFire(this.x)) {
      this.salvoLeft = V.truck.salvo;
      this.salvoCd = 0;
      this.fireCd = rand(V.truck.interval[0], V.truck.interval[1]);
    }
  }

  fireMortar() {
    const g = this.game, p = g.player, m = this.muzzle();
    this.salvoLeft--;
    this.salvoCd = 0.22;
    if (!p.alive) return;
    const T = rand(V.mortarFlight[0], V.mortarFlight[1]);
    // Burst points are kept inside the right 40% of the screen.
    const tx = clamp(p.x + p.vx * T * 0.25 + rand(-45, 45), g.W * V.zone, g.W - 20);
    const ty = clamp(p.y + p.vy * T * 0.25 + rand(-35, 35), 30, g.H - 80);
    const v = this.solve(m.x, m.y, tx, ty, T);
    const b = g.fireEnemy('mortar', m.x, m.y, 0, 0, '#ff9a3c');
    if (!b) return;
    b.vx = v.vx;
    b.vy = v.vy;
    b.fuse = T;
    b.tx = tx;
    b.ty = ty;
    b.hp = 1;
    b.life = T + 1;
    // Launch: flash, smoke ring and a recoil kick through the suspension.
    g.particles.add('glow', m.x, m.y, 0, 0, 0.12, 16, '#ffd27a');
    for (let i = 0; i < 5; i++) g.particles.smoke(m.x, m.y, Math.cos(this.turret) * rand(30, 90) + rand(-20, 20), Math.sin(this.turret) * rand(30, 90), 4, 0.7, '#7a6b7e');
    this.ch.vy += 60;
    this.ch.pv += 1.4;
    g.sfx.play('mortar');
  }

  draw(ctx, alpha, t) {
    const ch = this.ch, part = this.parts[0];
    const body = part.flash > 0 ? '#ffffff' : '#e0a33a';
    drawWheelsAndStruts(ctx, ch, alpha, '#c08a30', '#9a8f9e');
    // Frame, bed, cab, bumper, roll bar.
    bodyPoly(ctx, ch, [[-36, -8], [36, -8], [36, 0], [-36, 0]], alpha, '#3b2f3f');
    bodyPoly(ctx, ch, [[-36, -18], [2, -18], [2, -8], [-36, -8]], alpha, body, '#7a5520');
    bodyPoly(ctx, ch, [[4, -8], [4, -26], [20, -26], [30, -16], [36, -14], [36, -8]], alpha, body, '#7a5520');
    bodyPoly(ctx, ch, [[8, -24], [18, -24], [25, -17], [8, -17]], alpha, '#7fd6ff');
    bodyPoly(ctx, ch, [[36, -10], [40, -10], [40, -3], [36, -3]], alpha, '#9a8f9e');
    // Mortar turret.
    const pivot = ch.point(-14, -24, alpha);
    bodyPoly(ctx, ch, [[-24, -18], [-4, -18], [-8, -26], [-20, -26]], alpha, '#7a5520');
    ctx.strokeStyle = part.flash > 0 ? '#ffffff' : '#4a3a2a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(pivot.x + Math.cos(this.turret) * 22, pivot.y + Math.sin(this.turret) * 22);
    ctx.stroke();
    ctx.fillStyle = '#2b2230';
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 4, 0, TAU);
    ctx.fill();
    this.drawHpBar(ctx, part, alpha);
  }
}

// ---------------------------------------------------------------- 2. turbine tank

export class Tank extends Vehicle {
  constructor(game) {
    super(game, V.tank, 230);
    this.kind = 'tank';
    // Six stiff road wheels; heavy, well damped hull.
    this.ch = new Chassis({
      wheels: [-40, -24, -8, 8, 24, 40].map((lx) => [lx, 7]),
      rest: 9, k: 230, c: 9, inertia: 1300, squat: 0.0035,
    });
    this.frontLen = 60;
    this.backLen = 62;
    this.x = -110;
    this.ch.settle(this.x, this.groundFn());
    const hp = Math.round(V.tank.hp * game.difficulty.hp);
    this.parts = [makePart(this.ch, hp, 60, 62, 52, 18, true)];
    this.drive_ = { kp: 2.2, ka: 2.5, accel: 280, brake: 380, maxFwd: 250, maxBack: 220 };
    this.turret = -0.8;
    this.state = 'reload';
    this.timer = 2.5;
    this.restation = 0;
    this.aimX = 0;
    this.aimY = 0;
    this.trackDist = 0;
  }

  /** The tank shells the player anywhere on screen once it is in view. */
  canFire() {
    const g = this.game;
    return !this.retreating && g.player.alive && this.right > 0 && this.left < g.W;
  }

  pivot(alpha = 1) {
    return this.ch.point(-6, -34, alpha);
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.updateCommon(dt);
    // Parks at random spots 45%-25% in from the right edge, re-picking every few seconds.
    if ((this.restation -= dt) <= 0) {
      this.station = rand(V.tank.range[0], V.tank.range[1]);
      this.restation = rand(V.tank.restation[0], V.tank.restation[1]);
    }
    const tx = this.target(0.015, 0.4, V.tank.range);
    this.drive(dt, tx, this.drive_);
    this.ch.moveTo(this.x);
    this.ch.step(dt, this.groundFn(), this.accel, this.u);
    this.trackDist += this.u * dt;
    this.dust(this.ch, this.u > 100 ? 0.06 : 0.02);

    // Gas-turbine exhaust: flame scales with throttle.
    const ex = this.ch.point(-64, -14);
    const thr = clamp(0.35 + this.accel / 280, 0.2, 1.4);
    if (Math.random() < 0.5) g.particles.add('glow', ex.x - 4, ex.y, -rand(80, 160) * thr, rand(-10, 10), 0.18, 8 * thr, '#ffb03b');
    if (Math.random() < 0.25) g.particles.smoke(ex.x - 10, ex.y, -rand(60, 120), rand(-20, 0), 4, 0.8, '#4a3d4f');

    const piv = this.pivot();
    const S = V.tank.shellSpeed * g.difficulty.speed;
    if (this.state === 'reload') {
      if (p.alive) this.aimAt(piv, p.x, p.y, dt, 1.4);
      this.timer -= dt * g.difficulty.fire;
      if (this.timer <= 0 && this.canFire(this.x)) {
        this.state = 'aim';
        this.timer = V.tank.aim;
        g.sfx.play('charge');
      }
    } else if (this.state === 'aim') {
      this.timer -= dt;
      if (!p.alive || this.retreating) {
        this.state = 'reload';
        this.timer = 2;
      } else {
        if (this.timer > V.tank.lock) {
          // Lead the target: where the player will be when the shell arrives.
          const T = Math.hypot(p.x - piv.x, p.y - piv.y) / S;
          this.aimX = clamp(p.x + p.vx * T, 10, g.W - 10);
          this.aimY = clamp(p.y + p.vy * T, 10, g.H - 70);
        }
        this.aimAt(piv, this.aimX, this.aimY, dt, 2.2);
        if (this.timer <= 0) this.fire(S);
      }
    }
  }

  aimAt(piv, x, y, dt, rate) {
    // Full sweep across the screen; only steep downward angles are blocked by the hull.
    let want = Math.atan2(y - piv.y, x - piv.x);
    if (want > 0.3 && want <= Math.PI / 2) want = 0.3;
    else if (want > Math.PI / 2 && want < Math.PI - 0.3) want = Math.PI - 0.3;
    this.turret += clamp(angleDiff(this.turret, want), -rate * dt, rate * dt);
  }

  fire(S) {
    const g = this.game, piv = this.pivot();
    const mx = piv.x + Math.cos(this.turret) * 64, my = piv.y + Math.sin(this.turret) * 64;
    const ang = Math.atan2(this.aimY - my, this.aimX - mx);
    const b = g.fireEnemy('shell', mx, my, ang, S, '#ff6a3c');
    if (b) {
      b.fuse = Math.hypot(this.aimX - mx, this.aimY - my) / S;
      b.tx = this.aimX;
      b.ty = this.aimY;
      b.life = b.fuse + 1;
    }
    // Muzzle blast: flash, forward smoke jet, ring, heavy recoil through the hull.
    g.particles.add('glow', mx, my, 0, 0, 0.14, 34, '#ffffff');
    g.particles.add('glow', mx, my, 0, 0, 0.3, 24, '#ffb03b');
    g.particles.ring(mx, my, '#ffd27a', 4, 36, 0.3, 3);
    for (let i = 0; i < 10; i++) {
      const a = this.turret + rand(-0.5, 0.5), s = rand(60, 260);
      g.particles.smoke(mx, my, Math.cos(a) * s, Math.sin(a) * s, rand(4, 8), rand(0.6, 1.1), '#6d5f72');
    }
    this.u -= 90;
    this.ch.pv -= 1.6;
    this.ch.vy += 40;
    g.shake = Math.max(g.shake, 8);
    g.sfx.play('cannon');
    this.state = 'reload';
    this.timer = rand(V.tank.interval[0], V.tank.interval[1]);
  }

  draw(ctx, alpha, t) {
    const ch = this.ch, part = this.parts[0];
    const hull = part.flash > 0 ? '#ffffff' : '#7f9c5a';
    // Track loop around the road wheels, treads scroll with distance travelled.
    const w0 = ch.wheels[0], w5 = ch.wheels[5];
    const a = ch.point(-50, 0, alpha), b = ch.point(50, 0, alpha);
    const ya = w0.py + (w0.y - w0.py) * alpha, yb = w5.py + (w5.y - w5.py) * alpha;
    drawWheelsAndStruts(ctx, ch, alpha, '#5b6e40', '#4a4f3a');
    ctx.strokeStyle = '#2a2a24';
    ctx.lineWidth = 5;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -this.trackDist * 0.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 2);
    ctx.lineTo(b.x, b.y - 2);
    ctx.arc(b.x, (b.y + yb) / 2 + 3, Math.max(4, (yb - b.y) / 2 + 5), -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(a.x, ya + 8);
    ctx.arc(a.x, (a.y + ya) / 2 + 3, Math.max(4, (ya - a.y) / 2 + 5), Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // Hull with sloped glacis, turbine housings at the rear.
    bodyPoly(ctx, ch, [[-60, -2], [58, -2], [62, -12], [44, -24], [-54, -24], [-62, -14]], alpha, hull, '#3d4a2a');
    bodyPoly(ctx, ch, [[-66, -18], [-54, -18], [-54, -8], [-66, -8]], alpha, '#4a4f3a');
    const ex = ch.point(-66, -13, alpha);
    const fl = 10 + Math.random() * 8;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.game.sprites.glow('#ffb03b', 5), ex.x - fl - 6, ex.y - 6, fl + 6, 12);
    ctx.globalCompositeOperation = 'source-over';
    // Turret and long barrel with muzzle brake.
    const piv = this.pivot(alpha);
    const bx = piv.x + Math.cos(this.turret) * 64, by = piv.y + Math.sin(this.turret) * 64;
    ctx.strokeStyle = part.flash > 0 ? '#ffffff' : '#56683c';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(piv.x, piv.y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = '#2a2a24';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(piv.x + Math.cos(this.turret) * 56, piv.y + Math.sin(this.turret) * 56);
    ctx.lineTo(bx, by);
    ctx.stroke();
    bodyPoly(ctx, ch, [[-28, -24], [18, -24], [12, -40], [-20, -44]], alpha, hull, '#3d4a2a');
    // Barrel tip glows hot while aiming.
    if (this.state === 'aim') {
      const k = 1 - this.timer / V.tank.aim;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.game.sprites.glow('#ff6a3c', 6), bx - 8 - k * 10, by - 8 - k * 10, 16 + k * 20, 16 + k * 20);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.drawHpBar(ctx, part, alpha);
  }

  drawOverlay(ctx, t) {
    if (this.state === 'aim') drawCrosshair(ctx, this.aimX, this.aimY, V.tank.aoe, t, this.timer <= V.tank.lock);
  }
}

// ---------------------------------------------------------------- 3. missile train

const LOCO_HALF = 46, CAR_HALF = 40, GAP = 10;

export class Train extends Vehicle {
  constructor(game) {
    super(game, V.train, 260);
    this.kind = 'train';
    const nMods = V.train.modules + (game.director.wave >= 10 ? 1 : 0);
    const g = this.groundFn();
    const hpMul = game.difficulty.hp;
    this.cars = [];
    let x = -60;
    for (let i = 0; i <= nMods; i++) {
      const half = i === 0 ? LOCO_HALF : CAR_HALF;
      if (i > 0) x -= this.cars[i - 1].half + GAP + half;
      const wl = half - 10, wi = half - 22;
      const ch = new Chassis({ wheels: [[-wl, 6], [-wi, 6], [wi, 6], [wl, 6]], rest: 8, k: 210, c: 9, inertia: 900, squat: 0.003 });
      ch.settle(x, g);
      const hp = Math.round((i === 0 ? V.train.locoHp : V.train.moduleHp) * hpMul);
      const part = makePart(ch, hp, half, half, i === 0 ? 34 : 30, 14, i === 0);
      part.car = i;
      this.cars.push({ ch, half, v: this.u - SCROLL_SPEED, part, cd: 2.5 + i * 0.9, salvo: 0, salvoCd: 0, rack: 0 });
      this.parts.push(part);
    }
    this.frontLen = LOCO_HALF;
    this.x = this.cars[0].ch.x;
    this.drive_ = { kp: 2, ka: 2.2, accel: 260, brake: 360, maxFwd: 230, maxBack: 220 };
    this.dying = false;
    this.dieTimer = 0;
    this.dieIdx = 0;
  }

  get backLen() {
    const last = this.cars[this.cars.length - 1];
    return this.x - (last.ch.x - last.half);
  }

  update(dt) {
    const g = this.game, ground = this.groundFn();
    this.updateCommon(dt);
    const tx = this.dying ? -3000 : this.target(0.04, 0.2);
    this.drive(dt, tx, this.drive_);
    const loco = this.cars[0];
    loco.v = this.u - SCROLL_SPEED;
    loco.ch.moveTo(this.x);
    loco.ch.step(dt, ground, this.accel, this.u);
    // Cars follow on spring couplings, so the train concertinas under throttle.
    for (let i = 1; i < this.cars.length; i++) {
      const c = this.cars[i], prev = this.cars[i - 1];
      const want = prev.ch.x - (prev.half + GAP + c.half);
      const a = 380 * (want - c.ch.x) + 26 * (prev.v - c.v);
      c.v += a * dt;
      c.ch.moveTo(c.ch.x + c.v * dt);
      c.ch.step(dt, ground, clamp(a, -400, 400), c.v + SCROLL_SPEED);
    }
    for (const c of this.cars) c.rack = Math.max(0, c.rack - dt * 2);
    if (Math.random() < 0.25) {
      const st = loco.ch.point(-20, -36);
      g.particles.smoke(st.x, st.y, -rand(60, 120), -rand(20, 50), rand(3, 5), rand(0.8, 1.2), '#5a4d5e');
    }

    if (this.dying) {
      this.dieTimer -= dt;
      if (this.dieTimer <= 0) {
        if (this.dieIdx < this.cars.length) {
          this.explodePart(this.cars[this.dieIdx].part, this.dieIdx === 0 ? 2.4 : 1.6);
          this.dieIdx++;
          this.dieTimer = 0.18;
        } else this.dead = true;
      }
      return;
    }

    for (let i = 1; i < this.cars.length; i++) this.updateLauncher(this.cars[i], dt);
  }

  updateLauncher(c, dt) {
    const g = this.game;
    if (!c.part.alive) return;
    if (c.salvo > 0) {
      c.salvoCd -= dt;
      if (c.salvoCd <= 0) {
        c.salvo--;
        c.salvoCd = 0.28;
        const lx = c.salvo % 2 ? -10 : 10;
        const pt = c.ch.point(lx, -32);
        const b = g.fireEnemy('wave', pt.x, pt.y, -Math.PI / 2, 0, '#ffb03b');
        if (b) {
          b.phase = 'boost';
          b.vx = this.u - SCROLL_SPEED;
          b.vy = -140;
          b.hp = 1;
          b.life = 14;
          b.speed = V.train.missileSpeed * g.difficulty.speed;
          b.amp = 34;
          b.lambda = 150;
          b.dir = -Math.PI / 2;
        }
        c.rack = 1;
        g.particles.add('glow', pt.x, pt.y, 0, 0, 0.12, 14, '#ffd27a');
        for (let i = 0; i < 4; i++) g.particles.smoke(pt.x, pt.y + 4, rand(-60, 60), rand(-10, 30), 4, 0.8, CONTRAIL_DARK);
        c.ch.vy += 30;
        g.sfx.play('missileLaunch');
      }
      return;
    }
    c.cd -= dt * g.difficulty.fire;
    if (c.cd <= 0 && this.canFire(c.ch.x)) {
      c.salvo = 2;
      c.salvoCd = 0;
      c.cd = rand(V.train.interval[0], V.train.interval[1]);
    }
  }

  partDestroyed(part) {
    const g = this.game;
    part.alive = false;
    if (part.car === 0) {
      // Locomotive down: the whole train goes up car by car.
      this.dying = true;
      this.dieTimer = 0;
      this.dieIdx = 0;
      g.onVehicleDestroyed(this, V.train.score, this.x, part.ch.y - 20);
    } else {
      this.explodePart(part, 1.4);
      g.onVehicleDestroyed(null, V.train.moduleScore, part.ch.x, part.ch.y - 20);
    }
  }

  draw(ctx, alpha, t) {
    // Couplings first, so cars draw over them.
    ctx.strokeStyle = '#2b2230';
    ctx.lineWidth = 3;
    for (let i = 1; i < this.cars.length; i++) {
      const a = this.cars[i - 1], b = this.cars[i];
      const pa = a.ch.point(-a.half, -6, alpha), pb = b.ch.point(b.half, -6, alpha);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    this.cars.forEach((c, i) => {
      if (this.dying && i < this.dieIdx) return;
      const ch = c.ch, part = c.part, h = c.half;
      drawWheelsAndStruts(ctx, ch, alpha, '#8d8fa8', '#5a5f7a');
      const flash = part.flash > 0;
      if (i === 0) {
        // Locomotive: wedge nose, cab, jet booster pod and stack.
        bodyPoly(ctx, ch, [[-h, -2], [h - 6, -2], [h + 4, -10], [h - 14, -30], [-h, -30]], alpha, flash ? '#ffffff' : '#c84a4a', '#6a2020');
        bodyPoly(ctx, ch, [[h - 30, -28], [h - 16, -28], [h - 8, -14], [h - 30, -14]], alpha, '#7fd6ff');
        bodyPoly(ctx, ch, [[-h + 4, -34], [-h + 30, -34], [-h + 30, -26], [-h + 4, -26]], alpha, '#8d8fa8');
        bodyPoly(ctx, ch, [[-24, -30], [-16, -30], [-16, -38], [-24, -38]], alpha, '#3b2f3f');
        const jet = ch.point(-h, -30, alpha);
        ctx.globalCompositeOperation = 'lighter';
        const fl = 10 + Math.random() * 8;
        ctx.drawImage(this.game.sprites.glow('#ffb03b', 4), jet.x - fl - 4, jet.y - 5, fl + 4, 10);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        // Flatbed with a tilting missile rack (or a burnt-out wreck).
        bodyPoly(ctx, ch, [[-h, -2], [h, -2], [h, -10], [-h, -10]], alpha, part.alive ? '#8d8fa8' : '#3a3540', '#4a4f66');
        if (part.alive) {
          const tilt = -c.rack * 0.25;
          const pts = [[-26, -10], [26, -10], [26, -28], [-26, -28]].map(([x, y]) => {
            const yy = y + 10, cs = Math.cos(tilt), sn = Math.sin(tilt);
            return [x * cs - yy * sn, x * sn + yy * cs - 10];
          });
          bodyPoly(ctx, ch, pts, alpha, flash ? '#ffffff' : '#c84a4a', '#6a2020');
          ctx.fillStyle = '#2b2230';
          for (const lx of [-16, -4, 8, 20]) {
            const pp = ch.point(lx - 2, -24, alpha);
            ctx.beginPath();
            ctx.arc(pp.x, pp.y, 3, 0, TAU);
            ctx.fill();
          }
        }
      }
      this.drawHpBar(ctx, part, alpha);
    });
  }
}

const CONTRAIL_DARK = '#7a6b7e';

export function makeVehicle(game, type) {
  if (type === 'tank') return new Tank(game);
  if (type === 'train') return new Train(game);
  return new Truck(game);
}
