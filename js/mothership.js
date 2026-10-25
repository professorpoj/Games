// The mothership boss. Visit 1: heat-up laser + hangar swarms. Each return
// visit adds abilities: 2 = side turrets, 3 = sweeping laser, 4+ = double
// laser shots and homing missile salvos. Hull HP grows every visit.
import { GROUND_H, MOTHERSHIP as M, PLAYER, WINGMAN, SWARM_GROWTH } from './config.js';
import { shapesFor } from './formations.js';
import { Swarm } from './swarm.js';
import { TAU, rand, choose, clamp, damp, segDist2, shuffle } from './utils.js';

const HULL = [[-1, 0], [-0.55, -0.75], [0.3, -1], [1, -0.6], [1, 0.6], [0.3, 1], [-0.55, 0.75]];

export class Mothership {
  constructor(game, visit) {
    this.game = game;
    this.visit = visit;
    const { W, H } = game;
    this.maxHp = this.hp = Math.round(M.baseHp * (1 + (visit - 1) * M.hpPerVisit));
    this.x = this.px = W + M.rx + 60;
    this.y = this.py = (H - GROUND_H) / 2;
    this.homeX = W - M.rx * 0.78;
    this.vx = 0;
    this.state = 'enter';
    this.t = 0;
    this.flash = 0;
    this.done = false;
    this.laser = { state: 'idle', timer: 2.2, angle: Math.PI, a0: Math.PI, a1: Math.PI, shot: 0 };
    this.swarmTimer = 3.5;
    this.hangarFlash = 0;
    this.turretTimer = 2.5;
    this.missileTimer = 5;
    this.can = {
      turrets: visit >= 2,
      sweep: visit >= 3,
      doubleShot: visit >= 4,
      missiles: visit >= 4,
    };
  }

  get emitter() {
    return { x: this.x - M.rx + 8, y: this.y };
  }

  turretPos(side) {
    return { x: this.x - M.rx * 0.2, y: this.y + side * M.ry * 0.86 };
  }

  /** Elliptical hull test, r = radius of the thing touching it. */
  hits(x, y, r, shrink = 1) {
    const dx = (x - this.x) / (M.rx * shrink + r), dy = (y - this.y) / (M.ry * shrink + r);
    return dx * dx + dy * dy < 1;
  }

  damage(d, hx, hy, quiet = false) {
    if (this.state !== 'fight') return;
    this.hp -= d;
    this.flash = quiet ? Math.max(this.flash, 0.02) : 0.05;
    if (!quiet) {
      this.game.particles.hit(hx, hy, '#b9bfff');
      this.game.sfx.play('hit');
    }
    if (this.hp <= 0) this.retreat();
  }

