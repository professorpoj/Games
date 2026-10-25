// Enemy types: stats, attack behaviours and placeholder rendering.
import { TAU, rand, clamp, angleDiff, damp, hexToRgba, segDist2 } from './utils.js';
import { SIM_HZ } from './config.js';
import { lobBall, fireFission, launchWell, countWells, slingMace, drawSpikes, WELL } from './ordnance.js';

export const ENEMY_TYPES = {
  // Stinger: weak swarm filler, lobs loosely aimed pellets.
  drone:   { name: 'Stinger',  hp: 1,  r: 11, color: '#ff4d6d', shape: 'triangle', score: 100,  maxSpeed: 330, accel: 1100, fire: [2.2, 4.2], drop: 0.025, cost: 1 },
  // Darter: breaks formation, telegraphs, then rams the player's predicted position.
  darter:  { name: 'Darter',   hp: 2,  r: 12, color: '#ffa62b', shape: 'dart',     score: 150,  maxSpeed: 360, accel: 1300, fire: [2.5, 5.5], drop: 0.04,  cost: 1.6 },
  // Whirler: spinning hexagon that releases rotating rings of bullets.
  spinner: { name: 'Whirler',  hp: 5,  r: 15, color: '#4be08a', shape: 'hexagon',  score: 300,  maxSpeed: 240, accel: 700,  fire: [2.6, 3.8], drop: 0.1,   cost: 3 },
  // Seeker: paints the player with a laser sight, locks, then fires a needle burst.
  sniper:  { name: 'Seeker',   hp: 5,  r: 13, color: '#36d6ff', shape: 'diamond',  score: 350,  maxSpeed: 260, accel: 750,  fire: [3.2, 5.0], drop: 0.1,   cost: 3.5 },
  // Bulwark: armoured flagship, alternates spread volleys and shootable homing missiles.
  bulwark: { name: 'Bulwark',  hp: 32, r: 27, color: '#b46bff', shape: 'octagon',  score: 1500, maxSpeed: 150, accel: 320,  fire: [1.8, 2.6], drop: 1,     cost: 10 },

  // One new type arrives after each mothership battle (`debut` = first wave). Each
  // flies in its own swarm: 1 ship on its debut wave, +1 ship every wave after.
  // `space` widens formation spacing for ships with long reach.
  // Bouncer: lobs heavy balls that bounce off the real terrain and the top of the screen.
  bouncer:   { name: 'Bouncer',   hp: 3, r: 13, color: '#b6ff3b', shape: 'ball',   score: 250, maxSpeed: 280, accel: 900, fire: [2.6, 4.0], drop: 0.06, debut: 6,  paths: ['sweep', 'hold', 'weave'] },
  // Splitter: fires a fission core that splits in two, then each half splits again.
  splitter:  { name: 'Splitter',  hp: 4, r: 13, color: '#e6ecff', shape: 'split',  score: 350, maxSpeed: 260, accel: 800, fire: [3.0, 4.4], drop: 0.08, debut: 11, paths: ['hold', 'sweep'] },
  // Graviton: deploys gravity wells that drag your ship and bend every bullet nearby.
  graviton:  { name: 'Graviton',  hp: 6, r: 15, color: '#6b7bff', shape: 'well',   score: 450, maxSpeed: 220, accel: 650, fire: [5.0, 7.0], drop: 0.1,  debut: 16, paths: ['hold'] },
  // Flail: a mace on a swinging chain; it spins it up and slings it at you.
  flail:     { name: 'Flail',     hp: 6, r: 14, color: '#d08a4e', shape: 'flail',  score: 500, maxSpeed: 240, accel: 700, fire: [3.4, 5.0], drop: 0.1,  debut: 21, paths: ['hold', 'weave'], space: 30 },
  // Deflector: a mirror plate that turns to face you and bounces your own shots back.
  deflector: { name: 'Deflector', hp: 8, r: 14, color: '#3fffd0', shape: 'mirror', score: 600, maxSpeed: 230, accel: 700, fire: [9, 9],     drop: 0.12, debut: 26, paths: ['hold'], space: 26 },
};

