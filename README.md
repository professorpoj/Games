# Swarmbreaker

A side-scrolling space shooter for phones, played in landscape. Your ship flies right at a constant speed over a parallax alien wasteland while enemy swarms flock in and form geometric patterns.

**Play it:** https://professorpoj.github.io/Games/

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
| **SHIELD** (tap on / tap off) | V / E | Bubble that destroys enemy bullets touching it. Lasts 4 s on a full meter, recharges 5x slower (20 s) |
| **MISSILE** (appears once you have an H; hold to keep firing) | M / Q | Fires a salvo of homing missiles, one per H level, each chasing one of the nearest enemies. Reloads in 1.6 s |
| **SHOCK** | X / C | Shockwave that sweeps the screen and hits every enemy ship once for 14 damage (doesn't touch bullets). Uses one shock round: you start with 2, pink **S** pickups add one (carry up to 5) |
| **BOMB** | B / L | Drops a very heavy **dumb bomb** (see below). Uses one bomb: you start with 3, amber **B** pickups add one (carry up to 5) |
| Pause button | P / Esc | Pause |

- **Dumb bomb:** it leaves the ship with **the ship's own velocity** at the moment you let go (move right while dropping and it carries forward; climb and it's tossed up first), then **only gravity** acts on it (700 units/s², no air resistance), so it flies a true parabola, nose following its flight path. Mass doesn't change how fast it falls, but it hits hard: it explodes on contact with the ground, a vehicle, an enemy ship or the mothership, and the **damage scales radially from the impact point**: **3x the shock** at ground zero (42 to ships and vehicles, 60 to the mothership) falling linearly to nothing 160 units out, measured to each target's nearest edge. The blast also shoves enemy ships away and kicks vehicles up on their suspension. It never hurts you. Tuning is `BOMB` (and `SHOCK`) in `js/config.js`.
- **Ammo:** missiles reload on their own, but shocks and bombs don't: each needs its own pickup. S and B drop separately at the same rate (Bulwarks drop each 40% of the time, and every mothership retreat drops one of each). The HUD shows your stock next to your lives (pink S pips, then amber B pips), and the buttons dim when empty. After you lose a ship you respawn with at least 2 shocks and 3 bombs.
- **Joystick mode:** the stick appears wherever your left thumb lands and follows it if you drag past the edge, so changing direction is always instant. It has a small dead zone and a gentle response curve for fine adjustments.
- **Touch-drag mode** (switch it in the menu): the ship moves 1:1 with your finger, like a trackpad. This is the most precise option.
- **Auto-fire** can be turned on in the menu.

## Mechanics

