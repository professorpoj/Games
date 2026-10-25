// Global tuning constants. Everything is in "logical units": the playfield is
// always VIEW_H units tall and its width follows the screen's aspect ratio.

export const VIEW_H = 540;
export const MIN_ASPECT = 4 / 3;
export const MAX_ASPECT = 2.4;
export const MAX_DPR = 2;

// Fixed-timestep simulation (rendering is interpolated between steps).
export const SIM_HZ = 120;
export const DT = 1 / SIM_HZ;
export const MAX_STEPS_PER_FRAME = 12;

// The ship's constant forward flight speed, expressed as ground scroll speed.
export const SCROLL_SPEED = 170;
export const GROUND_H = 46;

export const PLAYER = {
  speed: 340,            // max speed (units/s)
  response: 30,          // analog stick velocity smoothing rate (higher = snappier)
  responseDigital: 22,   // keyboard velocity smoothing rate
  hitRadius: 4,          // tiny, precise hitbox
  fireInterval: 1 / 12,
  bulletSpeed: 960,
  invulnTime: 2.5,
  respawnDelay: 1.3,
  startLives: 3,
  startBombs: 2,
  maxPower: 4,
};

// Overdrive: P pickups after max power upgrade the 7 beam chains one at a time,
// blue -> orange (all 7), then orange -> red (all 7), then two chains become
// continuous HOT NEON PINK lasers. After that P is worth points.
// Damage multipliers are relative to the original blue bolt damage.
export const OVERDRIVE = {
  chains: 7,
  mul: [0.8, 1, 1.5],    // bolt damage by tier: blue, orange, red
  laserMul: 2,           // neon laser: 2x the chain's original damage per second, continuous
  laserChains: [1, 2],   // only these two chains (the inner straight pair) can become lasers
  laserRamp: 0.15,       // seconds to reach full power when FIRE is pressed
  laserHalfWidth: 6,
};

// Wingmen from rare green "W" pickups. Each wingman has its own level:
// 1-3   = 1, 2, 3 beams (green, 0.5x)
// 4     = all beams blue (0.8x, matching the ship's blue)
// 5-7   = beams turn orange (1x) one at a time
// 8-10  = beams turn red (1.5x) one at a time
// 11-12 = two beams become neon lasers (2x, continuous)
// 13    = bombs; 14-16 = faster bombs. After that Ws give points.
// A W always upgrades the weaker wingman (rebuilding a lost one first);
// when they're equal, upgrades alternate between them.
export const WINGMAN = {
  maxRounds: 3,          // levels 1-3: beams per shot
  mul: [0.5, 0.8, 1, 1.5], // beam damage by tier: green, blue, orange, red (x the ship's original blue)
  laserMul: 2,           // wingman neon laser: 2x the beam's damage rate, continuous
  beamOrder: [1, 0, 2],  // colour upgrade order: centre beam, then top, then bottom
  laserBeams: [0, 2],    // the two outer beams become lasers
  bombLevel: 13,         // bombs unlock after both lasers
  maxLevel: 16,          // per wingman; once both are maxed, Ws give points
  hitRadius: 5,          // wingmen can be shot down or rammed, like your ship
  spawnInvuln: 1.5,      // brief protection when a wingman (re)joins
  offsetX: -14,
  offsetY: 36,
  follow: 16,            // how tightly they trail the ship (higher = stiffer)
  bulletDamage: 1,       // base beam damage (before the tier multiplier)
  bombDamage: 3,
  bombRadius: 60,
  bombSpeed: 520,
  bombIntervalMax: 1.5,  // seconds between bombs at the bomb level
  bombIntervalMin: 0.6,  // at max level
  dropMul: 0.25,         // W drop chance = enemy drop chance x this
  bombCrowd: 7,          // wingmen launch their bombs while MORE than this many enemies are on screen
};

// Tap SHIELD to raise a bubble that destroys enemy bullets touching it.
// It drains while up and recharges 5x slower than it drains.
export const SHIELD = {
  duration: 4,           // seconds a full meter lasts
  rechargeRatio: 5,      // full recharge takes duration x this (20 s)
  minToActivate: 0.15,   // meter needed to raise it again
  radius: 30,
  wingRadius: 16,        // smaller bubble around each wingman while the shield is up
};

// Boss that shows up after every 5th wave. It can't be destroyed: deplete its
// hull meter and it retreats, returning 5 waves later tougher with new tricks.
export const MOTHERSHIP = {
  baseHp: 260,
  hpPerVisit: 0.6,       // +60% hull per return visit
  rx: 150,               // hull half-width / half-height (elliptical hitbox)
  ry: 92,
  trackSpeed: 95,        // how fast it slides vertically to line up the laser
  laserCharge: 1.7,      // seconds of warm-up (telegraphed)
  laserLock: 0.45,       // the aim freezes this long before firing
  laserFire: 1.0,        // beam duration
  laserHalfWidth: 16,
  laserCooldown: [2.6, 3.6],
  swarmInterval: [7, 9.5],
  retreatBonus: 5000,    // x visit number
};

// Ground vehicles race in from the left, match the scroll speed and jockey
// for position under the player. Bodies ride spring/damper suspension over
// the real terrain profile.
export const VEHICLES = {
  gravity: 1300,         // suspension gravity (units/s^2)
  mortarGravity: 130,    // gravity on lobbed mortar shells (1/4 + doubled flight time = half speed, same arc)
  mortarFlight: [2.3, 2.9], // seconds from launch to airburst
  zone: 0.6,             // vehicles hold, fire and aim only in the screen's right 40% (from 60% across)
  truck: { hp: 16, score: 800, salvo: 3, interval: [2.6, 3.4], aoe: 34, life: 28 },
  tank: { hp: 60, score: 2500, interval: [3.2, 4.2], aim: 1.3, lock: 0.35, shellSpeed: 340, aoe: 58, life: 32,
    range: [0.55, 0.75], restation: [4, 7] }, // parks at random spots 45%-25% in from the right edge; fires across the whole screen
  train: { locoHp: 40, moduleHp: 14, score: 3000, moduleScore: 500, modules: 3, interval: [3.8, 5.2], missileSpeed: 100, life: 38 },
  unlock: { truck: 2, tank: 4, train: 6 },  // first wave each type appears (guaranteed)
};

// Homing missiles from the very rare orange "H" pickup (one per mothership
// defeated). Each H adds a missile to the salvo, up to 5. Fired with the
// MISSILE button; each missile chases the nearest enemy.
export const HOMING = {
  max: 5,
  cooldown: 1.6,         // seconds between salvos
  damage: 5,
  speed: 620,            // top speed (they launch slower and accelerate)
  turn: 7,               // turn rate, radians/s
  life: 4,
  bonus: 5000,           // points for an H once maxed
  dropChance: 0.0005,    // any destroyed enemy (or vehicle / train car) has a 0.05% chance to drop an H
};

export const CONTROLS = {
  stickRadius: 62,       // logical units the knob can travel
  deadZone: 0.08,
  curve: 1.15,           // >1 gives finer control near the center
  dragSensitivity: 1.3,  // touch-drag mode: ship units moved per finger unit
};

// Every swarm gets this many extra ships per wave beyond wave 1 (wave 10 = +9).
export const SWARM_GROWTH = { perWave: 1, maxSize: 40 };

export const ENEMY_BULLET_CAP = 380;
export const EXTRA_LIFE_EVERY = 75000;
// Every chance of a P (weapon power) pickup is scaled by this; 0.2 = 5x rarer.
export const P_DROP_RATE = 0.2;
export const CHAIN_WINDOW = 1.4;