// Flail chain: verlet point masses joined by rigid links, pinned to the ship.
const CHAIN_LINKS = 6;
const LINK_LEN = 11;
const MACE_MASS = 4;          // the head is 4x a link, so it dominates the swing
export const MACE_R = 8;
const FLAIL = {
  gravity: 420,
  drag: 0.6,                  // air drag on the chain (1/s)
  drive: 2400,                // tangential push while spinning it up
  spinSpeed: 330,             // stops pushing once the head moves this fast around the ship
  windMin: 0.6,               // always spins at least this long (the telegraph)
  windMax: 2.4,               // gives up if it never lines up
  aimTol: 0.12,               // releases when the head's velocity points this close to you
  regrow: 2.2,                // seconds to grow a new mace after a throw
};

// Deflector mirror.
const PLATE_HALF = 24;
const PLATE_OFF = 18;
const PLATE_TURN = 1.5;       // rad/s it can swing the mirror
const REFLECT = { speed: 340, cooldown: 0.15, color: '#ff8a3d' };

const SNIPER_AIM_TIME = 1.0;
const SNIPER_LOCK_TIME = 0.28;

// Enhanced ("Mk II") variants keep the normal attack but can also launch a
// special: randomly on their own, or in a pattern ordered by their swarm.
export const SPECIAL_COLOR = '#ffd23f';
const SPECIAL_CHARGE = 0.55;   // telegraph time before a special fires
const SPECIAL_CHANCE = 0.3;    // chance an attack is the special instead of the normal one
export const ENHANCED_SCORE = 2.5;

export class Enemy {
  constructor(type, x, y, swarm, difficulty, enhanced = false) {
    const def = ENEMY_TYPES[type];
    this.type = type;
    this.def = def;
    this.r = def.r;
    this.x = this.px = x;
    this.y = this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.maxHp = this.hp = type === 'drone' ? def.hp : Math.round(def.hp * difficulty.hp);
    this.swarm = swarm;
    this.slot = -1;
    this.leader = false;
    this.state = 'fly';
    this.timer = 0;
    this.fireCd = rand(def.fire[0], def.fire[1]) * 0.6 + 0.4;
    this.flash = 0;
    this.angle = Math.PI;
    this.spin = rand(TAU);
    this.seed = rand(1000);
    this.wander = rand(TAU);
    this.aim = Math.PI;
    this.burst = 0;
    this.altFire = false;
    this.visibleTime = 0;
    this.dead = false;
    this.enhanced = enhanced;
    this.specialDelay = -1;   // countdown to a swarm-ordered special
    this.specialCharge = 0;   // > 0 while telegraphing a special
    this.spiral = 0;
    this.spiralCd = 0;
    this.dashes = 0;
    this.mineCd = 0;
    this.triple = false;
    this.chain = type === 'flail' ? makeChain(x, y) : null;
    this.spinDir = 1;
    this.plate = Math.PI;     // deflector mirror normal
    this.reflectCd = 0;
    if (enhanced) {
      this.r = Math.round(def.r * 1.15);
      this.maxHp = this.hp = Math.max(this.hp + 2, Math.round(this.hp * 1.8));
    }
  }

  /** States in which the swarm's flocking/formation forces drive this ship. */
  get steerable() {
    return this.state !== 'windup' && this.state !== 'dash';
  }
}

const angleTo = (e, p) => Math.atan2(p.y - e.y, p.x - e.x);

