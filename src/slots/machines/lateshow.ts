// The Late Show — five reels, twenty-five lines, expanding wilds in the free
// games, and a corridor of doors behind the stage.
//
// The shape behind every licensed party cabinet on the floor, minus the licence:
// three marquees anywhere buy ten free games, and for the length of that round
// the spotlight stops being an ordinary wild and takes over whatever reel it
// lands on, whole. Ten spins of that, doubled, is a violent amount of money —
// which is why the base game below is cut well under two thirds and the round is
// left to carry the rest.
//
// Three stage doors anywhere buy the other round. Eight doors are dealt, seven of
// them have something behind them and one is the fire exit, and the round ends
// the moment the exit turns up. That round's price is closed-form, and the
// argument is worth having in front of you: pick any one prize and ask when it
// gets collected. It gets collected exactly when it comes up before the exit.
// Two cards, uniform order, so one time in two — and that is true of every prize
// independently of the others, so the round is worth half the whole prize pool,
// 41/2 = 20.5 × the total stake. `pickValue` in `bonus.ts` is that sentence.
//
// The strips and the pay table are the entire specification, but only some of it
// can be enumerated. `exactBaseReturn` gives the base game to the last decimal
// and the doors are exact by the argument above; the free games cannot be reached
// that way, because an expanded reel is no longer distributed like a spun one and
// the whole screen pays at 2×. That part has to be measured, and measured with
// more care than a slot invites: per-spin return here has a standard deviation
// near 7, so one stream of four million spins carries a standard error of 0.35%
// and can sit a percentage point off the truth without looking odd at all. Two
// such streams agreeing is not corroboration — they agree about a percentage
// point, which is the resolution of the wrong instrument.
//
//   base game (enumerated)      0.651358
//   × the free games (measured) 1.355553     →  0.882951 ± 0.002591
//   trigger, 3+ doors           0.00375838   =  1 in 266 spins, exact
//   × pick value 41/2           20.5         →  0.077047, exact
//   -----------------------------------------------------------------------
//   the machine                                 0.959998 against a target 0.96
//
// The round's leverage was measured at 1.355553 ± 0.003978 over 24,000,000 spins
// in eight streams, with the paid screen taken out of the sample rather than left
// in it — the paid screen is enumerated exactly, so sampling only the free games
// removes the base game's noise from the figure.
//
// The doors cost 0.0770 of return and the free games multiply the pay table by
// 1.357, so buying them at the pay table cost 0.0568 of base game: the whole card
// came down about 8%, and the marquee ladder was left alone because it is small,
// exactly enumerable, and the only thing that makes the screen buying the free
// games a win in its own right.
//
// The doors turn up once in 266 spins, which is the same rate as the marquees.
// That is not a copy-paste: both symbols sit one to a reel on five forty-stop
// strips, so both triggers are the same 3-of-5 convolution of the same 3/40.
//
// `npm run slots:rtp` plays the whole thing and gets 95.944% ± 0.404% over
// 12,000,000 spins in eight streams (95.395%–97.468% per stream), against the
// 0.959998 predicted above. Look at that spread before believing any single
// stream of this cabinet: the top stream reads 97.5%, a full point and a half
// above the truth, which is exactly the trap this file was written to document.

import type { Machine, SymbolId } from '../types'

/** Counts per reel, in the order the symbols are declared below. Reel one is
 *  cut thinnest in premiums and carries no spotlight at all: leftmost alignment
 *  means reel one decides how often anything pays, and a wild that cannot land
 *  there cannot expand there either. That single restriction is most of what
 *  keeps the free games affordable.
 *
 *  The stage door is one a reel, taken out of the blanks. It has no line pay, so
 *  the evaluator reads it as a blocker exactly as it reads a blank, and trading
 *  one blank a reel for one door leaves every window's win set, the marquee count
 *  distribution, and every expanded free game identical to what they were. The
 *  strips changed and the free games did not — which is why the 1.3567 measured
 *  for the round did not have to be re-measured from scratch. */
const COUNTS: Record<SymbolId, [number, number, number, number, number]> = {
  spot: [0, 3, 3, 3, 0],
  mrq: [1, 1, 1, 1, 1],
  mic: [2, 2, 2, 2, 2],
  mar: [2, 3, 3, 3, 3],
  sax: [3, 3, 3, 3, 3],
  crt: [3, 3, 3, 3, 3],
  A: [4, 4, 4, 4, 4],
  K: [4, 4, 4, 4, 4],
  Q: [4, 4, 4, 4, 4],
  J: [5, 4, 4, 4, 4],
  T: [5, 4, 4, 4, 4],
  '-': [6, 4, 4, 4, 7],
  BON: [1, 1, 1, 1, 1],
}

/** One reel, woven rather than blocked.
 *
 *  The weave is cosmetic for the line maths — expectation only sees the counts —
 *  but it is not cosmetic for the marquees, whose pay depends on how many land
 *  on the whole screen. Two marquees sitting next to each other on the strip can
 *  show up together in one three-row window; spread out, they cannot. The step
 *  below is coprime with the length, so it visits every stop once. */
function strip(reel: number): SymbolId[] {
  const out: SymbolId[] = []
  for (const [id, counts] of Object.entries(COUNTS)) {
    for (let i = 0; i < counts[reel]; i++) out.push(id)
  }
  const woven: SymbolId[] = []
  for (let i = 0; i < out.length; i++) woven.push(out[(i * 23) % out.length])
  return woven
}

