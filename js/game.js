import {
  VIEW_H, MIN_ASPECT, MAX_ASPECT, MAX_DPR, SCROLL_SPEED, PLAYER,
  ENEMY_BULLET_CAP, BULLET_DENSITY, EXTRA_LIFE_EVERY, PULSE, BOMB, CHAIN_WINDOW, WINGMAN, SHIELD, OVERDRIVE, P_DROP_RATE, HOMING, MOTHERSHIP,
} from './config.js';
import { Pool, compact, clamp, rand, damp, segDist2, TAU } from './utils.js';
import { Input } from './input.js';
import { Player, drawPlayer } from './player.js';
import { Background } from './background.js';
import { Particles } from './particles.js';
import { Sprites } from './sprites.js';
import { Director } from './director.js';
import { Mothership } from './mothership.js';
import { makeVehicle } from './vehicles.js';
import { HEAVY, updateHeavy, drawHeavy, drawHeavyWarnings, fizzle, blast } from './projectiles.js';
import { updateEnemy, drawEnemy, drawTelegraph, ENHANCED_SCORE, armorHit, reflectBolt, maceHead, onEnemyDeath, MACE_R } from './enemies.js';
import { ORDNANCE, ORDNANCE_R, updateOrdnance, applyWells, wellPull, drawOrdnance, splitFission } from './ordnance.js';
import { Sfx } from './audio.js';
import { drawHud, drawControls } from './hud.js';

const BULLET_R = { orb: 5, big: 8, needle: 3.5, missile: 6, ...ORDNANCE_R };
const POWERUP_COLOR = { P: '#ffd23f', B: '#ff5fd2', W: '#5dff7a', H: '#ff7b3a' };
const PLAYER_SHOT_R = { shot: 5, orange: 5, red: 5, wing: 4, wblue: 4, worange: 4, wred: 4, wbomb: 7, pmissile: 5, pbomb: 6 };
const WING_BOLT_COLOR = { wing: '#5dff7a', wblue: '#4cc9f0', worange: '#ff9a2e', wred: '#ff3b3b' };
const NEON = '#ff3ec8';
const STORE = 'swarmbreaker.v1';

/** Does segment (x0,y0)-(x1,y1) cross the box [bx0,bx1] x [by0,by1]? (slab test) */
function segHitsBox(x0, y0, x1, y1, bx0, by0, bx1, by1) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - bx0], [dx, bx1 - x0], [-dy, y0 - by0], [dy, by1 - y0]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
}

export class Game {
  constructor(canvas, safeProbe) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.safeProbe = safeProbe;
    this.W = 960;
    this.H = VIEW_H;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.insets = { l: 0, r: 0, t: 0, b: 0 };

    const saved = load();
    this.hiScore = saved.hiScore || 0;
    this.settings = { mode: 'stick', autoFire: false, sound: true, ...(saved.settings || {}) };

    this.sfx = new Sfx();
    this.sfx.enabled = this.settings.sound;
    this.input = new Input(this);
    this.input.mode = this.settings.mode;
    this.bg = new Background();
    this.particles = new Particles();
    this.sprites = new Sprites();
    this.player = new Player(this);
    this.difficulty = { fire: 1, speed: 1, hp: 1 };
    this.maxDashers = 2;
    this.dashers = 0;
    this.enemiesOnScreen = 0;
    this.fireMul = 1;
    this.bulletLoad = 0;
    this.director = new Director(this);
    this.swarms = [];
    this.enemies = [];
    this.vehicles = [];
    this.pBullets = new Pool(() => ({}));
    this.eBullets = new Pool(() => ({}));
    this.powerups = new Pool(() => ({}));

    this.state = 'title';
    this.time = 0;
    this.scroll = this.prevScroll = 0;
    this.shake = 0;
    this.flash = 0;
    this.timeScale = 1;
    this.banner = null;
    this.pulse = null;
    this.mothership = null;
    this.debug = /[?&]debug/.test(location.search);
    this.fps = 60;
    this.onStateChange = null;

