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
  focusSpeed: 150,       // max speed while FOCUS is held
  response: 30,          // analog stick velocity smoothing rate (higher = snappier)
  responseDigital: 22,   // keyboard velocity smoothing rate
  hitRadius: 4,          // tiny, precise hitbox (shown while focusing)
  fireInterval: 1 / 12,
  bulletSpeed: 960,
  invulnTime: 2.5,
  respawnDelay: 1.3,
  startLives: 3,
  startBombs: 2,
  maxPower: 4,
};

// Wingmen from rare green "W" pickups. Levels 1-6 add wingmen and rounds
// (top, bottom, top, bottom...), levels 7+ give them bombs and then faster bombs.
export const WINGMAN = {
  gunLevels: 6,          // W pickups spent on wingmen + rounds (3 rounds each at 6)
  maxLevel: 14,          // 6 gun levels + 8 bomb levels; later Ws give points
  offsetX: -14,
  offsetY: 36,
  follow: 16,            // how tightly they trail the ship (higher = stiffer)
  bulletDamage: 0.7,
  bombDamage: 3,
  bombRadius: 60,
  bombSpeed: 520,
  bombIntervalMax: 1.5,  // seconds between bombs at the first bomb levels
  bombIntervalMin: 0.6,  // at max level
  deathPenalty: 2,       // W levels lost when your ship is destroyed
  dropMul: 0.25,         // W drop chance = enemy drop chance x this
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
