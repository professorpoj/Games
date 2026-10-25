// Geometric formation generators. Each shape builds `n` points with roughly
// 1 unit between neighbours; buildFormation() centers, scales to the swarm's
// spacing and shrinks the result to fit the screen.
import { TAU } from './utils.js';

function perimeterLength(verts) {
  let len = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

/** Distribute n points evenly along a closed polygon, scaled so they sit `gap` apart. */
function alongPerimeter(verts, n, gap = 1) {
  const k = (n * gap) / perimeterLength(verts);
  const v = verts.map(([x, y]) => [x * k, y * k]);
  const segs = v.map((a, i) => {
    const b = v[(i + 1) % v.length];
    return [a, b, Math.hypot(b[0] - a[0], b[1] - a[1])];
  });
  const pts = [];
  let si = 0, start = 0;
  for (let i = 0; i < n; i++) {
    const d = i * gap;
    while (si < segs.length - 1 && d > start + segs[si][2]) {
      start += segs[si][2];
      si++;
    }
    const [a, b, len] = segs[si];
    const t = len > 0 ? Math.min(1, (d - start) / len) : 0;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return pts;
}

function starVerts(points, inner) {
  const v = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 1;
    const a = Math.PI + (i * Math.PI) / points; // a point aims at the player (left)
    v.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return v;
}

function ring(n, r, phase = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

// `min`: smallest member count the shape reads well with.
// `rotates`: whether the swarm slowly spins this shape.
// `pattern`: how enhanced members time a coordinated special in this shape:
//   burst = all at once, ripple = one after another along the shape,
//   alternate = every other ship, in two volleys.
export const SHAPES = {
  vee: {
    min: 3, rotates: false, pattern: 'alternate',
    build(n) {
      const p = [[0, 0]];
      for (let i = 1; p.length < n; i++) {
        p.push([i * 0.8, -i * 0.72]);
        if (p.length < n) p.push([i * 0.8, i * 0.72]);
      }
      return p;
    },
  },
  arrow: {
    min: 7, rotates: false, pattern: 'alternate',
    build(n) {
      const head = Math.max(2, Math.round(n * 0.3));
      const p = [[0, 0]];
      for (let i = 1; i <= head && p.length < n; i++) {
        p.push([i * 0.75, -i * 0.75]);
        if (p.length < n) p.push([i * 0.75, i * 0.75]);
      }
      for (let j = 1; p.length < n; j++) p.push([j * 1.0, 0]);
      return p;
    },
  },
  wall: {
    min: 3, rotates: false, pattern: 'ripple',
    build: (n) => Array.from({ length: n }, (_, i) => [(i % 2) * 0.9, i * 0.55]),
  },
  row: {
    min: 3, rotates: false, pattern: 'ripple',
    build: (n) => Array.from({ length: n }, (_, i) => [i * 1.05, (i % 2) * 0.35]),
  },
  wave: {
    min: 6, rotates: false, pattern: 'ripple',
    build: (n) => Array.from({ length: n }, (_, i) => [i * 0.85, Math.sin(i * 0.75) * 1.8]),
  },
  grid: {
    min: 6, rotates: false, pattern: 'ripple',
    build(n) {
      const cols = Math.ceil(Math.sqrt(n * 1.3));
      return Array.from({ length: n }, (_, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        return [c + (r % 2) * 0.5, r * 0.87];
      });
    },
  },
  circle: {
    min: 5, rotates: true, pattern: 'burst',
    build: (n) => ring(n, Math.max((n * 1.05) / TAU, 1)),
  },
  rings: {
    min: 12, rotates: true, pattern: 'burst',
    build(n) {
      for (let inner = Math.round(n * 0.4); inner >= 3; inner--) {
        const outer = n - inner;
        const rO = (outer * 1.05) / TAU, rI = (inner * 1.05) / TAU;
        if (rO - rI >= 1) return [...ring(outer, rO), ...ring(inner, rI, Math.PI / inner)];
      }
      return ring(n, (n * 1.05) / TAU);
    },
  },
  diamond: {
    min: 8, rotates: true, pattern: 'alternate',
    build: (n) => alongPerimeter([[-1, 0], [0, -1], [1, 0], [0, 1]], n, 1.05),
  },
  star: {
    min: 10, rotates: true, pattern: 'burst',
    build: (n) => alongPerimeter(starVerts(5, 0.45), n, 1.0),
  },
  triangle: {
    min: 6, rotates: true, pattern: 'alternate',
    build: (n) => alongPerimeter([[-1, 0], [0.5, -0.866], [0.5, 0.866]], n, 1.05),
  },
  bloom: {
    min: 7, rotates: true, pattern: 'burst',
    // Sunflower (Vogel) spiral: a dense, evenly filled disc.
    build: (n) => Array.from({ length: n }, (_, i) => {
      const r = 0.6 * Math.sqrt(i + 0.5), a = i * 2.39996;
      return [Math.cos(a) * r, Math.sin(a) * r];
    }),
  },
  cross: {
    min: 9, rotates: true, pattern: 'alternate',
    build(n) {
      const p = [[0, 0]];
      for (let i = 1; p.length < n; i++) {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (p.length < n) p.push([dx * i, dy * i]);
      }
      return p;
    },
  },
  spiral: {
    min: 8, rotates: true, pattern: 'ripple',
    build(n) {
      const p = [];
      const b = 1.15 / TAU;
      let th = 0.6;
      while (p.length < n) {
        const r = 0.35 + b * th;
        p.push([Math.cos(th) * r, Math.sin(th) * r]);
        th += 1 / r;
      }
      return p;
    },
  },
};

export function shapesFor(n) {
  return Object.keys(SHAPES).filter((k) => SHAPES[k].min <= n);
}

/**
 * Returns slot offsets for `n` members plus the formation's half extents and
 * bounding radius, already fitted inside maxHalfW x maxHalfH.
 */
export function buildFormation(name, n, spacing, maxHalfW, maxHalfH) {
  const shape = SHAPES[name] || SHAPES.circle;
  if (n <= 0) return { slots: [], halfW: 0, halfH: 0, radius: 0 };
  const pts = shape.build(n);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let radius = 0;
  for (const [x, y] of pts) radius = Math.max(radius, Math.hypot(x - cx, y - cy));
  const hw = ((maxX - minX) / 2) * spacing, hh = ((maxY - minY) / 2) * spacing;
  const rr = radius * spacing;
  let fit = 1;
  if (shape.rotates) fit = Math.min(1, Math.min(maxHalfW, maxHalfH) / Math.max(rr, 1e-6));
  else fit = Math.min(1, maxHalfW / Math.max(hw, 1e-6), maxHalfH / Math.max(hh, 1e-6));
  const k = spacing * fit;
  return {
    slots: pts.map(([x, y]) => ({ x: (x - cx) * k, y: (y - cy) * k })),
    halfW: hw * fit,
    halfH: hh * fit,
    radius: rr * fit,
  };
}