    this.resize();
    this.newGame(true);
  }

  // ---------------------------------------------------------------- setup

  persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ hiScore: this.hiScore, settings: this.settings }));
    } catch {
      /* storage unavailable (private mode) */
    }
  }

  toggleSetting(key) {
    const s = this.settings;
    if (key === 'mode') s.mode = s.mode === 'stick' ? 'drag' : 'stick';
    else s[key] = !s[key];
    this.input.mode = s.mode;
    this.sfx.enabled = s.sound;
    this.persist();
  }

  resize() {
    const cssW = window.innerWidth, cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const c = this.canvas;
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.width = Math.max(1, Math.round(cssW * dpr));
    c.height = Math.max(1, Math.round(cssH * dpr));
    const aspect = clamp(cssW / cssH, MIN_ASPECT, MAX_ASPECT);
    this.H = VIEW_H;
    this.W = Math.round(VIEW_H * aspect);
    this.scale = Math.min(c.width / this.W, c.height / this.H);
    this.ox = (c.width - this.W * this.scale) / 2;
    this.oy = (c.height - this.H * this.scale) / 2;

    // Safe-area insets (notches / home indicator) converted to logical units.
    const cssPerUnit = this.scale / dpr;
    const cs = this.safeProbe ? getComputedStyle(this.safeProbe) : null;
    const inset = (prop) => (cs ? (parseFloat(cs[prop]) || 0) / cssPerUnit : 0);
    this.insets = { l: inset('paddingLeft'), r: inset('paddingRight'), t: inset('paddingTop'), b: inset('paddingBottom') };

    this.bg.build(this.W, this.H, this.scale);
    this.sprites.reset(this.scale);
    this.input.layout();
  }

  toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const k = this.canvas.width / rect.width;
    return {
      x: ((clientX - rect.left) * k - this.ox) / this.scale,
      y: ((clientY - rect.top) * k - this.oy) / this.scale,
    };
  }

  setState(s) {
    this.state = s;
    this.sfx.setLaser(0);
    this.input.reset();
    this.onStateChange?.(s);
  }

  newGame(demo) {
    this.swarms.length = 0;
    this.enemies.length = 0;
    this.vehicles.length = 0;
    this.pBullets.clear();
    this.eBullets.clear();
    this.powerups.clear();
    this.particles.clear();
    this.score = 0;
    this.lives = PLAYER.startLives;
    this.pulses = PLAYER.startPulses;
    this.chain = 0;
    this.chainTimer = 0;
    this.nextLife = EXTRA_LIFE_EVERY;
    this.banner = null;
    this.pulse = null;
    this.mothership = null;
    this.gameOverTimer = 0;
    this.timeScale = 1;
    this.fireMul = 1;
    this.player.power = 1;
    this.player.overdrive = 0;
    this.player.laser = 0;
    this.player.clearWings();
    this.player.homing = 0;
    this.player.missileCd = 0;
    this.player.bombCd = 0;
    this.player.shield = 1;
    this.player.shieldOn = false;
    this.director.reset(demo);
    if (demo) {
      this.player.alive = false;
      this.player.respawnTimer = 0;
    } else this.player.spawn();
  }

  start() {
    this.newGame(false);
    this.setState('playing');
  }

  toTitle() {
    this.newGame(true);
    this.setState('title');
  }

  pause() {
    if (this.state === 'playing') this.setState('paused');
  }

  resume() {
    if (this.state === 'paused') this.setState('playing');
  }

  endGame() {
    if (this.score > this.hiScore) this.hiScore = this.score;
    this.persist();
    this.setState('gameover');
  }

  spawnVehicle(type) {
    this.vehicles.push(makeVehicle(this, type));
  }

  /** Called by vehicles when destroyed (v = null for a single train car). */
  onVehicleDestroyed(v, score, x, y) {
    if (this.player.alive) this.addScore(score, x, y);
    this.shake = Math.max(this.shake, v ? 12 : 6);
    this.sfx.play('bigExplode');
    if (Math.random() < HOMING.dropChance) this.spawnPowerup('H', x + 15, y - 30);
    if (!v) return;
    if (v.kind === 'tank') {
      this.maybeDropP(x, y - 20);
      if (Math.random() < 0.4) this.spawnPowerup('W', x + 20, y - 40);
    } else if (v.kind === 'train') {
      this.spawnPowerup('W', x, y - 30);
      this.maybeDropP(x - 30, y - 20);
    } else this.maybeDropP(x, y - 20, 0.35);
  }

  startMothership(visit) {
    this.mothership = new Mothership(this, visit);
    this.showBanner('WARNING', visit === 1 ? 'MOTHERSHIP APPROACHING' : `MOTHERSHIP RETURNS · MK ${visit}`);
    this.sfx.play('alarm');
  }

  showBanner(text, sub = '') {
    this.banner = { text, sub, t: 0, dur: 2.4 };
  }

  multiplier() {
    return 1 + Math.min(Math.max(this.chain - 1, 0), 40) * 0.05;
  }

  // ---------------------------------------------------------------- spawning

  firePlayer(x, y, vx, vy, dmg, kind = 'shot') {
    const b = this.pBullets.spawn();
    b.kind = kind;
    b.x = b.px = x;
    b.y = b.py = y;
    b.vx = vx;
    b.vy = vy;
    b.dmg = dmg;
    b.r = PLAYER_SHOT_R[kind];
    return b;
  }

  fireEnemy(kind, x, y, ang, speed, color) {
    if (this.eBullets.list.length >= ENEMY_BULLET_CAP) return null;
    const b = this.eBullets.spawn();
    b.kind = kind;
    b.x = b.px = x;
    b.y = b.py = y;
    b.vx = Math.cos(ang) * speed;
    b.vy = Math.sin(ang) * speed;
    b.speed = speed;
    b.r = BULLET_R[kind];
    b.color = color;
    b.life = kind === 'missile' ? 6 : 14;
    b.hp = 0;
    b.t = 0;
    return b;
  }

  /** Roll for a P pickup: `chance` is scaled by P_DROP_RATE so P stays rare. */
  maybeDropP(x, y, chance = 1) {
    if (Math.random() < chance * P_DROP_RATE) this.spawnPowerup('P', x, y);
  }

  spawnPowerup(kind, x, y) {
    const u = this.powerups.spawn();
    u.kind = kind;
    u.x = u.px = x;
    u.y = u.py = y;
    u.vx = -30;
    u.vy = rand(-60, 60);
    u.t = 0;
  }

  // ---------------------------------------------------------------- combat events

  addScore(base, x, y) {
    this.chain++;
    this.chainTimer = CHAIN_WINDOW;
    const pts = Math.round((base * this.multiplier()) / 10) * 10;
    this.score += pts;
    this.particles.text(x, y - 12, String(pts), this.chain > 10 ? '#ffd23f' : '#ffffff', 12 + Math.min(this.chain, 20) * 0.3);
    if (this.score >= this.nextLife) {
      this.nextLife += EXTRA_LIFE_EVERY;
      this.lives++;
      this.showBanner('EXTRA SHIP');
      this.sfx.play('extra');
    }
  }

  damageEnemy(e, dmg, hx, hy) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.06;
    this.particles.hit(hx, hy, e.def.color);
    if (e.hp <= 0) this.killEnemy(e);
    else this.sfx.play('hit');
  }

  killEnemy(e) {
    const big = e.type === 'bulwark';
    onEnemyDeath(e, this);
    this.particles.explosion(e.x, e.y, e.def.color, big ? 3 : e.r / 12);
    this.sfx.play(big ? 'bigExplode' : 'explode');
    this.shake = Math.max(this.shake, big ? 12 : 2.5);
    if (this.player.alive) this.addScore(e.def.score * (e.enhanced ? ENHANCED_SCORE : 1), e.x, e.y);
    if (big) {
      this.maybeDropP(e.x, e.y);
      if (Math.random() < 0.4) this.spawnPowerup('B', e.x, e.y + 20);
    } else {
      // P and B roll separately so only P gets rarer (B keeps its old rate).
      const drop = e.def.drop * (e.enhanced ? 2 : 1);
      this.maybeDropP(e.x, e.y, drop * 0.72);
      if (Math.random() < drop * 0.28) this.spawnPowerup('B', e.x, e.y);
    }
    // Very rare homing-missile pickup from any enemy.
    if (Math.random() < HOMING.dropChance) this.spawnPowerup('H', e.x, e.y + 20);
    // Rare wingman pickup (flagships drop one half the time).
    if (Math.random() < (big ? 0.5 : e.def.drop * WINGMAN.dropMul)) this.spawnPowerup('W', e.x, e.y - 20);
    const wiped = e.swarm.remove(e, true);
    if (wiped && this.player.alive && e.swarm.total >= 4) {
      const bonus = e.swarm.total * 100;
      this.score += bonus;
      this.particles.text(e.x, e.y - 34, `SWARM WIPED +${bonus}`, '#7dffcf', 15);
      this.maybeDropP(e.x, e.y, 0.5);
    }
  }

  killPlayer() {
    const p = this.player;
    p.alive = false;
    p.respawnTimer = PLAYER.respawnDelay;
    this.particles.explosion(p.x, p.y, '#9fe8ff', 2.4);
    this.particles.ring(p.x, p.y, '#ffffff', 10, 140, 0.6, 4);
    this.sfx.play('playerDie');
    this.shake = 16;
    this.flash = 0.35;
    this.timeScale = 0.3;
    try {
      navigator.vibrate?.(120);
    } catch {
      /* unsupported */
    }
    this.lives--;
    // Losing a ship costs weapon power, and each wingman takes the same hit as
    // being shot down (survivors rejoin when the ship respawns).
    for (const w of p.wings) if (w.level) this.wingmanHit(w);
    p.losePowerLevels(PLAYER.deathPowerLoss);
    this.chain = 0;
    if (this.lives <= 0) this.gameOverTimer = 2;
  }

  usePulse() {
    const p = this.player;
    if (!p.alive || this.pulses <= 0 || this.pulse) return;
    this.pulses--;
    // The pulse only hits enemy ships; bullets are the shield's job.
    this.pulse = { x: p.x, y: p.y, r: 0, t: 0, dur: 0.75, hit: new Set() };
    this.shake = 12;
    this.flash = 0.25;
    this.sfx.play('pulse');
  }

  /** Let go of a dumb bomb: it keeps the ship's velocity at the moment of release. */
  dropBomb() {
    const p = this.player;
    if (!p.alive || p.entry > 0 || p.bombCd > 0) return;
    p.bombCd = BOMB.cooldown;
    this.firePlayer(p.x - 4, p.y + 9, p.vx, p.vy, 0, 'pbomb');
    this.sfx.play('bombDrop');
  }

  /**
   * Dumb bomb impact. Damage scales linearly with distance from the impact point
   * (measured to each target's nearest edge): BOMB.mul x the pulse at 0, nothing
   * at BOMB.radius. The blast also shoves enemy ships and rocks vehicles.
   */
  bombBlast(x, y) {
    const R = BOMB.radius, M = BOMB.mul;
    const scale = (d) => Math.max(0, 1 - d / R);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, dist = Math.hypot(dx, dy) || 1;
      const k = scale(Math.max(0, dist - e.r));
      if (k <= 0) continue;
      e.vx += (dx / dist) * BOMB.knockback * k;
      e.vy += (dy / dist) * BOMB.knockback * k;
      this.damageEnemy(e, PULSE.damage * M * k, e.x, e.y);
    }
    for (const v of this.vehicles) {
      const kicked = new Set();
      for (const part of v.parts) {
        if (!part.alive) continue;
        const bx = v.box(part);
        const cx = clamp(x, bx.x0, bx.x1), cy = clamp(y, bx.y0, bx.y1);
        const k = scale(Math.hypot(x - cx, y - cy));
        if (k <= 0) continue;
        v.damage(part, PULSE.vehicleDamage * M * k, cx, cy);
        if (!kicked.has(part.ch)) {
          // Shock under the suspension: bounce the body and pitch it away from the blast.
          kicked.add(part.ch);
          part.ch.vy -= 260 * k;
          part.ch.pv += Math.sign(part.ch.x - x || 1) * 2.5 * k;
        }
      }
    }
    const ms = this.mothership;
    if (ms && ms.state === 'fight') {
      const ex = (x - ms.x) / MOTHERSHIP.rx, ey = (y - ms.y) / MOTHERSHIP.ry, q = Math.hypot(ex, ey);
      const dist = Math.hypot(x - ms.x, y - ms.y);
      const k = scale(q <= 1 ? 0 : dist * (1 - 1 / q));
      if (k > 0) ms.damage(PULSE.bossDamage * M * k, x, y);
    }
    // Fireball plus a ring showing the full damage radius, and dirt thrown up.
    blast(this, x, y, 72, '#ffb347', false);
    this.particles.ring(x, y, '#ffe2a8', 10, R, 0.45, 3);
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI / 2 + rand(-1.1, 1.1), s = rand(180, 520);
      this.particles.add('debris', x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.6, 1.1), rand(3, 6), '#5a4650');
    }
    this.shake = Math.max(this.shake, 16);
    this.flash = Math.max(this.flash, 0.18);
  }

  clearEnemyBullets(sparkle) {
    for (const b of this.eBullets.list) {
      if (sparkle) this.particles.add('glow', b.x, b.y, 0, -30, 0.4, 6, '#ffd23f');
      b.dead = true;
    }
  }

  // ---------------------------------------------------------------- simulation

  realtime(dt) {
    // Slow-motion recovers in real time so it feels the same at any frame rate.
    this.timeScale += (1 - this.timeScale) * damp(2.5, dt);
    if (this.timeScale > 0.995) this.timeScale = 1;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
  }

  step(dt) {
    if (this.state === 'paused') return;
    this.time += dt;
    this.prevScroll = this.scroll;
    this.scroll += SCROLL_SPEED * dt;

    const input = this.input;
    input.poll();
    if (this.state === 'playing') {
      if (input.consumePause()) {
        this.pause();
        return;
      }
      if (input.consumePulse()) this.usePulse();
      if (input.consumeBomb()) this.dropBomb();
      if (input.consumeShield()) this.player.toggleShield();
    } else {
      input.consumePulse();
      input.consumeBomb();
      input.consumeShield();
    }

    this.updatePlayer(dt);
    this.updateLasers(dt);
    this.updateFireMul();
    this.director.update(dt);
    for (const s of this.swarms) s.update(dt);
    for (const v of this.vehicles) v.update(dt);
    if (this.mothership) {
      this.mothership.update(dt);
      if (this.mothership.done) this.mothership = null;
    }
    this.updateEnemies(dt);
    this.updateBullets(dt);
    applyWells(this, dt);
    this.updatePowerups(dt);
    this.updatePulse(dt);
    this.collide();
    this.particles.update(dt);
    this.bg.tick(dt);

    compact(this.enemies);
    compact(this.swarms);
    compact(this.vehicles);
    this.pBullets.sweep();
    this.eBullets.sweep();
    this.powerups.sweep();

    if (this.chainTimer > 0 && (this.chainTimer -= dt) <= 0) this.chain = 0;
    if (this.banner && (this.banner.t += dt) >= this.banner.dur) this.banner = null;
    this.shake *= Math.exp(-dt * 9);
    this.flash = Math.max(0, this.flash - dt);
    if (this.gameOverTimer > 0 && (this.gameOverTimer -= dt) <= 0 && this.state === 'playing') this.endGame();
  }

  updatePlayer(dt) {
    const p = this.player;
    if (p.alive) {
      // Gravity wells drag the ship along like a current.
      [p.pullX, p.pullY] = wellPull(this, p.x, p.y);
      p.update(dt, this.input);
      return;
    }
    p.px = p.x;
    p.py = p.y;
    if (this.state === 'playing' && this.lives > 0 && p.respawnTimer > 0 && (p.respawnTimer -= dt) <= 0) {
      p.spawn();
      this.pulses = Math.max(this.pulses, PLAYER.startPulses);
      this.clearEnemyBullets(true);
    }
  }

  // ---------------------------------------------------------------- homing missiles

  /** On-screen targets (enemies, vehicle parts, the mothership), nearest first. */
  targetsByDistance(x, y) {
    const list = [];
    const add = (t, tx, ty) => list.push({ ...t, d: (tx - x) ** 2 + (ty - y) ** 2 });
    for (const e of this.enemies) if (!e.dead && e.x > 0 && e.x < this.W + 10 && e.y > 0 && e.y < this.H) add({ type: 'e', ref: e }, e.x, e.y);
    for (const v of this.vehicles) {
      if (v.dead || v.dying) continue;
      for (const part of v.parts) if (part.alive && part.ch.x > 0 && part.ch.x < this.W) add({ type: 'v', ref: part, v }, part.ch.x, part.ch.y);
    }
    const ms = this.mothership;
    if (ms && ms.state === 'fight') add({ type: 'm', ref: ms }, ms.x - MOTHERSHIP.rx * 0.5, ms.y);
    return list.sort((a, b) => a.d - b.d);
  }

  targetPos(t) {
    if (!t) return null;
    if (t.type === 'e') return t.ref.dead ? null : t.ref;
    if (t.type === 'v') return t.v.dead || t.v.dying || !t.ref.alive ? null : { x: t.ref.ch.x, y: t.ref.ch.y - t.ref.top / 2 };
    const ms = t.ref;
    return ms === this.mothership && ms.state === 'fight' ? { x: ms.x - MOTHERSHIP.rx * 0.5, y: ms.y } : null;
  }

  /** A fanned salvo; each missile takes one of the nearest targets. */
  fireHomingSalvo(x, y, n) {
    const targets = this.targetsByDistance(x, y);
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.5;
      const b = this.firePlayer(x, y + (i - (n - 1) / 2) * 6, Math.cos(a) * 260, Math.sin(a) * 260, HOMING.damage, 'pmissile');
      b.tgt = targets.length ? targets[i % targets.length] : null;
      b.t = 0;
      b.life = HOMING.life;
      b.ang = a;
    }
    this.particles.add('glow', x, y, 0, 0, 0.1, 14, '#ffb03b');
    this.sfx.play('playerMissile');
  }

  steerMissile(b, dt) {
    b.t += dt;
    let pos = this.targetPos(b.tgt);
    if (!pos) {
      // Target gone: lock onto whatever is now nearest.
      b.tgt = this.targetsByDistance(b.x, b.y)[0] || null;
      pos = this.targetPos(b.tgt);
    }
    if (pos && b.t > 0.12) {
      const want = Math.atan2(pos.y - b.y, pos.x - b.x);
      let d = want - b.ang;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      b.ang += clamp(d, -HOMING.turn * dt, HOMING.turn * dt);
    }
    const sp = Math.min(HOMING.speed, 260 + b.t * 900);
    b.vx = Math.cos(b.ang) * sp;
    b.vy = Math.sin(b.ang) * sp;
    if (Math.random() < 0.7) this.particles.add('glow', b.x - b.vx * 0.02, b.y - b.vy * 0.02, 0, 0, 0.18, 5, '#ffb03b');
    if (Math.random() < 0.35) this.particles.smoke(b.x, b.y, rand(-10, 10), rand(-10, 10), 2, 0.6, '#c9c2d6');
    if ((b.life -= dt) <= 0) {
      b.dead = true;
      this.particles.explosion(b.x, b.y, '#ffb03b', 0.4);
    }
  }

  missileBurst(b) {
    if (b.kind !== 'pmissile') return;
    this.particles.explosion(b.x, b.y, '#ffb03b', 0.7);
    this.particles.ring(b.x, b.y, '#ffd27a', 4, 26, 0.25, 3);
  }

  /** Neon laser chains: continuous damage to everything along each beam. */
  updateLasers(dt) {
    const p = this.player;
    this.sfx.setLaser(p.alive && this.state === 'playing' ? p.laser : 0);
    if (!p.alive || p.laser <= 0) return;
    for (const [x0, y0, ang, dmg, width] of p.laserSources()) {
      const hw = OVERDRIVE.laserHalfWidth * width;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const x1 = x0 + dx * 1600, y1 = y0 + dy * 1600;
      const burn = dmg * (1 / PLAYER.fireInterval) * p.laser * dt;
      const contact = (x, y) => {
        const t = Math.max(0, (x - x0) * dx + (y - y0) * dy);
        return [x0 + dx * t, y0 + dy * t];
      };
      for (const e of this.enemies) {
        if (e.dead || e.x > this.W + e.r) continue;
        const rr = e.r + hw;
        if (segDist2(e.x, e.y, x0, y0, x1, y1) < rr * rr) this.burnEnemy(e, burn, ...contact(e.x, e.y));
      }
      for (const b of this.eBullets.list) {
        if (b.dead || b.hp <= 0) continue;
        const rr = b.r + hw;
        if (segDist2(b.x, b.y, x0, y0, x1, y1) < rr * rr && (b.hp -= burn) <= 0) {
          b.dead = true;
          if (b.kind === 'fission' && splitFission(this, b)) continue;
          if (HEAVY.has(b.kind)) fizzle(this, b);
          else this.particles.explosion(b.x, b.y, '#ff6ad5', 0.5);
        }
      }
      for (const v of this.vehicles) {
        for (const part of v.parts) {
          if (!part.alive) continue;
          const bx = v.box(part);
          if (segHitsBox(x0, y0, x1, y1, bx.x0 - hw, bx.y0 - hw, bx.x1 + hw, bx.y1 + hw)) {
            const [cx, cy] = contact((bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2);
            v.damage(part, burn, cx, cy, true);
            this.torch(cx, cy);
          }
        }
      }
      const ms = this.mothership;
      if (ms && ms.state === 'fight') {
        for (let s = 0; s < 1600; s += 8) {
          const sx = x0 + dx * s, sy = y0 + dy * s;
          if (ms.hits(sx, sy, hw)) {
            ms.damage(burn, sx, sy, true);
            this.torch(sx, sy);
            break;
          }
        }
      }
    }
  }

  burnEnemy(e, dmg, hx, hy) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = Math.max(e.flash, 0.03);
    this.torch(hx, hy);
    if (e.hp <= 0) this.killEnemy(e);
  }

  /** Molten sparks, embers and smoke where the laser is cutting. */
  torch(x, y) {
    const P = this.particles;
    if (Math.random() < 0.5) P.add('spark', x, y, rand(-200, 60), rand(-160, 160), rand(0.12, 0.25), 2, Math.random() < 0.5 ? NEON : '#ffd27a');
    if (Math.random() < 0.15) P.ember(x, y, rand(-80, 40), rand(-140, -40), rand(0.4, 0.8), 2.5, '#ffb347');
    if (Math.random() < 0.08) P.smoke(x, y, rand(-60, -20), rand(-40, -10), 4, 0.6, '#3a2f3f');
    if (Math.random() < 0.3) P.add('glow', x, y, 0, 0, 0.08, 14, NEON);
  }

  /** Hostiles currently inside the viewport (air enemies, vehicles, the mothership). */
  countEnemiesOnScreen() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && e.x > 0 && e.x < this.W && e.y > 0 && e.y < this.H) n++;
    for (const v of this.vehicles) if (!v.dead && v.right > 0 && v.left < this.W) n++;
    if (this.mothership && this.mothership.state === 'fight') n++;
    return n;
  }

  /** Point to lob a wingman bomb at: the on-screen enemy ahead with the most neighbours. */
  bombTarget(x, y) {
    const R2 = WINGMAN.bombRadius * WINGMAN.bombRadius * 1.4;
    let best = null, bestScore = -1;
    for (const e of this.enemies) {
      if (e.dead || e.x < x + 30 || e.x > this.W || e.y < 0 || e.y > this.H) continue;
      let score = 0;
      for (const o of this.enemies) if (!o.dead && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < R2) score++;
      score -= Math.hypot(e.x - x, e.y - y) / 2000; // tie-break: nearer is better
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /** Enemy fire-rate multiplier from how many enemy bullets are on screen (see BULLET_DENSITY). */
  updateFireMul() {
    const W = this.W, H = this.H, p = this.player, D = BULLET_DENSITY, near2 = D.nearR * D.nearR;
    let n = 0;
    for (const b of this.eBullets.list) {
      if (b.dead || b.kind === 'well' || b.x < 0 || b.x > W || b.y < 0 || b.y > H) continue;
      n++;
      if (p.alive && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < near2) n += D.nearWeight;
    }
    this.bulletLoad = n;
    this.fireMul = clamp((BULLET_DENSITY.max - n) / (BULLET_DENSITY.max - BULLET_DENSITY.calm), 0, 1);
  }

  updateEnemies(dt) {
    this.enemiesOnScreen = this.countEnemiesOnScreen();
    let dashers = 0;
    for (const e of this.enemies) if (e.type === 'darter' && (e.state === 'dash' || e.state === 'windup')) dashers++;
    this.dashers = dashers;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.px = e.x;
      e.py = e.y;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      updateEnemy(e, dt, this);
    }
  }

  updateBullets(dt) {
    const W = this.W, H = this.H, p = this.player;
    for (const b of this.pBullets.list) {
      b.px = b.x;
      b.py = b.y;
      if (b.kind === 'pbomb') {
        // Ballistic, no drag: constant horizontal speed, constant downward acceleration.
        b.x += b.vx * dt;
        b.y += b.vy * dt + 0.5 * BOMB.gravity * dt * dt;
        b.vy += BOMB.gravity * dt;
        const gy = this.bg.groundY(b.x, this.scroll);
        if (b.y + b.r >= gy) {
          b.dead = true;
          this.bombBlast(b.x, gy);
        } else if (b.x < -60 || b.x > W + 60) b.dead = true;
        continue;
      }
      if (b.kind === 'pmissile') this.steerMissile(b, dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x > W + 30 || b.y < -30 || b.y > H + 30) b.dead = true;
    }
    for (const b of this.eBullets.list) {
      if (HEAVY.has(b.kind)) {
        updateHeavy(b, dt, this);
        continue;
      }
      if (ORDNANCE.has(b.kind)) {
        updateOrdnance(b, dt, this);
        continue;
      }
      b.px = b.x;
      b.py = b.y;
      b.t += dt;
      if (b.kind === 'missile') {
        // Limited turn rate homing: dodgeable, and it can be shot down.
        let ang = Math.atan2(b.vy, b.vx);
        if (p.alive && b.t > 0.35) {
          let d = Math.atan2(p.y - b.y, p.x - b.x) - ang;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          ang += clamp(d, -2 * dt, 2 * dt);
        }
        b.vx = Math.cos(ang) * b.speed;
        b.vy = Math.sin(ang) * b.speed;
        if (Math.random() < 0.5) this.particles.add('glow', b.x - b.vx * 0.03, b.y - b.vy * 0.03, 0, 0, 0.3, 5, '#ff9a5c');
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if ((b.life -= dt) <= 0 || b.x < -40 || b.x > W + 60 || b.y < -40 || b.y > H + 40) {
        if (b.kind === 'missile' && b.life <= 0) this.particles.explosion(b.x, b.y, '#ff6ad5', 0.4);
        b.dead = true;
      }
    }
  }

  updatePowerups(dt) {
    const p = this.player, H = this.H;
    for (const u of this.powerups.list) {
      u.px = u.x;
      u.py = u.y;
      u.t += dt;
      const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy) || 1;
      if (p.alive && d < 120) {
        // Magnet pull when nearby.
        u.vx += (dx / d) * 1600 * dt;
        u.vy += (dy / d) * 1600 * dt;
        const sp = Math.hypot(u.vx, u.vy);
        if (sp > 520) {
          u.vx *= 520 / sp;
          u.vy *= 520 / sp;
        }
      } else {
        u.vx += (-55 - u.vx) * damp(1.5, dt);
        u.vy += (Math.sin(u.t * 2.5) * 50 - u.vy) * damp(2, dt);
      }
      u.x += u.vx * dt;
      u.y += u.vy * dt;
      if (u.y < 20 || u.y > H - 60) u.vy = -u.vy * 0.8;
      u.y = clamp(u.y, 20, H - 60);
      if (u.x < -30) u.dead = true;
      if (p.alive && d < 26) {
        u.dead = true;
        this.collect(u);
      }
    }
  }

  collect(u) {
    const p = this.player;
    this.sfx.play('power');
    this.particles.ring(u.x, u.y, POWERUP_COLOR[u.kind], 6, 36, 0.3, 3);
    if (u.kind === 'H') {
      if (p.homing < HOMING.max) {
        p.homing++;
        this.particles.text(p.x, p.y - 26, p.homing === 1 ? 'HOMING MISSILES!' : `HOMING MISSILES x${p.homing}`, POWERUP_COLOR.H, 15);
      } else {
        this.score += HOMING.bonus;
        this.particles.text(p.x, p.y - 26, `+${HOMING.bonus}`, POWERUP_COLOR.H, 14);
      }
    } else if (u.kind === 'P') {
      if (p.power < PLAYER.maxPower) {
        p.power++;
        this.particles.text(p.x, p.y - 26, p.power === PLAYER.maxPower ? 'MAX POWER' : 'POWER UP', '#ffd23f', 14);
      } else if (p.overdrive < Player.maxOverdrive) {
        // Overdrive: upgrade the next beam chain (orange, then red, then two neon lasers).
        p.overdrive++;
        const n = p.overdrive, C = OVERDRIVE.chains, L = OVERDRIVE.laserChains.length;
        const [msg, col] = n <= C ? [`ORANGE BEAM ${n}/${C}`, '#ff9a2e']
          : n <= C * 2 ? [`RED BEAM ${n - C}/${C}`, '#ff3b3b']
          : [`NEON LASER ${n - C * 2}/${L}`, NEON];
        this.particles.text(p.x, p.y - 26, n === Player.maxOverdrive ? 'WEAPON MAXED' : msg, col, 14);
      } else {
        this.score += 1000;
        this.particles.text(p.x, p.y - 26, '+1000', '#ffd23f', 14);
      }
    } else if (u.kind === 'W') {
      const w = p.addWingLevel();
      if (w) {
        const side = w.side < 0 ? 'TOP' : 'BOTTOM', lvl = w.level, R = WINGMAN.maxRounds, B = WINGMAN.bombLevel;
        let msg;
        if (lvl === 1) msg = `${side} WINGMAN!`;
        else if (lvl <= R) msg = `${side} WINGMAN x${lvl} BEAMS`;
        else if (lvl === R + 1) msg = `${side} WINGMAN BLUE BEAMS`;
        else if (lvl <= R + 4) msg = `${side} WINGMAN ORANGE ${lvl - R - 1}/3`;
        else if (lvl <= R + 7) msg = `${side} WINGMAN RED ${lvl - R - 4}/3`;
        else if (lvl < B) msg = `${side} WINGMAN LASER ${lvl - R - 7}/2`;
        else if (lvl === B) msg = `${side} WINGMAN BOMBS!`;
        else msg = lvl === WINGMAN.maxLevel ? `${side} BOMBS MAX` : `${side} BOMB RATE UP`;
        this.particles.text(p.x, p.y - 26, msg, '#5dff7a', 14);
      } else {
        this.score += 2000;
        this.particles.text(p.x, p.y - 26, '+2000', '#5dff7a', 14);
      }
    } else {
      this.pulses = Math.min(this.pulses + 1, 5);
      this.particles.text(p.x, p.y - 26, 'PULSE +1', '#ff5fd2', 14);
    }
  }

  updatePulse(dt) {
    const bm = this.pulse;
    if (!bm) return;
    bm.t += dt;
    const k = Math.min(1, bm.t / bm.dur);
    bm.r = (1 - (1 - k) * (1 - k)) * Math.hypot(this.W, this.H);
    const r2 = bm.r * bm.r;
    for (const e of this.enemies) {
      if (e.dead || bm.hit.has(e) || e.x > this.W + 20) continue;
      const dx = e.x - bm.x, dy = e.y - bm.y;
      if (dx * dx + dy * dy < r2) {
        bm.hit.add(e);
        this.damageEnemy(e, PULSE.damage, e.x, e.y);
      }
    }
    for (const v of this.vehicles) {
      for (const part of v.parts) {
        if (!part.alive || bm.hit.has(part)) continue;
        if (Math.hypot(part.ch.x - bm.x, part.ch.y - bm.y) < bm.r) {
          bm.hit.add(part);
          v.damage(part, PULSE.vehicleDamage, part.ch.x, part.ch.y - part.top / 2);
        }
      }
    }
    const ms = this.mothership;
    if (ms && !bm.hitBoss && Math.hypot(ms.x - bm.x, ms.y - bm.y) - 110 < bm.r) {
      bm.hitBoss = true;
      ms.damage(PULSE.bossDamage, ms.x - 100, ms.y);
    }
    if (bm.t >= bm.dur) this.pulse = null;
  }

  /** Wingman bomb: splash damage and clears nearby enemy bullets. */
  wingBlast(x, y) {
    const R = WINGMAN.bombRadius, R2 = R * R;
    this.particles.explosion(x, y, '#5dff7a', 1.2);
    this.particles.ring(x, y, '#b6ffc4', 6, R, 0.3, 4);
    this.sfx.play('explode');
    this.shake = Math.max(this.shake, 4);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, rr = R + e.r;
      if (dx * dx + dy * dy < rr * rr) this.damageEnemy(e, WINGMAN.bombDamage, e.x, e.y);
    }
    if (this.mothership?.hits(x, y, R)) this.mothership.damage(WINGMAN.bombDamage, x, y);
    for (const v of this.vehicles) {
      const part = v.hitTest(x, y, R);
      if (part) v.damage(part, WINGMAN.bombDamage, x, y);
    }
    for (const b of this.eBullets.list) {
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < R2) {
        b.dead = true;
        this.particles.add('glow', b.x, b.y, 0, -30, 0.3, 5, '#5dff7a');
      }
    }
  }

  /** Destroy every enemy bullet (missiles included) that touches the shield bubble. */
  shieldBlock() {
    const p = this.player;
    this.shieldBubble(p.x, p.y, SHIELD.radius);
    for (const w of p.wings) if (w.level) this.shieldBubble(w.x, w.y, SHIELD.wingRadius);
  }

  shieldBubble(x, y, R) {
    for (const b of this.eBullets.list) {
      if (b.dead || b.kind === 'well') continue;
      const rr = R + b.r;
      if (segDist2(x, y, b.px, b.py, b.x, b.y) < rr * rr) {
        b.dead = true;
        if (HEAVY.has(b.kind)) {
          fizzle(this, b);
          continue;
        }
        const a = Math.atan2(b.y - y, b.x - x);
        this.particles.add('spark', x + Math.cos(a) * R, y + Math.sin(a) * R, Math.cos(a) * 160, Math.sin(a) * 160, 0.2, 2, '#7df9ff');
        this.sfx.play('deflect');
      }
    }
  }

  /** Wingmen die exactly like the ship: any enemy bullet or enemy body. */
  collideWingmen() {
    const p = this.player, hr = WINGMAN.hitRadius;
    for (const w of p.wings) {
      if (!w.level || w.invuln > 0) continue;
      let hit = false;
      for (const b of this.eBullets.list) {
        if (b.dead || b.kind === 'mortar' || b.kind === 'shell') continue;
        const rr = hr + b.r * 0.8;
        if (segDist2(w.x, w.y, b.px, b.py, b.x, b.y) < rr * rr) {
          if (b.kind !== 'well') b.dead = true;
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          const m = maceHead(e);
          if (m && (m.x - w.x) ** 2 + (m.y - w.y) ** 2 < (hr + MACE_R * 0.85) ** 2) {
            hit = true;
            break;
          }
          const dx = e.x - w.x, dy = e.y - w.y, rr = hr + e.r * 0.8;
          if (dx * dx + dy * dy < rr * rr) {
            this.damageEnemy(e, 8, e.x, e.y);
            hit = true;
            break;
          }
        }
      }
      if (!hit) for (const v of this.vehicles) if (v.hitTest(w.x, w.y, hr, true)) hit = true;
      if (hit) this.wingmanDown(w);
    }
  }

  /** A wingman hit by enemy fire (ignored while your ship is down: they're off screen with it). */
  wingmanDown(w) {
    if (!this.player.alive || !w.level) return;
    this.wingmanHit(w);
  }

  /** Costs the wingman WINGMAN.hitLevelLoss levels; it's only lost if that takes it below level 1. */
  wingmanHit(w) {
    w.level = Math.max(0, w.level - WINGMAN.hitLevelLoss);
    if (w.level) {
      w.invuln = WINGMAN.spawnInvuln;
      this.particles.explosion(w.x, w.y, '#5dff7a', 0.6);
      this.particles.text(w.x, w.y - 18, `WINGMAN -${WINGMAN.hitLevelLoss}`, '#ffd23f', 13);
    } else {
      this.particles.explosion(w.x, w.y, '#5dff7a', 1.3);
      this.particles.text(w.x, w.y - 18, 'WINGMAN DOWN', '#ff6b6b', 13);
    }
    this.sfx.play('explode');
    this.shake = Math.max(this.shake, 6);
    try {
      navigator.vibrate?.(40);
    } catch {
      /* unsupported */
    }
  }

  /** Wingman and dumb bombs explode on contact. Returns true if `b` was one. */
  detonate(b) {
    if (b.kind === 'wbomb') this.wingBlast(b.x, b.y);
    else if (b.kind === 'pbomb') this.bombBlast(b.x, b.y);
    else return false;
    return true;
  }

  collide() {
    const p = this.player, W = this.W, ms = this.mothership;
    for (const b of this.pBullets.list) {
      if (b.dead) continue;
      if (ms && ms.state !== 'retreat' && ms.hits(b.x, b.y, b.r)) {
        b.dead = true;
        if (!this.detonate(b)) {
          ms.damage(b.dmg, b.x, b.y);
          this.missileBurst(b);
        }
        continue;
      }
      for (const v of this.vehicles) {
        const part = v.hitTest(b.x, b.y, b.r);
        if (!part) continue;
        b.dead = true;
        if (!this.detonate(b)) {
          v.damage(part, b.dmg, b.x, b.y);
          this.missileBurst(b);
        }
        break;
      }
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || e.x > W + e.r) continue;
        const armor = armorHit(e, b);
        if (armor) {
          // Maces and mirrors stop shots; mirrors bounce them back.
          b.dead = true;
          if (this.detonate(b)) break;
          if (armor === 'plate' && b.kind !== 'pmissile') reflectBolt(this, e, b);
          else {
            this.particles.hit(b.x, b.y, '#e8e0d8');
            this.sfx.play('deflect');
            this.missileBurst(b);
          }
          break;
        }
        const dx = b.x - e.x, dy = b.y - e.y, rr = e.r + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          b.dead = true;
          if (!this.detonate(b)) {
            this.damageEnemy(e, b.dmg, b.x, b.y);
            this.missileBurst(b);
          }
          break;
        }
      }
      if (b.dead) continue;
      for (const m of this.eBullets.list) {
        if (m.dead || m.hp <= 0) continue;
        const dx = b.x - m.x, dy = b.y - m.y, rr = m.r + b.r + 2;
        if (dx * dx + dy * dy < rr * rr) {
          b.dead = true;
          if (this.detonate(b)) break;
          m.hp -= b.dmg;
          this.particles.hit(b.x, b.y, '#ff6ad5');
          if (m.hp <= 0) {
            // Shooting a fission core early just makes it split sooner.
            if (m.kind === 'fission' && splitFission(this, m)) break;
            m.dead = true;
            if (HEAVY.has(m.kind)) fizzle(this, m);
            else this.particles.explosion(m.x, m.y, '#ff6ad5', 0.5);
            this.sfx.play('explode');
            if (p.alive) this.addScore(50, m.x, m.y);
          }
          break;
        }
      }
    }

    if (p.alive && p.shieldOn) this.shieldBlock();
    if (p.alive && p.invuln <= 0 && p.entry <= 0) this.collideWingmen();
    if (ms && ms.state !== 'retreat') {
      for (const w of p.wings) if (w.level && w.invuln <= 0 && ms.hits(w.x, w.y, WINGMAN.hitRadius, 0.9)) this.wingmanDown(w);
    }
    if (!p.alive || p.invuln > 0 || p.entry > 0) return;
    const hr = PLAYER.hitRadius;
    if (ms && ms.state !== 'retreat' && ms.hits(p.x, p.y, hr, 0.9)) {
      this.killPlayer();
      return;
    }
    for (const v of this.vehicles) {
      if (v.hitTest(p.x, p.y, hr, true)) {
        this.killPlayer();
        return;
      }
    }
    for (const b of this.eBullets.list) {
      if (b.dead || b.kind === 'mortar' || b.kind === 'shell') continue;
      if (b.kind === 'well' && p.shieldOn) continue;
      const rr = hr + b.r * 0.8;
      // Swept test so fast needles can't tunnel through the tiny hitbox.
      if (segDist2(p.x, p.y, b.px, b.py, b.x, b.y) < rr * rr) {
        if (b.kind !== 'well') b.dead = true;
        this.killPlayer();
        return;
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      // An attached flail mace is solid and deadly (the shield doesn't stop a swinging mace).
      const m = maceHead(e);
      if (m && (m.x - p.x) ** 2 + (m.y - p.y) ** 2 < (hr + MACE_R * 0.85) ** 2) {
        this.killPlayer();
        return;
      }
      const dx = e.x - p.x, dy = e.y - p.y, rr = hr + e.r * 0.8;
      if (dx * dx + dy * dy < rr * rr) {
        this.damageEnemy(e, 8, e.x, e.y);
        this.killPlayer();
        return;
      }
    }
  }

  // ---------------------------------------------------------------- rendering

  render(alpha) {
    const ctx = this.ctx, c = this.canvas, s = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.ox > 0 || this.oy > 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    let sx = 0, sy = 0;
    if (this.shake > 0.3 && this.state !== 'paused') {
      sx = (Math.random() * 2 - 1) * this.shake;
      sy = (Math.random() * 2 - 1) * this.shake;
    }
    ctx.setTransform(s, 0, 0, s, this.ox + sx * s, this.oy + sy * s);
    const t = this.time;
    const L = (a, b) => a + (b - a) * alpha;

    this.bg.render(ctx, L(this.prevScroll, this.scroll));

    const ms = this.mothership;
    for (const v of this.vehicles) v.draw(ctx, alpha, t);
    if (ms) ms.draw(ctx, L(ms.px, ms.x), L(ms.py, ms.y), t);
    for (const e of this.enemies) drawTelegraph(ctx, e, L(e.px, e.x), L(e.py, e.y), t);

    for (const u of this.powerups.list) this.drawPowerup(ctx, u, L(u.px, u.x), L(u.py, u.y), t);

    for (const e of this.enemies) {
      const x = L(e.px, e.x), y = L(e.py, e.y);
      drawEnemy(ctx, e, x, y, t);
      if (e.maxHp >= 5 && e.hp < e.maxHp) {
        const w = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - w / 2, y - e.r - 10, w, 4);
        ctx.fillStyle = e.def.color;
        ctx.fillRect(x - w / 2, y - e.r - 10, (w * e.hp) / e.maxHp, 4);
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    const bolt = this.sprites.glow('#4cc9f0', 5);
    const redBolt = this.sprites.glow('#ff3b3b', 5);
    const orangeBolt = this.sprites.glow('#ff9a2e', 5);
    for (const b of this.pBullets.list) {
      const x = L(b.px, b.x), y = L(b.py, b.y);
      if (b.kind === 'pmissile') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(b.ang);
        const fl = 8 + Math.random() * 6;
        ctx.drawImage(this.sprites.glow('#ffb03b', 4), -8 - fl, -4, fl + 4, 8);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#eaf6ff';
        ctx.fillRect(-7, -2, 12, 4);
        ctx.fillStyle = '#ff7b3a';
        ctx.beginPath();
        ctx.moveTo(5, -2);
        ctx.lineTo(9, 0);
        ctx.lineTo(5, 2);
        ctx.fill();
        ctx.fillStyle = '#9aa3b8';
        ctx.fillRect(-7, -4, 3, 8);
        ctx.restore();
        continue;
      }
      if (b.kind === 'pbomb') {
        // Placeholder dumb bomb: nose follows the velocity vector.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = '#3b3f4a';
        ctx.strokeStyle = '#d7dbe6';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 4.5, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffb347';
        ctx.fillRect(-12, -5, 4, 10);
        ctx.fillStyle = '#ff5c5c';
        ctx.beginPath();
        ctx.arc(8, 0, 2, 0, TAU);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (b.kind === 'wbomb') {
        const s = 22 + Math.sin(t * 30) * 4;
        ctx.drawImage(this.sprites.glow('#5dff7a', 7), x - s / 2, y - s / 2, s, s);
        continue;
      }
      const wingCol = WING_BOLT_COLOR[b.kind];
      const img = wingCol ? this.sprites.glow(wingCol, 4) : b.kind === 'red' ? redBolt : b.kind === 'orange' ? orangeBolt : bolt;
      const w = wingCol ? 24 : 32, h = wingCol ? 9 : 12;
      if (b.vy === 0) ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
      else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    const p = this.player;
    if (p.alive && p.laser > 0) this.drawLasers(ctx, alpha, t);
    ctx.globalCompositeOperation = 'source-over';

    if (p.alive) drawPlayer(ctx, L(p.px, p.x), L(p.py, p.y), p, t, alpha);

    if (p.alive && p.shieldOn) this.drawShield(ctx, L, t);
    this.drawEnemyBullets(ctx, L);
    this.particles.render(ctx, this.sprites);
    if (ms) ms.drawLaser(ctx, t);
    for (const b of this.eBullets.list) if (HEAVY.has(b.kind)) drawHeavyWarnings(ctx, b, t);
    for (const v of this.vehicles) {
      v.drawOverlay?.(ctx, t);
      v.drawIncoming(ctx, t);
    }

    if (this.pulse) {
      const bm = this.pulse, k = bm.t / bm.dur;
      ctx.strokeStyle = `rgba(255,95,210,${1 - k})`;
      ctx.lineWidth = 18 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(bm.x, bm.y, bm.r, 0, TAU);
      ctx.stroke();
    }

    this.bg.renderForeground(ctx, L(this.prevScroll, this.scroll), t);

    ctx.setTransform(s, 0, 0, s, this.ox, this.oy);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, this.flash)})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    if (this.state === 'playing' || this.state === 'paused') {
      drawHud(ctx, this);
      drawControls(ctx, this);
    }
  }

  drawLasers(ctx, alpha, t) {
    const p = this.player, k = p.laser;
    ctx.lineCap = 'round';
    for (const [x0, y0, ang, , width] of p.laserSources(alpha)) {
      const x1 = x0 + Math.cos(ang) * 1600, y1 = y0 + Math.sin(ang) * 1600;
      const w = (4 + Math.sin(t * 70 + y0) * 0.8) * (0.4 + 0.6 * k) * width;
      for (const [width, color] of [[w * 4.5, 'rgba(255,62,200,0.22)'], [w * 2.2, 'rgba(255,62,200,0.75)'], [w * 0.8, '#ffe3f6']]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      const s = (16 + 10 * k) * width;
      ctx.drawImage(this.sprites.glow(NEON, s / 2), x0 - s, y0 - s, s * 2, s * 2);
    }
  }

  drawShield(ctx, L, t) {
    const p = this.player;
    // Flicker as a warning when the meter is nearly empty.
    if (p.shield < 0.2 && Math.floor(t * 16) % 2) return;
    this.drawBubble(ctx, L(p.px, p.x), L(p.py, p.y), SHIELD.radius, t);
    for (const w of p.wings) if (w.level) this.drawBubble(ctx, L(w.px, w.x), L(w.py, w.y), SHIELD.wingRadius, t);
  }

  drawBubble(ctx, x, y, radius, t) {
    const r = radius + Math.sin(t * 9) * 1.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.sprites.glow('#7df9ff', r / 2), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#7df9ff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#c8fdff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawEnemyBullets(ctx, L) {
    for (const b of this.eBullets.list) {
      const x = L(b.px, b.x), y = L(b.py, b.y);
      if (HEAVY.has(b.kind)) {
        drawHeavy(ctx, b, x, y, this.time, this.sprites);
        continue;
      }
      if (ORDNANCE.has(b.kind)) {
        drawOrdnance(ctx, b, x, y, this.time, this.sprites);
        continue;
      }
      if (b.kind === 'needle' || b.kind === 'missile') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        if (b.kind === 'needle') {
          ctx.drawImage(this.sprites.glow(b.color, 4), -14, -5, 28, 10);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-7, -1.2, 14, 2.4);
        } else {
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.moveTo(9, 0);
          ctx.lineTo(-6, -5);
          ctx.lineTo(-3, 0);
          ctx.lineTo(-6, 5);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.restore();
      } else {
        const r = b.r;
        ctx.drawImage(this.sprites.glow(b.color, r), x - r * 2, y - r * 2, r * 4, r * 4);
      }
    }
  }

  drawPowerup(ctx, u, x, y, t) {
    const col = POWERUP_COLOR[u.kind];
    ctx.save();
    ctx.translate(x, y);
    ctx.drawImage(this.sprites.glow(col, 10), -20, -20, 40, 40);
    ctx.rotate(t * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.rotate(-t * 2);
    ctx.fillStyle = '#1a0a20';
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(u.kind, 0, 1);
    ctx.restore();
  }
}

