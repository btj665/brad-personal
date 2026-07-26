// Rockslide — five reels, four rows, twenty lines, and no second spin.
//
// The Planet Moolah mechanic. The reels drop once and then stop being reels:
// whatever won crumbles out of the screen, everything above it falls into the
// hole, fresh rock drops in from the top, and the new screen pays again at a
// higher multiplier. Four crumbles out of one drop and the mountain gives up
// eight free games.
//
// The chain is why this machine cannot be priced the way `bars.ts` is. Each step
// feeds the next, so the state space has no end and `exactBaseReturn` answers a
// narrower question: what would this return if it never cascaded. That figure is
// 0.4922, it is exact, and it is what says the strips are cut right — but it is
// only half the machine. The tumble is worth 1.93x of it, taking the whole thing
// to 0.9484 ± 0.0009 measured over twelve million spins. The strips below are
// therefore cut to a first drop of a hair under a half, not to the 0.95 target,
// and it is `rockslide.test.ts` that holds both ends of that.

import type { Machine, SymbolId } from '../types'

/** Per-reel symbol counts, one column per reel, fifty stops a reel.
 *
 *  Reel one is cut thinnest on the high symbols because runs pay leftmost
 *  aligned: what sits on reel one is the gate on every win the machine can make.
 *
 *  Eleven blanks a reel — twenty-two percent dead space — is the number that
 *  makes this a cascading machine rather than a broken one. A screen that always
 *  pays is a chain that never ends, and the return does not converge to a number
 *  at all; it runs away. The blanks are what let a chain die. They are also
 *  fewer than a stepper's, deliberately: a cascade cabinet has to land a win on
 *  better than half its drops or there is nothing to tumble. */
const COUNTS: Record<SymbolId, readonly [number, number, number, number, number]> = {
  W: [3, 3, 3, 3, 3],
  D: [3, 3, 4, 5, 5],
  G: [5, 5, 6, 6, 7],
  R: [7, 7, 7, 8, 8],
  E: [10, 10, 9, 8, 8],
  Q: [11, 11, 10, 9, 8],
  '-': [11, 11, 11, 11, 11],
}

/** Woven with a stride coprime to the fifty stops, one stride per reel, so the
 *  reel reads like rock rather than like a sorted list. Only the counts move the
 *  return; the order decides what a four-row window looks like when it lands,
 *  and blocked symbols land looking wrong. */
function strip(reel: number): SymbolId[] {
  const out: SymbolId[] = []
  for (const [id, counts] of Object.entries(COUNTS)) {
    for (let i = 0; i < counts[reel]; i++) out.push(id)
  }
  const stride = [7, 13, 19, 23, 29][reel]
  const woven: SymbolId[] = []
  for (let i = 0; i < out.length; i++) woven.push(out[(i * stride) % out.length])
  return woven
}

export const ROCKSLIDE: Machine = {
  id: 'rockslide',
  label: 'Rockslide',
  blurb: 'Five reels, twenty lines, wins crumble and the rest falls in',
  note: 'Nothing spins twice. Whatever wins crumbles out of the screen, the rock above it falls into the gap and fresh stone drops in from the top — then the new screen pays as well, at 2x, then 3x, then 5x, then 10x and holding. Four crumbles out of one drop buys eight free games.',
  symbols: [
    { id: 'W', label: '✦', wild: true },
    { id: 'D', label: '◆' },
    { id: 'G', label: '★' },
    { id: 'R', label: '▲' },
    { id: 'E', label: '■' },
    { id: 'Q', label: '●' },
    { id: '-', label: '' },
  ],
  strips: [strip(0), strip(1), strip(2), strip(3), strip(4)],
  rows: 4,
  /** Twenty paths across a four-row screen. Every one steps at most one row
   *  between adjacent reels, so each is a line a player can trace with a finger
   *  without lifting it — the rule that makes a payline diagram readable. */
  lines: [
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2],
    [3, 3, 3, 3, 3],
    [0, 1, 2, 1, 0],
    [3, 2, 1, 2, 3],
    [1, 2, 3, 2, 1],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 0, 0],
    [1, 1, 0, 1, 1],
    [2, 2, 3, 2, 2],
    [3, 3, 2, 3, 3],
    [0, 1, 1, 1, 0],
    [3, 2, 2, 2, 3],
    [1, 0, 0, 0, 1],
    [2, 3, 3, 3, 2],
    [1, 2, 2, 2, 1],
    [2, 1, 1, 1, 2],
    [0, 1, 0, 1, 0],
    [3, 2, 3, 2, 3],
  ],
  // The wild substitutes and carries no multiplier of its own. On a machine with
  // a multiplier ladder that is a deliberate omission, not an oversight: a
  // doubling wild would price every win it touches twice over — once on the
  // symbol weights, where each reel would have to be read at (count + 2·wilds)
  // rather than (count + wilds), and again against a ladder that is already at
  // ten by the fifth step. The two mechanics compound, and the compound is what
  // turns a strip that looks tight into a machine that returns 160%.
  linePays: {
    W: [0, 0, 0, 25, 125, 750],
    D: [0, 0, 0, 18, 90, 450],
    G: [0, 0, 0, 10, 45, 180],
    R: [0, 0, 0, 7, 28, 100],
    E: [0, 0, 0, 3, 15, 48],
    Q: [0, 0, 0, 2, 7, 25],
  },
  feature: {
    kind: 'cascade',
    multipliers: [1, 2, 3, 5, 10],
    freeSpinsAt: 4,
    freeSpins: 8,
  },
  targetRtp: 0.95,
}