  retreat() {
    const g = this.game;
    this.hp = 0;
    this.state = 'retreat';
    this.vx = 0;
    this.laser.state = 'idle';
    const bonus = M.retreatBonus * this.visit;
    if (g.player.alive) g.score += bonus;
    g.showBanner('MOTHERSHIP RETREATS', `BONUS +${bonus}`);
    g.sfx.play('bigExplode');
    g.shake = 16;
    g.flash = 0.3;
    for (let i = 0; i < 6; i++) g.particles.explosion(this.x + rand(-M.rx, M.rx) * 0.7, this.y + rand(-M.ry, M.ry) * 0.7, '#b46bff', 1.6);
    g.maybeDropP(this.x - M.rx, this.y - 30);
    g.spawnPowerup('B', this.x - M.rx, this.y + 30);
    g.spawnPowerup('W', this.x - M.rx - 30, this.y);
    if (this.visit >= 2) g.spawnPowerup('W', this.x - M.rx - 60, this.y + 50);
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.px = this.x;
    this.py = this.y;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.hangarFlash = Math.max(0, this.hangarFlash - dt);

    if (this.state === 'enter') {
      this.x += (this.homeX - this.x) * damp(1.4, dt);
      if (this.x - this.homeX < 3) this.state = 'fight';
      return;
    }
    if (this.state === 'retreat') {
      // Limps away trailing smoke; it'll be back.
      this.vx += 240 * dt;
      this.x += this.vx * dt;
      this.y += Math.sin(this.t * 3) * 20 * dt;
      if (Math.random() < 0.5) g.particles.add('debris', this.x + rand(-M.rx, M.rx) * 0.6, this.y + rand(-M.ry, M.ry) * 0.6, -60, rand(-40, 40), 0.8, 4, '#5a5f8a');
      if (this.x > g.W + M.rx + 80) this.done = true;
      return;
    }

    // Fight: slow vertical drift, sliding to line up the laser while it charges.
    const L = this.laser;
    const minY = 70, maxY = g.H - GROUND_H - 50;
    let ty = (g.H - GROUND_H) / 2 + Math.sin(this.t * 0.4) * 90;
    if (L.state === 'charge' && L.timer > M.laserLock && p.alive && !L.sweepDir) ty = p.y;
    if (L.state === 'fire' || (L.state === 'charge' && L.timer <= M.laserLock)) ty = this.y;
    const step = (M.trackSpeed + this.visit * 15) * dt;
    this.y += clamp(clamp(ty, minY, maxY) - this.y, -step, step);
    if (Math.random() < (1 - this.hp / this.maxHp) * 0.3) {
      g.particles.add('glow', this.x + rand(-M.rx, M.rx) * 0.5, this.y + rand(-M.ry, M.ry) * 0.5, -40, -20, 0.6, 8, '#6b6f9a');
    }

    this.updateLaser(dt);
    if (!p.alive) return;
    this.updateSwarms(dt);
    if (this.can.turrets) this.updateTurrets(dt);
    if (this.can.missiles) this.updateMissiles(dt);
  }

  updateLaser(dt) {
    const g = this.game, p = g.player, L = this.laser;
    const speedUp = 1 + (this.visit - 1) * 0.12;
    if (!p.alive && L.state !== 'fire') {
      L.state = 'idle';
      L.timer = Math.max(L.timer, 1.5);
      return;
    }
    L.timer -= dt;
    if (L.state === 'idle') {
      if (L.timer <= 0) this.startCharge(M.laserCharge / speedUp);
    } else if (L.state === 'charge') {
      if (L.timer <= 0) {
        L.state = 'fire';
        L.timer = M.laserFire;
        L.angle = L.a0;
        g.sfx.play('laserFire');
        g.shake = Math.max(g.shake, 7);
      }
    } else if (L.state === 'fire') {
      const k = 1 - Math.max(0, L.timer) / M.laserFire;
      L.angle = L.a0 + (L.a1 - L.a0) * k;
      g.shake = Math.max(g.shake, 3);
      this.laserHits();
      if (L.timer <= 0) {
        if (this.can.doubleShot && L.shot === 0) {
          L.shot = 1;
          this.startCharge(0.8);
        } else {
          L.shot = 0;
          L.state = 'idle';
          L.timer = rand(M.laserCooldown[0], M.laserCooldown[1]) / speedUp;
        }
      }
    }
  }

  startCharge(time) {
    const L = this.laser;
    L.state = 'charge';
    L.timer = time;
    // From visit 3 some shots sweep across the screen instead of firing straight.
    L.sweepDir = this.can.sweep && Math.random() < 0.5 ? choose([-1, 1]) : 0;
    L.a0 = Math.PI + L.sweepDir * 0.42;
    L.a1 = Math.PI - L.sweepDir * 0.42;
    this.game.sfx.play('laserCharge');
  }

  beam() {
    const e = this.emitter, a = this.laser.angle;
    return { x0: e.x, y0: e.y, x1: e.x + Math.cos(a) * 2000, y1: e.y + Math.sin(a) * 2000 };
  }

  /** The beam ignores the shield: the only defence is to get out of the way. */
  laserHits() {
    const g = this.game, p = g.player, b = this.beam();
    for (const w of p.wings) {
      if (!w.level || w.invuln > 0) continue;
      const rr = M.laserHalfWidth + WINGMAN.hitRadius;
      if (segDist2(w.x, w.y, b.x0, b.y0, b.x1, b.y1) < rr * rr) g.wingmanDown(w);
    }
    if (!p.alive || p.invuln > 0 || p.entry > 0) return;
    const rr = M.laserHalfWidth + PLAYER.hitRadius;
    if (segDist2(p.x, p.y, b.x0, b.y0, b.x1, b.y1) < rr * rr) g.killPlayer();
  }