export function updateEnemy(e, dt, g) {
  const p = g.player, def = e.def, diff = g.difficulty;
  e.flash = Math.max(0, e.flash - dt);
  const onScreen = e.x > 8 && e.x < g.W - 8 && e.y > 8 && e.y < g.H - 8;
  e.visibleTime = onScreen ? e.visibleTime + dt : 0;
  const armed = onScreen && p.alive && e.visibleTime > 0.6;
  if (armed && e.state === 'fly') e.fireCd -= dt * diff.fire;
  if (!p.alive && (e.state === 'aim' || e.state === 'burst' || e.state === 'windup' || e.state === 'wind')) {
    e.state = 'fly';
    e.fireCd = rand(def.fire[0], def.fire[1]);
  }

  if (e.enhanced) {
    // Swarm-ordered special (pattern), or a random one instead of the normal attack.
    if (e.specialDelay >= 0 && (e.specialDelay -= dt) < 0) startSpecial(e, g);
    if (armed && e.state === 'fly' && e.fireCd <= 0 && e.specialCharge <= 0 && Math.random() < SPECIAL_CHANCE) {
      e.fireCd = rand(def.fire[0], def.fire[1]);
      startSpecial(e, g);
    }
    if (e.specialCharge > 0) {
      if (!armed) e.specialCharge = 0;
      else if ((e.specialCharge -= dt) <= 0) doSpecial(e, g);
    }
  }

  // Default heading: follow velocity like a bird, otherwise face the player side.
  let face = Math.hypot(e.vx, e.vy) > 70 ? Math.atan2(e.vy, e.vx) : Math.PI;
  let turnRate = 8;

  switch (e.type) {
    case 'drone':
      if (e.state === 'fly' && e.fireCd <= 0) {
        e.fireCd = rand(def.fire[0], def.fire[1]);
        g.fireEnemy('orb', e.x - 6, e.y, angleTo(e, p) + rand(-0.18, 0.18), 165 * diff.speed, def.color);
      }
      break;

    case 'darter':
      turnRate = 14;
      if (e.state === 'fly') {
        if (e.fireCd <= 0 && g.dashers < g.maxDashers) {
          e.state = 'windup';
          e.timer = 0.55;
          g.dashers++;
          g.sfx.play('charge');
        }
      } else if (e.state === 'windup') {
        // Brake and recoil backwards while locking onto where the player is heading.
        e.timer -= dt;
        e.vx += (110 - e.vx) * damp(8, dt);
        e.vy -= e.vy * damp(8, dt);
        const tx = p.x + p.vx * 0.3, ty = p.y + p.vy * 0.3;
        e.aim = Math.atan2(ty - e.y, tx - e.x);
        face = e.aim;
        if (e.timer <= 0) {
          const sp = 620 * diff.speed;
          e.state = 'dash';
          e.timer = e.dashes ? 0.7 : 1.0;
          e.vx = Math.cos(e.aim) * sp;
          e.vy = Math.sin(e.aim) * sp;
        }
      } else if (e.state === 'dash') {
        e.timer -= dt;
        face = Math.atan2(e.vy, e.vx);
        if (Math.random() < 0.6) g.particles.trail(e.x, e.y, def.color);
        if (e.dashes && (e.mineCd -= dt) <= 0) {
          // Special: the afterburner drops a trail of hovering mines.
          e.mineCd = 0.07;
          const m = g.fireEnemy('orb', e.x, e.y, 0, 0, SPECIAL_COLOR);
          if (m) m.life = 2.2;
        }
        if (e.timer <= 0 || e.x < -60 || e.y < -60 || e.y > g.H + 60) {
          if (e.dashes > 1) {
            // Re-aim for the second leg of the special.
            e.dashes--;
            e.state = 'windup';
            e.timer = 0.3;
          } else {
            // Hand control back to the swarm: the accel limit makes it curve home.
            e.dashes = 0;
            e.state = 'fly';
            e.fireCd = rand(def.fire[0], def.fire[1]);
          }
        }
      }
      break;

    case 'spinner':
      e.spin += dt * (e.fireCd < 0.4 || e.spiral > 0 ? 7 : 2.4);
      if (e.spiral > 0) {
        // Special: three-armed spiral stream.
        e.spiral -= dt;
        if ((e.spiralCd -= dt) <= 0) {
          e.spiralCd = 0.07;
          for (let k = 0; k < 3; k++) g.fireEnemy('orb', e.x, e.y, e.spin + (k * TAU) / 3, 150 * diff.speed, SPECIAL_COLOR);
        }
        break;
      }
      if (e.state === 'fly' && e.fireCd <= 0) {
        e.fireCd = rand(def.fire[0], def.fire[1]);
        const count = 10 + Math.min(6, Math.floor(g.director.wave / 3));
        for (let i = 0; i < count; i++) {
          g.fireEnemy('orb', e.x, e.y, e.spin + (i / count) * TAU, 125 * diff.speed, def.color);
        }
        g.sfx.play('enemyShot');
      }
      break;

    case 'sniper':
      if (e.state === 'fly' && e.fireCd <= 0) {
        e.state = 'aim';
        e.timer = SNIPER_AIM_TIME;
        e.aim = angleTo(e, p);
        g.sfx.play('charge');
      } else if (e.state === 'aim') {
        e.timer -= dt;
        if (e.timer > SNIPER_LOCK_TIME) e.aim += angleDiff(e.aim, angleTo(e, p)) * damp(6, dt);
        if (e.timer <= 0) {
          e.state = 'burst';
          e.burst = 3;
          e.timer = 0;
        }
      } else if (e.state === 'burst') {
        e.timer -= dt;
        if (e.timer <= 0) {
          for (const off of e.triple ? [-0.22, 0, 0.22] : [0]) {
            const a = e.aim + off;
            g.fireEnemy('needle', e.x + Math.cos(a) * 12, e.y + Math.sin(a) * 12, a, 560 * diff.speed, e.triple ? SPECIAL_COLOR : def.color);
          }
          g.sfx.play('snipe');
          e.timer = 0.075;
          if (--e.burst <= 0) {
            e.triple = false;
            e.state = 'fly';
            e.fireCd = rand(def.fire[0], def.fire[1]);
          }
        }
      }
      if (e.state === 'aim' || e.state === 'burst') face = e.aim;
      break;

    case 'bulwark':
      face = Math.PI;
      if (e.state === 'fly' && e.fireCd <= 0) {
        e.fireCd = rand(def.fire[0], def.fire[1]);
        e.altFire = !e.altFire;
        if (e.altFire) {
          const base = angleTo(e, p), n = 5;
          for (let i = 0; i < n; i++) {
            g.fireEnemy('big', e.x - 20, e.y, base + (i - (n - 1) / 2) * 0.16, 175 * diff.speed, def.color);
          }
        } else {
          for (const side of [-1, 1]) {
            const m = g.fireEnemy('missile', e.x - 6, e.y + side * 20, Math.PI + side * 0.9, 150 * diff.speed, '#ff6ad5');
            if (m) m.hp = 2;
          }
        }
        g.sfx.play('enemyShot');
      }
      break;

    case 'bouncer':
      if (e.state === 'fly' && e.fireCd <= 0) {
        e.fireCd = rand(def.fire[0], def.fire[1]);
        lobBall(g, e);
      }
      break;

    case 'splitter':
      if (e.state === 'fly' && e.fireCd <= 0) {
        e.fireCd = rand(def.fire[0], def.fire[1]);
        fireFission(g, e.x - 10, e.y, angleTo(e, p));
      }
      break;

    case 'graviton':
      e.spin += dt * 1.5;
      if (e.state === 'fly' && e.fireCd <= 0) {
        // Only a few wells at a time, so the screen never turns into one big vortex.
        if (countWells(g) < WELL.max) {
          e.fireCd = rand(def.fire[0], def.fire[1]);
          launchWell(g, e);
        } else e.fireCd = 0.8;
      }
      break;

    case 'flail':
      updateFlail(e, dt, g);
      break;

    case 'deflector':
      // The mirror swings (at a limited rate) to face you, so your shots come straight back.
      e.reflectCd -= dt;
      if (p.alive) e.plate += clamp(angleDiff(e.plate, angleTo(e, p)), -PLATE_TURN * dt, PLATE_TURN * dt);
      face = e.plate;
      break;
  }

  e.angle += angleDiff(e.angle, face) * damp(turnRate, dt);
}