export const LATESHOW: Machine = {
  id: 'lateshow',
  label: 'The Late Show',
  blurb: 'Twenty-five lines, a spotlight that swallows a reel, and eight doors',
  note: 'Land three marquees anywhere and the house buys you ten free games. For all ten of them every win pays double, and any spotlight that turns up floods its whole reel from top to bottom — so one spotlight on the middle reel is three of them, on every line that runs through it. Three stage doors instead and you go backstage: eight doors, seven of them worth something, and one of them the fire exit. Keep opening until you find it.',
  symbols: [
    // Marked `expanding` for the cabinet glass; the round itself is driven by
    // `feature.expandingWild`, which is what `resolveSpin` reads.
    { id: 'spot', label: '☀', wild: true, expanding: true },
    { id: 'mrq', label: '★', scatter: true },
    { id: 'mic', label: 'MIC' },
    { id: 'mar', label: 'MAR' },
    { id: 'sax', label: 'SAX' },
    { id: 'crt', label: 'CRT' },
    { id: 'A', label: 'A' },
    { id: 'K', label: 'K' },
    { id: 'Q', label: 'Q' },
    { id: 'J', label: 'J' },
    { id: 'T', label: '10' },
    // No line pay and not a scatter: it buys the backstage round and nothing
    // else, so the evaluator reads it as a blocker exactly like the blank.
    { id: 'BON', label: 'BON' },
    { id: '-', label: '' },
  ],
  strips: [strip(0), strip(1), strip(2), strip(3), strip(4)],
  rows: 3,
  // Twenty-five paths, every one of them walkable: no line steps more than one
  // row between neighbouring reels, because a payline a player cannot trace with
  // a finger is a payline they will not believe.
  lines: [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 0, 0],
    [2, 2, 1, 2, 2],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [1, 0, 1, 0, 1],
    [1, 2, 1, 2, 1],
    [0, 1, 1, 1, 0],
    [2, 1, 1, 1, 2],
    [1, 1, 0, 1, 1],
    [1, 1, 2, 1, 1],
    [0, 1, 0, 1, 0],
    [2, 1, 2, 1, 2],
    [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [0, 1, 2, 2, 2],
    [2, 1, 0, 0, 0],
    [0, 0, 0, 1, 2],
    [2, 2, 2, 1, 0],
  ],
  // Per coin staked on the line. The spotlight has no schedule of its own: it
  // only lives on reels two to four, so a run of spotlights could never start on
  // reel one and any pay written here would be unreachable.
  //
  // No multiplier on the wild either. A wild that doubled what it completed
  // would make every reel weigh a symbol at (count + 2·wilds)/len rather than
  // (count + wilds)/len — the doubling lands once in the odds and once in the
  // pay — and stacking that on top of the round's own 2× leaves nothing left to
  // pay the base game with.
  //
  // Scaling this table scales the line return exactly, and scales the free games
  // by the same factor, so the free-to-base split is a property of the strips
  // alone and the whole card is one scalar with the strips fixed. The table below
  // is the old one at about 0.917, which is what the backstage round cost once the
  // free games' 1.357 leverage is taken off it. The last tenth of a percent of
  // that scalar is carried by the king's five-of-a-kind alone rather than spread
  // thin, because pays are integers and a tenth of a percent spread over
  // twenty-seven entries rounds to nothing — which is also why the king keeps the
  // 200 it always had while its three and four came down.
  linePays: {
    mic: [0, 0, 0, 70, 300, 1400],
    mar: [0, 0, 0, 45, 230, 900],
    sax: [0, 0, 0, 32, 150, 550],
    crt: [0, 0, 0, 28, 115, 460],
    A: [0, 0, 0, 18, 65, 240],
    K: [0, 0, 0, 14, 50, 200],
    Q: [0, 0, 0, 9, 37, 140],
    J: [0, 0, 0, 8, 32, 115],
    T: [0, 0, 0, 6, 28, 90],
  },
  // Multiples of the total stake. The marquees pay a little in their own right
  // so the screen that buys the round is itself a win rather than a promise —
  // and because scatter pay is exactly enumerable, every coin spent here stays
  // in the part of the budget that `exactBaseReturn` can vouch for.
  scatterPays: { mrq: { 3: 2, 4: 12, 5: 60 } },
  feature: {
    kind: 'freeSpins',
    trigger: 'mrq',
    triggerCount: 3,
    spins: 10,
    multiplier: 2,
    expandingWild: 'spot',
  },
  // Eight doors and one fire exit, which is the loosest pick board in the
  // building: with a single ender each prize is collected half the time, and a
  // player opens four and a half doors on average. That is the opposite choice
  // from Rockslide's boulders, where three enders out of twelve mean the round
  // usually dies on the third pick — and it is deliberate, because these two
  // cabinets share a mechanic and should not share a feel. Here the sting is
  // rare and total; there it is constant and small.
  //
  // Prize pool 41, every prize taken one time in two, so the round is worth
  // exactly 20.5 × the total stake. The 15 is a third of the pool on its own, so
  // the exit landing early is the only thing that really costs anything.
  bonus: {
    kind: 'pick',
    trigger: 'BON',
    triggerCount: 3,
    prizes: [1, 2, 3, 4, 6, 10, 15],
    enders: 1,
  },
  targetRtp: 0.96,
}
