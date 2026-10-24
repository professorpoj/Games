import { PLAYER, CONTROLS, GROUND_H, WINGMAN } from './config.js';
import { clamp, damp } from './utils.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.x = this.px = -100;
    this.y = this.py = 0;
    this.vx = this.vy = 0;
    this.alive = false;
    this.power = 1;
    this.tilt = 0;
    this.invuln = 0;
    this.entry = 0;
    this.fireCd = 0;
    this.respawnTimer = 0;
    this.wingLevel = 0;
    this.wingBombCd = 0;
    // [0] flies above the ship, [1] below.
    this.wings = [-1, 1].map((side) => ({ side, x: 0, y: 0, px: 0, py: 0 }));
  }

  spawn() {
    const g = this.game;
    this.x = this.px = -30;
    this.y = this.py = (g.H - GROUND_H) * 0.5;
    this.vx = this.vy = 0;
    this.alive = true;
    this.invuln = PLAYER.invulnTime;
    this.entry = 0.55;
    this.fireCd = 0;
    this.tilt = 0;
    this.wingBombCd = 0;
    for (const w of this.wings) {
      w.x = w.px = this.x;
      w.y = w.py = this.y;
    }
  }

  // ---- wingmen: level 1 top, 2 bottom, 3 top x2, 4 bottom x2, 5 top x3, 6 bottom x3, 7+ bombs

  get wingCount() {
    return Math.min(2, this.wingLevel);
  }

  wingRounds(i) {
    const lvl = Math.min(this.wingLevel, WINGMAN.gunLevels);
    return i === 0 ? Math.ceil(lvl / 2) : Math.floor(lvl / 2);
  }

  /** 0 = no bombs; 1 = top wingman bombs; 2+ = both bomb, faster each level. */
  get wingBombLevel() {
    return Math.max(0, this.wingLevel - WINGMAN.gunLevels);
  }

  wingBombInterval() {
    const steps = WINGMAN.maxLevel - WINGMAN.gunLevels - 2;
    const t = clamp((this.wingBombLevel - 2) / steps, 0, 1);
    return WINGMAN.bombIntervalMax + (WINGMAN.bombIntervalMin - WINGMAN.bombIntervalMax) * t;
  }

  updateWings(dt) {
    const k = damp(WINGMAN.follow, dt), H = this.game.H;
    for (const w of this.wings) {
      w.px = w.x;
      w.py = w.y;
      const ty = clamp(this.y + w.side * WINGMAN.offsetY, 10, H - GROUND_H + 24);
      w.x += (this.x + WINGMAN.offsetX - w.x) * k;
      w.y += (ty - w.y) * k;
    }
  }

  bounds() {
    const g = this.game;
    return {
      minX: g.insets.l + 22,
      maxX: g.W - g.insets.r - 30,
      minY: 22,
      maxY: g.H - GROUND_H + 4,
    };
  }

  update(dt, input) {
    this.px = this.x;
    this.py = this.y;
    this.invuln = Math.max(0, this.invuln - dt);
    const focus = input.focus;
    const maxSpeed = focus ? PLAYER.focusSpeed : PLAYER.speed;
    const b = this.bounds();

    if (this.entry > 0) {
      // Fly in from the left edge before handing over control.
      this.entry -= dt;
      const tx = b.minX + 120;
      const nx = this.x + (tx - this.x) * damp(9, dt);
      this.vx = (nx - this.x) / dt;
      this.x = nx;
      input.dragDX = input.dragDY = 0;
    } else if (input.dragDX || input.dragDY || input.dragActive) {
      // Touch-drag: ship moves 1:1 with the finger (scaled), the most precise mode.
      const sens = CONTROLS.dragSensitivity * (focus ? 0.5 : 1);
      const dx = input.dragDX * sens, dy = input.dragDY * sens;
      input.dragDX = input.dragDY = 0;
      this.x += dx;
      this.y += dy;
      const k = damp(18, dt);
      this.vx += (dx / dt - this.vx) * k;
      this.vy += (dy / dt - this.vy) * k;
    } else {
      // Analog/digital: smoothly approach the target velocity (snappy, no drift).
      const k = damp(input.analog ? PLAYER.response : PLAYER.responseDigital, dt);
      this.vx += (input.moveX * maxSpeed - this.vx) * k;
      this.vy += (input.moveY * maxSpeed - this.vy) * k;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    if (this.x < b.minX) { this.x = b.minX; if (this.vx < 0) this.vx = 0; }
    if (this.x > b.maxX) { this.x = b.maxX; if (this.vx > 0) this.vx = 0; }
    if (this.y < b.minY) { this.y = b.minY; if (this.vy < 0) this.vy = 0; }
    if (this.y > b.maxY) { this.y = b.maxY; if (this.vy > 0) this.vy = 0; }

    this.tilt += (clamp(this.vy / PLAYER.speed, -1, 1) - this.tilt) * damp(10, dt);
    this.updateWings(dt);

    this.fireCd -= dt;
    if (input.fire) {
      if (this.fireCd <= 0) {
        this.shoot(focus);
        this.fireCd += PLAYER.fireInterval;
        if (this.fireCd < 0) this.fireCd = 0;
      }
    } else if (this.fireCd < 0) this.fireCd = 0;

    this.wingBombCd -= dt;
    const bombers = Math.min(this.wingBombLevel, 2);
    if (input.fire && bombers > 0 && this.wingBombCd <= 0) {
      for (let i = 0; i < bombers; i++) {
        const w = this.wings[i];
        this.game.firePlayer(w.x + 10, w.y, WINGMAN.bombSpeed, 0, WINGMAN.bombDamage, 'wbomb');
      }
      this.game.sfx.play('wingBomb');
      this.wingBombCd = this.wingBombInterval();
    } else if (!input.fire && this.wingBombCd < 0) this.wingBombCd = 0;
  }

  shootWings(spread) {
    const g = this.game, S = PLAYER.bulletSpeed, dmg = WINGMAN.bulletDamage;
    for (let i = 0; i < this.wingCount; i++) {
      const w = this.wings[i], n = this.wingRounds(i), x = w.x + 12;
      if (n === 1) g.firePlayer(x, w.y, S, 0, dmg, 'wing');
      else if (n === 2) {
        g.firePlayer(x, w.y - 4, S, 0, dmg, 'wing');
        g.firePlayer(x, w.y + 4, S, 0, dmg, 'wing');
      } else {
        for (const a of [-0.09, 0, 0.09]) g.firePlayer(x, w.y, Math.cos(a * spread) * S, Math.sin(a * spread) * S, dmg, 'wing');
      }
    }
  }

  shoot(focus) {
    const g = this.game, S = PLAYER.bulletSpeed;
    const nx = this.x + 22, y = this.y;
    const spread = focus ? 0.35 : 1;
    const shot = (x, yy, ang, dmg) => g.firePlayer(x, yy, Math.cos(ang) * S, Math.sin(ang) * S, dmg);
    switch (this.power) {
      case 1:
        shot(nx, y, 0, 1);
        break;
      case 2:
        shot(nx, y - 6, 0, 1);
        shot(nx, y + 6, 0, 1);
        break;
      case 3:
        shot(nx, y - 6, 0, 1);
        shot(nx, y + 6, 0, 1);
        shot(this.x + 6, y - 10, -0.13 * spread, 0.7);
        shot(this.x + 6, y + 10, 0.13 * spread, 0.7);
        break;
      default:
        shot(nx + 4, y, 0, 1);
        shot(nx, y - 8, 0, 1);
        shot(nx, y + 8, 0, 1);
        shot(this.x + 6, y - 12, -0.15 * spread, 0.8);
        shot(this.x + 6, y + 12, 0.15 * spread, 0.8);
        shot(this.x, y - 14, -0.32 * spread, 0.6);
        shot(this.x, y + 14, 0.32 * spread, 0.6);
    }
    this.shootWings(spread);
    g.particles.muzzle(nx + 2, y);
    g.sfx.play('shoot');
  }
}