// ---------------------------------------------------------------- flail physics

function makeChain(x, y) {
  const c = [];
  for (let i = 0; i <= CHAIN_LINKS; i++) {
    const px = x + i * 3, py = y + i * LINK_LEN * 0.95;
    c.push({ x: px, y: py, ox: px, oy: py });
  }
  return c;
}

function updateFlail(e, dt, g) {
  const p = g.player, def = e.def;
  if (e.state === 'regrow') {
    if ((e.timer -= dt) <= 0) {
      e.state = 'fly';
      e.chain = makeChain(e.x, e.y);
      e.fireCd = rand(def.fire[0], def.fire[1]) * 0.5;
    }
    return;
  }
  const c = e.chain, N = CHAIN_LINKS, m = c[N];
  if (e.state === 'fly' && e.fireCd <= 0) {
    e.state = 'wind';
    e.timer = 0;
    e.spinDir = Math.random() < 0.5 ? -1 : 1;
    g.sfx.play('charge');
  }
  if (e.state === 'wind' && !p.alive) e.state = 'fly';

  // Verlet step: gravity, air drag and (while winding) a tangential push on the head.
  c[0].x = e.x;
  c[0].y = e.y;
  const keep = 1 - FLAIL.drag * dt;
  for (let i = 1; i <= N; i++) {
    const q = c[i];
    let ax = 0, ay = FLAIL.gravity;
    const vx = (q.x - q.ox) * keep, vy = (q.y - q.oy) * keep;
    if (i === N && e.state === 'wind') {
      const rx = q.x - e.x, ry = q.y - e.y, d = Math.hypot(rx, ry) || 1;
      const tx = (-ry / d) * e.spinDir, ty = (rx / d) * e.spinDir;
      // Speed around the ship = head velocity minus the ship's own velocity.
      const vt = (vx / dt - e.vx) * tx + (vy / dt - e.vy) * ty;
      if (vt < FLAIL.spinSpeed) {
        ax += tx * FLAIL.drive;
        ay += ty * FLAIL.drive;
      }
    }
    q.ox = q.x;
    q.oy = q.y;
    q.x += vx + ax * dt * dt;
    q.y += vy + ay * dt * dt;
  }
  // Rigid links, mass-weighted (the pinned end doesn't move).
  for (let it = 0; it < 8; it++) {
    for (let i = 0; i < N; i++) {
      const a = c[i], b = c[i + 1];
      const wa = i === 0 ? 0 : 1, wb = i + 1 === N ? 1 / MACE_MASS : 1;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
      const k = (d - LINK_LEN) / (d * (wa + wb));
      a.x += dx * k * wa;
      a.y += dy * k * wa;
      b.x -= dx * k * wb;
      b.y -= dy * k * wb;
    }
  }
  // The head rests on the ground instead of passing through it.
  const gy = g.bg.groundY(m.x, g.scroll) - MACE_R;
  if (m.y > gy) {
    m.y = gy;
    m.ox += (m.x - m.ox) * 0.3;
  }

  if (e.state === 'wind') {
    e.timer += dt;
    const vx = (m.x - m.ox) / dt, vy = (m.y - m.oy) / dt, sp = Math.hypot(vx, vy);
    // Release when the head is spun up and its velocity points at where you'll be.
    const T = Math.hypot(p.x - m.x, p.y - m.y) / Math.max(sp, 1);
    const want = Math.atan2(p.y + p.vy * T * 0.5 - m.y, p.x + p.vx * T * 0.5 - m.x);
    const ready = e.timer > FLAIL.windMin && sp > FLAIL.spinSpeed * 0.85;
    if (ready && Math.abs(angleDiff(Math.atan2(vy, vx), want)) < FLAIL.aimTol) {
      slingMace(g, m.x, m.y, vx, vy);
      g.sfx.play('sling');
      e.chain = null;
      e.state = 'regrow';
      e.timer = FLAIL.regrow;
      e.fireCd = rand(def.fire[0], def.fire[1]);
    } else if (e.timer > FLAIL.windMax) {
      e.state = 'fly';
      e.fireCd = rand(def.fire[0], def.fire[1]) * 0.5;
    }
  }
}

