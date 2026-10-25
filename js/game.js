import {
  VIEW_H, MIN_ASPECT, MAX_ASPECT, MAX_DPR, SCROLL_SPEED, PLAYER,
  ENEMY_BULLET_CAP, EXTRA_LIFE_EVERY, CHAIN_WINDOW, WINGMAN, SHIELD, OVERDRIVE,
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
import { HEAVY, updateHeavy, drawHeavy, drawHeavyWarnings, fizzle } from './projectiles.js';
import { updateEnemy, drawEnemy, drawTelegraph, ENHANCED_SCORE } from './enemies.js';
import { Sfx } from './audio.js';
import { drawHud, drawControls } from './hud.js';

const BULLET_R = { orb: 5, big: 8, needle: 3.5, missile: 6 };
const POWERUP_COLOR = { P: '#ffd23f', B: '#ff5fd2', W: '#5dff7a' };
const PLAYER_SHOT_R = { shot: 5, red: 5, wing: 4, wbomb: 7 };
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
    this.bomb = null;
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
    this.bombs = PLAYER.startBombs;
    this.chain = 0;
    this.chainTimer = 0;
    this.nextLife = EXTRA_LIFE_EVERY;
    this.banner = null;
    this.bomb = null;
    this.mothership = null;
    this.gameOverTimer = 0;
    this.timeScale = 1;
    this.player.power = 1;
    this.player.overdrive = 0;
    this.player.laser = 0;
    this.player.clearWings();
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
    if (!v) return;
    if (v.kind === 'tank') {
      this.spawnPowerup('P', x, y - 20);
      if (Math.random() < 0.4) this.spawnPowerup('W', x + 20, y - 40);
    } else if (v.kind === 'train') {
      this.spawnPowerup('W', x, y - 30);
      this.spawnPowerup('P', x - 30, y - 20);
    } else if (Math.random() < 0.35) this.spawnPowerup('P', x, y - 20);
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
    this.particles.explosion(e.x, e.y, e.def.color, big ? 3 : e.r / 12);
    this.sfx.play(big ? 'bigExplode' : 'explode');
    this.shake = Math.max(this.shake, big ? 12 : 2.5);
    if (this.player.alive) this.addScore(e.def.score * (e.enhanced ? ENHANCED_SCORE : 1), e.x, e.y);
    if (big) {
      this.spawnPowerup('P', e.x, e.y);
      if (Math.random() < 0.4) this.spawnPowerup('B', e.x, e.y + 20);
    } else if (Math.random() < e.def.drop * (e.enhanced ? 2 : 1)) {
      this.spawnPowerup(Math.random() < 0.72 ? 'P' : 'B', e.x, e.y);
    }
    // Rare wingman pickup (flagships drop one half the time).
    if (Math.random() < (big ? 0.5 : e.def.drop * WINGMAN.dropMul)) this.spawnPowerup('W', e.x, e.y - 20);
    const wiped = e.swarm.remove(e, true);
    if (wiped && this.player.alive && e.swarm.total >= 4) {
      const bonus = e.swarm.total * 100;
      this.score += bonus;
      this.particles.text(e.x, e.y - 34, `SWARM WIPED +${bonus}`, '#7dffcf', 15);
      if (Math.random() < 0.5) this.spawnPowerup('P', e.x, e.y);
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
    // Losing a ship wipes out the wingmen (rebuild them with W pickups);
    // the ship's own weapon power is kept.
    for (const w of p.wings) if (w.level) this.particles.explosion(w.x, w.y, '#5dff7a', 0.8);
    p.clearWings();
    this.chain = 0;
    if (this.lives <= 0) this.gameOverTimer = 2;
  }

  useBomb() {
    const p = this.player;
    if (!p.alive || this.bombs <= 0 || this.bomb) return;
    this.bombs--;
    // Bombs only hit enemy ships; bullets are the shield's job.
    this.bomb = { x: p.x, y: p.y, r: 0, t: 0, dur: 0.75, hit: new Set() };
    this.shake = 12;
    this.flash = 0.25;
    this.sfx.play('bomb');
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
      if (input.consumeBomb()) this.useBomb();
      if (input.consumeShield()) this.player.toggleShield();
    } else {
      input.consumeBomb();
      input.consumeShield();
    }

    this.updatePlayer(dt);
    this.updateLasers(dt);
    this.director.update(dt);
    for (const s of this.swarms) s.update(dt);
    for (const v of this.vehicles) v.update(dt);
    if (this.mothership) {
      this.mothership.update(dt);
      if (this.mothership.done) this.mothership = null;
    }
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePowerups(dt);
    this.updateBomb(dt);
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
      p.update(dt, this.input);
      return;
    }
    p.px = p.x;
    p.py = p.y;
    if (this.state === 'playing' && this.lives > 0 && p.respawnTimer > 0 && (p.respawnTimer -= dt) <= 0) {
      p.spawn();
      this.bombs = Math.max(this.bombs, PLAYER.startBombs);
      this.clearEnemyBullets(true);
    }
  }

  /** Neon laser chains: continuous damage to everything along each beam. */
  updateLasers(dt) {
    const p = this.player;
    this.sfx.setLaser(p.alive && this.state === 'playing' ? p.laser : 0);
    if (!p.alive || p.laser <= 0) return;
    const hw = OVERDRIVE.laserHalfWidth;
    for (const [ox, oy, ang, dmg] of p.laserChains()) {
      const x0 = p.x + ox, y0 = p.y + oy, dx = Math.cos(ang), dy = Math.sin(ang);
      const x1 = x0 + dx * 1600, y1 = y0 + dy * 1600;
      const burn = dmg * OVERDRIVE.laserMul * (1 / PLAYER.fireInterval) * p.laser * dt;
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
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x > W + 30 || b.y < -30 || b.y > H + 30) b.dead = true;
    }
    for (const b of this.eBullets.list) {
      if (HEAVY.has(b.kind)) {
        updateHeavy(b, dt, this);
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
    if (u.kind === 'P') {
      if (p.power < PLAYER.maxPower) {
        p.power++;
        this.particles.text(p.x, p.y - 26, p.power === PLAYER.maxPower ? 'MAX POWER' : 'POWER UP', '#ffd23f', 14);
      } else if (p.overdrive < OVERDRIVE.chains * 2) {
        // Overdrive: upgrade the next beam chain (red first, then neon laser).
        p.overdrive++;
        const n = p.overdrive, C = OVERDRIVE.chains;
        const msg = n <= C ? `RED BEAM ${n}/${C}` : `NEON LASER ${n - C}/${C}`;
        this.particles.text(p.x, p.y - 26, msg, n <= C ? '#ff3b3b' : NEON, 14);
      } else {
        this.score += 1000;
        this.particles.text(p.x, p.y - 26, '+1000', '#ffd23f', 14);
      }
    } else if (u.kind === 'W') {
      const w = p.addWingLevel();
      if (w) {
        const side = w.side < 0 ? 'TOP' : 'BOTTOM', lvl = w.level, R = WINGMAN.maxRounds;
        let msg;
        if (lvl === 1) msg = `${side} WINGMAN!`;
        else if (lvl <= R) msg = `${side} WINGMAN x${lvl} SHOT`;
        else if (lvl === R + 1) msg = `${side} WINGMAN BOMBS!`;
        else msg = lvl === WINGMAN.maxLevel ? `${side} BOMBS MAX` : `${side} BOMB RATE UP`;
        this.particles.text(p.x, p.y - 26, msg, '#5dff7a', 14);
      } else {
        this.score += 2000;
        this.particles.text(p.x, p.y - 26, '+2000', '#5dff7a', 14);
      }
    } else {
      this.bombs = Math.min(this.bombs + 1, 5);
      this.particles.text(p.x, p.y - 26, 'BOMB +1', '#ff5fd2', 14);
    }
  }

  updateBomb(dt) {
    const bm = this.bomb;
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
        this.damageEnemy(e, 14, e.x, e.y);
      }
    }
    for (const v of this.vehicles) {
      for (const part of v.parts) {
        if (!part.alive || bm.hit.has(part)) continue;
        if (Math.hypot(part.ch.x - bm.x, part.ch.y - bm.y) < bm.r) {
          bm.hit.add(part);
          v.damage(part, 14, part.ch.x, part.ch.y - part.top / 2);
        }
      }
    }
    const ms = this.mothership;
    if (ms && !bm.hitBoss && Math.hypot(ms.x - bm.x, ms.y - bm.y) - 110 < bm.r) {
      bm.hitBoss = true;
      ms.damage(20, ms.x - 100, ms.y);
    }
    if (bm.t >= bm.dur) this.bomb = null;
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
      if (b.dead) continue;
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
          b.dead = true;
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const e of this.enemies) {
          if (e.dead) continue;
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

  wingmanDown(w) {
    w.level = 0;
    this.particles.explosion(w.x, w.y, '#5dff7a', 1.3);
    this.particles.text(w.x, w.y - 18, 'WINGMAN DOWN', '#ff6b6b', 13);
    this.sfx.play('explode');
    this.shake = Math.max(this.shake, 6);
    try {
      navigator.vibrate?.(40);
    } catch {
      /* unsupported */
    }
  }

  collide() {
    const p = this.player, W = this.W, ms = this.mothership;
    for (const b of this.pBullets.list) {
      if (b.dead) continue;
      if (ms && ms.state !== 'retreat' && ms.hits(b.x, b.y, b.r)) {
        b.dead = true;
        if (b.kind === 'wbomb') this.wingBlast(b.x, b.y);
        else ms.damage(b.dmg, b.x, b.y);
        continue;
      }
      for (const v of this.vehicles) {
        const part = v.hitTest(b.x, b.y, b.r);
        if (!part) continue;
        b.dead = true;
        if (b.kind === 'wbomb') this.wingBlast(b.x, b.y);
        else v.damage(part, b.dmg, b.x, b.y);
        break;
      }
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || e.x > W + e.r) continue;
        const dx = b.x - e.x, dy = b.y - e.y, rr = e.r + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          b.dead = true;
          if (b.kind === 'wbomb') this.wingBlast(b.x, b.y);
          else this.damageEnemy(e, b.dmg, b.x, b.y);
          break;
        }
      }
      if (b.dead) continue;
      for (const m of this.eBullets.list) {
        if (m.dead || m.hp <= 0) continue;
        const dx = b.x - m.x, dy = b.y - m.y, rr = m.r + b.r + 2;
        if (dx * dx + dy * dy < rr * rr) {
          b.dead = true;
          if (b.kind === 'wbomb') {
            this.wingBlast(b.x, b.y);
            break;
          }
          m.hp -= b.dmg;
          this.particles.hit(b.x, b.y, '#ff6ad5');
          if (m.hp <= 0) {
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
      const rr = hr + b.r * 0.8;
      // Swept test so fast needles can't tunnel through the tiny hitbox.
      if (segDist2(p.x, p.y, b.px, b.py, b.x, b.y) < rr * rr) {
        b.dead = true;
        this.killPlayer();
        return;
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
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
    const wingBolt = this.sprites.glow('#5dff7a', 4);
    const redBolt = this.sprites.glow('#ff3b3b', 5);
    for (const b of this.pBullets.list) {
      const x = L(b.px, b.x), y = L(b.py, b.y);
      if (b.kind === 'wbomb') {
        const s = 22 + Math.sin(t * 30) * 4;
        ctx.drawImage(this.sprites.glow('#5dff7a', 7), x - s / 2, y - s / 2, s, s);
        continue;
      }
      const img = b.kind === 'wing' ? wingBolt : b.kind === 'red' ? redBolt : bolt;
      const w = b.kind === 'wing' ? 24 : 32, h = b.kind === 'wing' ? 9 : 12;
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
    if (p.alive && p.laser > 0) this.drawLasers(ctx, L(p.px, p.x), L(p.py, p.y), t);
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

    if (this.bomb) {
      const bm = this.bomb, k = bm.t / bm.dur;
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

  drawLasers(ctx, px, py, t) {
    const p = this.player, k = p.laser;
    ctx.lineCap = 'round';
    for (const [ox, oy, ang] of p.laserChains()) {
      const x0 = px + ox, y0 = py + oy, x1 = x0 + Math.cos(ang) * 1600, y1 = y0 + Math.sin(ang) * 1600;
      const w = (4 + Math.sin(t * 70 + ox) * 0.8) * (0.4 + 0.6 * k);
      for (const [width, color] of [[w * 4.5, 'rgba(255,62,200,0.22)'], [w * 2.2, 'rgba(255,62,200,0.75)'], [w * 0.8, '#ffe3f6']]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      const s = 16 + 10 * k;
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

