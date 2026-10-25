import { CONTROLS, PLAYER, SHIELD } from './config.js';
import { TAU, hexToRgba } from './utils.js';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function shadowText(ctx, text, x, y, color = '#ffffff') {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(text, x + 1.5, y + 1.5);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function miniShip(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x + 9 * s, y);
  ctx.lineTo(x - 6 * s, y - 6 * s);
  ctx.lineTo(x - 3 * s, y);
  ctx.lineTo(x - 6 * s, y + 6 * s);
  ctx.closePath();
  ctx.fill();
}

export function drawHud(ctx, g) {
  const { W, insets } = g;
  const L = insets.l + 16, T = insets.t + 12;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  ctx.font = `700 22px ${MONO}`;
  shadowText(ctx, String(g.score).padStart(7, '0'), L, T);

  // Lives, bombs, weapon power.
  ctx.fillStyle = '#c9f2ff';
  for (let i = 0; i < g.lives; i++) miniShip(ctx, L + 8 + i * 22, T + 40, 1);
  let bx = L + Math.max(g.lives, 1) * 22 + 14;
  for (let i = 0; i < g.bombs; i++) {
    ctx.fillStyle = '#ff5fd2';
    ctx.beginPath();
    ctx.arc(bx + 7 + i * 18, T + 40, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a0614';
    ctx.font = `800 9px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', bx + 7 + i * 18, T + 40.5);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const power = g.player.power;
  for (let i = 0; i < PLAYER.maxPower; i++) {
    ctx.fillStyle = i < power ? '#ffd23f' : 'rgba(255,255,255,0.18)';
    ctx.fillRect(L + i * 11, T + 54, 8, 5);
  }
  const [wt, wb] = g.player.wings;
  if (wt.level || wb.level) {
    // Top / bottom wingman levels ("-" = slot empty).
    ctx.font = `800 11px ${SANS}`;
    shadowText(ctx, `W ${wt.level || '-'}/${wb.level || '-'}`, L + PLAYER.maxPower * 11 + 6, T + 51, '#5dff7a');
  }

  // Shield meter.
  const p = g.player;
  const ready = p.shield >= SHIELD.minToActivate;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(L, T + 64, 42, 5);
  ctx.fillStyle = p.shieldOn ? '#ffffff' : ready ? '#7df9ff' : '#3b6f73';
  ctx.fillRect(L, T + 64, 42 * p.shield, 5);

  // Chain multiplier.
  if (g.chain > 1) {
    const a = Math.min(1, g.chainTimer * 2);
    ctx.globalAlpha = a;
    ctx.font = `800 16px ${SANS}`;
    shadowText(ctx, `x${g.multiplier().toFixed(2)}  ${g.chain} CHAIN`, L + 112, T + 4, '#ffd23f');
    ctx.globalAlpha = 1;
  }

  // Wave / hi-score.
  ctx.textAlign = 'center';
  ctx.font = `700 13px ${SANS}`;
  shadowText(ctx, `WAVE ${g.director.wave}`, W / 2, T + 2, '#d8c8ff');
  ctx.font = `600 11px ${MONO}`;
  shadowText(ctx, `HI ${String(Math.max(g.hiScore, g.score)).padStart(7, '0')}`, W / 2, T + 20, 'rgba(255,255,255,0.6)');

  // Mothership hull meter.
  const ms = g.mothership;
  if (ms && ms.state !== 'retreat') {
    const bw = Math.min(320, W * 0.32), bx0 = W / 2 - bw / 2, by = T + 38;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx0 - 2, by - 2, bw + 4, 10);
    ctx.fillStyle = ms.flash > 0 ? '#ffffff' : '#b46bff';
    ctx.fillRect(bx0, by, (bw * ms.hp) / ms.maxHp, 6);
    ctx.font = `800 10px ${SANS}`;
    shadowText(ctx, `MOTHERSHIP MK ${ms.visit}`, W / 2, by + 10, '#d8c8ff');
  }

  // Center banner.
  const bn = g.banner;
  if (bn) {
    const t = bn.t / bn.dur;
    const a = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
    ctx.globalAlpha = Math.max(0, a);
    ctx.textBaseline = 'middle';
    ctx.font = `900 46px ${SANS}`;
    const y = g.H * 0.36;
    shadowText(ctx, bn.text, W / 2, y, '#ffffff');
    if (bn.sub) {
      ctx.font = `700 16px ${SANS}`;
      shadowText(ctx, bn.sub, W / 2, y + 38, '#ffd23f');
    }
    ctx.globalAlpha = 1;
  }

  if (g.debug) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `600 11px ${MONO}`;
    shadowText(ctx, `${g.fps.toFixed(0)} fps  e:${g.enemies.length} eb:${g.eBullets.list.length} pb:${g.pBullets.list.length} p:${g.particles.pool.list.length}`, L, g.H - insets.b - 18, '#9f9');
  }
}

function drawButton(ctx, b, extra, pressed = b.down) {
  ctx.fillStyle = hexToRgba(b.color, pressed ? 0.42 : 0.14);
  ctx.strokeStyle = hexToRgba(b.color, pressed ? 0.95 : 0.55);
  ctx.lineWidth = pressed ? 3 : 2;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * (pressed ? 0.94 : 1), 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hexToRgba('#ffffff', pressed ? 1 : 0.8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${b.r > 50 ? 17 : 12}px ${SANS}`;
  ctx.fillText(b.label, b.x, b.y - (extra ? 6 : 0));
  if (extra) {
    ctx.font = `700 11px ${SANS}`;
    ctx.fillText(extra, b.x, b.y + 9);
  }
}

function drawShieldButton(ctx, b, p) {
  const ready = p.shield >= SHIELD.minToActivate;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * (ready || p.shieldOn ? 1 : 0.45);
  drawButton(ctx, b, p.shieldOn ? 'ON' : `${Math.floor(p.shield * 100)}%`, b.down || p.shieldOn);
  // Meter ring around the button.
  ctx.strokeStyle = p.shieldOn ? '#ffffff' : '#7df9ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r + 6, -Math.PI / 2, -Math.PI / 2 + p.shield * TAU);
  ctx.stroke();
  ctx.globalAlpha = base;
}

export function drawControls(ctx, g) {
  const input = g.input;
  const b = input.btn;

  // Pause button is always available (mouse / touch).
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(b.pause.x, b.pause.y, b.pause.r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(b.pause.x - 6, b.pause.y - 7, 4, 14);
  ctx.fillRect(b.pause.x + 2, b.pause.y - 7, 4, 14);
  ctx.globalAlpha = 1;

  if (!input.showTouch) return;
  if (g.state === 'paused') ctx.globalAlpha = 0.4;

  // Movement control.
  const s = input.stick, R = CONTROLS.stickRadius;
  if (input.mode === 'stick') {
    const active = s.id !== null;
    const bx = active ? s.bx : s.homeX, by = active ? s.by : s.homeY;
    let kx = active ? s.kx - bx : 0, ky = active ? s.ky - by : 0;
    const d = Math.hypot(kx, ky);
    if (d > R) {
      kx *= R / d;
      ky *= R / d;
    }
    ctx.fillStyle = `rgba(255,255,255,${active ? 0.1 : 0.05})`;
    ctx.strokeStyle = `rgba(255,255,255,${active ? 0.45 : 0.2})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(bx, by, R, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // Dead-zone ring helps with precise small nudges.
    ctx.strokeStyle = `rgba(255,255,255,${active ? 0.18 : 0.08})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx, by, R * CONTROLS.deadZone + 6, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = `rgba(76,201,240,${active ? 0.55 : 0.2})`;
    ctx.beginPath();
    ctx.arc(bx + kx, by + ky, 27, 0, TAU);
    ctx.fill();
    if (!active) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `700 10px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('MOVE', bx, by);
    }
  } else {
    if (input.dragPos) {
      ctx.strokeStyle = 'rgba(76,201,240,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(input.dragPos.x, input.dragPos.y, 26, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `700 11px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DRAG ANYWHERE HERE TO MOVE', s.homeX + 40, s.homeY + 40);
    }
  }

  drawButton(ctx, b.fire, g.settings.autoFire ? 'AUTO' : '');
  drawShieldButton(ctx, b.shield, g.player);
  ctx.globalAlpha *= g.bombs > 0 ? 1 : 0.4;
  drawButton(ctx, b.bomb, `x${g.bombs}`);
  ctx.globalAlpha = 1;
}
