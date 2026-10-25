// Wave director: builds each wave from a threat budget, unlocking tougher
// enemy types and mixed swarms as waves progress.
import { Swarm } from './swarm.js';
import { shapesFor } from './formations.js';
import { ENEMY_TYPES } from './enemies.js';
import { GROUND_H, VEHICLES, SWARM_GROWTH } from './config.js';
import { rand, randInt, choose, clamp, weightedPick, shuffle } from './utils.js';

const fill = (type, budget, min, max) =>
  Array(clamp(Math.round(budget / ENEMY_TYPES[type].cost), min, max)).fill(type);

function mix(types, budget, min, max) {
  const out = [];
  let spent = 0;
  while ((spent < budget || out.length < min) && out.length < max) {
    const t = choose(types);
    out.push(t);
    spent += ENEMY_TYPES[t].cost;
  }
  return out;
}

const TEMPLATES = [
  { unlock: 1, weight: 3, make: (b) => ({ members: fill('drone', b, 6, 22), paths: ['sweep', 'weave', 'hold'] }) },
  { unlock: 2, weight: 2, make: (b) => ({ members: fill('darter', b, 5, 14), paths: ['hold', 'sweep'] }) },
  { unlock: 2, weight: 2, make: (b) => ({ members: [...fill('darter', b * 0.5, 3, 8), ...fill('drone', b * 0.5, 3, 12)], paths: ['hold', 'weave'] }) },
  { unlock: 3, weight: 1.6, make: (b) => ({ members: fill('spinner', b, 3, 8), paths: ['hold', 'sweep'] }) },
  { unlock: 4, weight: 1.4, make: (b) => ({ members: [...fill('spinner', b * 0.45, 2, 4), ...fill('drone', b * 0.55, 4, 14)], paths: ['hold', 'sweep'] }) },
  { unlock: 4, weight: 1.5, make: (b) => ({ members: [...fill('sniper', b * 0.7, 3, 6), ...fill('drone', b * 0.3, 2, 8)], paths: ['hold'] }) },
  {
    unlock: 5, weight: 1, fortress: true,
    make: (b, wave) => {
      const leaders = Array(wave >= 11 ? 2 : 1).fill('bulwark');
      return { leaders, members: mix(['drone', 'drone', 'darter', 'sniper'], Math.max(b - 6, 5), 5, 16), paths: ['hold'] };
    },
  },
  { unlock: 6, weight: 1.5, make: (b) => ({ members: mix(['drone', 'darter', 'spinner', 'sniper'], b, 5, 20), paths: ['hold', 'sweep', 'weave'] }) },
  // Elite squadron: every ship is an enhanced Mk II.
  { unlock: 8, weight: 0.8, make: (b) => ({ members: mix(['drone', 'darter', 'spinner', 'sniper'], b * 0.7, 5, 12), paths: ['hold'], elite: true }) },
];

export class Director {
  constructor(game) {
    this.game = game;
    this.reset(false);
  }

  reset(demo) {
    this.demo = demo;
    this.wave = 0;
    this.visits = 0;
    this.queue = [];
    this.phase = 'break';
    this.timer = demo ? 0.3 : 1.6;
    this.game.bg?.setStage(0, false);
    // ?wave=N in the URL starts a real game at wave N (handy for testing).
    const start = parseInt(new URLSearchParams(location.search).get('wave'), 10);
    if (!demo && start > 1) {
      this.wave = start - 1;
      this.visits = Math.floor((start - 1) / 5);
    }
    this.applyDifficulty();
  }

  applyDifficulty() {
    const w = Math.max(0, this.wave - 1);
    this.game.difficulty = {
      fire: Math.min(1 + w * 0.07, 2.2),
      speed: Math.min(1 + w * 0.025, 1.45),
      hp: 1 + Math.floor(w / 5) * 0.3,
    };
    this.game.maxDashers = 2 + Math.floor(this.wave / 4);
    // Share of ships that spawn as enhanced Mk II variants.
    this.game.enhanceChance = this.wave >= 7 ? Math.min(0.15 + (this.wave - 7) * 0.05, 0.6) : 0;
  }

  startWave() {
    this.wave++;
    // The attract-mode demo loops through the early waves.
    if (this.demo && this.wave > 6) this.wave = 1;
    this.applyDifficulty();
    // Every 5 waves the landscape palette turns one step (30°) around the colour wheel
    // and the background decor changes theme. The title demo keeps the first stage.
    if (!this.demo) this.game.bg.setStage(Math.floor((this.wave - 1) / 5));
    const w = this.wave;
    const nSwarms = w <= 2 ? 2 : clamp(2 + Math.floor((w - 2) / 2), 2, 5);
    const available = TEMPLATES.filter((t) => t.unlock <= w);
    this.queue = [];
    for (let i = 0; i < nSwarms; i++) {
      let tpl = weightedPick(available, (t) => t.weight);
      if (i === 0 && w % 5 === 0) tpl = TEMPLATES.find((t) => t.fortress);
      // Composition is rolled from a wave-1 budget; size then grows +1 ship per wave (makeSpec).
      const budget = 9.4 * rand(0.85, 1.15);
      const delay = i === 0 ? 0 : Math.max(2.5, rand(3.5, 6.5) - Math.min(w * 0.15, 1.5));
      this.queue.push({ delay, spec: this.makeSpec(tpl.make(budget, w)) });
    }
    this.addGroundUnits(w);
    this.phase = 'active';
    if (!this.demo) this.game.showBanner(`WAVE ${w}`, w % 5 === 0 ? 'FLAGSHIP INBOUND' : '');
  }

