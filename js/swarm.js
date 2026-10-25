// A swarm is a group of enemies sharing a moving anchor. Members alternate
// between murmuration-style flocking (swirl + cohesion + separation) and
// steering into geometric formation slots, giving a bird-flock feel.
import { buildFormation, SHAPES, shapesFor } from './formations.js';
import { Enemy, ENEMY_TYPES } from './enemies.js';
import { GROUND_H } from './config.js';
import { TAU, rand, choose, clamp, damp, angleDiff } from './utils.js';

const SLOT_GAIN = 4.2;   // position error -> desired velocity
const STEER_GAIN = 7;    // velocity error -> acceleration (with per-type accel cap)

export class Swarm {
  constructor(game, spec) {
    this.game = game;
    const { W } = game;
    this.path = spec.path;
    this.shapes = spec.shapes;
    this.shapeIdx = -1;
    this.shape = null;
    this.time = 0;
    this.baseY = spec.y;
    const origin = spec.origin || { x: W + 160, y: spec.y };
    this.anchor = { x: origin.x, y: origin.y, vx: -spec.speed, vy: 0 };
    this.holdX = W * rand(0.6, 0.74);
    this.holdTime = spec.holdTime;
    this.stageTimer = 0;
    this.speed = spec.speed;
    this.stage = 'enter';
    const weave = this.path === 'weave';
    this.bobAmp = weave ? rand(90, 140) : rand(25, 65);
    this.bobFreq = weave ? rand(0.18, 0.28) : rand(0.08, 0.16);
    this.bobPhase = rand(TAU);
    this.rotation = 0;
    this.rotSpeed = 0;
    this.phase = 'flock';
    this.phaseTimer = rand(1.3, 1.9);
    this.swirl = choose([-1, 1]);
    this.slots = [];
    this.halfW = 40;
    this.halfH = 40;
    this.radius = 40;
    this.members = [];
    this.leaders = [];
    this.escaped = 0;
    this.dead = false;

    let maxR = 0;
    for (const t of spec.members) maxR = Math.max(maxR, ENEMY_TYPES[t].r);
    this.spacing = Math.max(30, maxR * 2.5);

    for (const t of spec.members) {
      const e = spec.origin
        ? new Enemy(t, origin.x + rand(-20, 40), origin.y + rand(-25, 25), this, game.difficulty)
        : new Enemy(t, W + rand(30, 230), spec.y + rand(-80, 80), this, game.difficulty);
      e.vx = -rand(170, 250);
      e.vy = rand(-40, 40);
      this.members.push(e);
      game.enemies.push(e);
    }
    (spec.leaders || []).forEach((t, i) => {
      const e = new Enemy(t, W + 280 + i * 40, spec.y + (i ? 60 : 0), this, game.difficulty);
      e.vx = -120;
      e.leader = true;
      this.leaders.push(e);
      game.enemies.push(e);
    });
    this.total = this.members.length + this.leaders.length;
  }

  get count() {
    return this.members.length + this.leaders.length;
  }

  update(dt) {
    this.time += dt;
    this.checkEscapes();
    this.updateAnchor(dt);
    this.updatePhase(dt);
    this.steerMembers(dt);
    this.steerLeaders(dt);
  }

  extentY() {
    return this.shape && SHAPES[this.shape].rotates ? this.radius : this.halfH;
  }

  updateAnchor(dt) {
    const a = this.anchor, { H } = this.game;
    if (this.path === 'hold') {
      if (this.stage === 'enter') {
        a.vx = clamp((this.holdX - a.x) * 1.8, -280, -25);
        if (a.x <= this.holdX + 2) {
          this.stage = 'hold';
          this.stageTimer = this.holdTime;
        }
      } else if (this.stage === 'hold') {
        a.vx = (this.holdX - a.x) * 2;
        this.stageTimer -= dt;
        if (this.stageTimer <= 0) this.stage = 'exit';
      } else {
        a.vx = Math.max(a.vx - 150 * dt, -240);
      }
    } else {
      a.vx = -this.speed;
    }
    const ext = this.extentY();
    let minY = ext + 34, maxY = H - GROUND_H - ext - 12;
    if (minY > maxY) minY = maxY = (H - GROUND_H) / 2;
    const ty = clamp(this.baseY + Math.sin(this.time * this.bobFreq * TAU + this.bobPhase) * this.bobAmp, minY, maxY);
    a.vy = (ty - a.y) * 2.5;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
  }

