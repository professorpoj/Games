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

// Wingmen from rare green "W" pickups. Each wingman has its own level:
// 1-3 = rounds per shot, 4 = launches bombs, 5-7 = faster bombs.
// A W always upgrades the weaker wingman (rebuilding a lost one first);
// when they're equal, upgrades alternate between them.
export const WINGMAN = {
  maxRounds: 3,          // levels 1-3: rounds per shot
  maxLevel: 7,           // per wingman; once both are maxed, Ws give points
  hitRadius: 5,          // wingmen can be shot down or rammed, like your ship
  spawnInvuln: 1.5,      // brief protection when a wingman (re)joins
  offsetX: -14,
  offsetY: 36,
  follow: 16,            // how tightly they trail the ship (higher = stiffer)
  bulletDamage: 0.7,
  bombDamage: 3,
  bombRadius: 60,
  bombSpeed: 520,
  bombIntervalMax: 1.5,  // seconds between bombs at level 4
  bombIntervalMin: 0.6,  // at level 7
  dropMul: 0.25,         // W drop chance = enemy drop chance x this
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

export const CONTROLS = {
  stickRadius: 62,       // logical units the knob can travel
  deadZone: 0.08,
  curve: 1.15,           // >1 gives finer control near the center
  dragSensitivity: 1.3,  // touch-drag mode: ship units moved per finger unit
};

export const ENEMY_BULLET_CAP = 380;
export const EXTRA_LIFE_EVERY = 75000;
export const CHAIN_WINDOW = 1.4;
