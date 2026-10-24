import { Game } from './game.js';
import { DT, MAX_STEPS_PER_FRAME } from './config.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const game = new Game(canvas, $('safe-probe'));
const screens = { title: $('title'), paused: $('pause'), gameover: $('gameover') };
const isTouch = () => game.input.showTouch;

function refreshUI() {
  const s = game.settings;
  const labels = {
    mode: `CONTROLS: ${s.mode === 'stick' ? 'JOYSTICK' : 'TOUCH-DRAG'}`,
    autoFire: `AUTO-FIRE: ${s.autoFire ? 'ON' : 'OFF'}`,
    sound: `SOUND: ${s.sound ? 'ON' : 'OFF'}`,
  };
  for (const el of document.querySelectorAll('[data-setting]')) el.textContent = labels[el.dataset.setting];
  const binds = { hi: game.hiScore, score: game.score, wave: game.director.wave };
  for (const el of document.querySelectorAll('[data-bind]')) el.textContent = binds[el.dataset.bind];
  document.body.classList.toggle('touch', isTouch());
  const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  for (const el of document.querySelectorAll('[data-action="fullscreen"]')) el.hidden = !fsOk;
}

function showScreen(state) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== state);
  refreshUI();
}
game.onStateChange = showScreen;
game.onTouchDetected = refreshUI;

function requestFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement || document.webkitFullscreenElement) return Promise.resolve();
  return Promise.resolve(req.call(el, { navigationUI: 'hide' })).catch(() => {});
}

function lockLandscape() {
  try {
    screen.orientation?.lock?.('landscape').catch(() => {});
  } catch {
    /* unsupported (iOS) */
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else requestFullscreen().then(lockLandscape);
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  game.sfx.unlock();
  if (btn.dataset.setting) game.toggleSetting(btn.dataset.setting);
  switch (btn.dataset.action) {
    case 'play':
      // On phones, go fullscreen + landscape (Android). iOS: add to home screen instead.
      if (isTouch()) requestFullscreen().then(lockLandscape);
      game.start();
      break;
    case 'resume':
      game.resume();
      break;
    case 'restart':
      game.start();
      break;
    case 'menu':
      game.toTitle();
      break;
    case 'fullscreen':
      toggleFullscreen();
      break;
  }
  refreshUI();
});

let resizeQueued = false;
function onResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    game.resize();
    if (window.innerHeight > window.innerWidth && isTouch()) game.pause();
  });
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
window.visualViewport?.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});

// Fixed-timestep loop with render interpolation: identical game feel at 60/90/120 Hz.
let last = performance.now();
let acc = 0;
function frame(now) {
  const real = Math.min((now - last) / 1000, 0.1);
  last = now;
  game.realtime(real);
  if (game.state !== 'paused') {
    acc += real * game.timeScale;
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      game.step(DT);
      acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME || game.state === 'paused') acc = 0;
  }
  game.render(game.state === 'paused' ? 1 : acc / DT);
  requestAnimationFrame(frame);
}

showScreen('title');
requestAnimationFrame(frame);

window.__game = game; // handy for debugging from the console
