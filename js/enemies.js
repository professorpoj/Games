// The five enemy types: stats, attack behaviours and placeholder rendering.
import { TAU, rand, angleDiff, damp, hexToRgba } from './utils.js';

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
};

const SNIPER_AIM_TIME = 1.0;
const SNIPER_LOCK_TIME = 0.28;

export class Enemy {
  constructor(type, x, y, swarm, difficulty) {
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
  }

  /** States in which the swarm's flocking/formation forces drive this ship. */
  get steerable() {
    return this.state === 'fly' || this.state === 'aim' || this.state === 'burst';
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
  if (!p.alive && (e.state === 'aim' || e.state === 'burst' || e.state === 'windup')) {
    e.state = 'fly';
    e.fireCd = rand(def.fire[0], def.fire[1]);
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
          e.timer = 1.0;
          e.vx = Math.cos(e.aim) * sp;
          e.vy = Math.sin(e.aim) * sp;
        }
      } else if (e.state === 'dash') {
        e.timer -= dt;
        face = Math.atan2(e.vy, e.vx);
        if (Math.random() < 0.6) g.particles.trail(e.x, e.y, def.color);
        if (e.timer <= 0 || e.x < -60 || e.y < -60 || e.y > g.H + 60) {
          // Hand control back to the swarm: the accel limit makes it curve home.
          e.state = 'fly';
          e.fireCd = rand(def.fire[0], def.fire[1]);
        }
      }
      break;

    case 'spinner':
      e.spin += dt * (e.fireCd < 0.4 ? 7 : 2.4);
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
          g.fireEnemy('needle', e.x + Math.cos(e.aim) * 12, e.y + Math.sin(e.aim) * 12, e.aim, 560 * diff.speed, def.color);
          g.sfx.play('snipe');
          e.timer = 0.075;
          if (--e.burst <= 0) {
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
  }

  e.angle += angleDiff(e.angle, face) * damp(turnRate, dt);
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
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = col;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
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
  }
  ctx.restore();
}

/** Attack telegraphs, drawn under the ships so the player can read incoming attacks. */
export function drawTelegraph(ctx, e, x, y, t) {
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