  updateSwarms(dt) {
    const g = this.game;
    this.swarmTimer -= dt;
    if (this.swarmTimer > 0) return;
    this.swarmTimer = rand(M.swarmInterval[0], M.swarmInterval[1]) / (1 + (this.visit - 1) * 0.1);
    if (g.swarms.length >= 2 + Math.floor(this.visit / 2)) return;
    const pool = ['drone', 'drone', 'drone'];
    if (this.visit >= 2) pool.push('darter', 'darter');
    if (this.visit >= 3) pool.push('spinner', 'sniper');
    // Hangar swarms grow with the wave count too (+1 ship per wave).
    const extra = Math.max(0, g.director.wave - 1) * SWARM_GROWTH.perWave;
    const n = Math.min(5 + Math.floor(Math.random() * 3) + extra, SWARM_GROWTH.maxSize);
    const members = Array.from({ length: n }, () => choose(pool));
    const origin = { x: this.x - M.rx * 0.2, y: this.y + M.ry * 0.55 };
    g.swarms.push(new Swarm(g, {
      members,
      leaders: [],
      path: choose(['sweep', 'weave']),
      shapes: shuffle(shapesFor(n)).slice(0, 4),
      y: clamp(origin.y + rand(-80, 80), 80, g.H - GROUND_H - 80),
      speed: 110 + this.visit * 8,
      holdTime: 0,
      origin,
    }));
    this.hangarFlash = 0.6;
    g.sfx.play('charge');
  }

  updateTurrets(dt) {
    const g = this.game, p = g.player;
    this.turretTimer -= dt * g.difficulty.fire;
    if (this.turretTimer > 0) return;
    this.turretTimer = 2.4;
    const n = this.visit >= 3 ? 5 : 3;
    for (const side of [-1, 1]) {
      const t = this.turretPos(side);
      const base = Math.atan2(p.y - t.y, p.x - t.x);
      for (let i = 0; i < n; i++) g.fireEnemy('orb', t.x, t.y, base + (i - (n - 1) / 2) * 0.13, 190 * g.difficulty.speed, '#ff9f5c');
    }
    g.sfx.play('enemyShot');
  }

  updateMissiles(dt) {
    const g = this.game;
    this.missileTimer -= dt;
    if (this.missileTimer > 0) return;
    this.missileTimer = 6;
    for (const side of [-1, 1]) {
      for (const k of [0, 1]) {
        const m = g.fireEnemy('missile', this.x - 30 - k * 30, this.y + side * M.ry * 0.7, Math.PI + side * (0.8 + k * 0.3), 150 * g.difficulty.speed, '#ff6ad5');
        if (m) m.hp = 2;
      }
    }
    g.sfx.play('enemyShot');
  }

  // ------------------------------------------------------------- drawing

