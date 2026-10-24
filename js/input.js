// Unified input: multi-touch on-screen controls (floating analog stick or
// relative touch-drag on the left, FIRE / FOCUS / BOMB on the right) plus
// keyboard for desktop testing.
import { CONTROLS } from './config.js';

const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  fire: ['Space', 'KeyJ', 'KeyZ'],
  focus: ['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyX'],
  bomb: ['KeyB', 'KeyL', 'KeyC'],
  shield: ['KeyV', 'KeyE'],
  pause: ['Escape', 'KeyP'],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());

const hit = (b, p, slack = 1) => {
  const dx = p.x - b.x, dy = p.y - b.y, r = b.r * slack;
  return dx * dx + dy * dy <= r * r;
};

export class Input {
  constructor(game) {
    this.game = game;
    this.mode = 'stick';
    this.keys = new Set();
    this.pointers = new Map();
    this.stick = { id: null, bx: 0, by: 0, kx: 0, ky: 0, homeX: 0, homeY: 0 };
    this.btn = {
      fire: { x: 0, y: 0, r: 60, label: 'FIRE', color: '#4cc9f0', down: false },
      focus: { x: 0, y: 0, r: 40, label: 'FOCUS', color: '#c9b6ff', down: false },
      bomb: { x: 0, y: 0, r: 40, label: 'BOMB', color: '#ff5fd2', down: false },
      shield: { x: 0, y: 0, r: 40, label: 'SHIELD', color: '#7df9ff', down: false },
      pause: { x: 0, y: 0, r: 22, label: 'II', color: '#ffffff', down: false },
    };
    this.leftZone = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.analog = false;
    this.dragDX = 0;
    this.dragDY = 0;
    this.dragId = null;
    this.dragPos = null;
    this.fire = false;
    this.focus = false;
    this.bombQueued = false;
    this.shieldQueued = false;
    this.pauseQueued = false;
    this.showTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.bind();
  }