/** Head of an attached flail, or null. */
export function maceHead(e) {
  return e.type === 'flail' && e.chain ? e.chain[CHAIN_LINKS] : null;
}

/** When a flail dies its mace flies off with whatever momentum it had. */
export function onEnemyDeath(e, g) {
  const m = maceHead(e);
  if (m) slingMace(g, m.x, m.y, (m.x - m.ox) * SIM_HZ, (m.y - m.oy) * SIM_HZ);
  e.chain = null;
}

// ---------------------------------------------------------------- deflector mirror

function plate(e) {
  const nx = Math.cos(e.plate), ny = Math.sin(e.plate);
  const cx = e.x + nx * PLATE_OFF, cy = e.y + ny * PLATE_OFF;
  return { nx, ny, cx, cy, ax: cx - ny * PLATE_HALF, ay: cy + nx * PLATE_HALF, bx: cx + ny * PLATE_HALF, by: cy - nx * PLATE_HALF };
}

function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (den === 0) return false;
  const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
  const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

/** Does player bullet b strike this enemy's armour (attached mace or mirror front) first? */
export function armorHit(e, b) {
  const m = maceHead(e);
  if (m) {
    const rr = MACE_R + b.r;
    return segDist2(m.x, m.y, b.px, b.py, b.x, b.y) < rr * rr ? 'mace' : null;
  }
  if (e.type !== 'deflector') return null;
  const P = plate(e);
  if (b.vx * P.nx + b.vy * P.ny >= 0) return null; // only the mirror's face reflects
  const rr = b.r + 2;
  if (segsCross(b.px, b.py, b.x, b.y, P.ax, P.ay, P.bx, P.by) || segDist2(b.x, b.y, P.ax, P.ay, P.bx, P.by) < rr * rr) return 'plate';
  return null;
}

