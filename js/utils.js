export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Fraction of the remaining distance to cover this step: frame-rate independent smoothing. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Shortest signed angle from `from` to `to`. */
export function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by). */
export function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Rotate the hue of a CSS colour string (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()) by `deg`. */
export function shiftHue(color, deg) {
  if (!deg || typeof color !== 'string') return color;
  let r, g, b, a = null, hexAlpha = null;
  if (color[0] === '#') {
    let h = color.slice(1);
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) hexAlpha = h.slice(6, 8);
  } else {
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return color;
    [r, g, b, a] = m[1].split(',').map((v) => parseFloat(v));
  }
  // RGB -> HSL, rotate, back.
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  h = (((h + deg) % 360) + 360) % 360;
  const k = (n) => (n + h / 30) % 12, q = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - q * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  const [R, G, B] = [f(0), f(8), f(4)];
  if (hexAlpha !== null || color[0] === '#') {
    return '#' + [R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('') + (hexAlpha ?? '');
  }
  return a === undefined || Number.isNaN(a) ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${a})`;
}

export function weightedPick(items, weight) {
  let total = 0;
  for (const it of items) total += weight(it);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** In-place removal of items flagged `dead`, without allocating. */
export function compact(arr, onRemove) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (o.dead) {
      if (onRemove) onRemove(o);
    } else arr[j++] = o;
  }
  arr.length = j;
}

/** Object pool: reuses dead objects so bullets/particles don't churn the GC. */
export class Pool {
  constructor(create) {
    this.create = create;
    this.list = [];
    this.free = [];
  }
  spawn() {
    const o = this.free.length ? this.free.pop() : this.create();
    o.dead = false;
    this.list.push(o);
    return o;
  }
  sweep() {
    compact(this.list, (o) => this.free.push(o));
  }
  clear() {
    for (const o of this.list) this.free.push(o);
    this.list.length = 0;
  }
}