const HULL = [[26, 0], [8, -6], [-4, -8], [-12, -17], [-19, -16], [-13, -5], [-15, 0], [-13, 5], [-19, 16], [-12, 17], [-4, 8], [8, 6]];

const HERO_COLORS = { hull: '#c9f2ff', edge: '#4cc9f0', cockpit: '#1b3a5c' };
const WING_COLORS = { hull: '#9dffb0', edge: '#2fd05a', cockpit: '#0f3d1e' };

/** Arrowhead hull with engine flame, facing right. */
function drawShip(ctx, x, y, tilt, vx, t, scale, colors) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Engine flame grows when pushing forward, shrinks when braking.
  const thrust = 1 + clamp(vx / PLAYER.speed, -0.6, 0.9);
  const fl = (14 + Math.sin(t * 70) * 3 + Math.random() * 4) * thrust;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,120,50,0.85)';
  ctx.beginPath();
  ctx.moveTo(-13, -5);
  ctx.lineTo(-13 - fl, 0);
  ctx.lineTo(-13, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,190,0.95)';
  ctx.beginPath();
  ctx.moveTo(-13, -2.5);
  ctx.lineTo(-13 - fl * 0.55, 0);
  ctx.lineTo(-13, 2.5);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Fake banking: rotate a touch and squash vertically with vertical speed.
  ctx.rotate(tilt * 0.16);
  ctx.scale(1, 1 - Math.abs(tilt) * 0.25);
  ctx.beginPath();
  ctx.moveTo(HULL[0][0], HULL[0][1]);
  for (let i = 1; i < HULL.length; i++) ctx.lineTo(HULL[i][0], HULL[i][1]);
  ctx.closePath();
  ctx.fillStyle = colors.hull;
  ctx.fill();
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = colors.cockpit;
  ctx.beginPath();
  ctx.ellipse(7, 0, 6, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.edge;
  ctx.fillRect(-11, -14, 6, 2);
  ctx.fillRect(-11, 12, 6, 2);
  ctx.restore();
}

/** Placeholder hero ship (pale blue) plus its small green wingmen. */
export function drawPlayer(ctx, x, y, p, t, focus, alpha) {
  const blink = p.invuln > 0 && Math.floor(t * 18) % 2;
  if (blink) ctx.globalAlpha = 0.35;
  for (let i = 0; i < p.wingCount; i++) {
    const w = p.wings[i];
    drawShip(ctx, w.px + (w.x - w.px) * alpha, w.py + (w.y - w.py) * alpha, p.tilt, p.vx, t + i, 0.55, WING_COLORS);
  }
  drawShip(ctx, x, y, p.tilt, p.vx, t, 1, HERO_COLORS);
  ctx.globalAlpha = 1;

  if (focus) {
    // Reveal the true hitbox while focusing.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ff3b5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER.hitRadius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
