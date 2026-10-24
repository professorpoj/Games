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

export const CONTROLS = {
  stickRadius: 62,       // logical units the knob can travel
  deadZone: 0.08,
  curve: 1.15,           // >1 gives finer control near the center
  dragSensitivity: 1.3,  // touch-drag mode: ship units moved per finger unit
};

export const ENEMY_BULLET_CAP = 380;
export const EXTRA_LIFE_EVERY = 75000;
export const CHAIN_WINDOW = 1.4;
