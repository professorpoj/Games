import { PLAYER, CONTROLS, GROUND_H, WINGMAN, SHIELD } from './config.js';
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
    this.shield = 1;        // meter, 0..1
    this.shieldOn = false;
    // [0] flies above the ship, [1] below.
    // level 0 = no wingman in that slot.
    this.wings = [-1, 1].map((side) => ({ side, level: 0, x: 0, y: 0, px: 0, py: 0, bombCd: 0, invuln: 0 }));
    this.lastWingUpgraded = 1;
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
    this.shieldOn = false;
    for (const w of this.wings) {
      w.x = w.px = this.x;
      w.y = w.py = this.y;
      w.bombCd = 0;
    }
  }

  /** Tap to raise, tap again to drop early. */
  toggleShield() {
    if (this.shieldOn) {
      this.shieldOn = false;
      this.game.sfx.play('shieldDown');
    } else if (this.alive && this.shield >= SHIELD.minToActivate) {
      this.shieldOn = true;
      this.game.sfx.play('shieldUp');
    }
  }

  updateShield(dt) {
    if (this.shieldOn) {
      this.shield -= dt / SHIELD.duration;
      if (this.shield <= 0) {
        this.shield = 0;
        this.shieldOn = false;
        this.game.sfx.play('shieldDown');
      }
    } else {
      this.shield = Math.min(1, this.shield + dt / (SHIELD.duration * SHIELD.rechargeRatio));
    }
  }

  // ---- wingmen

  clearWings() {
    for (const w of this.wings) w.level = 0;
    this.lastWingUpgraded = 1;
  }

  /**
   * Apply one W pickup: the weaker wingman gets it (so a lost wingman is rebuilt
   * first); on a tie the upgrade goes to the one that didn't get the last one.
   * Returns the upgraded wingman, or null when both are maxed.
   */
  addWingLevel() {
    const [a, b] = this.wings;
    let i;
    if (a.level !== b.level) i = a.level < b.level ? 0 : 1;
    else i = this.lastWingUpgraded === 0 ? 1 : 0;
    const w = this.wings[i];
    if (w.level >= WINGMAN.maxLevel) return null;
    if (w.level === 0) {
      w.x = w.px = this.x;
      w.y = w.py = this.y;
      w.invuln = WINGMAN.spawnInvuln;
      w.bombCd = 0;
    }
    w.level++;
    this.lastWingUpgraded = i;
    return w;
  }

  wingBombInterval(w) {
    const t = clamp((w.level - WINGMAN.maxRounds - 1) / (WINGMAN.maxLevel - WINGMAN.maxRounds - 1), 0, 1);
    return WINGMAN.bombIntervalMax + (WINGMAN.bombIntervalMin - WINGMAN.bombIntervalMax) * t;
  }

  updateWings(dt) {
    const k = damp(WINGMAN.follow, dt), H = this.game.H;
    for (const w of this.wings) {
      w.px = w.x;
      w.py = w.y;
      w.invuln = Math.max(0, w.invuln - dt);
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
      const sens = CONTROLS.dragSensitivity;
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
      this.vx += (input.moveX * PLAYER.speed - this.vx) * k;
      this.vy += (input.moveY * PLAYER.speed - this.vy) * k;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    if (this.x < b.minX) { this.x = b.minX; if (this.vx < 0) this.vx = 0; }
    if (this.x > b.maxX) { this.x = b.maxX; if (this.vx > 0) this.vx = 0; }
    if (this.y < b.minY) { this.y = b.minY; if (this.vy < 0) this.vy = 0; }
    if (this.y > b.maxY) { this.y = b.maxY; if (this.vy > 0) this.vy = 0; }

    this.tilt += (clamp(this.vy / PLAYER.speed, -1, 1) - this.tilt) * damp(10, dt);
    this.updateWings(dt);
    this.updateShield(dt);

    this.fireCd -= dt;
    if (input.fire) {
      if (this.fireCd <= 0) {
        this.shoot();
        this.fireCd += PLAYER.fireInterval;
        if (this.fireCd < 0) this.fireCd = 0;
      }
    } else if (this.fireCd < 0) this.fireCd = 0;

    for (const w of this.wings) {
      if (w.level <= WINGMAN.maxRounds) continue;
      w.bombCd -= dt;
      if (input.fire && w.bombCd <= 0) {
        this.game.firePlayer(w.x + 10, w.y, WINGMAN.bombSpeed, 0, WINGMAN.bombDamage, 'wbomb');
        this.game.sfx.play('wingBomb');
        w.bombCd = this.wingBombInterval(w);
      } else if (!input.fire && w.bombCd < 0) w.bombCd = 0;
    }
  }

  shootWings() {
    const g = this.game, S = PLAYER.bulletSpeed, dmg = WINGMAN.bulletDamage;
    for (const w of this.wings) {
      if (!w.level) continue;
      const n = Math.min(w.level, WINGMAN.maxRounds), x = w.x + 12;
      if (n === 1) g.firePlayer(x, w.y, S, 0, dmg, 'wing');
      else if (n === 2) {
        g.firePlayer(x, w.y - 4, S, 0, dmg, 'wing');
        g.firePlayer(x, w.y + 4, S, 0, dmg, 'wing');
      } else {
        for (const a of [-0.09, 0, 0.09]) g.firePlayer(x, w.y, Math.cos(a) * S, Math.sin(a) * S, dmg, 'wing');
      }
    }
  }

  shoot() {
    const g = this.game, S = PLAYER.bulletSpeed;
    const nx = this.x + 22, y = this.y;
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
        shot(this.x + 6, y - 10, -0.13, 0.7);
        shot(this.x + 6, y + 10, 0.13, 0.7);
        break;
      default:
        shot(nx + 4, y, 0, 1);
        shot(nx, y - 8, 0, 1);
        shot(nx, y + 8, 0, 1);
        shot(this.x + 6, y - 12, -0.15, 0.8);
        shot(this.x + 6, y + 12, 0.15, 0.8);
        shot(this.x, y - 14, -0.32, 0.6);
        shot(this.x, y + 14, 0.32, 0.6);
    }
    this.shootWings();
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
export function drawPlayer(ctx, x, y, p, t, alpha) {
  const blinking = (inv) => inv > 0 && Math.floor(t * 18) % 2;
  p.wings.forEach((w, i) => {
    if (!w.level) return;
    ctx.globalAlpha = blinking(Math.max(w.invuln, p.invuln)) ? 0.35 : 1;
    drawShip(ctx, w.px + (w.x - w.px) * alpha, w.py + (w.y - w.py) * alpha, p.tilt, p.vx, t + i, 0.55, WING_COLORS);
  });
  ctx.globalAlpha = blinking(p.invuln) ? 0.35 : 1;
  drawShip(ctx, x, y, p.tilt, p.vx, t, 1, HERO_COLORS);
  ctx.globalAlpha = 1;
}
