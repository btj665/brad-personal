# Working agreement

## Establish it or ask. Do not guess.

Every factual claim that ends up in this repository — in code, in a comment,
in a commit message, in a write-up — must come from a source I have actually
read, or from you. Where I cannot establish something, I ask. I do not fill
the gap with something plausible and move on.

This is not a style preference. It has already cost real bugs. Three
comments in the arcade games asserted original hardware behaviour that I had
never verified — "the mission restarts from the top, as it did on the
board", "the wave restarts with a full bar, as the cartridge did" — and both
were wrong, and the wrongness shipped and had to be reported back by the
person playing the game.

### What this means in practice

**Say which it is.** A value is sourced, or it is a reconstruction. If it is
a reconstruction, the code says so at the value, not in a commit message
nobody will read again. A reader should never have to guess which numbers
are real.

**A secondary source is not a fact.** Two independent pages said Megamania
replenishes energy as enemies are hit. Both were wrong. When the primary
source is unreachable and the answer changes the work, ask rather than
adopt the best available rumour.

**Name the conflict.** Where sources disagree — how many waves are in a Moon
Cresta lap, whether Gorf's saucer is 100 or 200 — record both readings and
which one the code took.

**Change only what is evidenced.** Adopting a sourced value should not
silently drag unsourced ones along with it. When Megamania's bar became 80
units, the drain rate moved to hold the wave's length where it already was,
because the length was a deliberate choice and the bar size was the only
thing the evidence touched.

**Do not dress a guess as research.** "Approximately", "roughly as the
original did", "period-correct" are not citations.

### Asking is cheap

Asking cost one message and got a correction that no amount of searching
would have produced — the user knew the game and the internet did not.
A blocked proxy, a paywalled manual or a contradictory wiki is a reason to
ask, not a reason to invent.

## Verifying games

Two failures that got past a suite that looked thorough, both now standing
rules in `games/README.md`:

- Clear every wave the way a player does, by shooting, never with a
  `killAll` helper. Moon Cresta shipped with an unclearable first wave
  because every test cleared waves by setting `alive = false`.
- Lose a life on purpose and look at what comes back. All three games
  rebuilt the whole wave on death and no test covered dying.
