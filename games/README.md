# BaldyCade — house standard

Every cabinet in the arcade is built the same way. This is what "arcade
realistic" means here, concretely, and how to bring an existing game up to it.

```
games/
  lib/arcade.js      shared engine (no dependencies, one global: Arcade)
  galaga/index.html  reference implementation
  gorf/index.html    second reference: five missions, a boss, and speech
  megamania/index.html  a console port: non-square pixels, one steerable shot
  mooncresta/index.html a game whose lives are the ship, and a docking clock
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
| `Arcade.Screen` | Native-res canvas, integer `fit()`, `pixelAspect` for consoles whose pixels are not square, pointer→canvas coords |
| `Arcade.Font` | 8×8 bitmap text: `draw` `center` `at` `right` |
| `Arcade.Sprite` | `build` `tint` `flipH` `rotate` `rotations` `draw` |
| `Arcade.Path` | Catmull-Rom splines sampled by arc length (constant speed) |
| `Arcade.Audio` | `tone` `noise` `sequence`, silent until toggled on; `bus` and `noiseBuffer()` for games that build their own nodes |
| `Arcade.note` | Note names → Hz, for writing jingles readably |
| `Arcade.Input` | Keyboard, pointer drag, `held`/`pressed` edge detection |
| `Arcade.Loop` | Fixed timestep with backgrounded-tab catch-up guard |
| `Arcade.Stars` | Scrolling, blinking, multi-colour starfield |
| `Arcade.FX` | Radial explosions and floating score popups |
| `Arcade.Store` | localStorage that never throws |
| `Arcade.Cabinet` | Bezel, CRT overlay (off by default), control strip, autofit |
| `Arcade.palettes` | `namco` `atari` `atari2600` `nintendo` `vector` `williams` |

Helpers: `Arcade.clamp`, `Arcade.rand`, `Arcade.pick`, `Arcade.hit`.

## Two notes

**Scanlines default off.** The CRT overlay is available per cabinet
(`Arcade.Cabinet(mount, screen, { crt: true })`) and via the toggle, but crisp
pixels are the default.

**Artifacts must inline or ship the file.** Published artifacts cannot load
scripts from arbitrary hosts. Either paste `arcade.js` into the page or publish
it as a supporting file alongside the game, referenced by a relative path.
Gorf takes the second route with a two-candidate loader, so the engine is not
duplicated into the game's folder; the cost is one 404 in the console when the
file is opened straight out of the repository.

## When the mechanic is the game

Three of these four cabinets turn on one rule that a generic space shooter
does not have, and getting that rule right matters more than any amount of
art:

- **Gorf** — one shot in flight, and firing again cancels the shot already
  out there, so the trigger is also a cancel button.
- **Megamania** — one shot, and you keep steering it with the ship after you
  fire it. A shot already taken is still a shot you are aiming.
- **Moon Cresta** — you do not have three lives, you have a rocket in three
  sections. Being hit costs the section at the front. Twice a lap the game
  stops and makes you fly the next section into your own tail on a thirty
  second clock, and missing costs you that section for the rest of the lap.

Find that rule in the research before writing the wave code, because the
rest of the game is built around it. In all three cases it was the thing
most easily missed and the thing that makes the game feel like itself.

## Pixels that are not square

Rule 1 says native resolution, and on a console that is only half the answer.
A 2600 NTSC frame is 160 colour clocks across and 192 scan lines down, shown
on a 4:3 television, so a 2600 pixel is about 1.6 times wider than it is
tall. Rendering 160×192 into square pixels gives a tall, thin picture that
never existed. `Arcade.Screen({ pixelAspect: 2 })` renders in square logical
pixels — sprites, collisions and the font all stay simple — and stretches
only on the way to the screen, which is the convention emulators settled on.

This changes how the art is drawn, not just how it is displayed. At 2:1 a
circle has to be drawn about half as wide as it is tall or it comes out an
oval; Megamania's cookies, tyres and dice are drawn six columns wide inside
a ten-wide box for exactly that reason, and the first attempt at all of them
was wrong.

## Speech

Gorf's cabinet had a Votrax SC-01, and the taunts are half of why anyone
remembers it. Samples are out under rule 6, so the voice there is formant
synthesis: a pulse train or a hiss through three bandpass filters whose
frequencies are the phoneme, driven from a small pronunciation dictionary.
That is what the SC-01 was doing, and it sounds like it. Any game that needs
a voice should copy that block rather than reach for an audio file.