  updatePhase(dt) {
    this.phaseTimer -= dt;
    if (this.phaseTimer <= 0) {
      if (this.phase === 'form' && Math.random() < 0.45) {
        // Break into a swirling murmuration before the next shape.
        this.phase = 'flock';
        this.phaseTimer = rand(0.9, 1.6);
        this.swirl = choose([-1, 1]);
      } else {
        this.nextShape();
      }
    }
    if (this.phase === 'form' && this.rotSpeed) this.rotation += this.rotSpeed * dt;
    else this.rotation += angleDiff(this.rotation, 0) * damp(1.6, dt);
    this.rotation %= TAU;
  }

  nextShape() {
    const n = this.members.length;
    this.shapeIdx = (this.shapeIdx + 1) % this.shapes.length;
    let shape = this.shapes[this.shapeIdx];
    if (SHAPES[shape].min > n) shape = choose(shapesFor(Math.max(n, 3)));
    this.shape = shape;
    this.rotSpeed = SHAPES[shape].rotates ? rand(0.25, 0.55) * choose([-1, 1]) : 0;
    this.phase = 'form';
    this.phaseTimer = rand(3.5, 5.5);
    this.rebuild();
  }

  /** Recompute slots for the current member count and greedily reassign them. */
  rebuild() {
    const n = this.members.length;
    const { W, H } = this.game;
    const f = buildFormation(this.shape || 'circle', n, this.spacing, W * 0.22, (H - GROUND_H) * 0.36);
    this.slots = f.slots;
    this.halfW = f.halfW;
    this.halfH = f.halfH;
    this.radius = f.radius;
    this.assignSlots();
  }

  assignSlots() {
    const ms = this.members, slots = this.slots, a = this.anchor;
    const cos = Math.cos(-this.rotation), sin = Math.sin(-this.rotation);
    const pairs = [];
    for (let i = 0; i < ms.length; i++) {
      const rx = ms[i].x - a.x, ry = ms[i].y - a.y;
      const lx = rx * cos - ry * sin, ly = rx * sin + ry * cos;
      for (let j = 0; j < slots.length; j++) {
        const dx = lx - slots[j].x, dy = ly - slots[j].y;
        pairs.push([dx * dx + dy * dy, i, j]);
      }
    }
    pairs.sort((p, q) => p[0] - q[0]);
    const usedM = new Uint8Array(ms.length), usedS = new Uint8Array(slots.length);
    let left = ms.length;
    for (const [, i, j] of pairs) {
      if (usedM[i] || usedS[j]) continue;
      usedM[i] = usedS[j] = 1;
      ms[i].slot = j;
      if (--left === 0) break;
    }
  }