  draw(ctx, x, y, t) {
    const rx = M.rx, ry = M.ry;
    ctx.save();
    ctx.translate(x, y);
    // Hull.
    ctx.beginPath();
    HULL.forEach(([hx, hy], i) => (i ? ctx.lineTo(hx * rx, hy * ry) : ctx.moveTo(hx * rx, hy * ry)));
    ctx.closePath();
    const grd = ctx.createLinearGradient(0, -ry, 0, ry);
    grd.addColorStop(0, '#5a5f9a');
    grd.addColorStop(0.5, '#33365e');
    grd.addColorStop(1, '#1d1f3a');
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : grd;
    ctx.fill();
    ctx.strokeStyle = '#a9b0ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Plating.
    ctx.strokeStyle = 'rgba(169,176,255,0.25)';
    ctx.lineWidth = 1.5;
    for (const px of [-0.3, 0.1, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(px * rx, -ry * 0.85);
      ctx.lineTo(px * rx, ry * 0.85);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-rx * 0.8, 0);
    ctx.lineTo(rx, 0);
    ctx.stroke();

    // Reactor core.
    ctx.fillStyle = `rgba(255,90,200,${0.55 + Math.sin(t * 4) * 0.25})`;
    ctx.beginPath();
    ctx.arc(rx * 0.35, 0, 18, 0, TAU);
    ctx.fill();

    // Hangar bay (glows when launching a swarm).
    const hf = this.hangarFlash > 0 ? 1 : 0.35;
    ctx.fillStyle = `rgba(255,159,28,${hf})`;
    ctx.fillRect(-rx * 0.35, ry * 0.5, rx * 0.45, 10);

    // Turrets / missile pods for later visits.
    if (this.can.turrets) {
      const p = this.game.player;
      for (const side of [-1, 1]) {
        const ty = side * ry * 0.86, tx = -rx * 0.2;
        const a = Math.atan2(p.y - (y + ty), p.x - (x + tx));
        ctx.strokeStyle = '#ff9f5c';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + Math.cos(a) * 20, ty + Math.sin(a) * 20);
        ctx.stroke();
        ctx.fillStyle = '#7a4a3a';
        ctx.beginPath();
        ctx.arc(tx, ty, 11, 0, TAU);
        ctx.fill();
      }
    }
    if (this.can.missiles) {
      ctx.fillStyle = '#ff6ad5';
      for (const side of [-1, 1]) ctx.fillRect(-30, side * ry * 0.7 - 5, 40, 10);
    }

    // Laser emitter: heats from dull red to white while charging.
    const L = this.laser;
    let heat = 0;
    if (L.state === 'charge') heat = 1 - Math.max(0, L.timer) / M.laserCharge;
    else if (L.state === 'fire') heat = 1;
    const ex = -rx + 8;
    const glowR = 14 + heat * 26;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.game.sprites.glow(heat > 0.7 ? '#ffd9d9' : '#ff3b5c', glowR / 2), ex - glowR, -glowR, glowR * 2, glowR * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = heat > 0.85 ? '#ffffff' : heat > 0.4 ? '#ff9a7a' : '#7a2236';
    ctx.beginPath();
    ctx.arc(ex, 0, 12, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Charging telegraph + firing beam, drawn above the action so it's always readable. */
  drawLaser(ctx, t) {
    const L = this.laser;
    if (this.state !== 'fight' || (L.state !== 'charge' && L.state !== 'fire')) return;
    const e = this.emitter, len = 2000;
    const line = (a) => [e.x, e.y, e.x + Math.cos(a) * len, e.y + Math.sin(a) * len];
    ctx.save();
    if (L.state === 'charge') {
      const locked = L.timer <= M.laserLock;
      const k = 1 - Math.max(0, L.timer) / M.laserCharge;
      // Danger band the full width of the beam, getting stronger as it heats up.
      for (const a of L.sweepDir ? [L.a0, L.a1] : [L.a0]) {
        const [x0, y0, x1, y1] = line(a);
        ctx.strokeStyle = `rgba(255,59,92,${0.08 + k * 0.18})`;
        ctx.lineWidth = M.laserHalfWidth * 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = locked ? (Math.floor(t * 30) % 2 ? '#ffffff' : '#ff3b5c') : `rgba(255,120,120,${0.4 + k * 0.5})`;
        ctx.lineWidth = locked ? 3 : 1.5;
        ctx.setLineDash(locked ? [] : [14, 10]);
        ctx.lineDashOffset = -t * 120;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (L.sweepDir) {
        // Sweep warning: faint fan between the start and end angles.
        ctx.fillStyle = `rgba(255,59,92,${0.05 + k * 0.08})`;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, len, Math.min(L.a0, L.a1), Math.max(L.a0, L.a1));
        ctx.closePath();
        ctx.fill();
      }
    } else {
      const [x0, y0, x1, y1] = line(L.angle);
      const wobble = Math.sin(t * 60) * 3;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const [w, c] of [[M.laserHalfWidth * 2 + 18 + wobble, 'rgba(255,59,92,0.35)'], [M.laserHalfWidth * 2, 'rgba(255,120,140,0.85)'], [M.laserHalfWidth * 0.9, '#ffffff']]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
