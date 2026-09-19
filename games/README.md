# BaldyCade — house standard

Every cabinet in the arcade is built the same way. This is what "arcade
realistic" means here, concretely, and how to bring an existing game up to it.

```
games/
  lib/arcade.js      shared engine (no dependencies, one global: Arcade)
  galaga/index.html  reference implementation
```

## The seven rules

A game is done when all seven hold.

**1. Native resolution, integer scale.**
Render at the original board's real resolution and scale up by a whole number
with smoothing off. Galaga was 224×288 portrait; Pac-Man 224×288; Donkey Kong
224×256; Defender 320×256 landscape. Fractional scaling and CSS-sized sprites
are the clearest tell that a game is a web page wearing a costume.

```js
var screen = Arcade.Screen({ width: 224, height: 288 });
```

**2. Hand-authored pixel sprites.**
Write them as character grids, one char per pixel. No emoji, no CSS shapes, no
vector paths standing in for art. Chunky and solid beats thin and clever — a
sprite that reads as a few diagonal lines at 1× disappears in play.

```js
var ship = Arcade.Sprite.build([
  '..WW..',
  '.RWWR.',
  'RRWWRR'
], { W: '#ffffff', R: '#f83800' });
```

**3. Fixed rotation frames, never a smooth transform.**
Real boards stored a handful of orientations per sprite. Pre-rotate with
nearest-neighbour; a `ctx.rotate` on a pixel sprite looks modern and wrong.

```js
var frames = Arcade.Sprite.rotations(ship, 24);
frames.draw(ctx, angle, x, y);
```

**4. A bitmap font.**
All on-screen text is drawn from 8×8 glyphs. A system font at 11px next to
pixel art breaks the illusion faster than anything else on this list.

**5. Fixed timestep.**
Arcade games were written against a 60Hz vblank. Stepping `update()` on a
variable delta changes the feel on every machine.

```js
Arcade.Loop(update, render, 60).start();
```

**6. Synthesised audio.**
Oscillators and filtered noise, no samples. Off by default, with a toggle.

**7. Mechanics researched, not remembered.**
Look the original up. Get the scoring table, the enemy counts, the wave
structure, the bonus thresholds right, and say plainly in the write-up which
details are exact and which are approximations. On Galaga this changed real
decisions: transforms turned out to appear in *normal* stages from 4 on, not
in challenging stages as first assumed, and the squadron bonuses are
1,000 / 2,000 / 3,000.

## Porting an existing game

1. **Identify the inspiration and pull the facts.** Board resolution, sprite
   sizes, palette, scoring table, wave/level structure, lives and extend
   thresholds. Write them down before touching code.
2. **Set the screen to native resolution.** Everything else follows from this;
   doing it last means redoing the layout.
3. **Replace the art.** Emoji and CSS blocks out, character-grid sprites in.
   This is usually the bulk of the work and the biggest visible win.
4. **Replace the text.** Swap every DOM label and canvas `fillText` for the
   bitmap font.
5. **Rebuild the loop** on a fixed timestep, then retune speeds — they will all
   be wrong once the step is fixed.
6. **Add the arcade furniture:** attract mode, high-score persistence, a
   results screen, an extend threshold, per-level difficulty ramp.
7. **Verify by looking.** Render it headless and screenshot actual play, not
   just the title screen. Both real bugs in the Galaga build — sprites reading
   as thin X shapes, a tractor beam hovering at the wrong height — were
   invisible in the code and obvious in one frame.

## Engine reference

| Piece | What it does |
|---|---|
| `Arcade.Screen` | Native-res canvas, integer `fit()`, pointer→canvas coords |
| `Arcade.Font` | 8×8 bitmap text: `draw` `center` `at` `right` |
| `Arcade.Sprite` | `build` `tint` `flipH` `rotate` `rotations` `draw` |
| `Arcade.Path` | Catmull-Rom splines sampled by arc length (constant speed) |
| `Arcade.Audio` | `tone` `noise` `sequence`, silent until toggled on |
| `Arcade.note` | Note names → Hz, for writing jingles readably |
| `Arcade.Input` | Keyboard, pointer drag, `held`/`pressed` edge detection |
| `Arcade.Loop` | Fixed timestep with backgrounded-tab catch-up guard |
| `Arcade.Stars` | Scrolling, blinking, multi-colour starfield |
| `Arcade.FX` | Radial explosions and floating score popups |
| `Arcade.Store` | localStorage that never throws |
| `Arcade.Cabinet` | Bezel, CRT overlay (off by default), control strip, autofit |
| `Arcade.palettes` | `namco` `atari` `nintendo` `vector` `williams` |

Helpers: `Arcade.clamp`, `Arcade.rand`, `Arcade.pick`, `Arcade.hit`.

## Two notes

**Scanlines default off.** The CRT overlay is available per cabinet
(`Arcade.Cabinet(mount, screen, { crt: true })`) and via the toggle, but crisp
pixels are the default.

**Artifacts must inline or ship the file.** Published artifacts cannot load
scripts from arbitrary hosts. Either paste `arcade.js` into the page or publish
it as a supporting file alongside the game, referenced by a relative path.