/**
 * Specular reflection off a moving mirror: reflect the bolt's velocity relative
 * to the mirror about its normal, then add the mirror's velocity back. The
 * returned round is slower than your bolt. One reflection per cooldown; bolts
 * arriving in between are absorbed.
 */
export function reflectBolt(g, e, b) {
  const P = plate(e);
  // Where the bolt's path crossed the mirror plane.
  const den = P.nx * (b.x - b.px) + P.ny * (b.y - b.py);
  const s = den ? clamp((P.nx * (P.cx - b.px) + P.ny * (P.cy - b.py)) / den, 0, 1) : 1;
  const hx = b.px + (b.x - b.px) * s, hy = b.py + (b.y - b.py) * s;
  g.particles.add('spark', hx, hy, P.nx * 150 + rand(-60, 60), P.ny * 150 + rand(-60, 60), 0.2, 2, REFLECT.color);
  if (e.reflectCd > 0) return;
  e.reflectCd = REFLECT.cooldown;
  const rvx = b.vx - e.vx, rvy = b.vy - e.vy;
  const vn = rvx * P.nx + rvy * P.ny;
  let ox = rvx - 2 * vn * P.nx, oy = rvy - 2 * vn * P.ny;
  const k = (REFLECT.speed * g.difficulty.speed) / (Math.hypot(ox, oy) || 1);
  ox = ox * k + e.vx;
  oy = oy * k + e.vy;
  g.fireEnemy('needle', hx + P.nx * 5, hy + P.ny * 5, Math.atan2(oy, ox), Math.hypot(ox, oy), REFLECT.color);
  g.sfx.play('reflect');
}

function startSpecial(e, g) {
  if (e.state !== 'fly' || e.specialCharge > 0 || e.spiral > 0) return;
  e.specialCharge = SPECIAL_CHARGE;
  g.sfx.play('specialCharge');
}

