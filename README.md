# GORF — Reforged

A modern, browser-based interpretation of the 1981 Midway arcade classic **Gorf**
(**G**alactic **O**rbiting **R**obot **F**orce). Vector-drawn, fully synthesized
audio, no build step — just open the file and defend the galaxy.

## Play

Open `index.html` in any modern browser. That's it — no server, no dependencies.

```
# optional: serve it locally
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Controls

| Action | Keys |
| ------ | ---- |
| Move   | `← ↑ ↓ →` or `W A S D` |
| Fire   | `Space` |
| Pause  | `P` |
| Mute   | `M` |
| Start / Insert coin | `Enter` or `Space` |

Touch controls appear automatically on phones and tablets.

## The Five Missions

Just like the original, each tour cycles through five distinct missions. Clear all
five to complete a tour and earn a promotion:

1. **Astro Battles** — Blast an invader grid while a regenerating force field
   shields you from above.
2. **Laser Attack** — A marching formation opens up with heavy, straight-down
   laser fire.
3. **Galaxians** — Attackers peel off the formation and dive at you in weaving
   arcs.
4. **Space Warp** — Enemies spiral out of a central warp, growing as they close
   in.
5. **Flag Ship** — A boss dreadnought with a heavily armored hull. Only its
   glowing core takes damage.

## Rank Progression

Survive full tours to climb the ranks — enemies get faster and shoot more often
with every promotion:

**Space Cadet → Space Captain → Space Colonel → Space General → Space Warrior → Space Avenger**

## Features

- Five distinct mission types with unique enemy behaviors and a boss fight
- Rank/tour progression with escalating difficulty
- Gorf's signature taunting personality (with a synthesized robotic "voice")
- Fully procedural audio via the Web Audio API — no sound files
- Particle explosions, screen shake, CRT scanline styling, parallax starfield
- Persistent high score (saved to `localStorage`)
- Keyboard + touch support

## Tech

Plain HTML5 Canvas and vanilla JavaScript in three files
(`index.html`, `style.css`, `game.js`). No frameworks, no assets, no build.

> Tip: append `#debug` to the URL and call `__gorf.go(missionIndex, tour)` from
> the console to jump straight to any mission for a preview.

---

A tribute to the original *Gorf* by Midway (1981). This is an original,
from-scratch reimagining and is not affiliated with or endorsed by the
rights holders.