- **Fixed 120 Hz simulation with render interpolation.** Movement and collisions behave the same on 60, 90 and 120 Hz screens.
- **Precise ship.** It speeds up and slows down quickly, stops at the screen edges without bouncing, and has a tiny 4-unit hitbox. Fast bullets use swept collision so they can't pass through you between frames.
- **Weapon power 1–4** from **P** pickups, which are deliberately rare (every P drop chance is scaled by `P_DROP_RATE` in `js/config.js`, currently 0.35, i.e. 35% of the original rate). **S** pickups add a shock round and **B** pickups add a bomb. **Losing a ship costs two P levels** (the last overdrive steps first, then weapon power levels).
- **Overdrive** (P pickups after max power): at max power your gun fires 7 beam chains. Each extra **P** upgrades one chain, starting with the centre and working outward top/bottom. Damage is relative to the original blue bolt:
  - **Blue** (normal bolts): **0.8×**.
  - **Orange** (P #1–7 past max): **1×**.
  - **Red** (P #8–14): **1.5×**.
  - **Hot neon pink laser** (P #15–16, the 4th tier): the two inner straight chains become continuous lasers (at most **2 lasers**). Each ramps to full power in 0.15 s when you press FIRE and stays on while you hold it, steadily melting everything in its path (enemies, vehicles, the mothership, shootable missiles) at **2×** the chain's damage rate, with molten sparks and embers where it cuts.
  - That's the upgrade cap: after it, P is worth 1,000 points. The HUD pips show each chain's tier (blue / orange / red / pink).
- **Homing missiles** from the **extremely rare orange H** pickup: **one H always drops each time you drive off the mothership**, and any other destroyed enemy, ground vehicle or train car has just a **0.1% chance** (1 in 1,000) to drop one. The first H adds the MISSILE button (above SHIELD) firing 1 missile per salvo; each further H adds one more, up to **5 per salvo**. Missiles launch in a fan, accelerate, and home in on the nearest enemies (air units, ground vehicles or the mothership), switching to a new target if theirs is destroyed. After 5, an H is worth 5,000 points. The HUD shows `H#`.
- **Wingmen** from rare green **W** pickups (Bulwarks drop one half the time). There are two wingmen, top and bottom, and each has its own level:
  - Levels 1–3: 1, 2, then 3 beams, **green** at 0.5× damage
  - Level 4: all beams turn **blue** (0.8×, matching your ship's blue)
  - Levels 5–7: beams turn **orange** (1×) one at a time (centre, top, bottom)
  - Levels 8–10: beams turn **red** (1.5×) one at a time
  - Levels 11–12: the two outer beams become **neon lasers** (2×, continuous while you hold FIRE), so two lasers per wingman
  - Level 13: **bombs** (splash damage that also clears nearby bullets), launched automatically whenever more than 7 enemies are on screen, aimed at the densest cluster ahead. Levels 14–16: faster bombs.

  Each W goes to the weaker wingman, so a lost wingman is rebuilt first until it matches the other. When they're equal, upgrades alternate between them (top, bottom, top...). Once both are at level 16, each W is worth 2,000 points. The HUD shows their levels as `W top/bottom`.

  Wingmen get hit like your ship does: one enemy bullet or collision. **A hit costs that wingman 3 levels** (it blinks for 1.5 s of protection) and it keeps flying; it's only **lost** if the hit takes it below level 1 (so a wingman at level 3 or lower is destroyed). **Losing your ship costs each wingman 3 levels the same way**, and the survivors fly back in with you when you respawn. A newly joined wingman gets 1.5 s of protection. The shield gives each wingman its own small bubble. Tuning is under `WINGMAN` in `js/config.js` (`hitLevelLoss`) and `PLAYER.deathPowerLoss`.
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

### New enemies (one after each mothership battle)

Each one debuts on the wave right after a mothership fight (the wave banner says **NEW ENEMY**) and flies in **its own swarm**: 1 ship on its debut wave, +1 ship every wave after (the same +1 per wave growth as every swarm, up to 40). They never spawn as Mk II. Each attack is built on real physics. Tuning lives at the top of `js/ordnance.js` and in `js/enemies.js`.

| Type (debut) | Shape / color | HP | Attack |
|---|---|---|---|
| Bouncer (wave 6) | lime ball | 3 | Lobs heavy balls under gravity that **bounce off the actual terrain** (the slope decides the bounce angle) and off the top of the screen. Each bounce loses some energy, and friction with the scrolling ground drags them along with it. Balls can be shot down (2 HP). |
| Splitter (wave 11) | white split block | 4 | Fires a **fission core** that swells, flickers and splits in two, then each half splits again (1 → 2 → 4). Every split pushes the halves apart with equal and opposite kicks, so **momentum is conserved** and the fragments fan out predictably. Shooting a core just makes it split early; the shield erases fragments. |
| Graviton (wave 16) | blue pentagon | 6 | Launches a **gravity well** that drag slows to a drift before it switches on for 4 s (rings show its pull range). Every bullet nearby feels a softened **inverse-square pull** (enemy shots slingshot around it, and your own shots bend and get swallowed by the core), and your ship is dragged toward it at up to 150 units/s, which you can always outfly. The core is deadly to touch (the shield protects you). At most 3 wells at once. |
| Flail (wave 21) | copper diamond + chain | 6 | A spiked mace on a **simulated chain** (verlet links with a heavy head) that swings and trails as the ship flies and rests on the ground when it hangs low. To attack it **spins the mace up** (a dashed line shows its current flight direction, sweeping like a lighthouse) and **lets go when that line points at you**, so the mace flies off with its real momentum, under gravity, and bounces on the terrain. The swinging mace is deadly, blocks your shots and isn't stopped by the shield. Thrown maces can be shot down (4 HP). Kill a Flail and its mace flies off with whatever momentum it had. |
| Deflector (wave 26) | teal chevron + mirror | 8 | Carries a **mirror plate** that it turns (at a limited rate) to face you. Your shots that hit the mirror are **reflected** (angle in = angle out, relative to the moving mirror) and come back as slower orange needles, so firing straight at it shoots yourself. Hit it from above or below, move so the mirror lags behind you, or use lasers, which burn straight through. |

### Ground vehicles

Fast ground units race in from off-screen left (a blinking **!** chevron at the left edge warns you), brake down to match the scroll speed, then hold their own positions in the **right 40% of the screen**. They don't track your X position, so you can line up shots on them. They only fire from inside that zone, and **every shot is aimed inside it too**: mortar bursts, tank crosshairs and missile homing all stay in the right 40%, and missiles self-destruct at the zone's left edge. The left side of the screen is safe from ground fire. Vehicle ordnance is deliberately slow. Only as many vehicles as fit in the zone are on screen at once; the rest wait their turn. Each body rides **spring/damper suspension over the actual terrain**, so it bounces, pitches over bumps, squats when accelerating, dives when braking and rocks back when it fires. Wheels spin with ground speed, and dust kicks up behind them. Flying into a vehicle kills you, and they leave after about 30 seconds if you don't destroy them.

| Vehicle | First wave | Behaviour and weapon |
|---|---|---|
| Mortar truck (yellow) | 2 | Soft long-travel suspension; weaves around its spot. Fires 3-shell mortar salvos that arc up and **airburst** where you're heading. A dashed orange ring marks each burst point and fills in as the shell arrives. Shells can be shot down. |
| Turbine tank (3 tiers) | 4 | Six stiff road wheels, scrolling tracks and gas-turbine exhaust that flares with throttle. Parks at random spots between 45% and 25% in from the right edge, moving to a new one every few seconds. It swings its huge turret anywhere and **shells you across the entire screen** (exempt from the right-40% targeting limit), and paints a **red crosshair** with a blast-radius circle where it predicts you'll be. The crosshair locks and flashes, then a fast tracer shell detonates there in a big blast. Heavy muzzle blast and recoil. Comes in **three tiers**, each with faster targeting (turret swing plus the time from crosshair to lock to shot) and a faster shell. **Blue-grey** (from wave 4): 0.7× targeting, 1× shell. **Purple** (from wave 8): 1× targeting, 1.25× shell. **Dark blood red** (from wave 12): 1.5× targeting, 1.5× shell. A new tier always shows up on its debut wave; after that each tank is a random unlocked tier. |
| Missile train (red) | 6 | A locomotive pulling 3 launcher cars (4 from wave 10) on spring couplings that bunch up and stretch apart. Each car fires **wave-path missiles**: they pop up, lock a heading, then snake toward you along a sine wave that slowly homes. Dotted lines preview the path ahead. Missiles can be shot down. Destroying a launcher car disables it; destroying the locomotive (20 HP, half its old toughness) blows up the whole train, car by car. |

The shield stops all of this ordnance (shells fizzle on the bubble), and both the shock and the dumb bomb damage vehicles. Tuning is under `VEHICLES` in `js/config.js`.

**Testing tip:** add `?wave=N` to the URL to start a game at wave N, for example `.../Games/?wave=6` to meet the train right away.

### Planets in the sky

The sky has a slow celestial cycle, drawn behind the mountain silhouettes so the planets set and rise behind them:

1. The **ringed planet** starts in its usual spot and drifts down and left at **19° below the horizontal** until it has fully set behind the far mountains (about 3 minutes).
2. A **much larger banded gas giant**, with a great storm, rises from behind the left 30% of the range and climbs at **32°** until it has left the screen (about 4 minutes).
3. The ringed planet comes back in from off-screen along its own 19° path, sets again, and the cycle repeats.

The cycle runs continuously (including on the title screen), pauses with the game, and takes on the current colour stage's palette. Speed and angles are at the top of `js/background.js`.

### Landscape stages

Every 5 waves the landscape changes as the next wave starts, crossfading over about 2.5 seconds:

- **Colour:** the sky, planet, mountains, mesas, ground and floating spores turn **one step around the 12-colour wheel (30°)**. Waves 1–5 use the original purple dusk, waves 6–10 shift 30°, and so on, coming back around after wave 60.
- **Decor:** the props on the near background layer switch theme. They keep their own colours so they stay recognisable on any palette:

| Waves | Decor |
|---|---|
| 1–5 | Glowing crystals |
| 6–10 | Alien plants with glowing seed bulbs |
| 11–15 | Alien egg clutches, some hatched |
| 16–20 | Toxic waste drums and glowing puddles |
| 21–25 | Defunct missiles stuck in the ground |
| 26–30 | Air fleet control towers with radar and hangars |
| 31–35 | City metropolis: mixed towers with lit windows |
| 36–40 | Palm trees |
| 41–45 | Nuclear reactors: cooling towers venting steam, reactor domes |
| 46–50 | Crashed starship wrecks, smouldering |
| 51–55 | Giant fossil skeletons: ribcages, spines, horned skulls |
| 56–60 | Deep-space radio dish array |
| 61–65 | Ancient alien monolith ruins with glowing glyphs |
| 66+ | The decor list starts over from the crystals, but the colour wheel keeps turning: there are 13 decor themes and 12 colour steps, so each new round of decor gets a different set of colours (crystals return on red-violet at wave 66, the next colour at wave 131, and so on). |

Ships, enemies, bullets and the HUD keep their colours. The decor themes live in `js/decor.js`.

### Mothership (boss)

After every 5th wave a warning sounds and the **mothership** moves in on the right side of the screen. Its main weapon is a **big laser**:

1. **Heat-up:** the emitter on its nose glows from red to white, a dashed red line and a shaded danger band show exactly where the beam will go, and the ship slides up or down to line up with you.
2. **Lock:** about half a second before firing, the aim freezes and the line flashes white and red. That's your cue to move out of the band.
3. **Fire:** a thick beam crosses the whole screen for a second. **The shield doesn't stop it**, so you have to dodge. It also destroys wingmen and kills you if you touch the hull.

It also launches small swarms from its hangar. Shoot the hull enough (its meter is at the top of the screen) and it **retreats** for a big bonus and drops pickups. It isn't destroyed. It comes back after the next 5 waves with more hull and new abilities:

| Visit | Adds |
|---|---|
| Mk 1 (after wave 5) | Heat-up laser, hangar swarms of Stingers |
| Mk 2 (after wave 10) | Side turrets firing aimed spreads; some laser shots **sweep a cone** of 10° above to 10° below horizontal; Darters join the swarms |
| Mk 3 (after wave 15) | Whirlers and Seekers join the swarms |
| Mk 4+ | Fires the laser twice in a row; homing missile salvos |

Its laser also charges faster on every visit, and the sweep cone widens by 5° each way per visit (15° on Mk 3, 20° on Mk 4, … up to 40°). Tuning is under `MOTHERSHIP` in `js/config.js`.

### Enhanced (Mk II) enemies

From wave 7, some ships spawn as **enhanced Mk II** versions: a gold halo with rotating ticks, gold trim, a slightly bigger hull, about 1.8× HP and 2.5× points. The share grows from 15% at wave 7 to 60%, and from wave 8 an all-Mk II "elite squadron" can appear.

Each Mk II keeps its normal attack but can also launch a **special**. A collapsing gold ring warns you about half a second before it fires, and special rounds are gold:

| Type | Special |
|---|---|
| Stinger Mk II | Scatter fan: 5 fast rounds |
| Darter Mk II | Double afterburner dash (re-aims between legs), laying a trail of hovering mines |
| Whirler Mk II | Three-armed spiral stream for about 2 seconds |
| Seeker Mk II | Three laser sights in a fan, then needle bursts down all three lines |
| Bulwark Mk II | Nova: a ring of 20 heavy rounds plus a 4-missile salvo |

Specials happen two ways:
- **Randomly:** about 30% of a Mk II's attacks are its special instead of the normal attack.
- **In formation patterns:** while a swarm holds a shape, it periodically orders all its Mk II ships to fire specials together. The shape decides the timing:
  - **Burst** (circle, rings, star, sunflower): all at once.
  - **Ripple** (wall, row, wave, grid, spiral): one after another along the shape.
  - **Alternate** (vee, arrow, diamond, triangle, cross): every other ship, in two volleys.

### Swarms

Each swarm follows a moving anchor point. It either flies straight across the screen, weaves up and down, or flies in, holds position, then leaves. Members switch between two behaviors:

- **Murmuration:** a bird-like flock that swirls around the anchor while keeping a loose ball shape and spacing apart.
- **Formation:** members steer into slots in a geometric shape: vee, arrow, wall, row, wave, hex grid, circle, double ring, diamond, star, triangle, sunflower, cross or spiral. Some shapes slowly rotate.

When a ship is destroyed, the formation re-forms around the survivors. Bulwarks lead from behind their escorts.

**Every swarm grows by one ship per wave** (wave 10 swarms have 9 more ships than wave 1, up to 40 per swarm), including the mothership's hangar swarms. New enemy types unlock as waves go up. Every 5th wave brings a flagship. Fire rate, bullet speed and enemy HP increase over time. **Bullet density is capped so there's always a way through:** once enemy bullets start piling up on screen (bullets within 160 units of your ship count triple), every enemy, vehicle and the mothership slows its fire, and no new attacks start until it thins out. Mk II specials respect it too: a swarm's coordinated special order includes at most 6 Mk II ships (fewer when the screen is busy), Darter mine trails are spaced so you can slip through, and Whirler spirals cut short when it's crowded. Tuning is `BULLET_DENSITY` in `js/config.js`.

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
js/director.js        wave building, difficulty ramp, mothership visits
js/mothership.js      the boss: laser, hangar swarms, abilities per visit
js/vehicles.js        ground vehicles: suspension physics, driving AI, placeholder art
js/projectiles.js     mortar / tank shell / wave-missile ordnance, blasts and warning markers
js/ordnance.js        new-enemy physics ordnance: bouncing balls, fission cores, gravity wells, flail maces
js/background.js      procedural tiling parallax layers, palette stages
js/decor.js           background decor themes (one per 5-wave stage)
js/particles.js, js/sprites.js, js/hud.js, js/audio.js
```

To swap in real art later, replace `drawPlayer` (player.js), `drawEnemy` (enemies.js), and the bullet and pickup drawing in `game.js`. The gameplay code doesn't depend on how anything is drawn.
