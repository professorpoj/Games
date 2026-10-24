# Swarmbreaker

A side-scrolling space shooter for phones, played in landscape. Your ship flies right at a constant speed over a parallax alien wasteland while enemy swarms flock in and form geometric patterns.

This is a **mechanics prototype**. All the ships, bullets and pickups are placeholder shapes in different colors, ready to be swapped for real art later.

## Play it on your phone (GitHub Pages)

There's no build step. It's plain HTML and JavaScript.

1. Merge this branch into `main`, or deploy straight from this branch.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick the branch, choose `/ (root)`, and click **Save**.
4. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`. Send that link to your friends.

Tips for phones:
- **Android (Chrome):** tapping PLAY switches to fullscreen and locks the screen to landscape.
- **iPhone (Safari):** tap Share → **Add to Home Screen**. Opening it from the home screen runs it fullscreen with no browser bars.

To run it locally: `python3 -m http.server` in this folder, then open http://localhost:8000. ES modules need a web server; opening `index.html` directly won't work. Add `?debug` to the URL to show FPS and entity counts.

## Controls

| Touch (landscape) | Keyboard | Action |
|---|---|---|
| Left half: floating joystick (or touch-drag mode) | WASD / arrows | Move in any direction |
| **FIRE** (hold) | Space / J / Z | Shoot |
| **FOCUS** (hold) | Shift / K / X | Slow, precise movement; tighter spread; shows your hitbox |
| **BOMB** | B / L / C | Clears enemy bullets and damages everything on screen |
| Pause button | P / Esc | Pause |

- **Joystick mode:** the stick appears wherever your left thumb lands and follows it if you drag past the edge, so changing direction is always instant. It has a small dead zone and a gentle response curve for fine adjustments.
- **Touch-drag mode** (switch it in the menu): the ship moves 1:1 with your finger, like a trackpad. This is the most precise option.
- Your right thumb can **roll** between FIRE and FOCUS without lifting.
- **Auto-fire** can be turned on in the menu.

## Mechanics

- **Fixed 120 Hz simulation with render interpolation.** Movement and collisions behave the same on 60, 90 and 120 Hz screens.
- **Precise ship.** It speeds up and slows down quickly, stops at the screen edges without bouncing, and has a tiny 4-unit hitbox. Fast bullets use swept collision so they can't pass through you between frames.
- **Weapon power 1–4** from **P** pickups. **B** pickups add bombs. You lose one power level when you die.
- **Chain multiplier** for quick kills in a row, a bonus for wiping out a whole swarm, a bonus for clearing a wave, and an extra ship every 75,000 points.
- Brief slow motion and screen shake when you're hit. After respawning you're invulnerable for a moment.

### Enemy types (placeholders)

| Type | Shape / color | HP | Attack |
|---|---|---|---|
| Stinger | red triangle | 1 | Single, loosely aimed pellets |
| Darter | orange dart | 2 | Leaves formation, flashes a warning, then rams where you're heading and curves back |
| Whirler | green spinning hexagon | 5 | Rotating rings of bullets (spins faster just before firing) |
| Seeker | cyan diamond with an eye | 5 | Aims a laser sight at you, locks on (turns red), then fires a 3-needle burst |
| Bulwark | large purple octagon | 32 | Flagship: alternates 5-way spread volleys with homing missiles you can shoot down |

### Swarms

Each swarm follows a moving anchor point. It either flies straight across the screen, weaves up and down, or flies in, holds position, then leaves. Members switch between two behaviors:

- **Murmuration:** a bird-like flock that swirls around the anchor while keeping a loose ball shape and spacing apart.
- **Formation:** members steer into slots in a geometric shape: vee, arrow, wall, row, wave, hex grid, circle, double ring, diamond, star, triangle, sunflower, cross or spiral. Some shapes slowly rotate.

When a ship is destroyed, the formation re-forms around the survivors. Bulwarks lead from behind their escorts.

New enemy types unlock as waves go up. Every 5th wave brings a flagship. Fire rate, bullet speed and enemy HP increase over time.

## Code layout

```
index.html            menus and page shell
css/style.css
js/main.js            game loop, menus, fullscreen and orientation handling
js/game.js            game state, spawning, collisions, rendering
js/config.js          tuning values (speeds, controls, caps)
js/input.js           multi-touch controls and keyboard
js/player.js          ship movement, weapons, placeholder ship drawing
js/enemies.js         enemy stats, attacks, placeholder drawing, attack warnings
js/swarm.js           flocking and formation steering, slot assignment
js/formations.js      geometric formation shapes
js/director.js        wave building and difficulty ramp
js/background.js      procedural tiling parallax layers
js/particles.js, js/sprites.js, js/hud.js, js/audio.js
```

To swap in real art later, replace `drawPlayer` (player.js), `drawEnemy` (enemies.js), and the bullet and pickup drawing in `game.js`. The gameplay code doesn't depend on how anything is drawn.
