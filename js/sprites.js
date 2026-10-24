import { hexToRgba } from './utils.js';

/**
 * Pre-rendered glow sprites (bullets, flashes). A sprite for radius r covers
 * a 4r x 4r square; its solid core is ~r so hitboxes match what you see.
 */
export class Sprites {
  constructor() {
    this.cache = new Map();
    this.scale = 1;
  }

  reset(scale) {
    this.scale = scale;
    this.cache.clear();
  }

  glow(color, r) {
    const rq = Math.max(1, Math.round(r));
    const key = color + rq;
    let c = this.cache.get(key);
    if (c) return c;
    const size = Math.max(4, Math.ceil(rq * 4 * this.scale));
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const h = size / 2;
    const grd = g.createRadialGradient(h, h, 0, h, h, h);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.2, '#ffffff');
    grd.addColorStop(0.32, color);
    grd.addColorStop(0.5, hexToRgba(color, 0.45));
    grd.addColorStop(1, hexToRgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    this.cache.set(key, c);
    return c;
  }
}