  steerMembers(dt) {
    const ms = this.members, n = ms.length;
    if (!n) return;
    const a = this.anchor, diff = this.game.difficulty;
    const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
    const rotV = this.phase === 'form' ? this.rotSpeed : 0;
    const flocking = this.phase === 'flock' || !this.slots.length;
    const sep = this.spacing * 0.75, sep2 = sep * sep;
    const r0 = this.spacing * Math.sqrt(n) * 0.55 + 12;
    const t = this.time;

    for (let i = 0; i < n; i++) {
      const m = ms[i];
      if (!m.steerable) continue;
      let dvx, dvy;
      if (!flocking && m.slot >= 0 && m.slot < this.slots.length) {
        const s = this.slots[m.slot];
        const ox = s.x * cos - s.y * sin, oy = s.x * sin + s.y * cos;
        const tx = a.x + ox + Math.sin(t * 1.9 + m.seed) * 2.5;
        const ty = a.y + oy + Math.cos(t * 1.4 + m.seed * 1.3) * 2.5;
        // Feed-forward the anchor's motion and the slot's orbital velocity.
        dvx = a.vx - oy * rotV + (tx - m.x) * SLOT_GAIN;
        dvy = a.vy + ox * rotV + (ty - m.y) * SLOT_GAIN;
      } else {
        const rx = m.x - a.x, ry = m.y - a.y;
        const d = Math.hypot(rx, ry) || 1;
        m.wander += (Math.random() - 0.5) * 7 * dt;
        const swirl = 125 * this.swirl, spring = (r0 - d) * 2.1;
        dvx = a.vx + (-ry / d) * swirl + (rx / d) * spring + Math.cos(m.wander) * 45;
        dvy = a.vy + (rx / d) * swirl + (ry / d) * spring + Math.sin(m.wander) * 45;
      }

      // Separation keeps ships from stacking during transitions.
      let sx = 0, sy = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = ms[j];
        const dx = m.x - o.x, dy = m.y - o.y, d2 = dx * dx + dy * dy;
        if (d2 < sep2 && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (sep - d) / sep;
          sx += (dx / d) * push;
          sy += (dy / d) * push;
        }
      }
      dvx += sx * 160;
      dvy += sy * 160;
      this.applySteer(m, dvx, dvy, dt, diff.speed);
    }
  }

  steerLeaders(dt) {
    const a = this.anchor, ls = this.leaders;
    // Leaders sit behind (right of) the escort formation.
    const behind = this.members.length ? (this.shape && SHAPES[this.shape].rotates ? this.radius : this.halfW) + 50 : 0;
    for (let i = 0; i < ls.length; i++) {
      const m = ls[i];
      if (!m.steerable) continue;
      const off = ls.length > 1 ? (i - (ls.length - 1) / 2) * m.r * 3 : 0;
      const tx = a.x + behind + m.r;
      const ty = a.y + off + Math.sin(this.time * 0.9 + m.seed) * 8;
      this.applySteer(m, a.vx + (tx - m.x) * 2.5, a.vy + (ty - m.y) * 2.5, dt, this.game.difficulty.speed);
    }
  }

  applySteer(m, dvx, dvy, dt, speedMul) {
    const def = m.def;
    const maxV = def.maxSpeed * speedMul + Math.abs(this.anchor.vx);
    const sp = Math.hypot(dvx, dvy);
    if (sp > maxV) {
      dvx *= maxV / sp;
      dvy *= maxV / sp;
    }
    let ax = (dvx - m.vx) * STEER_GAIN, ay = (dvy - m.vy) * STEER_GAIN;
    const am = Math.hypot(ax, ay);
    if (am > def.accel) {
      ax *= def.accel / am;
      ay *= def.accel / am;
    }
    m.vx += ax * dt;
    m.vy += ay * dt;
  }

  checkEscapes() {
    const a = this.anchor, H = this.game.H;
    const gone = (m) =>
      m.x < -220 || m.y < -260 || m.y > H + 260 || (a.x < -80 && m.x < -50) || (m.x > this.game.W + 700);
    for (const list of [this.members, this.leaders]) {
      for (const m of list) if (!m.dead && gone(m)) this.remove(m, false);
    }
  }

  /** Called when a member dies or escapes. Returns true if the whole swarm was destroyed. */
  remove(e, killed) {
    e.dead = true;
    const list = e.leader ? this.leaders : this.members;
    const i = list.indexOf(e);
    if (i >= 0) list.splice(i, 1);
    if (!killed) this.escaped++;
    if (!e.leader && this.members.length && this.shape) this.rebuild();
    if (this.count === 0) {
      this.dead = true;
      return this.escaped === 0;
    }
    return false;
  }
}
