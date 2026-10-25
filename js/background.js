// Procedural parallax alien wasteland. Each layer is rendered once into a
// horizontally tileable offscreen canvas (all noise is periodic over TILE),
// then scrolled at its own speed factor every frame.
import { mulberry32, TAU, shiftHue } from './utils.js';
import { GROUND_H } from './config.js';
import { DECORS } from './decor.js';

const TILE = 1400;
const GROUND_AMP = 7;

// Hue rotation (degrees) applied to every colour while the layers are built.
let buildHue = 0;

/** Wraps a 2D context so every fill/stroke/gradient colour is hue-shifted by buildHue. */
function hueContext(g) {
  if (!buildHue) return g;
  return new Proxy(g, {
    set(t, k, v) {
      t[k] = k === 'fillStyle' || k === 'strokeStyle' ? shiftHue(v, buildHue) : v;
      return true;
    },
    get(t, k) {
      const v = t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') {
        return (...args) => {
          const grd = v.apply(t, args);
          const add = grd.addColorStop.bind(grd);
          grd.addColorStop = (o, c) => add(o, shiftHue(c, buildHue));
          return grd;
        };
      }
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

function layerCanvas(w, h, scale) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const g = c.getContext('2d');
  g.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
  return { c, g: hueContext(g), raw: g };
}

/** Sum of sines with integer frequencies => exactly periodic over TILE. Range ~[-1, 1]. */
function periodic(rng, freqs, falloff = 0.55) {
  const waves = [];
  let amp = 1, total = 0;
  for (const f of freqs) {
    waves.push({ f, a: amp, p: rng() * TAU });
    total += amp;
    amp *= falloff;
  }
  return (x) => {
    let s = 0;
    for (const w of waves) s += Math.sin((x / TILE) * TAU * w.f + w.p) * w.a;
    return s / total;
  };
}

function fillProfile(g, profile, top, bottom, grad) {
  g.beginPath();
  g.moveTo(0, bottom - top);
  for (const [x, y] of profile) g.lineTo(x, y - top);
  g.lineTo(TILE, bottom - top);
  g.closePath();
  g.fillStyle = grad;
  g.fill();
}

function strokeProfile(g, profile, top, style, width) {
  g.beginPath();
  profile.forEach(([x, y], i) => (i ? g.lineTo(x, y - top) : g.moveTo(x, y - top)));
  g.strokeStyle = style;
  g.lineWidth = width;
  g.stroke();
}

/** Draw `fn` at x and its wrapped copies so features crossing the tile edge stay seamless. */
function wrapDraw(x, halfWidth, fn) {
  fn(x);
  if (x - halfWidth < 0) fn(x + TILE);
  if (x + halfWidth > TILE) fn(x - TILE);
}

export class Background {
  constructor(seed = 20261024) {
    this.seed = seed;
    this.layers = [];
    this.sky = null;
    this.motes = [];
    this.hue = 0;
    this.decor = 0;   // index into DECORS for the near layer's props
    this.prev = null; // previous palette, kept while crossfading
    this.fade = 1;
  }

  build(W, H, scale) {
    this.prev = null;
    this.fade = 1;
    this.rebuild(W, H, scale);
  }

  /**
   * Stage n (every 5 waves): palette turns n steps around the 12-colour wheel
   * (30° each) and the near-layer decor switches to theme n, crossfading over
   * a couple of seconds.
   */
  setStage(n, fade = true) {
    const hue = (((n * 30) % 360) + 360) % 360, decor = n % DECORS.length;
    if (hue === this.hue && decor === this.decor) return;
    this.prev = fade && this.sky ? { sky: this.sky, layers: this.layers } : null;
    this.fade = this.prev ? 0 : 1;
    this.hue = hue;
    this.decor = decor;
    if (this.W) this.rebuild(this.W, this.H, this.scale);
  }

  tick(dt) {
    if (!this.prev) return;
    this.fade += dt / 2.5;
    if (this.fade >= 1) {
      this.fade = 1;
      this.prev = null;
    }
  }

  rebuild(W, H, scale) {
    buildHue = this.hue;
    this.W = W;
    this.H = H;
    this.scale = scale;
    const rng = mulberry32(this.seed);
    this.sky = this.buildSky(W, H, scale, rng);
    this.layers = [
      this.buildRidges(H, scale, rng),
      this.buildMesas(H, scale, rng),
      this.buildSpires(H, scale, rng),
      this.buildGround(H, scale, rng),
    ];
    this.motes = [];
    for (let i = 0; i < 34; i++) {
      this.motes.push({ x: rng() * 4000, y: rng() * H, r: 0.8 + rng() * 1.8, f: 1.25 + rng() * 0.6, ph: rng() * TAU });
    }
    this.moteColor = shiftHue('rgba(255,190,235,0.35)', this.hue);
    buildHue = 0;
  }

  buildSky(W, H, scale, rng) {
    const { c, g } = layerCanvas(W, H, scale);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05020c');
    sky.addColorStop(0.4, '#170929');
    sky.addColorStop(0.62, '#3d1442');
    sky.addColorStop(0.78, '#7a2e4e');
    sky.addColorStop(0.9, '#b8584a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // Stars fade out toward the hazy horizon.
    for (let i = 0; i < 260; i++) {
      const y = Math.pow(rng(), 1.6) * H * 0.62;
      g.globalAlpha = (1 - y / (H * 0.62)) * (0.3 + rng() * 0.7);
      g.fillStyle = rng() < 0.15 ? '#ffd7f0' : '#ffffff';
      const s = rng() < 0.08 ? 2 : 1.1;
      g.fillRect(rng() * W, y, s, s);
    }
    g.globalAlpha = 1;

    // Faint nebula smudges.
    for (const [nx, ny, nr, col] of [[0.55, 0.18, 0.35, '120,60,200'], [0.15, 0.32, 0.28, '40,160,200'], [0.85, 0.4, 0.3, '200,60,140']]) {
      const grd = g.createRadialGradient(W * nx, H * ny, 0, W * nx, H * ny, H * nr);
      grd.addColorStop(0, `rgba(${col},0.16)`);
      grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }

    // Low alien sun with a wide glow.
    const sx = W * 0.3, sy = H * 0.68;
    let grd = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.55);
    grd.addColorStop(0, 'rgba(255,190,120,0.6)');
    grd.addColorStop(0.3, 'rgba(255,120,90,0.2)');
    grd.addColorStop(1, 'rgba(255,90,90,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe2b0';
    g.beginPath();
    g.arc(sx, sy, H * 0.05, 0, TAU);
    g.fill();

    // Ringed gas giant.
    const px = W * 0.8, py = H * 0.22, pr = H * 0.12;
    const ring = (start, end) => {
      g.beginPath();
      g.ellipse(px, py, pr * 2.1, pr * 0.42, -0.28, start, end);
      g.strokeStyle = 'rgba(230,190,255,0.55)';
      g.lineWidth = pr * 0.16;
      g.stroke();
      g.strokeStyle = 'rgba(160,120,220,0.5)';
      g.lineWidth = pr * 0.05;
      g.stroke();
    };
    ring(Math.PI, TAU);
    grd = g.createRadialGradient(px - pr * 0.4, py + pr * 0.4, pr * 0.1, px, py, pr);
    grd.addColorStop(0, '#f2a3c7');
    grd.addColorStop(0.6, '#8a4a9e');
    grd.addColorStop(1, '#3a1d52');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(px, py, pr, 0, TAU);
    g.fill();
    g.save();
    g.clip();
    g.globalAlpha = 0.18;
    g.fillStyle = '#2a0f3a';
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.ellipse(px, py + i * pr * 0.28, pr * 1.2, pr * 0.06, -0.28, 0, TAU);
      g.fill();
    }
    g.restore();
    ring(0, Math.PI);

    // Small moon.
    const mx = W * 0.46, my = H * 0.12, mr = H * 0.03;
    g.fillStyle = '#b9c3e6';
    g.beginPath();
    g.arc(mx, my, mr, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(10,5,25,0.7)';
    g.beginPath();
    g.arc(mx + mr * 0.45, my - mr * 0.2, mr, 0, TAU);
    g.fill();
    return c;
  }

  buildRidges(H, scale, rng) {
    const n1 = periodic(rng, [3, 7, 13, 29, 61]);
    const n2 = periodic(rng, [2, 5, 9]);
    const base = H * 0.68, amp = H * 0.24;
    const profile = [];
    for (let x = 0; x <= TILE; x += 4) {
      const ridge = Math.pow(1 - Math.abs(n1(x)), 2);
      profile.push([x, base - amp * (0.55 * ridge + 0.45 * (n2(x) * 0.5 + 0.5))]);
    }
    const top = Math.min(...profile.map((p) => p[1])) - 4;
    const { c, g } = layerCanvas(TILE, H - top, scale);
    const grd = g.createLinearGradient(0, 0, 0, H - top);
    grd.addColorStop(0, '#5b2b66');
    grd.addColorStop(0.5, '#3b1a4d');
    grd.addColorStop(1, '#24102f');
    fillProfile(g, profile, top, H, grd);
    strokeProfile(g, profile, top, 'rgba(255,170,150,0.35)', 1.5);
    return { canvas: c, top, h: H - top, factor: 0.1 };
  }

  buildMesas(H, scale, rng) {
    const base = H * 0.8, amp = H * 0.17;
    const levels = [0.15, 0.4, 0.62, 0.85, 1];
    const segs = [];
    let x = 0;
    while (x < TILE) {
      const w = 70 + rng() * 170;
      segs.push({ w, h: base - amp * levels[Math.floor(rng() * levels.length)] });
      x += w;
    }
    const k = TILE / x;
    for (const s of segs) s.w *= k;
    const bump = periodic(rng, [37, 71, 113], 0.6);
    const slopes = segs.map(() => 14 + rng() * 16);
    const profile = [[0, segs[0].h]];
    let sx = 0;
    segs.forEach((s, i) => {
      const end = sx + s.w;
      const last = i + 1 === segs.length;
      // Flat (slightly eroded) top, then a steep cliff into the next segment.
      for (let px = sx + (i ? slopes[i - 1] : 0); px < end - slopes[i]; px += 6) profile.push([px, s.h + bump(px) * 2.5]);
      profile.push([end - slopes[i], s.h]);
      profile.push(last ? [TILE, segs[0].h] : [end + slopes[i], segs[i + 1].h]);
      sx = end;
    });
    const top = base - amp - 6;
    const { c, g } = layerCanvas(TILE, H - top, scale);
    const grd = g.createLinearGradient(0, 0, 0, H - top);
    grd.addColorStop(0, '#3a1640');
    grd.addColorStop(1, '#1c0a24');
    fillProfile(g, profile, top, H, grd);
    // Rock strata.
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    for (let y = 6; y < H - top; y += 7 + (y % 5)) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(TILE, y);
      g.stroke();
    }
    g.restore();
    strokeProfile(g, profile, top, 'rgba(255,140,120,0.3)', 1.5);
    return { canvas: c, top, h: H - top, factor: 0.26 };
  }

  buildSpires(H, scale, rng) {
    const base = H * 0.88;
    const hill = periodic(rng, [4, 9, 17, 41]);
    const profile = [];
    for (let x = 0; x <= TILE; x += 6) profile.push([x, base + hill(x) * 16]);
    const top = base - 150;
    const { c, g, raw } = layerCanvas(TILE, H - top, scale);
    const yAt = (x) => base + hill(((x % TILE) + TILE) % TILE) * 16 - top;

    // Rock spires (tapered, slightly bent).
    g.fillStyle = '#241030';
    for (let i = 0; i < 12; i++) {
      const x = rng() * TILE, w = 8 + rng() * 16, h = 40 + rng() * 100, bend = (rng() - 0.5) * 24;
      wrapDraw(x, w + Math.abs(bend), (cx) => {
        const y0 = yAt(cx) + 6;
        g.beginPath();
        g.moveTo(cx - w, y0);
        g.quadraticCurveTo(cx - w * 0.4 + bend * 0.5, y0 - h * 0.5, cx + bend, y0 - h);
        g.quadraticCurveTo(cx + w * 0.4 + bend * 0.5, y0 - h * 0.5, cx + w, y0);
        g.closePath();
        g.fill();
      });
    }

    const grd = g.createLinearGradient(0, 0, 0, H - top);
    grd.addColorStop(0, '#2a1236');
    grd.addColorStop(1, '#13071b');
    fillProfile(g, profile, top, H, grd);

    // Themed props (crystals, alien plants, eggs, drums...). They keep their own
    // colours (drawn without the palette hue shift) so they stay recognisable, and
    // use their own random stream so the terrain shape never changes with the theme.
    const decor = DECORS[this.decor], k = decor.scale || 1;
    const drng = mulberry32(this.seed + 7919 * (this.decor + 1));
    for (let i = 0; i < decor.count; i++) {
      const x = drng() * TILE, p = decor.make(drng);
      wrapDraw(x, decor.halfWidth * k, (cx) => {
        raw.save();
        raw.translate(cx, yAt(cx) + 3);
        raw.scale(k, k);
        decor.draw(raw, 0, 0, p);
        raw.restore();
      });
    }
    strokeProfile(g, profile, top, 'rgba(255,120,170,0.25)', 1.5);
    return { canvas: c, top, h: H - top, factor: 0.55 };
  }

  buildGround(H, scale, rng) {
    const y0 = H - GROUND_H;
    // Rough enough to work the vehicles' suspension; vehicles sample this same profile.
    const surf = periodic(rng, [5, 11, 23, 47], 0.6);
    this.groundSurf = surf;
    this.groundBase = y0;
    const profile = [];
    for (let x = 0; x <= TILE; x += 4) profile.push([x, y0 + surf(x) * GROUND_AMP]);
    const top = y0 - 34;
    const { c, g } = layerCanvas(TILE, H - top, scale);
    const yAt = (x) => y0 + surf(((x % TILE) + TILE) % TILE) * GROUND_AMP - top;

    const grd = g.createLinearGradient(0, 0, 0, H - top);
    grd.addColorStop(0, '#26112e');
    grd.addColorStop(0.5, '#170a1f');
    grd.addColorStop(1, '#0a0410');
    fillProfile(g, profile, top, H, grd);

    // Craters.
    for (let i = 0; i < 14; i++) {
      const x = rng() * TILE, rx = 12 + rng() * 34, ry = 2.5 + rng() * 4, dy = 8 + rng() * (GROUND_H - 16);
      wrapDraw(x, rx, (cx) => {
        const cy = yAt(cx) + dy;
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(190,110,200,0.35)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, 0, 0.1, Math.PI - 0.1);
        g.stroke();
      });
    }
    // Rocks.
    for (let i = 0; i < 26; i++) {
      const x = rng() * TILE, s = 3 + rng() * 7, dy = rng() * (GROUND_H - 10);
      wrapDraw(x, s, (cx) => {
        const cy = yAt(cx) + dy;
        g.fillStyle = '#3a1d44';
        g.beginPath();
        g.moveTo(cx - s, cy);
        g.lineTo(cx - s * 0.5, cy - s * 0.8);
        g.lineTo(cx + s * 0.6, cy - s * 0.6);
        g.lineTo(cx + s, cy);
        g.closePath();
        g.fill();
      });
    }
    // Bioluminescent stalks on the horizon line.
    for (let i = 0; i < 16; i++) {
      const x = rng() * TILE, h = 10 + rng() * 22, lean = (rng() - 0.5) * 10;
      const col = rng() < 0.6 ? '#ff4fd8' : '#3ff3d0';
      wrapDraw(x, 20, (cx) => {
        const yb = yAt(cx) + 2;
        g.strokeStyle = '#4a2350';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx, yb);
        g.quadraticCurveTo(cx + lean * 0.3, yb - h * 0.6, cx + lean, yb - h);
        g.stroke();
        const glow = g.createRadialGradient(cx + lean, yb - h, 0, cx + lean, yb - h, 9);
        glow.addColorStop(0, col);
        glow.addColorStop(1, col + '00');
        g.fillStyle = glow;
        g.fillRect(cx + lean - 9, yb - h - 9, 18, 18);
      });
    }
    strokeProfile(g, profile, top, '#8a3f96', 2);
    return { canvas: c, top, h: H - top, factor: 1 };
  }

  render(ctx, scroll) {
    if (this.prev) {
      this.drawSet(ctx, scroll, this.prev);
      ctx.globalAlpha = this.fade;
      this.drawSet(ctx, scroll, this);
      ctx.globalAlpha = 1;
    } else this.drawSet(ctx, scroll, this);
  }

  drawSet(ctx, scroll, set) {
    ctx.drawImage(set.sky, 0, 0, this.W, this.H);
    const s = this.scale;
    for (const L of set.layers) {
      const w = L.canvas.width / s; // exact logical width of the tile bitmap
      const off = (((scroll * L.factor) % w) + w) % w;
      for (let x = -off; x < this.W; x += w) {
        ctx.drawImage(L.canvas, Math.round(x * s) / s, L.top, w, L.h);
      }
    }
  }

  /** Height of the ground surface at a screen x, matching exactly what is drawn. */
  groundY(screenX, scroll) {
    const L = this.layers[this.layers.length - 1];
    const w = L.canvas.width / this.scale;
    const off = (((scroll * L.factor) % w) + w) % w;
    const u = (((screenX + off) % w) + w) % w;
    return this.groundBase + this.groundSurf((u * TILE) / w) * GROUND_AMP;
  }

  /** Floating spores drifting faster than the ground, in front of the action. */
  renderForeground(ctx, scroll, time) {
    const span = this.W + 40;
    ctx.fillStyle = this.moteColor;
    for (const m of this.motes) {
      const x = ((((m.x - scroll * m.f) % span) + span) % span) - 20;
      const y = m.y + Math.sin(time * 0.9 + m.ph) * 8;
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, TAU);
      ctx.fill();
    }
  }
}