  /** Whether another vehicle of this type fits beside the ones already in the attack zone. */
  vehicleFits(type) {
    const g = this.game;
    const len = { truck: 72, tank: 122, train: 380 }[type];
    let used = 0;
    for (const v of g.vehicles) if (!v.retreating) used += v.backLen + v.frontLen + 30;
    return used === 0 || used + len <= g.W * (1 - VEHICLES.zone);
  }

  /** Mix ground vehicles into the wave; each type is guaranteed on its debut wave. */
  addGroundUnits(w) {
    const U = VEHICLES.unlock, must = [], picks = [];
    for (const type of ['truck', 'tank', 'train']) {
      const chance = { truck: 0.55, tank: 0.45, train: 0.4 }[type];
      // A new tank tier is guaranteed on its debut wave too.
      const debut = w === U[type] || (type === 'tank' && VEHICLES.tank.tiers.some((t) => t.from === w));
      if (debut) must.push(type);
      else if (w > U[type] && Math.random() < chance) picks.push(type);
    }
    if (w >= 9 && Math.random() < 0.4) picks.push(choose(['truck', 'tank']));
    shuffle(picks);
    // Debuts go first so the cap never drops them.
    for (const type of must.concat(picks).slice(0, w >= 8 ? 3 : 2)) {
      const at = randInt(0, this.queue.length);
      this.queue.splice(at, 0, { delay: rand(2.5, 5), ground: type });
    }
  }

  makeSpec(t) {
    const { H } = this.game;
    // Each wave adds one more ship to every swarm, drawn from the swarm's own types.
    const base = t.members.slice();
    const extra = Math.max(0, this.wave - 1) * SWARM_GROWTH.perWave;
    for (let i = 0; i < extra && t.members.length < SWARM_GROWTH.maxSize; i++) t.members.push(choose(base));
    const n = t.members.length;
    const shapes = shuffle(shapesFor(n)).slice(0, randInt(4, 6));
    const path = choose(t.paths);
    return {
      members: t.members,
      leaders: t.leaders || [],
      path,
      shapes,
      y: rand(0.28, 0.62) * (H - GROUND_H),
      speed: rand(75, 105) + Math.min(this.wave * 2, 40),
      holdTime: rand(9, 13),
      enhanceChance: t.elite ? 1 : undefined,
    };
  }

  update(dt) {
    const g = this.game;
    if (this.phase === 'break') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave();
      return;
    }
    if (this.phase === 'bossWarn') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'boss';
        g.startMothership(++this.visits);
      }
      return;
    }
    if (this.phase === 'boss') {
      // Next wave starts once the mothership has been driven off.
      if (!g.mothership) {
        this.phase = 'break';
        this.timer = 3;
      }
      return;
    }
    if (this.queue.length) {
      if (this.queue[0].ground && !this.vehicleFits(this.queue[0].ground)) {
        // No room in the vehicles' attack zone yet: let a queued swarm go first, or wait.
        const i = this.queue.findIndex((q) => !q.ground);
        if (i > 0) this.queue.unshift(...this.queue.splice(i, 1));
        else {
          this.queue[0].delay = Math.max(this.queue[0].delay, 0.5);
          return;
        }
      }
      const next = this.queue[0];
      // Keep the action flowing: don't leave the screen empty for long.
      if (g.swarms.length === 0 && g.vehicles.length === 0) next.delay = Math.min(next.delay, 0.6);
      next.delay -= dt;
      if (next.delay <= 0) {
        this.queue.shift();
        if (next.ground) g.spawnVehicle(next.ground);
        else g.swarms.push(new Swarm(g, next.spec));
      }
    } else if (g.swarms.length === 0 && g.vehicles.length === 0) {
      this.phase = 'break';
      this.timer = 3;
      if (!this.demo && g.player.alive) {
        const bonus = 500 * this.wave;
        g.score += bonus;
        g.showBanner(`WAVE ${this.wave} CLEAR`, `BONUS +${bonus}`);
      }
      if (!this.demo && this.wave % 5 === 0) {
        // Every 5 waves the mothership comes calling.
        this.phase = 'bossWarn';
        this.timer = 3;
      }
    }
  }
}