  bind() {
    const c = this.game.canvas;
    const opts = { passive: false };
    c.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    c.addEventListener('pointermove', (e) => this.onMove(e), opts);
    c.addEventListener('pointerup', (e) => this.onUp(e), opts);
    c.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    c.addEventListener('lostpointercapture', (e) => this.onUp(e), opts);
    // iOS: block magnifier, double-tap zoom, pinch and long-press callouts on the canvas.
    for (const ev of ['touchstart', 'touchmove', 'touchend']) c.addEventListener(ev, (e) => e.preventDefault(), opts);
    document.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.reset());
  }

  layout() {
    const { W, H, insets } = this.game;
    const R = W - insets.r, B = H - insets.b;
    const b = this.btn;
    Object.assign(b.fire, { x: R - 102, y: B - 112 });
    Object.assign(b.focus, { x: R - 226, y: B - 60 });
    Object.assign(b.bomb, { x: R - 82, y: B - 242 });
    Object.assign(b.shield, { x: R - 232, y: B - 176 });
    Object.assign(b.pause, { x: R - 36, y: insets.t + 34 });
    this.stick.homeX = insets.l + 130;
    this.stick.homeY = B - 120;
    this.leftZone = W * 0.5;
  }

  reset() {
    this.keys.clear();
    this.pointers.clear();
    this.stick.id = null;
    this.dragId = null;
    this.dragPos = null;
    this.dragDX = this.dragDY = 0;
    this.bombQueued = this.shieldQueued = this.pauseQueued = false;
    for (const b of Object.values(this.btn)) b.down = false;
  }

  onKey(e, down) {
    if (!GAME_KEYS.has(e.code)) return;
    if (this.game.state === 'playing') e.preventDefault();
    if (down) {
      if (!e.repeat && KEYS.bomb.includes(e.code)) this.bombQueued = true;
      if (!e.repeat && KEYS.shield.includes(e.code)) this.shieldQueued = true;
      if (!e.repeat && KEYS.pause.includes(e.code)) this.pauseQueued = true;
      this.keys.add(e.code);
    } else this.keys.delete(e.code);
  }

  onDown(e) {
    e.preventDefault();
    if (e.pointerType === 'touch' && !this.showTouch) {
      this.showTouch = true;
      this.game.onTouchDetected?.();
    }
    this.game.sfx.unlock();
    if (this.game.state !== 'playing') return;
    const p = this.game.toLogical(e.clientX, e.clientY);
    const rec = { kind: 'none', button: null, x: p.x, y: p.y };
    const b = this.btn;
    if (hit(b.pause, p, 1.5)) {
      this.pauseQueued = true;
    } else if (this.showTouch && hit(b.bomb, p, 1.25)) {
      rec.kind = 'button';
      rec.button = 'bomb';
      this.bombQueued = true;
    } else if (this.showTouch && hit(b.shield, p, 1.25)) {
      rec.kind = 'button';
      rec.button = 'shield';
      this.shieldQueued = true;
    } else if (this.showTouch && hit(b.fire, p, 1.3)) {
      rec.kind = 'button';
      rec.button = 'fire';
    } else if (this.showTouch && hit(b.focus, p, 1.3)) {
      rec.kind = 'button';
      rec.button = 'focus';
    } else if (p.x < this.leftZone) {
      if (this.mode === 'stick' && this.stick.id === null) {
        rec.kind = 'stick';
        const s = this.stick;
        s.id = e.pointerId;
        s.bx = s.kx = p.x;
        s.by = s.ky = p.y;
      } else if (this.mode === 'drag' && this.dragId === null) {
        rec.kind = 'drag';
        this.dragId = e.pointerId;
        this.dragPos = p;
      }
    } else {
      // Right side but not on a button: becomes a "rolling" thumb that can slide onto FIRE/FOCUS.
      rec.kind = 'button';
      rec.button = this.rollTarget(p);
    }
    this.pointers.set(e.pointerId, rec);
    try {
      this.game.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not supported */
    }
  }

  rollTarget(p) {
    if (hit(this.btn.fire, p, 1.3)) return 'fire';
    if (hit(this.btn.focus, p, 1.3)) return 'focus';
    return null;
  }

  onMove(e) {
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    e.preventDefault();
    // Coalesced events give every intermediate touch sample for smoother tracking.
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const last = events && events.length ? events[events.length - 1] : e;
    const p = this.game.toLogical(last.clientX, last.clientY);
    if (rec.kind === 'stick') {
      const s = this.stick, R = CONTROLS.stickRadius;
      let dx = p.x - s.bx, dy = p.y - s.by;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // The base follows the thumb so reversing direction is always instant.
        const k = (d - R) / d;
        s.bx += dx * k;
        s.by += dy * k;
      }
      s.kx = p.x;
      s.ky = p.y;
    } else if (rec.kind === 'drag') {
      this.dragDX += p.x - rec.x;
      this.dragDY += p.y - rec.y;
      this.dragPos = p;
    } else if (rec.kind === 'button' && rec.button !== 'bomb' && rec.button !== 'shield') {
      const cur = rec.button && this.btn[rec.button];
      if (!cur || !hit(cur, p, 1.45)) rec.button = this.rollTarget(p);
    }
    rec.x = p.x;
    rec.y = p.y;
  }

  onUp(e) {
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    if (rec.kind === 'stick') this.stick.id = null;
    if (rec.kind === 'drag') {
      this.dragId = null;
      this.dragPos = null;
    }
    this.pointers.delete(e.pointerId);
  }

  /** Called once per simulation step. */
  poll() {
    const k = this.keys, any = (list) => list.some((c) => k.has(c));
    const b = this.btn;
    b.fire.down = b.focus.down = b.bomb.down = b.shield.down = false;
    for (const rec of this.pointers.values()) if (rec.button) b[rec.button].down = true;

    const s = this.stick;
    if (s.id !== null) {
      const R = CONTROLS.stickRadius, dz = CONTROLS.deadZone;
      const dx = (s.kx - s.bx) / R, dy = (s.ky - s.by) / R;
      const m = Math.min(1, Math.hypot(dx, dy));
      if (m < dz) {
        this.moveX = this.moveY = 0;
      } else {
        const mm = Math.pow((m - dz) / (1 - dz), CONTROLS.curve);
        const len = Math.hypot(dx, dy);
        this.moveX = (dx / len) * mm;
        this.moveY = (dy / len) * mm;
      }
      this.analog = true;
    } else {
      let x = (any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0);
      let y = (any(KEYS.down) ? 1 : 0) - (any(KEYS.up) ? 1 : 0);
      if (x && y) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      this.moveX = x;
      this.moveY = y;
      this.analog = false;
    }
    this.dragActive = this.dragId !== null;
    this.fire = b.fire.down || any(KEYS.fire) || this.game.settings.autoFire;
    this.focus = b.focus.down || any(KEYS.focus);
  }

  consumeBomb() {
    const v = this.bombQueued;
    this.bombQueued = false;
    return v;
  }

  consumeShield() {
    const v = this.shieldQueued;
    this.shieldQueued = false;
    return v;
  }

  consumePause() {
    const v = this.pauseQueued;
    this.pauseQueued = false;
    return v;
  }
}
