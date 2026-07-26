// Rockslide — five reels, four rows, twenty lines, and no second spin.
//
// The Planet Moolah mechanic. The reels drop once and then stop being reels:
// whatever won crumbles out of the screen, everything above it falls into the
// hole, fresh rock drops in from the top, and the new screen pays again at a
// higher multiplier. Four crumbles out of one drop and the mountain gives up
// eight free games. Three boulders on the first drop and it gives up the pick
// round instead: smash them one at a time until one of them is just rock.
//
// The chain is why this machine cannot be priced the way `bars.ts` is. Each step
// feeds the next, so the state space has no end and `exactBaseReturn` answers a
// narrower question: what would this return if it never cascaded. The tumble is
// worth 1.93× of that figure, and only measurement can say so.
//
// The pick round, by contrast, is exact, and its derivation is the nicest thing
// in this directory. Twelve boulders, nine of them worth something and three of
// them solid rock, and the round ends on the first rock. Fix your eye on one
// prize: it is collected exactly when it comes up before all three rocks. Those
// four boulders are in uniform random order, so that happens one time in four —
// regardless of how many other prizes there are or where they fall. So the round
// is worth a quarter of its whole prize pool, 78/4 = 19.5 × the total stake, and
// `pickValue` in `bonus.ts` is that one line of arithmetic. Multiply by the
// trigger probability, which `screenCountDistribution` gives exactly, and the
// feature has a closed-form price with no error bar on it at all:
//
//   first drop (enumerated)   0.447022
//   × the tumble (measured)   1.926157    →  0.861063 ± 0.000965
//   trigger, 3+ boulders      0.00452526  =  1 in 221 spins, exact
//   × pick value 78/4         19.5        →  0.088243, exact
//   ---------------------------------------------------------------------
//   the machine                              0.949306 against a target of 0.95
//
// The tumble's leverage was measured at 1.926157 ± 0.002158 over 24,000,000
// spins in eight streams, and measured with the first drop taken out of the
// sample rather than left in it: the first drop is enumerated exactly, so
// sampling only what comes after it cuts the standard error by more than half.
//
// Room for the pick had to come out of the lines, and because the tumble
// multiplies the lines by 1.93 the cut is nearly twice as deep as the feature is
// wide: 0.0882 of return bought at the pay table costs 0.0458 of first drop. The
// whole table came down about 9%, which is why every entry moved.
//
// `npm run slots:rtp` plays the whole thing and gets 94.818% ± 0.189% over
// 12,000,000 spins in eight streams (94.209%–95.215% per stream), against the
// 0.949306 predicted above — inside one standard error of it.

import type { Machine, SymbolId } from '../types'

/** Per-reel symbol counts, one column per reel, fifty stops a reel.
 *
 *  Reel one is cut thinnest on the high symbols because runs pay leftmost
 *  aligned: what sits on reel one is the gate on every win the machine can make.
 *
 *  Eleven dead stops a reel — twenty-two percent dead space — is the number that
 *  makes this a cascading machine rather than a broken one. A screen that always
 *  pays is a chain that never ends, and the return does not converge to a number
 *  at all; it runs away. The dead stops are what let a chain die. They are also
 *  fewer than a stepper's, deliberately: a cascade cabinet has to land a win on
 *  better than half its drops or there is nothing to tumble.
 *
 *  Ten of those eleven are blanks and the eleventh is the boulder. That is not a
 *  coincidence and it is the reason this cabinet's tumble arithmetic did not have
 *  to be re-measured when the round was added: the boulder has no line pay, so
 *  the evaluator treats it exactly as it treats a blank, and trading one blank a
 *  reel for one boulder a reel leaves every window's win set, every crumble, and
 *  every free-game trigger identical. The strips changed and the cascade did not.
 *
 *  One boulder a reel rather than two, and the reason is the pick's price. Two a
 *  reel puts three on screen once in every 31 drops, and a round that frequent
 *  can only be worth 2.8× the stake — a pick board is a show, and a show has to
 *  be worth watching. One a reel is once in 221, and it is worth 19.5×. It also
 *  keeps the trigger trivially enumerable: a single boulder on a fifty-stop reel
 *  shows in a four-row window exactly 4 stops in 50, and the screen count is a
 *  sum of five independent 0.08s. */
const COUNTS: Record<SymbolId, readonly [number, number, number, number, number]> = {
  W: [3, 3, 3, 3, 3],
  D: [3, 3, 4, 5, 5],
  G: [5, 5, 6, 6, 7],
  R: [7, 7, 7, 8, 8],
  E: [10, 10, 9, 8, 8],
  Q: [11, 11, 10, 9, 8],
  '-': [10, 10, 10, 10, 10],
  BON: [1, 1, 1, 1, 1],
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
  note: 'Nothing spins twice. Whatever wins crumbles out of the screen, the rock above it falls into the gap and fresh stone drops in from the top — then the new screen pays as well, at 2x, then 3x, then 5x, then 10x and holding. Four crumbles out of one drop buys eight free games. Three boulders on the first drop and you break them open one at a time instead: nine of the twelve are worth something, three are solid rock, and the first rock ends it.',
  symbols: [
    { id: 'W', label: '✦', wild: true },
    { id: 'D', label: '◆' },
    { id: 'G', label: '★' },
    { id: 'R', label: '▲' },
    { id: 'E', label: '■' },
    { id: 'Q', label: '●' },
    // No line pay and not a scatter: it buys the pick round and nothing else, so
    // the evaluator reads it as a blocker exactly like the blank, and a cascade
    // refilling with one is refilling with dead rock.
    { id: 'BON', label: 'BON' },
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
  //
  // Cut about 9% to pay for the pick. The low end is where that gets awkward:
  // pays are integers, and the two cheapest symbols pay 2 and 3 for three of a
  // kind, which cannot be scaled by 9% at all — they either stay put or fall by a
  // third. Between them those two entries are 0.068 of the first drop, so falling
  // by a third was not an option. They are held where they were and the cut was
  // taken further up the same two columns, at four and five of a kind, where nine
  // percent is whole coins.
  linePays: {
    W: [0, 0, 0, 20, 110, 650],
    D: [0, 0, 0, 16, 80, 400],
    G: [0, 0, 0, 9, 40, 160],
    R: [0, 0, 0, 6, 25, 90],
    E: [0, 0, 0, 3, 14, 45],
    Q: [0, 0, 0, 2, 6, 22],
  },
  feature: {
    kind: 'cascade',
    multipliers: [1, 2, 3, 5, 10],
    freeSpinsAt: 4,
    freeSpins: 8,
  },
  // Twelve boulders, three of them solid rock, and the round dies on the first
  // rock. Three rocks rather than one because three is what makes the round a
  // gamble: the expected number of boulders opened is (12 + 1)/(3 + 1) = 3.25, so
  // a player typically collects two prizes out of nine and watches the other
  // seven get listed in `missed`. With one rock they would clear six of nine and
  // the round would be an annuity.
  //
  // The prize pool is 78 and every prize is collected one time in four, so the
  // round is worth exactly 19.5 × the total stake — see the header. The ladder
  // runs 1 to 30, and the 30 carries 38% of the pool on its own, because the
  // whole appeal of a pick board is that the one you didn't open was the big one.
  bonus: {
    kind: 'pick',
    trigger: 'BON',
    triggerCount: 3,
    prizes: [1, 2, 3, 4, 5, 8, 10, 15, 30],
    enders: 3,
  },
  targetRtp: 0.95,
}
