// Background decor themes for the near parallax layer. The theme changes
// every 5 waves. Each theme: `make(rng)` rolls the parameters for one item,
// `draw(g, cx, y0, p)` paints it standing on the ground at (cx, y0) using
// simple primitive shapes. Colours are hue-shifted by the layer's context.
import { mulberry32 } from './utils.js';

const TAU = Math.PI * 2;

function glow(g, x, y, r, color) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, color + '55');
  grd.addColorStop(1, color + '00');
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function poly(g, pts, fill) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

function ellipse(g, x, y, rx, ry, fill, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fillStyle = fill;
  g.fill();
}

export const DECORS = [
  // 1. Glowing crystal clusters (waves 1-5).
  {
    name: 'crystals', count: 9, halfWidth: 40,
    make(r) {
      const size = 0.7 + r() * 0.8, n = 3 + Math.floor(r() * 3);
      const hue = r() < 0.7 ? ['#3ff3d0', '#1aa892'] : ['#ff5fd2', '#a8318a'];
      const shards = [];
      for (let k = 0; k < n; k++) shards.push({ dx: (r() - 0.5) * 22 * size, h: (14 + r() * 26) * size, w: (4 + r() * 4) * size, a: (r() - 0.5) * 0.9 });
      return { size, hue, shards };
    },
    draw(g, cx, y0, p) {
      glow(g, cx, y0 - 10, 40 * p.size, p.hue[0]);
      for (const s of p.shards) {
        g.save();
        g.translate(cx + s.dx, y0);
        g.rotate(s.a);
        poly(g, [[-s.w, 0], [-s.w, -s.h * 0.75], [0, -s.h], [s.w, -s.h * 0.75], [s.w, 0]], p.hue[1]);
        poly(g, [[0, 0], [0, -s.h], [s.w, -s.h * 0.75], [s.w, 0]], p.hue[0]);
        g.restore();
      }
    },
  },

  // 2. Alien plants: curling stalks with glowing seed bulbs.
  {
    name: 'alien plants', count: 10, halfWidth: 60, scale: 1.15,
    make(r) {
      const stalks = [];
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        stalks.push({ dx: (r() - 0.5) * 30, h: 30 + r() * 55, lean: (r() - 0.5) * 40, curl: (r() - 0.5) * 30, bulb: 4 + r() * 5, pods: Math.floor(r() * 3) });
      }
      return { stalks, color: r() < 0.6 ? '#ff5fd2' : '#7dffcf', leaves: 3 + Math.floor(r() * 3), seed: r() };
    },
    draw(g, cx, y0, p) {
      g.lineCap = 'round';
      for (let i = 0; i < p.leaves; i++) {
        const a = -Math.PI / 2 + (i / (p.leaves - 1 || 1) - 0.5) * 2.2, L = 16 + (i % 2) * 8;
        const tx = cx + Math.cos(a) * L, ty = y0 + Math.sin(a) * L;
        g.beginPath();
        g.moveTo(cx - 3, y0);
        g.quadraticCurveTo(cx + Math.cos(a - 0.5) * L * 0.8, y0 + Math.sin(a - 0.5) * L * 0.8, tx, ty);
        g.quadraticCurveTo(cx + Math.cos(a + 0.5) * L * 0.8, y0 + Math.sin(a + 0.5) * L * 0.8, cx + 3, y0);
        g.fillStyle = '#1f4a3a';
        g.fill();
      }
      for (const s of p.stalks) {
        const bx = cx + s.dx, tx = bx + s.lean, ty = y0 - s.h;
        const mx = bx + s.curl, my = y0 - s.h * 0.55;
        g.strokeStyle = '#2f5a48';
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(bx, y0);
        g.quadraticCurveTo(mx, my, tx, ty);
        g.stroke();
        for (let k = 1; k <= s.pods; k++) {
          const t = k / (s.pods + 1);
          const px = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * tx;
          const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * ty;
          ellipse(g, px + 4, py, 3, 2, '#3f7a5a');
        }
        glow(g, tx, ty, s.bulb * 4, p.color);
        ellipse(g, tx, ty, s.bulb, s.bulb * 1.2, p.color);
        ellipse(g, tx - s.bulb * 0.3, ty - s.bulb * 0.4, s.bulb * 0.35, s.bulb * 0.35, '#ffffff');
      }
    },
  },

  // 3. Alien egg clutches, some hatched.
  {
    name: 'alien eggs', count: 9, halfWidth: 45, scale: 1.4,
    make(r) {
      const eggs = [];
      const n = 3 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) eggs.push({ dx: (k - (n - 1) / 2) * 13 + (r() - 0.5) * 6, h: 16 + r() * 20, tilt: (r() - 0.5) * 0.4, cracked: r() < 0.3 });
      return { eggs };
    },
    draw(g, cx, y0, p) {
      ellipse(g, cx, y0, 46, 6, '#7dff3a33');
      glow(g, cx, y0 - 8, 44, '#9dff6a');
      for (const e of p.eggs) {
        const ex = cx + e.dx, ey = y0 - e.h * 0.5, rx = e.h * 0.36, ry = e.h * 0.5;
        ellipse(g, ex, ey, rx, ry, '#cbbf9a', e.tilt);
        ellipse(g, ex - rx * 0.35, ey - ry * 0.35, rx * 0.3, ry * 0.25, '#efe6c8', e.tilt);
        g.strokeStyle = 'rgba(122,74,106,0.6)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(ex, ey + ry * 0.8);
        g.quadraticCurveTo(ex + rx * 0.6, ey, ex - rx * 0.2, ey - ry * 0.6);
        g.stroke();
        ellipse(g, ex + rx * 0.3, ey + ry * 0.2, 1.8, 1.8, '#9dff6a');
        if (e.cracked) {
          ellipse(g, ex, ey - ry * 0.7, rx * 0.7, ry * 0.22, '#1a0e1e', e.tilt);
          g.strokeStyle = '#3a2533';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(ex - rx * 0.7, ey - ry * 0.6);
          for (let i = 1; i <= 4; i++) g.lineTo(ex - rx * 0.7 + (i * rx * 1.4) / 4, ey - ry * (i % 2 ? 0.35 : 0.6));
          g.stroke();
        }
      }
    },
  },

  // 4. Toxic waste drums: stacks, tipped barrels and glowing puddles.
  {
    name: 'toxic drums', count: 9, halfWidth: 45, scale: 1.7,
    make(r) {
      const drums = [];
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) drums.push({ dx: (k - (n - 1) / 2) * 16, tipped: r() < 0.25 });
      if (n >= 3 && r() < 0.6) drums.push({ dx: 0, row: 1, tipped: false });
      return { drums, puddle: 18 + r() * 20 };
    },
    draw(g, cx, y0, p) {
      ellipse(g, cx + 6, y0, p.puddle, 4, '#7dff3a99');
      glow(g, cx + 6, y0 - 4, p.puddle * 1.6, '#7dff3a');
      for (const d of p.drums) {
        const w = 12, h = 18;
        g.save();
        g.translate(cx + d.dx, y0 - (d.row ? h : 0));
        if (d.tipped) {
          g.translate(0, -w / 2);
          g.rotate(Math.PI / 2);
          g.translate(-h / 2, 0);
        }
        g.fillStyle = '#c9a227';
        g.fillRect(-w / 2, -h, w, h);
        ellipse(g, 0, -h, w / 2, 2.5, '#e6c34a');
        g.fillStyle = '#2b2230';
        g.fillRect(-w / 2, -h * 0.62, w, h * 0.26);
        // Trefoil hazard mark.
        g.fillStyle = '#e6c34a';
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(0, -h * 0.49);
          g.arc(0, -h * 0.49, 2.2, (i * TAU) / 3, (i * TAU) / 3 + 0.9);
          g.fill();
        }
        g.fillStyle = '#7dff3a';
        g.fillRect(w / 2 - 3, -h, 2, h * 0.5);
        g.restore();
      }
    },
  },

  // 5. Defunct missiles: rusting hulks stuck nose-down in the ground.
  {
    name: 'defunct missiles', count: 7, halfWidth: 120, scale: 1.1,
    make(r) {
      const n = 1 + Math.floor(r() * 2), missiles = [];
      for (let k = 0; k < n; k++) missiles.push({ dx: (k - (n - 1) / 2) * 30, len: 50 + r() * 45, ang: -Math.PI / 2 + (r() - 0.5) * 1.1, lying: r() < 0.2, holes: Math.floor(r() * 3) });
      return { missiles };
    },
    draw(g, cx, y0, p) {
      for (const m of p.missiles) {
        const w = m.len * 0.13;
        g.save();
        g.translate(cx + m.dx, y0 + (m.lying ? -w / 2 : 4));
        // Tail points up: rotate so +x runs from the buried nose to the tail.
        g.rotate(m.lying ? 0 : m.ang);
        g.fillStyle = '#8d8f9a';
        g.fillRect(0, -w / 2, m.len, w);
        poly(g, [[0, -w / 2], [-w * 1.4, 0], [0, w / 2]], '#6d6f7a');
        poly(g, [[m.len - w * 1.4, -w / 2], [m.len, -w * 1.6], [m.len, -w / 2]], '#5a5c66');
        poly(g, [[m.len - w * 1.4, w / 2], [m.len, w * 1.6], [m.len, w / 2]], '#5a5c66');
        g.fillStyle = '#7a4a2a';
        g.fillRect(m.len * 0.3, -w / 2, m.len * 0.15, w);
        g.fillStyle = '#c84a4a';
        g.fillRect(m.len * 0.62, -w / 2, m.len * 0.06, w);
        g.fillStyle = '#1a0e1e';
        for (let i = 0; i < m.holes; i++) ellipse(g, m.len * (0.45 + i * 0.12), (i % 2 ? 1 : -1) * w * 0.15, w * 0.22, w * 0.16, '#1a0e1e');
        g.restore();
        if (!m.lying) ellipse(g, cx + m.dx, y0 + 3, w * 1.8, 3, '#3a2533');
      }
    },
  },

  // 6. Air fleet control towers with radar dishes and hangars.
  {
    name: 'control towers', count: 4, halfWidth: 85,
    make(r) {
      return { h: 90 + r() * 45, hangar: r() < 0.7, side: r() < 0.5 ? -1 : 1, dish: r() * TAU };
    },
    draw(g, cx, y0, p) {
      if (p.hangar) {
        const hx = cx + p.side * 45;
        g.beginPath();
        g.ellipse(hx, y0, 30, 22, 0, Math.PI, TAU);
        g.fillStyle = '#3a3550';
        g.fill();
        g.strokeStyle = '#5a5470';
        g.lineWidth = 1;
        for (const dx of [-10, 0, 10]) {
          g.beginPath();
          g.moveTo(hx + dx, y0);
          g.lineTo(hx + dx, y0 - Math.sqrt(1 - (dx / 30) ** 2) * 22);
          g.stroke();
        }
        g.fillStyle = '#ffd27a55';
        g.fillRect(hx - 8, y0 - 12, 16, 12);
      }
      const h = p.h, top = y0 - h;
      poly(g, [[cx - 9, y0], [cx + 9, y0], [cx + 5, top + 14], [cx - 5, top + 14]], '#4a4560');
      poly(g, [[cx - 20, top], [cx + 20, top], [cx + 14, top + 16], [cx - 14, top + 16]], '#5a5470');
      g.fillStyle = '#7fd6ff';
      g.fillRect(cx - 17, top + 3, 34, 6);
      glow(g, cx, top + 6, 26, '#7fd6ff');
      g.fillStyle = '#3a3550';
      g.fillRect(cx - 22, top - 3, 44, 4);
      g.strokeStyle = '#8d8fa8';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx, top - 3);
      g.lineTo(cx, top - 26);
      g.stroke();
      glow(g, cx, top - 26, 10, '#ff3b5c');
      ellipse(g, cx, top - 26, 2, 2, '#ff3b5c');
      // Radar dish on an arm.
      const dx = cx + 13, dy = top - 10;
      g.beginPath();
      g.moveTo(cx + 6, top - 3);
      g.lineTo(dx, dy);
      g.stroke();
      g.beginPath();
      g.ellipse(dx, dy, 7, 3, p.dish, 0, Math.PI);
      g.fillStyle = '#b9bdd0';
      g.fill();
    },
  },

  // 7. City metropolis: clusters of mixed towers with lit windows.
  {
    name: 'metropolis', count: 6, halfWidth: 165,
    make(r) {
      const n = 4 + Math.floor(r() * 5), bs = [];
      let x = 0;
      for (let k = 0; k < n; k++) {
        const w = 12 + r() * 20;
        bs.push({ x, w, h: 30 + r() * 105, type: ['block', 'stepped', 'dome', 'spire', 'twin'][Math.floor(r() * 5)], seed: Math.floor(r() * 1e9), tone: r() < 0.5 ? '#251a3a' : '#2e2245' });
        x += w + 2 + r() * 4;
      }
      const shift = (bs[0].x + x) / 2;
      for (const b of bs) b.x -= shift;
      return { bs };
    },
    draw(g, cx, y0, p) {
      for (const b of p.bs) {
        const x = cx + b.x, top = y0 - b.h;
        g.fillStyle = b.tone;
        if (b.type === 'stepped') {
          g.fillRect(x, top + b.h * 0.3, b.w, b.h * 0.7);
          g.fillRect(x + b.w * 0.15, top + b.h * 0.12, b.w * 0.7, b.h * 0.2);
          g.fillRect(x + b.w * 0.3, top, b.w * 0.4, b.h * 0.12);
        } else if (b.type === 'twin') {
          g.fillRect(x, top, b.w * 0.42, b.h);
          g.fillRect(x + b.w * 0.58, top + b.h * 0.1, b.w * 0.42, b.h * 0.9);
          g.fillRect(x + b.w * 0.4, top + b.h * 0.45, b.w * 0.2, 4);
        } else {
          g.fillRect(x, top, b.w, b.h);
          if (b.type === 'dome') {
            g.beginPath();
            g.ellipse(x + b.w / 2, top, b.w / 2, b.w * 0.4, 0, Math.PI, TAU);
            g.fill();
          }
          if (b.type === 'spire') {
            poly(g, [[x + b.w * 0.3, top], [x + b.w / 2, top - b.h * 0.35], [x + b.w * 0.7, top]], b.tone);
            glow(g, x + b.w / 2, top - b.h * 0.35, 8, '#ff3b5c');
          }
        }
        // Lit windows (deterministic per building so wrapped copies match).
        const wr = mulberry32(b.seed);
        for (let wy = top + 5; wy < y0 - 4; wy += 6) {
          for (let wx = x + 2; wx < x + b.w - 3; wx += 5) {
            const v = wr();
            if (v < 0.35) {
              g.fillStyle = v < 0.12 ? '#7fd6ff' : '#ffd27a';
              g.fillRect(wx, wy, 2, 2.5);
            }
          }
        }
      }
    },
  },

  // 8. Palm trees with drooping fronds and coconuts.
  {
    name: 'palm trees', count: 9, halfWidth: 85,
    make(r) {
      const n = 1 + Math.floor(r() * 3), trees = [];
      for (let k = 0; k < n; k++) trees.push({ dx: (k - (n - 1) / 2) * 24 + (r() - 0.5) * 8, h: 50 + r() * 45, lean: (r() - 0.5) * 36, fronds: 5 + Math.floor(r() * 3), rot: r() });
      return { trees };
    },
    draw(g, cx, y0, p) {
      g.lineCap = 'round';
      for (const t of p.trees) {
        const bx = cx + t.dx, tx = bx + t.lean, ty = y0 - t.h, mx = bx + t.lean * 0.15, my = y0 - t.h * 0.5;
        g.strokeStyle = '#5a3d2a';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(bx, y0);
        g.quadraticCurveTo(mx, my, tx, ty);
        g.stroke();
        g.strokeStyle = '#3e2a1c';
        g.lineWidth = 1;
        for (let k = 1; k < 8; k++) {
          const s = k / 8;
          const px = (1 - s) * (1 - s) * bx + 2 * (1 - s) * s * mx + s * s * tx;
          const py = (1 - s) * (1 - s) * y0 + 2 * (1 - s) * s * my + s * s * ty;
          g.beginPath();
          g.moveTo(px - 3, py);
          g.lineTo(px + 3, py);
          g.stroke();
        }
        for (let i = 0; i < t.fronds; i++) {
          const a = -Math.PI + ((i + 0.5) / t.fronds) * Math.PI + (t.rot - 0.5) * 0.4;
          const L = 26 + (i % 2) * 8;
          const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.5 + L * 0.45;
          const cxp = tx + Math.cos(a) * L * 0.6, cyp = ty + Math.sin(a) * L * 0.9 - 6;
          g.beginPath();
          g.moveTo(tx, ty);
          g.quadraticCurveTo(cxp, cyp - 5, ex, ey);
          g.quadraticCurveTo(cxp, cyp + 3, tx, ty);
          g.fillStyle = i % 2 ? '#2f7a3a' : '#3d9447';
          g.fill();
        }
        for (const ox of [-3, 2, 0]) ellipse(g, tx + ox, ty + 4 + (ox === 0 ? 3 : 0), 2.6, 2.6, '#4a2f1a');
      }
    },
  },

  // 9. Nuclear reactors: hyperboloid cooling towers venting steam, plus a reactor dome.
  {
    name: 'nuclear reactors', count: 4, halfWidth: 120,
    make(r) {
      return { towers: 1 + Math.floor(r() * 2), h: 70 + r() * 35, dome: r() < 0.8, steam: Math.floor(r() * 1e9) };
    },
    draw(g, cx, y0, p) {
      const sr = mulberry32(p.steam);
      for (let k = 0; k < p.towers; k++) {
        const tx = cx + (k - (p.towers - 1) / 2) * 52, h = p.h * (k ? 0.85 : 1), wB = 24, wT = 15, top = y0 - h;
        g.beginPath();
        g.moveTo(tx - wB, y0);
        g.quadraticCurveTo(tx - wT * 0.55, y0 - h * 0.55, tx - wT, top);
        g.lineTo(tx + wT, top);
        g.quadraticCurveTo(tx + wT * 0.55, y0 - h * 0.55, tx + wB, y0);
        g.closePath();
        g.fillStyle = '#8a8fa0';
        g.fill();
        g.fillStyle = '#c84a4a';
        g.fillRect(tx - wT, top, wT * 2, 5);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(tx, top + 5, wT * 0.9, h - 5);
        for (let i = 0; i < 6; i++) {
          g.globalAlpha = 0.22 - i * 0.025;
          ellipse(g, tx + (sr() - 0.3) * 18 + i * 5, top - 8 - i * 11, 10 + i * 4, 7 + i * 3, '#f2eef8');
        }
        g.globalAlpha = 1;
      }
      if (p.dome) {
        const dx = cx + p.towers * 34 + 10;
        g.fillStyle = '#5a5f7a';
        g.fillRect(dx - 18, y0 - 18, 36, 18);
        g.beginPath();
        g.ellipse(dx, y0 - 18, 18, 16, 0, Math.PI, TAU);
        g.fill();
        glow(g, dx, y0 - 10, 30, '#5fc8ff');
        g.fillStyle = '#5fc8ff';
        g.fillRect(dx - 12, y0 - 12, 5, 4);
        g.fillRect(dx - 2, y0 - 12, 5, 4);
        g.fillRect(dx + 8, y0 - 12, 5, 4);
        // Radiation trefoil.
        g.fillStyle = '#ffd23f';
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(dx, y0 - 26);
          g.arc(dx, y0 - 26, 5, (i * TAU) / 3 - Math.PI / 2, (i * TAU) / 3 - Math.PI / 2 + 0.9);
          g.fill();
        }
      }
    },
  },

  // 10. Crashed starship wrecks: broken hull sections half-buried, still smouldering.
  {
    name: 'starship wrecks', count: 4, halfWidth: 120,
    make(r) {
      return { len: 110 + r() * 60, tilt: -0.12 - r() * 0.18, broken: r() < 0.6, fire: Math.floor(r() * 1e9) };
    },
    draw(g, cx, y0, p) {
      const L = p.len, H = L * 0.28;
      g.save();
      g.translate(cx, y0 + 6);
      g.rotate(p.tilt);
      // Main hull, nose buried in the ground on the left.
      poly(g, [[-L / 2, 0], [-L / 2 + H * 0.6, -H], [L * 0.25, -H * 1.05], [L / 2, -H * 0.6], [L / 2, 0]], '#5a5f7a');
      poly(g, [[-L * 0.1, -H], [L * 0.15, -H * 1.55], [L * 0.3, -H * 1.5], [L * 0.25, -H * 1.05]], '#4a4f66');
      g.fillStyle = '#7fd6ff55';
      for (let i = 0; i < 5; i++) g.fillRect(-L * 0.3 + i * L * 0.11, -H * 0.7, L * 0.05, H * 0.18);
      g.fillStyle = '#2b2230';
      g.fillRect(-L * 0.05, -H * 0.45, L * 0.18, H * 0.45);
      if (p.broken) {
        // Torn-off tail with jagged edge and exposed ribs.
        poly(g, [[L * 0.35, 0], [L * 0.38, -H * 0.5], [L * 0.44, -H * 0.3], [L * 0.47, -H * 0.62], [L / 2, -H * 0.6], [L / 2, 0]], '#1a0e1e');
        g.strokeStyle = '#8d8fa8';
        g.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(L * (0.36 + i * 0.04), 0);
          g.lineTo(L * (0.36 + i * 0.04), -H * 0.45);
          g.stroke();
        }
      }
      // Engine pod with a dead nozzle.
      g.fillStyle = '#3a3550';
      g.fillRect(L * 0.18, -H * 0.3, L * 0.22, H * 0.25);
      g.restore();
      glow(g, cx + L * 0.2, y0 - H * 0.6, 26, '#ff9a3c');
      const fr = mulberry32(p.fire);
      for (let i = 0; i < 5; i++) {
        g.globalAlpha = 0.2 - i * 0.03;
        ellipse(g, cx + L * 0.2 + (fr() - 0.5) * 10 - i * 6, y0 - H * 0.8 - i * 12, 7 + i * 3, 5 + i * 2, '#3a2f3f');
      }
      g.globalAlpha = 1;
    },
  },

  // 11. Giant fossil skeletons: arching ribcages and skulls of colossal creatures.
  {
    name: 'fossil skeletons', count: 4, halfWidth: 110,
    make(r) {
      return { len: 120 + r() * 60, ribs: 6 + Math.floor(r() * 4), skull: r() < 0.7, dir: r() < 0.5 ? -1 : 1 };
    },
    draw(g, cx, y0, p) {
      const L = p.len, bone = '#d9d0b8';
      g.strokeStyle = bone;
      g.lineCap = 'round';
      // Spine.
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx - L / 2, y0 - 6);
      g.quadraticCurveTo(cx, y0 - L * 0.42, cx + L / 2, y0 - 4);
      g.stroke();
      // Ribs arching down from the spine to the ground.
      g.lineWidth = 3;
      for (let i = 0; i < p.ribs; i++) {
        const t = (i + 1) / (p.ribs + 1);
        const sx = cx - L / 2 + L * t;
        const sy = (1 - t) * (1 - t) * (y0 - 6) + 2 * (1 - t) * t * (y0 - L * 0.42) + t * t * (y0 - 4);
        const reach = 18 + Math.sin(t * Math.PI) * 14;
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo(sx + reach * 0.9, sy + (y0 - sy) * 0.3, sx + reach * 0.4, y0);
        g.stroke();
      }
      if (p.skull) {
        const hx = cx + p.dir * (L / 2 + 10), hy = y0 - 10;
        ellipse(g, hx, hy, 16, 11, bone);
        poly(g, [[hx + p.dir * 8, hy - 2], [hx + p.dir * 34, hy + 4], [hx + p.dir * 8, hy + 8]], bone);
        ellipse(g, hx + p.dir * 2, hy - 2, 4, 4, '#1a0e1e');
        // Horn.
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(hx - p.dir * 6, hy - 8);
        g.quadraticCurveTo(hx - p.dir * 18, hy - 26, hx - p.dir * 8, hy - 36);
        g.stroke();
      }
    },
  },

  // 12. Deep-space listening array: big radio dishes on lattice towers.
  {
    name: 'radio dish array', count: 5, halfWidth: 75,
    make(r) {
      return { size: 0.8 + r() * 0.5, ang: -0.9 - r() * 0.7, beacon: r() < 0.6 };
    },
    draw(g, cx, y0, p) {
      const k = p.size, h = 60 * k;
      // Lattice tower.
      g.strokeStyle = '#8d8fa8';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - 14 * k, y0);
      g.lineTo(cx - 3 * k, y0 - h);
      g.moveTo(cx + 14 * k, y0);
      g.lineTo(cx + 3 * k, y0 - h);
      g.stroke();
      g.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const t = i / 5, w = 14 * k - 11 * k * t, y = y0 - h * t;
        g.beginPath();
        g.moveTo(cx - w, y);
        g.lineTo(cx + w - 2, y - h / 5);
        g.moveTo(cx + w, y);
        g.lineTo(cx - w + 2, y - h / 5);
        g.stroke();
      }
      // Dish, tilted toward the sky, with a feed horn.
      g.save();
      g.translate(cx, y0 - h);
      g.rotate(p.ang + Math.PI / 2);
      g.beginPath();
      g.ellipse(0, 0, 34 * k, 12 * k, 0, 0, Math.PI);
      g.fillStyle = '#c9cde0';
      g.fill();
      g.beginPath();
      g.ellipse(0, 0, 34 * k, 4 * k, 0, 0, TAU);
      g.fillStyle = '#9da2b8';
      g.fill();
      g.strokeStyle = '#8d8fa8';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-20 * k, 0);
      g.lineTo(0, -26 * k);
      g.lineTo(20 * k, 0);
      g.stroke();
      ellipse(g, 0, -26 * k, 3, 3, '#5a5f7a');
      g.restore();
      if (p.beacon) {
        glow(g, cx, y0 - h - 4, 12, '#ff3b5c');
        ellipse(g, cx, y0 - h - 4, 2, 2, '#ff3b5c');
      }
    },
  },

  // 13. Ancient alien monolith ruins: standing slabs with glowing glyphs and a broken arch.
  {
    name: 'monolith ruins', count: 6, halfWidth: 90,
    make(r) {
      const slabs = [];
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        slabs.push({ dx: (k - (n - 1) / 2) * 26 + (r() - 0.5) * 8, w: 9 + r() * 7, h: 40 + r() * 60, tilt: (r() - 0.5) * 0.25, broken: r() < 0.35, glyphs: 2 + Math.floor(r() * 3) });
      }
      return { slabs, arch: r() < 0.4, side: r() < 0.5 ? -1 : 1 };
    },
    draw(g, cx, y0, p) {
      if (p.arch) {
        // Ruined gateway behind the slabs.
        const ax = cx + p.side * 50;
        g.fillStyle = '#2e2a44';
        g.fillRect(ax - 22, y0 - 70, 9, 70);
        g.fillRect(ax + 13, y0 - 52, 9, 52);
        g.beginPath();
        g.moveTo(ax - 22, y0 - 70);
        g.quadraticCurveTo(ax, y0 - 96, ax + 14, y0 - 74);
        g.lineTo(ax + 6, y0 - 70);
        g.quadraticCurveTo(ax - 2, y0 - 84, ax - 13, y0 - 66);
        g.closePath();
        g.fill();
        glow(g, ax, y0 - 40, 26, '#7dffcf');
      }
      for (const s of p.slabs) {
        g.save();
        g.translate(cx + s.dx, y0 + 2);
        g.rotate(s.tilt);
        const top = s.broken ? -s.h * 0.6 : -s.h;
        poly(g, s.broken
          ? [[-s.w / 2, 0], [-s.w / 2, top], [-s.w * 0.1, top - 6], [s.w * 0.2, top + 3], [s.w / 2, top - 4], [s.w / 2, 0]]
          : [[-s.w / 2, 0], [-s.w / 2, top + 4], [0, top], [s.w / 2, top + 4], [s.w / 2, 0]], '#3a3550');
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(s.w * 0.1, top + 4, s.w * 0.4, -top - 4);
        // Glowing glyphs carved down the face.
        g.fillStyle = '#7dffcf';
        for (let i = 0; i < s.glyphs; i++) {
          const gy = top + 10 + i * 12;
          if (gy > -6) break;
          g.fillRect(-s.w * 0.25, gy, s.w * 0.5, 1.5);
          g.fillRect(-s.w * 0.05, gy - 3, 1.5, 7);
        }
        g.restore();
        glow(g, cx + s.dx, y0 + top * 0.5, 14, '#7dffcf');
      }
    },
  },
];