/** Each enhanced type's special attack. */
function doSpecial(e, g) {
  const p = g.player, diff = g.difficulty;
  g.particles.add('glow', e.x, e.y, 0, 0, 0.15, e.r * 2.2, SPECIAL_COLOR);
  switch (e.type) {
    case 'drone': {
      // Scatter fan: 5 fast rounds.
      const base = angleTo(e, p);
      for (let i = 0; i < 5; i++) g.fireEnemy('orb', e.x - 6, e.y, base + (i - 2) * 0.14, 215 * diff.speed, SPECIAL_COLOR);
      g.sfx.play('enemyShot');
      break;
    }
    case 'darter':
      // Double afterburner dash that lays mines.
      e.state = 'windup';
      e.timer = 0.35;
      e.dashes = 2;
      e.mineCd = 0;
      g.dashers++;
      break;
    case 'spinner':
      e.spiral = 1.8;
      e.spiralCd = 0;
      break;
    case 'sniper':
      // Three laser sights in a fan, then needle bursts down all three.
      e.state = 'aim';
      e.timer = SNIPER_AIM_TIME;
      e.aim = angleTo(e, p);
      e.triple = true;
      break;
    case 'bulwark': {
      // Nova: a dense ring of heavy rounds plus a missile salvo.
      for (let i = 0; i < 20; i++) g.fireEnemy('big', e.x, e.y, (i / 20) * TAU, 140 * diff.speed, SPECIAL_COLOR);
      for (const side of [-1, 1]) {
        for (const k of [0, 1]) {
          const m = g.fireEnemy('missile', e.x - 6, e.y + side * 20, Math.PI + side * (0.7 + k * 0.4), 150 * diff.speed, '#ff6ad5');
          if (m) m.hp = 2;
        }
      }
      g.sfx.play('enemyShot');
      g.shake = Math.max(g.shake, 5);
      break;
    }
  }
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function regular(ctx, sides, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

/** Placeholder art: each type gets its own primitive shape and colour. */
export function drawEnemy(ctx, e, x, y, t) {
  const def = e.def, r = def.r;
  const col = e.flash > 0 ? '#ffffff' : def.color;
  if (e.chain) drawChain(ctx, e, x - e.x, y - e.y);
  ctx.save();
  ctx.translate(x, y);
  if (e.enhanced) {
    // Mk II: gold halo with rotating ticks, larger hull, gold trim.
    ctx.strokeStyle = 'rgba(255,210,63,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 6, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + e.seed + (i * TAU) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 6, a, a + 0.5);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.scale(1.15, 1.15);
  }
  ctx.fillStyle = col;
  ctx.strokeStyle = e.enhanced ? SPECIAL_COLOR : 'rgba(255,255,255,0.6)';
  ctx.lineWidth = e.enhanced ? 2 : 1.5;
  switch (def.shape) {
    case 'triangle':
      ctx.rotate(e.angle);
      poly(ctx, [[r, 0], [-r * 0.8, -r * 0.85], [-r * 0.35, 0], [-r * 0.8, r * 0.85]]);
      ctx.fill();
      ctx.stroke();
      break;

    case 'dart': {
      ctx.rotate(e.angle);
      if (e.state === 'windup') {
        const s = 1 + Math.sin(t * 50) * 0.08;
        ctx.scale(s, s);
        ctx.fillStyle = e.flash > 0 ? '#fff' : (Math.floor(t * 20) % 2 ? '#fff3c4' : def.color);
      }
      poly(ctx, [[r * 1.35, 0], [-r * 0.2, -r * 0.42], [-r * 0.95, -r * 0.95], [-r * 0.55, 0], [-r * 0.95, r * 0.95], [-r * 0.2, r * 0.42]]);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'hexagon': {
      const pulse = e.fireCd < 0.4 && e.state === 'fly' ? 1 + (0.4 - e.fireCd) * 0.5 : 1;
      ctx.scale(pulse, pulse);
      ctx.rotate(e.spin);
      regular(ctx, 6, r);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(8,30,18,0.8)';
      regular(ctx, 6, r * 0.5, Math.PI / 6);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(-1.5, -r, 3, r * 2);
      break;
    }

    case 'diamond':
      ctx.rotate(e.angle);
      poly(ctx, [[r * 1.15, 0], [0, -r], [-r, 0], [0, r]]);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#071b26';
      ctx.beginPath();
      ctx.arc(r * 0.2, 0, r * 0.38, 0, TAU);
      ctx.fill();
      ctx.fillStyle = e.state === 'aim' && e.timer < SNIPER_LOCK_TIME ? '#ff3b5c' : '#e8fbff';
      ctx.beginPath();
      ctx.arc(r * 0.32, 0, r * 0.17, 0, TAU);
      ctx.fill();
      break;

    case 'octagon':
      ctx.rotate(Math.sin(t * 0.8 + e.seed) * 0.08);
      regular(ctx, 8, r, Math.PI / 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(30,10,50,0.75)';
      regular(ctx, 8, r * 0.62, Math.PI / 8);
      ctx.fill();
      // Frontal armour plate.
      ctx.strokeStyle = e.flash > 0 ? '#fff' : '#e3c8ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, Math.PI * 0.7, Math.PI * 1.3);
      ctx.stroke();
      ctx.fillStyle = e.flash > 0 ? '#fff' : `rgba(255,120,230,${0.6 + Math.sin(t * 6) * 0.3})`;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, TAU);
      ctx.fill();
      break;

    case 'ball':
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,40,0,0.7)';
      ctx.beginPath();
      ctx.arc(-r * 0.3, 0, r * 0.45, 0, TAU);
      ctx.fill();
      break;

    case 'split': {
      // Two halves that part as the next core is about to fire.
      const gap = 2 + Math.max(0, 0.6 - e.fireCd) * 8;
      ctx.rotate(e.angle);
      ctx.fillRect(-r, -r - gap / 2, r * 2, r - 1);
      ctx.strokeRect(-r, -r - gap / 2, r * 2, r - 1);
      ctx.fillRect(-r, gap / 2 + 1, r * 2, r - 1);
      ctx.strokeRect(-r, gap / 2 + 1, r * 2, r - 1);
      break;
    }

    case 'well':
      ctx.rotate(e.spin);
      regular(ctx, 5, r);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#05040c';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, TAU);
      ctx.fill();
      break;

    case 'flail':
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      ctx.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      break;

    case 'mirror': {
      // Body behind, mirror plate in front (its face is the bright edge).
      ctx.rotate(e.plate);
      poly(ctx, [[r * 0.6, 0], [-r, -r * 0.8], [-r * 0.5, 0], [-r, r * 0.8]]);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = e.reflectCd > 0 ? '#ffffff' : '#bafff0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(PLATE_OFF, -PLATE_HALF);
      ctx.lineTo(PLATE_OFF, PLATE_HALF);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(r * 0.4, 0);
      ctx.lineTo(PLATE_OFF, 0);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawChain(ctx, e, ox, oy) {
  const c = e.chain, m = c[CHAIN_LINKS];
  ctx.strokeStyle = '#9a8f86';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(e.x + ox, e.y + oy);
  for (let i = 1; i <= CHAIN_LINKS; i++) ctx.lineTo(c[i].x + ox, c[i].y + oy);
  ctx.stroke();
  ctx.fillStyle = e.state === 'wind' ? '#a8907a' : '#6e625a';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(m.x + ox, m.y + oy, MACE_R, 0, TAU);
  ctx.fill();
  ctx.stroke();
  drawSpikes(ctx, m.x + ox, m.y + oy, MACE_R, e.seed);
}

function drawSniperLine(ctx, e, x, y, t, a) {
  const locked = e.timer < SNIPER_LOCK_TIME;
  ctx.save();
  ctx.strokeStyle = locked ? (Math.floor(t * 30) % 2 ? '#ffffff' : SPECIAL_COLOR) : hexToRgba(SPECIAL_COLOR, 0.15 + 0.45 * (1 - e.timer / SNIPER_AIM_TIME));
  ctx.lineWidth = locked ? 2 : 1;
  if (!locked) ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(a) * 1800, y + Math.sin(a) * 1800);
  ctx.stroke();
  ctx.restore();
}

/** Attack telegraphs, drawn under the ships so the player can read incoming attacks. */
export function drawTelegraph(ctx, e, x, y, t) {
  if (e.specialCharge > 0) {
    // Special warning: a gold ring collapsing onto the ship.
    const k = e.specialCharge / SPECIAL_CHARGE;
    ctx.save();
    ctx.strokeStyle = Math.floor(t * 24) % 2 ? '#ffffff' : SPECIAL_COLOR;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, e.r + 6 + k * 26, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  if (e.type === 'sniper' && e.state === 'aim' && e.triple) {
    for (const off of [-0.22, 0.22]) drawSniperLine(ctx, e, x, y, t, e.aim + off);
  }
  if (e.type === 'sniper' && e.state === 'aim') {
    const locked = e.timer < SNIPER_LOCK_TIME;
    const len = 1800;
    ctx.save();
    if (locked) {
      ctx.strokeStyle = Math.floor(t * 30) % 2 ? '#ffffff' : '#ff3b5c';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = hexToRgba('#36d6ff', 0.15 + 0.45 * (1 - e.timer / SNIPER_AIM_TIME));
      ctx.lineWidth = 1;
      ctx.setLineDash([10, 7]);
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(e.aim) * len, y + Math.sin(e.aim) * len);
    ctx.stroke();
    ctx.restore();
  } else if (e.type === 'flail' && e.state === 'wind' && e.chain) {
    // The head's current flight line sweeps around like a lighthouse: it's thrown along it.
    const m = e.chain[CHAIN_LINKS], ox = x - e.x, oy = y - e.y;
    const vx = m.x - m.ox, vy = m.y - m.oy, v = Math.hypot(vx, vy) || 1;
    ctx.save();
    ctx.strokeStyle = hexToRgba('#d08a4e', 0.2 + 0.5 * clamp(e.timer / FLAIL.windMin, 0, 1));
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(m.x + ox, m.y + oy);
    ctx.lineTo(m.x + ox + (vx / v) * 180, m.y + oy + (vy / v) * 180);
    ctx.stroke();
    ctx.restore();
  } else if (e.type === 'darter' && e.state === 'windup') {
    ctx.save();
    ctx.strokeStyle = hexToRgba('#ffa62b', 0.35 + Math.sin(t * 40) * 0.25);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(e.aim) * 160, y + Math.sin(e.aim) * 160);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, e.r + 6 + e.timer * 30, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
